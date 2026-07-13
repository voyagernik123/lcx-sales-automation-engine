import type { ReactNode } from 'react';

interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Optional colored dot rendered before the label (band legends). */
  dotColor?: string;
  title?: string;
}

/** Small pill toggle used for band / relevance / source filtering. */
export function FilterChip({ active, onClick, children, dotColor, title }: FilterChipProps) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
        active
          ? 'border-navy/40 bg-ice-soft text-navy dark:border-ice/40 dark:bg-ice-soft/10'
          : 'border-line bg-card text-grey opacity-60 hover:opacity-100 hover:bg-ice-soft dark:hover:bg-ice-soft/10'
      }`}
    >
      {dotColor && (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: dotColor, opacity: active ? 1 : 0.4 }}
        />
      )}
      {children}
    </button>
  );
}
