import { scopedKey } from '@/lib/persistence';

/**
 * THE MARK — S6 of INSTRUMENT_100X_PLAN (the terminal).
 *
 * A figure without a delta is a number; a figure with "▲ 12% since Tuesday 09:41" is a reading. The mark
 * is the value a figure had the LAST TIME THE OPERATOR ARRIVED (S4's arrival, not the last render), so
 * the delta answers the question the watch answers — what changed while I was away — at the granularity
 * of one figure.
 *
 * ONE STORE, TWO GENERATIONS. Every `<Fig>` reports its current value here as it renders (`observe`);
 * on each arrival (`useArrivalStore.arrive` succeeding) `rollover()` promotes every figure's current
 * value to its mark. A figure seen for the first time has no mark and says "first reading" instead of
 * inventing a zero delta. Per operator, per browser (the scoped key), like the watch's watermark.
 *
 * NO TIMER, NO CLOCK READ OF ITS OWN. The instants stored are the figures' own source instants; the
 * "when" the reader sees is formatted from S1's clock by the component, not here.
 */

export interface FigMark { value: number; at: string | null }
interface Entry { mark: FigMark | null; current: FigMark | null }
type Store = Record<string, Entry>;

const KEY = 'fig-marks';
let cache: Store | null = null;

function load(): Store {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(scopedKey(KEY)) ?? '{}') as Store; } catch { cache = {}; }
  return cache!;
}
function save(): void {
  try { localStorage.setItem(scopedKey(KEY), JSON.stringify(cache ?? {})); } catch { /* the next arrival simply has no marks */ }
}

/** A figure reports what it shows now. Cheap; called from render-adjacent effects, never from render. */
export function observe(id: string, value: number | null, at: string | null): void {
  if (value === null || !Number.isFinite(value)) return;
  const s = load();
  const e = s[id] ?? { mark: null, current: null };
  if (e.current && e.current.value === value && e.current.at === at) return;
  s[id] = { mark: e.mark, current: { value, at } };
  cache = s; save();
}

/** The mark a figure compares against — the value it showed at the previous arrival, or null on a first reading. */
export function markOf(id: string): FigMark | null {
  return load()[id]?.mark ?? null;
}

/** On arrival: every figure's current reading becomes its mark. Called once per arrival by the arrival store. */
export function rollover(): void {
  const s = load();
  for (const id of Object.keys(s)) {
    const e = s[id];
    if (e.current) s[id] = { mark: e.current, current: e.current };
  }
  cache = s; save();
}

/** Test seam. */
export function _resetFigMarks(): void { cache = null; try { localStorage.removeItem(scopedKey(KEY)); } catch { /* noop */ } }
