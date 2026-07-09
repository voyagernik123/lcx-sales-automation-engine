import { clsx } from 'clsx';

type StatusType = 'ready' | 'conditional' | 'blocked' | 'deferred' | 'unverified';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  status?: StatusType;
  hoverable?: boolean;
}

const statusBorderMap: Record<StatusType, string> = {
  ready: 'border-l-status-ready',
  conditional: 'border-l-status-conditional',
  blocked: 'border-l-status-blocked',
  deferred: 'border-l-status-deferred',
  unverified: 'border-l-status-unverified',
};

export function Card({ children, className, status, hoverable }: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-lg border border-line bg-card shadow-sm transition-all duration-200',
        status && 'border-l-4',
        status && statusBorderMap[status],
        hoverable && 'hover:shadow-md hover:border-grey-light hover:-translate-y-[1px]',
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('px-4 py-3 border-b border-line font-mono text-[11px] font-bold uppercase tracking-wider text-grey-dark dark:text-grey-light', className)}>
      {children}
    </div>
  );
}

export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx('px-4 py-3', className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('px-4 py-2.5 border-t border-line bg-ice-soft/40 dark:bg-navy-deep/20 text-xs font-medium text-grey', className)}>
      {children}
    </div>
  );
}

