/**
 * The AI Operator (Palantir-grade Phase 5) — intelligence that reasons over the
 * ontology and acts ONLY through the governed action registry (3.2).
 *
 * Two hard rules, enforced structurally:
 *   1. GROUNDED. Every answer is assembled from the object graph the platform
 *      already computed — scores, GRADED observations (Admiralty A–F × 1–6),
 *      news, people, deals, decisions. The ontology is the retrieval; there is
 *      no separate RAG store to drift. Answers cite evidence by id + grade.
 *   2. GATED. Without ANTHROPIC_API_KEY every function returns usedLlm:false and
 *      the caller keeps its deterministic Phase-4 behavior. The LLM only refines.
 *
 * The operator NEVER writes on its own: it proposes registry actions and drafts
 * SATs; a human confirms/files. See routes/aiOperator.ts.
 */
import type pg from 'pg';
import { admiraltyCode, type Reliability, type Credibility } from '@lcx/shared';
import { llm } from './llm.js';
import { listObservations } from '../intel/observations.js';

export interface EvidenceItem {
  id: string;
  predicate: string;
  summary: string;
  source: string;
  grade: string;        // Admiralty code, e.g. "B2"
  reliability: Reliability;
  credibility: Credibility;
  confidence: number;
  observedAt: string | null;
}

export interface DossierContext {
  project: { id: string; name: string; ticker: string | null; category: string | null; jurisdiction: string | null; tier: string | null; listedOnLcx: boolean };
  score: { band: string | null; priorityScore: number | null; recommendedMarket: string | null } | null;
  evidence: EvidenceItem[];
  news: Array<{ title: string; source: string; publishedAt: string | null }>;
  people: Array<{ name: string; title: string | null; verified: boolean }>;
  deal: { stage: string; packageValue: number | null; owner: string | null } | null;
  decisions: Array<{ title: string; decision: string; outcome: string | null }>;
}

const short = (v: unknown, n = 120): string => {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > n ? s.slice(0, n) + '…' : s;
};

/** Assemble a project's dossier from the object graph. Pure reads; no LLM. */
export async function assembleDossier(pool: pg.Pool, projectId: string): Promise<DossierContext | null> {
  const projRes = await pool.query(
    `SELECT id, name, ticker, category, jurisdiction, tier, listed_on_lcx FROM projects WHERE id = $1 LIMIT 1`,
    [projectId],
  );
  const p = projRes.rows[0] as Record<string, unknown> | undefined;
  if (!p) return null;

  const [scoreRes, newsRes, peopleRes, dealRes, decRes, obs] = await Promise.all([
    pool.query(`SELECT band, priority_score, recommended_market FROM scores WHERE project_id = $1 LIMIT 1`, [projectId]).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT title, source, published_at FROM market_news WHERE $1 = ANY(matched_project_ids) ORDER BY published_at DESC NULLS LAST LIMIT 8`,
      [projectId],
    ).catch(() => ({ rows: [] })),
    pool.query(`SELECT name, title, verified FROM people WHERE project_id = $1 ORDER BY contactability_score DESC NULLS LAST LIMIT 6`, [projectId]).catch(() => ({ rows: [] })),
    pool.query(`SELECT stage, package_value, owner FROM deals WHERE project_id = $1 LIMIT 1`, [projectId]).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT title, decision, outcome FROM decisions WHERE subject_type='project' AND subject_id=$1 ORDER BY created_at DESC LIMIT 5`,
      [projectId],
    ).catch(() => ({ rows: [] })),
    listObservations('project', projectId, 60).catch(() => []),
  ]);

  const s = scoreRes.rows[0] as Record<string, unknown> | undefined;
  const d = dealRes.rows[0] as Record<string, unknown> | undefined;

  const evidence: EvidenceItem[] = obs.map((o) => ({
    id: o.id,
    predicate: o.predicate,
    summary: short(o.valueNum ?? o.value),
    source: o.source,
    grade: admiraltyCode(o.reliability, o.credibility),
    reliability: o.reliability,
    credibility: o.credibility,
    confidence: o.confidence,
    observedAt: o.observedAt ? new Date(o.observedAt).toISOString() : null,
  }));

  return {
    project: {
      id: String(p.id), name: String(p.name), ticker: (p.ticker as string) ?? null,
      category: (p.category as string) ?? null, jurisdiction: (p.jurisdiction as string) ?? null,
      tier: (p.tier as string) ?? null, listedOnLcx: Boolean(p.listed_on_lcx),
    },
    score: s ? { band: (s.band as string) ?? null, priorityScore: s.priority_score != null ? Number(s.priority_score) : null, recommendedMarket: (s.recommended_market as string) ?? null } : null,
    evidence,
    news: (newsRes.rows as Record<string, unknown>[]).map((r) => ({ title: String(r.title), source: String(r.source), publishedAt: r.published_at ? new Date(r.published_at as string).toISOString() : null })),
    people: (peopleRes.rows as Record<string, unknown>[]).map((r) => ({ name: String(r.name), title: (r.title as string) ?? null, verified: Boolean(r.verified) })),
    deal: d ? { stage: String(d.stage), packageValue: d.package_value != null ? Number(d.package_value) : null, owner: (d.owner as string) ?? null } : null,
    decisions: (decRes.rows as Record<string, unknown>[]).map((r) => ({ title: String(r.title), decision: String(r.decision), outcome: (r.outcome as string) ?? null })),
  };
}

/** Render the dossier as a compact, id-tagged context block for the model. */
function renderContext(ctx: DossierContext): string {
  const lines: string[] = [];
  const pr = ctx.project;
  lines.push(`PROJECT: ${pr.name}${pr.ticker ? ` (${pr.ticker})` : ''} — category ${pr.category ?? '?'}, jurisdiction ${pr.jurisdiction ?? '?'}, tier ${pr.tier ?? '?'}, ${pr.listedOnLcx ? 'ALREADY listed on LCX' : 'not listed on LCX'}.`);
  if (ctx.score) lines.push(`SCORE: band ${ctx.score.band ?? '?'}, priority ${ctx.score.priorityScore ?? '?'}, recommended market ${ctx.score.recommendedMarket ?? '?'}.`);
  if (ctx.deal) lines.push(`DEAL: stage ${ctx.deal.stage}, value ${ctx.deal.packageValue != null ? `$${Math.round(ctx.deal.packageValue / 100).toLocaleString()}` : '?'}, owner ${ctx.deal.owner ?? 'unassigned'}.`);
  if (ctx.people.length) lines.push(`CONTACTS: ${ctx.people.map((x) => `${x.name}${x.title ? ` (${x.title})` : ''}${x.verified ? ' ✓' : ''}`).join('; ')}.`);
  if (ctx.news.length) lines.push(`RECENT NEWS: ${ctx.news.map((n) => `"${n.title}" [${n.source}]`).join(' · ')}.`);
  if (ctx.decisions.length) lines.push(`PRIOR DECISIONS: ${ctx.decisions.map((x) => `${x.title} → ${x.decision}${x.outcome ? ` (outcome: ${x.outcome})` : ''}`).join('; ')}.`);
  lines.push('');
  lines.push('GRADED EVIDENCE (cite these by id in double brackets, e.g. [[<id>]]; the grade is Admiralty reliability×credibility, A1 = best):');
  for (const e of ctx.evidence) {
    lines.push(`- [[${e.id}]] (${e.grade}, conf ${e.confidence}%, ${e.source}) ${e.predicate}: ${e.summary}`);
  }
  return lines.join('\n');
}

const CITE_RE = /\[\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]\]/gi;

export interface DossierAnswer {
  answer: string;
  citations: Array<Pick<EvidenceItem, 'id' | 'grade' | 'predicate' | 'source' | 'confidence'>>;
  usedLlm: boolean;
  evidenceCount: number;
}

/**
 * Answer a question about a project, grounded in its dossier. The model must
 * cite evidence by id; we resolve those ids back to graded evidence for the UI.
 * No key (or a project with no evidence) → usedLlm:false and the raw evidence
 * list is returned so the desk still sees what's known.
 */
export async function dossierQA(pool: pg.Pool, projectId: string, question: string): Promise<DossierAnswer | null> {
  const ctx = await assembleDossier(pool, projectId);
  if (!ctx) return null;

  const topEvidence = ctx.evidence.slice(0, 20).map((e) => ({ id: e.id, grade: e.grade, predicate: e.predicate, source: e.source, confidence: e.confidence }));

  if (!llm.available) {
    return {
      answer: '',
      citations: topEvidence,
      usedLlm: false,
      evidenceCount: ctx.evidence.length,
    };
  }

  const system = 'You are the LCX desk\'s intelligence operator. Answer ONLY from the dossier provided — never invent facts. Cite every factual claim with the evidence id in double brackets [[id]]. If the evidence does not support an answer, say so plainly and state what collection would be needed. Be concise (3–6 sentences). Use estimative language (likely, roughly even chance) rather than false precision.';
  const prompt = `${renderContext(ctx)}\n\nQUESTION: ${question.slice(0, 500)}\n\nAnswer, citing evidence ids in [[ ]].`;

  const { text, usedLlm } = await llm.complete(prompt, { feature: 'dossier-qa', system, maxTokens: 700, temperature: 0.3 });
  if (!usedLlm || !text) {
    return { answer: '', citations: topEvidence, usedLlm: false, evidenceCount: ctx.evidence.length };
  }

  // Resolve cited ids → graded evidence (only ids that actually exist in the dossier).
  const byId = new Map(ctx.evidence.map((e) => [e.id, e]));
  const citedIds = new Set<string>();
  for (const m of text.matchAll(CITE_RE)) if (byId.has(m[1])) citedIds.add(m[1]);
  const citations = [...citedIds].map((id) => {
    const e = byId.get(id)!;
    return { id: e.id, grade: e.grade, predicate: e.predicate, source: e.source, confidence: e.confidence };
  });

  return { answer: text, citations, usedLlm: true, evidenceCount: ctx.evidence.length };
}

/* ────────────────────────────────────────────────────────────────────────
 * Structured-JSON helpers (proposals, triage). The model is asked for strict
 * JSON; we parse defensively and fall back to deterministic output on any miss.
 * ──────────────────────────────────────────────────────────────────────── */
/** Extract the unique UUID citation ids the model emitted, in order. Exported for tests. */
export function extractCitedIds(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(CITE_RE)) if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]); }
  return out;
}

export function parseJsonBlock<T>(text: string): T | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fence ? fence[1] : text).trim();
  const start = raw.search(/[[{]/);
  if (start < 0) return null;
  try { return JSON.parse(raw.slice(start)) as T; } catch { return null; }
}

/** Registry action ids the operator may PROPOSE (never anything destructive). */
export const AI_PROPOSABLE = ['create_task', 'notify', 'flag_review', 'watchlist_add', 'track'] as const;

export interface ActionProposal {
  actionId: string;
  subjectType: string;
  subjectId: string;
  params: Record<string, unknown>;
  rationale: string;
  source: 'ai' | 'deterministic';
}

/**
 * Propose 1–3 governed actions for a project. LLM-driven when available, else a
 * deterministic proposal from the deal stage. Every proposal is validated to a
 * whitelisted registry action before it's returned — the model can only suggest
 * moves the platform already governs.
 */
export async function proposeActions(pool: pg.Pool, projectId: string): Promise<{ proposals: ActionProposal[]; usedLlm: boolean }> {
  const ctx = await assembleDossier(pool, projectId);
  if (!ctx) return { proposals: [], usedLlm: false };

  const deterministic = (): ActionProposal[] => {
    const stage = ctx.deal?.stage;
    const name = ctx.project.name;
    if (!ctx.deal || stage === 'not_started') {
      return [{ actionId: 'create_task', subjectType: 'project', subjectId: projectId, params: { title: `Open outreach with ${name}`, detail: 'No active deal — start the conversation.' }, rationale: 'No deal in flight for a tracked target.', source: 'deterministic' }];
    }
    return [{ actionId: 'create_task', subjectType: 'project', subjectId: projectId, params: { title: `Advance ${name} (${stage})`, detail: 'Next step on the open deal.' }, rationale: `Deal is in ${stage}.`, source: 'deterministic' }];
  };

  if (!llm.available) return { proposals: deterministic(), usedLlm: false };

  const system = `You are the LCX desk operator. Propose 1–3 next actions, each mapped to EXACTLY ONE governed action id from this set: ${AI_PROPOSABLE.join(', ')}. Ground each in the dossier. Return STRICT JSON only: {"proposals":[{"actionId":"create_task","params":{"title":"...","detail":"..."},"rationale":"..."}]}. For create_task/notify, params needs "title" (≤120 chars) and optional "detail". For flag_review, params may have "reason". For watchlist_add, params may have "note". For track, params is {}. No prose outside the JSON.`;
  const { text, usedLlm } = await llm.complete(`${renderContext(ctx)}\n\nPropose the next actions as JSON.`, { feature: 'ai-propose', system, maxTokens: 600, temperature: 0.4 });
  const parsed = usedLlm ? parseJsonBlock<{ proposals?: Array<{ actionId?: string; params?: Record<string, unknown>; rationale?: string }> }>(text) : null;
  if (!parsed?.proposals?.length) return { proposals: deterministic(), usedLlm: false };

  const proposals: ActionProposal[] = [];
  for (const p of parsed.proposals.slice(0, 3)) {
    if (!p.actionId || !(AI_PROPOSABLE as readonly string[]).includes(p.actionId)) continue;
    proposals.push({
      actionId: p.actionId,
      subjectType: 'project',
      subjectId: projectId,
      params: (p.params && typeof p.params === 'object') ? p.params : {},
      rationale: short(p.rationale ?? '', 300),
      source: 'ai',
    });
  }
  return proposals.length ? { proposals, usedLlm: true } : { proposals: deterministic(), usedLlm: false };
}

export interface OutreachDraft { draft: string; rationale: string; usedLlm: boolean }

/** Draft a first-touch outreach message grounded in the dossier. */
export async function draftOutreach(pool: pg.Pool, projectId: string): Promise<OutreachDraft | null> {
  const ctx = await assembleDossier(pool, projectId);
  if (!ctx) return null;
  const contact = ctx.people[0]?.name?.split(' ')[0] ?? 'there';
  const det = `Hi ${contact},\n\nI lead exchange partnerships at LCX. We've been following ${ctx.project.name}${ctx.project.ticker ? ` ($${ctx.project.ticker})` : ''} and see a strong fit for a compliant, MiCA-ready listing. Open to a short call this week?\n\nBest,\nLCX Desk`;
  if (!llm.available) return { draft: det, rationale: 'Template (no LLM key set).', usedLlm: false };

  const system = 'You draft concise, credible B2B outreach for a regulated European exchange (LCX). 90 words max, specific to the dossier, no hype, no fabricated facts, one clear ask (a short call). Plain text only.';
  const { text, usedLlm } = await llm.complete(`${renderContext(ctx)}\n\nDraft a first-touch outreach email to the primary contact.`, { feature: 'ai-outreach', system, maxTokens: 400, temperature: 0.6 });
  return usedLlm && text ? { draft: text, rationale: 'Grounded in the project dossier.', usedLlm: true } : { draft: det, rationale: 'Template fallback.', usedLlm: false };
}

/**
 * Executive narrative paragraph grounded strictly in the deterministic tables
 * handed in as `facts`. Returns the provided `fallback` when no key is set — so
 * the brief/WBR is identical to Phase 4 without the LLM.
 */
export async function narrativeParagraph(feature: string, facts: string, fallback: string): Promise<{ text: string; usedLlm: boolean }> {
  if (!llm.available) return { text: fallback, usedLlm: false };
  const system = 'You write a single tight executive-summary paragraph (≤80 words) for a sales-desk report. Use ONLY the numbers/items provided — never invent. Lead with what changed and what needs attention. No headers, no lists, no hype.';
  const { text, usedLlm } = await llm.complete(`Facts:\n${facts}\n\nWrite the executive summary paragraph.`, { feature, system, maxTokens: 300, temperature: 0.4 });
  return usedLlm && text ? { text, usedLlm: true } : { text: fallback, usedLlm: false };
}

/**
 * SAT copilot (5.3) — refine a deterministic review scaffold into a grounded
 * draft the analyst edits and files. The AI NEVER files: this only returns a
 * richer prefill (same JSON shape as the deterministic suggest). Falls back to
 * the scaffold on no key / parse failure. `shape` guides the expected JSON.
 */
export async function satCopilot(
  pool: pg.Pool,
  kind: 'key_assumptions' | 'premortem' | 'devils_advocate',
  projectId: string,
  scaffold: { title: string; content: Record<string, unknown> },
): Promise<{ title: string; content: Record<string, unknown>; usedLlm: boolean }> {
  if (!llm.available) return { ...scaffold, usedLlm: false };
  const ctx = await assembleDossier(pool, projectId);
  if (!ctx) return { ...scaffold, usedLlm: false };

  const guide: Record<typeof kind, string> = {
    key_assumptions: 'Return {"assumptions":[{"text":"...","loadBearing":true,"supported":"supported|unknown|contradicted","ifWrong":"..."}]} — 3–5 load-bearing assumptions behind pursuing this listing, each judged against the evidence.',
    premortem: 'Return {"summary":"...","failureModes":[{"cause":"...","likelihood":"likely|roughly even chance|unlikely","mitigation":"..."}]} — imagine it is 6 months on and the deal failed; 3–5 concrete causes grounded in the dossier, ICD-203 likelihoods.',
    devils_advocate: 'Return {"thesis":"...","counter":[{"point":"...","evidence":"...","weight":null}],"recommendation":"..."} — argue the strongest case AGAINST pursuing this now, grounded in the weakest-graded / contradicting evidence.',
  };
  const system = `You are a structured-analytic-techniques copilot for an intelligence desk. Draft a ${kind.replace('_', ' ')} grounded ONLY in the dossier. ${guide[kind]} Strict JSON only, no prose outside it. Never fabricate — if evidence is thin, say so in the text fields.`;
  const { text, usedLlm } = await llm.complete(`${renderContext(ctx)}\n\nDraft the ${kind} as JSON.`, { feature: `sat-${kind}`, system, maxTokens: 800, temperature: 0.4 });
  const parsed = usedLlm ? parseJsonBlock<Record<string, unknown>>(text) : null;
  if (!parsed) return { ...scaffold, usedLlm: false };
  // Keep the deterministic title; merge the model's structured content.
  return { title: scaffold.title, content: parsed, usedLlm: true };
}

export type SignalClass = 'true_signal' | 'data_artifact' | 'deception_suspect' | 'unclear';
export interface TriageResult { classification: SignalClass; rationale: string; suggestedAction: string; usedLlm: boolean }

/**
 * First-pass triage of an anomaly / monitor fire: corroborate against the
 * dossier and classify. Advisory only — queued for a human decision, never
 * auto-acted. Deterministic fallback classifies as 'unclear' with a review nudge.
 */
export async function triageSignal(pool: pg.Pool, projectId: string, signal: string): Promise<TriageResult> {
  const det: TriageResult = { classification: 'unclear', rationale: 'No LLM key — routed to a human for review.', suggestedAction: 'flag_review', usedLlm: false };
  const ctx = await assembleDossier(pool, projectId);
  if (!ctx || !llm.available) return det;

  const system = `You triage a market/monitor signal for a token. Classify as one of: true_signal, data_artifact, deception_suspect, unclear. Corroborate against the dossier (news, evidence grades — low grades or wash-trading flags favor deception_suspect/data_artifact). Return STRICT JSON: {"classification":"...","rationale":"...","suggestedAction":"..."}. suggestedAction is a short imperative. No prose outside JSON.`;
  const { text, usedLlm } = await llm.complete(`${renderContext(ctx)}\n\nSIGNAL: ${signal.slice(0, 300)}\n\nTriage it as JSON.`, { feature: 'ai-triage', system, maxTokens: 400, temperature: 0.2 });
  const parsed = usedLlm ? parseJsonBlock<{ classification?: string; rationale?: string; suggestedAction?: string }>(text) : null;
  const cls = parsed?.classification as SignalClass | undefined;
  const valid: SignalClass[] = ['true_signal', 'data_artifact', 'deception_suspect', 'unclear'];
  if (!parsed || !cls || !valid.includes(cls)) return det;
  return { classification: cls, rationale: short(parsed.rationale ?? '', 400), suggestedAction: short(parsed.suggestedAction ?? 'flag_review', 120), usedLlm: true };
}
