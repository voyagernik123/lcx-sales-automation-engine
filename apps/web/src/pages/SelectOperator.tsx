import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OPERATORS, useOperatorStore, type Operator } from '@/stores';
import { fetchDealBoard, fetchHandoffs } from '@/lib/api/bd';
import { getHealth } from '@/lib/apiClient';
import { computeReplySla } from '@/lib/salesIntel';
import { formatMoney } from '@/lib/format';

/**
 * The front door — the boot screen of a running desk (FINAL_MASTER_PLAN
 * Part 3 identity: "the tool a listing desk would build for itself").
 *
 * Deliberately terminal-dark regardless of theme, the way a lock screen is
 * distinct from the desktop. Everything on it is real: the pipeline strip,
 * the SLA line, the API latency, the UTC clock. The desk is already live —
 * signing in is just taking a seat. Keyboard-first: 1-5 picks a seat,
 * arrows move, Enter confirms.
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

/** Fine blueprint grid + one restrained glow. Pure CSS, no assets. */
function Backdrop() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{ background: 'radial-gradient(ellipse 60% 100% at 50% 0%, rgba(34,211,238,0.07), transparent 70%)' }}
      />
    </>
  );
}

export function SelectOperator() {
  const navigate = useNavigate();
  const setOperator = useOperatorStore(s => s.setOperator);
  const pulse = useDeskPulse();

  const [clock, setClock] = useState(() => new Date());
  const [latency, setLatency] = useState<number | null>(null);
  const [apiUp, setApiUp] = useState<boolean | null>(null);
  const [focusIdx, setFocusIdx] = useState(2); // default seat: center
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);

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

  // Keyboard grammar: 1-5 direct, arrows roam, Enter confirms.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const num = Number(e.key);
      if (num >= 1 && num <= OPERATORS.length) {
        e.preventDefault();
        pick(OPERATORS[num - 1]);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setFocusIdx(i => {
          const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + OPERATORS.length) % OPERATORS.length;
          cardRefs.current[next]?.focus();
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pick]);

  const utc = clock.toISOString().slice(11, 19);
  const dateLine = useMemo(
    () =>
      clock.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    [clock],
  );

  const vitals: Array<{ label: string; value: string }> = [
    { label: 'open pipeline', value: pulse ? formatMoney(Math.round(pulse.pipelineCents / 100)) : '—' },
    { label: 'open deals', value: pulse ? String(pulse.openDeals) : '—' },
    { label: 'replies waiting', value: pulse ? String(pulse.repliesWaiting) : '—' },
    {
      label: 'worst reply age',
      value: pulse?.worstSlaHours != null ? `${Math.round(pulse.worstSlaHours)}h` : '—',
    },
  ];

  return (
    <div className="dark relative flex min-h-screen flex-col overflow-hidden bg-[#0b1220] font-sans text-slate-200 antialiased">
      <Backdrop />

      {/* Top strip — the same telemetry grammar as the workspace status bar */}
      <header className="relative z-10 flex h-11 items-center gap-4 border-b border-white/[0.06] px-5 font-mono text-[10px] tracking-wider text-slate-500">
        <span className="text-[13px] font-bold tracking-tight text-white">LCX USA</span>
        <span className="hidden uppercase sm:inline">Launch Control</span>
        <span className="ml-auto flex items-center gap-1.5" title={apiUp === false ? 'API unreachable' : 'API connected'}>
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              apiUp === null ? 'bg-slate-600' : apiUp ? 'bg-emerald-400' : 'animate-pulse-beacon bg-red-500'
            }`}
          />
          {apiUp === false ? 'API DOWN' : latency !== null ? `API ${latency}MS` : 'API'}
        </span>
        <span className="num-tabular">{utc} UTC</span>
        <span className="flex items-center gap-1.5 rounded border border-white/10 px-1.5 py-0.5">
          <span className={`h-1.5 w-1.5 rounded-full ${import.meta.env.PROD ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          {import.meta.env.PROD ? 'LIVE' : 'LOCAL'}
        </span>
      </header>

      {/* Center — the seats */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-3xl">
          <div className="animate-fadeIn text-center" style={{ animationDelay: '0ms' }}>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-400/90">
              {dateLine} · desk brief ready
            </div>
            <h1 className="mt-3 text-[34px] font-bold leading-tight tracking-[-0.02em] text-white">
              The desk is live.
            </h1>
            <p className="mt-1.5 text-[13px] text-slate-400">Take your seat.</p>
          </div>

          {/* Live vitals — real numbers, or quiet dashes when the API is out */}
          <div
            className="animate-fadeIn mx-auto mt-8 flex max-w-xl items-stretch justify-center divide-x divide-white/[0.07] rounded-lg border border-white/[0.07] bg-white/[0.02]"
            style={{ animationDelay: '60ms' }}
          >
            {vitals.map(v => (
              <div key={v.label} className="flex-1 px-4 py-3 text-center">
                <div className="num-tabular font-mono text-[17px] font-semibold text-white">{v.value}</div>
                <div className="mt-0.5 whitespace-nowrap font-mono text-[9px] uppercase tracking-wider text-slate-500">
                  {v.label}
                </div>
              </div>
            ))}
          </div>

          {/* Seats */}
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {OPERATORS.map((op, i) => (
              <button
                key={op.id}
                ref={el => {
                  cardRefs.current[i] = el;
                }}
                onClick={() => pick(op)}
                onFocus={() => setFocusIdx(i)}
                aria-label={`Sign in as ${op.name} — press ${i + 1}`}
                style={{ animationDelay: `${100 + i * 45}ms`, ['--seat' as string]: op.colorVar }}
                className={`group animate-fadeIn relative flex flex-col items-center gap-3 rounded-lg border bg-white/[0.02] px-4 pb-3.5 pt-5 transition-all duration-150 hover:-translate-y-0.5 hover:bg-white/[0.05] focus:outline-none ${
                  focusIdx === i ? 'border-[color:var(--seat)]' : 'border-white/[0.08] hover:border-white/20'
                }`}
              >
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-lg text-[17px] font-bold text-white transition-transform duration-150 group-hover:scale-105"
                  style={{ backgroundColor: op.colorVar }}
                >
                  {op.initials}
                </span>
                <span className="text-[13px] font-semibold text-slate-100">{op.name}</span>
                <kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-px font-mono text-[10px] text-slate-500 transition-colors group-hover:text-slate-300">
                  {i + 1}
                </kbd>
              </button>
            ))}
          </div>

          <p
            className="animate-fadeIn mt-6 text-center font-mono text-[10px] uppercase tracking-wider text-slate-600"
            style={{ animationDelay: '340ms' }}
          >
            1–5 select · ←→ move · enter sign in
          </p>
        </div>
      </main>

      {/* Bottom strip — same compliance frame as the workspace */}
      <footer className="relative z-10 flex h-9 items-center gap-4 border-t border-white/[0.06] px-5 font-mono text-[10px] tracking-wide text-slate-600">
        <span>SHARED DESK LOGIN · SSO PLANNED</span>
        <span className="ml-auto hidden truncate sm:inline">
          INTERNAL · NOT LEGAL ADVICE · US COUNSEL SIGN-OFF REQUIRED
        </span>
        <span>v{__APP_VERSION__}</span>
      </footer>
    </div>
  );
}

export default SelectOperator;
