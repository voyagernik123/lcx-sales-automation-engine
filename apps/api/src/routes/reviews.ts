/**
 * Analytic reviews (Palantir-grade Phase 2.3) — human structured analytic
 * techniques (CIA tradecraft) attached to a deal or project:
 *   • key_assumptions — the Key Assumptions Check
 *   • premortem       — "it's 6 months on and this failed — why?"
 *   • devils_advocate — the contrarian brief (auto-drafted from ACH evidence)
 *
 *   GET    /v1/reviews?subjectType&subjectId   list
 *   POST   /v1/reviews                          create
 *   PATCH  /v1/reviews/:id                      update content/status
 *   DELETE /v1/reviews/:id                      delete (author or shared key)
 *   POST   /v1/reviews/suggest                  prefill a draft (not saved)
 *
 * The premortem gate on high-value deals is enforced in routes/deals.ts, which
 * reads this table.
 */
import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });
const KINDS = ['key_assumptions', 'premortem', 'devils_advocate', 'legal_check'] as const;
type Kind = (typeof KINDS)[number];
// 'command_decision' (100X Phase 4): SATs on program-critical decisions.
const SUBJECTS = ['deal', 'project', 'command_decision', 'dist_campaign'] as const;

export const reviewRoutes = new Hono<{ Variables: AuthVariables }>();

reviewRoutes.get('/', requireOperator, async (c) => {
  const subjectType = c.req.query('subjectType');
  const subjectId = c.req.query('subjectId');
  if (!subjectType || !subjectId) return c.json({ error: 'subjectType and subjectId required', code: 'VALIDATION' }, 400);
  try {
    const { rows } = await getPool().query(
      `SELECT id, kind, subject_type, subject_id, title, content, author, status, created_at, updated_at
       FROM analytic_reviews WHERE subject_type = $1 AND subject_id = $2 ORDER BY created_at DESC`,
      [subjectType, subjectId],
    );
    return c.json({ data: rows.map(mapRow), meta: meta() });
  } catch (err) {
    console.error('[reviews] list error:', err);
    return c.json({ error: 'Failed to list reviews', code: 'REVIEW_ERROR' }, 500);
  }
});

reviewRoutes.post('/', requireOperator, async (c) => {
  const author = c.get('operator').id;
  const body = await c.req.json<{ kind?: string; subjectType?: string; subjectId?: string; title?: string; content?: unknown; status?: string }>()
    .catch(() => ({} as { kind?: string; subjectType?: string; subjectId?: string; title?: string; content?: unknown; status?: string }));
  if (!KINDS.includes(body.kind as Kind)) return c.json({ error: 'Invalid kind', code: 'VALIDATION', kinds: KINDS }, 400);
  if (!SUBJECTS.includes(body.subjectType as (typeof SUBJECTS)[number]) || !body.subjectId) {
    return c.json({ error: 'Invalid subject', code: 'VALIDATION' }, 400);
  }
  const payload = JSON.stringify(body.content ?? {});
  if (payload.length > 200_000) return c.json({ error: 'Content too large', code: 'VALIDATION' }, 413);
  const status = body.status === 'draft' || body.status === 'resolved' ? body.status : 'active';
  try {
    const { rows } = await getPool().query(
      `INSERT INTO analytic_reviews (kind, subject_type, subject_id, title, content, author, status)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING id, created_at, updated_at`,
      [body.kind, body.subjectType, body.subjectId, (body.title ?? '').slice(0, 200), payload, author, status],
    );
    return c.json({ data: { id: rows[0].id, kind: body.kind, author, status, createdAt: rows[0].created_at }, meta: meta() }, 201);
  } catch (err) {
    console.error('[reviews] create error:', err);
    return c.json({ error: 'Failed to create review', code: 'REVIEW_ERROR' }, 500);
  }
});

reviewRoutes.patch('/:id', requireOperator, async (c) => {
  const body = await c.req.json<{ title?: string; content?: unknown; status?: string }>().catch(() => ({} as { title?: string; content?: unknown; status?: string }));
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (body.title !== undefined) { sets.push(`title = $${i++}`); params.push(body.title.slice(0, 200)); }
  if (body.content !== undefined) {
    const payload = JSON.stringify(body.content);
    if (payload.length > 200_000) return c.json({ error: 'Content too large', code: 'VALIDATION' }, 413);
    sets.push(`content = $${i++}::jsonb`); params.push(payload);
  }
  if (body.status && ['draft', 'active', 'resolved'].includes(body.status)) { sets.push(`status = $${i++}`); params.push(body.status); }
  if (sets.length === 0) return c.json({ error: 'Nothing to update', code: 'VALIDATION' }, 400);
  sets.push(`updated_at = now()`);
  params.push(c.req.param('id'));
  try {
    const { rowCount } = await getPool().query(`UPDATE analytic_reviews SET ${sets.join(', ')} WHERE id = $${i}`, params);
    if ((rowCount ?? 0) === 0) return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
    return c.json({ data: { updated: true }, meta: meta() });
  } catch (err) {
    console.error('[reviews] update error:', err);
    return c.json({ error: 'Failed to update review', code: 'REVIEW_ERROR' }, 500);
  }
});

reviewRoutes.delete('/:id', requireOperator, async (c) => {
  const author = c.get('operator').id;
  try {
    const { rowCount } = await getPool().query(
      `DELETE FROM analytic_reviews WHERE id = $1 AND (author = $2 OR $2 = 'operator')`,
      [c.req.param('id'), author],
    );
    if ((rowCount ?? 0) === 0) return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
    return c.json({ data: { deleted: true }, meta: meta() });
  } catch (err) {
    console.error('[reviews] delete error:', err);
    return c.json({ error: 'Failed to delete review', code: 'REVIEW_ERROR' }, 500);
  }
});

/**
 * Suggest a draft (not saved) — removes the blank-page cost. Devil's advocate
 * is grounded in the project's stored ACH evidence that argues AGAINST the
 * leading verdict; the others provide structured prompts.
 */
reviewRoutes.post('/suggest', requireOperator, async (c) => {
  const body = await c.req.json<{ kind?: string; subjectType?: string; subjectId?: string }>().catch(() => ({} as { kind?: string; subjectType?: string; subjectId?: string }));
  const kind = body.kind as Kind;
  if (!KINDS.includes(kind)) return c.json({ error: 'Invalid kind', code: 'VALIDATION' }, 400);
  const wantLlm = c.req.query('llm') === 'true';

  // Resolve the project id (SATs on a deal ground against the deal's project).
  let projectId = body.subjectId ?? '';
  if (body.subjectType === 'deal' && projectId) {
    try {
      const { rows } = await getPool().query(`SELECT project_id FROM deals WHERE id = $1 LIMIT 1`, [projectId]);
      projectId = (rows[0]?.project_id as string) ?? projectId;
    } catch { /* keep the given id */ }
  }

  // Build the deterministic scaffold (always works, no key needed).
  let scaffold: { title: string; content: Record<string, unknown> };
  if (kind === 'key_assumptions') {
    scaffold = { title: 'Key Assumptions Check', content: { assumptions: [
      { text: 'The token will pursue a listing in the next two quarters.', loadBearing: true, supported: 'unknown', ifWrong: '' },
      { text: 'A verified decision-maker contact is reachable.', loadBearing: true, supported: 'unknown', ifWrong: '' },
      { text: 'LCX is competitive on fees/terms vs. the venues they already use.', loadBearing: false, supported: 'unknown', ifWrong: '' },
    ] } };
  } else if (kind === 'premortem') {
    scaffold = { title: 'Premortem', content: { summary: '', failureModes: [
      { cause: 'The listing stalled in compliance/legal review.', likelihood: 'roughly even chance', mitigation: '' },
      { cause: 'The counterparty went quiet after the proposal.', likelihood: 'unlikely', mitigation: '' },
      { cause: 'A competing exchange closed a better deal first.', likelihood: 'unlikely', mitigation: '' },
    ] } };
  } else {
    // devils_advocate — pull the project's ACH verdict + counter-evidence.
    let content: Record<string, unknown> = { thesis: '', counter: [], recommendation: '' };
    try {
      const { rows } = await getPool().query(
        `SELECT value_json FROM observations WHERE subject_type='project' AND subject_id=$1 AND predicate='ach_verdict'
         ORDER BY observed_at DESC LIMIT 1`,
        [projectId],
      );
      const ach = (rows[0]?.value_json ?? {}) as { verdict?: string; confidence?: number; evidence?: Array<{ text?: string; supports?: string; weight?: number }> };
      const verdict = ach.verdict ?? 'unknown';
      const counter = (ach.evidence ?? [])
        .filter((e) => e.supports && e.supports !== verdict)
        .slice(0, 6)
        .map((e) => ({ point: e.text ?? '', evidence: `argues for ${e.supports}`, weight: e.weight ?? null }));
      content = {
        thesis: `Prevailing read: ${verdict} (confidence ${ach.confidence ?? 0}%).`,
        counter: counter.length ? counter : [{ point: 'No stored counter-evidence — argue the strongest case against pursuing this now.', evidence: '', weight: null }],
        recommendation: '',
      };
    } catch (err) {
      console.error('[reviews] suggest error:', err);
    }
    scaffold = { title: 'Devil’s Advocate', content };
  }

  // SAT copilot (Phase 5.3): when asked and a key is set, refine the scaffold
  // into a grounded draft. AI never files — this is only a richer prefill.
  if (wantLlm && projectId) {
    try {
      const { satCopilot } = await import('../ai/operator.js');
      const refined = await satCopilot(getPool(), kind, projectId, scaffold);
      return c.json({ data: { title: refined.title, content: refined.content }, meta: { ...meta(), usedLlm: refined.usedLlm } });
    } catch (err) {
      console.error('[reviews] sat copilot error:', err);
    }
  }
  return c.json({ data: scaffold, meta: { ...meta(), usedLlm: false } });
});

function mapRow(r: Record<string, unknown>) {
  return {
    id: r.id, kind: r.kind, subjectType: r.subject_type, subjectId: r.subject_id,
    title: r.title, content: r.content, author: r.author, status: r.status,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

/**
 * Shared by the deals premortem gate: is there an active premortem for a deal?
 * FAIL-OPEN — if the table is missing (pre-migration) or the query errors, we
 * return true so the soft gate can never block a legitimate close on infra.
 */
export async function hasActivePremortem(dealId: string, projectId: string | null): Promise<boolean> {
  const ids = [dealId, ...(projectId ? [projectId] : [])];
  try {
    const { rows } = await getPool().query(
      `SELECT 1 FROM analytic_reviews
       WHERE kind='premortem' AND status <> 'draft'
         AND ((subject_type='deal' AND subject_id=$1) OR (subject_type='project' AND subject_id = ANY($2::text[])))
       LIMIT 1`,
      [dealId, ids],
    );
    return rows.length > 0;
  } catch (err) {
    console.warn('[reviews] premortem check failed — gate open:', err instanceof Error ? err.message : err);
    return true;
  }
}
