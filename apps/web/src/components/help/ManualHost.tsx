import { Suspense, lazy } from 'react';

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
const ManualBody = lazy(() => import('./Manual').then((m) => ({ default: m.Manual })));

export function ManualHost({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <ManualBody open={open} onClose={onClose} />
    </Suspense>
  );
}
