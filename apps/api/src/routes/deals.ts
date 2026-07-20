import { Hono } from 'hono';
import { sql, desc } from 'drizzle-orm';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';
import { env } from '../lib/env.js';
import { randomUUID } from 'node:crypto';
import { STAGES, canTransition, generateProposal, defaultPackageValue, getClaimLibrarySnapshot } from '@lcx/shared';
import type { DealStage } from '@lcx/shared';
import { createPostListingTriggers } from '../kpi/service.js';
import { createStageTask } from '../tasks/service.js';
import { createLaunchpadTasks } from '../tasks/launchpad.js';
import { notify } from '../notifications/service.js';
import { isUndefinedColumn } from '../lib/pg.js';

export const dealRoutes = new Hono<{ Variables: AuthVariables }>();

/** Valid deal-playbook step codes (Terms, KYB, Legal, Contract, Onboarding). */
const PLAYBOOK_STEPS = ['T', 'K', 'L', 'C', 'O'] as const;

/**
 * GET /v1/deals/:id/playbook — completed playbook steps for a deal.
 * Reads deals.playbook->'done' (migration 0028). When the column is missing
 * (production lagging the migration) degrades to 200 { done: [], persisted: false }.
 */
dealRoutes.get('/:id/playbook', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();

  try {
    const result = await db.execute(sql`SELECT playbook FROM deals WHERE id = ${id}`);
    if (!result.rows || result.rows.length === 0) {
      return c.json({ error: 'Deal not found', code: 'NOT_FOUND' }, 404);
    }
    const playbook = ((result.rows[0] as Record<string, unknown>).playbook ?? {}) as { done?: unknown };
    const done = Array.isArray(playbook.done)
      ? playbook.done.filter((s): s is string => typeof s === 'string')
      : [];
    return c.json({ data: { done }, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    if (isUndefinedColumn(err)) {
      return c.json({ data: { done: [], persisted: false }, meta: { timestamp: new Date().toISOString(), version: env.version } });
    }
    throw err; // onError maps pg codes (bad UUID → 400 etc.)
  }
});

/**
 * PATCH /v1/deals/:id/playbook — set completed playbook steps.
 * Body: { done: string[] } — subset of T/K/L/C/O. When the playbook column is
 * missing → 409 PLAYBOOK_UNAVAILABLE (nothing to persist to).
 */
dealRoutes.patch('/:id/playbook', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();
  const operator = c.get('operator');
  const body = await c.req.json<{ done?: unknown }>().catch(() => ({} as { done?: unknown }));

  if (!Array.isArray(body.done) || body.done.some((s) => typeof s !== 'string')) {
    return c.json({ error: 'done must be an array of step codes', code: 'VALIDATION' }, 400);
  }
  const done = Array.from(new Set(body.done as string[]));
  const invalid = done.filter((s) => !(PLAYBOOK_STEPS as readonly string[]).includes(s));
  if (invalid.length > 0) {
    return c.json({
      error: `Invalid step code(s): ${invalid.join(', ')} — allowed: ${PLAYBOOK_STEPS.join(', ')}`,
      code: 'VALIDATION',
    }, 400);
  }

  try {
    const result = await db.execute(sql`
      UPDATE deals
      SET playbook = COALESCE(playbook, '{}'::jsonb) || jsonb_build_object('done', ${JSON.stringify(done)}::jsonb)
      WHERE id = ${id}
      RETURNING id
    `);
    if (!result.rows || result.rows.length === 0) {
      return c.json({ error: 'Deal not found', code: 'NOT_FOUND' }, 404);
    }

    await db.insert(schema.auditLog).values({
      id: randomUUID(), actor: operator.id, action: 'deal_playbook_updated', entity: 'deals', entityId: id,
      meta: { done },
    }).execute();

    return c.json({ data: { done }, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    if (isUndefinedColumn(err)) {
      return c.json({ error: 'Playbook column not available yet', code: 'PLAYBOOK_UNAVAILABLE' }, 409);
    }
    throw err; // onError maps pg codes (bad UUID → 400 etc.)
  }
});


/** GET /v1/deals/board — every deal with project context, for the kanban board. */
dealRoutes.get('/board', requireOperator, async (c) => {
  const db = getDb();
  try {
    const result = await db.execute(sql`
      SELECT d.id, d.project_id, d.stage, d.package_type, d.package_value,
             d.owner, d.notes, d.updated_at, d.created_at, d.won_at,
             p.name AS project_name, p.ticker AS project_ticker,
             s.band, s.priority_score,
             EXTRACT(EPOCH FROM (NOW() - d.updated_at)) / 86400 AS days_since_update
      FROM deals d
      JOIN projects p ON p.id = d.project_id
      LEFT JOIN scores s ON s.project_id = d.project_id
      ORDER BY d.updated_at DESC
    `);
    return c.json({
      data: (result.rows ?? []).map((r: Record<string, unknown>) => ({
        id: r.id,
        projectId: r.project_id,
        projectName: r.project_name,
        projectTicker: r.project_ticker,
        stage: r.stage,
        packageType: r.package_type,
        packageValue: r.package_value != null ? Number(r.package_value) : null,
        owner: r.owner,
        band: r.band ?? 'unscored',
        priorityScore: Number(r.priority_score ?? 0),
        daysSinceUpdate: Math.floor(Number(r.days_since_update ?? 0)),
        updatedAt: r.updated_at,
        wonAt: r.won_at,
      })),
      meta: { timestamp: new Date().toISOString(), version: env.version },
    });
  } catch (err) {
    console.error('[deals] board error:', err);
    return c.json({ error: 'Failed to load board', code: 'BOARD_ERROR' }, 500);
  }
});

dealRoutes.get('/projects/:projectId', requireOperator, async (c) => {
  const db = getDb();
  const { projectId } = c.req.param();
  try {
    const [deal] = await db.select().from(schema.deals).where(sql`${schema.deals.projectId} = ${projectId}`).limit(1).execute();
    if (!deal) return c.json({ data: null, meta: { timestamp: new Date().toISOString(), version: env.version } });
    return c.json({ data: deal, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[deals] get error:', err);
    return c.json({ error: 'Failed to get deal', code: 'DEAL_GET_ERROR' }, 500);
  }
});

dealRoutes.post('/projects/:projectId', requireOperator, async (c) => {
  const db = getDb();
  const { projectId } = c.req.param();
  const body = await c.req.json<{ packageType?: string; packageValue?: number }>();
  const pkgType = body.packageType ?? 'listing';
  const pkgValue = body.packageValue ?? defaultPackageValue(pkgType);

  if (body.packageValue !== undefined &&
      (typeof body.packageValue !== 'number' || !Number.isFinite(body.packageValue) || body.packageValue < 0)) {
    return c.json({ error: 'packageValue must be a non-negative number', code: 'VALIDATION' }, 400);
  }

  try {
    const [existing] = await db.select().from(schema.deals).where(sql`${schema.deals.projectId} = ${projectId}`).limit(1).execute();
    if (existing) return c.json({ error: 'Deal already exists', code: 'DEAL_EXISTS' }, 409);

    // Deal row + its creation event commit together (or not at all) — no deal
    // without its opening history entry.
    const [deal] = await db.transaction(async (tx) => {
      const rows = await tx.insert(schema.deals).values({
        id: randomUUID(), projectId, stage: 'not_started', packageType: pkgType, packageValue: pkgValue,
      }).returning().execute();
      await tx.insert(schema.dealEvents).values({
        id: randomUUID(), dealId: rows[0].id, eventType: 'stage_change', actor: 'system', newStage: 'not_started', content: 'Deal created',
      }).execute();
      return rows;
    });

    return c.json({ data: deal, meta: { timestamp: new Date().toISOString(), version: env.version } }, 201);
  } catch (err) {
    console.error('[deals] create error:', err);
    return c.json({ error: 'Failed to create deal', code: 'DEAL_CREATE_ERROR' }, 500);
  }
});

dealRoutes.patch('/:id', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();
  const body = await c.req.json<{ packageType?: string; packageValue?: number; notes?: string; owner?: string }>();

  try {
    const [deal] = await db.select().from(schema.deals).where(sql`${schema.deals.id} = ${id}`).limit(1).execute();
    if (!deal) return c.json({ error: 'Deal not found', code: 'NOT_FOUND' }, 404);

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (body.packageType) update.packageType = body.packageType;
    if (body.packageValue !== undefined) {
      // Money is integer cents — never trust the client's clamp. Reject
      // NaN / negative / non-integer / absurd values rather than corrupt it.
      const v = body.packageValue;
      if (!Number.isFinite(v) || v < 0 || !Number.isInteger(v) || v > 1_000_000_000_00) {
        return c.json({ error: 'packageValue must be a non-negative integer (cents)', code: 'INVALID_VALUE' }, 400);
      }
      update.packageValue = v;
    }
    if (body.notes !== undefined) update.notes = body.notes;
    if (body.owner) update.owner = body.owner;

    const [updated] = await db.update(schema.deals).set(update).where(sql`${schema.deals.id} = ${id}`).returning().execute();

    return c.json({ data: updated, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[deals] update error:', err);
    return c.json({ error: 'Failed to update deal', code: 'DEAL_UPDATE_ERROR' }, 500);
  }
});

dealRoutes.post('/:id/stage', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();
  const operator = c.get('operator');
  const body = await c.req.json<{ stage: DealStage; winReason?: string; lossReason?: string; lossCategory?: string }>();
  const newStage = body.stage;

  if (!STAGES.includes(newStage)) return c.json({ error: `Invalid stage: ${newStage}`, code: 'INVALID_STAGE' }, 400);

  try {
    const [deal] = await db.select().from(schema.deals).where(sql`${schema.deals.id} = ${id}`).limit(1).execute();
    if (!deal) return c.json({ error: 'Deal not found', code: 'NOT_FOUND' }, 404);

    const oldStage = deal.stage as DealStage;
    if (!canTransition(oldStage, newStage)) {
      return c.json({ error: `Cannot transition from ${oldStage} to ${newStage}`, code: 'INVALID_TRANSITION' }, 400);
    }

    // Win/loss reason required on close
    if (newStage === 'won' && !body.winReason?.trim()) return c.json({ error: 'Win reason required', code: 'MISSING_REASON' }, 400);
    if (newStage === 'lost' && !body.lossReason?.trim()) return c.json({ error: 'Loss reason required', code: 'MISSING_REASON' }, 400);

    const update: Record<string, unknown> = { stage: newStage, updatedAt: new Date() };
    if (newStage === 'won') {
      update.wonAt = new Date();
      update.winReason = body.winReason;
    }
    if (newStage === 'lost') {
      update.lossReason = body.lossReason;
      update.lossCategory = body.lossCategory ?? null;
    }

    // Core state change is ATOMIC: project flag (won), the deal row, the
    // stage-change event, and the audit entry commit together or not at all —
    // no half-closed deal with a missing history/audit record.
    const [updated] = await db.transaction(async (tx) => {
      if (newStage === 'won') {
        await tx.update(schema.projects).set({ listedOnLcx: true, updatedAt: new Date() }).where(sql`${schema.projects.id} = ${deal.projectId}`).execute();
      }
      const rows = await tx.update(schema.deals).set(update).where(sql`${schema.deals.id} = ${id}`).returning().execute();
      await tx.insert(schema.dealEvents).values({
        id: randomUUID(), dealId: id, eventType: 'stage_change', actor: operator.id,
        oldStage, newStage, content: `${oldStage} → ${newStage}`,
      }).execute();
      await tx.insert(schema.auditLog).values({
        id: randomUUID(), actor: operator.id, action: 'deal_stage_change', entity: 'deals', entityId: id,
        meta: { from: oldStage, to: newStage },
      }).execute();
      return rows;
    });

    // Best-effort side effects run AFTER the commit — a flaky trigger/notify
    // must never roll back a legitimate close, and must only fire once the
    // close is durably persisted.
    if (newStage === 'won') {
      try {
        await createPostListingTriggers(id, deal.projectId, new Date());
      } catch (triggerErr) {
        console.error('[deals] trigger creation error:', triggerErr);
      }
      try {
        await createLaunchpadTasks(id, deal.projectId);
      } catch (launchErr) {
        console.error('[deals] launchpad creation error:', launchErr);
      }
    }

    // Auto next-action task for the new stage (idempotent)
    try {
      await createStageTask(id, deal.projectId, newStage);
    } catch (taskErr) {
      console.error('[deals] stage task error:', taskErr);
    }

    // Live bell update (deduped per deal+stage so replays stay quiet)
    try {
      await notify({
        rule: 'deal_stage_change',
        title: `Deal moved to ${newStage.replace(/_/g, ' ')}`,
        detail: `${oldStage} → ${newStage}`,
        projectId: deal.projectId,
        href: '/deal-board',
        dedupKey: `stage:${id}:${newStage}`,
      });
    } catch (notifyErr) {
      console.error('[deals] stage notify error:', notifyErr);
    }

    // (audit entry is written inside the transaction above)

    return c.json({ data: updated, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[deals] stage error:', err);
    return c.json({ error: 'Failed to update stage', code: 'STAGE_ERROR' }, 500);
  }
});

dealRoutes.post('/:id/proposal', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();
  const operator = c.get('operator');

  try {
    const [deal] = await db.select().from(schema.deals).where(sql`${schema.deals.id} = ${id}`).limit(1).execute();
    if (!deal) return c.json({ error: 'Deal not found', code: 'NOT_FOUND' }, 404);

    const [project] = await db.select().from(schema.projects).where(sql`${schema.projects.id} = ${deal.projectId}`).limit(1).execute();
    if (!project) return c.json({ error: 'Project not found', code: 'NOT_FOUND' }, 404);

    // Get approved claims
    const library = getClaimLibrarySnapshot();
    const approvedClaimTexts = library.claims.filter(c => c.active).map(c => c.text);

    const proposal = generateProposal({
      projectName: project.name,
      projectTicker: project.ticker,
      packageType: deal.packageType ?? 'listing',
      packageValue: deal.packageValue ?? defaultPackageValue(deal.packageType ?? 'listing'),
      jurisdiction: project.jurisdiction,
      claimsUsed: approvedClaimTexts,
    });

    const [updated] = await db.transaction(async (tx) => {
      const rows = await tx.update(schema.deals).set({
        proposalSnapshot: proposal as unknown as Record<string, unknown>,
        proposalGeneratedAt: new Date(),
        updatedAt: new Date(),
      }).where(sql`${schema.deals.id} = ${id}`).returning().execute();
      await tx.insert(schema.dealEvents).values({
        id: randomUUID(), dealId: id, eventType: 'proposal_generated', actor: operator.id,
        content: `Proposal generated — ${deal.packageType ?? 'listing'} / $${((deal.packageValue ?? 0) / 100).toLocaleString()}`,
        meta: { packageType: deal.packageType, packageValue: deal.packageValue },
      }).execute();
      return rows;
    });

    return c.json({ data: updated, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[deals] proposal error:', err);
    return c.json({ error: 'Failed to generate proposal', code: 'PROPOSAL_ERROR' }, 500);
  }
});

dealRoutes.get('/:id/events', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();
  try {
    const rows = await db.select().from(schema.dealEvents).where(sql`${schema.dealEvents.dealId} = ${id}`).orderBy(desc(schema.dealEvents.createdAt)).execute();
    return c.json({ data: rows, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[deals] events error:', err);
    return c.json({ error: 'Failed to load events', code: 'EVENTS_ERROR' }, 500);
  }
});

dealRoutes.get('/:id/objections', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();
  try {
    const rows = await db.select().from(schema.dealObjections).where(sql`${schema.dealObjections.dealId} = ${id}`).orderBy(desc(schema.dealObjections.createdAt)).execute();
    return c.json({ data: rows, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[deals] objections error:', err);
    return c.json({ error: 'Failed to load objections', code: 'OBJECTIONS_ERROR' }, 500);
  }
});

dealRoutes.post('/:id/objections', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();
  const operator = c.get('operator');
  const body = await c.req.json<{ category: string; description: string; severity?: string }>();

  if (!body.category || !body.description?.trim()) {
    return c.json({ error: 'Category and description required', code: 'MISSING_FIELDS' }, 400);
  }

  try {
    const [existing] = await db.select().from(schema.deals).where(sql`${schema.deals.id} = ${id}`).limit(1).execute();
    if (!existing) return c.json({ error: 'Deal not found', code: 'NOT_FOUND' }, 404);

    const [obj] = await db.transaction(async (tx) => {
      const rows = await tx.insert(schema.dealObjections).values({
        id: randomUUID(), dealId: id, category: body.category, description: body.description,
        severity: body.severity ?? 'medium', raisedBy: operator.id,
      }).returning().execute();
      await tx.insert(schema.dealEvents).values({
        id: randomUUID(), dealId: id, eventType: 'objection', actor: operator.id,
        content: `Objection: ${body.category} — ${body.description}`,
        meta: { objectionId: rows[0].id, category: body.category, severity: body.severity },
      }).execute();
      return rows;
    });

    return c.json({ data: obj, meta: { timestamp: new Date().toISOString(), version: env.version } }, 201);
  } catch (err) {
    console.error('[deals] objection create error:', err);
    return c.json({ error: 'Failed to create objection', code: 'OBJECTION_ERROR' }, 500);
  }
});

dealRoutes.patch('/:id/objections/:objId', requireOperator, async (c) => {
  const db = getDb();
  const { id, objId } = c.req.param();
  const operator = c.get('operator');
  const body = await c.req.json<{ resolution?: string }>();

  try {
    const updated = await db.transaction(async (tx) => {
      const rows = await tx.update(schema.dealObjections).set({
        resolved: true, resolution: body.resolution ?? null, resolvedAt: new Date(),
      }).where(sql`${schema.dealObjections.id} = ${objId} AND ${schema.dealObjections.dealId} = ${id}`).returning().execute();
      if (!rows[0]) return null;
      await tx.insert(schema.dealEvents).values({
        id: randomUUID(), dealId: id, eventType: 'note', actor: operator.id,
        content: `Objection resolved: ${rows[0].description}`,
        meta: { objectionId: objId, resolution: body.resolution },
      }).execute();
      return rows[0];
    });

    if (!updated) return c.json({ error: 'Objection not found', code: 'NOT_FOUND' }, 404);

    return c.json({ data: updated, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[deals] objection resolve error:', err);
    return c.json({ error: 'Failed to resolve objection', code: 'OBJECTION_RESOLVE_ERROR' }, 500);
  }
});
