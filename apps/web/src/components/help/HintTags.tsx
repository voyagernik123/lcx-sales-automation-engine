import { useEffect, useRef, useState } from 'react';
import { useDismissible } from '@/hooks/useDismissible';
import { HINT_KEY } from '@/hooks/useHints';
import {
  HINT_CHIP_H,
  HINT_LABEL,
  activateTarget,
  hintSnapshot,
  narrow,
  stepHint,
  type HintScopeKind,
  type HintTarget,
} from '@/lib/hints';

/**
 * The rendered hint layer (TERMINAL Phase 7).
 *
 * Lazy — see `HintLayer.tsx`. Everything about WHY the mechanic is shaped this way
 * is in `lib/hints.ts`; this file owns the three things that are about being a
 * component: when the snapshot is taken, when it is thrown away, and the order the
 * teardown happens in.
 *
 * THE SNAPSHOT IS TAKEN ONCE, IN THE INITIALISER. Not in an effect: an effect runs
 * after this component's own nodes are in the DOM, and while the chips are
 * `pointer-events: none` and `position: fixed` they still exist, so a later
 * re-collection would have to reason about excluding them. Reading layout during
 * render is safe here precisely because none of this layer is on screen yet.
 *
 * AND THE SCOPE IS DECIDED IN THE SAME BREATH, which is the second reason the
 * initialiser is the right place. `resolveHintScope` asks `isOverlayOpen()`, and this
 * component puts ITSELF on the dismiss stack — in an effect, which runs after render. So
 * the initialiser is the only moment at which that question still means "was an overlay
 * open when `f` was pressed?" rather than "is hint mode armed?". Moving this into an
 * effect would make every snapshot think it was inside an overlay.
 *
 * IT IS THROWN AWAY ON SCROLL, RESIZE OR A POINTER PRESS. The chips are positioned
 * from viewport coordinates captured at press time, so any of those three makes
 * every position a lie — and a chip that has drifted onto a neighbouring control is
 * worse than no chip, because the operator will type its tag. Scroll is listened for
 * in the CAPTURE phase: the page's own scroller is `MainContent`, not the window, and
 * a bubbling scroll listener on document never sees a nested scroller at all.
 */
export function HintTags({ onClose }: { onClose: () => void }) {
  // Collected in the initialiser so it happens exactly once, before any of this
  // layer's own nodes exist and before this component joins the dismiss stack.
  const [snapshot] = useState<{ kind: HintScopeKind; targets: HintTarget[] }>(() => hintSnapshot());
  const targets: HintTarget[] = snapshot.targets;
  const [typed, setTyped] = useState('');

  /*
   * Escape closes hint mode through the one stack that owns Escape. That is the whole
   * reason to register: no second Escape listener, no ordering by mount time.
   *
   * WHAT REGISTERING DOES *NOT* BUY, correcting a claim this comment used to make — and
   * then re-correcting half of the correction. It said registering also puts "hint tags"
   * into the Phase 6 manual's live "esc closes, in this order" report. It is on the stack
   * — `hintTags.test.tsx` asserts that — but the manual will never display it. The reason
   * given here first was "`f` refuses to arm while `isOverlayOpen()`, so hint mode is
   * always the ONLY entry on the stack": that is no longer true, because `f` now arms
   * inside a trapping overlay and the stack there reads [that overlay, hint tags]. The
   * OTHER reason is the one that actually holds, and it holds unchanged: `?` closes hint
   * mode on its way through — it has its own rung in `stepHint`, which closes without
   * claiming so the key still reaches `useManual` — so the manual always mounts with hint
   * mode already gone. The registration is load-bearing for Escape and inert for the
   * manual, and the manual documents `f` in its Everywhere section (src/lib/manual.ts).
   *
   * NO CONTAINER REF, i.e. Tab is NOT trapped, and this line now does a second job. The
   * first: this layer is not modal — it contains nothing focusable, so trapping Tab would
   * hand `dismiss.ts`'s zero-tabbables branch a container to park focus on and strand the
   * operator inside a decoration. The second: `useHints` stands its eager listener down
   * when the TOP stack entry traps, so a container-less registration here is exactly what
   * hands the second `f` to the handler below as a cancel — including from inside an
   * overlay that does trap, because hint mode is the entry above it.
   */
  useDismissible(true, onClose, HINT_LABEL);

  /**
   * The target a completed tag chose, activated during THIS component's unmount.
   *
   * The ordering is the point, and it is deliberate rather than incidental. React
   * destroys a fiber's effects in declaration order, so the `useDismissible` above —
   * declared first — has already left the dismiss stack by the time the cleanup below
   * runs. That matters because `useListNavigation` refuses Enter while
   * `isOverlayOpen()` (src/hooks/useListNavigation.ts:199), and hint mode IS an open
   * overlay by that definition, so activating from inside the keydown handler would
   * make the Enter fallback silently do nothing on exactly the row targets it exists
   * for. Activating from a cleanup reads as clever, which is why the invariant is
   * asserted in the tests rather than trusted: HINT MODE must be off the stack when
   * `activateTarget` is called.
   *
   * "Hint mode", not "the stack is empty", and the difference is a limit worth stating
   * rather than a bug. On the page the stack IS empty at that moment. Inside an overlay it
   * is not — the overlay is still open, by definition — so `isOverlayOpen()` is true and
   * `useListNavigation` would refuse the Enter fallback for a row tagged INSIDE an
   * overlay. The click half still lands, so every ordinary control works; what is dead
   * there is specifically a row whose activation lives only in a container-level
   * `onKeyDown`. No such row exists inside a trapping overlay in this app today (the four
   * `useListNavigation` consumers are all page-level tables), which is why this is
   * recorded here instead of fixed with a second activation path.
   */
  const pending = useRef<Element | null>(null);
  useEffect(
    () => () => {
      const el = pending.current;
      pending.current = null;
      // Not awaited: the synchronous half (focus, then the click) runs before
      // `activateTarget` yields, and its deferred half only decides whether to add an
      // Enter. A cleanup cannot be async anyway.
      if (el) void activateTarget(el);
    },
    [],
  );

  // Read through refs so the listener subscribes once. Re-subscribing per keystroke
  // would be waste, and `lib/dismiss.ts` records what registration churn costs when
  // ordering is load-bearing.
  const state = useRef({ targets, typed, onClose });
  state.current = { targets, typed, onClose };

  /*
   * CAPTURE, AND `stopPropagation` ON ANYTHING CLAIMED. This is the one place the layer
   * breaks the house rule that global keys live on the document BUBBLE, and it is a
   * correction of a real defect rather than a preference.
   *
   * `preventDefault()` is not `stopPropagation()`. It suppresses the browser's own
   * default for the key and nothing else; every other listener still runs. The page this
   * layer covers has bare-letter verbs that MUTATE RECORDS — `s` snooze, `d` disqualify,
   * `e` enroll, `j`/`k` selection, `1`-`4` split — installed as a BUBBLE listener on
   * `window` (src/pages/BdPipeline.tsx:438) and gated on that page's own dialog state
   * only, never on `isOverlayOpen()`. `window` is the last node in the bubble path, after
   * `document`, so with a bubble listener here the sequence was: hint layer claims `d`,
   * calls `preventDefault`, closes — and then BdPipeline's handler runs, does not look at
   * `defaultPrevented`, and opens the disqualify dialog for the selected lead. Measured in
   * `hintTags.test.tsx` ("a page verb bound on window never sees a swallowed key"), which
   * failed on all six keys before this change. `lib/hints.ts` rung 5 promises those keys
   * are swallowed; a bubble listener could not keep that promise.
   *
   * Capture on `document` runs before the target, before React's root listener, and
   * before any `window` bubble listener, so stopping propagation there is the only
   * position from which this layer can protect a page it knows nothing about — which is
   * the whole premise of zero-per-control wiring.
   *
   * ONLY WHAT IS CLAIMED IS STOPPED, which is what keeps this from trading one defect for
   * two. `stepHint` does not claim Escape (so `lib/dismiss` still owns it), does not claim
   * Tab, and does not claim a modifier chord (so ⌘K still opens the command line). All
   * three are asserted next to the test above.
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const { targets: list, typed: prefix, onClose: close } = state.current;
      const step = stepHint(
        list.map((t) => t.tag),
        prefix,
        e,
      );
      if (step.claim) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (step.activate !== null) {
        // Queued, not called. See `pending` above.
        pending.current = list[step.activate]?.el ?? null;
      }
      if (step.close) {
        close();
        return;
      }
      if (step.typed !== prefix) setTyped(step.typed);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);

  useEffect(() => {
    const cancel = () => state.current.onClose();
    // Capture, for the nested-scroller reason above. Passive because we never
    // preventDefault a scroll — cancelling hint mode must not also stop the page
    // from scrolling, which is what the operator actually asked for.
    document.addEventListener('scroll', cancel, { capture: true, passive: true });
    window.addEventListener('resize', cancel);
    // A pointer press means they changed their mind and are using the mouse. Capture
    // so it wins even over a handler that stops propagation.
    document.addEventListener('pointerdown', cancel, true);
    return () => {
      document.removeEventListener('scroll', cancel, { capture: true });
      window.removeEventListener('resize', cancel);
      document.removeEventListener('pointerdown', cancel, true);
    };
  }, []);

  const live = narrow(
    targets.map((t) => t.tag),
    typed,
  );

  return (
    <>
      <div
        data-hint-layer=""
        // Hidden from assistive tech on purpose: forty two-letter labels read aloud is
        // noise, and a screen-reader user already has a better instrument for
        // "enumerate the controls" than a visual code. The status line below is the
        // part they need.
        aria-hidden="true"
        // `z-[110]` is not free-floating: `HINT_LAYER_Z` in lib/hints.ts is the same number
        // and is what `resolveHintScope` compares an overlay's own level against before it
        // agrees to tag it. Tailwind needs the literal in the source, so the two are pinned
        // together by `lib/__tests__/hintScope.test.ts` rather than by hope.
        className="pointer-events-none fixed inset-0 z-[110]"
      >
        {live.map((i) => {
          const target = targets[i]!;
          return (
            <span
              key={`${target.tag}-${i}`}
              data-hint-tag={target.tag}
              className="absolute flex h-[15px] items-center rounded-sm border border-navy-deep bg-amber-200 px-1 font-mono text-[10px] font-bold uppercase text-navy-deep shadow-card-md"
              style={{ top: target.top, left: target.left }}
            >
              {target.tag}
            </span>
          );
        })}
      </div>

      {/*
        The one thing the chips cannot say: whether a keystroke registered. Rendered
        once, at full strength, rather than by dimming the typed half of every chip —
        `text-navy-deep/50` on the amber fill composites to 3.16:1, which is below the
        4.5:1 minimum this repo's contrast ratchet holds text to, and progress
        feedback is not worth a standards failure when a single pill says it better.
      */}
      <div
        role="status"
        aria-live="polite"
        data-hint-status=""
        className="pointer-events-none fixed bottom-3 left-3 z-[110] flex items-center gap-2 rounded border border-navy-deep bg-amber-200 px-2 py-1 font-mono text-micro font-bold text-navy-deep shadow-overlay"
      >
        <span>
          {HINT_KEY}
          {typed ? ` ${typed.toUpperCase()}` : ''}
        </span>
        <span className="font-normal">
          {/*
            Three messages, not two, because "nothing actionable in view" would be a lie in
            the third case and the operator would go looking for a control that IS there.
            `unscoped` means the layer could not work out which of the open overlays it is
            standing in, or that it paints underneath the one that is — see
            `resolveHintScope`. Saying so is the difference between a feature that is absent
            and one that looks broken.
          */}
          {snapshot.kind === 'unscoped'
            ? 'no tag scope for what is open · esc cancels'
            : targets.length === 0
              ? 'nothing actionable in view'
              : `${live.length} of ${targets.length} · esc cancels`}
        </span>
      </div>
    </>
  );
}

/**
 * Re-exported so the e2e spec can pin the constant to the rendered chip instead of
 * asserting a number that happens to match today.
 */
export { HINT_CHIP_H };
