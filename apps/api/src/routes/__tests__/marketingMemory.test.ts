import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  PRECEDENT AND CRISIS, THROUGH THE REAL ROUTES — because nothing could reach them.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `packages/shared/src/marketing/precedent.ts` and `crisis.ts` are 4 388 lines of engine
 * with ZERO CALLERS before `routes/marketingMemory.ts`. An engine nothing calls is
 * decoration, so these tests run the HTTP routes rather than the functions: the engines
 * already have their own unit tests, and what was missing is the proof that a request can
 * reach them and that the payload keeps the distinctions they make.
 *
 * THE STUB BEHAVES LIKE POSTGRES, not like a mock that agrees with the caller:
 *  · `to_regclass` can answer present, absent, OR THROW — the three-state probe is the
 *    thing being tested, and a stub that only knows two states cannot test it.
 *  · rows are stored and read back, so a payload field that the route forgot to write
 *    comes back missing rather than being invented by the stub.
 *  · `seq` is assigned as `max(seq) + 1` per incident, as the SQL does.
 *
 * EACH TEST FAILS WITHOUT THE BEHAVIOUR IT NAMES. The ones that matter most:
 *  · four different absences stay four different sentences (index absent, index
 *    unreadable, corpus empty, no match) — collapse any two and the assertion fails;
 *  · an empty `notKnown` refuses AND STORES NOTHING;
 *  · `FOUR_EYES_UNACHIEVABLE` reaches the client as a stated field while the clearance
 *    is still recorded;
 *  · the library and the peer preclears are served WITHOUT TOUCHING THE POOL.
 */

type Row = Record<string, unknown>;

const db = {
  present: true,
  probeThrows: false,
  own: [] as Row[],
  incidents: [] as Row[],
  instances: [] as Row[],
  clears: [] as Row[],
};

let calls: { sql: string; params: unknown[] }[] = [];

const DAY_MS = 86_400_000;

const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  calls.push({ sql, params });
  const p = params;

  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) return { rows: [], rowCount: 0 };

  if (/to_regclass/.test(sql)) {
    if (db.probeThrows) throw new Error('connection terminated unexpectedly');
    return { rows: [{ ok: db.present }], rowCount: 1 };
  }

  /* ── the precedent index ── */
  if (/count\(\*\)::int AS n FROM marketing_own_statement/.test(sql)) {
    return { rows: [{ n: db.own.length }], rowCount: 1 };
  }
  if (/FROM marketing_own_statement\s+ORDER BY/.test(sql)) {
    const limit = Number(p[0] ?? 50);
    const rows = [...db.own]
      .sort((a, b) => Date.parse(String(b.stated_at)) - Date.parse(String(a.stated_at)))
      .slice(0, limit);
    return { rows, rowCount: rows.length };
  }
  if (/INSERT INTO marketing_own_statement/.test(sql)) {
    const statedAt = String(p[8]);
    const expires = new Date(Date.parse(statedAt) + Number(p[17]) * DAY_MS).toISOString();
    db.own.push({
      statement_uid: p[0], body: p[1], kind: p[2], question_key: p[3], polarity: p[4],
      named_timeframe: p[5], standing: p[6], supersedes: p[7], superseded_by: null,
      stated_at: statedAt, cleared_by: p[9], cleared_at: p[10], review_due_at: p[11],
      derived_from_approved_language_id: p[12], content_hash: p[13],
      subjects: JSON.parse(String(p[14])), claims: JSON.parse(String(p[15])),
      quantitative: JSON.parse(String(p[16])),
    });
    return { rows: [{ retention_expires_at: expires }], rowCount: 1 };
  }
  if (/UPDATE marketing_own_statement/.test(sql)) {
    const target = db.own.find((r) => r.statement_uid === p[1]);
    if (!target) return { rows: [], rowCount: 0 };
    target.superseded_by = p[0];
    if (target.standing === 'standing') target.standing = 'superseded';
    return { rows: [], rowCount: 1 };
  }

  /* ── the crisis room ── */
  if (/INSERT INTO marketing_crisis_incident/.test(sql)) {
    db.incidents.push({
      incident_uid: p[0], incident_type: p[1], severity: p[2], phase: p[3],
      opened_at: p[4], opened_by: p[5], first_statement_at: null, first_statement_by: null,
      first_statement_source: null, legal_implications: p[6], counsel_named: p[7],
    });
    return { rows: [], rowCount: 1 };
  }
  if (/FROM marketing_crisis_incident WHERE incident_uid/.test(sql)) {
    const row = db.incidents.find((r) => r.incident_uid === p[0]);
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }
  if (/UPDATE marketing_crisis_incident/.test(sql)) {
    const row = db.incidents.find((r) => r.incident_uid === p[0] && r.first_statement_at === null);
    if (!row) return { rows: [], rowCount: 0 };
    row.first_statement_at = p[1];
    row.first_statement_by = p[2];
    row.first_statement_source = 'operator_testimony';
    return { rows: [], rowCount: 1 };
  }
  if (/count\(\*\)::int AS n FROM marketing_crisis_statement_instance/.test(sql)) {
    return {
      rows: [{ n: db.instances.filter((r) => r.incident_uid === p[0]).length }],
      rowCount: 1,
    };
  }
  if (/INSERT INTO marketing_crisis_statement_instance/.test(sql)) {
    const forIncident = db.instances.filter((r) => r.incident_uid === p[1]);
    const seq = forIncident.reduce((max, r) => Math.max(max, Number(r.seq)), 0) + 1;
    db.instances.push({
      instance_uid: p[0], incident_uid: p[1], seq, statement_id: p[2],
      statement_version: p[3], library_version: p[4], ad_hoc: p[5], authored_by: p[6],
      authored_at: p[7], phase: p[8], body: JSON.parse(String(p[9])), content_hash: p[10],
      preconditions_acknowledged: p[11], carries_promotional_content: p[12],
      is_inside_information_disclosure: p[13],
      residual_unknowns_closed: p[14] === null ? null : JSON.parse(String(p[14])),
      supersedes: p[15],
    });
    return { rows: [], rowCount: 1 };
  }
  if (/FROM marketing_crisis_statement_instance WHERE instance_uid/.test(sql)) {
    const row = db.instances.find((r) => r.instance_uid === p[0]);
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }
  if (/INSERT INTO marketing_crisis_clearance/.test(sql)) {
    const existing = db.clears.find(
      (r) => r.instance_uid === p[0] && r.role === p[1] && r.reviewer === p[3] && r.content_hash === p[6],
    );
    if (existing) {
      existing.mode = p[2];
      existing.cleared_at = p[4];
      existing.headline_test = p[5];
      existing.comment = p[7];
      return { rows: [], rowCount: 1 };
    }
    db.clears.push({
      instance_uid: p[0], role: p[1], mode: p[2], reviewer: p[3], cleared_at: p[4],
      headline_test: p[5], content_hash: p[6], comment: p[7],
    });
    return { rows: [], rowCount: 1 };
  }
  if (/FROM marketing_crisis_clearance WHERE instance_uid/.test(sql)) {
    const rows = db.clears.filter((r) => r.instance_uid === p[0]);
    return { rows, rowCount: rows.length };
  }

  return { rows: [], rowCount: 0 };
});

const client = { query, release: vi.fn() };

vi.mock('../../db/index.js', () => ({
  getPool: () => ({ query, connect: async () => client }),
  closeDb: async () => {},
  getDb: () => { throw new Error('getDb is not used by the marketing memory routes'); },
}));

const { marketingMemoryRoutes, _resetMemoryMigrated } = await import('../marketingMemory.js');
const {
  CONTRADICTION_DEBT_DEFINITION,
  GROUPING_IS_LEXICAL_NOT_SEMANTIC,
  HOLDING_STATEMENTS,
  PRECEDENT_HOLDS_ONLY_LCX_OWN_WORDS,
} = await import('@lcx/shared');
const { createHash } = await import('node:crypto');

const PASSCODE = process.env.DESK_PASSCODE ?? 'test#1234';
const KEY = (who: string) => `${who}@lcx.com:${PASSCODE}`;
/** The shared operator key: a FOURTH principal, so an author can differ from three reviewers. */
const MACHINE = process.env.OPERATOR_API_KEY ?? 'dev-operator-key-change-me';

type Res = { status: number; body: Record<string, never> };

async function get(path: string, who = KEY('nik')): Promise<Res> {
  const res = await marketingMemoryRoutes.request(path, { headers: { 'x-api-key': who } });
  return { status: res.status, body: (await res.json()) as Record<string, never> };
}

async function post(path: string, body: unknown, who = KEY('nik')): Promise<Res> {
  const res = await marketingMemoryRoutes.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': who },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: (await res.json()) as Record<string, never> };
}

/** Data of a payload, without pretending to know the shape at runtime. */
const data = (res: Res): Record<string, never> => (res.body as { data: Record<string, never> }).data;

const iso = (offsetDays: number): string =>
  new Date(Date.now() + offsetDays * DAY_MS).toISOString();

/** Seed the index directly, so a read can be tested without depending on the write. */
function seedOwn(over: Row): void {
  db.own.push({
    statement_uid: `own:${db.own.length + 1}`,
    body: 'Withdrawals are operating normally.',
    kind: 'fact',
    question_key: null,
    polarity: 'not_a_yes_no',
    named_timeframe: null,
    standing: 'standing',
    supersedes: null,
    superseded_by: null,
    stated_at: iso(-10),
    cleared_by: 'nik',
    cleared_at: iso(-10),
    review_due_at: null,
    derived_from_approved_language_id: null,
    content_hash: 'a'.repeat(64),
    subjects: [],
    claims: [],
    quantitative: [],
    ...over,
  });
}

beforeEach(() => {
  calls = [];
  db.present = true;
  db.probeThrows = false;
  db.own = [];
  db.incidents = [];
  db.instances = [];
  db.clears = [];
  query.mockClear();
  _resetMemoryMigrated();
});

describe('precedent: four absences, four different sentences', () => {
  it('reports index_absent — not an empty result — when 0063 is unapplied', async () => {
    db.present = false;
    const res = await get('/precedent?questionKey=withdrawal_status');
    expect(res.status).toBe(200);
    const d = data(res);
    expect(d).toHaveProperty('outcome', 'index_absent');
    // The distinction the whole payload exists for: no lookup at all, not an empty one.
    expect(d).toHaveProperty('lookup', null);
    expect(d).toHaveProperty('debt', null);
    expect(d).toHaveProperty('corpus', null);
    expect(JSON.stringify(d)).toContain('0063_marketing_memory');
    expect(JSON.stringify(d)).toContain('DATA_ABSENT_NOT_ZERO');
  });

  it('reports index_unreadable when the probe throws, and does NOT remember it', async () => {
    db.probeThrows = true;
    const first = await get('/precedent');
    expect(data(first)).toHaveProperty('outcome', 'index_unreadable');

    // The defect this guards: caching an error pins the compartment into "awaiting
    // migration" for the life of the process, and the desk goes looking for a migration
    // that landed weeks ago.
    db.probeThrows = false;
    const second = await get('/precedent');
    expect(data(second)).toHaveProperty('outcome', 'corpus_empty');
  });

  it('distinguishes corpus_empty from index_absent', async () => {
    const res = await get('/precedent');
    const d = data(res);
    expect(d).toHaveProperty('outcome', 'corpus_empty');
    expect((d as unknown as { storage: { state: string } }).storage.state).toBe('present');
    expect((d as unknown as { lookup: { comparedCount: number } }).lookup.comparedCount).toBe(0);
  });

  it('distinguishes no_match from corpus_empty, and names the denominator', async () => {
    seedOwn({});
    const res = await get('/precedent?draft=qqqq%20zzzz%20vvvv');
    const d = data(res) as unknown as { outcome: string; lookup: { comparedCount: number; hits: unknown[]; refusal: { code: string } } };
    expect(d.outcome).toBe('no_match');
    expect(d.lookup.comparedCount).toBe(1);
    // Never the best near-miss: below the floor the panel shows nothing.
    expect(d.lookup.hits).toHaveLength(0);
    expect(d.lookup.refusal.code).toBe('CLAIM_LIBRARY_COVERAGE_NONE');
  });
});

describe('precedent: the hit, and what must travel with it', () => {
  it('finds the prior answer on the recorded question key', async () => {
    seedOwn({ question_key: 'withdrawal_status', body: 'Withdrawals are processing normally.' });
    const res = await get('/precedent?questionKey=withdrawal_status');
    const d = data(res) as unknown as {
      outcome: string;
      lookup: { hits: { matchBasis: string; staleness: { verdict: string } }[] };
      coverage: { standingCount: number };
    };
    expect(d.outcome).toBe('hits');
    expect(d.lookup.hits).toHaveLength(1);
    expect(d.lookup.hits[0].matchBasis).toBe('question_key');
    // A prior answer is never shown as simply "what we said": the staleness verdict rides along.
    expect(d.lookup.hits[0].staleness.verdict).toBeTruthy();
    expect(d.coverage.standingCount).toBe(1);
  });

  it('carries the lexical-not-semantic caveat on every read', async () => {
    const res = await get('/precedent?questionKey=withdrawal_status');
    expect(data(res)).toHaveProperty('groupingCaveat', GROUPING_IS_LEXICAL_NOT_SEMANTIC);
  });

  it('returns the classification whole, so ungrouped stays a visible bucket', async () => {
    const res = await get('/precedent?draft=can%20you%20listen%20to%20your%20users');
    const d = data(res) as unknown as { query: { classification: { basis: string; key: string | null }; questionKey: string | null } };
    // `listen` must not fire the `list` anchor, and a miss lands in `ungrouped` rather
    // than being assigned to the nearest key.
    expect(d.query.classification.basis).toBe('ungrouped');
    expect(d.query.classification.key).toBeNull();
    expect(d.query.questionKey).toBeNull();
  });

  it('returns an unreadable subject verbatim instead of ignoring the filter', async () => {
    const res = await get('/precedent?subject=asset:BTC&subject=nonsense');
    const d = data(res) as unknown as { query: { unparsedSubjects: string[]; subjects: unknown[] } };
    expect(d.query.unparsedSubjects).toEqual(['nonsense']);
    expect(d.query.subjects).toHaveLength(1);
  });

  it('refuses an unknown questionKey with the valid values named, before probing storage', async () => {
    db.present = false;
    const res = await get('/precedent?questionKey=not_a_key');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'VALIDATION');
    expect(JSON.stringify(res.body)).toContain('withdrawal_status');
    expect(calls.some((c) => /to_regclass/.test(c.sql))).toBe(false);
  });
});

describe('contradiction debt: exact, and the soft flags that are not it', () => {
  beforeEach(() => {
    seedOwn({ statement_uid: 'own:A', subjects: [{ kind: 'asset', symbol: 'BTC' }], polarity: 'affirms' });
    seedOwn({ statement_uid: 'own:B', subjects: [{ kind: 'asset', symbol: 'BTC' }], polarity: 'denies' });
    seedOwn({ statement_uid: 'own:C', subjects: [{ kind: 'asset', symbol: 'ETH' }], polarity: 'affirms' });
    seedOwn({ statement_uid: 'own:D', subjects: [{ kind: 'asset', symbol: 'ETH' }], polarity: 'declines_to_say' });
  });

  it('counts the yes-against-no and excludes the declined-to-say', async () => {
    const res = await get('/precedent/debt');
    const d = data(res) as unknown as {
      debt: { count: number; byAxis: Record<string, number>; softFlags: { reason: string; countedAsDebt: boolean }[] };
      definition: string;
    };
    expect(d.debt.count).toBe(1);
    expect(d.debt.byAxis.polarity).toBe(1);
    expect(d.debt.softFlags).toHaveLength(1);
    expect(d.debt.softFlags[0].reason).toBe('polarity_versus_declined_to_say');
    // The literal `false` on the flag is what stops a future edit counting it.
    expect(d.debt.softFlags[0].countedAsDebt).toBe(false);
    // The definition travels with the number, always.
    expect(d.definition).toBe(CONTRADICTION_DEBT_DEFINITION);
  });

  it('says debt is not computable rather than zero when nothing is standing', async () => {
    db.own = db.own.map((r) => ({ ...r, standing: 'retracted' }));
    const res = await get('/precedent/debt');
    const d = data(res) as unknown as { debt: { count: number; standingCompared: number }; lines: string[] };
    expect(d.debt.standingCompared).toBe(0);
    expect(d.lines[0]).toContain('not computable');
    expect(d.lines[0]).toContain('not a debt of zero');
    expect(d.debt.count).toBe(0);
  });

  it('reports a null debt figure, not zero, when the table is absent', async () => {
    db.present = false;
    const res = await get('/precedent/debt');
    expect(data(res)).toHaveProperty('debt', null);
    expect(JSON.stringify(data(res))).toContain('DATA_ABSENT_NOT_ZERO');
  });
});

describe('recording LCX own words: the write that makes the read worth having', () => {
  const good = {
    body: 'LCX is licensed in Liechtenstein and supervised by the FMA.',
    kind: 'fact',
    polarity: 'affirms',
    statedAt: iso(-1),
    subjects: ['question:regulatory_status_of_lcx'],
    questionKey: 'regulatory_status_of_lcx',
  };

  it('refuses a third-party identifier by name and stores nothing', async () => {
    const res = await post('/precedent/statement', { ...good, authorHandle: 'someone' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('rule', PRECEDENT_HOLDS_ONLY_LCX_OWN_WORDS);
    expect(JSON.stringify(res.body)).toContain('authorHandle');
    expect(db.own).toHaveLength(0);
  });

  it('hashes the text itself, attributes the clearance to the session, and dates the clock', async () => {
    const res = await post('/precedent/statement', good, KEY('monty'));
    expect(res.status).toBe(201);
    const d = data(res) as unknown as {
      statement: { contentHash: string; clearedBy: string };
      retention: { expiresAt: string; assumedDays: number; sweepImplemented: boolean };
    };
    expect(d.statement.contentHash).toBe(createHash('sha256').update(good.body, 'utf8').digest('hex'));
    expect(d.statement.clearedBy).toBe('monty');
    expect(d.retention.assumedDays).toBe(2557);
    expect(Date.parse(d.retention.expiresAt) - Date.parse(good.statedAt)).toBe(2557 * DAY_MS);
    // The honest half of the clock: an expiry is recorded and nothing sweeps on it.
    expect(d.retention.sweepImplemented).toBe(false);
    expect(db.own).toHaveLength(1);
  });

  it('refuses an unreadable statedAt rather than dating the row by the insert time', async () => {
    const res = await post('/precedent/statement', { ...good, statedAt: 'last tuesday' });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toContain('INSTANT_UNPARSEABLE');
    expect(db.own).toHaveLength(0);
  });

  it('writes the supersedes link on BOTH rows, or neither', async () => {
    seedOwn({ statement_uid: 'own:old', question_key: 'fee_question' });
    const res = await post('/precedent/statement', { ...good, supersedes: 'own:old' });
    expect(res.status).toBe(201);
    const old = db.own.find((r) => r.statement_uid === 'own:old');
    expect(old?.superseded_by).toBe((data(res) as unknown as { statement: { id: string } }).statement.id);
    expect(old?.standing).toBe('superseded');
  });

  it('rolls back when supersedes names a statement that is not in the index', async () => {
    const res = await post('/precedent/statement', { ...good, supersedes: 'own:ghost' });
    expect(res.status).toBe(400);
    expect(calls.some((c) => c.sql.trim() === 'ROLLBACK')).toBe(true);
    expect(calls.some((c) => c.sql.trim() === 'COMMIT')).toBe(false);
  });

  it('answers 503 — not 500, and not 200 — while 0063 is pending', async () => {
    db.present = false;
    const res = await post('/precedent/statement', good);
    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty('code', 'MIGRATION_PENDING');
  });
});

describe('the crisis library and the peer preclears need no database', () => {
  it('serves the holding statements with 0063 absent AND the probe throwing', async () => {
    db.present = false;
    db.probeThrows = true;
    const res = await get('/crisis/statements');
    expect(res.status).toBe(200);
    const d = data(res) as unknown as {
      entries: { statement: { id: string }; guidance: string; reviewState: string; seedsNotKnownCount: number }[];
      readableWithNoDatabase: boolean;
      cannotPublish: boolean;
      notCounselReviewed: boolean;
    };
    expect(d.entries).toHaveLength(HOLDING_STATEMENTS.length);
    expect(d.readableWithNoDatabase).toBe(true);
    expect(d.cannotPublish).toBe(true);
    expect(d.notCounselReviewed).toBe(true);
    // The point of the library: every entry seeds a NON-EMPTY not-known column, so a
    // drawn statement already satisfies the tri-slot check.
    expect(d.entries.every((e) => e.seedsNotKnownCount > 0)).toBe(true);
    // THE ASSERTION THAT MATTERS: the pool was never touched. A migration banner in
    // front of these statements at 03:00 defeats the entire point of preclearing them.
    expect(query).not.toHaveBeenCalled();
  });

  it('serves every peer-contagion preclear in one call, unknown never rendered as no', async () => {
    db.present = false;
    const res = await get('/crisis/preclears');
    expect(res.status).toBe(200);
    const d = data(res) as unknown as {
      rows: { readiness: { attribute: string; preclear: string }; preclear: unknown; gate: { allowed: boolean; refusal: { code: string } | null } }[];
      applicability: Record<string, string>;
      unknownIsNotNo: string;
    };
    expect(d.rows.length).toBe(Object.keys(d.applicability).length);
    expect(d.applicability.native_exchange_token).toBe('confirmed');
    expect(d.applicability.same_custodian).toBe('unknown');
    expect(d.unknownIsNotNo).toContain('NOT PREPARED');
    for (const row of d.rows) {
      if (row.preclear === null) {
        expect(row.gate.allowed).toBe(false);
        expect(row.gate.refusal?.code).toBe('CONTAGION_PRECLEAR_ABSENT');
      }
    }
    expect(query).not.toHaveBeenCalled();
  });
});

/* ── The incident, the clock, and the testimony that stops it ── */

async function openIncident(over: Record<string, unknown> = {}): Promise<string> {
  const res = await post('/crisis/incident', {
    incidentType: 'hack_rumour',
    severity: 'high',
    openedAt: iso(0),
    ...over,
  });
  expect(res.status).toBe(201);
  return (data(res) as unknown as { incident: { incidentId: string } }).incident.incidentId;
}

describe('the incident clock', () => {
  it('refuses to open an incident with no recorded awareness instant', async () => {
    const res = await post('/crisis/incident', { incidentType: 'outage', severity: 'medium' });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toContain('TTFS_START_NOT_RECORDED');
    expect(JSON.stringify(res.body)).toContain('unmeasured');
    expect(db.incidents).toHaveLength(0);
  });

  it('halves the budget for a run-dynamic incident and floors it at fifteen minutes', async () => {
    const id = await openIncident();
    const res = await get(`/crisis/incident/${id}/clock`);
    const d = data(res) as unknown as {
      assessment: { budget: { budgetMinutes: number }; state: string };
      suppressionSupported: boolean;
    };
    // high = 30, hack_rumour is run-dynamic, floor 15.
    expect(d.assessment.budget.budgetMinutes).toBe(15);
    expect(d.assessment.state).toBe('running');
    // The clock cannot be stopped here, and the payload says so rather than implying it.
    expect(d.suppressionSupported).toBe(false);
  });

  it('reads overdue — the loudest state — when the budget is spent and nothing was said', async () => {
    const id = await openIncident({ openedAt: iso(-1) });
    const res = await get(`/crisis/incident/${id}/clock`);
    const d = data(res) as unknown as { assessment: { state: string; sentence: string } };
    expect(d.assessment.state).toBe('overdue');
    expect(d.assessment.sentence).toContain('OVERDUE');
  });

  it('records first-statement testimony, states it did not publish, and stops the burn', async () => {
    const id = await openIncident();
    const res = await post(`/crisis/incident/${id}/first-statement`, { publishedAt: iso(0) });
    expect(res.status).toBe(201);
    const d = data(res) as unknown as {
      notAPublishPath: boolean;
      sentence: string;
      testimony: { source: string };
      incident: { clock: { assessment: { state: string } } };
    };
    expect(d.notAPublishPath).toBe(true);
    expect(d.testimony.source).toBe('operator_testimony');
    expect(d.sentence).toContain('did not publish it');
    expect(d.incident.clock.assessment.state).toBe('met');
  });

  it('reports a breach as an event when the testimony lands after the budget', async () => {
    const id = await openIncident({ openedAt: iso(-1) });
    const res = await post(`/crisis/incident/${id}/first-statement`, { publishedAt: iso(0) });
    const d = data(res) as unknown as { incident: { clock: { assessment: { state: string } } } };
    expect(d.incident.clock.assessment.state).toBe('breached');
  });

  it('will not overwrite testimony', async () => {
    const id = await openIncident();
    await post(`/crisis/incident/${id}/first-statement`, { publishedAt: iso(0) });
    const second = await post(`/crisis/incident/${id}/first-statement`, { publishedAt: iso(0) });
    expect(second.status).toBe(409);
  });

  it('refuses a publication instant before the desk became aware', async () => {
    const id = await openIncident();
    const res = await post(`/crisis/incident/${id}/first-statement`, { publishedAt: iso(-2) });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('before the desk became aware');
  });
});

/* ── Composition: the tri-slot, and the refusal that stops "FTX is fine" ── */

async function compose(
  incidentId: string,
  key = 'ad-hoc',
  over: Record<string, unknown> = {},
  who = MACHINE,
): Promise<Res> {
  return post(
    `/crisis/statements/${key}/instance`,
    {
      incidentId,
      known: ['We are aware of reports about LCX withdrawals and we are looking at it now.'],
      notKnown: ['We do not yet know the cause.'],
      nextStepAction: 'Our engineers are reviewing the withdrawal queue.',
      nextUpdateBy: iso(1),
      ...over,
    },
    who,
  );
}

describe('composing a statement', () => {
  it('REFUSES an empty not-known column and stores nothing', async () => {
    const id = await openIncident();
    const res = await compose(id, 'ad-hoc', { notKnown: [] });
    expect(res.status).toBe(422);
    const body = JSON.stringify(res.body);
    expect(body).toMatch(/NOT_KNOWN_EMPTY_ON_INITIAL_STATEMENT|CERC_NOT_KNOWN_EMPTY/);
    expect(db.instances).toHaveLength(0);
    expect(calls.some((c) => /INSERT INTO marketing_crisis_statement_instance/.test(c.sql))).toBe(false);
  });

  it('refuses a next-update commitment that is already in the past', async () => {
    const id = await openIncident();
    const res = await compose(id, 'ad-hoc', { nextUpdateBy: iso(-1) });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toContain('CERC_NEXT_UPDATE_NOT_IN_FUTURE');
    expect(db.instances).toHaveLength(0);
  });

  it('records a complete ad hoc statement with the rendered text and a content hash', async () => {
    const id = await openIncident();
    const res = await compose(id);
    expect(res.status).toBe(201);
    const d = data(res) as unknown as {
      completeness: { complete: boolean };
      renderedText: string;
      contentHash: string;
      adHoc: boolean;
      seq: number;
      cannotPublish: boolean;
    };
    expect(d.completeness.complete).toBe(true);
    expect(d.adHoc).toBe(true);
    expect(d.seq).toBe(1);
    expect(d.renderedText).toContain('WHAT WE DO NOT YET KNOW');
    expect(d.contentHash).toBe(createHash('sha256').update(d.renderedText, 'utf8').digest('hex'));
    expect(d.cannotPublish).toBe(true);
  });

  it('refuses an id that is not in the precleared library', async () => {
    const id = await openIncident();
    const res = await compose(id, 'hs-not-real');
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toContain('HOLDING_STATEMENT_UNKNOWN');
  });

  it('refuses a preclear whose preconditions have not been acknowledged', async () => {
    const id = await openIncident();
    const res = await compose(id, 'hs-are-you-solvent');
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toContain('PRECONDITION_NOT_ACKNOWLEDGED');
    expect(db.instances).toHaveLength(0);
  });

  it('seeds the tri-slot from the preclear so the operator adds to something complete', async () => {
    const id = await openIncident();
    const res = await compose(id, 'hs-are-you-solvent', {
      known: [],
      notKnown: [],
      preconditionsAcknowledged: [
        'treasury_confirmed_balances',
        'peer_claim_not_restated',
        'incident_owner_named',
      ],
    });
    expect(res.status).toBe(201);
    const d = data(res) as unknown as {
      body: { known: string[]; notKnown: string[] };
      completeness: { complete: boolean };
      statementId: string;
      statementVersion: number;
      adHoc: boolean;
    };
    // The operator supplied NOTHING and the statement is still complete.
    expect(d.body.notKnown.length).toBeGreaterThan(0);
    expect(d.body.known.length).toBeGreaterThan(0);
    expect(d.completeness.complete).toBe(true);
    expect(d.statementId).toBe('hs-are-you-solvent');
    expect(d.statementVersion).toBe(1);
    expect(d.adHoc).toBe(false);
  });

  it('refuses a statement marked as both an Art 88(1) disclosure and promotional', async () => {
    const id = await openIncident();
    const res = await compose(id, 'ad-hoc', {
      carriesPromotionalContent: true,
      isInsideInformationDisclosure: true,
    });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toContain('ART_88_1_DISCLOSURE_MIXED_WITH_MARKETING');
  });

  it('recomputes completeness on read rather than trusting the stored verdict', async () => {
    const id = await openIncident();
    const created = await compose(id);
    const instanceId = (data(created) as unknown as { instanceId: string }).instanceId;
    // The bytes have not changed; the world has. A stored `complete_at_compose: true`
    // would show a breached commitment as complete.
    const row = db.instances.find((r) => r.instance_uid === instanceId) as Record<string, unknown>;
    (row.body as { nextStep: { nextUpdateBy: string } }).nextStep.nextUpdateBy = iso(-1);

    const res = await get(`/crisis/instance/${instanceId}`);
    const d = data(res) as unknown as { completeness: { complete: boolean; refusals: { code: string }[] } };
    expect(d.completeness.complete).toBe(false);
    expect(d.completeness.refusals.map((r) => r.code)).toContain('CERC_NEXT_UPDATE_NOT_IN_FUTURE');
  });
});

/* ── The three parallel clears ── */

type Board = {
  assessment: {
    allBlockingHeld: boolean;
    distinctReviewers: number;
    benchAdmission: string | null;
    lanes: { role: string; required: boolean; state: string }[];
    refusals: { code: string }[];
    downgradedToAdvisory: string[];
  };
  fourEyesUnachievable: { code: string; sentence: string; recovery: { kind: string } } | null;
  recorded: unknown[];
  blockingRoles: string[];
  cannotPublish: boolean;
  sentence: string;
};

/** Author is the machine principal, so the three roster members are all non-authors. */
async function composed(over: Record<string, unknown> = {}): Promise<string> {
  const id = await openIncident(over);
  const res = await compose(id);
  expect(res.status).toBe(201);
  return (data(res) as unknown as { instanceId: string }).instanceId;
}

const clear = (
  instanceId: string,
  role: string,
  who: string,
  over: Record<string, unknown> = {},
): Promise<Res> =>
  post(`/crisis/instance/${instanceId}/clearance`, { role, headlineTestPassed: true, ...over }, who);

describe('the clearance board', () => {
  it('holds when three distinct reviewers clear the three parallel lanes', async () => {
    const instanceId = await composed();
    await clear(instanceId, 'reputation', KEY('nik'));
    await clear(instanceId, 'policy', KEY('monty'));
    const res = await clear(instanceId, 'sme', KEY('sam'));
    expect(res.status).toBe(201);
    const board = data(res) as unknown as Board;
    expect(board.assessment.allBlockingHeld).toBe(true);
    expect(board.assessment.distinctReviewers).toBe(3);
    expect(board.fourEyesUnachievable).toBeNull();
    expect(board.assessment.benchAdmission).toBeNull();
    expect(board.blockingRoles).toEqual(['reputation', 'policy', 'sme']);
    // Holding every clear does not authorise publication.
    expect(board.cannotPublish).toBe(true);
    expect(board.sentence).toContain('post the text by hand');
  });

  it('states FOUR_EYES_UNACHIEVABLE when one human supplies every clear, and still records it', async () => {
    const instanceId = await composed();
    await clear(instanceId, 'reputation', KEY('monty'));
    await clear(instanceId, 'policy', KEY('monty'));
    const res = await clear(instanceId, 'sme', KEY('monty'));
    const board = data(res) as unknown as Board;

    // THE ASSERTION THIS FILE EXISTS FOR. Three lanes are held, so a route that returned
    // only `allBlockingHeld` would show three green ticks over a record the engine itself
    // calls actively misleading.
    expect(board.assessment.allBlockingHeld).toBe(true);
    expect(board.fourEyesUnachievable).not.toBeNull();
    expect(board.fourEyesUnachievable?.code).toBe('FOUR_EYES_UNACHIEVABLE');
    expect(board.fourEyesUnachievable?.recovery.kind).toBe('not_recoverable');
    expect(board.assessment.refusals.map((r) => r.code)).toContain('FOUR_EYES_UNACHIEVABLE');
    expect(board.assessment.benchAdmission).toContain('wearing 3 hats');
    // The clearance was recorded rather than rejected: the admission is the finding.
    expect(board.recorded).toHaveLength(3);
    expect(db.clears).toHaveLength(3);
  });

  it('voids a clearance given by the author of the text', async () => {
    const id = await openIncident();
    const created = await compose(id, 'ad-hoc', {}, KEY('nik'));
    const instanceId = (data(created) as unknown as { instanceId: string }).instanceId;
    const res = await clear(instanceId, 'reputation', KEY('nik'));
    const board = data(res) as unknown as Board;
    expect(board.assessment.lanes.find((l) => l.role === 'reputation')?.state).toBe('void_self_cleared');
    expect(board.assessment.refusals.map((r) => r.code)).toContain('SELF_APPROVAL_FORBIDDEN');
    expect(board.assessment.allBlockingHeld).toBe(false);
  });

  it('keeps a headline-test "no" as a refusal to clear, recorded', async () => {
    const instanceId = await composed();
    const res = await clear(instanceId, 'policy', KEY('monty'), {
      headlineTestPassed: false,
      comment: 'I would not want the second sentence quoted.',
    });
    const board = data(res) as unknown as Board;
    expect(board.assessment.lanes.find((l) => l.role === 'policy')?.state).toBe('refused_on_headline_test');
    expect(board.assessment.refusals.map((r) => r.code)).toContain('CLEARANCE_HEADLINE_TEST_FAILED');
    // A substantive objection has to survive in the record, so the row exists.
    expect(db.clears).toHaveLength(1);
  });

  it('will not accept a clearance with no answer to the headline test', async () => {
    const instanceId = await composed();
    const res = await post(`/crisis/instance/${instanceId}/clearance`, { role: 'policy' }, KEY('monty'));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('comfortable seeing this as a news headline');
    expect(db.clears).toHaveLength(0);
  });

  it('refuses a clearance given against different bytes, and writes nothing', async () => {
    const instanceId = await composed();
    const res = await clear(instanceId, 'policy', KEY('monty'), { reviewedContentHash: 'b'.repeat(64) });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toContain('CLEARANCE_VOID_CONTENT_CHANGED');
    expect(db.clears).toHaveLength(0);
  });

  it('is order-independent: the arrival order of the clears cannot change the board', async () => {
    const first = await composed();
    await clear(first, 'reputation', KEY('nik'));
    await clear(first, 'policy', KEY('monty'));
    const forward = data(await clear(first, 'sme', KEY('sam'))) as unknown as Board;

    db.clears = [];
    const second = await composed();
    await clear(second, 'sme', KEY('sam'));
    await clear(second, 'policy', KEY('monty'));
    const reverse = data(await clear(second, 'reputation', KEY('nik'))) as unknown as Board;

    expect(reverse.assessment.lanes.map((l) => `${l.role}:${l.state}`)).toEqual(
      forward.assessment.lanes.map((l) => `${l.role}:${l.state}`),
    );
    expect(reverse.assessment.allBlockingHeld).toBe(forward.assessment.allBlockingHeld);
    expect(reverse.assessment.distinctReviewers).toBe(forward.assessment.distinctReviewers);
  });

  it('adds legal to the blocking lanes only when the desk flagged legal implications', async () => {
    const instanceId = await composed({ legalImplications: true });
    await clear(instanceId, 'reputation', KEY('nik'));
    await clear(instanceId, 'policy', KEY('monty'));
    const res = await clear(instanceId, 'sme', KEY('sam'));
    const board = data(res) as unknown as Board;
    expect(board.blockingRoles).toContain('legal');
    expect(board.assessment.allBlockingHeld).toBe(false);
    expect(board.assessment.refusals.map((r) => r.code)).toContain('CLEARANCE_LEGAL_REQUIRED');
  });

  it('downgrades an uninvited blocking legal hold to advisory rather than honouring it', async () => {
    const instanceId = await composed();
    await clear(instanceId, 'reputation', KEY('nik'));
    await clear(instanceId, 'policy', KEY('monty'));
    await clear(instanceId, 'sme', KEY('sam'));
    const res = await clear(instanceId, 'legal', KEY('monty'), {
      mode: 'blocking',
      comment: 'I would like more time with this.',
    });
    const board = data(res) as unknown as Board;
    // CERC read literally: an interested party cannot make itself a veto by filing a hold.
    expect(board.assessment.downgradedToAdvisory).toContain('legal');
    expect(board.assessment.allBlockingHeld).toBe(true);
    expect(board.assessment.lanes.find((l) => l.role === 'legal')?.required).toBe(false);
  });

  it('404s an unknown instance rather than inventing an empty board', async () => {
    const res = await get('/crisis/instance/stmt:ghost');
    expect(res.status).toBe(404);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 *  THE OUTBOUND GATE ON THE TWO CRISIS PATHS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `assessStatementCompleteness` reads the STRUCTURE. It cannot see a regulated promise and
 * it cannot see the state a named asset sits in, so a structurally complete incident
 * statement can still be an Art 90 or Art 66(2) problem. `marketing/outboundGate.ts` runs
 * both engines and fails closed; these are the behavioural assertions that it is actually
 * reached, that it blocks, and that a blocked composition stores nothing.
 *
 * THE STUB POOL HAS NO ABUSE REGISTER — `SELECT EXISTS (… marketing_asset_embargo)` falls
 * through to `{ rows: [] }` — which is the same state a real environment is in while 0060
 * is pending. So "names an asset" is enough to make the gate refuse here, and the reason it
 * refuses is the honest one: an unattested register is ignorance, not clearance.
 */
describe('the outbound gate on composition', () => {
  it('clears a statement that names no asset and makes no figure claim', async () => {
    const id = await openIncident();
    const res = await compose(id);
    expect(res.status).toBe(201);
    const d = data(res) as unknown as {
      outboundGate: {
        allowed: boolean; disposition: string; phase: string; assetsExtracted: string[];
        extractionCaveat: string; refusalCodes: string[]; recordedInLedger: boolean;
      };
    };
    expect(d.outboundGate.allowed).toBe(true);
    expect(d.outboundGate.disposition).toBe('clear');
    expect(d.outboundGate.phase).toBe('draft');
    expect(d.outboundGate.refusalCodes).toEqual([]);
    // The caveat travels on the CLEAR verdict. "Clear" means clear for the symbols listed.
    expect(d.outboundGate.extractionCaveat).toContain('matched lexically');
    expect(d.outboundGate.assetsExtracted).toEqual([]);
  });

  it('does not read the tri-slot HEADERS as asset symbols', async () => {
    /*
     * THE DEFECT THIS PINS, and it was measured rather than reasoned about. Gating
     * `renderStatementText(body)` fed `WHAT WE KNOW / WHAT WE DO NOT YET KNOW / WHAT
     * HAPPENS NEXT` to a lexical `[A-Z][A-Z0-9]{1,19}` extractor, which returned WHAT,
     * KNOW, DO, YET, HAPPENS and NEXT. Against an unattested register that is twelve
     * refusals, and the rendered `Next update by <ISO>` line added UNSOURCED_FIGURE on the
     * timestamp. EVERY crisis statement refused — at 02:00, which is when this compartment
     * is used at all.
     */
    const id = await openIncident();
    const res = await compose(id);
    const d = data(res) as unknown as { outboundGate: { assetsExtracted: string[] } };
    for (const phantom of ['WHAT', 'KNOW', 'DO', 'YET', 'HAPPENS', 'NEXT']) {
      expect(d.outboundGate.assetsExtracted, `${phantom} came from a section header`)
        .not.toContain(phantom);
    }
  });

  it('REFUSES a statement naming an asset the register cannot answer for, and stores nothing', async () => {
    const id = await openIncident();
    const before = db.instances.length;
    const res = await compose(id, 'ad-hoc', {
      known: ['We have paused SOL deposits while we investigate.'],
    });
    expect(res.status).toBe(422);
    const body = res.body as unknown as {
      code: string;
      refusals: { code: string }[];
      outboundGate: { allowed: boolean; assetsExtracted: string[] };
    };
    expect(body.refusals.map((r) => r.code)).toContain('EMBARGO_REGISTER_ABSENT');
    expect(body.outboundGate.allowed).toBe(false);
    expect(body.outboundGate.assetsExtracted).toContain('SOL');
    // A refused statement left in the table is one a surface can serve while the refusal
    // sits somewhere else — the route's own stated rule for its other refusals.
    expect(db.instances.length, 'the refused statement was stored anyway').toBe(before);
  });

  it('records the verdict for a refused composition, not only for a cleared one', async () => {
    // A ledger holding only refusals cannot tell "cleared" from "never checked"; one
    // holding only clears cannot show the attempt. 0062's table is probed via to_regclass,
    // which the stub answers `present`, so the INSERT is attempted on both paths.
    const id = await openIncident();
    calls = [];
    await compose(id, 'ad-hoc', { known: ['We have paused SOL deposits while we investigate.'] });
    const ledgerWrites = calls.filter((c) => /INSERT INTO marketing_outbound_gate_decision/.test(c.sql));
    expect(ledgerWrites.length).toBe(1);
    expect(ledgerWrites[0]!.params[3], 'the refusal was recorded as allowed').toBe(false);
    expect(ledgerWrites[0]!.params[1]).toBe('draft');
    // `reply_id` is null: a crisis statement is not an answer to an inbound row.
    expect(ledgerWrites[0]!.params[0]).toBeNull();
  });
});

describe('the outbound gate on clearance', () => {
  /** A stored instance whose words the gate refuses — reachable only by seeding. */
  function seedRefusableInstance(incidentId: string): string {
    const uid = 'stmt:gate-refused';
    db.instances.push({
      instance_uid: uid,
      incident_uid: incidentId,
      seq: 99,
      statement_id: null,
      statement_version: null,
      library_version: 1,
      ad_hoc: true,
      authored_by: 'someone-else',
      authored_at: iso(0),
      phase: 'first_hour',
      body: {
        known: ['We have paused SOL deposits while we investigate.'],
        notKnown: ['We do not yet know the cause.'],
        nextStep: { action: 'Engineers are reviewing the queue.', nextUpdateBy: iso(1) },
        empathy: null,
        withheld: null,
      },
      content_hash: 'a'.repeat(64),
      preconditions_acknowledged: [],
      carries_promotional_content: false,
      is_inside_information_disclosure: false,
      residual_unknowns_closed: null,
      supersedes: null,
    });
    return uid;
  }

  it('carries the verdict on the board of a clear it recorded', async () => {
    const instanceId = await composed();
    const res = await clear(instanceId, 'reputation', KEY('nik'));
    expect(res.status).toBe(201);
    const board = data(res) as unknown as {
      outboundGate: { allowed: boolean; phase: string; extractionCaveat: string };
    };
    expect(board.outboundGate.allowed).toBe(true);
    // 'clearance', not 'draft': the ledger row says which act it was.
    expect(board.outboundGate.phase).toBe('clearance');
    expect(board.outboundGate.extractionCaveat).toContain('matched lexically');
  });

  it('REFUSES a positive clear over text the gate refuses, and writes no clearance', async () => {
    const incidentId = await openIncident();
    const uid = seedRefusableInstance(incidentId);
    const before = db.clears.length;
    const res = await clear(uid, 'reputation', KEY('nik'));
    expect(res.status).toBe(422);
    const body = res.body as unknown as { code: string; refusals: { code: string }[] };
    expect(body.code).toBe('MARKETING_OUTBOUND_REFUSED');
    expect(body.refusals.map((r) => r.code)).toContain('EMBARGO_REGISTER_ABSENT');
    expect(db.clears.length, 'a clear was recorded over refused text').toBe(before);
  });

  it('still records a headline-test OBJECTION over the same refused text', async () => {
    /*
     * THE ASYMMETRY, ASSERTED. A `headlineTestPassed: false` row is a reviewer's
     * substantive objection. Refusing it because the gate also refuses would stop the desk
     * recording a problem it has already found — strictly worse than the risk it avoids,
     * and it would leave the board silent exactly where it should be loudest.
     */
    const incidentId = await openIncident();
    const uid = seedRefusableInstance(incidentId);
    const before = db.clears.length;
    const res = await clear(uid, 'reputation', KEY('nik'), { headlineTestPassed: false });
    expect(res.status).toBe(201);
    expect(db.clears.length).toBe(before + 1);
    const board = data(res) as unknown as {
      outboundGate: { allowed: boolean; refusalCodes: string[] };
      assessment: { lanes: { role: string; state: string }[] };
    };
    // The board says the words were refused too, rather than showing only the lane state.
    expect(board.outboundGate.allowed).toBe(false);
    expect(board.outboundGate.refusalCodes).toContain('EMBARGO_REGISTER_ABSENT');
    expect(board.assessment.lanes.find((l) => l.role === 'reputation')!.state)
      .toBe('refused_on_headline_test');
  });

  it('reports outboundGate: null on a READ, which is not a clear verdict', async () => {
    const instanceId = await composed();
    const res = await get(`/crisis/instance/${instanceId}`);
    const d = data(res) as unknown as { outboundGate: unknown; clearance: { outboundGate: unknown } };
    expect(d.outboundGate).toBeNull();
    expect(d.clearance.outboundGate).toBeNull();
  });
});
