import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import type { EvidenceStatus } from '@lcx/shared';
import { getOffer } from '@lcx/shared';
import {
  DELIVERABLE_STATE_FROM_DB,
  DELIVERY_SCHEMA_GAPS,
  EVIDENCE_STATUS_FROM_DB,
  MILESTONE_STATE_FROM_DB,
  _resetDeliveryMigrated,
  acceptDeliverable,
  deliveryDesk,
  recordMilestoneState,
  setEvidenceStatus,
} from '../deliveryDesk.js';

/**
 * P10 DELIVERY — the API's own ratchets, plus the two behaviours that decide whether
 * this surface is honest.
 *
 * FOUR THINGS ARE ASSERTED HERE, and each exists because of a specific way this could
 * be wrong rather than as coverage:
 *
 *  1. DEPLOY SAFETY. 0049 is applied BY HAND (LCX prod has 0047 and 0049 both pending
 *     as of 2026-07-31) while the API ships on a push to main. Unguarded, every route
 *     in `routes/gpsDelivery.ts` returns `relation "gps_milestone" does not exist` as a
 *     500, and the desk cannot distinguish "one migration is pending" from "the
 *     platform is down" — it is the second reading people act on. Source-level for the
 *     reason `gps/__tests__/deploySafety.test.ts:23` gives: the failure mode is a NEW
 *     route added months from now without the guard, and a behavioural test would need
 *     a database WITHOUT the tables, which is the one environment CI does not provide.
 *
 *  2. NO BYTE DOOR, scoped to these two files. `intakeLockout.test.ts` already covers
 *     them by discovery; this is the near-miss version whose failure message names
 *     THIS pass, because a delivery route is the single most natural place for someone
 *     to add "just accept the draft".
 *
 *  3. A DRIFTED ENGAGEMENT SURFACES THE DRIFT RATHER THAN A PLAN. `deriveMilestones`
 *     refuses a plan that has drifted from the sale by THROWING (`delivery.ts:609`),
 *     which on a server is a 500 and on a screen is nothing at all. The whole point of
 *     P10 is that the refusal becomes visible, so it is asserted end to end — and so
 *     is the consequence: no milestone state can be written against a plan that does
 *     not match what was sold.
 *
 *  4. ACCEPTANCE IS REFUSED, WITH REASONS, WHILE A REVIEW IS OUTSTANDING. This is the
 *     one rule in the compartment that protects LCX rather than the client, and it is
 *     stated in two places — `canAccept` and the CHECK constraint
 *     `gps_deliverable_no_acceptance_before_review`. Asserted that the refusal is
 *     returned WITH its reasons and that NOTHING IS WRITTEN when it fires.
 *
 * THE FAKE POOL IS DELIBERATE AND LIMITED. It answers canned rows by SQL substring and
 * RECORDS EVERY STATEMENT, which is what makes "wrote nothing" checkable — a refusal
 * that returns the right message and still performs the UPDATE would pass a
 * result-shape assertion and fail this one. What it cannot check is the constraints
 * themselves: `gps_deliverable_no_acceptance_before_review` is enforced by Postgres,
 * so it is verified by reading 0049 (below), never by this fake. Stated so nobody
 * quotes these tests as proof the database rule works.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
/** apps/api/src — this file lives at apps/api/src/gps/__tests__/. */
const SRC = resolve(HERE, '../..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ROUTES_RAW = readFileSync(resolve(SRC, 'routes/gpsDelivery.ts'), 'utf8');
const DESK_RAW = readFileSync(resolve(SRC, 'gps/deliveryDesk.ts'), 'utf8');
const ROUTES = strip(ROUTES_RAW);
const DESK = strip(DESK_RAW);
const MIGRATION = readFileSync(resolve(SRC, 'db/migrations/0049_gps_delivery.sql'), 'utf8');

interface Handler { method: string; path: string; body: string }

/** Split the route file into one block per handler, in source order. */
function handlers(): Handler[] {
  const re = /gpsDeliveryRoutes\.(get|post|patch|delete|put)\('([^']+)'/g;
  const found: Array<{ method: string; path: string; start: number }> = [];
  for (let m = re.exec(ROUTES); m; m = re.exec(ROUTES)) {
    found.push({ method: m[1], path: m[2], start: m.index });
  }
  return found.map((h, i) => ({
    method: h.method,
    path: h.path,
    body: ROUTES.slice(h.start, found[i + 1]?.start ?? ROUTES.length),
  }));
}

/**
 * THE ONE PERMITTED INDIRECTION for the migration probe. The five engagement reads
 * share `readDesk`, which probes once; a handler may satisfy the guard by calling it.
 * The allow-list is only honest because the next test asserts `readDesk` itself
 * probes — the same arrangement `deploySafety.test.ts:97` uses to keep its DB-free
 * allow-list from being abused.
 */
const PROBE_VIA_HELPER = 'readDesk(';

describe('every delivery route survives a missing 0049', () => {
  it('registers the routes the delivery desk claims to have', () => {
    // A floor, not an exact count: if the regex ever stops matching how routes are
    // declared, every assertion in this file would pass vacuously.
    const hs = handlers();
    expect(hs.length, 'no handlers extracted — the enumeration regex no longer matches').toBeGreaterThanOrEqual(11);
    const paths = hs.map((h) => h.path);
    for (const required of [
      '/engagements/:id/delivery',
      '/engagements/:id/plan',
      '/engagements/:id/progress',
      '/engagements/:id/evidence',
      '/engagements/:id/acceptance',
      '/wip',
      '/engagements/:id/milestones/:key/state',
      '/engagements/:id/deliverables',
      '/deliverables/:id/review',
      '/deliverables/:id/accept',
      '/evidence/:id/status',
    ]) {
      expect(paths, `missing route ${required}`).toContain(required);
    }
  });

  it('guards every handler — none of them touches a delivery table unprobed', () => {
    for (const h of handlers()) {
      const probes = h.body.includes('isDeliveryMigrated(') || h.body.includes(PROBE_VIA_HELPER);
      expect(
        probes,
        `${h.method.toUpperCase()} ${h.path} neither probes 0049 nor goes through readDesk — it returns 500 `
          + 'during the deploy-before-migration window, which the desk reads as an outage.',
      ).toBe(true);
    }
  });

  it('and the shared helper that stands in for the probe actually probes', () => {
    const fn = ROUTES.slice(ROUTES.indexOf('async function readDesk'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body, 'readDesk is allow-listed as the probe path but does not probe').toContain('isDeliveryMigrated(');
  });

  it('answers reads with an empty, well-shaped body rather than an error', () => {
    // The UI renders its banner off `migrated: false`. A read that threw instead would
    // put the page into its error state and read as broken.
    expect(ROUTES).toMatch(/migrated:\s*false/);
    expect(ROUTES).toMatch(/data:\s*null/);
  });

  it('answers writes 503, not 500', () => {
    expect(ROUTES).toContain('MIGRATION_PENDING');
    expect(ROUTES).toMatch(/NOT_MIGRATED,\s*503/);
    expect(ROUTES).not.toMatch(/NOT_MIGRATED,\s*5(?!03)\d\d/);
  });

  it('validates input BEFORE probing the environment, on every write', () => {
    // A malformed request is malformed in every environment. Answering 503 for a bad
    // uuid tells the caller to retry something that can never succeed.
    for (const h of handlers()) {
      if (h.method !== 'post') continue;
      const probe = h.body.indexOf('isDeliveryMigrated(');
      const valid = h.body.indexOf('VALIDATION');
      expect(probe, `POST ${h.path} has no probe`).toBeGreaterThan(-1);
      expect(valid, `POST ${h.path} validates nothing`).toBeGreaterThan(-1);
      expect(valid, `POST ${h.path} probes the migration before it validates the payload`).toBeLessThan(probe);
    }
  });

  it('probes with to_regclass, cannot itself throw, and caches', () => {
    expect(DESK).toContain('to_regclass');
    const fn = DESK.slice(DESK.indexOf('export async function isDeliveryMigrated'));
    expect(fn.slice(0, fn.indexOf('_resetDeliveryMigrated'))).toContain('catch');
    expect(DESK).toContain('deliveryMigratedCache');
    expect(DESK).toContain('export function _resetDeliveryMigrated');
  });

  it('probes the 0049 tables and not 0047\'s, since one probe cannot answer for two files', () => {
    // gps_engagement exists after 0047; the delivery tables do not. Probing the wrong
    // table is the exact bug that makes the guard useless while looking present.
    expect(DESK).toContain("to_regclass('public.gps_milestone')");
    expect(DESK).toContain("to_regclass('public.gps_deliverable')");
    expect(DESK).toContain("to_regclass('public.gps_evidence_request')");
  });

  it('mounts nothing itself — the router is exported and left unmounted', () => {
    expect(ROUTES).toContain('export const gpsDeliveryRoutes');
    expect(
      ROUTES,
      'this file mounts itself. app.ts must not gain a second /v1/gps router: '
        + 'intakeLockout.test.ts:331 asserts the only one is gpsRoutes.',
    ).not.toMatch(/app\.route\s*\(/);
  });
});

/**
 * Every mechanism by which bytes could arrive, grouped by the door. Deliberately the
 * same list as `intakeLockout.test.ts:241` rather than a cleverer one: two ratchets
 * that disagree about what a byte door is would eventually be reconciled by widening
 * the stricter one. This copy exists so that a failure message names THIS pass — a
 * delivery route is the most natural place for someone to add "just accept the draft".
 */
const BYTE_DOORS: ReadonlyArray<{ what: string; pattern: RegExp }> = [
  { what: 'multipart / form-data parsing', pattern: /multipart|form-?data/i },
  { what: 'a Hono body reader other than JSON', pattern: /\.(parseBody|arrayBuffer|blob|formData)\s*\(/ },
  { what: 'raw request stream access', pattern: /\breq\.raw\.body\b|getReader\s*\(|pipeTo\s*\(/ },
  { what: 'binary buffers', pattern: /\bBuffer\b|\bBlob\b|ArrayBuffer|Uint8Array|\bDataView\b/ },
  { what: 'base64 encoding or decoding', pattern: /base64|\batob\b|\bbtoa\b/i },
  { what: 'filesystem access', pattern: /node:fs|readFileSync|writeFile|createWriteStream|createReadStream/ },
  { what: 'object storage', pattern: /presign|getSignedUrl|createBucket|PutObject|\.bucket\b/i },
  { what: 'an outbound request (nothing in GPS dereferences anything)', pattern: /\bfetch\s*\(|\baxios\b|node:https?\b/ },
  { what: 'a file-upload middleware', pattern: /\bmulter\b|\bbusboy\b|\bformidable\b/i },
  {
    what: 'a body field that would carry client material',
    pattern: /\b(?:body|params|input)\s*\.\s*(?:document|file|attachment|upload|content|payload|bytes|draft|deck|whitepaper)\b/i,
  },
];

describe('the delivery layer has nowhere for a client document to arrive', () => {
  it('opens none of the byte doors, in either file', () => {
    for (const [name, code] of [['routes/gpsDelivery.ts', ROUTES], ['gps/deliveryDesk.ts', DESK]] as const) {
      for (const door of BYTE_DOORS) {
        expect(
          code,
          `${name} appears to add ${door.what}.\nGPS accepts NO client material: decision D2 (LCX DPO — `
            + 'controller vs processor for a third party\'s confidential documents) is UNANSWERED. Read the '
            + 'docblock at the top of apps/api/src/gps/__tests__/intakeLockout.test.ts before changing anything.',
        ).not.toMatch(door.pattern);
      }
    }
  });

  it('declares no route path that names a file, a document or a blob', () => {
    const paths = handlers().map((h) => h.path);
    const forbidden = /upload|attach|\bfiles?\b|document|blob|artifact|media|\basset/i;
    for (const path of paths) {
      expect(
        path,
        `route path '${path}' names an artifact intake shape. Under /v1/gps there is nowhere for a document `
          + 'to go, so a path that promises one is either dead or a lock breach.',
      ).not.toMatch(forbidden);
    }
  });

  it('reads request bodies as JSON and by no other means', () => {
    const readers = ROUTES.match(/c\.req\.[a-zA-Z]+/g) ?? [];
    expect(readers, 'no route reads a request at all — the extraction is broken').not.toHaveLength(0);
    const allowed = new Set(['c.req.json', 'c.req.param', 'c.req.query', 'c.req.header']);
    for (const reader of readers) {
      expect(
        allowed.has(reader),
        `a delivery route uses ${reader}. Only json/param/query/header may be read — every other accessor `
          + 'can carry bytes, and this is the line where a document would enter.',
      ).toBe(true);
    }
  });

  it('never dereferences the external reference it stores', () => {
    for (const [name, code] of [['routes/gpsDelivery.ts', ROUTES], ['gps/deliveryDesk.ts', DESK]] as const) {
      for (const m of code.matchAll(/external_?[Ll]ocation/g)) {
        const window = code.slice(m.index ?? 0, (m.index ?? 0) + 220);
        for (const pattern of [/\.url\s*\(/, /new URL\s*\(/, /\bfetch\b/, /\bhref\b/, /redirect/i, /\bopen\s*\(/]) {
          expect(
            window,
            `${name} appears to dereference external_location (matched ${pattern}). It is a note about where a `
              + "document lives in the CLIENT's systems. The moment the server follows it, LCX is retrieving "
              + 'third-party confidential material — the exact act D2 has not authorised.',
          ).not.toMatch(pattern);
        }
      }
    }
  });

  it('says so in prose, where the next engineer will read it before tripping over it', () => {
    for (const [name, raw] of [['routes/gpsDelivery.ts', ROUTES_RAW], ['gps/deliveryDesk.ts', DESK_RAW]] as const) {
      expect(raw, `${name} no longer states the no-artifact posture`).toMatch(
        /no (artifact|upload|attachment)|artifact intake|no client (document|material)/i,
      );
      expect(raw, `${name} does not say a human types the external reference`).toMatch(
        /human[- ]entered|operator (types|typed)|typed by (a|an|the) (operator|human)/i,
      );
    }
  });
});

/* ── The fake pool ─────────────────────────────────────────────────────────────
 *
 * Canned rows by SQL substring, and EVERY STATEMENT RECORDED. The recording is the
 * point: "the refusal wrote nothing" is the assertion that catches a handler which
 * returns the right message and performs the UPDATE anyway.
 */

type Row = Record<string, unknown>;

interface Fixture {
  migrated?: boolean;
  engagement?: Row | null;
  milestones?: Row[];
  deliverables?: Row[];
  evidence?: Row[];
  deskEngagements?: Row[];
  /** Whether the milestone UPDATE matched an existing row. */
  milestoneUpdateHits?: number;
  /**
   * The engagement's conflict decision, as `engagementDeliverable` reads it. Default
   * `'cleared'` so existing fixtures keep working; `null` is "no check on file" and
   * `'declined'` is a refusal. Every delivery write consults it.
   */
  conflict?: string | null;
}

const NOW = '2026-08-01T09:00:00.000Z';
const ENGAGEMENT_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const DELIVERABLE_ID = '33333333-3333-4333-8333-333333333333';
const EVIDENCE_ID = '44444444-4444-4444-8444-444444444444';

function fake(f: Fixture) {
  const statements: string[] = [];
  // SQL AND ITS BOUND PARAMETERS. Every literal these handlers write goes through a
  // $n placeholder (that is the point of them), so a test that only reads the SQL
  // text cannot tell 'refused' from 'open' — it sees `status = $2` either way. The
  // enum mapping is exactly the thing worth asserting, so the params are recorded.
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const rows = (r: Row[], rowCount = r.length) => ({ rows: r, rowCount });

  const answer = (q: string, p?: readonly unknown[]) => {
    statements.push(q);
    calls.push({ sql: q, params: p ?? [] });
    if (q.includes('to_regclass')) return rows([{ ok: f.migrated ?? true }]);
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)/.test(q)) return rows([]);
    if (/^\s*INSERT/.test(q)) {
      if (q.includes('gps_deliverable')) return rows([{ id: DELIVERABLE_ID }]);
      if (q.includes('gps_evidence_request')) return rows([{ id: EVIDENCE_ID }]);
      return rows([{ id: 'inserted' }]);
    }
    if (/^\s*UPDATE/.test(q)) {
      if (q.includes('gps_milestone')) return rows([], f.milestoneUpdateHits ?? 1);
      if (q.includes('gps_deliverable') && q.includes('accepted')) {
        return rows([{ id: DELIVERABLE_ID, accepted_at: NOW }]);
      }
      if (q.includes('gps_deliverable')) {
        return rows([{ id: DELIVERABLE_ID, reviewed_by: 'nik', reviewed_at: NOW }]);
      }
      if (q.includes('gps_evidence_request')) return rows([{ id: EVIDENCE_ID }]);
      return rows([{ id: 'updated' }]);
    }
    // THE DELIVERY GATE's own read: the engagement's status and its conflict decision,
    // in one statement. Matched BEFORE the generic `FROM gps_engagement` branch, which
    // returns a row with no `decision` column at all — and a gate that passes on a
    // missing column is a gate with a hole in it.
    if (q.includes('LEFT JOIN gps_conflict_check')) {
      return rows(f.engagement
        ? [{ status: f.engagement.status, decision: f.conflict === undefined ? 'cleared' : f.conflict }]
        : []);
    }
    if (q.includes('LEFT JOIN gps_client')) return rows(f.engagement ? [f.engagement] : []);
    if (q.includes('WHERE status = ANY')) return rows(f.deskEngagements ?? []);
    if (q.includes('FROM gps_engagement')) return rows(f.engagement ? [f.engagement] : []);
    if (q.includes('FROM gps_milestone')) return rows(f.milestones ?? []);
    if (q.includes('FROM gps_deliverable')) return rows(f.deliverables ?? []);
    if (q.includes('FROM gps_evidence_request')) return rows(f.evidence ?? []);
    return rows([]);
  };

  const pool = {
    query: async (q: string, p?: readonly unknown[]) => answer(q, p),
    connect: async () => ({
      query: async (q: string, p?: readonly unknown[]) => answer(q, p),
      release: () => {},
    }),
  } as unknown as Pool;

  return {
    pool,
    statements,
    wrote: () => statements.filter((s) => /^\s*(INSERT|UPDATE|DELETE)/.test(s)),
    wroteWith: () => calls.filter((c) => /^\s*(INSERT|UPDATE|DELETE)/.test(c.sql)),
  };
}

const OFFER = getOffer('diagnostic');

function engagementRow(scopeSnapshot: unknown = null, over: Row = {}): Row {
  return {
    id: ENGAGEMENT_ID,
    client_id: CLIENT_ID,
    client_name: 'A token project',
    offer_key: OFFER.key,
    status: 'in_delivery',
    scope_snapshot: scopeSnapshot,
    ...over,
  };
}

function deliverableRow(over: Row = {}): Row {
  return {
    id: DELIVERABLE_ID,
    client_id: CLIENT_ID,
    engagement_id: ENGAGEMENT_ID,
    name: 'Findings pack',
    owner: 'partner',
    status: 'submitted',
    review_required: true,
    reviewed_by: null,
    reviewed_at: null,
    accepted_at: null,
    external_location: "the client's own data room, folder 3",
    external_location_note: null,
    created_at: NOW,
    updated_at: NOW,
    ...over,
  };
}

function evidenceRow(over: Row = {}): Row {
  return {
    id: EVIDENCE_ID,
    client_id: CLIENT_ID,
    engagement_id: ENGAGEMENT_ID,
    description: 'The audited token allocation table as at 30 June',
    requested_from: 'client — COO',
    requested_at: '2026-07-01T09:00:00.000Z',
    due_by: '2026-07-10T09:00:00.000Z',
    status: 'open',
    external_location: null,
    satisfied_at: null,
    updated_at: NOW,
    ...over,
  };
}

beforeEach(() => {
  // The probe caches per process, and these tests flip `migrated` between them.
  _resetDeliveryMigrated();
});

describe('a drifted engagement surfaces the drift instead of a plan', () => {
  /**
   * The frozen scope carries one acceptance criterion more than the catalogue's plan
   * delivers, which is `sold_not_delivered` — work sold that no milestone delivers,
   * the failure that loses the client. `deriveMilestones` refuses by throwing; the
   * view turns that into a verdict; this asserts it reaches the wire.
   */
  const DRIFTED = {
    acceptanceCriteria: [...OFFER.acceptanceCriteria, 'A promise nobody planned a milestone for'],
  };

  it('returns a refusal verdict, an empty plan, and the engine\'s own message', async () => {
    const { pool } = fake({ engagement: engagementRow(DRIFTED) });
    const desk = await deliveryDesk(pool, ENGAGEMENT_ID, NOW);
    expect(desk).not.toBeNull();
    const plan = desk!.response.plan;

    expect(plan.usable, 'a drifted plan must not be presented as usable').toBe(false);
    expect(plan.rows, 'rows are empty BY REFUSAL, not by absence').toHaveLength(0);
    expect(plan.drift.matchesSale).toBe(false);
    expect(plan.drift.failure?.direction).toBe('sold_not_delivered');
    // Verbatim, not paraphrased: the engine's message names the offer, the criterion
    // and the index, and a paraphrase would lose all three.
    expect(plan.drift.failure?.engineMessage.length).toBeGreaterThan(20);
    expect(plan.drift.assertion).toContain('SCOPE DRIFT');
    expect(plan.drift.mechanism).toBeTruthy();
  });

  it('leads the notices with the drift, as a refusal and not a warning', async () => {
    const { pool } = fake({ engagement: engagementRow(DRIFTED) });
    const desk = await deliveryDesk(pool, ENGAGEMENT_ID, NOW);
    const first = desk!.response.notices[0];
    expect(first.code).toBe('scope_drift');
    expect(first.severity).toBe('refusal');
    expect(first.mechanism, 'a refusal must name what produced it (D8)').toBeTruthy();
  });

  it('reports no progress at all rather than a flattering percentage', async () => {
    const { pool } = fake({ engagement: engagementRow(DRIFTED) });
    const desk = await deliveryDesk(pool, ENGAGEMENT_ID, NOW);
    const display = desk!.response.progress.display;
    expect(display.kind).toBe('plan_unusable');
    // The type has no `pct` on this variant; assert the value too, so a future widening
    // of the union cannot quietly reintroduce it.
    expect(Object.keys(display)).not.toContain('pct');
  });

  it('says WHICH criteria the verdict was measured against', async () => {
    const sold = fake({ engagement: engagementRow(DRIFTED) });
    expect((await deliveryDesk(sold.pool, ENGAGEMENT_ID, NOW))!.scopeBasis.criteriaFrom).toBe('scope_snapshot');

    // No usable snapshot: the verdict is against the CURRENT catalogue, which is a
    // different claim, and the response says so instead of implying the sale.
    const cat = fake({ engagement: engagementRow(null) });
    const basis = (await deliveryDesk(cat.pool, ENGAGEMENT_ID, NOW))!.scopeBasis;
    expect(basis.criteriaFrom).toBe('live_catalogue');
    expect(basis.note).toMatch(/current catalogue/i);
  });

  it('refuses to record milestone state against it, and writes nothing', async () => {
    const f = fake({ engagement: engagementRow(DRIFTED) });
    const result = await recordMilestoneState(f.pool, {
      engagementId: ENGAGEMENT_ID,
      milestoneKey: 'inputs_received',
      state: 'complete',
      blockedReason: null,
      operator: 'nik',
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('plan_unusable');
    expect(f.wrote(), 'a refused write must not have written').toHaveLength(0);
    expect(f.statements).toContain('ROLLBACK');
  });

  it('refuses a key that is not in the plan, and hands back the keys that are', async () => {
    const f = fake({ engagement: engagementRow(null) });
    const result = await recordMilestoneState(f.pool, {
      engagementId: ENGAGEMENT_ID,
      milestoneKey: 'a_milestone_nobody_sold',
      state: 'complete',
      blockedReason: null,
      operator: 'nik',
    });
    expect(result.ok === false && result.code).toBe('unknown_milestone_key');
    const detail = result.ok === false ? (result.detail as { planKeys: string[] }) : { planKeys: [] };
    expect(detail.planKeys.length, 'the refusal must show the plan it was checked against').toBeGreaterThan(0);
    expect(f.wrote()).toHaveLength(0);
  });

  it('refuses a blocked milestone with no reason — the rule the database also holds', async () => {
    const f = fake({ engagement: engagementRow(null) });
    const result = await recordMilestoneState(f.pool, {
      engagementId: ENGAGEMENT_ID,
      milestoneKey: 'inputs_received',
      state: 'blocked',
      blockedReason: null,
      operator: 'nik',
    });
    expect(result.ok === false && result.code).toBe('blocked_needs_reason');
    expect(result.ok === false && result.message).toContain('gps_milestone_blocked_needs_reason');
    expect(f.wrote(), 'refused before opening a transaction at all').toHaveLength(0);
  });

  it('records a real key against a real plan, and stores the key as the join', async () => {
    const f = fake({ engagement: engagementRow(null), milestoneUpdateHits: 1 });
    const first = (await deliveryDesk(fake({ engagement: engagementRow(null) }).pool, ENGAGEMENT_ID, NOW))!
      .response.plan.rows[0]!.milestone.key;
    const result = await recordMilestoneState(f.pool, {
      engagementId: ENGAGEMENT_ID,
      milestoneKey: first,
      state: 'complete',
      blockedReason: null,
      operator: 'nik',
    });
    expect(result.ok).toBe(true);
    const write = f.wrote()[0]!;
    expect(write).toMatch(/UPDATE gps_milestone/);
    // `done` is the DB literal for the shared `complete`; the bridge, not a ternary in
    // the handler, is what decides that.
    expect(write).toContain("'done'");
    expect(f.statements).toContain('COMMIT');
  });
});

describe('acceptance is refused, with a reason, while a review is outstanding', () => {
  it('the acceptance view names the refusal and the constraint that would also refuse it', async () => {
    const { pool } = fake({
      engagement: engagementRow(null),
      deliverables: [deliverableRow()],
    });
    const view = (await deliveryDesk(pool, ENGAGEMENT_ID, NOW))!.response.acceptance;

    expect(view.rows).toHaveLength(1);
    const row = view.rows[0]!;
    expect(row.verdict.canAccept).toBe(false);
    expect(row.verdict.state).toBe('blocked');
    expect(row.refusals.map((r) => r.code)).toContain('review_outstanding');
    expect(row.reviewRecorded).toBe(false);
    expect(view.awaitingReview).toBe(1);
    expect(view.acceptable).toBe(0);
    // The headline cites the DB constraint by name, so a refusal an operator argues
    // with points at the thing that would have stopped it anyway.
    expect(view.headline).toContain('gps_deliverable_no_acceptance_before_review');
    expect(view.gateDbConstraint).toBe('gps_deliverable_no_acceptance_before_review');
    expect(view.gateMechanism).toMatch(/does not implement the rule/);
  });

  it('the write refuses with the engine\'s whole verdict and writes nothing', async () => {
    const f = fake({ engagement: engagementRow(null), deliverables: [deliverableRow()] });
    const result = await acceptDeliverable(f.pool, { deliverableId: DELIVERABLE_ID, operator: 'nik' });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('acceptance_refused');
    const verdict = result.ok === false ? (result.detail as { reasons: Array<{ code: string }> }) : { reasons: [] };
    // Every reason, in the engine's order — hardest gate first — not a summary.
    expect(verdict.reasons[0]!.code).toBe('review_outstanding');
    expect(f.wrote(), 'a refused acceptance must not have written').toHaveLength(0);
    expect(f.statements).toContain('ROLLBACK');
  });

  it('accepts once the review is recorded, and only then', async () => {
    const f = fake({
      engagement: engagementRow(null),
      deliverables: [deliverableRow({ reviewed_by: 'nik', reviewed_at: NOW })],
    });
    const result = await acceptDeliverable(f.pool, { deliverableId: DELIVERABLE_ID, operator: 'nik' });
    expect(result.ok, result.ok === false ? result.message : '').toBe(true);
    expect(f.wrote()[0]).toMatch(/UPDATE gps_deliverable/);
    expect(f.wrote()[0]).toContain("status = 'accepted'");
    expect(f.statements).toContain('COMMIT');
  });

  it('refuses a second acceptance as an idempotence answer, not as a failure', async () => {
    const f = fake({
      engagement: engagementRow(null),
      deliverables: [deliverableRow({ status: 'accepted', accepted_at: NOW, reviewed_by: 'nik', reviewed_at: NOW })],
    });
    const result = await acceptDeliverable(f.pool, { deliverableId: DELIVERABLE_ID, operator: 'nik' });
    expect(result.ok).toBe(false);
    const detail = result.ok === false ? (result.detail as { reasons: Array<{ code: string }> }) : { reasons: [] };
    expect(detail.reasons[0]!.code).toBe('already_accepted');
    expect(f.wrote(), 'accepting twice would double-record against a payment milestone').toHaveLength(0);
  });

  it('a blocking client input keeps it refused, and the refusal names the request', async () => {
    const f = fake({
      engagement: engagementRow(null),
      deliverables: [deliverableRow({ reviewed_by: 'nik', reviewed_at: NOW })],
      evidence: [evidenceRow()],
    });
    const result = await acceptDeliverable(f.pool, { deliverableId: DELIVERABLE_ID, operator: 'nik' });
    expect(result.ok).toBe(false);
    const detail = result.ok === false ? (result.detail as { reasons: Array<{ code: string; detail: string }> }) : { reasons: [] };
    expect(detail.reasons.map((r) => r.code)).toContain('evidence_outstanding');
    expect(detail.reasons[0]!.detail, 'the operator must be able to see WHICH input').toContain(
      'audited token allocation table',
    );
    expect(f.wrote()).toHaveLength(0);
  });

  it('the chase list derives overdue against asOf and never stores it', async () => {
    const { pool } = fake({ engagement: engagementRow(null), evidence: [evidenceRow()] });
    const early = (await deliveryDesk(pool, ENGAGEMENT_ID, '2026-07-05T09:00:00.000Z'))!.response.evidence;
    expect(early.overdue, 'not yet due on the 5th').toBe(0);

    const late = (await deliveryDesk(fake({ engagement: engagementRow(null), evidence: [evidenceRow()] }).pool,
      ENGAGEMENT_ID, NOW))!.response.evidence;
    expect(late.overdue, 'overdue by the 1st of August').toBe(1);
    expect(late.rows[0]!.overdueByDays).toBeGreaterThan(20);
    expect(late.referenceNotice, 'the inertness sentence travels with the list').toMatch(/never resolves/i);
  });

  it('an outstanding request with no due date is UNMANAGED, not overdue', async () => {
    const { pool } = fake({ engagement: engagementRow(null), evidence: [evidenceRow({ due_by: null })] });
    const chase = (await deliveryDesk(pool, ENGAGEMENT_ID, NOW))!.response.evidence;
    expect(chase.unmanaged).toBe(1);
    expect(chase.overdue).toBe(0);
    expect(chase.headline).toMatch(/no due date/);
  });

  it('carries the lockout on the wire, so no surface can render this screen without it', async () => {
    const { pool } = fake({ engagement: engagementRow(null), deliverables: [deliverableRow()] });
    const lockout = (await deliveryDesk(pool, ENGAGEMENT_ID, NOW))!.response.lockout;
    expect(lockout.noClientDocumentStore).toBeTruthy();
    expect(lockout.externalReferenceIsInert).toMatch(/never resolves, retrieves or copies it/i);
    expect(lockout.enforcedBy.length).toBeGreaterThanOrEqual(3);
  });
});

describe('the translation between 0049 and the shared domain is stated, never silent', () => {
  /** Column CHECK literals, read out of the migration so the bridge cannot drift from it. */
  function statusLiterals(table: string): string[] {
    const sql = MIGRATION.replace(/^\s*--.*$/gm, ' ');
    const start = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table}`);
    expect(start, `${table} is not created by 0049 any more`).toBeGreaterThan(-1);
    const body = sql.slice(start, sql.indexOf('\n);', start));
    const m = /status[\s\S]*?CHECK\s*\(\s*status IN \(([^)]*)\)/.exec(body);
    expect(m, `no status CHECK found on ${table}`).not.toBeNull();
    return [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!);
  }

  it('every literal the database can store has a domain state, in every table', () => {
    // The failure this catches: a migration adds a status, the bridge does not learn
    // it, and every row carrying it silently becomes the fallback state.
    for (const [table, bridge] of [
      ['gps_milestone', MILESTONE_STATE_FROM_DB],
      ['gps_deliverable', DELIVERABLE_STATE_FROM_DB],
      ['gps_evidence_request', EVIDENCE_STATUS_FROM_DB],
    ] as const) {
      for (const literal of statusLiterals(table)) {
        expect(
          Object.keys(bridge),
          `${table}.status can be '${literal}' and the enum bridge in gps/deliveryDesk.ts does not map it. `
            + 'Every such row would fall back to a state nobody chose.',
        ).toContain(literal);
      }
    }
  });

  it('no lossy mapping can manufacture an acceptable deliverable', () => {
    // `canAccept` allows acceptance only from ready or delivered (delivery.ts:956), so
    // this asserts the bridge's central promise: a translation gap never invents a
    // commercial event.
    const acceptable = Object.entries(DELIVERABLE_STATE_FROM_DB)
      .filter(([, state]) => state === 'ready' || state === 'delivered')
      .map(([db]) => db);
    expect(acceptable, "only a submitted deliverable is handed over").toEqual(['submitted']);
    expect(DELIVERABLE_STATE_FROM_DB.rejected).toBe('in_progress');
    expect(DELIVERABLE_STATE_FROM_DB.cancelled).toBe('planned');
  });

  it('a row whose stored value has no domain literal is named, with its id', async () => {
    const { pool } = fake({
      engagement: engagementRow(null),
      deliverables: [deliverableRow({ status: 'cancelled' })],
    });
    const desk = (await deliveryDesk(pool, ENGAGEMENT_ID, NOW))!;
    expect(desk.unmapped).toHaveLength(1);
    const note = desk.unmapped[0]!;
    expect(note.id).toBe(DELIVERABLE_ID);
    expect(note.table).toBe('gps_deliverable');
    expect(note.storedValue).toBe('cancelled');
    expect(note.why).toMatch(/no literal in the shared union/);
    // And it is still refused, which is the half that matters commercially.
    expect(desk.response.acceptance.rows[0]!.verdict.canAccept).toBe(false);
  });

  it("a client's refusal is stored AS a refusal, never downgraded to an open request", async () => {
    // 0051_gps_evidence_refusal.sql gave 'refused' and 'partially_received' DB
    // literals. Until it existed this write was REFUSED with the missing literal
    // named — it was never quietly turned into 'open', and it still is not: the
    // bound parameter below is the whole assertion.
    const f = fake({ engagement: engagementRow(null), evidence: [evidenceRow()] });
    const result = await setEvidenceStatus(f.pool, {
      evidenceId: EVIDENCE_ID,
      status: 'refused',
      externalLocation: null,
      operator: 'nik',
    });
    expect(result.ok).toBe(true);
    expect(result.ok === true && result.value.status).toBe('refused');
    const call = f.wroteWith()[0]!;
    expect(call.sql).toMatch(/UPDATE gps_evidence_request/);
    expect(call.params[1], 'the DB literal must be the refusal itself').toBe('refused');
    expect(
      call.params,
      'a refusal stored as an open request is a delivery date slipping with no named cause',
    ).not.toContain('open');
  });

  it('a shared state with no DB literal is still refused by name, not passed through', async () => {
    // The defensive branch, exercised the only way it can be: a state the union
    // does not have yet. The cast IS the test — it proves EVIDENCE_STATUS_TO_DB is
    // a whitelist, so a sixth status added to the shared union tomorrow cannot
    // reach a CHECK constraint that has never heard of it.
    const f = fake({ engagement: engagementRow(null), evidence: [evidenceRow()] });
    const result = await setEvidenceStatus(f.pool, {
      evidenceId: EVIDENCE_ID,
      status: 'escalated_to_counsel' as EvidenceStatus,
      externalLocation: null,
      operator: 'nik',
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('unwritable_status');
    expect(result.ok === false && result.message).toMatch(/no literal there/);
    expect(f.wrote(), 'an unwritable status must not perform the UPDATE anyway').toHaveLength(0);
  });

  it('settling a request that did arrive writes the date the constraint demands', async () => {
    const f = fake({ engagement: engagementRow(null), evidence: [evidenceRow()] });
    const result = await setEvidenceStatus(f.pool, {
      evidenceId: EVIDENCE_ID,
      status: 'received',
      externalLocation: null,
      operator: 'nik',
    });
    expect(result.ok).toBe(true);
    const write = f.wrote()[0]!;
    expect(write).toContain("'satisfied'");
    expect(write, 'satisfied_iff_dated (0049:441) is an equivalence in both directions').toContain('satisfied_at');
  });

  it('every gap in the ledger says what it broke and which ALTER closes it', () => {
    expect(DELIVERY_SCHEMA_GAPS.length).toBeGreaterThanOrEqual(10);
    for (const gap of DELIVERY_SCHEMA_GAPS) {
      expect(gap.field, 'a gap with no field is not checkable').toBeTruthy();
      expect(gap.substitution.length, `${gap.field} does not say what was substituted`).toBeGreaterThan(10);
      expect(gap.consequence.length, `${gap.field} does not say what it does to the numbers`).toBeGreaterThan(20);
      expect(gap.closedBy.length, `${gap.field} does not name the change that closes it`).toBeGreaterThan(10);
    }
    // The three that change a number on screen must be there by name, because a reader
    // who does not know about them will misread the count.
    const fields = DELIVERY_SCHEMA_GAPS.map((g) => g.field).join(' | ');
    expect(fields).toMatch(/EvidenceRequest\.blocking/);
    expect(fields).toMatch(/Deliverable\.milestoneKey/);
    expect(fields).toMatch(/coordinationHoursPerWeek/);
  });

  it('the WIP view is desk-wide, and its hours are badged as placeholders', async () => {
    const { pool } = fake({
      engagement: engagementRow(null),
      deskEngagements: [
        { id: ENGAGEMENT_ID, client_id: CLIENT_ID, offer_key: OFFER.key, status: 'in_delivery', scope_snapshot: null },
        { id: 'other', client_id: 'client-2', offer_key: OFFER.key, status: 'in_delivery', scope_snapshot: null },
      ],
    });
    const wip = (await deliveryDesk(pool, ENGAGEMENT_ID, NOW))!.response.wip;
    expect(wip.load.active, 'the ceiling is his, so it counts every live engagement').toBe(2);
    expect(wip.basisIsMeasured, 'nobody has supplied a measured coordination figure').toBe(false);
    expect(wip.basisNote).toMatch(/PLACEHOLDER/);
    // Every hour attributed to the engagement that caused it, summing to the engine's
    // own total (D1) — leave-one-out, so the drivers cannot disagree with the number.
    const sum = wip.hourDrivers.reduce((t, d) => t + d.points, 0);
    expect(sum).toBe(wip.load.coordinationHoursPerWeek);
    expect(wip.hourDrivers.map((d) => d.label).join(' ')).not.toContain('UNATTRIBUTED');
    expect(wip.anotherEngagement.because, 'never a bare yes/no').toMatch(/\d/);
  });

  it('answers not-found as a value rather than an exception', async () => {
    const { pool } = fake({ engagement: null });
    expect(await deliveryDesk(pool, ENGAGEMENT_ID, NOW)).toBeNull();
  });

  it('reads not-migrated without touching a delivery table', async () => {
    const f = fake({ migrated: false });
    expect(await import('../deliveryDesk.js').then((m) => m.isDeliveryMigrated(f.pool))).toBe(false);
    expect(f.statements.every((s) => s.includes('to_regclass'))).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE CONFLICT GATE, EXTENDED TO THE SIX DELIVERY WRITES                       */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * NONE OF THE SIX WRITES 0049 ADDED CONSULTED THE ENGAGEMENT AT ALL.
 *
 * `setEngagementStatus` runs the conflict gate on `gps_engagement.status` and
 * `gps_proposal_issue` runs it before issuing, so the compliance property held for the
 * pre-delivery lifecycle. It did not hold for anything delivery-side: not one of
 * `recordMilestoneState`, `createDeliverable`, `recordDeliverableReview`,
 * `acceptDeliverable`, `requestEvidence` or `setEvidenceStatus` read the status or the
 * decision.
 *
 * Measured on a DECLINED engagement (status `cancelled`) and on one with NO check
 * (`conflict_pending`): create deliverable 201 → request evidence 201 → review 200 →
 * ACCEPT 200. That last is what this file calls "THE COMMERCIAL EVENT", the write that
 * lets a partner be paid and an invoice be raised (`0049_gps_delivery.sql:232`). So work
 * an LCX employee's services desk had been told not to do could be delivered, accepted
 * and billed.
 */
describe('no delivery write lands on a declined, unchecked or closed engagement', () => {
  const CASES: ReadonlyArray<[string, Partial<Fixture>, string]> = [
    ['a DECLINED conflict decision', { conflict: 'declined' }, 'conflict_declined'],
    ['NO conflict decision on file', { conflict: null }, 'conflict_check_missing'],
    ['a cancelled engagement', { engagement: engagementRow(null, { status: 'cancelled' }) }, 'engagement_terminal'],
    ['a collected engagement', { engagement: engagementRow(null, { status: 'collected' }) }, 'engagement_terminal'],
    ['a closed_lost engagement', { engagement: engagementRow(null, { status: 'closed_lost' }) }, 'engagement_terminal'],
  ];

  for (const [why, over, code] of CASES) {
    it(`refuses a milestone state on ${why}`, async () => {
      const f = fake({ engagement: engagementRow(null), ...over });
      const r = await recordMilestoneState(f.pool, {
        engagementId: ENGAGEMENT_ID, milestoneKey: 'inputs_received',
        state: 'complete', blockedReason: null, operator: 'nik',
      });
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.code).toBe(code);
      expect(f.wrote(), 'a refused write must not have written').toHaveLength(0);
      expect(f.statements).toContain('ROLLBACK');
    });

    it(`refuses ACCEPTANCE — the commercial event — on ${why}`, async () => {
      const f = fake({
        engagement: engagementRow(null),
        deliverables: [deliverableRow({ status: 'submitted', reviewed_by: 'nik', reviewed_at: NOW })],
        ...over,
      });
      const r = await acceptDeliverable(f.pool, { deliverableId: DELIVERABLE_ID, operator: 'nik' });
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.code).toBe(code);
      expect(f.wrote(), 'nothing may be accepted, and nothing written').toHaveLength(0);
    });

    it(`refuses an evidence status change on ${why}`, async () => {
      const f = fake({ engagement: engagementRow(null), evidence: [evidenceRow({})], ...over });
      const r = await setEvidenceStatus(f.pool, {
        evidenceId: EVIDENCE_ID, status: 'received', externalLocation: null, operator: 'nik',
      });
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.code).toBe(code);
      expect(f.wrote()).toHaveLength(0);
    });
  }

  it('names the gate in the refusal rather than saying "invalid"', async () => {
    const f = fake({ engagement: engagementRow(null), conflict: 'declined' });
    const r = await recordMilestoneState(f.pool, {
      engagementId: ENGAGEMENT_ID, milestoneKey: 'inputs_received',
      state: 'complete', blockedReason: null, operator: 'nik',
    });
    expect(r.ok === false && r.message).toMatch(/DECLINED/);
    expect(r.ok === false && r.message).toMatch(/does not proceed/);
  });

  it('still allows the writes on a cleared, live engagement', async () => {
    // The counterpart, or the gate could be satisfied by refusing everything.
    const f = fake({ engagement: engagementRow(null), conflict: 'cleared', milestoneUpdateHits: 1 });
    const r = await recordMilestoneState(f.pool, {
      engagementId: ENGAGEMENT_ID, milestoneKey: 'inputs_received',
      state: 'complete', blockedReason: null, operator: 'nik',
    });
    expect(r.ok).toBe(true);
    expect(f.wrote().length).toBeGreaterThan(0);
  });
});
