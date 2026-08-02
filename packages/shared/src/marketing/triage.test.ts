import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  IMPERSONATION_BAND_DEFINITION,
  IMPERSONATION_TILE_LABEL,
  IMPERSONATION_VISIBILITY_REASON,
  NOTABLY_FORBIDDEN_TRANSITIONS,
  PRIORITY_MIN_REACH_RANK,
  RESPONSE_KINDS,
  RHETORIC_MIN_ITEMS,
  ROLE_CLAIM_TOKENS,
  SCAM_LEXICON,
  SCAM_LEXICON_COVERAGE_REASON,
  SCAM_LEXICON_VERSION,
  SIGNAL_FAMILIES,
  TIMING_NOT_SCORED_REASON,
  TEMPLATE_REUSE_MIN_HANDLES,
  TIER_LEADING_RESPONSES,
  TEMPLATE_REUSE_MIN_SIMILARITY,
  TRIAGE_ONLY_REFUSAL_CODES,
  TRIAGE_RULESET_VERSION,
  TRIAGE_TRANSITIONS,
  TTFS_BUDGET_MINUTES_BY_TIER,
  UNOBSERVABLE_ACCOUNT_SIGNALS,
  applyPriority,
  assertAttribution,
  bandOf,
  boundedLevenshtein,
  canTransition,
  checkDebunk,
  checkGrade,
  checkReach,
  checkResponseAction,
  countImpersonationSignalsInOwnMentions,
  derivePriority,
  foldConfusables,
  gateOpinion,
  handleSkeleton,
  ownMentionsFrame,
  readImpersonationSignals,
  readRhetoricPattern,
  readTemplateReuse,
  readTriageClock,
  reachTrajectory,
  recordSilence,
  refuseAbsentBudget,
  refuseComputedReach,
  refuseDebunkOfOpinion,
  refuseImpersonationPrevalence,
  refuseUnobservableSignal,
  refuseUnsupportedPriority,
  suggestFirstIndicators,
  suppressTriageClock,
  transitionTriage,
} from './triage.js';
import type {
  ImpersonationSignal,
  TriageOnlyRefusalCode,
  TriageRefusal,
} from './triage.js';
import { PRIORITY_MEANING, REFUSAL_CODES } from './types.js';
import type {
  ActorId,
  Graded,
  ImpactRow,
  ImpactSeverity,
  Instant,
  ReachAssessment,
  ReachLevel,
  ResponseAction,
  TriageState,
} from './types.js';

/* ── Fixtures. One clock, so nothing in this file depends on the real one. ── */

const NOW: Instant = '2026-08-02T12:00:00.000Z';
const T_MINUS_10: Instant = '2026-08-02T11:50:00.000Z';
const T_MINUS_45: Instant = '2026-08-02T11:15:00.000Z';
const LATER: Instant = '2026-08-09T12:00:00.000Z';
const EARLIER: Instant = '2026-07-30T12:00:00.000Z';
const ALICE: ActorId = 'actor-alice';
const BOB: ActorId = 'actor-bob';

function graded<T>(value: T, confidence: 'L' | 'M' | 'H', basis = 'observed in the mailbox'): Graded<T> {
  return { value, confidence, basis };
}

function reach(current: ReachLevel, previous: ReachLevel | null = null, previousAt: Instant | null = null): ReachAssessment {
  return {
    current: graded(current, 'M', 'estimated from the replies we can see'),
    previous: previous === null ? null : graded(previous, 'M', 'the previous read'),
    previousAt,
  };
}

function impacts(
  entries: readonly [ImpactRow, ImpactSeverity, 'L' | 'M' | 'H'][],
): Partial<Record<ImpactRow, Graded<ImpactSeverity>>> {
  const out: Partial<Record<ImpactRow, Graded<ImpactSeverity>>> = {};
  for (const [row, severity, confidence] of entries) out[row] = graded(severity, confidence);
  return out;
}

const FRAME = ownMentionsFrame({
  windowFrom: EARLIER,
  windowTo: NOW,
  lastSuccessfulPollAt: T_MINUS_10,
});

/** Every refusal this compartment emits must carry all four parts. */
function expectWellFormedRefusal(r: TriageRefusal): void {
  expect(typeof r.code).toBe('string');
  expect(r.code.length).toBeGreaterThan(0);
  expect(r.sentence.trim().length).toBeGreaterThan(0);
  expect(r.rule.instrument.length).toBeGreaterThan(0);
  expect(r.rule.provision.trim().length).toBeGreaterThan(0);
  expect(r.rule.text.trim().length).toBeGreaterThan(0);
  expect(r.recovery.kind.length).toBeGreaterThan(0);
  expect(r.ruleSetVersion).toBe(TRIAGE_RULESET_VERSION);
}

function codes(rs: readonly TriageRefusal[]): readonly string[] {
  return rs.map((r) => r.code);
}

/* ════════════════════════════════════════════════════════════════════════════
 *  Code hygiene and the ratchets
 * ════════════════════════════════════════════════════════════════════════════ */

describe('refusal codes', () => {
  it('the array and the union agree in both directions', () => {
    /* Compile-time: every array member is a member of the union, and every union
     * member is coverable by the array's element type. */
    const fromArray: readonly TriageOnlyRefusalCode[] = TRIAGE_ONLY_REFUSAL_CODES;
    const sample: TriageOnlyRefusalCode = 'IGNORE_WITHOUT_RATIONALE';
    expect(fromArray).toContain(sample);
    /* Runtime: no duplicates, none empty. */
    expect(new Set(TRIAGE_ONLY_REFUSAL_CODES).size).toBe(TRIAGE_ONLY_REFUSAL_CODES.length);
    expect(TRIAGE_ONLY_REFUSAL_CODES.every((c) => c.trim() === c && c.length > 0)).toBe(true);
  });

  it('holds every triage code inside the ONE shared refusal namespace', () => {
    /*
     * INVERTED BY THE INTEGRATION PASS, for cause. This asserted that no triage code was
     * in `REFUSAL_CODES` — which is what kept 28 gates outside the array that
     * `loop.ts:refusalCodeFrequency` enumerates to find the gates that never fired. A gate
     * the measurement cannot see is not a gate the desk can trust.
     */
    const shared = new Set<string>(REFUSAL_CODES);
    const missing = TRIAGE_ONLY_REFUSAL_CODES.filter((c) => !shared.has(c));
    expect(missing).toEqual([]);
  });

  it('uses the shared code where one exists, so refusal counts do not split', () => {
    /* The three shared codes this file deliberately reuses rather than re-inventing. */
    const rumour = checkDebunk(
      { factLead: 'a', mythRestated: 'b', fallacy: 'c', factRepeat: 'd' },
      { mythIsPriceRelevant: true, mythVerifiedFalse: false, verifiability: 'verifiable_factual' },
    );
    expect(codes(rumour)).toContain('ART_91_2_C_RUMOUR_RESTATED');

    const attribution = assertAttribution({
      actorDescription: 'a network',
      concurringBy: [ALICE],
      assertedAt: NOW,
      confidence: 'M',
      basis: 'two accounts posted the same text',
    });
    expect(attribution.kind).toBe('refused');
    if (attribution.kind === 'refused') {
      expect(attribution.refusal.code).toBe('ATTRIBUTION_REQUIRES_CONCURRENCE');
    }

    const empty = countImpersonationSignalsInOwnMentions({
      readings: [],
      frame: ownMentionsFrame({ windowFrom: EARLIER, windowTo: NOW, lastSuccessfulPollAt: null }),
    });
    expect(empty.kind).toBe('absent');
    if (empty.kind === 'absent') expect(empty.refusal.code).toBe('DATA_ABSENT_NOT_ZERO');
  });
});

describe('the source itself', () => {
  const raw = readFileSync(new URL('./triage.ts', import.meta.url), 'utf8');

  /**
   * The ratchets below must read CODE, not prose. The file's own docblock says "no
   * `Date.now()`" and "no `acceptRisk` parameter", and a grep that cannot tell a
   * promise from an implementation would fail on the promise.
   */
  const source = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\/])\/\/.*$/gm, '$1');

  it('strips comments before asserting, or the assertions below mean nothing', () => {
    expect(raw).toMatch(/Turkish dotted capital I/);
    expect(source).not.toMatch(/Turkish dotted capital I/);
    expect(source).toMatch(/export function foldConfusables/);
  });

  it('is pure: no clock, no randomness, no I/O', () => {
    expect(source).not.toMatch(/Date\.now\(/);
    expect(source).not.toMatch(/Math\.random\(/);
    expect(source).not.toMatch(/\bnew Date\(/);
    expect(source).not.toMatch(/\bfetch\(/);
    expect(source).not.toMatch(/from 'node:/);
  });

  it('holds no path that could act as the LCX account', () => {
    /* r5's strongest defence is the absence of a write path. Asserting the absence
     * makes it a ratchet instead of a habit. */
    expect(source).not.toMatch(/api\.x\.com|api\.twitter\.com/);
    expect(source).not.toMatch(/\boauth\b/i);
    expect(source).not.toMatch(/postTweet|sendTweet|publishPost|schedulePost/);
    expect(source).not.toMatch(/access_token|bearerToken|credential[sS]tore/);
  });

  it('carries no suppression flag that defeats a refusal', () => {
    expect(source).not.toMatch(/\bforce\??:/);
    expect(source).not.toMatch(/acceptRisk|overrideRefusal|ignoreRefusals/);
    expect(source).not.toMatch(/@ts-ignore|eslint-disable|\.skip\(|\.only\(/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  §2 the opinion gate
 * ════════════════════════════════════════════════════════════════════════════ */

describe('the opinion gate', () => {
  it('an opinion is not disinformation and may not be debunked', () => {
    const v = gateOpinion('opinion');
    expect(v.inScopeAsDisinformation).toBe(false);
    expect(v.debunkEligible).toBe(false);
    expect(v.route).toBe('engage_on_merits_or_ignore');
    expect(v.rule.instrument).toBe('resist_2');
  });

  it('a verifiable factual claim reaches the correction path', () => {
    const v = gateOpinion('verifiable_factual');
    expect(v.route).toBe('correction_path');
    expect(v.debunkEligible).toBe(true);
    expect(v.inScopeAsDisinformation).toBe(true);
  });

  it('an opinion resting on a false fact routes to the premise, not the view', () => {
    const v = gateOpinion('opinion_resting_on_false_fact');
    expect(v.route).toBe('investigate_false_premise');
    expect(v.debunkEligible).toBe(true);
    expect(v.sentence).toMatch(/premise/);
  });

  it('refusing to debunk an opinion is not recoverable by rewording', () => {
    const r = refuseDebunkOfOpinion('LCX is the worst exchange');
    expectWellFormedRefusal(r);
    expect(r.code).toBe('RESIST_DEBUNK_OF_OPINION_REFUSED');
    expect(r.recovery.kind).toBe('not_recoverable');
    expect(r.matched).toBe('LCX is the worst exchange');
  });
});

describe('the debunk template', () => {
  const full = { factLead: 'f', mythRestated: 'm', fallacy: 'x', factRepeat: 'f again' };

  it('accepts a complete debunk of a verified-false, price-relevant myth', () => {
    expect(
      checkDebunk(full, {
        mythIsPriceRelevant: true,
        mythVerifiedFalse: true,
        verifiability: 'verifiable_factual',
      }),
    ).toEqual([]);
  });

  it('names every missing part rather than failing on the first', () => {
    const out = checkDebunk(
      { factLead: '', mythRestated: 'm', fallacy: '   ', factRepeat: '' },
      { mythIsPriceRelevant: false, mythVerifiedFalse: false, verifiability: 'verifiable_factual' },
    );
    expect(codes(out)).toEqual(['DEBUNK_STRUCTURE_INCOMPLETE']);
    expect(out[0]!.sentence).toMatch(/factLead/);
    expect(out[0]!.sentence).toMatch(/fallacy/);
    expect(out[0]!.sentence).toMatch(/factRepeat/);
    expect(out[0]!.sentence).not.toMatch(/mythRestated/);
  });

  it('refuses to restate an unverified price-relevant claim, citing Art 91(2)(c)', () => {
    const out = checkDebunk(full, {
      mythIsPriceRelevant: true,
      mythVerifiedFalse: false,
      verifiability: 'verifiable_factual',
    });
    expect(codes(out)).toEqual(['ART_91_2_C_RUMOUR_RESTATED']);
    expect(out[0]!.rule.provision).toBe('Art 91(2)(c)');
    expect(out[0]!.recovery.kind).toBe('wait_until');
    expect(out[0]!.matched).toBe('m');
  });

  it('refuses a debunk of an opinion even when the structure is perfect', () => {
    const out = checkDebunk(full, {
      mythIsPriceRelevant: false,
      mythVerifiedFalse: false,
      verifiability: 'opinion',
    });
    expect(codes(out)).toContain('RESIST_DEBUNK_OF_OPINION_REFUSED');
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  §4 grades and attribution
 * ════════════════════════════════════════════════════════════════════════════ */

describe('graded judgements', () => {
  it('a grade with no basis is refused', () => {
    const r = checkGrade('isFalse', { value: true, confidence: 'H', basis: '  ' });
    expect(r).not.toBeNull();
    expectWellFormedRefusal(r!);
    expect(r!.code).toBe('GRADE_BASIS_MISSING');
    expect(r!.sentence).toMatch(/isFalse/);
  });

  it('a grade with a basis passes', () => {
    expect(checkGrade('isFalse', graded(true, 'M'))).toBeNull();
  });
});

describe('attribution', () => {
  it('needs two DISTINCT humans; one person named twice is not agreement', () => {
    const out = assertAttribution({
      actorDescription: 'coordinated network',
      concurringBy: [ALICE, ALICE, '  '],
      assertedAt: NOW,
      confidence: 'M',
      basis: 'the same text from six handles',
    });
    expect(out.kind).toBe('refused');
    if (out.kind === 'refused') {
      expect(out.concurringCount).toBe(1);
      expectWellFormedRefusal(out.refusal);
      expect(out.refusal.recovery.kind).toBe('human_authority');
    }
  });

  it('two distinct humans with a basis can attribute', () => {
    const out = assertAttribution({
      actorDescription: 'coordinated network',
      concurringBy: [ALICE, BOB],
      assertedAt: NOW,
      confidence: 'M',
      basis: 'the same text from six handles',
    });
    expect(out.kind).toBe('asserted');
    if (out.kind === 'asserted') {
      expect(out.assertion.concurringBy).toEqual([ALICE, BOB]);
      expect(out.assertion.assertedAt).toBe(NOW);
    }
  });

  it('refuses without a basis even with enough humans', () => {
    const out = assertAttribution({
      actorDescription: 'coordinated network',
      concurringBy: [ALICE, BOB],
      assertedAt: NOW,
      confidence: 'H',
      basis: '   ',
    });
    expect(out.kind).toBe('refused');
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  §5 the reach ladder
 * ════════════════════════════════════════════════════════════════════════════ */

describe('the reach ladder', () => {
  it('refuses a reach estimate with no basis', () => {
    const r = checkReach({ current: { value: 'trending', confidence: 'M', basis: '' }, previous: null, previousAt: null });
    expect(r).not.toBeNull();
    expect(r!.code).toBe('REACH_ESTIMATE_BASIS_MISSING');
    expect(r!.matched).toBe('trending');
  });

  it('refuses when the PREVIOUS estimate has no basis, because the trajectory is the trigger', () => {
    const r = checkReach({
      current: graded<ReachLevel>('trending', 'M'),
      previous: { value: 'little_interest', confidence: 'L', basis: '' },
      previousAt: T_MINUS_45,
    });
    expect(r).not.toBeNull();
    expect(r!.matched).toBe('little_interest');
  });

  it('accepts a fully-based assessment', () => {
    expect(checkReach(reach('trending', 'filter_bubble', T_MINUS_45))).toBeNull();
  });

  it('will not compute a reach level from observed counts', () => {
    const r = refuseComputedReach('12 replies observed');
    expectWellFormedRefusal(r);
    expect(r.code).toBe('REACH_ESTIMATE_COMPUTED_NOT_JUDGED');
    expect(r.sentence).toMatch(/lower bounds/);
  });

  it('a first estimate has no direction', () => {
    const t = reachTrajectory(reach('trending'), NOW);
    expect(t.kind).toBe('first_estimate');
    if (t.kind === 'first_estimate') expect(t.rank).toBe(3);
  });

  it('reports escalation, its size and how long ago the previous read was', () => {
    const t = reachTrajectory(reach('minor_story', 'little_interest', T_MINUS_45), NOW);
    expect(t.kind).toBe('escalated');
    if (t.kind !== 'first_estimate') {
      expect(t.steps).toBe(3);
      expect(t.fromLevel).toBe('little_interest');
      expect(t.toLevel).toBe('minor_story');
      expect(t.sincePreviousMinutes).toBe(45);
    }
  });

  it('reports de-escalation and unchanged separately', () => {
    expect(reachTrajectory(reach('filter_bubble', 'trending', T_MINUS_10), NOW).kind).toBe('de_escalated');
    expect(reachTrajectory(reach('trending', 'trending', T_MINUS_10), NOW).kind).toBe('unchanged');
  });

  it('leaves the elapsed figure null rather than 0 when the previous read was not timestamped', () => {
    const t = reachTrajectory(reach('trending', 'filter_bubble', null), NOW);
    if (t.kind !== 'first_estimate') expect(t.sincePreviousMinutes).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  §6 the three priority tiers
 * ════════════════════════════════════════════════════════════════════════════ */

describe('priority derivation', () => {
  it('defaults to low, and low means lines prepared with no response made', () => {
    const d = derivePriority({ reach: reach('little_interest'), impacts: {} });
    expect(d.tier).toBe('low');
    expect(d.meaning).toBe(PRIORITY_MEANING.low);
    expect(d.meaning).toMatch(/no response is made/);
    expect(d.driving).toBeNull();
  });

  it('is medium on a medium impact that is trending', () => {
    const d = derivePriority({
      reach: reach('trending'),
      impacts: impacts([['reputation', 'medium', 'M']]),
    });
    expect(d.tier).toBe('medium');
    expect(d.driving?.row).toBe('reputation');
    expect(d.reachRank).toBe(PRIORITY_MIN_REACH_RANK.medium);
  });

  it('is not medium when circulation is below trending, however bad the impact', () => {
    const d = derivePriority({
      reach: reach('filter_bubble'),
      impacts: impacts([['ability_to_deliver_services', 'high', 'H']]),
    });
    expect(d.tier).toBe('low');
    expect(d.unmetForNextTier).toContain('reach is below trending, so circulation is limited');
  });

  it('is high only on a high impact at H confidence, headline-level reach and a mostly-high evidence picture', () => {
    const d = derivePriority({
      reach: reach('headline_story'),
      impacts: impacts([['ability_to_deliver_services', 'high', 'H']]),
      supportingGrades: ['H'],
    });
    expect(d.tier).toBe('high');
    expect(d.evidenceQuality).toBe('mostly_high');
    expect(d.unmetForNextTier).toEqual([]);
  });

  it('drops to medium when one judgement is L, because the evidence is then mixed', () => {
    const d = derivePriority({
      reach: reach('headline_story'),
      impacts: impacts([['ability_to_deliver_services', 'high', 'H']]),
      supportingGrades: ['L'],
    });
    expect(d.tier).toBe('medium');
    expect(d.evidenceQuality).toBe('mixed');
    expect(d.unmetForNextTier).toContain('the evidence picture is mixed, not mostly high confidence');
  });

  it('a confident, coordinated, verifiably false claim with no impact on any protectee is LOW', () => {
    /* The doctrine test. RESIST: the desk is not the arbiter of truth. Falsity does
     * not set the tier; consequence does. */
    const d = derivePriority({
      reach: reach('filter_bubble'),
      impacts: impacts([['climate_of_debate', 'low', 'H']]),
      supportingGrades: ['H', 'H'],
    });
    expect(d.tier).toBe('low');
    expect(d.reason).toMatch(/no protectee/);
  });

  it('picks the worst row as the driver, and breaks a tie on confidence', () => {
    const d = derivePriority({
      reach: reach('trending'),
      impacts: impacts([
        ['climate_of_debate', 'high', 'L'],
        ['reputation', 'high', 'H'],
        ['niche_audiences', 'low', 'H'],
      ]),
    });
    expect(d.driving?.row).toBe('reputation');
    expect(d.driving?.confidence).toBe('H');
  });

  it('ignores rows explicitly assessed as none', () => {
    const d = derivePriority({
      reach: reach('headline_story'),
      impacts: impacts([['reputation', 'none', 'H']]),
    });
    expect(d.driving).toBeNull();
    expect(d.tier).toBe('low');
  });
});

describe('priority overrides', () => {
  const derivation = derivePriority({ reach: reach('trending'), impacts: {} });

  it('stands as derived when nothing is requested', () => {
    const out = applyPriority({ derivation, at: NOW });
    expect(out.kind).toBe('derived');
    if (out.kind === 'derived') expect(out.tier).toBe('low');
  });

  it('refuses an unattributed override', () => {
    const out = applyPriority({ derivation, requested: 'high', rationale: 'gut feel', by: '  ', at: NOW });
    expect(out.kind).toBe('refused');
    if (out.kind === 'refused') {
      expectWellFormedRefusal(out.refusal);
      expect(out.refusal.code).toBe('PRIORITY_OVERRIDE_UNATTRIBUTED');
    }
  });

  it('refuses an unreasoned override', () => {
    const out = applyPriority({ derivation, requested: 'high', by: ALICE, at: NOW });
    expect(out.kind).toBe('refused');
    if (out.kind === 'refused') expect(out.refusal.code).toBe('PRIORITY_OVERRIDE_UNREASONED');
  });

  it('records a raise with the derived tier alongside it', () => {
    const out = applyPriority({
      derivation,
      requested: 'high',
      rationale: 'a banking partner asked about this directly',
      by: ALICE,
      at: NOW,
    });
    expect(out.kind).toBe('overridden');
    if (out.kind === 'overridden') {
      expect(out.tier).toBe('high');
      expect(out.override.derived).toBe('low');
      expect(out.override.direction).toBe('raised');
      expect(out.override.at).toBe(NOW);
    }
  });

  it('makes lowering cost exactly as much as raising', () => {
    const high = derivePriority({
      reach: reach('headline_story'),
      impacts: impacts([['ability_to_deliver_services', 'high', 'H']]),
      supportingGrades: ['H'],
    });
    expect(applyPriority({ derivation: high, requested: 'low', by: ALICE, at: NOW }).kind).toBe('refused');
    const ok = applyPriority({
      derivation: high,
      requested: 'low',
      rationale: 'the underlying outage was resolved before this was read',
      by: ALICE,
      at: NOW,
    });
    expect(ok.kind).toBe('overridden');
    if (ok.kind === 'overridden') expect(ok.override.direction).toBe('lowered');
  });

  it('has a refusal for a stored tier with nothing behind it', () => {
    const r = refuseUnsupportedPriority('high', 'low');
    expectWellFormedRefusal(r);
    expect(r.code).toBe('PRIORITY_NOT_SUPPORTED_BY_EVIDENCE');
    expect(r.matched).toBe('high');
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  §7 the state machine
 * ════════════════════════════════════════════════════════════════════════════ */

describe('the triage state machine', () => {
  it('every declared forbidden transition really is absent from the table', () => {
    /* This is the test that fails if someone re-adds `received -> drafting`: the edge
     * and the sentence explaining why it must not exist cannot both be true. */
    for (const f of NOTABLY_FORBIDDEN_TRANSITIONS) {
      expect(canTransition(f.from, f.to)).toBe(false);
      expect(f.why.trim().length).toBeGreaterThan(20);
    }
  });

  it('an item cannot go from received straight to drafting', () => {
    const r = transitionTriage('received', 'drafting');
    expect(r).not.toBeNull();
    expectWellFormedRefusal(r!);
    expect(r!.code).toBe('TRIAGE_ASSESSMENT_REQUIRED_BEFORE_DECISION');
    expect(r!.sentence).toMatch(/platform report/);
    expect(r!.matched).toBe('received -> drafting');
  });

  it('allows the screening path and returns null when the edge exists', () => {
    expect(transitionTriage('received', 'screened')).toBeNull();
    expect(transitionTriage('screened', 'assessed')).toBeNull();
    expect(transitionTriage('assessed', 'decided')).toBeNull();
    expect(transitionTriage('decided', 'monitoring_with_line_prepared')).toBeNull();
  });

  it('lets a recorded silence be reopened, so recording one is never a trap', () => {
    expect(canTransition('ignored_with_rationale', 'screened')).toBe(true);
    expect(canTransition('out_of_scope', 'screened')).toBe(true);
    expect(canTransition('closed', 'screened')).toBe(true);
  });

  it('every target in the table is a real state and no state points at itself', () => {
    const states = Object.keys(TRIAGE_TRANSITIONS) as TriageState[];
    for (const from of states) {
      for (const to of TRIAGE_TRANSITIONS[from]) {
        expect(states).toContain(to);
        expect(to).not.toBe(from);
      }
    }
  });

  it('keeps monitoring_with_line_prepared reachable and non-terminal', () => {
    expect(canTransition('decided', 'monitoring_with_line_prepared')).toBe(true);
    expect(TRIAGE_TRANSITIONS.monitoring_with_line_prepared.length).toBeGreaterThan(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  §8 the response set, and the silence log
 * ════════════════════════════════════════════════════════════════════════════ */

describe('the closed response set', () => {
  it('enumerates all nine kinds', () => {
    expect(RESPONSE_KINDS).toHaveLength(9);
    expect(new Set(RESPONSE_KINDS).size).toBe(9);
    const asUnion: readonly ResponseAction['kind'][] = RESPONSE_KINDS;
    expect(asUnion).toContain('platform_report');
  });

  it('refuses a silent ignore', () => {
    const out = checkResponseAction({ kind: 'ignore', rationale: '   ' }, { now: NOW });
    expect(codes(out)).toEqual(['IGNORE_WITHOUT_RATIONALE']);
    expectWellFormedRefusal(out[0]!);
    expect(out[0]!.recovery.kind).toBe('supply_data');
  });

  it('accepts an ignore that carries a reason', () => {
    expect(
      checkResponseAction(
        { kind: 'ignore', rationale: 'two-follower account, claim already corrected by a third party' },
        { now: NOW },
      ),
    ).toEqual([]);
  });

  it('refuses a monitor whose review date has already passed', () => {
    const out = checkResponseAction(
      { kind: 'monitor', baselineRef: 'baseline-2026-07', reviewAt: EARLIER },
      { now: NOW },
    );
    expect(codes(out)).toEqual(['MONITOR_REVIEW_NOT_IN_FUTURE']);
  });

  it('refuses a monitor with no baseline, and accepts a complete one', () => {
    expect(
      codes(checkResponseAction({ kind: 'monitor', baselineRef: '', reviewAt: LATER }, { now: NOW })),
    ).toEqual(['MONITOR_BASELINE_MISSING']);
    expect(
      checkResponseAction({ kind: 'monitor', baselineRef: 'baseline-2026-07', reviewAt: LATER }, { now: NOW }),
    ).toEqual([]);
  });

  it('refuses a line hold with no prepared line', () => {
    expect(
      codes(checkResponseAction({ kind: 'prepare_line_hold', approvedLanguageId: '' }, { now: NOW })),
    ).toEqual(['PREPARED_LINE_MISSING']);
  });

  it('refuses private contact with no recorded reason', () => {
    expect(
      codes(checkResponseAction({ kind: 'direct_contact_author', rationale: '' }, { now: NOW })),
    ).toEqual(['DIRECT_CONTACT_WITHOUT_RATIONALE']);
  });

  it('refuses an impersonation report with no signal behind it', () => {
    const out = checkResponseAction(
      { kind: 'platform_report', reportType: 'impersonation' },
      { now: NOW, impersonationSignals: [] },
    );
    expect(codes(out)).toEqual(['PLATFORM_REPORT_WITHOUT_SIGNAL']);
  });

  it('allows an impersonation report once a signal exists, and never gates a fraud report on one', () => {
    const signal: ImpersonationSignal = {
      id: 'handle_folds_to_owned:lcx',
      family: 'handle',
      strength: 'strong',
      sentence: 'folds to @lcx',
      matched: '1cx',
      rule: { instrument: 'resist_2', provision: 'FIRST, Identity', text: 'fake social media account' },
    };
    expect(
      checkResponseAction(
        { kind: 'platform_report', reportType: 'impersonation' },
        { now: NOW, impersonationSignals: [signal] },
      ),
    ).toEqual([]);
    expect(
      checkResponseAction({ kind: 'platform_report', reportType: 'fraud' }, { now: NOW }),
    ).toEqual([]);
  });

  it('refuses an escalation with no recipient and a market-abuse escalation with no basis', () => {
    expect(codes(checkResponseAction({ kind: 'escalate_internal', to: [], severity: 'high' }, { now: NOW }))).toEqual([
      'ESCALATION_WITHOUT_RECIPIENT',
    ]);
    expect(
      codes(
        checkResponseAction({ kind: 'escalate_market_abuse', authority: 'FMA', basis: '' }, { now: NOW }),
      ),
    ).toEqual(['MARKET_ABUSE_ESCALATION_WITHOUT_BASIS']);
  });

  it('does not gate the wording of a reply here, because the claim gate owns that', () => {
    expect(checkResponseAction({ kind: 'reply_public', draftId: 'draft-1' }, { now: NOW })).toEqual([]);
    expect(
      checkResponseAction({ kind: 'owned_channel_statement', statementId: 'stmt-1' }, { now: NOW }),
    ).toEqual([]);
  });

  it('leads with monitor and line-hold at low priority rather than with a reply box', () => {
    expect(TIER_LEADING_RESPONSES.low).not.toContain('reply_public');
    expect(TIER_LEADING_RESPONSES.low[0]).toBe('prepare_line_hold');
  });
});

describe('the silence log', () => {
  const ignore = {
    kind: 'ignore' as const,
    rationale: 'self-correcting; two replies already pointed out the error',
  };

  it('refuses to log a silence with no rationale', () => {
    const out = recordSilence({
      action: { kind: 'ignore', rationale: '' },
      decidedBy: ALICE,
      decidedAt: NOW,
      priority: 'low',
      reach: 'little_interest',
      verifiability: 'opinion',
    });
    expect(out.kind).toBe('refused');
    if (out.kind === 'refused') expect(out.refusal.code).toBe('IGNORE_WITHOUT_RATIONALE');
  });

  it('refuses to log a silence that names nobody', () => {
    const out = recordSilence({
      action: ignore,
      decidedBy: '  ',
      decidedAt: NOW,
      priority: 'low',
      reach: 'little_interest',
      verifiability: 'opinion',
    });
    expect(out.kind).toBe('refused');
    if (out.kind === 'refused') expect(out.refusal.sentence).toMatch(/names nobody/);
  });

  it('keeps the priority, reach and signals AS THEY WERE at the moment of the decision', () => {
    const signal: ImpersonationSignal = {
      id: 'body_secret_request',
      family: 'body',
      strength: 'strong',
      sentence: 'asks for a seed phrase',
      matched: 'seed phrase',
      rule: { instrument: 'desk_policy', provision: 'p', text: 't' },
    };
    const out = recordSilence({
      action: ignore,
      decidedBy: BOB,
      decidedAt: NOW,
      priority: 'medium',
      reach: 'trending',
      verifiability: 'verifiable_factual',
      signals: [signal],
    });
    expect(out.kind).toBe('recorded');
    if (out.kind === 'recorded') {
      expect(out.record).toEqual({
        rationale: ignore.rationale,
        decidedBy: BOB,
        decidedAt: NOW,
        priorityAtDecision: 'medium',
        reachAtDecision: 'trending',
        verifiabilityAtDecision: 'verifiable_factual',
        signalsAtDecision: ['body_secret_request'],
      });
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  §9 impersonation and scam signals
 * ════════════════════════════════════════════════════════════════════════════ */

describe('confusable folding and edit distance', () => {
  it('folds separators, case and leet to one skeleton', () => {
    expect(handleSkeleton('LCX_Support')).toBe('lcxsupport');
    expect(handleSkeleton('lcx-support')).toBe('lcxsupport');
    expect(handleSkeleton('@lcx.support')).toBe('lcxsupport');
    expect(handleSkeleton('1cx')).toBe('lcx');
    expect(handleSkeleton('Icx')).toBe('lcx');
  });

  it('folds a lowercase AND an uppercase Cyrillic lookalike', () => {
    expect(foldConfusables('lсx')).toBe('lcx'); // lowercase Cyrillic es
    expect(foldConfusables('LСX')).toBe('lcx'); // uppercase Cyrillic Es
  });

  it('folds away invisible characters inserted to defeat a comparison', () => {
    expect(handleSkeleton('l​c​x')).toBe('lcx');
    expect(handleSkeleton('lc­x')).toBe('lcx');
  });

  it('computes a distance a reviewer can reproduce, and stops at the cap', () => {
    expect(boundedLevenshtein('lcx', 'lcx', 3)).toBe(0);
    expect(boundedLevenshtein('lcx', 'lcy', 3)).toBe(1);
    expect(boundedLevenshtein('lcx', 'lc', 3)).toBe(1);
    expect(boundedLevenshtein('lcx', 'binance', 3)).toBe(4);
    expect(boundedLevenshtein('a', 'b', 0)).toBe(1);
    expect(boundedLevenshtein('lcx', 'xcl', 3)).toBe(boundedLevenshtein('xcl', 'lcx', 3));
  });
});

describe('impersonation reading', () => {
  const base = { ownedHandles: ['lcx'], brandTokens: ['lcx'], now: NOW };

  it('REFUSES rather than reporting no signals when there is no owned-handle list', () => {
    const out = readImpersonationSignals({
      handle: '1cx_support',
      displayName: 'LCX Support',
      bodyText: 'send your seed phrase',
      ownedHandles: [],
      now: NOW,
    });
    expect(out.kind).toBe('refused');
    if (out.kind === 'refused') {
      expectWellFormedRefusal(out.refusal);
      expect(out.refusal.code).toBe('OWNED_HANDLE_ALLOWLIST_ABSENT');
      expect(out.refusal.recovery.kind).toBe('supply_data');
    }
  });

  it('flags a handle that folds to an owned handle as strong', () => {
    const out = readImpersonationSignals({ ...base, handle: '1cx', displayName: null, bodyText: 'hi' });
    expect(out.kind).toBe('read');
    if (out.kind !== 'read') return;
    const handleSignals = out.signals.filter((s) => s.family === 'handle');
    expect(handleSignals).toHaveLength(1);
    expect(handleSignals[0]!.id).toBe('handle_folds_to_owned:lcx');
    expect(handleSignals[0]!.strength).toBe('strong');
    expect(handleSignals[0]!.matched).toBe('1cx');
  });

  it('flags brand-plus-role as strong and reports which role token fired', () => {
    const out = readImpersonationSignals({ ...base, handle: 'lcx_support', displayName: null, bodyText: 'hi' });
    if (out.kind !== 'read') throw new Error('expected a reading');
    const s = out.signals.find((x) => x.family === 'handle')!;
    expect(s.id).toBe('handle_owned_plus_role_token:lcx');
    expect(s.strength).toBe('strong');
    expect(s.sentence).toMatch(/"support"/);
  });

  it('flags a near-miss as moderate and states the distance', () => {
    const out = readImpersonationSignals({ ...base, handle: 'lcy', displayName: null, bodyText: 'hi' });
    if (out.kind !== 'read') throw new Error('expected a reading');
    const s = out.signals.find((x) => x.family === 'handle')!;
    expect(s.strength).toBe('moderate');
    expect(s.sentence).toMatch(/1 edit from @lcx/);
  });

  it('says nothing about the handle when the handle IS ours', () => {
    const out = readImpersonationSignals({
      ...base,
      handle: 'LCX',
      displayName: 'LCX',
      bodyText: 'ETH deposits are live again',
    });
    if (out.kind !== 'read') throw new Error('expected a reading');
    expect(out.signals).toEqual([]);
    expect(out.band).toBe('no_signals_visible');
  });

  it('does not fire on an ordinary sentence containing a ticker', () => {
    /* The production sanitiser redacts ETH, SOL, BNB and ARB as bare words while the
     * real scam vector passes clean. This asserts the inversion is not repeated here. */
    const out = readImpersonationSignals({
      ...base,
      handle: 'trader_jane',
      displayName: 'Jane',
      bodyText: 'ETH deposits are live and SOL withdrawals worked fine, thanks',
    });
    if (out.kind !== 'read') throw new Error('expected a reading');
    expect(out.signals).toEqual([]);
  });

  it('catches the vector the production sanitiser misses: a handle plus an off-platform channel', () => {
    const out = readImpersonationSignals({
      ...base,
      handle: 'helper_desk',
      displayName: 'Crypto Helper',
      bodyText: 'DM @LCX_Recovery_Desk on Telegram for help',
    });
    if (out.kind !== 'read') throw new Error('expected a reading');
    const ids = out.signals.map((s) => s.id);
    expect(ids).toContain('body_off_platform_contact');
    expect(ids).toContain('body_names_other_account');
    const named = out.signals.find((s) => s.id === 'body_names_other_account')!;
    expect(named.matched).toBe('LCX_Recovery_Desk');
  });

  it('catches secret and payment requests as strong body signals', () => {
    const out = readImpersonationSignals({
      ...base,
      handle: 'support_agent_x',
      displayName: 'Support',
      bodyText: 'Share your seed phrase so we can restore wallet access, then pay the gas fee',
    });
    if (out.kind !== 'read') throw new Error('expected a reading');
    const strong = out.signals.filter((s) => s.strength === 'strong').map((s) => s.id);
    expect(strong).toContain('body_secret_request');
    expect(strong).toContain('body_wallet_action');
    expect(strong).toContain('body_payment_request');
  });

  it('catches a messaging link, a wallet address and a phone number regardless of language', () => {
    const out = readImpersonationSignals({
      ...base,
      handle: 'kundendienst',
      displayName: 'Kundendienst',
      bodyText:
        'Bitte schreiben Sie an https://t.me/lcx_hilfe oder 0x1234567890abcdef1234567890abcdef12345678 oder +49 151 2345 6789',
    });
    if (out.kind !== 'read') throw new Error('expected a reading');
    const ids = out.signals.map((s) => s.id);
    expect(ids).toContain('body_off_platform_link');
    expect(ids).toContain('body_wallet_address');
    expect(ids).toContain('body_phone_number');
  });

  it('reaches the near-conclusive band only when the handle AND the name both claim LCX', () => {
    const both = readImpersonationSignals({
      ...base,
      handle: '1cx_support',
      displayName: 'LCX Support',
      bodyText: 'hello',
    });
    if (both.kind !== 'read') throw new Error('expected a reading');
    expect(both.band).toBe('handle_and_name_both_impersonate');

    const nameOnly = readImpersonationSignals({
      ...base,
      handle: 'crypto_helper_9',
      displayName: 'LCX Support',
      bodyText: 'hello',
    });
    if (nameOnly.kind !== 'read') throw new Error('expected a reading');
    expect(nameOnly.band).toBe('signals_in_one_field_only');
    expect(nameOnly.signals[0]!.strength).toBe('strong');
  });

  it('always carries the unobservable list, the lexicon caveat and the visibility caveat', () => {
    const out = readImpersonationSignals({ ...base, handle: 'someone', displayName: null, bodyText: 'hi' });
    if (out.kind !== 'read') throw new Error('expected a reading');
    expect(out.notObservable).toHaveLength(UNOBSERVABLE_ACCOUNT_SIGNALS.length);
    expect(out.notObservable.every((r) => r.code === 'IMPERSONATION_SIGNAL_NOT_OBSERVABLE')).toBe(true);
    expect(out.notObservable.every((r) => r.recovery.kind === 'not_recoverable')).toBe(true);
    expect(out.lexiconVersion).toBe(SCAM_LEXICON_VERSION);
    expect(out.lexiconCaveat).toBe(SCAM_LEXICON_COVERAGE_REASON);
    expect(out.visibilityCaveat).toBe(IMPERSONATION_VISIBILITY_REASON);
    expect(out.readAt).toBe(NOW);
  });

  it('refuses to score account age, followers or verification', () => {
    for (const s of UNOBSERVABLE_ACCOUNT_SIGNALS) {
      const r = refuseUnobservableSignal(s.key);
      expectWellFormedRefusal(r);
      expect(r.recovery.kind).toBe('not_recoverable');
      expect(r.matched).toBe(s.key);
    }
    expect(refuseUnobservableSignal('follower_count').sentence).toMatch(/follower count/);
  });

  it('is deterministic', () => {
    const input = { ...base, handle: '1cx_support', displayName: 'LCX Support', bodyText: 'seed phrase' };
    expect(readImpersonationSignals(input)).toEqual(readImpersonationSignals(input));
  });

  it('emits no signal family that is not in SIGNAL_FAMILIES, and scores no timing', () => {
    /* A family nothing emits would let a surface build a filter that is permanently
     * empty and read that as "no timing problems". */
    const bodies = [
      'Share your seed phrase and pay the gas fee',
      'DM @LCX_Recovery_Desk on Telegram',
      'https://t.me/x 0x1234567890abcdef1234567890abcdef12345678 +49 151 2345 6789',
      'ordinary complaint about a withdrawal',
    ];
    const emitted = new Set<string>();
    for (const bodyText of bodies) {
      for (const handle of ['1cx_support', 'lcy', 'trader_jane']) {
        const out = readImpersonationSignals({
          handle,
          displayName: 'LCX Support',
          bodyText,
          ownedHandles: ['lcx'],
          now: NOW,
        });
        if (out.kind !== 'read') continue;
        for (const s of out.signals) emitted.add(s.family);
      }
    }
    expect([...emitted].sort()).toEqual([...SIGNAL_FAMILIES].sort());
    expect(TIMING_NOT_SCORED_REASON).toMatch(/Date header/);
  });

  it('bands only on what was seen, and never says the account is genuine', () => {
    expect(bandOf([])).toBe('no_signals_visible');
    expect(IMPERSONATION_BAND_DEFINITION.no_signals_visible).toMatch(
      /not a finding that the account is genuine/,
    );
    expect(ROLE_CLAIM_TOKENS).toContain('support');
    expect(SCAM_LEXICON.some((e) => e.term === 'seed phrase')).toBe(true);
  });
});

describe('the honest ceiling on impersonation', () => {
  it('refuses to say how much impersonation exists in the wild', () => {
    const r = refuseImpersonationPrevalence();
    expectWellFormedRefusal(r);
    expect(r.code).toBe('IMPERSONATION_PREVALENCE_NOT_OBSERVABLE');
    expect(r.recovery.kind).toBe('not_recoverable');
    expect(r.sentence).toMatch(/victim/);
  });

  it('labels the tile with the scope, and names the invisible case in the frame', () => {
    expect(IMPERSONATION_TILE_LABEL).toMatch(/visible in our own mentions/);
    expect(IMPERSONATION_VISIBILITY_REASON).toMatch(/victim's own tweet/);
    expect(FRAME.completeness).toBe('unknown_no_denominator');
    expect(FRAME.doesNotCapture.some((s) => /victim/.test(s))).toBe(true);
    expect(FRAME.knownBiases.length).toBeGreaterThan(0);
  });

  it('produces a lower bound with a frame, never a bare number', () => {
    const reading = readImpersonationSignals({
      handle: '1cx_support',
      displayName: 'LCX Support',
      bodyText: 'hello',
      ownedHandles: ['lcx'],
      now: NOW,
    });
    const figure = countImpersonationSignalsInOwnMentions({ readings: [reading], frame: FRAME });
    expect(figure.kind).toBe('measured');
    if (figure.kind !== 'measured') return;
    expect(figure.value.kind).toBe('lower_bound');
    expect(figure.value.metric).toBe('impersonation_signals_in_own_mentions');
    expect(figure.value.atLeast).toBe(2);
    expect(figure.frame).toBe(FRAME);
    expect(figure.value.frame).toBe(FRAME);
  });

  it('counts a refused reading as contributing nothing rather than as zero signals', () => {
    const refused = readImpersonationSignals({
      handle: 'x',
      displayName: null,
      bodyText: 'seed phrase',
      ownedHandles: [],
      now: NOW,
    });
    const figure = countImpersonationSignalsInOwnMentions({ readings: [refused], frame: FRAME });
    if (figure.kind !== 'measured') throw new Error('expected a figure');
    expect(figure.value.atLeast).toBe(0);
  });

  it('returns a refusal, not 0, when the channel has never polled', () => {
    const figure = countImpersonationSignalsInOwnMentions({
      readings: [],
      frame: ownMentionsFrame({ windowFrom: EARLIER, windowTo: NOW, lastSuccessfulPollAt: null }),
    });
    expect(figure.kind).toBe('absent');
    if (figure.kind === 'absent') expect(figure.refusal.recovery.kind).toBe('wait_until');
  });
});

describe('template reuse', () => {
  const body = 'Hi, please contact our support team to resolve your withdrawal issue today';
  const frame = FRAME;

  it('refuses when the window holds nothing to compare against', () => {
    const out = readTemplateReuse({ handle: 'a', bodyText: body, parentPostId: 'p1', corpus: [], frame });
    expect(out.kind).toBe('refused');
    if (out.kind === 'refused') {
      expectWellFormedRefusal(out.refusal);
      expect(out.refusal.code).toBe('TEMPLATE_REUSE_CORPUS_ABSENT');
      expect(out.refusal.sentence).toMatch(/not the same as this text being unique/);
    }
  });

  it('counts the item plus every other handle sharing the template', () => {
    const out = readTemplateReuse({
      handle: 'bot_a',
      bodyText: body,
      parentPostId: 'p1',
      corpus: [
        { handle: 'bot_b', bodyText: body, parentPostId: 'p1' },
        { handle: 'bot_c', bodyText: `${body} !!`, parentPostId: 'p2' },
        { handle: 'real_person', bodyText: 'my withdrawal is stuck, ticket 4192', parentPostId: 'p1' },
      ],
      frame,
    });
    expect(out.kind).toBe('read');
    if (out.kind !== 'read') return;
    expect(out.distinctHandles).toBe(TEMPLATE_REUSE_MIN_HANDLES);
    expect(out.matchedHandles).toEqual(['bot_b', 'bot_c']);
    expect(out.similarityFloor).toBe(TEMPLATE_REUSE_MIN_SIMILARITY);
    expect(out.sameParentHandles).toBe(2);
  });

  it('never counts the item against itself', () => {
    const out = readTemplateReuse({
      handle: 'bot_a',
      bodyText: body,
      parentPostId: null,
      corpus: [{ handle: 'BOT_A', bodyText: body, parentPostId: null }],
      frame,
    });
    if (out.kind !== 'read') throw new Error('expected a reading');
    expect(out.distinctHandles).toBe(0);
    expect(out.matchedHandles).toEqual([]);
  });

  it('reports 0 rather than a match when the texts are genuinely different', () => {
    const out = readTemplateReuse({
      handle: 'a',
      bodyText: body,
      parentPostId: null,
      corpus: [{ handle: 'b', bodyText: 'when is the next listing announcement', parentPostId: null }],
      frame,
    });
    if (out.kind !== 'read') throw new Error('expected a reading');
    expect(out.distinctHandles).toBe(0);
  });
});

describe('FIRST indicator suggestions', () => {
  const reading = readImpersonationSignals({
    handle: '1cx_support',
    displayName: 'LCX Support',
    bodyText: 'send your seed phrase',
    ownedHandles: ['lcx'],
    now: NOW,
  });
  const reuse = readTemplateReuse({
    handle: 'bot_a',
    bodyText: 'same text everywhere, contact support now please',
    parentPostId: 'p1',
    corpus: [
      { handle: 'bot_b', bodyText: 'same text everywhere, contact support now please', parentPostId: 'p1' },
      { handle: 'bot_c', bodyText: 'same text everywhere, contact support now please', parentPostId: 'p1' },
    ],
    frame: FRAME,
  });

  it('suggests identity from impersonation signals and technology from reuse', () => {
    const out = suggestFirstIndicators({ impersonation: reading, templateReuse: reuse });
    expect(out.map((s) => s.indicator).sort()).toEqual(['identity', 'technology']);
    expect(out.every((s) => s.humanMustConfirm)).toBe(true);
  });

  it('never suggests at H confidence, because a machine has not looked', () => {
    /* The type already excludes 'H'; this asserts the values as well, so the guarantee
     * survives someone widening `IndicatorSuggestion.confidence` later. */
    const out = suggestFirstIndicators({ impersonation: reading, templateReuse: reuse });
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((s) => s.confidence === 'L' || s.confidence === 'M')).toBe(true);
  });

  it('never suggests fabrication, rhetoric or symbolism', () => {
    const out = suggestFirstIndicators({ impersonation: reading, templateReuse: reuse });
    for (const banned of ['fabrication', 'rhetoric', 'symbolism']) {
      expect(out.map((s) => s.indicator)).not.toContain(banned);
    }
  });

  it('suggests nothing from an absent reading', () => {
    expect(suggestFirstIndicators({ impersonation: null, templateReuse: null })).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  §10 the counterparty pattern
 * ════════════════════════════════════════════════════════════════════════════ */

describe('rhetorical pattern', () => {
  it('will not call one aggressive reply a pattern', () => {
    const out = readRhetoricPattern({ devicesPerItem: [['trolling'], ['ad_hominem']], frame: FRAME });
    expect(out.verdict).toBe('insufficient_history');
    expect(out.itemsObserved).toBe(2);
    expect(out.refusal).not.toBeNull();
    expectWellFormedRefusal(out.refusal!);
    expect(out.refusal!.code).toBe('RHETORIC_HISTORY_INSUFFICIENT');
    expect(out.refusal!.sentence).toMatch(new RegExp(`${RHETORIC_MIN_ITEMS} are needed`));
  });

  it('reports repetition only when a device recurs across items', () => {
    const out = readRhetoricPattern({
      devicesPerItem: [['trolling'], ['trolling', 'strawman'], ['whataboutism']],
      frame: FRAME,
    });
    expect(out.verdict).toBe('repeated_devices_observed');
    expect(out.repeatedDevices).toEqual(['trolling']);
    expect(out.deviceCounts.trolling).toBe(2);
    expect(out.refusal).toBeNull();
  });

  it('counts a device once per item, so one ranting reply is not a pattern', () => {
    const out = readRhetoricPattern({
      devicesPerItem: [['trolling', 'trolling', 'trolling'], ['strawman'], ['social_proof']],
      frame: FRAME,
    });
    expect(out.deviceCounts.trolling).toBe(1);
    expect(out.verdict).toBe('no_repeated_device_observed');
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  §11 the suppressible clock
 * ════════════════════════════════════════════════════════════════════════════ */

describe('the time-to-first-statement clock', () => {
  const T_MINUS_25: Instant = '2026-08-02T11:35:00.000Z';

  it('has no budget for low priority, because low means no response is made', () => {
    expect(TTFS_BUDGET_MINUTES_BY_TIER.low).toBeNull();
    const out = readTriageClock({
      startedAt: T_MINUS_45,
      firstStatementAt: null,
      tier: 'low',
      suppression: null,
      now: NOW,
    });
    expect(out.kind).toBe('not_applicable');
    if (out.kind === 'not_applicable') expect(out.why).toBe(PRIORITY_MEANING.low);
  });

  it('refuses rather than reading zero when the start was never recorded', () => {
    for (const startedAt of [null, '   ', 'yesterday']) {
      const out = readTriageClock({
        startedAt,
        firstStatementAt: null,
        tier: 'high',
        suppression: null,
        now: NOW,
      });
      expect(out.kind).toBe('unavailable');
      if (out.kind === 'unavailable') {
        expectWellFormedRefusal(out.refusal);
        expect(out.refusal.code).toBe('TTFS_START_NOT_RECORDED');
      }
    }
  });

  it('burns against the budget while it is running', () => {
    const out = readTriageClock({
      startedAt: T_MINUS_10,
      firstStatementAt: null,
      tier: 'high',
      suppression: null,
      now: NOW,
    });
    expect(out).toEqual({
      kind: 'running',
      elapsedMinutes: 10,
      budgetMinutes: 30,
      remainingMinutes: 20,
      state: 'within_budget',
      breachedByMinutes: 0,
    });
  });

  it('reports a breach and by how much', () => {
    const out = readTriageClock({
      startedAt: T_MINUS_45,
      firstStatementAt: null,
      tier: 'high',
      suppression: null,
      now: NOW,
    });
    if (out.kind !== 'running') throw new Error('expected a running clock');
    expect(out.state).toBe('breached');
    expect(out.breachedByMinutes).toBe(15);
    expect(out.remainingMinutes).toBe(-15);
  });

  it('keeps computing elapsed time while suppressed: suppression removes the alarm, not the number', () => {
    const out = readTriageClock({
      startedAt: T_MINUS_45,
      firstStatementAt: null,
      tier: 'high',
      suppression: { by: ALICE, reason: 'waiting on the exchange ops confirmation', at: T_MINUS_10 },
      now: NOW,
    });
    expect(out.kind).toBe('suppressed');
    if (out.kind !== 'suppressed') return;
    expect(out.elapsedMinutes).toBe(45);
    expect(out.budgetMinutes).toBe(30);
    expect(out.suppression.reason).toMatch(/exchange ops/);
  });

  it('remembers that the budget had already been breached when it was suppressed', () => {
    const late = readTriageClock({
      startedAt: T_MINUS_45,
      firstStatementAt: null,
      tier: 'high',
      suppression: { by: ALICE, reason: 'legal hold', at: T_MINUS_10 },
      now: NOW,
    });
    if (late.kind !== 'suppressed') throw new Error('expected suppressed');
    expect(late.breachedBeforeSuppression).toBe(true);

    const early = readTriageClock({
      startedAt: T_MINUS_45,
      firstStatementAt: null,
      tier: 'high',
      suppression: { by: ALICE, reason: 'legal hold', at: T_MINUS_25 },
      now: NOW,
    });
    if (early.kind !== 'suppressed') throw new Error('expected suppressed');
    expect(early.breachedBeforeSuppression).toBe(false);
  });

  it('stops at the first statement, and the statement beats a suppression', () => {
    const out = readTriageClock({
      startedAt: T_MINUS_45,
      firstStatementAt: T_MINUS_25,
      tier: 'high',
      suppression: { by: ALICE, reason: 'legal hold', at: T_MINUS_10 },
      now: NOW,
    });
    expect(out.kind).toBe('stopped');
    if (out.kind !== 'stopped') return;
    expect(out.elapsedMinutes).toBe(20);
    expect(out.state).toBe('within_budget');
    expect(out.firstStatementAt).toBe(T_MINUS_25);
  });

  it('refuses a suppression with no name and one with no reason, separately', () => {
    const unnamed = suppressTriageClock({ by: '  ', reason: 'because', at: NOW });
    expect(unnamed.kind).toBe('refused');
    if (unnamed.kind === 'refused') expect(unnamed.refusal.code).toBe('TTFS_SUPPRESSION_UNATTRIBUTED');

    const unreasoned = suppressTriageClock({ by: ALICE, reason: '   ', at: NOW });
    expect(unreasoned.kind).toBe('refused');
    if (unreasoned.kind === 'refused') {
      expect(unreasoned.refusal.code).toBe('TTFS_SUPPRESSION_UNREASONED');
      expect(unreasoned.refusal.sentence).toMatch(/A paused clock with a reason is honest/);
    }
  });

  it('accepts a named, reasoned suppression', () => {
    const out = suppressTriageClock({ by: BOB, reason: 'incident owner is on the call', at: NOW });
    expect(out).toEqual({
      kind: 'suppressed',
      suppression: { by: BOB, reason: 'incident owner is on the call', at: NOW },
    });
  });

  it('treats an explicitly absent budget as not applicable, and has a refusal for the validator', () => {
    const out = readTriageClock({
      startedAt: T_MINUS_10,
      firstStatementAt: null,
      tier: 'high',
      suppression: null,
      now: NOW,
      budgetMinutes: null,
    });
    expect(out.kind).toBe('not_applicable');
    const r = refuseAbsentBudget('high');
    expectWellFormedRefusal(r);
    expect(r.code).toBe('TTFS_BUDGET_ABSENT');
    expect(r.matched).toBe('high');
  });

  it('is deterministic for the same arguments', () => {
    const args = {
      startedAt: T_MINUS_45,
      firstStatementAt: null,
      tier: 'medium' as const,
      suppression: null,
      now: NOW,
    };
    expect(readTriageClock(args)).toEqual(readTriageClock(args));
  });
});
