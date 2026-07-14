import { ReactNode } from 'react';
import { clsx } from 'clsx';

interface SectionLabelProps {
  children: ReactNode;
  className?: string;
  /** Render as a specific element (default span). */
  as?: 'span' | 'h2' | 'h3' | 'div';
}

/**
 * The recurring uppercase/tracked mini-label used for card headers and
 * inline section titles. Consolidates the duplicated
 * `text-[11px] font-bold uppercase tracking-wider text-grey` pattern.
 */
export function SectionLabel({ children, className, as: Tag = 'span' }: SectionLabelProps) {
  return (
    <Tag className={clsx('text-micro font-bold uppercase tracking-wider text-grey', className)}>
      {children}
    </Tag>
  );
}
