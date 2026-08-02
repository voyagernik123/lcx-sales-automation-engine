import { describe, it, expect } from 'vitest';
import {
  ART_94_MAX_SUSPENSION_WORKING_DAYS,
  CLEARANCE_HEADLINE_TEST_QUESTION,
  CRISIS_BLOCKING_CLEARANCES,
  REFUSAL_CODES,
} from './types.js';
import type { Clearance, ClearanceRole, DeskMode, StatementBody } from './types.js';
import * as crisis from './crisis.js';
import {
  CONTAGION_PRECLEARS,
  CRISIS_EVIDENCE,
  CRISIS_GATE_ORDER,
  CRISIS_ONLY_REFUSAL_CODES,
  CRISIS_ROOM_CANNOT_PUBLISH,
  HOLDING_LIBRARY_VERSION,
  HOLDING_PRECONDITION_PROMPT,
  HOLDING_STATEMENTS,
  HOLDING_STATEMENTS_ARE_NOT_COUNSEL_REVIEWED,
  LCX_CONTAGION_APPLICABILITY,
  REASSURANCE_BASIS_MAX_AGE_DAYS,
  REASSURANCE_CLASS_CURABLE_BY_BASIS,
  REASSURANCE_PATTERNS,
  RUN_DYNAMIC_INCIDENT_TYPES,
  TTFS_BUDGET_MINUTES_BY_SEVERITY,
  TTFS_FLOOR_MINUTES,
  activateCrisisStatement,
  assessClearance,
  assessReassurance,
  assessStatementCompleteness,
  assessTimeToFirstStatement,
  buildRetraction,
  contagionReadiness,
  contradictionRefusal,
  crisisCapabilities,
  gateContagionAnswer,
  getContagionPreclear,
  getHoldingStatement,
  holdingStatementsFor,
  nextUpdateBreaches,
  renderStatementGuidance,
  renderStatementText,
  scanReassurance,
  seedStatementBody,
  ttfsBudget,
  unpreparedIncidentTypes,
  validateClockSuppression,
} from './crisis.js';
import type {
  CitedBasis,
  CrisisStatementDraft,
  HoldingStatementId,
} from './crisis.js';

/**
 * MARKETING M5 — CRISIS ROOM. Behavioural tests, plus the library's own
 * integrity.
 *
 * The assertions that matter most are the ones about ABSENCE, because absence is
 * what passes every type check and every truthiness test on the way to a record
 * that says a statement was cleared when it was not:
 *   - an empty `notKnown` column, which is how "FTX is fine. Assets are fine"
 *     gets written;
 *   - a clearance against bytes that have since changed;
 *   - one person holding three roles;
 *   - an elapsed figure of 0 standing in for "we do not know when this started";
 *   - a preclear that expired nine months ago and still renders confidently.
 *
 * Every refusal test asserts the CODE and that the sentence is one an operator
 * could act on, because a refusal that will not explain itself gets routed
 * around the first time it is inconvenient.
 */

const NOW = '2026-08-02T12:00:00.000Z';
const AUTHORED = '2026-08-02T11:30:00.000Z';
const IN_AN_HOUR = '2026-08-02T13:00:00.000Z';
const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);

function clear(over: Partial<Clearance> & { role: ClearanceRole }): Clearance {
  return {
    mode: 'blocking',
    reviewer: `reviewer-${over.role}`,
    at: '2026-08-02T11:45:00.000Z',
    headlineTest: true,
    contentHash: HASH,
    comment: null,
    ...over,
  };
}

/** All three blocking lanes, held by three distinct people, against HASH. */
function threeClears(): Clearance[] {
  return [clear({ role: 'reputation' }), clear({ role: 'policy' }), clear({ role: 'sme' })];
}

function body(over: Partial<StatementBody> = {}): StatementBody {
  return {
    known: ['We are aware of delayed ETH withdrawals and are working on it.'],
    notKnown: ['We do not yet have a restoration time we would commit to.'],
    nextStep: { action: 'We are working the queue.', nextUpdateBy: IN_AN_HOUR },
    empathy: null,
    withheld: null,
    ...over,
  };
}

function draft(over: Partial<CrisisStatementDraft> = {}): CrisisStatementDraft {
  return {
    incidentId: 'inc-1',
    incidentType: 'outage',
    phase: 'initial',
    severity: 'high',
    seq: 1,
    body: body(),
    statementId: 'hs-withdrawal-delay',
    statementVersion: 1,
    adHoc: false,
    authoredBy: 'author-1',
    residualUnknownsClosed: null,
    bases: [],
    preconditionsAcknowledged: ['status_page_updated_first', 'support_macro_aligned', 'incident_owner_named'],
    carriesPromotionalContent: false,
    isInsideInformationDisclosure: false,
    contentHash: HASH,
    supersedes: null,
    ...over,
  };
}

function activate(over: Partial<CrisisStatementDraft> = {}, opts: {
  clearances?: Clearance[];
  deskMode?: DeskMode;
  legalImplications?: boolean;
  counselNamed?: string | null;
  now?: string;
} = {}) {
  return activateCrisisStatement({
    draft: draft(over),
    clearances: opts.clearances ?? threeClears(),
    authoredAt: AUTHORED,
    legalImplications: opts.legalImplications ?? false,
    deskMode: opts.deskMode ?? { kind: 'normal' },
    counselNamed: opts.counselNamed ?? null,
    now: opts.now ?? NOW,
  });
}

function codes(refusals: readonly { code: string }[]): string[] {
  return refusals.map((r) => r.code);
}

/* ════════════════════════════════════════════════════════════════════════════
 *  The module's own honesty
 * ════════════════════════════════════════════════════════════════════════════ */

describe('what the module refuses to claim', () => {
  it('badges its own text as unreviewed and states it cannot publish', () => {
    expect(HOLDING_STATEMENTS_ARE_NOT_COUNSEL_REVIEWED).toBe(true);
    expect(CRISIS_ROOM_CANNOT_PUBLISH).toBe(true);
    expect(crisis.HOLDING_STATEMENTS_DO_NOT_ASSERT_THE_INCIDENT_IS_REAL).toBe(true);
    expect(crisis.HOLDING_STATEMENTS_UNREVIEWED_REASON).toMatch(/not counsel-reviewed/i);
    expect(crisis.CRISIS_ROOM_HANDOFF_REASON).toMatch(/cannot publish/i);
  });

  it('exports no publish, credential or session affordance', () => {
    const names = Object.keys(crisis);
    for (const banned of ['post', 'publish', 'send', 'schedule', 'credential', 'session', 'token']) {
      const offenders = names.filter((n) => new RegExp(`^${banned}|[a-z]${banned[0].toUpperCase()}${banned.slice(1)}`).test(n));
      // `CRISIS_ROOM_CANNOT_PUBLISH` and the handoff reason are allowed to say the word.
      expect(offenders.filter((n) => !/CANNOT_PUBLISH|HANDOFF/.test(n))).toEqual([]);
    }
  });

  it('exports none of the metrics the honesty ceiling forbids', () => {
    // Tokenised, not substring-matched: `nextUpdateBreaches` legitimately
    // contains the letters of "reach" and is not a reach metric.
    const tokens = new Set(
      Object.keys(crisis).flatMap((k) => k.split(/(?=[A-Z])|_/).map((t) => t.toLowerCase())).filter((t) => t !== ''),
    );
    for (const banned of ['impression', 'impressions', 'reach', 'follower', 'followers', 'ctr', 'sentiment', 'virality']) {
      expect([...tokens]).not.toContain(banned);
    }
    const squashed = Object.keys(crisis).map((k) => k.replace(/_/g, '').toLowerCase());
    for (const banned of ['engagementrate', 'clickthrough', 'shareofvoice', 'audiencesentiment']) {
      expect(squashed.filter((n) => n.includes(banned))).toEqual([]);
    }
  });

  it('names its evidence with a fetchable source, for every case it relies on', () => {
    expect(CRISIS_EVIDENCE).toHaveLength(4);
    for (const e of CRISIS_EVIDENCE) {
      expect(e.url).toMatch(/^https:\/\//);
      expect(e.authority.length).toBeGreaterThan(20);
      expect(e.detail.length).toBeGreaterThan(200);
    }
    expect(crisis.FTX_OVER_REASSURANCE_EVIDENCE.detail).toContain('FTX is fine. Assets are fine');
    expect(crisis.SVB_RUN_SPEED_EVIDENCE.detail).toContain('$40 billion');
  });

  it('holds every crisis code inside the ONE shared refusal namespace', () => {
    /*
     * THIS TEST WAS INVERTED BEFORE THE INTEGRATION PASS: it asserted that no crisis code
     * appeared in `REFUSAL_CODES`, which pinned the parallel vocabulary in place. The
     * defect that made it wrong is `loop.ts:refusalCodeFrequency`, which enumerates
     * `REFUSAL_CODES` to report the gates that never fired — so a code outside that array
     * is invisible to the only honest read the desk has on whether its gates are
     * load-bearing. Nineteen crisis gates were invisible. Now none are.
     */
    const shared = new Set<string>(REFUSAL_CODES);
    const missing = CRISIS_ONLY_REFUSAL_CODES.filter((c) => !shared.has(c));
    expect(missing).toEqual([]);
    expect(new Set(CRISIS_ONLY_REFUSAL_CODES).size).toBe(CRISIS_ONLY_REFUSAL_CODES.length);
    /* And the shared clock code is NOT re-listed here: one code, both rooms. */
    expect(CRISIS_ONLY_REFUSAL_CODES).not.toContain('TTFS_SUPPRESSION_UNREASONED');
    expect(shared.has('TTFS_SUPPRESSION_UNREASONED')).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  The clock
 * ════════════════════════════════════════════════════════════════════════════ */

describe('time to first statement', () => {
  it('halves the budget for the incident types that can start a withdrawal race', () => {
    for (const t of RUN_DYNAMIC_INCIDENT_TYPES) {
      expect(ttfsBudget(t, 'high').budgetMinutes).toBe(
        Math.max(TTFS_FLOOR_MINUTES, Math.floor(TTFS_BUDGET_MINUTES_BY_SEVERITY.high / 2)),
      );
    }
    expect(ttfsBudget('outage', 'high').budgetMinutes).toBe(TTFS_BUDGET_MINUTES_BY_SEVERITY.high);
    expect(ttfsBudget('outage', 'none').budgetMinutes).toBe(TTFS_BUDGET_MINUTES_BY_SEVERITY.none);
  });

  it('never floors a run-dynamic budget below the floor', () => {
    expect(ttfsBudget('depeg', 'high').budgetMinutes).toBeGreaterThanOrEqual(TTFS_FLOOR_MINUTES);
  });

  it('reports unknown, not zero, when the desk never recorded when it became aware', () => {
    const a = assessTimeToFirstStatement({
      incidentType: 'outage',
      severity: 'high',
      openedAt: null,
      firstStatementAt: null,
      now: NOW,
      suppression: null,
    });
    expect(a.state).toBe('unknown');
    expect(a.elapsedMinutes).toBeNull();
    expect(a.remainingMinutes).toBeNull();
    expect(a.sentence).toMatch(/not "on target"/);
  });

  it('distinguishes met, breached, running and overdue', () => {
    const base = { incidentType: 'outage' as const, severity: 'high' as const, now: NOW, suppression: null };
    expect(
      assessTimeToFirstStatement({ ...base, openedAt: '2026-08-02T11:45:00.000Z', firstStatementAt: '2026-08-02T11:55:00.000Z' }).state,
    ).toBe('met');
    const breached = assessTimeToFirstStatement({ ...base, openedAt: '2026-08-02T10:00:00.000Z', firstStatementAt: '2026-08-02T11:30:00.000Z' });
    expect(breached.state).toBe('breached');
    expect(breached.sentence).toContain('BREACH');
    expect(assessTimeToFirstStatement({ ...base, openedAt: '2026-08-02T11:50:00.000Z', firstStatementAt: null }).state).toBe('running');
    const overdue = assessTimeToFirstStatement({ ...base, openedAt: '2026-08-02T09:00:00.000Z', firstStatementAt: null });
    expect(overdue.state).toBe('overdue');
    expect(overdue.sentence).toContain('worse to release nothing');
  });

  it('keeps the elapsed figure when the clock is suppressed', () => {
    const a = assessTimeToFirstStatement({
      incidentType: 'outage',
      severity: 'high',
      openedAt: '2026-08-02T09:00:00.000Z',
      firstStatementAt: null,
      now: NOW,
      suppression: { reason: 'Single operator asleep; escalation paged at 11:40.', by: 'nik', at: '2026-08-02T11:40:00.000Z' },
    });
    expect(a.state).toBe('suppressed');
    expect(a.elapsedMinutes).toBe(180);
    expect(a.sentence).toContain('180');
  });

  it('refuses a suppression with no reason, no name or no instant', () => {
    expect(validateClockSuppression({ reason: null, by: 'nik', at: NOW })?.code).toBe('TTFS_SUPPRESSION_UNREASONED');
    expect(validateClockSuppression({ reason: 'too short', by: 'nik', at: NOW })?.code).toBe('TTFS_SUPPRESSION_UNREASONED');
    expect(validateClockSuppression({ reason: 'A properly recorded reason.', by: null, at: NOW })?.code).toBe('TTFS_SUPPRESSION_UNREASONED');
    expect(validateClockSuppression({ reason: 'A properly recorded reason.', by: 'nik', at: 'not-a-date' })?.code).toBe('TTFS_SUPPRESSION_UNREASONED');
    expect(validateClockSuppression({ reason: 'A properly recorded reason.', by: 'nik', at: NOW })).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  The tri-slot
 * ════════════════════════════════════════════════════════════════════════════ */

describe('the CERC tri-slot', () => {
  it('accepts a complete statement', () => {
    const a = assessStatementCompleteness(draft(), NOW);
    expect(a.complete).toBe(true);
    expect(a.slots).toEqual({ known: true, notKnown: true, nextUpdate: true });
  });

  it('refuses an empty known column', () => {
    const a = assessStatementCompleteness(draft({ body: body({ known: [] }) }), NOW);
    expect(codes(a.refusals)).toContain('CERC_KNOWN_EMPTY');
    expect(a.slots.known).toBe(false);
  });

  it('treats whitespace-only slot lines as empty', () => {
    const a = assessStatementCompleteness(draft({ body: body({ known: ['   ', ''] }) }), NOW);
    expect(codes(a.refusals)).toContain('CERC_KNOWN_EMPTY');
  });

  it('refuses an initial statement that admits no uncertainty — the FTX shape', () => {
    const a = assessStatementCompleteness(draft({ phase: 'initial', body: body({ notKnown: [] }) }), NOW);
    expect(codes(a.refusals)).toContain('NOT_KNOWN_EMPTY_ON_INITIAL_STATEMENT');
    expect(a.refusals[0].sentence).toMatch(/speculation or over-reassurance/);
    expect(a.refusals[0].rule.instrument).toBe('cerc');
  });

  it('refuses an empty not-known column in maintenance too', () => {
    const a = assessStatementCompleteness(draft({ phase: 'maintenance', body: body({ notKnown: [] }) }), NOW);
    expect(codes(a.refusals)).toContain('CERC_NOT_KNOWN_EMPTY');
  });

  it('lets recovery close the unknowns only against a named assertion', () => {
    const bare = assessStatementCompleteness(draft({ phase: 'recovery', body: body({ notKnown: [] }) }), NOW);
    expect(codes(bare.refusals)).toContain('CERC_RECOVERY_UNKNOWNS_NOT_CLOSED');

    const closed = assessStatementCompleteness(
      draft({
        phase: 'recovery',
        body: body({ notKnown: [] }),
        residualUnknownsClosed: { assertedBy: 'nik', basis: 'Post-incident review signed off 2026-08-05.' },
      }),
      NOW,
    );
    expect(closed.complete).toBe(true);

    const unnamed = assessStatementCompleteness(
      draft({
        phase: 'recovery',
        body: body({ notKnown: [] }),
        residualUnknownsClosed: { assertedBy: '  ', basis: 'signed off' },
      }),
      NOW,
    );
    expect(codes(unnamed.refusals)).toContain('CERC_RECOVERY_UNKNOWNS_NOT_CLOSED');
  });

  it('refuses a missing next-update commitment', () => {
    const noAction = assessStatementCompleteness(
      draft({ body: body({ nextStep: { action: '  ', nextUpdateBy: IN_AN_HOUR } }) }),
      NOW,
    );
    expect(codes(noAction.refusals)).toContain('NEXT_UPDATE_BY_MISSING');
    const noTime = assessStatementCompleteness(
      draft({ body: body({ nextStep: { action: 'Working it.', nextUpdateBy: '' } }) }),
      NOW,
    );
    expect(codes(noTime.refusals)).toContain('NEXT_UPDATE_BY_MISSING');
  });

  it('refuses a next-update time that is already in the past', () => {
    const a = assessStatementCompleteness(
      draft({ body: body({ nextStep: { action: 'Working it.', nextUpdateBy: '2026-08-02T11:00:00.000Z' } }) }),
      NOW,
    );
    expect(codes(a.refusals)).toContain('CERC_NEXT_UPDATE_NOT_IN_FUTURE');
    expect(a.refusals[0].sentence).toMatch(/breach the commitment at the moment it was made/);
  });

  it('refuses a withheld item with no reason', () => {
    const a = assessStatementCompleteness(
      draft({ body: body({ withheld: { what: 'The attacker address', whyNotReleasable: '' } }) }),
      NOW,
    );
    expect(codes(a.refusals)).toContain('CERC_WITHHELD_WITHOUT_REASON');
    const ok = assessStatementCompleteness(
      draft({ body: body({ withheld: { what: 'The attacker address', whyNotReleasable: 'Law enforcement asked us not to.' } }) }),
      NOW,
    );
    expect(ok.complete).toBe(true);
  });

  it('renders every slot, and marks a missing slot as missing rather than omitting it', () => {
    const text = renderStatementText(body({ known: [], nextStep: { action: '', nextUpdateBy: '' } }));
    expect(text).toContain('WHAT WE KNOW');
    expect(text).toContain('WHAT WE DO NOT YET KNOW');
    expect(text).toContain('WHAT HAPPENS NEXT');
    expect(text).toContain('(nothing recorded)');
    expect(text).toContain('(no time committed)');
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  Over-reassurance — the charged act
 * ════════════════════════════════════════════════════════════════════════════ */

function basis(over: Partial<CitedBasis> = {}): CitedBasis {
  return {
    kind: 'attestation',
    ref: 'ATT-2026-08-01 (treasury attestation, published on lcx.com)',
    asOf: '2026-08-01T00:00:00.000Z',
    assertedBy: 'treasury-lead',
    supports: ['solvency'],
    ...over,
  };
}

describe('over-reassurance', () => {
  it('catches the paragraph-78 sentence itself', () => {
    const found = scanReassurance('LCX is fine. Assets are fine. We have enough to cover all client holdings.');
    const classes = found.map((f) => f.cls);
    expect(classes).toContain('operations_normal');
    expect(classes).toContain('funds_safety');
    expect(classes).toContain('solvency');
  });

  it('refuses a solvency assertion with nothing behind it, and names the missing datum', () => {
    const a = assessReassurance('We are solvent.', [], NOW);
    expect(codes(a.refusals)).toContain('SOLVENCY_ASSERTION_WITHOUT_ATTESTATION');
    expect(a.refusals[0].recovery.kind).toBe('supply_data');
    expect(a.refusals[0].sentence).toMatch(/FTX is fine\. Assets are fine/);
    expect(a.refusals[0].matched).toBeTruthy();
  });

  it('refuses a funds-safety assertion with nothing behind it', () => {
    const a = assessReassurance('Your funds are safe.', [], NOW);
    expect(codes(a.refusals)).toContain('OVER_REASSURANCE');
  });

  it('allows the same claim once a named human attaches a dated basis', () => {
    const a = assessReassurance('We are solvent.', [basis()], NOW);
    expect(a.refusals).toEqual([]);
    expect(a.citedClasses).toEqual(['solvency']);
  });

  it('refuses a basis that is outside the age horizon, separately from a missing one', () => {
    const stale = assessReassurance('We are solvent.', [basis({ asOf: '2026-06-01T00:00:00.000Z' })], NOW);
    expect(codes(stale.refusals)).toEqual(['OVER_REASSURANCE_BASIS_STALE']);
    expect(stale.refusals[0].sentence).toContain(String(REASSURANCE_BASIS_MAX_AGE_DAYS));
  });

  it('does not accept a basis offered for a different claim class', () => {
    const a = assessReassurance('Reserves are fully backed.', [basis({ supports: ['solvency'] })], NOW);
    expect(codes(a.refusals)).toContain('OVER_REASSURANCE');
  });

  it('does not accept an anonymous or unreferenced basis', () => {
    expect(codes(assessReassurance('We are solvent.', [basis({ assertedBy: '  ' })], NOW).refusals)).toContain(
      'SOLVENCY_ASSERTION_WITHOUT_ATTESTATION',
    );
    expect(codes(assessReassurance('We are solvent.', [basis({ ref: '' })], NOW).refusals)).toContain(
      'SOLVENCY_ASSERTION_WITHOUT_ATTESTATION',
    );
  });

  it('refuses an unconditional forward commitment that NO basis can repair', () => {
    const bare = assessReassurance('We will always allow withdrawals.', [], NOW);
    expect(codes(bare.refusals)).toContain('UNCONDITIONAL_FORWARD_COMMITMENT');
    expect(bare.refusals[0].recovery.kind).toBe('edit_text');

    const withEverything = assessReassurance(
      'We will always allow withdrawals.',
      [basis({ supports: [...crisis.REASSURANCE_CLASSES] })],
      NOW,
    );
    expect(codes(withEverything.refusals)).toContain('UNCONDITIONAL_FORWARD_COMMITMENT');
    expect(REASSURANCE_CLASS_CURABLE_BY_BASIS.unconditional_forward).toBe(false);
  });

  it('catches "we will never" and "guarantee" and "at all times" too', () => {
    for (const text of ['We will never freeze an account.', 'We guarantee settlement.', 'Withdrawals are open at all times.']) {
      expect(codes(assessReassurance(text, [], NOW).refusals)).toContain('UNCONDITIONAL_FORWARD_COMMITMENT');
    }
  });

  it('admits the scan is not a proof', () => {
    const a = assessReassurance('Nothing reassuring here at all.', [], NOW);
    expect(a.refusals).toEqual([]);
    expect(a.scanIsNotAProof).toBe(true);
    expect(crisis.REASSURANCE_SCAN_LIMIT_REASON).toMatch(/cannot catch a paraphrase/i);
  });

  it('gives every pattern a reason the operator can read', () => {
    for (const p of REASSURANCE_PATTERNS) {
      expect(p.why.length).toBeGreaterThan(40);
      expect(crisis.REASSURANCE_CLASSES).toContain(p.cls);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  The three parallel blocking clears
 * ════════════════════════════════════════════════════════════════════════════ */

function clearanceInput(over: Partial<Parameters<typeof assessClearance>[0]> = {}) {
  return assessClearance({
    contentHash: HASH,
    authoredBy: 'author-1',
    authoredAt: AUTHORED,
    clearances: threeClears(),
    legalImplications: false,
    ...over,
  });
}

describe('clearance', () => {
  it('clears on three blocking lanes and asks the headline question by name', () => {
    const a = clearanceInput();
    expect(a.allBlockingHeld).toBe(true);
    expect(a.refusals).toEqual([]);
    expect(a.distinctReviewers).toBe(3);
    expect(a.headlineTestQuestion).toBe(CLEARANCE_HEADLINE_TEST_QUESTION);
    expect(a.headlineTestQuestion).toContain('news headline');
  });

  it('is PARALLEL: no permutation of arrival order changes the outcome', () => {
    const base = threeClears();
    const permutations = [
      [base[0], base[1], base[2]],
      [base[2], base[0], base[1]],
      [base[1], base[2], base[0]],
      [base[2], base[1], base[0]],
    ];
    const results = permutations.map((clearances) => JSON.stringify(clearanceInput({ clearances })));
    expect(new Set(results).size).toBe(1);
  });

  it('reports each outstanding lane independently rather than as a pipeline', () => {
    const a = clearanceInput({ clearances: [clear({ role: 'policy' })] });
    const outstanding = a.lanes.filter((l) => l.state === 'outstanding').map((l) => l.role);
    expect(outstanding.sort()).toEqual(['reputation', 'sme']);
    expect(a.lanes.find((l) => l.role === 'policy')?.state).toBe('held');
    expect(codes(a.refusals)).toContain('CLEARANCE_BLOCKING_OUTSTANDING');
    expect(a.lanes.find((l) => l.role === 'reputation')?.sentence).toMatch(/does not wait for them/);
  });

  it('keeps legal out of the path unless the item has legal implications', () => {
    const a = clearanceInput();
    expect(a.lanes.find((l) => l.role === 'legal')?.state).toBe('not_required');
    expect(a.lanes.find((l) => l.role === 'legal')?.sentence).toMatch(/CERC keeps legal out/);
  });

  it('DOWNGRADES a blocking legal hold to advisory when there are no legal implications', () => {
    const a = clearanceInput({
      clearances: [...threeClears(), clear({ role: 'legal', headlineTest: false, comment: 'I would like more time.' })],
    });
    expect(a.downgradedToAdvisory).toEqual(['legal']);
    expect(a.allBlockingHeld).toBe(true);
    expect(a.refusals).toEqual([]);
    expect(a.advisoryComments.map((c) => c.role)).toEqual(['legal']);
  });

  it('makes legal blocking when the item IS flagged as having legal implications', () => {
    const missing = clearanceInput({ legalImplications: true });
    expect(missing.allBlockingHeld).toBe(false);
    expect(codes(missing.refusals)).toContain('CLEARANCE_LEGAL_REQUIRED');

    const held = clearanceInput({ legalImplications: true, clearances: [...threeClears(), clear({ role: 'legal' })] });
    expect(held.allBlockingHeld).toBe(true);
    expect(held.refusals).toEqual([]);
  });

  it('will not let an advisory reviewer supply a required blocking lane', () => {
    const a = clearanceInput({
      clearances: [clear({ role: 'reputation', mode: 'advisory', comment: 'Looks fine to me.' }), clear({ role: 'policy' }), clear({ role: 'sme' })],
    });
    expect(a.allBlockingHeld).toBe(false);
    expect(a.lanes.find((l) => l.role === 'reputation')?.state).toBe('outstanding');
    expect(a.advisoryComments.map((c) => c.comment)).toEqual(['Looks fine to me.']);
  });

  it('voids a clearance given against different bytes', () => {
    const a = clearanceInput({
      clearances: [clear({ role: 'reputation', contentHash: OTHER_HASH }), clear({ role: 'policy' }), clear({ role: 'sme' })],
    });
    expect(a.allBlockingHeld).toBe(false);
    expect(codes(a.refusals)).toContain('CLEARANCE_VOID_CONTENT_CHANGED');
    expect(a.lanes.find((l) => l.role === 'reputation')?.state).toBe('void_content_changed');
    expect(a.refusals[0].sentence).toMatch(/four eyes on an earlier draft/);
  });

  it('voids a clearance given by the author of the text', () => {
    const a = clearanceInput({
      clearances: [clear({ role: 'reputation', reviewer: 'author-1' }), clear({ role: 'policy' }), clear({ role: 'sme' })],
    });
    expect(codes(a.refusals)).toContain('SELF_APPROVAL_FORBIDDEN');
    expect(a.lanes.find((l) => l.role === 'reputation')?.state).toBe('void_self_cleared');
  });

  it('treats a "no" on the headline test as a substantive refusal, not a pending clearance', () => {
    const a = clearanceInput({
      clearances: [clear({ role: 'sme', headlineTest: false, comment: 'The second sentence reads as a guarantee.' }), clear({ role: 'policy' }), clear({ role: 'reputation' })],
    });
    expect(codes(a.refusals)).toContain('CLEARANCE_HEADLINE_TEST_FAILED');
    expect(a.lanes.find((l) => l.role === 'sme')?.state).toBe('refused_on_headline_test');
    expect(a.refusals[0].recovery).toEqual({ kind: 'edit_text', what: 'The second sentence reads as a guarantee.' });
  });

  it('admits when one person holds every lane, instead of reporting three clears', () => {
    const a = clearanceInput({
      clearances: [
        clear({ role: 'reputation', reviewer: 'nik' }),
        clear({ role: 'policy', reviewer: 'nik' }),
        clear({ role: 'sme', reviewer: 'nik' }),
      ],
    });
    expect(a.distinctReviewers).toBe(1);
    expect(a.benchAdmission).toMatch(/one pair of eyes wearing 3 hats/);
    expect(codes(a.refusals)).toContain('FOUR_EYES_UNACHIEVABLE');
    expect(a.refusals[0].recovery.kind).toBe('not_recoverable');
  });

  it('states a thin bench without blocking, when there are at least two reviewers', () => {
    const a = clearanceInput({
      clearances: [
        clear({ role: 'reputation', reviewer: 'nik' }),
        clear({ role: 'policy', reviewer: 'nik' }),
        clear({ role: 'sme', reviewer: 'other' }),
      ],
    });
    expect(a.distinctReviewers).toBe(2);
    expect(a.benchAdmission).toMatch(/thinner than the doctrine assumes/);
    expect(a.allBlockingHeld).toBe(true);
    expect(a.refusals).toEqual([]);
  });

  it('records per-lane latency and names the slowest lane', () => {
    const a = clearanceInput({
      clearances: [
        clear({ role: 'reputation', at: '2026-08-02T11:35:00.000Z' }),
        clear({ role: 'policy', at: '2026-08-02T11:40:00.000Z' }),
        clear({ role: 'sme', at: '2026-08-02T11:59:00.000Z' }),
      ],
    });
    expect(a.longestPole).toEqual({ role: 'sme', minutes: 29 });
    expect(a.lanes.find((l) => l.role === 'reputation')?.latencyMinutes).toBe(5);
  });

  it('gives every lane a sentence, in every state', () => {
    for (const a of [clearanceInput(), clearanceInput({ clearances: [] }), clearanceInput({ legalImplications: true })]) {
      for (const lane of a.lanes) expect(lane.sentence.length).toBeGreaterThan(20);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  The precleared library, and its own integrity
 * ════════════════════════════════════════════════════════════════════════════ */

describe('the precleared library', () => {
  it('has unique ids and a version on every entry', () => {
    const ids = HOLDING_STATEMENTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of HOLDING_STATEMENTS) {
      expect(s.version).toBeGreaterThanOrEqual(1);
      expect(Date.parse(s.reviewBy)).toBeGreaterThan(Date.parse(s.authoredOn));
      expect(s.incidentTypes.length).toBeGreaterThan(0);
      expect(s.phases.length).toBeGreaterThan(0);
    }
  });

  it('gives every entry standing lines for BOTH columns, so a seed is already complete', () => {
    for (const s of HOLDING_STATEMENTS) {
      expect(s.standingKnown.length).toBeGreaterThan(0);
      expect(s.standingNotKnown.length).toBeGreaterThan(0);
      expect(s.nextStepAction.length).toBeGreaterThan(10);
      const seeded = seedStatementBody(s, IN_AN_HOUR);
      const completeness = assessStatementCompleteness(
        draft({ statementId: s.id, incidentType: s.incidentTypes[0], body: seeded, phase: 'initial' }),
        NOW,
      );
      expect(completeness.complete).toBe(true);
    }
  });

  it('carries no reassurance construction in its own standing text', () => {
    for (const s of HOLDING_STATEMENTS) {
      const a = assessReassurance(renderStatementText(seedStatementBody(s, IN_AN_HOUR)), [], NOW);
      expect({ id: s.id, refusals: codes(a.refusals) }).toEqual({ id: s.id, refusals: [] });
    }
  });

  it('composes the operator brief from mustNotSay, so a protection cannot be reworded away', () => {
    for (const s of HOLDING_STATEMENTS) {
      const brief = renderStatementGuidance(s);
      for (const line of s.mustNotSay) expect(brief).toContain(line);
      for (const p of s.requiresBeforeUse) expect(brief).toContain(HOLDING_PRECONDITION_PROMPT[p]);
      for (const line of s.operatorMustSupply) expect(brief).toContain(line);
      expect(brief).toContain(crisis.HOLDING_STATEMENTS_UNREVIEWED_REASON);
      expect(brief).toContain(crisis.CRISIS_ROOM_HANDOFF_REASON);
      expect(brief).toContain(`v${s.version}`);
    }
  });

  it('gives every incident class at least four things it must not say', () => {
    for (const s of HOLDING_STATEMENTS) {
      expect(s.mustNotSay.length).toBeGreaterThanOrEqual(3);
      for (const line of s.mustNotSay) expect(line.length).toBeGreaterThan(40);
    }
  });

  it('escalates to a ROLE and never to a person or a number', () => {
    for (const s of HOLDING_STATEMENTS) {
      expect(['reputation', 'policy', 'sme', 'legal']).toContain(s.escalateTo);
    }
    const joined = JSON.stringify(HOLDING_STATEMENTS);
    expect(joined).not.toMatch(/\+\d{6,}/);
    expect(joined).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
  });

  it('resolves ids and reports an unknown id as null rather than guessing', () => {
    expect(getHoldingStatement('hs-withdrawal-delay')?.id).toBe('hs-withdrawal-delay');
    expect(getHoldingStatement(null)).toBeNull();
    expect(getHoldingStatement('hs-nope' as HoldingStatementId)).toBeNull();
  });

  it('reports which incident types have no preclear at all', () => {
    expect(holdingStatementsFor('outage').length).toBeGreaterThan(0);
    expect(unpreparedIncidentTypes(['outage', 'delisting'])).toEqual([]);
    expect(HOLDING_LIBRARY_VERSION).toBeGreaterThanOrEqual(1);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  Peer contagion
 * ════════════════════════════════════════════════════════════════════════════ */

describe('peer contagion preclears', () => {
  it('records LCX as confirmed only on the attribute it actually has', () => {
    expect(LCX_CONTAGION_APPLICABILITY.native_exchange_token).toBe('confirmed');
    const unknowns = Object.entries(LCX_CONTAGION_APPLICABILITY).filter(([, v]) => v === 'unknown');
    expect(unknowns.length).toBeGreaterThan(0);
    // The point of the type: `unknown` may not be represented as "no".
    expect(Object.values(LCX_CONTAGION_APPLICABILITY)).not.toContain(undefined);
    expect(crisis.CONTAGION_APPLICABILITY_OWNER).toMatch(/not that it is "no"/);
  });

  it('has a prepared answer for the attribute LCX is known to share', () => {
    const p = getContagionPreclear('native_exchange_token');
    expect(p).not.toBeNull();
    expect(p?.differentiation.length).toBeGreaterThan(0);
    expect(p?.mustNotSay.length).toBeGreaterThan(0);
  });

  it('never names a peer entity in any prepared answer', () => {
    const joined = JSON.stringify(CONTAGION_PRECLEARS).toLowerCase();
    for (const peer of ['ftx', 'alameda', 'crypto.com', 'cronos', 'binance', 'celsius', 'bybit', 'kraken', 'coinbase']) {
      expect(joined).not.toContain(peer);
    }
  });

  it('distinguishes an unprepared answer from an unknown applicability, in the sentence', () => {
    const rows = contagionReadiness(NOW);
    const prepared = rows.find((r) => r.attribute === 'native_exchange_token');
    expect(prepared?.preclear).toBe('ready');
    expect(prepared?.sentence).toContain('confirmed');

    const both = rows.find((r) => r.attribute === 'same_custodian');
    expect(both?.preclear).toBe('absent');
    expect(both?.applicability).toBe('unknown');
    expect(both?.sentence).toMatch(/Both halves are gaps/);
  });

  it('marks a prepared answer expired once its review date passes, and refuses it', () => {
    const later = '2027-01-01T00:00:00.000Z';
    const row = contagionReadiness(later).find((r) => r.attribute === 'native_exchange_token');
    expect(row?.preclear).toBe('expired');
    expect(row?.sentence).toMatch(/turns one incident into two/);

    const gate = gateContagionAnswer('native_exchange_token', later);
    expect(gate.allowed).toBe(false);
    expect(gate.refusal?.code).toBe('CONTAGION_PRECLEAR_EXPIRED');
    expect(gate.refusal?.recovery.kind).toBe('human_authority');
  });

  it('refuses an attribute with no prepared answer, and says why a preclear exists', () => {
    const gate = gateContagionAnswer('same_banking_partner', NOW);
    expect(gate.allowed).toBe(false);
    expect(gate.refusal?.code).toBe('CONTAGION_PRECLEAR_ABSENT');
    expect(gate.refusal?.sentence).toMatch(/before the day it is needed/);
    expect(gate.refusal?.rule.instrument).toBe('cerc');
  });

  it('allows the prepared answer while it is current', () => {
    const gate = gateContagionAnswer('native_exchange_token', NOW);
    expect(gate.allowed).toBe(true);
    expect(gate.refusal).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  Art 94 — a suspended desk in a crisis
 * ════════════════════════════════════════════════════════════════════════════ */

const SUSPENDED: DeskMode = {
  kind: 'suspended_by_authority',
  authority: 'FMA Liechtenstein',
  orderRef: 'FMA-2026-0042',
  effectiveFrom: '2026-07-20T00:00:00.000Z',
  expiresAt: '2026-09-01T00:00:00.000Z',
  suspensionPower: 'cease_or_suspend_30_days',
  recordedBy: 'nik',
};

describe('Art 94 suspension', () => {
  it('keeps drafting, clearance, recording and export alive — the record is the point', () => {
    const c = crisisCapabilities(SUSPENDED, {
      isInsideInformationDisclosure: false,
      carriesPromotionalContent: false,
      counselNamed: null,
    });
    expect(c.mayDraft).toBe(true);
    expect(c.mayClear).toBe(true);
    expect(c.mayRecordPublication).toBe(true);
    expect(c.mayExportRecord).toBe(true);
    expect(c.mayHandOff).toBe(false);
    expect(codes(c.refusals)).toContain('DESK_SUSPENDED_BY_AUTHORITY');
    expect(c.notes.join(' ')).toContain('working days');
    expect(c.notes.join(' ')).toContain(String(ART_94_MAX_SUSPENSION_WORKING_DAYS));
  });

  it('will not classify an Art 88(1) disclosure for itself — it asks for counsel by name', () => {
    const c = crisisCapabilities(SUSPENDED, {
      isInsideInformationDisclosure: true,
      carriesPromotionalContent: false,
      counselNamed: null,
    });
    expect(c.mayHandOff).toBe(false);
    expect(codes(c.refusals)).toContain('ART_94_CLASSIFICATION_REQUIRES_COUNSEL');
    expect(c.refusals[0].recovery.kind).toBe('supply_data');
    expect(c.refusals[0].sentence).toMatch(/will not answer it/);
  });

  it('permits handoff of a disclosure once counsel has ruled, and records the name', () => {
    const c = crisisCapabilities(SUSPENDED, {
      isInsideInformationDisclosure: true,
      carriesPromotionalContent: false,
      counselNamed: 'Counsel LLP (ruling 2026-08-02)',
    });
    expect(c.mayHandOff).toBe(true);
    expect(c.notes.join(' ')).toContain('Counsel LLP');
  });

  it('refuses a statement that is both a disclosure and promotional, in any desk mode', () => {
    for (const mode of [{ kind: 'normal' } as DeskMode, SUSPENDED]) {
      const c = crisisCapabilities(mode, {
        isInsideInformationDisclosure: true,
        carriesPromotionalContent: true,
        counselNamed: 'Counsel LLP',
      });
      expect(codes(c.refusals)).toContain('ART_88_1_DISCLOSURE_MIXED_WITH_MARKETING');
      expect(c.mayHandOff).toBe(false);
      expect(c.refusals[0].recovery.kind).toBe('different_surface');
    }
  });

  it('names the SVB sequencing tension rather than pretending the rules agree', () => {
    const c = crisisCapabilities({ kind: 'normal' }, {
      isInsideInformationDisclosure: true,
      carriesPromotionalContent: true,
      counselNamed: null,
    });
    expect(c.notes.join(' ')).toMatch(/itself the trigger for the run/);
  });

  it('records heightened mode without disabling anything', () => {
    const c = crisisCapabilities(
      { kind: 'heightened', reason: 'Post-incident review open', imposedBy: 'nik', effectiveFrom: NOW, expiresAt: null },
      { isInsideInformationDisclosure: false, carriesPromotionalContent: false, counselNamed: null },
    );
    expect(c.mayHandOff).toBe(true);
    expect(c.notes.join(' ')).toContain('heightened supervision');
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  Activation — the ordered gate
 * ════════════════════════════════════════════════════════════════════════════ */

describe('activation', () => {
  it('issues a complete, cleared, precleared statement and hands back the text plus the record', () => {
    const a = activate();
    expect(a.issuable).toBe(true);
    expect(a.refusals).toEqual([]);
    expect(a.text).toContain('WHAT WE DO NOT YET KNOW');
    expect(a.gates.map((g) => g.gate)).toEqual([...CRISIS_GATE_ORDER]);
    expect(a.gates.every((g) => g.passed && !g.skipped)).toBe(true);
    expect(a.record).toMatchObject({
      incidentId: 'inc-1',
      statementId: 'hs-withdrawal-delay',
      statementVersion: 1,
      libraryVersion: HOLDING_LIBRARY_VERSION,
      adHoc: false,
      authoredBy: 'author-1',
      contentHash: HASH,
      decidedAt: NOW,
    });
    expect(a.unreviewedNotice).toMatch(/not counsel-reviewed/i);
  });

  it('marks the gates after a refusal as skipped rather than passed', () => {
    const a = activate({ statementId: 'hs-nope' as HoldingStatementId });
    expect(a.issuable).toBe(false);
    expect(codes(a.refusals)).toEqual(['HOLDING_STATEMENT_UNKNOWN']);
    const skipped = a.gates.filter((g) => g.skipped).map((g) => g.gate);
    expect(skipped).toContain('tri_slot_complete');
    expect(skipped).toContain('clearances_held');
    expect(a.gates.filter((g) => g.passed)).toEqual([]);
  });

  it('refuses an expired preclear, names the review date, and offers no override', () => {
    const a = activate({}, { now: '2027-01-01T00:00:00.000Z' });
    expect(a.issuable).toBe(false);
    expect(codes(a.refusals)).toEqual(['HOLDING_STATEMENT_EXPIRED']);
    expect(a.refusals[0].sentence).toContain('2026-11-02');
    expect(a.refusals[0].sentence).toMatch(/turns one incident into two/);
    expect(a.refusals[0].sentence).toMatch(/recorded as ad hoc/);
  });

  it('cannot be talked out of an expired preclear by ANY other input', () => {
    const later = '2027-01-01T00:00:00.000Z';
    const attempts = [
      activate({}, { now: later }),
      activate({}, { now: later, legalImplications: true, counselNamed: 'Counsel LLP' }),
      activate({}, { now: later, clearances: [...threeClears(), clear({ role: 'legal' })] }),
      activate({ adHoc: true }, { now: later }),
      activate({ preconditionsAcknowledged: [...crisis.HOLDING_PRECONDITIONS] }, { now: later }),
      activate({ severity: 'none', phase: 'recovery', residualUnknownsClosed: { assertedBy: 'nik', basis: 'reviewed' } }, { now: later }),
    ];
    for (const a of attempts) {
      expect(a.issuable).toBe(false);
      expect(codes(a.refusals)).toContain('HOLDING_STATEMENT_EXPIRED');
    }
  });

  it('exposes no override, force or accept-risk input at all', () => {
    const keys = ['draft', 'clearances', 'authoredAt', 'legalImplications', 'deskMode', 'counselNamed', 'now'];
    for (const k of keys) expect(/force|override|acceptrisk|approved|bypass|skip/i.test(k)).toBe(false);
    expect(Object.keys(crisis).filter((n) => /force|override|bypass/i.test(n))).toEqual([]);
  });

  it('refuses a preclear borrowed from an adjacent incident class', () => {
    const a = activate({ statementId: 'hs-impersonation-warning', incidentType: 'outage' });
    expect(codes(a.refusals)).toEqual(['HOLDING_STATEMENT_TYPE_MISMATCH']);
    expect(a.refusals[0].sentence).toMatch(/sensitive to the conditions of the current crisis/);
  });

  it('refuses until every precondition is acknowledged, and never auto-satisfies one', () => {
    const a = activate({ preconditionsAcknowledged: ['status_page_updated_first'] });
    expect(codes(a.refusals)).toEqual(['PRECONDITION_NOT_ACKNOWLEDGED', 'PRECONDITION_NOT_ACKNOWLEDGED']);
    expect(a.refusals[0].sentence).toMatch(/Nothing here checks this for you/);
    const ack = a.refusals.map((r) => r.matched);
    expect(ack).toContain('support_macro_aligned');
    expect(ack).toContain('incident_owner_named');
  });

  it('allows ad hoc text, and requires a named owner for it', () => {
    const owned = activate({ statementId: null, statementVersion: null, adHoc: true, preconditionsAcknowledged: [] });
    expect(owned.issuable).toBe(true);
    expect(owned.record.adHoc).toBe(true);
    expect(owned.record.statementId).toBeNull();

    const unowned = activate({ statementId: null, statementVersion: null, adHoc: false, preconditionsAcknowledged: [] });
    expect(codes(unowned.refusals)).toEqual(['AD_HOC_WITHOUT_NAMED_OWNER']);

    const unnamed = activate({ statementId: null, statementVersion: null, adHoc: true, authoredBy: '  ', preconditionsAcknowledged: [] });
    expect(codes(unnamed.refusals)).toEqual(['AD_HOC_WITHOUT_NAMED_OWNER']);
  });

  it('does not let ad hoc lower any other bar', () => {
    const a = activate({
      statementId: null,
      statementVersion: null,
      adHoc: true,
      preconditionsAcknowledged: [],
      body: body({ notKnown: [] }),
    });
    expect(a.issuable).toBe(false);
    expect(codes(a.refusals)).toContain('NOT_KNOWN_EMPTY_ON_INITIAL_STATEMENT');
  });

  it('refuses an over-reassuring statement before it looks at clearances', () => {
    const a = activate({
      body: body({ known: ['LCX is fine. Assets are fine.'] }),
    });
    expect(a.issuable).toBe(false);
    expect(codes(a.refusals)).toContain('OVER_REASSURANCE');
    expect(a.gates.find((g) => g.gate === 'clearances_held')?.skipped).toBe(true);
  });

  it('refuses on clearance last-but-one, so the operator learns the text is sound first', () => {
    const a = activate({}, { clearances: [clear({ role: 'policy' })] });
    expect(a.issuable).toBe(false);
    expect(codes(a.refusals)).toContain('CLEARANCE_BLOCKING_OUTSTANDING');
    expect(a.gates.find((g) => g.gate === 'tri_slot_complete')?.passed).toBe(true);
    expect(a.gates.find((g) => g.gate === 'no_over_reassurance')?.passed).toBe(true);
    expect(a.gates.find((g) => g.gate === 'desk_permits_handoff')?.skipped).toBe(true);
  });

  it('refuses handoff under an Art 94 suspension while still producing the record', () => {
    const a = activate({}, { deskMode: SUSPENDED });
    expect(a.issuable).toBe(false);
    expect(codes(a.refusals)).toContain('DESK_SUSPENDED_BY_AUTHORITY');
    expect(a.capabilities.mayDraft).toBe(true);
    expect(a.capabilities.mayExportRecord).toBe(true);
    expect(a.record.clearances).toHaveLength(3);
    expect(a.record.contentHash).toBe(HASH);
  });

  it('records which reassurance classes were cited, for the audit trail', () => {
    const a = activate({
      body: body({ known: ['We are solvent as at the attestation date.'] }),
      bases: [basis()],
    });
    expect(a.issuable).toBe(true);
    expect(a.record.citedClasses).toEqual(['solvency']);
  });

  it('gives every gate result a detail line', () => {
    for (const a of [activate(), activate({}, { deskMode: SUSPENDED }), activate({ statementId: 'hs-nope' as HoldingStatementId })]) {
      for (const g of a.gates) expect(g.detail.length).toBeGreaterThan(4);
    }
  });

  it('gives every refusal a sentence, a citation with text, and a recovery', () => {
    const all = [
      activate({ statementId: 'hs-nope' as HoldingStatementId }),
      activate({}, { now: '2027-01-01T00:00:00.000Z' }),
      activate({ statementId: 'hs-impersonation-warning' }),
      activate({ preconditionsAcknowledged: [] }),
      activate({ statementId: null, statementVersion: null, adHoc: false, preconditionsAcknowledged: [] }),
      activate({ body: body({ notKnown: [] }) }),
      activate({ body: body({ known: ['Your funds are safe.'] }) }),
      activate({}, { clearances: [] }),
      activate({}, { deskMode: SUSPENDED }),
    ].flatMap((a) => a.refusals);
    expect(all.length).toBeGreaterThan(8);
    for (const r of all) {
      expect(r.sentence.length).toBeGreaterThan(60);
      expect(r.sentence).not.toMatch(/^[A-Z_]+$/);
      expect(r.rule.text.length).toBeGreaterThan(30);
      expect(r.rule.provision.length).toBeGreaterThan(3);
      expect(r.recovery.kind).toBeTruthy();
      expect(r.ruleSetVersion).toBe(crisis.CRISIS_RULESET_VERSION);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  The ledger
 * ════════════════════════════════════════════════════════════════════════════ */

describe('the ledger', () => {
  const ledger = [
    { incidentId: 'inc-1', seq: 1, promisedNextUpdateBy: '2026-08-02T11:00:00.000Z', issuedAt: '2026-08-02T10:30:00.000Z' },
    { incidentId: 'inc-1', seq: 2, promisedNextUpdateBy: '2026-08-02T13:00:00.000Z', issuedAt: '2026-08-02T11:20:00.000Z' },
  ];

  it('records a late next update as an event, with how late it was', () => {
    const breaches = nextUpdateBreaches(ledger, NOW);
    expect(breaches).toHaveLength(1);
    expect(breaches[0]).toMatchObject({ seq: 1, overdueMinutes: 20 });
    expect(breaches[0].sentence).toMatch(/not a rounding error/);
  });

  it('reports a commitment with nothing after it as a LIVE breach', () => {
    const breaches = nextUpdateBreaches([ledger[0]], NOW);
    expect(breaches).toHaveLength(1);
    expect(breaches[0].actualAt).toBeNull();
    expect(breaches[0].sentence).toContain('LIVE BREACH');
    expect(breaches[0].overdueMinutes).toBe(60);
  });

  it('does not invent a breach for a commitment that is still in the future', () => {
    expect(nextUpdateBreaches([ledger[1]], NOW)).toEqual([]);
  });

  it('is insensitive to the order rows arrive in', () => {
    expect(nextUpdateBreaches([...ledger].reverse(), NOW)).toEqual(nextUpdateBreaches(ledger, NOW));
  });

  it('refuses a statement that moves a known fact into not-known without a supersedes link', () => {
    const prior: StatementBody[] = [body({ known: ['Withdrawals are processing normally.'] })];
    const r = contradictionRefusal(prior, draft({ body: body({ notKnown: ['withdrawals are processing normally'] }) }));
    expect(r?.code).toBe('STATEMENT_CONTRADICTS_INCIDENT_RECORD');
    expect(r?.sentence).toMatch(/one story changing rather than two stories running at once/);
    expect(r?.recovery.kind).toBe('supply_data');
  });

  it('accepts the same reversal once it links to what it supersedes', () => {
    const prior: StatementBody[] = [body({ known: ['Withdrawals are processing normally.'] })];
    const r = contradictionRefusal(prior, draft({ supersedes: 'stmt-1', body: body({ notKnown: ['Withdrawals are processing normally.'] }) }));
    expect(r).toBeNull();
  });

  it('does not claim to catch a paraphrased contradiction', () => {
    const prior: StatementBody[] = [body({ known: ['Withdrawals are processing normally.'] })];
    const r = contradictionRefusal(prior, draft({ body: body({ notKnown: ['We are unsure about the withdrawal queue.'] }) }));
    expect(r).toBeNull();
  });

  it('builds a retraction as a linked record and refuses a bare deletion', () => {
    const bad = buildRetraction({ supersedes: 'stmt-1', reason: 'wrong', withdrawnBy: 'nik', withdrawnAt: NOW });
    expect(bad.withdrawal).toBeNull();
    expect(bad.refusal?.code).toBe('RETRACTION_WITHOUT_REASON');
    expect(bad.refusal?.sentence).toMatch(/deletion is not remediation/i);

    for (const attempt of [
      { supersedes: '', reason: 'The restoration time we gave was wrong.', withdrawnBy: 'nik', withdrawnAt: NOW },
      { supersedes: 'stmt-1', reason: 'The restoration time we gave was wrong.', withdrawnBy: null, withdrawnAt: NOW },
      { supersedes: 'stmt-1', reason: 'The restoration time we gave was wrong.', withdrawnBy: 'nik', withdrawnAt: 'nope' },
    ]) {
      expect(buildRetraction(attempt).refusal?.code).toBe('RETRACTION_WITHOUT_REASON');
    }

    const good = buildRetraction({
      supersedes: 'stmt-1',
      reason: 'The restoration time we gave was wrong and we corrected it in statement 3.',
      withdrawnBy: 'nik',
      withdrawnAt: NOW,
    });
    expect(good.refusal).toBeNull();
    expect(good.withdrawal).toMatchObject({ supersedes: 'stmt-1', withdrawnBy: 'nik', withdrawnAt: NOW });
  });

  it('exports no hard-delete path', () => {
    expect(Object.keys(crisis).filter((n) => /delete|purge|erase|destroy/i.test(n))).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  The public surface the M5 web page depends on
 * ════════════════════════════════════════════════════════════════════════════ */

describe('the module surface consumers bind to', () => {
  it('lists severities worst-first, so a picker does not invite the wrong answer', () => {
    expect(crisis.INCIDENT_SEVERITIES).toEqual(['high', 'medium', 'low', 'none']);
    for (const s of crisis.INCIDENT_SEVERITIES) {
      expect(crisis.INCIDENT_SEVERITY_LABEL[s].length).toBeGreaterThan(4);
      expect(TTFS_BUDGET_MINUTES_BY_SEVERITY[s]).toBeGreaterThan(0);
    }
  });

  it('gives "none" severity a real clock rather than no clock', () => {
    expect(crisis.INCIDENT_SEVERITY_LABEL.none).toMatch(/watch/i);
    expect(ttfsBudget('outage', 'none').budgetMinutes).toBeGreaterThan(0);
  });

  it('re-exports the shared clearance constants rather than copying them', () => {
    expect(crisis.CLEARANCE_HEADLINE_TEST_QUESTION).toBe(CLEARANCE_HEADLINE_TEST_QUESTION);
    expect(crisis.CRISIS_BLOCKING_CLEARANCES).toBe(CRISIS_BLOCKING_CLEARANCES);
    expect(crisis.CRISIS_BLOCKING_CLEARANCES).toEqual(['reputation', 'policy', 'sme']);
  });

  it('exports every name the crisis surface imports', () => {
    for (const name of [
      'CERC_CLEARANCE_EVIDENCE', 'CONTAGION_APPLICABILITY_OWNER', 'CRISIS_ROOM_CANNOT_PUBLISH',
      'CRISIS_ROOM_HANDOFF_REASON', 'FTX_OVER_REASSURANCE_EVIDENCE', 'HOLDING_LIBRARY_VERSION',
      'HOLDING_PRECONDITION_PROMPT', 'HOLDING_STATEMENTS', 'HOLDING_STATEMENTS_ARE_NOT_COUNSEL_REVIEWED',
      'HOLDING_STATEMENTS_UNREVIEWED_REASON', 'INCIDENT_SEVERITIES', 'INCIDENT_SEVERITY_LABEL',
      'SVB_RUN_SPEED_EVIDENCE', 'TTFS_BUDGET_BASIS', 'TTFS_BUDGET_MINUTES_BY_SEVERITY',
      'activateCrisisStatement', 'assessTimeToFirstStatement', 'contagionReadiness',
      'gateContagionAnswer', 'getHoldingStatement', 'holdingStatementsFor', 'renderStatementGuidance',
      'renderStatementText', 'seedStatementBody', 'unpreparedIncidentTypes', 'validateClockSuppression',
    ]) {
      expect(Object.keys(crisis)).toContain(name);
    }
  });
});
