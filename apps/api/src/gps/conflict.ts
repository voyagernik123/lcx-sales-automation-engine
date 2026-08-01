import type { Pool } from 'pg';
import {
  OFFER_KEYS,
  PERIMETER_IS_UNREVIEWED,
  PERIMETER_PROFILES,
  PERIMETER_REVIEW_WARNING_DAYS,
  PERIMETER_UNREVIEWED_REASON,
  DISCLOSURES_ARE_NOT_COUNSEL_REVIEWED,
  DISCLOSURE_LIBRARY_VERSION,
  PROHIBITED_PROMISES,
  PROHIBITED_PROMISE_LABEL,
  PROHIBITED_PROMISE_SENTENCE,
  TEAM,
  disclosureRecord,
  gateService,
  getDisclosureLibrarySnapshot,
  getDisclosureTemplate,
  getOffer,
  missingDisclosures,
  normaliseJurisdiction,
  perimeterEntryDefects,
  renderDisclosure,
  requiredDisclosures,
  type ConflictDecision,
  type ContractingEntity,
  type DisclosureContext,
  type DisclosureId,
  type DisclosureLibrarySnapshot,
  type DisclosureUseRecord,
  type EngagementStatus,
  type GpsConflictCheck,
  type JurisdictionProfile,
  type OfferKey,
  type PerimeterEntry,
  type ProhibitedPromise,
  type RenderedDisclosure,
  type ServiceClass,
  type ServiceGateDecision,
} from '@lcx/shared';
import { env } from '../lib/env.js';
import { secondTierUnexpected, secondTierUsage, type SecondTierUse } from '../lib/secondTier.js';
import { REQUIRES_CONFLICT_CLEARANCE } from './service.js';

/**
 * GLOBAL SERVICES — THE CONFLICT WALL (Phase 9). The data layer for the question
 * this whole compartment is answerable for:
 *
 *   "What was your conflict position on this client, who decided it, when, and
 *    what exactly did you disclose?"
 *
 * `packages/shared/src/gps/perimeter.ts` and `disclosure.ts` are the reviewed
 * ENGINES — 76 tests, pure, no clock, no I/O, no override argument. This file is
 * the PERSISTENCE AND COMPOSITION around them, against
 * `apps/api/src/db/migrations/0050_gps_perimeter.sql`. It adds no policy of its
 * own, and that division is the point: a rule that lives here would be a rule
 * that changed without a code review of the engine that enforces it.
 *
 * FOUR PROPERTIES THIS FILE IS RESPONSIBLE FOR
 *
 *  1. IT ORIGINATES NO REGULATORY CONCLUSION. Not one line here decides whether
 *     work may be done anywhere. It loads what a qualified human entered, hands it
 *     to `gateService`, and reports the answer with its workings. When the record
 *     is missing the answer is a REFUSAL WITH A REASON, never a default, and
 *     never the safe-looking guess "prohibited" — inventing a prohibition is still
 *     inventing a legal conclusion (`GPS_100X_PLAN.md` §10).
 *
 *  2. REFUSALS ARE CARRIED, NOT SWALLOWED (doctrine D2). Every composite shape
 *     below embeds the whole `ServiceGateDecision` — `code`, `reason`, `remedy`,
 *     `recoverable`, the classification, and every gate INCLUDING the ones that
 *     were never reached. Nothing is filtered out of a list because it was gated;
 *     a gated thing appears WITH its gate.
 *
 *  3. THE DISCLOSURE TEXT IS NEVER ACCEPTED FROM A CALLER. `recordDisclosure`
 *     takes a template id and the human's assertions, renders server-side through
 *     `renderDisclosure`, and persists what the render produced together with its
 *     version. A route that accepted the words would make the compiled library
 *     decorative — anybody could write anything and it would still land in the
 *     column an auditor reads.
 *
 *  4. EVERY NUMBER IS TRACEABLE (D1). The wall's `counts` are derived from the
 *     `rows` in the same response, so a reader can add them up; `context` travels
 *     beside each row's requirement set so the requirements can be re-derived
 *     from it. GPS has already shipped one count that was computed from nothing
 *     (plan §1 D8), and the fix is not care, it is shipping the inputs.
 *
 * WHAT IS DELIBERATELY NOT HERE. No artifact, upload, attachment or byte path —
 * the lockout of 0047/0049 stands, is machine-enforced over this file by
 * `__tests__/intakeLockout.test.ts`, and decision D2 is still unanswered. No
 * response interface is re-declared from `packages/shared/src/gps/*`: the
 * composite shapes below are new, and every field they carry that already has a
 * shared declaration (`PerimeterEntry`, `ServiceGateDecision`, `GpsConflictCheck`,
 * `DisclosureUseRecord`) is that declaration, embedded rather than copied. A
 * hand-copied response interface is what crashed production once already.
 */

/* ── Has 0050 landed? ─────────────────────────────────────────────────────────
 *
 * Same probe, same reason, as `service.ts:80` and `marketing/service.ts:46`, and
 * the reason is a deploy ordering FACT rather than a preference: the API ships on
 * a push to main while migrations are applied by hand against a database whose
 * credentials live in Render's dashboard. There is a window — possibly a weekend
 * long — in which this code is live and `gps_jurisdiction_profile` does not exist.
 *
 * IT IS A SEPARATE PROBE FROM `isMigrated` (0047) ON PURPOSE. The wall is
 * readable with 0047 alone: engagements, clients and conflict checks all exist,
 * and the honest thing to show in that window is the wall with ZERO recorded
 * disclosures — which is not a degraded view, it is the truth, because zero is how
 * many have been recorded. Conflating the two probes would blank a screen that
 * has something true to say.
 */
let perimeterMigratedCache: boolean | null = null;

export async function isPerimeterMigrated(pool: Pool): Promise<boolean> {
  if (perimeterMigratedCache !== null) return perimeterMigratedCache;
  try {
    const res = await pool.query(
      `SELECT to_regclass('public.gps_jurisdiction_profile') IS NOT NULL AS ok`,
    );
    perimeterMigratedCache = Boolean(res.rows[0]?.ok);
  } catch {
    perimeterMigratedCache = false;
  }
  return perimeterMigratedCache;
}

/** Test-only: forget the probe. */
export function _resetPerimeterMigrated(): void {
  perimeterMigratedCache = null;
}

/** timestamptz → ISO string, preserving null. Mirrors `service.ts:116`. */
function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

/** timestamptz → ISO string where the column is NOT NULL. */
function isoReq(v: unknown): string {
  return iso(v) ?? '';
}

/* ── The perimeter: rows in, JurisdictionProfile out ─────────────────────────── */

const PROFILE_COLS = `id, jurisdiction, offer_key, service_class, source, source_url,
  entered_by, entered_at, review_by, note, reviewed_by, reviewed_at,
  created_at, updated_at`;

interface ProfileRow {
  id: string;
  jurisdiction: string;
  offer_key: string;
  service_class: string;
  source: string;
  source_url: string | null;
  entered_by: string;
  entered_at: unknown;
  review_by: unknown;
  note: string;
  reviewed_by: string | null;
  reviewed_at: unknown;
  created_at: unknown;
  updated_at: unknown;
}

/**
 * One stored position, in the shape the engine consumes plus the row identity the
 * surface needs.
 *
 * `entry.reviewed` is DERIVED from `reviewed_at IS NOT NULL` (`0050:...`
 * documents why there is no boolean column to flip). `reviewedBy` is carried
 * alongside because "reviewed by whom" is the question that follows "reviewed",
 * and `PerimeterEntry` — a shared, compiled shape — has no field for it.
 */
export interface StoredPerimeterEntry {
  id: string;
  jurisdiction: string;
  offerKey: OfferKey;
  entry: PerimeterEntry;
  reviewedBy: string | null;
  reviewedAt: string | null;
  updatedAt: string;
}

function toStoredEntry(r: ProfileRow): StoredPerimeterEntry {
  const reviewedAt = iso(r.reviewed_at);
  const entry: PerimeterEntry = {
    serviceClass: r.service_class as ServiceClass,
    source: r.source,
    ...(r.source_url ? { sourceUrl: r.source_url } : {}),
    enteredBy: r.entered_by,
    enteredAt: isoReq(r.entered_at),
    reviewBy: isoReq(r.review_by),
    note: r.note,
    // The derivation, in one place. A row nobody reviewed cannot authorise work
    // no matter what else it says (perimeter.ts:666).
    reviewed: reviewedAt !== null,
  };
  return {
    id: r.id,
    jurisdiction: r.jurisdiction,
    offerKey: r.offer_key as OfferKey,
    entry,
    reviewedBy: r.reviewed_by,
    reviewedAt,
    updatedAt: isoReq(r.updated_at),
  };
}

/**
 * Where the perimeter being enforced actually came from. It travels in every
 * response that rests on it, because "the gate refused" means something different
 * when the gate was reading compiled placeholders than when it was reading eleven
 * rows a lawyer signed.
 */
export type PerimeterSource = 'database' | 'compiled_placeholder';

export const PERIMETER_SOURCE_REASON: Record<PerimeterSource, string> = {
  database:
    'Positions entered by named humans in gps_jurisdiction_profile. Each is enforced on its own terms: reviewed or not, current or expired.',
  compiled_placeholder:
    'No human has entered a position. These are the compiled placeholders from packages/shared/src/gps/perimeter.ts, which are expired on arrival and authorise nothing.',
};

export interface LoadedPerimeter {
  source: PerimeterSource;
  sourceReason: string;
  /** Rows a human entered. Empty for `compiled_placeholder`. */
  stored: readonly StoredPerimeterEntry[];
  /** What `gateService` will read. */
  profiles: readonly JurisdictionProfile[];
}

/**
 * Human-readable name for a jurisdiction key.
 *
 * Compiled labels win where they exist (`PERIMETER_PROFILES`), because
 * 'liechtenstein' should read as 'Liechtenstein'. For a key no compiled profile
 * covers, the KEY ITSELF is returned rather than a prettified guess: title-casing
 * an arbitrary human-typed jurisdiction string produces confident-looking output
 * for input nobody has validated, and this is not a surface that should look
 * confident about a jurisdiction it has never heard of.
 */
export function jurisdictionLabel(
  key: string,
  profiles: readonly JurisdictionProfile[] = PERIMETER_PROFILES,
): string {
  return profiles.find((p) => p.jurisdiction === key)?.label
    ?? PERIMETER_PROFILES.find((p) => p.jurisdiction === key)?.label
    ?? key;
}

/** Group stored rows into the `JurisdictionProfile[]` shape the engine takes. */
export function toJurisdictionProfiles(
  stored: readonly StoredPerimeterEntry[],
): readonly JurisdictionProfile[] {
  const byJurisdiction = new Map<string, Partial<Record<OfferKey, PerimeterEntry>>>();
  for (const s of stored) {
    const offers = byJurisdiction.get(s.jurisdiction) ?? {};
    offers[s.offerKey] = s.entry;
    byJurisdiction.set(s.jurisdiction, offers);
  }
  return [...byJurisdiction.entries()].map(([jurisdiction, offers]) => ({
    jurisdiction,
    label: jurisdictionLabel(jurisdiction),
    offers,
  }));
}

/**
 * Load the perimeter the gate will enforce.
 *
 * THE FALLBACK IS NOT A MERGE, AND THAT IS THE LOAD-BEARING CHOICE HERE.
 *
 * When the table holds rows, those rows are the perimeter — full stop. A cell no
 * human has filled in is then `unknown_offer` and the gate refuses it by name. If
 * this function instead merged the compiled placeholders in behind the real rows,
 * that same empty cell would come back as `counsel_required, expired` — a
 * refusal, yes, but a refusal that describes a position nobody took. The surface
 * would show a grid with no holes in it, and the hole is the most important thing
 * on the screen.
 *
 * Compiled placeholders are used ONLY when the table is empty or absent, where
 * they are strictly better than nothing: they are expired on arrival and
 * double-locked (`reviewed:false` AND `reviewBy === enteredAt`, perimeter.ts:190),
 * so every gate still refuses, but the STRUCTURE is exercised and the screen has
 * something to render with an honest badge on it.
 */
export async function loadPerimeter(pool: Pool): Promise<LoadedPerimeter> {
  if (!(await isPerimeterMigrated(pool))) {
    return {
      source: 'compiled_placeholder',
      sourceReason: PERIMETER_SOURCE_REASON.compiled_placeholder,
      stored: [],
      profiles: PERIMETER_PROFILES,
    };
  }
  const res = await pool.query(
    `SELECT ${PROFILE_COLS} FROM gps_jurisdiction_profile
     ORDER BY jurisdiction, offer_key`,
  );
  const stored = (res.rows as ProfileRow[]).map(toStoredEntry);
  if (stored.length === 0) {
    return {
      source: 'compiled_placeholder',
      sourceReason: PERIMETER_SOURCE_REASON.compiled_placeholder,
      stored: [],
      profiles: PERIMETER_PROFILES,
    };
  }
  return {
    source: 'database',
    sourceReason: PERIMETER_SOURCE_REASON.database,
    stored,
    profiles: toJurisdictionProfiles(stored),
  };
}

/* ── The perimeter, as a surface reads it ─────────────────────────────────────── */

/**
 * One cell of the grid: the position, its structural defects, and what the gate
 * says about it BEFORE any engagement asserts counsel or a partner.
 *
 * `unconditional` is deliberately the no-conditions answer. A `counsel_required`
 * cell shows as a refusal here and as `allowed` on an engagement that names its
 * counsel, and both are true — `ServiceGateDecision` documents that `allowed` and
 * `classification.permitted` answer different questions (perimeter.ts:560). The
 * grid's job is to show what the RECORD says; the engagement's job is to show what
 * the record plus the facts of that engagement permit.
 */
export interface PerimeterCell {
  /** Row id when a human entered it; null for a compiled placeholder. */
  id: string | null;
  jurisdiction: string;
  jurisdictionLabel: string;
  offerKey: OfferKey;
  offerName: string;
  entry: PerimeterEntry;
  reviewedBy: string | null;
  reviewedAt: string | null;
  /** `perimeterEntryDefects` — [] for a well-formed row. */
  defects: readonly string[];
  unconditional: ServiceGateDecision;
}

/** A (jurisdiction, offer) pair nobody has classified. The hole, named. */
export interface PerimeterHole {
  jurisdiction: string;
  jurisdictionLabel: string;
  offerKey: OfferKey;
  offerName: string;
  /** The refusal a quote into this cell would receive, with its remedy. */
  refusal: ServiceGateDecision;
}

export interface PerimeterView {
  asOf: string;
  source: PerimeterSource;
  sourceReason: string;
  /** Rows a human entered. Zero is a fact worth showing, not an empty state. */
  storedRowCount: number;
  /** `PERIMETER_REVIEW_WARNING_DAYS` — how early `expiringSoon` starts warning. */
  reviewWarningDays: number;
  /** True while the compiled placeholders are what is being enforced. */
  placeholdersAreUnreviewed: boolean;
  /** The one sentence a surface must show when it renders placeholders. */
  unreviewedReason: string;
  cells: readonly PerimeterCell[];
  holes: readonly PerimeterHole[];
  /** Cells where a review is overdue or due within the warning window. */
  reviewDue: readonly PerimeterCell[];
}

/**
 * Compose the grid. PURE — takes the loaded perimeter and an instant, touches no
 * clock and no pool, so a test can put the instant wherever it needs it.
 *
 * The grid is (jurisdictions present) × (every offer), NOT (rows that exist).
 * Iterating the rows would render a tidy list in which a jurisdiction classified
 * for one offer and silently unclassified for the other four looks complete. The
 * four holes are the finding.
 */
export function perimeterView(loaded: LoadedPerimeter, asOf: string): PerimeterView {
  const cells: PerimeterCell[] = [];
  const holes: PerimeterHole[] = [];

  for (const profile of loaded.profiles) {
    for (const offerKey of OFFER_KEYS) {
      const decision = gateService({
        jurisdiction: profile.jurisdiction,
        offer: offerKey,
        asOf,
        profiles: loaded.profiles,
      });
      const entry = profile.offers[offerKey];
      const offerName = getOffer(offerKey)?.name ?? offerKey;
      if (!entry) {
        holes.push({
          jurisdiction: profile.jurisdiction,
          jurisdictionLabel: profile.label,
          offerKey,
          offerName,
          refusal: decision,
        });
        continue;
      }
      const stored = loaded.stored.find(
        (s) => s.jurisdiction === profile.jurisdiction && s.offerKey === offerKey,
      );
      cells.push({
        id: stored?.id ?? null,
        jurisdiction: profile.jurisdiction,
        jurisdictionLabel: profile.label,
        offerKey,
        offerName,
        entry,
        reviewedBy: stored?.reviewedBy ?? null,
        reviewedAt: stored?.reviewedAt ?? null,
        defects: perimeterEntryDefects(entry),
        unconditional: decision,
      });
    }
  }

  return {
    asOf,
    source: loaded.source,
    sourceReason: loaded.sourceReason,
    storedRowCount: loaded.stored.length,
    reviewWarningDays: PERIMETER_REVIEW_WARNING_DAYS,
    placeholdersAreUnreviewed: loaded.source === 'compiled_placeholder' && PERIMETER_IS_UNREVIEWED,
    unreviewedReason: PERIMETER_UNREVIEWED_REASON,
    cells,
    holes,
    // Derived from the classification the engine already computed — never a
    // second date comparison of our own, which is how two surfaces come to
    // disagree about whether the same row is stale.
    reviewDue: cells.filter(
      (c) => c.unconditional.classification.stale || c.unconditional.classification.expiringSoon,
    ),
  };
}

/* ── Gating a quote against the perimeter ─────────────────────────────────────── */

export interface QuoteGateInput {
  /** Free text as a human typed it (`GpsClient.jurisdiction`). */
  jurisdiction: string | null | undefined;
  offer: OfferKey;
  asOf: string;
  /** The NAME of counsel actually engaged, not a flag. Clears counsel_required. */
  counselEngaged?: string | null;
  /** The id of the named local delivery partner. Clears partner_required. */
  localPartnerId?: string | null;
}

export interface QuoteGateResult {
  asOf: string;
  decision: ServiceGateDecision;
  perimeterSource: PerimeterSource;
  perimeterSourceReason: string;
  storedRowCount: number;
}

/**
 * MAY THIS SERVICE BE QUOTED INTO THIS JURISDICTION?
 *
 * A thin, deliberate wrapper: load, gate, and report which perimeter answered.
 * All the judgement is in `gateService`, which has no override parameter and
 * cannot be talked round — no argument this function could pass would clear a
 * prohibition, and a source-text ratchet in `perimeter.test.ts` asserts that the
 * words `force`, `override`, `bypass`, `acceptRisk`, `founderApproved`,
 * `skipPerimeter`, `ignoreStale` and `assumePermitted` appear nowhere in it.
 *
 * Nothing is written. A gate result is a reading of the record, not an event, and
 * persisting one would create a second place where "the perimeter said yes" lives
 * — one that would not notice when the underlying position expired the next day.
 */
export async function gateQuote(pool: Pool, input: QuoteGateInput): Promise<QuoteGateResult> {
  const loaded = await loadPerimeter(pool);
  return {
    asOf: input.asOf,
    decision: gateService({
      jurisdiction: input.jurisdiction,
      offer: input.offer,
      asOf: input.asOf,
      counselEngaged: input.counselEngaged ?? null,
      localPartnerId: input.localPartnerId ?? null,
      profiles: loaded.profiles,
    }),
    perimeterSource: loaded.source,
    perimeterSourceReason: loaded.sourceReason,
    storedRowCount: loaded.stored.length,
  };
}

/* ── Human entry, and the review that is a separate act ──────────────────────── */

export interface EnterPositionInput {
  /** Free text; normalised to the lookup key before it is stored. */
  jurisdiction: string;
  offerKey: OfferKey;
  serviceClass: ServiceClass;
  /** What the position rests on, in the entering human's words. Required. */
  source: string;
  sourceUrl?: string | null;
  note: string;
  /** The EXPIRY, as an ISO instant. Validated at the route. */
  reviewBy: string;
  /**
   * The desk member who TYPED it, from the session — never a body field.
   *
   * Note what this is not: it is not a claim that this person is qualified to
   * determine the position. The qualified source goes in `source` ("Opinion of
   * <firm>, <date>", "Memo from LCX legal, <date>"), because that is a citation,
   * while `entered_by` is accountability for having transcribed it faithfully.
   * Conflating the two would let a desk member's name stand in for a lawyer's.
   */
  enteredBy: string;
  /**
   * Replace an existing position for this cell. Explicit, because a policy row
   * that can be overwritten by a retry is a policy row with no history at all.
   */
  supersede?: boolean;
}

export type EnterPositionResult =
  | { ok: true; position: StoredPerimeterEntry; superseded: boolean }
  | { ok: false; reason: 'already_recorded'; existing: StoredPerimeterEntry };

/**
 * Record a jurisdictional position.
 *
 * IT ARRIVES UNREVIEWED, ALWAYS. `reviewed_by`/`reviewed_at` are not writable
 * here and there is no parameter for them, so a freshly entered position refuses
 * in `gateService` with `perimeter_unreviewed` until a second human reviews it.
 * Self-review through a single request is therefore not a matter of policy, it is
 * unrepresentable.
 *
 * SUPERSEDING RESETS THE REVIEW. Overwriting the class, the source or the note and
 * keeping the old review would carry a reviewer's name onto words they never read.
 * The `UPDATE` below nulls both review columns for exactly that reason, so a
 * superseded cell goes back to refusing until it is reviewed again.
 */
export async function enterPosition(
  pool: Pool,
  input: EnterPositionInput,
): Promise<EnterPositionResult> {
  const jurisdiction = normaliseJurisdiction(input.jurisdiction);
  const existingRes = await pool.query(
    `SELECT ${PROFILE_COLS} FROM gps_jurisdiction_profile
     WHERE jurisdiction = $1 AND offer_key = $2`,
    [jurisdiction, input.offerKey],
  );
  const existing = (existingRes.rows as ProfileRow[])[0];
  if (existing && input.supersede !== true) {
    return { ok: false, reason: 'already_recorded', existing: toStoredEntry(existing) };
  }

  const params = [
    jurisdiction, input.offerKey, input.serviceClass, input.source,
    input.sourceUrl ?? null, input.enteredBy, input.reviewBy, input.note,
  ];
  const res = existing
    ? await pool.query(
        `UPDATE gps_jurisdiction_profile
            SET service_class = $3, source = $4, source_url = $5,
                entered_by = $6, entered_at = now(), review_by = $7, note = $8,
                reviewed_by = NULL, reviewed_at = NULL, updated_at = now()
          WHERE jurisdiction = $1 AND offer_key = $2
        RETURNING ${PROFILE_COLS}`,
        params,
      )
    : await pool.query(
        `INSERT INTO gps_jurisdiction_profile
           (jurisdiction, offer_key, service_class, source, source_url,
            entered_by, review_by, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${PROFILE_COLS}`,
        params,
      );
  return {
    ok: true,
    position: toStoredEntry(res.rows[0] as ProfileRow),
    superseded: Boolean(existing),
  };
}

export type ReviewPositionResult =
  | { ok: true; position: StoredPerimeterEntry }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'self_review'; enteredBy: string };

/**
 * Review a position — the act that makes it capable of authorising anything.
 *
 * FOUR-EYES, ENFORCED: a position may not be reviewed by the person who entered
 * it. Without this, "reviewed" would mean "typed twice by one person", and the
 * whole distinction between an entry and a review would be theatre — the failure
 * mode D8 exists to prevent ("if a surface says verified, something verified it").
 *
 * THE COST IS REAL AND ACCEPTED. Only monty and nik hold `approve`
 * (`0047_gps.sql:327`), so the two of them must both act to open a cell, and
 * nothing at all can be opened by one person. For the record that decides whether
 * a regulated exchange's employee may sell a service into a jurisdiction, a
 * bottleneck of two named people is the correct trade — the same trade
 * `routes/gps.ts:431` already made for the conflict check.
 *
 * `reviewBy` is optional and extends the expiry: re-reviewing without moving the
 * date is legitimate (it records that someone looked), and it leaves the position
 * stale, which is honest.
 */
export async function reviewPosition(
  pool: Pool,
  id: string,
  reviewedBy: string,
  opts: { reviewBy?: string | null } = {},
): Promise<ReviewPositionResult> {
  const found = await pool.query(
    `SELECT ${PROFILE_COLS} FROM gps_jurisdiction_profile WHERE id = $1`,
    [id],
  );
  const row = (found.rows as ProfileRow[])[0];
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.entered_by === reviewedBy) {
    return { ok: false, reason: 'self_review', enteredBy: row.entered_by };
  }
  const res = await pool.query(
    `UPDATE gps_jurisdiction_profile
        SET reviewed_by = $2, reviewed_at = now(),
            review_by = COALESCE($3::timestamptz, review_by),
            updated_at = now()
      WHERE id = $1
    RETURNING ${PROFILE_COLS}`,
    [id, reviewedBy, opts.reviewBy ?? null],
  );
  return { ok: true, position: toStoredEntry(res.rows[0] as ProfileRow) };
}

/* ── Disclosure records: the VERSION that was actually given ──────────────────── */

const DISCLOSURE_COLS = `id, client_id, engagement_id, template_id, template_version,
  library_version, text_used, unreviewed, lcx_adjacent, decided_by, decided_at`;

interface DisclosureRow {
  id: string;
  client_id: string;
  engagement_id: string;
  template_id: string;
  template_version: number | string;
  library_version: number | string;
  text_used: string;
  unreviewed: boolean;
  lcx_adjacent: boolean;
  decided_by: string;
  decided_at: unknown;
}

/**
 * A disclosure as stored. `record` is exactly the shape `disclosureRecord()`
 * produces (disclosure.ts:521) — embedded, not re-declared, so a field added
 * there is a typecheck failure here rather than a field a surface never sees.
 */
export interface StoredDisclosure {
  id: string;
  clientId: string;
  engagementId: string;
  record: DisclosureUseRecord;
  decidedBy: string;
  decidedAt: string;
  lcxAdjacent: boolean;
  /** The compiled version of this template today; null if it no longer exists. */
  currentVersion: number | null;
  /** True when the library has moved past the version this client was given. */
  superseded: boolean;
}

function toStoredDisclosure(r: DisclosureRow): StoredDisclosure {
  const version = Number(r.template_version);
  const template = getDisclosureTemplate(r.template_id);
  const decidedAt = isoReq(r.decided_at);
  return {
    id: r.id,
    clientId: r.client_id,
    engagementId: r.engagement_id,
    record: {
      templateId: r.template_id as DisclosureId,
      version,
      text: r.text_used,
      libraryVersion: Number(r.library_version),
      // The instant the words were produced. Equal to `decided_at` by
      // construction: `recordDisclosure` renders with the same instant it
      // stores, so the date INSIDE the text and the date on the row can never
      // disagree (see the INSERT below).
      renderedAt: decidedAt,
      unreviewed: r.unreviewed,
    },
    decidedBy: r.decided_by,
    decidedAt,
    lcxAdjacent: r.lcx_adjacent,
    currentVersion: template?.version ?? null,
    superseded: template ? template.version > version : false,
  };
}

/** Every disclosure recorded for these engagements, newest first. */
export async function listDisclosureRecords(
  pool: Pool,
  engagementIds: readonly string[],
): Promise<StoredDisclosure[]> {
  if (engagementIds.length === 0) return [];
  const res = await pool.query(
    `SELECT ${DISCLOSURE_COLS} FROM gps_disclosure_record
      WHERE engagement_id = ANY($1::uuid[])
      ORDER BY decided_at DESC`,
    [engagementIds],
  );
  return (res.rows as DisclosureRow[]).map(toStoredDisclosure);
}

/* ── The subject of the wall: one engagement, joined to what defends it ──────── */

const SUBJECT_COLS = `e.id AS engagement_id, e.client_id, e.offer_key, e.contracting_entity,
  e.status, e.price_cents, e.currency, e.owner,
  c.name AS client_name, c.jurisdiction AS client_jurisdiction,
  k.id AS check_id, k.check_performed, k.decision, k.decided_by AS check_decided_by,
  k.disclosure_text_used, k.decided_at AS check_decided_at`;

interface SubjectRow {
  engagement_id: string;
  client_id: string;
  offer_key: string;
  contracting_entity: string;
  status: string;
  price_cents: unknown;
  currency: string;
  owner: string | null;
  client_name: string;
  client_jurisdiction: string | null;
  check_id: string | null;
  check_performed: string | null;
  decision: string | null;
  check_decided_by: string | null;
  disclosure_text_used: string | null;
  check_decided_at: unknown;
}

/**
 * `bigint` arrives from node-postgres as a STRING (`service.ts:109` explains what
 * that costs if it is read raw). The wall shows price only to say what is exposed,
 * and it must still be a number.
 */
function cents(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * The wall's subject. Not a response shape on its own — it is the raw material
 * `wallRow` turns into one.
 */
export interface WallSubject {
  engagementId: string;
  clientId: string;
  clientName: string;
  clientJurisdiction: string | null;
  offerKey: OfferKey;
  offerName: string;
  contractingEntity: ContractingEntity;
  status: EngagementStatus;
  owner: string | null;
  priceCents: number;
  currency: string;
  check: GpsConflictCheck | null;
}

function toSubject(r: SubjectRow): WallSubject {
  return {
    engagementId: r.engagement_id,
    clientId: r.client_id,
    clientName: r.client_name,
    clientJurisdiction: r.client_jurisdiction,
    offerKey: r.offer_key as OfferKey,
    offerName: getOffer(r.offer_key as OfferKey)?.name ?? r.offer_key,
    contractingEntity: r.contracting_entity as ContractingEntity,
    status: r.status as EngagementStatus,
    owner: r.owner,
    priceCents: cents(r.price_cents),
    currency: r.currency,
    check: toCheck(r),
  };
}

function toCheck(r: SubjectRow): GpsConflictCheck | null {
  if (!r.check_id) return null;
  return {
    id: r.check_id,
    clientId: r.client_id,
    engagementId: r.engagement_id,
    checkPerformed: r.check_performed ?? '',
    decision: r.decision as ConflictDecision,
    decidedBy: r.check_decided_by ?? '',
    disclosureTextUsed: r.disclosure_text_used,
    decidedAt: isoReq(r.check_decided_at),
  };
}

const SUBJECT_FROM = `FROM gps_engagement e
  JOIN gps_client c ON c.id = e.client_id
  LEFT JOIN gps_conflict_check k ON k.engagement_id = e.id`;

/** One engagement, with its client and its conflict check. Null when unknown. */
export async function loadSubject(pool: Pool, engagementId: string): Promise<WallSubject | null> {
  const res = await pool.query(
    `SELECT ${SUBJECT_COLS} ${SUBJECT_FROM} WHERE e.id = $1`,
    [engagementId],
  );
  const row = (res.rows as SubjectRow[])[0];
  return row ? toSubject(row) : null;
}

/* ── The disclosure context, and the one assumption it makes out loud ─────────── */

/**
 * Build the context every disclosure is rendered from.
 *
 * TWO FIELDS ARE DERIVED RATHER THAN ASSERTED, and both derivations are the
 * point of the file:
 *
 *  `conflictDecision` is `'unresolved'` when no check exists — the shared type
 *  offers that value precisely so a missing check can never be conflated with a
 *  clearance (disclosure.ts:123). Defaulting it to `'cleared'` would make the
 *  wall's worst row look like its best one.
 *
 *  `perimeterUnreviewed` is `classification.status !== 'ok'`, i.e. the engine did
 *  not find a reviewed, current, well-formed position. Note it is NOT
 *  `!decision.allowed`: a REVIEWED position of `prohibited` refuses the quote
 *  while the jurisdictional position is very much established, and telling that
 *  client "no position is on record" would be false.
 *
 * ADJACENCY WHEN NOBODY HAS SAID. `lcxAdjacent` null means no human has ever
 * asserted it for this engagement. The context then uses `true`, which is the
 * direction that requires MORE disclosure (disclosure.ts:216) — and every shape
 * carrying this context also carries `lcxAdjacentAssumed` so the surface can say
 * so. Erring toward disclosure is recoverable; erring away from it means a client
 * was not told something they were owed.
 */
export function disclosureContextFor(
  subject: WallSubject,
  perimeter: ServiceGateDecision,
  lcxAdjacent: boolean | null,
  asOf: string,
): DisclosureContext {
  return {
    clientName: subject.clientName,
    offerKey: subject.offerKey,
    contractingEntity: subject.contractingEntity,
    asOf,
    jurisdiction: subject.clientJurisdiction,
    conflictDecision: subject.check?.decision ?? 'unresolved',
    lcxAdjacent: lcxAdjacent ?? true,
    perimeterUnreviewed: perimeter.classification.status !== 'ok',
  };
}

/* ── The wall ─────────────────────────────────────────────────────────────────── */

/** `'missing'` is not a ConflictDecision, and that separation is deliberate. */
export type ConflictPosition = ConflictDecision | 'missing';

/**
 * One required disclosure, and whether it was given.
 *
 * `renderError` exists because a requirement can be impossible to satisfy as
 * recorded: `gps-perimeter-unestablished` names the jurisdiction, so a client
 * with no jurisdiction on file cannot be given it (`renderDisclosure` refuses with
 * `missing_field` rather than emitting a blank). The wall shows the requirement
 * WITH the reason it cannot be produced — a requirement silently dropped because
 * the render failed would be the same defect as a silently gated target.
 */
export interface DisclosureRequirement {
  templateId: DisclosureId;
  title: string;
  appliesWhenLabel: string;
  currentVersion: number;
  recorded: boolean;
  recordedVersion: number | null;
  recordedAt: string | null;
  recordedBy: string | null;
  /** Recorded at a version the library has since moved past. */
  superseded: boolean;
  renderError: string | null;
  renderErrorCode: string | null;
}

export interface ConflictWallRow {
  engagementId: string;
  clientId: string;
  clientName: string;
  /** Free text as a human typed it. Never validated, never inferred from. */
  clientJurisdiction: string | null;
  offerKey: OfferKey;
  offerName: string;
  contractingEntity: ContractingEntity;
  status: EngagementStatus;
  owner: string | null;
  priceCents: number;
  currency: string;
  position: ConflictPosition;
  check: GpsConflictCheck | null;
  /** At or past `proposed`: a client has seen something. */
  clientFacing: boolean;
  /** Missing position on a client-facing engagement. The red row. */
  blocking: boolean;
  /**
   * The perimeter's answer for this engagement's jurisdiction and offer, with NO
   * conditions asserted — `decision.conditionsAsserted` says so explicitly. There
   * is no column anywhere recording which counsel or which local partner an
   * engagement engaged, so a `counsel_not_engaged` refusal here means "not
   * recorded", which is exactly what the wall should say about an unrecorded fact.
   */
  perimeter: ServiceGateDecision;
  disclosures: readonly StoredDisclosure[];
  requirements: readonly DisclosureRequirement[];
  missingDisclosureIds: readonly DisclosureId[];
  supersededDisclosureIds: readonly DisclosureId[];
  /** Recorded although the template does not currently apply. Reported, not hidden. */
  notRequiredButRecorded: readonly DisclosureId[];
  /**
   * Does the verbatim text stored on the 0047 conflict check
   * (`disclosure_text_used`) match one of the versioned records in 0050? Null when
   * the check carries no text.
   *
   * FALSE IS A FINDING, and it is the finding this pairing exists to produce: a
   * client was given wording that is not any version of the compiled policy. The
   * two columns are written by two different routes at two different moments (the
   * conflict check at decision time, `routes/gps.ts:439`; the record at issue
   * time), and comparing them is the only way that divergence ever gets noticed.
   * Exact comparison on purpose — "verbatim" means verbatim, and a normalised
   * match would hide an edited sentence.
   */
  checkTextMatchesRecord: boolean | null;
  /** Null when no human ever asserted it. */
  lcxAdjacent: boolean | null;
  /** True when adjacency was assumed `true` because nobody has asserted it. */
  lcxAdjacentAssumed: boolean;
  /** D1: the exact inputs the requirement set was derived from. */
  context: DisclosureContext;
}

export interface ConflictWallCounts {
  total: number;
  cleared: number;
  clearedWithDisclosure: number;
  declined: number;
  missing: number;
  blocking: number;
  disclosureGap: number;
  perimeterRefused: number;
  adjacencyUnasserted: number;
}

export interface ConflictWall {
  asOf: string;
  /** 0047. False means the compartment has no tables yet, so `rows` is empty. */
  migrated: boolean;
  /** 0050. False means no disclosure record can exist yet, so every one is missing. */
  perimeterMigrated: boolean;
  perimeterSource: PerimeterSource;
  perimeterSourceReason: string;
  library: DisclosureLibrarySnapshot;
  disclosuresAreUnreviewed: boolean;
  rows: readonly ConflictWallRow[];
  /**
   * Derived from the UNFILTERED set, so a filtered view cannot make the desk think
   * the gap is smaller than it is. Every field is recomputable from `rows` when no
   * filter is applied — GPS has shipped a count computed from nothing before
   * (plan §1 D8) and the fix is publishing the inputs, not being careful.
   */
  counts: ConflictWallCounts;
  filterApplied: boolean;
}

export interface WallFilter {
  clientId?: string;
  status?: EngagementStatus;
  position?: ConflictPosition;
  limit?: number;
}

/**
 * Compose one row. Pure: everything it needs has already been read.
 */
export function wallRow(
  subject: WallSubject,
  perimeter: ServiceGateDecision,
  recorded: readonly StoredDisclosure[],
  asOf: string,
  clientFacingStatuses: readonly EngagementStatus[],
): ConflictWallRow {
  // The latest assertion wins, and `recorded` arrives newest-first.
  const asserted = recorded.length > 0 ? recorded[0].lcxAdjacent : null;
  const context = disclosureContextFor(subject, perimeter, asserted, asOf);
  const required = requiredDisclosures(context);
  const requiredIds = new Set<string>(required.map((t) => t.id));

  const requirements: DisclosureRequirement[] = required.map((t) => {
    const hit = recorded.find((d) => d.record.templateId === t.id) ?? null;
    let renderError: string | null = null;
    let renderErrorCode: string | null = null;
    try {
      // Rendered and DISCARDED: this asks "could this disclosure be produced for
      // this engagement", which is a different question from "what does it say",
      // and the wall stays dense (D5) by not carrying four texts per row. The
      // single-engagement read returns the words.
      renderDisclosure(t.id, context);
    } catch (err) {
      const e = err as { message?: string; code?: string };
      renderError = e.message ?? 'render failed';
      renderErrorCode = e.code ?? 'unknown';
    }
    return {
      templateId: t.id,
      title: t.title,
      appliesWhenLabel: t.appliesWhenLabel,
      currentVersion: t.version,
      recorded: hit !== null,
      recordedVersion: hit?.record.version ?? null,
      recordedAt: hit?.decidedAt ?? null,
      recordedBy: hit?.decidedBy ?? null,
      superseded: hit?.superseded ?? false,
      renderError,
      renderErrorCode,
    };
  });

  const position: ConflictPosition = subject.check?.decision ?? 'missing';
  const clientFacing = clientFacingStatuses.includes(subject.status);

  return {
    ...subject,
    position,
    clientFacing,
    blocking: position === 'missing' && clientFacing,
    perimeter,
    disclosures: recorded,
    requirements,
    // `missingDisclosures` from the engine rather than a second filter of our own,
    // so the wall's gap and the engine's gap cannot drift apart.
    missingDisclosureIds: missingDisclosures(
      context,
      recorded.map((d) => d.record.templateId),
    ).map((t) => t.id),
    supersededDisclosureIds: recorded.filter((d) => d.superseded).map((d) => d.record.templateId),
    notRequiredButRecorded: recorded
      .filter((d) => !requiredIds.has(d.record.templateId))
      .map((d) => d.record.templateId),
    checkTextMatchesRecord: subject.check?.disclosureTextUsed
      ? recorded.some((d) => d.record.text === subject.check?.disclosureTextUsed)
      : null,
    lcxAdjacent: asserted,
    lcxAdjacentAssumed: asserted === null,
    context,
  };
}

function countWall(rows: readonly ConflictWallRow[]): ConflictWallCounts {
  return {
    total: rows.length,
    cleared: rows.filter((r) => r.position === 'cleared').length,
    clearedWithDisclosure: rows.filter((r) => r.position === 'cleared_with_disclosure').length,
    declined: rows.filter((r) => r.position === 'declined').length,
    missing: rows.filter((r) => r.position === 'missing').length,
    blocking: rows.filter((r) => r.blocking).length,
    disclosureGap: rows.filter((r) => r.missingDisclosureIds.length > 0).length,
    perimeterRefused: rows.filter((r) => !r.perimeter.allowed).length,
    adjacencyUnasserted: rows.filter((r) => r.lcxAdjacentAssumed).length,
  };
}

/** The wall before 0047 exists. Shaped, empty, and honest about why. */
export function emptyWall(asOf: string): ConflictWall {
  return {
    asOf,
    migrated: false,
    perimeterMigrated: false,
    perimeterSource: 'compiled_placeholder',
    perimeterSourceReason: PERIMETER_SOURCE_REASON.compiled_placeholder,
    library: getDisclosureLibrarySnapshot(),
    disclosuresAreUnreviewed: DISCLOSURES_ARE_NOT_COUNSEL_REVIEWED,
    rows: [],
    counts: countWall([]),
    filterApplied: false,
  };
}

/**
 * THE WALL. Every engagement's conflict position, in one read.
 *
 * The filter is applied AFTER the counts are taken, so narrowing the view to the
 * missing rows cannot make the total look smaller than it is. `position` is a
 * derived value and cannot be pushed into SQL without duplicating the derivation
 * in a second language, which is how two answers to one question get shipped.
 */
export async function conflictWall(
  pool: Pool,
  asOf: string,
  filter: WallFilter = {},
): Promise<ConflictWall> {
  const loaded = await loadPerimeter(pool);
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 500);

  // Fixed SQL fragments, bound values only — the standing rule of this
  // compartment (`service.ts:21`). There is no `sort` parameter for the same
  // reason: an ORDER BY assembled from caller text is a caller-supplied string in
  // the SQL text.
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.clientId) {
    params.push(filter.clientId);
    where.push(`e.client_id = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    where.push(`e.status = $${params.length}`);
  }
  params.push(limit);
  const res = await pool.query(
    `SELECT ${SUBJECT_COLS} ${SUBJECT_FROM}
     ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY e.updated_at DESC LIMIT $${params.length}`,
    params,
  );
  const subjects = (res.rows as SubjectRow[]).map(toSubject);

  const perimeterMigrated = await isPerimeterMigrated(pool);
  const records = perimeterMigrated
    ? await listDisclosureRecords(pool, subjects.map((s) => s.engagementId))
    : [];

  const all = subjects.map((s) =>
    wallRow(
      s,
      gateService({
        jurisdiction: s.clientJurisdiction,
        offer: s.offerKey,
        asOf,
        profiles: loaded.profiles,
      }),
      records.filter((d) => d.engagementId === s.engagementId),
      asOf,
      // Reused rather than re-derived: `REQUIRES_CONFLICT_CLEARANCE`
      // (`service.ts:760`) is the set the DATABASE path already refuses to enter
      // without a check. If the wall computed its own idea of "client-facing",
      // the screen and the gate could disagree about which rows are dangerous.
      REQUIRES_CONFLICT_CLEARANCE,
    ),
  );

  const rows = filter.position ? all.filter((r) => r.position === filter.position) : all;
  return {
    asOf,
    migrated: true,
    perimeterMigrated,
    perimeterSource: loaded.source,
    perimeterSourceReason: loaded.sourceReason,
    library: getDisclosureLibrarySnapshot(),
    disclosuresAreUnreviewed: DISCLOSURES_ARE_NOT_COUNSEL_REVIEWED,
    rows,
    counts: countWall(all),
    filterApplied: Boolean(filter.position ?? filter.clientId ?? filter.status),
  };
}

/* ── One engagement: the words, before and after they are issued ─────────────── */

/**
 * A disclosure as it WOULD be issued. Produced by a read, and a read issues
 * nothing: `recorded` says whether this text has actually been given, and the two
 * must never be confused on a screen.
 */
export interface DisclosureDraft {
  templateId: DisclosureId;
  title: string;
  appliesWhenLabel: string;
  version: number;
  applies: boolean;
  /** Null when it cannot be rendered for this engagement — `error` says why. */
  text: string | null;
  unreviewed: boolean;
  error: string | null;
  errorCode: string | null;
  recorded: boolean;
  recordedVersion: number | null;
  superseded: boolean;
}

export interface EngagementDisclosureView {
  asOf: string;
  subject: WallSubject;
  perimeter: ServiceGateDecision;
  perimeterSource: PerimeterSource;
  perimeterMigrated: boolean;
  library: DisclosureLibrarySnapshot;
  libraryVersion: number;
  disclosuresAreUnreviewed: boolean;
  context: DisclosureContext;
  lcxAdjacent: boolean | null;
  lcxAdjacentAssumed: boolean;
  recorded: readonly StoredDisclosure[];
  /** Every template that applies, with its words or its refusal. */
  drafts: readonly DisclosureDraft[];
  missingDisclosureIds: readonly DisclosureId[];
}

function draftFor(
  templateId: DisclosureId,
  title: string,
  appliesWhenLabel: string,
  version: number,
  context: DisclosureContext,
  recorded: readonly StoredDisclosure[],
): DisclosureDraft {
  const hit = recorded.find((d) => d.record.templateId === templateId) ?? null;
  let rendered: RenderedDisclosure | null = null;
  let error: string | null = null;
  let errorCode: string | null = null;
  try {
    rendered = renderDisclosure(templateId, context);
  } catch (err) {
    const e = err as { message?: string; code?: string };
    error = e.message ?? 'render failed';
    errorCode = e.code ?? 'unknown';
  }
  return {
    templateId,
    title,
    appliesWhenLabel,
    version,
    applies: rendered?.applies ?? true,
    text: rendered?.text ?? null,
    unreviewed: rendered?.unreviewed ?? DISCLOSURES_ARE_NOT_COUNSEL_REVIEWED,
    error,
    errorCode,
    recorded: hit !== null,
    recordedVersion: hit?.record.version ?? null,
    superseded: hit?.superseded ?? false,
  };
}

/** One engagement's disclosure position, with the exact wording on both sides. */
export async function engagementDisclosureView(
  pool: Pool,
  engagementId: string,
  asOf: string,
): Promise<EngagementDisclosureView | null> {
  const subject = await loadSubject(pool, engagementId);
  if (!subject) return null;

  const loaded = await loadPerimeter(pool);
  const perimeter = gateService({
    jurisdiction: subject.clientJurisdiction,
    offer: subject.offerKey,
    asOf,
    profiles: loaded.profiles,
  });
  const perimeterMigrated = await isPerimeterMigrated(pool);
  const recorded = perimeterMigrated ? await listDisclosureRecords(pool, [engagementId]) : [];
  const asserted = recorded.length > 0 ? recorded[0].lcxAdjacent : null;
  const context = disclosureContextFor(subject, perimeter, asserted, asOf);

  return {
    asOf,
    subject,
    perimeter,
    perimeterSource: loaded.source,
    perimeterMigrated,
    library: getDisclosureLibrarySnapshot(),
    libraryVersion: DISCLOSURE_LIBRARY_VERSION,
    disclosuresAreUnreviewed: DISCLOSURES_ARE_NOT_COUNSEL_REVIEWED,
    context,
    lcxAdjacent: asserted,
    lcxAdjacentAssumed: asserted === null,
    recorded,
    drafts: requiredDisclosures(context).map((t) =>
      draftFor(t.id, t.title, t.appliesWhenLabel, t.version, context, recorded),
    ),
    missingDisclosureIds: missingDisclosures(
      context,
      recorded.map((d) => d.record.templateId),
    ).map((t) => t.id),
  };
}

/* ── Issuing a disclosure ─────────────────────────────────────────────────────── */

export interface RecordDisclosureInput {
  engagementId: string;
  templateId: string;
  /**
   * Optional version pin. Supplying a version that is not the compiled one is
   * REFUSED (`version_mismatch`) rather than served — the library holds only
   * current wording, and returning newer words under an older number is the
   * failure this whole table exists to prevent. Omit it when issuing.
   */
  version?: number;
  /** Asserted by the human, never inferred. See `lcx_adjacent` in 0050. */
  lcxAdjacent: boolean;
  /** `c.get('operator').id`. Never a body field. */
  decidedBy: string;
  asOf: string;
}

export type RecordDisclosureResult =
  | { ok: true; stored: StoredDisclosure; rendered: RenderedDisclosure; context: DisclosureContext }
  | { ok: false; reason: 'engagement_not_found' }
  | { ok: false; reason: 'already_recorded'; existing: StoredDisclosure };

/**
 * Record that a disclosure was given — WITH ITS VERSION.
 *
 * THE WORDS COME FROM THE LIBRARY, NEVER FROM THE CALLER. There is no text
 * parameter on this function and no route reads one. `renderDisclosure` produces
 * the wording from the compiled template and the context, and what is stored is
 * what it produced. A caller-supplied text field would mean the compiled,
 * reviewed policy was a suggestion.
 *
 * IT DELIBERATELY DOES NOT CATCH `DisclosureError`. Unknown template, wrong
 * version pin, unknown offer, a blank required field, a surviving `{{placeholder}}`
 * — every one of those is a refusal with a code, and swallowing it here would
 * either store a broken disclosure or return a success that recorded nothing. The
 * route translates the code to a status (D2: the reason reaches the screen).
 *
 * ONE INSTANT FOR BOTH THE TEXT AND THE ROW. `decided_at` is bound to the same
 * `asOf` the text was rendered from rather than defaulting to `now()`, so the date
 * printed inside the disclosure and the date on the record can never disagree —
 * and `DisclosureUseRecord.renderedAt` can therefore be read back from
 * `decided_at` without inventing a second timestamp.
 */
export async function recordDisclosure(
  pool: Pool,
  input: RecordDisclosureInput,
): Promise<RecordDisclosureResult> {
  const subject = await loadSubject(pool, input.engagementId);
  if (!subject) return { ok: false, reason: 'engagement_not_found' };

  const loaded = await loadPerimeter(pool);
  const perimeter = gateService({
    jurisdiction: subject.clientJurisdiction,
    offer: subject.offerKey,
    asOf: input.asOf,
    profiles: loaded.profiles,
  });
  const context = disclosureContextFor(subject, perimeter, input.lcxAdjacent, input.asOf);
  const rendered = renderDisclosure(
    input.templateId,
    context,
    input.version === undefined ? {} : { version: input.version },
  );
  const rec = disclosureRecord(rendered);

  const values = [
    subject.clientId, subject.engagementId, rec.templateId, rec.version,
    rec.libraryVersion, rec.text, rec.unreviewed, input.lcxAdjacent,
    input.decidedBy, rec.renderedAt,
  ];
  const res = await pool.query(
    `INSERT INTO gps_disclosure_record
       (client_id, engagement_id, template_id, template_version, library_version,
        text_used, unreviewed, lcx_adjacent, decided_by, decided_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (engagement_id, template_id, template_version) DO NOTHING
     RETURNING ${DISCLOSURE_COLS}`,
    values,
  );
  const row = (res.rows as DisclosureRow[])[0];
  if (!row) {
    // DO NOTHING fired: this engagement already holds this template at this
    // version. Not an upsert, because the row is append-only at the database
    // level (0050's trigger) and because overwriting would rewrite what a client
    // was told. The existing row is returned so the caller can show it.
    const existing = await pool.query(
      `SELECT ${DISCLOSURE_COLS} FROM gps_disclosure_record
        WHERE engagement_id = $1 AND template_id = $2 AND template_version = $3`,
      [subject.engagementId, rec.templateId, rec.version],
    );
    return {
      ok: false,
      reason: 'already_recorded',
      existing: toStoredDisclosure((existing.rows as DisclosureRow[])[0]),
    };
  }
  return { ok: true, stored: toStoredDisclosure(row), rendered, context };
}

/* ── The standing limits, recorded once and cited everywhere ─────────────────── */

export interface StandingLimit {
  key: ProhibitedPromise;
  label: string;
  /** The exact sentence. The standing statement's text is composed from these. */
  sentence: string;
}

/**
 * The four things GPS may never promise (plan §5, 9.4).
 *
 * Surfaced as data because the wall must be able to show them beside the
 * statement, and because `STANDING_STATEMENT_TEXT` is *composed* from these same
 * sentences (disclosure.ts:190) — so what a client is handed and what the desk
 * reads on screen are the same words by construction, not by two people
 * remembering to update both.
 */
export function standingLimits(): readonly StandingLimit[] {
  return PROHIBITED_PROMISES.map((key) => ({
    key,
    label: PROHIBITED_PROMISE_LABEL[key],
    sentence: PROHIBITED_PROMISE_SENTENCE[key],
  }));
}

/* ── Second-tier sessions: who came in on the shared passcode ─────────────────── */

export interface SecondTierView {
  asOf: string;
  /** True when SECONDARY_PASSCODE is set, i.e. the second door exists at all. */
  configured: boolean;
  usage: readonly SecondTierUse[];
  /** Addresses NOT on the roster. This is the number that says rotate. */
  unexpected: readonly SecondTierUse[];
  rosterEmailCount: number;
  rotateAdvised: boolean;
  /** The honest limits of this view, carried so a surface cannot overstate it. */
  limits: readonly string[];
}

/**
 * SURFACE THE SECOND DOOR (plan §5, 9.5).
 *
 * `lib/secondTier.ts` has recorded every second-tier sign-in since the credential
 * shipped and nothing has ever shown it. A shared secret you cannot observe is
 * worse than one you can, and this compartment is the one that holds a third
 * party's confidential terms — so the observation belongs on the conflict wall,
 * next to the other question about who did what.
 *
 * WHAT THIS CANNOT DO, carried in `limits` rather than left to a reader's
 * optimism: the store is in-memory (`secondTier.ts:22`), so a restart forgets who
 * signed in; and no amount of logging makes a shared passcode attributable — the
 * record names the credential, not the human.
 */
export function secondTierView(asOf: string): SecondTierView {
  const roster = TEAM.map((m) => m.email);
  const unexpected = secondTierUnexpected(roster);
  return {
    asOf,
    configured: Boolean(env.secondaryPasscode),
    usage: secondTierUsage(),
    unexpected,
    rosterEmailCount: roster.length,
    // Not "advised if many". One non-roster address is the signal: a passcode
    // leaks by spreading, and spreading looks exactly like this.
    rotateAdvised: unexpected.length > 0,
    limits: [
      'In-memory only. The API restarting forgets every session recorded here (lib/secondTier.ts:22) — an empty list is not evidence that nobody signed in.',
      'A shared passcode is unattributable. These rows name an address that was typed, not a person who was authenticated; nothing verified control of the mailbox.',
      'Second tier is never approver (middleware/auth.ts:94), so nothing listed here could record a conflict decision or a disclosure.',
      'Rotation is the only revocation. SECONDARY_PASSCODE must be rotated when anyone leaves; the departed-member list only stops the lazy attempt.',
    ],
  };
}
