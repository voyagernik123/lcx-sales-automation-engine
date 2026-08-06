import type pg from 'pg';
import { capAtLeast, type EntitlementMap, type WorkspaceId } from '@lcx/shared';
import { env } from '../lib/env.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE VERDICT BROKER — how one compartment learns THAT another holds something,
 *  and what that something MEANS for the asker, without ever reading it.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * THE PROBLEM THIS EXISTS FOR. Compartments on this platform are sealed, and they
 * are sealed for reasons that hold: `gps` carries a third party's confidential
 * commercial terms, `marketing`'s asset register IS inside information (MiCA Art
 * 90(1)), and both boundaries were closed by hand after they were found open
 * (`routes/audit.ts`, `access/entitlements.ts`). But a sealed compartment produces
 * its own failure: a GPS conflict check that cannot see the listing pipeline
 * reports "no conflict found" — a CLEAN answer — about an asset the desk is
 * negotiating a listing for. The seal turned a need-to-know boundary into a
 * FALSE NEGATIVE on a control.
 *
 * A REFUSAL THAT TELLS YOU SOMETHING EXISTS WITHOUT TELLING YOU WHAT IT IS, IS THE
 * DESIGN HERE, NOT A LIMITATION. That sentence is the whole module. The answer this
 * broker returns is deliberately less than the asker wants and deliberately more
 * than silence: a VERDICT the asker can act on, plus a COUNT of how many records
 * are being withheld, and nothing else. The asker learns it must stop; it does not
 * learn why, which event, whose decision, or when. Reading the count as a
 * limitation of the implementation gets it backwards — the count is there so that
 * "withheld" can never be mistaken for "nothing".
 *
 * ── COMPOSED, NOT INVENTED. Both halves already existed and are proven. ───────
 *  · SPEC-FILTERING BY ENTITLEMENT. `visibleGroups(specs, ents)` in
 *    `routes/search.ts` filters DECLARED groups by `capAtLeast(ents[ws], 'view')`
 *    BEFORE any query runs, so an unentitled compartment is never read at all
 *    rather than read-and-filtered. This module makes the same decision in the same
 *    order: entitlement, then authorisation, then — only then — a query.
 *  · VISIBLE WITHHOLDING. `routes/audit.ts` replaces a payload with an explicit
 *    `{ withheld: true, reason }` and replaces a disclosing id with the constant
 *    `'[withheld:marketing]'` — a constant and not a hash, because a stable digest
 *    would still let a reader correlate rows and count. The row still appears. That
 *    is how this platform already says "something is here and you may not see it",
 *    and this module says it with a code instead of a sentence so an alert can key
 *    off it.
 *
 * ── THE THREE STATES, AND WHY THE TYPE ENFORCES THEM ─────────────────────────
 * `not_loaded` HAS NO `withheldCount` FIELD AT ALL. Not `0`, not `null`. A caller
 * cannot read a zero out of a state that never looked, because there is no property
 * to read — the union makes it a compile error, and `__tests__/verdictBroker.test.ts`
 * asserts the absence with `in` at runtime for the JSON boundary. `empty` carries the
 * LITERAL `0` and a `null` verdict, and it carries the observation frame, because an
 * empty that cannot say when and where it looked is a claim rather than an
 * observation. `withheld` carries a verdict and a count that is always > 0.
 *
 * ── WHAT THIS MODULE REFUSES TO DO ───────────────────────────────────────────
 * It never returns a field, a row, an id or an error string from the holding
 * compartment. A probe hands back a verdict and a count and the broker copies
 * exactly those two values onto the answer; a probe's own `detail` is used for
 * nothing but the local decision, never for the payload. That is why `probe`
 * returns a narrow result type instead of rows.
 *
 * It never widens for a reader who ALSO holds the holder compartment. A verdict
 * whose meaning depends on who asked is not a verdict, and the caller that wants
 * contents has a door for that — the holding compartment's own read path, with its
 * own audit trail. Two doors with two traces beats one door with two behaviours.
 *
 * It never treats a contradiction as data. `holding` with a count of 0, a negative
 * count or a non-integer is reported as NOT-LOADED under a stable code, because the
 * only alternative — rounding it into `empty` — manufactures the exact false
 * negative this module was built to prevent.
 */

/* ── The codes. Stable strings: a dashboard, an alert and a regulator's report
 *    all key off them, so they are values and not messages. ─────────────────── */

export const VERDICT_BROKER_CODES = {
  /** The asking principal does not hold the ASKING compartment at `view`. */
  ASKER_NOT_ENTITLED: 'VERDICT_BROKER_ASKER_NOT_ENTITLED',
  /** The cross-compartment read itself is not authorised. The owner's decision. */
  CROSS_READ_NOT_AUTHORISED: 'VERDICT_BROKER_CROSS_READ_NOT_AUTHORISED',
  /** We tried to look and could not — missing table, dead connection, bad count. */
  HOLDER_UNAVAILABLE: 'VERDICT_BROKER_HOLDER_UNAVAILABLE',
  /** The subject the caller named cannot be used to ask the question. */
  SUBJECT_UNUSABLE: 'VERDICT_BROKER_SUBJECT_UNUSABLE',
  /** It exists, you may not see it. The count is the point. */
  WITHHELD: 'VERDICT_BROKER_WITHHELD',
  /** We looked, and the holder holds nothing about this subject. */
  NO_HOLDING: 'VERDICT_BROKER_NO_HOLDING',
} as const;

export type VerdictBrokerCode = (typeof VERDICT_BROKER_CODES)[keyof typeof VERDICT_BROKER_CODES];

const RULE_THREE_STATES =
  'House doctrine: three states are never collapsed — not-loaded / present-but-withheld / '
  + 'genuinely-empty. A compartment we were not permitted to read is NOT-LOADED and must '
  + 'never be reported as genuinely empty, because a control reading "nothing found" '
  + 'against a compartment it never opened is a false negative with a clean face.';

const RULE_DEFAULT_DENY =
  'House doctrine: absent data refuses, and a decision the owner has not taken is absent. '
  + 'A cross-compartment read ships default-deny under a stable code until it is '
  + 'authorised — never as a silent empty and never as a 0.';

const RULE_NEED_TO_KNOW =
  'access/entitlements.ts: an unknown principal is neither a machine nor a member, and '
  + 'unknown defaults to empty. routes/search.ts visibleGroups(): entitlement is decided '
  + 'BEFORE the query runs, so an unentitled compartment is never read.';

const RULE_NO_LAUNDERING =
  'House doctrine: an inference is never laundered into a certainty. A count the holder '
  + 'could not produce coherently is refused under a stable code, not rounded to zero.';

/* ── What a probe may return. Narrow ON PURPOSE. ───────────────────────────────
 *
 * A probe returns a VERDICT and a COUNT. It cannot return rows, and it therefore
 * cannot leak one by accident through a broker that spreads its result. `detail` is
 * for the probe author's own logging decision at the probe's own call site — this
 * module reads it for nothing and copies it nowhere.
 */
export type ProbeResult<V extends string> =
  /** We could not look. A missing table, a dead connection, a query that threw. */
  | { readonly kind: 'unavailable'; readonly detail: string }
  /** The holder holds records for this subject. `withheldCount` must be > 0. */
  | { readonly kind: 'holding'; readonly verdict: V; readonly withheldCount: number }
  /** We looked. The holder holds nothing about this subject. */
  | { readonly kind: 'none' };

/**
 * A question one compartment may ask about another. DECLARED, never inferred —
 * the same choice `SEARCH_GROUPS` makes in `routes/search.ts`, and for the same
 * reason: which compartment may ask what of whom is a governance fact, and a
 * governance fact belongs in one reviewable list rather than at each call site.
 */
export interface BrokeredQuestion<V extends string> {
  /** Stable id. Travels on every answer, so a log line names the question asked. */
  readonly id: string;
  /** The compartment doing the asking. It must hold THIS at `view`. */
  readonly asker: WorkspaceId;
  /** The compartment that holds the object. The asker never needs to hold this. */
  readonly holder: WorkspaceId;
  /** Named for the observation frame only. Never interpolated into any SQL. */
  readonly holderTable: string;
  /** The rule the verdict cites. Doctrine: a refusal names the rule it applies. */
  readonly rule: string;
  /**
   * THE OWNER'S DECISION, read at CALL time and not at import time. A snapshot
   * taken when the module loads cannot be flipped without a restart, and — the
   * reason that actually matters — a test could then never exercise both states,
   * which is how a default-deny branch becomes unreachable code that nobody has
   * ever run. `lib/env.ts` takes the same decision for `secondaryPasscode` and
   * states the same two reasons.
   */
  readonly authorised: () => boolean;
  /** The one variable that flips it. Named ON the refusal so it is actionable. */
  readonly authorisationEnvVar: string;
  /** Plain language: what a positive answer to this question DID observe. */
  readonly captures: string;
  /** The named absences. Non-empty for every question — a verdict is always less. */
  readonly doesNotCapture: readonly string[];
  /**
   * HOW THIS QUESTION'S SUBJECT IS NORMALISED, and why the broker owns the call
   * rather than the caller. The join key on the far side is normalised (0060
   * CHECK-enforces `asset_symbol = upper(btrim(asset_symbol))`), so a subject that
   * is not normalised the same way MATCHES NOTHING — and matching nothing returns
   * `empty`, i.e. the false negative this module exists to prevent. Normalising
   * before the probe makes that impossible; normalising in the CALLER would make it
   * optional. It runs at gate 3, AFTER entitlement and authorisation, so a caller
   * cannot use a malformed subject to probe whether the flag is on.
   */
  readonly normaliseSubject?: (
    raw: string,
  ) => { readonly ok: true; readonly subject: string } | { readonly ok: false; readonly detail: string };
  /** Verdict-only. Handed the pool and the NORMALISED subject; may return no rows. */
  readonly probe: (pool: pg.Pool, subject: string) => Promise<ProbeResult<V>>;
}

/**
 * WHERE AND WHEN WE LOOKED. Doctrine requires an ObservationFrame and an
 * ENVIRONMENT LABEL on every figure that came out of a database, and
 * `withheldCount` is exactly that. Present on the two states that LOOKED and
 * structurally absent from `not_loaded`, which by definition observed nothing.
 */
export interface BrokerObservation {
  /** ISO instant the probe ran. */
  readonly at: string;
  /** The relation the verdict was derived from. */
  readonly holderTable: string;
  /** Which database answered. Host and database name only — never credentials. */
  readonly environment: string;
  /** The window. There is no time window on a "does the holder hold X" question. */
  readonly window: 'all_records_for_subject';
  readonly captures: string;
  readonly doesNotCapture: readonly string[];
}

/** Why we did not look. Distinct from WHAT we did not find, which is `empty`. */
export type NotLoadedReason =
  | 'asker_not_entitled'
  | 'cross_read_not_authorised'
  | 'subject_unusable'
  | 'holder_unavailable';

interface AnswerCommon {
  readonly question: string;
  readonly asker: WorkspaceId;
  readonly holder: WorkspaceId;
  readonly code: VerdictBrokerCode;
  readonly rule: string;
  readonly message: string;
}

export type BrokeredAnswer<V extends string> =
  | (AnswerCommon & {
      readonly kind: 'not_loaded';
      readonly reason: NotLoadedReason;
      /* NO `withheldCount`, NO `verdict`, NO `observed` — see the header. The
       * absence is the mechanism, not an omission. */
    })
  | (AnswerCommon & {
      readonly kind: 'withheld';
      readonly code: typeof VERDICT_BROKER_CODES.WITHHELD;
      readonly verdict: V;
      /** Always > 0. Visible ON PURPOSE: see `withheldCount` note below. */
      readonly withheldCount: number;
      readonly observed: BrokerObservation;
    })
  | (AnswerCommon & {
      readonly kind: 'empty';
      readonly code: typeof VERDICT_BROKER_CODES.NO_HOLDING;
      readonly verdict: null;
      readonly withheldCount: 0;
      readonly observed: BrokerObservation;
    });

/**
 * THE COUNT IS A LESSER DISCLOSURE, DELIBERATELY ACCEPTED.
 *
 * Publishing "4 records exist about SOL and you may see none of them" tells the
 * asker more than "restricted" alone. That is a real cost and it is worth naming
 * rather than hiding: the alternative is to publish the verdict with no count, and
 * then `withheld` and `empty` differ only by a string an integration will
 * eventually normalise away — at which point the compartment boundary silently
 * becomes a clean-looking negative again. The doctrine picks the lesser disclosure
 * over the collapsible one. What the count is NOT: it is a number of RECORDS
 * WITHHELD, not a metric, not a rate, and it has no denominator to make one from.
 */

/**
 * The environment label. MIRRORS `packages/shared/src/marks/mark.ts`
 * (`environmentLabelFromDatabaseUrl`) rather than calling it: that function is not
 * on the `@lcx/shared` barrel, `packages/shared/src/index.ts` is another lane's
 * file, and `barrelReachability.test.ts` pins what the barrel exports — so adding
 * an export is a shared-package change this pass may not make. Credentials are
 * never in the output: only the host, its kind, and the database name.
 */
function holderEnvironmentLabel(): string {
  const raw = (env.databaseUrl ?? '').trim();
  if (raw === '') return 'unlabelled:no-database-url';
  try {
    const u = new URL(raw);
    const host = u.hostname;
    if (host === '') return 'unlabelled:no-host';
    const db = u.pathname.replace(/^\//, '');
    const where = db === '' ? host : `${host}/${db}`;
    const kind = /(^|\.)supabase\.(co|com|net)$/i.test(host)
      ? 'supabase'
      : host === 'localhost' || host === '127.0.0.1' || host === '::1'
        ? 'local'
        : 'external';
    return `${kind}:${where}`;
  } catch {
    return 'unlabelled:unparseable-database-url';
  }
}

function frame<V extends string>(q: BrokeredQuestion<V>): BrokerObservation {
  return {
    at: new Date().toISOString(),
    holderTable: q.holderTable,
    environment: holderEnvironmentLabel(),
    window: 'all_records_for_subject',
    captures: q.captures,
    doesNotCapture: q.doesNotCapture,
  };
}

function notLoaded<V extends string>(
  q: BrokeredQuestion<V>,
  reason: NotLoadedReason,
  code: VerdictBrokerCode,
  rule: string,
  message: string,
): BrokeredAnswer<V> {
  return { kind: 'not_loaded', question: q.id, asker: q.asker, holder: q.holder, reason, code, rule, message };
}

/**
 * THE TWO GATES THAT ARE DECIDED WITHOUT LOOKING AT ANYTHING, on their own, so
 * that EVERY entry point can apply them in the same order.
 *
 * WHY THIS IS A SEPARATE, EXPORTED FUNCTION AND NOT AN INLINE PREFIX OF
 * `brokerVerdict`. A composed entry point that has to resolve its subject from a
 * table FIRST — `otherLedger.askListingPipelineForProject` reads
 * `projects.ticker_norm` before it can name a symbol — would otherwise query that
 * table before any gate ran, and an unentitled principal would learn from the
 * refusal shape whether the project exists, whether it has a ticker and whether
 * the ticker is denormalised. That is precisely the "entitlement is decided BEFORE
 * any query" claim this module makes, and it held for one entry point and not the
 * other. It is now one function, called first by both.
 *
 * Returns the refusal to hand back, or `null` when both gates pass.
 */
export function brokerGate<V extends string>(
  q: BrokeredQuestion<V>,
  entitlements: EntitlementMap,
): BrokeredAnswer<V> | null {
  if (!capAtLeast(entitlements[q.asker], 'view')) {
    return notLoaded(
      q,
      'asker_not_entitled',
      VERDICT_BROKER_CODES.ASKER_NOT_ENTITLED,
      RULE_NEED_TO_KNOW,
      `This question is asked on behalf of the ${q.asker} compartment, and the calling principal `
        + `does not hold ${q.asker} at view or above. Nothing was read. Holding ${q.holder} is not `
        + `a substitute: the broker answers FOR a compartment, so the caller must be inside the one `
        + 'that is asking.',
    );
  }

  if (!q.authorised()) {
    return notLoaded(
      q,
      'cross_read_not_authorised',
      VERDICT_BROKER_CODES.CROSS_READ_NOT_AUTHORISED,
      RULE_DEFAULT_DENY,
      `The ${q.asker} compartment is not authorised to ask this of ${q.holder}, so nothing was read `
        + `and this is NOT a report that ${q.holder} holds nothing. The mechanism is complete and `
        + `tested in both states; whether it is switched on is the owner's decision, taken by setting `
        + `${q.authorisationEnvVar}=1 in the deployment environment. Until then every answer to this `
        + 'question is this refusal.',
    );
  }

  return null;
}

/**
 * Ask one compartment's question about another compartment's object.
 *
 * THE ORDER OF THE THREE GATES IS PART OF THE ANSWER, not an implementation
 * detail:
 *   1. THE ASKER'S OWN ENTITLEMENT, first. A principal that does not hold the
 *      asking compartment at `view` is refused before anything else, so the
 *      refusal CODE never becomes an oracle for the deployment's configuration —
 *      an unentitled caller learns about their own grant and nothing about the
 *      owner's flag. Note what is NOT required: the asker never needs the HOLDER
 *      compartment. That is the entire point of the broker.
 *   2. THE OWNER'S AUTHORISATION. Default-deny, and decided BEFORE the query, so
 *      "we did not look" is literally true and provable from the call log rather
 *      than asserted in a comment.
 *   3. THE SUBJECT. Refused if blank OR ABSENT, because a query on a blank subject
 *      would answer a different question and answer it emptily.
 * Gates 1 and 2 are `brokerGate` above, shared with every composed entry point.
 * Only then is the holder read.
 */
export async function brokerVerdict<V extends string>(
  pool: pg.Pool,
  q: BrokeredQuestion<V>,
  asking: { readonly entitlements: EntitlementMap; readonly subject: string },
): Promise<BrokeredAnswer<V>> {
  const gated = brokerGate(q, asking.entitlements);
  if (gated) return gated;

  /*
   * AN ABSENT SUBJECT REFUSES; IT DOES NOT THROW. `null`/`undefined` is the shape a
   * route gets from a missing query parameter or a JSON body field that was not
   * sent, and this is the one module in the repo whose entire thesis is that absent
   * data refuses under a stable code — so raising a TypeError out of it (a 500 with
   * no code, from the module that exists to produce codes) is the contradiction, not
   * a defensive-programming nicety. The type says `string`; the type is not present
   * at the HTTP boundary. `normaliseSubject` below already accepts
   * `string | null | undefined` at the ledger, so the two halves now agree about how
   * defensive to be.
   */
  const trimmed = typeof asking.subject === 'string' ? asking.subject.trim() : '';
  if (trimmed === '') {
    return notLoaded(
      q,
      'subject_unusable',
      VERDICT_BROKER_CODES.SUBJECT_UNUSABLE,
      RULE_THREE_STATES,
      'No subject was named, so no question was asked. A blank subject is refused rather than '
        + 'queried, because a query with nothing to match returns nothing and that nothing would '
        + 'read as "the holder holds nothing".',
    );
  }

  let subject = trimmed;
  if (q.normaliseSubject) {
    const normalised = q.normaliseSubject(trimmed);
    if (!normalised.ok) {
      return notLoaded(
        q,
        'subject_unusable',
        VERDICT_BROKER_CODES.SUBJECT_UNUSABLE,
        RULE_THREE_STATES,
        'The subject cannot be put to this question in a form that could match, so it was not '
          + `queried — a query that cannot match returns nothing, and that nothing would read as `
          + `"${q.holder} holds nothing". ${normalised.detail}`,
      );
    }
    subject = normalised.subject;
  }

  let probed: ProbeResult<V>;
  try {
    probed = await q.probe(pool, subject);
  } catch {
    /* The exception text belongs to the holding compartment — a Postgres error can
     * quote a column, a constraint, even a value — so it is not put on the answer and
     * not returned to the asker. The probe logs at its own call site if it wants to. */
    return notLoaded(
      q,
      'holder_unavailable',
      VERDICT_BROKER_CODES.HOLDER_UNAVAILABLE,
      RULE_THREE_STATES,
      `The ${q.holder} compartment could not be read, so this is a NOT-LOADED answer and not a `
        + 'report that it holds nothing. The underlying error is not repeated here because its text '
        + 'belongs to the other compartment; it is on the server logs.',
    );
  }

  if (probed.kind === 'unavailable') {
    return notLoaded(
      q,
      'holder_unavailable',
      VERDICT_BROKER_CODES.HOLDER_UNAVAILABLE,
      RULE_THREE_STATES,
      `The ${q.holder} compartment could not answer this question. ONE CAUSE IS NOT ASSERTED OVER `
        + 'the others, because from here they are indistinguishable and naming the wrong one sends '
        + 'an operator chasing nothing: the relation may not be migrated on this database, it may be '
        + 'migrated and never populated (in which case nobody has told it anything yet and it is not '
        + 'evidence of anything), or the read may have failed. The probe logs which one at its own '
        + 'call site. NOT-LOADED, never empty: a control that reads "nothing found" against a table '
        + 'that does not exist, or that nobody has filled in, has found nothing about the world.',
    );
  }

  if (probed.kind === 'none') {
    return {
      kind: 'empty',
      question: q.id,
      asker: q.asker,
      holder: q.holder,
      code: VERDICT_BROKER_CODES.NO_HOLDING,
      rule: q.rule,
      message: `We looked, and ${q.holder} holds no record about this subject. This is a genuine `
        + 'absence observed at the instant on the frame below — not a withheld answer and not an '
        + 'unread compartment.',
      verdict: null,
      withheldCount: 0,
      observed: frame(q),
    };
  }

  if (!Number.isInteger(probed.withheldCount) || probed.withheldCount <= 0) {
    /* A `holding` with nothing to withhold is a contradiction, and the tempting fix
     * — treat it as `empty` — manufactures the false negative this module exists to
     * prevent. So it refuses, loudly, under the same code as an unreachable holder. */
    return notLoaded(
      q,
      'holder_unavailable',
      VERDICT_BROKER_CODES.HOLDER_UNAVAILABLE,
      RULE_NO_LAUNDERING,
      `The ${q.holder} compartment reported that it holds records for this subject and then gave a `
        + 'count that cannot be true of a non-empty holding. The two statements contradict each '
        + 'other, so neither is reported as fact and this answer is NOT-LOADED.',
    );
  }

  return {
    kind: 'withheld',
    question: q.id,
    asker: q.asker,
    holder: q.holder,
    code: VERDICT_BROKER_CODES.WITHHELD,
    rule: q.rule,
    message: `${q.holder} holds ${probed.withheldCount} record(s) about this subject and none of them `
      + `is shown to ${q.asker}. The verdict is the whole of what crosses the boundary: it tells you `
      + 'THAT something exists and what it means for you, and deliberately not what it is. Ask the '
      + `${q.holder} desk if you need the substance.`,
    verdict: probed.verdict,
    withheldCount: probed.withheldCount,
    observed: frame(q),
  };
}

/**
 * The truthiness parser `lib/env.ts:bool()` uses, mirrored here because that
 * function is module-private and `lib/env.ts` is not in this pass's file set. Kept
 * identical on purpose: two flag vocabularies in one codebase is how `FLAG=true`
 * ends up silently meaning false.
 */
export function envFlagIsOn(name: string): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return false;
  return v === '1' || v.toLowerCase() === 'true' || v === 'yes';
}
