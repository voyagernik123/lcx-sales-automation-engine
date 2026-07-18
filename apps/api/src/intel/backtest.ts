import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';

/**
 * Backtest v1 — a discrimination test: do the projects that actually became WON
 * deals score higher on conviction than the universe? If the alpha is real, won
 * deals concentrate in the top conviction band. This is a validity check on
 * current data, not a point-in-time backtest (the observation history only
 * starts now — true point-in-time replay lands once the spine has run a while).
 */

export interface BacktestResult {
  wonCount: number;
  scoredWon: number;
  universeCount: number;
  wonMedianConviction: number | null;
  universeMedianConviction: number | null;
  lift: number | null; // won median / universe median
  topQuintileCapture: number | null; // share of won deals in the universe's top 20% conviction
  note: string;
}

export async function backtestAlpha(): Promise<BacktestResult> {
  const db = getDb();

  const res = await db.execute(sql`
    WITH conv AS (
      SELECT DISTINCT ON (subject_id) subject_id, value_num AS c
      FROM observations WHERE predicate='conviction' ORDER BY subject_id, observed_at DESC
    ),
    won AS (
      SELECT DISTINCT project_id::text AS pid FROM deals WHERE stage='won'
    ),
    wonconv AS (
      SELECT conv.c FROM won JOIN conv ON conv.subject_id = won.pid
    ),
    thr AS (
      SELECT percentile_cont(0.8) WITHIN GROUP (ORDER BY c) AS t FROM conv
    )
    SELECT
      (SELECT count(*) FROM won) AS won_count,
      (SELECT count(*) FROM wonconv) AS scored_won,
      (SELECT count(*) FROM conv) AS universe_count,
      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY c) FROM wonconv) AS won_median,
      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY c) FROM conv) AS universe_median,
      (SELECT count(*) FROM wonconv, thr WHERE wonconv.c >= thr.t) AS won_in_top_quintile
  `);

  const r = (res.rows ?? [])[0] as Record<string, unknown> | undefined;
  const wonMedian = r?.won_median != null ? Number(r.won_median) : null;
  const universeMedian = r?.universe_median != null ? Number(r.universe_median) : null;
  const scoredWon = Number(r?.scored_won ?? 0);
  const wonTop = Number(r?.won_in_top_quintile ?? 0);

  return {
    wonCount: Number(r?.won_count ?? 0),
    scoredWon,
    universeCount: Number(r?.universe_count ?? 0),
    wonMedianConviction: wonMedian,
    universeMedianConviction: universeMedian,
    lift: wonMedian != null && universeMedian ? Math.round((wonMedian / universeMedian) * 100) / 100 : null,
    topQuintileCapture: scoredWon > 0 ? Math.round((wonTop / scoredWon) * 100) / 100 : null,
    note:
      'Discrimination test on current data (won deals vs universe conviction). Not point-in-time; ' +
      'true replay unlocks once the observation history matures (Wave 6 learning loop).',
  };
}
