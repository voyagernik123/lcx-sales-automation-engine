/** Internal helpers for the chart kit — not exported from the barrel. */

/** Compact, human-friendly number formatting (1,284 → 1.3K, 4200000 → 4.2M). */
export function formatNumber(v: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: Math.abs(v) >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(v);
}

/**
 * Clean axis ticks from 0 up to a nice ceiling of `max`.
 * Steps snap to 1 / 2 / 5 × 10^k so ticks read as round numbers.
 */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const rawStep = max / count;
  const exp = Math.floor(Math.log10(rawStep));
  const f = rawStep / 10 ** exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  const step = nf * 10 ** exp;
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let i = 0; i * step <= top + step / 2; i++) {
    ticks.push(Math.round(i * step * 1e9) / 1e9);
  }
  return ticks;
}

/** Bar/column path with a 4px rounded DATA end, square at the baseline. */
export function roundedTopRect(x: number, y: number, w: number, h: number, r = 4): string {
  if (w <= 0 || h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return [
    `M${x},${y + h}`,
    `L${x},${y + rr}`,
    `Q${x},${y} ${x + rr},${y}`,
    `L${x + w - rr},${y}`,
    `Q${x + w},${y} ${x + w},${y + rr}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ');
}

/** Horizontal bar path, rounded on the right (data) end, square on the left. */
export function roundedRightRect(x: number, y: number, w: number, h: number, r = 4): string {
  if (w <= 0 || h <= 0) return '';
  const rr = Math.min(r, h / 2, w);
  return [
    `M${x},${y}`,
    `L${x + w - rr},${y}`,
    `Q${x + w},${y} ${x + w},${y + rr}`,
    `L${x + w},${y + h - rr}`,
    `Q${x + w},${y + h} ${x + w - rr},${y + h}`,
    `L${x},${y + h}`,
    'Z',
  ].join(' ');
}

/** Horizontal segment path, rounded on the left end only. */
export function roundedLeftRect(x: number, y: number, w: number, h: number, r = 4): string {
  if (w <= 0 || h <= 0) return '';
  const rr = Math.min(r, h / 2, w);
  return [
    `M${x + rr},${y}`,
    `L${x + w},${y}`,
    `L${x + w},${y + h}`,
    `L${x + rr},${y + h}`,
    `Q${x},${y + h} ${x},${y + h - rr}`,
    `L${x},${y + rr}`,
    `Q${x},${y} ${x + rr},${y}`,
    'Z',
  ].join(' ');
}

/** Truncate a label for in-chart display (full text lives in the tooltip). */
export function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s;
}
