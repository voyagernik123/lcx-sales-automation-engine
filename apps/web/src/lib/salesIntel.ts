/**
 * salesIntel — the sales-side derivation layer.
 *
 * The analog of the regulatory toolkit's lib/compliance.ts +
 * lib/competitiveScoring.ts: one pure module that turns raw payloads the
 * app already fetches (deals, deal events, handoffs, project scores) into
 * JUDGMENTS — warnings, likelihood, momentum, SLA state, playbook
 * completeness — so every surface (board cards, queue rows, digests,
 * heatmaps, inspectors) agrees on what a deal's health is.
 *
 * Doctrine: every number this module emits carries its "why" (signals /
 * details), so the UI never shows an unexplained scalar. All functions are
 * pure and unit-tested; no fetching, no store access.
 */
import type { BoardDeal } from '@/lib/api/bd';
import type { DealEvent, HandoffRecord } from '@/types/bd';

/* ────────────────────────────── Types ────────────────────────────── */

export type WarningCode =
  | 'ghosted'
  | 'stalled'
  | 'overdue_close'
  | 'no_next_step'
  | 'telegram_silent'
  | 'single_threaded';

export interface DealWarning {
  code: WarningCode;
  label: string;
  /** Concrete evidence — "no prospect reply for 9d", "14d in proposal vs 6d median". */
  detail: string;
  /** 1 = advisory · 2 = attention · 3 = critical */
  severity: 1 | 2 | 3;
  /** One actionable suggestion, Gong-style. */
  mitigation: string;
}

export interface LikelihoodSignal {
  label: string;
  /** +1 helps the deal, -1 hurts it. */
  direction: 1 | -1;
  /** Contribution magnitude in score points (already signed by direction in the total). */
  weight: number;
  detail: string;
}

export interface DealLikelihood {
  /** Percentile rank among the open deals it was computed with (0–100). */
  percentile: number;
  band: 'low' | 'fair' | 'high';
  /** Raw internal score before ranking — exposed for "see the math". */
  score: number;
  signals: LikelihoodSignal[];
}

export type Momentum = 'accelerating' | 'steady' | 'cooling' | 'cold';

export interface DealHealth {
  dealId: string;
  warnings: DealWarning[];
  likelihood: DealLikelihood;
  momentum: Momentum;
  momentumDetail: string;
  /** Days in current stage, and the median for that stage across the set. */
  daysInStage: number;
  stageMedianDays: number | null;
  playbook: PlaybookChip[];
}

export interface PlaybookChip {
  key: 'T' | 'K' | 'L' | 'C' | 'O';
  label: string;
  status: 'empty' | 'done';
}

export const PLAYBOOK_STEPS: { key: PlaybookChip['key']; label: string }[] = [
  { key: 'T', label: 'Tokenomics review' },
  { key: 'K', label: 'KYB / entity check' },
  { key: 'L', label: 'Legal opinion' },
  { key: 'C', label: 'Compliance greenlight' },
  { key: 'O', label: 'Offer sent' },
];

/** Optional per-deal extras the caller may have fetched lazily. */
export interface DealContext {
  events?: DealEvent[];
  handoffs?: HandoffRecord[];
  /** Completed playbook keys (from API or local persistence). */
  playbookDone?: PlaybookChip['key'][];
  /** Verified contact count on the project, when known. */
  contactCount?: number;
  /** Expected close date ISO, when tracked. */
  expectedCloseAt?: string | null;
}

/* ─────────────────────────── SLA (replies) ────────────────────────── */

export type SlaState = 'fresh' | 'aging' | 'urgent' | 'breached';

export interface ReplySla {
  state: SlaState;
  /** Hours since the reply landed. */
  ageHours: number;
  /** Hours allowed before breach. */
  budgetHours: number;
}

/** Linear-style SLA aging for an unanswered inbound reply/handoff. */
export function computeReplySla(createdAt: string, now = Date.now(), budgetHours = 4): ReplySla {
  const ageHours = Math.max(0, (now - Date.parse(createdAt)) / 3_600_000);
  const r = ageHours / budgetHours;
  const state: SlaState = r >= 1 ? 'breached' : r >= 0.75 ? 'urgent' : r >= 0.4 ? 'aging' : 'fresh';
  return { state, ageHours, budgetHours };
}

/* ──────────────────────────── Internals ───────────────────────────── */

const DAY_MS = 86_400_000;

const daysBetween = (aIso: string, now: number): number =>
  Math.max(0, (now - Date.parse(aIso)) / DAY_MS);

/** Timestamp of the last stage-advance (or created) event. */
function lastStageChangeAt(events: DealEvent[] | undefined, fallbackIso: string): string {
  if (!events?.length) return fallbackIso;
  const stageEvents = events.filter(e => e.eventType === 'stage_change');
  if (!stageEvents.length) return fallbackIso;
  return stageEvents.reduce((a, b) => (Date.parse(a.createdAt) > Date.parse(b.createdAt) ? a : b)).createdAt;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/* ─────────────────────────── Warnings ─────────────────────────────── */

const OPEN_STAGES = new Set(['contacted', 'discovery', 'proposal', 'negotiating']);

function computeWarnings(
  deal: BoardDeal,
  ctx: DealContext,
  daysInStage: number,
  stageMedian: number | null,
  now: number,
): DealWarning[] {
  const warnings: DealWarning[] = [];
  if (!OPEN_STAGES.has(deal.stage)) return warnings;

  // Ghosted — nothing from the prospect since N days (handoff/inbound side).
  const lastInbound = ctx.handoffs?.length
    ? Math.max(...ctx.handoffs.map(h => Date.parse(h.updatedAt)))
    : null;
  if (lastInbound !== null) {
    const d = (now - lastInbound) / DAY_MS;
    if (d >= 5) {
      warnings.push({
        code: 'ghosted',
        label: 'Ghosted',
        detail: `no prospect activity for ${Math.floor(d)}d`,
        severity: d >= 10 ? 3 : 2,
        mitigation: 'Switch channel — if the thread was email, ping on Telegram/LinkedIn.',
      });
    }
  } else if (deal.daysSinceUpdate >= 7) {
    // No handoff context at all — fall back to any-activity staleness.
    warnings.push({
      code: 'ghosted',
      label: 'Silent',
      detail: `no activity of any kind for ${Math.floor(deal.daysSinceUpdate)}d`,
      severity: deal.daysSinceUpdate >= 14 ? 3 : 2,
      mitigation: 'Book the next step on a call — async threads are dying.',
    });
  }

  // Stalled in stage vs the set median for that stage.
  if (stageMedian !== null && daysInStage > Math.max(stageMedian * 1.75, stageMedian + 4)) {
    warnings.push({
      code: 'stalled',
      label: 'Stalled in stage',
      detail: `${Math.floor(daysInStage)}d in ${deal.stage} vs ${Math.round(stageMedian)}d median`,
      severity: 2,
      mitigation: 'Name the blocker explicitly in the next touch, or downgrade the stage.',
    });
  }

  // Overdue expected close.
  if (ctx.expectedCloseAt && Date.parse(ctx.expectedCloseAt) < now) {
    warnings.push({
      code: 'overdue_close',
      label: 'Overdue close',
      detail: `expected close was ${new Date(ctx.expectedCloseAt).toLocaleDateString()}`,
      severity: 3,
      mitigation: 'Re-forecast honestly: push the date or call the risk.',
    });
  }

  // Single-threaded.
  if (ctx.contactCount !== undefined && ctx.contactCount <= 1) {
    warnings.push({
      code: 'single_threaded',
      label: 'Single-threaded',
      detail: ctx.contactCount === 0 ? 'no verified contact' : 'one contact carries the whole deal',
      severity: 2,
      mitigation: 'Find a second contact (run discovery on the project site).',
    });
  }

  // No next step — nothing scheduled/advanced and no open task signal.
  if (deal.daysSinceUpdate >= 3 && !warnings.some(w => w.code === 'ghosted')) {
    warnings.push({
      code: 'no_next_step',
      label: 'No next step',
      detail: `last movement ${Math.floor(deal.daysSinceUpdate)}d ago and nothing queued`,
      severity: 1,
      mitigation: 'Create the next task now — deals without a next step decay.',
    });
  }

  return warnings;
}

/* ─────────────────────── Likelihood (percentile) ──────────────────── */

const STAGE_BASE: Record<string, number> = {
  not_started: 2,
  contacted: 8,
  discovery: 20,
  proposal: 40,
  negotiating: 65,
};

/** Closed-decision history per package type — the input of the learning loop. */
export interface DecisionTrackRecord {
  byPackage: Record<string, { won: number; lost: number }>;
}

export function computeTrackRecord(deals: BoardDeal[]): DecisionTrackRecord {
  const byPackage: DecisionTrackRecord['byPackage'] = {};
  for (const d of deals) {
    if ((d.stage !== 'won' && d.stage !== 'lost') || !d.packageType) continue;
    const rec = (byPackage[d.packageType] ??= { won: 0, lost: 0 });
    if (d.stage === 'won') rec.won += 1;
    else rec.lost += 1;
  }
  return { byPackage };
}

function computeLikelihoodScore(
  deal: BoardDeal,
  ctx: DealContext,
  warnings: DealWarning[],
  trackRecord: DecisionTrackRecord = { byPackage: {} },
): { score: number; signals: LikelihoodSignal[] } {
  const signals: LikelihoodSignal[] = [];
  let score = STAGE_BASE[deal.stage] ?? 5;
  signals.push({
    label: `Stage: ${deal.stage.replace(/_/g, ' ')}`,
    direction: 1,
    weight: score,
    detail: 'base rate from historical stage win-probability',
  });

  // Project quality: priority score (0–100 → up to ±15).
  const prio = deal.priorityScore ?? 0;
  const prioPts = Math.round(((prio - 40) / 60) * 15);
  if (prioPts !== 0) {
    score += prioPts;
    signals.push({
      label: `Priority ${prio}`,
      direction: prioPts > 0 ? 1 : -1,
      weight: Math.abs(prioPts),
      detail: 'propensity × eligibility of the underlying project',
    });
  }

  // Recency of movement.
  if (deal.daysSinceUpdate <= 2) {
    score += 8;
    signals.push({ label: 'Active this week', direction: 1, weight: 8, detail: `updated ${Math.floor(deal.daysSinceUpdate)}d ago` });
  } else if (deal.daysSinceUpdate >= 10) {
    score -= 10;
    signals.push({ label: 'Inactive', direction: -1, weight: 10, detail: `${Math.floor(deal.daysSinceUpdate)}d without movement` });
  }

  // Threading.
  if (ctx.contactCount !== undefined && ctx.contactCount >= 2) {
    score += 6;
    signals.push({ label: 'Multi-threaded', direction: 1, weight: 6, detail: `${ctx.contactCount} contacts engaged` });
  }

  // Warning drag (each warning already carries evidence).
  for (const w of warnings) {
    const pts = w.severity * 3;
    score -= pts;
    signals.push({ label: w.label, direction: -1, weight: pts, detail: w.detail });
  }

  // Playbook completeness (0–5 done → up to +10).
  const done = ctx.playbookDone?.length ?? 0;
  if (done > 0) {
    const pts = done * 2;
    score += pts;
    signals.push({ label: `Playbook ${done}/5`, direction: 1, weight: pts, detail: 'listing checklist progress' });
  }

  // The learning loop (plan B4): won/lost decisions re-weight open deals in
  // the same segment. Small-n discipline applies — fewer than 2 decisions on
  // a package type is an anecdote, not a track record.
  const rec = deal.packageType ? trackRecord.byPackage[deal.packageType] : undefined;
  if (rec && deal.packageType && rec.won + rec.lost >= 2) {
    const pts = Math.max(-6, Math.min(6, (rec.won - rec.lost) * 2));
    if (pts !== 0) {
      score += pts;
      signals.push({
        label: `Track record: ${deal.packageType}`,
        direction: pts > 0 ? 1 : -1,
        weight: Math.abs(pts),
        detail: `${rec.won} won / ${rec.lost} lost on ${deal.packageType} packages — closed decisions feed the model`,
      });
    }
  }

  return { score: Math.max(0, Math.min(100, score)), signals };
}

/* ─────────────────────────── Momentum ─────────────────────────────── */

function computeMomentum(events: DealEvent[] | undefined, deal: BoardDeal, now: number): { momentum: Momentum; detail: string } {
  if (!events?.length) {
    if (deal.daysSinceUpdate >= 14) return { momentum: 'cold', detail: `nothing for ${Math.floor(deal.daysSinceUpdate)}d` };
    if (deal.daysSinceUpdate >= 7) return { momentum: 'cooling', detail: `quiet for ${Math.floor(deal.daysSinceUpdate)}d` };
    return { momentum: 'steady', detail: 'no event history loaded' };
  }
  const last7 = events.filter(e => daysBetween(e.createdAt, now) <= 7).length;
  const prior7 = events.filter(e => {
    const d = daysBetween(e.createdAt, now);
    return d > 7 && d <= 14;
  }).length;
  const detail = `${last7} events last 7d vs ${prior7} prior 7d`;
  if (last7 === 0 && prior7 === 0) return { momentum: 'cold', detail: 'no events in 14d' };
  if (last7 > prior7) return { momentum: 'accelerating', detail };
  if (last7 < prior7) return { momentum: 'cooling', detail };
  return { momentum: 'steady', detail };
}

/* ──────────────────────────── Main API ────────────────────────────── */

/**
 * Compute health for a SET of deals (percentile needs the set). Contexts are
 * optional per deal and everything degrades gracefully when absent.
 */
export function computeDealHealthSet(
  deals: BoardDeal[],
  contexts: Record<string, DealContext> = {},
  now = Date.now(),
): Map<string, DealHealth> {
  const open = deals.filter(d => OPEN_STAGES.has(d.stage));

  // Stage medians for days-in-stage, computed from the set itself.
  const daysInStageByDeal = new Map<string, number>();
  const byStage: Record<string, number[]> = {};
  for (const d of deals) {
    const ctx = contexts[d.id] ?? {};
    const sinceIso = lastStageChangeAt(ctx.events, d.updatedAt);
    const days = daysBetween(sinceIso, now);
    daysInStageByDeal.set(d.id, days);
    (byStage[d.stage] ??= []).push(days);
  }

  // Closed decisions in this set are the learning-loop input (plan B4).
  const trackRecord = computeTrackRecord(deals);

  // First pass: scores.
  const interim = deals.map(d => {
    const ctx = contexts[d.id] ?? {};
    const daysInStage = daysInStageByDeal.get(d.id) ?? 0;
    const stageMedian = median(byStage[d.stage] ?? []);
    const warnings = computeWarnings(d, ctx, daysInStage, stageMedian, now);
    const { score, signals } = computeLikelihoodScore(d, ctx, warnings, trackRecord);
    const { momentum, detail } = computeMomentum(ctx.events, d, now);
    return { d, ctx, daysInStage, stageMedian, warnings, score, signals, momentum, momentumDetail: detail };
  });

  // Percentile rank among OPEN deals (closed deals get 0/100 by outcome).
  const openScores = interim.filter(i => OPEN_STAGES.has(i.d.stage)).map(i => i.score).sort((a, b) => a - b);
  const percentileOf = (score: number): number => {
    if (!openScores.length) return 50;
    if (openScores.length === 1) return 50;
    const below = openScores.filter(s => s < score).length;
    return Math.round((below / (openScores.length - 1)) * 100);
  };

  const out = new Map<string, DealHealth>();
  for (const i of interim) {
    const isOpen = OPEN_STAGES.has(i.d.stage);
    const percentile = i.d.stage === 'won' ? 100 : i.d.stage === 'lost' ? 0 : isOpen ? percentileOf(i.score) : 50;
    const band: DealLikelihood['band'] = percentile >= 76 ? 'high' : percentile >= 30 ? 'fair' : 'low';
    const doneKeys = new Set(i.ctx.playbookDone ?? []);
    out.set(i.d.id, {
      dealId: i.d.id,
      warnings: i.warnings,
      likelihood: { percentile, band, score: i.score, signals: i.signals },
      momentum: i.momentum,
      momentumDetail: i.momentumDetail,
      daysInStage: i.daysInStage,
      stageMedianDays: i.stageMedian,
      playbook: PLAYBOOK_STEPS.map(s => ({ ...s, status: doneKeys.has(s.key) ? 'done' : 'empty' })),
    });
  }
  // `open` computed for future use (pipeline-level rollups read it).
  void open;
  return out;
}

/* ───────────────────── Pipeline-level rollup ──────────────────────── */

export interface PipelinePulse {
  openCount: number;
  openValue: number; // cents
  warningCounts: Record<WarningCode, number>;
  accelerating: number;
  cooling: number;
  cold: number;
}

export function computePipelinePulse(deals: BoardDeal[], health: Map<string, DealHealth>): PipelinePulse {
  const open = deals.filter(d => OPEN_STAGES.has(d.stage));
  const warningCounts = { ghosted: 0, stalled: 0, overdue_close: 0, no_next_step: 0, telegram_silent: 0, single_threaded: 0 } as Record<WarningCode, number>;
  let accelerating = 0, cooling = 0, cold = 0;
  for (const d of open) {
    const h = health.get(d.id);
    if (!h) continue;
    for (const w of h.warnings) warningCounts[w.code]++;
    if (h.momentum === 'accelerating') accelerating++;
    else if (h.momentum === 'cooling') cooling++;
    else if (h.momentum === 'cold') cold++;
  }
  return {
    openCount: open.length,
    openValue: open.reduce((s, d) => s + (d.packageValue ?? 0), 0),
    warningCounts,
    accelerating,
    cooling,
    cold,
  };
}

/* ─────────────── Display helpers (single source of truth) ─────────── */

export const MOMENTUM_GLYPH: Record<Momentum, { glyph: string; cls: string }> = {
  accelerating: { glyph: '▲', cls: 'text-status-ready' },
  steady: { glyph: '▬', cls: 'text-grey' },
  cooling: { glyph: '▼', cls: 'text-status-conditional' },
  cold: { glyph: '✕', cls: 'text-status-blocked' },
};

export const LIKELIHOOD_BAND_CLS: Record<DealLikelihood['band'], string> = {
  high: 'bg-status-ready-bg text-status-ready',
  fair: 'bg-status-conditional-bg text-status-conditional',
  low: 'bg-status-blocked-bg text-status-blocked',
};

export const SLA_CLS: Record<SlaState, string> = {
  fresh: 'text-grey',
  aging: 'text-status-conditional',
  urgent: 'text-orange-500',
  breached: 'text-status-blocked',
};
