import { describe, it, expect } from 'vitest';
import { getOffer } from './catalogue.js';
import { OFFER_KEYS } from './types.js';
import type { OfferKey, ServiceOffer } from './types.js';
import {
  EVIDENCE_STATUSES,
  MILESTONE_STATE_LABELS,
  canAccept,
  deriveMilestonesForOffer,
  engagementProgress,
  reviewSatisfied,
} from './delivery.js';
import type { Deliverable, DeliveryLoadInput, EvidenceRequest, Milestone } from './delivery.js';
import {
  EXTERNAL_REFERENCE_IS_INERT,
  REVIEW_GATE_DB_CONSTRAINT,
  classifyScopeDrift,
  composeAcceptanceView,
  composeDeliveryResponse,
  composeEngagementPlan,
  composeEvidenceChase,
  composeProgressView,
  composeWipView,
} from './deliveryView.js';
import type { LiveMilestoneState } from './deliveryView.js';

/**
 * GPS P10 — the DELIVERY VIEW.
 *
 * These tests assert the five properties the surface is judged by, and each one is
 * a property that was TRUE IN THE ENGINE AND INVISIBLE ON THE WIRE:
 *
 *  1. the scope-drift guarantee is a displayable verdict in BOTH directions, and a
 *     pass is a positive assertion with its mechanism, not silence;
 *  2. a blocked milestone cannot produce a shape that renders as merely
 *     incomplete — asserted by the ABSENCE of a percentage field, because a
 *     comment saying "do not render this" is not a control;
 *  3. overdue is a function of `dueBy` and the clock, so the same row flips with
 *     `asOf` and nothing stores it;
 *  4. `canAccept`'s refusal reasons arrive verbatim, and the view reports the
 *     review gate rather than reimplementing it;
 *  5. the coordination ceiling can be hit, and hitting it is STATED.
 *
 * Absence is asserted alongside behaviour throughout: no percentage on a blocked
 * display, no stored overdue status, no fetchable handle anywhere on the wire.
 */

const ISO = (ms: number) => new Date(ms).toISOString();
const T0 = Date.parse('2026-08-01T09:00:00.000Z');
const ASOF = ISO(T0);

const withCriteria = (key: OfferKey, acceptanceCriteria: readonly string[]): ServiceOffer => ({
  ...getOffer(key),
  acceptanceCriteria,
});

const live = (key: string, state: Milestone['state'], blockedReason: string | null = null): LiveMilestoneState => ({
  key,
  state,
  blockedReason,
  updatedAt: ASOF,
});

const DIAGNOSTIC_KEYS = deriveMilestonesForOffer('diagnostic').map((m) => m.key);

function evidenceRow(over: Partial<EvidenceRequest> = {}): EvidenceRequest {
  return {
    id: 'ev-1',
    engagementId: 'eng-1',
    clientId: 'cl-1',
    milestoneKey: DIAGNOSTIC_KEYS[0]!,
    description: 'Tokenomics: supply, allocations, vesting and emission schedule.',
    requestedFrom: 'client',
    requestedFromName: 'Anna (COO)',
    requestedAt: ISO(T0 - 20 * 86_400_000),
    dueBy: ISO(T0 - 6 * 86_400_000),
    status: 'requested',
    externalLocation: "the client's own data room, folder 3 — ask Anna",
    blocking: true,
    receivedAt: null,
    resolutionNote: null,
    requestedBy: 'desk-nik',
    ...over,
  };
}

function deliverable(over: Partial<Deliverable> = {}): Deliverable {
  return {
    id: 'dl-1',
    engagementId: 'eng-1',
    clientId: 'cl-1',
    milestoneKey: DIAGNOSTIC_KEYS[4]!,
    title: 'Written diagnostic (10–15 pages)',
    description: 'The written diagnostic, ranked by what blocks the next step.',
    owner: 'partner',
    state: 'delivered',
    reviewRequired: true,
    reviewBasis: 'Carries technical claims about the client’s token structure.',
    reviewedBy: null,
    reviewedAt: null,
    acceptedAt: null,
    acceptedBy: null,
    handoverChannel: 'Sent by the partner from their own systems to the client’s counsel.',
    createdAt: ASOF,
    updatedAt: ASOF,
    ...over,
  };
}

const loadRow = (over: Partial<DeliveryLoadInput> = {}): DeliveryLoadInput => ({
  engagementId: 'eng-1',
  clientId: 'cl-1',
  offerKey: 'diagnostic',
  status: 'in_delivery',
  milestones: deriveMilestonesForOffer('diagnostic'),
  ...over,
});

// ── 1 · SCOPE DRIFT, BOTH DIRECTIONS, AS A VERDICT ────────────────────────────

describe('the scope-drift guarantee is displayable, in both directions', () => {
  it('asserts POSITIVELY, with a mechanism, for every real offer', () => {
    for (const key of OFFER_KEYS) {
      const plan = composeEngagementPlan(getOffer(key), [], ASOF);
      expect(plan.usable, `${key} should derive`).toBe(true);
      expect(plan.drift.matchesSale).toBe(true);
      expect(plan.drift.failure).toBeNull();
      // The positive claim exists as text AND as rows — a screen can print the
      // sentence and open the coverage behind it (D1/D8).
      expect(plan.drift.assertion).toMatch(/matches what was sold/i);
      expect(plan.drift.mechanism).toMatch(/deriveMilestones\(\)/);
      expect(plan.drift.mechanism).toMatch(/delivery\.ts:609/);
      expect(plan.drift.criteriaDelivered).toBe(plan.drift.criteriaSold);
      expect(plan.drift.criteriaSold).toBe(getOffer(key).acceptanceCriteria.length);
      expect(plan.drift.directionsChecked).toEqual(['sold_not_delivered', 'planned_not_sold']);
      for (const c of plan.drift.coverage) {
        expect(c.milestoneKeys.length, `${key} criterion ${c.index} is delivered by nothing`).toBeGreaterThan(0);
      }
      expect(plan.drift.checkedAt).toBe(ASOF);
    }
  });

  it('coverage quotes the sold sentence verbatim, never a paraphrase', () => {
    const offer = getOffer('diagnostic');
    const plan = composeEngagementPlan(offer, [], ASOF);
    expect(plan.drift.coverage.map((c) => c.text)).toEqual([...offer.acceptanceCriteria]);
  });

  it('direction 1 — work SOLD that the plan does not deliver', () => {
    const sold = withCriteria('diagnostic', [
      ...getOffer('diagnostic').acceptanceCriteria,
      'A quarterly refresh of the findings register for 12 months.',
    ]);
    const plan = composeEngagementPlan(sold, [], ASOF);

    expect(plan.usable).toBe(false);
    expect(plan.drift.matchesSale).toBe(false);
    expect(plan.drift.failure?.direction).toBe('sold_not_delivered');
    expect(plan.drift.failure?.code).toBe('criterion_undelivered');
    // The engine's own message, verbatim: it names the index and quotes the text,
    // which is what makes the refusal actionable rather than merely alarming.
    expect(plan.drift.failure?.engineMessage).toMatch(/does not deliver acceptance criterion/i);
    expect(plan.drift.failure?.engineMessage).toMatch(/quarterly refresh/i);
    expect(plan.drift.failure?.operatorDetail).toMatch(/delivered by no milestone/i);
    // A refusal is not an empty screen: the sold criteria are still listed, and the
    // undelivered one is visibly the one with no milestones (D2).
    expect(plan.drift.criteriaSold).toBe(4);
    expect(plan.drift.criteriaDelivered).toBe(0);
    expect(plan.drift.coverage).toHaveLength(4);
    expect(plan.rows).toEqual([]);
  });

  it('direction 2 — work PLANNED that nobody sold', () => {
    const plan = composeEngagementPlan(withCriteria('diagnostic', [getOffer('diagnostic').acceptanceCriteria[0]!]), [], ASOF);

    expect(plan.usable).toBe(false);
    expect(plan.drift.failure?.direction).toBe('planned_not_sold');
    expect(plan.drift.failure?.code).toBe('criterion_out_of_range');
    expect(plan.drift.failure?.engineMessage).toMatch(/claims acceptance criterion/i);
    expect(plan.drift.failure?.operatorDetail).toMatch(/delivering something nobody bought/i);
  });

  it('classifies every refusal the engine can raise, and refuses to guess when it cannot', () => {
    // Two of these are unreachable through the catalogue today (MILESTONE_PLANS is
    // module-private, delivery.ts:200, and all five plans are well-formed), so the
    // classifier is exercised directly against the engine's wording.
    expect(classifyScopeDrift('no GPS delivery plan for offer: diagnostic')).toEqual({
      code: 'plan_missing',
      direction: 'plan_unusable',
    });
    expect(classifyScopeDrift('GPS delivery plan for diagnostic: duplicate milestone key "intake_call"')).toEqual({
      code: 'duplicate_milestone_key',
      direction: 'plan_unusable',
    });
    expect(
      classifyScopeDrift(
        'GPS delivery plan for diagnostic: milestone "x" satisfies no acceptance criterion — either it is unsold scope or the criterion it delivers is missing from the catalogue',
      ),
    ).toEqual({ code: 'milestone_claims_nothing', direction: 'planned_not_sold' });
    expect(
      classifyScopeDrift('GPS delivery plan for diagnostic: milestone "x" claims acceptance criterion 4, but the offer has 3'),
    ).toEqual({ code: 'criterion_out_of_range', direction: 'planned_not_sold' });
    expect(classifyScopeDrift('GPS delivery plan for diagnostic does not deliver acceptance criterion 2: "…"')).toEqual({
      code: 'criterion_undelivered',
      direction: 'sold_not_delivered',
    });
    // The important one: if delivery.ts's wording changes, the verdict still
    // refuses but stops claiming to know which direction.
    expect(classifyScopeDrift('something nobody has written yet')).toEqual({
      code: 'unrecognised',
      direction: 'plan_unusable',
    });
  });

  it('a plan that cannot be built claims NEITHER direction was checked', () => {
    const plan = composeEngagementPlan({ ...getOffer('diagnostic'), key: 'not_an_offer' as OfferKey }, [], ASOF);
    expect(plan.usable).toBe(false);
    expect(plan.drift.failure?.code).toBe('plan_missing');
    expect(plan.drift.directionsChecked).toEqual([]);
  });

  it('joins recorded state to the derived plan, and surfaces state that answers to nothing', () => {
    const plan = composeEngagementPlan(
      getOffer('diagnostic'),
      [live(DIAGNOSTIC_KEYS[0]!, 'complete'), live('a_milestone_deleted_last_quarter', 'complete')],
      ASOF,
    );

    expect(plan.rows[0]!.milestone.state).toBe('complete');
    expect(plan.rows[0]!.recorded).toBe(true);
    expect(plan.rows[0]!.recordedAt).toBe(ASOF);
    expect(plan.rows[1]!.recorded).toBe(false);
    expect(plan.recordedCount).toBe(1);
    // Not dropped: a stored state row nobody can see is delivery history that
    // silently vanished after a catalogue edit.
    expect(plan.unknownLiveKeys).toEqual(['a_milestone_deleted_last_quarter']);
    // Labels come from the engine's own map, so the two files cannot drift.
    expect(plan.rows[0]!.stateLabel).toBe(MILESTONE_STATE_LABELS.complete);
    expect(plan.rows[0]!.ownerLabel).toBe('Client');
  });

  it('never lets a stored row overwrite what was sold', () => {
    const plan = composeEngagementPlan(getOffer('diagnostic'), [live(DIAGNOSTIC_KEYS[0]!, 'complete')], ASOF);
    expect(plan.rows[0]!.milestone.acceptanceCriteria).toEqual(
      deriveMilestonesForOffer('diagnostic')[0]!.acceptanceCriteria,
    );
  });
});

// ── 2 · BLOCKED ≠ NOT-STARTED, AND ≠ "60% DONE" ───────────────────────────────

describe('a blocked engagement cannot be rendered as merely incomplete', () => {
  const blockedPlan = () =>
    composeEngagementPlan(
      getOffer('diagnostic'),
      [
        live(DIAGNOSTIC_KEYS[0]!, 'complete'),
        live(DIAGNOSTIC_KEYS[1]!, 'complete'),
        live(DIAGNOSTIC_KEYS[2]!, 'complete'),
        live(DIAGNOSTIC_KEYS[3]!, 'complete'),
        live(DIAGNOSTIC_KEYS[4]!, 'blocked', 'Client has not approved the claims list; drafting cannot proceed.'),
      ],
      ASOF,
    );

  it('WITHHOLDS the percentage — the blocked display has no such field', () => {
    const view = composeProgressView(blockedPlan(), ASOF);

    expect(view.display.kind).toBe('blocked');
    // THE STRUCTURAL PROPERTY. Not "the number is hidden by convention" — the
    // shape a surface must narrow to in order to render anything has no
    // percentage on it at all, so "57% done" cannot be typed.
    expect('pct' in view.display).toBe(false);
    expect(Object.keys(view.display)).not.toContain('completePct');
    expect(Object.keys(view.display)).not.toContain('percent');
    // Counts survive, because a count is a fact and the percentage is the thing
    // that reads as momentum (delivery.ts:1101 says the same in the headline).
    if (view.display.kind === 'blocked') {
      expect(view.display.complete).toBe(4);
      expect(view.display.countable).toBe(7);
      expect(view.display.blockedCount).toBe(1);
      expect(view.display.leadReason).toMatch(/has not approved the claims list/);
    }
  });

  it('the engine still computed the number, so a drawer can show the arithmetic', () => {
    // D1: withholding the percentage from the render path is not the same as
    // pretending it does not exist. It is on the engine object, one level down.
    const view = composeProgressView(blockedPlan(), ASOF);
    expect(view.progress?.completePct).toBe(57);
    expect(view.progress?.isBlocked).toBe(true);
  });

  it('leads with BLOCKED and names the party and the reason', () => {
    const view = composeProgressView(blockedPlan(), ASOF);
    expect(view.isBlocked).toBe(true);
    expect(view.stateLabel).toBe('BLOCKED');
    expect(view.headline.startsWith('BLOCKED —')).toBe(true);
    expect(view.blockers).toHaveLength(1);
    expect(view.blockers[0]!.ownerLabel).toBe('Us');
    expect(view.blockers[0]!.reasonDisplay).toMatch(/claims list/);
    expect(view.headline).toBe(engagementProgress(blockedPlan().rows.map((r) => r.milestone)).headline);
  });

  it('renders a percentage only when nothing is blocked', () => {
    const clear = composeEngagementPlan(
      getOffer('diagnostic'),
      DIAGNOSTIC_KEYS.slice(0, 4).map((k) => live(k, 'complete')),
      ASOF,
    );
    const view = composeProgressView(clear, ASOF);
    expect(view.display.kind).toBe('percent');
    if (view.display.kind === 'percent') {
      expect(view.display.pct).toBe(57);
      expect(view.display.movement).toBe('in_progress');
    }
  });

  it('never gives blocked and not-started the same shape', () => {
    const untouched = composeProgressView(composeEngagementPlan(getOffer('diagnostic'), [], ASOF), ASOF);
    const blocked = composeProgressView(blockedPlan(), ASOF);

    expect(untouched.display.kind).toBe('percent');
    if (untouched.display.kind === 'percent') {
      // Not started is a PLAN: 0%, and it says so as movement rather than by
      // looking identical to a stalled engagement (delivery.ts:104-110).
      expect(untouched.display.pct).toBe(0);
      expect(untouched.display.movement).toBe('not_started');
    }
    expect(blocked.display.kind).not.toBe(untouched.display.kind);
    expect(untouched.stateLabel).toBe('Not started');
  });

  it('counts a block with no recorded reason as its own defect', () => {
    const view = composeProgressView(
      composeEngagementPlan(getOffer('diagnostic'), [live(DIAGNOSTIC_KEYS[2]!, 'blocked', null)], ASOF),
      ASOF,
    );
    expect(view.unexplainedBlockers).toBe(1);
    expect(view.blockers[0]!.reasonMissing).toBe(true);
    expect(view.blockers[0]!.reason).toBeNull();
    expect(view.blockers[0]!.reasonDisplay).toMatch(/No reason recorded/i);
  });

  it('refuses to report progress at all when the plan drifted, and says why', () => {
    const drifted = composeEngagementPlan(
      withCriteria('diagnostic', [...getOffer('diagnostic').acceptanceCriteria, 'An unplanned promise.']),
      [],
      ASOF,
    );
    const view = composeProgressView(drifted, ASOF);

    expect(view.display.kind).toBe('plan_unusable');
    expect('pct' in view.display).toBe(false);
    expect(view.progress).toBeNull();
    expect(view.headline).toMatch(/No progress can be reported/);
    // A broken plan and an absent plan are different facts, and a status call goes
    // differently for each.
    expect(view.headline).not.toMatch(/No delivery plan yet/);
  });

  it('distinguishes "no plan" from "0% done", and an all-waived plan from both', () => {
    const empty = composeProgressView(
      { ...composeEngagementPlan(getOffer('diagnostic'), [], ASOF), rows: [] },
      ASOF,
    );
    expect(empty.display.kind).toBe('no_countable_milestones');
    if (empty.display.kind === 'no_countable_milestones') expect(empty.display.note).toMatch(/not 0% done/i);

    const waived = composeProgressView(
      composeEngagementPlan(getOffer('diagnostic'), DIAGNOSTIC_KEYS.map((k) => live(k, 'waived')), ASOF),
      ASOF,
    );
    expect(waived.display.kind).toBe('no_countable_milestones');
    if (waived.display.kind === 'no_countable_milestones') {
      expect(waived.display.waived).toBe(7);
      expect(waived.display.note).toMatch(/waived by agreement/i);
    }
  });

  it('carries the client-input count and the next thing that should move', () => {
    const view = composeProgressView(composeEngagementPlan(getOffer('diagnostic'), [], ASOF), ASOF);
    expect(view.awaitingClientInput).toBeGreaterThan(0);
    expect(view.next?.key).toBe(DIAGNOSTIC_KEYS[0]);
  });
});

// ── 3 · OVERDUE IS DERIVED, NEVER STORED ──────────────────────────────────────

describe('the evidence chase derives overdue from dates', () => {
  it('the same row is overdue or not depending only on when you ask', () => {
    const row = evidenceRow();

    const later = composeEvidenceChase([row], ASOF).rows[0]!;
    expect(later.overdue).toBe(true);
    expect(later.overdueByDays).toBe(6);
    expect(later.ageDays).toBe(20);

    // Identical row, earlier clock. Nothing about the row changed.
    const earlier = composeEvidenceChase([row], ISO(T0 - 10 * 86_400_000)).rows[0]!;
    expect(earlier.overdue).toBe(false);
    expect(earlier.overdueByDays).toBeNull();
    expect(earlier.status).toBe(later.status);
  });

  it('has nowhere to store an overdue flag', () => {
    // The absence half: `overdue` is not a status the database can hold, so a stale
    // job cannot make the chase list lie (delivery.ts:780-790).
    expect(EVIDENCE_STATUSES).not.toContain('overdue');
    const row = composeEvidenceChase([evidenceRow()], ASOF).rows[0]!;
    expect(row.status).toBe('requested');
  });

  it('treats an undated outstanding request as UNMANAGED, not as on time', () => {
    const chase = composeEvidenceChase([evidenceRow({ dueBy: null })], ASOF);
    expect(chase.rows[0]!.overdue).toBe(false);
    expect(chase.rows[0]!.unmanaged).toBe(true);
    expect(chase.unmanaged).toBe(1);
    expect(chase.headline).toMatch(/no due date, so nothing will ever flag them/);
  });

  it('keeps a refusal outstanding, and drops what is settled', () => {
    const chase = composeEvidenceChase(
      [
        evidenceRow({ id: 'ev-refused', status: 'refused', resolutionNote: 'Client will not share the cap table.' }),
        evidenceRow({ id: 'ev-received', status: 'received', receivedAt: ASOF }),
        evidenceRow({ id: 'ev-waived', status: 'waived', resolutionNote: 'Proceeding narrowed by agreement.' }),
      ],
      ASOF,
    );
    expect(chase.rows.map((r) => r.id)).toEqual(['ev-refused']);
    expect(chase.rows[0]!.refused).toBe(true);
    expect(chase.rows[0]!.resolutionNote).toMatch(/will not share/);
    expect(chase.refused).toBe(1);
    expect(chase.headline).toMatch(/refused — the scope needs re-agreeing, not chasing/);
  });

  it('carries the human-typed reference and nothing that could be followed', () => {
    const chase = composeEvidenceChase([evidenceRow()], ASOF);
    const row = chase.rows[0]!;

    expect(row.externalLocation).toBe("the client's own data room, folder 3 — ask Anna");
    expect(row.hasExternalReference).toBe(true);
    expect(chase.referenceNotice).toBe(EXTERNAL_REFERENCE_IS_INERT);
    expect(chase.referenceNotice).toMatch(/typed by an operator/i);
    expect(chase.referenceNotice).toMatch(/never resolves, retrieves or copies it/i);

    // The lockout, asserted as absence on the wire itself: there is no field a
    // surface could turn into a link, a preview or a download.
    for (const forbidden of ['url', 'href', 'link', 'downloadUrl', 'previewUrl', 'contentType', 'sizeBytes', 'storageKey', 'checksum', 'bucket']) {
      expect(Object.keys(row)).not.toContain(forbidden);
    }
  });

  it('sorts the worst first and states who is holding it', () => {
    const chase = composeEvidenceChase(
      [
        evidenceRow({ id: 'a', dueBy: ISO(T0 - 1 * 86_400_000) }),
        evidenceRow({ id: 'b', dueBy: ISO(T0 - 30 * 86_400_000), requestedFrom: 'counsel', requestedFromName: 'Meyer & Partners' }),
        evidenceRow({ id: 'c', dueBy: null }),
      ],
      ASOF,
    );
    expect(chase.rows.map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(chase.overdue).toBe(2);
    expect(chase.blockingOutstanding).toBe(3);
    expect(chase.headline).toMatch(/oldest is 30d late from Client's counsel \(Meyer & Partners\)/);
  });

  it('says so plainly when nothing is outstanding', () => {
    const chase = composeEvidenceChase([], ASOF);
    expect(chase.rows).toEqual([]);
    expect(chase.headline).toMatch(/Nothing outstanding/);
  });
});

// ── 4 · ACCEPTANCE REFUSALS, WITH THEIR REASONS ───────────────────────────────

describe('acceptance refusals reach the screen intact', () => {
  it('refuses review-required work that was never reviewed, and says why', () => {
    const view = composeAcceptanceView([deliverable()], [], ASOF);
    const row = view.rows[0]!;

    expect(row.verdict.canAccept).toBe(false);
    expect(row.verdict.state).toBe('blocked');
    expect(row.refusals.map((r) => r.code)).toEqual(['review_outstanding']);
    expect(row.refusals[0]!.detail).toMatch(/A named reviewer and a review date are both needed/);
    // The recorded basis for requiring review travels with the refusal: the operator
    // has to tell the client something better than REVIEW_OUTSTANDING.
    expect(row.refusals[0]!.detail).toMatch(/technical claims/);
    expect(view.awaitingReview).toBe(1);
    expect(view.acceptable).toBe(0);
    expect(view.blocked).toBe(1);
  });

  it('reports the rule rather than reimplementing it, and names where it is enforced', () => {
    const view = composeAcceptanceView([deliverable()], [], ASOF);
    expect(view.gateDbConstraint).toBe('gps_deliverable_no_acceptance_before_review');
    expect(view.gateMechanism).toMatch(/canAccept\(\) \(delivery\.ts:927\)/);
    expect(view.gateMechanism).toMatch(/0049_gps_delivery\.sql:328/);
    expect(view.gateMechanism).toMatch(/does not implement the rule/);
    expect(view.headline).toContain(REVIEW_GATE_DB_CONSTRAINT);
  });

  it('carries the engine verdict byte-for-byte, not a re-derivation of it', () => {
    const d = deliverable({ state: 'in_progress' });
    // `milestoneKey: null` is engagement-wide and always counts (delivery.ts:966-972).
    const evidence = [evidenceRow({ blocking: true, milestoneKey: null })];
    const row = composeAcceptanceView([d], evidence, ASOF).rows[0]!;
    // If the view ever grew its own copy of the gate, this is the assertion that
    // catches the two copies disagreeing.
    expect(row.verdict).toEqual(canAccept(d, evidence));
    expect(row.refusals.map((r) => r.code)).toEqual(['review_outstanding', 'not_handed_over', 'evidence_outstanding']);
    expect(row.refusals[2]!.detail).toMatch(/Blocking input outstanding from Client \(Anna \(COO\)\)/);
  });

  it('treats a half-recorded review as no review', () => {
    // reviewedAt with no reviewedBy. The view asks `reviewSatisfied` rather than
    // testing a field, so it cannot disagree with the engine or with 0049's
    // gps_deliverable_review_is_attributed constraint.
    const d = deliverable({ reviewedAt: ASOF, reviewedBy: null });
    const row = composeAcceptanceView([d], [], ASOF).rows[0]!;
    expect(row.reviewRecorded).toBe(reviewSatisfied(d));
    expect(row.reviewRecorded).toBe(false);
    expect(row.verdict.canAccept).toBe(false);
  });

  it('allows acceptance once the review is recorded and the work is handed over', () => {
    const view = composeAcceptanceView([deliverable({ reviewedBy: 'desk-nik', reviewedAt: ASOF })], [], ASOF);
    expect(view.rows[0]!.verdict.canAccept).toBe(true);
    expect(view.rows[0]!.refusals).toEqual([]);
    expect(view.acceptable).toBe(1);
    expect(view.awaitingReview).toBe(0);
  });

  it('answers an already-accepted deliverable idempotently rather than as a failure', () => {
    const view = composeAcceptanceView(
      [deliverable({ state: 'accepted', acceptedAt: ASOF, acceptedBy: 'client-anna', reviewedBy: 'desk-nik', reviewedAt: ASOF })],
      [],
      ASOF,
    );
    expect(view.rows[0]!.verdict.state).toBe('accepted');
    expect(view.rows[0]!.refusals.map((r) => r.code)).toEqual(['already_accepted']);
    expect(view.accepted).toBe(1);
    expect(view.acceptable).toBe(0);
    expect(view.blocked).toBe(0);
  });

  it('flags work product that answers to no milestone as possibly unpriced scope', () => {
    const view = composeAcceptanceView([deliverable({ milestoneKey: null })], [], ASOF);
    expect(view.rows[0]!.outsideThePlan).toBe(true);
    expect(view.outsideThePlan).toBe(1);
    expect(view.headline).toMatch(/may never have been priced/);
  });
});

// ── 5 · THE COORDINATION CEILING CAN BE HIT, AND HITTING IT IS SAID ───────────

describe('WIP against the coordination ceiling', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => loadRow({ engagementId: `eng-${i}`, clientId: `cl-${i}` }));

  it('STATES that he is over the ceiling, in hours, first', () => {
    const view = composeWipView(many(5), ASOF); // 5 × 3h = 15h against a 12h ceiling

    expect(view.ceiling.committedHoursPerWeek).toBe(15);
    expect(view.ceiling.capacityHoursPerWeek).toBe(12);
    expect(view.ceiling.overCeiling).toBe(true);
    expect(view.ceiling.overByHours).toBe(3);
    // Negative, not clamped: "0h headroom" and "-3h headroom" are different facts.
    expect(view.ceiling.headroomHours).toBe(-3);
    expect(view.statement.startsWith('OVER COORDINATION CEILING.')).toBe(true);
    expect(view.anotherEngagement.verdict).toBe('over_ceiling');
    expect(view.anotherEngagement.because).toMatch(/OVER CEILING by 3h\/week: 15h committed against a 12h ceiling/);
    expect(view.anotherEngagement.because).toMatch(/sold time he does not have/);
  });

  it('distinguishes AT the ceiling from over it', () => {
    const at = composeWipView(many(4), ASOF); // exactly 12h
    expect(at.ceiling.atCeiling).toBe(true);
    expect(at.ceiling.overCeiling).toBe(false);
    expect(at.ceiling.headroomHours).toBe(0);
    expect(at.ceiling.overByHours).toBeNull();
    expect(at.anotherEngagement.verdict).toBe('at_ceiling');
    expect(at.anotherEngagement.because).toMatch(/no headroom/);

    const under = composeWipView(many(1), ASOF);
    expect(under.anotherEngagement.verdict).toBe('capacity_remains');
    expect(under.ceiling.headroomHours).toBe(9);
    expect(under.ceiling.utilisationPct).toBe(25);
  });

  it('attributes every committed hour to the engagement that caused it', () => {
    const rows = [
      loadRow({ engagementId: 'eng-a' }),
      loadRow({ engagementId: 'eng-b', clientId: 'cl-2', offerKey: 'gtm_sprint', milestones: deriveMilestonesForOffer('gtm_sprint') }),
    ];
    const view = composeWipView(rows, ASOF);

    // D1: the total opens to its rows, and the rows add up to it.
    const sum = view.hourDrivers.reduce((t, d) => t + d.points, 0);
    expect(sum).toBe(view.load.coordinationHoursPerWeek);
    expect(view.hourDrivers.map((d) => d.label.includes('eng-a') || d.label.includes('eng-b'))).toEqual([true, true]);
    expect(view.hourDrivers.some((d) => d.label.startsWith('UNATTRIBUTED'))).toBe(false);
    // Highest draw first: the GTM sprint costs more of his time than a diagnostic.
    expect(view.hourDrivers[0]!.label).toContain('eng-b');
  });

  it('lets a measured figure override the placeholder, per engagement', () => {
    const view = composeWipView([loadRow({ coordinationHoursPerWeek: 11 })], ASOF);
    expect(view.ceiling.committedHoursPerWeek).toBe(11);
    expect(view.hourDrivers[0]!.points).toBe(11);
  });

  it('keeps the placeholder warning BESIDE the number, never folded into it', () => {
    const view = composeWipView(many(2), ASOF);
    // D3: the hours are not shaded, discounted or hedged — they are reported as the
    // engine computed them, with the basis stated next to them.
    expect(view.ceiling.committedHoursPerWeek).toBe(6);
    expect(view.ceiling.utilisationPct).toBe(view.load.utilisationPct);
    expect(view.basisIsMeasured).toBe(false);
    expect(view.basisNote).toMatch(/PLACEHOLDERS, not measured/);
    expect(view.basisNote).toMatch(/delivery\.ts:1160-1196/);
    expect(view.anotherEngagement.because).toMatch(/on placeholder hours, which he has not yet replaced/);
  });

  it('counts a blocked engagement at full cost, and says why', () => {
    const blocked = loadRow({
      milestones: deriveMilestonesForOffer('diagnostic').map((m, i) =>
        i === 2 ? ({ ...m, state: 'blocked', blockedReason: 'Waiting on the client.' } as Milestone) : m,
      ),
    });
    const view = composeWipView([blocked], ASOF);
    expect(view.load.blocked).toBe(1);
    expect(view.hourDrivers[0]!.points).toBe(3);
    expect(view.statement).toMatch(/Blocked engagements are still counted/);
  });

  it('names the engagements he would have to deliver himself', () => {
    // partnerOwner is null on all five offers (D5 unanswered), so every live
    // engagement is unstaffable today and the number is stated rather than found out.
    const view = composeWipView(many(2), ASOF);
    expect(view.load.unstaffable).toBe(2);
    expect(view.statement).toMatch(/have no named partner, so they are his to deliver/);
  });

  it('an empty desk is not a hidden ceiling breach', () => {
    const view = composeWipView([], ASOF);
    expect(view.ceiling.committedHoursPerWeek).toBe(0);
    expect(view.ceiling.overCeiling).toBe(false);
    expect(view.ceiling.atCeiling).toBe(false);
    expect(view.anotherEngagement.verdict).toBe('capacity_remains');
    expect(view.hourDrivers).toEqual([]);
  });
});

// ── 6 · THE WIRE ──────────────────────────────────────────────────────────────

describe('DeliveryResponse', () => {
  const response = (over: Parameters<typeof composeDeliveryResponse>[0] | null = null) =>
    composeDeliveryResponse(
      over ?? {
        engagement: { id: 'eng-1', clientId: 'cl-1', clientName: 'Nordwind Labs', offerKey: 'diagnostic', status: 'in_delivery' },
        liveMilestones: [live(DIAGNOSTIC_KEYS[0]!, 'complete'), live(DIAGNOSTIC_KEYS[2]!, 'blocked', 'Client has not returned the tokenomics table.')],
        evidence: [evidenceRow()],
        deliverables: [deliverable()],
        deskLoad: [loadRow(), loadRow({ engagementId: 'eng-2', clientId: 'cl-2' })],
        asOf: ASOF,
      },
    );

  it('has exactly the documented field list', () => {
    // The contract rule: this shape is declared once, here, and both the API and the
    // web import it. A hand-copied web interface declaring fields the API never
    // returned is what took production down; this assertion is the tripwire.
    expect(Object.keys(response()).sort()).toEqual([
      'acceptance',
      'asOf',
      'engagement',
      'evidence',
      'lockout',
      'notices',
      'plan',
      'progress',
      'wip',
    ]);
  });

  it('dates every sub-view from one clock, so a printed page is coherent', () => {
    const res = response();
    expect(res.asOf).toBe(ASOF);
    expect([res.progress.asOf, res.evidence.asOf, res.acceptance.asOf, res.wip.asOf]).toEqual([ASOF, ASOF, ASOF, ASOF]);
    expect(res.plan.drift.checkedAt).toBe(ASOF);
  });

  it('resolves the engagement header without inventing anything', () => {
    const res = response();
    expect(res.engagement.offerName).toBe(getOffer('diagnostic').name);
    expect(res.engagement.statusLabel).toBe('In delivery');
    expect(res.engagement.clientName).toBe('Nordwind Labs');

    const anonymous = composeDeliveryResponse({
      engagement: { id: 'eng-1', clientId: 'cl-1', offerKey: 'diagnostic', status: 'accepted' },
      asOf: ASOF,
    });
    // Null, never a placeholder name.
    expect(anonymous.engagement.clientName).toBeNull();
  });

  it('measures drift against the offer AS SOLD when a snapshot is passed', () => {
    const asSold = withCriteria('diagnostic', [...getOffer('diagnostic').acceptanceCriteria, 'A promise from an older catalogue.']);
    const res = composeDeliveryResponse({
      engagement: { id: 'eng-1', clientId: 'cl-1', offerKey: 'diagnostic', status: 'in_delivery', offer: asSold },
      asOf: ASOF,
    });
    expect(res.plan.drift.matchesSale).toBe(false);
    expect(res.plan.drift.criteriaSold).toBe(4);
  });

  it('argues back, hardest first', () => {
    const notices = response().notices;
    const codes = notices.map((n) => n.code);
    // Review outstanding leads, ahead of the block, for the reason the engine gives
    // for ordering it first in `canAccept` (delivery.ts:939-943): it is the only item
    // that is about LCX's own exposure rather than the client's convenience, and the
    // first line is the one a hurried operator reads.
    expect(codes[0]).toBe('acceptance_review_outstanding');
    expect(notices[0]!.severity).toBe('refusal');
    expect(codes.indexOf('delivery_blocked')).toBeLessThan(codes.indexOf('evidence_overdue'));
    expect(codes).toContain('evidence_overdue');
    expect(codes).toContain('no_named_partner');
    // The placeholder badge is unconditional while the hours are placeholders, and
    // it is a badge rather than a warning: it is a statement about the data.
    const badge = notices.find((n) => n.code === 'coordination_hours_are_placeholders');
    expect(badge?.severity).toBe('badge');
    // Every refusal names a mechanism or quotes the engine (D8).
    const review = notices.find((n) => n.code === 'acceptance_review_outstanding');
    expect(review?.mechanism).toMatch(/0049_gps_delivery\.sql:328/);
    const overdue = notices.find((n) => n.code === 'evidence_overdue');
    expect(overdue?.mechanism).toMatch(/never a stored status/);
  });

  it('puts scope drift above everything else it could say', () => {
    const res = composeDeliveryResponse({
      engagement: {
        id: 'eng-1',
        clientId: 'cl-1',
        offerKey: 'diagnostic',
        status: 'in_delivery',
        offer: withCriteria('diagnostic', [...getOffer('diagnostic').acceptanceCriteria, 'Unplanned.']),
      },
      deskLoad: [loadRow()],
      asOf: ASOF,
    });
    expect(res.notices[0]!.code).toBe('scope_drift');
    expect(res.notices[0]!.severity).toBe('refusal');
    expect(res.notices[0]!.mechanism).toMatch(/deriveMilestones\(\)/);
  });

  it('carries the lockout, with where it is enforced', () => {
    const res = response();
    expect(res.lockout.noClientDocumentStore).toMatch(/GPS does not (hold|store)|no place|nowhere/i);
    expect(res.lockout.externalReferenceIsInert).toBe(EXTERNAL_REFERENCE_IS_INERT);
    expect(res.lockout.enforcedBy.join(' ')).toMatch(/intakeLockout\.test\.ts/);
    expect(res.lockout.enforcedBy.join(' ')).toMatch(/0049_gps_delivery\.sql/);
    expect(res.lockout.enforcedBy.length).toBeGreaterThanOrEqual(3);
  });

  it('has no field anywhere that a surface could turn into a download', () => {
    /**
     * The absence assertion, walked over the whole composed tree rather than over one
     * interface. If an intake ever grows, it grows a field name, and this is where the
     * field name surfaces. `lockout` is excluded because its field names have to say
     * "document" — that subtree exists to state that there is no document store.
     */
    const forbidden = /upload|attach|\bfiles?\b|blob|bytes|base64|mime|contentType|storageKey|checksum|bucket|payload|download|preview|href|\burl\b/i;
    const seen: string[] = [];
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
          seen.push(k);
          expect(forbidden.test(k), `DeliveryResponse carries a field named "${k}"`).toBe(false);
          walk(v);
        }
      }
    };
    const { lockout: _lockout, ...rest } = response();
    walk(rest);
    // The walk must actually have walked, or this proves nothing.
    expect(seen.length).toBeGreaterThan(60);
    expect(seen).toContain('externalLocation');
  });

  it('composes an engagement with nothing recorded yet without pretending', () => {
    const res = composeDeliveryResponse({
      engagement: { id: 'eng-9', clientId: 'cl-9', offerKey: 'mica_whitepaper', status: 'accepted' },
      asOf: ASOF,
    });
    expect(res.plan.usable).toBe(true);
    expect(res.plan.recordedCount).toBe(0);
    expect(res.progress.display.kind).toBe('percent');
    expect(res.evidence.rows).toEqual([]);
    expect(res.acceptance.rows).toEqual([]);
    expect(res.wip.load.active).toBe(0);
    expect(res.notices.map((n) => n.code)).toEqual(['coordination_hours_are_placeholders']);
  });
});
