/**
 * Decision log (Palantir-grade Phase 4.2) — the institution's memory of its own
 * consequential calls. Every entry is a structured memo: context, options
 * considered, the decision, the rationale, an owner, and a review-by date. The
 * outcome is filled in at review, so "why did we pass on X?" and "did that call
 * work out?" both have answers six months on.
 *
 * Entries are created three ways: by hand here, automatically when a deal closes
 * past `negotiating` (deals.ts writes one inside the close transaction), and by
 * any future capture point that calls createDecision. Review-by reminders surface
 * in the notification bell (notifications/service.ts).
 */
import { Hono } from 'hono';
import type pg from 'pg';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

interface DecisionInput {
  title: string;
  context?: string;
  optionsConsidered?: string;
  decision?: string;
  rationale?: string;
  owner: string;
  subjectType?: string | null;
  subjectId?: string | null;
  reviewBy?: string | null; // YYYY-MM-DD
  source?: string;
}

/**
 * Shared insert used by both the HTTP route and server-side capture points
 * (deal close). Accepts a tx/pool so a capture can enlist in the caller's
 * transaction and commit atomically with the state change it records.
 */
export async function createDecision(
  db: pg.Pool | pg.PoolClient,
  input: DecisionInput,
): Promise<string> {
  const reviewBy = input.reviewBy && /^\d{4}-\d{2}-\d{2}$/.test(input.reviewBy) ? input.reviewBy : null;
  const { rows } = await db.query(
    `INSERT INTO decisions (title, context, options_considered, decision, rationale, owner, subject_type, subject_id, review_by, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [
      input.title.slice(0, 200),
      (input.context ?? '').slice(0, 4000),
      (input.optionsConsidered ?? '').slice(0, 4000),
      (input.decision ?? '').slice(0, 2000),
      (input.rationale ?? '').slice(0, 4000),
      input.owner,
      input.subjectType ?? null,
      input.subjectId ?? null,
      reviewBy,
      input.source ?? 'manual',
    ],
  );
  return rows[0].id as string;
}

const rowToDecision = (r: Record<string, unknown>) => ({
  id: r.id, title: r.title, context: r.context, optionsConsidered: r.options_considered,
  decision: r.decision, rationale: r.rationale, owner: r.owner,
  subjectType: r.subject_type, subjectId: r.subject_id,
  reviewBy: r.review_by ? String(r.review_by).slice(0, 10) : null,
  outcome: r.outcome, outcomeAt: r.outcome_at, source: r.source,
  createdAt: r.created_at, updatedAt: r.updated_at,
});

export const decisionRoutes = new Hono<{ Variables: AuthVariables }>();

/** GET /v1/decisions?owner=&subjectType=&subjectId=&reviewDue=1&limit= */
decisionRoutes.get('/', requireOperator, async (c) => {
  try {
    const owner = c.req.query('owner');
    const subjectType = c.req.query('subjectType');
    const subjectId = c.req.query('subjectId');
    const reviewDue = c.req.query('reviewDue') === '1';
    const limit = Math.min(Math.max(Number(c.req.query('limit')) || 100, 1), 300);

    const where: string[] = []; const params: unknown[] = []; let i = 1;
    if (owner) { where.push(`owner = $${i++}`); params.push(owner); }
    if (subjectType) { where.push(`subject_type = $${i++}`); params.push(subjectType); }
    if (subjectId) { where.push(`subject_id = $${i++}`); params.push(subjectId); }
    if (reviewDue) { where.push(`review_by IS NOT NULL AND review_by <= CURRENT_DATE AND outcome IS NULL`); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit);

    const { rows } = await getPool().query(
      `SELECT id, title, context, options_considered, decision, rationale, owner, subject_type, subject_id,
              review_by, outcome, outcome_at, source, created_at, updated_at
         FROM decisions ${clause}
        ORDER BY (outcome IS NULL) DESC, created_at DESC
        LIMIT $${i}`,
      params,
    );
    return c.json({ data: rows.map(rowToDecision), meta: meta() });
  } catch (err) {
    console.error('[decisions] list error:', err);
    return c.json({ error: 'Failed to list decisions', code: 'DECISION_ERROR' }, 500);
  }
});

decisionRoutes.post('/', requireOperator, async (c) => {
  const owner = c.get('operator').id;
  const body = await c.req.json<Partial<DecisionInput>>().catch(() => ({} as Partial<DecisionInput>));
  if (!body.title?.trim()) return c.json({ error: 'title required', code: 'VALIDATION' }, 400);
  try {
    const id = await createDecision(getPool(), {
      title: body.title.trim(),
      context: body.context, optionsConsidered: body.optionsConsidered,
      decision: body.decision, rationale: body.rationale,
      owner: body.owner?.trim() || owner,
      subjectType: body.subjectType ?? null, subjectId: body.subjectId ?? null,
      reviewBy: body.reviewBy ?? null, source: 'manual',
    });
    return c.json({ data: { id }, meta: meta() }, 201);
  } catch (err) {
    console.error('[decisions] create error:', err);
    return c.json({ error: 'Failed to create decision', code: 'DECISION_ERROR' }, 500);
  }
});

decisionRoutes.patch('/:id', requireOperator, async (c) => {
  const body = await c.req.json<Partial<DecisionInput> & { outcome?: string }>().catch(() => ({} as Partial<DecisionInput> & { outcome?: string }));
  const sets: string[] = []; const params: unknown[] = []; let i = 1;
  const set = (col: string, val: unknown) => { sets.push(`${col}=$${i++}`); params.push(val); };
  if (body.title !== undefined) set('title', String(body.title).slice(0, 200));
  if (body.context !== undefined) set('context', String(body.context).slice(0, 4000));
  if (body.optionsConsidered !== undefined) set('options_considered', String(body.optionsConsidered).slice(0, 4000));
  if (body.decision !== undefined) set('decision', String(body.decision).slice(0, 2000));
  if (body.rationale !== undefined) set('rationale', String(body.rationale).slice(0, 4000));
  if (body.owner !== undefined) set('owner', String(body.owner));
  if (body.reviewBy !== undefined) {
    const rb = body.reviewBy && /^\d{4}-\d{2}-\d{2}$/.test(body.reviewBy) ? body.reviewBy : null;
    set('review_by', rb);
  }
  if (body.outcome !== undefined) {
    // Recording an outcome closes the review loop and stamps the time.
    set('outcome', body.outcome ? String(body.outcome).slice(0, 4000) : null);
    sets.push(`outcome_at=${body.outcome ? 'now()' : 'NULL'}`);
  }
  if (sets.length === 0) return c.json({ error: 'Nothing to update', code: 'VALIDATION' }, 400);
  sets.push(`updated_at=now()`); params.push(c.req.param('id'));
  try {
    const { rowCount } = await getPool().query(`UPDATE decisions SET ${sets.join(', ')} WHERE id=$${i}`, params);
    return (rowCount ?? 0) > 0 ? c.json({ data: { updated: true }, meta: meta() }) : c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
  } catch (err) {
    console.error('[decisions] update error:', err);
    return c.json({ error: 'Failed to update decision', code: 'DECISION_ERROR' }, 500);
  }
});

decisionRoutes.delete('/:id', requireOperator, async (c) => {
  const owner = c.get('operator').id;
  try {
    const { rowCount } = await getPool().query(
      `DELETE FROM decisions WHERE id=$1 AND (owner=$2 OR $2='operator')`, [c.req.param('id'), owner],
    );
    return (rowCount ?? 0) > 0 ? c.json({ data: { deleted: true }, meta: meta() }) : c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
  } catch (err) {
    console.error('[decisions] delete error:', err);
    return c.json({ error: 'Failed to delete decision', code: 'DECISION_ERROR' }, 500);
  }
});
