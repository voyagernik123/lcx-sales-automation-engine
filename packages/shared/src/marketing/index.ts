/**
 * MARKETING — barrel. Re-exports only; no logic lives here.
 *
 * The vocabulary is in `./types.js`. Read its file docblock before building on any
 * of these names: several of them exist to make a specific class of dishonesty a
 * compile error rather than a code-review note, and importing them without the
 * reasoning attached defeats the point.
 *
 * WHOLESALE, NOT A NAME LIST — and that is the same decision, for the same reason, as
 * the one recorded above the GPS export in `../index.ts`. This file WAS a hand-written
 * list of 100-odd names from `types.ts` alone, and the eleven engine modules beside it
 * were reachable from nothing: `apps/api/src/marketing/abuseRegister.ts` imported eight
 * types from `@lcx/shared` and got eight TS2305s, because a symbol can be exported from
 * its own module and still be invisible here. That failure mode has no signal until an
 * emit build in Docker order fails, which is after the point where it is cheap. `export *`
 * cannot drift from the compartment it publishes.
 *
 * COLLISIONS SURFACE AS TS2308 AT COMPILE TIME, and they are resolved INSIDE the module
 * that caused them, never by aliasing here. Fourteen of them existed when the six lanes
 * were joined up, and each one was a real defect rather than a naming accident:
 *
 *   - `normaliseForMatch`, byte-identical in `adoption.ts` and `precedent.ts`. It decides
 *     what "the same words" means, which is a rule, so it moved to `types.ts` and both
 *     import it. Left split, the desk could be told a reply is a correction while the
 *     precedent index reads the same text as a restatement.
 *   - `ClockSuppression`, field-for-field identical in `crisis.ts` and `triage.ts`. Also
 *     moved to `types.ts`: one desk gets one suppression record.
 *   - `TTFS_BUDGET_MINUTES` in `crisis.ts` and `triage.ts`, DISAGREEING at `medium` (120
 *     against 240). Not reconciled — they are different ladders, keyed on incident
 *     severity and on triage tier, and averaging them would have invented an agreement
 *     between "our exchange is down" and "an account with 40 followers is wrong about
 *     us". Renamed to `…_BY_SEVERITY` and `…_BY_TIER` so a caller must say which.
 *   - Ten process metrics implemented twice, in `loop.ts` and `observation.ts`. The
 *     duplicates disagreed on absence conventions and on medians. `loop.ts` (M8) keeps
 *     the arithmetic per the plan; `observation.ts` keeps the frame, the `Figure` and
 *     `PROCESS_METRIC_DEFINITIONS`, and its computations were deleted rather than
 *     reconciled. A second implementation of a threshold is how a suppressed rate becomes
 *     an expressed one.
 *
 * ONE REFUSAL-CODE NAMESPACE. `triage.ts` and `crisis.ts` each carried a private array of
 * codes — 28 and 19 — widening `RefusalCode` locally. Both are folded into `types.ts`, and
 * the two arrays survive typed as `readonly RefusalCode[]`, which is the ratchet that stops
 * them growing back. The reason is not tidiness: `loop.ts:refusalCodeFrequency` enumerates
 * `REFUSAL_CODES` to report the gates that have NEVER FIRED, and a code outside that array
 * is invisible to the only honest read the desk has on whether its gates are load-bearing
 * or ornamental. Forty-seven gates were invisible.
 */

/* The vocabulary. Every other module in this compartment builds on it and none of them
 * re-declares anything it owns. */
export * from './types.js';

/* M1 — the engine. Which law applies, what a promise may say, what a verb adopts. */
export * from './regime.js';
export * from './claimSafety.js';
export * from './adoption.js';

/* M2 — the market-abuse perimeter: the invisible axis, made load-bearing. */
export * from './abuse.js';

/* M4 — the desk: triage, the precedent index, the silence log. */
export * from './triage.js';
export * from './precedent.js';

/* M5 — the crisis room. Versioned holding statements, needing zero data. */
export * from './crisis.js';

/* M1/§7 + M3 — desk mode, and the honesty ceiling the panels are held to. */
export * from './deskMode.js';
export * from './observation.js';

/* M8 — honest measurement and the loop. Owns the twelve process metrics. */
export * from './loop.js';
