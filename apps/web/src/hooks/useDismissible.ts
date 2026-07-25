import { useEffect, useRef } from 'react';
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
export function useDismissible(open: boolean, onDismiss: () => void, label: string): void {
  const handler = useRef(onDismiss);
  handler.current = onDismiss;

  useEffect(() => {
    if (!open) return;
    const id = pushDismissible(label, () => handler.current());
    return () => removeDismissible(id);
  }, [open, label]);
}
