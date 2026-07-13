import { ReactNode } from 'react';

/** Subtle placeholder row for report sections with nothing to show. */
export function NoDataRow({ message = 'No data this period' }: { message?: string }) {
  return (
    <div className="rounded border border-dashed border-line px-3 py-2.5 text-center text-xs italic text-grey">
      {message}
    </div>
  );
}

export interface ReportSectionProps {
  title: string;
  subtitle?: string;
  /** When true, children are replaced with a "No data this period" row. */
  empty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
}

/** Deck-page section: uppercase heading + body; never renders blank. */
export function ReportSection({ title, subtitle, empty, emptyMessage, children }: ReportSectionProps) {
  return (
    <section className="br-section border-t border-line px-6 py-5 first:border-t-0">
      <div className="mb-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-grey">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[11px] text-grey">{subtitle}</p>}
      </div>
      {empty ? <NoDataRow message={emptyMessage} /> : children}
    </section>
  );
}
