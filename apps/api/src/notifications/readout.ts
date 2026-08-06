import { WORKSPACES } from '@lcx/shared';
import { env } from '../lib/env.js';
import { listNotifications, type NotificationScope } from './service.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE 07:00 READOUT — one ranked brief per reader, where the redaction is VISIBLE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * WHAT IS WRONG WITH EVERY OTHER SURFACE HERE. They all wait to be asked. The
 * operator has to remember to go and look, on eight compartments, at whichever of
 * the 167 pages happens to hold the thing that changed. Nothing is TOLD to anybody.
 *
 * This inverts that: one column, one filter, one rank, computed per reader.
 *
 * AND THE REDACTION IS PART OF THE BRIEF, not a thing the brief hides. It says
 * "3 items withheld" rather than silently showing a shorter list, because a
 * compartmented system that conceals the fact that it is concealing something is
 * indistinguishable — from the reader's chair — from a system with nothing in it.
 * The count is the governance fact; the rows are not. That distinction is already
 * computed for us: `listNotifications` returns `withheld` and `unattributed`
 * alongside the items, and this module's job is to SURFACE them rather than to
 * re-derive them.
 *
 * ── COMPOSED, NOT REIMPLEMENTED ──────────────────────────────────────────────
 * Every read goes through `notifications/service.ts`. That file is P0's verified
 * fix for a live need-to-know leak: before 0067 the bell was `SELECT … FROM
 * notifications ORDER BY created_at DESC LIMIT n` with NO filter, so every
 * operator saw every compartment. Its `scopeList()` emits one BOUND PARAMETER per
 * scope and never concatenates. A second query path here — even a careful one —
 * would be a second place for that leak to come back, so there is no SQL in this
 * file at all.
 *
 * ── THE 07:00 IN THE NAME IS AN INTENTION, NOT A CLAIM ───────────────────────
 * NOTHING FIRES THIS AT 07:00. There is no scheduler, no cron entry, no job. It is
 * a computed surface that is correct whenever it is asked for, and `frame.scheduled`
 * is the literal `false` with READOUT_NOT_SCHEDULED emitted on EVERY payload so the
 * absence cannot be read past. For it to be true there would have to be: a
 * scheduled trigger per reader (the jobs CLI runs `evaluateAlertRules` daily and is
 * the obvious host); a delivery channel that is not this HTTP response; and a
 * record of what was sent to whom, because a brief nobody can prove was delivered
 * is not a brief. `wbr_reports` is the precedent being deliberately avoided: it has
 * ONE row and its "schedule" is a COMMENT, which is why RECESSION RATE was dropped
 * from the programme as unmeasurable. A capability that claims a cadence it does
 * not have is the exact defect this platform is being rebuilt to remove.
 *
 * ── THE RANK, WHICH IS THE PART THAT COULD MOST EASILY LIE ───────────────────
 * IT IS RECENCY, AND IT SAYS SO — in the payload, not only in this comment.
 * `notifications` carries no severity, no weight and no consequence: a row is a
 * rule name, a title, a compartment and an instant. So the only ordering with a
 * real denominator behind it is the instant, and `ranking.basis` is `'recency'`.
 *
 * WHAT THAT AVOIDS. Ranking by how often a rule fires and presenting the result as
 * how much each item matters is a fabrication this platform has already shipped
 * once (COMMAND presented criticality as a frequency). `access/controlRegister.ts`
 * can honestly rank by consequence because its rows carry findings whose weights
 * are published and attackable; a bell row carries nothing of the kind, so a score
 * here would be a number with no arithmetic behind it. `ranking.notRankedBy` names
 * each rejected basis and why, so the choice is arguable rather than implicit.
 */

export const READOUT_CONTRACT = 'notifications.readout.v1';

/** Stable refusal codes. Each is registered in docs/phases/ABSENCES.md by the lead. */
export const READOUT_CODES = {
  /** The notifications relation does not exist here (42P01). NOT LOADED. */
  LEDGER_ABSENT: 'READOUT_LEDGER_ABSENT',
  /** The ledger read failed for any other reason. Still NOT LOADED, different fault. */
  READ_FAILED: 'READOUT_READ_FAILED',
  /** Rows exist in compartments this reader does not hold. The visible redaction. */
  ITEMS_WITHHELD: 'READOUT_ITEMS_WITHHELD',
  /** Rows with no compartment recorded — withheld from EVERYONE, counted so they survive. */
  UNATTRIBUTED_ITEMS: 'READOUT_UNATTRIBUTED_ITEMS',
  /** The read succeeded and the window holds nothing. A claim about a window, stated as one. */
  WINDOW_GENUINELY_EMPTY: 'READOUT_WINDOW_GENUINELY_EMPTY',
  /** The fetch cap was reached inside the window, so the order is over a subset. */
  TRUNCATED: 'READOUT_TRUNCATED',
  /** An item's instant could not be read, so it has no place in a recency order. */
  ITEM_INSTANT_UNREADABLE: 'READOUT_ITEM_INSTANT_UNREADABLE',
  /** The ledger returned a row outside the reader's scopes. Dropped, and said aloud. */
  SCOPE_MISMATCH: 'READOUT_SCOPE_MISMATCH',
  /** Nothing fires this at 07:00. Emitted on every payload. */
  NOT_SCHEDULED: 'READOUT_NOT_SCHEDULED',
  /** The database this was read from cannot be named. */
  ENVIRONMENT_UNNAMED: 'READOUT_ENVIRONMENT_UNNAMED',
  /** The window or the cap that was asked for is not the one that was applied. */
  OPTIONS_CLAMPED: 'READOUT_OPTIONS_CLAMPED',
} as const;

export type ReadoutCode = (typeof READOUT_CODES)[keyof typeof READOUT_CODES];

/*
 * Everything between the markers below is mirrored in `apps/web/src/lib/api/readout.ts`
 * and the two sides are compared FIELD BY FIELD by `__tests__/readout.test.ts`. The
 * markers bound that comparison, so nothing that is not wire shape may live between
 * them — and they are LINE comments on purpose: slicing a file on a marker that sits
 * inside a block comment leaves an unbalanced `*​/` behind, and the comment-stripping
 * step then eats the entire region. It did, and the ratchet passed against nothing.
 */
// CONTRACT:BEGIN

export interface ReadoutRule {
  readonly instrument: string;
  readonly provision: string;
  readonly text: string;
}

export interface ReadoutRefusal {
  readonly code: ReadoutCode;
  readonly sentence: string;
  readonly rule: ReadoutRule;
}

/* ── The contract ─────────────────────────────────────────────────────────────
 *
 * MIRRORED IN `apps/web/src/lib/api/readout.ts`, WHICH IS NOT WHERE IT BELONGS. It
 * belongs in `packages/shared` so both sides import ONE declaration; that barrel is
 * another lane's file this pass. `lib/api/gps.ts:60` carries the post-mortem of the
 * alternative — a hand-written copy claimed three fields the API had never returned,
 * `tsc` believed it because a copy is syntactically perfect, and the page's own test
 * agreed because it mocked the module. So the mirror is held by a source-level parity
 * assertion in `__tests__/readout.test.ts`, and moving this block into shared is owed
 * work rather than a finished decision.
 */

export type ReadoutRankingBasis = 'recency';

export interface RejectedBasis {
  readonly key: string;
  readonly why: string;
}

export interface ReadoutRanking {
  /** The literal 'recency'. The type forbids claiming an ordering this data cannot support. */
  readonly basis: ReadoutRankingBasis;
  readonly direction: 'newest_first';
  /** The column the order is actually computed from. */
  readonly field: 'notifications.created_at';
  readonly statement: string;
  /** Orderings considered and refused, each with its reason, so the choice is arguable. */
  readonly notRankedBy: readonly RejectedBasis[];
}

export interface ReadoutFrame {
  readonly observedAt: string;
  readonly windowFrom: string;
  readonly windowTo: string;
  readonly windowHours: number;
  /**
   * `kind:host/db` prefixed by the node environment, or `null` when the DSN cannot be
   * read. NEVER the string 'unknown': a sentinel satisfies a `string` type and once
   * shipped a price labelled 'unknown'.
   */
  readonly environment: string | null;
  readonly source: 'notifications';
  /** The compartments this brief was computed for. The counts are meaningless without it. */
  readonly scopes: readonly NotificationScope[];
  /** The literal `false`. Nothing fires this at 07:00 — see READOUT_NOT_SCHEDULED. */
  readonly scheduled: false;
  readonly deliveredBy: 'request';
  readonly scheduleStatement: string;
}

export interface ReadoutItem {
  /** 1-based position in the recency order. Not a priority. */
  readonly rank: number;
  readonly id: string;
  readonly rule: string;
  readonly title: string;
  readonly detail: string | null;
  readonly href: string | null;
  readonly workspace: NotificationScope;
  readonly createdAt: string;
  /** Hours between `createdAt` and `frame.observedAt`, to one decimal. Arithmetic, not a score. */
  readonly ageHours: number;
  readonly unread: boolean;
}

/**
 * An in-scope item whose instant could not be read. It is NOT ranked — a recency
 * order has no honest place for an item with no readable instant — and it is not
 * dropped either, because dropping it would make the list shorter for a reason the
 * reader cannot see, which is the failure this whole surface exists to prevent.
 */
export interface UnplaceableItem {
  readonly id: string;
  readonly rule: string;
  readonly title: string;
  readonly workspace: NotificationScope;
  /** What the ledger actually returned, verbatim. */
  readonly rawCreatedAt: string;
}

export interface ReadoutRedaction {
  readonly scopesHeld: readonly NotificationScope[];
  /** Compartments this reader does not hold, by id. From the public constitution. */
  readonly compartmentsNotHeld: readonly string[];
  /** Rows in compartments this reader does not hold. `null` = the ledger was not read. */
  readonly withheld: number | null;
  /** Rows with no compartment recorded. Withheld from everyone. `null` = not read. */
  readonly unattributed: number | null;
  /**
   * THE FRAME OF THE TWO COUNTS ABOVE, AND IT IS NOT THE WINDOW.
   *
   * `listNotifications` counts withheld and unattributed rows over the WHOLE
   * notifications table on purpose, "so they do not move when `limit` does"
   * (service.ts). That is a different frame from `counts.inWindow`, and publishing
   * both under one heading would let a reader subtract one from the other. Stated
   * rather than silently reconciled, and rather than re-derived here with a
   * window-scoped query that would be a second read path into the leaked table.
   */
  readonly countFrame: 'whole_ledger';
  readonly statement: string;
  /**
   * Items the ledger returned that are NOT in the reader's scopes. Must always be 0;
   * anything else is a leak in the service and is refused rather than rendered.
   */
  readonly droppedOutOfScope: number;
}

export interface ReadoutCounts {
  /** Items the ledger handed back, before the window filter. `null` = not read. */
  readonly fetched: number | null;
  /** Readable-instant, in-scope items inside the window. `null` = not read. */
  readonly inWindow: number | null;
  /** Items actually published in `items`. `null` = not read. */
  readonly shown: number | null;
  /**
   * Unread items within the reader's scopes. LEDGER-WIDE, like the redaction counts
   * and unlike `inWindow` — it is `listNotifications`'s own count and its frame is
   * the whole table. Named so it cannot be read as "unread in this window".
   */
  readonly unreadInScopeAllTime: number | null;
  /** In-scope items whose instant could not be read, so they are outside the order. */
  readonly unplaceable: number | null;
}

/**
 * THE FOUR STATES OF A BRIEF, WHICH ARE NEVER ONE STATE.
 *
 *  not_loaded      the ledger could not be read. Says nothing about the night.
 *  withheld_only   nothing readable in the window AND material exists this reader
 *                  may not see. Present-but-withheld.
 *  genuinely_empty the read ran, the reader holds compartments, and the window is
 *                  empty. A CLAIM about a window, and rendered as one.
 *  ranked          there are items, in recency order.
 */
export type ReadoutState = 'not_loaded' | 'withheld_only' | 'genuinely_empty' | 'ranked';

export interface Readout {
  readonly contract: typeof READOUT_CONTRACT;
  readonly state: ReadoutState;
  readonly frame: ReadoutFrame;
  readonly ranking: ReadoutRanking;
  /** `null` means NOT LOADED. `[]` means the window is empty — read `state` to tell which. */
  readonly items: readonly ReadoutItem[] | null;
  readonly unplaceable: readonly UnplaceableItem[];
  readonly counts: ReadoutCounts;
  readonly redaction: ReadoutRedaction;
  /** EVERY refusal that applies, not the first one found (marketingDesk.ts:1207-1214). */
  readonly refusals: readonly ReadoutRefusal[];
}

// CONTRACT:END

/* ── The rules the refusals cite ───────────────────────────────────────────────
 * Written once, because a refusal that cites a rule by paraphrase is a refusal whose
 * rule can drift away from every other citation of it. Outside the contract markers
 * because these are VALUES, not wire shape — the field names inside them
 * (instrument/provision/text) belong to `ReadoutRule` above.
 */
const RULE_ABSENT_REFUSES: ReadoutRule = {
  instrument: 'house_doctrine',
  provision: 'Absent data refuses',
  text:
    'Absent data refuses. It never renders 0, never an estimate, and never an empty list that reads '
    + 'as "nothing happened". A brief that could not be computed is NOT a brief saying the night was quiet.',
};

const RULE_THREE_STATES: ReadoutRule = {
  instrument: 'house_doctrine',
  provision: 'Three states are never collapsed',
  text:
    'Not-loaded, present-but-withheld and genuinely-empty are three different facts and are never '
    + 'collapsed into one empty list. Each is stated under its own code.',
};

const RULE_NEED_TO_KNOW: ReadoutRule = {
  instrument: 'workspace_constitution',
  provision: 'Need-to-know — the redaction is visible',
  text:
    'A reader is shown THAT material exists in a compartment they do not hold, and how much of it '
    + 'there is, and never what it says. A system that hides the fact that it is hiding something is '
    + 'indistinguishable from a system with nothing in it.',
};

const RULE_NO_LAUNDERED_INFERENCE: ReadoutRule = {
  instrument: 'house_doctrine',
  provision: 'An inference is never laundered into a certainty',
  text:
    'If you cannot know, say you cannot know. A ranking computed over a subset is reported as a '
    + 'ranking over a subset, and a cadence that nothing enforces is never described as a schedule.',
};

const RULE_FRAME: ReadoutRule = {
  instrument: 'house_doctrine',
  provision: 'Placeholders must look like placeholders',
  text:
    'Every figure carries an ObservationFrame — what was observed, when, over what window — and an '
    + 'environment label where it came from a database. A window that differs from the one requested '
    + 'is stated, never substituted quietly.',
};

/* ── Internals ─────────────────────────────────────────────────────────────── */

export const WINDOW_HOURS_BOUNDS = { min: 1, max: 720 } as const;
/** The service caps at 100 itself; this bound is stated so the clamp can be reported. */
export const FETCH_BOUNDS = { min: 1, max: 100 } as const;

const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_FETCH = 50;

/** 42P01 — the one fault the whole codebase reads as "the migration has not landed". */
function isMissingTable(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '42P01';
}

/**
 * A TIMESTAMP OR NOTHING — never a thrown RangeError, never a fabricated instant.
 *
 * `service.ts` maps `created_at` with `String(r.created_at)`, and `pg` parses
 * timestamptz into a `Date`, so what arrives here is normally a JS date string rather
 * than ISO. Both are re-read through ONE parser so the order and the published
 * `createdAt` cannot disagree, and anything unreadable becomes `null` — which routes
 * the item into `unplaceable` instead of into the middle of a recency order.
 */
function iso(raw: string): string | null {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * `nodeEnv · kind:host/db`, or `null` when the DSN cannot be read.
 *
 * SEMANTICS COPIED FROM `marks/mark.ts:752` — including the two that matter:
 * CREDENTIALS DO NOT SURVIVE (host and database name only), and an unparseable or
 * empty DSN returns `null` rather than the string 'unknown'. Copied rather than
 * imported because that function is not exported through
 * `packages/shared/src/index.ts`, which is another lane's file this pass;
 * `kpi/platformForecast.ts:284` carries the same copy for the same reason.
 */
function environmentLabel(databaseUrl: string | null | undefined): string | null {
  const raw = (databaseUrl ?? '').trim();
  if (raw === '') return null;
  try {
    const u = new URL(raw);
    const host = u.hostname;
    if (host === '') return null;
    const db = u.pathname.replace(/^\//, '');
    const where = db === '' ? host : `${host}/${db}`;
    const kind = /(^|\.)supabase\.(co|com|net)$/i.test(host)
      ? 'supabase'
      : host === 'localhost' || host === '127.0.0.1' || host === '::1'
        ? 'local'
        : 'external';
    return `${env.nodeEnv} · ${kind}:${where}`;
  } catch {
    return null;
  }
}

/**
 * Clamp, and REPORT the clamp. Same shape as `controlRegister.ts` for the same reason
 * recorded there: clamping silently swaps one wrong answer for another — a request for
 * a 0-hour window would publish an empty brief for a window that holds items, and the
 * reader would be told nothing about it.
 */
function clampOption(
  raw: number | undefined,
  fallback: number,
  bounds: { min: number; max: number },
): { value: number; clamped: false } | { value: number; clamped: true; requested: number | 'not a number' } {
  if (raw === undefined) return { value: fallback, clamped: false };
  if (!Number.isFinite(raw)) return { value: fallback, clamped: true, requested: 'not a number' };
  const truncated = Math.trunc(raw);
  const value = Math.min(Math.max(truncated, bounds.min), bounds.max);
  return value === raw ? { value, clamped: false } : { value, clamped: true, requested: raw };
}

export interface ReadoutOptions {
  /** Injected by tests; production passes nothing and gets the wall clock. */
  readonly now?: Date;
  readonly windowHours?: number;
  /** How many of the reader's most recent items to fetch before windowing. */
  readonly fetch?: number;
  /**
   * The DSN to derive the environment label from. Production passes nothing and gets
   * `env.databaseUrl`. It is a parameter at all so BOTH branches of the label —
   * nameable, and refused as unnameable — are reachable in a test without mocking the
   * env module, which is the same reason `kpi/platformForecast.ts:374` takes it.
   */
  readonly databaseUrl?: string;
}

/**
 * THE BRIEF FOR ONE READER.
 *
 * `scopes` is a REQUIRED argument with no default, exactly as every path in
 * `service.ts` is, and for the same reason: the unscoped default is what leaked.
 * The caller resolves it from the live grant table via `scopesFor(loadEntitlements())`.
 */
export async function composeReadout(
  scopes: readonly NotificationScope[],
  opts: ReadoutOptions = {},
): Promise<Readout> {
  const now = opts.now ?? new Date();

  const refusals: ReadoutRefusal[] = [];
  const refuse = (r: ReadoutRefusal) => {
    if (!refusals.some((x) => x.code === r.code)) refusals.push(r);
  };

  const win = clampOption(opts.windowHours, DEFAULT_WINDOW_HOURS, WINDOW_HOURS_BOUNDS);
  const fet = clampOption(opts.fetch, DEFAULT_FETCH, FETCH_BOUNDS);
  const windowHours = win.value;
  const fetchLimit = fet.value;
  if (win.clamped || fet.clamped) {
    const said: string[] = [];
    if (win.clamped) {
      said.push(
        `windowHours was requested as ${String(win.requested)} and applied as ${windowHours} `
        + `(bounds ${WINDOW_HOURS_BOUNDS.min}–${WINDOW_HOURS_BOUNDS.max})`,
      );
    }
    if (fet.clamped) {
      said.push(
        `fetch was requested as ${String(fet.requested)} and applied as ${fetchLimit} `
        + `(bounds ${FETCH_BOUNDS.min}–${FETCH_BOUNDS.max})`,
      );
    }
    refuse({
      code: READOUT_CODES.OPTIONS_CLAMPED,
      sentence:
        `${said.join('; ')}. Everything below describes the window that was ACTUALLY read, not the one `
        + 'that was asked for. A non-positive window would invert into the future and publish an empty '
        + 'brief for a period that holds items, so it is not honoured silently.',
      rule: RULE_FRAME,
    });
  }

  const windowTo = now.toISOString();
  const windowFrom = new Date(now.getTime() - windowHours * 3_600_000).toISOString();

  const environment = environmentLabel(opts.databaseUrl ?? env.databaseUrl);
  if (environment === null) {
    refuse({
      code: READOUT_CODES.ENVIRONMENT_UNNAMED,
      sentence:
        'The database these figures were read from cannot be named: no usable connection string is '
        + 'configured on this process. A figure read from a database must say WHICH database, so the '
        + 'environment label is null rather than a plausible-looking guess.',
      rule: RULE_FRAME,
    });
  }

  /*
   * THE 07:00 REFUSAL IS UNCONDITIONAL. It is not a fault and it is not conditional on
   * anything in the data — it is the standing statement that the name of this surface
   * describes an intention. Emitting it only "when relevant" is how a claimed schedule
   * becomes invisible, which is exactly what happened to `wbr_reports`.
   */
  const scheduleStatement =
    'NOTHING FIRES THIS AT 07:00. There is no scheduler, no cron entry and no delivery record: this '
    + 'brief was computed because it was requested, at the instant on the frame. For the name to be '
    + 'true there would have to be a per-reader scheduled trigger (the jobs CLI that already runs the '
    + 'daily alert sweep is the obvious host), a delivery channel that is not this HTTP response, and '
    + 'a record of what was sent to whom — because a brief nobody can prove was delivered is not a brief.';
  refuse({
    code: READOUT_CODES.NOT_SCHEDULED,
    sentence: scheduleStatement,
    rule: RULE_NO_LAUNDERED_INFERENCE,
  });

  const frame: ReadoutFrame = {
    observedAt: windowTo,
    windowFrom,
    windowTo,
    windowHours,
    environment,
    source: 'notifications',
    scopes,
    scheduled: false,
    deliveredBy: 'request',
    scheduleStatement,
  };

  const ranking: ReadoutRanking = {
    basis: 'recency',
    direction: 'newest_first',
    field: 'notifications.created_at',
    statement:
      'ORDERED BY RECENCY — newest first, on notifications.created_at, and by nothing else. This is '
      + 'NOT a severity order and not an importance order: the ledger records a rule name, a title, a '
      + 'compartment and an instant, so the instant is the only ordering with a real denominator behind '
      + 'it. Position 1 is the most recent item, not the most serious one.',
    notRankedBy: [
      {
        key: 'severity',
        why:
          'The notifications table has no severity, weight or priority column. Any severity here would '
          + 'be invented by this module and then read as if the alert had carried it.',
      },
      {
        key: 'frequency_as_magnitude',
        why:
          'How often a rule fires is not how much each firing matters. Presenting a count as a '
          + 'magnitude is a fabrication this platform has already shipped once — COMMAND presented '
          + 'criticality as a frequency — and it is named in the programme as a fabrication family.',
      },
      {
        key: 'consequence_score',
        why:
          'access/controlRegister.ts can rank by consequence because its rows carry findings whose '
          + 'weights are published and can be argued with. A bell row carries no such components, so a '
          + 'score computed here would be a number with no arithmetic behind it.',
      },
      {
        key: 'unread_first',
        why:
          'Unread is a fact about this READER\'s attention, not about the item. It is shown on every '
          + 'row and deliberately does not move the order, so the order means one thing only.',
      },
    ],
  };

  /** The compartments the reader does NOT hold, from the public workspace constitution. */
  const compartmentsNotHeld = WORKSPACES.map((w) => w.id).filter((id) => !scopes.includes(id));

  /* ── The one read ────────────────────────────────────────────────────────── */

  let page: Awaited<ReturnType<typeof listNotifications>> | null = null;
  try {
    page = await listNotifications(scopes, fetchLimit);
  } catch (err) {
    /*
     * NOT LOADED, IN TWO FLAVOURS, AND NEITHER OF THEM IS AN EMPTY BRIEF. 42P01 means
     * the relation is not on this environment; anything else is a genuine fault. Both
     * produce `items: null`, and the state is the thing that must never read as "the
     * night was quiet".
     */
    const absent = isMissingTable(err);
    refuse({
      code: absent ? READOUT_CODES.LEDGER_ABSENT : READOUT_CODES.READ_FAILED,
      sentence: absent
        ? 'There is no notifications relation on this environment, so no item could be examined at all. '
          + 'This brief is NOT LOADED — it is not a report that nothing happened.'
        : 'The notifications ledger could not be read on this environment. This brief is NOT LOADED: it '
          + 'describes a failed read, not a quiet window, and the absence of items below is the absence '
          + 'of a read.',
      rule: RULE_ABSENT_REFUSES,
    });
    return {
      contract: READOUT_CONTRACT,
      state: 'not_loaded',
      frame,
      ranking,
      items: null,
      unplaceable: [],
      counts: {
        // EVERY count is null. Not 0 — a fabricated zero here is a claim that the
        // window was examined and found empty, which is the one thing that did not happen.
        fetched: null,
        inWindow: null,
        shown: null,
        unreadInScopeAllTime: null,
        unplaceable: null,
      },
      redaction: {
        scopesHeld: scopes,
        compartmentsNotHeld,
        withheld: null,
        unattributed: null,
        countFrame: 'whole_ledger',
        statement:
          'How much material exists in compartments you do not hold is UNKNOWN here, because the ledger '
          + 'that holds the count could not be read. Unknown is not zero.',
        droppedOutOfScope: 0,
      },
      refusals,
    };
  }

  /* ── Scope belt-and-braces ───────────────────────────────────────────────── */

  /*
   * THE SERVICE ALREADY FILTERS, AND THIS CHECKS ANYWAY. `listNotifications` scopes
   * its item query, so in a correct system this drops nothing and `droppedOutOfScope`
   * is 0 forever. It exists because the failure being guarded is not hypothetical: the
   * pre-0067 read path returned every compartment's rows, and if that ever comes back
   * the readout must NOT be the surface that republishes them. A dropped row is
   * reported, never quietly removed — the count without the content is the same trade
   * the withheld count makes.
   */
  const held = new Set<string>(scopes);
  const inScope = page.items.filter((i) => held.has(i.workspace));
  const droppedOutOfScope = page.items.length - inScope.length;
  if (droppedOutOfScope > 0) {
    refuse({
      code: READOUT_CODES.SCOPE_MISMATCH,
      sentence:
        `${droppedOutOfScope} item(s) returned by the notifications ledger are in compartments this `
        + 'reader does not hold. They have been dropped from this brief and are reported as a count '
        + 'only. This is a fault in the read path, not a property of the data — the scoped query '
        + 'should make it impossible — and it is stated rather than silently corrected.',
      rule: RULE_NEED_TO_KNOW,
    });
  }

  /* ── Window, instants, and the order ─────────────────────────────────────── */

  const unplaceable: UnplaceableItem[] = [];
  const placed: Array<{ item: (typeof inScope)[number]; at: string }> = [];
  for (const i of inScope) {
    const at = iso(i.createdAt);
    if (at === null) {
      unplaceable.push({
        id: i.id,
        rule: i.rule,
        title: i.title,
        workspace: i.workspace,
        rawCreatedAt: i.createdAt,
      });
      continue;
    }
    placed.push({ item: i, at });
  }
  if (unplaceable.length > 0) {
    refuse({
      code: READOUT_CODES.ITEM_INSTANT_UNREADABLE,
      sentence:
        `${unplaceable.length} item(s) in your compartments carry a timestamp that could not be read as `
        + 'an instant, so they have no place in an order that IS recency. They are listed separately, '
        + 'unranked, rather than dropped or given a plausible position in the list.',
      rule: RULE_NO_LAUNDERED_INFERENCE,
    });
  }

  const inWindow = placed.filter((p) => p.at >= windowFrom && p.at <= windowTo);
  // ONE RANK. Newest first, tie-broken by id so the order is stable across two
  // requests one second apart rather than dependent on the plan.
  inWindow.sort((a, b) => b.at.localeCompare(a.at) || a.item.id.localeCompare(b.item.id));

  const items: ReadoutItem[] = inWindow.map((p, idx) => ({
    rank: idx + 1,
    id: p.item.id,
    rule: p.item.rule,
    title: p.item.title,
    detail: p.item.detail,
    href: p.item.href,
    workspace: p.item.workspace,
    createdAt: p.at,
    ageHours: Math.round(((now.getTime() - new Date(p.at).getTime()) / 3_600_000) * 10) / 10,
    unread: p.item.readAt === null,
  }));

  /*
   * TRUNCATION, STATED PRECISELY RATHER THAN WHENEVER THE CAP IS HIT. The service
   * returns the reader's most recent `fetchLimit` rows with no window predicate, so the
   * window can only be short of items if the cap was reached AND the oldest row fetched
   * is still inside the window. Firing on "cap reached" alone would cry truncation at a
   * complete 24-hour brief every time the ledger held 50 older rows.
   */
  const oldestPlaced = placed.length > 0 ? placed[placed.length - 1]!.at : null;
  const truncated = page.items.length >= fetchLimit && oldestPlaced !== null && oldestPlaced >= windowFrom;
  if (truncated) {
    refuse({
      code: READOUT_CODES.TRUNCATED,
      sentence:
        `The fetch cap of ${fetchLimit} was reached and the oldest item fetched (${oldestPlaced}) is still `
        + 'inside this window, so the window holds an unknown number of further items that are not in this '
        + 'brief. The order below is a recency order over a SUBSET, and the bottom of it is not the '
        + 'beginning of the window. Narrow the window or raise the fetch cap to close the gap.',
      rule: RULE_NO_LAUNDERED_INFERENCE,
    });
  }

  /* ── The visible redaction ───────────────────────────────────────────────── */

  const withheld = page.withheld;
  const unattributed = page.unattributed;

  if (withheld > 0) {
    refuse({
      code: READOUT_CODES.ITEMS_WITHHELD,
      sentence:
        `${withheld} item(s) exist in compartments you do not hold (${compartmentsNotHeld.join(', ') || 'none named'}) `
        + 'and are NOT in this brief. You are told that they exist and how many there are; you are not '
        + 'told what they say. THIS COUNT IS OVER THE WHOLE LEDGER, NOT THIS WINDOW — it is the count '
        + 'notifications/service.ts computes so that it does not move when a page size does — so it is '
        + 'not a figure to subtract from the items above.',
      rule: RULE_NEED_TO_KNOW,
    });
  }

  if (unattributed > 0) {
    refuse({
      code: READOUT_CODES.UNATTRIBUTED_ITEMS,
      sentence:
        `${unattributed} item(s) in the ledger record NO compartment at all — legacy rows predating `
        + 'migration 0067. They are withheld from EVERYONE, including you, and they are counted here so '
        + 'they are not silently lost. "We do not know who may see this" is a different fact from '
        + '"everyone may see this", and this count is the one that keeps them apart. Ledger-wide, like '
        + 'the withheld count above.',
      rule: RULE_THREE_STATES,
    });
  }

  /* ── Which of the four states this is ───────────────────────────────────── */

  let state: ReadoutState;
  if (items.length > 0) {
    state = 'ranked';
  } else if (withheld > 0 || unattributed > 0) {
    /*
     * PRESENT-BUT-WITHHELD. Note carefully what this state does and does not assert:
     * material exists that this reader may not see (ledger-wide), and this window
     * produced nothing readable. It does NOT assert that the withheld material is
     * inside the window, because the count that proves it exists is not window-scoped.
     * Saying more than that would be the laundering this file refuses elsewhere.
     */
    state = 'withheld_only';
  } else {
    state = 'genuinely_empty';
    refuse({
      code: READOUT_CODES.WINDOW_GENUINELY_EMPTY,
      sentence:
        `The ledger was read and holds no item for your compartments (${scopes.join(', ')}) between `
        + `${windowFrom} and ${windowTo}. That is a CLAIM ABOUT THIS WINDOW and about nothing else: it is `
        + 'not a statement that the platform is healthy, that nothing needs your attention, or that '
        + 'anything outside this window is quiet. Nothing is withheld from you and no unattributed rows '
        + 'exist, which is what distinguishes this from a redacted brief.',
      rule: RULE_THREE_STATES,
    });
  }

  return {
    contract: READOUT_CONTRACT,
    state,
    frame,
    ranking,
    items,
    unplaceable,
    counts: {
      fetched: page.items.length,
      inWindow: items.length,
      shown: items.length,
      unreadInScopeAllTime: page.unread,
      unplaceable: unplaceable.length,
    },
    redaction: {
      scopesHeld: scopes,
      compartmentsNotHeld,
      withheld,
      unattributed,
      countFrame: 'whole_ledger',
      statement:
        withheld > 0 || unattributed > 0
          ? `${withheld} item(s) sit in compartments you do not hold and ${unattributed} record no `
            + 'compartment at all. Both counts are over the whole ledger rather than this window, and '
            + 'both are shown as counts without content: the fact that material exists is yours, the '
            + 'material is not.'
          : 'Nothing is being withheld from you in this ledger, and no row lacks a compartment. This is '
            + `stated as a fact about your scopes (${scopes.join(', ')}) — the compartments you do not `
            + `hold (${compartmentsNotHeld.join(', ') || 'none'}) simply contain no rows at all.`,
      droppedOutOfScope,
    },
    refusals,
  };
}
