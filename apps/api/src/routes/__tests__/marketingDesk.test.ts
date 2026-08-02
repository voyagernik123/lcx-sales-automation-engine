import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE DESK ROUTER, THROUGH THE REAL ROUTES.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Four engines — `regime.ts`, `triage.ts`, `adoption.ts`, `deskMode.ts` — had 5,000 lines
 * of tests and NO CALLER in `apps/api/src`. Every test in this file therefore drives the
 * HTTP route rather than the engine: the engines are already tested, and what was never
 * tested is that a request can reach them, that the refusals survive the trip, and that a
 * refused write leaves nothing behind.
 *
 * WHAT EACH TEST WOULD CATCH is stated at the test, and each one fails if the behaviour is
 * removed rather than if the wording changes:
 *
 *  · the ignore-without-rationale refusal, AND that nothing was written when it fired —
 *    a 422 that had already inserted the ledger row would pass a status-code assertion.
 *  · the Art 7 arithmetic reaching the response with its shortfall AND its remedy.
 *  · a quarantined target refusing an adoption, and a graded provenance with no
 *    corroboration being refused at the door.
 *  · the Art 94 working-day ceiling, computed against a supplied calendar.
 *  · a suspended desk refusing all three outbound acts and saying so.
 *  · the mode write taking the advisory lock inside a transaction.
 *  · an unreadable ledger row failing CLOSED — the one wrong answer here is "normal".
 *
 * The stub pool behaves like Postgres for the shapes that matter: `object_actions` is a
 * real in-memory append-only array, so the ledger read in one request sees what the write
 * in the previous request appended, which is the only way to test "the mode persists".
 */

/* ── the fake database ───────────────────────────────────────────────────── */

interface LedgerRow { id: string; subject_type: string; subject_id: string; action: string; params: unknown; result: unknown; actor: string; created_at: string }

let migrated = true;
let ledger: LedgerRow[] = [];
let replyRow: Record<string, unknown> | null = null;
let corpus: Record<string, unknown>[] = [];
let calls: { sql: string; params: readonly unknown[] }[] = [];
let nextId = 1;

const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
  calls.push({ sql, params });

  if (/to_regclass/.test(sql)) return { rows: [{ ok: migrated }], rowCount: 1 };
  if (/^BEGIN|^COMMIT|^ROLLBACK/.test(sql.trim())) return { rows: [], rowCount: 0 };
  if (/pg_advisory_xact_lock/.test(sql)) return { rows: [{}], rowCount: 1 };

  if (/INSERT INTO object_actions/.test(sql)) {
    const row: LedgerRow = {
      id: `led-${String(nextId++)}`,
      subject_type: String(params[0]),
      subject_id: String(params[1]),
      action: String(params[2]),
      params: JSON.parse(String(params[3])),
      result: JSON.parse(String(params[4])),
      actor: String(params[5]),
      // Monotonic, so `created_at DESC, id DESC` is deterministic in the stub too.
      created_at: new Date(Date.UTC(2026, 7, 3, 9, nextId)).toISOString(),
    };
    ledger.push(row);
    return { rows: [{ id: row.id, created_at: row.created_at }], rowCount: 1 };
  }
  if (/FROM object_actions/.test(sql)) {
    const rows = ledger
      .filter((r) => r.subject_type === String(params[0]) && r.subject_id === String(params[1]) && r.action === String(params[2]))
      .sort((a, b) => (a.created_at === b.created_at ? b.id.localeCompare(a.id) : b.created_at.localeCompare(a.created_at)))
      .slice(0, Number(params[3]));
    return { rows, rowCount: rows.length };
  }

  if (/SELECT id, author_handle, body, x_post_id FROM marketing_x_reply/.test(sql)) {
    return { rows: replyRow === null ? [] : [replyRow], rowCount: replyRow === null ? 0 : 1 };
  }
  if (/SELECT author_handle, body, x_post_id, received_at FROM marketing_x_reply/.test(sql)) {
    return { rows: corpus, rowCount: corpus.length };
  }
  if (/UPDATE marketing_x_reply/.test(sql)) return { rows: [], rowCount: 1 };
  return { rows: [], rowCount: 0 };
});

const client = { query, release: vi.fn() };

vi.mock('../../db/index.js', () => ({
  getPool: () => ({ query, connect: async () => client }),
  closeDb: async () => {},
  getDb: () => { throw new Error('getDb is not used by the desk routes'); },
}));

const { marketingDeskRoutes } = await import('../marketingDesk.js');
const { _resetMigrated } = await import('../../marketing/service.js');
const { ART_7_LINK_TO_COMPLIANT_PAGE } = await import('@lcx/shared');

const PASSCODE = process.env.DESK_PASSCODE ?? 'test#1234';
const AUTH = { 'Content-Type': 'application/json', 'x-api-key': `nik@lcx.com:${PASSCODE}` };

async function post(path: string, body: unknown) {
  const res = await marketingDeskRoutes.request(path, {
    method: 'POST', headers: AUTH, body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}
async function get(path: string) {
  const res = await marketingDeskRoutes.request(path, { headers: AUTH });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const ledgerWrites = (action: string) =>
  calls.filter((c) => /INSERT INTO object_actions/.test(c.sql) && c.params[2] === action);
const statusWrites = () => calls.filter((c) => /UPDATE marketing_x_reply/.test(c.sql));

beforeEach(() => {
  calls = [];
  ledger = [];
  nextId = 1;
  migrated = true;
  replyRow = { id: 7, author_handle: 'stranger', body: 'LCX is insolvent, get out now', x_post_id: 'p1' };
  corpus = [];
  query.mockClear();
  _resetMigrated();
});

/* ── bodies ──────────────────────────────────────────────────────────────── */

const asset = (over: Record<string, unknown> = {}) => ({
  asset: 'ABC', kind: 'other_crypto_asset', treatment: 'promotes_offer',
  lcxAdmission: 'admitted', admittedOnAnotherVenue: 'unknown', embargo: 'clear',
  whitePaper: { kind: 'published', publishedAt: '2026-01-01T00:00:00.000Z' },
  reliesOnArt4Exemption: false, lcxActsForIssuer: false, authorHolding: 'declared_none',
  ...over,
});

const regimeBody = (over: Record<string, unknown> = {}) => ({
  verb: 'original', surface: 'original_post',
  body: 'ABC is now available. Buy it on LCX today.',
  targetBody: null, purpose: 'offer_or_listing_promotion',
  assets: [asset()], products: [],
  firstPartyLinkPresent: true, citesOwnRegulatoryStatus: false, consideration: 'none',
  authorAccount: 'lcx_official', employmentRelationshipDisclosed: false,
  advantageClaims: [], authorisedServices: ['operation of a trading platform'],
  art7Role: 'offeror',
  art7Disclosure: {
    whitePaperPublishedStatement: 'A crypto-asset white paper has been published.',
    websiteAddress: 'https://lcx.com/wp', telephone: '+423 000 0000', email: 'wp@lcx.com',
  },
  addressedTo: ['li'], excludedFrom: [],
  ...over,
});

const triageBody = (over: Record<string, unknown> = {}) => ({
  verifiability: 'verifiable_factual',
  reach: {
    current: { value: 'trending', confidence: 'M', basis: 'quoted by three accounts we can see' },
    previous: null, previousAt: null,
  },
  impacts: { reputation: { value: 'medium', confidence: 'M', basis: 'two customers asked about it' } },
  supportingGrades: ['M'],
  startedAt: '2026-08-03T08:00:00.000Z', firstStatementAt: null, suppression: null,
  ...over,
});

const CALENDAR = {
  jurisdiction: 'li', weekend: [0, 6], holidays: ['2026-08-15'],
  coversFrom: '2026-01-01', coversTo: '2026-12-31',
  source: 'Liechtenstein public holidays, Amt für Justiz list 2026',
};

/**
 * THE DEFAULT SUSPENSION IS AN ART 94(1)(p) PROHIBITION, and the choice is not arbitrary:
 * (p) states no time limit, so `expiresAt` is null, the phase is `unbounded`, and the desk
 * is shut with no dependence on what the wall clock says when this file runs. It is also
 * the branch most systems omit and then meet in production.
 */
const suspensionBody = (over: Record<string, unknown> = {}) => ({
  to: { kind: 'suspended_by_authority' },
  reason: 'FMA order served on the desk this morning; nothing goes out.',
  byRoles: ['legal'],
  order: {
    power: 'art_94_1_p_prohibit', authority: 'FMA Liechtenstein', orderRef: 'FMA-2026-4471',
    effectiveFrom: '2026-07-01T00:00:00.000Z', statedEndAt: null,
    groundsStated: 'Suspected infringement of Art 7(1) in a listing promotion.',
  },
  calendar: CALENDAR,
  ...over,
});

/**
 * An Art 94(1)(q) order — the only limb with a statutory ceiling, and therefore the only
 * one whose end date is arithmetic rather than transcription.
 */
const qOrderBody = (over: Record<string, unknown> = {}) => ({
  to: { kind: 'suspended_by_authority' },
  reason: 'FMA cease-and-suspend order, 30 working days, recorded on receipt.',
  byRoles: ['legal'],
  order: {
    power: 'art_94_1_q', authority: 'FMA Liechtenstein', orderRef: 'FMA-2026-4471',
    effectiveFrom: '2026-07-01T00:00:00.000Z', statedEndAt: '2026-08-11T00:00:00.000Z',
    groundsStated: 'Suspected infringement of Art 7(1) in a listing promotion.',
  },
  calendar: CALENDAR,
  ...over,
});

/* ══════════════════════════════════════════════════════════════════════════ */

describe('POST /regime — the classifier has a caller', () => {
  it('answers with the regimes, and does not 500', async () => {
    const res = await post('/regime', regimeBody());
    expect(res.status).toBe(200);
    expect(res.body.data.regimes).toContain('casp_conduct');
    expect(res.body.data.regimes).toContain('offer_promo');
  });

  it('carries the Art 7 shortfall IN CHARACTERS and the link-to-a-compliant-page remedy', async () => {
    // The mandated Art 7(1)(d)+(e) text is ~330 characters against X's 280-character
    // ceiling. If `art7Fit` were dropped, or the remedy left for a screen to invent, the
    // operator would be told "does not fit" with no number and no alternative.
    const res = await post('/regime', regimeBody());
    const fit = res.body.data.art7Fit;
    expect(fit).not.toBeNull();
    expect(fit.fits).toBe(false);
    expect(fit.shortfallChars).toBeGreaterThan(0);
    expect(fit.mandatedAloneExceedsLimit).toBe(true);
    expect(fit.limitChars).toBe(280);
    expect(fit.remedy).toBe(ART_7_LINK_TO_COMPLIANT_PAGE);
  });

  it('refuses rather than estimating when the mandated contact facts are absent', async () => {
    const res = await post('/regime', regimeBody({ art7Disclosure: null }));
    expect(res.status).toBe(200);
    expect(res.body.data.art7Fit.missingMandatedFacts.length).toBeGreaterThan(0);
    expect(res.body.data.art7Fit.refusalCode).toBe('ART_7_BOILERPLATE_DOES_NOT_FIT');
    expect(res.body.data.refusalCodes).toContain('ART_7_BOILERPLATE_DOES_NOT_FIT');
  });

  it('names the valid values on a bad vocabulary field', async () => {
    const res = await post('/regime', regimeBody({ verb: 'retweet' }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.field).toBe('verb');
    expect(res.body.validValues).toContain('repost');
  });

  it('does not let an omitted authorised-service list read as "authorised for nothing"', async () => {
    // `null` is a NAMED GAP, not an empty list. The engine raises it on the advice branch,
    // where the question "are we even authorised to do this?" has consequences — so the
    // test drives the branch rather than asserting the parse in the abstract.
    const personalised = {
      personalisation: { personalised: true, basis: 'names the customer and their position', foundBy: 'claim gate' },
    };
    const supplied = await post('/regime', regimeBody(personalised));
    const absent = await post('/regime', regimeBody({ ...personalised, authorisedServices: undefined }));
    expect(supplied.body.data.refusalCodes).toContain('ART_81_PERSONALISED_RECOMMENDATION');
    expect(supplied.body.data.refusalCodes).not.toContain('AUTHORISED_SERVICE_LIST_ABSENT');
    expect(absent.body.data.refusalCodes).toContain('AUTHORISED_SERVICE_LIST_ABSENT');
  });
});

describe('POST /triage/assess — the RESIST 2 reading', () => {
  it('routes an opinion away from the debunk path', async () => {
    const res = await post('/triage/assess', triageBody({ verifiability: 'opinion' }));
    expect(res.status).toBe(200);
    expect(res.body.data.opinionGate.debunkEligible).toBe(false);
    expect(res.body.data.opinionGate.inScopeAsDisinformation).toBe(false);
  });

  it('derives the tier, shows the ladder, and names the checks it did not run', async () => {
    const res = await post('/triage/assess', triageBody());
    expect(res.body.data.priority.kind).toBe('derived');
    expect(res.body.data.priority.tier).toBe('medium');
    expect(res.body.data.reachLadder.filter((r: any) => r.current)).toHaveLength(1);
    // The honesty ceiling: an empty indicator list must never read as "nothing found".
    expect(res.body.data.notChecked.join(' ')).toMatch(/impersonation/);
    expect(res.body.data.indicatorSuggestions).toEqual([]);
  });

  it('refuses a grade with no basis instead of scoring it', async () => {
    const res = await post('/triage/assess', triageBody({
      impacts: { reputation: { value: 'high', confidence: 'H', basis: '' } },
    }));
    expect(res.body.data.gradeRefusals.map((r: any) => r.code)).toContain('GRADE_BASIS_MISSING');
  });

  it('refuses an override with no reason, and keeps the SLA on the derived tier', async () => {
    const res = await post('/triage/assess', triageBody({ requestedPriority: 'high' }));
    expect(res.body.data.priority.kind).toBe('refused');
    expect(res.body.data.priority.refusal.code).toBe('PRIORITY_OVERRIDE_UNREASONED');
    // The clock must NOT have adopted the refused tier's 30-minute budget.
    expect(res.body.data.clock.budgetMinutes).toBe(240);
  });

  it('suggests the technology indicator from the corpus, which only the server has', async () => {
    corpus = Array.from({ length: 4 }, (_, i) => ({
      author_handle: `bot${String(i)}`,
      body: 'LCX is insolvent, get out now',
      x_post_id: 'p1',
      received_at: '2026-08-03T07:00:00.000Z',
    }));
    const res = await post('/triage/assess', triageBody({
      item: { handle: 'stranger', bodyText: 'LCX is insolvent, get out now', parentPostId: 'p1' },
    }));
    const kinds = res.body.data.indicatorSuggestions.map((s: any) => s.indicator);
    expect(kinds).toContain('technology');
    expect(res.body.data.indicatorSuggestions.every((s: any) => s.humanMustConfirm)).toBe(true);
  });
});

describe('POST /:id/triage — an ignore needs a rationale, and the refusal writes nothing', () => {
  it('refuses 422 with IGNORE_WITHOUT_RATIONALE and leaves no ledger row and no status change', async () => {
    const res = await post('/7/triage', triageBody({ action: { kind: 'ignore', rationale: '   ' } }));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('MARKETING_TRIAGE_REFUSED');
    expect(res.body.refusals.map((r: any) => r.code)).toContain('IGNORE_WITHOUT_RATIONALE');
    expect(ledgerWrites('marketing_triage_decision')).toHaveLength(0);
    expect(statusWrites()).toHaveLength(0);
  });

  it('reports the agreeing gates ONCE rather than twice', async () => {
    const res = await post('/7/triage', triageBody({ action: { kind: 'ignore', rationale: '' } }));
    const codes = res.body.refusals.map((r: any) => r.code).filter((c: string) => c === 'IGNORE_WITHOUT_RATIONALE');
    expect(codes).toHaveLength(1);
  });

  it('records the silence when the rationale is there, and moves the row to ignored', async () => {
    const res = await post('/7/triage', triageBody({
      action: { kind: 'ignore', rationale: 'One account, no reach, answering it would amplify it.' },
    }));
    expect(res.status).toBe(201);
    expect(res.body.data.silence.rationale).toMatch(/amplify/);
    expect(res.body.data.silence.decidedBy).not.toBe('');
    expect(res.body.data.queueStatusSet).toBe('ignored');
    expect(ledgerWrites('marketing_triage_decision')).toHaveLength(1);
    expect(statusWrites()[0].params[1]).toBe('ignored');
  });

  it('refuses a monitor whose review date has already passed, and writes nothing', async () => {
    const res = await post('/7/triage', triageBody({
      action: { kind: 'monitor', baselineRef: 'baseline-3', reviewAt: '2020-01-01T00:00:00.000Z' },
    }));
    expect(res.status).toBe(422);
    expect(res.body.refusals.map((r: any) => r.code)).toContain('MONITOR_REVIEW_NOT_IN_FUTURE');
    expect(ledgerWrites('marketing_triage_decision')).toHaveLength(0);
  });

  it('records a non-ignore decision as triaged', async () => {
    const res = await post('/7/triage', triageBody({
      action: { kind: 'monitor', baselineRef: 'baseline-3', reviewAt: '2030-01-01T00:00:00.000Z' },
    }));
    expect(res.status).toBe(201);
    expect(res.body.data.queueStatusSet).toBe('triaged');
    expect(res.body.data.silence).toBeNull();
  });

  it('assesses the row that is stored, not text the caller supplied', async () => {
    await post('/7/triage', triageBody({
      item: { handle: 'someone_else', bodyText: 'totally different text', parentPostId: null },
      action: { kind: 'monitor', baselineRef: 'b', reviewAt: '2030-01-01T00:00:00.000Z' },
    }));
    const corpusRead = calls.find((c) => /author_handle, body, x_post_id, received_at/.test(c.sql));
    // The row id, not the caller's item, is what the corpus read excludes.
    expect(corpusRead?.params[1]).toBe(7);
  });

  it('answers 503, not 500, while migration 0046 is pending', async () => {
    migrated = false;
    const res = await post('/7/triage', triageBody({ action: { kind: 'ignore', rationale: 'no reach at all here' } }));
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('MIGRATION_PENDING');
  });
});

describe('POST /adoption — "we only retweeted it" is answerable', () => {
  const graded = {
    state: 'graded', channel: 'x_notification_email', reliability: 'C', credibility: 3,
    corroboration: [{ channel: 'oembed', agrees: ['post_text'], disagrees: [], observedAt: '2026-08-03T08:00:00.000Z', evidence: 'oembed html' }],
    observedAt: '2026-08-03T08:00:00.000Z', collectedAt: '2026-08-03T08:01:00.000Z',
  };
  const target = (over: Record<string, unknown> = {}) => ({
    permalink: 'https://x.com/a/status/1', handle: 'stranger', text: 'ABC will 10x when LCX lists it',
    provenance: graded, verification: 'unverified', isLcxOwnAccount: false, partner: null,
    ...over,
  });
  const body = (over: Record<string, unknown> = {}) => ({
    verb: 'repost', surface: 'quote_post',
    speaker: { capacity: 'official_account', handle: 'lcx', employmentDisclosedInProfileOnly: false, itemPromotesEmployer: true },
    target: target(), ownText: null, ...over,
  });

  it('says what would be adopted, names the handle, and blocks', async () => {
    const res = await post('/adoption', body());
    expect(res.status).toBe(200);
    expect(res.body.data.verdict.adopted.adoptedText).toMatch(/10x/);
    expect(res.body.data.verdict.adopted.statement).toMatch(/stranger/);
    expect(res.body.data.blocked).toBe(true);
    expect(res.body.data.refusalCodes).toContain('ADOPTION_OF_UNVERIFIED_TARGET');
  });

  it('distinguishes a target we never read from a target with no claims', async () => {
    const res = await post('/adoption', body({ target: target({ text: null }) }));
    expect(res.body.data.verdict.adopted.adoptsUnreadText).toBe(true);
    expect(res.body.data.verdict.adopted.statement).toMatch(/has not observed|cannot adopt/);
  });

  it('refuses a graded provenance with nothing corroborating it', async () => {
    const res = await post('/adoption', body({ target: target({ provenance: { ...graded, corroboration: [] } }) }));
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('target.provenance.corroboration');
    expect(res.body.error).toMatch(/quarantined/);
  });

  it('carries the quarantine refusal from the target through to the verdict', async () => {
    const res = await post('/adoption', body({
      target: target({
        provenance: {
          state: 'quarantined', reasons: ['sender_authentication_absent'],
          channel: 'x_notification_email', collectedAt: '2026-08-03T08:00:00.000Z',
          promotionRequires: 'a DKIM or ARC pass from a trusted authserv-id',
        },
      }),
    }));
    expect(res.body.data.blocked).toBe(true);
    expect(JSON.stringify(res.body.data.verdict.refusals)).toMatch(/quarantine/i);
  });

  it('requires a target for any verb that acts on one', async () => {
    const res = await post('/adoption', body({ target: null }));
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('target');
  });

  it('reads the desk mode from the ledger, so a suspension refuses the adoption too', async () => {
    await post('/desk-mode', suspensionBody());
    const res = await post('/adoption', body());
    expect(res.body.data.refusalCodes).toContain('DESK_SUSPENDED_BY_AUTHORITY');
  });
});

describe('POST /desk-mode — governed, and the Art 94 arithmetic is real', () => {
  it('shuts the desk with no invented end date on an Art 94(1)(p) prohibition', async () => {
    const res = await post('/desk-mode', suspensionBody());
    expect(res.status).toBe(201);
    expect(res.body.data.standing.outboundPermitted).toBe(false);
    expect(res.body.data.standing.phase).toBe('unbounded');
    expect(res.body.data.standing.resumesAt).toBeNull();
    expect(res.body.data.statutoryCeiling).toBeNull();
    expect(res.body.data.order.anomalies.map((a: any) => a.kind)).toContain('prohibition_has_no_statutory_expiry');
    expect(res.body.data.policy.forbiddenActs).toEqual(['handoff', 'copy_out', 'export_for_posting']);
  });

  it('computes the Art 94(1)(q) ceiling in WORKING days against the supplied calendar', async () => {
    // 2026-07-01 is a Wednesday. The 30th working day is 2026-08-11. Adding 30 calendar
    // days would give 2026-07-31 — ten days early, and this is the number a supervisor and
    // the desk will argue about.
    const res = await post('/desk-mode', qOrderBody());
    expect(res.status).toBe(201);
    expect(res.body.data.statutoryCeiling).toBe('2026-08-11');
    expect(res.body.data.order.anomalies.map((a: any) => a.kind)).not.toContain('exceeds_art_94_1_q_ceiling');
  });

  it('raises an over-long order rather than shortening it', async () => {
    const res = await post('/desk-mode', qOrderBody({
      order: { ...qOrderBody().order, statedEndAt: '2026-09-14T00:00:00.000Z' },
    }));
    expect(res.body.data.order.anomalies.map((a: any) => a.kind)).toContain('exceeds_art_94_1_q_ceiling');
    expect(res.body.data.statutoryCeiling).toBe('2026-08-11');
    // NOT shortened to the ceiling: the desk does not grant itself relief by typing.
    expect(res.body.data.standing.mode.expiresAt).toBe('2026-09-14T00:00:00.000Z');
  });

  it('raises the ceiling as not computable when no calendar was supplied, and still records', async () => {
    const res = await post('/desk-mode', qOrderBody({ calendar: null }));
    expect(res.status).toBe(201);
    expect(res.body.data.statutoryCeiling).toBeNull();
    const anomalies = res.body.data.order.anomalies;
    expect(anomalies.map((a: any) => a.kind)).toContain('ceiling_not_computable');
    expect(JSON.stringify(anomalies)).toMatch(/WORKING_DAY_CALENDAR_ABSENT/);
    // Recorded anyway: refusing to record a regulator's order would leave the desk open.
    expect(ledgerWrites('marketing_desk_mode_change')).toHaveLength(1);
  });

  it('refuses a mode change with a reason too short to be read by a supervisor', async () => {
    const res = await post('/desk-mode', { to: { kind: 'heightened', reason: 'x', expiresAt: null }, reason: 'why', byRoles: ['policy'] });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('MARKETING_DESK_MODE_REFUSED');
    expect(res.body.refusals.length).toBeGreaterThan(0);
    expect(ledgerWrites('marketing_desk_mode_change')).toHaveLength(0);
  });

  it('refuses to reopen a live authority suspension from inside', async () => {
    await post('/desk-mode', suspensionBody());
    calls = [];
    const res = await post('/desk-mode', {
      to: { kind: 'normal' }, reason: 'The campaign is waiting and we would like to publish.', byRoles: ['legal'],
    });
    expect(res.status).toBe(422);
    expect(res.body.refusals.map((r: any) => r.code)).toContain('DESK_SUSPENDED_BY_AUTHORITY');
    expect(ledgerWrites('marketing_desk_mode_change')).toHaveLength(0);
    expect(res.body.standing.outboundPermitted).toBe(false);
  });

  it('takes the mode lock inside a transaction, and commits', async () => {
    await post('/desk-mode', suspensionBody());
    const sqls = calls.map((c) => c.sql.trim());
    expect(sqls.some((s) => /^BEGIN/.test(s))).toBe(true);
    expect(sqls.some((s) => /pg_advisory_xact_lock/.test(s))).toBe(true);
    expect(sqls.indexOf(sqls.find((s) => /pg_advisory_xact_lock/.test(s)) as string))
      .toBeGreaterThan(sqls.indexOf(sqls.find((s) => /^BEGIN/.test(s)) as string));
    expect(sqls.some((s) => /^COMMIT/.test(s))).toBe(true);
  });

  it('rolls back rather than committing a refused change', async () => {
    await post('/desk-mode', { to: { kind: 'heightened', reason: 'x', expiresAt: null }, reason: 'no', byRoles: ['policy'] });
    const sqls = calls.map((c) => c.sql.trim());
    expect(sqls.some((s) => /^ROLLBACK/.test(s))).toBe(true);
    expect(sqls.some((s) => /^COMMIT/.test(s))).toBe(false);
  });

  it('does not take the lock when the body is malformed', async () => {
    const res = await post('/desk-mode', { to: { kind: 'suspended_by_authority' }, reason: 'FMA order arrived today', byRoles: ['legal'], order: { power: 'art_94_2_z' } });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('order.power');
    expect(calls.some((c) => /pg_advisory_xact_lock/.test(c.sql))).toBe(false);
  });
});

describe('GET /desk — the board', () => {
  it('is open by DEFAULT rather than by decision, and says which', async () => {
    const res = await get('/desk');
    expect(res.status).toBe(200);
    expect(res.body.data.modeSource).toBe('default_normal');
    expect(res.body.data.standing.outboundPermitted).toBe(true);
    expect(res.body.data.outboundGate.every((r: any) => r.refusal === null)).toBe(true);
  });

  it('shows a suspended desk refusing all three outbound acts, each with a sentence', async () => {
    await post('/desk-mode', suspensionBody());
    const res = await get('/desk');
    expect(res.body.data.modeSource).toBe('ledger');
    expect(res.body.data.standing.mode.kind).toBe('suspended_by_authority');
    expect(res.body.data.outboundGate).toHaveLength(3);
    for (const row of res.body.data.outboundGate) {
      expect(row.refusal).not.toBeNull();
      expect(row.refusal.code).toBe('DESK_SUSPENDED_BY_AUTHORITY');
      expect(row.refusal.sentence).toMatch(/FMA-2026-4471/);
    }
    expect(res.body.data.history[0].reason).toMatch(/FMA order/);
  });

  it('reports the queue as ABSENT rather than zero while 0046 is pending, and still reads the mode', async () => {
    await post('/desk-mode', suspensionBody());
    migrated = false;
    _resetMigrated();
    const res = await get('/desk');
    expect(res.body.data.queue.kind).toBe('absent');
    expect(res.body.data.queue.refusal.code).toBe('DATA_ABSENT_NOT_ZERO');
    expect(res.body.data.migrated).toBe(false);
    // The mode is the safety-critical half and it must survive the migration window.
    expect(res.body.data.standing.outboundPermitted).toBe(false);
  });

  it('carries an observation frame with named blind spots', async () => {
    const res = await get('/desk');
    expect(res.body.data.frame.completeness).toBe('census_of_own_corpus');
    expect(res.body.data.frame.doesNotCapture.length).toBeGreaterThan(0);
  });

  it('FAILS CLOSED on an unreadable mode record rather than answering "normal"', async () => {
    // The whole point: a corrupt newest row must not let a suspended desk read as open.
    ledger.push({
      id: 'led-bad', subject_type: 'marketing_desk', subject_id: 'mode',
      action: 'marketing_desk_mode_change',
      params: {}, result: { transition: { to: { kind: 'shut_i_think' } } },
      actor: 'nik', created_at: '2026-08-03T10:00:00.000Z',
    });
    const res = await get('/desk');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('MARKETING_DESK_MODE_UNREADABLE');
    expect(res.body.error).toMatch(/CLOSED/);
    expect(JSON.stringify(res.body)).not.toMatch(/"outboundPermitted":true/);
  });
});

describe('the router is never open', () => {
  it('answers 401 without a credential on every path', async () => {
    for (const [method, path] of [['GET', '/desk'], ['POST', '/regime'], ['POST', '/desk-mode'], ['POST', '/adoption'], ['POST', '/triage/assess'], ['POST', '/7/triage']] as const) {
      const res = await marketingDeskRoutes.request(path, {
        method, ...(method === 'POST' ? { body: '{}', headers: { 'Content-Type': 'application/json' } } : {}),
      });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });
});
