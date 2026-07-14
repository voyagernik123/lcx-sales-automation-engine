import type { ScoreBand } from '@lcx/shared';
import { BAND_LABELS, BAND_COLORS } from '@/types/bd';
import { clsx } from 'clsx';

interface ScoreBadgeProps {
  score: number;
  band: ScoreBand;
  size?: 'sm' | 'md';
}

export function ScoreBadge({ score, band, size = 'md' }: ScoreBadgeProps) {
  const px = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1';
  const textSize = size === 'sm' ? 'text-micro' : 'text-xs';
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded border font-mono font-bold leading-none',
        px, textSize,
        BAND_COLORS[band],
      )}
      aria-label={`Score: ${score}, band: ${band}`}
    >
      <span className="tabular-nums">{score}</span>
      <span className="opacity-60 font-normal">/ 100</span>
    </span>
  );
}

interface BandBadgeProps {
  band: ScoreBand;
  size?: 'sm' | 'md';
}

export function BandBadge({ band, size = 'sm' }: BandBadgeProps) {
  const px = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1';
  const textSize = size === 'sm' ? 'text-micro' : 'text-xs';
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded border font-bold leading-none',
        px, textSize,
        BAND_COLORS[band],
      )}
    >
      {BAND_LABELS[band]}
    </span>
  );
}
