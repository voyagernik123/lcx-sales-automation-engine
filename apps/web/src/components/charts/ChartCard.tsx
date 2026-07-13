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
    <section className="rounded-xl border border-line bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-navy">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-grey">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
