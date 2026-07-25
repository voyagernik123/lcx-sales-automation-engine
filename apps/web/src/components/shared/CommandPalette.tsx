/**
 * The command line's eager shell (TERMINAL Phase 3).
 *
 * Two jobs only: own the key that opens the command line, and lazily mount its
 * body. Everything else — the grammar, the generated verbs, the object search —
 * lives in components/command/CommandBody.tsx and is not in the initial bundle.
 *
 * The shell has to be eager because the thing it loads cannot load itself.
 */

import { Suspense, lazy, useEffect, useState } from 'react';
import { acceptCommandChord, isCommandChord } from '@/lib/keyboard';
import { useDismissible } from '@/hooks/useDismissible';

const CommandBody = lazy(() => import('@/components/command/CommandBody'));

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  // The palette is just another entry on the dismiss stack, and being the most
  // recently opened thing it wins Escape for free. That replaces the mirrored
  // `setCommandOpen` flag three other components had to consult by hand — and any
  // fourth overlay would have had to remember to consult too.
  useDismissible(open, () => setOpen(false), 'command line');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isCommandChord(e)) return;
      e.preventDefault();
      // Deduped: in the terminal the same chord can arrive from the native menu
      // AND the webview, and toggling twice reads as a broken shortcut.
      if (acceptCommandChord()) setOpen((prev) => !prev);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

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
