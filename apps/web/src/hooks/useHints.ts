import { useEffect, useState } from 'react';
import { isOverlayOpen } from '@/lib/dismiss';
import { isTypingTarget } from '@/lib/keyboard';

/**
 * `f` arms the hint layer (TERMINAL Phase 7).
 *
 * EAGER ON PURPOSE, AND NOTHING ELSE IS. The bundle has 11KB of headroom — MEASURED at
 * 839/850KB by `scripts/check-bundle.mjs` with this stream built, correcting the 836 this
 * comment first quoted — and the layer this key opens has to query the DOM, generate tags,
 * resolve chip overlaps and render one absolutely-positioned node per target. None
 * of that may sit in the initial bundle for the operators who never press `f`. So
 * this file is the whole eager surface — a boolean and one listener — exactly as
 * `useManual` is for `?` and `lib/keyboard.ts` is for ⌘K. It deliberately imports
 * nothing from `lib/hints.ts`: a single named import from there would pull the
 * module into the eager chunk and then the lazy chunk would import it back out,
 * which is how a "lazy" feature ends up costing full price.
 *
 * ONE GUARD DOES TWO JOBS, and it is the only clever line in the file.
 * `isOverlayOpen()` is here for the ordinary reason — while a dialog owns the
 * keyboard, a global motion key must go quiet or `f` tags the page BEHIND the
 * backdrop, where Tab is trapped away from it and activating something acts on a
 * surface the operator cannot see. But hint mode itself registers on the dismiss
 * stack, so once it is armed this same guard makes this listener stand down and lets
 * the layer's own handler take `f` as the cancel. No `on` flag in the dependency
 * list, so the subscription never churns.
 *
 * WHY `f` GOES QUIET IN A DIALOG WHEN `?` DOES NOT. `useManual` argues, correctly,
 * that an unfamiliar dialog with a gate in it is exactly where an operator needs the
 * manual. `f` is the opposite kind of thing: it is a MOTION, like `g`, and a motion
 * inside a dialog is either meaningless or dangerous. It is also already impossible
 * in the one overlay that matters — the command line autofocuses its input, so
 * `isTypingTarget` is true and `f` is a character the operator is typing. Two
 * overlays' worth of controls is 2-3 Tab stops, which is not the problem this layer
 * exists to solve; the problem is the 800-stop table traversal on the page.
 *
 * THE COST OF YIELDING TO TYPING, said plainly: there is no chord alternative. `?`
 * has ⌘/ because the native menu already advertised it; ⌘F is the browser's Find and
 * cannot be taken. So from inside a text field the operator must leave the field
 * before `f` works, and the manual entry says so instead of implying otherwise.
 */

/**
 * The key. Lives here rather than in `lib/hints.ts` because this is the eager
 * module that owns it, and `lib/hints.ts` and `lib/manual.ts` both read it from
 * here so the cancel branch, the manual line and the listener cannot drift.
 */
export const HINT_KEY = 'f';

export function useHints(): { on: boolean; setOn: (on: boolean) => void } {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Matched on the produced character and lowercase only. `F` is Shift+f, which
      // is a capital letter someone is trying to type far more often than it is a
      // request for hints — and unlike `?`, there is no layout on which the
      // unshifted key is unavailable.
      if (e.key !== HINT_KEY) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (isOverlayOpen()) return;
      e.preventDefault();
      setOn(true);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return { on, setOn };
}
