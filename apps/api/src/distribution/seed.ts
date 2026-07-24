import type pg from 'pg';
import { DISTRIBUTION_DEEP_SEED } from '../seed/distribution/data.js';

/**
 * seedDistribution — ensure one dist_listings row per compiled surface
 * (LCX ONE Phase 3). Idempotent and NON-CLOBBERING: a surface the desk has
 * already advanced (submitted/live/ranked) keeps its status; only genuinely
 * new surfaces are inserted at not_started. Best-effort — degrades cleanly if
 * migration 0043 has not landed (42P01), so /deep still serves the compiled
 * reference before the tables exist.
 */
export async function seedDistribution(pool: pg.Pool): Promise<{ listings: number } | null> {
  try {
    let n = 0;
    for (const s of DISTRIBUTION_DEEP_SEED.surfaces) {
      const { rowCount } = await pool.query(
        `INSERT INTO dist_listings (surface_id, status, updated_by)
         VALUES ($1, 'not_started', 'seed')
         ON CONFLICT (surface_id) DO NOTHING`,
        [s.id],
      );
      n += rowCount ?? 0;
    }
    return { listings: n };
  } catch (err) {
    if ((err as { code?: string }).code === '42P01') return null; // pre-0043
    throw err;
  }
}
