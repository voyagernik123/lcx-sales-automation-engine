import { describe, expect, it } from 'vitest';
import { computeWindow } from '../useWindowedRows';

const base = { rowHeight: 40, viewportHeight: 400, rowCount: 10_000, overscan: 6 };

describe('computeWindow — fixed-height row windowing (D2)', () => {
  it('renders only a small slice of a huge list', () => {
    const w = computeWindow({ ...base, scrollTop: 0 });
    // 400/40 = 10 visible + 6 overscan below; none above at top.
    expect(w.startIndex).toBe(0);
    expect(w.endIndex).toBe(16);
    expect(w.endIndex - w.startIndex).toBeLessThan(20);
  });

  it('keeps the scrollbar honest — total height covers every row', () => {
    expect(computeWindow({ ...base, scrollTop: 0 }).totalHeight).toBe(10_000 * 40);
  });

  it('windows to the middle on scroll with overscan both sides', () => {
    const w = computeWindow({ ...base, scrollTop: 40 * 500 }); // row 500 at top
    expect(w.startIndex).toBe(500 - 6);
    expect(w.endIndex).toBe(500 + 10 + 6);
    // padding places the rendered rows exactly where the scrollbar expects.
    expect(w.paddingTop).toBe((500 - 6) * 40);
    expect(w.paddingTop + (w.endIndex - w.startIndex) * 40 + w.paddingBottom).toBe(w.totalHeight);
  });

  it('clamps at the bottom — never runs past the last row', () => {
    const w = computeWindow({ ...base, scrollTop: 10_000 * 40 });
    expect(w.endIndex).toBe(10_000);
    expect(w.paddingBottom).toBe(0);
  });

  it('degrades safely on empty / zero inputs', () => {
    expect(computeWindow({ ...base, rowCount: 0, scrollTop: 0 })).toMatchObject({ startIndex: 0, endIndex: 0, totalHeight: 0 });
    expect(computeWindow({ ...base, rowHeight: 0, scrollTop: 0 }).endIndex).toBe(0);
    expect(computeWindow({ ...base, viewportHeight: 0, scrollTop: 0 }).endIndex).toBe(0);
  });

  it('a full list still only mounts a bounded row count regardless of size', () => {
    const small = computeWindow({ ...base, rowCount: 300, scrollTop: 4000 });
    const huge = computeWindow({ ...base, rowCount: 1_000_000, scrollTop: 4000 });
    expect(huge.endIndex - huge.startIndex).toBe(small.endIndex - small.startIndex);
  });
});
