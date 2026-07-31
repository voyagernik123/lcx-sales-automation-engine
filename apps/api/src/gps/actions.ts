/**
 * GLOBAL SERVICES (GPS) — the governed actions of the services business.
 *
 * These are the five write paths of Phase 1 (`GPS_IMPLEMENTATION_PLAN.md`):
 * declare the conflict position, issue a proposal, approve a concession, record
 * acceptance, move the engagement by hand. They are `RegistryAction`s in every
 * respect — same subject/permission/params contract, same executor signature —
 * so `invokeAction` (`../actions/registry.ts:991`) validates params, enforces
 * `minRole` (:1006), enforces the `gps` workspace entitlement (:1013), applies
 * idempotency, and writes BOTH `object_actions` and the hash-chained `audit_log`
 * (:1098-1111). Nothing here re-implements any of that.
 *
 * WHY A SEPARATE MODULE rather than five more entries in `registry.ts`: that file
 * is already 1100 lines and four compartments deep, and GPS is the first
 * compartment whose subjects are THIRD-PARTY CLIENTS rather than LCX's own
 * programme objects. Keeping the client-facing verbs in one reviewable file is
 * what makes "which actions can touch client commercial terms?" answerable by
 * reading one file. `GPS_ACTIONS` is exported for the registry to spread in; the
 * import direction is registry → here, and this file imports `ActionError` back
 * from registry. That cycle is real but benign: nothing here touches a registry
 * binding at module-evaluation time, only inside executor closures.
 *
 * THE COMPARTMENT IS 'gps' ON EVERY ACTION, AND THAT IS THE POINT. `gps` is
 * `legacy:false` in `packages/shared/src/workspaces.ts`, so it is default-deny
 * and `legacyEntitlements` does not reach it — a roster member who was never
 * granted `gps` cannot invoke any of these even at approver role. 0047 grants
 * monty/nik `approve` and sam `operate`, so exactly one of the five actions
 * (`gps_discount_approve`) is out of sam's reach by construction.
 *
 * KNOWN HOLE, NOT CLOSED HERE. `access/entitlements.ts:39` `machineMap()` loops
 * `WORKSPACE_IDS` and grants every workspace at `operate`, so the SHARED MACHINE
 * KEY holds `gps` at operate — i.e. an automation credential can issue a
 * proposal on a client. That file is not owned by this change (plan §1.5 records
 * it as "isolation from the shared machine key: ABSENT"). What IS done here: the
 * two actions whose records must name a human — `gps_conflict_declare` and
 * `gps_discount_approve` — refuse any actor that is not a desk roster member, so
 * a machine principal cannot author a compliance decision or authorise a
 * concession even while it holds the compartment. See `assertNamedHuman`.
 *
 * NO CLIENT ARTIFACT INTAKE. No param on any action below accepts a document, an
 * upload, a filename or a URL to client material, and `scope_snapshot` is
 * composed from the OFFER CATALOGUE (reviewed code) — never from caller input.
 * Phase 1 is physically incapable of accepting a client document because
 * decision D2 (LCX DPO: controller vs processor for third-party confidential
 * material) is UNANSWERED. `__tests__/actions.test.ts` ratchets that absence.
 *
 * Money is integer cents everywhere. All SQL is parameterised.
 */

import { z } from 'zod';
import type pg from 'pg';
import {
  findMemberById,
  getOffer,
  marginCents,
  marginPct,
  isTerminalEngagementStatus,
  PRICE_BANDS_ARE_PLACEHOLDERS,
  ENGAGEMENT_STATUSES,
  type OfferKey,
  type EngagementStatus,
  type ConflictDecision,
} from '@lcx/shared';
import { ActionError, type RegistryAction } from '../actions/types.js';

/**
 * The only subject type in this module. Every GPS action acts on ONE engagement,
 * which is what makes the audit row attributable: `invokeAction` writes
 * `audit_log(entity, entity_id)` from `subjectType`/`subjectId`
 * (registry.ts:1107-1111), so a `'*'` subject type would produce audit rows for
 * client commercial decisions that name no object. `GpsAction.auditSubjectType`
 * below turns that from a convention into an asserted invariant.
 */
const ENGAGEMENT_SUBJECT = 'gps_engagement';

/**
 * A GPS action declares its audit path explicitly.
 *
 * `invokeAction` writes the ledger and the audit log for every action it serves,
 * so "is there an audit row" is not the interesting question — "does the audit
 * row point at a specific engagement, and which tables did the executor touch"
 * is. Both are declared here so a reviewer can answer them without reading the
 * executors, and so the test suite can refuse a shape that would make a client
 * decision unattributable. Extra fields are inert in `ACTION_REGISTRY`:
 * `buildActionManifest` (`../actions/manifest.ts:84`) projects a fixed field set,
 * so declaring these does not move the manifest hash.
 */
export interface GpsAction extends RegistryAction {
  /** The subject type whose id lands in `audit_log.entity_id`. Never `'*'`. */
  auditSubjectType: typeof ENGAGEMENT_SUBJECT;
  /**
   * Tables this executor writes, for review. An EMPTY array is meaningful and
   * honest: `gps_discount_approve` writes no table at all — its authorisation
   * exists only as the `object_actions` row `invokeAction` records.
   */
  auditWrites: readonly string[];
}

/** Reject whitespace-only strings. `.min(1)` accepts `" "`, which is "no reason" wearing a character (the reasoning at registry.ts:319-325). */
const nonBlank = (s: string) => s.trim().length > 0;

/**
 * Integer cents, bounded. The ceiling is $10,000,000 — three orders of magnitude
 * above the $10-25k typical engagement, so it cannot refuse real work, while
 * still turning a fat-fingered cents/dollars confusion into a validation error
 * instead of an eight-figure proposal.
 */
const CENTS_MAX = 1_000_000_000;
const centsAtLeast = (min: number) => z.number().int().min(min).max(CENTS_MAX);

/**
 * A MISSING TABLE IS A DEPLOY-ORDER FACT — but here it FAILS CLOSED, which is
 * the opposite of what `registry.ts:64` does, deliberately.
 *
 * The gates in registry.ts fail OPEN on `42P01` because a governance table that
 * has not landed yet must not dead-lock the LCX programme (registry.ts:46-62).
 * That reasoning does not transfer to GPS, for two reasons: (1) what is gated
 * here is a document sent to a THIRD PARTY and a concession on their money, and
 * issuing an unchecked proposal to a token project while employed by a regulated
 * exchange is exactly the perception risk the whole compartment exists to manage
 * (plan §9); (2) the cost of refusing is minutes — apply 0047 and retry — not a
 * blocked programme. So a gate that cannot be evaluated refuses, and says which
 * table is missing so the operator knows it is a deploy step and not a policy
 * call. This function exists to make that refusal specific rather than to allow
 * anything through.
 */
function isMissingTable(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '42P01';
}

function gateUnavailable(table: string): ActionError {
  return new ActionError(
    'GATE_UNAVAILABLE',
    `Cannot evaluate the GPS gates: relation '${table}' does not exist. Apply migration 0047_gps.sql, then retry. This refuses rather than proceeding — see the note above isMissingTable in gps/actions.ts.`,
    503,
    { table, migration: '0047_gps.sql' },
  );
}

/**
 * The actor must be a NAMED DESK MEMBER, not a machine principal.
 *
 * `gps_conflict_check.decided_by` is NOT NULL and documented as "a named human,
 * never a service account" (0047_gps.sql:284-296), and a concession on a client's
 * price is an accountability event for the same reason. Meanwhile the shared
 * machine key holds every compartment at `operate`
 * (`access/entitlements.ts:39`), so without this check an automation credential
 * — or a monitor firing an action — could author a compliance decision. Actors
 * that reach here and are refused: `'operator'` (the shared lane),
 * `'monitor:<id>'`, `'ai'`.
 *
 * HONEST LIMIT, unchanged by this check: authentication is a single shared
 * `DESK_PASSCODE` (plan §1.5), so "nik" is self-asserted. This makes the record
 * name a human; it does not prove which one.
 */
function assertNamedHuman(actor: string, what: string): void {
  if (!findMemberById(actor)) {
    throw new ActionError(
      'NAMED_HUMAN_REQUIRED',
      `${what} must be recorded by a named desk member — '${actor}' is a machine or unknown principal.`,
      403,
      { actor },
    );
  }
}

/** The engagement columns every executor here needs. Snake_case: this is a raw pg row. */
interface EngagementRow {
  id: string;
  client_id: string;
  offer_key: OfferKey;
  status: EngagementStatus;
  price_cents: string;
  vendor_cost_cents: string;
  owner: string | null;
}

/**
 * Load the engagement or refuse. Read separately from the UPDATE on purpose: the
 * writes below then re-assert the status they expected in their own WHERE clause
 * (optimistic concurrency), so a status that changed between the read and the
 * write produces a 409 rather than silently applying a transition the map above
 * would have refused.
 */
async function loadEngagement(pool: pg.Pool, id: string): Promise<EngagementRow> {
  let rows: EngagementRow[];
  try {
    ({ rows } = await pool.query<EngagementRow>(
      `SELECT id, client_id, offer_key, status, price_cents, vendor_cost_cents, owner
         FROM gps_engagement WHERE id = $1`,
      [id],
    ));
  } catch (err) {
    if (isMissingTable(err)) throw gateUnavailable('gps_engagement');
    throw err;
  }
  const row = rows[0];
  if (!row) throw new ActionError('NOT_FOUND', 'Engagement not found', 404);
  return row;
}

/** Nothing further should happen to a collected/lost/cancelled engagement. */
function assertNotTerminal(row: EngagementRow): void {
  if (isTerminalEngagementStatus(row.status)) {
    throw new ActionError('TERMINAL', `Engagement is ${row.status}; it accepts no further changes.`, 409, { status: row.status });
  }
}

/**
 * THE CONFLICT GATE. Nothing may be issued to a client, and no acceptance may be
 * recorded, without a conflict-of-interest decision on file for THIS engagement.
 *
 * This is the one piece of compliance machinery that did not exist anywhere in
 * the platform before 0047 (plan §5). It is enforced at both boundaries that
 * touch the client — issue and accept — rather than once, because they are
 * separately reachable and `gps_status_change` deliberately cannot produce
 * either status (see MANUAL_TARGETS).
 *
 * `declined` is a refusal, not a warning: a declined conflict position means the
 * work must not proceed at all, and `gps_conflict_declare` cancels the
 * engagement when it records one.
 */
async function assertConflictCleared(pool: pg.Pool, engagementId: string): Promise<ConflictDecision> {
  let rows: Array<{ decision: ConflictDecision }>;
  try {
    ({ rows } = await pool.query<{ decision: ConflictDecision }>(
      `SELECT decision FROM gps_conflict_check WHERE engagement_id = $1`,
      [engagementId],
    ));
  } catch (err) {
    if (isMissingTable(err)) throw gateUnavailable('gps_conflict_check');
    throw err;
  }
  const decision = rows[0]?.decision;
  if (!decision) {
    throw new ActionError(
      'CONFLICT_CHECK_REQUIRED',
      'Record a conflict-of-interest decision on this engagement first (gps_conflict_declare). An LCX employee selling adjacent services issues nothing to a client without one.',
      409,
      { engagementId },
    );
  }
  if (decision === 'declined') {
    throw new ActionError(
      'CONFLICT_DECLINED',
      'The conflict check on this engagement was DECLINED. This work does not proceed.',
      409,
      { engagementId, decision },
    );
  }
  return decision;
}

/**
 * THE DISCOUNT GATE'S STATE LIVES IN THE LEDGER, AND THAT IS A SEAM.
 *
 * `gps_engagement` has NO `discount_approved_by` column — 0047 does not create
 * one, and this change does not own that migration. So the authorisation a
 * proposal needs is looked up where `invokeAction` already puts it: the
 * `object_actions` row written for the earlier `gps_discount_approve` call
 * (registry.ts:1098). That is a real record — actor, timestamp, params, on the
 * same engagement id — not a fabricated one.
 *
 * WHAT THIS BUYS: the approval is bound to an EXACT PRICE. `priceCents` is a
 * required param of `gps_discount_approve` and is compared here as text, so
 * approving $12,000 does not silently authorise issuing at $9,000 — the operator
 * has to go back for a second approval. Comparison is on `params->>'priceCents'`
 * as TEXT rather than a `::bigint` cast so a malformed historical row cannot turn
 * this gate into a 22P02 error.
 *
 * WHAT IT DOES NOT BUY, stated so nobody quotes it as more: ledger rows never
 * expire, so an approval granted months ago at the same price still clears. And
 * `object_actions` has no unique constraint tying it to an engagement's current
 * terms, so the vendor cost could have moved since. A `gps_engagement`
 * approval column with an expiry is the correct fix and belongs in the next
 * migration; this is the honest version of the gate available without one.
 */
async function findPriceApproval(
  pool: pg.Pool,
  engagementId: string,
  priceCents: number,
): Promise<{ actor: string; approvedAt: string } | null> {
  let rows: Array<{ actor: string; created_at: string }>;
  try {
    ({ rows } = await pool.query<{ actor: string; created_at: string }>(
      `SELECT actor, created_at
         FROM object_actions
        WHERE subject_type = $1
          AND subject_id   = $2
          AND action       = 'gps_discount_approve'
          AND params->>'priceCents' = $3
        ORDER BY created_at DESC
        LIMIT 1`,
      [ENGAGEMENT_SUBJECT, engagementId, String(priceCents)],
    ));
  } catch (err) {
    // Fails CLOSED: see the note above isMissingTable. `object_actions` predates
    // GPS by four phases, so this is a genuinely unexpected condition here.
    if (isMissingTable(err)) throw gateUnavailable('object_actions');
    throw err;
  }
  const row = rows[0];
  return row ? { actor: row.actor, approvedAt: row.created_at } : null;
}

/**
 * The offer AS QUOTED, frozen — composed from the catalogue, never from caller
 * input.
 *
 * `gps_engagement.scope_snapshot` exists because the catalogue is versioned code
 * that WILL change while what a client agreed to must not (0047_gps.sql:155-161).
 * Two properties of this function are load-bearing:
 *
 *  1. Every field comes from `getOffer(offerKey)`, i.e. reviewed code. A caller
 *     cannot inject scope text, and in particular cannot weaken an EXCLUSION —
 *     the exclusions are what stop a proposal implying a listing or regulatory
 *     outcome, and they are the sentences that limit a regulated exchange's
 *     exposure (`gps/types.ts` on `ServiceOffer.exclusions`).
 *  2. It records `priceBandsArePlaceholders` as it was AT QUOTE TIME. The bands
 *     are TODO placeholders today (`PRICE_BANDS_ARE_PLACEHOLDERS === true`), so a
 *     snapshot that quietly carried a placeholder band as if it were policy would
 *     be the exact "invent a price and present it as real" failure the plan
 *     forbids. A snapshot taken today says so on its face.
 */
function freezeScope(offerKey: OfferKey, priceCents: number, currency: string) {
  const offer = getOffer(offerKey);
  return {
    offerKey: offer.key,
    name: offer.name,
    outcome: offer.outcome,
    inclusions: offer.inclusions,
    exclusions: offer.exclusions,
    requiredClientInputs: offer.requiredClientInputs,
    acceptanceCriteria: offer.acceptanceCriteria,
    renewalPath: offer.renewalPath,
    creditableAgainstEngagement: offer.creditableAgainstEngagement,
    quotedPriceCents: priceCents,
    currency,
    priceBandCentsAtQuote: offer.priceBandCents,
    priceBandsArePlaceholders: PRICE_BANDS_ARE_PLACEHOLDERS,
    frozenAt: new Date().toISOString(),
  };
}

/**
 * WHICH STATUSES A HUMAN MAY SET BY HAND — and the two it deliberately excludes.
 *
 * `'proposed'` and `'accepted'` are NOT here. They are produced only by
 * `gps_proposal_issue` and `gps_engagement_accept`, which run the conflict gate
 * and (for issue) the discount gate. If a generic status setter could write them,
 * every gate in this file would be one `gps_status_change` call away from being
 * bypassed — which is the single most likely way this compartment's compliance
 * property would be lost, and it would look like a convenience feature.
 */
const MANUAL_TARGETS = ENGAGEMENT_STATUSES.filter((s) => s !== 'proposed' && s !== 'accepted');

/**
 * The lifecycle, as edges rather than as a comment.
 *
 * Two edges encode money rules and not taxonomy, and they are the reason this is
 * a map and not a free-for-all:
 *  - `deposit_paid` is reachable ONLY from `accepted`. A deposit against nothing
 *    signed is not a deposit.
 *  - `in_delivery` is reachable ONLY from `deposit_paid`. Partners deliver and
 *    partners invoice us, so committing a partner before the client's cash
 *    arrives is how a $10-25k engagement turns into a personal liability
 *    (`gps/types.ts` on `deposit_paid`: "a signature is not cash, and only one of
 *    the two pays a partner").
 *
 * `cancelled` is reachable from every live state; `closed_lost` only from the
 * pre-delivery states, because work that was delivered was not lost.
 *
 * Lives here rather than in `packages/shared` because it has exactly one consumer
 * today; it should move next to `ENGAGEMENT_STATUSES` the moment the web app
 * needs to grey out a button.
 */
const MANUAL_TRANSITIONS: Record<EngagementStatus, readonly EngagementStatus[]> = {
  draft: ['conflict_pending', 'closed_lost', 'cancelled'],
  conflict_pending: ['draft', 'closed_lost', 'cancelled'],
  proposed: ['draft', 'closed_lost', 'cancelled'],
  accepted: ['deposit_paid', 'closed_lost', 'cancelled'],
  deposit_paid: ['in_delivery', 'cancelled'],
  in_delivery: ['delivered', 'cancelled'],
  delivered: ['invoiced', 'cancelled'],
  invoiced: ['collected', 'cancelled'],
  // Terminal by isTerminalEngagementStatus; listed explicitly so the record is
  // total and a new status cannot be added without deciding its edges.
  collected: [],
  closed_lost: [],
  cancelled: [],
};

/** A status change into one of these must say why, in the ledger. */
const REQUIRES_REASON: readonly EngagementStatus[] = ['closed_lost', 'cancelled'];

/* ══════════════════════════ THE FIVE ACTIONS ══════════════════════════ */

const gps_conflict_declare: GpsAction = {
  id: 'gps_conflict_declare',
  label: 'Declare conflict position',
  description:
    'Record the conflict-of-interest decision on a services engagement (GLOBAL SERVICES). Required before anything is issued to the client.',
  subjectTypes: [ENGAGEMENT_SUBJECT],
  // OPERATOR, not approver, and that is deliberate. This action does not GRANT
  // anything — it records what was checked and what was decided. Requiring
  // approve-tier would mean sam (granted 'operate' by 0047) could not record a
  // check, and the failure mode that matters here is a MISSING record, not an
  // over-eager one. Authority is constrained differently: the actor must be a
  // named human (assertNamedHuman), because decided_by is the whole point.
  minRole: 'operator',
  workspace: 'gps',
  auditSubjectType: ENGAGEMENT_SUBJECT,
  auditWrites: ['gps_conflict_check', 'gps_engagement'],
  paramsSchema: z
    .object({
      // 24 chars minimum: a check is what you LOOKED AT, and "checked - fine"
      // is not that. 0047_gps.sql:270 refuses a boolean here for the same reason.
      checkPerformed: z.string().min(24).max(4000).refine(nonBlank, { message: 'checkPerformed cannot be blank' }),
      decision: z.enum(['cleared', 'cleared_with_disclosure', 'declined']),
      // The text ACTUALLY GIVEN to the client, verbatim — not a template id.
      disclosureTextUsed: z.string().max(4000).optional(),
    })
    .refine((v) => v.decision !== 'cleared_with_disclosure' || nonBlank(v.disclosureTextUsed ?? ''), {
      // A 'cleared_with_disclosure' with no disclosure text is the one row shape
      // that would be actively misleading in a review: it asserts the client was
      // told something while recording nothing they were told.
      message: 'cleared_with_disclosure requires the disclosure text actually used',
      path: ['disclosureTextUsed'],
    }),
  execute: async ({ pool, subjectId, params, actor }) => {
    assertNamedHuman(actor, 'A conflict-of-interest decision');
    const row = await loadEngagement(pool, subjectId);
    assertNotTerminal(row);

    const decision = params.decision as ConflictDecision;
    // ON CONFLICT DO UPDATE with a fresh decided_at is the AMENDMENT path
    // 0047_gps.sql:252-255 sanctions ("an amended row with a new decided_at,
    // never a rewrite of history") — the engagement_id UNIQUE constraint means
    // there is exactly one current check, and the prior decision survives in the
    // audit_log row invokeAction writes, not here.
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO gps_conflict_check
         (client_id, engagement_id, check_performed, decision, decided_by, disclosure_text_used)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (engagement_id) DO UPDATE SET
         check_performed      = EXCLUDED.check_performed,
         decision             = EXCLUDED.decision,
         decided_by           = EXCLUDED.decided_by,
         disclosure_text_used = EXCLUDED.disclosure_text_used,
         decided_at           = now()
       RETURNING id`,
      [
        row.client_id,
        subjectId,
        String(params.checkPerformed),
        decision,
        actor,
        (params.disclosureTextUsed as string | undefined) ?? null,
      ],
    );

    // A DECLINED POSITION STOPS THE WORK, in the same call.
    //
    // Leaving a declined check beside a live engagement is precisely the failure
    // `gps/types.ts` complains about — "discoverable in an audit" rather than
    // visible in a list view. The WHERE clause refuses to resurrect an already
    // terminal engagement.
    //
    // SEAM: this is a second statement, not one transaction. Nothing in this
    // codebase's write path is transactional (the ledger and audit inserts at
    // registry.ts:1098-1111 are two statements too), so a process death between
    // the two leaves a declined check on a non-cancelled engagement. That is
    // visible — the gate at assertConflictCleared then refuses every issue and
    // accept on it — which is why it is acceptable rather than silent.
    let engagementCancelled = false;
    if (decision === 'declined') {
      const { rowCount } = await pool.query(
        `UPDATE gps_engagement SET status='cancelled', updated_at=now()
          WHERE id=$1 AND status NOT IN ('collected','closed_lost','cancelled')`,
        [subjectId],
      );
      engagementCancelled = (rowCount ?? 0) > 0;
    }

    return {
      conflictCheckId: rows[0]?.id ?? null,
      engagementId: subjectId,
      clientId: row.client_id,
      decision,
      decidedBy: actor,
      engagementCancelled,
    };
  },
};

const gps_proposal_issue: GpsAction = {
  id: 'gps_proposal_issue',
  label: 'Issue proposal',
  description:
    'Freeze the offer scope, set the price, and move a services engagement to proposed (GLOBAL SERVICES). Conflict-gated; a below-cost or below-band price needs a prior approval.',
  subjectTypes: [ENGAGEMENT_SUBJECT],
  // OPERATE-tier, per the plan: issuing a proposal is the selling motion and must
  // not need a second person. The concession is what needs an approver, and it is
  // a separate action (gps_discount_approve) precisely so that the common case is
  // unblocked and the exception is signed for.
  minRole: 'operator',
  workspace: 'gps',
  auditSubjectType: ENGAGEMENT_SUBJECT,
  auditWrites: ['gps_engagement'],
  paramsSchema: z.object({
    priceCents: centsAtLeast(1),
    /** What we expect to pay the partner. Omitted = keep what the row has. */
    vendorCostCents: centsAtLeast(0).optional(),
    /** Omitted = keep what the row has. NOT defaulted to a percentage of price: a deposit policy nobody has decided is not a number this code may invent. */
    depositRequiredCents: centsAtLeast(0).optional(),
    /** ISO-4217, uppercase. Omitted = keep the row's currency. */
    currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be a 3-letter ISO-4217 code').optional(),
  }),
  execute: async ({ pool, subjectId, params, actor, markGateDegraded }) => {
    const row = await loadEngagement(pool, subjectId);
    assertNotTerminal(row);

    // Re-issuing over an existing proposal is allowed (terms move during a
    // negotiation); reaching 'proposed' from a delivery-side status is not.
    const ISSUABLE: readonly EngagementStatus[] = ['draft', 'conflict_pending', 'proposed'];
    if (!ISSUABLE.includes(row.status)) {
      throw new ActionError('WRONG_STATUS', `Cannot issue a proposal from status '${row.status}'.`, 409, {
        status: row.status,
        issuableFrom: ISSUABLE,
      });
    }

    const conflictDecision = await assertConflictCleared(pool, subjectId);

    const priceCents = Number(params.priceCents);
    const vendorCostCents =
      params.vendorCostCents !== undefined ? Number(params.vendorCostCents) : Number(row.vendor_cost_cents);
    const margin = marginCents(priceCents, vendorCostCents);

    /*
     * TWO REASONS A PRICE NEEDS A SECOND NAME, and only one of them is knowable
     * today.
     *
     * (1) NON-POSITIVE MARGIN is arithmetic on two numbers this row already
     *     holds, so it is always evaluable and always a real finding: at $10-25k
     *     with a partner delivering, quoting at or below vendor cost means the
     *     engagement pays the founder nothing and any overrun comes out of his
     *     pocket. `marginCents` is deliberately allowed to go negative rather
     *     than clamp (gps/types.ts) so this can be caught HERE, at quote time.
     *
     * (2) BELOW-BAND is NOT evaluable, because `PRICE_BANDS_ARE_PLACEHOLDERS` is
     *     true — the bands in the catalogue are TODO placeholders and no real
     *     price bands have been supplied. Refusing a quote for falling under an
     *     invented floor would be presenting a made-up number as policy, which
     *     the programme forbids outright. So the check is SKIPPED and the skip is
     *     RECORDED through `markGateDegraded`, the same channel registry.ts uses
     *     for an unevaluated gate (registry.ts:78-85) — so the ledger row for
     *     this proposal says the band gate did not run, instead of looking
     *     identical to a row where it passed. Set the flag to false with real
     *     bands and this gate goes live with no other change.
     */
    const offer = getOffer(row.offer_key);
    const reasons: string[] = [];
    if (margin <= 0) {
      reasons.push(`price ${priceCents} is at or below the expected partner cost ${vendorCostCents} (margin ${margin} cents)`);
    }
    if (PRICE_BANDS_ARE_PLACEHOLDERS) {
      markGateDegraded(
        'GPS price bands are TODO placeholders (PRICE_BANDS_ARE_PLACEHOLDERS=true in packages/shared/src/gps/catalogue.ts) — the below-band half of the discount gate was NOT evaluated',
      );
    } else if (priceCents < offer.priceBandCents.min) {
      reasons.push(`price ${priceCents} is below the ${offer.key} band floor ${offer.priceBandCents.min}`);
    }

    let approval: { actor: string; approvedAt: string } | null = null;
    if (reasons.length > 0) {
      approval = await findPriceApproval(pool, subjectId, priceCents);
      if (!approval) {
        throw new ActionError(
          'DISCOUNT_APPROVAL_REQUIRED',
          `This price needs approver sign-off first: ${reasons.join('; ')}. Run gps_discount_approve for exactly ${priceCents} cents, or quote higher.`,
          409,
          { reasons, priceCents, vendorCostCents, marginCents: margin },
        );
      }
    }

    const { rowCount } = await pool.query(
      `UPDATE gps_engagement
          SET price_cents            = $1,
              vendor_cost_cents      = $2,
              deposit_required_cents = COALESCE($3, deposit_required_cents),
              currency               = COALESCE($4, currency),
              scope_snapshot         = $5::jsonb,
              status                 = 'proposed',
              owner                  = COALESCE(owner, $6),
              updated_at             = now()
        WHERE id = $7 AND status = $8`,
      [
        priceCents,
        vendorCostCents,
        params.depositRequiredCents !== undefined ? Number(params.depositRequiredCents) : null,
        (params.currency as string | undefined) ?? null,
        JSON.stringify(freezeScope(row.offer_key, priceCents, (params.currency as string | undefined) ?? 'USD')),
        // Only fills an EMPTY owner (COALESCE above): issuing a proposal on
        // someone else's engagement must not silently reassign it.
        findMemberById(actor) ? actor : null,
        subjectId,
        row.status,
      ],
    );
    // Optimistic concurrency: the status moved between the read and the write, so
    // the gate decisions above were made against a row that no longer exists in
    // that form.
    if ((rowCount ?? 0) === 0) {
      throw new ActionError('CONCURRENT_MODIFICATION', 'The engagement changed while the proposal was being issued. Re-read it and retry.', 409);
    }

    return {
      engagementId: subjectId,
      status: 'proposed',
      priceCents,
      vendorCostCents,
      marginCents: margin,
      marginPct: marginPct(priceCents, vendorCostCents),
      conflictDecision,
      discountApprovedBy: approval?.actor ?? null,
      scopeFrozen: true,
    };
  },
};

const gps_discount_approve: GpsAction = {
  id: 'gps_discount_approve',
  label: 'Approve concession price',
  description:
    'Authorise issuing a services engagement at a price below cost or below its band (GLOBAL SERVICES). Approver only; cannot be self-approved.',
  subjectTypes: [ENGAGEMENT_SUBJECT],
  /*
   * APPROVER — the whole reason this is a separate action.
   *
   * `minRole: 'approver'` makes invokeAction demand two independent things
   * (registry.ts:1006 and :1013-1023): the principal's ROLE must be approver, AND
   * the principal must hold the `gps` workspace at 'approve'. 0047 grants
   * monty/nik 'approve' and sam 'operate', so an operate-tier desk member is
   * refused with WORKSPACE_FORBIDDEN before this executor is ever entered — an
   * operator cannot approve a concession at all, their own or anyone's.
   *
   * There is NO override param on this action, deliberately. The defect pinned by
   * actions/__tests__/authority.test.ts was exactly a client-supplied boolean that
   * let an operator grant themselves approver authority; the shape is not repeated
   * here, and the test asserts its absence.
   */
  minRole: 'approver',
  workspace: 'gps',
  auditSubjectType: ENGAGEMENT_SUBJECT,
  /*
   * EMPTY ON PURPOSE — THIS ACTION WRITES NO TABLE.
   *
   * There is no `discount_approved_by` column on `gps_engagement` (0047 does not
   * create one and this change does not own that migration), so the authorisation
   * exists ONLY as the `object_actions` row invokeAction records, which
   * `findPriceApproval` reads back. Declaring `[]` rather than inventing a table
   * name is the point of this field: a reviewer can see that the approval is a
   * ledger fact, and read the seam documented on findPriceApproval.
   */
  auditWrites: [],
  paramsSchema: z.object({
    /**
     * The EXACT price being authorised, in cents. Required, and the gate matches
     * on it: an approval is for a number, not a blanket permission on the
     * engagement.
     */
    priceCents: centsAtLeast(1),
    /** Why the concession is acceptable. Required and non-blank — an unexplained approval is indistinguishable from a rubber stamp. */
    reason: z.string().min(12).max(500).refine(nonBlank, { message: 'reason cannot be blank — a concession has to say why' }),
  }),
  execute: async ({ pool, subjectId, params, actor }) => {
    assertNamedHuman(actor, 'A price concession');
    const row = await loadEngagement(pool, subjectId);
    assertNotTerminal(row);

    /*
     * SEPARATION OF DUTIES: the engagement's own owner cannot approve its
     * concession.
     *
     * This is the same reasoning as the SELF_LOCKOUT guard on
     * `revoke_entitlement` (registry.ts:559-564): an authority check that the
     * subject can satisfy alone is not an authority check. The seller who wants
     * the discount is the one person whose sign-off proves nothing.
     *
     * CONSEQUENCE, STATED PLAINLY: on a desk where the engagement owner is the
     * only approver, a below-cost or below-band price is BLOCKED until another
     * approver signs it. 0047 grants two approvers (monty, nik), so the path
     * exists. Quoting inside the band needs none of this — the friction is
     * confined to the exception, which is the intent.
     *
     * HONEST LIMIT: authentication is one shared DESK_PASSCODE (plan §1.5), so
     * this separates two NAMES, not two people. It becomes real the moment
     * per-person credentials exist; until then it is a control against
     * carelessness, not against a determined actor.
     */
    if (row.owner && row.owner === actor) {
      throw new ActionError(
        'SELF_APPROVAL',
        `You own this engagement, so you cannot approve its concession — another approver must. (owner: ${row.owner})`,
        403,
        { owner: row.owner, actor },
      );
    }

    const priceCents = Number(params.priceCents);
    const vendorCostCents = Number(row.vendor_cost_cents);
    // Surfaced in the result — and therefore in the ledger row — so the approval
    // record shows WHAT was approved, not merely that something was.
    return {
      engagementId: subjectId,
      clientId: row.client_id,
      approvedPriceCents: priceCents,
      vendorCostCentsAtApproval: vendorCostCents,
      marginCentsAtApproval: marginCents(priceCents, vendorCostCents),
      marginPctAtApproval: marginPct(priceCents, vendorCostCents),
      approvedBy: actor,
      // Names the seam rather than hiding it: no column was written.
      authorizationRecordedIn: 'object_actions',
      appliesToExactPriceOnly: true,
    };
  },
};

const gps_engagement_accept: GpsAction = {
  id: 'gps_engagement_accept',
  label: 'Record client acceptance',
  description:
    'Record that the client accepted the proposal (GLOBAL SERVICES). Sets accepted_at; the deposit is separate because a signature is not cash.',
  subjectTypes: [ENGAGEMENT_SUBJECT],
  minRole: 'operator',
  workspace: 'gps',
  auditSubjectType: ENGAGEMENT_SUBJECT,
  auditWrites: ['gps_engagement'],
  paramsSchema: z.object({
    /** What the client owes up front. Omitted = keep the row's value. */
    depositRequiredCents: centsAtLeast(0).optional(),
    /**
     * How the acceptance arrived, in words ("countersigned SOW, email 2026-07-30").
     *
     * LEDGER-ONLY BY DESIGN: there is no column for this and no attachment
     * anywhere, so it lands in `object_actions.params` / `audit_log.meta` and
     * nowhere else. That is the whole permitted form of "evidence" in Phase 1 —
     * a filename or a link to client material would be the first step toward the
     * intake path D2 forbids (plan §4 S0.4).
     */
    note: z.string().max(500).optional(),
  }),
  execute: async ({ pool, subjectId, params }) => {
    const row = await loadEngagement(pool, subjectId);
    if (row.status !== 'proposed') {
      throw new ActionError('WRONG_STATUS', `Only a proposed engagement can be accepted (this one is '${row.status}').`, 409, {
        status: row.status,
      });
    }
    // The conflict gate again, at the second client-facing boundary. Not
    // redundant: a check can be AMENDED to 'declined' after a proposal went out
    // (gps_conflict_declare upserts), and in that case the acceptance must not be
    // recordable even though the engagement reached 'proposed' legitimately.
    const conflictDecision = await assertConflictCleared(pool, subjectId);

    const { rowCount } = await pool.query(
      `UPDATE gps_engagement
          SET status                 = 'accepted',
              accepted_at            = now(),
              deposit_required_cents = COALESCE($1, deposit_required_cents),
              updated_at             = now()
        WHERE id = $2 AND status = 'proposed'`,
      [params.depositRequiredCents !== undefined ? Number(params.depositRequiredCents) : null, subjectId],
    );
    if ((rowCount ?? 0) === 0) {
      throw new ActionError('CONCURRENT_MODIFICATION', 'The engagement is no longer proposed. Re-read it and retry.', 409);
    }
    return { engagementId: subjectId, status: 'accepted', conflictDecision };
  },
} satisfies GpsAction;

const gps_status_change: GpsAction = {
  id: 'gps_status_change',
  label: 'Move engagement status',
  description:
    'Move a services engagement along its lifecycle by hand (GLOBAL SERVICES). Cannot set proposed or accepted — those have their own gated actions.',
  subjectTypes: [ENGAGEMENT_SUBJECT],
  minRole: 'operator',
  workspace: 'gps',
  auditSubjectType: ENGAGEMENT_SUBJECT,
  auditWrites: ['gps_engagement'],
  paramsSchema: z
    .object({
      // MANUAL_TARGETS excludes 'proposed' and 'accepted' — see the docblock
      // there. This is the enum a client sees, so the bypass is refused at
      // validation time (VALIDATION, 400) rather than inside the executor.
      status: z.enum(MANUAL_TARGETS as unknown as [string, ...string[]]),
      reason: z.string().max(500).optional(),
    })
    .refine((v) => !REQUIRES_REASON.includes(v.status as EngagementStatus) || nonBlank(v.reason ?? ''), {
      // Losing or cancelling an engagement is the one status move whose "why" is
      // the only durable information — the row afterwards looks the same whatever
      // happened.
      message: 'closing an engagement as lost or cancelled requires a reason',
      path: ['reason'],
    }),
  execute: async ({ pool, subjectId, params }) => {
    const row = await loadEngagement(pool, subjectId);
    assertNotTerminal(row);
    const target = params.status as EngagementStatus;
    const allowed = MANUAL_TRANSITIONS[row.status] ?? [];
    if (!allowed.includes(target)) {
      throw new ActionError(
        'ILLEGAL_TRANSITION',
        `'${row.status}' → '${target}' is not a permitted manual transition. Allowed from here: ${allowed.length > 0 ? allowed.join(', ') : 'none'}.`,
        409,
        { from: row.status, to: target, allowed },
      );
    }
    const { rowCount } = await pool.query(
      // deposit_paid_at is stamped only when moving INTO deposit_paid, and only
      // if it is still null: the first arrival of cash is the fact, and a repeat
      // of the transition must not move the date the collections view sorts on.
      `UPDATE gps_engagement
          SET status          = $1,
              deposit_paid_at = CASE WHEN $1 = 'deposit_paid' THEN COALESCE(deposit_paid_at, now()) ELSE deposit_paid_at END,
              updated_at      = now()
        WHERE id = $2 AND status = $3`,
      [target, subjectId, row.status],
    );
    if ((rowCount ?? 0) === 0) {
      throw new ActionError('CONCURRENT_MODIFICATION', `The engagement is no longer '${row.status}'. Re-read it and retry.`, 409);
    }
    return { engagementId: subjectId, from: row.status, status: target };
  },
} satisfies GpsAction;

/**
 * The five GPS actions, for `ACTION_REGISTRY` to spread in.
 *
 * Exported as an ARRAY rather than a `Record` so the registry keys them by
 * `a.id` and the id cannot drift from the key — the registry's own object literal
 * repeats each id twice, and a mismatch there is invisible until an action
 * becomes unreachable.
 *
 * Until the wiring lands in `../actions/registry.ts`, these actions are NOT
 * invocable and NOT in the generated command grammar. `__tests__/actions.test.ts`
 * asserts the wiring, so an unwired action fails CI rather than shipping as a
 * dead export.
 */
export const GPS_ACTIONS: readonly GpsAction[] = [
  gps_conflict_declare,
  gps_proposal_issue,
  gps_discount_approve,
  gps_engagement_accept,
  gps_status_change,
];
