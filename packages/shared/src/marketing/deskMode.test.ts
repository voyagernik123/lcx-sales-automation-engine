import { describe, it, expect } from 'vitest';
import {
  ACT_IS_OUTBOUND,
  ART_94_1_P,
  ART_94_1_Q,
  DEFAULT_MODE_CHANGE_POLICY,
  MODE_STRICTNESS,
  OUTBOUND_ACTS,
  POWER_HAS_STATUTORY_CEILING,
  art94CeilingDate,
  assessAuthorityOrder,
  classifyDay,
  countWorkingDays,
  deskPolicy,
  deskStanding,
  effectiveApprovalRegime,
  gateDeskAct,
  nthWorkingDayFrom,
  requestModeChange,
  standingFromOrder,
  utcDateOf,
  type AuthorityOrder,
  type DeskAct,
  type WorkingDayCalendar,
} from './deskMode.js';
import { ART_94_MAX_SUSPENSION_WORKING_DAYS, SURFACE_APPROVAL_REGIME, type DeskMode } from './types.js';

/**
 * A Liechtenstein-shaped calendar covering the whole of 2026. `holidays` is empty in
 * the base fixture so that a test which ADDS a holiday proves the holiday changed the
 * answer, rather than the fixture doing the work.
 */
const CAL_2026: WorkingDayCalendar = {
  jurisdiction: 'li',
  weekend: [0, 6],
  holidays: [],
  coversFrom: '2026-01-01',
  coversTo: '2026-12-31',
  source: 'test fixture',
};

const cal = (over: Partial<WorkingDayCalendar>): WorkingDayCalendar => ({ ...CAL_2026, ...over });

const ORDER: AuthorityOrder = {
  power: 'art_94_1_q',
  authority: 'FMA Liechtenstein',
  orderRef: 'FMA-2026-0117',
  effectiveFrom: '2026-08-03T08:00:00.000Z',
  statedEndAt: '2026-09-11T23:59:59.000Z',
  scope: { kind: 'all_marketing_communications' },
  recordedBy: 'user_nik',
  recordedAt: '2026-08-03T09:12:00.000Z',
  groundsStated: 'Suspected breach of Art 7(1) on two listing posts.',
};

const order = (over: Partial<AuthorityOrder>): AuthorityOrder => ({ ...ORDER, ...over });

const SUSPENDED: DeskMode = {
  kind: 'suspended_by_authority',
  authority: 'FMA Liechtenstein',
  orderRef: 'FMA-2026-0117',
  effectiveFrom: '2026-08-03T08:00:00.000Z',
  expiresAt: '2026-09-11T23:59:59.000Z',
  suspensionPower: 'cease_or_suspend_30_days',
  recordedBy: 'user_nik',
};

const HEIGHTENED: DeskMode = {
  kind: 'heightened',
  reason: 'Two Art 7 findings in one week; pre-clearance until the review closes.',
  imposedBy: 'user_nik',
  effectiveFrom: '2026-08-01T00:00:00.000Z',
  expiresAt: '2026-09-01T00:00:00.000Z',
};

describe('working-day arithmetic — 30 working days is not 30 days', () => {
  it('counts inclusively and skips the weekend', () => {
    // Mon 3 Aug to Fri 7 Aug inclusive = 5 working days.
    const r = countWorkingDays('2026-08-03', '2026-08-07', CAL_2026);
    expect(r).toEqual({ kind: 'computed', value: 5 });
    // Adding the weekend adds nothing.
    expect(countWorkingDays('2026-08-03', '2026-08-09', CAL_2026)).toEqual({ kind: 'computed', value: 5 });
    // A single working day counts as one, because the day of the order is spent suspended.
    expect(countWorkingDays('2026-08-03', '2026-08-03', CAL_2026)).toEqual({ kind: 'computed', value: 1 });
  });

  it('classifies weekends, holidays and uncovered days distinctly', () => {
    expect(classifyDay('2026-08-03', CAL_2026)).toBe('working');
    expect(classifyDay('2026-08-08', CAL_2026)).toBe('weekend');
    expect(classifyDay('2026-08-14', cal({ holidays: ['2026-08-14'] }))).toBe('holiday');
    expect(classifyDay('2027-01-04', CAL_2026)).toBe('not_covered');
    expect(classifyDay('2026-13-40', CAL_2026)).toBe('malformed');
    expect(classifyDay('next tuesday', CAL_2026)).toBe('malformed');
  });

  it('puts the Art 94 ceiling on 2026-09-11, not on the naive +30 days', () => {
    const ceiling = art94CeilingDate('2026-08-03', CAL_2026);
    expect(ceiling).toEqual({ kind: 'computed', value: '2026-09-11' });
    // The mistake this function exists to prevent: 2026-08-03 + 30 calendar days.
    expect(ceiling).not.toEqual({ kind: 'computed', value: '2026-09-02' });
    expect(ART_94_MAX_SUSPENSION_WORKING_DAYS).toBe(30);
  });

  it('moves the ceiling when a single weekday holiday is declared', () => {
    const withHoliday = art94CeilingDate('2026-08-03', cal({ holidays: ['2026-08-14'] }));
    expect(withHoliday).toEqual({ kind: 'computed', value: '2026-09-14' });
  });

  it('refuses rather than assuming an uncovered day was a working day', () => {
    const r = countWorkingDays('2026-12-28', '2027-01-05', CAL_2026);
    expect(r.kind).toBe('refused');
    if (r.kind !== 'refused') throw new Error('expected a refusal');
    expect(r.refusal.code).toBe('WORKING_DAY_CALENDAR_ABSENT');
    expect(r.refusal.recovery.kind).toBe('supply_data');
    expect(r.refusal.sentence).toContain('2026-01-01 to 2026-12-31');
  });

  it('refuses a reversed range instead of returning 0', () => {
    const r = countWorkingDays('2026-08-07', '2026-08-03', CAL_2026);
    expect(r.kind).toBe('refused');
    if (r.kind !== 'refused') throw new Error('expected a refusal');
    expect(r.refusal.sentence).toContain('ends (2026-08-03) before it starts');
  });

  it('refuses a non-positive or fractional working-day count', () => {
    expect(nthWorkingDayFrom('2026-08-03', 0, CAL_2026).kind).toBe('refused');
    expect(nthWorkingDayFrom('2026-08-03', 1.5, CAL_2026).kind).toBe('refused');
    expect(nthWorkingDayFrom('2026-08-03', 1, CAL_2026)).toEqual({ kind: 'computed', value: '2026-08-03' });
    // Day 1 from a Saturday is the following Monday, not the Saturday.
    expect(nthWorkingDayFrom('2026-08-08', 1, CAL_2026)).toEqual({ kind: 'computed', value: '2026-08-10' });
  });

  it('reads a calendar date off an instant, and refuses nonsense', () => {
    expect(utcDateOf('2026-08-03T08:00:00.000Z')).toBe('2026-08-03');
    expect(utcDateOf('not a date')).toBeNull();
  });
});

describe('recording an authority order', () => {
  it('accepts a well-formed Art 94(1)(q) order and computes the statutory ceiling', () => {
    const a = assessAuthorityOrder(ORDER, CAL_2026);
    expect(a.mode?.kind).toBe('suspended_by_authority');
    expect(a.statutoryCeiling).toBe('2026-09-11');
    expect(a.resumesAt).toBe('2026-09-11T23:59:59.000Z');
    expect(a.anomalies).toEqual([]);
    expect(a.statement).toContain('FMA-2026-0117');
    expect(a.statement).toContain('draft, assess, clear and log');
  });

  it('flags an order that runs past the 30-working-day ceiling — and does NOT shorten it', () => {
    const a = assessAuthorityOrder(order({ statedEndAt: '2026-10-30T00:00:00.000Z' }), CAL_2026);
    const kinds = a.anomalies.map((x) => x.kind);
    expect(kinds).toContain('exceeds_art_94_1_q_ceiling');
    // The desk stays closed for the period recorded: no self-granted relief.
    expect(a.resumesAt).toBe('2026-10-30T00:00:00.000Z');
    expect(a.mode?.expiresAt).toBe('2026-10-30T00:00:00.000Z');
  });

  it('records an Art 94(1)(p) prohibition as unbounded — a null expiry, never an invented one', () => {
    const a = assessAuthorityOrder(
      order({ power: 'art_94_1_p_prohibit', statedEndAt: null, authority: 'BaFin' }),
      CAL_2026,
    );
    /*
     * BEFORE THE INTEGRATION PASS this asserted `a.mode === null`, because
     * `DeskMode.expiresAt` was non-null and an indefinite prohibition had no legal shape.
     * The type now carries `expiresAt: Instant | null`, so the order is recordable as what
     * it is. The behaviour that must NOT change is everything else on this list: no
     * invented end date, no statutory ceiling on the (p) limb, and outbound closed.
     */
    expect(a.mode).not.toBeNull();
    expect(a.mode?.kind).toBe('suspended_by_authority');
    expect(a.mode && a.mode.kind === 'suspended_by_authority' ? a.mode.expiresAt : 'set').toBeNull();
    expect(a.mode && a.mode.kind === 'suspended_by_authority' ? a.mode.suspensionPower : null)
      .toBe('prohibit_or_suspend');
    expect(a.statutoryCeiling).toBeNull();
    expect(a.resumesAt).toBeNull();
    expect(a.anomalies.map((x) => x.kind)).toContain('prohibition_has_no_statutory_expiry');
    expect(a.statement).toContain('no end date');

    const standing = standingFromOrder(a, '2026-08-20T10:00:00.000Z', CAL_2026);
    expect(standing.outboundPermitted).toBe(false);
    expect(standing.phase).toBe('unbounded');
    expect(standing.resumesAt).toBeNull();
  });

  it('separates "no end exists" from "the end date is unreadable", and fails closed on both', () => {
    /*
     * The regression this guards. A nullable `expiresAt` makes `null` legitimate, so a
     * guard that treated every absent end as a transcription defect would report the
     * strictest order in Art 94 as a data-entry error — and, worse, a guard that treated
     * every absent end as "unbounded" would read a GARBLED date as "no ceiling to check".
     */
    const unbounded = assessAuthorityOrder(
      order({ power: 'art_94_1_p_prohibit', statedEndAt: null }),
      CAL_2026,
    );
    expect(standingFromOrder(unbounded, '2026-08-20T10:00:00.000Z', CAL_2026).phase).toBe('unbounded');

    const garbled = deskStanding(
      { ...SUSPENDED, expiresAt: 'the end of next month' },
      '2026-08-20T10:00:00.000Z',
      CAL_2026,
    );
    expect(garbled.phase).toBe('undated');
    expect(garbled.outboundPermitted).toBe(false);
    expect(garbled.resumesAt).toBeNull();
  });

  it('flags a (q) order recorded with no end date, and still refuses outbound', () => {
    const a = assessAuthorityOrder(order({ statedEndAt: null }), CAL_2026);
    expect(a.anomalies.map((x) => x.kind)).toContain('no_end_date_recorded_under_q');
    expect(a.mode).toBeNull();
    expect(standingFromOrder(a, '2026-08-20T10:00:00.000Z', CAL_2026).outboundPermitted).toBe(false);
  });

  it('fails closed on an unreadable effective date', () => {
    const a = assessAuthorityOrder(order({ effectiveFrom: 'whenever' }), CAL_2026);
    expect(a.anomalies.map((x) => x.kind)).toContain('effective_date_unparseable');
    expect(a.mode).toBeNull();
    expect(a.resumesAt).toBeNull();
    expect(standingFromOrder(a, '2026-08-20T10:00:00.000Z', null).outboundPermitted).toBe(false);
  });

  it('flags an end date before the start, and refuses to build a mode from it', () => {
    const a = assessAuthorityOrder(order({ statedEndAt: '2026-07-01T00:00:00.000Z' }), CAL_2026);
    expect(a.anomalies.map((x) => x.kind)).toContain('ends_before_it_starts');
    expect(a.mode).toBeNull();
  });

  it('names the missing transcription fields rather than accepting a nameless order', () => {
    const a = assessAuthorityOrder(order({ authority: '  ', orderRef: '', groundsStated: '' }), CAL_2026);
    const kinds = a.anomalies.map((x) => x.kind);
    expect(kinds).toContain('authority_not_named');
    expect(kinds).toContain('order_ref_missing');
    expect(kinds).toContain('grounds_not_recorded');
  });

  it('refuses to compute a ceiling with no calendar, and says who can supply one', () => {
    const a = assessAuthorityOrder(ORDER, null);
    expect(a.statutoryCeiling).toBeNull();
    const anomaly = a.anomalies.find((x) => x.kind === 'ceiling_not_computable');
    expect(anomaly).toBeDefined();
    if (anomaly?.kind !== 'ceiling_not_computable') throw new Error('expected ceiling_not_computable');
    expect(anomaly.refusal.recovery.kind).toBe('supply_data');
  });

  it('records which power was invoked, and only (q) carries the ceiling', () => {
    expect(POWER_HAS_STATUTORY_CEILING.art_94_1_q).toBe(true);
    expect(POWER_HAS_STATUTORY_CEILING.art_94_1_p_suspend).toBe(false);
    expect(POWER_HAS_STATUTORY_CEILING.art_94_1_p_prohibit).toBe(false);
    expect(ART_94_1_Q.text).toContain('30 consecutive working days');
    expect(ART_94_1_P.text).not.toContain('30');
  });
});

describe('standing — is the mode actually in force at this instant', () => {
  it('closes the desk while a suspension is in force, and counts the working days left', () => {
    const s = deskStanding(SUSPENDED, '2026-09-07T09:00:00.000Z', CAL_2026);
    expect(s.phase).toBe('in_force');
    expect(s.outboundPermitted).toBe(false);
    expect(s.resumesAt).toBe('2026-09-11T23:59:59.000Z');
    // Mon 7 Sep to Fri 11 Sep inclusive = 5 working days.
    expect(s.workingDaysRemaining).toEqual({ kind: 'computed', value: 5 });
    expect(s.statement).toContain('FMA Liechtenstein');
    expect(s.statement).toContain('FMA-2026-0117');
    expect(s.statement).toContain('5 working day(s) remain');
  });

  it('will not print a calendar-day countdown when no calendar was supplied', () => {
    const s = deskStanding(SUSPENDED, '2026-09-07T09:00:00.000Z', null);
    expect(s.workingDaysRemaining).toBeNull();
    expect(s.statement).toContain('No working-day calendar was supplied');
    expect(s.outboundPermitted).toBe(false);
  });

  it('does not treat a future order as already in force', () => {
    const s = deskStanding(SUSPENDED, '2026-08-01T09:00:00.000Z', CAL_2026);
    expect(s.phase).toBe('pending');
    expect(s.outboundPermitted).toBe(true);
    expect(s.statement).toContain('not suspended yet');
  });

  it('reopens the desk when the order expires, and says the lift was never recorded', () => {
    const s = deskStanding(SUSPENDED, '2026-09-20T09:00:00.000Z', CAL_2026);
    expect(s.phase).toBe('lapsed');
    expect(s.outboundPermitted).toBe(true);
    expect(s.lapsedWithoutLiftRecord).toBe(true);
    expect(s.statement).toContain('no lift was recorded');
  });

  it('fails CLOSED when a suspension carries an unreadable date', () => {
    const broken: DeskMode = { ...SUSPENDED, expiresAt: 'sometime in the autumn' } as DeskMode;
    const s = deskStanding(broken, '2026-09-07T09:00:00.000Z', CAL_2026);
    expect(s.phase).toBe('undated');
    expect(s.outboundPermitted).toBe(false);
    expect(s.resumesAt).toBeNull();
    expect(s.statement).toContain('cannot read');
  });

  it('leaves normal mode open and says what still applies', () => {
    const s = deskStanding({ kind: 'normal' }, '2026-08-20T09:00:00.000Z', CAL_2026);
    expect(s.outboundPermitted).toBe(true);
    expect(s.phase).toBe('not_applicable');
    expect(s.statement).toContain('pre-approval');
  });

  it('keeps heightened mode open but says every surface needs pre-approval', () => {
    const s = deskStanding(HEIGHTENED, '2026-08-20T09:00:00.000Z', CAL_2026);
    expect(s.phase).toBe('in_force');
    expect(s.outboundPermitted).toBe(true);
    expect(s.statement).toContain('Every surface needs pre-approval');
  });
});

describe('the gate — a suspended desk refuses outbound and says why', () => {
  const suspendedStanding = deskStanding(SUSPENDED, '2026-09-07T09:00:00.000Z', CAL_2026);

  it('refuses every act that moves text towards the public', () => {
    for (const act of OUTBOUND_ACTS) {
      const r = gateDeskAct(suspendedStanding, act);
      expect(r, act).not.toBeNull();
      expect(r?.code).toBe('DESK_SUSPENDED_BY_AUTHORITY');
      expect(r?.rule.provision).toBe('Art 94(1)(q)');
      expect(r?.recovery.kind).toBe('wait_until');
      expect(r?.sentence).toContain('FMA Liechtenstein');
      expect(r?.sentence).toContain('FMA-2026-0117');
      expect(r?.sentence).toContain('5 working day(s) remain');
      // It names the obvious workaround and closes it.
      expect(r?.sentence).toContain('personal account');
    }
  });

  it('lets the record continue: drafting, assessment, clearance and logging', () => {
    const recordActs: readonly DeskAct[] = ['draft', 'assess', 'triage', 'clear', 'log', 'export_for_record'];
    for (const act of recordActs) {
      expect(gateDeskAct(suspendedStanding, act), act).toBeNull();
    }
  });

  it('gates nothing in normal mode', () => {
    const normal = deskStanding({ kind: 'normal' }, '2026-08-20T09:00:00.000Z');
    for (const act of OUTBOUND_ACTS) expect(gateDeskAct(normal, act), act).toBeNull();
  });

  it('cites Art 94(1)(p) rather than (q) for an indefinite prohibition', () => {
    const a = assessAuthorityOrder(order({ power: 'art_94_1_p_prohibit', statedEndAt: null }), CAL_2026);
    const s = standingFromOrder(a, '2026-08-20T09:00:00.000Z', CAL_2026);
    const r = gateDeskAct(s, 'handoff');
    expect(r?.rule.provision).toBe('Art 94(1)(p)');
    expect(r?.sentence).toContain('no maximum period');
    expect(r?.recovery).toEqual({ kind: 'wait_until', condition: 'a written withdrawal from FMA Liechtenstein' });
  });

  it('refuses a named-scope act that does not say which item it concerns', () => {
    const scoped = deskStanding(SUSPENDED, '2026-09-07T09:00:00.000Z', CAL_2026, {
      kind: 'named',
      itemRefs: ['post_991'],
      description: 'the two LCX listing posts of 30 July',
    });
    const unnamed = gateDeskAct(scoped, 'handoff', null);
    expect(unnamed?.code).toBe('DESK_SUSPENDED_BY_AUTHORITY');
    expect(unnamed?.recovery.kind).toBe('supply_data');
    // In scope → refused. Out of scope → permitted, because the order says so.
    expect(gateDeskAct(scoped, 'handoff', 'post_991')).not.toBeNull();
    expect(gateDeskAct(scoped, 'handoff', 'post_777')).toBeNull();
  });

  it('still refuses outbound when the suspension record is undated, under its own code', () => {
    const broken = deskStanding({ ...SUSPENDED, expiresAt: 'autumn' } as DeskMode, '2026-09-07T09:00:00.000Z', CAL_2026);
    const r = gateDeskAct(broken, 'copy_out');
    /*
     * SAME OUTCOME, DIFFERENT FINDING. This asserted `DESK_SUSPENDED_BY_AUTHORITY`, which is
     * true but not useful: it puts a record-keeping defect in the same refusal-frequency
     * bucket as a supervisory event, and the two have different owners and different fixes.
     * "An authority closed us" is answered by waiting or by a withdrawal letter; "we
     * transcribed the order with a date nothing can read" has to be answered today, because
     * until it is, nobody knows when the desk reopens.
     */
    expect(r?.code).toBe('INSTANT_UNPARSEABLE');
    expect(r?.sentence).toContain('unreadable date');
    // The consequence is unchanged: outbound is shut and the reason is on the record.
    expect(broken.outboundPermitted).toBe(false);
    expect(r?.recovery).toEqual({ kind: 'wait_until', condition: 'a written withdrawal from FMA Liechtenstein' });
  });

  it('reopens the gate once the order has expired', () => {
    const lapsed = deskStanding(SUSPENDED, '2026-09-20T09:00:00.000Z', CAL_2026);
    for (const act of OUTBOUND_ACTS) expect(gateDeskAct(lapsed, act), act).toBeNull();
  });
});

describe('mode transitions — tightening is one signature, loosening is two', () => {
  const escalate = requestModeChange(
    { kind: 'normal' },
    {
      to: HEIGHTENED,
      by: 'user_nik',
      byRoles: ['reputation'],
      at: '2026-08-01T00:00:00.000Z',
      reason: 'Two Art 7 findings in one week.',
      authorityWithdrawal: null,
    },
    '2026-08-01T00:00:00.000Z',
  );

  it('lets anyone who can see trouble tighten the desk', () => {
    expect(escalate.kind).toBe('accepted');
    if (escalate.kind !== 'accepted') throw new Error('expected acceptance');
    expect(escalate.transition.direction).toBe('escalation');
    expect(escalate.transition.statement).toContain('user_nik');
    expect(escalate.transition.statement).toContain('Two Art 7 findings');
  });

  it('refuses to let the imposer lift their own mode', () => {
    const out = requestModeChange(
      HEIGHTENED,
      {
        to: { kind: 'normal' },
        by: 'user_nik',
        byRoles: ['policy', 'legal'],
        at: '2026-08-10T00:00:00.000Z',
        reason: 'The review closed with no further findings.',
        authorityWithdrawal: null,
      },
      '2026-08-10T00:00:00.000Z',
    );
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') throw new Error('expected a refusal');
    expect(out.refusals.map((r) => r.code)).toContain('SELF_APPROVAL_FORBIDDEN');
    expect(out.refusals[0]?.sentence).toContain('cannot also lift it');
  });

  it('refuses a relaxation by someone without a relaxing role', () => {
    const out = requestModeChange(
      HEIGHTENED,
      {
        to: { kind: 'normal' },
        by: 'user_intern',
        byRoles: ['sme'],
        at: '2026-08-10T00:00:00.000Z',
        reason: 'The review closed with no further findings.',
        authorityWithdrawal: null,
      },
      '2026-08-10T00:00:00.000Z',
    );
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') throw new Error('expected a refusal');
    expect(out.refusals.map((r) => r.code)).toContain('DESK_HEIGHTENED_PRECLEARANCE_REQUIRED');
    expect(out.refusals[0]?.recovery.kind).toBe('human_authority');
  });

  it('accepts a relaxation by a different named policy owner', () => {
    const out = requestModeChange(
      HEIGHTENED,
      {
        to: { kind: 'normal' },
        by: 'user_lena',
        byRoles: ['policy'],
        at: '2026-08-10T00:00:00.000Z',
        reason: 'Review closed; both findings corrected and re-cleared.',
        authorityWithdrawal: null,
      },
      '2026-08-10T00:00:00.000Z',
    );
    expect(out.kind).toBe('accepted');
    if (out.kind !== 'accepted') throw new Error('expected acceptance');
    expect(out.transition.direction).toBe('relaxation');
  });

  it('refuses a mode change with a reason too short to mean anything', () => {
    const out = requestModeChange(
      { kind: 'normal' },
      {
        to: HEIGHTENED,
        by: 'user_nik',
        byRoles: ['policy'],
        at: '2026-08-01T00:00:00.000Z',
        reason: 'because',
        authorityWithdrawal: null,
      },
      '2026-08-01T00:00:00.000Z',
    );
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') throw new Error('expected a refusal');
    expect(out.refusals[0]?.recovery.kind).toBe('edit_text');
    expect(DEFAULT_MODE_CHANGE_POLICY.minReasonChars).toBeGreaterThan(0);
  });

  it('will not let the desk reopen itself out of a live suspension', () => {
    const out = requestModeChange(
      SUSPENDED,
      {
        to: { kind: 'normal' },
        by: 'user_lena',
        byRoles: ['policy', 'legal'],
        at: '2026-09-01T00:00:00.000Z',
        reason: 'The campaign deadline is Thursday and we need to publish.',
        authorityWithdrawal: null,
      },
      '2026-09-01T00:00:00.000Z',
    );
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') throw new Error('expected a refusal');
    expect(out.refusals.map((r) => r.code)).toContain('DESK_SUSPENDED_BY_AUTHORITY');
    expect(out.refusals[0]?.sentence).toContain('cannot be reopened from inside');
  });

  it("accepts an early lift only on the authority's own withdrawal, and only with its reference", () => {
    const base = {
      to: { kind: 'normal' } as DeskMode,
      by: 'user_lena',
      byRoles: ['policy'] as const,
      at: '2026-09-01T00:00:00.000Z',
      reason: 'FMA withdrew the order after the two posts were corrected.',
    };
    const noRef = requestModeChange(
      SUSPENDED,
      { ...base, authorityWithdrawal: { authority: 'FMA Liechtenstein', ref: '  ', at: '2026-09-01T00:00:00.000Z' } },
      '2026-09-01T00:00:00.000Z',
    );
    expect(noRef.kind).toBe('refused');
    const withRef = requestModeChange(
      SUSPENDED,
      { ...base, authorityWithdrawal: { authority: 'FMA Liechtenstein', ref: 'FMA-2026-0117-W', at: '2026-09-01T00:00:00.000Z' } },
      '2026-09-01T00:00:00.000Z',
    );
    expect(withRef.kind).toBe('accepted');
  });

  it('lets the desk return to normal once the order has expired, with no withdrawal', () => {
    const out = requestModeChange(
      SUSPENDED,
      {
        to: { kind: 'normal' },
        by: 'user_lena',
        byRoles: ['policy'],
        at: '2026-09-14T00:00:00.000Z',
        reason: 'Order expired 11 September; recording the lift.',
        authorityWithdrawal: null,
      },
      '2026-09-14T00:00:00.000Z',
    );
    expect(out.kind).toBe('accepted');
  });

  it('refuses to enter a suspension that names no authority or reference', () => {
    const out = requestModeChange(
      { kind: 'normal' },
      {
        to: { ...SUSPENDED, orderRef: '' } as DeskMode,
        by: 'user_nik',
        byRoles: ['policy'],
        at: '2026-08-03T09:00:00.000Z',
        reason: 'An order arrived by email this morning.',
        authorityWithdrawal: null,
      },
      '2026-08-03T09:00:00.000Z',
    );
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') throw new Error('expected a refusal');
    expect(out.refusals[0]?.sentence).toContain('order reference');
  });

  it('ranks the modes so the asymmetry is enforceable', () => {
    expect(MODE_STRICTNESS.normal).toBeLessThan(MODE_STRICTNESS.heightened);
    expect(MODE_STRICTNESS.heightened).toBeLessThan(MODE_STRICTNESS.suspended_by_authority);
  });
});

describe('what each mode changes about review', () => {
  it('forbids exactly the three outbound acts under suspension, and nothing else', () => {
    const p = deskPolicy('suspended_by_authority');
    expect([...p.forbiddenActs].sort()).toEqual([...OUTBOUND_ACTS].sort());
    expect(p.outboundPermitted).toBe(false);
    expect(p.permittedActs).toContain('draft');
    expect(p.permittedActs).toContain('log');
    expect(p.note).toContain('supervisor');
  });

  it('withdraws risk-based sampling under heightened mode', () => {
    expect(deskPolicy('normal').interactiveSamplingPermitted).toBe(true);
    expect(deskPolicy('heightened').interactiveSamplingPermitted).toBe(false);
    expect(deskPolicy('suspended_by_authority').interactiveSamplingPermitted).toBe(false);
    expect(deskPolicy('heightened').approvalRegimeOverride).toBe('pre_approval_required');
    expect(deskPolicy('normal').approvalRegimeOverride).toBeNull();
  });

  it('keeps ACT_IS_OUTBOUND and OUTBOUND_ACTS in agreement', () => {
    const derived = (Object.keys(ACT_IS_OUTBOUND) as DeskAct[]).filter((a) => ACT_IS_OUTBOUND[a]);
    expect(derived.sort()).toEqual([...OUTBOUND_ACTS].sort());
  });

  it('upgrades an interactive surface to pre-approval under heightened mode, and says so', () => {
    const heightened = deskStanding(HEIGHTENED, '2026-08-20T09:00:00.000Z');
    const r = effectiveApprovalRegime(heightened, 'interactive', SURFACE_APPROVAL_REGIME.interactive);
    expect(r.regime).toBe('pre_approval_required');
    expect(r.upgradedByMode).toBe(true);
    expect(r.why).toContain('heightened');

    // A static surface already needed pre-approval, so nothing is claimed to have changed.
    const stat = effectiveApprovalRegime(heightened, 'static', SURFACE_APPROVAL_REGIME.static);
    expect(stat.upgradedByMode).toBe(false);
    expect(stat.why).toBeNull();
  });

  it('leaves the surface default alone in normal mode', () => {
    const normal = deskStanding({ kind: 'normal' }, '2026-08-20T09:00:00.000Z');
    const r = effectiveApprovalRegime(normal, 'interactive', SURFACE_APPROVAL_REGIME.interactive);
    expect(r).toEqual({ regime: 'risk_based_review_plus_retention', upgradedByMode: false, why: null });
  });
});
