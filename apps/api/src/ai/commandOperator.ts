/**
 * LCX COMMAND intelligence layer (Wave 3) — the AI operator over the US-launch
 * program ontology. Same two structural rules as the Phase-5 operator:
 *   GROUNDED — answers are assembled ONLY from the command_* tables + the
 *   launch simulation; the program graph is the retrieval.
 *   GATED — without ANTHROPIC_API_KEY the deterministic program readout is the
 *   answer (usedLlm:false). The LLM only narrates what the graph already says.
 *
 * Read-only: this module NEVER writes. Program mutations go through the
 * governed registry actions (command_* actions, human-confirmed).
 */
import type pg from 'pg';
import { runLaunchSim, type SimTaskInput } from '@lcx/shared';
import { llm } from './llm.js';

export interface ProgramContext {
  gating: Array<{ id: string; title: string; status: string; done: boolean }>;
  blocked: Array<{ id: string; title: string; workstream: string | null }>;
  nextUnblocked: Array<{ id: string; title: string; status: string }>;
  topCritical: Array<{ id: string; title: string; criticality: number }>;
  simP50Days: number;
  simP90Days: number;
  openDecisions: number;
  topRisks: Array<{ title: string; impact: string; likelihood: string }>;
  anchorConfirmed: boolean;
  warnings: string[];
}

const DONE = new Set(['done', 'complete', 'completed', 'live']);

/** Assemble the deterministic program picture. Pure reads; degrades to empties. */
export async function assembleProgramContext(pool: pg.Pool): Promise<ProgramContext | null> {
  const q = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> => {
    try { return (await pool.query(sql, params)).rows as Record<string, unknown>[]; } catch { return []; }
  };

  const taskRows = await q(`SELECT id, title, status, depends_on, workstream FROM command_tasks`);
  if (taskRows.length === 0) return null;

  const tasks: SimTaskInput[] = taskRows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    status: String(r.status ?? 'not_started'),
    dependsOn: Array.isArray(r.depends_on) ? (r.depends_on as unknown[]).map(String) : [],
  }));
  const byId = new Map(taskRows.map((r) => [String(r.id), r]));

  // Launch sim (small run — this is a context readout, not the full panel).
  const sim = runLaunchSim(tasks, { runs: 500, seed: 42 });

  // Gating chain from the seed meta (kept in the tasks themselves via overview
  // conventions): recompute here from the well-known gating ids to avoid an
  // import cycle with overview.ts.
  const { COMMAND_SEED } = await import('../seed/command/data.js');
  const gatingIds: string[] = ((COMMAND_SEED as unknown as { launchPlan?: { gating_dependencies?: string[] } }).launchPlan?.gating_dependencies) ?? [];
  const gating = gatingIds.map((id) => {
    const r = byId.get(id);
    const status = r ? String(r.status) : 'unknown';
    return { id, title: r ? String(r.title) : id, status, done: DONE.has(status) };
  });

  const blocked = taskRows
    .filter((r) => String(r.status) === 'blocked')
    .map((r) => ({ id: String(r.id), title: String(r.title), workstream: (r.workstream as string) ?? null }));

  // "Next unblocked" = not done, and every dependency (if any) is done — the
  // work that could start TODAY.
  const doneIds = new Set(tasks.filter((t) => DONE.has(t.status)).map((t) => t.id));
  const nextUnblocked = tasks
    .filter((t) => !DONE.has(t.status) && t.status !== 'blocked' && t.dependsOn.every((d) => doneIds.has(d)))
    .slice(0, 8)
    .map((t) => ({ id: t.id, title: t.title ?? t.id, status: t.status }));

  const decRows = await q(`SELECT COUNT(*) AS n FROM command_decisions WHERE status='open'`);
  const riskRows = await q(`SELECT title, impact, likelihood FROM command_risks ORDER BY (impact='Critical') DESC, (impact='High') DESC LIMIT 5`);
  const anchorRows = await q(`SELECT COUNT(*) AS n FROM command_launch_targets WHERE confirmed=true`);

  return {
    gating,
    blocked,
    nextUnblocked,
    topCritical: sim.criticality.filter((c) => !DONE.has(c.status)).slice(0, 6).map((c) => ({ id: c.id, title: c.title, criticality: c.criticality })),
    simP50Days: sim.p50Days,
    simP90Days: sim.p90Days,
    openDecisions: Number(decRows[0]?.n ?? 0),
    topRisks: riskRows.map((r) => ({ title: String(r.title), impact: String(r.impact ?? ''), likelihood: String(r.likelihood ?? '') })),
    anchorConfirmed: Number(anchorRows[0]?.n ?? 0) > 0,
    warnings: sim.warnings,
  };
}

/** Render the program context as a compact factual block. */
export function renderProgramContext(ctx: ProgramContext): string {
  const lines: string[] = [];
  lines.push(`LAUNCH ANCHOR: ${ctx.anchorConfirmed ? 'confirmed' : 'UNCONFIRMED (all milestones tentative)'}.`);
  lines.push(`GATING CHAIN: ${ctx.gating.filter((g) => g.done).length}/${ctx.gating.length} complete — ${ctx.gating.map((g) => `${g.title} [${g.status}]`).join('; ')}.`);
  lines.push(`SIMULATION (planning assumptions, not a committed schedule): P50 completion in ~${ctx.simP50Days} days, P90 ~${ctx.simP90Days} days.`);
  if (ctx.topCritical.length) lines.push(`MOST CRITICAL-PATH TASKS: ${ctx.topCritical.map((t) => `${t.title} (${Math.round(t.criticality * 100)}%)`).join('; ')}.`);
  if (ctx.blocked.length) lines.push(`BLOCKED: ${ctx.blocked.map((b) => b.title).join('; ')}.`);
  if (ctx.nextUnblocked.length) lines.push(`READY TO START NOW (all dependencies met): ${ctx.nextUnblocked.map((t) => t.title).join('; ')}.`);
  lines.push(`OPEN DECISIONS: ${ctx.openDecisions}.`);
  if (ctx.topRisks.length) lines.push(`TOP RISKS: ${ctx.topRisks.map((r) => `${r.title} (${r.likelihood}/${r.impact})`).join('; ')}.`);
  if (ctx.warnings.length) lines.push(`GRAPH WARNINGS: ${ctx.warnings.join('; ')}.`);
  return lines.join('\n');
}

export interface ProgramAnswer {
  answer: string;
  usedLlm: boolean;
  context: ProgramContext;
}

/**
 * Answer a question about the launch program. Deterministic readout without a
 * key; grounded LLM narration with one. Never invents — the model only gets
 * the rendered context and is told to refuse beyond it.
 */
export async function askProgram(pool: pg.Pool, question: string): Promise<ProgramAnswer | null> {
  const ctx = await assembleProgramContext(pool);
  if (!ctx) return null;

  const facts = renderProgramContext(ctx);
  // Deterministic answer = the program readout itself (always correct, always available).
  const deterministic = facts;

  if (!llm.available) return { answer: deterministic, usedLlm: false, context: ctx };

  const system = 'You are the LCX CEO\'s launch-program operator. Answer ONLY from the program facts provided — never invent tasks, dates, partners, or figures. Estimates come from the planning simulation and must be described as planning assumptions, not commitments. Be direct and concise (3–6 sentences). If the facts cannot answer the question, say exactly what data is missing.';
  const { text, usedLlm } = await llm.complete(
    `${facts}\n\nQUESTION: ${question.slice(0, 500)}\n\nAnswer from the facts above.`,
    { feature: 'command-ask', system, maxTokens: 600, temperature: 0.3 },
  );
  if (!usedLlm || !text) return { answer: deterministic, usedLlm: false, context: ctx };
  return { answer: text, usedLlm: true, context: ctx };
}
