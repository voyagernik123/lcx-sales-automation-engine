import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WORKSPACE_IDS, workspaceForPath, type EntitlementMap } from '@lcx/shared';
import { DESTINATIONS } from '@/lib/destinations';
import {
  advanceTour,
  currentStep,
  keyboardIsFree,
  tourFinished,
  tourFor,
  TOUR_START,
  type TourSignal,
  type TourStep,
} from '@/lib/tour';

/**
 * The first run is GENERATED, and this is where that claim is checkable (T1 #19).
 *
 * Two things are being defended, and they fail in opposite directions.
 *
 * A step for a compartment the operator does not hold is the expensive failure: it
 * walks someone into a request-access screen in their first two minutes and teaches
 * them that the app describes an application they are not using. So the restricted
 * principal below is the load-bearing test, not a variation on the happy path.
 *
 * The other direction is silence: a seventh workspace added to `WORKSPACES` with no
 * destination, or a destination whose path stops resolving to a workspace, would drop
 * out of the tour with nothing going red. `every workspace is reachable…` is the
 * ratchet for that, and it is why the generation reads `DESTINATIONS` (the table the
 * native menu and the `g` grammar also read) instead of a list written here.
 */

const SRC = join(__dirname, '..', '..');
const source = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

/** Nik — every compartment, so nothing is hidden. */
const FULL: EntitlementMap = {
  command: 'approve',
  sales: 'approve',
  intel: 'approve',
  regulatory: 'approve',
  distribution: 'approve',
  governance: 'approve',
};

/** A restricted principal: the BD desk and the analyst layer, nothing else. */
const RESTRICTED: EntitlementMap = { sales: 'operate', intel: 'view' };

const at = (pathname: string, ...overlays: string[]): TourSignal => ({ pathname, overlays });

/** Run the whole tour by feeding it exactly what each step asks for. */
function walk(steps: readonly TourStep[]): { visited: string[]; progress: ReturnType<typeof advanceTour> } {
  let progress = TOUR_START;
  let where = '/';
  const visited: string[] = [];
  // Bounded: a step that cannot be satisfied must fail the length assertion at the
  // end, not hang the suite.
  for (let i = 0; i < steps.length * 3; i += 1) {
    const step = currentStep(steps, progress);
    if (!step) break;
    visited.push(step.id);
    const signal = satisfy(step, where);
    // The operator does not teleport home between steps: an overlay step is satisfied
    // and then backed out of WHERE THEY ARE STANDING. Modelling that matters, because
    // clearing to `/` after every step would satisfy the final "back to your desk"
    // step for free and the walk would silently cover one step fewer.
    where = signal.pathname;
    progress = advanceTour(steps, progress, signal);
    progress = advanceTour(steps, progress, at(where));
  }
  return { visited, progress };
}

/** The destination whose path belongs to a workspace — the same lookup `lib/tour.ts` does. */
const destFor = (ws: string) => DESTINATIONS.find((d) => workspaceForPath(d.path) === ws);

/**
 * The observation that completes a given step, derived from the step itself.
 *
 * `where` is threaded through because an overlay opens WHERE THE OPERATOR IS: pressing
 * `?` does not move them home, and pretending it did is what made the first version of
 * this walk quietly skip the final step.
 */
function satisfy(step: TourStep, where: string): TourSignal {
  if (step.id === 'command-line') return at(where, 'command line');
  if (step.id === 'manual') return at(where, 'manual');
  if (step.id === 'hints') return at(where, 'hint tags');
  if (step.workspace === null) return at('/'); // go-desk
  const dest = destFor(step.workspace);
  expect(dest, `no destination for step ${step.id}`).toBeDefined();
  return at(dest!.path);
}

describe('the tour is generated from entitlements', () => {
  it('gives a fully entitled operator one step per workspace, in menu order', () => {
    const ids = tourFor(FULL).map((s) => s.id);
    expect(ids).toEqual([
      'command-line',
      'manual',
      'go-command',
      'go-sales',
      'go-intel',
      'go-regulatory',
      'go-distribution',
      'go-governance',
      'hints',
      'go-desk',
    ]);
  });

  it('omits a compartment the operator does not hold — no step, not a disabled one', () => {
    const steps = tourFor(RESTRICTED);
    const workspaces = steps.map((s) => s.workspace).filter((w): w is NonNullable<typeof w> => w !== null);
    expect(workspaces).toEqual(['sales', 'intel']);

    // The stronger form of the same assertion: nothing anywhere in what this operator
    // is shown may NAME a compartment they cannot open. A step that was merely
    // reordered or relabelled would pass the id check above and fail this one.
    const text = steps.map((s) => `${s.prompt} ${s.id}`).join(' ');
    for (const absent of ['DISTRIBUTION', 'GOVERNANCE', 'US COMMAND', 'REGULATORY']) {
      expect(text, `the tour offers ${absent} to an operator without it`).not.toContain(absent);
    }
    expect(text).toContain('SALES ENGINE');
  });

  it('still teaches the desk-level keys to an operator holding nothing at all', () => {
    // The floor. An operator mid-onboarding, whose grants have not landed yet, gets
    // the three keys that work everywhere rather than an empty panel.
    const steps = tourFor({});
    expect(steps.map((s) => s.id)).toEqual(['command-line', 'manual', 'hints', 'go-desk']);
    expect(steps.every((s) => s.workspace === null)).toBe(true);
  });

  it('never generates a step above `view` — the tour reads, it never writes', () => {
    // A tour step that needed `operate` would be a tour that performs a governed
    // write on the operator's behalf during their first two minutes.
    expect(tourFor(FULL).every((s) => s.need === 'view')).toBe(true);
  });

  it('every workspace is reachable, so a seventh one cannot be silently omitted', () => {
    // The anti-silence ratchet. If someone adds a workspace to WORKSPACES and forgets
    // DESTINATIONS, the tour would quietly stop covering the app and every other
    // assertion here would still pass.
    const taught = new Set(tourFor(FULL).map((s) => s.workspace));
    for (const ws of WORKSPACE_IDS) {
      expect(taught.has(ws), `no first-run step reaches ${ws}`).toBe(true);
    }
  });

  it('spells its keys from DESTINATIONS, so the tour and the native menu cannot drift', () => {
    // The prompt names the destination's own label and the chips spell its own key, so
    // a route renamed for the menu's benefit reaches the tour without an edit here.
    for (const step of tourFor(FULL)) {
      if (step.workspace === null) continue;
      const dest = destFor(step.workspace)!;
      expect(step.keys, `${step.id} does not spell g ${dest.key}`).toEqual(['g', dest.key]);
      expect(step.prompt, `${step.id} does not name ${dest.label}`).toContain(dest.label);
    }
  });

  it('sends "back to your desk" to the DESK, not merely to the first non-workspace row', () => {
    /*
     * THE BLIND SPOT THIS CLOSES, found by an adversarial re-read after Phase 8.
     *
     * `homeStep()` picks its destination with
     * `DESTINATIONS.find((d) => workspaceForPath(d.path) === null)`. That predicate had
     * exactly ONE match when the tour was written. Phase 8 added a second — PRACTICE
     * RANGE (`/practice`, `g 7`) is a place you can go and deliberately not a workspace
     * — so the final step is now chosen by TABLE ORDER among two candidates.
     *
     * It is correct today only because the desk happens to be listed first. Reorder the
     * table and the last thing a new operator is told becomes "And back to your desk."
     * over the chips `g 7`, satisfied only by arriving at the practice range: wrong keys,
     * wrong destination, right sentence. Measured, not imagined — with `/practice` moved
     * to the top, `homeStep()` yields `keys: ['g','7']` and `reached('/') === false`.
     *
     * The suite could not say so. The `spells its keys from DESTINATIONS` guard above
     * opens with `if (step.workspace === null) continue`, which skips this step by
     * construction, and the only thing that caught the reorder was a component test
     * whose message is about the farewell card — a red that points at the wrong file.
     */
    const desk = DESTINATIONS.find((d) => d.path === '/');
    expect(desk, 'no DESTINATIONS row for the desk itself').toBeDefined();

    const step = tourFor(FULL).find((s) => s.id === 'go-desk');
    expect(step, 'the tour no longer ends by going home').toBeDefined();
    expect(step!.keys, 'the desk step does not spell the desk’s own chord').toEqual([
      'g',
      desk!.key,
    ]);
    expect(
      step!.reached(at(desk!.path)),
      'arriving at the desk does not complete the desk step',
    ).toBe(true);

    // And it must not be satisfiable by the OTHER non-workspace destinations, which is
    // the failure the ordering makes possible.
    for (const other of DESTINATIONS.filter((d) => workspaceForPath(d.path) === null && d.path !== desk!.path)) {
      expect(
        step!.reached(at(other.path)),
        `the desk step is completed by arriving at ${other.label} (${other.path})`,
      ).toBe(false);
    }
  });

  it('watches the dismiss-stack labels the app actually registers', () => {
    /*
     * The drift guard for the three string literals in `lib/tour.ts`. They are
     * literals rather than imports because importing `lib/manual.ts` or
     * `lib/hints.ts` would pull those modules — and the 22-action manifest behind the
     * manual — into the tour's chunk, which is the mistake that cost Phase 6 9KB. The
     * price of a literal is drift; this is the receipt. Same trick as
     * `destinations.test.ts`, which reads the Rust menu source.
     */
    const tour = source('lib', 'tour.ts');
    const manual = /export const MANUAL_LABEL\s*=\s*'([^']+)'/.exec(source('lib', 'manual.ts'));
    const hint = /export const HINT_LABEL\s*=\s*'([^']+)'/.exec(source('lib', 'hints.ts'));
    const command = /useDismissible\(\s*open,[^;]*?'([^']+)'\s*\)/.exec(
      source('components', 'shared', 'CommandPalette.tsx'),
    );

    expect(manual?.[1], 'lib/manual.ts no longer exports MANUAL_LABEL as a literal').toBeDefined();
    expect(hint?.[1], 'lib/hints.ts no longer exports HINT_LABEL as a literal').toBeDefined();
    expect(command?.[1], 'CommandPalette.tsx no longer registers with a literal label').toBeDefined();

    for (const label of [manual![1], hint![1], command![1]]) {
      expect(
        tour.includes(`'${label}'`),
        `lib/tour.ts does not watch for '${label}' any more, so that step can never complete`,
      ).toBe(true);
    }
  });
});

describe('a step completes by observation, never by a click', () => {
  it('advances when the command line actually opens — and only after it closes', () => {
    const steps = tourFor(FULL);
    let p = TOUR_START;
    expect(currentStep(steps, p)!.id).toBe('command-line');

    // Nothing yet: being on a route is not opening the command line.
    p = advanceTour(steps, p, at('/bd-pipeline'));
    expect(currentStep(steps, p)!.id).toBe('command-line');

    // ⌘K. The step is satisfied but the screen is not ready for the next one.
    p = advanceTour(steps, p, at('/bd-pipeline', 'command line'));
    expect(p.latched, 'the operator did the thing and the tour did not notice').toBe(true);
    expect(currentStep(steps, p)!.id, 'advanced while an overlay still owned the keyboard').toBe(
      'command-line',
    );

    // Escape.
    p = advanceTour(steps, p, at('/bd-pipeline'));
    expect(currentStep(steps, p)!.id).toBe('manual');
    expect(p.latched).toBe(false);
  });

  it('holds the completion once it has seen it, even for a single observation', () => {
    // The latch. `reached` is momentary by nature — "the manual is on the stack" stops
    // being true the instant it closes, and without latching the step would
    // un-complete itself and the operator would be asked to do it again.
    const steps = tourFor({});
    let p = advanceTour(steps, TOUR_START, at('/', 'command line'));
    expect(p.latched).toBe(true);
    p = advanceTour(steps, p, at('/', 'command line', 'manual'));
    expect(p.latched).toBe(true);
  });

  it('does not advance while an overlay owns the keyboard, which is the whole point', () => {
    /*
     * THE FINDING THIS MECHANISM EXISTS FOR. `lib/navGrammar.ts` and
     * `hooks/useHints.ts` both return early on `isOverlayOpen()`. So if the tour put
     * "press g then 2" on screen while the manual was still open, `g` would be dead
     * and the operator's reasonable conclusion would be that the shortcut is broken.
     */
    const steps = tourFor(FULL);
    let p = advanceTour(steps, TOUR_START, at('/', 'command line'));
    // Manual opened on top of the command line without either closing.
    p = advanceTour(steps, p, at('/', 'command line', 'manual'));
    expect(currentStep(steps, p)!.id).toBe('command-line');
    // One layer closed is not enough.
    p = advanceTour(steps, p, at('/', 'command line'));
    expect(currentStep(steps, p)!.id).toBe('command-line');
    p = advanceTour(steps, p, at('/'));
    expect(currentStep(steps, p)!.id).toBe('manual');
  });

  it('counts arriving anywhere inside a workspace, not just its landing page', () => {
    const steps = tourFor({ sales: 'view' });
    let p = advanceTour(steps, TOUR_START, at('/', 'command line'));
    p = advanceTour(steps, p, at('/'));
    p = advanceTour(steps, p, at('/', 'manual'));
    p = advanceTour(steps, p, at('/'));
    expect(currentStep(steps, p)!.id).toBe('go-sales');
    // A deal inside the workspace, reached by ⌘K rather than by `g 2`.
    p = advanceTour(steps, p, at('/deal-board'));
    expect(currentStep(steps, p)!.id).toBe('hints');
  });

  it('returns the identical progress object when nothing happened', () => {
    // Half of a two-part guard, stated honestly. `Tour.tsx` feeds this straight back
    // into `setProgress` from an effect; on its own, a fresh object here costs one
    // extra render per observation. Combined with a signal that has lost its
    // reference stability it is an infinite loop — measured, by breaking both at once.
    const steps = tourFor(FULL);
    const p = advanceTour(steps, TOUR_START, at('/'));
    expect(p).toBe(TOUR_START);
    expect(advanceTour(steps, p, at('/'))).toBe(p);
  });

  it('never skips a step the operator has not done', () => {
    const steps = tourFor(FULL);
    // A signal that satisfies a LATER step (arriving in governance) must not skip the
    // earlier ones — the greedy loop advances only through steps that are satisfied.
    const p = advanceTour(steps, TOUR_START, at('/wbr'));
    expect(currentStep(steps, p)!.id).toBe('command-line');
  });

  it('finishes, and finishing is the reward — there is nothing after it', () => {
    const steps = tourFor(RESTRICTED);
    const { visited, progress } = walk(steps);
    expect(visited).toEqual(steps.map((s) => s.id));
    expect(tourFinished(steps, progress)).toBe(true);
    expect(currentStep(steps, progress)).toBeNull();
  });

  it('does not ask for something the operator has already done', () => {
    /*
     * Standing at the desk when "and back to your desk" comes up completes it. That is
     * deliberate and it is the honest behaviour — they ARE at their desk, and a step
     * that insisted on a round trip to somewhere else and back would be a chore
     * invented by the tour. Recorded as a test rather than left as a surprise, because
     * the visible effect is a step that never appears.
     */
    const steps = tourFor({});
    let p = advanceTour(steps, TOUR_START, at('/', 'command line'));
    p = advanceTour(steps, p, at('/'));
    p = advanceTour(steps, p, at('/', 'manual'));
    p = advanceTour(steps, p, at('/'));
    p = advanceTour(steps, p, at('/', 'hint tags'));
    expect(currentStep(steps, p)!.id).toBe('hints');
    // Cancelling hint mode at the desk finishes the tour: `go-desk` is already true.
    p = advanceTour(steps, p, at('/'));
    expect(tourFinished(steps, p)).toBe(true);
  });

  it('the default settled predicate is "nothing owns the keyboard"', () => {
    expect(keyboardIsFree(at('/'))).toBe(true);
    expect(keyboardIsFree(at('/', 'tooltip'))).toBe(false);
  });

  it('no step can be completed by anything the tour itself renders', () => {
    // The structural version of "no Next button": every predicate reads only the
    // route and the dismiss stack, both of which are facts about the APP. There is no
    // step whose `reached` ignores its argument and returns true.
    for (const step of tourFor(FULL)) {
      expect(step.reached(at('')), `${step.id} completes itself with no input`).toBe(false);
    }
  });
});
