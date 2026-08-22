import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import {
  decideDossier,
  draftOutreach,
  generateDossier,
  isDossierMigrated,
  isOutreachChannel,
  listDossiers,
  listOutreachDrafts,
} from '../gps/dossier.js';

/**
 * GLOBAL SERVICES — DOSSIERS & OUTREACH (G2).
 *
 *   GET  /dossiers?targetId=…         dossiers + outreach drafts for one target
 *   POST /dossiers/generate           model drafts, validator admits or refuses
 *   POST /dossiers/:id/decide         accept/reject — a named human, once
 *   POST /dossiers/outreach           draft outreach, judged by the outbound gate
 *
 * Mounted inside `gpsRoutes` at '/dossiers' — the compartment gate is the floor,
 * same wiring as /packets and /demand.
 *
 * ── WHAT A REFUSAL LOOKS LIKE HERE ───────────────────────────────────────────
 * Three different "no"s, never collapsed: AI_NO_PROVIDER / AI_PROVIDER_ERROR /
 * AI_MODEL_REFUSED are 503/502/502 with `ai/llm.ts`'s own sentence and rule;
 * DOSSIER_INVALID and OUTREACH_INVALID are 422 with the full defect list AND the
 * rejected text, because an operator told "it failed" with no evidence retries
 * blind. Nothing defective is stored on any of these paths.
 *
 * ── THERE IS NO SEND ROUTE ───────────────────────────────────────────────────
 * Outreach drafts come back with the gate's verdict and live in a table with no
 * recipient column. Sending is a human act outside this system; the day this file
 * grows a /send route is the day the one-mouth rule died in a diff.
 */

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

const NOT_MIGRATED = {
  error: 'The dossier register does not exist on this environment. Apply 0078_gps_dossier.sql.',
  code: 'DOSSIER_REGISTER_ABSENT',
} as const;

const aiStatus = (code: string): 502 | 503 => (code === 'AI_NO_PROVIDER' ? 503 : 502);

export const gpsDossierRoutes = new Hono<{ Variables: AuthVariables }>();

gpsDossierRoutes.get('/', requireOperator, async (c) => {
  try {
    const targetId = c.req.query('targetId') ?? '';
    if (targetId.trim() === '') {
      return c.json({ error: 'targetId is required', code: 'VALIDATION' }, 400);
    }
    const pool = getPool();
    const present = await isDossierMigrated(pool);
    if (present !== true) {
      return c.json({
        data: { dossiers: [], outreachDrafts: [], registerPresent: present },
        meta: { ...meta(), migrated: false },
      });
    }
    const [dossiers, outreachDrafts] = await Promise.all([
      listDossiers(pool, targetId),
      listOutreachDrafts(pool, targetId),
    ]);
    return c.json({
      data: { dossiers, outreachDrafts, registerPresent: true },
      meta: { ...meta(), migrated: true },
    });
  } catch (err) {
    console.error('[gps] dossier list error:', err);
    return c.json({ error: 'Failed to load dossiers', code: 'GPS_ERROR' }, 500);
  }
});

gpsDossierRoutes.post('/generate', requireOperator, async (c) => {
  try {
    let targetId = '';
    try {
      const parsed = await c.req.json();
      targetId = typeof parsed?.targetId === 'string' ? parsed.targetId.trim().slice(0, 80) : '';
    } catch { /* refused below as blank */ }
    if (targetId === '') return c.json({ error: 'targetId is required', code: 'VALIDATION' }, 400);

    const pool = getPool();
    if ((await isDossierMigrated(pool)) !== true) return c.json(NOT_MIGRATED, 503);

    const operator = c.get('operator');
    const out = await generateDossier(pool, targetId, operator?.id ?? 'unknown');
    if (!out.ok) {
      if (out.code === 'NOT_FOUND') return c.json({ error: out.detail, code: out.code }, 404);
      if (out.code === 'DOSSIER_INVALID') {
        return c.json(
          { error: out.detail, code: out.code, defects: out.defects, rejectedText: out.rejectedText },
          422,
        );
      }
      return c.json({ error: out.detail, code: out.code, rule: out.rule }, aiStatus(out.code));
    }
    return c.json({ data: { dossier: out.dossier }, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] dossier generate error:', err);
    return c.json({ error: 'Generation failed — nothing was stored', code: 'GPS_ERROR' }, 500);
  }
});

gpsDossierRoutes.post('/:id/decide', requireOperator, async (c) => {
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
    if (decision !== 'accepted' && decision !== 'rejected') {
      return c.json({ error: 'decision must be accepted or rejected', code: 'VALIDATION' }, 400);
    }
    if (decision === 'rejected' && note === null) {
      return c.json({
        error: 'a rejection carries its reason — the register CHECK refuses it without one',
        code: 'VALIDATION',
      }, 400);
    }

    const pool = getPool();
    if ((await isDossierMigrated(pool)) !== true) return c.json(NOT_MIGRATED, 503);

    const operator = c.get('operator');
    const out = await decideDossier(pool, id, decision, operator?.id ?? 'unknown', note);
    if (!out.ok) return c.json({ error: out.detail, code: out.code }, out.code === 'NOT_FOUND' ? 404 : 409);
    return c.json({ data: { dossier: out.dossier }, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] dossier decide error:', err);
    return c.json({ error: 'Decision failed — nothing was recorded', code: 'GPS_ERROR' }, 500);
  }
});

gpsDossierRoutes.post('/outreach', requireOperator, async (c) => {
  try {
    let targetId = '';
    let channel: unknown = null;
    try {
      const parsed = await c.req.json();
      targetId = typeof parsed?.targetId === 'string' ? parsed.targetId.trim().slice(0, 80) : '';
      channel = parsed?.channel;
    } catch { /* refused below */ }
    if (targetId === '') return c.json({ error: 'targetId is required', code: 'VALIDATION' }, 400);
    if (!isOutreachChannel(channel)) {
      return c.json({ error: 'channel must be one of email, telegram, linkedin, x_public', code: 'VALIDATION' }, 400);
    }

    const pool = getPool();
    if ((await isDossierMigrated(pool)) !== true) return c.json(NOT_MIGRATED, 503);

    const operator = c.get('operator');
    const out = await draftOutreach(pool, targetId, channel, operator?.id ?? 'unknown');
    if (!out.ok) {
      if (out.code === 'NOT_FOUND') return c.json({ error: out.detail, code: out.code }, 404);
      if (out.code === 'OUTREACH_INVALID') {
        return c.json(
          { error: out.detail, code: out.code, defects: out.defects, rejectedText: out.rejectedText },
          422,
        );
      }
      return c.json({ error: out.detail, code: out.code, rule: out.rule }, aiStatus(out.code));
    }
    /*
     * The verdict is copied field by field in the service (`safeVerdict`) — the
     * response never spreads the raw gate object, so `ledgerOnly` cannot leak here.
     */
    return c.json({
      data: { draft: out.draft, verdict: out.verdict, ledgerRecorded: out.ledgerRecorded },
      meta: { ...meta(), migrated: true },
    });
  } catch (err) {
    console.error('[gps] outreach draft error:', err);
    return c.json({ error: 'Drafting failed — nothing was stored', code: 'GPS_ERROR' }, 500);
  }
});
