import { Hono } from 'hono';
import { parseTelegramExport } from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import {
  crossfeedRun,
  insertCandidates,
  isDemandMigrated,
  listCandidates,
  promoteCandidate,
  refuseCandidate,
} from '../gps/demand.js';

/**
 * GLOBAL SERVICES — THE DEMAND QUEUE (G1).
 *
 *   GET  /demand                      the queue (status filter optional)
 *   POST /demand/crossfeed/run        scan BD projects/deals into candidates
 *   POST /demand/telegram             parse ONE Telegram Desktop export (JSON body)
 *   POST /demand/:id/promote          candidate → origination target, the front door
 *   POST /demand/:id/refuse           candidate → refused, with the reason recorded
 *
 * Mounted inside `gpsRoutes` at '/demand' — the compartment gate is the floor, same
 * wiring shape as /inputs and /packets.
 *
 * ── THE TELEGRAM BODY IS TYPED TEXT, NOT AN UPLOAD ───────────────────────────
 * The owner exports his own group's history from Telegram Desktop and posts the JSON
 * here. It is his data about his groups — not client-supplied confidential material, so
 * D2 does not gate it — and it is MINIMISED AT THE EDGE by `parseTelegramExport` before
 * anything touches the database: senders dropped and counted, unmatched messages
 * contribute nothing, matched context capped at 200 chars. The response carries the
 * drop-report so the minimisation is inspectable, not asserted. Body cap 2MB: a bigger
 * export is split by the owner, not buffered by the server.
 *
 * ── PROMOTION IS CURATION, NOT A BYPASS ──────────────────────────────────────
 * /promote calls the same `saveTarget` the watchlist's own POST uses, evidence graded
 * from the candidate's provenance. Refusal requires a reason (the table's CHECK makes a
 * reasonless refusal unstorable). Both are one-way: a decided candidate stays decided.
 */

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

const NOT_MIGRATED = {
  error: 'The demand register does not exist on this environment. Apply 0077_gps_demand.sql.',
  code: 'DEMAND_REGISTER_ABSENT',
} as const;

const TELEGRAM_BODY_MAX = 2 * 1024 * 1024;

export const gpsDemandRoutes = new Hono<{ Variables: AuthVariables }>();

gpsDemandRoutes.get('/', requireOperator, async (c) => {
  try {
    const pool = getPool();
    const present = await isDemandMigrated(pool);
    if (present !== true) {
      return c.json({
        data: { candidates: [], registerPresent: present },
        meta: { ...meta(), migrated: false },
      });
    }
    const status = c.req.query('status');
    if (status !== undefined && !['proposed', 'promoted', 'refused'].includes(status)) {
      return c.json({ error: 'status must be proposed, promoted or refused', code: 'VALIDATION' }, 400);
    }
    const candidates = await listCandidates(pool, status);
    return c.json({ data: { candidates, registerPresent: true }, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] demand list error:', err);
    return c.json({ error: 'Failed to load the demand queue', code: 'GPS_ERROR' }, 500);
  }
});

gpsDemandRoutes.post('/crossfeed/run', requireOperator, async (c) => {
  try {
    const pool = getPool();
    if ((await isDemandMigrated(pool)) !== true) return c.json(NOT_MIGRATED, 503);
    const operator = c.get('operator');
    const outcome = await crossfeedRun(pool, new Date().toISOString(), operator?.id ?? 'unknown');
    return c.json({ data: outcome, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] crossfeed error:', err);
    return c.json({ error: 'Crossfeed run failed', code: 'GPS_ERROR' }, 500);
  }
});

gpsDemandRoutes.post('/telegram', requireOperator, async (c) => {
  try {
    /* The size gate reads the HEADER, not the body: `c.req.text()` would buffer the whole
       request before anyone could refuse it, which is exactly what the intake lockout's
       accessor rule exists to prevent (json/param/query/header only, outside the one bounded
       intake router). A lying Content-Length gets this route no further than it gets any
       other json() route in the app — the same platform limits apply to all of them. */
    const declared = Number(c.req.header('content-length') ?? '0');
    if (!Number.isFinite(declared) || declared > TELEGRAM_BODY_MAX) {
      return c.json({
        error: 'Export exceeds 2MB. Split it in Telegram Desktop (export a shorter range) and post the parts.',
        code: 'EXPORT_TOO_LARGE',
      }, 413);
    }
    let parsed: unknown;
    try {
      parsed = await c.req.json();
    } catch {
      return c.json({ error: 'The body is not JSON. Post the result.json Telegram Desktop produced, unmodified.', code: 'VALIDATION' }, 400);
    }
    const pool = getPool();
    if ((await isDemandMigrated(pool)) !== true) return c.json(NOT_MIGRATED, 503);

    const { candidates, report } = parseTelegramExport(parsed, new Date().toISOString());
    const operator = c.get('operator');
    const outcome = await insertCandidates(pool, candidates, operator?.id ?? 'unknown');
    return c.json({
      data: {
        ...outcome,
        /* The minimisation, inspectable: what was seen, what was dropped, what survived.
           A parse that reported only successes would be a scraper with a smaller README. */
        report,
      },
      meta: { ...meta(), migrated: true },
    });
  } catch (err) {
    console.error('[gps] telegram import error:', err);
    return c.json({ error: 'Import failed', code: 'GPS_ERROR' }, 500);
  }
});


gpsDemandRoutes.post('/:id/promote', requireOperator, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id < 1) return c.json({ error: 'id must be a positive integer', code: 'VALIDATION' }, 400);
    const pool = getPool();
    if ((await isDemandMigrated(pool)) !== true) return c.json(NOT_MIGRATED, 503);
    const operator = c.get('operator');
    const out = await promoteCandidate(pool, id, operator?.id ?? 'unknown', Date.now());
    if (!out.ok) {
      return c.json({ error: out.detail, code: out.code }, out.code === 'NOT_FOUND' ? 404 : 409);
    }
    return c.json({ data: { targetId: out.targetId, candidate: out.row }, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] promote error:', err);
    return c.json({ error: 'Promotion failed — nothing was recorded as promoted', code: 'GPS_ERROR' }, 500);
  }
});

gpsDemandRoutes.post('/:id/refuse', requireOperator, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id < 1) return c.json({ error: 'id must be a positive integer', code: 'VALIDATION' }, 400);
    let reason = '';
    try {
      const body = await c.req.json();
      reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
    } catch { /* handled below as blank */ }
    if (!reason) {
      return c.json({
        error: 'reason is required — a refusal that explains nothing teaches the queue nothing (the register CHECK also refuses it).',
        code: 'VALIDATION',
      }, 400);
    }
    const pool = getPool();
    if ((await isDemandMigrated(pool)) !== true) return c.json(NOT_MIGRATED, 503);
    const out = await refuseCandidate(pool, id, reason);
    if (out === 'NOT_FOUND') return c.json({ error: `no candidate ${id}`, code: 'NOT_FOUND' }, 404);
    if (out === 'ALREADY_DECIDED') return c.json({ error: `candidate ${id} is already decided`, code: 'ALREADY_DECIDED' }, 409);
    return c.json({ data: { id, status: 'refused' }, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] refuse error:', err);
    return c.json({ error: 'Refusal failed', code: 'GPS_ERROR' }, 500);
  }
});
