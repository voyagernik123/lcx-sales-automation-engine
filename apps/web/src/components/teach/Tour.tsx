import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import type { EntitlementMap } from '@lcx/shared';
import { dismissStack, subscribeDismiss } from '@/lib/dismiss';
import {
  advanceTour,
  currentStep,
  tourFinished,
  tourFor,
  TOUR_START,
  type TourSignal,
} from '@/lib/tour';
import type { TourOutcome } from './tourSeen';

/**
 * The first run, on screen (T1 #19). The generation and the completion predicates are
 * in `lib/tour.ts`; this file is the panel and the two subscriptions that feed it.
 *
 * ── IT IS NOT AN OVERLAY, AND THAT IS A MEASURED DECISION ─────────────────────
 * The house rule is that anything taking over the screen registers with
 * `useDismissible` so Escape has one owner. This panel deliberately does not, because
 * registering would BREAK the tour: `lib/navGrammar.ts` and `hooks/useHints.ts` both
 * bail out on `isOverlayOpen()`, which is `stack.length > 0`. One entry on that stack
 * — this one — and `g <digit>` and `f` are dead everywhere, which is 7 of the 10 steps
 * a fully entitled operator is about to be taught. A tour that silences the grammar it
 * teaches is worse than no tour.
 *
 * So it behaves like the toast layer instead: a corner panel that owns no keys, traps
 * no focus, declares no dialog role (`dismissRegistration.test.ts` counts overlays by
 * the ARIA they declare, and this declares none because it is none), and is dismissed
 * by a button that is one Tab away. What the operator loses is Escape-to-skip. Said
 * plainly rather than hidden: Escape does nothing to this panel, and the panel says
 * "Skip" on it so nobody has to guess. `?` and ⌘K still work over it, which is what
 * the tour actually needs.
 *
 * ── NO ANIMATION, ALSO ON PURPOSE ─────────────────────────────────────────────
 * The obvious build for this is a spotlight that travels to each target. That is a
 * large-area, unexpected, whole-viewport movement — the exact profile
 * `prefers-reduced-motion` exists to suppress, and the one this app's blanket CSS rule
 * cannot fully neuter because a moving cut-out is layout, not a transition. The panel
 * therefore stays in one place and changes its text. There is no motion to reduce, so
 * there is no reduced-motion branch here to test, and claiming one would be the kind
 * of decorative guard this programme keeps deleting.
 *
 * ── NO PROGRESS METER ─────────────────────────────────────────────────────────
 * No "3 of 8", no percentage, no confetti. The plan's rule is speed, mastery and
 * closure; a counter that fills is a fourth thing, and it turns a two-minute detour
 * into an obligation. The reward for finishing is that it stops.
 */
export function Tour({
  entitlements,
  onSettle,
}: {
  entitlements: EntitlementMap;
  onSettle: (how: TourOutcome) => void;
}) {
  const { pathname } = useLocation();
  // The live dismiss stack. `useSyncExternalStore` because `dismissStack()` is an
  // external mutable thing that renders — the same reason the manual reads it this
  // way, and the fix for the Phase 7 bug where the manual described a stale stack.
  const stack = useSyncExternalStore(subscribeDismiss, dismissStack);

  const steps = useMemo(() => tourFor(entitlements), [entitlements]);
  // `dismissStack()` is reference-stable until the stack actually changes, so these
  // two memos are stable too — which is what keeps the effect below from firing on
  // every unrelated re-render of the shell.
  const overlays = useMemo(() => stack.map((e) => e.label), [stack]);
  const signal = useMemo<TourSignal>(() => ({ pathname, overlays }), [pathname, overlays]);

  const [progress, setProgress] = useState(TOUR_START);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    // TWO GUARDS, AND NEITHER IS OPTIONAL. `signal` is memoised on reference-stable
    // inputs so this effect fires on an observation and not on every re-render of the
    // shell; `advanceTour` returns the SAME progress object when nothing happened so
    // `setProgress` bails out. Drop BOTH and it is an infinite render loop — measured:
    // the component suite went from 11s to producing no output for 200s. Drop either
    // one alone and it still terminates, which is exactly why both are easy to lose.
    setProgress((p) => advanceTour(steps, p, signal));
  }, [steps, signal]);

  const finished = tourFinished(steps, progress);

  // Settled on ARRIVAL at the end, not on the farewell card's button. If it waited
  // for the click, an operator who finished the tour and then reloaded would be
  // offered the whole thing again — the one outcome the persistence exists to prevent.
  useEffect(() => {
    if (finished) onSettle('finished');
  }, [finished, onSettle]);

  if (closed) return null;

  const step = currentStep(steps, progress);

  return (
    <section
      aria-label="First run"
      /* Above the manual's z-[120], which looks wrong and is not: the moment the
       * manual is open is the moment this panel is telling the operator how to come
       * back out of it. Centred under the top bar, because every step it teaches (⌘K, `?`,
       * the workspace switcher) lives in that bar — and because bottom-left was found in
       * production sitting on top of the sidebar's Field Notes card. */
      className="fixed top-14 left-1/2 z-[130] w-[19rem] -translate-x-1/2 rounded-lg border border-line bg-card p-3 shadow-overlay"
    >
      <div className="flex items-start gap-2">
        <h2 className="text-micro font-bold uppercase tracking-wider text-grey">
          {finished ? 'You are set up' : 'First run'}
        </h2>
        <button
          onClick={() => {
            if (!finished) onSettle('skipped');
            setClosed(true);
          }}
          className="t-hover focus-ring ml-auto flex items-center gap-1 rounded px-1 text-micro text-grey hover:text-navy"
        >
          {finished ? 'Done' : 'Skip'}
          <X size={12} />
        </button>
      </div>

      {/* Announced, because the step changes without anything taking focus — a
        * keyboard operator whose focus is out on the page would otherwise never hear
        * that the panel moved on. */}
      <div aria-live="polite" className="mt-2">
        {finished || !step ? (
          <p className="text-body leading-relaxed text-navy">
            That is the whole grammar. <Chip>⌘K</Chip> and <Chip>?</Chip> are the two you will use
            all day; the rest is in the manual, generated from what this build can actually do.
          </p>
        ) : (
          <>
            <p className="text-body leading-relaxed text-navy">{step.prompt}</p>
            <p className="mt-2 flex items-center gap-1">
              {step.keys.map((k) => (
                <Chip key={k}>{k}</Chip>
              ))}
            </p>
            {/* The only feedback in the whole feature, and it is the reason there is
              * no Next button: the operator gets confirmation for the thing they did,
              * plus the one key that gets them back to where the next step can work.
              * `g` and `f` are dead while anything is on the dismiss stack, so this is
              * not a courtesy — it is the difference between the next step working and
              * appearing broken. */}
            {progress.latched && (
              <p className="mt-2 flex items-center gap-1.5 text-micro text-grey">
                <Check size={12} className="text-cyan-600 dark:text-cyan-400" />
                Done — <Chip>Esc</Chip> to come back
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-ice-soft px-1.5 font-mono text-micro font-medium leading-5 text-navy dark:bg-navy-deep">
      {children}
    </kbd>
  );
}
