import { useCallback, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { CheckCircle2, MessageSquare, StickyNote, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui';
import { ConfirmDialog } from '@/components/shared';
import { BandBadge, ScoreBadge } from '@/components/bd/ScoreBadge';
import { computeReplySla, SLA_CLS } from '@/lib/salesIntel';
import type { QueueLead, SnoozeOpts } from '@/lib/api/queue';
import { SnoozeMenu } from './SnoozeMenu';
import { DisqualifyDialog } from './DisqualifyDialog';
import {
  SESSION_STATS_KEY,
  formatAgeHours,
  isTypingTarget,
  mergeSessionStats,
  readJson,
  todayKey,
  writeJson,
  type SessionStats,
} from './logic';
import { useDismissible } from '@/hooks/useDismissible';

interface SessionModeProps {
  /** Snapshot of the split taken when the session started. */
  leads: QueueLead[];
  splitLabel: string;
  clarityEnacted: boolean;
  /** id → inbound reply ISO (Hot replies) — renders the SLA context. */
  slaBy?: Record<string, string>;
  /** id → one-line last-touch / why-it's-here context. */
  contextBy?: Record<string, string>;
  onClose: () => void;
  /** Action handlers resolve true on success (advance) / false on failure (stay). */
  onSnooze: (lead: QueueLead, opts: SnoozeOpts) => Promise<boolean>;
  onDisqualify: (lead: QueueLead, reason: string) => Promise<boolean>;
  onEnroll: (lead: QueueLead) => Promise<boolean>;
  /** Open the full dossier — ends the session first. */
  onOpen: (id: string) => void;
}

type Counts = { enrolled: number; snoozed: number; disqualified: number; skipped: number };

const ZERO: Counts = { enrolled: 0, snoozed: 0, disqualified: 0, skipped: 0 };

/**
 * Focus Session — Apollo-task-queue × Superhuman-inbox-zero: one lead per
 * screen, big action buttons mirroring the triage keys, "14 of 40" progress,
 * and an end-of-session recap that feeds the Home quota ring via
 * localStorage ('lcx-os:session-stats:v1').
 */
export function SessionMode({
  leads,
  splitLabel,
  clarityEnacted,
  slaBy,
  contextBy,
  onClose,
  onSnooze,
  onDisqualify,
  onEnroll,
  onOpen,
}: SessionModeProps) {
  const [idx, setIdx] = useState(0);
  const [counts, setCounts] = useState<Counts>(ZERO);
  const [phase, setPhase] = useState<'run' | 'done'>(leads.length ? 'run' : 'done');
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [dqOpen, setDqOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const countsRef = useRef(counts);
  countsRef.current = counts;
  const finalized = useRef(false);

  const lead: QueueLead | undefined = leads[idx];
  const worked = counts.enrolled + counts.snoozed + counts.disqualified + counts.skipped;

  /** Write cumulative counts into the Home-agent contract exactly once. */
  const finalize = useCallback(() => {
    if (finalized.current) return;
    finalized.current = true;
    const c = countsRef.current;
    const workedNow = c.enrolled + c.snoozed + c.disqualified + c.skipped;
    if (workedNow === 0) return;
    const existing = readJson<SessionStats | null>(SESSION_STATS_KEY, null);
    writeJson(
      SESSION_STATS_KEY,
      mergeSessionStats(
        existing,
        { worked: workedNow, enrolled: c.enrolled, snoozed: c.snoozed, disqualified: c.disqualified },
        todayKey(),
      ),
    );
  }, []);

  useEffect(() => {
    if (phase === 'done') finalize();
  }, [phase, finalize]);

  const advance = useCallback(
    (key: keyof Counts) => {
      setCounts(c => ({ ...c, [key]: c[key] + 1 }));
      setIdx(i => {
        if (i + 1 >= leads.length) {
          setPhase('done');
          return i;
        }
        return i + 1;
      });
    },
    [leads.length],
  );

  const act = useCallback(
    async (fn: () => Promise<boolean>, key: keyof Counts) => {
      setBusy(true);
      try {
        const ok = await fn();
        if (ok) advance(key);
      } finally {
        setBusy(false);
      }
    },
    [advance],
  );

  const openDossier = useCallback(() => {
    if (!lead) return;
    finalize();
    onOpen(lead.id);
  }, [lead, finalize, onOpen]);

  // Escape steps out of the session one rung at a time: mid-session it ends the
  // run and shows the summary, and from the summary it closes. The sub-dialog
  // guard below is still needed for the LETTER keys, but no longer for Escape —
  // an open snooze menu is above this on the stack, so it takes the press first.
  useDismissible(
    true,
    () => {
      if (phase === 'done') onClose();
      else if (!busy && lead) setPhase('done');
    },
    'lead session',
  );

  /* Session-scope keyboard grammar. Sub-dialogs own their keys while open. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (snoozeOpen || dqOpen || enrollOpen) return;
      if (phase === 'done') {
        if (e.key === 'Enter') {
          e.preventDefault();
          onClose();
        }
        return;
      }
      if (busy || !lead) return;
      switch (e.key) {
        case 's':
        case 'S':
          e.preventDefault();
          setSnoozeOpen(true);
          break;
        case 'd':
        case 'D':
          e.preventDefault();
          setDqOpen(true);
          break;
        case 'e':
        case 'E':
          e.preventDefault();
          setEnrollOpen(true);
          break;
        case 'j':
        case 'J':
        case 'ArrowRight':
          e.preventDefault();
          advance('skipped');
          break;
        case 'Enter':
          e.preventDefault();
          openDossier();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, busy, lead, snoozeOpen, dqOpen, enrollOpen, advance, onClose, openDossier]);

  const pct = leads.length ? Math.round(((phase === 'done' ? leads.length : idx) / leads.length) * 100) : 100;
  const sla = lead && slaBy?.[lead.id] ? computeReplySla(slaBy[lead.id]) : null;
  const context = lead ? contextBy?.[lead.id] : undefined;
  const reasons = lead?.reasons?.slice(0, 4) ?? [];

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-card text-navy" role="dialog" aria-label="Focus session">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-5 py-2.5 border-b border-line">
        <span className="flex items-center gap-1.5 text-sm font-bold">
          <span className="h-2 w-2 rounded-full bg-cyan-500" />
          Session — {splitLabel}
        </span>
        <span className="ml-auto text-xs font-mono num-tabular text-grey">
          {phase === 'done' ? `${worked} of ${leads.length} worked` : `${idx + 1} of ${leads.length}`}
        </span>
        <span className="text-micro text-grey hidden sm:inline">
          <kbd className="rounded border border-line bg-ice-soft dark:bg-navy-deep px-1.5 font-mono font-medium text-navy leading-4">Esc</kbd> end
        </span>
        <button
          onClick={() => (phase === 'done' ? onClose() : setPhase('done'))}
          className="rounded p-1 text-grey hover:text-navy hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors"
          aria-label="End session"
        >
          <X size={16} />
        </button>
      </div>
      <div className="shrink-0 h-0.5 bg-line">
        <div className="h-0.5 bg-cyan-500 transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>

      {phase === 'run' && lead ? (
        <div className="flex-1 overflow-auto flex items-start justify-center px-4 py-8">
          <div className="w-full max-w-2xl">
            {/* Identity */}
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-bold truncate">{lead.name}</h2>
              {lead.ticker && <span className="text-sm font-mono text-grey">{lead.ticker}</span>}
              <BandBadge band={lead.band} />
            </div>
            <p className="text-micro text-grey font-mono mb-4">
              {lead.source}
              {lead.category ? ` · ${lead.category}` : ''}
              {lead.jurisdiction ? ` · ${lead.jurisdiction}` : ''}
            </p>

            {/* Numbers row — each carries its why in the title */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span
                className="inline-flex h-6 items-center rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 text-xs font-semibold text-navy font-mono num-tabular"
                title="Priority = propensity × eligibility gate"
              >
                Priority {lead.priorityScore ?? '—'}
              </span>
              <span
                className="inline-flex h-6 items-center rounded border border-line/70 px-2 text-xs font-mono num-tabular text-grey"
                title="Propensity to pay for a listing, 0–100"
              >
                Propensity {lead.propensityScore ?? '—'}
              </span>
              <span className="flex items-center gap-1 text-xs text-grey">
                EU <ScoreBadge score={lead.euScore} band={lead.band} size="sm" />
              </span>
              <span className="flex items-center gap-1 text-xs text-grey">
                {clarityEnacted ? 'US (Post)' : 'US (Pre)'}{' '}
                <ScoreBadge score={clarityEnacted ? lead.usPostScore : lead.usPreScore} band={lead.band} size="sm" />
              </span>
              <span className="text-xs text-grey" title="Verified contacts / people known">
                Contacts {lead.verifiedContactCount}/{lead.peopleCount}
              </span>
              {sla && (
                <span
                  className={clsx('text-xs font-bold font-mono', SLA_CLS[sla.state])}
                  title={`Reply waiting ${formatAgeHours(sla.ageHours)} of a ${sla.budgetHours}h budget`}
                >
                  ● {sla.state} · {formatAgeHours(sla.ageHours)}/{sla.budgetHours}h
                </span>
              )}
            </div>

            {/* Last-touch context */}
            {context && (
              <div className="flex items-start gap-2 rounded border border-line bg-ice-soft dark:bg-navy-deep px-3 py-2 mb-4">
                <MessageSquare size={13} className="text-cyan-500 mt-0.5 shrink-0" />
                <p className="text-xs leading-snug">{context}</p>
              </div>
            )}

            {/* Why this score */}
            <div className="rounded border border-line px-3 py-2 mb-6">
              <p className="text-micro font-bold uppercase tracking-wider text-grey mb-1.5">Why this score</p>
              {reasons.length > 0 ? (
                <ul className="space-y-1">
                  {reasons.map(r => (
                    <li key={r.code} className="flex items-baseline gap-2 text-xs">
                      <span
                        className={clsx(
                          'font-mono font-bold w-9 shrink-0 text-right',
                          r.points >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                        )}
                      >
                        {r.points >= 0 ? `+${r.points}` : r.points}
                      </span>
                      <span className="font-semibold">{r.factor}</span>
                      <span className="text-grey truncate">{r.note}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-grey flex items-center gap-1.5">
                  <StickyNote size={12} /> Reason trail not on this payload — open the dossier for the full trail.
                </p>
              )}
            </div>

            {/* Action grid — mirrors the triage keys */}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="md" disabled={busy} onClick={() => setEnrollOpen(true)}>
                <Zap size={14} /> Enroll
                <kbd className="rounded border border-white/30 px-1 font-mono text-micro">E</kbd>
              </Button>
              <Button size="md" variant="secondary" disabled={busy} onClick={() => setSnoozeOpen(true)}>
                Snooze <kbd className="rounded border border-line px-1 font-mono text-micro">S</kbd>
              </Button>
              <Button size="md" variant="secondary" disabled={busy} onClick={() => setDqOpen(true)}>
                Disqualify <kbd className="rounded border border-line px-1 font-mono text-micro">D</kbd>
              </Button>
              <Button size="md" variant="ghost" disabled={busy} onClick={() => advance('skipped')}>
                Skip <kbd className="rounded border border-line px-1 font-mono text-micro">J</kbd>
              </Button>
              <Button size="md" variant="ghost" disabled={busy} onClick={openDossier}>
                Open dossier <kbd className="rounded border border-line px-1 font-mono text-micro">↵</kbd>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* END screen — recap */
        <div className="flex-1 overflow-auto flex items-center justify-center px-4">
          <div className="w-full max-w-md text-center">
            <CheckCircle2 size={40} className="mx-auto mb-3 text-status-ready" />
            <h2 className="text-xl font-bold mb-1">
              {leads.length > 0 && worked >= leads.length ? 'Queue zero — session complete' : 'Session ended'}
            </h2>
            <p className="text-xs text-grey mb-5">
              {leads.length > 0 && worked >= leads.length
                ? 'Every lead in this split got a decision.'
                : `${worked} of ${leads.length} leads got a decision.`}
            </p>
            <div className="grid grid-cols-4 gap-2 mb-5">
              {(
                [
                  ['Worked', worked],
                  ['Enrolled', counts.enrolled],
                  ['Snoozed', counts.snoozed],
                  ['Disqualified', counts.disqualified],
                ] as const
              ).map(([label, n]) => (
                <div key={label} className="rounded-lg border border-line bg-card shadow-card px-2 py-3">
                  <p className="text-xl num-hero num-tabular font-mono">{n}</p>
                  <p className="mt-0.5 text-micro font-medium text-grey uppercase tracking-wider">{label}</p>
                </div>
              ))}
            </div>
            <p className="text-micro text-grey mb-4">Counts roll into today's tally on Home.</p>
            <Button size="sm" onClick={onClose}>
              Done <kbd className="rounded border border-white/30 px-1 font-mono text-micro">Esc</kbd>
            </Button>
          </div>
        </div>
      )}

      {/* Sub-dialogs */}
      {lead && (
        <>
          <SnoozeMenu
            open={snoozeOpen}
            leadName={lead.name}
            onClose={() => setSnoozeOpen(false)}
            onSnooze={opts => {
              setSnoozeOpen(false);
              void act(() => onSnooze(lead, opts), 'snoozed');
            }}
          />
          <DisqualifyDialog
            open={dqOpen}
            leadName={lead.name}
            onClose={() => setDqOpen(false)}
            onConfirm={reason => {
              setDqOpen(false);
              void act(() => onDisqualify(lead, reason), 'disqualified');
            }}
          />
          <ConfirmDialog
            isOpen={enrollOpen}
            onClose={() => setEnrollOpen(false)}
            onConfirm={() => void act(() => onEnroll(lead), 'enrolled')}
            title={`Enroll ${lead.name}?`}
            message="Starts the default outreach sequence for this project's best contact. The eligibility gate may still refuse — the refusal reason will surface as a toast."
            confirmLabel="Enroll"
          />
        </>
      )}
    </div>
  );
}
