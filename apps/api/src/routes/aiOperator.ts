/**
 * AI Operator routes (Palantir-grade Phase 5). Mounted under /v1/ai alongside
 * the existing Phase-3 AI routes. Every endpoint is grounded in the ontology and
 * degrades to deterministic behavior without ANTHROPIC_API_KEY (usedLlm:false).
 *
 * The operator PROPOSES; humans CONFIRM. Writes only ever happen through the
 * governed action registry (3.2) via /confirm, recorded with actor='ai' and the
 * confirming operator in the audit trail.
 */
import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import { llm } from '../ai/llm.js';
import { invokeAction, ActionError, type ActorRole } from '../actions/registry.js';
import { dossierQA, proposeActions, draftOutreach, triageSignal, narrativeParagraph, AI_PROPOSABLE } from '../ai/operator.js';
import { getLatestWbr } from '../kpi/wbr.js';

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version, aiAvailable: llm.available });

export const aiOperatorRoutes = new Hono<{ Variables: AuthVariables }>();

/** POST /v1/ai/dossier/:projectId {question} — grounded Q&A citing graded evidence. */
aiOperatorRoutes.post('/dossier/:projectId', requireOperator, async (c) => {
  const body = await c.req.json<{ question?: string }>().catch(() => ({} as { question?: string }));
  const question = (body.question ?? '').trim();
  if (!question) return c.json({ error: 'question required', code: 'VALIDATION' }, 400);
  try {
    const res = await dossierQA(getPool(), c.req.param('projectId'), question);
    if (!res) return c.json({ error: 'Project not found', code: 'NOT_FOUND' }, 404);
    return c.json({ data: res, meta: meta() });
  } catch (err) {
    console.error('[ai-operator] dossier error:', err);
    return c.json({ error: 'Dossier Q&A failed', code: 'AI_ERROR' }, 500);
  }
});

/** POST /v1/ai/estimate/:projectId — ICD-203 estimative outlook (preset dossier question). */
aiOperatorRoutes.post('/estimate/:projectId', requireOperator, async (c) => {
  try {
    const res = await dossierQA(
      getPool(), c.req.param('projectId'),
      'Give a 2–3 sentence estimative outlook, in ICD-203 language (likely / roughly even chance / unlikely), on whether this token lists on LCX within the next two quarters. Cite the evidence that drives the judgment.',
    );
    if (!res) return c.json({ error: 'Project not found', code: 'NOT_FOUND' }, 404);
    return c.json({ data: res, meta: meta() });
  } catch (err) {
    console.error('[ai-operator] estimate error:', err);
    return c.json({ error: 'Estimate failed', code: 'AI_ERROR' }, 500);
  }
});

/** POST /v1/ai/propose/:projectId — 1–3 governed-action proposals (validated to the registry). */
aiOperatorRoutes.post('/propose/:projectId', requireOperator, async (c) => {
  try {
    const res = await proposeActions(getPool(), c.req.param('projectId'));
    return c.json({ data: res, meta: meta() });
  } catch (err) {
    console.error('[ai-operator] propose error:', err);
    return c.json({ error: 'Propose failed', code: 'AI_ERROR' }, 500);
  }
});

/** POST /v1/ai/draft-outreach/:projectId — a first-touch draft (not sent). */
aiOperatorRoutes.post('/draft-outreach/:projectId', requireOperator, async (c) => {
  try {
    const res = await draftOutreach(getPool(), c.req.param('projectId'));
    if (!res) return c.json({ error: 'Project not found', code: 'NOT_FOUND' }, 404);
    return c.json({ data: res, meta: meta() });
  } catch (err) {
    console.error('[ai-operator] draft error:', err);
    return c.json({ error: 'Draft failed', code: 'AI_ERROR' }, 500);
  }
});

/**
 * POST /v1/ai/confirm — apply an AI proposal through the governed registry.
 * actor='ai', the confirming operator is recorded in the audit meta. The action
 * id must be one the operator is allowed to propose (never destructive).
 */
aiOperatorRoutes.post('/confirm', requireOperator, async (c) => {
  const op = c.get('operator');
  const body = await c.req.json<{ actionId?: string; subjectType?: string; subjectId?: string; params?: Record<string, unknown> }>()
    .catch(() => ({} as { actionId?: string; subjectType?: string; subjectId?: string; params?: Record<string, unknown> }));
  if (!body.actionId || !body.subjectType || !body.subjectId) {
    return c.json({ error: 'actionId, subjectType, subjectId required', code: 'VALIDATION' }, 400);
  }
  if (!(AI_PROPOSABLE as readonly string[]).includes(body.actionId)) {
    return c.json({ error: `${body.actionId} is not an AI-proposable action`, code: 'FORBIDDEN' }, 403);
  }
  try {
    const result = await invokeAction(getPool(), body.actionId, {
      subjectType: body.subjectType,
      subjectId: body.subjectId,
      params: body.params,
      actor: 'ai',
      role: (op.role === 'approver' ? 'approver' : 'operator') as ActorRole,
      confirmedBy: op.id,
    });
    return c.json({ data: { action: body.actionId, result, confirmedBy: op.id }, meta: meta() });
  } catch (err) {
    if (err instanceof ActionError) return c.json({ error: err.message, code: err.code }, err.status as 400);
    console.error('[ai-operator] confirm error:', err);
    return c.json({ error: 'Confirm failed', code: 'AI_ERROR' }, 500);
  }
});

/** POST /v1/ai/triage {projectId, signal} — first-pass signal classification (advisory). */
aiOperatorRoutes.post('/triage', requireOperator, async (c) => {
  const body = await c.req.json<{ projectId?: string; signal?: string }>().catch(() => ({} as { projectId?: string; signal?: string }));
  if (!body.projectId || !body.signal?.trim()) return c.json({ error: 'projectId and signal required', code: 'VALIDATION' }, 400);
  try {
    const res = await triageSignal(getPool(), body.projectId, body.signal.trim());
    return c.json({ data: res, meta: meta() });
  } catch (err) {
    console.error('[ai-operator] triage error:', err);
    return c.json({ error: 'Triage failed', code: 'AI_ERROR' }, 500);
  }
});

/**
 * POST /v1/ai/wbr-narrative — an executive narrative for the current WBR,
 * grounded strictly in the composed report. Falls back to the deterministic
 * narrative the WBR already carries. (Distinct path from the existing
 * /narrative/:projectId route to avoid a dynamic-segment collision.)
 */
/*
 * ══ THE GOVERNANCE GATE ON THIS ONE ROUTE, AND WHY IT IS NOT THE INTEL GATE ══
 *
 * Found by an adversarial pass and DEMONSTRATED against a real database: an authenticated
 * principal holding exactly `intel: operate` — and nothing else — read COMMAND and
 * DISTRIBUTION content through this endpoint.
 *
 * The mechanism is entirely in the mounting. `/v1/ai` appears in exactly one workspace's
 * apiPrefixes (`packages/shared/src/workspaces.ts:131`, INTEL), so `app.ts` mounts exactly one
 * compartment gate on this path: `requireWorkspace('intel', …)`. `requireOperator` below is
 * AUTHENTICATION, not authorisation. But the handler calls `getLatestWbr`, and `kpi/wbr.ts`
 * composes its report from `command_tasks`, `command_launch_targets`, `dist_campaigns` and
 * `dist_listings` — i.e. from two ELEVATED compartments, one of which (DISTRIBUTION) is
 * `legacy: false`, meaning default-deny and reachable only through an explicit audited grant.
 *
 * The same report at `/v1/wbr` IS correctly gated: that prefix belongs to GOVERNANCE
 * (workspaces.ts:246, `sensitivity: 'elevated'`). So the WBR had two doors with different
 * locks, and this was the cheap one — INTEL is `standard` and `legacy: true`, which the
 * request-access flow hands out, `legacyEntitlements` grants to a zero-row roster member, and
 * a second-tier `ext:` principal may hold.
 *
 * Worse, line ~139 returns `deterministic: report.narrative` unconditionally, so the
 * disclosure never needed an ANTHROPIC_API_KEY to work.
 *
 * Gated at 'view' rather than 'operate': composing a narrative reads and writes nothing, and
 * the requirement is to hold the compartment, not to be able to act in it.
 */
aiOperatorRoutes.post('/wbr-narrative', requireOperator, requireWorkspace('governance', 'view'), async (c) => {
  try {
    const report = await getLatestWbr(getPool());
    const facts = [
      `Week ${report.weekStart}.`,
      ...report.inputs.map((m) => `${m.label}: ${m.current} (Δ ${m.delta}).`),
      ...report.outputs.map((m) => `${m.label}: ${m.current} (Δ ${m.delta}).`),
      report.exceptions.length ? `Exceptions: ${report.exceptions.map((e) => e.label).join('; ')}.` : 'No exceptions.',
      report.commitments.length ? `${report.commitments.length} open commitments.` : 'No open commitments.',
    ].join('\n');
    const { text, usedLlm } = await narrativeParagraph('wbr-narrative', facts, report.narrative);
    return c.json({ data: { narrative: text, usedLlm, deterministic: report.narrative }, meta: meta() });
  } catch (err) {
    console.error('[ai-operator] wbr narrative error:', err);
    return c.json({ error: 'Narrative failed', code: 'AI_ERROR' }, 500);
  }
});
