/**
 * Priority equation — renders `priority = propensity × gate` as a visible
 * equation with real numbers (e.g. "72 × 1.0 → P72"). Mirrors
 * combinePriority() in @lcx/shared: the gate factor derives from the best
 * regulatory score (max of EU / US-post): ≥60 → ×1.0, 40–59 → ×0.7,
 * otherwise ×0.4. Each term is clickable and hops to its explanation.
 */
export function gateFactor(euScore?: number | null, usPostScore?: number | null): number {
  const eligibility = Math.max(euScore ?? 0, usPostScore ?? 0);
  return eligibility >= 60 ? 1.0 : eligibility >= 40 ? 0.7 : 0.4;
}

export function PriorityEquation({
  propensity,
  priority,
  euScore,
  usPostScore,
  onExplainPropensity,
  onExplainGate,
  compact = false,
}: {
  propensity?: number | null;
  /** Server-computed priority; falls back to propensity × gate when absent. */
  priority?: number | null;
  euScore?: number | null;
  usPostScore?: number | null;
  onExplainPropensity?: () => void;
  onExplainGate?: () => void;
  compact?: boolean;
}) {
  const factor = gateFactor(euScore, usPostScore);
  const eligibility = Math.max(euScore ?? 0, usPostScore ?? 0);
  const derived = propensity != null ? Math.round(propensity * factor) : null;
  const shown = priority ?? derived;

  const termCls =
    'rounded border border-line bg-ice-soft dark:bg-ice-soft/10 px-1.5 py-0.5 font-mono font-bold text-navy hover:border-cyan-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors cursor-pointer';

  return (
    <div className={`flex flex-wrap items-center ${compact ? 'gap-1 text-micro' : 'gap-1.5 text-label'}`}>
      <span className="text-[9px] font-bold uppercase tracking-wider text-grey mr-0.5">Priority</span>
      <span className="text-grey font-mono">=</span>
      <button
        type="button"
        onClick={onExplainPropensity}
        className={termCls}
        title="Propensity — how likely they are to pay. Click for the reason trail."
      >
        {propensity ?? '—'}
      </button>
      <span className="text-grey font-mono">×</span>
      <button
        type="button"
        onClick={onExplainGate}
        className={termCls}
        title={`Eligibility gate from the best regulatory score (max of EU/US-post = ${eligibility}): ≥60 → ×1.0, 40–59 → ×0.7, <40 → ×0.4. Click for the gate status.`}
      >
        {factor.toFixed(1)}
      </button>
      <span className="text-grey font-mono">→</span>
      <span
        className="rounded bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800 px-1.5 py-0.5 font-mono font-bold text-cyan-700 dark:text-cyan-300"
        title="Priority — propensity gated by regulatory eligibility. A project we cannot list is never a priority."
      >
        {shown != null ? `P${shown}` : 'P—'}
      </span>
      {propensity == null && (
        <span className="text-[9px] text-grey italic">propensity pending re-score</span>
      )}
    </div>
  );
}
