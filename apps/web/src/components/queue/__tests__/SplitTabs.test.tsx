import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SplitTabs } from '../SplitTabs';
import { SPLIT_ORDER, type SplitId } from '../logic';

/**
 * THE RATCHET for "the split tablist is ONE tab stop".
 *
 * Measured on the real surface with Playwright before the change: 17 Tab presses from
 * `<main>` to the first row of the ranked queue, four of them spent walking these tabs.
 * The reason this file exists rather than an e2e assertion is that the pixel and
 * traversal numbers live in `e2e/keyboardday.spec.ts`, which this stream may not edit —
 * so the mechanism gets guarded here, at the component, where a mutation can be shown.
 *
 * Every assertion below has been broken on purpose and watched go red; the mutations are
 * named in the parent's report. What this canNOT see, stated plainly: it runs in jsdom,
 * which has no layout, so it says nothing about the 129px of chrome the surface now has.
 * That number is a measurement, not a ratchet.
 */

const counts: Record<SplitId, number | null> = { hot: 3, followups: 1, new: 0, working: 42 };

const renderTabs = (active: SplitId = 'working') => {
  const onSelect = vi.fn();
  const r = render(<SplitTabs active={active} counts={counts} onSelect={onSelect} />);
  return { ...r, onSelect };
};

/**
 * The same component with the selection actually wired up.
 *
 * Needed because a roving tabindex has two halves and the controlled harness above can
 * only see one. With `onSelect` a spy, `active` never changes, so nothing re-renders and
 * "did DOM focus move with the cursor" is unaskable — the mutation that deletes the
 * `.focus()` call left all six of the other assertions green. That is the half that is
 * invisible when you get it wrong: the highlight moves, focus is stranded on a tab that
 * has just become `tabindex="-1"`, and the operator's next Tab restarts from the top of
 * the document.
 */
function Harness({ initial }: { initial: SplitId }) {
  const [active, setActive] = useState<SplitId>(initial);
  return <SplitTabs active={active} counts={counts} onSelect={setActive} />;
}

describe('SplitTabs — the tablist is one tab stop', () => {
  it('exposes exactly one tabbable tab, and it is the selected one', () => {
    const { getAllByRole } = renderTabs('working');
    const tabs = getAllByRole('tab');
    expect(tabs).toHaveLength(SPLIT_ORDER.length);

    /*
     * Reachability, not the literal attribute. A `<button>` with NO tabindex is tabbable,
     * so counting `tabindex="0"` would report zero stops for the very defect this
     * replaced — the count would be wrong in the direction that reads as a pass.
     */
    const tabbable = tabs.filter(t => t.getAttribute('tabindex') !== '-1');
    expect(tabbable.length, `${tabbable.length} of ${tabs.length} tabs are reachable by Tab; exactly 1 may be`).toBe(1);
    expect(tabbable[0]).toHaveAttribute('tabindex', '0');
    expect(tabbable[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('the single stop follows the selection rather than staying on the first tab', () => {
    const { getAllByRole } = renderTabs('followups');
    const tabbable = getAllByRole('tab').filter(t => t.getAttribute('tabindex') !== '-1');
    expect(tabbable).toHaveLength(1);
    // A roving tabindex pinned to index 0 looks identical in the count above and strands
    // the operator: Tab would return them to a tab they are not on.
    expect(tabbable[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabbable[0].textContent).toContain('Follow-ups');
  });

  it('the arrows are what reaches the parked tabs, in both directions', () => {
    const { getAllByRole, onSelect } = renderTabs('followups');
    const list = getAllByRole('tablist' as never) as HTMLElement[];
    const tablist = list[0];

    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenLastCalledWith('new');

    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenLastCalledWith('hot');

    fireEvent.keyDown(tablist, { key: 'End' });
    expect(onSelect).toHaveBeenLastCalledWith(SPLIT_ORDER[SPLIT_ORDER.length - 1]);

    fireEvent.keyDown(tablist, { key: 'Home' });
    expect(onSelect).toHaveBeenLastCalledWith(SPLIT_ORDER[0]);
  });

  it('an arrow moves REAL focus with the cursor, not just the highlight', () => {
    const { getAllByRole } = render(<Harness initial="hot" />);
    const tablist = getAllByRole('tablist' as never)[0] as HTMLElement;
    const tabs = getAllByRole('tab');
    tabs[0].focus();
    expect(document.activeElement).toBe(tabs[0]);

    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(
      document.activeElement,
      'the selection moved but focus was left behind, so the next Tab restarts at the top of the document',
    ).toBe(tabs[1]);
    // And the one tab stop went with it, or Tab would return to a tab nobody is on.
    expect(tabs[1]).toHaveAttribute('tabindex', '0');
    expect(tabs[0]).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(tablist, { key: 'End' });
    expect(document.activeElement).toBe(tabs[SPLIT_ORDER.length - 1]);
  });

  it('the cursor clamps at both ends instead of wrapping', () => {
    // Wrapping would make ArrowRight on the last split jump back to the first, which
    // disagrees with the row cursor on the same page — that one clamps.
    const last = renderTabs(SPLIT_ORDER[SPLIT_ORDER.length - 1]);
    fireEvent.keyDown(last.getAllByRole('tablist' as never)[0] as HTMLElement, { key: 'ArrowRight' });
    expect(last.onSelect).not.toHaveBeenCalled();

    const first = renderTabs(SPLIT_ORDER[0]);
    fireEvent.keyDown(first.getAllByRole('tablist' as never)[0] as HTMLElement, { key: 'ArrowLeft' });
    expect(first.onSelect).not.toHaveBeenCalled();
  });

  it('leaves a modified arrow alone, so browser and OS chords still work', () => {
    const { getAllByRole, onSelect } = renderTabs('working');
    const tablist = getAllByRole('tablist' as never)[0] as HTMLElement;
    for (const mod of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }]) {
      fireEvent.keyDown(tablist, { key: 'ArrowLeft', ...mod });
    }
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('the STRIP costs one Tab press — not just the tabs within it', () => {
    /*
     * Every assertion above is scoped to `role="tab"` elements, and that scoping was a hole:
     * putting `tabIndex={0}` on the tablist CONTAINER restored a Tab stop with all seven
     * original assertions green. "One tab stop" is a claim about the whole strip, so it has
     * to be asserted over the strip. Measured — the mutation survived before this existed.
     */
    const { getAllByRole } = renderTabs('working');
    const tablist = getAllByRole('tablist' as never)[0] as HTMLElement;

    expect(
      tablist.getAttribute('tabindex'),
      'the tablist container is itself a tab stop, so the strip costs two presses, not one',
    ).toBeNull();

    // Count every tabbable NODE inside the strip, whatever its role — a helper button or a
    // focusable wrapper added later costs the operator a press exactly like a tab does.
    const tabbable = [...tablist.querySelectorAll('*')].filter(
      el =>
        el.getAttribute('tabindex') !== '-1' &&
        (el.tagName === 'BUTTON' || el.tagName === 'A' || el.hasAttribute('tabindex')),
    );
    expect(
      tabbable.map(el => el.textContent?.trim()),
      'the whole strip must cost exactly one Tab press',
    ).toHaveLength(1);
  });

  it('consumes the arrows it handles, so the browser does not also scroll the strip', () => {
    /*
     * Deleting `e.preventDefault()` while keeping `stopPropagation()` survived every other
     * assertion in this file. It is not cosmetic: the tablist is `overflow-x-auto`, so an
     * uncancelled ArrowLeft/Right scrolls the tab strip sideways under the operator, and
     * Home/End jumps the nearest scroll container to its end. `fireEvent` returns false when
     * the event was cancelled, which is the only way to ask this from jsdom.
     */
    const { getAllByRole } = renderTabs('followups');
    const tablist = getAllByRole('tablist' as never)[0] as HTMLElement;

    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      const notCancelled = fireEvent.keyDown(tablist, { key });
      expect(
        notCancelled,
        `${key} was left uncancelled, so the browser scrolls the strip as well as moving the cursor`,
      ).toBe(false);
    }
  });

  it('stops the arrows propagating, so the page cursor cannot also move', () => {
    // BdPipeline binds ArrowDown/ArrowUp on `window` for the row cursor. Left/Right are
    // not in that set today; this asserts the containment that keeps it true when they are.
    const { getAllByRole } = renderTabs('working');
    const tablist = getAllByRole('tablist' as never)[0] as HTMLElement;
    const seen: string[] = [];
    const spy = (e: KeyboardEvent) => seen.push(e.key);
    window.addEventListener('keydown', spy);
    try {
      fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
      fireEvent.keyDown(tablist, { key: 'Home' });
    } finally {
      window.removeEventListener('keydown', spy);
    }
    expect(seen, 'an arrow the tablist handled still reached window').toEqual([]);
  });
});
