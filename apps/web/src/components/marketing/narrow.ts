import { ApiError } from '@/lib/apiClient';
import type { ObservationFrame, Refusal, RefusalCode } from './vocabulary';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  NARROWING — what a surface is allowed to do with a payload it has no type for
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `lib/api/marketing.ts` types most of its responses `UncontractedPayload = unknown`,
 * and its header states why: a hand-written web-side interface for a payload the API
 * has never returned compiles, satisfies a module-mocked test, and crashes the moment
 * real data arrives. That is `lib/api/gps.ts:83`'s post-mortem, and it cost a day.
 *
 * So a panel here has exactly two honest moves, and this module is the second one:
 *
 *  1. IMPORT THE SHARED TYPE. Where `packages/shared/src/marketing/` declares the
 *     response — `AbusePerimeterState` today — the fetcher is typed and no function in
 *     this file is involved. That is the destination for all twenty-three rows of
 *     `MARKETING_CONTRACTS_OWED`, and every narrower below is scaffolding to be deleted.
 *  2. WALK THE UNKNOWN AT RUNTIME. Read one field at a time, check its type, and where
 *     it is missing say so on screen. Nothing here asserts, casts a payload to a shape,
 *     or fills a hole with a plausible default.
 *
 * ── THE RULE THESE FUNCTIONS KEEP, AND IT IS THE WHOLE POINT ──────────────────
 * A MISSING FIELD PRODUCES AN ABSENCE, NEVER A ZERO AND NEVER A BLANK. `num` returns
 * `null` rather than `0`; `frame` returns `null` rather than an empty frame; `refusals`
 * returns `null` (nobody answered) distinctly from `[]` (the engine answered, cleanly).
 * Every caller renders those three states differently, and the tests fail if one stops.
 *
 * The substitutes for missing prose are deliberately UGLY — "the engine sent no
 * sentence" — because an invented sentence is an invisible defect and an ugly one is a
 * visible bug report from the screen itself.
 */

/* ════════ THE THREE-STATE READ ════════ */

/** A 404/501 means the route is not on this environment. Anything else is a real refusal. */
export const routeAbsent = (e: unknown): boolean =>
  e instanceof ApiError && (e.status === 404 || e.status === 501);

/**
 * A 403 means the route is there, it works, and THIS READER may not have it.
 *
 * IT IS NOT AN ABSENCE AND IT IS NOT A FAULT, which is why it is its own predicate. Five of
 * the routes these surfaces call are `requireApprover` — the Art 8(2) production, the
 * five-year record write, Art 15 access, Art 17 erasure and the retention sweep — and an
 * operator who opens one of those screens must be told they lack the role, with the name of
 * who to ask. Rendering it as “not on this environment” sends them to escalate a deployment
 * bug that does not exist; rendering it as a failed read makes them retry.
 */
export const notPermitted = (e: unknown): boolean =>
  e instanceof ApiError && (e.status === 403 || e.status === 401);

/**
 * Resolve to `null` where the route does not exist; re-throw everything else.
 *
 * `null` IS NOT AN EMPTY LIST, and no caller may collapse the two. A panel that renders
 * "no warnings" because the watch route is unmounted has asserted a fact about the world
 * from a fact about a deployment, which is the single most common way an instrument lies.
 */
export async function optionalRoute<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (routeAbsent(e)) return null;
    throw e;
  }
}

/* ════════ FIELD READERS ════════ */

export const rec = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** `null` for anything non-finite. NEVER `0` — see the module docblock. */
export const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

export const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : [];

/** Rows, or `[]` when the field is not an array. Callers pair this with a presence flag. */
export const rows = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.map(rec) : [];

/**
 * An ISO-8601 instant, or `null`.
 *
 * Checked by PARSING rather than by regex: a string that `Date` cannot read is worse than
 * a missing one, because every clock downstream renders `NaN` days and an operator reads
 * that as a rendering glitch rather than as bad data.
 */
export const instant = (v: unknown): string | null => {
  const s = str(v);
  if (s === null) return null;
  return Number.isFinite(Date.parse(s)) ? s : null;
};

/* ════════ COMPOSITE SHAPES ════════ */

/**
 * An `ObservationFrame`, or `null` when the payload carried none.
 *
 * `null` MATTERS MORE THAN THE FRAME DOES. Doctrine rule 1: a figure with no frame is a
 * figure nobody can defend, so a caller that gets `null` here prints the figure as
 * unattributed rather than printing it plain. Manufacturing a frame — "source: unknown,
 * captures: everything" — would satisfy `ObservationFrameNote` and defeat it.
 *
 * The five required fields are required. A partial frame is refused as a whole, because a
 * frame missing `doesNotCapture` reads as a channel with no blind spots.
 */
export function frame(v: unknown): ObservationFrame | null {
  const r = rec(v);
  const source = str(r.source);
  const captures = str(r.captures);
  const completeness = str(r.completeness);
  const windowFrom = instant(r.windowFrom);
  const windowTo = instant(r.windowTo);
  if (source === null || captures === null || completeness === null) return null;
  if (windowFrom === null || windowTo === null) return null;
  const doesNotCapture = strs(r.doesNotCapture);
  if (doesNotCapture.length === 0) return null;
  return {
    source: source as ObservationFrame['source'],
    captures,
    doesNotCapture,
    knownBiases: strs(r.knownBiases),
    completeness: completeness as ObservationFrame['completeness'],
    windowFrom,
    windowTo,
    lastSuccessfulPollAt: instant(r.lastSuccessfulPollAt),
  };
}

/**
 * One refusal, narrowed. Every field that a screen renders is present or is replaced by a
 * sentence saying the engine did not send it.
 *
 * `RULESET_VERSION_UNKNOWN` is the code used when the payload carried none, and it is a
 * real member of the shared union rather than a placeholder string: a refusal whose code
 * is not enumerable is invisible to `refusalCodeFrequency`, which is the only honest read
 * the desk has on whether its gates ever fire.
 */
export function refusal(v: unknown): Refusal {
  const r = rec(v);
  const rule = rec(r.rule);
  const recovery = rec(r.recovery);
  return {
    code: (str(r.code) ?? 'RULESET_VERSION_UNKNOWN') as RefusalCode,
    sentence:
      str(r.sentence)
      ?? 'The engine refused this and sent no sentence with it. Treat the refusal as standing and ask compliance what it objected to.',
    rule: {
      instrument: (str(rule.instrument) ?? 'desk_policy') as Refusal['rule']['instrument'],
      provision: str(rule.provision) ?? 'the engine named no provision',
      text: str(rule.text) ?? 'The engine cited no rule text, so this refusal cannot be argued with on screen.',
    },
    recovery:
      typeof recovery.kind === 'string'
        ? (recovery as unknown as Refusal['recovery'])
        : {
            kind: 'not_recoverable',
            why: 'The engine stated no way to clear this. Ask compliance rather than editing until it stops complaining.',
          },
    matched: str(r.matched),
    ruleSetVersion: num(r.ruleSetVersion) ?? 0,
  };
}

/**
 * A refusal LIST, and the tri-state that the drafting room's gates rest on:
 *
 *   `null`  the field was absent — NOBODY CHECKED. Renders as a refusal to certify.
 *   `[]`    the engine answered and matched nothing.
 *   rows    the engine's verdict.
 *
 * Collapsing `null` into `[]` turns a missing endpoint into a green tick, which is the
 * defect `Gate`'s `absent` source exists to make impossible.
 */
export function refusals(v: unknown): Refusal[] | null {
  if (!Array.isArray(v)) return null;
  return v.map(refusal);
}

/**
 * The sentence to print when a read failed, taken from the API verbatim.
 *
 * Never "Something went wrong": the API's own wording carries the specifics, and a
 * sentence written here in advance cannot.
 */
export const errorSentence = (e: unknown): string =>
  e instanceof Error && e.message !== '' ? e.message : 'This read failed and the API did not say why.';
