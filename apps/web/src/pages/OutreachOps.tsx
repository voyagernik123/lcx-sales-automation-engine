import { useCallback, useEffect, useState } from 'react';
import {
  Gauge,
  ShieldCheck,
  FlaskConical,
  Linkedin,
  RefreshCw,
  Pause,
  Play,
  Plus,
} from 'lucide-react';
import { request } from '@/lib/apiClient';
import { TableSkeleton } from '@/components/shared';

type Tab = 'domains' | 'health' | 'abtests' | 'accounts';

type Domain = {
  id: string;
  domain: string;
  dailyCap: number;
  sentToday: number;
  reputationScore: number;
  status: string;
};

type MailboxDomain = {
  domain: string;
  total: number;
  delivered: number;
  bounced: number;
  complained: number;
  deliveryRate: number;
  bounceRate: number;
  complaintRate: number;
  status: 'healthy' | 'at_risk' | 'critical';
  suggestPause: boolean;
  reason: string;
};
type MailboxReport = {
  windowDays: number;
  domains: MailboxDomain[];
  overall: {
    total: number;
    delivered: number;
    bounced: number;
    complained: number;
    bounceRate: number;
    complaintRate: number;
    status: string;
  };
};

type AbTest = { id: string; name: string; variants: string[]; metric: string; status: string };
type VariantStat = { variant: string; assigned: number; converted: number; rate: number };
type AbResults = {
  metric: string;
  variants: VariantStat[];
  comparison: {
    a: string;
    b: string;
    rateA: number;
    rateB: number;
    lift: number;
    z: number;
    pValue: number;
    significant: boolean;
    winner: string | null;
  } | null;
};

type Account = {
  id: string;
  name: string;
  sessionStatus: string;
  dailyWarmupTarget: number;
  warmupDay: number;
  status: string;
};
type WarmupDay = { day: number; week: number; target: number; isCurrent: boolean; isComplete: boolean };
type WarmupPlan = {
  finalTarget: number;
  startTarget: number;
  totalDays: number;
  currentDay: number;
  todayTarget: number;
  complete: boolean;
  schedule: WarmupDay[];
};

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    healthy: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    ready: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    at_risk: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    warming: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    running: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
    critical: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
    paused: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  };
  return map[s] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
};

export function OutreachOps() {
  const [tab, setTab] = useState<Tab>('domains');

  const tabs: { key: Tab; label: string; icon: typeof Gauge }[] = [
    { key: 'domains', label: 'Domains', icon: Gauge },
    { key: 'health', label: 'Mailbox Health', icon: ShieldCheck },
    { key: 'abtests', label: 'A/B Tests', icon: FlaskConical },
    { key: 'accounts', label: 'LinkedIn Accounts', icon: Linkedin },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <Gauge size={18} /> Outreach Operations
        </h1>
        <p className="text-[11px] text-grey">
          Throttling, deliverability, experiments, and LinkedIn warmup. LinkedIn is account
          bookkeeping only — messages are always sent by a human via the Send Queue.
        </p>
      </div>

      <div className="flex gap-1 border-b border-line">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold border-b-2 -mb-px ${
              tab === key
                ? 'border-navy text-navy dark:border-ice'
                : 'border-transparent text-grey hover:text-navy'
            }`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {tab === 'domains' && <DomainsTab />}
      {tab === 'health' && <HealthTab />}
      {tab === 'abtests' && <AbTestsTab />}
      {tab === 'accounts' && <AccountsTab />}
    </div>
  );
}

/* ── Domains ─────────────────────────────────────────────────────── */
function DomainsTab() {
  const [rows, setRows] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newCap, setNewCap] = useState(50);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await request<{ data: Domain[] }>('/v1/outreach-ops/domains');
      setRows(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addDomain = async () => {
    if (!newDomain.trim()) return;
    await request('/v1/outreach-ops/domains', { body: { domain: newDomain, dailyCap: newCap } });
    setNewDomain('');
    await load();
  };

  const togglePause = async (d: Domain) => {
    await request(`/v1/outreach-ops/domains/${d.id}/pause`, {
      body: { resume: d.status !== 'active' },
    });
    await load();
  };

  const recompute = async (d: Domain) => {
    await request(`/v1/outreach-ops/domains/${d.id}/recompute`, { body: {} });
    await load();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-card p-3">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-grey">Domain</label>
          <input
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="mail.example.com"
            className="rounded border border-line px-2 py-1 text-[12px]"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-grey">Daily cap</label>
          <input
            type="number"
            value={newCap}
            onChange={(e) => setNewCap(Number(e.target.value))}
            className="w-24 rounded border border-line px-2 py-1 text-[12px]"
          />
        </div>
        <button
          onClick={() => void addDomain()}
          className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[12px] font-semibold hover:bg-ice-soft dark:hover:bg-ice-soft/10"
        >
          <Plus size={12} /> Add / update
        </button>
        <button
          onClick={() => void load()}
          className="ml-auto inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[12px] font-semibold hover:bg-ice-soft dark:hover:bg-ice-soft/10"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {loading && <TableSkeleton rows={6} cols={4} />}
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{error}</div>}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wider text-grey">
                <th className="px-3 py-2">Domain</th>
                <th className="px-3 py-2">Today / cap</th>
                <th className="px-3 py-2">Reputation</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-2 font-semibold font-mono">{d.domain}</td>
                  <td className="px-3 py-2 font-mono">
                    {d.sentToday} / {d.dailyCap}
                    <div className="mt-1 h-1.5 w-24 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full bg-navy dark:bg-ice"
                        style={{ width: `${Math.min(100, (d.sentToday / Math.max(1, d.dailyCap)) * 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono">{d.reputationScore}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${statusBadge(d.status)}`}>{d.status}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() => void togglePause(d)}
                        className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[10px] hover:bg-ice-soft dark:hover:bg-ice-soft/10"
                      >
                        {d.status === 'active' ? <Pause size={10} /> : <Play size={10} />}
                        {d.status === 'active' ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        onClick={() => void recompute(d)}
                        className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[10px] hover:bg-ice-soft dark:hover:bg-ice-soft/10"
                      >
                        <RefreshCw size={10} /> Adaptive cap
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-[12px] text-grey">
                    No sending domains yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Mailbox health ──────────────────────────────────────────────── */
function HealthTab() {
  const [report, setReport] = useState<MailboxReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await request<{ data: MailboxReport }>('/v1/outreach-ops/mailbox-health');
      setReport(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-grey">
          Per-recipient-domain deliverability over the last {report?.windowDays ?? 30} days.
        </p>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[12px] font-semibold hover:bg-ice-soft dark:hover:bg-ice-soft/10"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {loading && <TableSkeleton rows={6} cols={4} />}
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{error}</div>}
      {!loading && !error && report && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Sent', v: report.overall.total },
              { label: 'Delivered', v: report.overall.delivered },
              { label: 'Bounce rate', v: pct(report.overall.bounceRate) },
              { label: 'Complaint rate', v: pct(report.overall.complaintRate) },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-line bg-card p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-grey">{s.label}</div>
                <div className="mt-1 font-mono text-lg font-bold">{s.v}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wider text-grey">
                  <th className="px-3 py-2">Domain</th>
                  <th className="px-3 py-2">Sent</th>
                  <th className="px-3 py-2">Delivery</th>
                  <th className="px-3 py-2">Bounce</th>
                  <th className="px-3 py-2">Complaint</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/50">
                {report.domains.map((d) => (
                  <tr key={d.domain}>
                    <td className="px-3 py-2 font-mono font-semibold">{d.domain}</td>
                    <td className="px-3 py-2 font-mono">{d.total}</td>
                    <td className="px-3 py-2 font-mono">{pct(d.deliveryRate)}</td>
                    <td className="px-3 py-2 font-mono">{pct(d.bounceRate)}</td>
                    <td className="px-3 py-2 font-mono">{pct(d.complaintRate)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${statusBadge(d.status)}`}>{d.status}</span>
                      {d.suggestPause && (
                        <span className="ml-1 text-[9px] font-bold text-red-600">pause suggested</span>
                      )}
                    </td>
                  </tr>
                ))}
                {report.domains.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-[12px] text-grey">
                      No sent messages in the window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ── A/B tests ───────────────────────────────────────────────────── */
function AbTestsTab() {
  const [tests, setTests] = useState<AbTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [variants, setVariants] = useState('A, B');
  const [metric, setMetric] = useState('reply_rate');
  const [selected, setSelected] = useState<string | null>(null);
  const [results, setResults] = useState<AbResults | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await request<{ data: AbTest[] }>('/v1/outreach-ops/ab-tests');
      setTests(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    const vs = variants.split(',').map((v) => v.trim()).filter(Boolean);
    if (!name.trim() || vs.length < 2) return;
    await request('/v1/outreach-ops/ab-tests', { body: { name, variants: vs, metric } });
    setName('');
    await load();
  };

  const viewResults = async (id: string) => {
    setSelected(id);
    const res = await request<{ data: AbResults }>(`/v1/outreach-ops/ab-tests/${id}/results`);
    setResults(res.data);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-card p-3">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-grey">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Subject line test" className="rounded border border-line px-2 py-1 text-[12px]" />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-grey">Variants (comma)</label>
          <input value={variants} onChange={(e) => setVariants(e.target.value)} className="rounded border border-line px-2 py-1 text-[12px]" />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-grey">Metric</label>
          <select value={metric} onChange={(e) => setMetric(e.target.value)} className="rounded border border-line px-2 py-1 text-[12px]">
            <option value="reply_rate">reply_rate</option>
            <option value="open_rate">open_rate</option>
            <option value="meeting_rate">meeting_rate</option>
          </select>
        </div>
        <button onClick={() => void create()} className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[12px] font-semibold hover:bg-ice-soft dark:hover:bg-ice-soft/10">
          <Plus size={12} /> Create
        </button>
      </div>

      {loading && <TableSkeleton rows={6} cols={4} />}
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{error}</div>}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wider text-grey">
                <th className="px-3 py-2">Test</th>
                <th className="px-3 py-2">Variants</th>
                <th className="px-3 py-2">Metric</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {tests.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2 font-semibold">{t.name}</td>
                  <td className="px-3 py-2 font-mono">{t.variants.join(' · ')}</td>
                  <td className="px-3 py-2 font-mono">{t.metric}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${statusBadge(t.status)}`}>{t.status}</span>
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => void viewResults(t.id)} className="rounded border border-line px-1.5 py-0.5 text-[10px] hover:bg-ice-soft dark:hover:bg-ice-soft/10">
                      Results
                    </button>
                  </td>
                </tr>
              ))}
              {tests.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-[12px] text-grey">No tests yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && results && (
        <div className="rounded-lg border border-line bg-card p-3 space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-grey">Results · {results.metric}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {results.variants.map((v) => (
              <div key={v.variant} className="rounded border border-line p-2">
                <div className="font-mono text-[12px] font-bold">{v.variant}</div>
                <div className="text-[11px] text-grey">
                  {v.converted}/{v.assigned} converted · <span className="font-mono">{pct(v.rate)}</span>
                </div>
              </div>
            ))}
          </div>
          {results.comparison ? (
            <div className="rounded border border-line p-2 text-[12px]">
              <div>
                {results.comparison.a} vs {results.comparison.b}: lift{' '}
                <span className="font-mono font-bold">{(results.comparison.lift * 100).toFixed(1)}%</span>
              </div>
              <div className="text-grey">
                z = <span className="font-mono">{results.comparison.z.toFixed(2)}</span>, p ={' '}
                <span className="font-mono">{results.comparison.pValue.toFixed(4)}</span>
              </div>
              <div className="mt-1">
                {results.comparison.significant ? (
                  <span className="font-bold text-emerald-600">
                    Significant — winner: {results.comparison.winner}
                  </span>
                ) : (
                  <span className="text-grey">Not yet significant (p ≥ 0.05)</span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-grey">Not enough assignments to compare yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── LinkedIn accounts ───────────────────────────────────────────── */
function AccountsTab() {
  const [rows, setRows] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [target, setTarget] = useState(20);
  const [plan, setPlan] = useState<{ id: string; plan: WarmupPlan } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await request<{ data: Account[] }>('/v1/outreach-ops/accounts');
      setRows(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!name.trim()) return;
    await request('/v1/outreach-ops/accounts', { body: { name, dailyWarmupTarget: target } });
    setName('');
    await load();
  };

  const viewPlan = async (id: string) => {
    const res = await request<{ data: WarmupPlan }>(`/v1/outreach-ops/accounts/${id}/warmup-plan`);
    setPlan({ id, plan: res.data });
  };

  return (
    <div className="space-y-3">
      <div className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
        Bookkeeping only. Nothing here sends a LinkedIn message — a human sends every touch via the Send Queue.
      </div>
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-card p-3">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-grey">Account name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="BD rep — Jane" className="rounded border border-line px-2 py-1 text-[12px]" />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-grey">Daily warmup target</label>
          <input type="number" value={target} onChange={(e) => setTarget(Number(e.target.value))} className="w-24 rounded border border-line px-2 py-1 text-[12px]" />
        </div>
        <button onClick={() => void create()} className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[12px] font-semibold hover:bg-ice-soft dark:hover:bg-ice-soft/10">
          <Plus size={12} /> Add account
        </button>
      </div>

      {loading && <TableSkeleton rows={6} cols={4} />}
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{error}</div>}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wider text-grey">
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Session</th>
                <th className="px-3 py-2">Warmup day</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2 font-semibold">{a.name}</td>
                  <td className="px-3 py-2 font-mono">{a.sessionStatus}</td>
                  <td className="px-3 py-2 font-mono">{a.warmupDay}</td>
                  <td className="px-3 py-2 font-mono">{a.dailyWarmupTarget}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${statusBadge(a.status)}`}>{a.status}</span>
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => void viewPlan(a.id)} className="rounded border border-line px-1.5 py-0.5 text-[10px] hover:bg-ice-soft dark:hover:bg-ice-soft/10">
                      Warmup plan
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-[12px] text-grey">No accounts yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {plan && (
        <div className="rounded-lg border border-line bg-card p-3">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-grey">
            Warmup ramp · day {plan.plan.currentDay}/{plan.plan.totalDays} · today's target {plan.plan.todayTarget}
          </div>
          <div className="flex flex-wrap gap-1">
            {plan.plan.schedule.map((d) => (
              <div
                key={d.day}
                title={`Day ${d.day} (week ${d.week}): ${d.target}/day`}
                className={`flex h-10 w-10 flex-col items-center justify-center rounded text-[9px] font-mono ${
                  d.isCurrent
                    ? 'bg-navy text-card dark:bg-ice dark:text-navy'
                    : d.isComplete
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <span className="opacity-60">d{d.day}</span>
                <span className="font-bold">{d.target}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
