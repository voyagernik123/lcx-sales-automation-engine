/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  DOES THIS DESK STILL OWN ITS BARE-LETTER KEYS? — the standdown, as one query
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `lib/split.ts` states the rule: a surface owns its bare-letter keys and its row arrows
 * ONLY while focus is outside a docked pane, enforced by the surface's own listener calling
 * a query rather than by a React context (a context value is a second copy of a DOM fact,
 * updated a tick later, and two cursors disagreeing about where the operator is is the
 * family of bug here).
 *
 * THERE ARE NOW TWO DOCKED PANES and `keysBelongToSurface()` knows about one. It checks
 * `EVIDENCE_PANE_ATTR`, which is the universal inspector `⌘\` docks from `AppLayout`;
 * `GpsSplit` docks a second pane under its own attribute, deliberately — `EvidencePane`'s
 * is not shareable, and putting the GPS pane on the dismiss stack would make
 * `isOverlayOpen()` true and silently kill the very desk keys docking exists to preserve
 * (`GpsSplit.tsx`, "NO SECOND ESCAPE OWNER").
 *
 * ── WHY THIS IS A MODULE OF ITS OWN AND NOT A LINE IN EITHER NEIGHBOUR ────────
 *
 * It cannot live in `lib/split.ts`: that file is imported by the app shell and knows
 * nothing about GPS, and teaching a generic lib one compartment's attribute is how the
 * next compartment's gets added too. It cannot live in `GpsSplit.tsx` either, because the
 * files that must CALL it — `pages/GpsLoop.tsx`, `pages/GpsDelivery.tsx` — do not mount the
 * split, and importing the component to reach a predicate would pull `GpsInspector`,
 * `InspectorDrawer` and three icons into two page chunks that never render them.
 *
 * So the ATTRIBUTE lives here and `GpsSplit` imports it, which also means there is exactly
 * one string. It was declared in two places for about an hour and that is precisely how a
 * guard ends up watching an attribute nobody sets any more.
 */

import { keysBelongToSurface } from '@/lib/split';

/** Marks the GPS docked pane's root. Its own attribute, NOT `EVIDENCE_PANE_ATTR`. */
export const GPS_INSPECTOR_PANE_ATTR = 'data-gps-inspector-pane';

/**
 * Do the desk's own bare-letter keys still belong to the desk?
 *
 * False exactly when focus is inside either docked pane. Safe to call from a page that
 * mounts neither: no pane on screen means no containment, means the desk owns its keys,
 * which is every GPS desk on every day nobody docks anything.
 *
 * `closest` rather than a lookup plus `contains`, for the reason `keysBelongToSurface` gives:
 * one traversal from the focused node, and no reference to a pane that may not exist.
 */
export function gpsKeysBelongToSurface(
  active: Element | null = typeof document === 'undefined' ? null : document.activeElement,
): boolean {
  if (!active) return true;
  if (active.closest(`[${GPS_INSPECTOR_PANE_ATTR}]`)) return false;
  return keysBelongToSurface(active);
}
