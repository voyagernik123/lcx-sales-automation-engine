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
 * THE MACHINE-KEY HOLE IS CLOSED, AND THIS PARAGRAPH USED TO SAY IT WAS OPEN.
 * It described `machineMap()` looping `WORKSPACE_IDS` and granting the shared key
 * `gps` at operate. That stopped being true when `gps` was given
 * `machineAccess: false` (`packages/shared/src/workspaces.ts`), so the shared key,
 * the monitors and `ai` hold no GPS capability and `invokeAction`'s compartment gate
 * refuses every action below. The stale text mattered: a reviewer reading it would
 * have concluded the boundary was missing and either duplicated it or given up on it.
 *
 * Two things still belong to this file rather than to that boolean, because a
 * compartment flag in another package is not the right place for either:
 *   · `assertNamedHuman` on `gps_conflict_declare`, `gps_discount_approve` and
 *     `gps_proposal_issue` — the three records that must name a human. Role and
 *     named-humanity are different properties.
 *   · `gps_conflict_declare` is `minRole: 'approver'`, matching the REST route's
 *     `requireApprover`. It was `operator`, which made `/v1/actions` a cheaper door
 *     onto the same compliance row.
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
  MANUAL_ENGAGEMENT_TARGETS,
  MANUAL_ENGAGEMENT_TRANSITIONS,
  ENGAGEMENT_STATUS_REQUIRES_REASON,
  type OfferKey,
  type EngagementStatus,
  type ConflictDecision,
} from '@lcx/shared';
import { ActionError, type RegistryAction } from '../actions/types.js';
import { ISSUE_GUARD_FAILS_CLOSED, guardProposalIssue } from './underwrite.js';
import { assertPerimeterCleared, perimeterStamp } from './perimeterGuard.js';

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
 * THE UNDERWRITING GUARD, AS A THROW — the same decision the REST route's
 * `requireUnderwritingClearance` middleware turns into a response.
 *
 * `guardProposalIssue` reads the ENGAGEMENT ROW and ignores every request field, so
 * this cannot be talked round by a param: the price the caller is proposing is not
 * what it evaluates. It fails closed for the reason `ISSUE_GUARD_FAILS_CLOSED`
 * states — a guard that permits what it could not evaluate is the door every bypass
 * uses — so a throw inside it becomes a 409, not a pass.
 *
 * `MIGRATION_PENDING` is preserved as 503 rather than flattened into a 409: an
 * environment where the underwriting registries are absent is not the same finding
 * as a proposal that loses money, and a caller branching on the status should see
 * the difference.
 */
async function assertUnderwritingCleared(
  pool: pg.Pool,
  engagementId: string,
  actor: string,
  proposedPriceCents: number,
): Promise<void> {
  let decision;
  try {
    decision = await guardProposalIssue(pool, engagementId, {
      operator: actor,
      asOf: new Date().toISOString(),
      // The price this action is about to WRITE, not the one the row still holds —
      // this executor sets the price in the same statement that moves the status, so
      // reading the row would underwrite a number about to be replaced.
      proposedPriceCents,
    });
  } catch (err) {
    console.error('[gps] underwriting clearance error in gps_proposal_issue:', err);
    throw new ActionError(
      'UNDERWRITING_UNAVAILABLE',
      'The margin on this proposal could not be underwritten, so issuing it is refused. '
      + ISSUE_GUARD_FAILS_CLOSED,
      409,
      { engagementId },
    );
  }
  if (!decision.allowed) {
    throw new ActionError(
      decision.code,
      decision.reason ?? 'Issuing this proposal is refused by the underwriting guard.',
      decision.status === 503 ? 503 : decision.status === 404 ? 404 : 409,
      {
        remedy: decision.remedy,
        issue: decision.issue,
        underwriting: decision.underwriting,
        provenance: decision.provenance,
        policyNotice: decision.policyNotice,
        perimeterGateNotice: decision.perimeterGateNotice,
      },
    );
  }
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
 *  2. It records `priceBandsArePlaceholders` as it was AT QUOTE TIME. Since
 *     2026-08-31 the flag is false — the founder approved real bands
 *     (`APPROVED_PRICE_BANDS`, catalogue.ts) — so new snapshots carry the real
 *     band unbadged; any snapshot frozen before the flip still says
 *     placeholder on its face, which is exactly why the flag is frozen per
 *     quote rather than read live.
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
 * WHICH STATUSES A HUMAN MAY SET BY HAND, AND THE LIFECYCLE EDGES — both now read
 * from `packages/shared/src/gps/lifecycle.ts`.
 *
 * They used to be private to this file, with this note beside them:
 *
 *   "If a generic status setter could write [proposed/accepted], every gate in
 *    this file would be one `gps_status_change` call away from being bypassed."
 *
 * `POST /v1/gps/engagements/:id/status` was that generic status setter, and it
 * accepted every member of `ENGAGEMENT_STATUSES`. The rule was correct and it lived
 * next to only one of its two enforcement points. Moving it to the shared package
 * is the fix: both callers read the same map, and neither can drift.
 */
const MANUAL_TARGETS = MANUAL_ENGAGEMENT_TARGETS;
const MANUAL_TRANSITIONS = MANUAL_ENGAGEMENT_TRANSITIONS;
const REQUIRES_REASON = ENGAGEMENT_STATUS_REQUIRES_REASON;

/* ══════════════════════════ THE FIVE ACTIONS ══════════════════════════ */

const gps_conflict_declare: GpsAction = {
  id: 'gps_conflict_declare',
  label: 'Declare conflict position',
  description:
    'Record the conflict-of-interest decision on a services engagement (GLOBAL SERVICES). Required before anything is issued to the client.',
  subjectTypes: [ENGAGEMENT_SUBJECT],
  /*
   * APPROVER. This was `operator`, and the REST twin — `POST /v1/gps/engagements/
   * :id/conflict-check` (`routes/gps.ts`) — has always required approver, with a
   * long docblock explaining why: a conflict decision is the one artifact that
   * makes an exchange employee's services business defensible, and it must be
   * authored by monty or nik signed in as themselves.
   *
   * `/v1/actions` is not workspace-gated at the app level, so the two doors were
   * `requireApprover` and `minRole:'operator'` onto the SAME `gps_conflict_check`
   * row. Anyone holding `gps:operate` could clear a conflict through the action
   * that the REST route refuses them. The stated policy wins; the cheaper door
   * closes.
   *
   * The cost is the one the REST route already accepted and documented: sam holds
   * `operate` and therefore cannot record a check, so an engagement he creates
   * waits for an approver. `assertNamedHuman` stays — role and named-humanity are
   * different properties, and the shared machine key satisfies neither now.
   */
  minRole: 'approver',
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
    // there is exactly one current check. The prior decision is preserved by the
    // audit_log insert immediately below — NOT by the row invokeAction writes, which
    // records the new params and never saw the old ones.
    /*
     * PRESERVE THE PRIOR DECISION BEFORE THE UPSERT REPLACES IT.
     *
     * The comment above says the prior decision "survives in the audit_log row
     * invokeAction writes". `invokeAction` records the NEW params, which is what the
     * caller sent — it does not record the row that was destroyed, so a DECLINE
     * amended to CLEARED left nothing anywhere saying a decline had ever existed.
     * `gps_conflict_check.engagement_id` is UNIQUE and 0047 declares no history
     * table and no append-only trigger.
     *
     * Read-then-write, so the window `assertConflictCleared`'s own SEAM note already
     * accepts applies here too; the alternative is a transaction this path does not
     * have. `recordConflictCheck` (the REST twin) does the same thing inside its
     * transaction.
     */
    const prior = await pool.query(
      `SELECT id, decision, check_performed, disclosure_text_used, decided_by, decided_at
         FROM gps_conflict_check WHERE engagement_id = $1`,
      [subjectId],
    );
    const superseded = prior.rows[0] as
      | { id: string; decision: string; check_performed: string; disclosure_text_used: string | null;
          decided_by: string; decided_at: unknown }
      | undefined;
    if (superseded) {
      await pool.query(
        `INSERT INTO audit_log (actor, action, entity, entity_id, meta)
         VALUES ($1, 'gps_conflict_check.amended', 'gps_engagement', $2, $3::jsonb)`,
        [
          actor,
          subjectId,
          JSON.stringify({
            supersededCheckId: superseded.id,
            supersededDecision: superseded.decision,
            supersededCheckPerformed: superseded.check_performed,
            supersededDisclosureTextUsed: superseded.disclosure_text_used,
            supersededDecidedBy: superseded.decided_by,
            supersededDecidedAt: superseded.decided_at,
            newDecision: decision,
            newDecidedBy: actor,
            note:
              'The row above is the only surviving record of the superseded decision — gps_conflict_check has '
              + 'no history table and engagement_id is UNIQUE.',
          }),
        ],
      );
    }

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
    /**
     * What we expect to pay the partner. Omitted = keep what the row has.
     *
     * `centsAtLeast(1)`, not `(0)`. A supplied 0 was the cost side of the
     * below-cost gate's own input, so `{priceCents: 400000, vendorCostCents: 0}`
     * on a $6,000-cost offer reported a 100% margin on a $2,000 loss and needed no
     * approver. No partner delivers a GPS offer for nothing; a caller who means
     * "keep what the row has" omits the field.
     */
    vendorCostCents: centsAtLeast(1).optional(),
    /** Omitted = keep what the row has. NOT defaulted to a percentage of price: a deposit policy nobody has decided is not a number this code may invent. */
    depositRequiredCents: centsAtLeast(0).optional(),
    /** ISO-4217, uppercase. Omitted = keep the row's currency. */
    currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be a 3-letter ISO-4217 code').optional(),
  }),
  execute: async ({ pool, subjectId, params, actor, markGateDegraded }) => {
    // A proposal is the client-facing artifact, so the record must name who issued
    // it. `gps.machineAccess` is false in the registry, but that is one boolean in
    // another package standing between the shared machine key and a client
    // proposal; this is the assertion that belongs to the operation.
    assertNamedHuman(actor, 'A client proposal');

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

    /*
     * THE PERIMETER GATE, BECAUSE THIS IS THE SECOND DOOR.
     *
     * `POST /v1/gps/engagements/:id/proposal` carries `requirePerimeterClearance`
     * and `requireUnderwritingClearance` as middleware. This executor performs the
     * SAME transition to `status='proposed'` through `POST /v1/actions/:id/invoke`,
     * whose only middleware is `requireOperator` — so both guards were one route
     * away from not existing. Measured: an engagement whose server-side underwriting
     * gives pLoss 0.9154 and p50 −308,151 was refused 409 by the REST route and
     * issued 200 by this one.
     *
     * They live INSIDE the executor rather than on a router because the guard has to
     * belong to the operation. `assertConflictCleared` above already established
     * that shape; these follow it. Both fail closed — a load or evaluation that
     * throws is a refusal, never a pass.
     *
     * ORDER: law, then authorisation, then the model. The perimeter is first because
     * "we may not sell this here at all" outranks every price question. The
     * underwriting guard is LAST, immediately before the UPDATE — partly because it
     * is the most expensive check (a 200,000-sample simulation should not run to
     * refuse a request a two-integer comparison already refuses), and partly because
     * the last thing before the state moves is where a reader looks for the thing
     * that stops it.
     */
    const perimeter = await assertPerimeterCleared(pool, subjectId, {
      evaluatedBy: actor,
      asOf: new Date().toISOString(),
    });

    const priceCents = Number(params.priceCents);
    const suppliedVendorCost =
      params.vendorCostCents !== undefined ? Number(params.vendorCostCents) : null;
    const rowVendorCost = Number(row.vendor_cost_cents);
    const vendorCostCents = suppliedVendorCost ?? rowVendorCost;
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
     * (2) BELOW-BAND went LIVE on 2026-08-31, when the founder's approved bands
     *     flipped `PRICE_BANDS_ARE_PLACEHOLDERS` to false — a quote under the
     *     approved floor is now refused against a number he decided, not an
     *     invented one. The skip branch below is kept as the guard for the flag
     *     ever returning to true (a re-proposal cycle): while placeholders are
     *     in force the check is SKIPPED and the skip is RECORDED through
     *     `markGateDegraded`, the same channel registry.ts uses for an
     *     unevaluated gate (registry.ts:78-85), so a ledger row where the band
     *     gate did not run never looks identical to one where it passed.
     */
    const offer = getOffer(row.offer_key);
    const reasons: string[] = [];
    if (margin <= 0) {
      reasons.push(`price ${priceCents} is at or below the expected partner cost ${vendorCostCents} (margin ${margin} cents)`);
    }
    /*
     * THE GATE WAS SELF-AUTHORISING, and this is the half that closes it.
     *
     * `margin` above is computed against the CALLER'S cost, which the same
     * statement then writes to the row. So the caller supplied the number the gate
     * was evaluated against: `{priceCents: 400000, vendorCostCents: 0}` on a
     * `mica_whitepaper` whose recorded cost is 600,000c passed with no approver and
     * persisted a row claiming 100% margin on a $2,000 loss. Only the schema's new
     * `centsAtLeast(1)` and this second evaluation together make the cost side
     * unforgeable: the gate must also hold against the cost the row ALREADY
     * carried, which the caller did not choose.
     *
     * Deliberately not a refusal of the overwrite — lowering a recorded cost is a
     * legitimate renegotiation. It is a refusal to do it WITHOUT an approver.
     */
    const marginAgainstRow = marginCents(priceCents, rowVendorCost);
    if (suppliedVendorCost !== null && suppliedVendorCost < rowVendorCost && marginAgainstRow <= 0) {
      reasons.push(
        `price ${priceCents} is at or below the partner cost ALREADY RECORDED on this engagement `
        + `(${rowVendorCost}c, margin ${marginAgainstRow} cents). The supplied cost ${suppliedVendorCost}c is lower `
        + 'than the row\'s, so the gate is evaluated against both and the worse answer stands.',
      );
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

    // THE LAST THING BEFORE THE STATE MOVES. See the ORDER note above.
    await assertUnderwritingCleared(pool, subjectId, actor, priceCents);

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
      /*
       * THE LEGAL-POSITION STAMP, ON THE OUTPUT OF THE ACT THAT PRODUCES THE DOCUMENT.
       * `assertPerimeterCleared` throws when the perimeter blocks, so reaching this line
       * means it did not — which since 2026-08-02 includes the case where it refused for
       * want of a human-entered position and the act proceeded on an advisory basis. The
       * governed-action result is what `object_actions` records and what the desk reads
       * back, so the stamp belongs on it and not only on the REST refusal body.
       */
      ...perimeterStamp(perimeter),
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
  execute: async ({ pool, subjectId, params, actor }) => {
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

    /*
     * THE PERIMETER GATE, FOR EXACTLY THE REASON THE CONFLICT GATE IS HERE TWICE.
     *
     * Acceptance is the act that makes the work invoiceable, and it was the one
     * client-facing money event in the compartment reached with the jurisdictional
     * perimeter never consulted — the conflict gate above was its only gate. A
     * position is not static: `gps_jurisdiction_profile` can be amended to
     * `prohibited`, its `review_by` can pass, or the sole reviewer's clearance can be
     * withdrawn AFTER a proposal legitimately went out. Recording acceptance in that
     * window books revenue against work the perimeter now refuses, so the check
     * belongs on THIS write and not only on the one before it.
     *
     * ORDER: conflict, then perimeter, then the UPDATE — the same order
     * `gps_proposal_issue` uses, so the two client-facing executors refuse in the
     * same sequence and a reader learns one shape. Fails closed.
     */
    const perimeter = await assertPerimeterCleared(pool, subjectId, {
      evaluatedBy: actor,
      asOf: new Date().toISOString(),
    });

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
    // Stamped for the reason gps_proposal_issue gives: acceptance is the act that books
    // revenue, and it can now happen with no legal position on file for the jurisdiction.
    return { engagementId: subjectId, status: 'accepted', conflictDecision, ...perimeterStamp(perimeter) };
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
