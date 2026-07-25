import { Suspense, lazy } from 'react';

/**
 * Lazy host for the hint layer (TERMINAL Phase 7).
 *
 * Identical in shape to `ManualHost`, and it exists for a sharper reason: the body
 * pulls in the whole target-discovery module and one rendered node per control on
 * screen, and the bundle has 8KB of headroom (measured — see `useHints.ts`). Nothing
 * here is fetched, parsed or
 * rendered until the operator actually presses `f`.
 *
 * No Suspense fallback, same as the manual. A spinner for a local chunk flashes and
 * then argues with the tags it is about to be replaced by, and hint mode is
 * cancellable with Escape at any point if the operator changes their mind. What the
 * gap DOES cost is stated where it is paid: characters typed between the press and
 * the body mounting reach the page, which is why the tag alphabet excludes every
 * letter the app binds (see `HINT_ALPHABET`).
 */
const HintBody = lazy(() => import('./HintTags').then((m) => ({ default: m.HintTags })));

export function HintLayer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <HintBody onClose={onClose} />
    </Suspense>
  );
}
