import { useEffect, useState } from 'react';
import { useUIStore } from '@/stores';
import { useInspectorStore } from '@/stores/useInspectorStore';
import { dismissStack } from '@/lib/dismiss';
import { canSplitAt, SPLIT_MIN_WIDTH } from '@/lib/split';

/**
 * `⌘\` docks the evidence pane beside the surface (T1 #12).
 *
 * The whole eager surface of the item: one listener, one media query, one boolean. The
 * pane itself is a component the shell already renders — there is no lazy chunk to fetch
 * because the payloads it shows are the same ones `InspectorHost` already imports, so
 * docking costs the initial bundle only this file and `lib/split.ts`.
 *
 * ── WHY THIS IS TWO HOOKS, WHICH IS A BUG I WROTE AND THEN MEASURED ───────────
 *
 * It was one hook that both installed the chord and returned the state, on the model of
 * `useHints` and `useManual`. Then the `?` manual needed the same state — it has to know
 * whether to list the key at all — and calling it there installed a SECOND `document`
 * keydown listener for `⌘\`. Both fired on one press, in registration order, and each read
 * the current value from the store: the first flipped `false → true`, the second read the
 * `true` the first had just committed and flipped it back. One press, two toggles, no
 * visible effect. `useHints` and `useManual` have the same shape and get away with it only
 * because nothing else ever needed to read them.
 *
 * So the chord and the state are separated, and the separation is enforced rather than
 * documented: `lib/__tests__/split.test.ts` fails if `useSplitViewChord` is called from
 * more than one file. A convention that only lives in a comment is the convention the
 * next reader breaks.
 *
 * ── WHY A CHORD AND NOT A BARE LETTER ────────────────────────────────────────
 * Every bare letter that matters is taken, and taken by something that MUTATES: `s`, `d`,
 * `e` on the two queue surfaces, `f` for hints, `g` for navigation, `j`/`k` for the
 * cursor. `⌘\` is the plan's own choice, it is what a Bloomberg operator's fingers already
 * know, and — unlike ⌘1-9, which Chrome reserves for tab switching and never delivers to
 * the page (measured in `lib/navGrammar.ts`) — it reaches the webview. `e2e/split.spec.ts`
 * presses it in a real browser rather than trusting that.
 *
 * ── WHAT IT STANDS DOWN FOR, AND WHY THAT LIST IS SHORT ──────────────────────
 *
 * NOT for typing. It is a chord, so it cannot be mistaken for a character someone meant to
 * type — the same argument `useManual` makes for ⌘/, and the reason `?` needed a chord
 * alternative at all.
 *
 * BUT it does stand down while an overlay owns the keyboard, and that is the one guard here
 * worth explaining, because `⌘/` deliberately does not. The manual is a thing you ask for
 * FROM inside a dialog; docking is a change to the layout BEHIND one. Allowing it would let
 * the operator reshape a surface they cannot see, and would put the pane on screen
 * underneath a scrim that stops them reaching it — the pane would appear to have done
 * nothing until they closed the dialog. It is reachable, too: ⌘\ inside the command line is
 * not a character the palette's input wants, so nothing else would have refused it.
 *
 * WITH ONE EXCEPTION, WHICH IS THE WHOLE FEATURE AND WHICH I SHIPPED BROKEN FIRST. The
 * guard began as a flat `if (isOverlayOpen()) return`, and the first behaviour test failed:
 * `InspectorDrawer` registers with the dismiss stack, so with the evidence ALREADY OPEN in
 * a drawer — the single most natural moment to press this key, "I am reading this, put it
 * beside the table" — the chord refused. The overlay it was standing down for was the thing
 * it exists to move.
 *
 * So the exception is stated in terms of what the universal inspector contributes:
 * `InspectorHost` renders exactly one drawer for a non-empty `useInspectorStore` stack, and
 * that drawer is exactly one entry on the dismiss stack. Anything MORE than that entry is
 * an overlay the chord must not act behind — the `?` manual over the drawer, the command
 * line, a page's own local drawer (`ReadinessStack`, `CompetitorInspector` and
 * `ProductIntelligence` each use `InspectorDrawer` directly and are NOT the pane's content,
 * so docking would not move them). Counted rather than matched on the drawer's label, which
 * is built from a title and would be a second spelling of a binding nothing keeps in step.
 * `evidenceDock.test.tsx` covers all four cases, and the "exactly one entry" premise is
 * pinned there too.
 *
 * ── THE VIEWPORT GATE ────────────────────────────────────────────────────────
 * Below `SPLIT_MIN_WIDTH` the chord does nothing and the pane never renders. Not "toggles a
 * preference that has no effect": a chord whose only feedback is silence teaches the
 * operator that it is broken. `lib/manual.ts` drops the line entirely at those widths for
 * the same reason — the manual's whole job is to not list keys that do nothing.
 *
 * `matchMedia` rather than a resize listener because it fires once per crossing instead of
 * once per frame of a drag. The `typeof` guard on it is LOAD-BEARING, not defensive:
 * MEASURED, `window.matchMedia` is `undefined` in this repo's jsdom environment
 * (`src/test/setup.ts` stubs nothing), so without it every component test that mounts the
 * shell throws. Which is also why the initial state is computed from `window.innerWidth`
 * rather than from the query — the same answer, available before the effect runs and
 * available at all under test.
 */

/** Read-only: is the pane docked, and could it be? Safe to call from anywhere. */
export function useEvidenceDock(): { docked: boolean; canDock: boolean } {
  const evidenceDocked = useUIStore((s) => s.evidenceDocked);
  const [canDock, setCanDock] = useState(() =>
    typeof window === 'undefined' ? false : canSplitAt(window.innerWidth),
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(`(min-width: ${SPLIT_MIN_WIDTH}px)`);
    setCanDock(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setCanDock(e.matches);
    // `addEventListener` on a MediaQueryList is Safari 14+; the WKWebView this ships in is
    // well past that, and so is every Chromium the web build runs in.
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return { docked: evidenceDocked && canDock, canDock };
}

/**
 * Install the `⌘\` chord. EXACTLY ONE CALL SITE — `components/layout/AppLayout.tsx`.
 * See the two-hook note above; `split.test.ts` enforces the count.
 */
export function useSplitViewChord(): { docked: boolean; canDock: boolean } {
  const state = useEvidenceDock();
  const setEvidenceDocked = useUIStore((s) => s.setEvidenceDocked);
  const { canDock } = state;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // `\` is the produced character on every layout that has the key at all; on the
      // layouts that do not, the chord is simply unavailable and the pane is still
      // reachable by its close button. Matching the character rather than `e.code` keeps
      // it correct on a UK layout, where ⌘\ is a different physical key.
      if (e.key !== '\\') return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.altKey || e.shiftKey) return;
      if (!canDock) return;
      // The universal inspector's own drawer does not count as an overlay to stand down
      // for — it is what this chord moves. Everything else does. See the note above.
      //
      // ONLY WHILE THAT DRAWER IS ACTUALLY ON SCREEN, and getting this wrong was a live
      // defect. `InspectorHost` returns null when docked, so a DOCKED inspector contributes
      // ZERO entries to the dismiss stack — but the allowance was granted on stack length
      // alone, so in the docked direction it forgave one entry that belonged to something
      // else entirely. MEASURED in Chromium: pane docked, `?` manual up (the manual is the
      // only stack entry), `⌘\` fired and the pane count went 1 → 0 — the chord re-laid out
      // the desk behind a scrim, which is the precise thing the paragraph above says it
      // refuses to do. Every overlay case was tested from the undocked side, where the
      // drawer's own entry masked it.
      //
      // `canDock` is already checked above, so `evidenceDocked` and `docked` agree here.
      const isDocked = useUIStore.getState().evidenceDocked;
      const fromInspector = !isDocked && useInspectorStore.getState().stack.length > 0 ? 1 : 0;
      if (dismissStack().length > fromInspector) return;
      e.preventDefault();
      setEvidenceDocked(!useUIStore.getState().evidenceDocked);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // The current value is read from the store at press time rather than closed over, so
    // it is deliberately not a dependency: listing it would re-subscribe on every toggle,
    // which is the churn `useDismissible` documents at length.
  }, [canDock, setEvidenceDocked]);

  return state;
}
