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

export const dealRoutes = new Hono<{ Variables: AuthVariables }>();


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

  try {
    const [existing] = await db.select().from(schema.deals).where(sql`${schema.deals.projectId} = ${projectId}`).limit(1).execute();
    if (existing) return c.json({ error: 'Deal already exists', code: 'DEAL_EXISTS' }, 409);

    const [deal] = await db.insert(schema.deals).values({
      id: randomUUID(), projectId, stage: 'not_started', packageType: pkgType, packageValue: pkgValue,
    }).returning().execute();

    await db.insert(schema.dealEvents).values({
      id: randomUUID(), dealId: deal.id, eventType: 'stage_change', actor: 'system', newStage: 'not_started', content: 'Deal created',
    }).execute();

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
    if (body.packageValue !== undefined) update.packageValue = body.packageValue;
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
      // Update project listed_on_lcx for won deals
      await db.update(schema.projects).set({ listedOnLcx: true, updatedAt: new Date() }).where(sql`${schema.projects.id} = ${deal.projectId}`).execute();
      // Create 30/60/90 post-listing triggers
      try {
        await createPostListingTriggers(id, deal.projectId, new Date());
      } catch (triggerErr) {
        console.error('[deals] trigger creation error:', triggerErr);
      }
      // Generate the department onboarding checklist (listing launchpad)
      try {
        await createLaunchpadTasks(id, deal.projectId);
      } catch (launchErr) {
        console.error('[deals] launchpad creation error:', launchErr);
      }
    }
    if (newStage === 'lost') {
      update.lossReason = body.lossReason;
      update.lossCategory = body.lossCategory ?? null;
    }

    const [updated] = await db.update(schema.deals).set(update).where(sql`${schema.deals.id} = ${id}`).returning().execute();

    await db.insert(schema.dealEvents).values({
      id: randomUUID(), dealId: id, eventType: 'stage_change', actor: operator.id,
      oldStage, newStage, content: `${oldStage} → ${newStage}`,
    }).execute();

    // Auto next-action task for the new stage (idempotent)
    try {
      await createStageTask(id, deal.projectId, newStage);
    } catch (taskErr) {
      console.error('[deals] stage task error:', taskErr);
    }

    await db.insert(schema.auditLog).values({
      id: randomUUID(), actor: operator.id, action: 'deal_stage_change', entity: 'deals', entityId: id,
      meta: { from: oldStage, to: newStage },
    }).execute();

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

    const [updated] = await db.update(schema.deals).set({
      proposalSnapshot: proposal as unknown as Record<string, unknown>,
      proposalGeneratedAt: new Date(),
      updatedAt: new Date(),
    }).where(sql`${schema.deals.id} = ${id}`).returning().execute();

    await db.insert(schema.dealEvents).values({
      id: randomUUID(), dealId: id, eventType: 'proposal_generated', actor: operator.id,
      content: `Proposal generated — ${deal.packageType ?? 'listing'} / $${((deal.packageValue ?? 0) / 100).toLocaleString()}`,
      meta: { packageType: deal.packageType, packageValue: deal.packageValue },
    }).execute();

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

    const [obj] = await db.insert(schema.dealObjections).values({
      id: randomUUID(), dealId: id, category: body.category, description: body.description,
      severity: body.severity ?? 'medium', raisedBy: operator.id,
    }).returning().execute();

    await db.insert(schema.dealEvents).values({
      id: randomUUID(), dealId: id, eventType: 'objection', actor: operator.id,
      content: `Objection: ${body.category} — ${body.description}`,
      meta: { objectionId: obj.id, category: body.category, severity: body.severity },
    }).execute();

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
    const [updated] = await db.update(schema.dealObjections).set({
      resolved: true, resolution: body.resolution ?? null, resolvedAt: new Date(),
    }).where(sql`${schema.dealObjections.id} = ${objId} AND ${schema.dealObjections.dealId} = ${id}`).returning().execute();

    if (!updated) return c.json({ error: 'Objection not found', code: 'NOT_FOUND' }, 404);

    await db.insert(schema.dealEvents).values({
      id: randomUUID(), dealId: id, eventType: 'note', actor: operator.id,
      content: `Objection resolved: ${updated.description}`,
      meta: { objectionId: objId, resolution: body.resolution },
    }).execute();

    return c.json({ data: updated, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[deals] objection resolve error:', err);
    return c.json({ error: 'Failed to resolve objection', code: 'OBJECTION_RESOLVE_ERROR' }, 500);
  }
});
