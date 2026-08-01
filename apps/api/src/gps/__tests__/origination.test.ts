import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';

/**
 * GPS ORIGINATION — Phase 8's API, behaviourally.
 *
 * WHAT IS BEING PROVEN, in the order it matters:
 *   1  a gated target NEVER appears in the queue payload, and appears in the ledger
 *      WITH the gate that fired and its reason (D2 — the whole point of the phase)
 *   2  the capacity cut is REPORTED, never silent
 *   3  `counts.considered === queued + deferred + refused` on the wire, because GPS
 *      has already shipped a surface whose `counts` field did not exist
 *   4  a brief fails integrity when a claim is unsupported, and the write path
 *      REFUSES to store an opening the brief cannot support
 *   5  nothing sends. Behaviourally AND at source level.
 *   6  the migration-pending window: reads 200-empty with `migrated:false`, writes
 *      503, validation before the probe
 *
 * ── THE TWO MOCKS, AND WHY NEITHER IS A STUB OF THE THING UNDER TEST ──────────
 *
 * `@lcx/shared` is composed here exactly as the WIRING PASS will compose it. The
 * engine lives in `packages/shared/src/gps/origination.ts` and the barrel
 * (`packages/shared/src/gps/index.ts`) does not re-export it yet; barrels belong to
 * the wiring pass, so this test performs that one edit in memory using
 * `importActual` on BOTH REAL MODULES. Nothing is faked: every assertion below runs
 * the genuine 1,152-line `targeting.ts` and the genuine origination engine. DELETE
 * THIS MOCK the day `gps/index.ts` re-exports origination — it will then be a
 * no-op, and leaving a no-op mock of the platform's own package in place is how a
 * test suite starts lying later.
 *
 * The pool is an in-memory stand-in for migration 0050 — see `fakePool`. It exists
 * because 0050 is not applied anywhere yet (this phase does not own it), and CI has
 * no Postgres for this compartment. It reads the column list OUT OF THE SQL rather
 * than restating it, so it cannot silently disagree with the statement it is
 * standing in for.
 */

vi.mock('@lcx/shared', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@lcx/shared');
  const origination = await vi.importActual<Record<string, unknown>>(
    '../../../../../packages/shared/src/gps/origination.js',
  );
  return { ...actual, ...origination };
});

/* ── The stand-in for 0050 ─────────────────────────────────────────────────── */

interface Row { [column: string]: unknown }

const db = {
  migrated: true,
  targets: [] as Row[],
  observations: [] as Row[],
  openings: [] as Row[],
  ids: 0,
};

/** A real uuid shape, because the routes reject anything else before touching a pool. */
const nextId = (prefix: string) => `${prefix}${(++db.ids).toString().padStart(7, '0')}-0000-4000-8000-000000000000`;

/**
 * Column names lifted out of the INSERT itself, so the fake cannot drift from the
 * statement. A test whose fixture restates a column order is a test that passes
 * while the real statement writes the wrong column.
 */
function insertColumns(sql: string): string[] {
  const m = /INSERT INTO [a-z_]+\s*\(([^)]*)\)\s*VALUES/i.exec(sql);
  if (!m) throw new Error(`fakePool: cannot read the column list from: ${sql.slice(0, 80)}`);
  return m[1].split(',').map((s) => s.trim()).filter(Boolean);
}

/** The DB-side defaults of 0050, mirrored — every one of them UNFLATTERING. */
const TARGET_DEFAULTS: Record<string, unknown> = {
  status: 'watchlist',
  screening: 'not_screened',
  perimeter: 'unknown',
  conflict: 'unresolved',
  demands_guaranteed_outcome: false,
  materially_misleading: false,
};

function buildRow(sql: string, params: readonly unknown[], defaults: Record<string, unknown>): Row {
  const cols = insertColumns(sql);
  const row: Row = {};
  cols.forEach((col, i) => {
    const v = params[i] ?? null;
    row[col] = v === null && col in defaults ? defaults[col] : v;
  });
  return row;
}

const pool = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: async (sql: string, params: readonly unknown[] = []): Promise<{ rows: any[] }> => {
    if (/to_regclass/.test(sql)) return { rows: [{ ok: db.migrated }] };

    if (/INSERT INTO gps_target/.test(sql)) {
      const row = buildRow(sql, params, TARGET_DEFAULTS);
      row.id = (params[0] as string | null) ?? nextId('a');
      const existing = db.targets.find((t) => t.id === row.id);
      if (existing) {
        // ON CONFLICT (id) DO UPDATE: created_by/created_at survive a replace.
        Object.assign(existing, row, {
          created_by: existing.created_by,
          created_at: existing.created_at,
          updated_at: new Date().toISOString(),
        });
        return { rows: [existing] };
      }
      row.created_at = new Date().toISOString();
      row.updated_at = row.created_at;
      db.targets.push(row);
      return { rows: [row] };
    }

    if (/FROM gps_target WHERE id = \$1/.test(sql)) {
      return { rows: db.targets.filter((t) => t.id === params[0]) };
    }
    if (/FROM gps_target WHERE status = \$1/.test(sql)) {
      return { rows: db.targets.filter((t) => t.status === params[0]) };
    }
    if (/FROM gps_target/.test(sql)) return { rows: [...db.targets] };

    if (/INSERT INTO observations/.test(sql)) {
      db.observations.push(buildRow(sql, params, {}));
      return { rows: [] };
    }
    if (/FROM observations/.test(sql)) {
      const ids = new Set(params[1] as string[]);
      const rows = db.observations
        .filter((o) => o.subject_type === params[0] && ids.has(o.subject_id as string))
        .sort((a, b) => String(b.observed_at).localeCompare(String(a.observed_at)));
      // DISTINCT ON (subject_id, predicate), latest observation wins.
      const seen = new Set<string>();
      const out: Row[] = [];
      for (const r of rows) {
        const key = `${String(r.subject_id)}::${String(r.predicate)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...r, value_json: r.value_json ? JSON.parse(String(r.value_json)) : null });
      }
      return { rows: out };
    }

    if (/INSERT INTO gps_outreach_opening/.test(sql)) {
      const row = buildRow(sql, params, {});
      row.id = nextId('b');
      row.created_at = new Date().toISOString();
      db.openings.push(row);
      return { rows: [row] };
    }
    if (/FROM gps_outreach_opening/.test(sql)) {
      const rows = db.openings
        .filter((o) => o.target_id === params[0])
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return { rows: rows.slice(0, 1) };
    }

    throw new Error(`fakePool: unhandled statement: ${sql.slice(0, 120)}`);
  },
};

vi.mock('../../db/index.js', () => ({
  getPool: () => pool,
  getDb: () => { throw new Error('origination uses the pg pool, not drizzle'); },
  closeDb: async () => {},
}));

const { gpsOriginationRoutes } = await import('../../routes/gpsOrigination.js');
const { _resetOriginationMigrated, PROVENANCEABLE_FIELDS } = await import('../origination.js');

/* ── The harness ───────────────────────────────────────────────────────────── */

/**
 * A throwaway app, because `app.ts` belongs to the wiring pass and this router is
 * deliberately not mounted there yet. `requireOperator` returns early when an
 * operator is already on the context (`middleware/auth.ts:149`), so setting one is
 * the supported way to test a route without a key round trip.
 */
function appAs(id: string, role: 'operator' | 'approver' = 'approver') {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('operator', { id, role, authMethod: 'email' });
    await next();
  });
  app.route('/v1/gps', gpsOriginationRoutes);
  return app;
}

const app = () => appAs('nik');

async function get(path: string, as = app()) {
  const res = await as.request(`/v1/gps${path}`);
  return { status: res.status, body: (await res.json()) as { data: any; meta?: any; error?: string; code?: string } };
}

async function post(path: string, payload: unknown, as = app()) {
  const res = await as.request(`/v1/gps${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: (await res.json()) as { data: any; meta?: any; error?: string; code?: string } };
}

/** A target good enough to be eligible, so a test can vary ONE thing at a time. */
const eligible = (over: Record<string, unknown> = {}) => ({
  name: 'Eligible Token',
  jurisdiction: 'Liechtenstein',
  screening: 'clear',
  perimeter: 'in_perimeter',
  conflict: 'cleared',
  decisionMakerName: 'A Founder',
  decisionMakerRole: 'CEO',
  decisionMakerIsBudgetHolder: true,
  identifiedNeeds: ['mica_whitepaper'],
  offerKey: 'mica_whitepaper',
  statedBudgetCents: 2_000_000,
  quotedPriceCents: 2_000_000,
  expectedVendorCostCents: 800_000,
  introPath: 'warm_referral',
  evidence: { reliability: 'B', credibility: 2, observedIso: '2026-07-20T00:00:00.000Z' },
  ...over,
});

const ASOF = '2026-08-01T00:00:00.000Z';

beforeEach(() => {
  db.migrated = true;
  db.targets = [];
  db.observations = [];
  db.openings = [];
  db.ids = 0;
  _resetOriginationMigrated();
});

/* ── 1. A gated target is never in the queue, and always in the ledger ─────── */

describe('the queue refuses out loud (D2)', () => {
  it('keeps a sanctioned target out of the rows and puts it in the ledger with its reason', async () => {
    const clean = await post('/origination/targets', eligible({ name: 'Clean Token' }));
    const gated = await post('/origination/targets', eligible({ name: 'Screened Token', screening: 'concern' }));
    expect(clean.status).toBe(201);
    expect(gated.status).toBe(201);
    const gatedId = gated.body.data.target.id as string;

    const { body } = await get(`/origination?asOf=${ASOF}`);
    const rows = body.data.queue.rows as { targetId: string; score: number }[];

    // The load-bearing absence: not ranked low, not zero-scored — ABSENT.
    expect(rows.map((r) => r.targetId)).not.toContain(gatedId);
    expect(JSON.stringify(body.data.queue.rows)).not.toContain('Screened Token');

    const entry = (body.data.queue.refusals.entries as any[]).find((e) => e.targetId === gatedId);
    expect(entry).toBeDefined();
    expect(entry.gates.map((g: any) => g.key)).toContain('sanctions_concern');
    expect(entry.gates[0].reason).toMatch(/sanctions\/AML screen returned a concern/i);
    // A wall, not a task: no remedy, so the correct action is to stop.
    expect(entry.disposition).toBe('wall');
    expect(entry.gates[0].recoverable).toBe(false);
    expect(entry.gates[0].remedy).toBeNull();
    expect(body.data.queue.refusals.byGate.sanctions_concern).toBe(1);
  });

  it('separates a task from a wall, and rolls up pessimistically when both fire', async () => {
    // Curable alone: nobody has performed the conflict check.
    await post('/origination/targets', eligible({ name: 'Needs A Check', conflict: 'unresolved' }));
    // A wall beside four curable gates must still be a wall — the roll-up that says
    // "mostly curable" is how a sanctioned entity lands on a to-do list.
    await post('/origination/targets', eligible({
      name: 'Both', conflict: 'unresolved', screening: 'concern',
      perimeter: 'outside_perimeter', demandsGuaranteedOutcome: true,
    }));

    const { body } = await get(`/origination/refusals?asOf=${ASOF}`);
    const entries = body.data.refusals.entries as any[];
    const task = entries.find((e) => e.name === 'Needs A Check');
    const both = entries.find((e) => e.name === 'Both');

    expect(task.disposition).toBe('task');
    expect(task.wallCount).toBe(0);
    expect(task.remedies.join(' ')).toMatch(/GpsConflictCheck/);

    expect(both.disposition).toBe('wall');
    expect(both.gates.length).toBeGreaterThan(1);
    expect(both.primary.recoverable).toBe(false);
    // Remedies for the curable gates are still listed on a wall entry: the wall is
    // the verdict, and the reader still needs to see what else was wrong.
    expect(both.remedies.length).toBeGreaterThan(0);
    expect(body.data.refusals.walls).toBe(1);
    expect(body.data.refusals.tasks).toBe(1);
  });

  it('reports every gate key including the zeros, so nothing reads as unchecked', async () => {
    await post('/origination/targets', eligible());
    const { body } = await get(`/origination/refusals?asOf=${ASOF}`);
    expect(Object.keys(body.data.refusals.byGate).sort()).toEqual([
      'demands_guaranteed_outcome', 'jurisdiction_outside_perimeter', 'materially_misleading',
      'no_budget_or_capital_proxy', 'no_decision_maker', 'sanctions_concern', 'unresolved_conflict',
    ]);
    expect(Object.values(body.data.refusals.byGate).every((n) => n === 0)).toBe(true);
  });

  it('serves the ledger from the same build as the queue', async () => {
    await post('/origination/targets', eligible({ name: 'Walled', materiallyMisleading: true }));
    await post('/origination/targets', eligible({ name: 'Fine' }));
    const queue = await get(`/origination?asOf=${ASOF}`);
    const ledger = await get(`/origination/refusals?asOf=${ASOF}`);
    expect(ledger.body.data.refusals).toEqual(queue.body.data.queue.refusals);
    expect(ledger.body.data.counts).toEqual(queue.body.data.counts);
  });
});

/* ── 2 & 3. The cut is reported, and the counts are derived ────────────────── */

describe('nothing disappears without a reason', () => {
  it('reports the capacity cut as a reasoned deferral, naming every id', async () => {
    for (let i = 0; i < 4; i += 1) {
      await post('/origination/targets', eligible({ name: `Target ${i}` }));
    }
    const { body } = await get(`/origination?asOf=${ASOF}&capacity=2`);
    expect(body.data.queue.rows).toHaveLength(2);
    expect(body.data.queue.deferred.count).toBe(2);
    expect(body.data.queue.deferred.targetIds).toHaveLength(2);
    expect(body.data.queue.deferred.reason).toMatch(/capacity rule, not by a gate/i);
    // The boundary is legible: what made it, and what just missed.
    expect(body.data.queue.deferred.lowestQueuedScore).not.toBeNull();
    expect(body.data.queue.deferred.highestDeferredScore).not.toBeNull();
  });

  it('ships counts that add up to what it shipped', async () => {
    await post('/origination/targets', eligible({ name: 'A' }));
    await post('/origination/targets', eligible({ name: 'B' }));
    await post('/origination/targets', eligible({ name: 'C', screening: 'concern' }));
    const { body } = await get(`/origination?asOf=${ASOF}&capacity=1`);
    const c = body.data.counts;
    expect(c.considered).toBe(c.queued + c.deferred + c.refused);
    expect(c).toEqual({ considered: 3, queued: 1, deferred: 1, refused: 1, walls: 1, tasks: 0 });
  });

  it('refuses an out-of-range capacity instead of silently clamping it', async () => {
    expect((await get('/origination?capacity=0')).status).toBe(400);
    expect((await get('/origination?capacity=999')).status).toBe(400);
    expect((await get('/origination?capacity=1.5')).status).toBe(400);
    expect((await get('/origination?asOf=not-a-date')).status).toBe(400);
  });

  it('puts the score, the band and the drivers beside each other, never folded', async () => {
    await post('/origination/targets', eligible());
    const { body } = await get(`/origination?asOf=${ASOF}`);
    const row = body.data.queue.rows[0];
    expect(typeof row.score).toBe('number');
    expect(typeof row.confidence).toBe('number');
    expect(['high', 'medium', 'low']).toContain(row.band);
    // The trail sums EXACTLY to rawScore, which is what makes it auditable (D1).
    const sum = (row.drivers as { points: number }[]).reduce((a, d) => a + d.points, 0);
    expect(sum).toBe(row.rawScore);
    expect(row.drivers).toHaveLength(6);
    // The weights print their own basis: a stated prior, never fitted.
    expect(body.data.queue.weightsBasis.learnedFromOutcomes).toBe(false);
    expect(body.data.queue.triggerBasis.learnedFromOutcomes).toBe(false);
  });
});

/* ── Provenance and the why-now — 8.1 / 8.3 ────────────────────────────────── */

describe('provenance on every fact, and a why-now with a date', () => {
  it('refuses an undated fact, with the reason', async () => {
    const t = await post('/origination/targets', eligible());
    const id = t.body.data.target.id as string;
    const res = await post(`/origination/${id}/facts`, {
      field: 'statedBudgetCents', sourceId: 'manual', reliability: 'B', credibility: 2,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.error).toMatch(/observedIso is required/);
    expect(res.body.error).toMatch(/as if it were observed today/);
    expect(db.observations).toHaveLength(0);
  });

  it('refuses provenance for a field that does not feed the score', async () => {
    const t = await post('/origination/targets', eligible());
    const id = t.body.data.target.id as string;
    const res = await post(`/origination/${id}/facts`, {
      field: 'name', sourceId: 'manual', observedIso: '2026-07-25T00:00:00.000Z',
    });
    expect(res.status).toBe(400);
    expect(PROVENANCEABLE_FIELDS).toContain('statedBudgetCents');
    expect(PROVENANCEABLE_FIELDS).not.toContain('name');
  });

  it('prints the grade WITH the age on the queue row, so a stale B2 cannot look fresh', async () => {
    const t = await post('/origination/targets', eligible());
    const id = t.body.data.target.id as string;
    await post(`/origination/${id}/facts?asOf=${ASOF}`, {
      field: 'statedBudgetCents', sourceId: 'coingecko', credibility: 2,
      observedIso: '2026-07-30T00:00:00.000Z',
    });
    await post(`/origination/${id}/facts?asOf=${ASOF}`, {
      field: 'quotedPriceCents', sourceId: 'manual', credibility: 3,
      observedIso: '2026-01-01T00:00:00.000Z',
    });

    const { body } = await get(`/origination?asOf=${ASOF}`);
    const row = body.data.queue.rows[0];
    const fresh = (row.provenance as any[]).find((p) => p.field === 'statedBudgetCents');
    const stale = (row.provenance as any[]).find((p) => p.field === 'quotedPriceCents');

    expect(fresh.admiralty).toBe('A2');
    expect(fresh.ageDays).toBe(2);
    expect(fresh.stale).toBe(false);
    expect(stale.ageDays).toBe(212);
    expect(stale.stale).toBe(true);
    expect(stale.confidence).toBeLessThan(fresh.confidence);
    // The fields still moving the score with nothing behind them are named, not
    // quietly absent — this is the list the brief turns into UNVERIFIED claims.
    expect(row.unprovenanced).toContain('expectedVendorCostCents');
    expect(row.advisories.join(' ')).toMatch(/carry no source/);
  });

  it('records a why-now, ages it against its own shelf life, and keeps undated visible', async () => {
    const a = await post('/origination/targets', eligible({ name: 'Fresh Trigger' }));
    const b = await post('/origination/targets', eligible({ name: 'Undated Trigger' }));
    const aId = a.body.data.target.id as string;
    const bId = b.body.data.target.id as string;

    const fresh = await post(`/origination/${aId}/why-now?asOf=${ASOF}`, {
      kind: 'funding_event', statement: 'Closed a $6m round.',
      occurredIso: '2026-07-28T00:00:00.000Z', sourceId: 'news', credibility: 2,
    });
    expect(fresh.status).toBe(201);
    expect(fresh.body.data.trigger.state).toBe('fresh');
    expect(fresh.body.data.trigger.shelfLifeDays).toBe(120);

    const undated = await post(`/origination/${bId}/why-now?asOf=${ASOF}`, {
      kind: 'inbound_request', statement: 'They emailed asking about MiCA.', sourceId: 'manual',
    });
    expect(undated.status).toBe(201);
    expect(undated.body.data.trigger.state).toBe('undated');

    const { body } = await get(`/origination?asOf=${ASOF}`);
    const rows = body.data.queue.rows as any[];
    const rowA = rows.find((r) => r.targetId === aId);
    const rowB = rows.find((r) => r.targetId === bId);
    expect(rowA.trigger.kindLabel).toBe('Funding event');
    expect(rowA.triggerState).toBe('fresh');
    expect(rowB.triggerState).toBe('undated');
    expect(rowB.advisories.join(' ')).toMatch(/no date/);
  });

  it('says out loud when there is no why-now at all', async () => {
    await post('/origination/targets', eligible());
    const { body } = await get(`/origination?asOf=${ASOF}`);
    const row = body.data.queue.rows[0];
    expect(row.trigger).toBeNull();
    expect(row.triggerState).toBe('absent');
    expect(row.advisories.join(' ')).toMatch(/list entry, not a reason to call today/);
  });

  it('drops a stored trigger whose kind the engine no longer has, rather than defaulting it', async () => {
    const t = await post('/origination/targets', eligible());
    const id = t.body.data.target.id as string;
    // A row written before a kind was renamed. It must vanish from the why-now
    // column — becoming a market_event with the wrong shelf life would be worse.
    db.observations.push({
      subject_type: 'gps_target', subject_id: id, predicate: 'whyNow',
      value_json: JSON.stringify({ kind: 'vibes', statement: 'felt right', occurredIso: null }),
      source: 'manual', source_url: null, reliability: 'B', credibility: 2,
      confidence: 50, observed_at: ASOF, actor: 'nik',
    });
    const { body } = await get(`/origination?asOf=${ASOF}`);
    expect(body.data.queue.rows[0].trigger).toBeNull();
    expect(body.data.queue.rows[0].triggerState).toBe('absent');
  });

  it('keeps "no need established" and "looked, and there is none" apart', async () => {
    const unknown = await post('/origination/targets', eligible({ name: 'Unknown', identifiedNeeds: null }));
    const none = await post('/origination/targets', eligible({ name: 'None', identifiedNeeds: [] }));
    const { body } = await get(`/origination?asOf=${ASOF}`);
    const rows = body.data.queue.rows as any[];
    const u = rows.find((r) => r.targetId === unknown.body.data.target.id);
    const n = rows.find((r) => r.targetId === none.body.data.target.id);
    // Both score zero for need; only the UNKNOWN one is charged for the gap.
    expect(u.missingFactors).toContain('need');
    expect(n.missingFactors).not.toContain('need');
    expect(n.confidence).toBeGreaterThan(u.confidence);
  });
});

/* ── 4. The brief asserts nothing it cannot source — 8.4 ───────────────────── */

async function targetWithOneSourcedFact() {
  const t = await post('/origination/targets', eligible());
  const id = t.body.data.target.id as string;
  await post(`/origination/${id}/facts?asOf=${ASOF}`, {
    field: 'statedBudgetCents', sourceId: 'manual', credibility: 2,
    observedIso: '2026-07-29T00:00:00.000Z',
  });
  return id;
}

describe('the research brief', () => {
  it('sources what it can, labels what it cannot, and never does both to one claim', async () => {
    const id = await targetWithOneSourcedFact();
    const { status, body } = await get(`/origination/${id}/brief?asOf=${ASOF}`);
    expect(status).toBe(200);
    const brief = body.data.brief;

    const sourced = brief.assertions.filter((a: any) => a.status === 'SOURCED');
    const unverified = brief.assertions.filter((a: any) => a.status === 'UNVERIFIED');

    // The property the whole slice exists for, asserted as an ABSENCE: no sourced
    // claim without provenance, and no unverified claim carrying one.
    expect(sourced.length).toBeGreaterThan(0);
    expect(sourced.every((a: any) => a.provenance !== null)).toBe(true);
    expect(unverified.every((a: any) => a.provenance === null)).toBe(true);

    const budget = brief.assertions.find((a: any) => a.id === 'fact:statedBudgetCents');
    expect(budget.status).toBe('SOURCED');
    expect(budget.provenance.admiralty).toBe('B2');
    expect(budget.provenance.ageDays).toBe(3);
    expect(budget.text).toMatch(/\$20,000/);

    const unsourcedPrice = brief.assertions.find((a: any) => a.id === 'unsourced:quotedPriceCents');
    expect(unsourcedPrice.status).toBe('UNVERIFIED');
    expect(unsourcedPrice.provenance).toBeNull();
    expect(unsourcedPrice.text).toMatch(/NO SOURCE IS ATTACHED/);

    expect(brief.integrity.ok).toBe(true);
    expect(brief.integrity.sourced).toBe(sourced.length);
    expect(brief.integrity.unverified).toBe(unverified.length);
    expect(brief.refusal ?? body.data.refusal).toBeNull();
  });

  it('places every scoring field that has a value, so no sentence is unplaced', async () => {
    const t = await post('/origination/targets', eligible({
      capitalProxyCents: 50_000_000,
      deadlineIso: '2026-10-01T00:00:00.000Z',
      deadlineKind: 'regulatory',
      complexity: { noNamedPartner: true, scopeUndefined: false },
    }));
    const id = t.body.data.target.id as string;
    const { body } = await get(`/origination/${id}/brief?asOf=${ASOF}`);
    const ids = (body.data.brief.assertions as any[]).map((a) => a.id);
    // `market` is the one scoring input 0050 does not store — no SignalBundle column
    // exists, so the capital proxy of last resort is unavailable rather than invented.
    for (const field of PROVENANCEABLE_FIELDS.filter((f) => f !== 'market')) {
      expect(
        ids.some((i) => i === `fact:${field}` || i === `unsourced:${field}`),
        `no assertion placed for the scoring field '${field}'`,
      ).toBe(true);
    }
    const sections = new Set((body.data.brief.assertions as any[]).map((a) => a.section));
    expect([...sections].every((s) => typeof s === 'string' && s.length > 0)).toBe(true);
  });

  it('states the unknowns once, and does not count the same gap twice', async () => {
    const t = await post('/origination/targets', {
      name: 'Barely Known', screening: 'not_screened', quotedPriceCents: 1_000_000,
    });
    const id = t.body.data.target.id as string;
    const { body } = await get(`/origination/${id}/brief?asOf=${ASOF}`);
    const unknowns = body.data.brief.unknowns as string[];
    expect(unknowns.length).toBeGreaterThan(0);
    expect(unknowns.join(' ')).toMatch(/Sanctions\/AML screen not performed/);
    expect(unknowns.join(' ')).toMatch(/No why-now trigger recorded/);
    // The unsourced price is an UNVERIFIED assertion in its own section, so it must
    // NOT also appear here — the same gap listed twice reads as two gaps.
    expect(unknowns.join(' ')).not.toMatch(/carries no source/);
    expect(new Set(unknowns).size).toBe(unknowns.length);
  });

  it('briefs a REFUSED target, with the gate beside it rather than instead of it', async () => {
    const t = await post('/origination/targets', eligible({ name: 'Walled Off', screening: 'concern' }));
    const id = t.body.data.target.id as string;
    const { body } = await get(`/origination/${id}/brief?asOf=${ASOF}`);

    expect(body.data.brief.score).toBeNull();
    expect(body.data.brief.gates.map((g: any) => g.key)).toEqual(['sanctions_concern']);
    expect(body.data.refusal.disposition).toBe('wall');
    const gateAssertion = (body.data.brief.assertions as any[]).find((a) => a.id === 'gate:sanctions_concern');
    expect(gateAssertion.section).toBe('risk');
    // Our own finding, graded as our own finding: B2 with a real date, never A1.
    expect(gateAssertion.provenance.admiralty).toBe('B2');
    expect(gateAssertion.provenance.sourceLabel).toBe('LCX model');
    expect(gateAssertion.provenance.observedIso).not.toBeNull();
    // Confidence is reported for a refusal too: what we refused ON matters.
    expect(typeof body.data.brief.confidence).toBe('number');
  });

  it('carries no probability dressed as a forecast', async () => {
    const id = await targetWithOneSourcedFact();
    const { body } = await get(`/origination/${id}/brief?asOf=${ASOF}`);
    // `BriefEstimate` exists in the engine and is deliberately unused: mapping a
    // stated-prior score onto a win probability would be the most plausible-sounding
    // invention available here.
    expect((body.data.brief.assertions as any[]).every((a) => a.estimate == null)).toBe(true);
  });

  it('404s a brief for a target that does not exist', async () => {
    const res = await get('/origination/aaaaaaaa-0000-4000-8000-000000000000/brief');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('reproduces byte for byte at the same asOf', async () => {
    const id = await targetWithOneSourcedFact();
    const a = await get(`/origination/${id}/brief?asOf=${ASOF}`);
    const b = await get(`/origination/${id}/brief?asOf=${ASOF}`);
    expect(a.body.data).toEqual(b.body.data);
  });
});

/* ── 5. The opening is a draft. Nothing sends. — 8.5 ───────────────────────── */

describe('the proposed opening', () => {
  it('stores a cited draft and marks it unapproved, with nothing sent', async () => {
    const id = await targetWithOneSourcedFact();
    const res = await post(`/origination/${id}/opening?asOf=${ASOF}`, {
      openingText: 'You mentioned a $20k budget for the whitepaper — is that still the shape?',
      citedAssertionIds: ['fact:statedBudgetCents'],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.approvedForSend).toBe(false);
    expect(res.body.data.brief.proposedOpening.approvedForSend).toBe(false);
    expect(res.body.data.opening.draftedBy).toBe('nik');
    expect(db.openings).toHaveLength(1);

    // The stored row has no way to say "approved" or "sent". That absence is the
    // send gate: there is no column to write an approval into.
    const stored = db.openings[0];
    expect(Object.keys(stored).some((k) => /approv|sent|recipient|channel|address/i.test(k))).toBe(false);

    // And it comes back on the brief, re-checked, still unapproved.
    const read = await get(`/origination/${id}/brief?asOf=${ASOF}`);
    expect(read.body.data.brief.proposedOpening.approvedForSend).toBe(false);
    expect(read.body.data.brief.integrity.ok).toBe(true);
  });

  it('REFUSES an opening that leans on an unverified claim, and stores nothing', async () => {
    const t = await post('/origination/targets', eligible());
    const id = t.body.data.target.id as string;
    const res = await post(`/origination/${id}/opening?asOf=${ASOF}`, {
      openingText: 'I hear you have $20k to spend.',
      citedAssertionIds: ['unsourced:statedBudgetCents'],
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BRIEF_INTEGRITY');
    expect(res.body.data.codes).toContain('opening_cites_unverified');
    expect(res.body.data.violations[0].blocking).toBe(true);
    expect(res.body.error).toMatch(/nothing was sent/i);
    expect(db.openings).toHaveLength(0);
  });

  it('refuses an opening that cites nothing unless it declares that it asserts nothing', async () => {
    const id = await targetWithOneSourcedFact();
    const bare = await post(`/origination/${id}/opening?asOf=${ASOF}`, {
      openingText: 'Worth a conversation?',
    });
    expect(bare.status).toBe(409);
    expect(bare.body.data.codes).toContain('opening_without_citations');

    const declared = await post(`/origination/${id}/opening?asOf=${ASOF}`, {
      openingText: 'Would a short call next week be useful?', assertsNothing: true,
    });
    expect(declared.status).toBe(201);
  });

  it('refuses a citation to an assertion that is not in the brief', async () => {
    const id = await targetWithOneSourcedFact();
    const res = await post(`/origination/${id}/opening?asOf=${ASOF}`, {
      openingText: 'About that raise…', citedAssertionIds: ['fact:invented'],
    });
    expect(res.status).toBe(409);
    expect(res.body.data.codes).toContain('opening_cites_unknown_assertion');
  });

  it('re-checks a stored draft on every read, so a vanished citation surfaces', async () => {
    const id = await targetWithOneSourcedFact();
    const drafted = await post(`/origination/${id}/opening?asOf=${ASOF}`, {
      openingText: 'You mentioned a $20k budget.', citedAssertionIds: ['fact:statedBudgetCents'],
    });
    expect(drafted.status).toBe(201);

    // The budget turns out to be wrong and is un-recorded. The claim the opening
    // leaned on no longer exists, and the brief must say so rather than keep
    // presenting a stored "ok" nobody re-derived.
    const replaced = await post('/origination/targets', eligible({ id, statedBudgetCents: null }));
    expect(replaced.status).toBe(200);

    const { body } = await get(`/origination/${id}/brief?asOf=${ASOF}`);
    expect(body.data.brief.integrity.ok).toBe(false);
    const codes = (body.data.brief.integrity.violations as any[]).filter((v) => v.blocking).map((v) => v.code);
    expect(codes).toContain('opening_cites_unknown_assertion');
    expect(body.data.brief.proposedOpening.approvedForSend).toBe(false);
  });

  it('will not let a machine principal author a sentence aimed at a client', async () => {
    const id = await targetWithOneSourcedFact();
    // The shared machine key authenticates as { id: 'operator' } and holds `gps` at
    // operate through machineMap() — role is the wrong lever, personhood is the right
    // one. sam is a real desk member at 'operate' and must still be able to draft.
    const machine = await post(
      `/origination/${id}/opening?asOf=${ASOF}`,
      { openingText: 'Hello', assertsNothing: true },
      appAs('operator', 'operator'),
    );
    expect(machine.status).toBe(403);
    expect(machine.body.code).toBe('NAMED_HUMAN_REQUIRED');
    expect(db.openings).toHaveLength(0);

    const sam = await post(
      `/origination/${id}/opening?asOf=${ASOF}`,
      { openingText: 'Would a short call be useful?', assertsNothing: true },
      appAs('sam', 'operator'),
    );
    expect(sam.status).toBe(201);
  });

  it('validates the draft before it looks at anything else', async () => {
    const id = await targetWithOneSourcedFact();
    expect((await post(`/origination/${id}/opening`, { openingText: '   ' })).status).toBe(400);
    expect((await post(`/origination/${id}/opening`, { openingText: 'x', citedAssertionIds: 'nope' })).status).toBe(400);
    expect((await post(`/origination/${id}/opening`, {
      openingText: 'x', citedAssertionIds: new Array(21).fill('fact:statedBudgetCents'),
    })).status).toBe(400);
  });
});

/* ── 6. The migration window ───────────────────────────────────────────────── */

describe('0050 pending: honest, not broken', () => {
  beforeEach(() => {
    db.migrated = false;
    _resetOriginationMigrated();
  });

  it('serves a real, well-shaped, EMPTY queue rather than a 500', async () => {
    const { status, body } = await get(`/origination?asOf=${ASOF}`);
    expect(status).toBe(200);
    expect(body.meta.migrated).toBe(false);
    expect(body.data.queue.rows).toEqual([]);
    // Built by the engine over zero inputs, so the pending shape cannot differ from
    // the live one — which is how the last hand-written empty body in this
    // compartment came to claim a `counts` field that did not exist.
    expect(body.data.counts).toEqual({
      considered: 0, queued: 0, deferred: 0, refused: 0, walls: 0, tasks: 0,
    });
    expect(body.data.queue.weightsBasis.version).toBe('v1');
    expect(body.data.queue.deferred.reason).toMatch(/Nothing deferred/);
  });

  it('serves an empty ledger with every gate key present', async () => {
    const { status, body } = await get('/origination/refusals');
    expect(status).toBe(200);
    expect(body.meta.migrated).toBe(false);
    expect(body.data.refusals.entries).toEqual([]);
    expect(Object.keys(body.data.refusals.byGate)).toHaveLength(7);
  });

  it('serves an empty list and a null brief', async () => {
    const list = await get('/origination/targets');
    expect(list.status).toBe(200);
    expect(list.body.data).toEqual([]);
    const brief = await get('/origination/aaaaaaaa-0000-4000-8000-000000000000/brief');
    expect(brief.status).toBe(200);
    expect(brief.body.data).toBeNull();
    expect(brief.body.meta.migrated).toBe(false);
  });

  it('refuses every write with 503 and names the migration — never 500', async () => {
    const id = 'aaaaaaaa-0000-4000-8000-000000000000';
    const writes = [
      await post('/origination/targets', eligible()),
      await post(`/origination/${id}/facts`, {
        field: 'statedBudgetCents', sourceId: 'manual', observedIso: ASOF,
      }),
      await post(`/origination/${id}/why-now`, {
        kind: 'funding_event', statement: 'Closed a round.', sourceId: 'news',
      }),
      await post(`/origination/${id}/opening`, { openingText: 'Hello', assertsNothing: true }),
    ];
    for (const w of writes) {
      expect(w.status).toBe(503);
      expect(w.body.code).toBe('MIGRATION_PENDING');
      expect(w.body.error).toMatch(/0050/);
    }
  });

  it('validates BEFORE it probes, because a bad payload is bad in every environment', async () => {
    expect((await post('/origination/targets', { name: '  ' })).status).toBe(400);
    expect((await post('/origination/targets', eligible({ screening: 'probably fine' }))).status).toBe(400);
    const id = 'aaaaaaaa-0000-4000-8000-000000000000';
    expect((await post(`/origination/${id}/facts`, { field: 'statedBudgetCents', sourceId: 'manual' })).status).toBe(400);
    expect((await post(`/origination/${id}/why-now`, { kind: 'vibes', statement: 'x', sourceId: 'manual' })).status).toBe(400);
  });
});

/* ── The absences, at source level ─────────────────────────────────────────── */

const HERE = dirname(fileURLToPath(import.meta.url));
const API_SRC = resolve(HERE, '../..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const ROUTES_PATH = resolve(API_SRC, 'routes/gpsOrigination.ts');
const SERVICE_PATH = resolve(API_SRC, 'gps/origination.ts');
const routesRaw = readFileSync(ROUTES_PATH, 'utf8');
const routesCode = strip(routesRaw);
const serviceCode = strip(readFileSync(SERVICE_PATH, 'utf8'));

/**
 * WHY SOURCE-LEVEL. A behavioural test can only prove that the routes that exist do
 * not send. These must fail for a send path that does not exist yet, which is the
 * only place that property is visible — the same technique as
 * `gps/__tests__/intakeLockout.test.ts`.
 */
describe('no origination route can send anything', () => {
  it('imports no transport, and calls nothing that transmits', () => {
    for (const code of [routesCode, serviceCode]) {
      for (const pattern of [
        /\bresend\b/i, /nodemailer/i, /sgMail/i, /smtp/i, /imapflow/i, /twilio/i,
        /\bfetch\s*\(/, /\baxios\b/, /sendMail/i, /sendMessage/i, /\bsendEmail\b/i,
        /outreach\//, /marketing\/xMail/, /\/scheduler\.js/,
      ]) {
        expect(code, `an origination source matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('declares no route path that promises a send, a file or a document', () => {
    const paths = [...routesCode.matchAll(/\.\s*(?:get|post|put|patch|delete)\s*\(\s*'([^']*)'/g)].map((m) => m[1]);
    expect(paths.length, 'no route paths extracted — this assertion would pass vacuously').toBeGreaterThanOrEqual(8);
    for (const p of paths) {
      expect(p, `route path '${p}' promises a transmission`).not.toMatch(/send|email|message|notify/i);
      expect(p, `route path '${p}' names an artifact intake shape`)
        .not.toMatch(/upload|attach|\bfiles?\b|document|blob|artifact|media|\basset/i);
    }
  });

  it('never constructs an approved opening', () => {
    for (const code of [routesCode, serviceCode]) {
      expect(code).not.toMatch(/approvedForSend\s*:\s*true/);
      expect(code).not.toMatch(/approved_(at|by)/);
      expect(code).not.toMatch(/\bsent_at\b/);
    }
    // The literal is present, and it is `false`.
    expect(routesCode).toMatch(/approvedForSend:\s*false/);
    expect(serviceCode).toMatch(/approvedForSend:\s*false/);
  });

  it('reads request bodies as JSON and by no other means', () => {
    const readers = routesCode.match(/c\.req\.[a-zA-Z]+/g) ?? [];
    expect(readers).not.toHaveLength(0);
    const allowed = new Set(['c.req.json', 'c.req.param', 'c.req.query', 'c.req.header']);
    for (const r of readers) expect(allowed.has(r), `a route uses ${r}`).toBe(true);
  });

  it('opens no byte door', () => {
    for (const code of [routesCode, serviceCode]) {
      for (const pattern of [
        /multipart|form-?data/i, /\.(parseBody|arrayBuffer|blob|formData)\s*\(/,
        /\bBuffer\b|\bBlob\b|ArrayBuffer|Uint8Array/, /base64/i,
        /node:fs|readFileSync|createWriteStream/, /presign|getSignedUrl|PutObject/i,
      ]) {
        expect(code, `an origination source matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('states the no-artifact posture in prose, because comments are how a human learns it', () => {
    expect(routesRaw).toMatch(/\bD2\b|\bDPO\b/);
    expect(routesRaw).toMatch(/no (artifact|upload|attachment)|artifact intake|no client (document|material)/i);
  });

  it('is exported and NOT mounted — app.ts belongs to the wiring pass', () => {
    expect(routesCode).toMatch(/export const gpsOriginationRoutes/);
    const app = readFileSync(resolve(API_SRC, 'app.ts'), 'utf8');
    expect(
      app.includes('gpsOriginationRoutes'),
      'app.ts now mounts this router. Read the header of routes/gpsOrigination.ts first: '
      + 'intakeLockout asserts that only gpsRoutes is mounted under /v1/gps.',
    ).toBe(false);
  });

  it('every handler probes the migration, or is a probe-free read of nothing', () => {
    // The same ratchet shape as gps/__tests__/deploySafety.test.ts: a route added
    // months from now without the guard is invisible until someone deploys ahead of
    // a migration, and then it is a 500 the desk reads as an outage.
    const re = /gpsOriginationRoutes\.(get|post)\('([^']+)'/g;
    const found = [...routesCode.matchAll(re)].map((m) => ({ path: m[2], start: m.index ?? 0 }));
    expect(found.length).toBeGreaterThanOrEqual(8);
    found.forEach((h, i) => {
      const body = routesCode.slice(h.start, found[i + 1]?.start ?? routesCode.length);
      expect(
        /isOriginationMigrated/.test(body),
        `handler '${h.path}' does not probe for 0050 — it will 500 during the migration window`,
      ).toBe(true);
    });
  });
});
