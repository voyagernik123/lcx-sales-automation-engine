/**
 * Deception detection (Palantir-grade Phase 2.4) — assume adversarial data.
 *
 * In crypto the classic manipulation is wash trading: fabricated volume to fake
 * liquidity/interest. We flag tracked tokens whose 24h turnover (volume ÷ market
 * cap) is implausibly high — legitimate large-caps rarely turn over their whole
 * float in a day; >200%/day is a strong wash signal, especially on a thin cap.
 *
 * A flag is written as a grade-F observation (reliability F, credibility 5 =
 * "improbable") so it visibly poisons conviction downstream (assess() applies a
 * hard discount when washTradingFlag is set) — deception is a negative signal,
 * not missing data. Idempotent: clears prior flags each run.
 */
import type pg from 'pg';
import type { Reliability, Credibility } from '@lcx/shared';
import { insertObservations, type ObservationRow } from './observations.js';

/** Daily turnover at/above which volume looks fabricated. */
const TURNOVER_SUSPECT = 2.0; // 200% of market cap traded in 24h
/** Below this cap, high turnover is even more suspicious (thin float). */
const THIN_CAP_USD = 5_000_000;

export interface DeceptionStats {
  scanned: number;
  flagged: number;
}

export async function detectWashTrading(pool: pg.Pool): Promise<DeceptionStats> {
  // Idempotent — drop last run's flags so cleared tokens stop being penalised.
  await pool.query(`DELETE FROM observations WHERE predicate = 'wash_trading_flag'`);

  const { rows } = await pool.query(
    `SELECT id, market_cap_usd, volume_24h_usd
     FROM projects
     WHERE tier = 'tracked'
       AND market_cap_usd IS NOT NULL AND market_cap_usd > 0
       AND volume_24h_usd IS NOT NULL AND volume_24h_usd > 0`,
  );

  const now = new Date();
  const flags: ObservationRow[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const mcap = Number(r.market_cap_usd);
    const vol = Number(r.volume_24h_usd);
    const turnover = vol / mcap;
    // Suspicious if turnover is extreme, or high on a thin cap.
    const thinCapHot = mcap < THIN_CAP_USD && turnover >= 1.0;
    if (turnover >= TURNOVER_SUSPECT || thinCapHot) {
      flags.push({
        subjectType: 'project',
        subjectId: r.id as string,
        predicate: 'wash_trading_flag',
        value: {
          turnover: Math.round(turnover * 100) / 100,
          reason: thinCapHot && turnover < TURNOVER_SUSPECT
            ? `Thin cap ($${Math.round(mcap).toLocaleString()}) with ${Math.round(turnover * 100)}% daily turnover`
            : `${Math.round(turnover * 100)}% of market cap traded in 24h — implausible organic volume`,
        },
        valueNum: turnover,
        unit: 'ratio',
        source: 'internal',
        reliability: 'F' as Reliability,
        credibility: 5 as Credibility, // improbable that the volume is organic
        observedAt: now,
      });
    }
  }

  const flagged = await insertObservations(pool, flags);
  return { scanned: rows.length, flagged };
}
