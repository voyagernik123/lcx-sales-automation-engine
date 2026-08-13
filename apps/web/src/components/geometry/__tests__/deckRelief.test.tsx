import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeckRelief } from '@/components/geometry/DeckRelief';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DeckPanelDatum } from '@/components/geometry/deckSlots';

/*
 * §7's disposition for an environment whose clause (b) is not established: "it ships behind a toggle that
 * defaults off, and I tell you rather than quietly shipping it."
 *
 * jsdom has no WebGL2, so nothing here asserts the render — that is what docs/3d/e1's captures prove on a real
 * rasteriser. What IS assertable is exactly what §7 asks: a reader who does nothing gets the flat deck, the
 * reason is on the page, and the GL layer is not in the initial bundle.
 */
const PANELS: readonly DeckPanelDatum[] = [
  { id: 'gating', title: 'Launch readiness', headline: '3/7 gates', note: null },
  { id: 'work', title: 'Workstreams', headline: '5 workstreams', note: '41 tasks across them' },
  { id: 'partners', title: 'Partner pipeline', headline: '12 partners', note: '4 types' },
  { id: 'risks', title: 'Risk heatmap', headline: '9 risks', note: 'Critical risks present' },
];

const Flat = () => <div data-testid="flat-deck">the four panels</div>;

describe('DeckRelief — the theatre is opt-in and the grid is the default', () => {
  it('renders the caller\'s own panels untouched, with no canvas', () => {
    const { container } = render(<DeckRelief panels={PANELS}><Flat /></DeckRelief>);
    expect(screen.getByTestId('flat-deck')).toBeTruthy();
    /* A canvas here would mean an unproven 3-D claim shipped as the default, which §7 forbids. */
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('gives E1\'s OWN reason, not the generic one', () => {
    /*
     * The other eight say nobody has timed whether relief answers faster. E1's harness went further and MEASURED
     * the cost — at a wide aperture only the focused panel is comfortably readable — so a reader is owed that
     * specific trade rather than a general disclaimer.
     */
    render(<DeckRelief panels={PANELS}><Flat /></DeckRelief>);
    expect(screen.getByText(/costs the\s+others legibility|costs the others legibility/i)).toBeTruthy();
  });

  it('keeps the flat deck while the lazy chunk loads', () => {
    /* The Suspense fallback is the panels themselves. A reader who clicked has not asked to lose the deck they
       were reading for the length of a network round trip. */
    render(<DeckRelief panels={PANELS}><Flat /></DeckRelief>);
    fireEvent.click(screen.getByRole('button', { name: /theatre view/i }));
    expect(screen.getByTestId('flat-deck')).toBeTruthy();
  });

  it('refuses a deck it cannot arrange in depth, and says how many it has', () => {
    /* One panel is not a room. Refusing in the wrapper keeps the reader on the grid rather than showing them an
       empty stage that looks like a broken canvas. */
    render(<DeckRelief panels={[PANELS[0]!]}><Flat /></DeckRelief>);
    const btn = screen.getByRole('button', { name: /theatre view/i });
    /*
     * aria-disabled, NOT disabled — and the difference is the whole point of the change this pins.
     *
     * `onRefused` fires from the renderer's mount effect, one tick after the reader pressed Enter on this
     * very button. Setting `disabled` on a FOCUSED element blurs it: `document.activeElement` becomes
     * `<body>` and the next Tab restarts from the top of the document — on PipelineRelief that also means
     * leaving the table the triage keys act on. `aria-disabled` with a guarded onClick keeps the control
     * in the tab ring and keeps focus where the reader put it.
     */
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.hasAttribute('disabled'), 'a disabled control drops focus to <body>').toBe(false);
    expect(screen.getByText(/at least two panels/i).textContent).toContain('this deck has 1');
  });

  it('reports the toggle state to assistive technology', () => {
    render(<DeckRelief panels={PANELS}><Flat /></DeckRelief>);
    expect(screen.getByRole('button', { name: /theatre view/i }).getAttribute('aria-pressed')).toBe('false');
  });

  it('does not import the GL layer eagerly', () => {
    /*
     * THE BUDGET TEST. Initial JS has 11 KB of headroom and the env layer is 35.7 KB, so an eager import fails
     * the build for a view most readers never open. Existence is asserted FIRST so this cannot pass by reading
     * an empty string — a structural check that silently finds nothing is the failure mode it exists to prevent.
     */
    const file = resolve(process.cwd(), 'src/components/geometry/DeckRelief.tsx');
    expect(existsSync(file), `cannot find ${file}`).toBe(true);
    const src = readFileSync(file, 'utf8');
    expect(src.length).toBeGreaterThan(500);
    expect(src).toMatch(/lazy\(\(\) => import\(/);
    expect(/^import[^;]*from '@lcx\/gl'/m.test(src), 'must not import @lcx/gl eagerly').toBe(false);
  });

  it('the page feeds it only measures the page already shows', () => {
    /*
     * E1 is the one environment with a false-number-on-a-lit-panel on its record: its harness rendered E0's frame
     * time as a number belonging to a different programme, under a printed claim that every row was checkable.
     * So the mount site must not compute anything — each headline is a page value, and a missing one is null.
     */
    const page = readFileSync(resolve(process.cwd(), 'src/pages/CommandDeck.tsx'), 'utf8');
    const i = page.indexOf('<DeckRelief');
    expect(i, 'CommandDeck must mount DeckRelief').toBeGreaterThan(-1);
    const block = page.slice(i, page.indexOf('>', page.indexOf('panels={[', i) + 400));
    /* A gating chain with no gates has no fraction: 0/0 would read as "nothing done" rather than "nothing to do". */
    expect(block).toContain('o.launch.gatingTotal > 0');
    expect(block).toMatch(/headline: null|: null,/);
  });
});
