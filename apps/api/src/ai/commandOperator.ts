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

  /*
   * ORDER BY id — THE THIRD INSTANCE OF THE SEED-NOT-BINDING DEFECT.
   *
   * `runLaunchSim` is seeded and therefore deterministic FOR A GIVEN ROW ORDER. An
   * unordered SELECT returns heap order, which changes on UPDATE, so the same data
   * produced a MEASURED p50 spread of 1-2 days across 12 row permutations at the
   * same seed. The other two reads (routes/command.ts, kpi/wbr.ts) were fixed with
   * the P1e lane; this one fed /v1/command/ask, so the AI operator was answering
   * with a p50 and a topCritical list drawn from heap order while the panel beside
   * it used a different one. Both agents on that lane named this as the highest-value
   * remaining item; it is one clause.
   */
  const taskRows = await q(`SELECT id, title, status, depends_on, workstream FROM command_tasks ORDER BY id`);
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
  /** Resolved [[source-id]] citations (100X Phase 5.1). */
  citations?: Array<{ id: string; label: string; url: string | null }>;
}

/** Compact deep-ontology facts, source-tagged for citation (100X Phase 5.1). */
async function renderDeepFacts(): Promise<{ facts: string; sources: Array<{ id: string; label: string; url: string | null }> }> {
  const { COMMAND_DEEP_SEED } = await import('../seed/command/data2.js');
  const d = COMMAND_DEEP_SEED as unknown as {
    scorecards: { lp: { dimensions: Array<{ label: string; weight: number }>; rows: Array<{ subjectLabel: string; weighted: number | null; tier: string | null; note?: string }> }; twoPath: { rows: Array<{ subjectLabel: string; weighted: number | null; tier: string | null }> }; arch: { rows: Array<{ subjectLabel: string; weighted: number | null; tier: string | null }> } };
    stablecoinPolicy: Array<{ coin: string; action: string; sourceRefs: string[] }>;
    ddDimensions: Array<{ dimension: string; weightPct: number; gate: boolean }>;
    execDashboard: Array<{ phase: string; recommendation: string | null; gatingDep: string | null }>;
    sources: Array<{ id: string; label: string; url: string | null }>;
  };
  const L: string[] = [];
  L.push(`LP SCORECARD (weights: ${d.scorecards.lp.dimensions.map((x) => `${x.label} ${x.weight}`).join(', ')}): ${d.scorecards.lp.rows.map((r) => `${r.subjectLabel} ${r.weighted} ${r.tier ?? ''}${r.note ? ` — ${r.note.slice(0, 90)}` : ''}`).join(' | ')}. Source grade C3 [[p1_1]].`);
  L.push(`RAILS ARCHITECTURE OPTIONS: ${d.scorecards.arch.rows.map((r) => `${r.subjectLabel} ${r.weighted}${r.tier ? ` (${r.tier})` : ''}`).join(' | ')} [[p2_1]].`);
  L.push(`LISTING PATHS: ${d.scorecards.twoPath.rows.map((r) => `${r.subjectLabel} ${r.weighted}${r.tier ? ` (${r.tier})` : ''}`).join(' | ')} [[p4_1]].`);
  L.push(`GENIUS POLICY: ${d.stablecoinPolicy.map((s) => `${s.coin}: ${s.action.slice(0, 60)}${s.sourceRefs[0] ? ` [[${s.sourceRefs[0]}]]` : ''}`).join(' | ')}.`);
  L.push(`TOKEN DD: ${d.ddDimensions.map((x) => `${x.dimension} ${x.weightPct}%${x.gate ? ' HARD-GATE' : ''}`).join(', ')} [[p4_2]].`);
  L.push(`EXEC RECOMMENDATIONS: ${d.execDashboard.map((e) => `${e.phase}: ${e.recommendation?.slice(0, 80)} (gate: ${e.gatingDep?.slice(0, 50)})`).join(' | ')} [[m_1]].`);
  return { facts: L.join('\n'), sources: d.sources };
}

const SRC_CITE_RE = /\[\[([a-z0-9_]+)\]\]/gi;

/**
 * Answer a question about the launch program. Deterministic readout without a
 * key; grounded LLM narration with one. Never invents — the model only gets
 * the rendered context and is told to refuse beyond it.
 */
export async function askProgram(pool: pg.Pool, question: string): Promise<ProgramAnswer | null> {
  const ctx = await assembleProgramContext(pool);
  if (!ctx) return null;

  const live = renderProgramContext(ctx);
  const deep = await renderDeepFacts().catch(() => ({ facts: '', sources: [] as Array<{ id: string; label: string; url: string | null }> }));
  // Deterministic answer = the live program readout (always correct, always available).
  const deterministic = live;

  if (!llm.available) return { answer: deterministic, usedLlm: false, context: ctx };

  const system = 'You are the LCX CEO\'s launch-program operator. Answer ONLY from the facts provided — never invent tasks, dates, partners, scores, or figures. When you use a fact that carries a [[source-id]], repeat that [[source-id]] after the claim. Simulation numbers are planning assumptions, not commitments. Direct, concise (3–6 sentences). If the facts cannot answer, say what data is missing.';
  const { text, usedLlm } = await llm.complete(
    `LIVE PROGRAM STATE:\n${live}\n\nSTRATEGY DEEP FACTS (cite [[source-id]]s):\n${deep.facts}\n\nQUESTION: ${question.slice(0, 500)}\n\nAnswer from the facts above.`,
    { feature: 'command-ask', system, maxTokens: 700, temperature: 0.3 },
  );
  if (!usedLlm || !text) return { answer: deterministic, usedLlm: false, context: ctx };
  // Resolve citations against the source registry (only real ids survive).
  const byId = new Map(deep.sources.map((s) => [s.id, s]));
  const cited: Array<{ id: string; label: string; url: string | null }> = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(SRC_CITE_RE)) {
    const s = byId.get(m[1].toLowerCase());
    if (s && !seen.has(s.id)) { seen.add(s.id); cited.push(s); }
  }
  return { answer: text, usedLlm: true, context: ctx, citations: cited };
}

/** Decision-memo copilot (100X Phase 5.2). Drafts; the HUMAN decides via the gated action. */
export async function draftDecisionMemo(pool: pg.Pool, decisionId: string): Promise<{ memo: string; usedLlm: boolean } | null> {
  const { rows } = await pool.query(`SELECT id, phase, decision, recommendation, status FROM command_decisions WHERE id=$1`, [decisionId]).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  if (rows.length === 0) return null;
  const d = rows[0] as { id: string; phase: string; decision: string; recommendation: string | null; status: string };
  const { COMMAND_DEEP_SEED } = await import('../seed/command/data2.js');
  const enrich = (COMMAND_DEEP_SEED as unknown as { decisionEnrichment: Array<{ decisionId: string; options: string | null; owner: string | null }> })
    .decisionEnrichment.find((e) => e.decisionId === decisionId);
  const det = `DECISION MEMO — ${d.decision} (${d.phase})\nOptions considered: ${enrich?.options ?? '(see register)'}\nRecommendation on file: ${d.recommendation ?? '—'}\nOwner: ${enrich?.owner ?? '—'}\nStatus: ${d.status}.`;
  if (!llm.available) return { memo: det, usedLlm: false };
  const deep = await renderDeepFacts().catch(() => ({ facts: '', sources: [] }));
  const system = 'You draft a decision memo for the LCX CEO: Context, Options (from the register), Analysis grounded ONLY in the facts (cite [[source-id]]s), Recommendation with ICD-203 confidence (e.g. "likely the right call"), and Risks/reversibility. ≤200 words. The human decides — never state the decision as made.';
  const { text, usedLlm } = await llm.complete(
    `${deep.facts}\n\nDECISION: ${d.decision} (${d.phase})\nOPTIONS: ${enrich?.options ?? 'unknown'}\nFILED RECOMMENDATION: ${d.recommendation ?? 'none'}\n\nDraft the memo.`,
    { feature: 'command-memo', system, maxTokens: 500, temperature: 0.3 },
  );
  return usedLlm && text ? { memo: text, usedLlm: true } : { memo: det, usedLlm: false };
}

/** RFI extractor (100X Phase 5.3). READ-ONLY: extracts fields for a human diff → the governed record action. */
export async function extractRfi(text: string): Promise<{ fields: Record<string, string>; usedLlm: boolean }> {
  const { COMMAND_DEEP_SEED } = await import('../seed/command/data2.js');
  const fieldDefs = (COMMAND_DEEP_SEED as unknown as { rfi: { fields: Array<{ key: string; label: string }> } }).rfi.fields;
  if (!llm.available) return { fields: {}, usedLlm: false };
  const system = `Extract RFI commercial terms from an LP's reply. Return STRICT JSON only: an object whose keys are EXACTLY from this set (omit anything not stated — never guess): ${fieldDefs.map((f) => `"${f.key}" (${f.label})`).join(', ')}. Values are short strings verbatim from the text.`;
  const { text: out, usedLlm } = await llm.complete(`REPLY:\n${text.slice(0, 6000)}\n\nExtract as JSON.`, { feature: 'command-rfi-extract', system, maxTokens: 700, temperature: 0.1 });
  if (!usedLlm || !out) return { fields: {}, usedLlm: false };
  const { parseJsonBlock } = await import('./operator.js');
  const parsed = parseJsonBlock<Record<string, unknown>>(out);
  const valid = new Set(fieldDefs.map((f) => f.key));
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed ?? {})) {
    if (valid.has(k) && typeof v === 'string' && v.trim()) fields[k] = v.trim().slice(0, 300);
  }
  return { fields, usedLlm: true };
}
