import { useId } from 'react';

const pulse = 'animate-pulse rounded bg-ice-soft dark:bg-ice-soft/10';

export interface TableSkeletonProps {
  rows?: number;
  cols?: number;
}

/** Pulsing table placeholder: header row + `rows` body rows of `cols` cells. */
export function TableSkeleton({ rows = 6, cols = 4 }: TableSkeletonProps) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading table">
      <div className="flex gap-3">
        {Array.from({ length: cols }, (_, c) => (
          <div key={c} className={`${pulse} h-4 flex-1`} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }, (_, c) => (
            <div key={c} className={`${pulse} h-8 flex-1`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export interface CardSkeletonProps {
  count?: number;
}

/** Grid of pulsing stat-card placeholders. */
export function CardSkeleton({ count = 3 }: CardSkeletonProps) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
      role="status"
      aria-label="Loading cards"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-line bg-card p-4">
          <div className={`${pulse} h-3 w-20`} />
          <div className={`${pulse} mt-3 h-7 w-24`} />
          <div className={`${pulse} mt-3 h-3 w-28`} />
        </div>
      ))}
    </div>
  );
}

export interface ChartSkeletonProps {
  height?: number;
}

/** Area-chart-shaped gradient pulse. */
export function ChartSkeleton({ height = 180 }: ChartSkeletonProps) {
  const id = useId();
  return (
    <div
      className="w-full overflow-hidden rounded"
      style={{ height }}
      role="status"
      aria-label="Loading chart"
    >
      <svg
        viewBox="0 0 400 180"
        preserveAspectRatio="none"
        className="h-full w-full animate-pulse text-ice-soft dark:text-ice-soft/10"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.9} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0.25} />
          </linearGradient>
        </defs>
        <path
          d="M0,120 C60,80 100,142 160,102 C220,62 260,122 320,72 C352,46 380,62 400,52 L400,180 L0,180 Z"
          fill={`url(#${id})`}
        />
      </svg>
    </div>
  );
}

/** Full-page placeholder: header bar + stat cards + table. */
export function PageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading page">
      <div className="space-y-2">
        <div className={`${pulse} h-7 w-48`} />
        <div className={`${pulse} h-4 w-72`} />
      </div>
      <CardSkeleton count={4} />
      <TableSkeleton />
    </div>
  );
}
