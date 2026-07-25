import { useEffect, useState } from 'react';
import { isTypingTarget } from '@/lib/keyboard';

/**
 * `?` opens the manual (TERMINAL Phase 6).
 *
 * Eager on purpose, and separated from the Manual component for exactly the reason
 * the command line's chord is separated from its body: something already resident has
 * to own the key that loads the lazy chunk.
 *
 * TWO WAYS IN, AND THE SECOND ONE IS THE INTERESTING ONE.
 *
 * `?` does NOT defer to `isOverlayOpen()` the way `g` does. Navigation must go quiet
 * inside a dialog — typing `g` must not move the page out from under it — but an
 * unfamiliar dialog with a gate in it is precisely where an operator most needs to ask
 * "what can I do, and why won't it let me?". The manual registers on the dismiss stack
 * itself, so Escape closes the manual first and the dialog second.
 *
 * But `?` alone is not enough, and I only found out by testing it. The command line
 * AUTOFOCUSES its search field, so with ⌘K open the operator is typing, `isTypingTarget`
 * is true, and `?` is correctly treated as a character. That is not a bug to route
 * around — stealing `?` from a search box would make it impossible to type. It does
 * mean the claim "? works inside any dialog" was too broad, so ⌘/ is bound as well: a
 * chord is unambiguous mid-sentence and reaches the manual from anywhere, typing or
 * not. It is also exactly what the native menu already advertises (⌘/ = "LCX TERMINAL
 * Manual"), so the app and its menu now agree instead of the menu promising a key the
 * webview did not implement.
 */
/**
 * The bare key that opens the manual.
 *
 * Exported in Phase 7 for one consumer: `lib/hints.ts` has to let this key THROUGH while
 * hint mode owns the keyboard, and a hard-coded `'?'` over there would be a second
 * spelling of this binding that nothing keeps in step. See the manual rung in `stepHint`.
 */
export const MANUAL_KEY = '?';

export function useManual(): { open: boolean; setOpen: (open: boolean) => void } {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ⌘/ — works everywhere, including inside a text field, because a chord cannot
      // be mistaken for something the operator meant to type.
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      // Bare `?` — matched on the produced character, not the physical key, since it
      // is Shift+/ on a US layout and elsewhere on others. Yields to typing: `?` in a
      // search box is a question mark, and the manual is the least urgent thing anyone
      // wants mid-sentence.
      if (e.key !== MANUAL_KEY) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      setOpen((prev) => !prev);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return { open, setOpen };
}
