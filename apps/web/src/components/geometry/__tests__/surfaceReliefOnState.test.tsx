import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { SurfaceRelief } from '@/components/geometry/SurfaceRelief';
import { buildSurfaceMesh, WITHHELD, type GridCellValue, type SurfaceOutcome } from '@lcx/shared';
import { storage } from '@/lib/persistence';

/**
 * WHAT A READER GETS WHILE E5's RELIEF IS ON — the state no test in this repo looked at.
 *
 * `reliefAccessibility.test.tsx` checks the CONTROLS. `reliefPrintPath.test.tsx` checks PAPER.
 * `surfaceRelief.test.tsx` checks the DEFAULT and the FALLBACK. All four pass, and between them
 * they never once ask what is readable while the canvas is up. It was nothing:
 *
 *   ON accessible text, measured on this fixture before the fix:
 *     "Relief view: on Relief is opt-in: nobody has yet timed whether it answers faster than this figure."
 *
 * The figure was in the document — `[data-relief-print-flat]` holds a whole `SurfacePlot` — behind
 * `display: none` AND `aria-hidden="true"`. `display: none` generates no boxes, so there is nothing
 * to select and nothing for text extraction to walk; `aria-hidden` prunes the subtree from the
 * accessibility tree. The live child is a bare `aria-hidden` canvas and `CockpitPanels` adds no
 * caption of its own. So a screen reader, a copy-paste and a text scrape each got the toggle and
 * nothing else, while the flat reading of the same data carried four notices, twelve frame fields
 * and three axis scales.
 *
 * ── WHY THE ASSERTIONS ARE DERIVED FROM THE ENGINE'S OUTPUT AND NOT FROM A LIST ──────
 * `informationTokens` walks `notices`, `Object.entries(frame)` and the three tick arrays of the
 * SurfaceOutcome itself. A notice the engine gains tomorrow, or a frame field somebody adds, is in
 * the expectation the moment it exists — nobody has to remember this file. The same function is
 * run against the OFF state first, which is what stops it passing vacuously: if the derivation
 * ever produced an empty or trivial set, the OFF assertion fails before the ON one is reached.
 */

/* The real renderer refuses in jsdom (no WebGL2), and a wrapper that has swapped back to flat is
   the state every other test in the repo observes. Held open with a stub that draws, exactly as
   `reliefPrintPath.test.tsx` does — the wrapper, its Suspense arms and the flat figure are all
   shipping code. */
const stubbed = vi.hoisted(() => ({ drawn: true }));
vi.mock('@/components/geometry/SurfaceReliefGl', async () => {
  const react = await import('react');
  const StubGl = (props: { onRefused: (code: string) => void }) => {
    react.useEffect(() => { if (!stubbed.drawn) props.onRefused('STUB_REFUSAL'); }, [props.onRefused]);
    return stubbed.drawn
      ? react.createElement('canvas', { 'data-testid': 'stub-canvas', 'aria-hidden': 'true' })
      : null;
  };
  return { default: StubGl };
});

const SURFACE = buildSurfaceMesh({
  rows: [[0.31, 0.44, 0.52], [0.22, 0.36, 0.71], [null, 0.21, WITHHELD]] as readonly (readonly GridCellValue[])[],
  xAxis: { label: 'Ticket', unit: '$k', ticks: [25, 50, 100].map((v) => ({ value: v, label: String(v) })) },
  yAxis: { label: 'Days', unit: 'd', ticks: [7, 30, 90].map((v) => ({ value: v, label: String(v) })) },
  zAxis: { label: 'Win rate', unit: '', tickCount: 4 },
  frame: {
    environment: 'lp-bench', observedAt: '2026-08-12T00:00:00.000Z', windowFrom: null, windowTo: null,
    source: 'surfaceReliefOnState.test.tsx', valuesArePlaceholders: true,
  },
});

const REFUSED = buildSurfaceMesh({
  rows: null,
  xAxis: { label: 'x', unit: '', ticks: [{ value: 1, label: '1' }] },
  yAxis: { label: 'y', unit: '', ticks: [{ value: 1, label: '1' }] },
  zAxis: { label: 'z', unit: '' },
  frame: {
    environment: 'lp-bench', observedAt: '2026-08-12T00:00:00.000Z',
    windowFrom: null, windowTo: null, source: 'surfaceReliefOnState.test.tsx',
  },
});

const PROPS = { surface: SURFACE, title: 'LP bench', readsAs: 'Height is the score a slice cannot show.', heightPx: 300 };

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
beforeEach(() => { (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub; });
afterEach(() => { cleanup(); delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver; vi.restoreAllMocks(); });

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * The text a screen reader, a text scrape and a copy-paste would actually get.
 *
 * NOT `textContent`: that returns the hidden print copy's every word and would have PASSED against
 * the defect this file exists to close. Both exclusions are the ones the platform makes —
 * `aria-hidden="true"` prunes a subtree from the accessibility tree, and `display: none` generates
 * no boxes so it is neither rendered, selectable nor in `innerText` (jsdom implements neither, so
 * they are applied here explicitly rather than assumed).
 */
function readableText(root: Element): string {
  const out: string[] = [];
  const walk = (el: Element) => {
    if (el.getAttribute('aria-hidden') === 'true') return;
    if ((el as HTMLElement).style?.display === 'none') return;
    if (el.hasAttribute('hidden')) return;
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) out.push(node.textContent ?? '');
      else if (node.nodeType === Node.ELEMENT_NODE) walk(node as Element);
    }
  };
  walk(root);
  return squash(out.join(' '));
}

/**
 * EVERY FACT THE ENGINE PUT ON THIS SURFACE, derived from the surface and never listed. Adding a
 * notice code or a frame field to `packages/shared/src/geometry` extends this set by itself.
 */
function informationTokens(s: SurfaceOutcome): readonly string[] {
  const t: string[] = [];
  if (s.kind === 'refused') {
    for (const r of s.refusals) { t.push(r.code, r.sentence, r.rule.text, r.rule.provision); }
  } else {
    for (const n of s.notices) t.push(n.code, n.sentence);
    for (const v of Object.values(s.frame)) {
      if (typeof v === 'string' && v.trim() !== '') t.push(v);
      else if (typeof v === 'number') t.push(String(v));
    }
    for (const ticks of [s.xTicks, s.yTicks, s.zTicks]) {
      for (const tk of ticks) if (tk.label.trim() !== '') t.push(tk.label);
    }
    t.push(s.projectionLabel, String(s.zDomain[0]), String(s.zDomain[1]));
  }
  return [...new Set(t.map(squash))];
}

function missingFrom(text: string, tokens: readonly string[]): readonly string[] {
  return tokens.filter((tok) => !text.includes(tok));
}

async function openRelief(container: HTMLElement): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /relief view/i }));
  await waitFor(() => {
    expect(container.querySelector('[data-testid="stub-canvas"]'), 'the relief never reached the drawn state')
      .not.toBeNull();
  });
}

/* E5 defaults ON since the 2026-08-20 owner decision, and a click persists through the storage
   module's in-memory tier. This file's choreography OPENS the relief by clicking and one test
   asserts the OFF state, so every test starts from a remembered "off" — the same production
   state an operator's past choice produces — keeping the click meaningful and the tests
   independent of each other's writes. The default itself is pinned in reliefPreference.test.ts. */
beforeEach(() => { storage.clearAll(); storage.set('relief:surface', false); });

describe('E5 with the relief ON is not an information downgrade (§6 rules 1 and 4)', () => {
  it('the derivation is real: the FLAT figure carries every derived token', () => {
    /*
     * ASSERTED FIRST AND ON THE OTHER STATE, because every assertion below is "the ON state
     * contains these tokens" and a derivation that produced nothing would satisfy that trivially.
     * This pins that the token set is large and that the flat reading actually delivers it — so a
     * failure below is about the relief, never about the fixture or the walker.
     */
    const tokens = informationTokens(SURFACE);
    expect(tokens.length, 'the derivation produced too little to prove anything').toBeGreaterThan(20);
    const { container } = render(<SurfaceRelief {...PROPS} />);
    expect(missingFrom(readableText(container), tokens)).toEqual([]);
  });

  it('keeps every one of those tokens readable while the canvas is up', async () => {
    /*
     * THE ASSERTION THAT FAILED BEFORE THIS FIX, and its whole output was:
     *   "Relief view: on Relief is opt-in: nobody has yet timed whether it answers faster than this figure."
     */
    const { container } = render(<SurfaceRelief {...PROPS} />);
    await openRelief(container);
    const text = readableText(container);
    expect(container.querySelector('[data-testid="stub-canvas"]'), 'not actually in the relief state').not.toBeNull();
    expect(missingFrom(text, informationTokens(SURFACE))).toEqual([]);
  });

  it('keeps the TRUNCATED-AXIS warning, by name, because that is the reading it warns about', async () => {
    /*
     * `Z_DOMAIN_EXCLUDES_ZERO` says the vertical axis does not reach zero and that relative heights
     * are therefore exaggerated. It is worth MORE against a lit, shaded solid than against a flat
     * sheet, and it was among the things that vanished. Named explicitly rather than left to the
     * derived set so that a failure says which warning went missing.
     */
    expect(SURFACE.kind).toBe('projected');
    if (SURFACE.kind !== 'projected') return;
    const notice = SURFACE.notices.find((n) => n.code === 'Z_DOMAIN_EXCLUDES_ZERO');
    expect(notice, 'the fixture no longer produces the notice this test is about').toBeTruthy();

    const { container } = render(<SurfaceRelief {...PROPS} />);
    await openRelief(container);
    const text = readableText(container);
    expect(text).toContain('Z_DOMAIN_EXCLUDES_ZERO');
    expect(text).toContain(squash(notice!.sentence));
  });

  it('an engine REFUSAL stays readable with the toggle on, codes and cited rules included', async () => {
    /* A reader can press the toggle on a surface the engine declined to draw. The refusal
       presentation lives inside the hidden print copy, so it disappeared too. */
    const { container } = render(<SurfaceRelief {...PROPS} surface={REFUSED} />);
    const tokens = informationTokens(REFUSED);
    expect(tokens.length, 'the refused fixture carries nothing to lose').toBeGreaterThan(2);
    expect(missingFrom(readableText(container), tokens), 'flat state').toEqual([]);
    await openRelief(container);
    expect(missingFrom(readableText(container), tokens), 'relief state').toEqual([]);
  });

  it('the words leave the printed sheet with the canvas, so paper never doubles them', async () => {
    /*
     * On paper `[data-relief-print-flat]` is revealed and carries every one of these words already.
     * `PrintStyles` deletes `[data-relief-live]` WHOLE, so this block has to be inside it or the
     * board pack prints the notices, the frame and the scales twice. Asserted structurally here;
     * `printStylesAmbientCanvas.test.tsx` reads the rule itself out of the CSSOM.
     */
    const { container } = render(<SurfaceRelief {...PROPS} />);
    await openRelief(container);
    const form = container.querySelector('[data-testid="relief-text-form"]');
    expect(form, 'the relief carries no text form at all').not.toBeNull();
    expect(form!.closest('[data-relief-live]'), 'the text form would print on top of the flat figure').not.toBeNull();
    expect(form!.closest('[aria-hidden="true"]'), 'the text form is hidden from the accessibility tree').toBeNull();
  });

  it('adds nothing at all in the OFF state, where the flat figure already speaks', () => {
    /* The state every print job and every default reader is in. The fix must be invisible here. */
    const { container } = render(<SurfaceRelief {...PROPS} />);
    expect(container.querySelector('[data-testid="relief-text-form"]')).toBeNull();
    expect(container.querySelectorAll('[data-testid="surface-plot"]').length, 'the figure was duplicated').toBe(1);
  });

  it('never puts two copies of the figure on screen at once', async () => {
    /* The obvious wrong fix — un-hiding the print copy — shows the reader a flat figure and a
       relief of the same data side by side. Exactly one `surface-plot` exists in either state, and
       in the ON state it is the hidden print copy. */
    const { container } = render(<SurfaceRelief {...PROPS} />);
    await openRelief(container);
    const plots = container.querySelectorAll('[data-testid="surface-plot"]');
    expect(plots.length, 'more than one flat figure is in the document').toBe(1);
    expect((plots[0]!.closest('[data-relief-print-flat]') as HTMLElement | null)?.style.display,
      'the print copy became visible on screen').toBe('none');
  });
});
