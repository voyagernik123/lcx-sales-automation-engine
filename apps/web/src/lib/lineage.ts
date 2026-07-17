import type { ReplySla, DealHealth } from './salesIntel';
import type { ForecastData } from './api/kpi';
import { formatDate, formatMoney, formatPct } from './format';
import { formatRate } from './metricPolicy';

/**
 * The lineage contract (FINAL_MASTER_PLAN 3.3) — "why?" as a universal right.
 *
 * Every derived value on the platform belongs to one of nine families, and
 * every family can produce a `Lineage`: the evidence tree behind the number
 * (source fact → transformation → value). The <Derived> component renders
 * any Lineage behind the dotted-underline affordance; these builders are
 * pure so they can be unit-tested and reused by any surface.
 *
 * Families: propensity · priority · likelihood · momentum · reply-SLA ·
 * market recommendation · forecast · playbook · report aggregates.
 */

export interface EvidenceNode {
  label: string;
  /** Right-aligned display value. */
  value?: string;
  /** Signed contribution — renders as ▲+8 / ▼−4 with color. */
  signed?: number;
  /** Denominator for contributions ("of 15"). */
  max?: number;
  detail?: string;
  ts?: string;
  children?: EvidenceNode[];
}

export interface Lineage {
  /** Mono family tag shown in the popover header ("PRIORITY"). */
  family: string;
  /** The headline value being explained. */
  value: string;
  /** Optional mono formula line ("propensity × eligibility gate"). */
  formula?: string;
  nodes: EvidenceNode[];
  footnote?: string;
}

export interface ReasonTrailEntry {
  code?: string;
  factor?: string;
  points?: number;
  max?: number;
  note?: string;
}

/* ── 1 · Propensity ─────────────────────────────────────────── */

export function propensityLineage(score: number | undefined, reasons?: ReasonTrailEntry[]): Lineage {
  const nodes: EvidenceNode[] =
    reasons && reasons.length > 0
      ? reasons.map(r => ({
          label: r.factor ?? r.code ?? 'Signal',
          signed: r.points,
          max: r.max,
          detail: r.note,
        }))
      : [{ label: 'Signal trail on the project inspector', detail: 'Reason-level detail lives on the project record.' }];
  return {
    family: 'PROPENSITY',
    value: score != null ? `${score}/100` : '—',
    formula: 'Σ weighted commercial signals',
    nodes,
    footnote: 'How likely they are to pay for a listing — commercial fit, not regulatory eligibility.',
  };
}

/* ── 2 · Priority ───────────────────────────────────────────── */

export interface PriorityInputs {
  propensityScore?: number;
  priorityScore?: number;
  euScore?: number;
  usScore?: number;
  lastEnrichedAt?: string | null;
}

/** Eligibility gate from the best regulatory score: ≥60 ×1.0 · 40–59 ×0.7 · else ×0.4. */
export function eligibilityGate(bestScore: number): number {
  return bestScore >= 60 ? 1 : bestScore >= 40 ? 0.7 : 0.4;
}

export function priorityLineage(p: PriorityInputs): Lineage {
  const best = Math.max(p.euScore ?? 0, p.usScore ?? 0);
  const gate = eligibilityGate(best);
  return {
    family: 'PRIORITY',
    value: p.priorityScore != null ? String(p.priorityScore) : '—',
    formula: 'propensity × eligibility gate',
    nodes: [
      { label: 'Propensity', value: p.propensityScore != null ? `${p.propensityScore}/100` : '—', detail: 'Commercial fit — the will-they-pay score.' },
      {
        label: 'Eligibility gate',
        value: `×${gate.toFixed(1)}`,
        detail: `Best regulatory score ${best} (max of EU/US): ≥60 → ×1.0 · 40–59 → ×0.7 · <40 → ×0.4.`,
      },
      {
        label: 'Market data',
        value: p.lastEnrichedAt ? formatDate(p.lastEnrichedAt) : 'not enriched',
        detail: p.lastEnrichedAt ? 'Last enrichment run.' : 'Scores may lag until the next enrichment pass.',
      },
    ],
    footnote: 'Ranks the working queue — who to touch next, not who is biggest.',
  };
}

/* ── 3 · Likelihood ─────────────────────────────────────────── */

export function likelihoodLineage(likelihood: DealHealth['likelihood']): Lineage {
  return {
    family: 'LIKELIHOOD',
    value: `${likelihood.percentile}th percentile`,
    formula: 'stage base rate + signed deal signals',
    nodes: likelihood.signals.map(s => ({
      label: s.label,
      signed: s.direction * Math.abs(s.weight),
      detail: s.detail,
    })),
    footnote: `Band ${likelihood.band} · score ${Math.round(likelihood.score)}/100 among open deals.`,
  };
}

/* ── 4 · Momentum ───────────────────────────────────────────── */

export function momentumLineage(momentum: DealHealth['momentum'], detail: string): Lineage {
  return {
    family: 'MOMENTUM',
    value: momentum,
    formula: 'events last 7d vs prior 7d',
    nodes: [{ label: 'Event window', detail }],
    footnote: 'Movement, not size — a quiet deal cools regardless of value.',
  };
}

/* ── 5 · Reply SLA ──────────────────────────────────────────── */

export function slaLineage(sla: ReplySla, createdAt: string): Lineage {
  const pct = Math.round((sla.ageHours / sla.budgetHours) * 100);
  return {
    family: 'REPLY SLA',
    value: sla.state.toUpperCase(),
    formula: 'reply age ÷ response budget',
    nodes: [
      { label: 'Reply received', value: formatDate(createdAt), ts: createdAt },
      { label: 'Waiting', value: `${Math.round(sla.ageHours * 10) / 10}h of ${sla.budgetHours}h`, detail: `${pct}% of budget used.` },
      {
        label: 'Bands',
        detail: 'fresh <40% · aging 40–75% · urgent 75–100% · breached >100% of budget.',
      },
    ],
    footnote: 'A reply pauses automation — until someone answers, the sequence is frozen.',
  };
}

/* ── 6 · Market recommendation ──────────────────────────────── */

export interface MarketRecInputs {
  euScore?: number;
  usPreScore?: number;
  usPostScore?: number;
  clarityEnacted?: boolean;
}

export function marketRecLineage(m: MarketRecInputs): Lineage {
  const us = (m.clarityEnacted ? m.usPostScore : m.usPreScore) ?? 0;
  const eu = m.euScore ?? 0;
  const rec = eu >= us ? 'EU' : 'US';
  return {
    family: 'MARKET REC',
    value: rec,
    formula: 'max(EU score, US score)',
    nodes: [
      { label: 'EU readiness', value: `${eu}/100`, detail: 'MiCA venue — listable today.' },
      {
        label: `US readiness (${m.clarityEnacted ? 'post' : 'pre'}-CLARITY)`,
        value: `${us}/100`,
        detail: m.clarityEnacted ? 'CLARITY scenario enacted.' : 'Pre-CLARITY scoring — re-scored when the act passes.',
      },
      { label: 'Verdict', value: rec, detail: eu === us ? 'Tie breaks to EU (live venue).' : `${rec} leads by ${Math.abs(eu - us)} points.` },
    ],
    footnote: 'Planning heuristic only — market entry decisions require counsel sign-off.',
  };
}

/* ── 7 · Forecast ───────────────────────────────────────────── */

export function forecastLineage(f: ForecastData): Lineage {
  return {
    family: 'FORECAST',
    value: formatMoney(Math.round(f.expected)),
    formula: 'Σ (deal value × win probability), Monte Carlo sampled',
    nodes: [
      { label: 'Open deals in model', value: String(f.deals.length) },
      { label: 'Simulations', value: f.runs.toLocaleString('en-US') },
      { label: 'P10 conservative', value: formatMoney(Math.round(f.p10)), detail: '90% of runs land above this.' },
      { label: 'P50 median', value: formatMoney(Math.round(f.p50)) },
      { label: 'P90 upside', value: formatMoney(Math.round(f.p90)), detail: 'Only 10% of runs exceed this.' },
    ],
    footnote: 'Win probabilities come from the likelihood model per deal — click any deal for its own trail.',
  };
}

/* ── 8 · Playbook ───────────────────────────────────────────── */

export function playbookLineage(playbook: DealHealth['playbook']): Lineage {
  const done = playbook.filter(s => s.status === 'done');
  const next = playbook.find(s => s.status !== 'done');
  return {
    family: 'PLAYBOOK',
    value: `${done.length}/${playbook.length}`,
    formula: 'fixed listing sequence: T → K → L → C → O',
    nodes: playbook.map(s => ({
      label: s.label,
      value: s.status === 'done' ? 'done' : s === next ? '→ next' : 'pending',
    })),
    footnote: 'The next step is always the first incomplete stage — no skipping in the listing track.',
  };
}

/* ── 9 · Report aggregates ──────────────────────────────────── */

export function rateAggregateLineage(
  title: string,
  byGroup: Record<string, { sent: number; replied: number }>,
): Lineage {
  const totalSent = Object.values(byGroup).reduce((a, g) => a + g.sent, 0);
  const totalReplied = Object.values(byGroup).reduce((a, g) => a + g.replied, 0);
  const rate = formatRate(totalReplied, totalSent);
  return {
    family: 'AGGREGATE',
    value: rate.display,
    formula: `${title.toLowerCase()} = replies ÷ sends across channels`,
    nodes: Object.entries(byGroup).map(([group, g]) => ({
      label: group,
      value: `${g.replied}/${g.sent}${g.sent > 0 && g.replied <= g.sent ? ` · ${formatPct((g.replied / g.sent) * 100)}` : ''}`,
    })),
    footnote: rate.suppressed ? rate.title : `${totalReplied} replies over ${totalSent} sends in the window.`,
  };
}

export function sumAggregateLineage(
  title: string,
  cents: Record<string, number>,
  labels?: Record<string, string>,
): Lineage {
  const entries = Object.entries(cents).filter(([, v]) => v > 0);
  const total = entries.reduce((a, [, v]) => a + v, 0);
  return {
    family: 'AGGREGATE',
    value: formatMoney(Math.round(total / 100)),
    formula: `${title} = Σ closed value by stream`,
    nodes: entries
      .sort(([, a], [, b]) => b - a)
      .map(([stream, v]) => ({
        label: labels?.[stream] ?? stream,
        value: formatMoney(Math.round(v / 100)),
        detail: total > 0 ? formatPct((v / total) * 100) + ' of total' : undefined,
      })),
    footnote: 'Every stream total is the sum of its won deals — open a deal for its own record.',
  };
}
