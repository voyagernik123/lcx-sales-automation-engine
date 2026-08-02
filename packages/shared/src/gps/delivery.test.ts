import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OFFER_KEYS } from './types.js';
import type { OfferKey } from './types.js';
import { getOffer } from './catalogue.js';
import {
  NO_CLIENT_DOCUMENT_STORE_REASON,
  DELIVERABLE_STATES,
  TODO_COORDINATION_CAPACITY_HOURS_PER_WEEK,
  canAccept,
  deriveMilestones,
  deriveMilestonesForOffer,
  engagementProgress,
  isEvidenceOverdue,
  wipLoad,
} from './delivery.js';
import type {
  Deliverable,
  DeliverableState,
  DeliveryLoadInput,
  EvidenceRequest,
  Milestone,
} from './delivery.js';

/**
 * GPS DELIVERY — behavioural tests, plus the ratchet that keeps client documents
 * out of LCX infrastructure.
 *
 * The four things asserted hardest are the four that would otherwise be
 * discovered in front of a client:
 *  1. a delivery plan that does not deliver what was sold (or delivers what was
 *     not) fails LOUDLY at derivation, per offer;
 *  2. acceptance is refused, with a reason, while a required review is missing —
 *     asserted across every deliverable state, not just the convenient one;
 *  3. a blocked engagement does not report as merely incomplete;
 *  4. nothing in this module can hold, fetch or point-and-retrieve a client
 *     document (`GPS_IMPLEMENTATION_PLAN.md` §4 S0.4, decision D2).
 */

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Applies states to a derived plan by milestone key. Keeps tests readable. */
function withStates(
  offerKey: OfferKey,
  states: Record<string, { state: Milestone['state']; blockedReason?: string }>,
): Milestone[] {
  return deriveMilestonesForOffer(offerKey).map((m) => {
    const patch = states[m.key];
    if (!patch) return m;
    return { ...m, state: patch.state, blockedReason: patch.blockedReason ?? null };
  });
}

function deliverable(patch: Partial<Deliverable> = {}): Deliverable {
  return {
    id: 'dlv_1',
    engagementId: 'eng_1',
    clientId: 'cli_1',
    milestoneKey: 'first_full_draft',
    title: 'White paper — first full draft',
    description: 'Complete draft covering issuer, offer, rights, technology and risk.',
    owner: 'partner',
    state: 'ready',
    reviewRequired: true,
    reviewBasis: 'Asserts the agreed requirements matrix is addressed.',
    reviewedBy: 'op_nik',
    reviewedAt: '2026-08-01T10:00:00.000Z',
    acceptedAt: null,
    acceptedBy: null,
    handoverChannel: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...patch,
  };
}

function evidence(patch: Partial<EvidenceRequest> = {}): EvidenceRequest {
  return {
    id: 'ev_1',
    engagementId: 'eng_1',
    clientId: 'cli_1',
    milestoneKey: 'first_full_draft',
    description: 'Deployed contract address and the actual vesting configuration.',
    requestedFrom: 'client',
    requestedFromName: 'Anna',
    requestedAt: '2026-07-10T00:00:00.000Z',
    dueBy: '2026-07-20T00:00:00.000Z',
    status: 'requested',
    externalLocation: null,
    blocking: true,
    receivedAt: null,
    resolutionNote: null,
    requestedBy: 'op_nik',
    ...patch,
  };
}

function load(patch: Partial<DeliveryLoadInput> = {}): DeliveryLoadInput {
  return {
    engagementId: 'eng_1',
    clientId: 'cli_1',
    offerKey: 'gtm_sprint',
    status: 'in_delivery',
    milestones: deriveMilestonesForOffer('gtm_sprint'),
    ...patch,
  };
}

// ── 1. Milestone derivation ───────────────────────────────────────────────────

describe('deriveMilestones — the plan cannot drift from what was sold', () => {
  it('produces a real, ordered, offer-specific plan for all five offers', () => {
    for (const key of OFFER_KEYS) {
      const plan = deriveMilestonesForOffer(key);
      expect(plan.length, `${key} has no plan`).toBeGreaterThanOrEqual(7);
      expect(plan.map((m) => m.ordinal)).toEqual(plan.map((_, i) => i + 1));
      expect(new Set(plan.map((m) => m.key)).size).toBe(plan.length);
      for (const m of plan) {
        expect(m.offerKey).toBe(key);
        expect(m.state).toBe('not_started');
        expect(m.blockedReason).toBeNull();
        expect(m.title.length).toBeGreaterThan(8);
        expect(m.intent.length).toBeGreaterThan(20);
      }
    }
  });

  it('gives each offer a plan of its own — no shared template', () => {
    // A MiCA programme and a GTM sprint share no milestone key. If they ever do,
    // someone has generified the plans and the acceptance criteria they answer to
    // no longer describe the work.
    const mica = new Set(deriveMilestonesForOffer('mica_whitepaper').map((m) => m.key));
    const gtm = deriveMilestonesForOffer('gtm_sprint').map((m) => m.key);
    expect(gtm.filter((k) => mica.has(k))).toEqual([]);

    // And the plans are shaped by the offer: the sprint has its four dated weeks,
    // the opinion coordination waits on counsel twice.
    expect(gtm.filter((k) => /^week\d/.test(k))).toHaveLength(4);
    const opinion = deriveMilestonesForOffer('legal_opinion_coordination');
    expect(opinion.filter((m) => m.owner === 'counsel').length).toBeGreaterThanOrEqual(2);
  });

  it('carries every acceptance criterion verbatim, and covers all of them', () => {
    for (const key of OFFER_KEYS) {
      const offer = getOffer(key);
      const plan = deriveMilestones(offer);
      const carried = new Set(plan.flatMap((m) => m.acceptanceCriteria));

      // Verbatim: every quoted line is identical to a catalogue line, never a
      // paraphrase — this is the sentence a partner is paid against.
      for (const line of carried) {
        expect(offer.acceptanceCriteria).toContain(line);
      }
      // Complete: nothing sold is left undelivered by the plan.
      for (const line of offer.acceptanceCriteria) {
        expect(carried, `${key} sells "${line}" and no milestone delivers it`).toContain(line);
      }
      // And no milestone answers to nothing (unsold scope = unbilled overrun).
      for (const m of plan) {
        expect(m.acceptanceCriteria.length, `${key}/${m.key}`).toBeGreaterThan(0);
      }
    }
  });

  it('names the client or counsel where the work is genuinely theirs', () => {
    // The honest version of "delays were on their side". Every offer has at least
    // one client/counsel-owned milestone flagged as awaiting an input.
    for (const key of OFFER_KEYS) {
      const plan = deriveMilestonesForOffer(key);
      const external = plan.filter((m) => m.owner === 'client' || m.owner === 'counsel');
      expect(external.length, `${key} pretends every milestone is ours`).toBeGreaterThan(0);
      expect(plan.some((m) => m.awaitsClientInput)).toBe(true);
    }
    // The MiCA package cannot start before counsel confirms the regime — we never
    // characterise what a regime requires, so this milestone is counsel's.
    const first = deriveMilestonesForOffer('mica_whitepaper')[0]!;
    expect(first.owner).toBe('counsel');
    expect(first.awaitsClientInput).toBe(true);
  });

  it('throws when the catalogue gains a criterion the plan does not deliver', () => {
    const drifted = {
      ...getOffer('gtm_sprint'),
      acceptanceCriteria: [
        ...getOffer('gtm_sprint').acceptanceCriteria,
        'Weekly written status issued to the client throughout the sprint.',
      ],
    };
    expect(() => deriveMilestones(drifted)).toThrow(/does not deliver acceptance criterion/);
    // The message must name the orphaned sentence, or the failure is unactionable.
    expect(() => deriveMilestones(drifted)).toThrow(/Weekly written status/);
  });

  it('throws when a criterion is removed or reordered underneath the plan', () => {
    const truncated = {
      ...getOffer('marketing_activation'),
      acceptanceCriteria: getOffer('marketing_activation').acceptanceCriteria.slice(0, 2),
    };
    expect(() => deriveMilestones(truncated)).toThrow(/claims acceptance criterion/);
  });

  it('throws for an offer with no plan at all rather than returning an empty one', () => {
    const unknown = { ...getOffer('diagnostic'), key: 'not_an_offer' as OfferKey };
    expect(() => deriveMilestones(unknown)).toThrow(/no GPS delivery plan/);
  });
});

// ── 2. Acceptance ─────────────────────────────────────────────────────────────

describe('canAccept — refuses, and says why', () => {
  it('refuses while a required review is unrecorded, and names the gate', () => {
    const v = canAccept(deliverable({ reviewedBy: null, reviewedAt: null }));
    expect(v.canAccept).toBe(false);
    expect(v.state).toBe('blocked');
    expect(v.reasons[0]!.code).toBe('review_outstanding');
    expect(v.reasons[0]!.detail).toMatch(/named reviewer/);
    // The basis reaches the operator, so the refusal is explainable to a client.
    expect(v.reasons[0]!.detail).toContain('requirements matrix');
  });

  it('treats half a review record as no review', () => {
    // A reviewer with no date, or a date with no reviewer, is not an audit record.
    expect(canAccept(deliverable({ reviewedAt: null })).canAccept).toBe(false);
    expect(canAccept(deliverable({ reviewedBy: null })).canAccept).toBe(false);
  });

  it('NEVER allows acceptance with an outstanding review, in any state', () => {
    // The absence assertion. Looped over every deliverable state because the
    // failure mode is a new state added later that skips the gate.
    for (const state of DELIVERABLE_STATES) {
      const v = canAccept(deliverable({ state, reviewedBy: null, reviewedAt: null, acceptedAt: null }));
      if (state === 'accepted') {
        // Already-accepted is reported as such rather than as acceptable.
        expect(v.canAccept).toBe(false);
        expect(v.state).toBe('accepted');
        continue;
      }
      expect(v.canAccept, `state=${state} accepted work with no review`).toBe(false);
      expect(v.reasons.map((r) => r.code)).toContain('review_outstanding');
    }
  });

  it('leads with the review when several things are wrong', () => {
    // Ordering is load-bearing: a hurried operator reads the first reason, and the
    // review is the only blocker that is about LCX's own exposure.
    const v = canAccept(
      deliverable({ state: 'in_progress', reviewedBy: null, reviewedAt: null }),
      [evidence()],
    );
    expect(v.reasons.map((r) => r.code)).toEqual([
      'review_outstanding',
      'not_handed_over',
      'evidence_outstanding',
    ]);
  });

  it('refuses when nothing has been handed over yet', () => {
    const v = canAccept(deliverable({ state: 'in_review' }));
    expect(v.reasons.map((r) => r.code)).toEqual(['not_handed_over']);
    expect(v.reasons[0]!.detail).toContain('in_review');
  });

  it('accepts a reviewed, handed-over deliverable with no outstanding inputs', () => {
    for (const state of ['ready', 'delivered'] as DeliverableState[]) {
      const v = canAccept(deliverable({ state }), [evidence({ status: 'received' })]);
      expect(v.canAccept, state).toBe(true);
      expect(v.state).toBe('ready');
      expect(v.reasons).toEqual([]);
    }
  });

  it('refuses on a blocking input the client has not supplied, and quotes it', () => {
    const v = canAccept(deliverable(), [evidence()]);
    expect(v.canAccept).toBe(false);
    expect(v.reasons[0]!.code).toBe('evidence_outstanding');
    expect(v.reasons[0]!.detail).toContain('Anna');
    expect(v.reasons[0]!.detail).toContain('vesting configuration');
  });

  it('treats a REFUSED input as still outstanding, not as settled', () => {
    // A refusal explains why the input will never arrive; it does not supply it.
    // Counting it as settled would silently unblock acceptance of work that was
    // never completable as scoped.
    const v = canAccept(deliverable(), [evidence({ status: 'refused', resolutionNote: 'Client will not share the cap table.' })]);
    expect(v.canAccept).toBe(false);
    expect(v.reasons[0]!.detail).toMatch(/refused, so the scope needs re-agreeing/);
  });

  it('lets received, waived and non-blocking inputs through', () => {
    expect(canAccept(deliverable(), [evidence({ status: 'received' })]).canAccept).toBe(true);
    expect(canAccept(deliverable(), [evidence({ status: 'waived', resolutionNote: 'Agreed out of scope.' })]).canAccept).toBe(true);
    expect(canAccept(deliverable(), [evidence({ blocking: false })]).canAccept).toBe(true);
    // Partially received is NOT received — half a factual record is not a record.
    expect(canAccept(deliverable(), [evidence({ status: 'partially_received' })]).canAccept).toBe(false);
  });

  it('ignores evidence belonging to another engagement or another milestone', () => {
    // A caller handing over the whole engagement's evidence must not block one
    // deliverable on an unrelated milestone's missing input.
    expect(canAccept(deliverable(), [evidence({ engagementId: 'eng_OTHER' })]).canAccept).toBe(true);
    expect(canAccept(deliverable(), [evidence({ milestoneKey: 'consistency_pass' })]).canAccept).toBe(true);
    // Engagement-wide requests (no milestone) always count.
    expect(canAccept(deliverable(), [evidence({ milestoneKey: null })]).canAccept).toBe(false);
  });

  it('reports an already-accepted deliverable as accepted, not as acceptable', () => {
    const v = canAccept(deliverable({ state: 'accepted', acceptedAt: '2026-08-02T09:00:00.000Z' }));
    expect(v.state).toBe('accepted');
    expect(v.canAccept).toBe(false);
    expect(v.reasons.map((r) => r.code)).toEqual(['already_accepted']);
    expect(v.reasons[0]!.detail).toContain('2026-08-02');
    // An acceptedAt with a stale state is still already-accepted: the timestamp is
    // the fact, and accepting twice would double-close a payment milestone.
    expect(canAccept(deliverable({ state: 'ready', acceptedAt: '2026-08-02T09:00:00.000Z' })).state).toBe('accepted');
  });

  it('does not mutate its inputs', () => {
    const d = deliverable({ state: 'ready' });
    const before = JSON.stringify(d);
    canAccept(d, [evidence()]);
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe('overdue is derived, never stored', () => {
  const now = new Date('2026-07-31T00:00:00.000Z').getTime();

  it('is overdue only while still outstanding', () => {
    expect(isEvidenceOverdue(evidence({ dueBy: '2026-07-20T00:00:00.000Z' }), now)).toBe(true);
    expect(isEvidenceOverdue(evidence({ dueBy: '2026-08-20T00:00:00.000Z' }), now)).toBe(false);
    expect(isEvidenceOverdue(evidence({ dueBy: '2026-07-20T00:00:00.000Z', status: 'received' }), now)).toBe(false);
    expect(isEvidenceOverdue(evidence({ dueBy: '2026-07-20T00:00:00.000Z', status: 'waived' }), now)).toBe(false);
    // Refused stays overdue: the work is still blocked.
    expect(isEvidenceOverdue(evidence({ dueBy: '2026-07-20T00:00:00.000Z', status: 'refused' }), now)).toBe(true);
  });

  it('an undated request is unmanaged, not overdue', () => {
    expect(isEvidenceOverdue(evidence({ dueBy: null }), now)).toBe(false);
    expect(isEvidenceOverdue(evidence({ dueBy: 'not a date' }), now)).toBe(false);
  });
});

// ── 3. Progress ───────────────────────────────────────────────────────────────

/** Three milestones done, and the fourth is stuck. The engagement has stopped. */
const BLOCKED_PLAN = withStates('mica_whitepaper', {
  counsel_regime_confirmation: { state: 'complete' },
  requirements_matrix: { state: 'complete' },
  source_material_indexed: { state: 'complete' },
  first_full_draft: { state: 'blocked', blockedReason: 'Specialist unavailable until the client confirms the token category.' },
});

/** Identical counts, nothing stuck. The engagement is merely early. */
const SLOW_PLAN = withStates('mica_whitepaper', {
  counsel_regime_confirmation: { state: 'complete' },
  requirements_matrix: { state: 'complete' },
  source_material_indexed: { state: 'complete' },
});

describe('engagementProgress — a blocked plan must not read as merely incomplete', () => {
  it('reports the same percentage for both plans, and does NOT stop there', () => {
    const blocked = engagementProgress(BLOCKED_PLAN);
    const slow = engagementProgress(SLOW_PLAN);

    // The number is identical. This is exactly why a number alone is a lie: one of
    // these engagements has stopped and the other has not.
    expect(blocked.completePct).toBe(33);
    expect(slow.completePct).toBe(blocked.completePct);

    expect(blocked.isBlocked).toBe(true);
    expect(blocked.state).toBe('blocked');
    expect(slow.isBlocked).toBe(false);
    expect(slow.state).toBe('in_progress');

    // And the sentence a human would paste into a status update differs.
    expect(blocked.headline).not.toBe(slow.headline);
    expect(blocked.headline.startsWith('BLOCKED')).toBe(true);
    expect(slow.headline).not.toMatch(/BLOCK/i);
  });

  it('names the blocked milestone, its owner and the reason', () => {
    const p = engagementProgress(BLOCKED_PLAN);
    expect(p.blocked).toBe(1);
    expect(p.blockers).toHaveLength(1);
    expect(p.blockers[0]!.key).toBe('first_full_draft');
    expect(p.blockers[0]!.owner).toBe('partner');
    expect(p.blockers[0]!.reasonMissing).toBe(false);
    expect(p.headline).toContain('Specialist unavailable');
    // "What next" is the blocked milestone itself, not the next startable one:
    // skipping ahead is how a stalled engagement looks busy.
    expect(p.next).toEqual({
      key: 'first_full_draft',
      ordinal: 4,
      title: 'First full draft delivered (20 business days)',
      owner: 'partner',
      state: 'blocked',
    });
  });

  it('surfaces an unexplained block rather than dropping it', () => {
    const p = engagementProgress(
      withStates('gtm_sprint', { kickoff: { state: 'blocked' } }),
    );
    expect(p.blockers[0]!.reasonMissing).toBe(true);
    expect(p.blockers[0]!.reason).toBeNull();
    expect(p.headline).toContain('no reason recorded');
  });

  it('sorts multiple blockers in plan order', () => {
    const p = engagementProgress(
      withStates('legal_opinion_coordination', {
        handover_pack: { state: 'blocked', blockedReason: 'Waiting on the opinion.' },
        counsel_engaged: { state: 'blocked', blockedReason: 'Client has not signed the engagement letter.' },
      }),
    );
    expect(p.blockers.map((b) => b.key)).toEqual(['counsel_engaged', 'handover_pack']);
    // The earliest blocker is the one worth chasing, so it leads the headline.
    expect(p.headline).toContain('engagement letter');
  });

  it('distinguishes not-started from in-progress from complete', () => {
    const fresh = engagementProgress(deriveMilestonesForOffer('diagnostic'));
    expect(fresh.state).toBe('not_started');
    expect(fresh.completePct).toBe(0);
    expect(fresh.notStarted).toBe(7);
    expect(fresh.headline).toMatch(/^Not started/);

    const done = deriveMilestonesForOffer('diagnostic').map((m) => ({ ...m, state: 'complete' as const }));
    const p = engagementProgress(done);
    expect(p.state).toBe('complete');
    expect(p.completePct).toBe(100);
    expect(p.headline).toMatch(/^Complete/);
  });

  it('keeps waived scope out of the denominator but visible', () => {
    const p = engagementProgress(
      withStates('mica_whitepaper', {
        counsel_regime_confirmation: { state: 'complete' },
        requirements_matrix: { state: 'complete' },
        source_material_indexed: { state: 'complete' },
        tokenomics_reconciliation: { state: 'waived' },
      }),
    );
    expect(p.total).toBe(9);
    expect(p.countable).toBe(8);
    expect(p.waived).toBe(1);
    expect(p.completePct).toBe(38); // 3 of 8, not 3 of 9
    expect(p.headline).toContain('1 waived by agreement');
  });

  it('returns null rather than 0% when there is nothing to count', () => {
    // "No plan" is not "0% done", and a UI must be able to tell them apart.
    const empty = engagementProgress([]);
    expect(empty.completePct).toBeNull();
    expect(empty.total).toBe(0);
    expect(empty.headline).toBe('No delivery plan yet.');

    const allWaived = deriveMilestonesForOffer('diagnostic').map((m) => ({ ...m, state: 'waived' as const }));
    const p = engagementProgress(allWaived);
    expect(p.completePct).toBeNull();
    expect(p.countable).toBe(0);
    expect(p.state).not.toBe('complete');
  });

  it('counts what is waiting on the client without calling it progress', () => {
    const fresh = engagementProgress(deriveMilestonesForOffer('marketing_activation'));
    expect(fresh.awaitingClientInput).toBe(2); // claims list + trained owner
    const settled = engagementProgress(
      withStates('marketing_activation', {
        claims_list_and_approver: { state: 'complete' },
        client_owner_trained: { state: 'waived' },
      }),
    );
    expect(settled.awaitingClientInput).toBe(0);
  });
});

// ── 4. Concurrent load ────────────────────────────────────────────────────────

describe('wipLoad — coordination hours are the ceiling, not engagement count', () => {
  const CAP = TODO_COORDINATION_CAPACITY_HOURS_PER_WEEK;

  it('reports an empty desk without inventing a utilisation', () => {
    const w = wipLoad([]);
    expect(w.active).toBe(0);
    expect(w.coordinationHoursPerWeek).toBe(0);
    expect(w.overCapacity).toBe(false);
    expect(w.headline).toMatch(/^Nothing in delivery/);
  });

  it('adds the per-offer hours, not the engagements', () => {
    const w = wipLoad([
      load({ engagementId: 'e1', clientId: 'c1', offerKey: 'gtm_sprint' }),                                   // 6
      load({ engagementId: 'e2', clientId: 'c1', offerKey: 'legal_opinion_coordination', milestones: deriveMilestonesForOffer('legal_opinion_coordination') }), // 5
      load({ engagementId: 'e3', clientId: 'c2', offerKey: 'diagnostic', milestones: deriveMilestonesForOffer('diagnostic') }),  // 3
    ]);
    expect(w.active).toBe(3);
    expect(w.coordinationHoursPerWeek).toBe(14);
    // Two engagements for one client is one relationship, not two.
    expect(w.clients).toBe(2);
    expect(w.byOffer.gtm_sprint).toBe(1);
    expect(w.byOffer.legal_opinion_coordination).toBe(1);
    expect(w.byOffer.diagnostic).toBe(1);
    expect(w.byOffer.mica_whitepaper).toBe(0);
    expect(w.byOffer.marketing_activation).toBe(0);

    expect(w.capacityHoursPerWeek).toBe(CAP);
    expect(w.utilisationPct).toBe(Math.round((14 / CAP) * 100));
    expect(w.overCapacity).toBe(14 > CAP);
    expect(w.headline).toContain('OVER CAPACITY');
  });

  it('counts only work actually in delivery', () => {
    const w = wipLoad([
      load({ engagementId: 'e1', status: 'draft' }),
      load({ engagementId: 'e2', status: 'conflict_pending' }),
      load({ engagementId: 'e3', status: 'proposed' }),
      load({ engagementId: 'e4', status: 'closed_lost' }),
      load({ engagementId: 'e5', status: 'cancelled' }),
      load({ engagementId: 'e6', status: 'collected' }),
    ]);
    expect(w.active).toBe(0);
    expect(w.coordinationHoursPerWeek).toBe(0);
    expect(w.awaitingCollection).toBe(0);
  });

  it('counts accepted, deposit_paid and in_delivery as live delivery', () => {
    // `accepted` is in the set on purpose: the day a client signs, a partner and a
    // kick-off are being scheduled, deposit or no deposit.
    for (const status of ['accepted', 'deposit_paid', 'in_delivery'] as const) {
      expect(wipLoad([load({ status })]).active, status).toBe(1);
    }
  });

  it('counts delivered and invoiced work as awaiting collection, with no delivery hours', () => {
    // Chasing an invoice is real work but it is not delivery work, and a made-up
    // fraction of an hour would make an uncalibrated model look precise.
    const w = wipLoad([load({ engagementId: 'e1', status: 'delivered' }), load({ engagementId: 'e2', status: 'invoiced' })]);
    expect(w.awaitingCollection).toBe(2);
    expect(w.active).toBe(0);
    expect(w.coordinationHoursPerWeek).toBe(0);
  });

  it('does NOT free capacity when an engagement is blocked', () => {
    // Chasing IS the coordination work. A model that discounted blocked work would
    // recommend taking on a fifth engagement precisely when four are stuck.
    const blocked = wipLoad([load({ milestones: withStates('gtm_sprint', { kickoff: { state: 'blocked', blockedReason: 'No date from the CEO.' } }) })]);
    const running = wipLoad([load({ milestones: withStates('gtm_sprint', { kickoff: { state: 'in_progress' } }) })]);
    expect(blocked.coordinationHoursPerWeek).toBe(running.coordinationHoursPerWeek);
    expect(blocked.blocked).toBe(1);
    expect(running.blocked).toBe(0);
    expect(blocked.headline).toContain('still costing hours');
  });

  it('prefers a measured figure over the placeholder when one is supplied', () => {
    const w = wipLoad([load({ coordinationHoursPerWeek: 2 })]);
    expect(w.coordinationHoursPerWeek).toBe(2);
    // A non-finite override falls back rather than producing NaN hours.
    expect(wipLoad([load({ coordinationHoursPerWeek: Number.NaN })]).coordinationHoursPerWeek).toBe(6);
  });

  it('counts engagements waiting on a client or counsel input', () => {
    const w = wipLoad([
      load({ engagementId: 'e1' }),
      load({ engagementId: 'e2', milestones: withStates('gtm_sprint', { deposit_and_inputs: { state: 'complete' } }) }),
    ]);
    expect(w.awaitingClientInput).toBe(1);
  });

  it('admits that nothing can be staffed yet (D5)', () => {
    // `partnerOwner` is null on all five offers until named partners exist
    // (`catalogue.ts`, CATALOGUE_TODOS D5). Every live engagement is therefore one
    // he would deliver himself, which is the assumption this model breaks under.
    //
    // WHEN THIS TEST FAILS, D5 HAS BEEN ANSWERED. Update it deliberately — do not
    // relax it to make a green build.
    const w = wipLoad([load({ engagementId: 'e1' }), load({ engagementId: 'e2', offerKey: 'mica_whitepaper', milestones: deriveMilestonesForOffer('mica_whitepaper') })]);
    expect(w.unstaffable).toBe(w.active);
    expect(w.headline).toContain('no named partner');
  });

  it('flags its own hours as placeholders so no surface can present them as measured', () => {
    const w = wipLoad([load()]);
    expect(w.usesPlaceholderHours).toBe(true);
    expect(w.headline).toContain('placeholder hours, not measured');
  });
});

// ── 5. THE RATCHET ────────────────────────────────────────────────────────────

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THIS SECTION MUST FAIL IF ANYONE ADDS A WAY TO STORE A CLIENT'S DOCUMENT.
 * ══════════════════════════════════════════════════════════════════════════════
 *  `GPS_IMPLEMENTATION_PLAN.md` §4 S0.4: artifact intake is absent BY
 *  CONSTRUCTION until decision D2 is answered — whether LCX may hold a third
 *  party's unpublished regulatory filings and privileged-adjacent legal work
 *  product on LCX infrastructure, and whether LCX is controller or processor for
 *  it. §2 gives the test: does this slice cause LCX infrastructure to hold a third
 *  party's confidential material?
 *
 *  Source-level assertions, and that is the right level here. A behavioural test
 *  cannot prove the ABSENCE of a capability — it can only exercise the ones that
 *  exist. What it can prove is that this compartment's shared layer contains no
 *  primitive with which a document could be received, retrieved, buffered or
 *  keyed, and no field name that would be the first step in adding one.
 *
 *  This is the domain layer's ratchet. It is not a substitute for the route-level
 *  one: no HTTP surface may grow an intake path either, and that assertion belongs
 *  beside the routes.
 *
 *  IF YOU ARE HERE BECAUSE THIS TEST FAILED: the fix is not to widen the pattern
 *  list. Either the DPO answer exists — in which case the change is a reviewed,
 *  deliberate commit that cites it and rewrites this comment — or it does not, in
 *  which case the code being added must not be added.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Every GPS shared module except the tests. Comments stripped: prose may DISCUSS
 *  a document store; code may not contain one. */
const MODULES = readdirSync(HERE)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .sort();
const CODE: ReadonlyArray<readonly [string, string]> = MODULES.map(
  (f) => [f, strip(readFileSync(resolve(HERE, f), 'utf8'))] as const,
);

describe('no client document can be stored, fetched or pointed-and-retrieved', () => {
  it('is actually reading the module it claims to guard', () => {
    // Without this, a glob that silently matched nothing would make every
    // assertion below pass forever.
    expect(MODULES).toContain('delivery.ts');
    expect(CODE.every(([, src]) => src.length > 100)).toBe(true);
  });

  it('contains no primitive that could receive or retrieve a document', () => {
    /**
     * THE SHARED GPS DOMAIN IS PURE, AND THAT DID NOT CHANGE ON 2026-08-02.
     *
     * D2 was answered YES and an intake surface exists — in `apps/api/src/gps/artifact.ts`
     * and `routes/gpsArtifact.ts`, both of which are outside this package. This layer
     * still computes plans, progress and views over rows, holds no bytes, opens no
     * stream, reads no file and dereferences nothing, so every assertion here is still
     * true and still worth holding: the day a document primitive appears in a pure
     * domain module is the day a client's file is being handled somewhere with no
     * ceiling, no digest and no audit row.
     *
     * TWO OF THESE ARE NOW WORD-SHAPED RATHER THAN PRIMITIVE-SHAPED. Operator-facing
     * prose in this package has to be able to say "upload it to the engagement" — that
     * IS the honest instruction now, and a ratchet that forbade the word would force the
     * copy to describe the feature by not naming it. So `upload` and `attachment` are
     * checked against code with STRING LITERALS REMOVED as well as comments: an
     * identifier, field or call may not mention them; a sentence shown to a human may.
     * Everything else — bytes, buckets, filesystem, fetch — is still matched against the
     * full text, string literals included, because there is no honest reason for any of
     * those words to appear in a string here either.
     */
    const IDENTIFIER_LEVEL: readonly [RegExp, string][] = [
      [/\bupload/i, 'an intake identifier — intake lives in apps/api, never in the pure domain layer'],
      [/\battachments?\b/i, 'an attachment concept, i.e. somewhere to put a file'],
    ];
    const TEXT_LEVEL: readonly [RegExp, string][] = [
      [/multipart|form-?data/i, 'a body encoding that only exists to carry files'],
      [/base64/i, 'a column that holds a document while pretending to be text'],
      [/\bblob\b|\bBuffer\b|Uint8Array|ArrayBuffer/, 'bytes'],
      [/\bbucket\b|presign|\bs3\b|storageKey|objectKey/i, 'an object store'],
      [/readFileSync|writeFileSync|readFile\(|writeFile\(|createReadStream/, 'filesystem access'],
      [/\bfetch\s*\(|XMLHttpRequest|axios|https?:\/\/\$\{/, 'a retrieval — externalLocation is read by humans, never dereferenced'],
      [/from\s+'node:|require\s*\(/, 'a runtime dependency this pure domain layer has no reason to hold'],
    ];
    // Single and double quoted literals and template chunks, replaced by a marker so
    // adjacent identifiers cannot accidentally join into one.
    const stripStrings = (s: string) =>
      s.replace(/'(?:[^'\\\n]|\\.)*'/g, " '' ").replace(/"(?:[^"\\\n]|\\.)*"/g, ' "" ').replace(/`(?:[^`\\]|\\.)*`/g, ' `` ');

    let identifierChecked = 0;
    for (const [file, src] of CODE) {
      for (const [pattern, why] of TEXT_LEVEL) {
        expect(src, `${file} matches ${pattern} — ${why}`).not.toMatch(pattern);
      }
      const identifiers = stripStrings(src);
      // Non-vacuity: stripping must not have eaten the file.
      expect(identifiers.length, `${file}: string-stripping removed everything — the extraction is broken`).toBeGreaterThan(100);
      identifierChecked++;
      for (const [pattern, why] of IDENTIFIER_LEVEL) {
        expect(identifiers, `${file} matches ${pattern} in CODE — ${why}`).not.toMatch(pattern);
      }
    }
    expect(identifierChecked).toBe(CODE.length);
  });

  it('declares no field that would be the first step in a document store', () => {
    // These are the names someone reaches for on day one of adding intake. Naming
    // them here makes the drift visible in review as a deleted assertion rather
    // than as an innocuous-looking column.
    const FIELDS =
      /\b(contents?|body|payload|bytes|sizeBytes|byteLength|mimeType|contentType|fileName|filename|originalName|checksum|sha256|md5|documentData|fileData|storagePath|objectPath)\s*\??\s*:/;
    for (const [file, src] of CODE) {
      expect(src, `${file} declares a document-bearing field`).not.toMatch(FIELDS);
    }
  });

  it('keeps the human-entered reference, and only that', () => {
    const delivery = CODE.find(([f]) => f === 'delivery.ts')![1];
    // The one seam exists — a string an operator types.
    expect(delivery).toContain('externalLocation: string | null');
    // And nothing consumes it: no call, no template, no member access on it.
    expect(delivery).not.toMatch(/externalLocation\s*[).[]/);
    expect(delivery).not.toMatch(/\$\{[^}]*externalLocation/);
  });

  it('keeps the REASON in the source, so the lock cannot be removed as unexplained', () => {
    // The raw file, comments included: the WHY is the part that stops a future
    // reader treating this as an oversight to tidy up.
    const raw = readFileSync(resolve(HERE, 'delivery.ts'), 'utf8');
    expect(raw).toMatch(/NEVER A FETCH/);
    expect(raw).toMatch(/NEVER A COPY/);
    expect(raw).toMatch(/\bD2\b/);
    expect(raw).toMatch(/controller or processor/);
    expect(raw).toMatch(/S0\.4|GPS_IMPLEMENTATION_PLAN/);
  });

  it('says the true thing to the operator, and promises nothing', () => {
    /**
     * THIS ASSERTION USED TO REQUIRE THE WORDS "does not hold client documents", and it
     * was changed on 2026-08-02 because that sentence became FALSE — not because it was
     * inconvenient. GPS holds client documents now. A test that kept demanding the old
     * claim would have been pinning a falsehood onto the delivery screen.
     *
     * What is required instead is the pair of facts that are true and that an operator
     * standing in front of a client's file needs in that order: this row is a reference
     * and nothing follows it, AND uploading is the other choice with consequences named.
     */
    expect(NO_CLIENT_DOCUMENT_STORE_REASON, 'the notice no longer says this row is a reference rather than a copy')
      .toMatch(/\bREFERENCE\b|\breference\b/);
    expect(NO_CLIENT_DOCUMENT_STORE_REASON, 'the notice no longer says the reference is never followed')
      .toMatch(/never resolves|never retriev|never copies|does not resolve/i);
    expect(NO_CLIENT_DOCUMENT_STORE_REASON, 'the notice no longer names the upload as the alternative, so an operator with a file in hand is told nothing')
      .toMatch(/upload/i);
    // The consequences of that alternative, named at the point of the choice. An intake
    // offered with no mention of retention or audit is an intake nobody consented to.
    expect(NO_CLIENT_DOCUMENT_STORE_REASON, 'the notice offers an upload without saying what happens to the file')
      .toMatch(/retention/i);
    expect(NO_CLIENT_DOCUMENT_STORE_REASON).toMatch(/recorded|audit/i);
    // The decision stays attributed and dated wherever it is asserted.
    expect(NO_CLIENT_DOCUMENT_STORE_REASON).toMatch(/\bD2\b/);
    expect(NO_CLIENT_DOCUMENT_STORE_REASON).toMatch(/2026-08-02/);
    // No "coming soon". A half-promise is how a client concludes the material may be
    // sent by some other route anyway.
    expect(NO_CLIENT_DOCUMENT_STORE_REASON).not.toMatch(/soon|shortly|temporar|for now|yet\b/i);
  });
});
