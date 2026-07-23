/**
 * LCX COMMAND overview (Wave 1) — the CEO's one-screen launch picture, derived
 * from the command_* tables plus the static launch-plan meta (anchor + gating
 * chain) from the seed. Pure reads; every block degrades to empty rather than
 * throwing, so the deck renders even before the tables are seeded.
 */
import type pg from 'pg';
import { COMMAND_SEED } from '../seed/command/data.js';

export interface CommandOverview {
  generatedAt: string;
  counts: { products: number; partners: number; workstreams: number; tasks: number; decisions: number; risks: number };
  workstreams: Array<{ id: string; name: string; owner: string | null; total: number; done: number; open: number; blocked: number }>;
  partnersByType: Array<{ type: string; total: number; recommended: number; inProgress: number }>;
  riskHeat: Array<{ impact: string; likelihood: string; count: number }>;
  topRisks: Array<{ id: string; title: string; category: string; likelihood: string; impact: string; mitigation: string }>;
  launch: {
    anchor: string;
    anchorConfirmed: boolean;
    targets: Array<{ id: string; name: string; targetDate: string | null; confirmed: boolean; note: string | null }>;
    gating: Array<{ id: string; title: string; status: string; done: boolean }>;
    gatingDone: number;
    gatingTotal: number;
  };
  decisions: { open: number; total: number; byPhase: Record<string, number> };
  gaps: { partnersMissingContact: number; partnersMissingTerms: number; planningAssumptions: number; unconfirmedTargets: number; notes: string[] };
}

const DONE_STATUSES = new Set(['done', 'complete', 'completed', 'live']);
const BLOCKED_STATUSES = new Set(['blocked']);
const RECOMMENDED_STAGES = new Set(['recommended', 'recommended_rfi', 'incumbent_onboarding', 'select']);
const INPROGRESS_STAGES = new Set(['in_progress', 'incumbent_onboarding']);

const num = (v: unknown): number => Number(v ?? 0);

export async function buildCommandOverview(pool: pg.Pool): Promise<CommandOverview> {
  const q = async (sql: string): Promise<Record<string, unknown>[]> => {
    try { return (await pool.query(sql)).rows as Record<string, unknown>[]; } catch { return []; }
  };

  const [countsRow] = await q(`
    SELECT
      (SELECT COUNT(*) FROM command_products) AS products,
      (SELECT COUNT(*) FROM command_partners) AS partners,
      (SELECT COUNT(*) FROM command_workstreams) AS workstreams,
      (SELECT COUNT(*) FROM command_tasks) AS tasks,
      (SELECT COUNT(*) FROM command_decisions) AS decisions,
      (SELECT COUNT(*) FROM command_risks) AS risks
  `).then((r) => (r.length ? r : [{}]));

  // Workstream rollup — tasks per workstream with status breakdown.
  const wsRows = await q(`SELECT id, name, owner FROM command_workstreams ORDER BY id`);
  const taskRows = await q(`SELECT workstream, status FROM command_tasks`);
  const workstreams = wsRows.map((w) => {
    const mine = taskRows.filter((t) => t.workstream === w.id);
    return {
      id: String(w.id), name: String(w.name), owner: (w.owner as string) ?? null,
      total: mine.length,
      done: mine.filter((t) => DONE_STATUSES.has(String(t.status))).length,
      open: mine.filter((t) => !DONE_STATUSES.has(String(t.status)) && !BLOCKED_STATUSES.has(String(t.status))).length,
      blocked: mine.filter((t) => BLOCKED_STATUSES.has(String(t.status))).length,
    };
  });

  // Partner pipeline by type.
  const partnerRows = await q(`SELECT type, pipeline_stage FROM command_partners`);
  const typeMap = new Map<string, { total: number; recommended: number; inProgress: number }>();
  for (const p of partnerRows) {
    const t = String(p.type ?? 'Unknown');
    const e = typeMap.get(t) ?? { total: 0, recommended: 0, inProgress: 0 };
    e.total++;
    if (RECOMMENDED_STAGES.has(String(p.pipeline_stage))) e.recommended++;
    if (INPROGRESS_STAGES.has(String(p.pipeline_stage))) e.inProgress++;
    typeMap.set(t, e);
  }
  const partnersByType = [...typeMap.entries()].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.total - a.total);

  // Risk heat + top risks (Critical/High impact first).
  const riskRows = await q(`SELECT id, category, title, likelihood, impact, mitigation FROM command_risks`);
  const heatMap = new Map<string, number>();
  for (const r of riskRows) {
    const k = `${r.impact}|${r.likelihood}`;
    heatMap.set(k, (heatMap.get(k) ?? 0) + 1);
  }
  const riskHeat = [...heatMap.entries()].map(([k, count]) => { const [impact, likelihood] = k.split('|'); return { impact, likelihood, count }; });
  const impactRank: Record<string, number> = { Critical: 3, High: 2, Medium: 1, Low: 0 };
  const topRisks = riskRows
    .map((r) => ({ id: String(r.id), title: String(r.title), category: String(r.category ?? ''), likelihood: String(r.likelihood ?? ''), impact: String(r.impact ?? ''), mitigation: String(r.mitigation ?? '') }))
    .sort((a, b) => (impactRank[b.impact] ?? 0) - (impactRank[a.impact] ?? 0))
    .slice(0, 6);

  // Launch readiness — anchor + targets + the gating chain (task ids from the seed).
  const targetRows = await q(`SELECT id, name, target_date, confirmed, note FROM command_launch_targets ORDER BY id`);
  const targets = targetRows.map((t) => ({ id: String(t.id), name: String(t.name), targetDate: (t.target_date as string) ?? null, confirmed: t.confirmed === true, note: (t.note as string) ?? null }));
  const launchPlan = (COMMAND_SEED as unknown as { launchPlan: { anchor_variable?: string; gating_dependencies?: string[] } }).launchPlan;
  const gatingIds = launchPlan?.gating_dependencies ?? [];
  // Parameterized ANY() — the ids are trusted seed values, but we never
  // interpolate identifiers into SQL as a rule.
  const gatingTaskRows = gatingIds.length
    ? await pool.query(`SELECT id, title, status FROM command_tasks WHERE id = ANY($1)`, [gatingIds])
        .then((r) => r.rows as Record<string, unknown>[]).catch(() => [])
    : [];
  const byId = new Map(gatingTaskRows.map((r) => [String(r.id), r]));
  const gating = gatingIds.map((id) => {
    const r = byId.get(id);
    const status = r ? String(r.status) : 'unknown';
    return { id, title: r ? String(r.title) : id, status, done: DONE_STATUSES.has(status) };
  });

  // Decisions by phase.
  const decRows = await q(`SELECT phase, status FROM command_decisions`);
  const byPhase: Record<string, number> = {};
  for (const d of decRows) { const p = String(d.phase ?? '?'); byPhase[p] = (byPhase[p] ?? 0) + 1; }

  // Computed data-gaps (the non-fabrication ledger, made measurable).
  const [gapRow] = await q(`
    SELECT
      (SELECT COUNT(*) FROM command_partners WHERE primary_contact IS NULL) AS no_contact,
      (SELECT COUNT(*) FROM command_partners WHERE terms IS NULL) AS no_terms,
      (SELECT COUNT(*) FROM command_financial_assumptions WHERE assumption = true) AS planning,
      (SELECT COUNT(*) FROM command_launch_targets WHERE confirmed = false) AS unconfirmed
  `).then((r) => (r.length ? r : [{}]));

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      products: num(countsRow?.products), partners: num(countsRow?.partners), workstreams: num(countsRow?.workstreams),
      tasks: num(countsRow?.tasks), decisions: num(countsRow?.decisions), risks: num(countsRow?.risks),
    },
    workstreams,
    partnersByType,
    riskHeat,
    topRisks,
    launch: {
      anchor: launchPlan?.anchor_variable ?? 'US launch date — unconfirmed.',
      anchorConfirmed: false,
      targets,
      gating,
      gatingDone: gating.filter((g) => g.done).length,
      gatingTotal: gating.length,
    },
    decisions: { open: decRows.filter((d) => String(d.status) === 'open').length, total: decRows.length, byPhase },
    gaps: {
      partnersMissingContact: num(gapRow?.no_contact),
      partnersMissingTerms: num(gapRow?.no_terms),
      planningAssumptions: num(gapRow?.planning),
      unconfirmedTargets: num(gapRow?.unconfirmed),
      notes: [
        'Launch date is unconfirmed — the anchor every simulation keys off.',
        'Partner contacts + commercial terms are unfilled (come from the Phase 1/2 RFIs).',
        'No confirmed internal financials — figures shown are planning assumptions / public benchmarks.',
        'Metals-distribution workstream referenced in the brief is not yet in the strategy (empty).',
      ],
    },
  };
}
