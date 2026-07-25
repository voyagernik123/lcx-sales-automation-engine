import { likelihood, estimativeConfidence, CONFIDENCE_LABEL, type ConfidenceLevel, type ConfidenceInput } from '@lcx/shared';
import { clsx } from 'clsx';

/**
 * Estimative language (Phase 2.2) — the one way the platform states a
 * probability. Renders "Likely (72%)" with an optional separate confidence,
 * per ICD-203. A bare percentage anywhere in the app should become one of these.
 */
const TERM_COLOR: Record<string, string> = {
  'almost no chance': 'text-grey',
  'very unlikely': 'text-grey',
  'unlikely': 'text-amber-600 dark:text-amber-400',
  'roughly even chance': 'text-amber-600 dark:text-amber-400',
  'likely': 'text-cyan-700 dark:text-cyan-400',
  'very likely': 'text-emerald-600 dark:text-emerald-400',
  'almost certain': 'text-emerald-600 dark:text-emerald-400',
};

export function Estimate({
  p,
  confidence,
  showPct = true,
  className,
}: {
  /** Probability — 0–1 fraction or 0–100 percentage (auto-detected). */
  p: number;
  /** A resolved level, or inputs to derive one. Omit to show likelihood only. */
  confidence?: ConfidenceLevel | ConfidenceInput;
  showPct?: boolean;
  className?: string;
}) {
  const l = likelihood(p);
  const level: ConfidenceLevel | undefined =
    confidence == null ? undefined : typeof confidence === 'string' ? confidence : estimativeConfidence(confidence);
  const term = l.term.charAt(0).toUpperCase() + l.term.slice(1);
  return (
    <span
      className={clsx('inline-flex items-baseline gap-1 font-semibold', className)}
      title={`ICD-203 estimative language${level ? ` · ${CONFIDENCE_LABEL[level]}` : ''}`}
    >
      <span className={TERM_COLOR[l.term] ?? 'text-navy'}>{term}</span>
      {showPct && <span className="num-tabular text-grey">({l.pct}%)</span>}
      {level && <span className="text-micro font-medium text-grey">· {level} conf.</span>}
    </span>
  );
}
