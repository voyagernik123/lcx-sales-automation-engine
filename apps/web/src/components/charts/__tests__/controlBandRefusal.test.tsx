import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ControlBand, type ControlBandPoint } from '../ControlBand';

/**
 * A REFUSAL WAS BEING DRAWN AS A REAL $0 FORECAST, and every layer involved was
 * individually defensible.
 *
 * `apps/api/src/kpi/snapshot.ts:88-97` goes out of its way to persist a day the simulation
 * could not price as NULL percentiles beside a `distributionRefusal` code. Its comment
 * says exactly why: "a zero is a data point and would draw a line down to it and back...
 * a future reader can tell 'the quarter was forecast at nothing' from 'we could not
 * forecast'."
 *
 * `apps/api/src/routes/kpis.ts` then read that column through `const n = (v) => Number(v ?? 0)`.
 * One `?? 0`. The null became 0, `distributionRefusal` was dropped from the response shape
 * entirely, `ForecastHistoryPoint` typed the percentiles as non-nullable so nothing
 * downstream could even represent the refusal, and `CalledVsLanded` plotted the result as
 * a control band that dipped to zero and came back.
 *
 * The refusal was preserved in the database and destroyed on the way out. That is the
 * shape of this defect class: no single layer is obviously wrong, and the honesty is lost
 * at a boundary. So these tests assert the PATH, not the unit.
 */

const pt = (
  x: string,
  v: { lo?: number | null; hi?: number | null; mid?: number | null; actual?: number | null },
): ControlBandPoint => ({
  x, lo: v.lo ?? null, hi: v.hi ?? null, mid: v.mid ?? null, actual: v.actual ?? null,
});

/**
 * Every coordinate the chart emitted for DATA — gridlines excluded.
 *
 * The exclusion matters: the zero gridline legitimately sits on the plot floor, so a naive
 * sweep of every `<line>` finds the floor y and the assertion below can never fail.
 * Gridlines are horizontal (`x1 !== x2`); the only vertical line this chart draws is a
 * single-day error bar, which IS data.
 */
function geometry(container: HTMLElement): string {
  const bits: string[] = [];
  container.querySelectorAll('path,polyline,circle').forEach((el) => {
    const d = el.getAttribute('d') ?? el.getAttribute('points');
    if (d) bits.push(d);
    const cy = el.getAttribute('cy');
    if (cy) bits.push(cy);
  });
  container.querySelectorAll('line').forEach((el) => {
    if (el.getAttribute('x1') === el.getAttribute('x2')) {
      bits.push([el.getAttribute('y1'), el.getAttribute('y2')].filter(Boolean).join(','));
    }
  });
  return bits.join(' | ');
}

describe('a day with no reading is a HOLE, not a zero', () => {
  const withGap = [
    pt('2026-08-01', { lo: 100, hi: 300, mid: 200 }),
    pt('2026-08-02', { lo: 110, hi: 310, mid: 210 }),
    pt('2026-08-03', {}),                                    // the refusal
    pt('2026-08-04', { lo: 120, hi: 320, mid: 220 }),
    pt('2026-08-05', { lo: 130, hi: 330, mid: 230 }),
  ];

  it('draws the band as TWO runs, so nothing bridges the missing day', () => {
    const { container } = render(<ControlBand data={withGap} />);
    // Two closed band paths — one either side of the gap. One path would mean the
    // renderer had drawn straight across a day it has no reading for.
    const bandPaths = [...container.querySelectorAll('path')].filter((p) =>
      (p.getAttribute('d') ?? '').endsWith('Z'),
    );
    expect(bandPaths).toHaveLength(2);
  });

  it('draws the centre line as TWO runs for the same reason', () => {
    const { container } = render(<ControlBand data={withGap} />);
    const lines = [...container.querySelectorAll('polyline')];
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it('THE ORIGINAL DEFECT: no vertex sits on the zero baseline', () => {
    /*
     * The assertion that would have caught it. With `?? 0` the missing day became a real
     * point at value 0, which the y scale puts on the plot floor — a visible dip to the
     * axis and back. No geometry may reference that y for this data, whose values are all
     * 100-330.
     */
    const { container } = render(<ControlBand data={withGap} />);
    const svg = container.querySelector('svg')!;
    const vb = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const floorY = vb[3] - 18; // VH - MB, where value 0 lands
    expect(geometry(container)).not.toContain(`,${floorY}`);
  });

  it('THE MUTATION: the old pipeline\'s own output fails the assertion above', () => {
    /*
     * Feed the chart exactly what `Number(v ?? 0)` produced — zeros where the refusal was
     * — and the floor assertion must FIRE. Without this, that assertion could be passing
     * because it can never fail, and a test that cannot fail is documentation with a
     * green tick beside it.
     */
    const asShipped = withGap.map((p, i) => (i === 2 ? pt(p.x, { lo: 0, hi: 0, mid: 0 }) : p));
    const { container } = render(<ControlBand data={asShipped} />);
    const vb = container.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number);
    expect(geometry(container)).toContain(`,${vb[3] - 18}`);
  });

  it('the missing day still occupies its x slot — dropping it would compress the axis', () => {
    // Silently removing the point would draw a continuous 4-day band labelled as 5 days.
    // That is a quieter version of the same lie, so the point stays and the SERIES breaks.
    const { container } = render(<ControlBand data={withGap} />);
    const hits = container.querySelectorAll('rect[fill="transparent"]');
    expect(hits).toHaveLength(5);
  });

  it('an all-null series renders no band at all rather than a flat line at zero', () => {
    const { container } = render(<ControlBand data={[pt('a', {}), pt('b', {}), pt('c', {})]} />);
    expect([...container.querySelectorAll('path')].filter((p) =>
      (p.getAttribute('d') ?? '').endsWith('Z'))).toHaveLength(0);
    expect(container.querySelectorAll('polyline')).toHaveLength(0);
  });

  it('a null day does not drag the value axis down', () => {
    // If nulls entered the domain as 0 the ticks would be computed against a floor the
    // data never reaches, and every real reading would be squashed into the top half.
    const { container } = render(<ControlBand data={withGap} />);
    const onlyReal = render(<ControlBand data={withGap.filter((p) => p.mid != null)} />);
    const ticksOf = (el: HTMLElement) =>
      [...el.querySelectorAll('text')].map((t) => t.textContent).join(',');
    expect(ticksOf(container)).toBe(
      ticksOf(onlyReal.container).replace('2026-08-05', '2026-08-05'),
    );
  });
});

describe('the refusal survives every layer it has to cross', () => {
  const src = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

  /**
   * A source assertion has to read CODE, not prose about code.
   *
   * Without this the check below failed on the comment that explains the fix, because
   * that comment quotes the defect verbatim: `Number(v ?? 0)`. A grep-shaped test that
   * cannot tell an occurrence from a mention will fire on its own documentation, and the
   * obvious "fix" — deleting the explanation — is the worst possible outcome.
   */
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('the route no longer coerces a stored null to zero', () => {
    /*
     * SOURCE ASSERTION ON PURPOSE. The defect was one expression at a boundary, and no
     * unit test on either side of that boundary could see it: the writer stored a null
     * correctly and the chart drew the number it was given correctly.
     */
    const route = src('../api/src/routes/kpis.ts');
    // Bounded to THIS handler. Slicing to end-of-file swept in later handlers whose own
    // `?? 0` is legitimate, and the assertion failed on code it was never about.
    const from = route.indexOf("get('/forecast-history'");
    const next = route.indexOf('kpiRoutes.', from + 10);
    const history = code(route.slice(from, next === -1 ? undefined : next));
    expect(history, 'Number(v ?? 0) is back — a refusal is being rendered as $0')
      .not.toMatch(/Number\(\s*\w+\s*\?\?\s*0\s*\)/);
    expect(history, 'the refusal code is dropped from the response again')
      .toContain('distributionRefusal');
  });

  it('the client type can REPRESENT the refusal, so it cannot be coerced away again', () => {
    // A non-nullable type here is what forced the `?? 0` in the first place. The type is
    // the thing that made the lie load-bearing.
    const api = src('src/lib/api/kpi.ts');
    const block = code(api.slice(api.indexOf('interface ForecastHistoryPoint')));
    expect(block.slice(0, 400)).toMatch(/p50:\s*number\s*\|\s*null/);
    expect(block.slice(0, 600)).toContain('distributionRefusal');
  });

  it('the chart NAMES the refused days instead of leaving an unexplained hole', () => {
    // A gap with no caption reads as missing data. This is not missing data — it is a
    // recorded refusal with a code, and the two deserve different words.
    expect(src('src/components/kpi/CalledVsLanded.tsx'))
      .toContain('data-testid="forecast-history-refusals"');
  });
});
