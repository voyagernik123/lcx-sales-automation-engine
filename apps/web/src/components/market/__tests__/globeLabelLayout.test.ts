import { describe, expect, it } from 'vitest';
import { LABEL_AIR_PX, LABEL_GAP_PX, labelHeightPx, settleLabels } from '../globeLabelLayout';

const W = 260;

describe('globe labels do not sit on each other or on the headline', () => {
  it('hangs a lone label above its anchor', () => {
    const [top] = settleLabels([{ key: 'a', sx: 300, sy: 300, flip: false, lines: 3 }], { widthPx: W, reserved: [] });
    expect(top).toBe(300 - LABEL_GAP_PX - labelHeightPx(3));
  });

  it('drops a label BELOW its anchor when the box above would cover the headline', () => {
    const header = { left: 14, top: 12, right: 400, bottom: 100 };
    const [top] = settleLabels([{ key: 'eu', sx: 200, sy: 150, flip: false, lines: 4 }], { widthPx: W, reserved: [header] });
    expect(top).toBe(150 + LABEL_GAP_PX);
  });

  it('two labels on near-identical anchors end up stacked, with air between', () => {
    const anchors = [
      { key: 'eu', sx: 400, sy: 300, flip: false, lines: 4 },
      { key: 'us', sx: 410, sy: 305, flip: false, lines: 4 },
    ];
    const [eu, us] = settleLabels(anchors, { widthPx: W, reserved: [] });
    const h = labelHeightPx(4);
    // eu (first by y) hangs above; us cannot (it would overlap eu), so it goes below its anchor
    expect(eu).toBe(300 - LABEL_GAP_PX - h);
    expect(us).toBe(305 + LABEL_GAP_PX);
    expect(us!).toBeGreaterThanOrEqual(eu! + h);
  });

  it('slides a third label past both when above and below are taken', () => {
    const anchors = [
      { key: 'a', sx: 400, sy: 300, flip: false, lines: 2 },
      { key: 'b', sx: 400, sy: 300, flip: false, lines: 2 },
      { key: 'c', sx: 400, sy: 300, flip: false, lines: 2 },
    ];
    const tops = settleLabels(anchors, { widthPx: W, reserved: [] });
    const h = labelHeightPx(2);
    const boxes = tops.map((t) => [t, t + h] as const).sort((x, y) => x[0] - y[0]);
    for (let i = 1; i < boxes.length; i++) expect(boxes[i]![0]).toBeGreaterThanOrEqual(boxes[i - 1]![1] + LABEL_AIR_PX - 1e-9);
  });

  it('a flipped label (near the right edge) is measured to the LEFT of its anchor', () => {
    // A left-hung box at sx=600 spans 330..590; a plate at 100..360 overlaps it only if flip is honoured.
    const other = { left: 100, top: 200, right: 360, bottom: 260 };
    const [top] = settleLabels([{ key: 'r', sx: 600, sy: 262, flip: true, lines: 1 }], { widthPx: W, reserved: [other] });
    expect(top).toBe(262 + LABEL_GAP_PX);
  });

  it('returns tops in anchor order, not in y order', () => {
    const anchors = [
      { key: 'low', sx: 100, sy: 500, flip: false, lines: 1 },
      { key: 'high', sx: 100, sy: 100, flip: false, lines: 1 },
    ];
    const tops = settleLabels(anchors, { widthPx: W, reserved: [] });
    expect(tops[0]).toBeGreaterThan(tops[1]!);
  });
});
