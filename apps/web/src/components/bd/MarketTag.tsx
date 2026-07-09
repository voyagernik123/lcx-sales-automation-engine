import type { Market } from '@/types/bd';
import { clsx } from 'clsx';

interface MarketTagProps {
  market: Market | 'both' | null;
}

const marketStyles: Record<string, string> = {
  eu: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400',
  us: 'border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400',
  both: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400',
};

export function MarketTag({ market }: MarketTagProps) {
  if (!market) {
    return <span className="text-[10px] text-grey">—</span>;
  }

  const label = market === 'both' ? 'EU / US' : market.toUpperCase();
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold leading-none',
        marketStyles[market],
      )}
    >
      {label}
    </span>
  );
}
