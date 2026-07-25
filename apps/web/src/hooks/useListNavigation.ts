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
  /**
   * The element containing the rows. Supply it to make "one tab stop" TRUE rather
   * than nearly true — see the note on `parkRowControls`.
   */
  container?: React.RefObject<HTMLElement | null>;
}

/** Focusable things that would otherwise be Tab stops. */
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex], [contenteditable]';

/**
 * Take every control INSIDE a row out of the tab ring.
 *
 * The Phase 4 claim was "a table is ONE tab stop", and it was FALSE on a populated
 * table — which nothing noticed for three phases because the API is down in every
 * automated environment, so no test had ever seen a row. Measured once the rows were
 * stubbed: a lead row contains four focusable descendants (an EntityChip and two
 * `.derived` values, each `role="button" tabIndex={0}`, plus a real peek button), so
 * Tab from the cursor row landed on a span inside the same row. At 200 rows the queue
 * was ~800 stops, not one.
 *
 * This is the W3C grid pattern's actual answer: the row is the tab stop, and everything
 * within it is reached by ArrowRight/ArrowLeft. Done by touching the DOM rather than by
 * passing `tabIndex={-1}` down through props because the offenders are SHARED
 * components — EntityChip and the `.derived` affordance are used all over the app,
 * where being a tab stop is correct. Their behaviour should differ inside a grid, and
 * the grid is the thing that knows that.
 *
 * Re-run on `count` rather than on a MutationObserver: rows are re-rendered wholesale
 * when the list changes, and an observer on a 200-row table firing per cell edit costs
 * more than the problem is worth. The honest limitation is that a control appearing
 * inside an already-rendered row without the count changing stays a tab stop until the
 * next change.
 */
function parkRowControls(container: HTMLElement | null): void {
  if (!container) return;
  for (const el of Array.from(container.querySelectorAll<HTMLElement>('[data-list-row]'))) {
    for (const control of Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))) {
      // Not `-1` blindly: an author who deliberately parked something must not be
      // silently overwritten, and re-setting an attribute that is already correct
      // churns the accessibility tree.
      if ((control.getAttribute('tabindex') ?? '0') !== '-1') control.setAttribute('tabindex', '-1');
    }
  }
}

export function useListNavigation({
  count,
  onActivate,
  enabled = true,
  container,
}: ListNavigationOptions): ListNavigation {
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

  // After every render that changes the row set. `useEffect` rather than layout effect:
  // this only affects Tab, which cannot happen before paint.
  useEffect(() => {
    parkRowControls(container?.current ?? null);
  }, [count, index, container]);

  /**
   * Move among the controls INSIDE the cursor row.
   *
   * Without this, parking them would make the peek button and the lineage chips
   * unreachable by keyboard — trading a traversal cost for a dead control, which is a
   * worse bug than the one being fixed.
   */
  const moveWithinRow = useCallback((container_: HTMLElement, delta: number) => {
    const active = document.activeElement as HTMLElement | null;
    const row = active?.closest<HTMLElement>('[data-list-row]') ?? container_.querySelector<HTMLElement>('[data-list-row][tabindex="0"]');
    if (!row) return;
    const controls = Array.from(row.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (controls.length === 0) return;
    const at = active && active !== row ? controls.indexOf(active) : -1;
    // From the row itself, ArrowRight enters at the first control and ArrowLeft at the
    // last; from a control, step and clamp. Clamping rather than wrapping for the same
    // reason as the rows: silent wrap-around is a position the operator cannot see.
    const next = at === -1 ? (delta > 0 ? 0 : controls.length - 1) : Math.min(controls.length - 1, Math.max(0, at + delta));
    controls[next]?.focus();
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!enabled || count === 0) return;
      // A text field inside a row must keep its own arrow behaviour — moving the
      // caret, not the cursor row.
      if (isTypingTarget(e.target)) return;
      // While a dialog is up it owns the keyboard, even though this container is
      // still mounted behind it.
      if (isOverlayOpen()) return;

      const scope = e.currentTarget as HTMLElement;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          move(1, scope);
          break;
        case 'ArrowUp':
          e.preventDefault();
          move(-1, scope);
          break;
        case 'ArrowRight':
          e.preventDefault();
          moveWithinRow(scope, 1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          moveWithinRow(scope, -1);
          break;
        case 'Home':
          e.preventDefault();
          jump(0, scope);
          break;
        case 'End':
          e.preventDefault();
          jump(-1, scope);
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
    [count, enabled, index, jump, move, moveWithinRow],
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
