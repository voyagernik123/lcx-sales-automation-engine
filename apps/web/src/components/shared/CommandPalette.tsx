/**
 * The command line's eager shell (TERMINAL Phase 3).
 *
 * Two jobs only: own the key that opens the command line, and lazily mount its
 * body. Everything else — the grammar, the generated verbs, the object search —
 * lives in components/command/CommandBody.tsx and is not in the initial bundle.
 *
 * The shell has to be eager because the thing it loads cannot load itself.
 */

import { Suspense, lazy, useEffect, useState, useCallback } from 'react';
import { acceptCommandChord, isCommandChord, setCommandOpen } from '@/lib/keyboard';

const CommandBody = lazy(() => import('@/components/command/CommandBody'));

export function useCommandPalette() {
  const [open, setOpenState] = useState(false);

  // Mirror into the module-level flag so capture-phase Escape handlers elsewhere
  // (DealReviewMemo, Derived, SnoozeMenu) can defer to us. They run outside the
  // React tree, so a context would be invisible to them.
  const setOpen = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setOpenState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      setCommandOpen(value);
      return value;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isCommandChord(e)) {
        e.preventDefault();
        // Deduped: in the terminal the same chord can arrive from the native menu
        // AND the webview, and toggling twice reads as a broken shortcut.
        if (acceptCommandChord()) setOpen((prev) => !prev);
        return;
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [setOpen]);

  return { open, setOpen };
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Nothing is fetched, parsed or rendered until the operator actually asks.
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <CommandBody open={open} onClose={onClose} />
    </Suspense>
  );
}
