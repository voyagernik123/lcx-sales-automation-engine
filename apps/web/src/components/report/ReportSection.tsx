import { ReactNode } from 'react';
import { SectionLabel } from '@/components/ui';

/** Subtle placeholder row for report sections with nothing to show. */
export function NoDataRow({ message = 'No data this period' }: { message?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-3 py-2.5 text-center text-xs italic text-grey">
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
        <SectionLabel as="h2">{title}</SectionLabel>
        {subtitle && <p className="mt-0.5 text-micro text-grey">{subtitle}</p>}
      </div>
      {empty ? <NoDataRow message={emptyMessage} /> : children}
    </section>
  );
}
