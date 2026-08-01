import type { Pool, PoolClient } from 'pg';
import {
  ENGAGEMENT_STATUSES,
  canAccept,
  composeDeliveryResponse,
  composeEngagementPlan,
  composeWipView,
  getOffer,
  isTerminalEngagementStatus,
  type AcceptanceVerdict,
  type Deliverable,
  type DeliverableOwner,
  type DeliverableState,
  type DeliveryLoadInput,
  type DeliveryResponse,
  type EngagementStatus,
  type EvidenceCounterparty,
  type EvidenceRequest,
  type EvidenceStatus,
  type LiveMilestoneState,
  type Milestone,
  type MilestoneState,
  type OfferKey,
  type ServiceOffer,
  type WipView,
} from '@lcx/shared';

/**
 * GLOBAL SERVICES (GPS) — P10 DELIVERY, the DATA LAYER for the delivery desk.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  THIS FILE ADDS NO DELIVERY RULES. IT LOADS ROWS AND HANDS THEM TO THE ENGINE.
 * ══════════════════════════════════════════════════════════════════════════════
 *  `packages/shared/src/gps/delivery.ts` (1,320 lines, 45 tests) and
 *  `deliveryView.ts` (1,271 lines, 48 tests) were referenced by ZERO surfaces
 *  before P10 (`GPS_100X_PLAN.md` §0). So every derived number below comes from
 *  `composeDeliveryResponse` / `composeEngagementPlan` / `canAccept`, and none is
 *  recomputed here. If a figure appears in this file that the engine did not
 *  produce, that is a bug and not a feature.
 *
 *  The three jobs this file actually has:
 *    1. probe whether 0049 has landed (deploy-before-migration window),
 *    2. translate 0049's rows into the shared domain shapes — INCLUDING saying
 *       out loud, per row, where the translation is lossy,
 *    3. perform the four governed writes, consulting the engine's gate BEFORE
 *       the write and surfacing the database's own refusal when it fires.
 *
 * ══ THERE IS NO UPLOAD, ATTACHMENT, MULTIPART OR FILE PATH IN THIS FILE. ══
 *  Not an omission — the load-bearing safety property of GPS Phase 3. Decision D2
 *  (LCX legal/DPO: controller vs processor for a third party's unpublished
 *  regulatory filings and privileged-adjacent legal work product; the subprocessor
 *  chain through Supabase/Render/Cloudflare/OpenRouter; retention; erasure) is
 *  UNANSWERED, so there is no client document store and this file may not invent
 *  one. `external_location` is INERT TEXT AN OPERATOR TYPED — a note to a human
 *  about where the material already lives in the client's own systems. Nothing
 *  here resolves it, retrieves it, copies it, mirrors it, previews it or indexes
 *  it, and nothing may be added that does (`0049_gps_delivery.sql:283-303`).
 *  `apps/api/src/gps/__tests__/intakeLockout.test.ts` discovers this file by path
 *  (it contains "gps") and fails the build on any byte door.
 *
 * MIGRATION-PENDING DISCIPLINE, copied from `routes/gps.ts:33` because the deploy
 *  ordering fact is identical and 0049 is a SECOND hand-applied migration: reads
 *  degrade to an empty, well-shaped body with `migrated: false`; writes answer 503,
 *  never 500. `routes/gps.ts` probes `gps_engagement` (0047) — that probe cannot
 *  answer for 0049, which is why `isDeliveryMigrated` exists and probes the three
 *  delivery tables instead. LCX prod today has 0047 and 0049 BOTH pending
 *  (deployment note, 2026-07-31), so this path is the live path, not a hypothetical.
 *
 * ATTRIBUTION IS ALWAYS THE AUTHENTICATED PRINCIPAL, NEVER A BODY FIELD. Every
 *  write below takes `operator` as an argument the route fills from
 *  `c.get('operator')`. A body field naming the actor makes the row a claim about
 *  who acted rather than a record of it (`0049_gps_delivery.sql:270-274`).
 *
 * PARAMETERISED SQL, EVERY STATEMENT. No value, identifier or ORDER BY fragment is
 *  concatenated. Same standing rule as `gps/service.ts:20`, and it matters here for
 *  the same reason: these rows describe a named third party's confidential work.
 */

// ── Has 0049 landed on this environment? ──────────────────────────────────────

/**
 * `to_regclass` rather than `information_schema`: it returns NULL for an absent
 * table instead of throwing, so the probe itself can never be the thing that
 * errors — the same reasoning, and the same function, as `service.ts:80`.
 *
 * ALL THREE TABLES, not one. 0049 creates `gps_milestone`, `gps_deliverable` and
 * `gps_evidence_request` in a single file, so in practice one implies all three;
 * asking for all three costs nothing and means a partially-applied file (someone
 * running statements by hand out of the Supabase SQL editor, which is how 0047 was
 * applied) reads as not-migrated rather than as a 500 on whichever table is
 * missing.
 *
 * Cached per process for the reason `service.ts:75` states: the answer changes only
 * when a human runs a migration, which means a deploy or a manual step, and the API
 * restarts on deploy. A false negative self-heals on restart.
 */
let deliveryMigratedCache: boolean | null = null;

export async function isDeliveryMigrated(pool: Pool): Promise<boolean> {
  if (deliveryMigratedCache !== null) return deliveryMigratedCache;
  try {
    const res = await pool.query(
      `SELECT to_regclass('public.gps_milestone')         IS NOT NULL
          AND to_regclass('public.gps_deliverable')       IS NOT NULL
          AND to_regclass('public.gps_evidence_request')  IS NOT NULL AS ok`,
    );
    deliveryMigratedCache = Boolean(res.rows[0]?.ok);
  } catch {
    // A database that cannot answer this cannot serve the delivery desk either.
    // Report not-migrated rather than propagating a 500 up to the desk.
    deliveryMigratedCache = false;
  }
  return deliveryMigratedCache;
}

/** Test-only: forget the probe. */
export function _resetDeliveryMigrated(): void {
  deliveryMigratedCache = null;
}

/** timestamptz → ISO string, preserving null. Same helper as `service.ts:116`. */
function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

// ── 1 · THE BRIDGE BETWEEN 0049's LITERALS AND THE SHARED UNIONS ──────────────
//
//  0049 was written before `packages/shared/src/gps/delivery.ts`, and the two
//  closed sets DO NOT MATCH. 0049's header claims they do
//  (`0049_gps_delivery.sql:69` — "ENUM LITERALS ARE THE DATABASE'S COPY OF THE
//  SHARED UNIONS"), and that claim is FALSE today:
//
//    gps_milestone.status       pending | in_progress | blocked | done | cancelled
//    MilestoneState             not_started | in_progress | blocked | complete | waived
//
//    gps_deliverable.owner      partner | internal
//    DeliverableOwner           us | partner
//
//    gps_deliverable.status     pending | in_progress | submitted | in_review |
//                               accepted | rejected | cancelled
//    DeliverableState           planned | in_progress | in_review | ready |
//                               delivered | accepted
//
//    gps_evidence_request.status open | satisfied | waived | cancelled
//    EvidenceStatus             requested | partially_received | received |
//                               waived | refused
//
//  NEITHER SIDE IS MINE TO CHANGE (file ownership: this pass owns no migration and
//  no shared module), so the translation lives here, in ONE place, as data rather
//  than as scattered ternaries — and every lossy direction is reported on the wire
//  rather than smoothed over. That is D2: a refusal or a substitution is explicit
//  and reasoned, never a silent default.
//
//  Read the two maps as a pair. `TO_DOMAIN` is what a read shows an operator;
//  `TO_DB` is what a write stores. They are deliberately NOT inverses of each
//  other, because the union is wider than the column in both directions, and
//  pretending otherwise is how a state silently changes meaning on a round trip.

/** DB milestone status → shared `MilestoneState`. */
export const MILESTONE_STATE_FROM_DB: Record<string, MilestoneState> = {
  pending: 'not_started',
  in_progress: 'in_progress',
  blocked: 'blocked',
  done: 'complete',
  // `cancelled` has no shared literal. `waived` is the honest analogue: 0049
  // documents cancellation as scope dropped, and MILESTONE_STATE_LABELS renders
  // `waived` as "Waived by agreement" (`delivery.ts:123`) — which is what a
  // cancelled milestone on a live engagement means. Reported per row in
  // `UnmappedValue` so the substitution is visible, not assumed.
  cancelled: 'waived',
};

/** Shared `MilestoneState` → DB milestone status. Total: every state is writable. */
const MILESTONE_STATE_TO_DB: Record<MilestoneState, string> = {
  not_started: 'pending',
  in_progress: 'in_progress',
  blocked: 'blocked',
  complete: 'done',
  waived: 'cancelled',
};

/** DB deliverable owner → shared `DeliverableOwner`. */
const DELIVERABLE_OWNER_FROM_DB: Record<string, DeliverableOwner> = {
  partner: 'partner',
  internal: 'us',
};

const DELIVERABLE_OWNER_TO_DB: Record<DeliverableOwner, string> = {
  partner: 'partner',
  us: 'internal',
};

/**
 * DB deliverable status → shared `DeliverableState`.
 *
 * THE MAPPING IS CONSERVATIVE WHERE IT IS LOSSY, and "conservative" has a precise
 * meaning: `canAccept` (`delivery.ts:956`) allows acceptance only from `ready` or
 * `delivered`, so any DB literal without a faithful shared analogue maps to a
 * state that CANNOT be accepted. A translation gap must never manufacture an
 * acceptable deliverable — that would be this bridge inventing a commercial event.
 *
 *   submitted → ready      the partner handed it to us; not yet to the client.
 *   rejected  → in_progress  sent back, so work resumed. Not acceptable.
 *   cancelled → planned      dead. Not acceptable. Reported as unmapped.
 */
export const DELIVERABLE_STATE_FROM_DB: Record<string, DeliverableState> = {
  pending: 'planned',
  in_progress: 'in_progress',
  submitted: 'ready',
  in_review: 'in_review',
  accepted: 'accepted',
  rejected: 'in_progress',
  cancelled: 'planned',
};

/**
 * DB evidence status → shared `EvidenceStatus`.
 *
 * `refused` and `partially_received` NOW HAVE DB LITERALS — added by
 * `0051_gps_evidence_refusal.sql`. They previously had none, which was a real
 * capability gap rather than a mapping detail: `delivery.ts:769` makes refusal a
 * first-class outcome ("a client entitled to say no must be answerable in the
 * system"), `composeEvidenceChase` counts it, and `deliveryNotices` raises an
 * `evidence_refused` REFUSAL from it, so the refusal could never fire.
 *
 * THE DIVERGENCE WAS RESOLVED TOWARD THE DATABASE, NOT AWAY FROM IT. The other
 * option was deleting `refused` from the union; that would have removed the
 * ability to record a client's "no" and left the request ageing as though still
 * open. The pair is round-trip identical here: neither literal is a synonym for
 * another state, so unlike `cancelled` neither is lossy in either direction.
 *
 * BEFORE 0051 IS APPLIED IN AN ENVIRONMENT the write is not silently downgraded —
 * the UPDATE trips the old CHECK and `constraintRefusal()` returns a structured
 * refusal naming the constraint (409). Nothing casts.
 */
export const EVIDENCE_STATUS_FROM_DB: Record<string, EvidenceStatus> = {
  open: 'requested',
  satisfied: 'received',
  waived: 'waived',
  // Settled, nothing further expected — the same operational meaning `waived`
  // carries. Reported per row.
  cancelled: 'waived',
  // 0051. Read back as themselves; without these two entries the `?? 'requested'`
  // fallback at the read site would turn a recorded refusal into an open request,
  // which is worse than not being able to store it at all.
  refused: 'refused',
  partially_received: 'partially_received',
};

const EVIDENCE_STATUS_TO_DB: Partial<Record<EvidenceStatus, string>> = {
  requested: 'open',
  received: 'satisfied',
  waived: 'waived',
  // 0051_gps_evidence_refusal.sql. Still declared one-by-one rather than derived,
  // so a sixth shared state added tomorrow is refused by name instead of being
  // passed through to a CHECK that does not know it.
  refused: 'refused',
  partially_received: 'partially_received',
};

/**
 * Which DB literals lose information on the way in. Used to build the per-row
 * `UnmappedValue` report, so a substitution is attributable to a row id rather
 * than being a footnote about the schema in general (D1).
 */
const LOSSY_FROM_DB: Record<string, readonly string[]> = {
  gps_milestone: ['cancelled'],
  gps_deliverable: ['rejected', 'cancelled'],
  gps_evidence_request: ['cancelled'],
};

// ── 2 · THE GAP LEDGER: WHAT 0049 CANNOT STORE, NAMED ON EVERY RESPONSE ───────

/**
 * One field the shared domain requires that 0049 has no column for.
 *
 * WHY THIS IS ON THE WIRE AND NOT IN A COMMENT. D8: no claim without a mechanism.
 * The delivery response is full of engine verdicts — "3 outstanding, 1 blocking
 * delivery", "cannot be accepted: a required review is not recorded" — and several
 * of those verdicts are computed from a value THIS FILE SUPPLIED because the
 * database had none. An operator reading "blocking delivery" is entitled to know
 * that no row anywhere says so and that the API assumed it. A screen that hides
 * this is presenting an assumption as a record, which is the specific failure the
 * plan calls AI slop.
 *
 * `closedBy` names the exact migration change that would retire the entry, so this
 * ledger doubles as the work order for whichever migration takes it on (0050 is already
 * used by another pass).
 */
export interface SchemaGap {
  /** The shared-domain field that has no column behind it. */
  readonly field: string;
  /** What this file substituted, and therefore what the engine reasoned over. */
  readonly substitution: string;
  /** The consequence for the numbers on screen. Stated as an effect, not a risk. */
  readonly consequence: string;
  /** The migration change that would make the substitution unnecessary. */
  readonly closedBy: string;
}

export const DELIVERY_SCHEMA_GAPS: readonly SchemaGap[] = [
  {
    field: 'Milestone.key (the join between a derived plan and recorded state)',
    substitution:
      'gps_milestone.name holds the DERIVED MILESTONE KEY (e.g. "inputs_received"), not a display name. '
      + 'The title, intent, owner and quoted acceptance criteria come from the plan derived off the offer as sold, '
      + 'never from a stored copy — a stored copy can disagree with the sale (deliveryView.ts:250-256).',
    consequence:
      'A row typed by hand whose name is not a plan key appears in plan.unknownLiveKeys rather than being dropped. '
      + 'There is also no unique index on (engagement_id, name), so two genuinely concurrent state writes for the '
      + 'same milestone can create two rows; the second is then invisible because the composer keys by name.',
    closedBy: 'ALTER TABLE gps_milestone ADD COLUMN milestone_key text + CREATE UNIQUE INDEX ON (engagement_id, milestone_key)',
  },
  {
    field: 'EvidenceRequest.blocking',
    substitution: 'true for every request — 0049 has no blocking column.',
    consequence:
      'ACCEPTANCE IS OVER-REFUSED: canAccept treats every outstanding input as one that stops delivery, so a '
      + 'deliverable can be refused on an input that never actually blocked it. The refusal names the request, so '
      + 'an operator can see which one and judge it. Chosen over the alternative because defaulting to false makes '
      + 'the evidence gate silently do nothing, and a gate that quietly passes is worse than one that over-refuses.',
    closedBy: 'ALTER TABLE gps_evidence_request ADD COLUMN blocking boolean NOT NULL DEFAULT true',
  },
  {
    field: 'EvidenceRequest.milestoneKey',
    substitution: 'null — 0049 has no milestone link on an evidence request.',
    consequence:
      'Every request is engagement-wide, so canAccept counts all of them against every deliverable '
      + '(delivery.ts:966-972). Compounds the over-refusal above.',
    closedBy: 'ALTER TABLE gps_evidence_request ADD COLUMN milestone_key text',
  },
  {
    field: 'EvidenceRequest.requestedBy',
    substitution: 'the literal string in EVIDENCE_REQUESTER_NOT_RECORDED, which says so.',
    consequence:
      'Who asked the client for their cap table is not recorded by 0049. The route knows it at the moment of the '
      + 'write and the schema forgets it. A placeholder desk id would be a fabricated attribution, so the field '
      + 'carries its own absence instead.',
    closedBy: 'ALTER TABLE gps_evidence_request ADD COLUMN requested_by text',
  },
  {
    field: 'EvidenceRequest.resolutionNote',
    substitution: 'null on every request — 0049 has no resolution_note column.',
    consequence:
      'A waiver or a refusal arrives with no reason attached, and 0049 documents waiving as the thing that "keeps '
      + 'the scope conversation honest" (0049_gps_delivery.sql:412). It cannot, without the sentence.',
    closedBy: 'ALTER TABLE gps_evidence_request ADD COLUMN resolution_note text',
  },
  {
    field: "EvidenceRequest.resolutionNote for a refusal (the reason, not the fact)",
    substitution:
      "the status itself. 'refused' and 'partially_received' became storable in 0051_gps_evidence_refusal.sql, "
      + 'so the FACT of a refusal is now recorded and the evidence_refused notice can fire. The REASON still has no '
      + 'column.',
    consequence:
      'A refusal is attributable to a request and a date but carries no sentence, so an operator reading '
      + '"1 refused" cannot see whether the client objected to the scope or to the counterparty. Listed separately '
      + 'from the resolution_note entry above because that one covers waivers; this is the same missing column '
      + 'doing its most damage.',
    closedBy: 'ALTER TABLE gps_evidence_request ADD COLUMN resolution_note text (same column as above)',
  },
  {
    field: 'Deliverable.milestoneKey',
    substitution: 'null for every deliverable — 0049 has no milestone link.',
    consequence:
      'Every deliverable reports outsideThePlan, so acceptance.outsideThePlan equals the row count and its notice '
      + '("scope delivered that may never have been priced") fires on a healthy engagement. That count is a SCHEMA '
      + 'GAP, not a scope finding, and must be read as one until the column exists.',
    closedBy: 'ALTER TABLE gps_deliverable ADD COLUMN milestone_key text',
  },
  {
    field: 'Deliverable.description',
    substitution: 'the literal string in DELIVERABLE_DESCRIPTION_NOT_RECORDED.',
    consequence:
      'Only a name is stored. Copying the name into the description would make one typed field look like two '
      + 'independent records of what the client is getting.',
    closedBy: 'ALTER TABLE gps_deliverable ADD COLUMN description text',
  },
  {
    field: 'Deliverable.reviewBasis',
    substitution: 'null on every deliverable — 0049 has no review_basis column.',
    consequence:
      'The decision "this needed no legal review" is not recorded anywhere, and delivery.ts:706 exists precisely '
      + 'because that is the decision someone asks about later. The review-outstanding refusal also loses the '
      + 'clause that would have explained itself.',
    closedBy: 'ALTER TABLE gps_deliverable ADD COLUMN review_basis text',
  },
  {
    field: 'Deliverable.acceptedBy',
    substitution: 'null on every deliverable — 0049 has no accepted_by column.',
    consequence:
      'accepted_at is stored and the acceptor is not, so the commercial event that lets an invoice be raised is '
      + 'unattributed in the schema. This route authenticates the acceptor and requires approver authority; the '
      + 'row cannot remember it.',
    closedBy: 'ALTER TABLE gps_deliverable ADD COLUMN accepted_by text',
  },
  {
    field: 'Deliverable.handoverChannel',
    substitution: 'null on every deliverable — 0049 has no handover_channel column.',
    consequence:
      'How the client actually received it — an audit note, never a pointer (delivery.ts:713) — has no column, so '
      + 'a disputed handover has no contemporaneous record of the channel.',
    closedBy: 'ALTER TABLE gps_deliverable ADD COLUMN handover_channel text',
  },
  {
    field: 'DeliveryLoadInput.coordinationHoursPerWeek',
    substitution: 'omitted, so wipLoad falls back to TODO_COORDINATION_HOURS_PER_WEEK (delivery.ts:1178).',
    consequence:
      'Every hour in the WIP view is a PLACEHOLDER. wip.basisIsMeasured is false and wip.basisNote says so beside '
      + 'the number rather than discounting it (D3). Read the shape and the ordering, not the magnitudes.',
    closedBy: 'a measured figure per engagement or per offer, supplied by the founder — not a schema change',
  },
];

/** Carried in place of a requester id, so the absence reads as an absence. */
export const EVIDENCE_REQUESTER_NOT_RECORDED =
  'not recorded — 0049_gps_delivery.sql has no requested_by column';

/** Carried in place of a deliverable description, for the same reason. */
export const DELIVERABLE_DESCRIPTION_NOT_RECORDED =
  'not recorded — 0049_gps_delivery.sql stores a deliverable name and no description';

/**
 * One row whose stored value had no faithful shared literal, named individually.
 *
 * The gap ledger above is about the SCHEMA; this is about a ROW. "Two deliverables
 * were shown as planned because the database says cancelled" is checkable against
 * the ids; "the mapping is lossy" is not (D1).
 */
export interface UnmappedValue {
  readonly table: string;
  readonly id: string;
  readonly column: string;
  readonly storedValue: string;
  readonly shownAs: string;
  readonly why: string;
}

function unmapped(
  table: string, id: string, column: string, storedValue: string, shownAs: string,
): UnmappedValue | null {
  if (!(LOSSY_FROM_DB[table] ?? []).includes(storedValue)) return null;
  return {
    table,
    id,
    column,
    storedValue,
    shownAs,
    why:
      `0049 stores '${storedValue}', which has no literal in the shared union. Shown as '${shownAs}' — the closest `
      + 'state that cannot manufacture an acceptance. See the enum bridge in gps/deliveryDesk.ts.',
  };
}

// ── 3 · ROW SHAPES AND MAPPERS ────────────────────────────────────────────────
//
//  Column lists are written out, never `SELECT *`: `service.ts:203` states the
//  reason and it holds here too — a future migration adding a column to a delivery
//  table should not start arriving in API responses because nobody decided it
//  should. On these three tables that matters more than usual, because the column
//  someone might add is the one D2 forbids.

const MILESTONE_COLS = `id, client_id, engagement_id, ordinal, name, owner, status,
  due_by, completed_at, blocked_reason, created_at, updated_at`;

const DELIVERABLE_COLS = `id, client_id, engagement_id, name, owner, status,
  review_required, reviewed_by, reviewed_at, accepted_at,
  external_location, external_location_note, created_at, updated_at`;

const EVIDENCE_COLS = `id, client_id, engagement_id, description, requested_from,
  requested_at, due_by, status, external_location, satisfied_at, updated_at`;

interface MilestoneRow {
  id: string; client_id: string; engagement_id: string; ordinal: number;
  name: string; owner: string | null; status: string;
  due_by: unknown; completed_at: unknown; blocked_reason: string | null;
  created_at: unknown; updated_at: unknown;
}

interface DeliverableRow {
  id: string; client_id: string; engagement_id: string; name: string;
  owner: string; status: string; review_required: boolean;
  reviewed_by: string | null; reviewed_at: unknown; accepted_at: unknown;
  external_location: string | null; external_location_note: string | null;
  created_at: unknown; updated_at: unknown;
}

interface EvidenceRow {
  id: string; client_id: string; engagement_id: string; description: string;
  requested_from: string | null; requested_at: unknown; due_by: unknown;
  status: string; external_location: string | null; satisfied_at: unknown;
  updated_at: unknown;
}

interface EngagementRefRow {
  id: string; client_id: string; client_name: string | null;
  offer_key: string; status: string; scope_snapshot: unknown;
}

/**
 * `gps_evidence_request.requested_from` is a LABEL an operator typed — "client —
 * COO", "their counsel at Meyer & Partners" (`0049_gps_delivery.sql:396`) — while
 * `EvidenceRequest.requestedFrom` is a closed union of three parties. So the party
 * is DERIVED from the label by keyword, and the raw label is carried through
 * verbatim as `requestedFromName` so nothing an operator wrote is discarded.
 *
 * Defaults to `client`, which is 0049's own stated default reading of a null
 * label: "'we asked the client' is sometimes genuinely all that is known". The
 * derivation is a guess about a category and is never used to decide anything —
 * only to pick which label the chase list prints — whereas the operator's own
 * words are what an operator acts on.
 */
function counterpartyFromLabel(label: string | null): EvidenceCounterparty {
  const l = (label ?? '').toLowerCase();
  if (/counsel|lawyer|attorney|solicitor|law firm|legal team/.test(l)) return 'counsel';
  if (/partner|specialist|vendor|subcontractor|agency/.test(l)) return 'partner';
  return 'client';
}

function toLiveMilestone(r: MilestoneRow): { live: LiveMilestoneState; note: UnmappedValue | null } {
  const state = MILESTONE_STATE_FROM_DB[r.status] ?? 'not_started';
  return {
    live: {
      // `name` IS the derived plan key — see the first entry of DELIVERY_SCHEMA_GAPS.
      key: r.name,
      state,
      blockedReason: r.blocked_reason,
      updatedAt: iso(r.updated_at),
    },
    note: unmapped('gps_milestone', r.id, 'status', r.status, state),
  };
}

function toDeliverable(r: DeliverableRow): { deliverable: Deliverable; note: UnmappedValue | null } {
  const state = DELIVERABLE_STATE_FROM_DB[r.status] ?? 'planned';
  return {
    deliverable: {
      id: r.id,
      engagementId: r.engagement_id,
      clientId: r.client_id,
      milestoneKey: null,
      title: r.name,
      description: DELIVERABLE_DESCRIPTION_NOT_RECORDED,
      owner: DELIVERABLE_OWNER_FROM_DB[r.owner] ?? 'partner',
      state,
      reviewRequired: r.review_required,
      reviewBasis: null,
      reviewedBy: r.reviewed_by,
      reviewedAt: iso(r.reviewed_at),
      acceptedAt: iso(r.accepted_at),
      acceptedBy: null,
      handoverChannel: null,
      createdAt: iso(r.created_at) ?? '',
      updatedAt: iso(r.updated_at) ?? '',
    },
    note: unmapped('gps_deliverable', r.id, 'status', r.status, state),
  };
}

function toEvidenceRequest(r: EvidenceRow): { request: EvidenceRequest; note: UnmappedValue | null } {
  const status = EVIDENCE_STATUS_FROM_DB[r.status] ?? 'requested';
  return {
    request: {
      id: r.id,
      engagementId: r.engagement_id,
      clientId: r.client_id,
      milestoneKey: null,
      description: r.description,
      requestedFrom: counterpartyFromLabel(r.requested_from),
      requestedFromName: r.requested_from,
      requestedAt: iso(r.requested_at) ?? '',
      dueBy: iso(r.due_by),
      status,
      // Inert text an operator typed. Read, never resolved (0049_gps_delivery.sql:419).
      externalLocation: r.external_location,
      blocking: true,
      receivedAt: iso(r.satisfied_at),
      resolutionNote: null,
      requestedBy: EVIDENCE_REQUESTER_NOT_RECORDED,
    },
    note: unmapped('gps_evidence_request', r.id, 'status', r.status, status),
  };
}

// ── 4 · THE OFFER AS SOLD ─────────────────────────────────────────────────────

/** Which acceptance criteria the drift verdict was measured against, and why. */
export interface ScopeBasis {
  readonly criteriaFrom: 'scope_snapshot' | 'live_catalogue';
  readonly note: string;
}

/**
 * Build the `ServiceOffer` the drift check runs against.
 *
 * `composeEngagementPlan` takes an offer rather than a key precisely so a caller
 * holding `gps_engagement.scope_snapshot` can measure drift against THE OFFER AS
 * SOLD (`deliveryView.ts:305-311`). An engagement sold in March must be checked
 * against March's acceptance criteria, not against a catalogue edited since — and
 * the catalogue is versioned code that WILL change (`service.ts:294`).
 *
 * Only `acceptanceCriteria` is taken from the snapshot, and only when it is a
 * non-empty array of strings. Everything else comes from the live catalogue,
 * because that is what the snapshot honestly contains: TWO snapshot shapes exist in
 * this tree — `ScopeSnapshot` (`service.ts:306`, field `offerName`) and
 * `freezeScope` (`actions.ts:325`, field `name`) — and neither is a full
 * `ServiceOffer`. Reconstructing one would mean inventing the missing fields.
 * Criteria are the ones that decide the verdict, so they are the ones read.
 *
 * The basis is REPORTED either way (D1). A drift verdict measured against a
 * catalogue the client never saw is a different claim from one measured against
 * the sale, and a surface must be able to tell them apart.
 */
function offerAsSold(
  row: { offer_key: string; scope_snapshot: unknown },
): { offer: ServiceOffer; basis: ScopeBasis } {
  const live = getOffer(row.offer_key as OfferKey);
  const snap = row.scope_snapshot as { acceptanceCriteria?: unknown } | null;
  const frozen = snap?.acceptanceCriteria;
  const usable =
    Array.isArray(frozen) && frozen.length > 0 && frozen.every((c) => typeof c === 'string');

  if (!usable) {
    return {
      offer: live,
      basis: {
        criteriaFrom: 'live_catalogue',
        note:
          'Scope drift was measured against the CURRENT catalogue, not against the sale: this engagement\'s '
          + 'scope_snapshot carries no usable acceptanceCriteria array. If the catalogue has changed since the '
          + 'proposal, a drift finding here may describe an edit we made rather than a plan that misses the sale.',
      },
    };
  }
  return {
    offer: { ...live, acceptanceCriteria: frozen as readonly string[] },
    basis: {
      criteriaFrom: 'scope_snapshot',
      note:
        'Scope drift was measured against the acceptance criteria FROZEN AT SALE in '
        + 'gps_engagement.scope_snapshot. Every other field of the offer (inclusions, exclusions, price band) is '
        + 'read from the current catalogue, because the snapshot is not a full ServiceOffer.',
    },
  };
}

// ── 5 · THE READ ──────────────────────────────────────────────────────────────

/**
 * Everything the delivery screen needs for one engagement, plus the honesty
 * apparatus that has to travel with it.
 *
 * `response` is the ONE shared declaration (`deliveryView.ts:1085`). The API
 * returns it and the web imports the same interface — a hand-copied response
 * interface in `apps/web/src/lib/api/` declaring fields the API never returned
 * took production down this week, so nothing here re-declares it and no web file
 * may either.
 */
export interface DeliveryDeskResult {
  readonly response: DeliveryResponse;
  readonly scopeBasis: ScopeBasis;
  /** Constant per deployment; carried per response so a printed page has it (D7). */
  readonly gaps: readonly SchemaGap[];
  /** Per row, and empty on a clean read. */
  readonly unmapped: readonly UnmappedValue[];
}

/** Not-found is a value, not an exception: the route answers 404 from it. */
export type DeliveryDeskRead = DeliveryDeskResult | null;

/**
 * The whole desk's live load, for the WIP ceiling.
 *
 * DESK-WIDE ON PURPOSE, not this engagement's: the coordination ceiling is HIS, and
 * everything already running draws on it (`deliveryView.ts:1092`). The founder sells
 * and coordinates AROUND A FULL-TIME LCX JOB while partners deliver, so coordination
 * hours — not engagement count, not revenue — are the real capacity cap
 * (`GPS_100X_PLAN.md`, founder facts).
 *
 * Every non-terminal engagement is passed in and `wipLoad` decides which count:
 * `WIP_STATUSES` for active load, `COLLECTION_FOLLOW_UP_STATUSES` for the collection
 * tail (`delivery.ts:1144`). Filtering by status HERE would be a second copy of that
 * decision, and the second copy is the one that goes stale.
 *
 * Milestones per engagement come from the SAME derivation the plan view uses, so a
 * drifted engagement (where `deriveMilestones` refuses) contributes its hours with an
 * empty milestone list rather than throwing — a 500 on the WIP number because one
 * catalogue entry drifted would take the whole desk read down with it.
 */
async function loadDeskLoad(pool: Pool, asOf: string): Promise<DeliveryLoadInput[]> {
  const live = ENGAGEMENT_STATUSES.filter((s) => !isTerminalEngagementStatus(s));
  const engagements = await pool.query(
    `SELECT id, client_id, offer_key, status, scope_snapshot
       FROM gps_engagement
      WHERE status = ANY($1::text[])
      ORDER BY created_at`,
    [live],
  );
  const rows = engagements.rows as Array<{
    id: string; client_id: string; offer_key: string; status: string; scope_snapshot: unknown;
  }>;
  if (rows.length === 0) return [];

  // One query for every engagement's milestones rather than one per engagement:
  // the desk read runs on every page load and N+1 here is N+1 forever.
  const states = await pool.query(
    `SELECT ${MILESTONE_COLS} FROM gps_milestone
      WHERE engagement_id = ANY($1::uuid[])
      ORDER BY engagement_id, ordinal`,
    [rows.map((r) => r.id)],
  );
  const byEngagement = new Map<string, LiveMilestoneState[]>();
  for (const row of states.rows as MilestoneRow[]) {
    const list = byEngagement.get(row.engagement_id) ?? [];
    list.push(toLiveMilestone(row).live);
    byEngagement.set(row.engagement_id, list);
  }

  return rows.map((r) => {
    const { offer } = offerAsSold(r);
    const plan = composeEngagementPlan(offer, byEngagement.get(r.id) ?? [], asOf);
    const milestones: Milestone[] = plan.rows.map((p) => p.milestone);
    return {
      engagementId: r.id,
      clientId: r.client_id,
      offerKey: r.offer_key as OfferKey,
      status: r.status as EngagementStatus,
      milestones,
      // coordinationHoursPerWeek deliberately omitted — see the last entry of
      // DELIVERY_SCHEMA_GAPS. The engine then uses its own placeholder and flags it.
    };
  });
}

/**
 * Compose the delivery response for one engagement.
 *
 * Four reads and one pure composition. The reads are scoped by `engagement_id`; the
 * composite foreign key on `(engagement_id, client_id)` (`0049_gps_delivery.sql:193`)
 * is what makes that scoping sufficient — a row filed under the wrong client is
 * unrepresentable rather than merely discouraged, so this file does not re-check the
 * pair. Surfacing a rule the database already enforces is the job; duplicating it is
 * how the two fall out of step.
 */
export async function deliveryDesk(
  pool: Pool,
  engagementId: string,
  asOf: string = new Date().toISOString(),
): Promise<DeliveryDeskRead> {
  const eng = await pool.query(
    `SELECT e.id, e.client_id, c.name AS client_name, e.offer_key, e.status, e.scope_snapshot
       FROM gps_engagement e
       LEFT JOIN gps_client c ON c.id = e.client_id
      WHERE e.id = $1`,
    [engagementId],
  );
  const row = eng.rows[0] as EngagementRefRow | undefined;
  if (!row) return null;

  const [milestones, evidence, deliverables, deskLoad] = await Promise.all([
    pool.query(
      `SELECT ${MILESTONE_COLS} FROM gps_milestone WHERE engagement_id = $1 ORDER BY ordinal`,
      [engagementId],
    ),
    pool.query(
      `SELECT ${EVIDENCE_COLS} FROM gps_evidence_request
        WHERE engagement_id = $1 ORDER BY requested_at DESC`,
      [engagementId],
    ),
    pool.query(
      `SELECT ${DELIVERABLE_COLS} FROM gps_deliverable
        WHERE engagement_id = $1 ORDER BY created_at DESC`,
      [engagementId],
    ),
    loadDeskLoad(pool, asOf),
  ]);

  const notes: UnmappedValue[] = [];
  const live: LiveMilestoneState[] = [];
  for (const r of milestones.rows as MilestoneRow[]) {
    const m = toLiveMilestone(r);
    live.push(m.live);
    if (m.note) notes.push(m.note);
  }
  const requests: EvidenceRequest[] = [];
  for (const r of evidence.rows as EvidenceRow[]) {
    const e = toEvidenceRequest(r);
    requests.push(e.request);
    if (e.note) notes.push(e.note);
  }
  const work: Deliverable[] = [];
  for (const r of deliverables.rows as DeliverableRow[]) {
    const d = toDeliverable(r);
    work.push(d.deliverable);
    if (d.note) notes.push(d.note);
  }

  const { offer, basis } = offerAsSold(row);
  const response = composeDeliveryResponse({
    engagement: {
      id: row.id,
      clientId: row.client_id,
      clientName: row.client_name,
      offerKey: offer.key,
      status: row.status as EngagementStatus,
      offer,
    },
    liveMilestones: live,
    evidence: requests,
    deliverables: work,
    deskLoad,
    asOf,
  });

  return { response, scopeBasis: basis, gaps: DELIVERY_SCHEMA_GAPS, unmapped: notes };
}

/**
 * The coordination ceiling on its own, for the desk-wide WIP read.
 *
 * Same load, same composer, same placeholder badge as the `wip` section of
 * `deliveryDesk` — deliberately the same call and not a second derivation, so the
 * standalone WIP page and the WIP panel on an engagement can never disagree about
 * how many hours are committed.
 *
 * The question it answers is the only one it exists for: CAN HE TAKE ANOTHER
 * ENGAGEMENT. `WipView.anotherEngagement` is a verdict with a `because` that names
 * the hours, the ceiling and the basis — never a bare yes/no — and
 * `basisIsMeasured` is false today, sitting beside the number rather than
 * discounting it (D3).
 */
export async function deskWip(
  pool: Pool,
  asOf: string = new Date().toISOString(),
): Promise<{ wip: WipView; gaps: readonly SchemaGap[] }> {
  const load = await loadDeskLoad(pool, asOf);
  return { wip: composeWipView(load, asOf), gaps: DELIVERY_SCHEMA_GAPS };
}

// ── 6 · THE GOVERNED WRITES ───────────────────────────────────────────────────
//
//  WHAT MAKES THESE GOVERNED, precisely — because "governed" is a word that gets
//  used for a confirmation dialog:
//
//   · THE DATABASE REFUSES FIRST AND INDEPENDENTLY. 0049 holds four CHECKs that no
//     handler, batch update or hand-run SQL can go around:
//     `gps_deliverable_no_acceptance_before_review` (:328) — review-required work
//     cannot be accepted unreviewed; `gps_deliverable_review_is_attributed` (:320) —
//     a review with no reviewer is not a review; `gps_milestone_blocked_needs_reason`
//     (:180); `gps_evidence_request_satisfied_iff_dated` (:441). Nothing below
//     re-implements any of them. Where one would fire, the write consults the
//     ENGINE'S statement of the same rule first (`canAccept`, `delivery.ts:927`) so
//     the operator is told BEFORE they try, and if the database fires anyway its
//     constraint name is returned verbatim. Two statements of one rule is already
//     one more than ideal; a third in this file is how all three drift apart.
//
//   · THE ENGINE'S REFUSAL IS RETURNED, NOT PARAPHRASED. `acceptance_refused`
//     carries the whole `AcceptanceVerdict` — every reason, in the engine's order,
//     hardest gate first (D2, D4).
//
//   · ATTRIBUTION COMES FROM THE SESSION. Every write takes `operator`, which the
//     route fills from `c.get('operator')`. Where 0049 has a column for it
//     (`gps_deliverable.reviewed_by`) it is written; where it does not, the gap is
//     in DELIVERY_SCHEMA_GAPS and the operator is echoed in the result rather than
//     being quietly dropped.
//
//  WHAT THESE ARE NOT: `RegistryAction`s. `gps/actions.ts` runs Phase 1's five
//  verbs through `invokeAction`, which writes `object_actions` AND the hash-chained
//  `audit_log` (`actions/registry.ts:1098`). Delivery has no registry entries, and
//  adding them means editing `actions/registry.ts` and `gps/actions.ts` — neither of
//  which this pass owns. SO THERE IS NO HASH-CHAINED AUDIT ROW FOR ANY WRITE BELOW,
//  only the columns 0049 provides. That is a stated limit, not an oversight; the
//  wiring note in the handover names it as the follow-up.

/** Why a delivery write was refused. Every code is a sentence the route can print. */
export type DeliveryRefusalCode =
  | 'engagement_not_found'
  | 'deliverable_not_found'
  | 'evidence_not_found'
  | 'unknown_milestone_key'
  | 'plan_unusable'
  | 'blocked_needs_reason'
  | 'acceptance_refused'
  | 'unwritable_status'
  | 'db_constraint';

export type DeliveryWrite<T> =
  | { readonly ok: true; readonly value: T; readonly operator: string }
  | {
      readonly ok: false;
      readonly code: DeliveryRefusalCode;
      readonly message: string;
      /** The engine's verdict, the plan's keys, or the constraint that fired. */
      readonly detail?: unknown;
    };

/** Postgres 23514 is a CHECK violation — one of 0049's rules fired. */
function constraintRefusal(err: unknown): DeliveryWrite<never> | null {
  const e = err as { code?: string; constraint?: string; detail?: string };
  if (e?.code !== '23514') return null;
  return {
    ok: false,
    code: 'db_constraint',
    message:
      `The database refused this write: CHECK constraint ${e.constraint ?? '(unnamed)'} on a gps_ delivery table. `
      + 'That rule is held in 0049_gps_delivery.sql rather than in a handler, so it holds for every caller — '
      + 'including hand-run SQL. Read the constraint before working around it.',
    detail: { constraint: e.constraint ?? null },
  };
}

/**
 * Record the state of one milestone.
 *
 * THE KEY IS VALIDATED AGAINST THE DERIVED PLAN, and that check is the reason this
 * is a transaction rather than an UPDATE. A state row for a milestone the offer as
 * sold does not contain is not a typo to be stored — it is either a catalogue edit
 * or a caller inventing scope, and both need a human. So an unknown key is refused
 * WITH THE PLAN'S KEYS attached (D2/D4: the system argues back and shows its work),
 * and a plan that will not derive at all is refused as `plan_unusable` carrying the
 * engine's own drift message.
 *
 * BLOCKED NEEDS A REASON, and this function checks it only to turn a 23514 into a
 * sentence: the rule itself is `gps_milestone_blocked_needs_reason`
 * (`0049_gps_delivery.sql:180`), which stands whether or not this code runs. A
 * blocked milestone with no reason looks handled in a list view and is not.
 *
 * `completed_at` is set only for `complete` and CLEARED otherwise, because
 * `gps_milestone_completed_implies_done` (:186) makes any other combination
 * unrepresentable — two honest reads of the table must not disagree about whether
 * the work finished.
 */
export async function recordMilestoneState(
  pool: Pool,
  args: {
    engagementId: string;
    milestoneKey: string;
    state: MilestoneState;
    blockedReason: string | null;
    /** From `c.get('operator')`. Never from a body field. */
    operator: string;
  },
): Promise<DeliveryWrite<{ milestoneKey: string; state: MilestoneState; ordinal: number }>> {
  if (args.state === 'blocked' && !args.blockedReason) {
    return {
      ok: false,
      code: 'blocked_needs_reason',
      message:
        'A blocked milestone needs a reason in the operator\'s own words — the database enforces this as '
        + 'gps_milestone_blocked_needs_reason (0049_gps_delivery.sql:180). An unexplained block is its own '
        + 'reporting defect: it looks handled in a list view and is not.',
    };
  }

  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    // FOR UPDATE so that a concurrent write to the same milestone serialises behind
    // this one. It does not make the upsert below atomic against a row that does not
    // exist yet — see the first DELIVERY_SCHEMA_GAPS entry — but it does stop two
    // state changes on the same engagement interleaving.
    const eng = await client.query(
      `SELECT id, client_id, offer_key, scope_snapshot FROM gps_engagement WHERE id = $1 FOR UPDATE`,
      [args.engagementId],
    );
    const row = eng.rows[0] as
      | { id: string; client_id: string; offer_key: string; scope_snapshot: unknown }
      | undefined;
    if (!row) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'engagement_not_found', message: 'engagement not found' };
    }

    const { offer } = offerAsSold(row);
    const plan = composeEngagementPlan(offer);
    if (!plan.usable) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        code: 'plan_unusable',
        message:
          'No milestone state can be recorded against this engagement: the plan does not derive from what was '
          + 'sold. Fix the drift first — recording state against a plan that does not match the sale is how a '
          + 'delivery record stops describing the engagement.',
        detail: plan.drift,
      };
    }
    const target = plan.rows.find((r) => r.milestone.key === args.milestoneKey);
    if (!target) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        code: 'unknown_milestone_key',
        message:
          `'${args.milestoneKey}' is not a milestone in the plan derived from this engagement's offer as sold. `
          + 'It has not been stored: a state row for work nobody sold is unbilled scope, and it would surface '
          + 'later as an orphaned state rather than as a plan.',
        detail: { planKeys: plan.rows.map((r) => r.milestone.key) },
      };
    }

    // `done` is the DB literal for the shared `complete` state, and the CASE
    // expressions below key off it rather than off a second boolean — one source
    // for "did this finish", which is what constraint :186 is protecting.
    const status = MILESTONE_STATE_TO_DB[args.state];
    const params = [
      args.engagementId,
      args.milestoneKey,
      status,
      args.state === 'blocked' ? args.blockedReason : null,
      target.milestone.ordinal,
      row.client_id,
      target.milestone.owner,
    ];
    const updated = await client.query(
      `UPDATE gps_milestone
          SET status = $3, blocked_reason = $4, ordinal = $5,
              completed_at = CASE WHEN $3 = 'done' THEN COALESCE(completed_at, now()) ELSE NULL END,
              updated_at = now()
        WHERE engagement_id = $1 AND name = $2`,
      params.slice(0, 5),
    );
    if (updated.rowCount === 0) {
      await client.query(
        `INSERT INTO gps_milestone
           (client_id, engagement_id, ordinal, name, owner, status, blocked_reason, completed_at)
         VALUES ($6, $1, $5, $2, $7, $3, $4,
                 CASE WHEN $3 = 'done' THEN now() ELSE NULL END)`,
        params,
      );
    }

    await client.query('COMMIT');
    return {
      ok: true,
      value: { milestoneKey: args.milestoneKey, state: args.state, ordinal: target.milestone.ordinal },
      operator: args.operator,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    const refusal = constraintRefusal(err);
    if (refusal) return refusal;
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Create a deliverable — the thing the client bought, TRACKED AND NEVER HELD.
 *
 * `externalLocation` is the whole reason to read this function twice. It is a
 * sentence an operator types about where the material already lives in the CLIENT's
 * own systems — "counsel's secure portal", "the client's data room, folder 3". It is
 * stored and shown to a human. Nothing in GPS resolves it, retrieves it, mirrors it,
 * previews it or indexes it, and nothing may be added that does: retrieving it would
 * put a third party's confidential material on LCX infrastructure by a longer route,
 * which is exactly the act decision D2 has not authorised
 * (`0049_gps_delivery.sql:283-303`).
 *
 * `reviewRequired` defaults TRUE at the column (`0049_gps_delivery.sql:268`) and in
 * the domain (`REVIEW_REQUIRED_BY_DEFAULT`, `delivery.ts:701`), and this function
 * passes the caller's choice through rather than re-deciding it. An exchange
 * employee coordinating a regulated-adjacent deliverable should have looked at it
 * before the client does; turning that off is a per-row, visible act.
 */
export async function createDeliverable(
  pool: Pool,
  args: {
    engagementId: string;
    title: string;
    owner: DeliverableOwner;
    reviewRequired: boolean;
    /** Inert text. Read the docblock above before touching this field. */
    externalLocation: string | null;
    externalLocationNote: string | null;
    operator: string;
  },
): Promise<DeliveryWrite<{ id: string }>> {
  try {
    const res = await pool.query(
      `INSERT INTO gps_deliverable
         (client_id, engagement_id, name, owner, review_required,
          external_location, external_location_note)
       SELECT e.client_id, e.id, $2, $3, $4, $5, $6
         FROM gps_engagement e
        WHERE e.id = $1
       RETURNING id`,
      [
        args.engagementId, args.title, DELIVERABLE_OWNER_TO_DB[args.owner],
        args.reviewRequired, args.externalLocation, args.externalLocationNote,
      ],
    );
    // INSERT ... SELECT FROM gps_engagement rather than a separate lookup: the
    // client_id must come from the engagement row, and the composite FK
    // (engagement_id, client_id) → gps_engagement (0049:335) then has nothing to
    // reject. No row inserted means no such engagement.
    const id = (res.rows[0] as { id: string } | undefined)?.id;
    if (!id) return { ok: false, code: 'engagement_not_found', message: 'engagement not found' };
    return { ok: true, value: { id }, operator: args.operator };
  } catch (err) {
    const refusal = constraintRefusal(err);
    if (refusal) return refusal;
    throw err;
  }
}

/**
 * Record that a named human at LCX reviewed a deliverable.
 *
 * NOT ASKED FOR IN THE P10 CONTRACT, AND ADDED DELIBERATELY: `review_required`
 * defaults to true on every row, `canAccept` refuses acceptance while a required
 * review is unrecorded, and `gps_deliverable_no_acceptance_before_review` refuses
 * it again at the database. Without this write, the acceptance route is a dead end
 * for every deliverable the system creates — a gate with no key is not a gate, it
 * is a wall, and someone would have got past it with hand-run SQL inside a week.
 *
 * IT DOES NOT TOUCH `status`. Review is LCX's own act; the deliverable's state is
 * about where the work is. Advancing the row to `in_review` here would make a
 * completed review look like work in progress and would move the state backwards
 * from `submitted`.
 *
 * BOTH COLUMNS OR NEITHER: `reviewed_by` comes from the session and `reviewed_at`
 * from `now()`, because `reviewSatisfied` (`delivery.ts:760`) requires both and
 * `gps_deliverable_review_is_attributed` (:320) refuses a date without a name. An
 * unattributed sign-off is worse than none, because it looks like assurance.
 */
export async function recordDeliverableReview(
  pool: Pool,
  args: { deliverableId: string; operator: string },
): Promise<DeliveryWrite<{ id: string; reviewedBy: string; reviewedAt: string }>> {
  try {
    const res = await pool.query(
      `UPDATE gps_deliverable
          SET reviewed_by = $2, reviewed_at = now(), updated_at = now()
        WHERE id = $1
       RETURNING id, reviewed_by, reviewed_at`,
      [args.deliverableId, args.operator],
    );
    const row = res.rows[0] as { id: string; reviewed_by: string; reviewed_at: unknown } | undefined;
    if (!row) return { ok: false, code: 'deliverable_not_found', message: 'deliverable not found' };
    return {
      ok: true,
      value: { id: row.id, reviewedBy: row.reviewed_by, reviewedAt: iso(row.reviewed_at) ?? '' },
      operator: args.operator,
    };
  } catch (err) {
    const refusal = constraintRefusal(err);
    if (refusal) return refusal;
    throw err;
  }
}

/**
 * Accept a deliverable — THE COMMERCIAL EVENT, and the most guarded write here.
 *
 * Acceptance is what lets a partner be paid and an invoice be raised
 * (`0049_gps_delivery.sql:232`), so the burden is on the deliverable to prove it is
 * acceptable and `canAccept` returns `blocked` by default (`delivery.ts:894`).
 *
 * THE ORDER OF OPERATIONS IS THE POINT:
 *   1. lock the row, so two acceptances cannot both read "not yet accepted";
 *   2. load the engagement's evidence and hand BOTH to `canAccept`, unfiltered —
 *      the engine does its own filtering by engagement and milestone
 *      (`delivery.ts:966`) and a second filter here is a second chance to filter
 *      differently and block the wrong deliverable;
 *   3. if it refuses, return the verdict WHOLE — every reason, in the engine's
 *      order, hardest gate first — and write nothing;
 *   4. only then write, and if `gps_deliverable_no_acceptance_before_review` fires
 *      anyway, return the constraint's name. Reaching step 4's error means this
 *      code and the database disagree, which is worth seeing rather than smoothing.
 *
 * The evidence gate is currently OVER-STRICT and the reason is in
 * `DELIVERY_SCHEMA_GAPS`: 0049 has no `blocking` column, so every outstanding input
 * is treated as one that stops delivery. The refusal names the request, so an
 * operator can read it and judge.
 */
export async function acceptDeliverable(
  pool: Pool,
  args: { deliverableId: string; operator: string },
): Promise<DeliveryWrite<{ id: string; acceptedAt: string; verdict: AcceptanceVerdict }>> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT ${DELIVERABLE_COLS} FROM gps_deliverable WHERE id = $1 FOR UPDATE`,
      [args.deliverableId],
    );
    const row = found.rows[0] as DeliverableRow | undefined;
    if (!row) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'deliverable_not_found', message: 'deliverable not found' };
    }

    const evidence = await client.query(
      `SELECT ${EVIDENCE_COLS} FROM gps_evidence_request WHERE engagement_id = $1`,
      [row.engagement_id],
    );
    const { deliverable } = toDeliverable(row);
    const requests = (evidence.rows as EvidenceRow[]).map((r) => toEvidenceRequest(r).request);
    const verdict = canAccept(deliverable, requests);

    if (!verdict.canAccept) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        code: 'acceptance_refused',
        message:
          `Acceptance refused (${verdict.state}): ${verdict.reasons.map((r) => r.detail).join(' ')}`,
        detail: verdict,
      };
    }

    const saved = await client.query(
      `UPDATE gps_deliverable
          SET status = 'accepted', accepted_at = now(), updated_at = now()
        WHERE id = $1
       RETURNING id, accepted_at`,
      [args.deliverableId],
    );
    await client.query('COMMIT');
    const out = saved.rows[0] as { id: string; accepted_at: unknown };
    return {
      ok: true,
      value: { id: out.id, acceptedAt: iso(out.accepted_at) ?? '', verdict },
      operator: args.operator,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    const refusal = constraintRefusal(err);
    if (refusal) return refusal;
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Ask the client (or their counsel, or a partner) for something we need.
 *
 * THIS IS THE ASKING, AND THE ASKING IS AS FAR AS THE SYSTEM GOES.
 * `ServiceOffer.requiredClientInputs` (`types.ts:139`) is the promise that a
 * missing input is OUR problem if we never asked for it; this row is the proof we
 * asked, who we asked, and by when. `description` is prose about the material and is
 * the closest this system ever gets to the material itself
 * (`0049_gps_delivery.sql:390`). There is no column for what they send back, and
 * that is deliberate: naming an input does NOT create a place to upload it.
 *
 * `requestedFrom` is stored as the LABEL the operator typed, not as an enum. 0049
 * models it that way on purpose — "client — COO", "their counsel at <firm>" — and it
 * is deliberately not an email address and not a contact table: the less third-party
 * personal data sits on a licensed exchange's infrastructure, the smaller the
 * question D2 has to answer (`0049_gps_delivery.sql:396`).
 */
export async function requestEvidence(
  pool: Pool,
  args: {
    engagementId: string;
    description: string;
    /** The label an operator typed, or null when only "we asked the client" is known. */
    requestedFrom: string | null;
    dueBy: string | null;
    /** Inert text: where the client says it lives. Never resolved. */
    externalLocation: string | null;
    operator: string;
  },
): Promise<DeliveryWrite<{ id: string }>> {
  try {
    const res = await pool.query(
      `INSERT INTO gps_evidence_request
         (client_id, engagement_id, description, requested_from, due_by, external_location)
       SELECT e.client_id, e.id, $2, $3, $4, $5
         FROM gps_engagement e
        WHERE e.id = $1
       RETURNING id`,
      [args.engagementId, args.description, args.requestedFrom, args.dueBy, args.externalLocation],
    );
    const id = (res.rows[0] as { id: string } | undefined)?.id;
    if (!id) return { ok: false, code: 'engagement_not_found', message: 'engagement not found' };
    return { ok: true, value: { id }, operator: args.operator };
  } catch (err) {
    const refusal = constraintRefusal(err);
    if (refusal) return refusal;
    throw err;
  }
}

/**
 * Settle an evidence request: it arrived, or it was waived.
 *
 * WHAT `received` MEANS HERE, exactly: a human ticked that the client provided it,
 * WHEREVER they provided it — in a call, in their own portal, to counsel directly.
 * It does not mean anything arrived on LCX infrastructure, and there is no column it
 * could have arrived in (`0049_gps_delivery.sql:373`).
 *
 * TWO STATUSES ARE REFUSED RATHER THAN APPROXIMATED. `refused` and
 * `partially_received` are real outcomes in the domain and 0049 has no literal for
 * either, so this function refuses the write and names the missing literal instead of
 * downgrading it to `open`. A client's refusal recorded as an open request is a
 * request that silently ages with a delivery date slipping behind it and no named
 * cause — the exact failure `delivery.ts:769` was written to prevent. Refusing loudly
 * keeps the gap visible until the CHECK is extended; storing a near-miss hides it
 * forever.
 *
 * The date/status pairing is left to `gps_evidence_request_satisfied_iff_dated`
 * (`0049_gps_delivery.sql:441`), which is an equivalence in both directions: this
 * function sets `satisfied_at` for `received` and clears it otherwise, and if it ever
 * gets that wrong the database refuses the row rather than making the chase list lie
 * about what is outstanding.
 */
export async function setEvidenceStatus(
  pool: Pool,
  args: {
    evidenceId: string;
    status: EvidenceStatus;
    /** Inert text; when null the stored reference is left as it was. */
    externalLocation: string | null;
    operator: string;
  },
): Promise<DeliveryWrite<{ id: string; status: EvidenceStatus }>> {
  const dbStatus = EVIDENCE_STATUS_TO_DB[args.status];
  if (!dbStatus) {
    return {
      ok: false,
      code: 'unwritable_status',
      message:
        `'${args.status}' cannot be stored: gps_evidence_request.status allows only `
        + 'open | satisfied | waived | cancelled (0049_gps_delivery.sql:417) plus refused | partially_received '
        + '(0051_gps_evidence_refusal.sql), and this state has no literal there. '
        + 'It is refused rather than downgraded to an open request, because a refusal recorded as an open ask is '
        + 'a delivery date slipping with no named cause. Extending the CHECK is the fix.',
      detail: { missingLiteral: args.status },
    };
  }
  try {
    const res = await pool.query(
      `UPDATE gps_evidence_request
          SET status = $2,
              satisfied_at = CASE WHEN $2 = 'satisfied' THEN COALESCE(satisfied_at, now()) ELSE NULL END,
              external_location = COALESCE($3, external_location),
              updated_at = now()
        WHERE id = $1
       RETURNING id`,
      [args.evidenceId, dbStatus, args.externalLocation],
    );
    const id = (res.rows[0] as { id: string } | undefined)?.id;
    if (!id) return { ok: false, code: 'evidence_not_found', message: 'evidence request not found' };
    return { ok: true, value: { id, status: args.status }, operator: args.operator };
  } catch (err) {
    const refusal = constraintRefusal(err);
    if (refusal) return refusal;
    throw err;
  }
}
