import { ReactNode } from 'react';

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  /** Right-aligned header slot (filter, link, menu…). */
  action?: ReactNode;
  children: ReactNode;
}

/** Consistent card wrapper for charts: title / subtitle / action + content. */
export function ChartCard({ title, subtitle, action, children }: ChartCardProps) {
  return (
    <section className="rounded-xl border border-line/70 bg-card p-5 shadow-card">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-semibold tracking-[-0.01em] text-navy">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-grey">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
