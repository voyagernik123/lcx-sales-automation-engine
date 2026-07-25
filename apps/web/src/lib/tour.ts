import {
  capAtLeast,
  workspaceForPath,
  type Capability,
  type EntitlementMap,
  type WorkspaceId,
} from '@lcx/shared';
import { DESTINATIONS } from './destinations';

/**
 * The first run, GENERATED FROM ENTITLEMENTS (T1 #19).
 *
 * The plan asks for "6–8 minutes, entirely hands-on, no video, no wall of text… it
 * doesn't TELL you ⌘K exists; it puts you in a situation where using ⌘K is the
 * obvious move, and then you've done it." Two properties carry that, and everything
 * in this file exists for one of them.
 *
 * ── 1. GENERATED, NOT AUTHORED ────────────────────────────────────────────────
 * Sam holds different compartments from Nik. A hand-written tour that walks someone
 * through a workspace they cannot open does not merely waste a step: it teaches, on
 * the operator's first sixty seconds, that the app says things that are not true.
 * So the workspace steps are derived — one per entry in `DESTINATIONS` that the
 * principal's `EntitlementMap` actually admits, in the order the native menu lists
 * them. `DESTINATIONS` is the same table the Rust menu, the `g` grammar and the `?`
 * manual read, so a renamed route or a new workspace reaches the tour for free, and
 * a revoked compartment disappears from it without anyone editing prose.
 *
 * ── 2. TEACHING BY DOING, WHICH MEANS DETECTING COMPLETION ────────────────────
 * "Press ⌘K" followed by a Next button is a wall of text with extra steps: the
 * operator can advance the whole tour without touching the key it is about. So a
 * step here has no Next. It advances when the app OBSERVABLY changed — the command
 * line is on the dismiss stack, the manual is, the route is now inside the workspace
 * the step named. There is no timer anywhere in this file, and no step that can be
 * completed by clicking the tour.
 *
 * Two signals turn out to be enough for the whole Phase 1-7 grammar, and neither
 * needs a single line of cooperation from the surface being taught:
 *   · `pathname` — proves navigation happened (⌘K's verbs, `g <digit>`, the sidebar).
 *   · the dismiss-stack labels — prove an overlay opened or closed, which covers ⌘K,
 *     `?`, `f`, and Escape.
 *
 * ── WHY EACH STEP HAS **TWO** PREDICATES, and this is the finding of the phase ──
 * `lib/navGrammar.ts` and `hooks/useHints.ts` both bail out on `isOverlayOpen()`,
 * deliberately: a motion key must go quiet while a dialog owns the keyboard. That is
 * correct, and it means the moment after the operator opens the command line, `g` and
 * `f` are DEAD until they back out. A tour that advanced the instant the manual
 * appeared would put "press g then 2" on screen at the one moment `g` cannot work,
 * and the operator would conclude the shortcut is broken — teaching the exact
 * opposite of the intended lesson.
 *
 * So `reached` (did they do the thing?) is latched by the engine and is separate from
 * `settled` (is the screen ready for the next thing?), which defaults to "nothing
 * owns the keyboard". The operator therefore learns Escape as a consequence of the
 * sequence rather than from a step that nags about it: the panel confirms the thing
 * they just did and waits for them to come back out.
 *
 * ── WHY THE OVERLAY LABELS ARE LITERALS HERE AND NOT IMPORTS ──────────────────
 * `MANUAL_LABEL` lives in `lib/manual.ts` and `HINT_LABEL` in `lib/hints.ts`, and
 * importing either would drag that module — and, through the manual, the 22-action
 * manifest — into whatever chunk this one lands in. Phase 6 lost 9KB of headroom to
 * exactly one convenient import of that kind, and this phase began with 9KB left.
 * The cost of literals is drift, so drift is what the test guards: `tour.test.ts`
 * reads the three source files and fails if any of them renames its label. That is
 * the `destinations.test.ts` trick (it reads the Rust menu) applied to a bundle
 * boundary instead of a process boundary.
 */

/** Everything the tour is allowed to know about the app's state. */
export interface TourSignal {
  /** The current route. */
  pathname: string;
  /** Dismiss-stack labels, bottom-first — i.e. what is on screen owning Escape. */
  overlays: readonly string[];
}

export interface TourStep {
  id: string;
  /**
   * The compartment this step teaches, or null for a desk-level capability every
   * member holds. A step with a workspace is only ever generated for a principal
   * entitled to it — see `tourFor`.
   */
  workspace: WorkspaceId | null;
  /** Capability the step needs. `view` for all of them: the tour never writes. */
  need: Capability;
  /** One imperative line. No explanation of why — the operator is about to find out. */
  prompt: string;
  /** The keys, as fingers press them. Rendered as chips, never as prose. */
  keys: readonly string[];
  /**
   * Did the operator DO the thing?
   *
   * Latched by `advanceTour`, so it is allowed to be true for a single observation —
   * "the manual is on the stack" stops being true the moment they close it, and that
   * must not un-complete the step.
   */
  reached: (s: TourSignal) => boolean;
  /**
   * Is the screen ready for the NEXT step? Defaults to "nothing owns the keyboard",
   * because the next step is usually a global key that `isOverlayOpen()` silences.
   * Override only with a reason.
   */
  settled?: (s: TourSignal) => boolean;
}

/* ── The three labels this module watches ─────────────────────────────────────
 * Kept as literals for the bundle reason above; `tour.test.ts` asserts each one
 * still matches the source that registers it.
 */

/** `components/shared/CommandPalette.tsx` — `useDismissible(open, …, 'command line')`. */
const COMMAND_LINE_LABEL = 'command line';
/** `lib/manual.ts` — `MANUAL_LABEL`. */
const MANUAL_LABEL_LITERAL = 'manual';
/** `lib/hints.ts` — `HINT_LABEL`. */
const HINT_LABEL_LITERAL = 'hint tags';

/** The default `settled`: `g` and `f` are dead while anything is on the stack. */
export function keyboardIsFree(s: TourSignal): boolean {
  return s.overlays.length === 0;
}

const opened = (label: string) => (s: TourSignal) => s.overlays.includes(label);

/* ── The desk-level steps ─────────────────────────────────────────────────────
 * The three keys that work on every surface, so they are taught before anything
 * that depends on where the operator is standing. Ordered by how much of the day
 * each one carries.
 */

/** The headline of the whole terminal: find anything, act on it, from one place. */
const COMMAND_LINE_STEP: TourStep = {
  id: 'command-line',
  workspace: null,
  need: 'view',
  prompt: 'Find anything, and act on it, from one place.',
  keys: ['⌘K'],
  reached: opened(COMMAND_LINE_LABEL),
};

/** The answer to "what can I do here", which is the question a new operator has. */
const MANUAL_STEP: TourStep = {
  id: 'manual',
  workspace: null,
  need: 'view',
  prompt: 'Ask the app what you can do on the surface you are standing on.',
  keys: ['?'],
  reached: opened(MANUAL_LABEL_LITERAL),
};

/**
 * The escape hatch for the controls the other two do not reach. Taught AFTER the
 * workspace tour, because it wants a populated surface to tag and the desk on first
 * run is the emptiest screen in the app.
 */
const HINTS_STEP: TourStep = {
  id: 'hints',
  workspace: null,
  need: 'view',
  prompt: 'Reach any control on screen without the trackpad: tag them, then type a tag.',
  keys: ['f'],
  reached: opened(HINT_LABEL_LITERAL),
};

/**
 * One step per destination the principal is entitled to reach.
 *
 * `workspaceForPath` rather than parsing the menu id (`go-ws-sales`): the id is a
 * string that crosses a process boundary and could be renamed for menu reasons,
 * whereas the path → workspace map is the same one the route guard in `AppLayout`
 * uses to decide whether to render the page at all. If the tour and the guard ever
 * disagreed, the tour would send someone to a request-access screen.
 */
function navSteps(): TourStep[] {
  const steps: TourStep[] = [];
  for (const d of DESTINATIONS) {
    const ws = workspaceForPath(d.path);
    if (ws === null) continue; // the desk itself — appended last, see `tourFor`
    steps.push({
      id: `go-${ws}`,
      workspace: ws,
      need: 'view',
      prompt: `Go to ${d.label}.`,
      keys: ['g', d.key],
      // Arrival, not exact equality: the operator may well land on the workspace's
      // landing page and then open something inside it before the panel is read
      // again, and "you are in SALES ENGINE" is what the step asked for.
      reached: (s) => workspaceForPath(s.pathname) === ws,
    });
  }
  return steps;
}

/** `g 0` — the way back to the desk, and the last thing the tour asks for. */
function homeStep(): TourStep {
  const desk = DESTINATIONS.find((d) => workspaceForPath(d.path) === null);
  const key = desk?.key ?? '0';
  const path = desk?.path ?? '/';
  return {
    id: 'go-desk',
    workspace: null,
    need: 'view',
    prompt: 'And back to your desk.',
    keys: ['g', key],
    reached: (s) => s.pathname === path,
  };
}

/**
 * The tour for one principal.
 *
 * A step whose compartment the operator does not hold is not generated. Not hidden,
 * not disabled — absent, so there is nothing to leak and nothing to explain.
 */
export function tourFor(entitlements: EntitlementMap): TourStep[] {
  const steps = [COMMAND_LINE_STEP, MANUAL_STEP, ...navSteps(), HINTS_STEP, homeStep()];
  return steps.filter((s) => s.workspace === null || capAtLeast(entitlements[s.workspace], s.need));
}

/* ── The engine ───────────────────────────────────────────────────────────── */

export interface TourProgress {
  /** Index of the current step; `steps.length` means finished. */
  index: number;
  /** Has the current step's `reached` fired since it became current? */
  latched: boolean;
}

export const TOUR_START: TourProgress = { index: 0, latched: false };

/**
 * Fold one observation into the tour's progress. Pure, and deliberately so — the
 * interesting parts are all precedence and latching, which are miserable to test
 * through a DOM.
 *
 * RETURNS THE SAME OBJECT WHEN NOTHING HAPPENED, and the reason is measured rather
 * than assumed. The caller runs this from an effect and feeds the result back into
 * state. With the memoised signal in `Tour.tsx` a fresh `{index, latched}` costs one
 * extra render per observation and nothing worse — I checked, and the component tests
 * stay green. It becomes a HANG the moment the signal stops being reference-stable,
 * which is one careless `stack.map()` away: with both, the effect re-runs on every
 * render because its dep is a new object, `setProgress` always commits, and the loop
 * never closes. Verified by making both changes at once — `vitest run
 * src/components/teach` produced no output for 200s against a suite that takes 11s.
 * So this is half of a two-part guard, and `tour.test.ts` pins this half.
 */
export function advanceTour(
  steps: readonly TourStep[],
  p: TourProgress,
  s: TourSignal,
): TourProgress {
  let index = p.index;
  let latched = p.latched;

  // A loop rather than a single test: one observation can complete the current step
  // and satisfy the next (arriving in a workspace with nothing open completes the
  // arrival AND leaves the keyboard free), and stalling would leave a step on screen
  // that the operator has already done. Bounded by the step count, so it terminates.
  for (let guard = 0; guard <= steps.length; guard += 1) {
    const step = steps[index];
    if (!step) break;
    if (!latched) latched = step.reached(s);
    if (!latched) break;
    if (!(step.settled ?? keyboardIsFree)(s)) break;
    index += 1;
    latched = false;
  }

  return index === p.index && latched === p.latched ? p : { index, latched };
}

/** Has the operator reached the end? */
export function tourFinished(steps: readonly TourStep[], p: TourProgress): boolean {
  return p.index >= steps.length;
}

/** The step on screen, or null once finished. */
export function currentStep(steps: readonly TourStep[], p: TourProgress): TourStep | null {
  return steps[p.index] ?? null;
}
