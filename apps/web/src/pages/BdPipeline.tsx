import { useEffect, useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFilterStore } from '@/stores';
import { useBdStore } from '@/stores/useBdStore';
import { fetchBdPipeline } from '@/lib/api/bd';
import { LeadTable } from '@/components/bd';
import { Target, Search, RotateCcw } from 'lucide-react';
import { clsx } from 'clsx';
import type { ScoreBand } from '@lcx/shared';
import type { Market, BdLead } from '@/types/bd';

const MARKET_OPTIONS: { value: Market | 'both' | ''; label: string }[] = [
  { value: '', label: 'All Markets' },
  { value: 'eu', label: 'EU' },
  { value: 'us', label: 'US' },
  { value: 'both', label: 'EU / US' },
];

const BAND_OPTIONS: { value: ScoreBand | ''; label: string }[] = [
  { value: '', label: 'All Bands' },
  { value: 'immediate', label: 'Immediate' },
  { value: 'high', label: 'High' },
  { value: 'nurture', label: 'Nurture' },
  { value: 'watch', label: 'Watch' },
  { value: 'archive', label: 'Archive' },
];

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Sources' },
  { value: 'esma_main', label: 'ESMA' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'top100', label: 'Top 100' },
  { value: 'pre_tge', label: 'Pre-TGE' },
  { value: 'manual', label: 'Manual' },
];

export function BdPipeline() {
  const navigate = useNavigate();
  const { clarityEnacted, toggleFilterStoreField } = useFilterStore();
  const {
    market, minScore, source, band, listedOnLcx, hasContact, marketRecommendation,
    sort, order, search,
    loading, error,
    setFilter, resetFilters, setLoading, setError, selectLead,
  } = useBdStore();

  const [leads, setLeads] = useState<BdLead[]>([]);
  const [total, setTotal] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const loadLeads = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const filters = { market, minScore, source, band, listedOnLcx, hasContact, marketRecommendation, sort, order, search };
      const res = await fetchBdPipeline(filters, controller.signal);
      if (!controller.signal.aborted) {
        const enriched = res.data.map((lead) => ({
          ...lead,
          hasContact: lead.verifiedContactCount > 0,
          marketTag: null as Market | 'both' | null,
        }));
        setLeads(enriched);
        setTotal(res.meta.total);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load leads');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [market, minScore, source, band, listedOnLcx, hasContact, marketRecommendation, sort, order, search, setLoading, setError]);

  useEffect(() => {
    loadLeads();
    return () => abortRef.current?.abort();
  }, [loadLeads]);

  const handleSort = useCallback((field: typeof sort) => {
    if (field === sort) {
      setFilter('order', order === 'asc' ? 'desc' : 'asc');
    } else {
      setFilter('sort', field);
      setFilter('order', field === 'name' ? 'asc' : 'desc');
    }
  }, [sort, order, setFilter]);

  const handleSelect = useCallback((id: string) => {
    selectLead(id);
    navigate(`/bd-pipeline/${id}`);
  }, [navigate, selectLead]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFilter('search', e.target.value);
  }, [setFilter]);

  const hasActiveFilters = market || minScore > 0 || source || band || listedOnLcx !== null || hasContact !== null || marketRecommendation || search;

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col text-navy dark:text-ice overflow-hidden">
      {/* TOOLBAR */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-line bg-card overflow-x-auto">
        <h1 className="text-lg font-bold shrink-0 flex items-center gap-1.5">
          <Target size={17} className="text-cyan-500" />
          BD Engine
        </h1>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[10px] text-grey font-mono">{total} leads</span>

          <button
            onClick={() => toggleFilterStoreField('clarityEnacted')}
            className={clsx(
              'flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold transition-all duration-300',
              clarityEnacted
                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-600 dark:border-cyan-400 dark:bg-cyan-400/10 dark:text-cyan-400 shadow-sm shadow-cyan-500/10'
                : 'border-line text-grey hover:bg-ice-soft',
            )}
          >
            <span className={clsx('h-1.5 w-1.5 rounded-full', clarityEnacted ? 'bg-cyan-500' : 'bg-slate-400')} />
            {clarityEnacted ? 'CLARITY Enacted' : 'CLARITY Inactive'}
          </button>
        </div>
      </div>

      {/* FILTERS */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-line bg-card flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-grey pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={handleSearchChange}
            placeholder="Search name / ticker..."
            className="w-44 rounded border border-line bg-ice-soft dark:bg-navy-deep px-7 py-1 text-xs outline-none focus:border-cyan-500 transition-colors"
          />
        </div>

        <select
          value={market ?? ''}
          onChange={(e) => setFilter('market', (e.target.value || null) as Market | 'both' | null)}
          className="rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 py-1 text-xs outline-none focus:border-cyan-500 transition-colors"
        >
          {MARKET_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          value={band}
          onChange={(e) => setFilter('band', e.target.value as ScoreBand | '')}
          className="rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 py-1 text-xs outline-none focus:border-cyan-500 transition-colors"
        >
          {BAND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          value={source}
          onChange={(e) => setFilter('source', e.target.value)}
          className="rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 py-1 text-xs outline-none focus:border-cyan-500 transition-colors"
        >
          {SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-[10px] text-grey cursor-pointer select-none">
          <input
            type="checkbox"
            checked={listedOnLcx === true}
            onChange={(e) => setFilter('listedOnLcx', e.target.checked ? true : null)}
            className="rounded border-line"
          />
          Listed on LCX
        </label>

        <label className="flex items-center gap-1.5 text-[10px] text-grey cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hasContact === true}
            onChange={(e) => setFilter('hasContact', e.target.checked ? true : null)}
            className="rounded border-line"
          />
          Has Verified Contact
        </label>

        <select
          value={marketRecommendation}
          onChange={(e) => setFilter('marketRecommendation', e.target.value as any)}
          className="rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 py-1 text-xs outline-none focus:border-cyan-500 transition-colors"
        >
          <option value="">All Recommendations</option>
          <option value="eu_first">EU First</option>
          <option value="us_first">US First</option>
          <option value="dual">Dual</option>
          <option value="none">Unclear</option>
        </select>

        <div className="flex items-center gap-1.5 text-[10px] text-grey">
          <span>Min score:</span>
          <input
            type="number"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => setFilter('minScore', Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
            className="w-14 rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 py-1 text-xs outline-none focus:border-cyan-500 transition-colors"
          />
        </div>

        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1 text-[10px] font-bold text-red-500 hover:text-red-600 transition-colors"
          >
            <RotateCcw size={11} />
            Clear
          </button>
        )}
      </div>

      {/* DISCLAIMER */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-line bg-amber-50/50 dark:bg-amber-950/10">
        <span className="text-[10px] text-amber-700 dark:text-amber-400 leading-tight">
          ⚠ Scores and market recommendations are planning heuristics only — not legal advice. US scoring weighs pre/post CLARITY scenarios. Consult qualified counsel for regulatory decisions.
        </span>
      </div>

      {/* TABLE AREA */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-2 text-grey">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
              <span className="text-sm">Loading leads...</span>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-red-500">
            <p className="text-sm font-semibold">Failed to load leads</p>
            <p className="text-xs mt-1 text-grey">{error}</p>
            <button
              onClick={loadLeads}
              className="mt-3 rounded border border-red-200 px-3 py-1 text-xs font-bold hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && (
          <LeadTable
            leads={leads}
            filters={{ market, minScore, source, band, listedOnLcx, hasContact, marketRecommendation, sort, order, search }}
            clarityEnacted={clarityEnacted}
            onSort={handleSort}
            onSelect={handleSelect}
            loading={false}
          />
        )}
      </div>
    </div>
  );
}

export default BdPipeline;
