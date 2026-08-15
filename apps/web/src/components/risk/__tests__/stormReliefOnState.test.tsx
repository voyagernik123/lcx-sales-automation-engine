import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { StormRelief } from '@/components/risk/StormRelief';
import {
  buildRiskField, isRiskField, RISK_READING_TEXT,
  type RiskField, type RiskFieldInput, type RiskFieldOutcome,
} from '@/components/risk/riskField';

/**
 * WHAT A READER GETS WHILE E7's STORM IS ON — the state no test in this repo looked at, on the
 * page whose own source calls its output a COMPLIANCE RECORD SOMEBODY KEEPS.
 *
 * `stormRelief.test.tsx` checks the DEFAULT, the FALLBACK and the three day states.
 * `reliefPrintPath.test.tsx` checks PAPER. `reliefAccessibility.test.tsx` checks the CONTROLS.
 * All three pass, and none of them asks what is readable while the canvas is up. It was this,
 * measured by `gives a reader at least as many characters…` below, on this file's fixture:
 *
 *   storm ON = 641 readable characters, storm OFF = 1699   (before the fix)
 *   storm ON = 2339 readable characters, storm OFF = 1699  (after it)
 *
 * and the 641 were the toggle, its opt-in sentence and the calibration paragraph — nothing from the
 * field at all. Both numbers are re-derived on every run and printed by that assertion's own failure
 * message, so they are reproducible rather than quoted. The calendar was still in the document —
 * `[data-relief-print-flat]` holds a whole `RiskCalendar` — behind `display: none` AND
 * `aria-hidden="true"`. `display: none` generates no boxes, so there is nothing to select and
 * nothing for text extraction to walk; `aria-hidden` prunes the subtree from the accessibility
 * tree. `StormReliefGl` renders a bare `aria-hidden` canvas (`StormReliefGl.tsx:774-780`) and
 * adds no text of its own. So a screen reader, a copy-paste and a text scrape each got the
 * toggle and the calibration sentence and nothing else — no channel name, no channel-day risk
 * figure, no day axis, no cumulative column, and not the warning that a day was never measured.
 *
 * Identical in shape to the E5 defect closed by `geometry/__tests__/surfaceReliefOnState.test.tsx`,
 * and worse in consequence: E5 is a board pack, E7 is the record.
 *
 * ── WHY THE ASSERTIONS ARE DERIVED FROM THE FIELD AND NOT FROM A LIST ────────────────
 * `informationTokens` walks `field.lanes`, `field.days`, the `field.cell` grid and
 * `Object.entries(field.frame)`, and takes its reading sentences from the exported
 * `RISK_READING_TEXT` record rather than restating them. A lane, a day, a band or a reading state
 * added tomorrow is in the expectation the moment it exists. The same function is run against the
 * OFF state FIRST, which is what stops it passing vacuously: a derivation that produced an empty
 * or trivial set fails there, before the ON state is reached.
 */

/* The real renderer refuses in jsdom (no WebGL2) and `onRefused` swaps straight back to flat, which is
   the state every other test in this repo observes. Held open with a stub that draws, exactly as
   `reliefPrintPath.test.tsx` does — the wrapper, its Suspense arms and the calendar are shipping code. */
const stubbed = vi.hoisted(() => ({ drawn: true }));
vi.mock('@/components/risk/StormReliefGl', async () => {
  const react = await import('react');
  const StubGl = (props: { onRefused: (code: string) => void }) => {
    react.useEffect(() => { if (!stubbed.drawn) props.onRefused('STUB_REFUSAL'); }, [props.onRefused]);
    return stubbed.drawn
      ? react.createElement('canvas', { 'data-testid': 'stub-canvas', 'aria-hidden': 'true' })
      : null;
  };
  return { default: StubGl };
});

const LANES = ['PAID_SEARCH', 'INFLUENCER', 'COMMUNITY'] as const;
const BANDS = ['ADVISORY', 'ELEVATED', 'SEVERE'] as const;

/** 8 days: one unmeasured (day 4) and one withheld (day 6), so every reading state is exercised. */
function input(overrides: Partial<RiskFieldInput> = {}): RiskFieldInput {
  const days = Array.from({ length: 8 }, (_, d) => ({
    label: `D${d}`,
    state: d === 4 ? ('not_measured' as const) : d === 6 ? ('withheld' as const) : ('observed' as const),
  }));
  const cells = LANES.map((_l, l) => days.map((day, d) => (
    day.state === 'observed'
      ? BANDS.map((_b, b) => Number((0.05 + 0.1 * l + 0.08 * d + 0.06 * b).toFixed(3)))
      : BANDS.map(() => null)
  )));
  return {
    lanes: [...LANES], bands: [...BANDS], days, cells,
    reviewThreshold: 2.0,
    itemsLostToUnmeasuredDays: 3,
    frame: {
      source: 'stormReliefOnState.test.tsx', observedAt: '2026-08-13T00:00:00.000Z',
      valuesArePlaceholders: true,
    },
    ...overrides,
  };
}

const FIELD = buildRiskField(input());
const PROPS = {
  title: 'Marketing risk, next 8 days',
  readsAs: 'Colour is a day-channel total; the accumulation is what a per-cell table cannot show.',
  heightPx: 240,
};

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
beforeEach(() => { (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub; });
afterEach(() => {
  cleanup();
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  vi.restoreAllMocks();
});

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * The text a screen reader, a text scrape and a copy-paste would actually get.
 *
 * NOT `textContent`: that returns the hidden print copy's every word and would have PASSED against
 * the defect this file exists to close. Both exclusions are the ones the platform makes —
 * `aria-hidden="true"` prunes a subtree from the accessibility tree, and `display: none` generates
 * no boxes so it is neither rendered, selectable nor in `innerText`. jsdom implements neither, so
 * they are applied here explicitly rather than assumed. Lifted unchanged from
 * `geometry/__tests__/surfaceReliefOnState.test.tsx` so the two environments are measured with the
 * same instrument.
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
 * EVERY FACT THE FLAT CALENDAR PUTS IN THE DOM, derived from the field and never listed.
 *
 * The per-channel-day figure is summed in the SAME ORDER `RiskCalendar` sums it (bands ascending,
 * `?? 0`) so the two `toFixed(3)` strings are bit-identical rather than nearly equal — a different
 * order would produce a different last digit on some fixtures and the test would chase floats.
 *
 * Deliberately NOT included: the severity band NAMES, which the flat calendar never prints. They are
 * in the token set of nothing, so the OFF-state control below stays honest; the text form prints them
 * anyway because the volume has a band axis and a reader is owed its labels.
 */
function informationTokens(field: RiskFieldOutcome): readonly string[] {
  const t: string[] = [];
  if (!isRiskField(field)) {
    t.push(field.code, field.reason);
    return [...new Set(t.map(squash))];
  }
  for (const lane of field.lanes) t.push(lane);
  for (const day of field.days) {
    t.push(day.label);
    /* The reading sentence comes from the exported record, so a new reading state is covered here
       and in the component by the same constant rather than by two remembered edits. */
    t.push(RISK_READING_TEXT[day.reading]);
    if (day.cumulative !== null) t.push(day.cumulative.toFixed(1));
    for (let l = 0; l < field.lanes.length; l++) {
      if (day.state !== 'observed') continue;
      let sum = 0;
      for (let b = 0; b < field.bands.length; b++) sum += field.cell(l, day.index, b) ?? 0;
      t.push(sum.toFixed(3));
    }
  }
  /* The ramp's top, which is what makes a colour a quantity. */
  t.push(field.maxCell.toFixed(2));
  for (const v of Object.values(field.frame)) {
    if (typeof v === 'string' && v.trim() !== '') t.push(v);
    else if (typeof v === 'number') t.push(String(v));
  }
  return [...new Set(t.map(squash))].filter((s) => s !== '');
}

function missingFrom(text: string, tokens: readonly string[]): readonly string[] {
  return tokens.filter((tok) => !text.includes(tok));
}

/**
 * The two facts the CALLER supplies rather than the field — the figure's name and the sentence the
 * caller had to finish to be allowed the figure at all. Carried separately because `Refused` renders
 * the title and NOT `readsAs`, so they do not belong in a token set that also has to hold for a
 * refused calendar. In the reading order they are the pair a duplicating fix repeats first: a table
 * `<caption>` that restates the title makes a screen reader announce it twice on the way in.
 */
const CALLER_TOKENS: readonly string[] = [PROPS.title, PROPS.readsAs];

const occurrences = (text: string, token: string): number => text.split(token).length - 1;

async function openStorm(container: HTMLElement): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /storm view/i }));
  await waitFor(() => {
    expect(container.querySelector('[data-testid="stub-canvas"]'), 'the storm never reached the drawn state')
      .not.toBeNull();
  });
}

describe('E7 with the storm ON is not an information downgrade (§6 rules 1 and 4)', () => {
  it('the derivation is real: the FLAT calendar carries every derived token', () => {
    /*
     * ASSERTED FIRST AND ON THE OTHER STATE, because every assertion below is "the ON state contains
     * these tokens" and a derivation that produced nothing would satisfy that trivially. This pins
     * that the token set is large and that the flat reading actually delivers it — so a failure below
     * is about the storm, never about the fixture or the walker.
     */
    const tokens = [...informationTokens(FIELD), ...CALLER_TOKENS];
    expect(tokens.length, 'the derivation produced too little to prove anything').toBeGreaterThan(30);
    const { container } = render(<StormRelief {...PROPS} field={FIELD} />);
    expect(missingFrom(readableText(container), tokens)).toEqual([]);
  });

  it('keeps every one of those tokens readable while the canvas is up', async () => {
    /*
     * THE ASSERTION THAT FAILED BEFORE THIS FIX. Its whole readable output was the toggle and the
     * calibration sentence: every lane name, every channel-day figure, the day axis, the cumulative
     * strip, the ramp scale and the source line were in the document and reachable by nothing.
     */
    const { container } = render(<StormRelief {...PROPS} field={FIELD} />);
    await openStorm(container);
    expect(container.querySelector('[data-testid="stub-canvas"]'), 'not actually in the storm state').not.toBeNull();
    expect(missingFrom(readableText(container), [...informationTokens(FIELD), ...CALLER_TOKENS])).toEqual([]);
  });

  it('gives a reader at least as many characters with the storm on as with it off', async () => {
    /*
     * THE HEADLINE NUMBER, RE-DERIVED ON EVERY RUN RATHER THAN QUOTED IN A COMMENT — the failure
     * message carries both counts, so `npx vitest run` is the instrument that reports them. §6 rule 1
     * says the fallback is not an information downgrade; this is that sentence as a measurement, and
     * it is a floor rather than an equality because the text form also states things the calendar
     * draws in pixels (the band names, the day states in words).
     */
    const flat = render(<StormRelief {...PROPS} field={FIELD} />);
    const off = readableText(flat.container).length;
    cleanup();

    const { container } = render(<StormRelief {...PROPS} field={FIELD} />);
    await openStorm(container);
    const on = readableText(container).length;
    expect(on, `storm ON = ${on} readable characters, storm OFF = ${off}`).toBeGreaterThanOrEqual(off);
  });

  it('names the unmeasured days, the withheld day and the items that fell into the hole', async () => {
    /*
     * NAMED RATHER THAN LEFT TO THE DERIVED SET, so a failure says which warning went missing —
     * the same reason E5 names `Z_DOMAIN_EXCLUDES_ZERO` explicitly. These three are the reason the
     * field has three day states at all: an unmeasured day is not a calm day, a withheld day is not
     * a finding, and an already-scheduled item that landed in the hole has weight in no cell.
     */
    if (!isRiskField(FIELD)) throw new Error('fixture refused');
    expect(FIELD.unmeasuredDays).toBeGreaterThan(0);
    expect(FIELD.withheldDays).toBeGreaterThan(0);
    expect(FIELD.itemsLostToUnmeasuredDays).toBeGreaterThan(0);

    const { container } = render(<StormRelief {...PROPS} field={FIELD} />);
    await openStorm(container);
    const text = readableText(container);
    expect(text, 'the unmeasured-day warning').toMatch(/NOT MEASURED/);
    expect(text, 'the "this is not zero" clause').toMatch(/not zero/i);
    expect(text, 'the withheld-day warning').toMatch(/withheld/i);
    expect(text, 'the items that landed in the hole').toMatch(/3 already-scheduled item/);
  });

  it('says which day carries which reading, so the cumulative refusals survive as text', async () => {
    /*
     * The cumulative strip is where the FLAT view wins, and its refusals are the load-bearing half:
     * day 5 is measured and still carries no total because an unmeasured day lies between it and
     * day 0. Derived — every day's own reading key must appear against its own label.
     */
    if (!isRiskField(FIELD)) throw new Error('fixture refused');
    const { container } = render(<StormRelief {...PROPS} field={FIELD} />);
    await openStorm(container);
    const rows = container.querySelectorAll('[data-testid="storm-text-form"] [data-day-index]');
    expect(rows.length, 'the text form has no per-day rows').toBe(FIELD.days.length);
    for (const day of FIELD.days) {
      const row = container.querySelector(`[data-testid="storm-text-form"] [data-day-index="${day.index}"]`);
      expect(row, `day ${day.index} has no row`).not.toBeNull();
      const t = squash(row!.textContent ?? '');
      expect(t, `day ${day.index} label`).toContain(day.label);
      expect(t, `day ${day.index} reading`).toContain(day.reading);
      if (day.cumulative !== null) expect(t, `day ${day.index} cumulative`).toContain(day.cumulative.toFixed(1));
    }
  });

  it('never says the same thing twice in the reading order', async () => {
    /*
     * THE WRONG FIX, CAUGHT: un-hiding `[data-relief-print-flat]` would restore every one of these
     * tokens and put a full second calendar in the reading order — a screen reader would announce
     * every figure twice and a copy-paste would carry two of each.
     *
     * DERIVED, not a list of suspects: the tokens that occur EXACTLY ONCE in the flat state are
     * measured first, and each must still occur exactly once with the storm up. Tokens that already
     * repeat in the flat reading (a lane name appears once on the axis and once per cell title) are
     * excluded by construction rather than by judgement.
     */
    const flat = render(<StormRelief {...PROPS} field={FIELD} />);
    const offText = readableText(flat.container);
    const unique = [...informationTokens(FIELD), ...CALLER_TOKENS].filter((t) => occurrences(offText, t) === 1);
    expect(unique.length, 'nothing occurs exactly once, so this test proves nothing').toBeGreaterThan(10);
    cleanup();

    const { container } = render(<StormRelief {...PROPS} field={FIELD} />);
    await openStorm(container);
    const onText = readableText(container);
    const doubled = unique.filter((t) => occurrences(onText, t) !== 1);
    expect(doubled, 'these facts are now in the reading order more than once').toEqual([]);
  });

  it('keeps exactly one calendar in the document, and it is still the hidden print copy', async () => {
    /*
     * The constraint from this component's own header: the print copy and the Suspense fallback are
     * two arms of ONE boundary so exactly one is mounted, which is what keeps
     * `getByTestId('risk-calendar')` unambiguous for every other suite. The text form must not
     * become a second figure.
     */
    const { container } = render(<StormRelief {...PROPS} field={FIELD} />);
    await openStorm(container);
    const figures = container.querySelectorAll('[data-testid="risk-calendar"]');
    expect(figures.length, 'more than one calendar is in the document').toBe(1);
    expect((figures[0]!.closest('[data-relief-print-flat]') as HTMLElement | null)?.style.display,
      'the print copy became visible on screen').toBe('none');
    expect(container.querySelectorAll('svg').length, 'a second figure was drawn on screen').toBe(1);
  });

  it('leaves the printed sheet alone: the words go with the canvas, not onto the paper', async () => {
    /*
     * On paper `[data-relief-print-flat]` is revealed and the full calendar returns carrying every one
     * of these words already. `PrintStyles` deletes `[data-relief-live]` WHOLE, so the text form has to
     * be inside it or a compliance record prints the figures twice. Asserted structurally here;
     * `reliefPrintPath.test.tsx` reads the two rules out of the real CSSOM.
     */
    const { container } = render(<StormRelief {...PROPS} field={FIELD} />);
    await openStorm(container);
    const form = container.querySelector('[data-testid="storm-text-form"]');
    expect(form, 'the storm carries no text form at all').not.toBeNull();
    expect(form!.closest('[data-relief-live]'), 'the text form would print on top of the flat calendar').not.toBeNull();
    expect(form!.closest('[aria-hidden="true"]'), 'the text form is hidden from the accessibility tree').toBeNull();
    expect((form as HTMLElement).style.display, 'the text form is hidden from the clipboard').not.toBe('none');

    const printCopy = container.querySelector('[data-relief-print-flat]') as HTMLElement | null;
    expect(printCopy, 'the print path lost its flat copy').not.toBeNull();
    expect(printCopy!.style.display, 'the inline hide that a page without PrintStyles depends on').toBe('none');
    expect(printCopy!.getAttribute('aria-hidden'), 'the print copy must stay out of the reading order').toBe('true');
    expect(printCopy!.querySelector('[data-testid="risk-calendar"]'), 'the print copy no longer holds the calendar')
      .not.toBeNull();
  });

  it('adds nothing at all in the default OFF state, where the calendar already speaks', () => {
    /* The state every print job and every first-time reader is in. The fix must be invisible here. */
    const { container } = render(<StormRelief {...PROPS} field={FIELD} />);
    expect(container.querySelector('[data-testid="storm-text-form"]')).toBeNull();
    expect(container.querySelectorAll('[data-testid="risk-calendar"]').length, 'the figure was duplicated').toBe(1);
  });

  it('a field the calendar refused never reaches the storm, so its refusal stays on screen', () => {
    /*
     * E7 differs from E5 here and the difference is worth pinning: `blocked` covers `!drawable`, so a
     * refused field cannot open the storm at all and the refusal presentation is never inside the
     * hidden copy. That is why the text form takes a `RiskField` rather than an outcome.
     */
    const refused = buildRiskField({ ...input(), lanes: [], cells: [] });
    const { container } = render(<StormRelief {...PROPS} field={refused} />);
    const tokens = informationTokens(refused);
    expect(tokens.length, 'the refused fixture carries nothing to lose').toBeGreaterThan(1);
    expect(missingFrom(readableText(container), tokens)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: /storm view/i }));
    expect(container.querySelector('[data-testid="stub-canvas"]'), 'a refused field opened the storm').toBeNull();
    expect(missingFrom(readableText(container), tokens), 'after the click').toEqual([]);
  });
});

/** Kept out of the suite above: it is about the shape of the fixture, not about the storm. */
describe('the fixture this file measures against', () => {
  it('is a real field with all three day states', () => {
    const f: RiskFieldOutcome = FIELD;
    if (!isRiskField(f)) throw new Error(`expected a field, got ${f.code}`);
    const g: RiskField = f;
    expect(g.observedDays).toBe(6);
    expect(g.unmeasuredDays).toBe(1);
    expect(g.withheldDays).toBe(1);
  });
});
