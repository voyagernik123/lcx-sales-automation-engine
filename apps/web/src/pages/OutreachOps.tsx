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
import { fetchKpis } from '@/lib/api/kpi';
import { fetchKpiHistory, type KpiSnapshot } from '@/lib/api/bd';
import { CompareBars, Sparkline, StackedBarH, CHART_GOOD, CHART_BAD } from '@/components/charts';
import { TableSkeleton } from '@/components/shared';
import { PageTitle, SectionLabel, Button } from '@/components/ui';

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
      <PageTitle
        icon={<Gauge size={20} />}
        subtitle="Throttling, deliverability, experiments, and LinkedIn warmup. LinkedIn is account bookkeeping only — messages are always sent by a human via the Send Queue."
      >
        Outreach Operations
      </PageTitle>

      <div className="flex gap-1 border-b border-line">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-label font-semibold border-b-2 -mb-px ${
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
          <label className="block text-micro font-bold uppercase tracking-wider text-grey">Domain</label>
          <input
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="mail.example.com"
            className="rounded border border-line px-2 py-1 text-[12px]"
          />
        </div>
        <div>
          <label className="block text-micro font-bold uppercase tracking-wider text-grey">Daily cap</label>
          <input
            type="number"
            value={newCap}
            onChange={(e) => setNewCap(Number(e.target.value))}
            className="w-24 rounded border border-line px-2 py-1 text-[12px]"
          />
        </div>
        <Button variant="secondary" size="xs" onClick={() => void addDomain()}>
          <Plus size={12} /> Add / update
        </Button>
        <Button variant="secondary" size="xs" className="ml-auto" onClick={() => void load()}>
          <RefreshCw size={12} /> Refresh
        </Button>
      </div>

      {loading && <TableSkeleton rows={6} cols={4} />}
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{error}</div>}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line text-left text-micro font-bold uppercase tracking-wider text-grey">
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
                    <span className={`rounded px-1.5 py-0.5 text-micro font-bold ${statusBadge(d.status)}`}>{d.status}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() => void togglePause(d)}
                        className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-micro hover:bg-ice-soft dark:hover:bg-ice-soft/10"
                      >
                        {d.status === 'active' ? <Pause size={10} /> : <Play size={10} />}
                        {d.status === 'active' ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        onClick={() => void recompute(d)}
                        className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-micro hover:bg-ice-soft dark:hover:bg-ice-soft/10"
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

/** Lifetime sequence outcomes derivable from the KPI payload (honest set:
 * per-step/open tracking doesn't exist in the API). */
type SequenceOutcomes = { sent: number; replied: number; handoffs: number | null };

function HealthTab() {
  const [report, setReport] = useState<MailboxReport | null>(null);
  const [outcomes, setOutcomes] = useState<SequenceOutcomes | null>(null);
  const [trend, setTrend] = useState<KpiSnapshot[]>([]);
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
    // Best-effort extras: outcome composition (KPI payload) + volume trend
    // (daily KPI snapshots). Both degrade silently.
    fetchKpis()
      .then((k) => {
        const kk = k as typeof k & { telegramConversion?: { handoffs: number } };
        const channels = Object.values(k.replyRateByChannel);
        setOutcomes({
          sent: channels.reduce((a, s) => a + s.sent, 0),
          replied: channels.reduce((a, s) => a + s.replied, 0),
          handoffs: kk.telegramConversion?.handoffs ?? null,
        });
      })
      .catch(() => setOutcomes(null));
    fetchKpiHistory(30)
      .then(setTrend)
      .catch(() => setTrend([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-label text-grey">
          Per-recipient-domain deliverability over the last {report?.windowDays ?? 30} days.
        </p>
        <Button variant="secondary" size="xs" onClick={() => void load()}>
          <RefreshCw size={12} /> Refresh
        </Button>
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
                <SectionLabel as="div">{s.label}</SectionLabel>
                <div className="mt-1 font-mono text-lg font-bold">{s.v}</div>
              </div>
            ))}
          </div>

          {/* delivery outcome composition — bounce/complaint made visible, not just rates */}
          {report.overall.total > 0 && (
            <div className="rounded-lg border border-line bg-card p-3">
              <SectionLabel as="div" className="mb-2">
                Delivery outcomes · last {report.windowDays} days
              </SectionLabel>
              <StackedBarH
                segments={[
                  { label: 'Delivered', value: report.overall.delivered, color: CHART_GOOD },
                  { label: 'Bounced', value: report.overall.bounced, color: CHART_BAD },
                  { label: 'Complained', value: report.overall.complained, color: 'var(--chart-3)' },
                ]}
              />
            </div>
          )}

          {/* sequence outcomes — the honest step funnel the payload supports
              (sent → replied → handoff; no open tracking exists in the API) */}
          {outcomes && outcomes.sent > 0 && (
            <div className="rounded-lg border border-line bg-card p-3">
              <SectionLabel as="div" className="mb-2">
                Sequence outcomes · lifetime, all channels
              </SectionLabel>
              <StackedBarH
                segments={
                  outcomes.handoffs != null
                    ? [
                        { label: 'Handoff', value: Math.min(outcomes.handoffs, outcomes.replied) },
                        { label: 'Replied — no handoff', value: Math.max(0, outcomes.replied - outcomes.handoffs) },
                        { label: 'No reply', value: Math.max(0, outcomes.sent - outcomes.replied) },
                      ]
                    : [
                        { label: 'Replied', value: outcomes.replied },
                        { label: 'No reply', value: Math.max(0, outcomes.sent - outcomes.replied) },
                      ]
                }
              />
              <p className="mt-1.5 text-[10px] text-grey">
                From the KPI payload: {outcomes.sent} sent → {outcomes.replied} replied
                {outcomes.handoffs != null ? ` → ${outcomes.handoffs} handoffs (handoffs are counted independently of channel)` : ''}.
                Opens aren't tracked, so there is no open step.
              </p>
            </div>
          )}

          {/* volume trend from daily KPI snapshots (cumulative counters) */}
          {trend.length > 1 && (
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Email sent — 30d trend', data: trend.map((s) => s.emailSent) },
                { label: 'Email replies — 30d trend', data: trend.map((s) => s.emailReplied) },
              ].map((t) => (
                <div key={t.label} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-card p-3">
                  <div>
                    <SectionLabel as="div">{t.label}</SectionLabel>
                    <div className="mt-1 font-mono text-lg font-bold">{t.data[t.data.length - 1]}</div>
                    <p className="text-[10px] text-grey">Cumulative counter from daily KPI snapshots</p>
                  </div>
                  <Sparkline data={t.data} width={110} height={30} area />
                </div>
              ))}
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line text-left text-micro font-bold uppercase tracking-wider text-grey">
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
                      <span className={`rounded px-1.5 py-0.5 text-micro font-bold ${statusBadge(d.status)}`}>{d.status}</span>
                      {d.suggestPause && (
                        <span className="ml-1 text-micro font-bold text-red-600">pause suggested</span>
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
          <label className="block text-micro font-bold uppercase tracking-wider text-grey">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Subject line test" className="rounded border border-line px-2 py-1 text-[12px]" />
        </div>
        <div>
          <label className="block text-micro font-bold uppercase tracking-wider text-grey">Variants (comma)</label>
          <input value={variants} onChange={(e) => setVariants(e.target.value)} className="rounded border border-line px-2 py-1 text-[12px]" />
        </div>
        <div>
          <label className="block text-micro font-bold uppercase tracking-wider text-grey">Metric</label>
          <select value={metric} onChange={(e) => setMetric(e.target.value)} className="rounded border border-line px-2 py-1 text-[12px]">
            <option value="reply_rate">reply_rate</option>
            <option value="open_rate">open_rate</option>
            <option value="meeting_rate">meeting_rate</option>
          </select>
        </div>
        <Button variant="secondary" size="xs" onClick={() => void create()}>
          <Plus size={12} /> Create
        </Button>
      </div>

      {loading && <TableSkeleton rows={6} cols={4} />}
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{error}</div>}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line text-left text-micro font-bold uppercase tracking-wider text-grey">
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
                    <span className={`rounded px-1.5 py-0.5 text-micro font-bold ${statusBadge(t.status)}`}>{t.status}</span>
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => void viewResults(t.id)} className="rounded border border-line px-1.5 py-0.5 text-micro hover:bg-ice-soft dark:hover:bg-ice-soft/10">
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionLabel as="div">Results · {results.metric}</SectionLabel>
            {results.comparison &&
              (results.comparison.significant ? (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-micro font-bold text-emerald-600 dark:text-emerald-400">
                  Significant · winner {results.comparison.winner} · p={results.comparison.pValue.toFixed(4)}
                </span>
              ) : (
                <span className="rounded-full border border-line px-2 py-0.5 text-micro font-bold text-grey">
                  Not yet significant (p ≥ 0.05)
                </span>
              ))}
          </div>

          {/* comparison bars with 95% CI whiskers — stats as marks, not prose.
              Width-capped so the fixed viewBox doesn't oversize the type. */}
          <div className="max-w-xl">
            <CompareBars
              data={results.variants.map((v) => ({
                label: `${v.variant} (n=${v.assigned})`,
                rate: v.rate,
                n: v.assigned,
                converted: v.converted,
                winner: Boolean(results.comparison?.significant && results.comparison.winner === v.variant),
              }))}
            />
          </div>

          {results.comparison ? (
            <div className="rounded border border-line p-2 text-[12px]">
              {results.comparison.a} vs {results.comparison.b}: lift{' '}
              <span className="font-mono font-bold">{(results.comparison.lift * 100).toFixed(1)}%</span>
              <span className="text-grey">
                {' '}· z = <span className="font-mono">{results.comparison.z.toFixed(2)}</span> · p ={' '}
                <span className="font-mono">{results.comparison.pValue.toFixed(4)}</span>
              </span>
            </div>
          ) : (
            <p className="text-label text-grey">Not enough assignments to compare yet.</p>
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
      <div className="rounded border border-amber-200 bg-amber-50 p-2 text-label text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
        Bookkeeping only. Nothing here sends a LinkedIn message — a human sends every touch via the Send Queue.
      </div>
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-card p-3">
        <div>
          <label className="block text-micro font-bold uppercase tracking-wider text-grey">Account name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="BD rep — Jane" className="rounded border border-line px-2 py-1 text-[12px]" />
        </div>
        <div>
          <label className="block text-micro font-bold uppercase tracking-wider text-grey">Daily warmup target</label>
          <input type="number" value={target} onChange={(e) => setTarget(Number(e.target.value))} className="w-24 rounded border border-line px-2 py-1 text-[12px]" />
        </div>
        <Button variant="secondary" size="xs" onClick={() => void create()}>
          <Plus size={12} /> Add account
        </Button>
      </div>

      {loading && <TableSkeleton rows={6} cols={4} />}
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{error}</div>}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line text-left text-micro font-bold uppercase tracking-wider text-grey">
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
                    <span className={`rounded px-1.5 py-0.5 text-micro font-bold ${statusBadge(a.status)}`}>{a.status}</span>
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => void viewPlan(a.id)} className="rounded border border-line px-1.5 py-0.5 text-micro hover:bg-ice-soft dark:hover:bg-ice-soft/10">
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
          <SectionLabel as="div" className="mb-2">
            Warmup ramp · day {plan.plan.currentDay}/{plan.plan.totalDays} · today's target {plan.plan.todayTarget}
          </SectionLabel>
          <div className="flex flex-wrap gap-1">
            {plan.plan.schedule.map((d) => (
              <div
                key={d.day}
                title={`Day ${d.day} (week ${d.week}): ${d.target}/day`}
                className={`flex h-10 w-10 flex-col items-center justify-center rounded text-micro font-mono ${
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
