import { useCallback, useEffect, useRef, useState } from 'react';
import { Gauge, SlidersHorizontal, TrendingUp, Lock } from 'lucide-react';
import {
  fetchReadiness, lpRescore, runWaitlistSim, fetchCommandDeep,
  type Readiness, type LpRescoreResult, type WaitlistSimOut, type CommandDeep,
} from '@/lib/api/command';
import { clsx } from 'clsx';

/**
 * Cockpit panels (100X Phase 3) — the Phase-2 engines as live instruments:
 * the program-readiness dial, the LP optimizer with weight sliders + rank-flip
 * sensitivity, and the funnel simulator with budget sliders. Every what-if is
 * an overlay — stored truth never changes from here.
 */

/* ── Readiness dial header ── */
export function ReadinessDial() {
  const [r, setR] = useState<Readiness | null>(null);
  useEffect(() => { fetchReadiness().then(setR).catch(() => setR(null)); }, []);
  if (!r) return null;
  const angle = (r.score / 100) * 270 - 135;
  const tone = r.score >= 70 ? 'text-emerald-500' : r.score >= 40 ? 'text-amber-500' : 'text-red-500';
  return (
    <section className="br-section rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-6">
        <div className="relative h-28 w-28 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full">
            <path d="M 15 78 A 40 40 0 1 1 85 78" fill="none" strokeWidth="8" className="stroke-line" strokeLinecap="round" />
            <path d="M 15 78 A 40 40 0 1 1 85 78" fill="none" strokeWidth="8" strokeLinecap="round"
              className={clsx('transition-all', tone.replace('text-', 'stroke-'))}
              strokeDasharray={`${(r.score / 100) * 188.5} 300`} />
            <line x1="50" y1="50" x2="50" y2="18" strokeWidth="2.5" strokeLinecap="round"
              className={tone.replace('text-', 'stroke-')} transform={`rotate(${angle} 50 50)`} />
            <circle cx="50" cy="50" r="3.5" className={tone.replace('text-', 'fill-')} />
          </svg>
          <div className="absolute inset-x-0 bottom-0 text-center">
            <span className={clsx('font-mono text-h2 font-bold', tone)}>{r.score}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
            <Gauge size={12} /> Launch readiness — composite of five weighted dials
          </div>
          <div className="grid gap-2 sm:grid-cols-5">
            {r.dials.map((d) => (
              <div key={d.key} className="rounded border border-line/70 p-2">
                <div className="flex items-baseline justify-between">
                  <span className="truncate text-micro text-grey">{d.label}</span>
                  <span className="font-mono text-micro text-grey/70">×{d.weight}</span>
                </div>
                <div className="font-mono text-label font-bold text-navy">{d.score}</div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-ice-soft dark:bg-ice-soft/10">
                  <div className={clsx('h-full rounded-full', d.score >= 70 ? 'bg-emerald-500' : d.score >= 40 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${d.score}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── LP optimizer — weight sliders → live re-rank + sensitivity ── */
export function LpOptimizerPanel() {
  const [res, setRes] = useState<LpRescoreResult | null>(null);
  const [weights, setWeights] = useState<Record<string, number> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback((w?: Record<string, number>) => {
    lpRescore(w).then(setRes).catch(() => setRes(null));
  }, []);
  useEffect(() => { run(); }, [run]);

  const onSlide = (key: string, v: number) => {
    const next = { ...(weights ?? Object.fromEntries((res?.dimensions ?? []).map((d) => [d.key, d.weight]))), [key]: v };
    setWeights(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => run(next), 250);
  };

  if (!res) return null;
  const current = weights ?? Object.fromEntries(res.dimensions.map((d) => [d.key, d.weight]));
  return (
    <section className="br-section rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
        <SlidersHorizontal size={12} /> LP optimizer — live weights, live rank
        {weights && (
          <button onClick={() => { setWeights(null); run(); }} className="ml-auto text-micro font-semibold text-cyan-600 hover:underline dark:text-cyan-400">
            Reset to strategy weights
          </button>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          {res.dimensions.map((d) => (
            <div key={d.key} className="flex items-center gap-2">
              <span className="w-40 shrink-0 truncate text-micro text-grey-dark" title={d.label}>{d.label}</span>
              <input
                type="range" min={0} max={0.4} step={0.01}
                value={current[d.key] ?? d.weight}
                onChange={(e) => onSlide(d.key, Number(e.target.value))}
                className="min-w-0 flex-1 accent-cyan-500"
                aria-label={`Weight of ${d.label}`}
              />
              <span className="w-10 shrink-0 text-right font-mono text-micro text-navy">{(current[d.key] ?? d.weight).toFixed(2)}</span>
            </div>
          ))}
          <p className="pt-1 text-[10px] text-grey">Weights renormalize to 1.0 — a pure what-if; the strategy's authored weights stay stored truth.</p>
        </div>
        <div>
          <div className="space-y-1">
            {res.rows.slice(0, 6).map((r) => (
              <div key={r.subjectId} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center font-mono text-micro font-bold text-grey">{r.rank}</span>
                <span className="min-w-0 flex-1 truncate text-label font-medium text-navy">{r.subjectLabel}</span>
                <div className="h-2.5 w-28 shrink-0 overflow-hidden rounded-full bg-ice-soft dark:bg-ice-soft/10">
                  <div className="h-full rounded-full bg-cyan-500" style={{ width: `${(r.weighted / 5) * 100}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-label font-bold text-navy">{r.weighted.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-line/60 pt-2">
            <div className="mb-1 text-micro font-bold uppercase tracking-wider text-grey">Rank-flip sensitivity (authored weights)</div>
            {res.sensitivity.filter((s) => s.flipWeight !== null).length === 0 ? (
              <p className="text-micro text-emerald-600 dark:text-emerald-400">Robust: no single dimension weight in [0, 0.6] flips #1 — the pick survives perturbation.</p>
            ) : (
              res.sensitivity.filter((s) => s.flipWeight !== null).slice(0, 3).map((s) => (
                <p key={s.dimKey} className="text-micro text-grey-dark">{s.dimLabel}: #1/#2 tie at weight {s.flipWeight}</p>
              ))
            )}
            <p className="mt-1 text-micro text-grey">
              3-LP set: {res.setAnalysis.gaps.length === 0
                ? <span className="text-emerald-600 dark:text-emerald-400">covers all {res.dimensions.length} dimensions ≥4</span>
                : <span className="text-amber-600 dark:text-amber-400">gaps in {res.setAnalysis.gaps.map((g) => g.dimLabel).join(', ')}</span>}
              {' '}· balance {res.setAnalysis.concentration}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Funnel simulator — budget sliders → P10/50/90 + marginal ranking ── */
export function FunnelSimPanel() {
  const [deep, setDeep] = useState<CommandDeep | null>(null);
  const [sim, setSim] = useState<WaitlistSimOut | null>(null);
  const [budgets, setBudgets] = useState<Record<string, number> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback((b?: Record<string, number>) => {
    runWaitlistSim(b).then(setSim).catch(() => setSim(null));
  }, []);
  useEffect(() => { fetchCommandDeep().then(setDeep).catch(() => null); run(); }, [run]);

  if (!deep || !sim) return null;
  const paid = deep.reference.funnel.channels.filter((ch) => ch.type === 'Paid');
  const cur = budgets ?? Object.fromEntries(paid.map((ch) => [ch.channelId, ch.budget]));

  const onSlide = (id: string, v: number) => {
    const next = { ...cur, [id]: v };
    setBudgets(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => run(next), 300);
  };

  return (
    <section className="br-section rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
        <TrendingUp size={12} /> Waitlist funnel simulator — budget what-ifs
        {budgets && (
          <button onClick={() => { setBudgets(null); run(); }} className="ml-auto text-micro font-semibold text-cyan-600 hover:underline dark:text-cyan-400">
            Reset to plan
          </button>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          {paid.map((ch) => {
            const locked = sim.lockedChannels.includes(ch.label);
            return (
              <div key={ch.channelId} className="flex items-center gap-2">
                <span className="w-44 shrink-0 truncate text-micro text-grey-dark" title={ch.label}>
                  {locked && <Lock size={9} className="mr-0.5 inline text-amber-500" />}{ch.label}
                </span>
                <input
                  type="range" min={0} max={150000} step={5000}
                  value={cur[ch.channelId] ?? ch.budget}
                  onChange={(e) => onSlide(ch.channelId, Number(e.target.value))}
                  disabled={locked}
                  className="min-w-0 flex-1 accent-cyan-500 disabled:opacity-40"
                  aria-label={`Budget for ${ch.label}`}
                />
                <span className="w-14 shrink-0 text-right font-mono text-micro text-navy">${((cur[ch.channelId] ?? ch.budget) / 1000).toFixed(0)}k</span>
              </div>
            );
          })}
          <p className="pt-1 text-[10px] text-grey">
            {sim.adsUnlocked ? 'Mainstream paid unlocked.' : 'Mainstream paid LOCKED until the MSB + MTL tasks complete (live check).'} CAC ±30% uncertainty, funnel-rate uncertainty ±0.10 — planning simulation.
          </p>
        </div>
        <div>
          <div className="grid grid-cols-3 gap-2">
            {([['Waitlist', sim.waitlist], ['Verified', sim.verified], ['Funded', sim.funded]] as const).map(([label, v]) => (
              <div key={label} className="rounded border border-line/70 p-2 text-center">
                <div className="text-micro font-bold uppercase tracking-wider text-grey">{label}</div>
                <div className="font-mono text-label font-bold text-navy">{v.p50.toLocaleString()}</div>
                <div className="text-[10px] text-grey">P10 {v.p10.toLocaleString()} · P90 {v.p90.toLocaleString()}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-micro">
            <span className="text-grey">Paid budget ${(sim.totalPaidBudget / 1000).toFixed(0)}k</span>
            <span className="text-grey">Blended CAC/funded: <span className="font-mono font-bold text-navy">{sim.blendedCacPerFundedP50 != null ? `$${sim.blendedCacPerFundedP50}` : '—'}</span></span>
          </div>
          <div className="mt-2 border-t border-line/60 pt-2">
            <div className="mb-1 text-micro font-bold uppercase tracking-wider text-grey">Next $1k goes furthest in…</div>
            {sim.marginal.slice(0, 3).map((m, i) => (
              <div key={m.channelId} className="flex items-center gap-2 text-micro">
                <span className="w-4 text-center font-mono font-bold text-grey">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-grey-dark">{m.label}</span>
                <span className="shrink-0 font-mono font-bold text-navy">+{m.fundedPerExtra1k} funded</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
