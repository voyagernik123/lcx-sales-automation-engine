import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { useDismissible } from '@/hooks/useDismissible';
import { MANUAL_LABEL } from '@/lib/manual';

/**
 * Lazy host for the manual (TERMINAL Phase 6).
 *
 * Same shape as the command line's host: nothing is fetched, parsed or rendered until
 * the operator actually presses `?`. The manual statically imports the 22-action
 * manifest, so keeping it out of the eager bundle is the difference between a help
 * feature and a help feature that slowed down first paint for everyone who never
 * opens it.
 *
 * No Suspense fallback on purpose. The chunk is small and local; a spinner that
 * flashes for 30ms is worse than nothing appearing for 30ms, and `?` is a toggle the
 * operator can simply press again.
 */
const Manual = lazy(() => import('./Manual').then((m) => ({ default: m.Manual })));

/**
 * THE LAZY-LOAD WINDOW HAS AN ESCAPE (TERMINAL follow-up #2, 2026-09-02).
 *
 * The body registers itself on the dismiss stack when it MOUNTS — which is after its chunk
 * arrives. An Escape pressed inside that window found no entry and was dropped, so `?` then
 * `Escape` in quick succession left the manual open. The host owns `open`, so it holds a stack
 * entry — same label — ONLY until the body reports it has mounted, then hands over. One entry at
 * any moment: the body's registration, its Tab confinement (`panelRef`) and its dialog role stay
 * together in Manual.tsx, which is what `hintScope.test.ts` and `dismissRegistration.test.ts`
 * both read; this file adds the bridge, not a second owner.
 */
export function ManualHost({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [bodyMounted, setBodyMounted] = useState(false);
  useEffect(() => { if (!open) setBodyMounted(false); }, [open]);
  const onMounted = useCallback(() => setBodyMounted(true), []);
  // The bridge: active from `?` until the body's own registration exists, then inactive.
  useDismissible(open && !bodyMounted, onClose, MANUAL_LABEL);
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <Manual open={open} onClose={onClose} onMounted={onMounted} />
    </Suspense>
  );
}
