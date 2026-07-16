import type { ScoreBand } from '@lcx/shared';
import { BAND_LABELS, BAND_COLORS } from '@/types/bd';
import { clsx } from 'clsx';

interface ScoreBadgeProps {
  score: number;
  band: ScoreBand;
  size?: 'sm' | 'md';
}

export function ScoreBadge({ score, band, size = 'md' }: ScoreBadgeProps) {
  const px = size === 'sm' ? 'h-[18px] px-1.5' : 'h-6 px-2';
  const textSize = size === 'sm' ? 'text-micro' : 'text-xs';
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded border font-mono font-semibold leading-none whitespace-nowrap',
        px, textSize,
        BAND_COLORS[band],
      )}
      aria-label={`Score: ${score}, band: ${band}`}
    >
      <span className="num-tabular">{score}</span>
      <span className="opacity-60 font-normal">/ 100</span>
    </span>
  );
}

interface BandBadgeProps {
  band: ScoreBand;
  size?: 'sm' | 'md';
}

export function BandBadge({ band, size = 'sm' }: BandBadgeProps) {
  const px = size === 'sm' ? 'h-[18px] px-1.5' : 'h-6 px-2';
  const textSize = size === 'sm' ? 'text-micro' : 'text-xs';
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded border font-semibold leading-none whitespace-nowrap',
        px, textSize,
        BAND_COLORS[band],
      )}
    >
      {BAND_LABELS[band]}
    </span>
  );
}
