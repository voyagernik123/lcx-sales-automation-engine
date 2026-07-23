import { useCallback, useEffect, useMemo, useState } from 'react';
import { Landmark, RefreshCw, Users2, Coins, AlertTriangle, ShieldAlert } from 'lucide-react';
import {
  fetchCommandFinancials, fetchCommandTasks, fetchCommandWorkstreamsList,
  type CommandFinancial, type CommandTask,
} from '@/lib/api/command';
import { EmptyState, PageSkeleton } from '@/components/shared';
import { PageTitle, Button } from '@/components/ui';
import { clsx } from 'clsx';

/**
 * LCX COMMAND — Command Ops (Wave 4). The further CEO surfaces, honest about
 * their data: a treasury/runway PLANNING simulator (the strategy contains no
 * confirmed internal financials — the CEO enters their own figures, which stay
 * in this browser), org & ownership derived from the program graph, and the
 * metals-distribution scaffold (referenced in the brief, empty in the strategy
 * per DATA_GAPS — never fabricated).
 */
const LS_KEY = 'lcx-command-treasury-inputs';

interface TreasuryInputs { capitalUsd: number | ''; burnUsd: number | ''; mtlStates: number | ''; waitlistScenario: 'lean' | 'base' | 'aggressive' }
const DEFAULT_INPUTS: TreasuryInputs = { capitalUsd: '', burnUsd: '', mtlStates: 5, waitlistScenario: 'base' };

function loadInputs(): TreasuryInputs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_INPUTS;
    const p = JSON.parse(raw) as Partial<TreasuryInputs>;
    return {
      capitalUsd: typeof p.capitalUsd === 'number' && Number.isFinite(p.capitalUsd) ? p.capitalUsd : '',
      burnUsd: typeof p.burnUsd === 'number' && Number.isFinite(p.burnUsd) ? p.burnUsd : '',
      mtlStates: typeof p.mtlStates === 'number' && Number.isFinite(p.mtlStates) ? p.mtlStates : 5,
      waitlistScenario: p.waitlistScenario === 'lean' || p.waitlistScenario === 'aggressive' ? p.waitlistScenario : 'base',
    };
  } catch { return DEFAULT_INPUTS; }
}

export function CommandOps() {
  const [financials, setFinancials] = useState<CommandFinancial[] | null>(null);
  const [tasks, setTasks] = useState<CommandTask[] | null>(null);
  const [workstreams, setWorkstreams] = useState<Array<{ id: string; name: string; owner: string | null; status: string | null }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([fetchCommandFinancials(), fetchCommandTasks(), fetchCommandWorkstreamsList()])
      .then(([f, t, w]) => { setFinancials(f); setTasks(t); setWorkstreams(w); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="mx-auto max-w-[1300px] p-5">
      <PageTitle
        icon={<Landmark size={20} />}
        subtitle="The further CEO surfaces — treasury planning, org & ownership, and the metals scaffold. Honest about what's confirmed and what isn't."
        actions={<Button size="sm" variant="secondary" onClick={load}><RefreshCw size={13} /> Refresh</Button>}
      >
        Command Ops
      </PageTitle>

      {error ? (
        <EmptyState variant="error" title="Command Ops unavailable" description={error} />
      ) : financials == null || tasks == null ? (
        <PageSkeleton />
      ) : (
        <div className="space-y-4">
          <TreasuryPanel financials={financials} />
          <div className="grid gap-4 lg:grid-cols-2">
            <OrgPanel tasks={tasks} workstreams={workstreams ?? []} />
            <MetalsPanel />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Treasury / runway planning simulator ── */
function TreasuryPanel({ financials }: { financials: CommandFinancial[] }) {
  const [inputs, setInputs] = useState<TreasuryInputs>(loadInputs);

  const save = (next: TreasuryInputs) => {
    setInputs(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };

  // Pull the strategy's own assumption ranges (never invented here).
  const mtlRange = useMemo(() => {
    const fa = financials.find((f) => f.id === 'fa_mtl_state');
    // "50000-500000+" → [50000, 500000]
    const m = String(fa?.value ?? '').match(/(\d[\d,]*)\s*-\s*(\d[\d,]*)/);
    return m ? [Number(m[1].replace(/,/g, '')), Number(m[2].replace(/,/g, ''))] as const : null;
  }, [financials]);

  const waitlistBudget = useMemo(() => {
    const id = inputs.waitlistScenario === 'lean' ? 'fa_wl_lean' : inputs.waitlistScenario === 'aggressive' ? 'fa_wl_aggr' : 'fa_wl_base';
    const fa = financials.find((f) => f.id === id);
    const n = Number(fa?.value);
    return Number.isFinite(n) ? n : null;
  }, [financials, inputs.waitlistScenario]);

  const capital = typeof inputs.capitalUsd === 'number' ? inputs.capitalUsd : null;
  const burn = typeof inputs.burnUsd === 'number' && inputs.burnUsd > 0 ? inputs.burnUsd : null;
  const states = typeof inputs.mtlStates === 'number' && inputs.mtlStates >= 0 ? inputs.mtlStates : 0;

  const mtlLow = mtlRange ? mtlRange[0] * states : null;
  const mtlHigh = mtlRange ? mtlRange[1] * states : null;
  const launchLow = mtlLow != null && waitlistBudget != null ? mtlLow + waitlistBudget : null;
  const launchHigh = mtlHigh != null && waitlistBudget != null ? mtlHigh + waitlistBudget : null;
  const runwayMonths = capital != null && burn != null ? capital / burn : null;
  const runwayAfterLow = capital != null && burn != null && launchHigh != null ? (capital - launchHigh) / burn : null;
  const runwayAfterHigh = capital != null && burn != null && launchLow != null ? (capital - launchLow) / burn : null;

  const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
  const months = (n: number) => (n < 0 ? 'exhausted' : `${n.toFixed(1)} mo`);
  const numField = (v: number | '', set: (n: number | '') => void, placeholder: string) => (
    <input
      type="number" min={0} value={v}
      onChange={(e) => { const n = e.target.value === '' ? '' : Math.max(0, Number(e.target.value)); set(Number.isFinite(n as number) || n === '' ? n : ''); }}
      placeholder={placeholder}
      className="w-36 rounded border border-line bg-card px-2 py-1 text-label text-navy outline-none focus:border-cyan-500"
    />
  );

  return (
    <section className="rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="mb-1 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
        <Coins size={13} /> Treasury & runway — planning simulator
      </div>
      <p className="mb-3 flex items-start gap-1.5 text-micro text-amber-600 dark:text-amber-400">
        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
        No confirmed internal financials exist in the strategy (data gap). Enter your own figures — they stay in this browser only. Cost ranges below come from the strategy's cited benchmarks.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-micro text-grey">Capital (USD)<br />{numField(inputs.capitalUsd, (n) => save({ ...inputs, capitalUsd: n }), 'e.g. 5000000')}</label>
        <label className="text-micro text-grey">Monthly burn (USD)<br />{numField(inputs.burnUsd, (n) => save({ ...inputs, burnUsd: n }), 'e.g. 250000')}</label>
        <label className="text-micro text-grey">Beachhead MTL states<br />{numField(inputs.mtlStates, (n) => save({ ...inputs, mtlStates: n }), '5')}</label>
        <label className="text-micro text-grey">Waitlist budget<br />
          <select
            value={inputs.waitlistScenario}
            onChange={(e) => save({ ...inputs, waitlistScenario: e.target.value as TreasuryInputs['waitlistScenario'] })}
            className="rounded border border-line bg-card px-2 py-1 text-label text-navy"
          >
            <option value="lean">Lean ($25k)</option>
            <option value="base">Base ($100k)</option>
            <option value="aggressive">Aggressive ($300k)</option>
          </select>
        </label>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Readout label={`MTL cost × ${states} states`} value={mtlLow != null && mtlHigh != null ? `${usd(mtlLow)} – ${usd(mtlHigh)}` : '—'} note="Finextra 2026 range ($50k–$500k+/state)" />
        <Readout label="Launch spend (MTL + waitlist)" value={launchLow != null && launchHigh != null ? `${usd(launchLow)} – ${usd(launchHigh)}` : '—'} note="assumption-based" />
        <Readout label="Runway (pre-launch-spend)" value={runwayMonths != null ? months(runwayMonths) : 'enter capital + burn'} note={capital != null && burn != null ? `${usd(capital)} ÷ ${usd(burn)}/mo` : ''} />
        <Readout
          label="Runway after launch spend"
          value={runwayAfterLow != null && runwayAfterHigh != null ? `${months(runwayAfterLow)} – ${months(runwayAfterHigh)}` : '—'}
          note="worst–best across the MTL range"
          tone={runwayAfterLow != null && runwayAfterLow < 6 ? 'bad' : undefined}
        />
      </div>
      <p className="mt-2 text-[10px] text-grey">Planning simulation only — every figure above is either your local input or a strategy-cited benchmark, flagged as an assumption. Nothing here is a confirmed company number.</p>
    </section>
  );
}

function Readout({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'bad' }) {
  return (
    <div className="rounded border border-line/70 p-2.5">
      <div className="text-micro text-grey">{label}</div>
      <div className={clsx('text-label font-bold tabular-nums', tone === 'bad' ? 'text-red-600 dark:text-red-400' : 'text-navy')}>{value}</div>
      {note ? <div className="mt-0.5 text-[10px] text-grey">{note}</div> : null}
    </div>
  );
}

/* ── Org & ownership — derived from the program graph ── */
function OrgPanel({ tasks, workstreams }: { tasks: CommandTask[]; workstreams: Array<{ id: string; name: string; owner: string | null; status: string | null }> }) {
  const owners = useMemo(() => {
    const map = new Map<string, { total: number; open: number; blocked: number }>();
    for (const t of tasks) {
      const o = (t.owner ?? 'Unassigned').trim() || 'Unassigned';
      const e = map.get(o) ?? { total: 0, open: 0, blocked: 0 };
      e.total++;
      if (t.status === 'blocked') e.blocked++;
      else if (t.status !== 'done') e.open++;
      map.set(o, e);
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [tasks]);

  const gates = useMemo(() => tasks.filter((t) => t.id === 't_bsa' || t.id === 't_counsel'), [tasks]);

  return (
    <section className="rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
        <Users2 size={13} /> Org & ownership
      </div>

      {gates.length > 0 && (
        <div className="mb-3 space-y-1">
          <div className="text-micro font-bold uppercase tracking-wider text-grey">The two hiring/engagement gates</div>
          {gates.map((g) => (
            <div key={g.id} className={clsx('flex items-center gap-2 rounded border px-2 py-1.5', g.status === 'done' ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-amber-500/40 bg-amber-500/5')}>
              <span className="min-w-0 flex-1 truncate text-label font-semibold text-navy">{g.title}</span>
              <span className="shrink-0 font-mono text-micro text-grey">{(g.status ?? '').replace(/_/g, ' ')}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mb-1 text-micro font-bold uppercase tracking-wider text-grey">Task load by owner</div>
      <div className="space-y-1">
        {owners.map(([owner, s]) => (
          <div key={owner} className="flex items-center gap-2 text-micro">
            <span className="w-36 shrink-0 truncate text-grey-dark">{owner}</span>
            <div className="h-3 flex-1 overflow-hidden rounded bg-ice-soft dark:bg-ice-soft/10">
              <div className="h-full rounded bg-cyan-500/70" style={{ width: `${Math.min(100, (s.total / Math.max(...owners.map(([, x]) => x.total), 1)) * 100)}%` }} />
            </div>
            <span className="w-24 shrink-0 text-right font-mono text-grey-dark">{s.total} · {s.open} open{s.blocked ? ` · ${s.blocked}⛔` : ''}</span>
          </div>
        ))}
      </div>

      {workstreams.length > 0 && (
        <p className="mt-2 text-[10px] text-grey">
          Workstream owners: {workstreams.map((w) => `${w.name.split('—')[0].trim()} (${w.owner ?? '—'})`).join(' · ')}. Some owners are teams/roles, not named people (data-quality note in the extract).
        </p>
      )}
    </section>
  );
}

/* ── Metals distribution — the honest scaffold ── */
function MetalsPanel() {
  return (
    <section className="rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
        <ShieldAlert size={13} /> Tokenized metals distribution
      </div>
      <EmptyState
        variant="default"
        title="In the brief — not yet in the strategy"
        description="The master brief references tokenized precious-metals distribution and a MetalsDistributor partner type, but the 4-phase strategy names no metals workstream, distributors, assets, or economics (DATA_GAPS §12). The ontology holds the type, empty. When the research pass exists, its extract seeds this panel — nothing is fabricated in the meantime."
      />
      <p className="mt-2 text-[10px] text-grey">Decision needed at source: is metals distribution in scope? If yes, it needs its own research pass before it can be modelled here.</p>
    </section>
  );
}

