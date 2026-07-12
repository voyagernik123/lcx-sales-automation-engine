import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  User,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Building2,
  Gauge,
  Users,
  Briefcase,
  Inbox,
  ListChecks,
  ExternalLink,
} from 'lucide-react';
import { request } from '@/lib/apiClient';

type Customer360 = {
  project: {
    id: string;
    name: string;
    website: string | null;
    ticker: string | null;
    chain: string | null;
    category: string | null;
    region: string | null;
    jurisdiction: string | null;
    listedOnLcx: boolean;
    marketCapUsd: number | null;
    marketCapRank: number | null;
    volume24hUsd: number | null;
    priceUsd: number | null;
    peopleCount: number;
    verifiedContactCount: number;
    source: string;
    createdAt: string;
    lastEnrichedAt: string | null;
  };
  score: {
    band: string;
    euScore: number;
    usPreScore: number;
    usPostScore: number;
    propensityScore: number;
    priorityScore: number;
    recommendedMarket: string | null;
    reasons: unknown[];
    computedAt: string;
  } | null;
  people: {
    id: string;
    name: string;
    title: string | null;
    role: string;
    email: string | null;
    emailStatus: string;
    telegram: string | null;
    linkedin: string | null;
    verified: boolean;
    contactabilityScore: number;
  }[];
  deals: {
    id: string;
    stage: string;
    packageType: string | null;
    packageValue: number | null;
    owner: string | null;
    notes: string | null;
    wonAt: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
  counts: { handoffs: number; handoffsOpen: number; tasks: number; tasksOpen: number };
  lastActivity: string | null;
};

function fmtNum(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function Section({
  icon,
  title,
  badge,
  children,
  defaultOpen = true,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded border border-line bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-ice-soft dark:hover:bg-ice-soft/10"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {icon}
        <span className="text-[12px] font-bold">{title}</span>
        {badge != null && <span className="ml-auto text-[10px] text-grey">{badge}</span>}
      </button>
      {open && <div className="border-t border-line p-3">{children}</div>}
    </div>
  );
}

export function Customer360() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<Customer360 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const res = await request<{ data: Customer360 }>(`/v1/projects/${id}/360`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customer');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="py-8 text-center text-[12px] text-grey">Loading…</p>;
  if (error) return <div className="m-4 rounded border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{error}</div>;
  if (!data) return null;

  const { project, score, people, deals, counts, lastActivity } = data;

  return (
    <div className="mx-auto max-w-4xl space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User size={18} />
          <h1 className="text-lg font-bold">{project.name}</h1>
          {project.ticker && <span className="text-[11px] font-bold text-grey">{project.ticker}</span>}
          {project.listedOnLcx && (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">on LCX</span>
          )}
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] font-semibold hover:bg-ice-soft dark:hover:bg-ice-soft/10"
        >
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      <div className="text-[10px] text-grey">Last activity: {fmtDate(lastActivity)}</div>

      <Section icon={<Building2 size={13} />} title="Overview">
        <dl className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">
          <div><dt className="text-grey">Region</dt><dd className="font-semibold">{project.region ?? '—'}</dd></div>
          <div><dt className="text-grey">Category</dt><dd className="font-semibold">{project.category ?? '—'}</dd></div>
          <div><dt className="text-grey">Chain</dt><dd className="font-semibold">{project.chain ?? '—'}</dd></div>
          <div><dt className="text-grey">Market cap</dt><dd className="font-semibold">{fmtNum(project.marketCapUsd)}</dd></div>
          <div><dt className="text-grey">24h volume</dt><dd className="font-semibold">{fmtNum(project.volume24hUsd)}</dd></div>
          <div><dt className="text-grey">Rank</dt><dd className="font-semibold">{project.marketCapRank ?? '—'}</dd></div>
          <div><dt className="text-grey">Jurisdiction</dt><dd className="font-semibold">{project.jurisdiction ?? '—'}</dd></div>
          <div><dt className="text-grey">Source</dt><dd className="font-semibold">{project.source}</dd></div>
          <div>
            <dt className="text-grey">Website</dt>
            <dd className="font-semibold">
              {project.website ? (
                <a href={project.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-600 hover:underline">
                  link <ExternalLink size={10} />
                </a>
              ) : '—'}
            </dd>
          </div>
        </dl>
      </Section>

      <Section icon={<Gauge size={13} />} title="Score" badge={score ? `band ${score.band}` : 'unscored'}>
        {score ? (
          <div className="grid grid-cols-3 gap-2 text-[11px] sm:grid-cols-5">
            <div><dt className="text-grey">Priority</dt><dd className="font-bold">{score.priorityScore}</dd></div>
            <div><dt className="text-grey">Propensity</dt><dd className="font-bold">{score.propensityScore}</dd></div>
            <div><dt className="text-grey">EU</dt><dd className="font-bold">{score.euScore}</dd></div>
            <div><dt className="text-grey">US pre</dt><dd className="font-bold">{score.usPreScore}</dd></div>
            <div><dt className="text-grey">US post</dt><dd className="font-bold">{score.usPostScore}</dd></div>
          </div>
        ) : (
          <p className="text-[11px] text-grey">No score yet.</p>
        )}
      </Section>

      <Section icon={<Users size={13} />} title="People" badge={`${people.length}`}>
        {people.length === 0 ? (
          <p className="text-[11px] text-grey">No contacts.</p>
        ) : (
          <div className="space-y-1.5">
            {people.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-[11px]">
                <span className="font-semibold">{p.name}</span>
                {p.title && <span className="text-grey">· {p.title}</span>}
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-grey dark:bg-slate-800">{p.role}</span>
                {p.verified && <span className="text-[9px] font-bold text-emerald-600">verified</span>}
                {p.email && <span className="ml-auto text-grey">{p.email}</span>}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section icon={<Briefcase size={13} />} title="Deals" badge={`${deals.length}`}>
        {deals.length === 0 ? (
          <p className="text-[11px] text-grey">No deals.</p>
        ) : (
          <div className="space-y-1.5">
            {deals.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-[11px]">
                <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">{d.stage}</span>
                <span className="text-grey">{d.packageType ?? '—'}</span>
                {d.packageValue != null && <span className="font-semibold">{fmtNum(d.packageValue)}</span>}
                <span className="ml-auto text-grey">updated {fmtDate(d.updatedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section icon={<Inbox size={13} />} title="Engagement" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
          <div><dt className="text-grey">Handoffs</dt><dd className="font-bold">{counts.handoffs} <span className="text-grey">({counts.handoffsOpen} open)</span></dd></div>
          <div><dt className="text-grey">Tasks</dt><dd className="font-bold">{counts.tasks} <span className="text-grey">({counts.tasksOpen} open)</span></dd></div>
          <div><dt className="text-grey">People</dt><dd className="font-bold">{project.peopleCount}</dd></div>
          <div><dt className="text-grey">Verified</dt><dd className="font-bold">{project.verifiedContactCount}</dd></div>
        </div>
      </Section>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => navigate(`/notes/${project.id}`)}
          className="inline-flex items-center gap-1 rounded border border-line px-2.5 py-1.5 text-[11px] font-semibold hover:bg-ice-soft dark:hover:bg-ice-soft/10"
        >
          <ListChecks size={12} /> Notes & documents
        </button>
      </div>
    </div>
  );
}
