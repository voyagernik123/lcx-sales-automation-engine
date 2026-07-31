import type { EngagementStatus, OfferKey, ServiceOffer } from './types.js';
import { OFFER_KEYS } from './types.js';
import { getOffer } from './catalogue.js';

/**
 * GLOBAL SERVICES (GPS) — the DELIVERY domain. Phase 3, and the phase with a lock
 * in the middle of it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  WHAT THIS FILE DELIBERATELY CANNOT DO: HOLD A CLIENT'S DOCUMENT.
 * ══════════════════════════════════════════════════════════════════════════════
 *  Not a route, not a bucket, not a column, not a base-64 text field, not a
 *  pointer this code would ever dereference. That absence is a LOCK, not a
 *  missing feature, and the reason is a question nobody at LCX has answered:
 *
 *    may LCX hold a third party's unpublished regulatory filings and
 *    privileged-adjacent legal work product on its own infrastructure, and is
 *    LCX controller or processor for it?
 *
 *  That is decision D2 (`GPS_IMPLEMENTATION_PLAN.md` §3), and §2 states the test
 *  this whole phase is judged by: "Does this slice cause LCX infrastructure to
 *  hold a third party's confidential material?" Proposal generation does not.
 *  Receiving an unpublished white paper draft, a factual record assembled for
 *  counsel, or cap-table material DOES — that is the moment LCX becomes a
 *  processor for non-LCX confidential data, with a subprocessor chain (Supabase,
 *  Render, Cloudflare, an LLM vendor) nobody has disclosed to the client. §4 S0.4
 *  therefore requires the intake path to be absent BY CONSTRUCTION and a ratchet
 *  test to fail if anyone adds one. `delivery.test.ts` is that ratchet for this
 *  layer.
 *
 *  So Phase 3 models everything AROUND the artifact — the request for it, the
 *  status of it, the review of it, the acceptance of the work, and the audit of
 *  who asked whom and when — while the artifact itself stays where the client and
 *  counsel already keep it. What GPS holds is a HUMAN-ENTERED REFERENCE: a
 *  description an operator typed, and a location an operator typed. Never a
 *  fetch. Never a copy.
 *
 *  Turning intake on later must be a deliberate, reviewable change. It cannot
 *  happen by accident here, because there is no half-built path to finish: no
 *  field of any type in this file can carry bytes, and the field names one would
 *  reach for first (`contentType`, `storageKey`, `sizeBytes`, `checksum`) are
 *  asserted absent by name.
 *
 * WHAT IS MODELLED, AND WHY IN THIS SHAPE
 *  - `Milestone` is DERIVED from the offer's `acceptanceCriteria`, not authored
 *    beside them, so a delivery plan cannot drift from what was sold. A partner
 *    is paid against acceptance criteria (`catalogue.ts` — every offer's
 *    `acceptanceCriteria`), so a plan whose milestones answer to nothing in that
 *    list is a plan that pays for effort.
 *  - `engagementProgress` refuses to report a bare percentage. "60% done" with a
 *    blocked milestone is a lie, and it is the specific lie that loses a $10–25k
 *    engagement: the number reads as momentum while the work has stopped.
 *  - `wipLoad` counts COORDINATION load, not delivery hours. Founder fact
 *    (plan §0): partners deliver, he sells and coordinates — and he does it
 *    around a full-time job at a regulated exchange. Coordination hours are the
 *    real ceiling; bench depth is the other one (D5, still unanswered).
 *
 * Money stays integer cents everywhere in GPS (`types.ts`); this file happens not
 * to compute money at all — margin lives on the engagement, and delivery must not
 * become a second place where a price is derived.
 */

/**
 * The one string a surface may show where a document control would otherwise be.
 *
 * Exported as text rather than as a boolean on purpose: a boolean invites someone
 * to flip it, and flipping it would enable NOTHING, because no code path in GPS
 * accepts a document. Saying so in words is honest; a disabled-feature flag would
 * imply a feature exists behind it.
 */
export const NO_CLIENT_DOCUMENT_STORE_REASON =
  'GPS does not hold client documents. Keep the material where you and your counsel already keep it and record a reference here. Whether LCX may hold third-party confidential material is an open question for LCX legal/DPO (decision D2).';

// ── Actors ────────────────────────────────────────────────────────────────────

/**
 * Who a piece of delivery work belongs to.
 *
 * Four, not two, because the honest version of "delayed" needs to name the party:
 * `client` and `counsel` own a large share of every plan below (a MiCA package
 * cannot start until counsel confirms the regime; an opinion is issued by counsel,
 * never by us) and collapsing them into "external" is how a status report stops
 * being actionable.
 */
export type DeliveryActor = 'us' | 'partner' | 'client' | 'counsel';

/**
 * A deliverable can only be OURS or a PARTNER'S — the two parties who can be
 * accountable for work product we hand over. Narrowed from `DeliveryActor` rather
 * than declared separately so the two lists cannot drift.
 */
export type DeliverableOwner = Extract<DeliveryActor, 'us' | 'partner'>;

export const DELIVERY_ACTOR_LABELS: Record<DeliveryActor, string> = {
  us: 'Us',
  partner: 'Partner / specialist',
  client: 'Client',
  counsel: "Client's counsel",
};

// ── Milestones ────────────────────────────────────────────────────────────────

/**
 * `blocked` is a first-class state, distinct from `not_started`.
 *
 * The distinction is the whole point: not-started is a plan, blocked is a
 * problem, and a progress metric that treats them alike hides the only thing
 * worth escalating. `waived` exists because scope genuinely gets dropped by
 * agreement, and the alternative — marking a dropped milestone `complete` — puts
 * a false claim in the acceptance record a partner is paid against.
 */
export type MilestoneState =
  | 'not_started'
  | 'in_progress'
  | 'blocked'
  | 'complete'
  | 'waived';

export const MILESTONE_STATES: readonly MilestoneState[] = [
  'not_started', 'in_progress', 'blocked', 'complete', 'waived',
] as const;

export const MILESTONE_STATE_LABELS: Record<MilestoneState, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  complete: 'Complete',
  waived: 'Waived by agreement',
};

/**
 * The template a plan is generated from. Pure data, one per offer, and — the
 * load-bearing part — every spec names the indices of the offer's
 * `acceptanceCriteria` it answers for.
 *
 * `satisfies` is what stops the plan drifting from the sale. `deriveMilestones`
 * refuses a plan where a criterion is unclaimed (work sold with no milestone that
 * delivers it) or a milestone claims nothing (work planned that nobody sold).
 * Indices rather than copied text because the text lives in the catalogue and
 * must not exist twice.
 */
export interface MilestoneSpec {
  /** Stable key, unique within the offer. Safe to persist and to sort on. */
  key: string;
  title: string;
  /** Why this milestone exists, in one sentence a client could read. */
  intent: string;
  owner: DeliveryActor;
  /** Indices into `ServiceOffer.acceptanceCriteria`. Must be non-empty. */
  satisfies: readonly number[];
  /**
   * True where the milestone cannot start until the client (or counsel) supplies
   * something. These are the milestones that get an `EvidenceRequest`, and they
   * are the honest answer to "why is this late".
   */
  awaitsClientInput: boolean;
}

/** A milestone in a real engagement's plan. */
export interface Milestone {
  offerKey: OfferKey;
  key: string;
  /** 1-based position in the plan. Order is meaningful; these are sequenced. */
  ordinal: number;
  title: string;
  intent: string;
  owner: DeliveryActor;
  /**
   * The acceptance-criteria text this milestone answers for, verbatim from the
   * offer as quoted. Resolved at derivation so a status view can show a client
   * the sentence they agreed to, not a paraphrase of it.
   */
  acceptanceCriteria: readonly string[];
  awaitsClientInput: boolean;
  state: MilestoneState;
  /**
   * Required in practice when `state === 'blocked'`. Nullable because the type
   * cannot force it, so `engagementProgress` treats a blocked milestone with no
   * reason as blocked AND as its own reporting defect rather than quietly
   * dropping it.
   */
  blockedReason: string | null;
}

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE FIVE PLANS. Offer-specific, because the offers are not variations.
 * ══════════════════════════════════════════════════════════════════════════════
 *  A MiCA white paper programme and a GTM sprint share nothing operationally: one
 *  waits on counsel and ends at a notification pack, the other is four fixed
 *  weeks with a founder in the room and ends at a decided plan. A generic
 *  "kickoff → draft → review → deliver" template would be the same lie as a
 *  ×0.7/×1.6 price tier (`deals/index.ts:100-121`, retired in Phase 1): it looks
 *  like a plan and encodes nothing that was sold.
 *
 *  These are drafts of a DEFAULT plan, not a contract. What binds is the offer's
 *  `acceptanceCriteria`, quoted verbatim into each milestone, and frozen per
 *  engagement in `gps_engagement.scope_snapshot` (`types.ts`).
 */
const MILESTONE_PLANS: Record<OfferKey, readonly MilestoneSpec[]> = {
  /**
   * The diagnostic is short and its risk is at the front: the 10-business-day
   * clock in criterion 0 starts at "receipt of all required client inputs", so
   * the first milestone is the client's, and it is the one that actually slips.
   */
  diagnostic: [
    {
      key: 'inputs_received',
      title: 'Required client inputs received',
      intent:
        'The delivery clock in the acceptance criteria starts here, not at signature — so this milestone is dated and owned by the client.',
      owner: 'client',
      satisfies: [0],
      awaitsClientInput: true,
    },
    {
      key: 'intake_call',
      title: 'Intake call held (90 minutes)',
      intent: 'Establishes the commercial context the findings are reasoned from, with the client\'s own words on the record.',
      owner: 'us',
      satisfies: [0],
      awaitsClientInput: false,
    },
    {
      key: 'material_review',
      title: 'Review of existing documentation and public claims',
      intent: 'Every finding needs a stated basis; this is where the basis comes from.',
      owner: 'us',
      satisfies: [1],
      awaitsClientInput: true,
    },
    {
      key: 'findings_register',
      title: 'Findings register: severity, owner and basis per finding',
      intent: 'A finding without a named owner is a finding nobody will act on, and the acceptance criteria say so explicitly.',
      owner: 'us',
      satisfies: [1],
      awaitsClientInput: false,
    },
    {
      key: 'diagnostic_written',
      title: 'Written diagnostic issued (10–15 pages)',
      intent: 'The deliverable the fee buys, ranked by what blocks the client\'s next step.',
      owner: 'us',
      satisfies: [0, 1],
      awaitsClientInput: false,
    },
    {
      key: 'readout_call',
      title: 'Readout call held (60 minutes)',
      intent: 'A written diagnostic nobody walked through gets filed and forgotten; the readout is where the follow-on work is decided.',
      owner: 'us',
      satisfies: [2],
      awaitsClientInput: false,
    },
    {
      key: 'followon_proposal',
      title: 'Follow-on proposal issued (within 3 business days)',
      intent: 'The diagnostic is the qualification step; its fee is creditable, so the proposal is the point of the engagement.',
      owner: 'us',
      satisfies: [2],
      awaitsClientInput: false,
    },
  ],

  /**
   * The white paper package is gated on counsel TWICE — at the front (which
   * regime, which token category, hence which content requirements) and before
   * acceptance (counsel's written confirmation, criterion 2). We draft; we never
   * characterise what a regime requires (`catalogue.ts`, the wording note). Both
   * gates are milestones owned by `counsel`, so a status view names the party
   * actually holding the work.
   */
  mica_whitepaper: [
    {
      key: 'counsel_regime_confirmation',
      title: 'Counsel confirms applicable regime and token category',
      intent:
        'We draft to requirements counsel confirms and never assert what a regime demands; without this the requirements matrix cannot exist and work cannot start.',
      owner: 'counsel',
      satisfies: [0],
      awaitsClientInput: true,
    },
    {
      key: 'requirements_matrix',
      title: 'Requirements matrix agreed at kick-off',
      intent: 'Every required content item mapped to a section and a named owner — the line-by-line list acceptance is measured against.',
      owner: 'us',
      satisfies: [0],
      awaitsClientInput: false,
    },
    {
      key: 'source_material_indexed',
      title: 'Client source material identified and indexed by reference',
      intent:
        'We record what exists and where the client keeps it, so a missing input is visible before it becomes a slipped draft date.',
      owner: 'client',
      satisfies: [1],
      awaitsClientInput: true,
    },
    {
      key: 'first_full_draft',
      title: 'First full draft delivered (20 business days)',
      intent: 'The specialist\'s core work product: issuer, offer, rights, technology, risk and the plain-language summary.',
      owner: 'partner',
      satisfies: [1],
      awaitsClientInput: false,
    },
    {
      key: 'tokenomics_reconciliation',
      title: 'Tokenomics reconciled against the deployed configuration',
      intent:
        'Where the published schedule and the deployed contract disagree, the disagreement is reported — this is the most common and most avoidable finding.',
      owner: 'partner',
      satisfies: [3],
      awaitsClientInput: false,
    },
    {
      key: 'consistency_pass',
      title: 'Consistency pass across document, site and public claims',
      intent: 'A document contradicted by the client\'s own live material is worse than a late one, and criterion 3 makes that checkable.',
      owner: 'us',
      satisfies: [3],
      awaitsClientInput: false,
    },
    {
      key: 'counsel_review_rounds',
      title: 'Two revision rounds after counsel\'s review, with a change log',
      intent: 'Revisions are bounded at two rounds by the offer; the change log is what makes the boundary arguable rather than a fight.',
      owner: 'partner',
      satisfies: [2],
      awaitsClientInput: false,
    },
    {
      key: 'notification_pack',
      title: 'Notification pack assembled against the submission checklist',
      intent: 'Each item marked present or client-owned. We do not file — the client, counsel or the authorised entity does.',
      owner: 'us',
      satisfies: [4],
      awaitsClientInput: false,
    },
    {
      key: 'counsel_written_confirmation',
      title: 'Counsel confirms in writing that the matrix is addressed',
      intent:
        'The acceptance gate. It is counsel\'s confirmation, not ours, because we do not opine on whether a regime\'s requirements are met.',
      owner: 'counsel',
      satisfies: [2],
      awaitsClientInput: true,
    },
  ],

  /**
   * Coordination, not advice. The opinion is counsel's, issued to the client,
   * under counsel's engagement letter (`catalogue.ts`, this offer's exclusions).
   * So the two milestones that decide the timeline — engaging counsel and counsel
   * accepting the factual record — are NOT ours, and the plan says so rather than
   * implying we control them.
   */
  legal_opinion_coordination: [
    {
      key: 'question_scoping',
      title: 'Question scoping workshop held',
      intent: 'Turns "is our token legal?" into questions counsel can actually opine on, and names the ones not worth asking.',
      owner: 'us',
      satisfies: [0],
      awaitsClientInput: false,
    },
    {
      key: 'question_list_agreed',
      title: 'Scoped question list agreed in writing',
      intent: 'Agreed BEFORE any counsel is approached, per the acceptance criteria — approaching counsel on an unscoped question wastes the client\'s fee.',
      owner: 'client',
      satisfies: [0],
      awaitsClientInput: true,
    },
    {
      key: 'counsel_comparison',
      title: 'At least two counsel candidates compared per jurisdiction',
      intent: 'Credentials, precedent, indicative fee, indicative timeline and conflict position side by side — a comparison, not a referral.',
      owner: 'us',
      satisfies: [1],
      awaitsClientInput: false,
    },
    {
      key: 'counsel_engaged',
      title: 'Counsel engaged by the client (within 15 business days)',
      intent:
        'The client signs counsel\'s engagement letter and pays counsel directly; we never engage counsel in the client\'s name.',
      owner: 'client',
      satisfies: [2],
      awaitsClientInput: true,
    },
    {
      key: 'factual_record_assembled',
      title: 'Factual record assembled to counsel\'s specification',
      intent:
        'Structure, distribution history, public claims, governance and treasury — described and referenced, and checked against the client\'s live material before it reaches counsel.',
      owner: 'us',
      satisfies: [3],
      awaitsClientInput: true,
    },
    {
      key: 'factual_record_accepted',
      title: 'Counsel accepts the factual record as sufficient',
      intent: 'Criterion 3 also caps OUR latency: no information request older than 5 business days that is ours to close.',
      owner: 'counsel',
      satisfies: [3],
      awaitsClientInput: false,
    },
    {
      key: 'weekly_status_cadence',
      title: 'Weekly written status issued without a gap',
      intent: 'The offer sells process management; a silent week is the failure mode it exists to prevent.',
      owner: 'us',
      satisfies: [4],
      awaitsClientInput: false,
    },
    {
      key: 'opinion_issued',
      title: 'Opinion issued by counsel to the client',
      intent:
        'Counsel may qualify heavily, conclude against the client\'s commercial preference, or decline to opine — the fee covers coordination in every one of those outcomes.',
      owner: 'counsel',
      satisfies: [5],
      awaitsClientInput: false,
    },
    {
      key: 'handover_pack',
      title: 'Handover pack delivered (within 5 business days)',
      intent: 'The opinion as issued, the factual record as relied upon, and a register of counsel\'s stated reliance limitations.',
      owner: 'us',
      satisfies: [5],
      awaitsClientInput: false,
    },
  ],

  /**
   * Four fixed weeks with a fixed end date — "not a retainer" is the first
   * inclusion, so the plan is dated, not phased. Each weekly session is its own
   * milestone because criterion 1 is per-session ("each with written output
   * within 2 business days"), and a single "sprint delivered" milestone would let
   * three missed weeks hide behind one green tick at the end.
   */
  gtm_sprint: [
    {
      key: 'deposit_and_inputs',
      title: 'Deposit received and required inputs supplied',
      intent: 'The 5-business-day kick-off clock in criterion 0 runs from the later of these two, and one of them is cash.',
      owner: 'client',
      satisfies: [0],
      awaitsClientInput: true,
    },
    {
      key: 'kickoff',
      title: 'Kick-off held with founder or CEO present',
      intent: 'The offer requires the decision-maker in the room; a sprint run with a delegate produces a plan nobody adopts.',
      owner: 'us',
      satisfies: [0],
      awaitsClientInput: false,
    },
    {
      key: 'week1_positioning',
      title: 'Week 1 — positioning and narrative',
      intent: 'The single claim the project makes, tested against competitors and against the client\'s own current material.',
      owner: 'us',
      satisfies: [1],
      awaitsClientInput: false,
    },
    {
      key: 'week2_segments_channels',
      title: 'Week 2 — segments and distribution channels',
      intent: 'The segments worth pursuing, the ones to ignore, and the channels the client is currently over-investing in.',
      owner: 'us',
      satisfies: [1],
      awaitsClientInput: false,
    },
    {
      key: 'week3_sequencing_budget',
      title: 'Week 3 — TGE sequencing and budget allocation',
      intent: 'Dated phases with dependencies and owners on one page, and a budget model whose assumptions are visible.',
      owner: 'us',
      satisfies: [1],
      awaitsClientInput: false,
    },
    {
      key: 'week4_metrics_notdoing',
      title: 'Week 4 — metrics, review cadence and the not-doing list',
      intent: 'Five numbers with the decision each one triggers, and the decisions the client has made NOT to pursue, written down.',
      owner: 'us',
      satisfies: [1],
      awaitsClientInput: false,
    },
    {
      key: 'plan_delivered',
      title: 'Final plan delivered on the agreed end date',
      intent:
        'Positioning, segments, dated sequencing with owners, channel costs, budget and the not-doing list — with every target carrying its assumption and source.',
      owner: 'us',
      satisfies: [2, 3],
      awaitsClientInput: false,
    },
    {
      key: 'checkin_30day',
      title: '30-day written check-in delivered',
      intent: 'The sprint ends on a date; the check-in is how we learn whether the plan survived contact with execution.',
      owner: 'us',
      satisfies: [4],
      awaitsClientInput: false,
    },
  ],

  /**
   * The only offer where we execute, so the plan front-loads the two things that
   * make execution safe: an approved claims list with a named approver
   * (approval latency is the stated largest cause of a missed calendar) and a
   * moderation playbook handed to a trained client-side owner. Content cadence is
   * one milestone with a weekly criterion attached, because the shortfall rule in
   * criterion 1 is what makes a bad week reportable instead of invisible.
   */
  marketing_activation: [
    {
      key: 'claims_list_and_approver',
      title: 'Approved claims list and named approver in place',
      intent:
        'Nothing ships that is not traceable to an approval, and approval latency is the single largest cause of a missed calendar.',
      owner: 'client',
      satisfies: [2],
      awaitsClientInput: true,
    },
    {
      key: 'calendar_agreed',
      title: 'Editorial calendar published and agreed before week 1',
      intent: 'Every item dated, owned and approved before it ships — agreed before the window opens, per criterion 0.',
      owner: 'us',
      satisfies: [0],
      awaitsClientInput: false,
    },
    {
      key: 'moderation_playbook',
      title: 'Moderation playbook delivered by end of week 2',
      intent: 'Standing responses the client\'s team may use unescalated, and the escalation path for FUD and scam impersonation.',
      owner: 'us',
      satisfies: [3],
      awaitsClientInput: false,
    },
    {
      key: 'client_owner_trained',
      title: 'Client-side community owner trained',
      intent: 'The window ends; the community does not. An untrained hand-off is how an activation loses everything it built.',
      owner: 'client',
      satisfies: [3],
      awaitsClientInput: true,
    },
    {
      key: 'content_cadence',
      title: 'Agreed content volume delivered per channel per week',
      intent: 'Or the shortfall reported the same week with its cause named — the criterion that makes a bad week reportable.',
      owner: 'partner',
      satisfies: [1],
      awaitsClientInput: false,
    },
    {
      key: 'approval_trail',
      title: 'Approval trail maintained for every published item',
      intent: 'Claims control is the protection here: anything unsubstantiated is pulled rather than softened.',
      owner: 'us',
      satisfies: [2],
      awaitsClientInput: false,
    },
    {
      key: 'weekly_reporting',
      title: 'Weekly performance report issued every week',
      intent: 'Including the weeks performance declined — the offer promises honest reporting, so a skipped bad week is a breach.',
      owner: 'us',
      satisfies: [4],
      awaitsClientInput: false,
    },
    {
      key: 'retrospective',
      title: 'Retrospective delivered within 5 business days of window close',
      intent: 'What to keep, what to stop, and a costed recommendation — never an auto-renewal.',
      owner: 'us',
      satisfies: [5],
      awaitsClientInput: false,
    },
  ],
};

/**
 * The default delivery plan for an offer, ordered, with the sold acceptance
 * criteria attached.
 *
 * THROWS rather than returning a partial plan, in three cases, all of them the
 * same underlying defect — the plan and the sale have drifted:
 *
 *  1. a milestone claims an acceptance criterion that does not exist (a criterion
 *     was deleted or reordered in the catalogue and the plan was not updated);
 *  2. a milestone claims none (work planned that nobody sold, i.e. unbilled
 *     scope — the failure mode that eats a $10–25k engagement's margin);
 *  3. an acceptance criterion is claimed by no milestone (work SOLD that the plan
 *     does not deliver — the failure mode that loses the client).
 *
 * Loud, because a partner is paid against these criteria and a silently
 * incomplete plan is how a partner gets paid for work the client did not receive.
 * The precedent is `getOffer` (`catalogue.ts`), which throws on an unknown key
 * rather than pricing at zero.
 */
export function deriveMilestones(offer: ServiceOffer): Milestone[] {
  const specs = MILESTONE_PLANS[offer.key];
  if (!specs || specs.length === 0) {
    throw new Error(`no GPS delivery plan for offer: ${offer.key}`);
  }
  const criteria = offer.acceptanceCriteria;
  const claimed = new Set<number>();
  const seenKeys = new Set<string>();

  for (const spec of specs) {
    if (seenKeys.has(spec.key)) {
      throw new Error(`GPS delivery plan for ${offer.key}: duplicate milestone key "${spec.key}"`);
    }
    seenKeys.add(spec.key);

    if (spec.satisfies.length === 0) {
      throw new Error(
        `GPS delivery plan for ${offer.key}: milestone "${spec.key}" satisfies no acceptance criterion — ` +
          'either it is unsold scope or the criterion it delivers is missing from the catalogue',
      );
    }
    for (const index of spec.satisfies) {
      if (!Number.isInteger(index) || index < 0 || index >= criteria.length) {
        throw new Error(
          `GPS delivery plan for ${offer.key}: milestone "${spec.key}" claims acceptance criterion ` +
            `${index}, but the offer has ${criteria.length}`,
        );
      }
      claimed.add(index);
    }
  }

  const unclaimed = criteria.map((_, i) => i).filter((i) => !claimed.has(i));
  if (unclaimed.length > 0) {
    throw new Error(
      `GPS delivery plan for ${offer.key} does not deliver acceptance criterion ` +
        `${unclaimed.join(', ')}: ${unclaimed.map((i) => JSON.stringify(criteria[i])).join(' | ')}`,
    );
  }

  return specs.map((spec, idx) => ({
    offerKey: offer.key,
    key: spec.key,
    ordinal: idx + 1,
    title: spec.title,
    intent: spec.intent,
    owner: spec.owner,
    // Verbatim from the offer as quoted — never paraphrased, because this is the
    // sentence a partner is paid against and a client signed off on.
    acceptanceCriteria: spec.satisfies.map((i) => criteria[i]!),
    awaitsClientInput: spec.awaitsClientInput,
    state: 'not_started',
    blockedReason: null,
  }));
}

/** Convenience for callers holding only a key. Resolves through the catalogue. */
export function deriveMilestonesForOffer(key: OfferKey): Milestone[] {
  return deriveMilestones(getOffer(key));
}

// ── Deliverables ──────────────────────────────────────────────────────────────

/**
 * `in_review` is a state, not a flag, because review is where delivery actually
 * stalls and a status view has to be able to say so. `delivered` and `accepted`
 * are separate for the same reason `deposit_paid` is separate from `accepted` on
 * the engagement (`types.ts`): handing something over and the client agreeing it
 * is done are different events, and only the second one closes a payment
 * milestone.
 */
export type DeliverableState =
  | 'planned'
  | 'in_progress'
  | 'in_review'
  | 'ready'
  | 'delivered'
  | 'accepted';

export const DELIVERABLE_STATES: readonly DeliverableState[] = [
  'planned', 'in_progress', 'in_review', 'ready', 'delivered', 'accepted',
] as const;

/**
 * Conservative default for `reviewRequired` on a new deliverable: TRUE.
 *
 * Every one of the five offers can produce work product carrying a legal or
 * technical claim — a white paper section, a risk factor, a tokenomics
 * reconciliation, a readiness checklist, a public marketing claim. The founder is
 * an LCX employee at a regulated exchange and a partner wrote the words; an
 * unreviewed claim going out under a coordination he arranged is the reputational
 * exposure the whole conflict-check machinery exists to contain (plan §9).
 *
 * So review is opt-OUT per deliverable, with a recorded basis, rather than
 * opt-in. A default of `false` would mean the safe path requires someone to
 * remember, and nobody remembers on the day a deadline slips.
 */
export const REVIEW_REQUIRED_BY_DEFAULT = true;

/**
 * What the client receives. A DESCRIPTION of it — never the thing itself.
 *
 * Read the field list and notice what is not here: nothing that can hold bytes,
 * no `contentType`-shaped metadata, no key into any store. `handoverChannel` is
 * the operator's sentence about how the client got it ("sent by the partner from
 * their own document system to the client's counsel"), which is an audit note, not
 * a pointer this code would ever follow. See this file's header for why: D2 is
 * unanswered, so GPS records the fact of a handover and holds none of it.
 */
export interface Deliverable {
  id: string;
  engagementId: string;
  /** Present on every GPS row from the first migration (plan §4 S0.3). */
  clientId: string;
  /**
   * The milestone this answers to, or null for something agreed mid-engagement.
   * A null here is worth surfacing: an accepted deliverable outside the plan is
   * scope that was delivered and possibly never priced.
   */
  milestoneKey: string | null;
  title: string;
  /** What the client receives, in words an operator typed. */
  description: string;
  owner: DeliverableOwner;
  state: DeliverableState;
  /**
   * TRUE for anything carrying a legal or technical claim. Defaults to
   * `REVIEW_REQUIRED_BY_DEFAULT`. `canAccept` refuses acceptance while this is
   * true and the review is not recorded.
   */
  reviewRequired: boolean;
  /**
   * Why review is (or is not) required, in the reviewer's words. Kept even when
   * `reviewRequired` is false, because "we decided this needed no legal review"
   * is exactly the decision someone will ask about later.
   */
  reviewBasis: string | null;
  /** Desk member id. A named human, never a service account. */
  reviewedBy: string | null;
  reviewedAt: string | null;
  /** Set when the client agreed it is done; `canAccept` guards the transition. */
  acceptedAt: string | null;
  acceptedBy: string | null;
  /** Operator's audit note on how the client received it. Not a pointer. */
  handoverChannel: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Is a required review recorded? Both fields, because either alone is a half-record. */
export function reviewSatisfied(d: Deliverable): boolean {
  if (!d.reviewRequired) return true;
  return Boolean(d.reviewedBy) && Boolean(d.reviewedAt);
}

// ── Evidence requests ─────────────────────────────────────────────────────────

/** Who we are waiting on. Never `us`: a thing we owe ourselves is a milestone. */
export type EvidenceCounterparty = Extract<DeliveryActor, 'client' | 'counsel' | 'partner'>;

/**
 * `refused` is a real outcome and is recorded as one. A client entitled to say
 * "no, you may not see our cap table" must be answerable in the system, because
 * the alternative is an open request that silently ages and a delivery date that
 * slips with no named cause.
 *
 * NOTE what is NOT a status: `overdue`. Overdue is a function of `dueBy` and the
 * clock (`isEvidenceOverdue`), never a stored value — a stored one is wrong the
 * moment nobody runs the job that sets it, and a wrong-but-confident status is
 * worse than a derived one.
 */
export type EvidenceStatus =
  | 'requested'
  | 'partially_received'
  | 'received'
  | 'waived'
  | 'refused';

export const EVIDENCE_STATUSES: readonly EvidenceStatus[] = [
  'requested', 'partially_received', 'received', 'waived', 'refused',
] as const;

/**
 * What WE need FROM the client (or their counsel, or a partner) in order to
 * proceed. The request — not the thing.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  `externalLocation` IS A REFERENCE THE OPERATOR TYPES.
 *  NEVER A FETCH. NEVER A COPY.
 * ══════════════════════════════════════════════════════════════════════════════
 *  It exists so a human can write down "in the client's data room, folder 3" or
 *  "held by Meyer & Partners, their matter 24-118" or "the client's own drive; ask
 *  Anna". It is free text for a human reader. Nothing in GPS resolves it,
 *  retrieves it, mirrors it, caches it, indexes it, or passes it to a model.
 *
 *  WHY. Decision D2 (`GPS_IMPLEMENTATION_PLAN.md` §3) is unanswered: LCX legal/DPO
 *  has not said whether LCX may hold a third party's unpublished regulatory
 *  filings and privileged-adjacent legal work product on LCX infrastructure, nor
 *  whether LCX would be controller or processor for it, nor what the disclosed
 *  subprocessor chain and retention would be. Plan §2 makes the consequence
 *  concrete: the moment we receive that material, LCX is a processor for non-LCX
 *  confidential data, and we would be it without having told the client. So the
 *  material stays where the client and counsel already keep it, under agreements
 *  that already exist, and GPS holds a sentence about where that is.
 *
 *  A retrieval — even a well-meant "just cache a copy so the specialist can read
 *  it" — is the exact step this design forbids, and it is forbidden in code:
 *  `delivery.test.ts` fails if this module gains any network or file primitive.
 *  Turning intake on is then a deliberate, reviewable change with the DPO answer
 *  attached, which is the point.
 */
export interface EvidenceRequest {
  id: string;
  engagementId: string;
  clientId: string;
  /** The milestone this unblocks, when there is one. */
  milestoneKey: string | null;
  /** What we need, in words. The description IS the record; there is no payload. */
  description: string;
  requestedFrom: EvidenceCounterparty;
  /** The named human, as the operator knows them. Null when only the party is known. */
  requestedFromName: string | null;
  requestedAt: string;
  /** Null when we genuinely have not set a date — not defaulted to "soon". */
  dueBy: string | null;
  status: EvidenceStatus;
  /**
   * Human-entered reference to where the material lives, outside GPS. Read the
   * block comment above before touching this field.
   */
  externalLocation: string | null;
  /**
   * Does delivery actually stop without this? Most requests do. Marking a
   * non-blocking request as blocking is how "waiting on client" becomes the
   * permanent excuse, so the flag is per request and not implied.
   */
  blocking: boolean;
  receivedAt: string | null;
  /** Required in practice for `waived` and `refused`: the decision needs a reason. */
  resolutionNote: string | null;
  /** Desk member id who asked. Attribution is the audit (plan §5). */
  requestedBy: string;
}

/** Settled: nothing further is expected from the counterparty. */
export function isEvidenceSettled(r: EvidenceRequest): boolean {
  return r.status === 'received' || r.status === 'waived';
}

/**
 * Outstanding = still needed. `refused` counts as outstanding on purpose: a
 * refusal does not supply the input, it explains why it will never arrive, and
 * the work is still blocked until someone re-scopes around it.
 */
export function isEvidenceOutstanding(r: EvidenceRequest): boolean {
  return !isEvidenceSettled(r);
}

/** Derived, never stored. Undated requests are never overdue — they are unmanaged. */
export function isEvidenceOverdue(r: EvidenceRequest, now = Date.now()): boolean {
  if (!r.dueBy || isEvidenceSettled(r)) return false;
  const due = new Date(r.dueBy).getTime();
  if (!Number.isFinite(due)) return false;
  return due < now;
}

// ── Acceptance ────────────────────────────────────────────────────────────────

/**
 * Three states, and `blocked` is the default rather than the exception.
 * Acceptance is the event that lets a partner be paid and an invoice be raised,
 * so the burden is on the deliverable to prove it is acceptable.
 */
export type AcceptanceState = 'blocked' | 'ready' | 'accepted';

/**
 * Why acceptance is refused, as a code plus a sentence. A code so a UI can group
 * and a caller can branch; a sentence because the operator has to tell a client
 * something more useful than `REVIEW_OUTSTANDING`.
 */
export type AcceptanceBlockerCode =
  | 'review_outstanding'
  | 'not_handed_over'
  | 'evidence_outstanding'
  | 'already_accepted';

export interface AcceptanceBlocker {
  code: AcceptanceBlockerCode;
  detail: string;
}

export interface AcceptanceVerdict {
  state: AcceptanceState;
  /** The single question a caller asked. False whenever `reasons` is non-empty. */
  canAccept: boolean;
  /** Empty only when acceptance may proceed. Ordered: hardest gate first. */
  reasons: readonly AcceptanceBlocker[];
}

/**
 * THE GATE. Refuses acceptance while a required review is outstanding, and says
 * why.
 *
 * Ordering is deliberate — review first. It is the only blocker that is about
 * LCX's own exposure rather than about the client's convenience, and when three
 * reasons are shown to a hurried operator the first one is the one that gets read.
 *
 * `evidence` is filtered here rather than trusted from the caller: only requests
 * for the SAME engagement count, and — when the deliverable belongs to a
 * milestone — only requests against that milestone. A caller passing the whole
 * engagement's evidence must not accidentally block one deliverable on another
 * milestone's missing input. Requests with no `milestoneKey` are engagement-wide
 * and always count.
 *
 * Pure, and it does not mutate: it returns a verdict. Whoever performs the
 * acceptance writes the row and the audit entry; a gate that also acted would be
 * a gate nobody could test.
 */
export function canAccept(
  deliverable: Deliverable,
  evidence: readonly EvidenceRequest[] = [],
): AcceptanceVerdict {
  const reasons: AcceptanceBlocker[] = [];

  if (deliverable.state === 'accepted' || deliverable.acceptedAt) {
    // Not an error and not a failure — an idempotence answer. Accepting twice
    // would double-record acceptance against a payment milestone.
    return {
      state: 'accepted',
      canAccept: false,
      reasons: [{
        code: 'already_accepted',
        detail: deliverable.acceptedAt
          ? `Already accepted on ${deliverable.acceptedAt}.`
          : 'Already accepted.',
      }],
    };
  }

  if (!reviewSatisfied(deliverable)) {
    reasons.push({
      code: 'review_outstanding',
      detail:
        `Required review is not recorded${deliverable.reviewBasis ? ` (${deliverable.reviewBasis})` : ''}. ` +
        'A named reviewer and a review date are both needed before this can be accepted.',
    });
  }

  if (deliverable.state !== 'ready' && deliverable.state !== 'delivered') {
    reasons.push({
      code: 'not_handed_over',
      detail: `Deliverable is "${deliverable.state}" — nothing has been handed over to accept.`,
    });
  }

  const relevant = evidence.filter((r) => {
    if (r.engagementId !== deliverable.engagementId) return false;
    if (r.milestoneKey === null) return true;
    if (deliverable.milestoneKey === null) return false;
    return r.milestoneKey === deliverable.milestoneKey;
  });
  for (const r of relevant) {
    if (!r.blocking || !isEvidenceOutstanding(r)) continue;
    reasons.push({
      code: 'evidence_outstanding',
      detail:
        `Blocking input outstanding from ${DELIVERY_ACTOR_LABELS[r.requestedFrom]}` +
        `${r.requestedFromName ? ` (${r.requestedFromName})` : ''}: ${r.description}` +
        `${r.status === 'refused' ? ' — refused, so the scope needs re-agreeing.' : ''}`,
    });
  }

  return {
    state: reasons.length === 0 ? 'ready' : 'blocked',
    canAccept: reasons.length === 0,
    reasons,
  };
}

// ── Progress ──────────────────────────────────────────────────────────────────

/**
 * The overall reading of a plan. `blocked` OUTRANKS `in_progress`: an engagement
 * with four milestones done and one blocked is blocked, because that is the fact
 * a status report exists to surface.
 */
export type ProgressState = 'not_started' | 'in_progress' | 'blocked' | 'complete';

export interface ProgressBlocker {
  key: string;
  ordinal: number;
  title: string;
  owner: DeliveryActor;
  reason: string | null;
  /**
   * True when the milestone is blocked with no reason recorded. Surfaced rather
   * than hidden: an unexplained block is itself a reporting failure, and silently
   * dropping it from the blocker list would make the plan look healthier than a
   * properly-explained one.
   */
  reasonMissing: boolean;
}

export interface EngagementProgress {
  /** Every milestone, including waived ones. */
  total: number;
  /** Milestones that count toward completion — total minus waived. */
  countable: number;
  complete: number;
  inProgress: number;
  notStarted: number;
  blocked: number;
  waived: number;
  /**
   * Percent of countable milestones complete, 0 dp. NULL when nothing is
   * countable (an empty plan, or one entirely waived) — "no plan" is not "0%
   * done", and a UI must be able to tell those apart. Waived milestones leave the
   * denominator so agreed-dropped scope does not depress the number forever;
   * `waived` keeps them visible.
   */
  completePct: number | null;
  /**
   * TRUE if any milestone is blocked. A percentage must never be rendered without
   * this: "60% done" on a stopped engagement is the specific lie this function
   * exists to prevent, and it reads as momentum right up to the day the client
   * asks why nothing has moved.
   */
  isBlocked: boolean;
  state: ProgressState;
  /** Blocked milestones in plan order, with their reasons. Empty when clear. */
  blockers: readonly ProgressBlocker[];
  /** How many milestones are waiting on the client or counsel, blocked or not. */
  awaitingClientInput: number;
  /**
   * The next thing that should move: the lowest-ordinal milestone that is neither
   * complete nor waived. Null when the plan is finished. Note this can BE a
   * blocked milestone — that is the honest answer to "what next", not a reason to
   * skip ahead to work that cannot start.
   */
  next: { key: string; ordinal: number; title: string; owner: DeliveryActor; state: MilestoneState } | null;
  /**
   * One sentence a human can paste into a status update, and the reason this
   * function returns a headline at all: every caller that renders only
   * `completePct` reproduces the lie. The blocked case leads with the block.
   */
  headline: string;
}

export function engagementProgress(milestones: readonly Milestone[]): EngagementProgress {
  const total = milestones.length;
  const waived = milestones.filter((m) => m.state === 'waived').length;
  const complete = milestones.filter((m) => m.state === 'complete').length;
  const inProgress = milestones.filter((m) => m.state === 'in_progress').length;
  const notStarted = milestones.filter((m) => m.state === 'not_started').length;
  const blockedList = milestones.filter((m) => m.state === 'blocked');
  const countable = total - waived;

  const blockers: ProgressBlocker[] = blockedList
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((m) => ({
      key: m.key,
      ordinal: m.ordinal,
      title: m.title,
      owner: m.owner,
      reason: m.blockedReason,
      reasonMissing: !m.blockedReason,
    }));

  const completePct = countable > 0 ? Math.round((complete / countable) * 100) : null;
  const isBlocked = blockers.length > 0;

  const state: ProgressState = isBlocked
    ? 'blocked'
    : countable > 0 && complete === countable
      ? 'complete'
      : complete === 0 && inProgress === 0
        ? 'not_started'
        : 'in_progress';

  const next =
    milestones
      .filter((m) => m.state !== 'complete' && m.state !== 'waived')
      .sort((a, b) => a.ordinal - b.ordinal)[0] ?? null;

  const done = `${complete} of ${countable} milestone${countable === 1 ? '' : 's'} complete`;
  const waivedNote = waived > 0 ? ` (${waived} waived by agreement)` : '';
  let headline: string;
  if (countable === 0) {
    headline = total === 0 ? 'No delivery plan yet.' : `No countable milestones${waivedNote}.`;
  } else if (isBlocked) {
    const first = blockers[0]!;
    // Leads with BLOCKED, names the party, and quotes the reason — or says there
    // is none, which is itself the thing to chase.
    headline =
      `BLOCKED — ${done}${waivedNote}, and ${blockers.length} blocked: ` +
      `"${first.title}" (${DELIVERY_ACTOR_LABELS[first.owner]}) ` +
      `${first.reason ? `— ${first.reason}` : '— no reason recorded'}.`;
  } else if (state === 'complete') {
    headline = `Complete — ${done}${waivedNote}.`;
  } else if (state === 'not_started') {
    headline = `Not started — ${done}${waivedNote}. Next: "${next?.title ?? '—'}".`;
  } else {
    headline = `In progress — ${done}${waivedNote}. Next: "${next?.title ?? '—'}".`;
  }

  return {
    total,
    countable,
    complete,
    inProgress,
    notStarted,
    blocked: blockers.length,
    waived,
    completePct,
    isBlocked,
    state,
    blockers,
    awaitingClientInput: milestones.filter(
      (m) => m.awaitsClientInput && m.state !== 'complete' && m.state !== 'waived',
    ).length,
    next: next
      ? { key: next.key, ordinal: next.ordinal, title: next.title, owner: next.owner, state: next.state }
      : null,
    headline,
  };
}

// ── Concurrent delivery load ──────────────────────────────────────────────────

/**
 * The statuses that consume DELIVERY coordination. `accepted` is in the set on
 * purpose: the moment a client signs, the founder is scheduling a partner and a
 * kick-off, whether or not the deposit has landed.
 */
export const WIP_STATUSES: readonly EngagementStatus[] = ['accepted', 'deposit_paid', 'in_delivery'] as const;

/**
 * Delivered but not yet collected. Counted separately and NOT given coordination
 * hours, because chasing an invoice is real work but it is not delivery work, and
 * inventing a fraction of an hour for it would make the capacity number look
 * precise when it is not calibrated at all. A services business dies of
 * delivered-and-never-collected (`types.ts`), so it is counted, just not mixed in.
 */
export const COLLECTION_FOLLOW_UP_STATUSES: readonly EngagementStatus[] = ['delivered', 'invoiced'] as const;

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  TODO — COORDINATION HOURS ARE PLACEHOLDERS. NOT MEASURED. DO NOT PLAN ON THEM.
 * ══════════════════════════════════════════════════════════════════════════════
 *  Same discipline as `TODO_PRICE_BANDS` (`catalogue.ts`): only the founder can
 *  supply these, he has not, and a plausible-looking capacity model is more
 *  dangerous than none because it will be used to say yes to a fifth engagement.
 *
 *  The SHAPE is reasoned, though, and the ordering is the useful part:
 *  legal-opinion coordination and the GTM sprint cost the most of HIS time (one is
 *  chasing counsel weekly, the other puts him in a room with the founder for four
 *  weeks), the white paper package costs less of it because a specialist drafts,
 *  and the diagnostic is nearly all his own time but short.
 *
 *  Flip `COORDINATION_HOURS_ARE_PLACEHOLDERS` to false in the same commit that
 *  supplies measured figures — never before — so surfaces can badge the number
 *  instead of presenting it as a plan.
 */
export const COORDINATION_HOURS_ARE_PLACEHOLDERS = true;

/** TODO: replace with measured figures. Hours per week, per live engagement. */
const TODO_COORDINATION_HOURS_PER_WEEK: Record<OfferKey, number> = {
  diagnostic: 3,
  mica_whitepaper: 4,
  legal_opinion_coordination: 5,
  gtm_sprint: 6,
  marketing_activation: 5,
};

/**
 * The ceiling, and the reason this whole function exists.
 *
 * Founder facts (plan §0): partners deliver, he sells and coordinates, and he is
 * an LCX employee — so services coordination happens around a full-time job at a
 * regulated exchange. That is what caps concurrency, not enthusiasm and not the
 * partner bench (which has zero named members anyway — D5). 12 is a placeholder
 * he must replace with his real number; it is deliberately low rather than
 * flattering, because the expensive mistake here is selling a fifth engagement.
 */
export const TODO_COORDINATION_CAPACITY_HOURS_PER_WEEK = 12;

/**
 * One engagement's contribution to load. A narrow input shape rather than
 * `GpsEngagement` (`types.ts`) so this stays pure and callable from a test with
 * four literals — and so a caller cannot accidentally make load depend on price.
 */
export interface DeliveryLoadInput {
  engagementId: string;
  clientId: string;
  offerKey: OfferKey;
  status: EngagementStatus;
  /** The plan as it stands. Blocked milestones do not reduce load — see below. */
  milestones: readonly Milestone[];
  /** A measured figure for this engagement, if one exists. Overrides the placeholder. */
  coordinationHoursPerWeek?: number;
}

export interface WipLoad {
  /** Engagements actively in delivery (`WIP_STATUSES`). */
  active: number;
  /** Active engagements per offer — bench depth is per offer, so load is too. */
  byOffer: Record<OfferKey, number>;
  /** Distinct clients in delivery. Three engagements for one client is not three relationships. */
  clients: number;
  /**
   * Active engagements with at least one blocked milestone. These still consume
   * coordination hours, and that is not an accounting quirk: chasing a client for
   * an input IS the coordination work, and a blocked engagement typically costs
   * MORE of his attention than a running one, not less.
   */
  blocked: number;
  /** Active engagements waiting on a client or counsel input. */
  awaitingClientInput: number;
  /** Delivered/invoiced and not yet collected (`COLLECTION_FOLLOW_UP_STATUSES`). */
  awaitingCollection: number;
  /**
   * Active engagements whose offer has no named partner (`partnerOwner === null`,
   * true for all five offers today — D5). These CANNOT BE STAFFED: he would be
   * delivering them himself, which is the assumption this whole model breaks
   * under. Counted so the number is visible rather than discovered.
   */
  unstaffable: number;
  coordinationHoursPerWeek: number;
  capacityHoursPerWeek: number;
  /** 0 dp. Null when capacity is zero or absent — not 0, and not Infinity. */
  utilisationPct: number | null;
  overCapacity: boolean;
  /** True while the hours are placeholders, so no surface can present this as measured. */
  usesPlaceholderHours: boolean;
  headline: string;
}

/**
 * Concurrent delivery load, in HIS hours rather than in engagement count.
 *
 * Counting engagements is the intuitive version and it is wrong: three diagnostics
 * and three legal-opinion coordinations are the same number and roughly double the
 * work. Hours are also the only unit in which the honest answer to "can we take
 * this on?" can be given, since the answer depends on what is already running.
 *
 * Pure. Reads `partnerOwner` from the catalogue for the staffability count, which
 * is the one place delivery is allowed to depend on the offer definition.
 */
export function wipLoad(engagements: readonly DeliveryLoadInput[]): WipLoad {
  const byOffer = Object.fromEntries(OFFER_KEYS.map((k) => [k, 0])) as Record<OfferKey, number>;

  const active = engagements.filter((e) => WIP_STATUSES.includes(e.status));
  const awaitingCollection = engagements.filter((e) =>
    COLLECTION_FOLLOW_UP_STATUSES.includes(e.status),
  ).length;

  let hours = 0;
  let blocked = 0;
  let awaitingClientInput = 0;
  let unstaffable = 0;
  const clients = new Set<string>();

  for (const e of active) {
    byOffer[e.offerKey] += 1;
    clients.add(e.clientId);

    const perWeek =
      typeof e.coordinationHoursPerWeek === 'number' && Number.isFinite(e.coordinationHoursPerWeek)
        ? e.coordinationHoursPerWeek
        : TODO_COORDINATION_HOURS_PER_WEEK[e.offerKey];
    hours += perWeek;

    const progress = engagementProgress(e.milestones);
    if (progress.isBlocked) blocked += 1;
    if (progress.awaitingClientInput > 0) awaitingClientInput += 1;

    // A null partner owner means the engagement cannot honestly be staffed
    // (`catalogue.ts`: partnerOwner is null on all five offers until D5).
    if (getOffer(e.offerKey).partnerOwner === null) unstaffable += 1;
  }

  const capacity = TODO_COORDINATION_CAPACITY_HOURS_PER_WEEK;
  const utilisationPct = capacity > 0 ? Math.round((hours / capacity) * 100) : null;
  const overCapacity = capacity > 0 && hours > capacity;

  const badge = COORDINATION_HOURS_ARE_PLACEHOLDERS ? ' (placeholder hours, not measured)' : '';
  const headline =
    active.length === 0
      ? `Nothing in delivery${awaitingCollection > 0 ? `; ${awaitingCollection} awaiting collection.` : '.'}`
      : `${active.length} in delivery for ${clients.size} client${clients.size === 1 ? '' : 's'} — ` +
        `${hours}h/week of ${capacity}h coordination capacity` +
        `${utilisationPct === null ? '' : ` (${utilisationPct}%)`}${overCapacity ? ', OVER CAPACITY' : ''}` +
        `${blocked > 0 ? `; ${blocked} blocked (still costing hours)` : ''}` +
        `${unstaffable > 0 ? `; ${unstaffable} with no named partner` : ''}${badge}.`;

  return {
    active: active.length,
    byOffer,
    clients: clients.size,
    blocked,
    awaitingClientInput,
    awaitingCollection,
    unstaffable,
    coordinationHoursPerWeek: hours,
    capacityHoursPerWeek: capacity,
    utilisationPct,
    overCapacity,
    usesPlaceholderHours: COORDINATION_HOURS_ARE_PLACEHOLDERS,
    headline,
  };
}
