import { useEffect, useState } from 'react';
import { isOverlayOpen, topTraps } from '@/lib/dismiss';
import { isTypingTarget } from '@/lib/keyboard';

/**
 * `f` arms the hint layer (TERMINAL Phase 7).
 *
 * EAGER ON PURPOSE, AND NOTHING ELSE IS. The bundle has 8KB of headroom — MEASURED at
 * 842/850KB by `scripts/check-bundle.mjs` with this stream built, correcting the 839 this
 * comment quoted before the scope work (the same script reports 841 with these four files
 * at HEAD, so the scope resolver and the `topTraps` import above cost ~0.1KB of the eager
 * chunk between them) — and the layer this key opens has to query the DOM, generate tags,
 * resolve chip overlaps and render one absolutely-positioned node per target. None
 * of that may sit in the initial bundle for the operators who never press `f`. So
 * this file is the whole eager surface — a boolean and one listener — exactly as
 * `useManual` is for `?` and `lib/keyboard.ts` is for ⌘K. It deliberately imports
 * nothing from `lib/hints.ts`: a single named import from there would pull the
 * module into the eager chunk and then the lazy chunk would import it back out,
 * which is how a "lazy" feature ends up costing full price.
 *
 * THE OVERLAY GUARD, AND THE CLAIM IT USED TO CARRY THAT WAS WRONG.
 *
 * This was `if (isOverlayOpen()) return` — `f` went quiet whenever anything was on the
 * dismiss stack — and the justification written here was "two overlays' worth of controls
 * is 2-3 Tab stops, which is not the problem this layer exists to solve". MEASURED, that
 * is false about the surface it matters most on: the partner dossier is 24 Tab stops, and
 * e2e/keyboardday.spec.ts flow 3 puts the worst keyboard cost of its five flows on exactly
 * that drawer. The mechanism built to make everything keyboard-reachable was blind on the
 * one screen with the most to reach.
 *
 * What the veto was really protecting is a chip drawn on a control BEHIND the backdrop:
 * Tab is trapped away from it, so a tag that activates it acts on a surface the operator
 * cannot see. The answer to that is a SCOPE, not silence — `resolveHintScope` in
 * `lib/hints.ts` restricts the query to the overlay itself. It is NOT protecting against a
 * fumbled tag character reaching `d` disqualify or `s` snooze on the page underneath;
 * `HintTags` holds that with a capture-phase listener plus `stopPropagation()`, which is a
 * strictly stronger guarantee than standing down and is asserted for the overlay case.
 *
 * So the condition is now "an overlay is open AND the top one does not trap Tab".
 * `topTraps()` is the same question `aria-modal` asks, and it is the honest gate for two
 * reasons: an entry that declares a container is one whose extent is well defined (Tab is
 * already confined to it, so "the controls the operator can reach" is a subtree rather
 * than a guess), and a non-trapping entry — a tooltip, a lineage popover, the command line
 * — either leaves the page behind fully reachable or owns the keyboard some other way.
 * The layer refuses whatever this admits but cannot scope; see `resolveHintScope`.
 *
 * ONE GUARD STILL DOES TWO JOBS, which is the only clever thing left in the file. Hint
 * mode registers itself on the dismiss stack WITHOUT a container ref (it traps nothing —
 * see HintTags.tsx), so the moment it is armed `topTraps()` is false and this listener
 * stands down, which is what lets the layer's own handler take the second `f` as a cancel.
 * That holds inside an overlay too: the stack is then [dossier, hint tags] and the top
 * entry is still the container-less one. No `on` flag in the dependency list, so the
 * subscription never churns.
 *
 * WHY `f` GOES QUIET IN THE COMMAND LINE WHEN `?` DOES NOT. `useManual` argues,
 * correctly, that an unfamiliar dialog with a gate in it is exactly where an operator
 * needs the manual. `f` is different in the one overlay that matters most for it — the
 * command line autofocuses its input, so `isTypingTarget` is true and `f` is a character
 * the operator is typing. That guard, not the overlay guard, is what keeps `f` out of it.
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
      if (isOverlayOpen() && !topTraps()) return;
      e.preventDefault();
      setOn(true);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return { on, setOn };
}
