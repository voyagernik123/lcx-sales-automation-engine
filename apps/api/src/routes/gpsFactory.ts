import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import {
  collectSlotState,
  composeHandoverPacket,
  generateDraft,
  isFactoryMigrated,
  isFactoryStage,
  listDrafts,
  listStageActuals,
  qaDecide,
  recordStageActual,
} from '../gps/factory.js';

/**
 * GLOBAL SERVICES — THE DELIVERY FACTORY (G5).
 *
 *   GET  /factory/engagements/:id           slot state, drafts, actuals, handover packet
 *   POST /factory/engagements/:id/draft     Stage 1: generate (refuses over gaps — D10)
 *   POST /factory/drafts/:id/qa             Stage 2: accept (marks the deliverable
 *                                           reviewed via the desk's own gate) or rework
 *   POST /factory/engagements/:id/actuals   effort truth: hours + cost per stage
 *
 * Mounted inside `gpsRoutes` at '/factory' — same wiring as /packets, /demand,
 * /dossiers. The handover packet is COMPOSED ON READ and never stored or sent:
 * it is a view over registered facts, and printing or carrying it is a human act.
 */

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

const NOT_MIGRATED = {
  error: 'The factory register does not exist on this environment. Apply 0081_gps_factory.sql.',
  code: 'FACTORY_REGISTER_ABSENT',
} as const;

const aiStatus = (code: string): 502 | 503 => (code === 'AI_NO_PROVIDER' ? 503 : 502);

export const gpsFactoryRoutes = new Hono<{ Variables: AuthVariables }>();

gpsFactoryRoutes.get('/engagements/:id', requireOperator, async (c) => {
  try {
    const engagementId = c.req.param('id');
    const pool = getPool();
    const present = await isFactoryMigrated(pool);
    const state = await collectSlotState(pool, engagementId);
    if (state === null) return c.json({ error: `no engagement ${engagementId}`, code: 'NOT_FOUND' }, 404);
    if (present !== true) {
      /* The slot state is readable pre-migration (it reads engagement + portal
         tables); the drafts and actuals are not. Say which is which. */
      return c.json({
        data: {
          registerPresent: present,
          slotState: state,
          drafts: [],
          actuals: [],
          handover: null,
        },
        meta: { ...meta(), migrated: false },
      });
    }
    const [drafts, actuals, handover] = await Promise.all([
      listDrafts(pool, engagementId),
      listStageActuals(pool, engagementId),
      composeHandoverPacket(pool, engagementId),
    ]);
    return c.json({
      data: { registerPresent: true, slotState: state, drafts, actuals, handover },
      meta: { ...meta(), migrated: true },
    });
  } catch (err) {
    console.error('[gps] factory read error:', err);
    return c.json({ error: 'Failed to load the factory view', code: 'GPS_ERROR' }, 500);
  }
});

gpsFactoryRoutes.post('/engagements/:id/draft', requireOperator, async (c) => {
  try {
    let deliverableId: string | null = null;
    try {
      const parsed = await c.req.json();
      deliverableId = typeof parsed?.deliverableId === 'string' && parsed.deliverableId.trim() !== ''
        ? parsed.deliverableId.trim().slice(0, 80)
        : null;
    } catch { /* a bare generate is fine */ }
    const pool = getPool();
    if ((await isFactoryMigrated(pool)) !== true) return c.json(NOT_MIGRATED, 503);

    const operator = c.get('operator');
    const out = await generateDraft(pool, c.req.param('id'), deliverableId, operator?.id ?? 'unknown');
    if (!out.ok) {
      if (out.code === 'NOT_FOUND') return c.json({ error: out.detail, code: out.code }, 404);
      if (out.code === 'SLOTS_MISSING') {
        /* 409, not 400: the request is well-formed; the ENGAGEMENT is not ready.
           The gap list is the payload — it is the chase list, verbatim. */
        return c.json({ error: out.detail, code: out.code, gaps: out.gaps }, 409);
      }
      if (out.code === 'DRAFT_INVALID') {
        return c.json({ error: out.detail, code: out.code, defects: out.defects, rejectedText: out.rejectedText }, 422);
      }
      return c.json({ error: out.detail, code: out.code, rule: out.rule }, aiStatus(out.code));
    }
    return c.json({ data: { draft: out.draft }, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] factory draft error:', err);
    return c.json({ error: 'Generation failed — nothing was stored', code: 'GPS_ERROR' }, 500);
  }
});

gpsFactoryRoutes.post('/drafts/:id/qa', requireOperator, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id < 1) return c.json({ error: 'id must be a positive integer', code: 'VALIDATION' }, 400);
    let decision = '';
    let note: string | null = null;
    try {
      const parsed = await c.req.json();
      decision = typeof parsed?.decision === 'string' ? parsed.decision : '';
      note = typeof parsed?.note === 'string' && parsed.note.trim() !== '' ? parsed.note.trim().slice(0, 500) : null;
    } catch { /* refused below */ }
    if (decision !== 'accepted' && decision !== 'rework') {
      return c.json({ error: 'decision must be accepted or rework', code: 'VALIDATION' }, 400);
    }
    if (decision === 'rework' && note === null) {
      return c.json({
        error: 'rework carries its why — a bounced draft with no note teaches the next version nothing (the register CHECK refuses it too)',
        code: 'VALIDATION',
      }, 400);
    }
    const pool = getPool();
    if ((await isFactoryMigrated(pool)) !== true) return c.json(NOT_MIGRATED, 503);

    const operator = c.get('operator');
    const out = await qaDecide(pool, id, decision, operator?.id ?? 'unknown', note);
    if (!out.ok) return c.json({ error: out.detail, code: out.code }, out.code === 'NOT_FOUND' ? 404 : 409);
    return c.json({
      data: { draft: out.draft, reviewRecorded: out.reviewRecorded, reviewDetail: out.reviewDetail },
      meta: { ...meta(), migrated: true },
    });
  } catch (err) {
    console.error('[gps] factory qa error:', err);
    return c.json({ error: 'Decision failed — nothing was recorded', code: 'GPS_ERROR' }, 500);
  }
});

gpsFactoryRoutes.post('/engagements/:id/actuals', requireOperator, async (c) => {
  try {
    let stage: unknown = null;
    let hours = Number.NaN;
    let costCents = 0;
    let note: string | null = null;
    try {
      const parsed = await c.req.json();
      stage = parsed?.stage;
      hours = typeof parsed?.hours === 'number' ? parsed.hours : Number.NaN;
      costCents = typeof parsed?.costCents === 'number' && Number.isInteger(parsed.costCents) && parsed.costCents >= 0
        ? parsed.costCents : 0;
      note = typeof parsed?.note === 'string' && parsed.note.trim() !== '' ? parsed.note.trim().slice(0, 500) : null;
    } catch { /* refused below */ }
    if (!isFactoryStage(stage)) {
      return c.json({ error: 'stage must be ai_draft, internal_qa or partner', code: 'VALIDATION' }, 400);
    }
    if (!Number.isFinite(hours) || hours < 0 || hours > 2000) {
      return c.json({ error: 'hours must be a number in [0, 2000]', code: 'VALIDATION' }, 400);
    }
    const pool = getPool();
    if ((await isFactoryMigrated(pool)) !== true) return c.json(NOT_MIGRATED, 503);

    const operator = c.get('operator');
    const actual = await recordStageActual(pool, {
      engagementId: c.req.param('id'),
      stage,
      hours,
      costCents,
      note,
      recordedBy: operator?.id ?? 'unknown',
    });
    return c.json({ data: { actual }, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] factory actuals error:', err);
    return c.json({ error: 'Recording failed', code: 'GPS_ERROR' }, 500);
  }
});
