import { fireEvent, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ProductGrid } from '@/components/productIntel/ProductGrid';
import { CompetitorGrid } from '@/components/competition/CompetitorGrid';
import { ProductMatrix } from '@/pages/ProductMatrix';

/**
 * "A list is ONE tab stop" — on the three tables where it was FALSE (T1 #11).
 *
 * `hooks/useListNavigation` shipped in Phase 4 with exactly one consumer, the BD lead
 * table. These three hard-coded `tabIndex={0}` on every row, which is two defects, not a
 * style inconsistency: reaching row 40 costs 40+ Tab presses, and Tab can never leave the
 * table because every row ahead of you is a stop.
 *
 * Tested here rather than in Playwright on purpose. All three read STATIC data from
 * `@/data`, and MEASURED they render 52 / 26 / 8 rows with no API up — so a component test
 * sees real, populated rows, which is the exact condition under which the original claim
 * was false and the e2e environment (API down) cannot reproduce. jsdom cannot move focus
 * with a real Tab press, so "one stop" is asserted the way the browser would count it:
 * the number of elements inside the <tbody> that Tab would visit.
 */

/** What the browser's tab ring contains — the same selector the hook parks against. */
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex], [contenteditable]';

function tabStops(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getAttribute('tabindex') !== '-1',
  );
}

interface Surface {
  name: string;
  /** Renders the surface and returns its row container plus its rows. */
  mount: () => { body: HTMLElement; rows: HTMLElement[] };
}

function bodyOf(container: HTMLElement): { body: HTMLElement; rows: HTMLElement[] } {
  const body = container.querySelector('tbody');
  if (!body) throw new Error('no <tbody> rendered — the surface changed shape');
  return {
    body: body as HTMLElement,
    rows: Array.from(body.querySelectorAll<HTMLElement>('[data-list-row]')),
  };
}

const SURFACES: Surface[] = [
  {
    name: 'ProductGrid (product intelligence)',
    mount: () => bodyOf(render(<ProductGrid />).container),
  },
  {
    name: 'CompetitorGrid (competition)',
    mount: () => bodyOf(render(<CompetitorGrid />).container),
  },
  {
    name: 'ProductMatrix (registry ledger)',
    mount: () =>
      bodyOf(
        render(
          <MemoryRouter>
            <ProductMatrix />
          </MemoryRouter>,
        ).container,
      ),
  },
];

describe.each(SURFACES)('$name', ({ mount }) => {
  it('is ONE tab stop for the whole table, not one per row', () => {
    const { body, rows } = mount();
    // Guards against a green test that proves nothing: with one row "one stop" is
    // trivially true, and it is the populated case that was broken.
    expect(rows.length, 'no rows rendered — this test would pass vacuously').toBeGreaterThan(3);

    const stops = tabStops(body);
    expect(
      stops.length,
      `Tab would visit ${stops.length} things inside this table: ${stops
        .map((s) => `${s.tagName}[tabindex=${s.getAttribute('tabindex')}]`)
        .slice(0, 6)
        .join(', ')}`,
    ).toBe(1);
    // And the one stop is the cursor row, not something else that happens to be focusable.
    expect(stops[0]).toBe(rows[0]);
  });

  it('ArrowDown moves the cursor AND real DOM focus', () => {
    const { rows } = mount();
    fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
    // Focus, not just a highlight: a highlight alone leaves a screen reader announcing
    // the old row and leaves Tab resuming from the wrong place.
    expect(document.activeElement).toBe(rows[1]);
    expect(rows[1].getAttribute('tabindex')).toBe('0');
    expect(rows[0].getAttribute('tabindex')).toBe('-1');
  });

  it('End reaches the last row and Home comes back, without wrapping', () => {
    const { body, rows } = mount();
    fireEvent.keyDown(rows[0], { key: 'End' });
    expect(document.activeElement).toBe(rows[rows.length - 1]);
    // Clamped, not wrapped — a silent wrap is a cursor position the operator cannot see.
    fireEvent.keyDown(rows[rows.length - 1], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[rows.length - 1]);
    fireEvent.keyDown(rows[rows.length - 1], { key: 'Home' });
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(rows[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(rows[0]);
    expect(tabStops(body)).toHaveLength(1);
  });

  it('leaves no control inside a row unreachable', () => {
    // THE risk the roving tabindex creates. Parking a row's controls at tabindex="-1"
    // fixes an N-stop traversal and, if nothing else reaches them, replaces it with DEAD
    // CONTROLS — strictly worse. None of these three tables puts a focusable inside a
    // row today, so nothing is parked and nothing can be dead; this asserts that rather
    // than assuming it, and fails the day a cell gains a button with no ArrowRight route.
    const { body, rows } = mount();
    const cursor = rows[0];
    const controls = Array.from(cursor.querySelectorAll<HTMLElement>(FOCUSABLE));
    for (const c of controls) {
      expect(c.getAttribute('tabindex'), 'an in-row control is still its own Tab stop').toBe('-1');
    }
    cursor.focus();
    for (const expected of controls) {
      fireEvent.keyDown(body, { key: 'ArrowRight' });
      expect(document.activeElement, 'ArrowRight did not reach a parked control').toBe(expected);
    }
  });
});

describe('activation still works on the row the cursor is on', () => {
  it('ProductGrid: Enter opens the row the cursor is on, not a different one', () => {
    const onProductClick = vi.fn();
    const { container } = render(<ProductGrid onProductClick={onProductClick} />);
    const { rows } = bodyOf(container);

    // The mouse is the oracle for "which record is this row?". If the hook's index and
    // the array the rows were rendered from ever disagree, Enter opens someone else's
    // product — and no assertion that only counts calls would notice.
    fireEvent.click(rows[1]);
    fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
    fireEvent.keyDown(rows[1], { key: 'Enter' });
    expect(onProductClick).toHaveBeenCalledTimes(2);
    expect(onProductClick.mock.calls[1][0]).toBe(onProductClick.mock.calls[0][0]);
    // And row 1 is genuinely a different record from row 0, so the check above has teeth.
    fireEvent.click(rows[0]);
    expect(onProductClick.mock.calls[2][0]).not.toBe(onProductClick.mock.calls[0][0]);
  });

  it('CompetitorGrid: Space opens the cursor row and does not scroll the page', () => {
    const onCompetitorClick = vi.fn();
    const { container } = render(<CompetitorGrid onCompetitorClick={onCompetitorClick} />);
    const { rows } = bodyOf(container);

    fireEvent.click(rows[2]);
    fireEvent.keyDown(rows[0], { key: 'End' });
    fireEvent.keyDown(rows[rows.length - 1], { key: 'Home' });
    fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
    fireEvent.keyDown(rows[1], { key: 'ArrowDown' });
    const notPrevented = fireEvent.keyDown(rows[2], { key: ' ' });
    expect(onCompetitorClick).toHaveBeenCalledTimes(2);
    expect(onCompetitorClick.mock.calls[1][0]).toBe(onCompetitorClick.mock.calls[0][0]);
    expect(notPrevented, 'unclaimed Space scrolls the page instead of opening the row').toBe(false);
  });

  it('CompetitorGrid: the projected LCX row is not a cursor position', () => {
    // It is a static projection with nothing to activate. Making it row N+1 would let
    // End land on a row where Enter does nothing.
    const { container } = render(<CompetitorGrid />);
    const { body, rows } = bodyOf(container);
    const allRows = body.querySelectorAll('tr');
    expect(allRows.length, 'the LCX row is missing, so this proves nothing').toBe(rows.length + 1);
    expect(allRows[allRows.length - 1].hasAttribute('data-list-row')).toBe(false);
  });
});

describe('ProductMatrix expands a drawer whose controls stay reachable', () => {
  function mountMatrix() {
    const { container } = render(
      <MemoryRouter>
        <ProductMatrix />
      </MemoryRouter>,
    );
    return bodyOf(container);
  }

  it('Enter toggles the drawer on the cursor row', () => {
    const { rows } = mountMatrix();
    expect(rows[0].getAttribute('aria-expanded')).toBe('false');
    fireEvent.keyDown(rows[0], { key: 'Enter' });
    expect(rows[0].getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(rows[0], { key: 'Enter' });
    expect(rows[0].getAttribute('aria-expanded')).toBe('false');
  });

  it('the open drawer keeps its own buttons in the tab ring', () => {
    // The drawer is a SIBLING <tr>, not a descendant of the row, so parkRowControls does
    // not touch its buttons — correct, because a disclosure panel's controls belong in
    // the tab ring. That makes this table "one stop, plus the drawer you opened", and
    // this is the assertion that keeps that sentence honest instead of aspirational.
    const { body, rows } = mountMatrix();
    expect(tabStops(body)).toHaveLength(1);
    fireEvent.keyDown(rows[0], { key: 'Enter' });

    const stops = tabStops(body);
    const buttons = stops.filter((s) => s.tagName === 'BUTTON');
    expect(buttons.length, 'the drawer buttons became unreachable').toBe(2);
    expect(stops).toHaveLength(3);
    expect(stops).toContain(rows[0]);
  });

  it('Enter on a drawer button does not ALSO toggle the row shut', () => {
    // The regression this move could have introduced. The per-row handler it replaced was
    // never an ancestor of the drawer; the <tbody> handler is, so an unguarded Enter on
    // "Simulate in Howey Calculator" would navigate AND collapse the row on the way out.
    const { body, rows } = mountMatrix();
    fireEvent.keyDown(rows[0], { key: 'Enter' });
    const drawerButton = tabStops(body).find((s) => s.tagName === 'BUTTON');
    expect(drawerButton, 'no drawer button to press').toBeTruthy();

    drawerButton!.focus();
    fireEvent.keyDown(drawerButton!, { key: 'Enter' });
    expect(
      rows[0].getAttribute('aria-expanded'),
      'the drawer collapsed under the button the operator was pressing',
    ).toBe('true');
    fireEvent.keyDown(drawerButton!, { key: ' ' });
    expect(rows[0].getAttribute('aria-expanded')).toBe('true');
  });

  it('the arrows still work from inside the drawer, so it is not a trap', () => {
    const { body, rows } = mountMatrix();
    fireEvent.keyDown(rows[0], { key: 'Enter' });
    const drawerButton = tabStops(body).find((s) => s.tagName === 'BUTTON')!;
    drawerButton.focus();
    fireEvent.keyDown(drawerButton, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1]);
  });
});
