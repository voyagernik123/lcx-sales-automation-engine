import { useMemo } from 'react';
import { clsx } from 'clsx';
import { ArrowUpDown, Eye, Moon, X } from 'lucide-react';
import type { BdLead, BdFilters, RecommendedMarket } from '@/types/bd';
import { deriveMarketTag, deriveNextAction, deriveStage, MARKET_RECOMMENDATION_LABELS, MARKET_RECOMMENDATION_COLORS } from '@/types/bd';
import { computeReplySla, SLA_CLS } from '@/lib/salesIntel';
import { formatAgeHours, formatWakeDate } from '@/components/queue/logic';
import { ScoreBadge, BandBadge } from './ScoreBadge';
import { MarketTag } from './MarketTag';

interface LeadTableProps {
  leads: BdLead[];
  filters: BdFilters;
  clarityEnacted: boolean;
  onSort: (field: BdFilters['sort']) => void;
  onSelect: (id: string) => void;
  loading: boolean;
  /** Keyboard-selected row (J/K) — visibly highlighted. */
  selectedId?: string | null;
  /** id → inbound reply ISO; renders a Reply-SLA chip (Hot replies split). */
  slaBy?: Record<string, string>;
  /** id → wake ISO; renders a snooze chip + unsnooze on revealed rows. */
  snoozeBy?: Record<string, string>;
  /** id → one-line context ("Task due: …", "Snooze woke …"). */
  noteBy?: Record<string, string>;
  onUnsnooze?: (id: string) => void;
  /** Inspect-in-place affordance (eye icon / Space). */
  onPeek?: (id: string) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  esma_main: 'ESMA',
  pipeline: 'Pipeline',
  top100: 'Top 100',
  pre_tge: 'Pre-TGE',
  manual: 'Manual',
};

const SORT_COLUMNS: { key: BdFilters['sort']; label: string; eu?: boolean; us?: boolean }[] = [
  { key: 'name', label: 'Project' },
  { key: 'priority', label: 'Priority' },
  { key: 'eu_score', label: 'EU Score', eu: true },
  { key: 'us_pre', label: 'US (Pre)', us: true },
  { key: 'us_post', label: 'US (Post)', us: true },
  { key: 'created', label: 'Added' },
];

export function LeadTable({
  leads,
  filters,
  clarityEnacted,
  onSort,
  onSelect,
  loading,
  selectedId = null,
  slaBy,
  snoozeBy,
  noteBy,
  onUnsnooze,
  onPeek,
}: LeadTableProps) {
  const usColumn: 'us_pre' | 'us_post' = clarityEnacted ? 'us_post' : 'us_pre';
  const usLabel = clarityEnacted ? 'US (Post)' : 'US (Pre)';

  const visibleColumns = useMemo(() => {
    return SORT_COLUMNS.filter(c => {
      if (c.key === 'us_pre' && clarityEnacted) return false;
      if (c.key === 'us_post' && !clarityEnacted) return false;
      return true;
    });
  }, [clarityEnacted]);

  if (!loading && leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-grey">
        <p className="text-sm font-semibold">No leads match your filters</p>
        <p className="text-xs mt-1">Try adjusting the filter criteria above</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-line">
            {visibleColumns.map((col) => (
              <th
                key={col.key}
                onClick={() => onSort(col.key)}
                className={clsx(
                  'text-left py-2 px-3 text-micro font-bold uppercase tracking-wider text-grey cursor-pointer hover:text-navy transition-colors select-none',
                  filters.sort === col.key && 'text-navy',
                )}
              >
                <span className="inline-flex items-center gap-1">
                  {col.key === 'name' ? col.label : (
                    col.key === 'eu_score' ? 'EU Score' :
                    col.key === usColumn ? usLabel : col.label
                  )}
                  <ArrowUpDown size={10} className={clsx(filters.sort === col.key ? 'opacity-100' : 'opacity-30')} />
                </span>
              </th>
            ))}
            <th className="text-left py-2 px-3 text-micro font-bold uppercase tracking-wider text-grey">Market</th>
            <th className="text-left py-2 px-3 text-micro font-bold uppercase tracking-wider text-grey">Band</th>
            <th className="text-left py-2 px-3 text-micro font-bold uppercase tracking-wider text-grey">Rec. Market</th>
            <th className="text-left py-2 px-3 text-micro font-bold uppercase tracking-wider text-grey">Stage</th>
            <th className="text-left py-2 px-3 text-micro font-bold uppercase tracking-wider text-grey">Next Action</th>
            <th className="text-left py-2 px-3 text-micro font-bold uppercase tracking-wider text-grey">Contact</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/50">
          {leads.map((lead) => {
            const isSelected = selectedId === lead.id;
            const replyAt = slaBy?.[lead.id];
            const sla = replyAt ? computeReplySla(replyAt) : null;
            const wakeAt = snoozeBy?.[lead.id];
            const note = noteBy?.[lead.id];
            return (
              <tr
                key={lead.id}
                data-lead-id={lead.id}
                aria-selected={isSelected}
                onClick={() => onSelect(lead.id)}
                className={clsx(
                  'cursor-pointer transition-colors group',
                  isSelected
                    ? 'bg-cyan-500/[0.07] dark:bg-cyan-400/[0.08]'
                    : 'hover:bg-ice-soft dark:hover:bg-ice-soft/5',
                )}
              >
                <td className={clsx('py-2 px-3 border-l-2', isSelected ? 'border-l-cyan-500' : 'border-l-transparent')}>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-navy truncate max-w-[220px]">
                        {lead.name}
                      </span>
                      <span className="text-micro text-grey font-mono truncate">
                        {SOURCE_LABELS[lead.source] ?? lead.source}
                        {lead.ticker && <span className="ml-1.5 opacity-60">{lead.ticker}</span>}
                        {note && <span className="ml-1.5 text-amber-600 dark:text-amber-400 normal-case">· {note}</span>}
                      </span>
                    </div>
                    {sla && (
                      <span
                        className={clsx('shrink-0 text-micro font-bold font-mono whitespace-nowrap', SLA_CLS[sla.state])}
                        title={`Reply waiting ${formatAgeHours(sla.ageHours)} of a ${sla.budgetHours}h budget — ${sla.state}`}
                      >
                        ● {sla.state} {formatAgeHours(sla.ageHours)}
                      </span>
                    )}
                    {wakeAt && (
                      <span
                        className="shrink-0 inline-flex items-center gap-1 rounded-full border border-line bg-ice-soft dark:bg-navy-deep px-1.5 py-0.5 text-micro font-bold text-grey whitespace-nowrap"
                        title={`Snoozed — wakes ${new Date(wakeAt).toLocaleString()}`}
                      >
                        <Moon size={9} /> {formatWakeDate(wakeAt)}
                        {onUnsnooze && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onUnsnooze(lead.id);
                            }}
                            className="hover:text-navy transition-colors"
                            aria-label={`Unsnooze ${lead.name}`}
                            title="Unsnooze"
                          >
                            <X size={9} />
                          </button>
                        )}
                      </span>
                    )}
                    {onPeek && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onPeek(lead.id);
                        }}
                        className="ml-auto shrink-0 rounded p-0.5 text-grey opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-navy transition-all"
                        aria-label={`Peek ${lead.name}`}
                        title="Peek (Space)"
                      >
                        <Eye size={12} />
                      </button>
                    )}
                  </div>
                </td>
                <td className="py-2 px-3">
                  <span
                    className="inline-flex items-center gap-1.5"
                    title={`Propensity ${lead.propensityScore ?? '—'}/100 × eligibility gate = priority ${lead.priorityScore ?? '—'}. Market data ${lead.lastEnrichedAt ? `refreshed ${new Date(lead.lastEnrichedAt).toLocaleDateString()}` : 'not yet enriched'}.`}
                  >
                    <span className="rounded bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 text-micro font-bold text-indigo-700 dark:text-indigo-300 font-mono">
                      {lead.priorityScore ?? '—'}
                    </span>
                    <span
                      className={clsx(
                        'h-1.5 w-1.5 rounded-full',
                        lead.lastEnrichedAt ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
                      )}
                    />
                  </span>
                </td>
                <td className="py-2 px-3">
                  <ScoreBadge score={lead.euScore} band={lead.band} size="sm" />
                </td>
                <td className="py-2 px-3">
                  <ScoreBadge
                    score={clarityEnacted ? lead.usPostScore : lead.usPreScore}
                    band={lead.band}
                    size="sm"
                  />
                </td>
                <td className="py-2 px-3">
                  <MarketTag market={deriveMarketTag(lead)} />
                </td>
                <td className="py-2 px-3">
                  <BandBadge band={lead.band} />
                </td>
                <td className="py-2 px-3">
                  <MarketRecommendationBadge value={lead.recommendedMarket ?? null} />
                </td>
                <td className="py-2 px-3">
                  <span className="text-grey-dark dark:text-grey-light">{deriveStage(lead.band)}</span>
                </td>
                <td className="py-2 px-3">
                  <span className="font-medium text-navy">{deriveNextAction(lead.band)}</span>
                </td>
                <td className="py-2 px-3">
                  <ContactStatus peopleCount={lead.peopleCount} verifiedCount={lead.verifiedContactCount} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MarketRecommendationBadge({ value }: { value: RecommendedMarket | null }) {
  if (!value || value === 'none') {
    return <span className="text-grey text-micro">—</span>;
  }
  return (
    <span className={clsx('inline-block rounded-full px-2 py-0.5 text-micro font-bold', MARKET_RECOMMENDATION_COLORS[value])}>
      {MARKET_RECOMMENDATION_LABELS[value]}
    </span>
  );
}

function ContactStatus({ peopleCount, verifiedCount }: { peopleCount: number; verifiedCount: number }) {
  if (peopleCount === 0) {
    return <span className="text-grey text-micro">None</span>;
  }
  const pct = Math.round((verifiedCount / peopleCount) * 100);
  return (
    <span className="inline-flex items-center gap-1.5 text-micro">
      <span className={clsx(
        'h-1.5 w-1.5 rounded-full shrink-0',
        pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500',
      )} />
      <span className={clsx(
        'font-bold',
        pct >= 100 ? 'text-emerald-600 dark:text-emerald-400' : pct >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400',
      )}>
        {verifiedCount}/{peopleCount}
      </span>
      <span className="text-grey">({pct}%)</span>
    </span>
  );
}
