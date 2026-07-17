import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { OPERATORS, ROLE_LABEL, useOperatorStore, type Operator } from '@/stores';
import { fetchDealBoard, fetchHandoffs } from '@/lib/api/bd';
import { getHealth } from '@/lib/apiClient';
import { computeReplySla } from '@/lib/salesIntel';
import { formatMoney } from '@/lib/format';

/**
 * The front door — a workstation boot manifest, not a login template.
 *
 * Composition (FINAL_MASTER_PLAN Part 3): asymmetric split. The left rail is
 * the SYSTEM — a live pre-flight ledger (session, desk state, clock) in the
 * same telemetry grammar as the workspace status bar. The right plane is the
 * PEOPLE — an operator roster with editorial type. Everything shown is real;
 * both themes are first-class because the page is built on the same tokens
 * as the workspace it opens.
 *
 * Keyboard-first: 1-5 signs in directly, ↑↓ roam the roster, Enter confirms.
 */

interface DeskPulse {
  pipelineCents: number;
  openDeals: number;
  repliesWaiting: number;
  worstSlaHours: number | null;
}

function useDeskPulse(): DeskPulse | null {
  const [pulse, setPulse] = useState<DeskPulse | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([fetchDealBoard(), fetchHandoffs({ status: 'open,in_progress', limit: 50 })]).then(
      ([board, handoffs]) => {
        if (cancelled) return;
        const next: DeskPulse = { pipelineCents: 0, openDeals: 0, repliesWaiting: 0, worstSlaHours: null };
        if (board.status === 'fulfilled') {
          const open = board.value.filter(d => d.stage !== 'won' && d.stage !== 'lost');
          next.openDeals = open.length;
          next.pipelineCents = open.reduce((s, d) => s + (d.packageValue ?? 0), 0);
        }
        if (handoffs.status === 'fulfilled') {
          const open = handoffs.value.data.filter(h => h.status === 'open');
          next.repliesWaiting = handoffs.value.meta.total;
          const worst = Math.max(0, ...open.map(h => computeReplySla(h.createdAt).ageHours));
          next.worstSlaHours = open.length > 0 ? worst : null;
        }
        setPulse(next);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return pulse;
}

/** One line of the pre-flight ledger: mono label left, tabular value right. */
function LedgerRow({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[5px]">
      <span className="font-mono text-[10px] uppercase tracking-wider text-grey">{label}</span>
      <span
        className={`num-tabular font-mono text-[11px] font-semibold ${
          tone === 'ok'
            ? 'text-emerald-600 dark:text-emerald-400'
            : tone === 'warn'
              ? 'text-amber-600 dark:text-amber-400'
              : tone === 'bad'
                ? 'text-red-600 dark:text-red-400'
                : 'text-navy'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function LedgerGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line/70 pt-3">
      <div className="mb-1 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-grey/70">{title}</div>
      {children}
    </div>
  );
}

export function SelectOperator() {
  const navigate = useNavigate();
  const setOperator = useOperatorStore(s => s.setOperator);
  const pulse = useDeskPulse();

  const [clock, setClock] = useState(() => new Date());
  const [latency, setLatency] = useState<number | null>(null);
  const [apiUp, setApiUp] = useState<boolean | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const iv = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const t0 = performance.now();
    getHealth()
      .then(() => {
        setLatency(Math.round(performance.now() - t0));
        setApiUp(true);
      })
      .catch(() => setApiUp(false));
  }, []);

  const pick = useCallback(
    (op: Operator) => {
      setOperator(op);
      navigate('/', { replace: true });
    },
    [navigate, setOperator],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const num = Number(e.key);
      if (num >= 1 && num <= OPERATORS.length) {
        e.preventDefault();
        pick(OPERATORS[num - 1]);
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIdx(i => {
          const next = (i + (e.key === 'ArrowDown' ? 1 : -1) + OPERATORS.length) % OPERATORS.length;
          rowRefs.current[next]?.focus();
          return next;
        });
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        pick(OPERATORS[focusIdx]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pick, focusIdx]);

  const utc = clock.toISOString().slice(11, 19);
  const dateTag = clock
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    .toUpperCase();

  return (
    <div className="flex min-h-screen flex-col bg-page text-navy antialiased lg:flex-row">
      {/* ─── System rail — the pre-flight ledger ─── */}
      <aside className="relative flex w-full shrink-0 flex-col border-b border-line bg-card px-7 py-6 lg:min-h-screen lg:w-[340px] lg:border-b-0 lg:border-r lg:px-8 lg:py-8">
        {/* Wordmark */}
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-navy font-mono text-[11px] font-bold tracking-tight text-card">
            LCX
          </span>
          <div className="leading-tight">
            <div className="text-[13px] font-bold tracking-tight text-navy">LCX USA</div>
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-grey">Launch Control</div>
          </div>
        </div>

        {/* The ledger */}
        <div className="mt-8 space-y-4">
          <LedgerGroup title="Session">
            <LedgerRow
              label="Environment"
              value={import.meta.env.PROD ? 'LIVE' : 'LOCAL'}
              tone={import.meta.env.PROD ? 'ok' : 'warn'}
            />
            <LedgerRow label="Build" value={`v${__APP_VERSION__}`} />
            <LedgerRow
              label="API"
              value={apiUp === null ? 'CHECKING…' : apiUp ? `UP · ${latency}MS` : 'UNREACHABLE'}
              tone={apiUp === null ? undefined : apiUp ? 'ok' : 'bad'}
            />
            <LedgerRow label="Access" value="SHARED DESK · SSO PLANNED" />
          </LedgerGroup>

          <LedgerGroup title="Desk state">
            <LedgerRow
              label="Open pipeline"
              value={pulse ? formatMoney(Math.round(pulse.pipelineCents / 100)) : '—'}
            />
            <LedgerRow label="Open deals" value={pulse ? String(pulse.openDeals) : '—'} />
            <LedgerRow
              label="Replies waiting"
              value={pulse ? String(pulse.repliesWaiting) : '—'}
              tone={pulse && pulse.repliesWaiting > 0 ? 'warn' : undefined}
            />
            <LedgerRow
              label="Worst reply age"
              value={pulse?.worstSlaHours != null ? `${Math.round(pulse.worstSlaHours)}H` : '—'}
              tone={pulse?.worstSlaHours != null && pulse.worstSlaHours > 4 ? 'bad' : undefined}
            />
          </LedgerGroup>
        </div>

        {/* Clock block — pinned to the rail's foot */}
        <div className="mt-auto hidden border-t border-line/70 pt-4 lg:block">
          <div className="num-tabular font-mono text-[22px] font-semibold tracking-tight text-navy">{utc}</div>
          <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-grey">
            Coordinated Universal Time
          </div>
        </div>
      </aside>

      {/* ─── People plane — the roster ─── */}
      <main className="flex flex-1 items-center justify-center px-6 py-12 lg:px-16">
        <div className="w-full max-w-xl">
          <div className="animate-fadeIn">
            <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-700 dark:text-cyan-400">
              <span className="h-1.5 w-1.5 animate-pulse-beacon rounded-full bg-cyan-600 dark:bg-cyan-400" />
              {dateTag} · The desk is live
            </div>
            <h1 className="mt-4 text-[40px] font-bold leading-[1.05] tracking-[-0.03em] text-navy sm:text-[48px]">
              Take your seat.
            </h1>
            <p className="mt-3 max-w-md text-[13px] leading-relaxed text-grey">
              Signing in attributes everything you do — handoffs you claim, stages you move, decisions you
              call. The desk remembers who did what.
            </p>
          </div>

          {/* Roster */}
          <div className="mt-9 overflow-hidden rounded-lg border border-line/80 bg-card shadow-card">
            {OPERATORS.map((op, i) => (
              <button
                key={op.id}
                ref={el => {
                  rowRefs.current[i] = el;
                }}
                onClick={() => pick(op)}
                onFocus={() => setFocusIdx(i)}
                onMouseEnter={() => setFocusIdx(i)}
                aria-label={`Sign in as ${op.name} — press ${i + 1}`}
                style={{ animationDelay: `${80 + i * 40}ms` }}
                className={`group animate-fadeIn relative flex w-full items-center gap-4 border-b border-line/60 px-5 py-3.5 text-left transition-colors duration-150 last:border-b-0 focus:outline-none ${
                  focusIdx === i ? 'bg-ice-soft/60 dark:bg-ice-soft/[0.07]' : 'hover:bg-ice-soft/40 dark:hover:bg-ice-soft/[0.05]'
                }`}
              >
                {/* Seat accent rail */}
                <span
                  className={`absolute left-0 top-0 h-full w-0.5 transition-opacity duration-150 ${
                    focusIdx === i ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{ backgroundColor: op.colorVar }}
                />
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[15px] font-bold text-white"
                  style={{ backgroundColor: op.colorVar }}
                >
                  {op.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold tracking-[-0.01em] text-navy">{op.name}</span>
                  <span className="mt-px block font-mono text-[9px] uppercase tracking-[0.18em] text-grey">
                    {ROLE_LABEL[op.role]}{op.role === 'approver' ? ' · signs off deals' : ''}
                  </span>
                </span>
                <kbd
                  className={`rounded border px-1.5 py-px font-mono text-[10px] transition-colors ${
                    focusIdx === i
                      ? 'border-grey-light text-navy dark:border-grey'
                      : 'border-line text-grey'
                  }`}
                >
                  {i + 1}
                </kbd>
                <ChevronRight
                  size={14}
                  className={`shrink-0 transition-all duration-150 ${
                    focusIdx === i ? 'translate-x-0 text-navy opacity-100' : '-translate-x-0.5 text-grey opacity-40'
                  }`}
                />
              </button>
            ))}
          </div>

          <div
            className="animate-fadeIn mt-5 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-grey/80"
            style={{ animationDelay: '300ms' }}
          >
            <span>1–5 sign in · ↑↓ move · enter confirm</span>
            <span className="hidden sm:inline">Internal · not legal advice</span>
          </div>
        </div>
      </main>
    </div>
  );
}

export default SelectOperator;
