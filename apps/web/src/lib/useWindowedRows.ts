import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Fixed-height row windowing (FINAL_MASTER_PLAN D2), dependency-free.
 *
 * Scale-honesty note: every list in the app today is bounded at the data
 * layer — BD Engine and Audit Log server-paginate, the rest render
 * seed-bounded sets — so nothing currently renders enough rows to need
 * windowing. This is the ready primitive for the first list that goes
 * genuinely unbounded (e.g. a client-side render of the full BD working set):
 * render only `startIndex..endIndex` inside a scroll container and pad with
 * `paddingTop`/`paddingBottom` so the scrollbar stays honest.
 *
 * The math is a pure function so it can be unit-tested without a DOM.
 */

export interface WindowSlice {
  /** First row index to render (inclusive). */
  startIndex: number;
  /** Last row index to render (exclusive). */
  endIndex: number;
  /** Spacer height above the rendered rows, px. */
  paddingTop: number;
  /** Spacer height below the rendered rows, px. */
  paddingBottom: number;
  /** Full scrollable height, px — the scrollbar reflects the true row count. */
  totalHeight: number;
}

export interface WindowInput {
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  rowCount: number;
  /** Extra rows above and below the viewport, to mask fast scrolling. */
  overscan?: number;
}

export function computeWindow({
  scrollTop,
  viewportHeight,
  rowHeight,
  rowCount,
  overscan = 6,
}: WindowInput): WindowSlice {
  const totalHeight = rowCount * rowHeight;
  if (rowCount === 0 || rowHeight <= 0 || viewportHeight <= 0) {
    return { startIndex: 0, endIndex: 0, paddingTop: 0, paddingBottom: 0, totalHeight };
  }
  const clampedTop = Math.max(0, Math.min(scrollTop, Math.max(0, totalHeight - viewportHeight)));
  const first = Math.floor(clampedTop / rowHeight);
  const visible = Math.ceil(viewportHeight / rowHeight);
  const startIndex = Math.max(0, first - overscan);
  const endIndex = Math.min(rowCount, first + visible + overscan);
  return {
    startIndex,
    endIndex,
    paddingTop: startIndex * rowHeight,
    paddingBottom: (rowCount - endIndex) * rowHeight,
    totalHeight,
  };
}

/**
 * Hook form: attach the returned `onScroll` to a fixed-height scroll
 * container and read the slice each render. Pass the live `rowCount` and the
 * measured `rowHeight`.
 */
export function useWindowedRows(rowCount: number, rowHeight: number, overscan = 6) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight);
    const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const slice = computeWindow({ scrollTop, viewportHeight, rowHeight, rowCount, overscan });
  return { containerRef, onScroll, ...slice };
}
