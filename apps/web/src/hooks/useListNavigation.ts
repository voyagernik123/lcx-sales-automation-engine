import { useCallback, useEffect, useRef, useState } from 'react';
import { isOverlayOpen } from '@/lib/dismiss';
import { isTypingTarget } from '@/lib/keyboard';
import { prefersReducedMotion } from '@/lib/motion';

/**
 * Arrow-key navigation for a ranked list or table (TERMINAL Phase 4).
 *
 * The surfaces an operator lives in are ranked lists — the lead queue, the deal
 * board, the anomaly triage, the partner table. Every one of them was mouse-only
 * for movement: you could Tab through the rows, but Tab visits every focusable
 * control INSIDE each row, so reaching row 40 of the queue took hundreds of
 * presses. That is the difference between a keyboard-first instrument and an app
 * that merely does not crash when you press Tab.
 *
 * ROVING TABINDEX is the mechanism, and it is what makes this more than a
 * convenience. Exactly one row is `tabIndex=0` and the rest are `-1`, so Tab treats
 * the whole list as ONE stop — in and out — while the arrows move within it. That
 * simultaneously fixes the hundred-press traversal and the Tab trap, which is why
 * it is the pattern the ARIA authoring practices specify for grids and listboxes
 * rather than something invented here.
 *
 * Deliberately NOT bound: bare `j`/`k`. They are the Vim convention and were the
 * obvious thing to add, but this app already gives single letters to destructive
 * verbs on exactly these surfaces — `s` snoozes, `d` disqualifies — and a grammar
 * where some bare letters move the cursor and others mutate a record is a grammar
 * that will eventually disqualify a lead someone meant to scroll past. Arrows, Home
 * and End are unambiguous and need no teaching. (The same reasoning retires the
 * WASD idea from the original plan: `s` and `d` are already taken, and by the two
 * most consequential actions on the surface.)
 */

export interface ListNavigation {
  /** The row the keyboard cursor is on, or -1 when the list is empty. */
  index: number;
  setIndex: (next: number) => void;
  /** Spread onto each row. `i` is the row's position. */
  rowProps: (i: number) => {
    tabIndex: number;
    'data-list-row': number;
    onFocus: () => void;
  };
  /**
   * Spread onto the element that contains the rows.
   *
   * Deliberately carries NO `role`. The first version set `role="grid"`, which on a
   * native `<tbody>` replaces its implicit `rowgroup` and breaks the table's
   * semantics — a hook cannot know whether it is wrapping a real table (which
   * already has the right roles and needs none added), a listbox, or a set of
   * cards. The caller knows; this hook only knows about keys.
   */
  containerProps: {
    onKeyDown: (e: React.KeyboardEvent) => void;
  };
}

export interface ListNavigationOptions {
  count: number;
  /** Enter or Space on the cursor row. */
  onActivate?: (index: number) => void;
  /** False while another surface owns the arrows (a chart, a text area). */
  enabled?: boolean;
}

export function useListNavigation({ count, onActivate, enabled = true }: ListNavigationOptions): ListNavigation {
  const [index, setIndexState] = useState(count > 0 ? 0 : -1);
  const activate = useRef(onActivate);
  activate.current = onActivate;

  // Filtering a list shorter than the cursor leaves the cursor pointing past the
  // end, where every subsequent arrow press appears to do nothing. Clamp on every
  // change in length rather than trusting callers to reset.
  useEffect(() => {
    setIndexState((current) => {
      if (count === 0) return -1;
      if (current < 0) return 0;
      return Math.min(current, count - 1);
    });
  }, [count]);

  const setIndex = useCallback(
    (next: number) => {
      setIndexState(count === 0 ? -1 : Math.max(0, Math.min(next, count - 1)));
    },
    [count],
  );

  const move = useCallback(
    (delta: number, container: HTMLElement | null) => {
      setIndexState((current) => {
        if (count === 0) return -1;
        // Clamp rather than wrap. Wrapping means holding ArrowDown silently jumps
        // from the last row back to the first, and on a long list the operator
        // cannot tell it happened — they act on row 1 believing it is row 200.
        const next = Math.max(0, Math.min(current + delta, count - 1));
        focusRow(container, next);
        return next;
      });
    },
    [count],
  );

  const jump = useCallback(
    (to: number, container: HTMLElement | null) => {
      if (count === 0) return;
      const next = to < 0 ? count - 1 : 0;
      focusRow(container, next);
      setIndexState(next);
    },
    [count],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!enabled || count === 0) return;
      // A text field inside a row must keep its own arrow behaviour — moving the
      // caret, not the cursor row.
      if (isTypingTarget(e.target)) return;
      // While a dialog is up it owns the keyboard, even though this container is
      // still mounted behind it.
      if (isOverlayOpen()) return;

      const container = e.currentTarget as HTMLElement;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          move(1, container);
          break;
        case 'ArrowUp':
          e.preventDefault();
          move(-1, container);
          break;
        case 'Home':
          e.preventDefault();
          jump(0, container);
          break;
        case 'End':
          e.preventDefault();
          jump(-1, container);
          break;
        case 'Enter':
        case ' ':
          if (!activate.current) return;
          // Space scrolls the page by default, which is the opposite of activating
          // the row you are looking at.
          e.preventDefault();
          activate.current(index);
          break;
        default:
      }
    },
    [count, enabled, index, jump, move],
  );

  const rowProps = useCallback(
    (i: number) => ({
      // The roving part: one stop for the whole list.
      tabIndex: i === index ? 0 : -1,
      'data-list-row': i,
      // Clicking or Tab-focusing a row moves the cursor to it, so the mouse and
      // the keyboard never disagree about where "here" is.
      onFocus: () => setIndexState(i),
    }),
    [index],
  );

  return { index, setIndex, rowProps, containerProps: { onKeyDown } };
}

/**
 * Move real DOM focus to a row, and bring it into view.
 *
 * Focus has to move, not just the highlight: a highlight alone leaves the screen
 * reader announcing the old row and leaves Tab resuming from the wrong place.
 */
function focusRow(container: HTMLElement | null, i: number): void {
  const row = container?.querySelector<HTMLElement>(`[data-list-row="${i}"]`);
  if (!row) return;
  // `preventScroll` then an explicit scroll, so the scroll respects the operator's
  // reduced-motion setting instead of the browser's default jump.
  row.focus({ preventScroll: true });
  // Guarded because scrolling is a nicety and focus is the point: jsdom does not
  // implement scrollIntoView at all, and an unguarded call there throws from inside
  // a keydown handler, taking the cursor move down with it. Focus must survive its
  // absence, not be hostage to it.
  if (typeof row.scrollIntoView === 'function') {
    row.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }
}
