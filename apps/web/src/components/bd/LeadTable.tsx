import { useMemo } from 'react';
import { clsx } from 'clsx';
import { ArrowUpDown } from 'lucide-react';
import type { BdLead, BdFilters, RecommendedMarket } from '@/types/bd';
import { deriveMarketTag, deriveNextAction, deriveStage, MARKET_RECOMMENDATION_LABELS, MARKET_RECOMMENDATION_COLORS } from '@/types/bd';
import { ScoreBadge, BandBadge } from './ScoreBadge';
import { MarketTag } from './MarketTag';

interface LeadTableProps {
  leads: BdLead[];
  filters: BdFilters;
  clarityEnacted: boolean;
  onSort: (field: BdFilters['sort']) => void;
  onSelect: (id: string) => void;
  loading: boolean;
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

export function LeadTable({ leads, filters, clarityEnacted, onSort, onSelect, loading }: LeadTableProps) {
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
                  'text-left py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-grey cursor-pointer hover:text-navy transition-colors select-none',
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
            <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-grey">Market</th>
            <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-grey">Band</th>
            <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-grey">Rec. Market</th>
            <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-grey">Stage</th>
            <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-grey">Next Action</th>
            <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-grey">Contact</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/50">
          {leads.map((lead) => (
            <tr
              key={lead.id}
              onClick={() => onSelect(lead.id)}
              className="hover:bg-ice-soft dark:hover:bg-ice-soft/5 cursor-pointer transition-colors group"
            >
              <td className="py-2 px-3">
                <div className="flex flex-col">
                  <span className="font-semibold text-navy truncate max-w-[220px]">
                    {lead.name}
                  </span>
                  <span className="text-[10px] text-grey font-mono">
                    {SOURCE_LABELS[lead.source] ?? lead.source}
                    {lead.ticker && <span className="ml-1.5 opacity-60">{lead.ticker}</span>}
                  </span>
                </div>
              </td>
              <td className="py-2 px-3">
                <span
                  className="inline-flex items-center gap-1.5"
                  title={`Propensity ${lead.propensityScore ?? 0}/100 × eligibility gate = priority ${lead.priorityScore ?? 0}. Market data ${lead.lastEnrichedAt ? `refreshed ${new Date(lead.lastEnrichedAt).toLocaleDateString()}` : 'not yet enriched'}.`}
                >
                  <span className="rounded bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 font-mono">
                    {lead.priorityScore ?? 0}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarketRecommendationBadge({ value }: { value: RecommendedMarket | null }) {
  if (!value || value === 'none') {
    return <span className="text-grey text-[10px]">—</span>;
  }
  return (
    <span className={clsx('inline-block rounded-full px-2 py-0.5 text-[10px] font-bold', MARKET_RECOMMENDATION_COLORS[value])}>
      {MARKET_RECOMMENDATION_LABELS[value]}
    </span>
  );
}

function ContactStatus({ peopleCount, verifiedCount }: { peopleCount: number; verifiedCount: number }) {
  if (peopleCount === 0) {
    return <span className="text-grey text-[10px]">None</span>;
  }
  const pct = Math.round((verifiedCount / peopleCount) * 100);
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px]">
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
