import type { Pool, PoolClient } from 'pg';
import {
  CATALOGUE_DEFAULT_CONTRACTING_ENTITY, CATALOGUE_TODOS,
  ENGAGEMENT_STATUSES, OFFER_KEYS,
  PRICE_BANDS_ARE_PLACEHOLDERS, bandMidpointCents, getOffer,
  isTerminalEngagementStatus, marginCents, marginPct,
  type ClientStatus, type ConflictDecision, type ContractingEntity,
  type EngagementStatus, type GpsClient, type GpsConflictCheck,
  type GpsEngagement, type OfferKey,
} from '@lcx/shared';

/**
 * GLOBAL SERVICES (GPS) — the data layer for the eighth compartment.
 *
 * Phase 1 of `GPS_IMPLEMENTATION_PLAN.md` only: offer → quote → proposal →
 * deposit, against `apps/api/src/db/migrations/0047_gps.sql`.
 *
 * THREE PROPERTIES THIS FILE IS RESPONSIBLE FOR, each of which is asserted by a
 * test rather than left to reviewer memory:
 *
 *  1. EVERY statement is parameterised. Nothing — no value, no identifier, no
 *     ORDER BY fragment — is concatenated into SQL. Same standing rule as
 *     `marketing/service.ts:8`, and it matters more here: these rows are a third
 *     party's commercial terms and our own margin.
 *
 *  2. MONEY IS INTEGER CENTS, end to end, and MARGIN IS NEVER STORED. There is
 *     no margin column in 47 migrations by design (`0047_gps.sql:163`); it is
 *     derived by `marginCents`/`marginPct` from shared so it cannot go stale
 *     against a price someone edited. `bigint` columns come back from `pg` as
 *     STRINGS, so every money read goes through `cents()` below — reading them
 *     raw is how `"1200000" + 0` becomes a string concatenation bug on a quote.
 *
 *  3. NO ARTIFACT, DOCUMENT, ATTACHMENT OR UPLOAD PATH EXISTS HERE. Phase 3 is
 *     gated on decision D2 (does LCX legal/DPO accept third-party confidential
 *     material on LCX infrastructure: controller vs processor, the subprocessor
 *     chain, retention, erasure) and that question is UNANSWERED. The absence is
 *     the safety property, enforced by the ratchet in
 *     `__tests__/noIntake.test.ts`. Do not add a helper here that writes bytes.
 *
 * WHAT THIS FILE DOES NOT DO, stated so nobody assumes otherwise:
 *  - It does not touch `deals`. `0033_deals_unique_project.sql:12` puts a UNIQUE
 *    INDEX on `deals(project_id)` — one deal per project forever — so repeat
 *    business is impossible there. That index is not dropped; engagements simply
 *    live in their own table.
 *  - It does not write `payment_milestones` (`0024_dealdesk_ext.sql:37`). That IS
 *    the invoice schedule and is deliberately reused rather than duplicated, but
 *    it hangs off `invoices(deal_id)` → `deals`, so it cannot attach to a
 *    `gps_engagement` without an `invoices` change that is out of Phase 1 scope.
 *    Phase 1 tracks the deposit on the engagement itself. The seam is real and
 *    is left visible rather than faked.
 */

/**
 * HAS MIGRATION 0047 LANDED ON THIS ENVIRONMENT?
 *
 * The same probe, for the same reason, as `marketing/service.ts:46` — and that
 * reason is a deploy ordering fact, not a preference. The web bundle and the API
 * ship together on a push to main, but 0047 is applied by hand against a database
 * whose credentials live in Render's dashboard. There is therefore a window,
 * possibly a weekend long, where this code is live and `gps_client` does not
 * exist.
 *
 * Unguarded, every route throws `relation "gps_engagement" does not exist` and
 * returns 500. The desk then cannot distinguish "one migration is pending" from
 * "the platform is down", and it is the second reading people act on.
 *
 * `to_regclass` rather than information_schema: one cheap lookup that returns
 * NULL on absence instead of throwing, so the probe itself can never be the thing
 * that errors. `gps_engagement` rather than `gps_client` because it is the table
 * every interesting read touches, and 0047 creates them in one file — if one
 * exists they all do.
 *
 * Cached per process: the answer changes only when someone runs a migration,
 * which means a deploy or a manual step, and the API restarts on deploy. A false
 * negative self-heals on restart; a per-request probe would add a round trip to
 * every read forever to catch a once-ever event.
 */
let migratedCache: boolean | null = null;

export async function isMigrated(pool: Pool): Promise<boolean> {
  if (migratedCache !== null) return migratedCache;
  try {
    const res = await pool.query(
      `SELECT to_regclass('public.gps_engagement') IS NOT NULL AS ok`,
    );
    migratedCache = Boolean(res.rows[0]?.ok);
  } catch {
    // A database that cannot answer this cannot serve the compartment either.
    // Report not-migrated rather than propagating a 500 up to the desk.
    migratedCache = false;
  }
  return migratedCache;
}

/** Test-only: forget the probe. */
export function _resetMigrated(): void {
  migratedCache = null;
}

/**
 * `bigint` arrives from node-postgres as a STRING, because a bigint does not fit
 * in a JS number in general. Ours do (no engagement is $90 quadrillion), but the
 * driver cannot know that, so every money column is normalised here exactly once.
 *
 * Reading `row.price_cents` directly is the bug this exists to prevent:
 * `"1200000" - "600000"` coerces and works, while `"1200000" + 0` yields
 * `"12000000"` — a quote a hundred times too large, silently.
 */
function cents(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** timestamptz → ISO string, preserving null. */
function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

// ── Row mapping ───────────────────────────────────────────────────────────────
//  The API speaks the camelCase shapes declared in
//  `packages/shared/src/gps/types.ts`, which the web layer also imports. Mapping
//  here rather than `SELECT *`-ing snake_case to the client means a column rename
//  in 0047 is a typecheck failure in one file instead of a silently missing field
//  on a screen.

interface ClientRow {
  id: string; name: string; legal_entity: string | null; jurisdiction: string | null;
  primary_contact: string | null; status: string;
  created_at: unknown; updated_at: unknown;
}

function toClient(r: ClientRow): GpsClient {
  return {
    id: r.id,
    name: r.name,
    legalEntity: r.legal_entity,
    jurisdiction: r.jurisdiction,
    primaryContact: r.primary_contact,
    status: r.status as ClientStatus,
    createdAt: iso(r.created_at) ?? '',
    updatedAt: iso(r.updated_at) ?? '',
  };
}

interface EngagementRow {
  id: string; client_id: string; project_id: string | null; offer_key: string;
  contracting_entity: string; scope_snapshot: unknown;
  price_cents: unknown; vendor_cost_cents: unknown; currency: string;
  status: string; owner: string | null;
  deposit_required_cents: unknown; deposit_paid_at: unknown;
  accepted_at: unknown; created_at: unknown; updated_at: unknown;
}

function toEngagement(r: EngagementRow): GpsEngagement {
  return {
    id: r.id,
    clientId: r.client_id,
    projectId: r.project_id,
    offerKey: r.offer_key as OfferKey,
    contractingEntity: r.contracting_entity as ContractingEntity,
    scopeSnapshot: r.scope_snapshot,
    priceCents: cents(r.price_cents),
    vendorCostCents: cents(r.vendor_cost_cents),
    currency: r.currency,
    status: r.status as EngagementStatus,
    owner: r.owner,
    depositRequiredCents: cents(r.deposit_required_cents),
    depositPaidAt: iso(r.deposit_paid_at),
    acceptedAt: iso(r.accepted_at),
    createdAt: iso(r.created_at) ?? '',
    updatedAt: iso(r.updated_at) ?? '',
  };
}

interface ConflictRow {
  id: string; client_id: string; engagement_id: string; check_performed: string;
  decision: string; decided_by: string; disclosure_text_used: string | null;
  decided_at: unknown;
}

function toConflictCheck(r: ConflictRow): GpsConflictCheck {
  return {
    id: r.id,
    clientId: r.client_id,
    engagementId: r.engagement_id,
    checkPerformed: r.check_performed,
    decision: r.decision as ConflictDecision,
    decidedBy: r.decided_by,
    disclosureTextUsed: r.disclosure_text_used,
    decidedAt: iso(r.decided_at) ?? '',
  };
}

/**
 * The engagement column list, written out once.
 *
 * A literal, not `SELECT *`: `toEngagement` maps a fixed set of columns, and a
 * future migration adding a column to `gps_engagement` should not start arriving
 * in API responses without anyone deciding it should.
 */
const ENGAGEMENT_COLS = `id, client_id, project_id, offer_key, contracting_entity,
  scope_snapshot, price_cents, vendor_cost_cents, currency, status, owner,
  deposit_required_cents, deposit_paid_at, accepted_at, created_at, updated_at`;

const CLIENT_COLS = `id, name, legal_entity, jurisdiction, primary_contact, status,
  created_at, updated_at`;

const CONFLICT_COLS = `id, client_id, engagement_id, check_performed, decision,
  decided_by, disclosure_text_used, decided_at`;


// ── Quoting ───────────────────────────────────────────────────────────────────

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  TODO — DEPOSIT POLICY IS A PLACEHOLDER. NOT AN AGREED TERM.
 * ══════════════════════════════════════════════════════════════════════════════
 *  No deposit percentage has been supplied, in the same way price bands have not
 *  been (`catalogue.ts:58`, decision D4). 50% is the figure a services business
 *  usually asks for and is stated HERE, once, so replacing it is one edit with no
 *  stale copy anywhere else.
 *
 *  Why a default at all rather than "required field": the deposit is the only
 *  thing standing between an accepted engagement and a partner committed on our
 *  cash, so a quote that shows no deposit at all is worse than one that shows a
 *  clearly-badged placeholder. `depositPolicyIsPlaceholder` travels on every
 *  quote so the screen says so.
 */
export const TODO_DEPOSIT_PCT = 50;

/** Flip in the same commit that supplies a real, founder-agreed deposit term. */
export const DEPOSIT_PCT_IS_PLACEHOLDER = true;

export interface QuoteInput {
  offerKey: OfferKey;
  /** Integer cents. Defaults to the band midpoint. */
  priceCents?: number;
  /** Integer cents. Defaults to the catalogue's placeholder vendor cost. */
  vendorCostCents?: number;
  contractingEntity?: ContractingEntity;
  currency?: string;
}

/**
 * A quote, with MARGIN VISIBLE AT QUOTE TIME. That is the entire point of this
 * function and the reason `vendor_cost_cents` exists as a column.
 *
 * The founder sells and coordinates; partners and specialists deliver. So the
 * relevant number at the moment of quoting is not the price — it is price minus
 * what the partner will be paid, and at a $10–25k engagement one scope overrun
 * eats all of it. Every prior surface in this platform quotes a price with no
 * cost beside it. This one refuses to.
 *
 * Pure and DB-free on purpose: a quote is arithmetic over the compiled catalogue,
 * so it works during the deploy-before-migration window and needs no probe. The
 * ratchet in `__tests__/deploySafety.test.ts` asserts that this stays true rather
 * than allowing a handler to skip the probe by accident.
 */
export interface Quote {
  offerKey: OfferKey;
  offerName: string;
  contractingEntity: ContractingEntity;
  currency: string;
  priceCents: number;
  vendorCostCents: number;
  /** Derived, never stored. May be negative — see `marginCents` in shared. */
  marginCents: number;
  /** Gross margin as a percent of price. Null when there is no price yet. */
  marginPct: number | null;
  bandCents: { min: number; max: number };
  withinBand: boolean;
  depositRequiredCents: number;
  depositPct: number;
  /** True while `PRICE_BANDS_ARE_PLACEHOLDERS` — badge it, do not present it. */
  priceIsPlaceholder: boolean;
  vendorCostIsPlaceholder: boolean;
  depositPolicyIsPlaceholder: boolean;
  isDiagnostic: boolean;
  creditableAgainstEngagement: boolean;
  /** Null on every offer today: there is no partner bench (D5). */
  partnerOwner: string | null;
  /**
   * Things a human must look at before this goes out. Each one is arithmetic or
   * a stated catalogue fact — never a commercial judgement this code is not
   * qualified to make.
   */
  warnings: string[];
  /** What gets frozen into `gps_engagement.scope_snapshot` if this is sold. */
  scopeSnapshot: ScopeSnapshot;
}

/**
 * The offer AS QUOTED, frozen.
 *
 * The catalogue is versioned code and will change; what a client agreed to must
 * not change with it. So the snapshot carries the full commercial perimeter —
 * inclusions, EXCLUSIONS, acceptance criteria, required inputs — and the money as
 * quoted, plus a note of whether the numbers were placeholders at the time.
 *
 * Note what is NOT in here: any client-supplied material. This is our own text.
 * `requiredClientInputs` NAMES what the client must provide and deliberately
 * creates nowhere to put it (D2, plan §4 S0.4).
 */
export interface ScopeSnapshot {
  offerKey: OfferKey;
  offerName: string;
  outcome: string;
  inclusions: readonly string[];
  exclusions: readonly string[];
  requiredClientInputs: readonly string[];
  acceptanceCriteria: readonly string[];
  renewalPath: string;
  contractingEntity: ContractingEntity;
  currency: string;
  priceCents: number;
  vendorCostCents: number;
  depositRequiredCents: number;
  creditableAgainstEngagement: boolean;
  /** Recorded so a proposal issued during the placeholder era is identifiable. */
  priceWasPlaceholder: boolean;
  quotedAt: string;
}

export function quoteOffer(input: QuoteInput): Quote {
  // Throws on an unknown key (`getOffer`, catalogue.ts:434) rather than pricing
  // an offer that does not exist at zero. Route validation catches it first.
  const offer = getOffer(input.offerKey);

  const priceCents = Number.isFinite(input.priceCents as number) && (input.priceCents as number) >= 0
    ? Math.round(input.priceCents as number)
    : bandMidpointCents(offer);
  const vendorCostCents = Number.isFinite(input.vendorCostCents as number) && (input.vendorCostCents as number) >= 0
    ? Math.round(input.vendorCostCents as number)
    : offer.expectedVendorCostCents;

  // Read the default from the catalogue, not from a literal here: D1 is
  // deliberately undecided and there must be exactly one place that says 'lcx'.
  const contractingEntity = input.contractingEntity ?? CATALOGUE_DEFAULT_CONTRACTING_ENTITY;
  const currency = (input.currency ?? 'USD').toUpperCase();
  const depositRequiredCents = Math.round((priceCents * TODO_DEPOSIT_PCT) / 100);
  const band = offer.priceBandCents;
  const withinBand = priceCents >= band.min && priceCents <= band.max;

  const warnings: string[] = [];
  if (priceCents < band.min) {
    warnings.push(
      `Quoted at ${priceCents} cents, below this offer's band floor of ${band.min} — an exception someone signs off on, not a discount nobody remembers choosing.`,
    );
  }
  if (priceCents > band.max) {
    warnings.push('Quoted above the band ceiling — confirm the scope actually grew.');
  }
  const margin = marginCents(priceCents, vendorCostCents);
  if (margin <= 0) {
    // Deliberately not clamped anywhere: a quote at or below vendor cost must be
    // visible now, not discovered at invoice time.
    warnings.push(`Margin is ${margin} cents — this quote does not pay for its own delivery.`);
  }
  if (offer.partnerOwner === null) {
    warnings.push(
      'No named partner for this offer (decision D5): the engagement can be sold but cannot yet be staffed.',
    );
  }
  if (PRICE_BANDS_ARE_PLACEHOLDERS) {
    warnings.push(
      'Price band and vendor cost are UNCALIBRATED PLACEHOLDERS (D4/D5). Margin arithmetic is correct; the inputs are not agreed numbers.',
    );
  }

  return {
    offerKey: offer.key,
    offerName: offer.name,
    contractingEntity,
    currency,
    priceCents,
    vendorCostCents,
    marginCents: margin,
    marginPct: marginPct(priceCents, vendorCostCents),
    bandCents: { min: band.min, max: band.max },
    withinBand,
    depositRequiredCents,
    depositPct: TODO_DEPOSIT_PCT,
    priceIsPlaceholder: PRICE_BANDS_ARE_PLACEHOLDERS,
    vendorCostIsPlaceholder: PRICE_BANDS_ARE_PLACEHOLDERS,
    depositPolicyIsPlaceholder: DEPOSIT_PCT_IS_PLACEHOLDER,
    isDiagnostic: offer.isDiagnostic,
    creditableAgainstEngagement: offer.creditableAgainstEngagement,
    partnerOwner: offer.partnerOwner,
    warnings,
    scopeSnapshot: {
      offerKey: offer.key,
      offerName: offer.name,
      outcome: offer.outcome,
      inclusions: offer.inclusions,
      exclusions: offer.exclusions,
      requiredClientInputs: offer.requiredClientInputs,
      acceptanceCriteria: offer.acceptanceCriteria,
      renewalPath: offer.renewalPath,
      contractingEntity,
      currency,
      priceCents,
      vendorCostCents,
      depositRequiredCents,
      creditableAgainstEngagement: offer.creditableAgainstEngagement,
      priceWasPlaceholder: PRICE_BANDS_ARE_PLACEHOLDERS,
      quotedAt: new Date().toISOString(),
    },
  };
}


// ── Clients ───────────────────────────────────────────────────────────────────

/** Newest-touched first: a services desk works its recent conversations. */
export async function listClients(
  pool: Pool,
  opts: { status?: ClientStatus; limit?: number } = {},
): Promise<GpsClient[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const res = opts.status
    ? await pool.query(
        `SELECT ${CLIENT_COLS} FROM gps_client WHERE status = $1
         ORDER BY updated_at DESC LIMIT $2`,
        [opts.status, limit],
      )
    : await pool.query(
        `SELECT ${CLIENT_COLS} FROM gps_client ORDER BY updated_at DESC LIMIT $1`,
        [limit],
      );
  return (res.rows as ClientRow[]).map(toClient);
}

/**
 * Create a client.
 *
 * NOT idempotent and NOT deduplicated, matching `gps_client_name_idx`
 * (`0047_gps.sql:95`) which is deliberately non-UNIQUE: two real companies can
 * share a name, and refusing the second to protect against a duplicate a human
 * can see and merge is the wrong trade. `possibleDuplicates` is returned instead
 * so the caller can say "there is already a Nexera — is this the same one?"
 */
export async function createClient(
  pool: Pool,
  input: {
    name: string;
    legalEntity?: string | null;
    jurisdiction?: string | null;
    primaryContact?: string | null;
    status?: ClientStatus;
  },
): Promise<{ client: GpsClient; possibleDuplicates: GpsClient[] }> {
  // Uses the lower(name) index rather than ILIKE so the check stays cheap.
  const dupes = await pool.query(
    `SELECT ${CLIENT_COLS} FROM gps_client WHERE lower(name) = lower($1) LIMIT 5`,
    [input.name],
  );
  const res = await pool.query(
    `INSERT INTO gps_client (name, legal_entity, jurisdiction, primary_contact, status)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'prospect'))
     RETURNING ${CLIENT_COLS}`,
    [
      input.name,
      input.legalEntity ?? null,
      input.jurisdiction ?? null,
      input.primaryContact ?? null,
      input.status ?? null,
    ],
  );
  return {
    client: toClient(res.rows[0] as ClientRow),
    possibleDuplicates: (dupes.rows as ClientRow[]).map(toClient),
  };
}

export async function getClient(pool: Pool, id: string): Promise<GpsClient | null> {
  const res = await pool.query(`SELECT ${CLIENT_COLS} FROM gps_client WHERE id = $1`, [id]);
  const row = res.rows[0] as ClientRow | undefined;
  return row ? toClient(row) : null;
}


// ── Engagements ───────────────────────────────────────────────────────────────

export interface EngagementFilter {
  clientId?: string;
  status?: EngagementStatus;
  owner?: string;
  limit?: number;
}

/**
 * List engagements.
 *
 * Filters are composed as a fixed set of optional predicates, each with its own
 * placeholder — the WHERE clause is assembled from constant fragments and the
 * VALUES are always bound. No caller-supplied string ever reaches the SQL text,
 * including the ORDER BY, which is why there is no `sort` parameter.
 */
export async function listEngagements(
  pool: Pool,
  f: EngagementFilter = {},
): Promise<GpsEngagement[]> {
  const limit = Math.min(Math.max(f.limit ?? 100, 1), 500);
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.clientId) { params.push(f.clientId); where.push(`client_id = $${params.length}`); }
  if (f.status) { params.push(f.status); where.push(`status = $${params.length}`); }
  if (f.owner) { params.push(f.owner); where.push(`owner = $${params.length}`); }
  params.push(limit);

  const res = await pool.query(
    `SELECT ${ENGAGEMENT_COLS} FROM gps_engagement
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY updated_at DESC LIMIT $${params.length}`,
    params,
  );
  return (res.rows as EngagementRow[]).map(toEngagement);
}

export async function getEngagement(pool: Pool, id: string): Promise<GpsEngagement | null> {
  const res = await pool.query(
    `SELECT ${ENGAGEMENT_COLS} FROM gps_engagement WHERE id = $1`, [id],
  );
  const row = res.rows[0] as EngagementRow | undefined;
  return row ? toEngagement(row) : null;
}

/**
 * Create an engagement in `conflict_pending`, NOT `draft`.
 *
 * This is the one opinionated default in the file and it is the compliance
 * machinery working. The founder is an employee of LCX, an EU/Liechtenstein
 * regulated exchange, selling services to the same population of token projects
 * that applies to list. The severe risk in this programme is not a lost deal — it
 * is the PERCEPTION that paying for services buys listing influence (plan §9).
 *
 * Starting at `conflict_pending` means the missing check is visible in a list
 * view from the moment the engagement exists, rather than being discoverable in
 * an audit. `draft` remains a legal status a human can move back to; nothing
 * *starts* there, because a services engagement with no conflict position
 * recorded is not a draft, it is an unresolved question.
 *
 * The price/cost/scope come from `quoteOffer`, so the snapshot is frozen at
 * creation and stops tracking the catalogue immediately.
 */
export async function createEngagement(
  pool: Pool,
  input: {
    clientId: string;
    offerKey: OfferKey;
    projectId?: string | null;
    contractingEntity?: ContractingEntity;
    priceCents?: number;
    vendorCostCents?: number;
    currency?: string;
    owner?: string | null;
  },
): Promise<{ engagement: GpsEngagement; quote: Quote }> {
  const quote = quoteOffer({
    offerKey: input.offerKey,
    priceCents: input.priceCents,
    vendorCostCents: input.vendorCostCents,
    contractingEntity: input.contractingEntity,
    currency: input.currency,
  });

  const res = await pool.query(
    `INSERT INTO gps_engagement
       (client_id, project_id, offer_key, contracting_entity, scope_snapshot,
        price_cents, vendor_cost_cents, currency, status, owner,
        deposit_required_cents)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, 'conflict_pending', $9, $10)
     RETURNING ${ENGAGEMENT_COLS}`,
    [
      input.clientId,
      input.projectId ?? null,
      quote.offerKey,
      quote.contractingEntity,
      JSON.stringify(quote.scopeSnapshot),
      quote.priceCents,
      quote.vendorCostCents,
      quote.currency,
      input.owner ?? null,
      quote.depositRequiredCents,
    ],
  );
  return { engagement: toEngagement(res.rows[0] as EngagementRow), quote };
}


// ── The conflict check ────────────────────────────────────────────────────────

export type ConflictCheckResult =
  | { ok: true; check: GpsConflictCheck; amended: boolean; engagementStatus: EngagementStatus }
  | { ok: false; reason: 'engagement_not_found' }
  | { ok: false; reason: 'already_recorded'; existing: GpsConflictCheck };

/**
 * Record the conflict check — the artifact that makes this business defensible.
 *
 * FOUR THINGS THIS DELIBERATELY DOES NOT LET THE CALLER DO:
 *
 *  1. Name the decider. `decidedBy` comes from `c.get('operator')` at the route,
 *     never from the request body. An unattributed compliance decision is not a
 *     compliance decision, and a body-supplied name is a suggestion.
 *  2. Point the check at a different client than the engagement's. `client_id` is
 *     read from the engagement inside the transaction and carried across (the
 *     column exists per plan §4 S0.3 so the client-scoped read needs no join) —
 *     a body field would let the two disagree.
 *  3. Overwrite an existing check silently. `gps_conflict_check.engagement_id` is
 *     UNIQUE (`0047_gps.sql:263`) and 0047 calls the table APPEND-CORRECT: an
 *     amendment is permitted, but only when the caller says `amend` and thereby
 *     accepts replacing the recorded text. A default upsert would quietly lose
 *     the disclosure a client was actually given.
 *  4. Record a `cleared_with_disclosure` decision without the disclosure text.
 *     Validated at the route, before the migration probe: the value of the row is
 *     the exact wording used on the day, and a disclosure decision with no
 *     wording is an empty gesture.
 *
 * SIDE EFFECT ON THE ENGAGEMENT, on purpose. A non-declined decision releases an
 * engagement from `conflict_pending` to `draft` so it can be quoted and proposed.
 * A `declined` decision moves it to `cancelled` — terminal — because there is
 * nothing else to do with an engagement we have decided we may not take. That is
 * the ONE place terminality is entered automatically, and the ONE place it can be
 * left: an amended, non-declined decision restores `draft`, because a check
 * re-run against better facts is a legitimate event and forcing a new engagement
 * would lose the audit trail linking the two.
 *
 * HONEST LIMIT, restated from `0047_gps.sql:283`: attribution is only as strong as
 * the shared `DESK_PASSCODE` (plan §1.5 — per-person credentials do not exist).
 * The record is still the record that must exist; it becomes properly attributable
 * the moment per-person auth does.
 */
export async function recordConflictCheck(
  pool: Pool,
  input: {
    engagementId: string;
    checkPerformed: string;
    decision: ConflictDecision;
    /** From the authenticated principal. Never from a request body. */
    decidedBy: string;
    disclosureTextUsed?: string | null;
    amend?: boolean;
  },
): Promise<ConflictCheckResult> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    // FOR UPDATE: the check and the status change must not interleave with a
    // concurrent status transition that would read a stale clearance.
    const eng = await client.query(
      `SELECT id, client_id, status FROM gps_engagement WHERE id = $1 FOR UPDATE`,
      [input.engagementId],
    );
    const row = eng.rows[0] as { id: string; client_id: string; status: string } | undefined;
    if (!row) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'engagement_not_found' };
    }

    const existingRes = await client.query(
      `SELECT ${CONFLICT_COLS} FROM gps_conflict_check WHERE engagement_id = $1`,
      [input.engagementId],
    );
    const existing = existingRes.rows[0] as ConflictRow | undefined;
    if (existing && !input.amend) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'already_recorded', existing: toConflictCheck(existing) };
    }

    const params = [
      row.client_id,
      input.engagementId,
      input.checkPerformed,
      input.decision,
      input.decidedBy,
      input.disclosureTextUsed ?? null,
    ];
    const saved = existing
      ? await client.query(
          `UPDATE gps_conflict_check
              SET client_id = $1, check_performed = $3, decision = $4,
                  decided_by = $5, disclosure_text_used = $6, decided_at = now()
            WHERE engagement_id = $2
            RETURNING ${CONFLICT_COLS}`,
          params,
        )
      : await client.query(
          `INSERT INTO gps_conflict_check
             (client_id, engagement_id, check_performed, decision, decided_by,
              disclosure_text_used)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING ${CONFLICT_COLS}`,
          params,
        );

    // The status consequence. Only these two transitions are automatic, and both
    // are documented above; every other move is a deliberate human act.
    let nextStatus: EngagementStatus | null = null;
    if (input.decision === 'declined') {
      nextStatus = 'cancelled';
    } else if (row.status === 'conflict_pending' || row.status === 'cancelled') {
      nextStatus = 'draft';
    }
    if (nextStatus) {
      await client.query(
        `UPDATE gps_engagement SET status = $2, updated_at = now() WHERE id = $1`,
        [input.engagementId, nextStatus],
      );
    }

    await client.query('COMMIT');
    return {
      ok: true,
      check: toConflictCheck(saved.rows[0] as ConflictRow),
      amended: Boolean(existing),
      engagementStatus: nextStatus ?? (row.status as EngagementStatus),
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function getConflictCheck(
  pool: Pool,
  engagementId: string,
): Promise<GpsConflictCheck | null> {
  const res = await pool.query(
    `SELECT ${CONFLICT_COLS} FROM gps_conflict_check WHERE engagement_id = $1`,
    [engagementId],
  );
  const row = res.rows[0] as ConflictRow | undefined;
  return row ? toConflictCheck(row) : null;
}


// ── Status transitions ────────────────────────────────────────────────────────

/**
 * The statuses an engagement may not reach without a recorded, non-declined
 * conflict check.
 *
 * Derived from `ENGAGEMENT_STATUSES` rather than written out, so a status added to
 * the shared lifecycle later cannot slip through this gate by being forgotten
 * here: everything from `proposed` onwards is gated, and the two exits
 * (`closed_lost`, `cancelled`) are not — you must always be able to walk away
 * from an engagement, and requiring a compliance artifact in order to abandon one
 * would be an incentive to leave it open instead.
 *
 * `draft` and `conflict_pending` are below the line because they are internal:
 * nothing has been shown to a client yet.
 */
const PROPOSED_INDEX = ENGAGEMENT_STATUSES.indexOf('proposed');
export const REQUIRES_CONFLICT_CLEARANCE: readonly EngagementStatus[] =
  ENGAGEMENT_STATUSES.filter(
    (s, i) => i >= PROPOSED_INDEX && s !== 'closed_lost' && s !== 'cancelled',
  );

export type StatusChangeResult =
  | { ok: true; engagement: GpsEngagement }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'terminal'; from: EngagementStatus }
  | {
      ok: false;
      reason: 'conflict_check_missing' | 'conflict_check_declined';
      /** The engagement AFTER being parked in `conflict_pending`, when it was. */
      engagement: GpsEngagement;
    };

/**
 * Move an engagement's status, with two refusals and two stamps.
 *
 * REFUSAL 1 — TERMINALITY. `collected`, `closed_lost` and `cancelled` are ends
 * (`isTerminalEngagementStatus`, shared). Reopening a collected engagement would
 * make the revenue number a moving target and reopening a cancelled one would
 * bypass the conflict gate that cancelled it. The correct move is a NEW
 * engagement — which is possible precisely because this compartment does not use
 * `deals`, where `0033_deals_unique_project.sql:12` makes a second one impossible.
 *
 * REFUSAL 2 — THE CONFLICT GATE. Nothing reaches `proposed` or beyond without a
 * recorded, non-declined conflict check. And when the check is MISSING the
 * engagement is parked in `conflict_pending` in the same transaction, so the
 * refusal leaves a visible artifact instead of only an HTTP status somebody
 * dismissed. That is the difference between a control and a warning.
 *
 * STAMPS. `accepted` sets `accepted_at`, `deposit_paid` sets `deposit_paid_at`,
 * both via COALESCE so a re-issued transition never rewrites the first date.
 * They are separate columns because a signature is not cash and only one of them
 * pays a partner (`0047_gps.sql:195`).
 *
 * NOTE what is NOT enforced: reaching `deposit_paid` without `accepted_at` is
 * allowed. Money sometimes arrives before a countersignature, and inventing an
 * `accepted_at` we did not observe would be fabricating a contractual date. The
 * desk summary counts the gap instead.
 */
export async function setEngagementStatus(
  pool: Pool,
  id: string,
  status: EngagementStatus,
  opts: { depositRequiredCents?: number } = {},
): Promise<StatusChangeResult> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(
      `SELECT ${ENGAGEMENT_COLS} FROM gps_engagement WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const before = cur.rows[0] as EngagementRow | undefined;
    if (!before) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'not_found' };
    }
    const from = before.status as EngagementStatus;
    if (isTerminalEngagementStatus(from) && status !== from) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'terminal', from };
    }

    if (REQUIRES_CONFLICT_CLEARANCE.includes(status)) {
      const chk = await client.query(
        `SELECT decision FROM gps_conflict_check WHERE engagement_id = $1`,
        [id],
      );
      const decision = (chk.rows[0] as { decision: string } | undefined)?.decision as
        | ConflictDecision
        | undefined;
      if (!decision) {
        // Park it. The refusal has to be visible in the pipeline list, not just in
        // a response body the caller can ignore.
        const parked = await client.query(
          `UPDATE gps_engagement SET status = 'conflict_pending', updated_at = now()
            WHERE id = $1 RETURNING ${ENGAGEMENT_COLS}`,
          [id],
        );
        await client.query('COMMIT');
        return {
          ok: false,
          reason: 'conflict_check_missing',
          engagement: toEngagement(parked.rows[0] as EngagementRow),
        };
      }
      if (decision === 'declined') {
        await client.query('ROLLBACK');
        return {
          ok: false,
          reason: 'conflict_check_declined',
          engagement: toEngagement(before),
        };
      }
    }

    const deposit =
      Number.isFinite(opts.depositRequiredCents as number) &&
      (opts.depositRequiredCents as number) >= 0
        ? Math.round(opts.depositRequiredCents as number)
        : null;

    const res = await client.query(
      `UPDATE gps_engagement
          SET status = $2,
              accepted_at = CASE WHEN $2 = 'accepted'
                                 THEN COALESCE(accepted_at, now()) ELSE accepted_at END,
              deposit_paid_at = CASE WHEN $2 = 'deposit_paid'
                                     THEN COALESCE(deposit_paid_at, now()) ELSE deposit_paid_at END,
              -- Explicit cast: a bare NULL placeholder leaves Postgres unable to
              -- infer the parameter type and the whole statement errors.
              deposit_required_cents = COALESCE($3::bigint, deposit_required_cents),
              updated_at = now()
        WHERE id = $1
        RETURNING ${ENGAGEMENT_COLS}`,
      [id, status, deposit],
    );
    await client.query('COMMIT');
    return { ok: true, engagement: toEngagement(res.rows[0] as EngagementRow) };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}


// ── Issuing a proposal ────────────────────────────────────────────────────────

/**
 * A proposal, split into what the CLIENT may see and what only WE see.
 *
 * THE SPLIT IS THE POINT. `internal` holds the vendor cost and the margin. If a
 * single flat object were returned, the first web surface to render "the
 * proposal" would put what we pay our partner on a page a client is looking at,
 * and nobody would notice until a client did. A structural boundary is the only
 * version of this that survives contact with a UI in a hurry — and there is a
 * ratchet test asserting no cost or margin field appears under `clientFacing`.
 *
 * NOT PERSISTED AS A DOCUMENT, deliberately. There is no `gps_proposal` table:
 * issuing a proposal freezes the commercial terms into
 * `gps_engagement.scope_snapshot` (already frozen at creation) and moves the
 * status to `proposed`. The client-facing half is therefore reconstructible from
 * the row at any time, and there is no second copy to drift. A rendered PDF is
 * out of Phase 1 scope, and — importantly — generating and storing one is on the
 * far side of the D2 document question, so it is not quietly started here.
 */
export interface Proposal {
  engagementId: string;
  clientId: string;
  clientName: string;
  offerKey: OfferKey;
  contractingEntity: ContractingEntity;
  issuedAt: string;
  /** The authenticated desk member. Never a body field. */
  issuedBy: string;
  clientFacing: {
    offerName: string;
    outcome: string;
    inclusions: readonly string[];
    exclusions: readonly string[];
    requiredClientInputs: readonly string[];
    acceptanceCriteria: readonly string[];
    currency: string;
    priceCents: number;
    depositRequiredCents: number;
    creditableAgainstEngagement: boolean;
    /** Badge it. `PRICE_BANDS_ARE_PLACEHOLDERS` is still true. */
    priceIsPlaceholder: boolean;
  };
  internal: {
    vendorCostCents: number;
    marginCents: number;
    marginPct: number | null;
    renewalPath: string;
    warnings: string[];
  };
}

export type IssueProposalResult =
  | { ok: true; proposal: Proposal; engagement: GpsEngagement }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'no_price' }
  | { ok: false; reason: 'terminal'; from: EngagementStatus }
  | {
      ok: false;
      reason: 'conflict_check_missing' | 'conflict_check_declined';
      engagement: GpsEngagement;
    };

/**
 * Issue the proposal: assemble the document and move the engagement to
 * `proposed`.
 *
 * The status move goes through `setEngagementStatus`, so the conflict gate and
 * the terminality refusal are the SAME code path a manual status change uses —
 * there is no second, laxer route to `proposed`. A refusal here therefore also
 * parks the engagement in `conflict_pending`, which is the intended outcome: the
 * moment someone tries to send a client a proposal without a recorded conflict
 * position is exactly the moment that omission should become visible.
 *
 * A zero price is refused before anything else: a proposal with no number is not
 * a proposal, and 0 is the column default so it is the state a freshly created
 * engagement is in until someone quotes it.
 */
export async function issueProposal(
  pool: Pool,
  engagementId: string,
  issuedBy: string,
): Promise<IssueProposalResult> {
  const engagement = await getEngagement(pool, engagementId);
  if (!engagement) return { ok: false, reason: 'not_found' };
  if (engagement.priceCents <= 0) return { ok: false, reason: 'no_price' };

  const moved = await setEngagementStatus(pool, engagementId, 'proposed');
  if (!moved.ok) return moved;

  const client = await getClient(pool, engagement.clientId);
  const offer = getOffer(engagement.offerKey);

  // The snapshot is the frozen truth; the live catalogue is the fallback for the
  // narrative fields only. Money and terms come from the ROW, never re-derived —
  // re-quoting at issue time would silently change what the client is being sent.
  const snap = (engagement.scopeSnapshot ?? {}) as Partial<ScopeSnapshot>;
  const quote = quoteOffer({
    offerKey: engagement.offerKey,
    priceCents: engagement.priceCents,
    vendorCostCents: engagement.vendorCostCents,
    contractingEntity: engagement.contractingEntity,
    currency: engagement.currency,
  });

  return {
    ok: true,
    engagement: moved.engagement,
    proposal: {
      engagementId: engagement.id,
      clientId: engagement.clientId,
      clientName: client?.name ?? '(client row missing)',
      offerKey: engagement.offerKey,
      contractingEntity: engagement.contractingEntity,
      issuedAt: new Date().toISOString(),
      issuedBy,
      clientFacing: {
        offerName: snap.offerName ?? offer.name,
        outcome: snap.outcome ?? offer.outcome,
        inclusions: snap.inclusions ?? offer.inclusions,
        exclusions: snap.exclusions ?? offer.exclusions,
        requiredClientInputs: snap.requiredClientInputs ?? offer.requiredClientInputs,
        acceptanceCriteria: snap.acceptanceCriteria ?? offer.acceptanceCriteria,
        currency: engagement.currency,
        priceCents: engagement.priceCents,
        depositRequiredCents: engagement.depositRequiredCents,
        creditableAgainstEngagement:
          snap.creditableAgainstEngagement ?? offer.creditableAgainstEngagement,
        priceIsPlaceholder: snap.priceWasPlaceholder ?? PRICE_BANDS_ARE_PLACEHOLDERS,
      },
      internal: {
        vendorCostCents: engagement.vendorCostCents,
        marginCents: marginCents(engagement.priceCents, engagement.vendorCostCents),
        marginPct: marginPct(engagement.priceCents, engagement.vendorCostCents),
        renewalPath: snap.renewalPath ?? offer.renewalPath,
        warnings: quote.warnings,
      },
    },
  };
}


// ── The desk summary ──────────────────────────────────────────────────────────

/**
 * MONEY IS TOTALLED PER CURRENCY, NEVER SUMMED ACROSS THEM.
 *
 * `gps_engagement.currency` is per row on purpose (`0047_gps.sql:172`) — a partner
 * may invoice EUR against a USD price. A single `pipelineCents` figure would
 * therefore be arithmetic on unlike units: correct-looking, wrong, and impossible
 * to spot on a dashboard. There is no FX rate source in this repo and inventing
 * one would be worse than declining to add the numbers up.
 */
export interface CurrencyTotal {
  currency: string;
  count: number;
  priceCents: number;
  vendorCostCents: number;
  /** Derived here too — still never stored. */
  marginCents: number;
}

export interface DeskSummary {
  migrated: boolean;
  clients: { total: number; byStatus: Record<string, number> };
  engagements: { total: number; byStatus: Record<string, number>; byOffer: Record<string, number> };
  /** Non-terminal engagements: what is actually in play. */
  openByCurrency: CurrencyTotal[];
  /** `collected` only. Cash in, not bookings. */
  collectedByCurrency: CurrencyTotal[];
  awaitingDeposit: {
    count: number;
    byCurrency: Array<{ currency: string; depositRequiredCents: number }>;
    oldestAcceptedDays: number | null;
  };
  /**
   * The things a desk should be uncomfortable about. Counted rather than
   * described, because a number on a screen gets acted on and a paragraph does
   * not.
   */
  gaps: {
    /** Live engagements with no conflict check on record. Should be zero. */
    missingConflictCheck: number;
    /** Checks recorded as `declined`. Kept visible; they are the audit trail. */
    conflictDeclined: number;
    /** Live engagements still at price 0 — nothing quotable has happened yet. */
    unpriced: number;
    /** Deposit banked with no acceptance date. Allowed, but chase the paperwork. */
    depositWithoutAcceptance: number;
    /** Engagements sold on an offer with no named partner (D5). */
    unstaffable: number;
  };
  catalogue: {
    priceBandsArePlaceholders: boolean;
    depositPolicyIsPlaceholder: boolean;
    /** Decisions that block quoting a real price. See CATALOGUE_TODOS in shared. */
    blockingTodoCount: number;
  };
}

/** The empty-but-well-shaped body served while 0047 is pending. Not an error. */
export function emptyDeskSummary(): DeskSummary {
  return {
    migrated: false,
    clients: { total: 0, byStatus: {} },
    engagements: { total: 0, byStatus: {}, byOffer: {} },
    openByCurrency: [],
    collectedByCurrency: [],
    awaitingDeposit: { count: 0, byCurrency: [], oldestAcceptedDays: null },
    gaps: {
      missingConflictCheck: 0, conflictDeclined: 0, unpriced: 0,
      depositWithoutAcceptance: 0, unstaffable: 0,
    },
    catalogue: {
      priceBandsArePlaceholders: PRICE_BANDS_ARE_PLACEHOLDERS,
      depositPolicyIsPlaceholder: DEPOSIT_PCT_IS_PLACEHOLDER,
      blockingTodoCount: CATALOGUE_TODOS.filter((t) => t.blocksQuoting).length,
    },
  };
}

/** Offers with no named partner. Derived from the catalogue, not hardcoded. */
const UNSTAFFABLE_OFFER_KEYS: readonly OfferKey[] =
  OFFER_KEYS.filter((k) => getOffer(k).partnerOwner === null);

const TERMINAL_SQL_LIST = `('collected','closed_lost','cancelled')`;

function toCurrencyTotals(rows: unknown[]): CurrencyTotal[] {
  return (rows as Array<{ currency: string; n: number; price: unknown; cost: unknown }>).map((r) => {
    const priceCents = cents(r.price);
    const vendorCostCents = cents(r.cost);
    return {
      currency: r.currency,
      count: Number(r.n),
      priceCents,
      vendorCostCents,
      marginCents: marginCents(priceCents, vendorCostCents),
    };
  });
}

export async function deskSummary(pool: Pool): Promise<DeskSummary> {
  // Counted from the shared catalogue rather than passed in: the number of
  // decisions blocking a real quote is a property of the catalogue, and a caller
  // that could supply its own would eventually supply zero.
  const blockingTodoCount = CATALOGUE_TODOS.filter((t) => t.blocksQuoting).length;
  const [clientCounts, statusCounts, offerCounts, open, collected, deposits, oldest, gaps] =
    await Promise.all([
      pool.query(`SELECT status, count(*)::int AS n FROM gps_client GROUP BY status`),
      pool.query(`SELECT status, count(*)::int AS n FROM gps_engagement GROUP BY status`),
      pool.query(`SELECT offer_key, count(*)::int AS n FROM gps_engagement GROUP BY offer_key`),
      pool.query(
        `SELECT currency, count(*)::int AS n,
                sum(price_cents) AS price, sum(vendor_cost_cents) AS cost
           FROM gps_engagement
          WHERE status NOT IN ${TERMINAL_SQL_LIST}
          GROUP BY currency ORDER BY currency`,
      ),
      pool.query(
        `SELECT currency, count(*)::int AS n,
                sum(price_cents) AS price, sum(vendor_cost_cents) AS cost
           FROM gps_engagement
          WHERE status = 'collected'
          GROUP BY currency ORDER BY currency`,
      ),
      // Uses gps_engagement_awaiting_deposit_idx (0047_gps.sql:219) — the partial
      // index exists for exactly this read.
      pool.query(
        `SELECT currency, sum(deposit_required_cents) AS amount, count(*)::int AS n
           FROM gps_engagement
          WHERE deposit_paid_at IS NULL AND accepted_at IS NOT NULL
          GROUP BY currency ORDER BY currency`,
      ),
      pool.query(
        `SELECT extract(epoch FROM (now() - min(accepted_at)))/86400 AS days
           FROM gps_engagement
          WHERE deposit_paid_at IS NULL AND accepted_at IS NOT NULL`,
      ),
      pool.query(
        `SELECT
           count(*) FILTER (
             WHERE c.engagement_id IS NULL AND e.status NOT IN ${TERMINAL_SQL_LIST}
           )::int AS missing_check,
           count(*) FILTER (WHERE c.decision = 'declined')::int AS declined,
           count(*) FILTER (
             WHERE e.price_cents = 0 AND e.status NOT IN ${TERMINAL_SQL_LIST}
           )::int AS unpriced,
           count(*) FILTER (
             WHERE e.deposit_paid_at IS NOT NULL AND e.accepted_at IS NULL
           )::int AS deposit_no_accept,
           count(*) FILTER (
             WHERE e.offer_key = ANY($1::text[]) AND e.status NOT IN ${TERMINAL_SQL_LIST}
           )::int AS unstaffable
         FROM gps_engagement e
         LEFT JOIN gps_conflict_check c ON c.engagement_id = e.id`,
        [UNSTAFFABLE_OFFER_KEYS as unknown as string[]],
      ),
    ]);

  const g = gaps.rows[0] as Record<string, number>;
  const depositRows = deposits.rows as Array<{ currency: string; amount: unknown; n: number }>;

  return {
    migrated: true,
    clients: {
      total: clientCounts.rows.reduce((a, r) => a + Number(r.n), 0),
      byStatus: Object.fromEntries(clientCounts.rows.map((r) => [r.status as string, Number(r.n)])),
    },
    engagements: {
      total: statusCounts.rows.reduce((a, r) => a + Number(r.n), 0),
      byStatus: Object.fromEntries(statusCounts.rows.map((r) => [r.status as string, Number(r.n)])),
      byOffer: Object.fromEntries(offerCounts.rows.map((r) => [r.offer_key as string, Number(r.n)])),
    },
    openByCurrency: toCurrencyTotals(open.rows),
    collectedByCurrency: toCurrencyTotals(collected.rows),
    awaitingDeposit: {
      count: depositRows.reduce((a, r) => a + Number(r.n), 0),
      byCurrency: depositRows.map((r) => ({
        currency: r.currency,
        depositRequiredCents: cents(r.amount),
      })),
      oldestAcceptedDays:
        oldest.rows[0]?.days != null ? Math.round(Number(oldest.rows[0].days)) : null,
    },
    gaps: {
      missingConflictCheck: g?.missing_check ?? 0,
      conflictDeclined: g?.declined ?? 0,
      unpriced: g?.unpriced ?? 0,
      depositWithoutAcceptance: g?.deposit_no_accept ?? 0,
      unstaffable: g?.unstaffable ?? 0,
    },
    catalogue: {
      priceBandsArePlaceholders: PRICE_BANDS_ARE_PLACEHOLDERS,
      depositPolicyIsPlaceholder: DEPOSIT_PCT_IS_PLACEHOLDER,
      blockingTodoCount,
    },
  };
}
