import {
  useCallback, useEffect, useMemo, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject,
} from 'react';
import { clsx } from 'clsx';
import {
  ENGAGEMENT_STATUS_LABELS, ENGAGEMENT_STATUSES, OFFER_KEYS, getOffer,
  type ConflictDecision, type EngagementStatus, type GpsClient,
  type GpsConflictCheck, type OfferKey,
} from '@lcx/shared';
import { Button } from '@/components/ui';
import { PrintStyles } from '@/components/report/PrintStyles';
import { PerimeterReviewPanel } from '@/components/gps/PerimeterReviewPanel';
import {
  fetchGpsClients, fetchGpsEngagements, fetchGpsSummary,
  type GpsEngagementRow, type GpsSummary,
} from '@/lib/api/gps';
import {
  SECOND_TIER_ENDPOINT, fetchGpsEngagementConflict, fetchSecondTierSessions,
} from '@/lib/api/gpsConflict';
import { mergedMetaNotices, type MetaNotice } from '@/lib/api/meta';
import { GpsMetaNotices } from './GpsMetaBanner';
import { ApiError } from '@/lib/apiClient';
/**
 * THE PERIMETER AND THE DISCLOSURE LIBRARY ARE IMPORTED BY RELATIVE PATH.
 *
 * `packages/shared/package.json` exposes exactly one entry point (`"."` →
 * `src/index.ts`), and neither `perimeter.ts` nor `disclosure.ts` is re-exported
 * from `src/gps/index.ts` — the agent that wrote them was forbidden to touch the
 * barrel, and so am I (a human wiring pass owns every barrel and route file).
 * `@lcx/shared/gps/perimeter` therefore does not resolve, for `tsc` or for Vite.
 *
 * The alternative was to render this section from an API endpoint that does not
 * exist, which would mean inventing a response contract — the mistake that
 * shipped a guaranteed-crashing GPS page once already (`lib/api/gps.ts:80`).
 * Reaching straight into the source of truth is the smaller sin: the perimeter and
 * the disclosure library are COMPILED POLICY (`perimeter.ts:6`,
 * `disclosure.ts:6`), pure, and need no server at all — the only thing an endpoint
 * would add here is a chance to disagree with them.
 *
 * WIRED (P13): both now come from `@lcx/shared`. The collision this comment warned
 * about was real and was resolved AT THE BARREL, not here: `targeting.ts`'s
 * `PerimeterStatus` (a target-screening verdict) keeps the name, and perimeter's
 * row-freshness state is published as `PerimeterEntryStatus`. This screen imports
 * neither by name — it reads `PERIMETER_STATUS_LABEL[...]` — so nothing here had to
 * choose between them.
 */
import {
  PERIMETER_IS_UNREVIEWED, PERIMETER_PROFILES, PERIMETER_REVIEW_WARNING_DAYS,
  PERIMETER_STATUS_LABEL, PERIMETER_UNREVIEWED_REASON, SERVICE_CLASS_LABEL,
  gateService, normaliseJurisdiction,
  DISCLOSURES_ARE_NOT_COUNSEL_REVIEWED, DISCLOSURES_UNREVIEWED_REASON,
  DISCLOSURE_LIBRARY_VERSION, DISCLOSURE_TEMPLATES, PROHIBITED_PROMISES,
  PROHIBITED_PROMISE_LABEL, PROHIBITED_PROMISE_SENTENCE, missingDisclosures,
  renderDisclosure,
  type PerimeterEntry, type ServiceGateDecision,
  type DisclosureContext, type DisclosureTemplate,
} from '@lcx/shared';

/**
 * THE CONFLICT WALL — GPS Phase 9 (plan §5).
 *
 * One screen that answers, in front of LCX compliance, a client, or an auditor:
 * **what was our conflict position on this client, who decided it, when, and what
 * exactly did we disclose.** The founder is an employee of an EU/Liechtenstein-
 * regulated exchange selling market-access-adjacent services to token projects
 * while LCX listing is paused. No CRM ships this screen, and without it the
 * business is indefensible rather than merely undocumented.
 *
 * WHAT IS ON IT, and where each fact comes from — nothing here is decorative:
 *
 *  1. THE WALL. Every engagement's conflict position: cleared /
 *     cleared-with-disclosure / declined / MISSING. `MISSING` is red and states
 *     what it blocks. Source: `GET /v1/gps/engagements` + one
 *     `GET /v1/gps/engagements/:id` per row for the verbatim disclosure text.
 *  2. THE EXACT DISCLOSURE WORDING, verbatim from
 *     `gps_conflict_check.disclosure_text_used`, never a summary — with the
 *     template and version it can be REPRODUCED from, or a statement that it
 *     cannot (see `reproduceDisclosure` below; D8 — no claim without a mechanism).
 *  3. THE PERIMETER. jurisdiction × offer → class, source, who entered it, when,
 *     and when it EXPIRES, with `gateService`'s refusal beside every row.
 *  4. THE STANDING EMPLOYEE-CONFLICT STATEMENT, quoted in full.
 *  5. SECOND-TIER SESSIONS: who entered on the shared passcode.
 *
 * WHAT THIS SCREEN IS CAREFUL NOT TO CLAIM — read these before adding to it:
 *
 *  · IT IS NOT PROOF OF WHO. Attribution is only as strong as a shared
 *    `DESK_PASSCODE`, and since 45990fa a shared `SECONDARY_PASSCODE` lets any
 *    @lcx.com address in. `decided_by` is a real, dated, verbatim record of what
 *    was checked; it is not evidence of which human checked it. Stated on the
 *    surface, in the footer, not buried here.
 *  · NO DATABASE CONSTRAINT ENFORCES THE CONFLICT GATE. The brief for this screen
 *    said "the DB already enforces this" and that is not true: `0047_gps.sql` has
 *    no trigger and no CHECK tying status to a conflict check — the only thing it
 *    enforces is UNIQUE(engagement_id), one check per engagement (`0047_gps.sql:263`).
 *    The gate lives in `setEngagementStatus` (`apps/api/src/gps/service.ts:786`),
 *    which `issueProposal` routes through so there is no laxer second path, and it
 *    PARKS the engagement in `conflict_pending` as it refuses. A direct SQL UPDATE
 *    would bypass it. The wall says exactly that, because a compliance surface
 *    that overstates its own enforcement is worse than one that understates it.
 *  · THE PERIMETER AUTHORISES NOTHING. Every row in `PERIMETER_PROFILES` is a
 *    placeholder, unreviewed and expired on arrival by construction
 *    (`reviewBy === enteredAt`, `perimeter.ts:225`). WebSearch and WebFetch were
 *    non-functional when this programme was written, so no regulatory fact could
 *    be verified and none is asserted. The banner is not boilerplate — it is the
 *    most important sentence on the screen.
 *  · NO CLIENT ARTIFACT IS ACCEPTED. No upload control, no file input, no drop
 *    zone, and no function behind one (`lib/api/gpsConflict.ts` has no
 *    upload-shaped export and the test file fails if one appears). D2 is
 *    unanswered; the disclosure TEXT in a column is the record.
 *
 * D7 (printable, dated): `PrintStyles` plus the rules in `WallPrintStyles`. Every
 * section is open in print; the as-of instant is stamped once at the top and once
 * at the bottom, and it is a SINGLE instant captured on mount so that two numbers
 * on one printed page cannot have been computed against two different clocks.
 */

/* ── The as-of instant, and why it is captured exactly once ─────────────────── */

/**
 * Staleness is arithmetic on two dates (`perimeter.ts` `daysPastReview`), so the
 * instant it is measured against is part of the answer. Reading the clock per row
 * would let the top of a printed page disagree with the bottom of it; reading it
 * once, on mount, makes the whole artifact one observation with one timestamp —
 * which is the thing being handed to a third party.
 */
function useAsOf(): string {
  const [asOf] = useState(() => new Date().toISOString());
  return asOf;
}

/** ISO → `2026-08-01 14:22Z`. Null-safe, never "Invalid Date" on the wall. */
function stamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return `UNPARSEABLE (${iso})`;
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}Z`;
}

/** Date only, for columns where the time of day changes no decision. */
function day(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return `UNPARSEABLE (${iso})`;
  return d.toISOString().slice(0, 10);
}

/* ── Positions ─────────────────────────────────────────────────────────────── */

/**
 * The four positions on the wall. `missing` is NOT a `ConflictDecision` — the
 * shared union has three members (`types.ts:260`) and adding a fourth would let
 * "nobody has looked at this" be stored as if it were a decision somebody made.
 * It is the absence of a row, and it is the reason this screen exists.
 */
type WallPosition = ConflictDecision | 'missing';

const POSITION_LABEL: Record<WallPosition, string> = {
  cleared: 'Cleared',
  cleared_with_disclosure: 'Cleared with disclosure',
  declined: 'DECLINED',
  missing: 'MISSING',
};

/**
 * Statuses at or past `proposed` that are not terminal — i.e. the ones
 * `setEngagementStatus` refuses to enter without a recorded, non-declined check.
 *
 * Derived here with the SAME expression as `REQUIRES_CONFLICT_CLEARANCE`
 * (`apps/api/src/gps/service.ts:760`) over the SAME shared list
 * (`ENGAGEMENT_STATUSES`, `types.ts:230`), rather than hand-typed, so a lifecycle
 * change moves both. It is duplicated at all only because the API's constant is
 * server-side and not in `@lcx/shared`; the test pins the resulting seven names so
 * a silent divergence is a red test rather than a wrong sentence on a compliance
 * artifact.
 */
export const CLIENT_FACING_STATUSES: readonly EngagementStatus[] = ENGAGEMENT_STATUSES.filter(
  (s, i) => i >= ENGAGEMENT_STATUSES.indexOf('proposed') && s !== 'closed_lost' && s !== 'cancelled',
);

/** Where the refusal actually lives. Cited on screen; see the header note. */
const ENFORCEMENT_SENTENCE =
  'Blocked in the API, not by a database constraint: setEngagementStatus (apps/api/src/gps/service.ts:786) '
  + 'refuses any status from "proposed" onward with no recorded check and parks the engagement in '
  + 'conflict_pending as it refuses. issueProposal uses that same path, so there is no laxer route to '
  + '"proposed". 0047_gps.sql enforces only UNIQUE(engagement_id) — one check per engagement — so a direct '
  + 'SQL UPDATE would bypass this.';

/* ── Reproducing a stored disclosure (D8 — the mechanism) ───────────────────── */

/**
 * WHY THIS FUNCTION EXISTS INSTEAD OF A "VERSION" COLUMN.
 *
 * `gps_conflict_check` stores `disclosure_text_used` verbatim and NOTHING ELSE
 * about the wording — there is no `disclosure_template_id` and no
 * `disclosure_version` column until migration 0050, which another agent owns and
 * which is not applied here. So for every row that exists today the honest answer
 * to "which version of the policy was this?" is *not recorded*.
 *
 * Printing "v1" beside it anyway would be exactly the defect this programme was
 * built to remove: a confident number with nothing behind it. Instead the wall
 * RE-DERIVES the answer and shows its method. `renderDisclosure` is documented
 * deterministic — same id + same context ⇒ byte-identical text, no clock, no
 * locale (`disclosure.ts:355`) — so re-rendering each template with this row's own
 * context and comparing byte-for-byte is a real test with a real negative result.
 *
 * A match is a strong claim: the stored text IS the current template at that
 * version, reproduced. A miss is reported as a miss, with the inputs it used, and
 * never as an absence of disclosure — the wording may predate the library, or the
 * template may have been edited without a version bump, and those are different
 * findings for a human to make.
 */
type Reproduction =
  | { kind: 'no_text' }
  | { kind: 'reproduced'; templateId: string; version: number; title: string }
  | { kind: 'unmatched'; triedTemplates: number; asOfUsed: string };

function reproduceDisclosure(
  stored: string | null,
  ctx: DisclosureContext,
): Reproduction {
  if (!stored || !stored.trim()) return { kind: 'no_text' };
  for (const t of DISCLOSURE_TEMPLATES) {
    let rendered: string;
    try {
      // No `version` pin: pinning demands an exact match and refuses otherwise
      // (`disclosure.ts:322`), which is right for issuing and wrong for probing.
      rendered = renderDisclosure(t.id, ctx).text;
    } catch {
      // renderDisclosure REFUSES rather than returning blanks — an unknown offer
      // key, a blank required field, a surviving placeholder. A row we cannot
      // render a candidate for simply cannot be matched against that template.
      continue;
    }
    if (rendered === stored || rendered === stored.trim()) {
      return { kind: 'reproduced', templateId: t.id, version: t.version, title: t.title };
    }
  }
  return {
    kind: 'unmatched',
    triedTemplates: DISCLOSURE_TEMPLATES.length,
    asOfUsed: ctx.asOf,
  };
}

/* ── The row ───────────────────────────────────────────────────────────────── */

/**
 * How much of a row's evidence actually arrived. Never collapsed into "no
 * disclosure": a failed fetch and an empty column are different facts, and the
 * one thing a compliance wall may not do is present the first as the second.
 */
type DetailState =
  | 'no_check' | 'loaded' | 'failed' | 'over_cap' | 'not_migrated' | 'list_detail_disagree';

const DETAIL_LABEL: Record<DetailState, string> = {
  no_check: 'no check recorded — nothing to load',
  loaded: 'loaded',
  failed: 'FETCH FAILED — text not shown because it was not read, not because it is absent',
  over_cap: `NOT LOADED — beyond this screen's fetch cap`,
  not_migrated: 'NOT MIGRATED — 0047_gps.sql is not applied on this environment',
  // The list endpoint reported a check for this engagement and the detail endpoint
  // returned none. One of the two is wrong and this screen cannot tell which, so it
  // reports the contradiction instead of picking the reading that looks tidier.
  list_detail_disagree:
    'CONTRADICTION — the list endpoint reports a check for this engagement and the detail '
    + 'endpoint returned none. Neither reading may be relied on until that is explained.',
};

interface WallRow {
  engagement: GpsEngagementRow;
  /** Null when the engagement's client is not in `/clients` — itself a defect. */
  client: GpsClient | null;
  position: WallPosition;
  /** The full check, including the verbatim text. Null until/unless loaded. */
  check: GpsConflictCheck | null;
  detail: DetailState;
  /** `gateService` as of NOW: may this be quoted into this jurisdiction today? */
  gate: ServiceGateDecision;
  /** The context the stored wording was probed against — asOf = decidedAt. */
  ctx: DisclosureContext | null;
  reproduction: Reproduction;
  /** Required-but-not-evidenced disclosures. See the note in `buildRow`. */
  missing: readonly DisclosureTemplate[];
  /** True when a client-facing status was reached with no non-declined check. */
  pastGate: boolean;
}

/**
 * THE FETCH CAP. Sixty full conflict checks, then the wall says so.
 *
 * This desk runs at roughly 29 engagements a year (`ASSUMED_ANNUAL_ENGAGEMENT_VOLUME`,
 * `calibration.ts`), so sixty is two years of book and the cap will not fire for a
 * long time. It exists because the alternative to a stated cap is an unbounded
 * fan-out that eventually times out and renders a SHORT wall — and a wall missing
 * rows reads as completeness. When it fires, the affected rows are still listed,
 * marked `over_cap`, and the header carries the count.
 */
export const DETAIL_FETCH_CAP = 60;

function buildRow(
  engagement: GpsEngagementRow,
  client: GpsClient | null,
  check: GpsConflictCheck | null,
  detail: DetailState,
  asOf: string,
): WallRow {
  const position: WallPosition = engagement.conflict?.decision ?? 'missing';
  const jurisdiction = client?.jurisdiction ?? null;

  // TWO DIFFERENT QUESTIONS, deliberately two calls. `gate` asks "may this be
  // quoted TODAY", so it is evaluated at the wall's as-of instant. The disclosure
  // context asks "what was true when this was disclosed", so it is evaluated at
  // `decidedAt`. Collapsing them would date every historical record to today.
  const gate = gateService({ jurisdiction, offer: engagement.offerKey, asOf });

  let ctx: DisclosureContext | null = null;
  if (engagement.conflict) {
    const decidedAt = engagement.conflict.decidedAt;
    const thenGate = gateService({ jurisdiction, offer: engagement.offerKey, asOf: decidedAt });
    ctx = {
      clientName: client?.name ?? engagement.clientName,
      offerKey: engagement.offerKey,
      contractingEntity: engagement.contractingEntity,
      asOf: decidedAt,
      jurisdiction,
      conflictDecision: engagement.conflict.decision,
      // NOT RECORDED ANYWHERE. `lcxAdjacent` is "the counterparty is or may become
      // an LCX listing applicant" and `disclosure.ts:130` says a human states it and
      // nothing infers it — there is no column for it in 0047 and no field on
      // `GpsClient`. Passing `false` is the only non-inventing option, and the
      // consequence is visible rather than hidden: the cleared-with-disclosure
      // template is then required only when the DECISION says so, and §4 of the
      // screen states the register cannot be computed. Do not "improve" this by
      // guessing from a name.
      lcxAdjacent: false,
      perimeterUnreviewed: thenGate.classification.status !== 'ok',
    };
  }

  const reproduction = ctx
    ? reproduceDisclosure(check?.disclosureTextUsed ?? null, ctx)
    : ({ kind: 'no_text' } as Reproduction);

  /**
   * WHICH REQUIRED DISCLOSURES ARE UNEVIDENCED.
   *
   * `missingDisclosures` takes the ids that were RECORDED as used
   * (`disclosure.ts:478`). Nothing records ids yet — that is 0050 — so the only id
   * this screen can honestly claim was used is one it REPRODUCED byte-for-byte.
   * Everything else lands in this list. That over-reports until 0050 exists, and
   * over-reporting a compliance gap is the correct direction to be wrong in; the
   * column header says so rather than leaving the reader to assume precision.
   */
  const missing = ctx
    ? missingDisclosures(ctx, reproduction.kind === 'reproduced' ? [reproduction.templateId] : [])
    : DISCLOSURE_TEMPLATES.filter(() => false);

  return {
    engagement,
    client,
    position,
    check,
    detail,
    gate,
    ctx,
    reproduction,
    missing,
    pastGate:
      CLIENT_FACING_STATUSES.includes(engagement.status)
      && (position === 'missing' || position === 'declined'),
  };
}

/* ── Loading ───────────────────────────────────────────────────────────────── */

/** What the second-tier endpoint returned, as the screen renders it. */
type SecondTierView = Awaited<ReturnType<typeof fetchSecondTierSessions>>;

/**
 * Second-tier visibility has FIVE outcomes and no two of them mean the same thing.
 * Collapsing any pair produces the one sentence this panel must never imply —
 * "nobody used the shared passcode" — from evidence that does not support it.
 */
type SecondTier =
  | { state: 'loading' }
  | { state: 'not_mounted' }
  | { state: 'forbidden' }
  | { state: 'failed'; message: string }
  | { state: 'malformed'; message: string }
  | { state: 'ready'; view: SecondTierView };

/**
 * VALIDATE THE PAYLOAD, DO NOT TRUST THE ANNOTATION.
 *
 * `lib/api/gpsConflict.ts` mirrors `SecondTierView` (`apps/api/src/gps/conflict.ts:1425`)
 * because that interface is server-side and cannot be imported into the browser —
 * and mirroring a server shape by hand is precisely what shipped a guaranteed
 * crash with a green build the first time GPS met real data
 * (`lib/api/gps.ts:80`). `tsc` cannot catch it: an interface is a claim about a
 * runtime payload and the compiler believes claims.
 *
 * So the claim is checked here, once, where the data arrives. A mismatch renders a
 * stated refusal naming the two files to reconcile; it does not throw an error
 * boundary over the wall, and it does not render a table of `undefined`.
 */
function isSecondTierView(x: unknown): x is SecondTierView {
  if (typeof x !== 'object' || x === null) return false;
  const v = x as Record<string, unknown>;
  const uses = (u: unknown) => Array.isArray(u) && u.every((r) => {
    if (typeof r !== 'object' || r === null) return false;
    const s = r as Record<string, unknown>;
    return typeof s.email === 'string' && typeof s.firstSeen === 'string'
      && typeof s.lastSeen === 'string' && typeof s.count === 'number';
  });
  return typeof v.asOf === 'string'
    && typeof v.configured === 'boolean'
    && typeof v.rosterEmailCount === 'number'
    && typeof v.rotateAdvised === 'boolean'
    && uses(v.usage) && uses(v.unexpected)
    && Array.isArray(v.limits) && v.limits.every((l) => typeof l === 'string');
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/* ── The screen ────────────────────────────────────────────────────────────── */

export function GpsConflict() {
  const asOf = useAsOf();
  const [rows, setRows] = useState<WallRow[] | null>(null);
  const [summary, setSummary] = useState<GpsSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notMigrated, setNotMigrated] = useState(false);
  /** What the three reads declared about themselves, minus the sentence the wall's own banner owns. */
  const [readNotices, setReadNotices] = useState<readonly MetaNotice[]>([]);
  const [overCap, setOverCap] = useState(0);
  const [secondTier, setSecondTier] = useState<SecondTier>({ state: 'loading' });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      // `fetchGpsSummary` is here for ONE reason and it is not decoration: its
      // payload carries `migrated` as a FIELD (`lib/api/gps.ts:100`). The two list
      // reads report the same fact in `meta` (`routes/gps.ts:346`, `:409`) and that
      // envelope used to die in the fetch layer, so an environment without
      // 0047_gps.sql — the state of production as this ships — returned an empty
      // array indistinguishable from a genuinely empty book. "No conflict problems"
      // and "the compartment does not exist here" are opposite readings of the same
      // blank table, and this screen may not confuse them. The envelope now arrives
      // (`lib/api/meta.ts`), so BOTH sources count toward the verdict below and the
      // summary read is no longer the only witness.
      const [clients, engagements, sum] = await Promise.all([
        fetchGpsClients(),
        fetchGpsEngagements(),
        fetchGpsSummary(),
      ]);
      setSummary(sum);

      /*
       * WHAT THE THREE READS DECLARED ABOUT THEMSELVES.
       *
       * Derived here and held as notices rather than holding the payloads: the wall
       * keeps rows, not responses, and re-deriving on every render would mean keeping
       * two full arrays alive for a banner.
       *
       * `not-migrated` is REMOVED from the rendered list on purpose. This page already
       * owns that sentence in one place — the blocked notice below, which also fires on
       * a detail read that came back null — and one fact stated twice reads as two
       * problems. It is not discarded: it is folded into `setNotMigrated`, which is
       * what puts the sentence on screen.
       */
      const envelope = mergedMetaNotices([sum, clients, engagements]);
      setReadNotices(envelope.filter((n) => n.id !== 'not-migrated'));
      const listsUnmigrated = envelope.some((n) => n.id === 'not-migrated');

      const byId = new Map(clients.map((c) => [c.id, c]));

      // Deterministic order: newest engagement first, id as the tiebreak so two
      // rows created in the same millisecond do not swap places between renders of
      // a printed artifact.
      const ordered = [...engagements].sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
      );

      // Only rows that HAVE a check need the detail fetch — a missing check has no
      // text to read, and spending a request to confirm an absence the list
      // endpoint already reported would double the fan-out for nothing.
      const needsDetail = ordered.filter((e) => e.conflict !== null);
      const within = new Set(needsDetail.slice(0, DETAIL_FETCH_CAP).map((e) => e.id));
      setOverCap(Math.max(0, needsDetail.length - within.size));

      const checks = new Map<string, GpsConflictCheck | null>();
      const states = new Map<string, DetailState>();
      // Serial, in small batches: this is a print-once compliance artifact, not a
      // hot path, and hammering the API with sixty parallel requests to render a
      // page nobody reloads is the wrong trade.
      const ids = [...within];
      for (let i = 0; i < ids.length; i += 6) {
        const batch = ids.slice(i, i + 6);
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(batch.map(async (id) => {
          try {
            const d = await fetchGpsEngagementConflict(id);
            if (d === null) {
              states.set(id, 'not_migrated');
              return;
            }
            checks.set(id, d.conflictCheck);
            states.set(id, d.conflictCheck === null ? 'list_detail_disagree' : 'loaded');
          } catch (e) {
            states.set(id, 'failed');
            // Kept, not swallowed: the row will say FETCH FAILED, and the console
            // line is what a developer needs to know which id and why.
            console.error('[gps-conflict] detail fetch failed', id, e);
          }
        }));
      }

      setRows(ordered.map((e) => buildRow(
        e,
        byId.get(e.clientId) ?? null,
        checks.get(e.id) ?? null,
        e.conflict === null
          ? 'no_check'
          : (states.get(e.id) ?? (within.has(e.id) ? 'failed' : 'over_cap')),
        asOf,
      )));
      setNotMigrated(listsUnmigrated || [...states.values()].some((s) => s === 'not_migrated'));
    } catch (e) {
      setLoadError(errText(e));
      setRows(null);
    }
  }, [asOf]);

  useEffect(() => { void load(); }, [load]);

  // The two auxiliary reads are INDEPENDENT of the wall: each can fail without
  // taking the artifact down, and each failure is rendered as a sentence in its
  // own panel rather than as a missing panel.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const v = await fetchSecondTierSessions();
        if (!live) return;
        setSecondTier(isSecondTierView(v)
          ? { state: 'ready', view: v }
          : { state: 'malformed', message: 'the payload does not match SecondTierView' });
      } catch (e) {
        if (!live) return;
        // 404 is the EXPECTED answer today. The route exists in the repo
        // (`routes/gpsConflict.ts:622`) and mounts itself nowhere — `app.ts` belongs
        // to the wiring pass. 403 is the expected answer for a non-approver, since
        // the endpoint reports on a credential that can never BE an approver
        // (`middleware/auth.ts:94`). Both are stated blind spots, not empty logs.
        setSecondTier(
          e instanceof ApiError && e.status === 404 ? { state: 'not_mounted' }
            : e instanceof ApiError && e.status === 403 ? { state: 'forbidden' }
              : { state: 'failed', message: errText(e) },
        );
      }
    })();
    return () => { live = false; };
  }, []);

  const counts = useMemo(() => {
    const c = { total: 0, cleared: 0, cleared_with_disclosure: 0, declined: 0, missing: 0, pastGate: 0 };
    for (const r of rows ?? []) {
      c.total += 1;
      c[r.position] += 1;
      if (r.pastGate) c.pastGate += 1;
    }
    return c;
  }, [rows]);

  const toggle = useCallback((id: string) => {
    setOpen((o) => ({ ...o, [id]: !o[id] }));
  }, []);

  const allOpen = !!rows && rows.length > 0 && rows.every((r) => open[r.engagement.id]);

  /**
   * D6 — the wall is navigable without a mouse. j/k or the arrows move between
   * rows, Enter or Space opens the row's evidence.
   *
   * Escape is deliberately NOT bound. LCXOS has ONE Escape owner
   * (`lib/keys/`), and a page-level handler here would be the second — the class of
   * bug that phase existed to remove. Collapsing is Enter on an open row.
   */
  const onRowKey = useCallback((e: ReactKeyboardEvent, index: number, id: string) => {
    const move = (to: number) => {
      e.preventDefault();
      bodyRef.current?.querySelector<HTMLElement>(`[data-row-index="${to}"]`)?.focus();
    };
    if (e.key === 'j' || e.key === 'ArrowDown') move(index + 1);
    else if (e.key === 'k' || e.key === 'ArrowUp') move(index - 1);
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(id); }
  }, [toggle]);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 text-navy">
      <PrintStyles />
      <WallPrintStyles />

      <header className="border-b-2 border-navy pb-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-mono text-[17px] font-bold uppercase tracking-wider">
            The conflict wall
          </h1>
          <span className="font-mono text-micro uppercase tracking-wider text-grey">
            Global Services · conflict position · disclosure wording · jurisdiction perimeter
          </span>
          <span className="ml-auto font-mono text-micro tabular-nums text-grey" data-testid="wall-asof">
            AS OF {stamp(asOf)}
          </span>
          <span className="br-no-print flex gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setOpen(allOpen
                ? {}
                : Object.fromEntries((rows ?? []).map((r) => [r.engagement.id, true])))}
            >
              {allOpen ? 'Collapse all' : 'Expand all'}
            </Button>
            {/* Print needs no preparation — every row's evidence prints whether or
                not it is open on screen (see `WallRowEvidence`). */}
            <Button size="sm" variant="secondary" onClick={() => window.print()}>Print</Button>
          </span>
        </div>
        <div className="mt-1 font-mono text-micro tabular-nums text-grey" data-testid="wall-counts">
          ENGAGEMENTS {counts.total}
          {' · '}CLEARED {counts.cleared}
          {' · '}WITH DISCLOSURE {counts.cleared_with_disclosure}
          {' · '}DECLINED {counts.declined}
          {' · '}
          <span className={clsx(counts.missing > 0 && 'font-bold text-status-blocked')}>
            MISSING {counts.missing}
          </span>
          {' · '}
          <span className={clsx(counts.pastGate > 0 && 'font-bold text-status-blocked')}>
            PAST THE GATE WITHOUT CLEARANCE {counts.pastGate}
          </span>
        </div>
      </header>

      {/* THE BANNER THAT MATTERS MOST. Not boilerplate: every perimeter row on this
          screen is a placeholder that authorises nothing, and a reader who misses
          that sentence draws the opposite conclusion from the one the data supports. */}
      {PERIMETER_IS_UNREVIEWED && (
        <Notice tone="blocked" testid="perimeter-unreviewed-banner" title="Perimeter is UNREVIEWED — it authorises nothing">
          {PERIMETER_UNREVIEWED_REASON}
        </Notice>
      )}
      {/* THE DATABASE ROWS, WITH THE REVIEW CONTROL — the wiring gap this page's own
          comment recorded, closed when the G0 packet entered 30 real rows. The panel
          reads the SHARED PerimeterView declaration (one wire shape, both sides), so
          the compiled grid below can no longer silently disagree with the register:
          this panel IS the register's view, and the grid is the compiled fallback. */}
      <PerimeterReviewPanel />

      {DISCLOSURES_ARE_NOT_COUNSEL_REVIEWED && (
        <Notice tone="conditional" testid="disclosures-unreviewed-banner" title="Disclosure wording is NOT counsel-reviewed">
          {DISCLOSURES_UNREVIEWED_REASON}
        </Notice>
      )}
      {(notMigrated || summary?.migrated === false) && (
        <Notice tone="blocked" testid="not-migrated-banner" title="This compartment is INERT here — 0047_gps.sql is not applied">
          The API reports Global Services as not migrated on this environment, so there is no
          gps_engagement table and no gps_conflict_check table to read. An empty wall below is
          therefore evidence of NOTHING: it is not a clean conflict record, and it must not be
          shown to anyone as one. The perimeter and the disclosure library in §2–§4 are compiled
          policy and are unaffected — they need no database.
        </Notice>
      )}
      {/* Everything ELSE the three reads declared: a lost envelope, a still-pending
          migration, a perimeter that came from compiled placeholders. Beneath the
          migration notice because that one, when it fires, subsumes them. */}
      <GpsMetaNotices notices={readNotices} className="my-2" />
      {/*
        TWO INDEPENDENT COUNTS OF THE SAME THING, compared (D8). The wall counts
        MISSING by walking the rows it fetched; the server counts it in SQL
        (`gaps.missingConflictCheck`, `lib/api/gps.ts:118`). Agreement is worth
        nothing to display and disagreement is worth a great deal, because it means
        one of the two is reading a different book — the failure that shipped a GPS
        page against a summary contract the API never had.
      */}
      {summary && summary.migrated && rows && summary.gaps.missingConflictCheck !== counts.missing && (
        <Notice tone="blocked" testid="count-disagreement" title="The wall and the server disagree on how many checks are missing">
          {`This screen counted ${counts.missing} engagement(s) with no conflict check by walking the `}
          {`rows it fetched; the server's own SQL count is ${summary.gaps.missingConflictCheck}. `}
          Do not rely on either number until the difference is explained — the likeliest causes are
          a status filter on the list endpoint, or rows this screen did not fetch.
        </Notice>
      )}
      {overCap > 0 && (
        <Notice tone="conditional" testid="over-cap-banner" title={`${overCap} row(s) beyond the fetch cap`}>
          {`This screen loads at most ${DETAIL_FETCH_CAP} full conflict checks in one pass. `}
          {`${overCap} engagement(s) with a recorded check are listed WITHOUT their disclosure text, `}
          marked NOT LOADED. They are not missing a disclosure; this screen has not read it.
        </Notice>
      )}
      {loadError && (
        <Notice tone="blocked" testid="wall-load-error" title="The wall could not be loaded">
          {loadError}
          {' — nothing below should be read as a complete conflict position. '}
          <button type="button" className="underline br-no-print" onClick={() => void load()}>retry</button>
        </Notice>
      )}

      <WallSection
        rows={rows}
        migrated={summary?.migrated !== false}
        open={open}
        toggle={toggle}
        onRowKey={onRowKey}
        bodyRef={bodyRef}
      />
      <DisclosureLibrarySection />
      <StandingStatementSection asOf={asOf} />
      <PerimeterSection asOf={asOf} rows={rows} />
      <SecondTierSection secondTier={secondTier} />

      <footer className="mt-6 border-t-2 border-navy pt-2 font-mono text-micro leading-relaxed text-grey">
        <div data-testid="wall-footer-asof">
          THE CONFLICT WALL · GLOBAL SERVICES · generated {stamp(asOf)} · one observation, one clock.
        </div>
        <div className="mt-1 font-bold uppercase tracking-wider text-status-blocked">
          What this artifact does not prove
        </div>
        <ol className="mt-0.5 list-decimal space-y-0.5 pl-4">
          <li>
            WHO decided. Sign-in is a SHARED passcode, and since commit 45990fa a second
            shared passcode admits any @lcx.com address. Every &quot;decided by&quot; below is a
            dated, verbatim record of what was checked — it is not evidence of which human
            checked it. Per-person attribution does not exist in this system yet.
          </li>
          <li>
            THAT THE PERIMETER IS CORRECT. It is a set of placeholders, expired on arrival,
            entered by nobody. No regulatory fact in this programme was verifiable.
          </li>
          <li>
            THAT A DISCLOSURE WAS DELIVERED. The column records the wording used; nothing in
            this system sends anything to a client, so delivery is evidenced elsewhere.
          </li>
          <li>
            THAT A DATABASE CONSTRAINT STOPS THIS. {ENFORCEMENT_SENTENCE}
          </li>
        </ol>
      </footer>
    </div>
  );
}

/* ── Shared presentation atoms (dense, mono, no cards on data — D5) ─────────── */

const TH = 'whitespace-nowrap border-b border-navy px-1.5 py-1 text-left align-bottom font-mono text-[10px] font-bold uppercase tracking-wider text-grey';
const TD = 'border-b border-line/70 px-1.5 py-1 align-top font-mono text-micro';

type Tone = 'blocked' | 'conditional' | 'ready' | 'deferred';

const TONE_BORDER: Record<Tone, string> = {
  blocked: 'border-status-blocked bg-status-blocked-bg',
  conditional: 'border-status-conditional bg-status-conditional-bg',
  ready: 'border-status-ready bg-status-ready-bg',
  deferred: 'border-line bg-status-deferred-bg',
};

const TONE_TEXT: Record<Tone, string> = {
  blocked: 'text-status-blocked',
  conditional: 'text-status-conditional',
  ready: 'text-status-ready',
  deferred: 'text-grey',
};

function Notice(props: {
  tone: Tone;
  title: string;
  testid?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-testid={props.testid}
      className={clsx('mt-2 border-l-4 px-2 py-1.5', TONE_BORDER[props.tone])}
    >
      <div className={clsx('font-mono text-[10px] font-bold uppercase tracking-wider', TONE_TEXT[props.tone])}>
        {props.title}
      </div>
      <div className="mt-0.5 font-mono text-micro leading-relaxed text-grey-dark">{props.children}</div>
    </div>
  );
}

function SectionHead(props: { n: string; title: string; note?: ReactNode }) {
  return (
    <div className="mt-6 border-b-2 border-navy pb-1">
      <h2 className="font-mono text-label font-bold uppercase tracking-wider">
        <span className="text-grey">{props.n}</span> {props.title}
      </h2>
      {props.note && (
        <div className="mt-0.5 font-mono text-micro leading-relaxed text-grey">{props.note}</div>
      )}
    </div>
  );
}

/** Verbatim text, in a box that says it is verbatim. Never truncated, never elided. */
function Verbatim(props: { label: string; text: string; testid?: string }) {
  return (
    <div className="mt-1.5">
      <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-grey">
        {props.label} — VERBATIM, AS STORED
      </div>
      <pre
        data-testid={props.testid}
        className="mt-0.5 whitespace-pre-wrap break-words border-l-2 border-line bg-ice-soft/50 px-2 py-1 font-mono text-micro leading-relaxed text-navy dark:bg-ice-soft/10"
      >{props.text}</pre>
    </div>
  );
}

/* ── §1 THE WALL ───────────────────────────────────────────────────────────── */

/**
 * `declined` is amber, not red, and that is a considered distinction. A declined
 * check is the system WORKING — somebody looked and said no — and colouring it like
 * a failure teaches the desk that doing the check produces a red row. What is red is
 * an engagement that reached a client-facing status anyway, which is the `pastGate`
 * flag, and `missing`, which is nobody having looked at all.
 */
const POSITION_TONE: Record<WallPosition, Tone> = {
  cleared: 'ready',
  cleared_with_disclosure: 'ready',
  declined: 'conditional',
  missing: 'blocked',
};

/**
 * THE SENTENCE A MISSING ROW MUST CARRY.
 *
 * A red cell alone is a colour. What makes this screen usable in front of a third
 * party is that the consequence is written out: this engagement cannot lawfully be
 * taken to a client, and here is what stops it and what does not.
 */
const MISSING_BLOCKS_SENTENCE =
  'BLOCKED FROM ALL CLIENT-FACING STATES. No proposal may be issued and no status at or past '
  + '"Proposal issued" may be entered while no conflict check is recorded.';

function WallSection(props: {
  rows: WallRow[] | null;
  migrated: boolean;
  open: Record<string, boolean>;
  toggle: (id: string) => void;
  onRowKey: (e: ReactKeyboardEvent, index: number, id: string) => void;
  bodyRef: RefObject<HTMLTableSectionElement>;
}) {
  const { rows } = props;
  return (
    <section>
      <SectionHead
        n="§1"
        title="The wall — every engagement's conflict position"
        note={(
          <>
            One row per engagement, newest first. Position is the recorded decision or
            <span className="font-bold text-status-blocked"> MISSING</span>, which is the absence of a
            record and not a decision anyone made. Open a row (click, or Enter on a focused row) for
            the wording, the checker&apos;s own description of what was checked, and the perimeter
            gate&apos;s workings. {ENFORCEMENT_SENTENCE}
          </>
        )}
      />
      {rows === null ? (
        <div className="py-3 font-mono text-micro text-grey">Loading the book…</div>
      ) : rows.length === 0 ? (
        <div className="py-3 font-mono text-micro text-grey" data-testid="wall-empty">
          {props.migrated
            ? 'No engagements exist. An empty wall is not a clean wall — it is an empty book.'
            : 'NOTHING WAS READ. The tables do not exist on this environment (see the banner above), '
              + 'so this is not a statement about the book and proves nothing about any conflict position.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>#</th>
                <th className={TH}>Client</th>
                <th className={TH}>Jurisdiction<br />(as typed)</th>
                <th className={TH}>Offer</th>
                <th className={TH}>Entity</th>
                <th className={TH}>Engagement<br />status</th>
                <th className={TH}>Conflict<br />position</th>
                <th className={TH}>Decided by<br />(credential)</th>
                <th className={TH}>Decided<br />at</th>
                <th className={TH}>Disclosure<br />wording</th>
                <th className={TH}>Template ·<br />version</th>
                <th className={TH}>Required, not<br />evidenced</th>
                <th className={TH}>Perimeter gate<br />(today)</th>
              </tr>
            </thead>
            <tbody ref={props.bodyRef}>
              {rows.map((r, i) => (
                <WallRowView
                  key={r.engagement.id}
                  row={r}
                  index={i}
                  open={!!props.open[r.engagement.id]}
                  toggle={props.toggle}
                  onRowKey={props.onRowKey}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function WallRowView(props: {
  row: WallRow;
  index: number;
  open: boolean;
  toggle: (id: string) => void;
  onRowKey: (e: ReactKeyboardEvent, index: number, id: string) => void;
}) {
  const { row: r, index } = props;
  const e = r.engagement;
  const missing = r.position === 'missing';
  const text = r.check?.disclosureTextUsed ?? null;
  const hasText = !!text && !!text.trim();

  return (
    <>
      <tr
        data-row-index={index}
        data-testid={`wall-row-${e.id}`}
        tabIndex={0}
        onClick={() => props.toggle(e.id)}
        onKeyDown={(ev) => props.onRowKey(ev, index, e.id)}
        className={clsx(
          'cursor-pointer outline-none focus:bg-ice-soft/70 dark:focus:bg-ice-soft/15',
          missing && 'bg-status-blocked-bg',
        )}
      >
        <td className={clsx(TD, 'tabular-nums text-grey')}>{index + 1}</td>
        <td className={clsx(TD, 'font-semibold')}>{r.client?.name ?? e.clientName}</td>
        <td className={TD}>
          {r.client?.jurisdiction?.trim()
            ? r.client.jurisdiction
            : <span className="font-bold text-status-blocked">NOT RECORDED</span>}
        </td>
        <td className={TD}>{getOffer(e.offerKey).name}</td>
        <td className={clsx(TD, 'uppercase')}>{e.contractingEntity}</td>
        <td className={TD}>
          {ENGAGEMENT_STATUS_LABELS[e.status]}
          {r.pastGate && (
            <div className="font-bold uppercase text-status-blocked">past the gate</div>
          )}
        </td>
        <td className={clsx(TD, 'font-bold', TONE_TEXT[POSITION_TONE[r.position]])}>
          {POSITION_LABEL[r.position]}
        </td>
        <td className={TD}>{e.conflict?.decidedBy ?? '—'}</td>
        <td className={clsx(TD, 'tabular-nums')}>{stamp(e.conflict?.decidedAt)}</td>
        <td className={TD}>
          {missing
            ? <span className="font-bold text-status-blocked">NONE — NO CHECK</span>
            : hasText
              ? `${text!.trim().length} chars — open row`
              : r.detail === 'loaded'
                ? <span className="font-bold text-status-conditional">NO TEXT STORED</span>
                : <span className="text-status-conditional">{DETAIL_LABEL[r.detail]}</span>}
        </td>
        <td className={TD}><ReproductionCell reproduction={r.reproduction} /></td>
        <td className={TD}>
          {r.ctx === null
            ? '—'
            : r.missing.length === 0
              ? <span className="text-status-ready">none</span>
              : (
                <span className="font-bold text-status-conditional tabular-nums">
                  {r.missing.length}
                </span>
              )}
        </td>
        <td className={TD}>
          <span className={clsx('font-bold', r.gate.allowed ? 'text-status-ready' : 'text-status-blocked')}>
            {r.gate.allowed ? 'MAY QUOTE' : 'REFUSED'}
          </span>
          {!r.gate.allowed && <div className="text-grey">{r.gate.code}</div>}
        </td>
      </tr>

      {missing && (
        <tr data-testid={`wall-row-missing-${e.id}`} className="bg-status-blocked-bg">
          <td className={clsx(TD, 'border-b-2 border-status-blocked')} />
          <td className={clsx(TD, 'border-b-2 border-status-blocked font-bold uppercase tracking-wider text-status-blocked')} colSpan={12}>
            {MISSING_BLOCKS_SENTENCE}
            <div className="mt-0.5 font-normal normal-case tracking-normal text-grey-dark">
              {ENFORCEMENT_SENTENCE}
            </div>
          </td>
        </tr>
      )}

      {/*
        ALWAYS RENDERED, hidden on screen when collapsed.
        D7 is the reason. If the evidence were mounted only when a row is open, a
        ⌘P of this page would print a wall whose disclosure wording, gate ladder and
        check descriptions were simply absent for every closed row — and the person
        holding the paper would have no way to know that. The artifact has to be
        complete on paper regardless of what was clicked on screen, so the DOM
        carries it and `.wall-evidence` is forced visible in print. It also makes
        the whole wall searchable with the browser's own find.
      */}
      <WallRowEvidence row={r} open={props.open} />
    </>
  );
}

/**
 * The template-and-version cell. This is the one place on the screen where a
 * version number appears against a STORED disclosure, and it is only ever a
 * version this screen could reproduce — see `reproduceDisclosure`.
 */
function ReproductionCell(props: { reproduction: Reproduction }) {
  const r = props.reproduction;
  if (r.kind === 'no_text') return <span className="text-grey">—</span>;
  if (r.kind === 'reproduced') {
    return (
      <span data-testid="reproduced-version">
        <span className="font-bold text-status-ready">v{r.version}</span>
        <div className="text-grey">{r.templateId}</div>
        <div className="text-[10px] uppercase tracking-wider text-status-ready">reproduced</div>
      </span>
    );
  }
  return (
    <span data-testid="unreproduced-version">
      <span className="font-bold text-status-conditional">VERSION NOT RECORDED</span>
      <div className="text-grey">no column until 0050</div>
    </span>
  );
}

/** The evidence drawer for one row — everything a third party would ask next. */
function WallRowEvidence(props: { row: WallRow; open: boolean }) {
  const r = props.row;
  const e = r.engagement;
  const text = r.check?.disclosureTextUsed ?? null;
  return (
    <tr
      data-testid={`wall-evidence-${e.id}`}
      className={clsx('wall-evidence', !props.open && 'hidden')}
    >
      <td className={clsx(TD, 'border-b-2 border-navy')} />
      <td className={clsx(TD, 'border-b-2 border-navy')} colSpan={12}>
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-grey">
              Engagement
            </div>
            <dl className="mt-0.5 font-mono text-micro leading-relaxed">
              <Pair k="engagement id" v={e.id} />
              <Pair k="client id" v={e.clientId} />
              <Pair k="offer key" v={e.offerKey} />
              <Pair k="contracting entity" v={e.contractingEntity} />
              <Pair k="status" v={`${e.status} — ${ENGAGEMENT_STATUS_LABELS[e.status]}`} />
              <Pair k="created" v={stamp(e.createdAt)} />
              <Pair k="evidence loaded" v={DETAIL_LABEL[r.detail]} />
            </dl>

            {r.check && (
              <Verbatim
                label="What was checked, in the checker's words"
                text={r.check.checkPerformed}
                testid={`check-performed-${e.id}`}
              />
            )}
            {text && text.trim() ? (
              <Verbatim
                label="Disclosure wording used"
                text={text}
                testid={`disclosure-text-${e.id}`}
              />
            ) : r.detail === 'loaded' && r.check ? (
              <Notice tone="conditional" title="No disclosure wording stored">
                A check is recorded and `disclosure_text_used` is empty. That is legitimate for a
                plain `cleared` decision and it is a gap for `cleared_with_disclosure` — there is
                nothing to show a client you told them.
              </Notice>
            ) : null}

            <ReproductionExplainer row={r} />
          </div>

          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-grey">
              Perimeter gate — {r.gate.allowed ? 'may quote today' : 'refused today'}
            </div>
            <dl className="mt-0.5 font-mono text-micro leading-relaxed">
              <Pair k="jurisdiction (typed)" v={r.client?.jurisdiction?.trim() || 'NOT RECORDED'} />
              <Pair
                k="matched profile"
                v={r.gate.classification.jurisdictionLabel ?? 'NONE — not in the perimeter'}
              />
              <Pair
                k="recorded class"
                v={r.gate.classification.serviceClass === 'unknown'
                  ? 'unknown — nobody has entered one'
                  : SERVICE_CLASS_LABEL[r.gate.classification.serviceClass]}
              />
              <Pair k="status" v={PERIMETER_STATUS_LABEL[r.gate.classification.status]} />
              <Pair k="stale" v={r.gate.classification.stale ? 'YES — blocking' : 'no'} />
              <Pair
                k="days past review"
                v={r.gate.classification.daysPastReview === null
                  ? 'n/a'
                  : String(r.gate.classification.daysPastReview)}
              />
              {r.gate.code && <Pair k="refusal code" v={r.gate.code} />}
              {r.gate.reason && <Pair k="reason" v={r.gate.reason} />}
              <Pair k="remedy" v={r.gate.remedy ?? 'none — the honest answer is do not do this work'} />
              <Pair k="recoverable" v={r.gate.recoverable ? 'yes — a task' : 'NO — a wall'} />
            </dl>
            <GateLadder gate={r.gate} />

            {r.ctx && r.missing.length > 0 && (
              <div className="mt-2">
                <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-status-conditional">
                  Required and not evidenced ({r.missing.length})
                </div>
                <ul className="mt-0.5 space-y-1 font-mono text-micro text-grey-dark">
                  {r.missing.map((t) => (
                    <li key={t.id}>
                      <span className="font-bold">{t.title}</span>
                      {' · v'}{t.version}{' · '}<span className="text-grey">{t.id}</span>
                      <div className="text-grey">{t.appliesWhenLabel}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

function Pair(props: { k: string; v: string }) {
  return (
    <div className="flex gap-2 border-b border-line/40 py-0.5">
      <dt className="w-40 shrink-0 uppercase tracking-wider text-grey">{props.k}</dt>
      <dd className="break-all tabular-nums">{props.v}</dd>
    </div>
  );
}

/** The method, written out. A verification claim with no method is a decoration. */
function ReproductionExplainer(props: { row: WallRow }) {
  const r = props.row.reproduction;
  if (r.kind === 'no_text') return null;
  if (r.kind === 'reproduced') {
    return (
      <Notice tone="ready" title={`Wording reproduced — ${r.templateId} v${r.version}`}>
        {`MECHANISM: the compiled template "${r.title}" was re-rendered with this row's own `}
        {'client name, offer, contracting entity and its decided-at instant, and the result is '}
        {'byte-for-byte identical to the stored text. renderDisclosure is deterministic — no clock, '}
        {'no locale, no randomness (disclosure.ts:355) — so this is a reproduction, not a '}
        {`resemblance. The version is asserted on that basis and on nothing else: there is no `}
        {'disclosure_version column in gps_conflict_check until migration 0050.'}
      </Notice>
    );
  }
  return (
    <Notice tone="conditional" title="Wording could NOT be reproduced from the current library">
      {`MECHANISM: all ${r.triedTemplates} compiled templates were re-rendered with this row's own `}
      {`context (asOf = ${stamp(r.asOfUsed)}, the decided-at instant) and none matched the stored text `}
      {'byte-for-byte. This is NOT a finding that the disclosure is wrong or absent — the stored '}
      {'wording is the defensible record and it is shown above in full. It means the text was '}
      {'hand-edited, predates this library, or a template was changed without bumping its version. '}
      {'A human decides which. No version is claimed.'}
    </Notice>
  );
}

/* ── §2 THE DISCLOSURE LIBRARY — versioned policy ──────────────────────────── */

/**
 * The library, as policy rather than as copy. Four templates, each with a version
 * that is bumped on ANY text change (`disclosure.ts:166`), and the sum of those
 * versions as one library integer so a stored record can be compared against the
 * library it came from in a single comparison.
 *
 * The full template SOURCE is printed, placeholders and all. That is deliberate
 * and it is not the same thing as showing a client unresolved `{{clientName}}` —
 * `renderDisclosure` refuses to emit a surviving placeholder to anybody
 * (`disclosure.ts:361`). This section is the policy an auditor reads; the issued
 * wording is in §1, resolved, verbatim, per engagement.
 */
function DisclosureLibrarySection() {
  return (
    <section>
      <SectionHead
        n="§2"
        title="Disclosure library — compiled, versioned policy"
        note={(
          <>
            Library version <span className="font-bold tabular-nums" data-testid="library-version">{DISCLOSURE_LIBRARY_VERSION}</span>
            {' — the sum of every template version, so any change to any template changes this one '}
            integer. A version alone cannot be reproduced once the text is edited and a text alone
            cannot be audited against policy, which is why an engagement record needs both. Today
            the wording is stored and the version is not: <span className="font-bold">gps_conflict_check has no
            disclosure_version column until migration 0050</span>, so §1 re-derives the version where
            it can and says so where it cannot.
          </>
        )}
      />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={TH}>Template id</th>
              <th className={TH}>Ver</th>
              <th className={TH}>Title</th>
              <th className={TH}>Required when</th>
              <th className={TH}>Fields it interpolates</th>
            </tr>
          </thead>
          <tbody>
            {DISCLOSURE_TEMPLATES.map((t) => (
              <tr key={t.id} data-testid={`library-row-${t.id}`}>
                <td className={TD}>{t.id}</td>
                <td className={clsx(TD, 'font-bold tabular-nums')} data-testid={`library-version-${t.id}`}>
                  v{t.version}
                </td>
                <td className={clsx(TD, 'font-semibold')}>{t.title}</td>
                <td className={TD}>{t.appliesWhenLabel}</td>
                <td className={TD}>{t.requires.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {DISCLOSURE_TEMPLATES.map((t) => (
        <Verbatim
          key={t.id}
          label={`${t.id} v${t.version} — template source, placeholders unresolved`}
          text={t.text}
          testid={`library-text-${t.id}`}
        />
      ))}
    </section>
  );
}

/* ── §3 THE STANDING EMPLOYEE-CONFLICT STATEMENT ───────────────────────────── */

const STANDING_ID = 'gps-standing-employee-conflict';

/**
 * The statement of what GPS does not do, quoted, plus a CHECK that all four
 * prohibited promises are actually in it.
 *
 * The check is the point. `disclosure.ts` composes the statement out of
 * `PROHIBITED_PROMISE_SENTENCE` so that all four are structurally present rather
 * than incidentally present — and this section verifies that at render time by
 * substring, instead of asserting it in prose. D8: if the screen says all four
 * limits are stated, something looked.
 */
function StandingStatementSection(props: { asOf: string }) {
  const template = DISCLOSURE_TEMPLATES.find((t) => t.id === STANDING_ID) ?? null;
  const text = template?.text ?? '';
  const checks = PROHIBITED_PROMISES.map((p) => ({
    promise: p,
    present: text.includes(PROHIBITED_PROMISE_SENTENCE[p]),
  }));
  const allPresent = checks.every((c) => c.present);

  return (
    <section>
      <SectionHead
        n="§3"
        title="Standing employee-conflict statement — recorded once, cited everywhere"
        note={(
          <>
            Applies to every engagement, every offer, every jurisdiction: the predicate is a
            constant, not a condition someone can fail to meet. Quoted here in full as of
            {' '}{stamp(props.asOf)}.
          </>
        )}
      />
      {template === null ? (
        <Notice tone="blocked" testid="standing-missing" title="The standing statement is not in the library">
          {`No template with id "${STANDING_ID}" was found. This screen will not paraphrase it.`}
        </Notice>
      ) : (
        <>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={TH}>Limit</th>
                  <th className={TH}>Stated in the text?</th>
                  <th className={TH}>Verified how</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.promise} data-testid={`promise-${c.promise}`}>
                    <td className={clsx(TD, 'font-semibold')}>{PROHIBITED_PROMISE_LABEL[c.promise]}</td>
                    <td className={clsx(TD, 'font-bold', c.present ? 'text-status-ready' : 'text-status-blocked')}>
                      {c.present ? 'YES' : 'NO — THE STATEMENT IS INCOMPLETE'}
                    </td>
                    <td className={clsx(TD, 'text-grey')}>
                      exact substring match of PROHIBITED_PROMISE_SENTENCE[{c.promise}] against the
                      compiled template text, at render time
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!allPresent && (
            <Notice tone="blocked" testid="standing-incomplete" title="Do not issue this statement">
              One or more of the four limits is not present in the compiled text. The statement is
              supposed to be composed from those sentences; if this fires, the composition was
              broken by an edit and the wording must be fixed before it is given to anyone.
            </Notice>
          )}
          <Verbatim
            label={`${template.id} v${template.version} — standing statement, quoted in full`}
            text={template.text}
            testid="standing-statement-text"
          />
        </>
      )}
    </section>
  );
}

/** Every gate in order, including the ones never reached. Skipped ≠ passed. */
function GateLadder(props: { gate: ServiceGateDecision }) {
  return (
    <div className="mt-2">
      <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-grey">
        Gate ladder — skipped is not passed
      </div>
      <table className="mt-0.5 w-full border-collapse">
        <tbody>
          {props.gate.gates.map((g) => (
            <tr key={g.code}>
              <td className={clsx(TD, 'w-6 font-bold', g.skipped ? 'text-grey' : g.passed ? 'text-status-ready' : 'text-status-blocked')}>
                {g.skipped ? '·' : g.passed ? '✓' : '✕'}
              </td>
              <td className={clsx(TD, 'w-52 whitespace-nowrap text-grey')}>{g.code}</td>
              <td className={TD}>
                {g.skipped ? <span className="uppercase text-grey">not reached — {g.detail}</span> : g.detail}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── §4 THE JURISDICTION PERIMETER ─────────────────────────────────────────── */

interface PerimeterCell {
  offer: OfferKey;
  gate: ServiceGateDecision;
  entry: PerimeterEntry | null;
}

/**
 * jurisdiction × offer, every cell evaluated, every refusal shown with the gate
 * that produced it.
 *
 * A hole in this grid would read as an oversight, so `perimeter.ts` gives every
 * offer in every listed jurisdiction a row and this section renders all of them.
 * The class is shown BESIDE the staleness, never folded into it (D3): a stale
 * `counsel_required` row still reports `counsel_required` — what changed is that it
 * no longer authorises anything, and that is a separate column.
 */
function PerimeterSection(props: { asOf: string; rows: WallRow[] | null }) {
  const groups = PERIMETER_PROFILES.map((p) => {
    const cells: PerimeterCell[] = OFFER_KEYS.map((offer) => {
      const gate = gateService({ jurisdiction: p.jurisdiction, offer, asOf: props.asOf });
      return { offer, gate, entry: gate.classification.entry };
    });
    const notes = new Set(cells.map((c) => c.entry?.note ?? ''));
    return { profile: p, cells, sharedNote: notes.size === 1 ? [...notes][0] : null };
  });

  // Jurisdictions the BOOK contains that the perimeter has never heard of. This is
  // the D2 case that matters commercially: work is already being quoted into a
  // place where nobody has recorded a position, and the only correct output is a
  // refusal that names the place.
  const seen = new Map<string, number>();
  for (const r of props.rows ?? []) {
    const raw = r.client?.jurisdiction?.trim() ?? '';
    const key = normaliseJurisdiction(raw);
    const known = key ? PERIMETER_PROFILES.some((p) => p.jurisdiction === key) : false;
    if (!known) {
      const label = raw || '(not recorded on the client)';
      seen.set(label, (seen.get(label) ?? 0) + 1);
    }
  }
  const unlisted = [...seen.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return (
    <section>
      <SectionHead
        n="§4"
        title="Jurisdiction perimeter — human-entered, sourced, dated, expiring"
        note={(
          <>
            {`Evaluated as of ${stamp(props.asOf)}. A row starts warning ${PERIMETER_REVIEW_WARNING_DAYS} days before its `}
            review date and BLOCKS once past it — an expiry is not a grace period. An unlisted
            jurisdiction classifies <span className="font-bold">unknown</span>, which is a third
            thing: not permitted, and deliberately not prohibited either, because calling it
            prohibited would be inventing a legal conclusion in the safe direction and that is still
            inventing one. Nothing on this screen originates a regulatory position; it enforces the
            record a qualified human left and refuses when there is none.
          </>
        )}
      />

      {/*
        THE ONE THING THIS SECTION COULD BE WRONG ABOUT, said out loud.

        Everything below is evaluated from the COMPILED perimeter in
        `packages/shared/src/gps/perimeter.ts` — reviewed policy in code, which is
        why it needs no server and cannot disagree with itself. But a sibling
        Phase 9 server path also exists: `apps/api/src/gps/conflict.ts` loads a
        perimeter from a database table added by migration 0050 and falls back to
        these same compiled placeholders when it is absent
        (`PERIMETER_SOURCE_REASON`, `conflict.ts:217`), and a human can enter and
        review positions through `POST /v1/gps/conflict/perimeter`. The moment a
        real position is entered there, THAT record is authoritative and this
        section is out of date — and the failure mode would be this page calling a
        reviewed position "UNREVIEWED", which is a lie in the direction people stop
        believing.

        RECONCILED: `PerimeterView` moved to `packages/shared/src/gps/perimeterView.ts`
        exactly as this comment prescribed, and `<PerimeterReviewPanel/>` above the
        disclosures banner reads the database-backed view through it — one declaration,
        both sides, no hand-mirroring (the defect that shipped a guaranteed crash with
        a green build once, `lib/api/gps.ts:80`). This compiled section remains as the
        fallback the API itself falls back to when 0050 is absent. Until
        then this notice is on the artifact, because a reader is entitled to know
        which of two possible perimeters they are looking at.
      */}
      <Notice tone="conditional" testid="perimeter-source-caveat" title="This grid is the COMPILED perimeter, not a database read">
        Rows come from reviewed policy in code (packages/shared/src/gps/perimeter.ts). A
        database perimeter also exists in the Phase 9 server path (migration 0050, entered via
        POST /v1/gps/conflict/perimeter); if any position has been entered there, IT is
        authoritative and this section does not read it. Check GET /v1/gps/conflict/perimeter
        before relying on this grid, and treat a disagreement between them as the database
        being right.
      </Notice>

      {groups.map((g) => (
        <div key={g.profile.jurisdiction} className="mt-3">
          <div className="flex flex-wrap items-baseline gap-x-2 border-b border-line pb-0.5">
            <span className="font-mono text-label font-bold uppercase tracking-wider">
              {g.profile.label}
            </span>
            <span className="font-mono text-micro text-grey">key: {g.profile.jurisdiction}</span>
            <span className="ml-auto font-mono text-micro font-bold uppercase tracking-wider text-status-blocked">
              {g.cells.every((c) => !c.gate.allowed) ? 'every offer refused' : 'mixed'}
            </span>
          </div>
          {g.sharedNote !== null && g.sharedNote !== '' && (
            <Verbatim
              label={`${g.profile.label} — the entering human's note, identical for all ${g.cells.length} offers`}
              text={g.sharedNote}
              testid={`perimeter-note-${g.profile.jurisdiction}`}
            />
          )}
          <div className="mt-1 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={TH}>Offer</th>
                  <th className={TH}>Recorded<br />class</th>
                  <th className={TH}>Reviewed<br />by a human?</th>
                  <th className={TH}>Entered<br />by</th>
                  <th className={TH}>Source<br />cited</th>
                  <th className={TH}>Entered<br />at</th>
                  <th className={TH}>Expires<br />(review by)</th>
                  <th className={TH}>Days past<br />review</th>
                  <th className={TH}>Perimeter<br />status</th>
                  <th className={TH}>Blocking?</th>
                  <th className={TH}>Gate refusal, and what would clear it</th>
                </tr>
              </thead>
              <tbody>
                {g.cells.map((c) => {
                  const cl = c.gate.classification;
                  return (
                    <tr
                      key={c.offer}
                      data-testid={`perimeter-row-${g.profile.jurisdiction}-${c.offer}`}
                      className={clsx(cl.stale && 'bg-status-blocked-bg')}
                    >
                      <td className={clsx(TD, 'font-semibold')}>{getOffer(c.offer).name}</td>
                      <td className={TD}>
                        {cl.serviceClass === 'unknown'
                          ? <span className="font-bold text-status-blocked">UNKNOWN</span>
                          : SERVICE_CLASS_LABEL[cl.serviceClass]}
                      </td>
                      <td className={TD}>
                        {c.entry?.reviewed
                          ? <span className="text-status-ready">reviewed</span>
                          : <span className="font-bold text-status-blocked">UNREVIEWED</span>}
                      </td>
                      <td className={TD}>
                        {c.entry?.enteredBy === 'UNASSIGNED' || !c.entry
                          ? <span className="font-bold text-status-blocked">NOBODY</span>
                          : c.entry.enteredBy}
                      </td>
                      <td className={clsx(TD, 'whitespace-normal')}>{c.entry?.source ?? '—'}</td>
                      <td className={clsx(TD, 'tabular-nums')}>{day(c.entry?.enteredAt)}</td>
                      <td className={clsx(TD, 'tabular-nums')}>{day(c.entry?.reviewBy)}</td>
                      <td className={clsx(TD, 'tabular-nums')}>
                        {cl.daysPastReview === null ? '—' : cl.daysPastReview}
                      </td>
                      <td className={TD}>
                        <span className={clsx('font-bold', cl.stale ? 'text-status-blocked' : cl.expiringSoon ? 'text-status-conditional' : 'text-grey-dark')}>
                          {cl.stale ? 'STALE' : cl.expiringSoon ? 'EXPIRING SOON' : PERIMETER_STATUS_LABEL[cl.status]}
                        </span>
                        <div className="text-grey">{PERIMETER_STATUS_LABEL[cl.status]}</div>
                      </td>
                      <td className={TD}>
                        <span className={clsx('font-bold', c.gate.allowed ? 'text-status-ready' : 'text-status-blocked')}>
                          {c.gate.allowed ? 'no — may quote' : 'YES — BLOCKING'}
                        </span>
                      </td>
                      <td className={clsx(TD, 'whitespace-normal')}>
                        {c.gate.code && <div className="font-bold">{c.gate.code}</div>}
                        {c.gate.reason && <div>{c.gate.reason}</div>}
                        <div className="text-grey">
                          REMEDY: {c.gate.remedy ?? 'none — the honest answer is do not do this work'}
                          {' · '}{c.gate.recoverable ? 'recoverable (a task)' : 'NOT recoverable (a wall)'}
                        </div>
                        {cl.defects.length > 0 && (
                          <div className="mt-0.5 font-bold text-status-blocked">
                            MALFORMED: {cl.defects.join(' ')}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="mt-3">
        <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-grey">
          Jurisdictions in the book that the perimeter does not cover
        </div>
        {props.rows === null ? (
          <div className="py-1 font-mono text-micro text-grey">Loading the book…</div>
        ) : unlisted.length === 0 ? (
          <div className="py-1 font-mono text-micro text-grey">
            None — every engagement&apos;s client jurisdiction matches a listed profile. That is a
            statement about coverage, not about permission:{' '}
            {/* DERIVED. This sentence used to read "every listed row is still unreviewed"
                as literal JSX — true on the day it was written, and a lie the moment a
                second human reviews one row. `PerimeterEntry.reviewed` is itself derived
                from `reviewed_at` being non-null, so this counts the same field the
                matrix renders. */}
            {(() => {
              const all = groups.flatMap((g) => g.cells);
              const unreviewed = all.filter((c) => !c.entry?.reviewed).length;
              if (all.length === 0) return 'no rows are listed at all.';
              if (unreviewed === all.length) {
                return `all ${all.length} listed rows are still unreviewed.`;
              }
              if (unreviewed === 0) {
                return `all ${all.length} listed rows have been reviewed — permission still depends on the class recorded and on the engagement's own facts.`;
              }
              return `${unreviewed} of ${all.length} listed rows are still unreviewed.`;
            })()}
          </div>
        ) : (
          <table className="mt-0.5 w-full border-collapse" data-testid="perimeter-unlisted">
            <thead>
              <tr>
                <th className={TH}>Jurisdiction, as a human typed it on the client</th>
                <th className={TH}>Engagements</th>
                <th className={TH}>Position</th>
              </tr>
            </thead>
            <tbody>
              {unlisted.map(([label, n]) => (
                <tr key={label}>
                  <td className={clsx(TD, 'font-semibold')}>{label}</td>
                  <td className={clsx(TD, 'tabular-nums')}>{n}</td>
                  <td className={clsx(TD, 'font-bold text-status-blocked')}>
                    UNKNOWN — nobody has recorded a position. Refused, and not a finding either way.
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/* ── §5 SECOND-TIER SESSIONS ───────────────────────────────────────────────── */

/**
 * Who came in on the shared passcode.
 *
 * A shared secret you cannot observe is worse than one you can. `SECONDARY_PASSCODE`
 * admits any @lcx.com address without a roster edit and without a deploy (45990fa),
 * which is a deliberate, reaffirmed decision — and the guardrail that came with it
 * is that its use is recorded (`apps/api/src/lib/secondTier.ts`). This section is
 * the only place that record is visible to a human.
 *
 * FIVE OUTCOMES, AND NO TWO OF THEM MEAN THE SAME THING. An endpoint that is not
 * mounted is not an empty log; a 403 is not an empty log; an empty log is not
 * "nobody entered", because the store is in memory and a restart forgets it. Each
 * state says which one it is, in a sentence, on the page.
 *
 * The non-roster subset — the number that says ROTATE — arrives already computed
 * against the `TEAM` roster (`gps/conflict.ts:1454`). It is deliberately not
 * derived here from `/v1/access/matrix`: that endpoint is approver-only and can
 * answer with no members before 0042 (`routes/access.ts:21`), so a browser-side
 * comparison would silently measure membership against an empty set and print an
 * all-clear derived from nothing.
 *
 * `limits` is rendered VERBATIM and in full. The server carries those sentences so
 * that a surface cannot overstate what this log is, and editing them down to fit a
 * layout would defeat the only purpose they have.
 */
function SecondTierSection(props: { secondTier: SecondTier }) {
  const st = props.secondTier;
  const unexpectedSet = st.state === 'ready'
    ? new Set(st.view.unexpected.map((u) => u.email))
    : null;

  return (
    <section>
      <SectionHead
        n="§5"
        title="Second-tier sessions — who entered on the shared passcode"
        note={(
          <>
            Sign-in to this desk is a SHARED passcode, and a second shared passcode admits any
            @lcx.com address. That makes every &quot;decided by&quot; in §1 a record of a credential,
            not of a person. The number to watch is the count of addresses NOT on the roster: a
            passcode leaks by spreading, and spreading looks exactly like an address nobody
            expected.
          </>
        )}
      />

      {st.state === 'loading' && (
        <div className="py-2 font-mono text-micro text-grey">Reading the session log…</div>
      )}

      {st.state === 'not_mounted' && (
        <Notice tone="blocked" testid="second-tier-not-mounted" title="NOT OBSERVABLE — the log is recorded and not exposed">
          {`The API returned 404 for ${SECOND_TIER_ENDPOINT}. The handler exists in the repo — `}
          {'apps/api/src/routes/gpsConflict.ts:622, serving secondTierView() — and that router '}
          {'mounts itself nowhere, because app.ts belongs to a human wiring pass. Until it is '}
          {'composed into gpsRoutes, this wall CANNOT show who has entered on the shared passcode. '}
          {'Read that as an unobserved credential, not an unused one: the two look identical from '}
          {'here and only one of them is safe.'}
        </Notice>
      )}

      {st.state === 'forbidden' && (
        <Notice tone="conditional" testid="second-tier-forbidden" title="Approver-only — this session may not read the session log">
          {'The endpoint returned 403. It is restricted to approvers on purpose: the list of '}
          {'non-roster addresses is exactly what someone who should not be here would want to '}
          {'check before deciding whether they have been noticed, and second-tier sign-in can '}
          {'never itself be an approver (middleware/auth.ts:94). An approver must print this '}
          {'section; nothing below should be read as "no unexpected addresses".'}
        </Notice>
      )}

      {st.state === 'failed' && (
        <Notice tone="blocked" testid="second-tier-failed" title="The session log could not be read">
          {st.message}
          {' — treat the shared passcode as unobserved for the period this page covers.'}
        </Notice>
      )}

      {st.state === 'malformed' && (
        <Notice tone="blocked" testid="second-tier-malformed" title="The session payload did not match the contract">
          {`${st.message}. Nothing is rendered from it, deliberately: this screen mirrors `}
          {'SecondTierView (apps/api/src/gps/conflict.ts:1425) because that interface is server '}
          {'code and cannot be imported into a browser bundle, and a hand-mirrored response shape '}
          {'is what shipped a guaranteed crash with a green build the last time GPS met real data '}
          {'(lib/api/gps.ts:80). Reconcile those two declarations; do not adjust this screen until '}
          {'they agree.'}
        </Notice>
      )}

      {st.state === 'ready' && (
        <>
          <div className="mt-1 font-mono text-micro tabular-nums text-grey" data-testid="second-tier-summary">
            SECOND DOOR{' '}
            <span className={clsx('font-bold', st.view.configured ? 'text-status-conditional' : 'text-grey-dark')}>
              {st.view.configured ? 'OPEN — SECONDARY_PASSCODE is set' : 'closed — no secondary passcode configured'}
            </span>
            {' · '}ADDRESSES SEEN {st.view.usage.length}
            {' · '}ROSTER {st.view.rosterEmailCount}
            {' · '}
            <span className={clsx(st.view.unexpected.length > 0 && 'font-bold text-status-blocked')}>
              NOT ON THE ROSTER {st.view.unexpected.length}
            </span>
            {st.view.rotateAdvised && (
              <span className="font-bold text-status-blocked"> · ROTATE THE PASSCODE</span>
            )}
            {' · '}OBSERVED AS OF {stamp(st.view.asOf)}
          </div>

          {st.view.usage.length === 0 ? (
            <div className="py-1 font-mono text-micro text-grey" data-testid="second-tier-empty">
              No second-tier sign-in has been recorded SINCE THIS API PROCESS STARTED. That is not
              the same as none ever, and this screen cannot tell you which it is.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={TH}>Address</th>
                    <th className={TH}>On the roster?</th>
                    <th className={TH}>First seen</th>
                    <th className={TH}>Last seen</th>
                    <th className={TH}>Entries</th>
                  </tr>
                </thead>
                <tbody>
                  {st.view.usage.map((s) => {
                    const off = unexpectedSet?.has(s.email) ?? false;
                    return (
                      <tr key={s.email} className={clsx(off && 'bg-status-blocked-bg')}>
                        <td className={clsx(TD, 'font-semibold')}>{s.email}</td>
                        <td className={TD}>
                          {off
                            ? <span className="font-bold text-status-blocked">NOT ON THE ROSTER</span>
                            : <span className="text-status-ready">on the roster</span>}
                        </td>
                        <td className={clsx(TD, 'tabular-nums')}>{stamp(s.firstSeen)}</td>
                        <td className={clsx(TD, 'tabular-nums')}>{stamp(s.lastSeen)}</td>
                        <td className={clsx(TD, 'tabular-nums')}>{s.count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-2">
            <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-status-conditional">
              What this log is not — carried from the server, verbatim
            </div>
            <ol className="mt-0.5 list-decimal space-y-0.5 pl-4 font-mono text-micro leading-relaxed text-grey-dark" data-testid="second-tier-limits">
              {st.view.limits.map((l) => <li key={l}>{l}</li>)}
            </ol>
          </div>
        </>
      )}
    </section>
  );
}

/* ── Print (D7) ────────────────────────────────────────────────────────────── */

/**
 * Wall-specific print rules, on top of the shared app-chrome reset in
 * `PrintStyles` (which hides header/aside/footer, unlocks the scroll containers,
 * pins the light tokens so a dark session does not print white-on-white, and sets
 * A4 with 12mm margins).
 *
 * What is added here is what a WALL needs and a report does not:
 *  · nothing that scrolls. `overflow-x-auto` regions clip in print, so a wide table
 *    would silently lose its right-hand columns — including, on §1, the gate column.
 *    A printed compliance artifact missing columns is worse than one that is ugly.
 *  · rows do not break across pages, and every table repeats its header on each
 *    sheet, so a row's position is never separated from the column that names it.
 *  · the verbatim blocks keep their border and never collapse whitespace: the
 *    disclosure wording is the artifact, and its line breaks are part of it.
 */
function WallPrintStyles() {
  const css = `
@media print {
  .br-no-print { display: none !important; }
  /* Scrollable regions clip in print; unlock them or lose columns silently. */
  .overflow-x-auto { overflow: visible !important; }
  /* EVERY row's evidence prints, open or not. Forced here rather than left to
     Tailwind's \`print:\` variant beating \`hidden\`, because the completeness of a
     handed-over artifact should not depend on utility-class ordering. */
  .wall-evidence { display: table-row !important; }
  table { width: 100% !important; page-break-inside: auto; }
  thead { display: table-header-group; }
  tr, pre { page-break-inside: avoid; }
  section { page-break-inside: auto; }
  h2 { page-break-after: avoid; }
  /* The wording is the artifact. Keep every line break and the frame around it. */
  pre {
    white-space: pre-wrap !important;
    border-left: 2px solid #999 !important;
    background: #fff !important;
  }
  td, th { border-color: #999 !important; }
}`;
  return <style data-testid="wall-print-styles">{css}</style>;
}
