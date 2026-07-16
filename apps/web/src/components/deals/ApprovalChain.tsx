import { Check, ChevronRight, Clock, X } from 'lucide-react';
import { clsx } from 'clsx';

/**
 * Visual approval chain (Deal Desk): the ordered escalation steps of an
 * approval request rendered as connected role pills with per-step status.
 *
 * The list endpoint (/v1/dealdesk/approvals) does not embed steps — only the
 * decide response does — so the component degrades to a single request-level
 * pill until the first decision hydrates the chain.
 */

export interface ApprovalChainStep {
  id: string;
  role: string;
  status: string;
  decidedBy: string | null;
}

export interface ApprovalChainProps {
  steps?: ApprovalChainStep[];
  /** Request-level status — the fallback pill when steps are unknown. */
  requestStatus: string;
  className?: string;
}

function stepIcon(status: string) {
  if (status === 'approved') return <Check size={9} strokeWidth={3} aria-hidden="true" />;
  if (status === 'rejected') return <X size={9} strokeWidth={3} aria-hidden="true" />;
  return <Clock size={9} aria-hidden="true" />;
}

function stepCls(status: string): string {
  if (status === 'approved') return 'border-status-ready/40 bg-status-ready-bg text-status-ready';
  if (status === 'rejected') return 'border-status-blocked/40 bg-status-blocked-bg text-status-blocked';
  if (status === 'pending') return 'border-status-conditional/40 bg-status-conditional-bg text-status-conditional';
  return 'border-line bg-ice-soft text-grey dark:bg-ice-soft/10';
}

export function ApprovalChain({ steps, requestStatus, className }: ApprovalChainProps) {
  if (!steps || steps.length === 0) {
    return (
      <div className={clsx('flex flex-wrap items-center gap-1', className)}>
        <span className={clsx('inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase', stepCls(requestStatus))}>
          {stepIcon(requestStatus)} chain {requestStatus}
        </span>
        <span className="text-[9px] text-grey">step detail arrives with the first decision</span>
      </div>
    );
  }

  return (
    <div className={clsx('flex flex-wrap items-center gap-0.5', className)} role="list" aria-label="Approval chain">
      {steps.map((s, i) => (
        <span key={s.id} role="listitem" className="inline-flex items-center gap-0.5">
          {i > 0 && <ChevronRight size={9} className="text-grey" aria-hidden="true" />}
          <span
            title={`${s.role} — ${s.status}${s.decidedBy ? ` by ${s.decidedBy}` : ''}`}
            className={clsx(
              'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase',
              stepCls(s.status),
            )}
          >
            {stepIcon(s.status)} {s.role}
          </span>
        </span>
      ))}
    </div>
  );
}
