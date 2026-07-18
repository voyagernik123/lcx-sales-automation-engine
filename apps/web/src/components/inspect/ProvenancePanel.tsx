import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Flag, Briefcase, ExternalLink, ShieldCheck } from 'lucide-react';
import { getSource, RELIABILITY_LABEL, type Observation } from '@lcx/shared';
import {
  fetchActions,
  fetchObservations,
  fetchCoverage,
  executeAction,
  type ObjectState,
  type CoverageEntry,
} from '@/lib/api/intel';
import { OBJECT_TYPES, type ObjectType } from '@/lib/objectRegistry';
import { formatMoney, formatPct } from '@/lib/format';

/**
 * The provenance + actions surface — Wave 0's proof that the spine is real and
 * visible. Given any ontology object it shows (a) the governed Actions the
 * operator can take, with write-back, and (b) the sourced Observations behind
 * it, each with its source, Admiralty reliability, derived confidence, and
 * freshness. No naked numbers; no dead ends.
 */

const PREDICATE_LABEL: Record<string, string> = {
  market_cap_usd: 'Market cap',
  volume_24h_usd: '24h volume',
  price_usd: 'Price',
  price_change_30d: '30d change',
  token_age_days: 'Token age',
  listed_on_lcx: 'Listed on LCX',
  propensity_score: 'Propensity',
  eu_score: 'EU readiness',
  us_post_score: 'US readiness',
  priority_score: 'Priority',
  band: 'Band',
  // Wave 1 — free-data sensors
  tvl_usd: 'TVL',
  fdv_usd: 'FDV',
  defillama_category: 'Category',
  chain_count: 'Chains',
  chains: 'Chain list',
  tvl_change_7d: 'TVL 7d',
  team_size: 'Team size',
  dev_status: 'Dev status',
  tag_count: 'Tags',
  tags: 'Tag list',
  open_source: 'Open source',
  has_whitepaper: 'Whitepaper',
  github_stars: 'GitHub stars',
  github_forks: 'GitHub forks',
  github_open_issues: 'Open issues',
  github_last_push: 'Last commit',
  github_commits_30d: 'Commits 30d',
};

function labelFor(predicate: string): string {
  return PREDICATE_LABEL[predicate] ?? predicate.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatValue(o: Observation): string {
  if (o.unit === 'USD' && o.valueNum != null) return formatMoney(o.valueNum);
  if (o.unit === '%' && o.valueNum != null) return formatPct(o.valueNum);
  if (o.unit === 'days' && o.valueNum != null) return `${Math.round(o.valueNum)}d`;
  if (o.predicate === 'github_last_push' && typeof o.value === 'string') return ago(o.value);
  if (Array.isArray(o.value)) {
    const arr = o.value as unknown[];
    const head = arr.slice(0, 2).join(', ');
    return arr.length > 2 ? `${head} +${arr.length - 2}` : head || '—';
  }
  if (typeof o.value === 'boolean') return o.value ? 'Yes' : 'No';
  if (o.valueNum != null) return String(Math.round(o.valueNum * 100) / 100);
  if (o.value == null) return '—';
  return String(o.value);
}

function ago(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

function confidenceColor(c: number): string {
  if (c >= 70) return 'bg-emerald-500';
  if (c >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

export function ProvenancePanel({ subjectType, subjectId }: { subjectType: string; subjectId: string }) {
  const navigate = useNavigate();
  const [obs, setObs] = useState<Observation[] | null>(null);
  const [coverage, setCoverage] = useState<CoverageEntry[] | null>(null);
  const [canDo, setCanDo] = useState<Set<string>>(new Set());
  const [state, setState] = useState<ObjectState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setObs(null);
    setState(null);
    setCoverage(null);
    fetchObservations(subjectType, subjectId)
      .then((d) => !cancelled && setObs(d))
      .catch(() => !cancelled && setObs([]));
    fetchCoverage(subjectType, subjectId)
      .then((d) => !cancelled && setCoverage(d))
      .catch(() => !cancelled && setCoverage([]));
    fetchActions(subjectType, subjectId)
      .then((d) => {
        if (cancelled) return;
        setCanDo(new Set(d.available.map((a) => a.id)));
        setState(d.state);
      })
      .catch(() => !cancelled && setState({ watchlisted: false, flagged: false }));
    return () => {
      cancelled = true;
    };
  }, [subjectType, subjectId]);

  const run = useCallback(
    async (action: string) => {
      setBusy(action);
      try {
        const out = await executeAction(subjectType, subjectId, action);
        setState(out.state);
      } catch {
        /* leave state; a toast layer can report later */
      } finally {
        setBusy(null);
      }
    },
    [subjectType, subjectId],
  );

  const objType = subjectType as ObjectType;
  const workspaceRoute = OBJECT_TYPES[objType]?.route;

  return (
    <section className="mt-5 border-t border-line pt-4">
      <div className="mb-2.5 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
        <ShieldCheck size={12} /> Intelligence · Provenance
      </div>

      {/* Actions bar */}
      {state && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {canDo.has('watchlist_add') && (
            <ActionButton
              active={state.watchlisted}
              busy={busy === 'watchlist_add' || busy === 'watchlist_remove'}
              icon={<Star size={12} className={state.watchlisted ? 'fill-current' : ''} />}
              label={state.watchlisted ? 'On watchlist' : 'Watchlist'}
              onClick={() => run(state.watchlisted ? 'watchlist_remove' : 'watchlist_add')}
              tone="primary"
            />
          )}
          {canDo.has('flag_review') && (
            <ActionButton
              active={state.flagged}
              busy={busy === 'flag_review' || busy === 'unflag'}
              icon={<Flag size={12} className={state.flagged ? 'fill-current' : ''} />}
              label={state.flagged ? 'Flagged' : 'Flag'}
              onClick={() => run(state.flagged ? 'unflag' : 'flag_review')}
              tone="warn"
            />
          )}
          {canDo.has('start_deal') && (
            <ActionButton
              icon={<Briefcase size={12} />}
              label="Start deal"
              onClick={() => navigate(`/bd-pipeline/${subjectId}`)}
            />
          )}
          {canDo.has('open_workspace') && workspaceRoute && (
            <ActionButton
              icon={<ExternalLink size={12} />}
              label="Workspace"
              onClick={() => navigate(workspaceRoute(subjectId))}
            />
          )}
        </div>
      )}

      {/* Sensor coverage — which free connectors have fresh data on this object */}
      {coverage && coverage.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {coverage.map((c) => {
            const tone =
              c.fresh ? 'border-emerald-500/50 text-emerald-700 dark:text-emerald-300'
              : c.status === 'error' ? 'border-red-500/50 text-red-700 dark:text-red-300'
              : c.status === 'ok' ? 'border-amber-500/50 text-amber-700 dark:text-amber-300'
              : 'border-line text-grey';
            const dot = c.fresh ? 'bg-emerald-500' : c.status === 'error' ? 'bg-red-500' : c.status === 'ok' ? 'bg-amber-500' : 'bg-grey/40';
            return (
              <span
                key={c.id}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${tone}`}
                title={`${c.yields}${c.lastOkAt ? ` · updated ${ago(c.lastOkAt)}` : c.status === 'missing' ? ' · not collected yet' : ''}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                {c.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Provenance list */}
      {obs === null ? (
        <div className="space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-7 animate-pulse rounded bg-ice-soft/60 dark:bg-ice-soft/10" />
          ))}
        </div>
      ) : obs.length === 0 ? (
        <p className="text-micro text-grey">No sourced observations yet. Collection sensors land in Wave 1.</p>
      ) : (
        <ul className="space-y-1">
          {obs.map((o) => {
            const src = getSource(o.source);
            return (
              <li key={o.id} className="flex items-center gap-2 py-1 text-label">
                <span className="w-28 shrink-0 truncate text-grey">{labelFor(o.predicate)}</span>
                <span className="num-tabular w-24 shrink-0 truncate font-semibold text-navy">{formatValue(o)}</span>
                {/* source chip */}
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-line px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-grey"
                  title={`${src.label} · ${RELIABILITY_LABEL[o.reliability]} (${o.reliability})`}
                >
                  {src.label}
                  <span className="text-navy">{o.reliability}</span>
                </span>
                {/* confidence bar */}
                <span className="flex flex-1 items-center gap-1.5" title={`Confidence ${o.confidence}%`}>
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                    <span className={`block h-full ${confidenceColor(o.confidence)}`} style={{ width: `${o.confidence}%` }} />
                  </span>
                  <span className="num-tabular w-8 shrink-0 text-right font-mono text-[9px] text-grey">{o.confidence}%</span>
                </span>
                <span className="w-14 shrink-0 text-right font-mono text-[9px] text-grey/70">{ago(o.observedAt)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ActionButton({
  icon, label, onClick, active, busy, tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  busy?: boolean;
  tone?: 'default' | 'primary' | 'warn';
}) {
  const activeCls =
    tone === 'primary'
      ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
      : tone === 'warn'
        ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : 'border-navy bg-navy/5 text-navy';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-label font-semibold transition-colors disabled:opacity-50 ${
        active ? activeCls : 'border-line text-grey hover:border-grey-light hover:text-navy'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
