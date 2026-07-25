import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useListNavigation } from '../useListNavigation';
import { _resetDismiss, pushDismissible } from '@/lib/dismiss';

/**
 * Arrow navigation on a ranked list (TERMINAL Phase 4).
 *
 * Rendered rather than unit-tested through the reducer, because the two things
 * most likely to be wrong are DOM facts: whether real focus follows the cursor,
 * and whether the roving tabindex leaves exactly one tab stop. Neither is
 * observable from the hook's return value alone, and both were the actual point of
 * the change — moving a highlight without moving focus leaves a screen reader
 * announcing the wrong row and leaves Tab resuming from the wrong place.
 */

afterEach(() => _resetDismiss());

function Harness({ count, onActivate }: { count: number; onActivate?: (i: number) => void }) {
  const nav = useListNavigation({ count, onActivate });
  return (
    <div data-testid="list" {...nav.containerProps}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} {...nav.rowProps(i)} data-testid={`row-${i}`}>
          row {i}
        </div>
      ))}
      <span data-testid="cursor">{nav.index}</span>
    </div>
  );
}

const list = () => screen.getByTestId('list');
const cursor = () => Number(screen.getByTestId('cursor').textContent);

describe('list navigation', () => {
  it('imposes no ARIA role on the container', () => {
    // A `role="grid"` here would replace a native <tbody>'s implicit `rowgroup` and
    // break the table's semantics. The hook knows about keys; only the caller knows
    // what the container IS.
    render(<Harness count={3} />);
    expect(list().getAttribute('role')).toBeNull();
  });

  it('moves the cursor and real DOM focus together', () => {
    render(<Harness count={5} />);
    fireEvent.keyDown(list(), { key: 'ArrowDown' });
    expect(cursor()).toBe(1);
    // The load-bearing half: focus, not just a highlight.
    expect(document.activeElement).toBe(screen.getByTestId('row-1'));
  });

  it('leaves exactly one tab stop for the whole list', () => {
    // Without a roving tabindex, Tab visits all 200 rows plus every control inside
    // them — the defect that made reaching row 40 of the queue a hundred presses.
    render(<Harness count={200} />);
    const stops = Array.from(document.querySelectorAll('[data-list-row]')).filter(
      (el) => el.getAttribute('tabindex') === '0',
    );
    expect(stops).toHaveLength(1);
    expect(stops[0]).toBe(screen.getByTestId('row-0'));
  });

  it('the single tab stop follows the cursor', () => {
    render(<Harness count={5} />);
    fireEvent.keyDown(list(), { key: 'ArrowDown' });
    fireEvent.keyDown(list(), { key: 'ArrowDown' });
    expect(screen.getByTestId('row-2').getAttribute('tabindex')).toBe('0');
    expect(screen.getByTestId('row-0').getAttribute('tabindex')).toBe('-1');
  });

  it('clamps instead of wrapping at both ends', () => {
    render(<Harness count={3} />);
    for (let i = 0; i < 8; i++) fireEvent.keyDown(list(), { key: 'ArrowDown' });
    // Wrapping would mean holding ArrowDown silently returns to row 0, and on a
    // long list the operator cannot tell — they act on row 1 believing it is row 200.
    expect(cursor()).toBe(2);
    for (let i = 0; i < 8; i++) fireEvent.keyDown(list(), { key: 'ArrowUp' });
    expect(cursor()).toBe(0);
  });

  it('Home and End jump to the ends', () => {
    render(<Harness count={10} />);
    fireEvent.keyDown(list(), { key: 'End' });
    expect(cursor()).toBe(9);
    fireEvent.keyDown(list(), { key: 'Home' });
    expect(cursor()).toBe(0);
  });

  it('Enter and Space activate the cursor row', () => {
    const onActivate = vi.fn();
    render(<Harness count={4} onActivate={onActivate} />);
    fireEvent.keyDown(list(), { key: 'ArrowDown' });
    fireEvent.keyDown(list(), { key: 'Enter' });
    expect(onActivate).toHaveBeenCalledWith(1);

    fireEvent.keyDown(list(), { key: ' ' });
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it('claims Space so the page does not scroll instead', () => {
    render(<Harness count={4} onActivate={() => {}} />);
    const claimed = !fireEvent.keyDown(list(), { key: ' ' });
    expect(claimed, 'unclaimed Space scrolls the page, which is the opposite of activating').toBe(true);
  });

  it('does not claim Space when there is nothing to activate', () => {
    // A read-only list must not swallow the page-scroll key it cannot use.
    render(<Harness count={4} />);
    const claimed = !fireEvent.keyDown(list(), { key: ' ' });
    expect(claimed).toBe(false);
  });

  it('leaves the arrows alone inside a text field', () => {
    function WithInput() {
      const nav = useListNavigation({ count: 5 });
      return (
        <div data-testid="list" {...nav.containerProps}>
          <input data-testid="field" />
          <span data-testid="cursor">{nav.index}</span>
        </div>
      );
    }
    render(<WithInput />);
    // Arrow keys in a field move the caret. Stealing them would make an inline
    // edit inside a row impossible to use.
    fireEvent.keyDown(screen.getByTestId('field'), { key: 'ArrowDown' });
    expect(cursor()).toBe(0);
  });

  it('goes quiet while an overlay owns the keyboard', () => {
    render(<Harness count={5} />);
    pushDismissible('modal', () => {});
    fireEvent.keyDown(list(), { key: 'ArrowDown' });
    expect(cursor(), 'the list is behind a dialog; the arrows are not its to take').toBe(0);
  });

  it('clamps the cursor when the list is filtered shorter', () => {
    // The bug this prevents: cursor at row 8, a filter cuts the list to 3 rows, and
    // every subsequent arrow press appears to do nothing because the cursor is
    // pointing past the end.
    const { rerender } = render(<Harness count={10} />);
    fireEvent.keyDown(list(), { key: 'End' });
    expect(cursor()).toBe(9);
    rerender(<Harness count={3} />);
    expect(cursor()).toBe(2);
  });

  it('reports -1 for an empty list and survives keys pressed at it', () => {
    render(<Harness count={0} />);
    expect(cursor()).toBe(-1);
    expect(() => fireEvent.keyDown(list(), { key: 'ArrowDown' })).not.toThrow();
    expect(cursor()).toBe(-1);
  });

  it('recovers the cursor when rows arrive', () => {
    const { rerender } = render(<Harness count={0} />);
    rerender(<Harness count={4} />);
    expect(cursor()).toBe(0);
  });

  it('moves the cursor when a row is focused by mouse or Tab', () => {
    // The mouse and the keyboard must never disagree about where "here" is.
    render(<Harness count={5} />);
    fireEvent.focus(screen.getByTestId('row-3'));
    expect(cursor()).toBe(3);
  });
});
