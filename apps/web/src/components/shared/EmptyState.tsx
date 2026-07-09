import { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-ice-soft dark:bg-navy-deep flex items-center justify-center mb-4">
        {icon || <Inbox size={28} className="text-grey" />}
      </div>
      <h3 className="text-sm font-bold text-navy dark:text-ice mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-grey-dark dark:text-grey-light max-w-xs leading-relaxed mb-4">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
