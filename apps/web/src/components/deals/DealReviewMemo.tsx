import { useEffect, useState } from 'react';
import { Printer, X } from 'lucide-react';
import { STAGE_LABELS, type DealStage } from '@lcx/shared';
import type { BoardDeal } from '@/lib/api/bd';
import type { DealEvent } from '@/types/bd';
import type { DealHealth } from '@/lib/salesIntel';
import { fetchBatna, type Batna } from '@/lib/api/deals100x';
import { fmtMoneyCents, packageLabel } from './dealFormat';

/**
 * Deal Review memo — the print-ready "commit" artifact for a deal (the sales
 * analog of the regulatory briefs): summary, health & warnings, playbook
 * state, event history, signature line. Rendered as a light-fixed document in
 * a full-screen overlay; @media print isolates the memo (same approach as
 * BoardReport's PrintStyles, scoped locally because this prints from a modal).
 */

export interface DealReviewMemoProps {
  deal: BoardDeal;
  health: DealHealth | null;
  events: DealEvent[];
  /** Forecast win probability (0–100) when the deal matched the forecast payload. */
  winProbability?: number | null;
  onClose: () => void;
}

const SEVERITY_WORD: Record<number, string> = { 1: 'Advisory', 2: 'Attention', 3: 'Critical' };

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 14mm; }
  body * { visibility: hidden; }
  .drm-root, .drm-root * { visibility: visible; }
  .drm-root { position: absolute !important; inset: 0 !important; overflow: visible !important; padding: 0 !important; background: #fff !important; }
  .drm-doc { max-width: none !important; border: none !important; box-shadow: none !important; margin: 0 !important; }
  .drm-no-print { display: none !important; }
  .drm-section { break-inside: avoid; }
}
`;

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString() : '—';
}

function MemoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-200 py-1 text-[12px]">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{value}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-1.5 mt-5 border-b-2 border-slate-900 pb-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-900">
      {children}
    </h2>
  );
}

export function DealReviewMemo({ deal, health, events, winProbability, onClose }: DealReviewMemoProps) {
  const [batna, setBatna] = useState<Batna | null>(null);

  // Best-effort BATNA enrichment — the memo prints fine without it.
  useEffect(() => {
    let alive = true;
    fetchBatna(deal.id)
      .then(b => {
        if (alive) setBatna(b);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [deal.id]);

  useEffect(() => {
    // This memo opens from within the deal inspector, so both listen for
    // Escape. Capture-phase + stopPropagation means Esc closes only the memo
    // (topmost overlay) without also walking the inspector's trail back.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const stage = deal.stage as DealStage;
  const sortedEvents = [...events].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const doneSteps = health?.playbook.filter(s => s.status === 'done') ?? [];

  return (
    // The memo is a document artifact: fixed light palette so it reads/prints
    // identically in both app themes.
    <div className="drm-root fixed inset-0 z-[60] overflow-y-auto bg-slate-900/60 p-4 sm:p-8" role="dialog" aria-label={`Deal review memo: ${deal.projectName}`}>
      <style>{PRINT_CSS}</style>

      <div className="drm-doc mx-auto max-w-2xl rounded-lg bg-white p-8 text-slate-900 shadow-2xl">
        {/* Controls (screen only) */}
        <div className="drm-no-print mb-4 flex items-center justify-end gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-slate-700"
          >
            <Printer size={11} /> Print / PDF
          </button>
          <button
            onClick={onClose}
            aria-label="Close memo"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X size={15} />
          </button>
        </div>

        {/* Letterhead */}
        <header className="border-b-4 border-slate-900 pb-3">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-lg font-bold tracking-tight">
                LCX<span className="text-cyan-600">.</span> Deal Review
              </div>
              <div className="text-[11px] uppercase tracking-[0.15em] text-slate-500">
                Listing acquisition · internal memo
              </div>
            </div>
            <div className="text-right text-[11px] text-slate-500">
              Generated {new Date().toLocaleString()}
              <br />
              Ref {deal.id.slice(0, 8)}
            </div>
          </div>
        </header>

        {/* 1 · Deal summary */}
        <section className="drm-section">
          <SectionTitle>1 · Deal summary</SectionTitle>
          <MemoRow label="Project" value={`${deal.projectName}${deal.projectTicker ? ` (${deal.projectTicker})` : ''}`} />
          <MemoRow label="Stage" value={STAGE_LABELS[stage] ?? deal.stage} />
          <MemoRow label="Package" value={packageLabel(deal.packageType)} />
          <MemoRow label="Package value" value={fmtMoneyCents(deal.packageValue)} />
          <MemoRow label="Owner" value={deal.owner ?? 'Unassigned'} />
          <MemoRow label="Band / priority" value={`${deal.band.toUpperCase()} · P${deal.priorityScore}`} />
          <MemoRow label="Last movement" value={fmtDate(deal.updatedAt)} />
          {deal.wonAt && <MemoRow label="Won at" value={fmtDate(deal.wonAt)} />}
          {winProbability != null && <MemoRow label="Forecast win probability" value={`${Math.round(winProbability)}%`} />}
        </section>

        {/* 2 · Health & warnings */}
        <section className="drm-section">
          <SectionTitle>2 · Health &amp; warnings</SectionTitle>
          {!health ? (
            <p className="text-[12px] text-slate-500">Health could not be computed (no board context available).</p>
          ) : (
            <>
              <MemoRow
                label="Likelihood"
                value={`${health.likelihood.percentile}th percentile (${health.likelihood.band}) · score ${Math.round(health.likelihood.score)}/100`}
              />
              <MemoRow label="Momentum" value={`${health.momentum} — ${health.momentumDetail}`} />
              <MemoRow
                label="Days in stage"
                value={`${Math.floor(health.daysInStage)}d${health.stageMedianDays != null ? ` (stage median ${Math.round(health.stageMedianDays)}d)` : ''}`}
              />
              {health.warnings.length === 0 ? (
                <p className="mt-2 text-[12px] text-slate-600">No active warnings.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {health.warnings.map(w => (
                    <li key={w.code} className="rounded border border-slate-200 p-2 text-[12px]">
                      <span className="font-bold">
                        [{SEVERITY_WORD[w.severity]}] {w.label}
                      </span>
                      <span className="text-slate-600"> — {w.detail}</span>
                      <div className="text-slate-500">Mitigation: {w.mitigation}</div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        {/* 3 · Playbook state */}
        <section className="drm-section">
          <SectionTitle>3 · Listing playbook</SectionTitle>
          {!health ? (
            <p className="text-[12px] text-slate-500">Playbook state unavailable.</p>
          ) : (
            <div className="flex flex-wrap gap-2 text-[12px]">
              {health.playbook.map(step => (
                <span
                  key={step.key}
                  className={
                    step.status === 'done'
                      ? 'rounded bg-slate-900 px-2 py-0.5 font-medium text-white'
                      : 'rounded border border-slate-300 px-2 py-0.5 text-slate-500'
                  }
                >
                  {step.key} · {step.label}
                  {step.status === 'done' ? ' ✓' : ''}
                </span>
              ))}
              <span className="w-full text-slate-500">
                {doneSteps.length}/{health.playbook.length} steps complete.
              </span>
            </div>
          )}
        </section>

        {/* 4 · Negotiation figures (only when tracked) */}
        {batna && (
          <section className="drm-section">
            <SectionTitle>4 · Negotiation figures (BATNA)</SectionTitle>
            <MemoRow label="Our floor" value={fmtMoneyCents(batna.ourFloorCents)} />
            <MemoRow label="Their offer" value={fmtMoneyCents(batna.theirOfferCents)} />
            <MemoRow label="Competitor offer" value={fmtMoneyCents(batna.competitorOfferCents)} />
            {batna.notes && <MemoRow label="Notes" value={batna.notes} />}
          </section>
        )}

        {/* Event history */}
        <section className="drm-section">
          <SectionTitle>{batna ? '5' : '4'} · Event history</SectionTitle>
          {sortedEvents.length === 0 ? (
            <p className="text-[12px] text-slate-500">No events recorded.</p>
          ) : (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-2 font-semibold">Date</th>
                  <th className="py-1 pr-2 font-semibold">Event</th>
                  <th className="py-1 font-semibold">Detail</th>
                </tr>
              </thead>
              <tbody>
                {sortedEvents.map(ev => (
                  <tr key={ev.id} className="border-t border-slate-200 align-top">
                    <td className="whitespace-nowrap py-1 pr-2 text-slate-500">{fmtDate(ev.createdAt)}</td>
                    <td className="whitespace-nowrap py-1 pr-2 font-medium">
                      {ev.eventType.replace(/_/g, ' ')}
                      {ev.oldStage && ev.newStage ? ` (${ev.oldStage} → ${ev.newStage})` : ''}
                    </td>
                    <td className="py-1 text-slate-600">{ev.content ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Signature */}
        <footer className="drm-section mt-8 border-t border-slate-300 pt-4">
          <div className="grid grid-cols-2 gap-8 text-[11px] text-slate-600">
            <div>
              <div className="h-8 border-b border-slate-400" />
              <div className="mt-1">Prepared by · date</div>
            </div>
            <div>
              <div className="h-8 border-b border-slate-400" />
              <div className="mt-1">Reviewed by · date</div>
            </div>
          </div>
          <p className="mt-3 text-[10px] leading-snug text-slate-400">
            Internal working document generated from live pipeline data. Figures are tracking values only — this memo
            authorizes no payment, transfer, or listing decision by itself.
          </p>
        </footer>
      </div>
    </div>
  );
}
