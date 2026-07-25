import { ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import { STAGE_LABELS, type DealStage } from '@lcx/shared';
import { fetchDealEvents, type BoardDeal } from '@/lib/api/bd';
import type { DealEvent } from '@/types/bd';
import { fmtMoneyCents, ownerInitials, packageLabel, relativeTime } from './dealFormat';
import { SectionLabel } from '@/components/ui';
import { useDismissible } from '@/hooks/useDismissible';

const STAGE_BADGE: Record<DealStage, string> = {
  not_started: 'bg-ice-soft text-grey dark:bg-ice-soft/10',
  contacted: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  discovery: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  proposal: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  negotiating: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  won: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  lost: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="shrink-0 text-micro text-grey">{label}</span>
      <span className="min-w-0 text-right text-label font-medium text-navy">{children}</span>
    </div>
  );
}

export interface DealDetailPanelProps {
  deal: BoardDeal;
  onClose: () => void;
}

/** Slide-out right panel with deal info + recent activity + link to the lead. */
export function DealDetailPanel({ deal, onClose }: DealDetailPanelProps) {
  const [visible, setVisible] = useState(false);
  const [events, setEvents] = useState<DealEvent[] | null>(null);

  // Enter animation: mount off-screen, slide in on the next frame.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useDismissible(true, onClose, 'deal panel');

  // Recent activity for this deal (best-effort; panel works without it).
  useEffect(() => {
    let cancelled = false;
    fetchDealEvents(deal.id)
      .then((res) => {
        if (!cancelled) setEvents(res.data.slice(0, 6));
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [deal.id]);

  const stage = deal.stage as DealStage;
  const initials = ownerInitials(deal.owner);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-navy/30 transition-opacity duration-200 dark:bg-black/50 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-label={`Deal details: ${deal.projectName}`}
        className={`fixed inset-y-0 right-0 z-50 flex w-96 max-w-full flex-col border-l border-line bg-card shadow-overlay transition-transform duration-200 ${visible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-bold text-navy">{deal.projectName}</h2>
              {deal.projectTicker && (
                <span className="shrink-0 rounded bg-ice-soft px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-navy dark:bg-ice-soft/10">
                  {deal.projectTicker}
                </span>
              )}
            </div>
            <span className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-micro font-bold uppercase tracking-wide ${STAGE_BADGE[stage] ?? STAGE_BADGE.not_started}`}>
              {STAGE_LABELS[stage] ?? deal.stage}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="shrink-0 rounded p-1 text-grey hover:bg-ice-soft hover:text-navy dark:hover:bg-ice-soft/10"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="divide-y divide-line/60">
            <Row label="Package">{packageLabel(deal.packageType)}</Row>
            <Row label="Value">
              <span className="num-tabular">{fmtMoneyCents(deal.packageValue)}</span>
            </Row>
            <Row label="Owner">
              {deal.owner ? (
                <span className="inline-flex items-center gap-1.5">
                  {initials && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ice-soft text-[8px] font-bold text-navy dark:bg-ice-soft/10">
                      {initials}
                    </span>
                  )}
                  <span className="truncate">{deal.owner}</span>
                </span>
              ) : (
                <span className="text-grey">Unassigned</span>
              )}
            </Row>
            <Row label="Band">
              <span className="uppercase">{deal.band}</span>
            </Row>
            <Row label="Priority score">
              <span className="num-tabular font-mono">P{deal.priorityScore}</span>
            </Row>
            <Row label="Days in stage">
              <span className="num-tabular">{deal.daysSinceUpdate}d</span>
            </Row>
            <Row label="Last activity">
              <span title={new Date(deal.updatedAt).toLocaleString()}>{relativeTime(deal.updatedAt)}</span>
            </Row>
            {deal.wonAt && <Row label="Won at">{new Date(deal.wonAt).toLocaleDateString()}</Row>}
          </div>

          <div className="mt-5">
            <SectionLabel as="h3" className="mb-2 block">Recent activity</SectionLabel>
            {events === null && (
              <div className="space-y-2" role="status" aria-label="Loading activity">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-8 animate-pulse rounded bg-ice-soft dark:bg-ice-soft/10" />
                ))}
              </div>
            )}
            {events !== null && events.length === 0 && <p className="text-micro text-grey">No activity recorded yet.</p>}
            {events !== null && events.length > 0 && (
              <ul className="space-y-2">
                {events.map((ev) => (
                  <li key={ev.id} className="rounded-lg border border-line bg-ice-soft/40 p-2 dark:bg-ice-soft/5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-micro font-semibold uppercase tracking-wide text-grey">
                        {ev.eventType.replace(/_/g, ' ')}
                      </span>
                      <span className="shrink-0 text-[9px] text-grey">{relativeTime(ev.createdAt)}</span>
                    </div>
                    {ev.content && <p className="mt-0.5 text-micro leading-snug text-navy">{ev.content}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="border-t border-line p-4">
          <Link
            to={`/bd-pipeline/${deal.projectId}`}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-navy px-3 py-2 text-label font-semibold text-white transition-opacity hover:opacity-90 dark:bg-ice dark:text-navy"
          >
            Open Lead <ArrowRight size={13} />
          </Link>
        </div>
      </aside>
    </>
  );
}
