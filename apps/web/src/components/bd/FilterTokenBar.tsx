import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Plus, RotateCcw, Search, X } from 'lucide-react';
import type { BdFilters } from '@/types/bd';

/**
 * Filter tokens (FINAL_MASTER_PLAN 4.2) — the filter bar reads like a
 * sentence: `Market · EU ×  Band · Immediate ×  + Filter`. One 32px row
 * replaces the seven-control strip; every active condition is a removable
 * token, and new conditions come from a two-step popover (dimension →
 * value). Saved screens keep working — tokens are a view over the same
 * filter state.
 */

type FilterPatch = Partial<BdFilters>;

interface Dimension {
  key: string;
  label: string;
  options: { label: string; patch: FilterPatch }[];
  /** Is this dimension active, and how should its token read? */
  read: (f: BdFilters) => string | null;
  /** Patch that clears the dimension. */
  clear: FilterPatch;
}

const DIMENSIONS: Dimension[] = [
  {
    key: 'market',
    label: 'Market',
    options: [
      { label: 'EU', patch: { market: 'eu' } },
      { label: 'US', patch: { market: 'us' } },
      { label: 'EU / US', patch: { market: 'both' } },
    ],
    read: f => (f.market ? { eu: 'EU', us: 'US', both: 'EU / US' }[f.market] ?? null : null),
    clear: { market: null },
  },
  {
    key: 'band',
    label: 'Band',
    options: (['immediate', 'high', 'nurture', 'watch', 'archive'] as const).map(b => ({
      label: b.charAt(0).toUpperCase() + b.slice(1),
      patch: { band: b },
    })),
    read: f => (f.band ? f.band.charAt(0).toUpperCase() + f.band.slice(1) : null),
    clear: { band: '' },
  },
  {
    key: 'source',
    label: 'Source',
    options: [
      { label: 'ESMA', patch: { source: 'esma_main' } },
      { label: 'Pipeline', patch: { source: 'pipeline' } },
      { label: 'Top 100', patch: { source: 'top100' } },
      { label: 'Pre-TGE', patch: { source: 'pre_tge' } },
      { label: 'Manual', patch: { source: 'manual' } },
    ],
    read: f =>
      f.source
        ? ({ esma_main: 'ESMA', pipeline: 'Pipeline', top100: 'Top 100', pre_tge: 'Pre-TGE', manual: 'Manual' }[f.source] ?? f.source)
        : null,
    clear: { source: '' },
  },
  {
    key: 'rec',
    label: 'Recommendation',
    options: [
      { label: 'EU first', patch: { marketRecommendation: 'eu_first' } },
      { label: 'US first', patch: { marketRecommendation: 'us_first' } },
      { label: 'Dual', patch: { marketRecommendation: 'dual' } },
      { label: 'Unclear', patch: { marketRecommendation: 'none' } },
    ],
    read: f =>
      f.marketRecommendation
        ? ({ eu_first: 'EU first', us_first: 'US first', dual: 'Dual', none: 'Unclear' }[f.marketRecommendation] ?? null)
        : null,
    clear: { marketRecommendation: '' },
  },
  {
    key: 'minScore',
    label: 'Min score',
    options: [40, 60, 80].map(n => ({ label: `≥ ${n}`, patch: { minScore: n } })),
    read: f => (f.minScore > 0 ? `≥ ${f.minScore}` : null),
    clear: { minScore: 0 },
  },
  {
    key: 'listed',
    label: 'Listed on LCX',
    options: [{ label: 'Yes', patch: { listedOnLcx: true } }],
    read: f => (f.listedOnLcx === true ? 'Yes' : null),
    clear: { listedOnLcx: null },
  },
  {
    key: 'contact',
    label: 'Verified contact',
    options: [{ label: 'Yes', patch: { hasContact: true } }],
    read: f => (f.hasContact === true ? 'Yes' : null),
    clear: { hasContact: null },
  },
];

export interface FilterTokenBarProps {
  filters: BdFilters;
  search: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPatch: (patch: FilterPatch) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
  /** Right-aligned extras (snoozed toggle etc.). */
  trailing?: React.ReactNode;
}

export function FilterTokenBar({ filters, search, onSearchChange, onPatch, onReset, hasActiveFilters, trailing }: FilterTokenBarProps) {
  const [open, setOpen] = useState(false);
  const [dim, setDim] = useState<Dimension | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setDim(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const active = DIMENSIONS.map(d => ({ d, value: d.read(filters) })).filter(x => x.value !== null);
  const available = DIMENSIONS.filter(d => d.read(filters) === null);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-card px-4 py-2">
      <div className="relative">
        <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-grey" />
        <input
          type="text"
          value={search}
          onChange={onSearchChange}
          placeholder="Search name / ticker…"
          className="w-44 rounded-md border border-line bg-page py-1 pl-7 pr-2 text-xs text-navy outline-none transition-colors focus:border-cyan-500"
        />
      </div>

      {active.map(({ d, value }) => (
        <span
          key={d.key}
          className="flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/[0.07] py-1 pl-2 pr-1 text-micro font-semibold text-navy"
        >
          <span className="text-grey">{d.label}</span>
          <span className="text-grey/50">·</span>
          {value}
          <button
            type="button"
            onClick={() => onPatch(d.clear)}
            aria-label={`Clear ${d.label} filter`}
            className="ml-0.5 rounded p-0.5 text-grey transition-colors hover:bg-cyan-500/20 hover:text-navy"
          >
            <X size={10} />
          </button>
        </span>
      ))}

      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => {
            setOpen(o => !o);
            setDim(null);
          }}
          disabled={available.length === 0}
          className="flex items-center gap-1 rounded-md border border-dashed border-line px-2 py-1 text-micro font-semibold text-grey transition-colors hover:border-grey-light hover:text-navy disabled:opacity-40 dark:hover:border-grey"
        >
          <Plus size={11} /> Filter
        </button>

        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-lg border border-line bg-card p-1 shadow-overlay">
            {dim === null ? (
              available.map(d => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => (d.options.length === 1 ? (onPatch(d.options[0].patch), setOpen(false)) : setDim(d))}
                  className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-label text-navy transition-colors hover:bg-ice-soft dark:hover:bg-ice-soft/10"
                >
                  {d.label}
                  {d.options.length > 1 && <span className="text-grey">›</span>}
                </button>
              ))
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setDim(null)}
                  className="mb-0.5 flex w-full items-center gap-1 rounded-md px-2.5 py-1 text-left text-micro font-bold uppercase tracking-wider text-grey transition-colors hover:text-navy"
                >
                  <ChevronLeft size={11} /> {dim.label}
                </button>
                {dim.options.map(o => (
                  <button
                    key={o.label}
                    type="button"
                    onClick={() => {
                      onPatch(o.patch);
                      setOpen(false);
                      setDim(null);
                    }}
                    className="flex w-full rounded-md px-2.5 py-1.5 text-left text-label text-navy transition-colors hover:bg-ice-soft dark:hover:bg-ice-soft/10"
                  >
                    {o.label}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={onReset}
          className="ml-1 flex items-center gap-1 text-micro font-bold text-grey transition-colors hover:text-red-500"
        >
          <RotateCcw size={11} /> Clear
        </button>
      )}

      {trailing && <div className="ml-auto flex items-center gap-3">{trailing}</div>}
    </div>
  );
}
