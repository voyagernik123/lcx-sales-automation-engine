import { ReactNode } from 'react';
import { clsx } from 'clsx';

interface PageTitleProps {
  children: ReactNode;
  /** Optional leading icon (lucide element), e.g. <Briefcase size={20} /> */
  icon?: ReactNode;
  /** Optional right-aligned actions (buttons, toggles) */
  actions?: ReactNode;
  /** Optional secondary line under the title */
  subtitle?: ReactNode;
  className?: string;
}

/**
 * The single canonical page-header. Replaces every ad hoc <h1 className=...>
 * across the app so heading style is defined in exactly one place.
 */
export function PageTitle({ children, icon, actions, subtitle, className }: PageTitleProps) {
  return (
    <div className={clsx('flex items-start justify-between gap-3 mb-4', className)}>
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-lg font-bold text-navy truncate">
          {icon && <span className="shrink-0 text-grey">{icon}</span>}
          {children}
        </h1>
        {subtitle && <p className="mt-0.5 text-label text-grey">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
