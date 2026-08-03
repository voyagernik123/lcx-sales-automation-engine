import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE TWELVE PROCESS METRICS, AND THE LOOP — WHAT MAY NEVER BE RENDERED.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * There is no X credential in this system and never will be, so impressions, reach,
 * follower delta, engagement rate, click-through, share of voice and audience sentiment
 * have no denominator and cannot be computed honestly at all. The ceiling is not a policy
 * that a future panel might relax; it is asserted here against the real payload with
 * `assertHonestPayload`, which fails on the FIELD NAME. A tile added three months from now
 * fails this test before it renders.
 *
 * WHAT EACH TEST WOULD CATCH:
 *  · a forbidden metric name appearing anywhere in the metrics or loop payload.
 *  · an absent migration reported as a zero instead of a refusal naming the migration —
 *    doctrine rule 3, and the difference between "nothing happened" and "we cannot see".
 *  · a suppressed rate (n below the minimum) being conflated with an absent one.
 *  · a metric silently dropped: `metricsDefined` is the vocabulary and `metricsServed` is
 *    what this response actually answered, so a missing one is visible rather than absent.
 *  · the own-statement columns not reaching the engines — asserted through the numerators,
 *    which only come out right if `derived_from_approved_language_id`, `quantitative`,
 *    `question_key` and `review_due_at` were all mapped.
 *  · `GET /loop` 404ing or emptying at n=0 instead of answering with the verdict.
 */

let tables = { queue: true, gate: true, memory: true };
let gateRows: Record<string, unknown>[] = [];
let statementRows: Record<string, unknown>[] = [];
let closureRows: Record<string, unknown>[] = [];
let instanceRows: Record<string, unknown>[] = [];
let clearanceRows: Record<string, unknown>[] = [];
let incidentRows: Record<string, unknown>[] = [];

const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
  if (/to_regclass/.test(sql) && /marketing_own_statement/.test(sql)) {
    return { rows: [{ queue: tables.queue, gate: tables.gate, memory: tables.memory }], rowCount: 1 };
  }
  if (/to_regclass/.test(sql)) return { rows: [{ ok: tables.queue }], rowCount: 1 };
  if (/FROM marketing_outbound_gate_decision/.test(sql)) return { rows: gateRows, rowCount: gateRows.length };
  if (/FROM marketing_own_statement/.test(sql)) return { rows: statementRows, rowCount: statementRows.length };
  if (/FROM object_actions/.test(sql)) return { rows: closureRows, rowCount: closureRows.length };
  if (/FROM marketing_crisis_statement_instance i/.test(sql)) return { rows: instanceRows, rowCount: instanceRows.length };
  if (/FROM marketing_crisis_clearance/.test(sql)) return { rows: clearanceRows, rowCount: clearanceRows.length };
  if (/FROM marketing_crisis_incident/.test(sql)) return { rows: incidentRows, rowCount: incidentRows.length };
  return { rows: [], rowCount: 0 };
});

vi.mock('../../db/index.js', () => ({
  getPool: () => ({ query, connect: async () => ({ query, release: vi.fn() }) }),
  closeDb: async () => {},
  getDb: () => { throw new Error('getDb is not used by the gates routes'); },
}));

const { marketingGatesRoutes } = await import('../marketingGates.js');
const { FORBIDDEN_METRIC_FIELD_NAMES, assertHonestPayload, PROCESS_METRIC_KEYS, REFUSED_METRICS } = await import('@lcx/shared');

const PASSCODE = process.env.DESK_PASSCODE ?? 'test#1234';
const AUTH = { 'x-api-key': `nik@lcx.com:${PASSCODE}` };

async function get(path: string) {
  const res = await marketingGatesRoutes.request(path, { headers: AUTH });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3_600_000).toISOString();

/** One fully populated `marketing_own_statement` row. Every column the mapper reads. */
const statement = (over: Record<string, unknown> = {}) => ({
  statement_uid: 'st-1',
  body: 'Withdrawals are processing normally as of today.',
  kind: 'fact',
  question_key: 'withdrawal_status',
  polarity: 'affirms',
  named_timeframe: null,
  standing: 'standing',
  supersedes: null,
  superseded_by: null,
  stated_at: daysAgo(3),
  cleared_by: 'nik@lcx.com',
  cleared_at: daysAgo(3),
  review_due_at: daysAgo(1),
  derived_from_approved_language_id: 'lang-7',
  content_hash: 'a'.repeat(64),
  subjects: [],
  claims: [],
  quantitative: [{ figure: '3 hours', sourceRef: 'ops dashboard 2026-08-01' }],
  ...over,
});

beforeEach(() => {
  tables = { queue: true, gate: true, memory: true };
  gateRows = [];
  statementRows = [];
  closureRows = [];
  instanceRows = [];
  clearanceRows = [];
  incidentRows = [];
  query.mockClear();
});

describe('GET /metrics — the honesty ceiling', () => {
  /**
   * WOULD CATCH: a reach, impressions, engagement-rate or sentiment field appearing anywhere
   * in the payload. `assertHonestPayload` walks the whole object and objects to the NAME, so
   * this holds even if a future field is populated with something defensible.
   */
  it('contains no field a denominator would be needed for', async () => {
    statementRows = [statement()];
    const res = await get('/metrics');
    expect(res.status).toBe(200);
    expect(assertHonestPayload(res.body.data)).toBeNull();
    /*
     * A SECOND, INDEPENDENT WALK OVER THE KEYS, because the assertion above is a function
     * this payload could in principle stop being passed to. This one cannot be routed
     * around: it enumerates every object key at every depth of the real response and checks
     * it against the forbidden list. Note it checks KEYS and not values — `impressions`
     * appears as a VALUE, on purpose, inside `refusedMetrics`, which is the refusal being
     * rendered where the tile would have been.
     */
    const keys = new Set<string>();
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (v !== null && typeof v === 'object') {
        for (const [k, child] of Object.entries(v)) { keys.add(k); walk(child); }
      }
    };
    walk(res.body.data);
    for (const forbidden of FORBIDDEN_METRIC_FIELD_NAMES) expect(keys).not.toContain(forbidden);
    expect(keys.size).toBeGreaterThan(50);
  });

  /**
   * WOULD CATCH: the refused metrics being quietly omitted rather than rendered as typed
   * refusals where the tile would have been — the difference between a dashboard that is
   * missing things and an instrument that says what it cannot know.
   */
  it('renders every unobservable metric as a refusal with a reason', async () => {
    const res = await get('/metrics');
    const keys = Object.keys(REFUSED_METRICS);
    expect(res.body.data.refusedMetrics).toHaveLength(keys.length);
    for (const row of res.body.data.refusedMetrics) {
      expect(keys).toContain(row.key);
      expect(row.reason.length).toBeGreaterThan(20);
      expect(row.refusal.code).toBe('METRIC_NOT_OBSERVABLE');
      expect(typeof row.substitute).toBe('string');
    }
  });

  /**
   * WOULD CATCH THE ZERO. An absent migration must name itself, not report 0% or 0 items.
   * This is the one failure that looks identical to good news on a chart.
   */
  it('refuses every metric whose table is absent, naming the migration, never a zero', async () => {
    tables = { queue: false, gate: false, memory: false };
    const res = await get('/metrics');
    expect(res.status).toBe(200);
    for (const key of ['refusalsByCode', 'preclearedDerivation', 'claimProvenance', 'ignoreWithRationale', 'notKnownNonEmpty', 'clearanceLatency', 'timeToFirstStatement', 'nextUpdateBreaches', 'contradictionDebt', 'lineStaleness', 'questionCoverage']) {
      const figure = res.body.data[key];
      expect(figure.kind).toBe('absent');
      expect(figure.refusal.code).toBe('DATA_ABSENT_NOT_ZERO');
      expect(figure.refusal.matched).toMatch(/^00\d\d_marketing/);
      expect(figure).not.toHaveProperty('value');
    }
    expect(res.body.data.storage.queue).toBe('absent');
    expect(res.body.data.storage.gateLedger).toBe('absent');
    expect(res.body.data.storage.memory).toBe('absent');
    expect(res.body.data.metricsServed).not.toContain('contradiction_debt');
  });

  /**
   * WOULD CATCH: a suppressed rate being reported as absent, or an absent one as suppressed.
   * With records present and n below the minimum, the Figure is MEASURED and the percentage
   * inside it is withheld with its own sentence — three states, not two.
   */
  it('distinguishes a suppressed rate from an absent one', async () => {
    statementRows = [statement()];
    const res = await get('/metrics');
    const precleared = res.body.data.preclearedDerivation;
    expect(precleared.kind).toBe('measured');
    expect(precleared.value.pct).toBeNull();
    expect(precleared.value.suppressed).toBe(true);
    expect(precleared.value.numerator).toBe(1);
    expect(precleared.value.denominator).toBe(1);
    expect(precleared.value.suppressionReason).toMatch(/below the stated minimum/i);
  });

  /**
   * WOULD CATCH: the own-statement columns not reaching the engines. Only a mapping that
   * populated `derived_from_approved_language_id` gives a numerator of 1 here, and only one
   * that populated `quantitative[].sourceRef` gives a sourced assertion.
   */
  it('carries the statement columns through to the derivation and provenance numerators', async () => {
    statementRows = [statement(), statement({ statement_uid: 'st-2', derived_from_approved_language_id: null, quantitative: [{ figure: '9%', sourceRef: null }] })];
    const res = await get('/metrics');
    expect(res.body.data.preclearedDerivation.value.numerator).toBe(1);
    expect(res.body.data.preclearedDerivation.value.denominator).toBe(2);
    expect(res.body.data.claimProvenance.value.numerator).toBe(1);
    expect(res.body.data.claimProvenance.value.denominator).toBe(2);
    /* `question_key` reached the coverage metric, so the question is covered. */
    expect(res.body.data.questionCoverage.value.covered).toBeGreaterThan(0);
  });

  /**
   * WOULD CATCH: an unrecognised stored refusal code being counted, which makes
   * `refusalCodeFrequency`'s never-fired list unreadable — and that list is the only honest
   * read on whether the gates are load-bearing or ornamental.
   */
  it('excludes a stored code that is not in the refusal vocabulary, and says how many', async () => {
    gateRows = [{ id: 1, reply_id: 7, refusal_codes: ['ART_66_3_RISK_WARNING_MISSING', 'NOT_A_REAL_CODE'], created_at: daysAgo(1) }];
    const res = await get('/metrics');
    expect(res.body.data.refusalsByCode.value.total).toBe(1);
    expect(res.body.data.refusalsByCode.value.rows[0].code).toBe('ART_66_3_RISK_WARNING_MISSING');
    expect(res.body.data.lines.join(' ')).toMatch(/1 stored refusal code\(s\).*not members/i);
    expect(res.body.data.refusalsByCode.value.neverFiredMeaning.length).toBeGreaterThan(20);
  });

  /** WOULD CATCH: a metric quietly dropped from the response with nothing saying so. */
  it('reports the whole vocabulary, what is implemented, and what it actually served', async () => {
    statementRows = [statement()];
    const res = await get('/metrics');
    expect(res.body.data.metricsDefined).toEqual([...PROCESS_METRIC_KEYS]);
    for (const key of PROCESS_METRIC_KEYS) expect(res.body.data.metricsImplemented).toContain(key);
    expect(res.body.data.metricsNotImplemented).toEqual([]);
    expect(res.body.data.metricsServed.length).toBeGreaterThan(0);
    for (const key of res.body.data.metricsServed) expect(PROCESS_METRIC_KEYS).toContain(key);
  });

  /**
   * WOULD CATCH: retractions being fabricated from a `standing` column. A standing is a
   * state; a retraction is an event with a date, a reason and a supersede pair, and none of
   * those columns exist.
   */
  it('says out loud that no retraction records exist, rather than reporting none', async () => {
    statementRows = [statement({ standing: 'retracted' })];
    const res = await get('/metrics');
    expect(res.body.data.retractions.kind).toBe('measured');
    expect(res.body.data.retractions.value.linkedRetractions.kind).toBe('absent');
    expect(res.body.data.retractions.value.linkedRetractions.refusal.code).toBe('DATA_ABSENT_NOT_ZERO');
  });

  /**
   * WOULD CATCH: the notKnown check passing on whitespace, which would flatter the desk on
   * the one metric that tracks over-reassurance.
   */
  it('does not count a whitespace notKnown line as a statement of what was unknown', async () => {
    instanceRows = [
      { instance_uid: 'i-1', incident_uid: 'inc-1', seq: 1, phase: 'initial', authored_by: 'nik', authored_at: daysAgo(2), body: { notKnown: ['   '] }, next_authored_at: null },
      { instance_uid: 'i-2', incident_uid: 'inc-2', seq: 1, phase: 'initial', authored_by: 'nik', authored_at: daysAgo(2), body: { notKnown: ['We do not yet know the cause.'] }, next_authored_at: null },
    ];
    const res = await get('/metrics');
    expect(res.body.data.notKnownNonEmpty.value.numerator).toBe(1);
    expect(res.body.data.notKnownNonEmpty.value.denominator).toBe(2);
  });

  /** WOULD CATCH: an unbounded window quietly reporting across the retention boundary. */
  it('declares the retention truncation in the frame, and refuses a nonsense window', async () => {
    const res = await get('/metrics');
    expect(res.body.data.frame.source).toBe('own_record');
    expect(res.body.data.frame.doesNotCapture.join(' ')).toMatch(/retention boundary/i);
    expect(res.body.data.frame.knownBiases.join(' ')).toMatch(/upper bound on the lane/i);
    const bad = await get('/metrics?days=0');
    expect(bad.status).toBe(400);
    expect(bad.body.field).toBe('days');
  });
});

describe('GET /loop', () => {
  /**
   * WOULD CATCH: an empty panel or a 404 at n=0. "This desk has recorded no outcomes" is a
   * finding a review can act on; a blank screen is not, and a 404 reads as a broken route.
   */
  it('answers 200 with the verdict when nothing was recorded', async () => {
    const res = await get('/loop');
    expect(res.status).toBe(200);
    expect(res.body.data.verdictAtZero).toMatch(/no outcomes/i);
    expect(res.body.data.lines.length).toBeGreaterThan(0);
  });

  /**
   * WOULD CATCH: the loop becoming a scoreboard. `refusesToRank` is the literal `true` and
   * travels whole, so ranking angles would require changing the engine's type.
   */
  it('refuses to rank, and carries the no-change finding rather than a blank section', async () => {
    statementRows = [statement()];
    gateRows = [{ id: 1, reply_id: null, refusal_codes: ['ART_66_3_RISK_WARNING_MISSING'], created_at: daysAgo(1) }];
    const res = await get('/loop');
    expect(res.body.data.verdictAtZero).toBeNull();
    expect(res.body.data.report.value.refusesToRank).toBe(true);
    expect(res.body.data.report.value.producedNoChange).toBe(true);
    expect(res.body.data.noChangeWarning).toMatch(/decoration|change/i);
    expect(assertHonestPayload(res.body.data)).toBeNull();
  });

  /**
   * WOULD CATCH: the weekly block rendering off records that do not exist. It is a printable
   * artefact and a printed rate with no denominator behind it is the failure mode M8 exists
   * to prevent.
   */
  it('withholds the weekly block when the memory tables are absent', async () => {
    tables = { ...tables, memory: false };
    const res = await get('/loop');
    expect(res.body.data.wbr.kind).toBe('absent');
    expect(res.body.data.wbr.refusal.matched).toBe('0063_marketing_memory.sql');
    expect(res.body.data.lines.join(' ')).toMatch(/weekly block is withheld/i);
  });

  it('composes for the Monday of the current week', async () => {
    const res = await get('/loop');
    expect(res.body.data.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${res.body.data.weekStart}T00:00:00.000Z`).getUTCDay()).toBe(1);
  });
});
