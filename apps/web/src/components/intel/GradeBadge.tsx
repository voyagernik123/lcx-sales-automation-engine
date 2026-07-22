import { RELIABILITY_LABEL, CREDIBILITY_LABEL, admiraltyCode, type Reliability, type Credibility } from '@lcx/shared';
import { clsx } from 'clsx';

/**
 * Admiralty grade badge (Phase 2.1) — the reliability letter (A–F) and, when
 * known, the credibility digit (1–6), e.g. "B2". Colored by reliability so the
 * desk reads evidence quality at a glance. Every piece of sourced evidence
 * carries one; ungraded evidence is a bug.
 */
const REL_COLOR: Record<Reliability, string> = {
  A: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  B: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
  C: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  D: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  E: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  F: 'bg-grey/15 text-grey border-line',
};

export function GradeBadge({
  reliability,
  credibility,
  className,
}: {
  reliability: Reliability;
  credibility?: Credibility | null;
  className?: string;
}) {
  const code = credibility != null ? admiraltyCode(reliability, credibility) : reliability;
  const title = `${RELIABILITY_LABEL[reliability]} (${reliability})` +
    (credibility != null ? ` · ${CREDIBILITY_LABEL[credibility]} (${credibility})` : '');
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center rounded border px-1 py-0.5 text-micro font-bold num-tabular',
        REL_COLOR[reliability] ?? REL_COLOR.F,
        className,
      )}
    >
      {code}
    </span>
  );
}
