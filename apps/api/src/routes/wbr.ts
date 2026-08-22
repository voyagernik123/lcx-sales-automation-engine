/**
 * Weekly Business Review (Phase 4.1). Reads the report the `wbr` job composes
 * and persists every Monday; falls back to composing live when none is stored
 * yet, so the surface is never empty. Regeneration is done through the standard
 * job trigger (POST /v1/intel/jobs/wbr), keeping one governed path per job.
 */
import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import { getLatestWbr, getWbrForWeek, listWbrWeeks, weekStartOf } from '../kpi/wbr.js';
import { gpsWbrDisposition } from '../gps/wbrBlock.js';

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

export const wbrRoutes = new Hono<{ Variables: AuthVariables }>();

/** GET /v1/wbr — latest stored review (or a live one if none stored) + the weeks available. */
wbrRoutes.get('/', requireOperator, async (c) => {
  try {
    const week = c.req.query('week');
    const pool = getPool();
    const loaded = week ? await getWbrForWeek(pool, week) : await getLatestWbr(pool);
    if (!loaded) return c.json({ error: 'No review for that week', code: 'NOT_FOUND' }, 404);
    const weeks = await listWbrWeeks(pool);

    /*
     * ── THE GLOBAL SERVICES LIMB IS COMPOSED HERE, NEVER READ FROM THE PAYLOAD ──
     *
     * `gps` is a different grant from `governance`: holding this review says nothing
     * about holding the services compartment (`legacy: false`, `machineAccess: false`).
     * `getWbrForWeek` returns raw jsonb cast to `WbrReport`, so ANY payload that ever
     * acquired a `gps` key — a hand-run insert, a restored dump, a future code path —
     * would be served to an unentitled reader. So the key is STRIPPED off whatever was
     * loaded, unconditionally, and then re-derived for this reader only.
     *
     * The Monday cron never writes it: `composeWbr`/`writeWbr` are deliberately left
     * gps-free, because the machine principal that persists that row is not entitled to
     * the compartment it would be persisting.
     */
    const { gps: _discardedFromPayload, ...report } = loaded as typeof loaded & { gps?: unknown };
    const operator = c.get('operator');
    const disposition = await gpsWbrDisposition(pool, {
      operatorId: operator?.id ?? null,
      reportWeekStart: report.weekStart,
      currentWeekStart: weekStartOf(new Date()),
    });

    return c.json({
      data: {
        report: disposition.state === 'included' ? { ...report, gps: disposition.block } : report,
        /* The disposition travels ALWAYS, so a withheld limb is a visible redaction with
           its reason rather than a section the reader never learns existed. */
        gpsDisposition: disposition,
        weeks,
      },
      meta: meta(),
    });
  } catch (err) {
    console.error('[wbr] load error:', err);
    return c.json({ error: 'Failed to load WBR', code: 'WBR_ERROR' }, 500);
  }
});
