import { useEffect, useRef } from 'react';
import type React from 'react';
import { pushDismissible, removeDismissible } from '@/lib/dismiss';

/**
 * Declare that something is on screen and Escape should back out of it.
 *
 * `label` is what the operator would call the thing ("snooze menu", "command
 * line"). It is not cosmetic: it is what `dismissStack()` reports, which is how
 * the Phase 6 manual answers "what will Escape do right now?" and how a stuck
 * overlay gets diagnosed instead of shrugged at.
 *
 * The ref indirection is the entire reason this is a hook rather than two lines
 * inlined at each call site. Every caller passes an inline arrow — `() =>
 * setOpen(false)` — so `onDismiss` has a fresh identity on every render. In the
 * effect's dependency list that would unsubscribe and re-subscribe on every
 * render, and since the stack is ordered by registration, a parent re-rendering
 * for any unrelated reason would silently promote its overlay to the top and
 * steal Escape from the dialog actually in front of the operator. Reading through
 * a ref keeps the registration stable for exactly as long as the thing is open,
 * which is the lifetime the stack is supposed to model.
 */
export function useDismissible(
  open: boolean,
  onDismiss: () => void,
  label: string,
  /**
   * The overlay's root, when Tab should be confined to it.
   *
   * Optional on purpose: not everything dismissible is modal. A tooltip and a lineage
   * popover belong on the stack — Escape should close them — but trapping Tab inside a
   * tooltip would strand the operator. Passing this is the component asserting "I am
   * modal", and it is also what lets it honestly claim `aria-modal`.
   *
   * A ref rather than a node so the hook can be called before the node exists, which
   * is every conditional-render overlay in this app.
   */
  container?: React.RefObject<Element | null>,
): void {
  const handler = useRef(onDismiss);
  handler.current = onDismiss;

  useEffect(() => {
    if (!open) return;
    const id = pushDismissible(
      label,
      () => handler.current(),
      container ? () => container.current : undefined,
    );
    return () => removeDismissible(id);
    // `container` is in the deps and costs nothing: a ref OBJECT is stable for the
    // component's lifetime, so this cannot churn the subscription the way an inline
    // `onDismiss` would. Worth stating what the dep does NOT mean — the registration
    // does not depend on the ref's current NODE, because a getter is stored rather
    // than the node itself, so an overlay whose root mounts after this effect runs is
    // picked up on the next Tab press for free. I first omitted it with a comment
    // arguing that point, which bought a suppressed lint warning in exchange for
    // nothing; this repo holds lint at 0 errors / 0 warnings precisely so a real
    // warning is never lost in a crowd of tolerated ones.
  }, [open, label, container]);
}
