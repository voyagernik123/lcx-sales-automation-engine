/**
 * Chart palette accessors for the dataviz kit.
 *
 * The actual colors live as CSS custom properties in `src/styles/tokens.css`
 * (block: "chart palette (dataviz kit)") with light values on `:root` and
 * dark values on `.dark`, so every chart re-themes automatically.
 *
 * Rules (non-negotiable):
 * - Categorical hues are assigned in FIXED order: series 1 always gets
 *   --chart-1, series 2 gets --chart-2, and so on. Never cycle-generate hues.
 * - Past 8 series, fold the tail into "Other" — seriesVar wraps only as a
 *   last-resort fallback, it is not a license for 9+ distinct series.
 * - Text (labels, values, legends) never wears a series color; use the app
 *   text tokens (text-navy / text-grey — both self-theme).
 */

export const SERIES_COUNT = 8;

/**
 * Returns `var(--chart-N)` for a 1-based series slot, wrapped into 1..8.
 * `seriesVar(1)` → `var(--chart-1)` … `seriesVar(8)` → `var(--chart-8)`,
 * `seriesVar(9)` wraps back to `var(--chart-1)`.
 */
export function seriesVar(i: number): string {
  const n = ((((Math.trunc(i) - 1) % SERIES_COUNT) + SERIES_COUNT) % SERIES_COUNT) + 1;
  return `var(--chart-${n})`;
}

/** Recessive hairline gridline color. */
export const CHART_GRID = 'var(--chart-grid)';
/** De-emphasis hue for muted marks (e.g. stat-card sparklines). */
export const CHART_MUTED = 'var(--chart-muted)';
/** Positive/negative status colors (theme-aware). */
export const CHART_GOOD = 'var(--chart-good)';
export const CHART_BAD = 'var(--chart-bad)';
/** Unfilled meter/gauge track. */
export const CHART_TRACK = 'var(--chart-track)';
/** Chart surface color (card background) — used for 2px surface gaps/rings. */
export const CARD_FILL = 'var(--card-fill, #ffffff)';
