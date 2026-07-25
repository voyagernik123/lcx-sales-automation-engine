import { useMemo, useRef } from 'react';
import { clsx } from 'clsx';
import { ArrowUpDown, Eye, Moon, X } from 'lucide-react';
import type { BdLead, BdFilters, RecommendedMarket } from '@/types/bd';
import { deriveMarketTag, deriveNextAction, deriveStage, MARKET_RECOMMENDATION_LABELS } from '@/types/bd';
import { computeReplySla, SLA_CLS } from '@/lib/salesIntel';
import { marketRecLineage, priorityLineage } from '@/lib/lineage';
import { formatAgeHours, formatWakeDate } from '@/components/queue/logic';
import { EntityChip } from '@/components/entity';
import { Derived } from '@/components/lineage';
import { ScoreBadge, BandBadge } from './ScoreBadge';
import { MarketTag } from './MarketTag';
import { useListNavigation } from '@/hooks/useListNavigation';

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
  // One tab stop for the table, arrows within it (TERMINAL Phase 4).
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const nav = useListNavigation({
    // The container makes "one tab stop" TRUE rather than nearly true: a lead row
    // contains four focusable descendants, so without it Tab walked into the row it
    // was already on. See parkRowControls.
    container: bodyRef,
    count: leads.length,
    onActivate: (i) => {
      const lead = leads[i];
      if (lead) onSelect(lead.id);
    },
  });

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
                aria-sort={filters.sort === col.key ? (filters.order === 'asc' ? 'ascending' : 'descending') : 'none'}
                className={clsx(
                  // p-0 kills the 1px UA cell padding that the moved py-2.5/px-3
                  // used to override — without it the header row grows by 2px.
                  'p-0 text-micro font-medium uppercase tracking-wider text-grey',
                  col.key === 'name' ? 'text-left' : 'text-right',
                  filters.sort === col.key && 'text-navy',
                )}
              >
                {/* The sort control is a real button inside the cell: a <th> cannot
                    be replaced by one, and role="button" on a header would strip the
                    columnheader semantics the table needs. Padding lives on the
                    button so its hit area is the whole cell, as before. */}
                <button
                  type="button"
                  onClick={() => onSort(col.key)}
                  className={clsx(
                    'block w-full py-2.5 px-3 cursor-pointer hover:text-navy transition-colors select-none focus-ring',
                    col.key === 'name' ? 'text-left' : 'text-right',
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.key === 'name' ? col.label : (
                      col.key === 'eu_score' ? 'EU Score' :
                      col.key === usColumn ? usLabel : col.label
                    )}
                    <ArrowUpDown size={10} className={clsx(filters.sort === col.key ? 'opacity-100' : 'opacity-30')} />
                  </span>
                </button>
              </th>
            ))}
            <th className="text-left py-2.5 px-3 text-micro font-medium uppercase tracking-wider text-grey">Market</th>
            <th className="text-left py-2.5 px-3 text-micro font-medium uppercase tracking-wider text-grey">Band</th>
            <th className="text-left py-2.5 px-3 text-micro font-medium uppercase tracking-wider text-grey">Rec. Market</th>
            <th className="text-left py-2.5 px-3 text-micro font-medium uppercase tracking-wider text-grey">Stage</th>
            <th className="text-left py-2.5 px-3 text-micro font-medium uppercase tracking-wider text-grey">Next Action</th>
            <th className="text-right py-2.5 px-3 text-micro font-medium uppercase tracking-wider text-grey">Contact</th>
          </tr>
        </thead>
        <tbody ref={bodyRef} className="divide-y divide-line/50" {...nav.containerProps}>
          {leads.map((lead, i) => {
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
                // A row cannot become a <button> — it must stay a table row, and it
                // holds its own buttons — so movement comes from the shared
                // roving-tabindex hook rather than from `tabIndex={0}` on every row.
                // That distinction is the whole point: 200 focusable rows means
                // reaching row 40 of the queue costs 40+ Tab presses and Tab can
                // never leave the table. Roving makes the table ONE tab stop, with
                // the arrows moving inside it. Enter/Space still activate, via the
                // hook, so the nested peek/unsnooze buttons keep their own keys.
                {...nav.rowProps(i)}
                className={clsx(
                  'cursor-pointer transition-colors group focus-ring',
                  isSelected
                    ? 'bg-cyan-500/[0.07] dark:bg-cyan-400/[0.08]'
                    : 'hover:bg-ice-soft/50 dark:hover:bg-ice-soft/10',
                )}
              >
                <td className={clsx('py-2 px-3 border-l-2', isSelected ? 'border-l-cyan-500' : 'border-l-transparent')}>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col min-w-0">
                      <EntityChip
                        type="project"
                        id={lead.id}
                        name={lead.name}
                        stateLine={`${deriveStage(lead.band)} · ${deriveNextAction(lead.band)}`}
                        vitals={[{ label: 'Priority', value: String(lead.priorityScore ?? '—') }]}
                        className="max-w-[220px] font-semibold"
                      />
                      <span className="text-micro text-grey font-mono truncate">
                        {SOURCE_LABELS[lead.source] ?? lead.source}
                        {lead.ticker && <span className="ml-1.5 opacity-60">{lead.ticker}</span>}
                        {lead.tier === 'catalog' && (
                          <span className="ml-1.5 rounded bg-ice-soft px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-grey dark:bg-navy-deep">catalog</span>
                        )}
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
                        className="ml-auto shrink-0 rounded p-0.5 text-grey opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-navy t-hover"
                        aria-label={`Peek ${lead.name}`}
                        title="Peek (Space)"
                      >
                        <Eye size={12} />
                      </button>
                    )}
                  </div>
                </td>
                <td className="py-2 px-3 text-right">
                  <span className="inline-flex items-center justify-end gap-1.5">
                    <Derived
                      align="right"
                      lineage={priorityLineage({
                        propensityScore: lead.propensityScore,
                        priorityScore: lead.priorityScore,
                        euScore: lead.euScore ?? undefined,
                        usScore: (clarityEnacted ? lead.usPostScore : lead.usPreScore) ?? undefined,
                        lastEnrichedAt: lead.lastEnrichedAt,
                      })}
                    >
                      <span className="num-tabular font-mono text-xs font-semibold text-navy">
                        {lead.priorityScore ?? '—'}
                      </span>
                    </Derived>
                    <span
                      className={clsx(
                        'h-1.5 w-1.5 rounded-full shrink-0',
                        lead.lastEnrichedAt ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
                      )}
                    />
                  </span>
                </td>
                <td className="py-2 px-3 text-right">
                  <ScoreBadge score={lead.euScore} band={lead.band} size="sm" />
                </td>
                <td className="py-2 px-3 text-right">
                  <ScoreBadge
                    score={clarityEnacted ? lead.usPostScore : lead.usPreScore}
                    band={lead.band}
                    size="sm"
                  />
                </td>
                <td className="py-2 px-3 text-right">
                  <span className="num-tabular font-mono text-micro text-grey whitespace-nowrap">
                    {new Date(lead.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </td>
                <td className="py-2 px-3">
                  <Derived
                    align="right"
                    lineage={marketRecLineage({
                      euScore: lead.euScore ?? undefined,
                      usPreScore: lead.usPreScore ?? undefined,
                      usPostScore: lead.usPostScore ?? undefined,
                      clarityEnacted,
                    })}
                  >
                    <MarketTag market={deriveMarketTag(lead)} />
                  </Derived>
                </td>
                <td className="py-2 px-3">
                  <BandBadge band={lead.band} />
                </td>
                <td className="py-2 px-3">
                  <MarketRecommendationBadge value={lead.recommendedMarket ?? null} />
                </td>
                <td className="py-2 px-3">
                  <span className="text-grey-dark">{deriveStage(lead.band)}</span>
                </td>
                <td className="py-2 px-3">
                  <span className="font-medium text-navy">{deriveNextAction(lead.band)}</span>
                </td>
                <td className="py-2 px-3 text-right">
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

/** Dot accents for the recommendation chip — neutral chip, colored dot (chip restraint). */
const MARKET_RECOMMENDATION_DOTS: Record<string, string> = {
  eu_first: 'bg-blue-500',
  us_first: 'bg-emerald-500',
  dual: 'bg-purple-500',
  eu: 'bg-blue-500',
  us: 'bg-emerald-500',
};

function MarketRecommendationBadge({ value }: { value: RecommendedMarket | null }) {
  if (!value || value === 'none') {
    return <span className="text-grey text-micro">—</span>;
  }
  // Older score rows carry raw market codes ('eu'/'us') — fall back gracefully.
  const label = MARKET_RECOMMENDATION_LABELS[value] ?? value.toUpperCase();
  return (
    <span className="inline-flex h-[18px] items-center gap-1.5 rounded-full border border-line/70 bg-ice-soft/50 dark:bg-navy-deep/50 px-2 text-micro font-semibold text-grey-dark whitespace-nowrap">
      <span className={clsx('h-1.5 w-1.5 rounded-full shrink-0', MARKET_RECOMMENDATION_DOTS[value] ?? 'bg-slate-400')} />
      {label}
    </span>
  );
}

function ContactStatus({ peopleCount, verifiedCount }: { peopleCount: number; verifiedCount: number }) {
  if (peopleCount === 0) {
    return <span className="text-grey text-micro">None</span>;
  }
  const pct = Math.round((verifiedCount / peopleCount) * 100);
  return (
    <span className="inline-flex items-center justify-end gap-1.5 text-micro num-tabular whitespace-nowrap">
      <span className={clsx(
        'h-1.5 w-1.5 rounded-full shrink-0',
        pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500',
      )} />
      <span className={clsx(
        'font-semibold',
        pct >= 100 ? 'text-emerald-600 dark:text-emerald-400' : pct >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400',
      )}>
        {verifiedCount}/{peopleCount}
      </span>
      <span className="text-grey">({pct}%)</span>
    </span>
  );
}
