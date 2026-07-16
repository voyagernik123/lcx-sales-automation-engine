import type { Market } from '@/types/bd';
import { clsx } from 'clsx';

interface MarketTagProps {
  market: Market | 'both' | null;
}

/** Neutral chip + colored dot (chip restraint) — the dot carries the market hue. */
const marketDots: Record<string, string> = {
  eu: 'bg-blue-500',
  us: 'bg-purple-500',
  both: 'bg-amber-500',
};

export function MarketTag({ market }: MarketTagProps) {
  if (!market) {
    return <span className="text-micro text-grey">—</span>;
  }

  const label = market === 'both' ? 'EU / US' : market.toUpperCase();
  return (
    <span
      className={clsx(
        'inline-flex h-[18px] items-center gap-1.5 rounded-full border border-line/70 bg-ice-soft/50 dark:bg-navy-deep/50 px-2 text-micro font-semibold leading-none text-grey-dark whitespace-nowrap',
      )}
    >
      <span className={clsx('h-1.5 w-1.5 rounded-full shrink-0', marketDots[market])} />
      {label}
    </span>
  );
}
