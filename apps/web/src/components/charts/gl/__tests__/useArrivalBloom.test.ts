/**
 * THE ARRIVAL BLOOM decides once, from S4's mark: a changed figure blooms (1), a first reading does not (0), an unchanged
 * figure does not (0), and nothing to compare observes nothing. The hook also OBSERVES the signature so the next arrival's
 * rollover has a mark to compare against.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { _resetFigMarks, markOf, observe, rollover } from '@/lib/figMarks';
import { arrivalSignature, useArrivalBloom } from '../useArrivalBloom';

describe('useArrivalBloom — one decision per mount, from the S4 mark', () => {
  beforeEach(() => { _resetFigMarks(); });

  it('a first reading does not bloom, and is observed for the next arrival', () => {
    const { result } = renderHook(() => useArrivalBloom('kpi:pipeline', 42));
    expect(result.current).toBe(0);
    expect(markOf('kpi:pipeline'), 'a first reading has no mark to compare against').toBeNull();
    rollover();
    expect(markOf('kpi:pipeline')?.value, 'rollover promotes the observed reading to the mark').toBe(42);
  });

  it('a figure that changed since the mark blooms once; an unchanged one does not', () => {
    observe('kpi:pipeline', 42, '2026-09-01T00:00:00.000Z'); rollover();
    expect(renderHook(() => useArrivalBloom('kpi:pipeline', 43)).result.current).toBe(1);
    _resetFigMarks(); observe('kpi:pipeline', 42, '2026-09-01T00:00:00.000Z'); rollover();
    expect(renderHook(() => useArrivalBloom('kpi:pipeline', 42)).result.current).toBe(0);
  });

  it('no key or no signature → 0, and nothing is observed', () => {
    expect(renderHook(() => useArrivalBloom(undefined, 7)).result.current).toBe(0);
    expect(renderHook(() => useArrivalBloom('kpi:x', null)).result.current).toBe(0);
    rollover();
    expect(markOf('kpi:x')).toBeNull();
  });

  it('the signature is order-sensitive, ignores nulls, and is null for no values', () => {
    expect(arrivalSignature([1, 2, 3])).not.toBe(arrivalSignature([3, 2, 1]));
    expect(arrivalSignature([1, null, 2])).toBe(arrivalSignature([1, 2]));
    expect(arrivalSignature([])).toBeNull();
    expect(arrivalSignature([null, undefined])).toBeNull();
  });
});
