import { request } from '../apiClient';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE 07:00 READOUT — the browser's view of the per-reader ranked brief.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ONE GET AND NOTHING ELSE. The brief points at items that already have their own
 * write paths — a notification is marked read at `POST /v1/notifications/:id/read`,
 * a decision is re-opened through the action registry — and a second write path from
 * a report is how two surfaces come to disagree about what "handled" means.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS FILE IS A MIRROR OF A CONTRACT THAT SHOULD NOT NEED MIRRORING.
 * ─────────────────────────────────────────────────────────────────────────────
 * The declaration lives at `apps/api/src/notifications/readout.ts` between its two
 * contract markers (spelled out only at the markers themselves, because the parity test
 * slices on them and a mention in prose is a second, silent marker — it was, and the
 * ratchet then compared the API against three characters of nothing). It belongs in
 * `packages/shared` so the API
 * composer and this module import ONE declaration and a copy is impossible — which is
 * the arrangement `lib/api/gps.ts:60` records the post-mortem of: a hand-written
 * `GpsSummary` in this directory claimed `counts`, `clientCount` and `openValueCents`,
 * the API had never returned any of the three, `tsc` believed the copy because a copy
 * is syntactically perfect, and the page's own test agreed with the copy because the
 * test mocked this module. Two artefacts agreeing with each other is not a contract.
 *
 * `packages/shared/src/index.ts` is another lane's file this pass, so the copy could
 * not be avoided — but it is not left on trust.
 * `apps/api/src/notifications/__tests__/readout.test.ts` reads BOTH files from disk,
 * slices each between its markers, strips comments, extracts 2-space-indented field
 * declarations and asserts the two name sets are EQUAL IN BOTH DIRECTIONS. Adding a
 * field here that the API does not return fails that test, and so does dropping one it
 * does. Moving this block into shared and deleting the mirror is still owed work.
 */

/*
 * Mirrored from apps/api/src/notifications/readout.ts. Field-for-field parity between
 * the markers is asserted by that file's test, so keep nothing but wire shape here. The
 * markers are LINE comments in both files deliberately — see the note on the API side
 * about what happens to a marker that lives inside a block comment.
 */
// CONTRACT:BEGIN

/**
 * The stable refusal codes. Typed as a union rather than `string` so a `switch` on the
 * page cannot silently miss one — but the payload's `code` is whatever the server sent,
 * and an unrecognised code must still RENDER (see the page's refusal panel).
 */
export type ReadoutCode =
  | 'READOUT_LEDGER_ABSENT'
  | 'READOUT_READ_FAILED'
  | 'READOUT_ITEMS_WITHHELD'
  | 'READOUT_UNATTRIBUTED_ITEMS'
  | 'READOUT_WINDOW_GENUINELY_EMPTY'
  | 'READOUT_TRUNCATED'
  | 'READOUT_ITEM_INSTANT_UNREADABLE'
  | 'READOUT_SCOPE_MISMATCH'
  | 'READOUT_NOT_SCHEDULED'
  | 'READOUT_NO_COMPARTMENTS_HELD'
  | 'READOUT_ENVIRONMENT_UNNAMED'
  | 'READOUT_OPTIONS_CLAMPED';

export interface ReadoutRule {
  instrument: string;
  provision: string;
  text: string;
}

export interface ReadoutRefusal {
  code: ReadoutCode;
  sentence: string;
  rule: ReadoutRule;
}

export type ReadoutRankingBasis = 'recency';

export interface RejectedBasis {
  key: string;
  why: string;
}

export interface ReadoutRanking {
  basis: ReadoutRankingBasis;
  direction: 'newest_first';
  field: 'notifications.created_at';
  statement: string;
  /** Orderings the server considered and refused, with reasons. Rendered, not hidden. */
  notRankedBy: RejectedBasis[];
}

export interface ReadoutFrame {
  observedAt: string;
  windowFrom: string;
  windowTo: string;
  windowHours: number;
  /** `null` means the database could not be named. NEVER the string 'unknown'. */
  environment: string | null;
  source: 'notifications';
  scopes: string[];
  /** The literal `false`. Nothing fires this at 07:00. */
  scheduled: false;
  deliveredBy: 'request';
  scheduleStatement: string;
}

export interface ReadoutItem {
  /** 1-based position in the recency order. NOT a priority. */
  rank: number;
  id: string;
  rule: string;
  title: string;
  detail: string | null;
  href: string | null;
  workspace: string;
  createdAt: string;
  ageHours: number;
  unread: boolean;
}

/** An in-scope item whose instant could not be read: unranked, and not dropped either. */
export interface UnplaceableItem {
  id: string;
  rule: string;
  title: string;
  workspace: string;
  rawCreatedAt: string;
}

export interface ReadoutRedaction {
  scopesHeld: string[];
  compartmentsNotHeld: string[];
  /** `null` = the ledger was not read. Never 0. */
  withheld: number | null;
  unattributed: number | null;
  /**
   * The frame of the two counts above, and it is NOT the window: they are counted over
   * the whole ledger so they do not move when a page size does. The page must not
   * arrange them next to a window count in a way that invites subtraction.
   */
  countFrame: 'whole_ledger';
  statement: string;
  /**
   * WHAT THE TWO COUNTS ABOVE TELL THIS READER ABOUT COMPARTMENTS THEY DO NOT HOLD:
   * that the withheld count is an aggregate (and whose counter it becomes when only one
   * compartment is unheld), that it carries no time bound, and that it moves as other
   * desks work so two reads yield a delta. Sent on EVERY payload — `withheld: 0` is a
   * statement about other compartments too — so the page renders it unconditionally and
   * never behind a control.
   */
  channelStatement: string;
  /** Items the ledger returned outside the reader's scopes. Must always be 0. */
  droppedOutOfScope: number;
}

/** EVERY count is nullable. `null` means the read did not happen — never 0. */
export interface ReadoutCounts {
  fetched: number | null;
  inWindow: number | null;
  shown: number | null;
  /** LEDGER-WIDE unread within the reader's scopes, not unread in this window. */
  unreadInScopeAllTime: number | null;
  unplaceable: number | null;
}

export type ReadoutState = 'not_loaded' | 'withheld_only' | 'genuinely_empty' | 'ranked';

export interface Readout {
  contract: string;
  state: ReadoutState;
  frame: ReadoutFrame;
  ranking: ReadoutRanking;
  /** `null` means NOT LOADED. `[]` means the window is empty — read `state` to tell which. */
  items: ReadoutItem[] | null;
  unplaceable: UnplaceableItem[];
  counts: ReadoutCounts;
  redaction: ReadoutRedaction;
  refusals: ReadoutRefusal[];
}

// CONTRACT:END

/**
 * GET /v1/readout.
 *
 * `windowHours` and `fetch` are passed through as the caller wrote them. They are NOT
 * pre-clamped here: the server owns the bounds and REPORTS a clamp as
 * READOUT_OPTIONS_CLAMPED, and clamping on this side would make the substitution
 * silent again — the browser would ask for 0 hours, receive a 24-hour brief, and have
 * nothing to say about the difference.
 */
export async function fetchReadout(params: {
  windowHours?: number;
  fetch?: number;
  signal?: AbortSignal;
} = {}): Promise<Readout> {
  const qs = new URLSearchParams();
  if (params.windowHours !== undefined) qs.set('windowHours', String(params.windowHours));
  if (params.fetch !== undefined) qs.set('fetch', String(params.fetch));
  const q = qs.toString();
  return request<Readout>(`/v1/readout${q ? `?${q}` : ''}`, { auth: true, signal: params.signal });
}
