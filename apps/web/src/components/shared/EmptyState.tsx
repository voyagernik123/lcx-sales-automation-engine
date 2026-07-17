import { ReactNode } from 'react';
import { Inbox, Search, CheckCircle2, AlertTriangle, Rocket } from 'lucide-react';

type EmptyVariant = 'default' | 'search' | 'done' | 'error' | 'launch';

interface EmptyStateProps {
  /** Explicit icon overrides `variant`. */
  icon?: ReactNode;
  /** Picks a context-appropriate default icon when `icon` is not given. */
  variant?: EmptyVariant;
  title: string;
  description?: string;
  action?: ReactNode;
}

const variantIcon: Record<EmptyVariant, ReactNode> = {
  default: <Inbox size={28} className="text-grey" />,
  search: <Search size={28} className="text-grey" />,
  done: <CheckCircle2 size={28} className="text-status-ready" />,
  error: <AlertTriangle size={28} className="text-status-blocked" />,
  launch: <Rocket size={28} className="text-status-unverified" />,
};

export function EmptyState({ icon, variant = 'default', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-ice-soft dark:bg-navy-deep flex items-center justify-center mb-4">
        {icon || variantIcon[variant]}
      </div>
      <h3 className="text-sm font-bold text-navy mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-grey-dark max-w-xs leading-relaxed mb-4">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
