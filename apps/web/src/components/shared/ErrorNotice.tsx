import { useState } from 'react';
import { AlertTriangle, Ban, Clock, Lock, RefreshCw, WifiOff, GitMerge } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { classifyError, type ClassifiedError, type ErrorKind } from '@/lib/errors';
import { Button } from '@/components/ui';

/**
 * The one way errors appear on a surface (plan 5.1): classified kind,
 * designed copy, a retry affordance when retrying makes sense, and the raw
 * detail folded behind "fine print". Raw error strings on screen are a
 * release blocker — render this instead.
 */

const KIND_ICON: Record<ErrorKind, LucideIcon> = {
  auth: Lock,
  permission: Ban,
  validation: AlertTriangle,
  conflict: GitMerge,
  'rate-limit': Clock,
  network: WifiOff,
  system: AlertTriangle,
};

export interface ErrorNoticeProps {
  error: unknown;
  onRetry?: () => void;
  /** Compact single-row variant for inline banners. */
  compact?: boolean;
}

export function ErrorNotice({ error, onRetry, compact }: ErrorNoticeProps) {
  const c: ClassifiedError = classifyError(error);
  const [showDetail, setShowDetail] = useState(false);
  const Icon = KIND_ICON[c.kind];

  if (compact) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
        <Icon size={14} className="shrink-0 text-red-500" />
        <span className="min-w-0 flex-1 truncate text-label text-navy" title={c.detail}>
          <span className="font-semibold">{c.title}.</span> {c.message}
        </span>
        {c.retryable && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="flex shrink-0 items-center gap-1 text-micro font-bold text-navy hover:text-cyan-700 dark:hover:text-cyan-400"
          >
            <RefreshCw size={11} /> Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-10 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10">
        <Icon size={18} className="text-red-500" />
      </span>
      <h3 className="mt-3 text-[15px] font-bold text-navy">{c.title}</h3>
      <p className="mt-1 text-label leading-relaxed text-grey">{c.message}</p>
      <div className="mt-4 flex items-center gap-2">
        {c.retryable && onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            <RefreshCw size={12} /> Retry
          </Button>
        )}
        {c.detail && (
          <button
            type="button"
            onClick={() => setShowDetail(d => !d)}
            className="text-micro font-semibold text-grey hover:text-navy"
          >
            {showDetail ? 'Hide' : 'Fine print'}
          </button>
        )}
      </div>
      {showDetail && c.detail && (
        <p className="mt-3 max-w-full break-words rounded-md border border-line bg-ice-soft/40 px-3 py-2 font-mono text-micro text-grey dark:bg-ice-soft/10">
          {c.detail}
        </p>
      )}
    </div>
  );
}
