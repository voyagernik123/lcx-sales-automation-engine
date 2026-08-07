/**
 * LEGIBILITY, ASSERTED GEOMETRICALLY — the class of defect a DOM test structurally cannot see.
 *
 * Twenty passing tests in this directory asserted polygon order, hole glyphs, frame text and
 * ray-cast label clearance. The live GPS margin surface still rendered:
 *
 *   · `baseline` as "line" and `$200,000` as "$200,00C" — the viewBox reserved a constant
 *     8-unit pad around projected POINTS, and a tick label is TEXT extending outward from one;
 *   · `+50%` and `$300,000` overlapping into "+50%00,000" — the two tick runs meet at one
 *     corner and their last labels were 2 units apart with 4-unit-tall text;
 *   · a vertical axis reading only "0%" across a -34..48 % domain.
 *
 * NONE OF THAT IS VISIBLE TO `textContent`. A clipped label's node still holds the whole
 * string; two overlapping labels are two perfectly good nodes. It was found by rendering the
 * figure to SVG, converting it and LOOKING at it — which is the repo's standing rule, and this
 * file is the part of that pass a machine can keep doing.
 *
 * These assertions are on COORDINATES, not on pixels: where each label's box sits relative to
 * the viewBox and to every other label. That is checkable without a rasteriser and it is the
 * actual property that failed.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SurfacePlot } from '../SurfacePlot';
import {
  LABEL_ADVANCE_EM,
  LABEL_FONT_SIZE,
  buildSurfaceMesh,
  isProjectedSurface,
  type SurfaceGridInput,
} from '../../../../../../packages/shared/src/geometry/index';

/** The live GPS margin surface: long money labels on x, a word on y, a domain straddling zero. */
const LIVE: SurfaceGridInput = {
  rows: [
    [38, 33, 29, 24, 21],
    [29, 24, 19, 15, 11],
    [15, 9, 4, -1, -5],
    [-8, -15, -21, -27, -34],
  ],
  xAxis: {
    label: 'Price',
    unit: 'EUR',
    ticks: [
      { value: 20_000_000, label: '$200,000' },
      { value: 22_500_000, label: '$225,000' },
      { value: 25_000_000, label: '$250,000' },
      { value: 27_500_000, label: '$275,000' },
      { value: 30_000_000, label: '$300,000' },
    ],
  },
  yAxis: {
    label: 'Effort overrun',
    unit: '%',
    ticks: [
      { value: 0, label: 'baseline' },
      { value: 10, label: '+10%' },
      { value: 25, label: '+25%' },
      { value: 50, label: '+50%' },
    ],
  },
  zAxis: { label: 'Median margin', unit: '% of price', formatTick: (v) => `${Math.round(v)}%` },
  frame: {
    environment: 'API http://localhost:8791',
    observedAt: '2026-08-07T09:00:00.000Z',
    windowFrom: null,
    windowTo: null,
    source: 'gps/underwrite.ts simulate',
  },
};

interface Box { label: string; x0: number; x1: number; y0: number; y1: number }

/** Each `<text>`'s box, from its own attributes and the metrics the engine reserved against. */
function labelBoxes(container: HTMLElement): Box[] {
  return [...container.querySelectorAll('text')].map((t) => {
    const x = Number(t.getAttribute('x'));
    const y = Number(t.getAttribute('y'));
    const label = t.textContent ?? '';
    const w = label.length * LABEL_FONT_SIZE * LABEL_ADVANCE_EM;
    const anchor = t.getAttribute('text-anchor') ?? t.getAttribute('textAnchor') ?? 'start';
    const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    // SVG text sits on its baseline: the glyph body is above `y`, descenders just below.
    return { label, x0, x1: x0 + w, y0: y - LABEL_FONT_SIZE, y1: y + LABEL_FONT_SIZE * 0.25 };
  });
}

function overlaps(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

describe('the figure is READABLE, not merely correct', () => {
  const out = buildSurfaceMesh(LIVE);

  it('projects — anti-vacuity, so nothing below passes over a refusal', () => {
    expect(isProjectedSurface(out), JSON.stringify(out)).toBe(true);
  });

  it('renders the tick text at exactly the size the engine reserved for', () => {
    /*
     * THE DRIFT GUARD. The engine cannot measure text, so it reserves viewBox room using
     * LABEL_FONT_SIZE. If the renderer's size and that constant part company, the reservation
     * silently under-covers and clipping returns with every other test still green.
     */
    const { container } = render(
      <SurfacePlot surface={out} title="t" readsAs="r" />,
    );
    const sizes = new Set(
      [...container.querySelectorAll('text')].map((t) => t.getAttribute('font-size')),
    );
    expect(sizes.size, 'tick labels are drawn at more than one size').toBe(1);
    expect(Number([...sizes][0])).toBe(LABEL_FONT_SIZE);
  });

  it('keeps every label INSIDE the viewBox — the clipping regression', () => {
    if (!isProjectedSurface(out)) return;
    const { minX, minY, width, height } = out.viewBox;
    const { container } = render(<SurfacePlot surface={out} title="t" readsAs="r" />);

    const escaped = labelBoxes(container).filter(
      (b) => b.x0 < minX || b.x1 > minX + width || b.y0 < minY || b.y1 > minY + height,
    );
    expect(
      escaped.map((b) => `${b.label} [${b.x0.toFixed(1)}..${b.x1.toFixed(1)}]`),
      `viewBox is ${minX}..${minX + width} x ${minY}..${minY + height}`,
    ).toEqual([]);
  });

  it('draws no two labels on top of each other — the collision regression', () => {
    if (!isProjectedSurface(out)) return;
    const { container } = render(<SurfacePlot surface={out} title="t" readsAs="r" />);
    const boxes = labelBoxes(container);

    // Anti-vacuity: if the query returns nothing, "no overlaps" is trivially true forever.
    expect(boxes.length, 'no tick labels rendered at all').toBeGreaterThanOrEqual(9);

    const collisions: string[] = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (overlaps(boxes[i]!, boxes[j]!)) collisions.push(`"${boxes[i]!.label}" × "${boxes[j]!.label}"`);
      }
    }
    expect(collisions).toEqual([]);
  });

  it('gives the vertical axis a scale rather than one tick', () => {
    if (!isProjectedSurface(out)) return;
    // -34..48 used to yield exactly [0]: a surface spanning 82 points of margin against an
    // axis that named a single height.
    expect(out.zTicks.length).toBeGreaterThanOrEqual(3);
    expect(out.zTicks.map((t) => t.label)).toContain('0%');
  });
});
