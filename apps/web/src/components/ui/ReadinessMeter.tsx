import { clsx } from 'clsx';

interface ReadinessMeterProps {
  percent: number;
  className?: string;
}

export function ReadinessMeter({ percent, className }: ReadinessMeterProps) {
  const activeCount = Math.round(percent / 10);

  return (
    <div className={clsx('flex gap-1 w-full', className)}>
      {Array.from({ length: 10 }).map((_, idx) => {
        const isActive = idx < activeCount;
        return (
          <div
            key={idx}
            className={clsx(
              'h-2.5 flex-1 rounded-sm transition-all duration-300',
              isActive
                ? 'bg-navy dark:bg-ice shadow-sm shadow-navy/20 dark:shadow-ice/20'
                : 'bg-line/40 dark:bg-ice-soft/20 border border-line/20'
            )}
          />
        );
      })}
    </div>
  );
}
