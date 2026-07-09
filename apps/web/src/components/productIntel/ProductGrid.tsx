import { useState, useMemo } from 'react';
import { productCatalog, competitorProductMap } from '@/data';
import { useFilterStore } from '@/stores';
import {
  ProductEntry,
  ProductCategory,
  FeasibilityStatus,
  ProductStatus,
  CATEGORY_META,
  ProductSortField,
} from '@/types/productIntel';
import { clsx } from 'clsx';
import {
  ArrowUpDown, ChevronUp, ChevronDown, LayoutGrid, Table2,
  TrendingUp, BarChart3, Shield, Coins, Network, Scale, Server, Database, Building2,
} from 'lucide-react';

type ViewMode = 'table' | 'card';
type SortDirection = 'asc' | 'desc';

const feasibilityColorMap: Record<FeasibilityStatus, string> = {
  feasible: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  prohibited: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400',
  uncertain: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

const feasibilityLabel: Record<FeasibilityStatus, string> = {
  feasible: 'Feasible',
  partial: 'Partial',
  prohibited: 'Prohibited',
  uncertain: 'Uncertain',
};

const statusLabel: Record<ProductStatus, string> = {
  live: 'Live',
  building: 'Building',
  planned: 'Planned',
  not_started: 'Not Started',
};

const statusColorMap: Record<ProductStatus, string> = {
  live: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  building: 'bg-sky-100 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400',
  planned: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  not_started: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

const revenueColorMap: Record<string, string> = {
  transformative: 'bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400',
  high: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

const tierColorMap: Record<number, string> = {
  1: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
  2: 'bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-950/30 dark:text-cyan-400 dark:border-cyan-800',
  3: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  4: 'bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-900/20 dark:text-slate-500 dark:border-slate-700',
};

const tierLabel: Record<number, string> = { 1: 'T1 · Critical', 2: 'T2 · High', 3: 'T3 · Medium', 4: 'T4 · Monitor' };

const categoryIcons: Record<ProductCategory, React.ElementType> = {
  exchange: BarChart3, custody: Shield, payments: ArrowUpDown, token: Coins,
  earn: TrendingUp, defi: Network, institutional: Building2, advisory: Scale,
  infrastructure: Server, data: Database,
};

interface ColumnDef {
  key: ProductSortField | 'usPreClarity' | 'usPostClarity' | 'competitors' | 'revenue';
  label: string;
  short: string;
  sortable: boolean;
  width: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Product', short: 'Product', sortable: true, width: 'min-w-[170px]' },
  { key: 'category', label: 'Category', short: 'Cat', sortable: true, width: 'min-w-[100px]' },
  { key: 'priorityTier', label: 'Priority', short: 'Pri', sortable: true, width: 'min-w-[85px]' },
  { key: 'usPreClarity', label: 'US (Pre-CLARITY)', short: 'Pre-CLR', sortable: false, width: 'min-w-[100px]' },
  { key: 'usPostClarity', label: 'US (Post-CLARITY)', short: 'Post-CLR', sortable: false, width: 'min-w-[105px]' },
  { key: 'currentStatus', label: 'Status', short: 'Status', sortable: true, width: 'min-w-[80px]' },
  { key: 'competitors', label: 'Competitors', short: 'Comp', sortable: false, width: 'min-w-[90px]' },
  { key: 'revenue', label: 'Revenue', short: 'Rev', sortable: false, width: 'min-w-[85px]' },
  { key: 'strategicImportance', label: 'Strat.', short: 'Strat', sortable: true, width: 'min-w-[60px]' },
  { key: 'implementationComplexity', label: 'Cmplx', short: 'Cx', sortable: true, width: 'min-w-[55px]' },
];

function resolveSortValue(p: ProductEntry, key: ProductSortField): number | string {
  switch (key) {
    case 'name': return p.name.toLowerCase();
    case 'category': return p.category;
    case 'priorityTier': return p.priorityTier;
    case 'currentStatus': {
      const order: Record<string, number> = { live: 0, building: 1, planned: 2, not_started: 3 };
      return order[p.currentStatus] ?? 4;
    }
    case 'strategicImportance': return p.strategicImportance;
    case 'implementationComplexity': return p.implementationComplexity;
    case 'usTimelineMonths': return p.usTimelineMonths;
    default: return '';
  }
}

interface ProductGridProps {
  onProductClick?: (productId: string) => void;
}

export function ProductGrid({ onProductClick }: ProductGridProps) {
  const { clarityEnacted } = useFilterStore();
  const [sortField, setSortField] = useState<ProductSortField>('priorityTier');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [categoryFilter, setCategoryFilter] = useState<ProductCategory | 'All'>('All');
  const [audienceFilter, setAudienceFilter] = useState<'All' | 'retail' | 'institutional' | 'both'>('All');
  const [tierFilter, setTierFilter] = useState<number | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<ProductStatus | 'All'>('All');

  const allCompetitorIds = Object.keys(competitorProductMap);

  const filtered = useMemo(() => {
    return productCatalog.filter(p => {
      if (categoryFilter !== 'All' && p.category !== categoryFilter) return false;
      if (audienceFilter !== 'All' && p.audience !== audienceFilter) return false;
      if (tierFilter !== 'All' && p.priorityTier !== tierFilter) return false;
      if (statusFilter !== 'All' && p.currentStatus !== statusFilter) return false;
      return true;
    });
  }, [categoryFilter, audienceFilter, tierFilter, statusFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const va = resolveSortValue(a, sortField);
      const vb = resolveSortValue(b, sortField);
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortField, sortDir]);

  const handleSort = (field: ProductSortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }: { field: ProductSortField }) => {
    if (sortField !== field) return <ArrowUpDown size={10} className="inline opacity-25" />;
    return sortDir === 'asc' ? <ChevronUp size={12} className="inline text-cyan-500" /> : <ChevronDown size={12} className="inline text-cyan-500" />;
  };

  const categories = Object.keys(CATEGORY_META) as ProductCategory[];

  const renderCell = (p: ProductEntry, col: ColumnDef) => {
    switch (col.key) {
      case 'name':
        return (
          <div className="flex items-center gap-2">
            {(() => { const Icon = categoryIcons[p.category]; return <Icon size={14} className="text-grey shrink-0" />; })()}
            <div>
              <div className="font-bold text-[11px] text-navy dark:text-ice leading-tight">{p.name}</div>
              <div className="text-[9px] text-grey">{p.subcategory}</div>
            </div>
          </div>
        );
      case 'category':
        return (
          <span className="text-[10px] font-semibold text-navy dark:text-ice">{CATEGORY_META[p.category].label}</span>
        );
      case 'priorityTier':
        return (
          <span className={clsx('text-[9px] px-1.5 py-0.5 rounded-full border font-bold', tierColorMap[p.priorityTier])}>
            {tierLabel[p.priorityTier]}
          </span>
        );
      case 'usPreClarity':
        return clarityEnacted ? null : (
          <span className={clsx('text-[9px] px-1.5 py-0.5 rounded-full font-bold', feasibilityColorMap[p.usPreClarity])}>
            {feasibilityLabel[p.usPreClarity]}
          </span>
        );
      case 'usPostClarity':
        return clarityEnacted ? (
          <span className={clsx('text-[9px] px-1.5 py-0.5 rounded-full font-bold', feasibilityColorMap[p.usPostClarity])}>
            {feasibilityLabel[p.usPostClarity]}
          </span>
        ) : (
          <span className={clsx('text-[9px] px-1.5 py-0.5 rounded-full font-bold', feasibilityColorMap[p.usPreClarity])}>
            {clarityEnacted ? feasibilityLabel[p.usPostClarity] : feasibilityLabel[p.usPreClarity]}
          </span>
        );
      case 'currentStatus':
        return (
          <span className={clsx('text-[9px] px-1.5 py-0.5 rounded-full font-bold', statusColorMap[p.currentStatus])}>
            {statusLabel[p.currentStatus]}
          </span>
        );
      case 'competitors': {
        const compCount = p.topCompetitors.filter(cid => allCompetitorIds.includes(cid)).length;
        return (
          <span className={clsx('font-mono text-[10px] font-bold', compCount > 5 ? 'text-status-blocked' : compCount > 2 ? 'text-status-conditional' : 'text-status-ready')}>
            {compCount}
          </span>
        );
      }
      case 'revenue':
        return (
          <span className={clsx('text-[9px] px-1.5 py-0.5 rounded-full font-bold', revenueColorMap[p.estRevenuePotential])}>
            {p.estRevenuePotential}
          </span>
        );
      case 'strategicImportance':
        return (
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-14 bg-line rounded-full overflow-hidden">
              <div className={clsx('h-full rounded-full', p.strategicImportance >= 8 ? 'bg-purple-500' : p.strategicImportance >= 6 ? 'bg-cyan-500' : 'bg-slate-400')}
                style={{ width: `${p.strategicImportance * 10}%` }} />
            </div>
            <span className="font-mono text-[9px] font-bold text-navy dark:text-ice">{p.strategicImportance}</span>
          </div>
        );
      case 'implementationComplexity':
        return (
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-10 bg-line rounded-full overflow-hidden">
              <div className={clsx('h-full rounded-full', p.implementationComplexity >= 8 ? 'bg-red-500' : p.implementationComplexity >= 5 ? 'bg-amber-500' : 'bg-emerald-500')}
                style={{ width: `${p.implementationComplexity * 10}%` }} />
            </div>
            <span className="font-mono text-[9px] font-bold text-navy dark:text-ice">{p.implementationComplexity}</span>
          </div>
        );
      default: return null;
    }
  };

  const tableRows = sorted.map(p => (
    <tr key={p.id} className="border-b border-line hover:bg-ice-soft/30 dark:hover:bg-ice-soft/5 transition-colors cursor-pointer"
      onClick={() => onProductClick?.(p.id)}>
      {COLUMNS.map(col => (
        <td key={col.key} className="p-2 whitespace-nowrap">{renderCell(p, col)}</td>
      ))}
    </tr>
  ));

  const cardRows = sorted.map(p => {
    const Icon = categoryIcons[p.category];
    const compCount = p.topCompetitors.filter(cid => allCompetitorIds.includes(cid)).length;
    return (
      <div key={p.id} onClick={() => onProductClick?.(p.id)} className="cursor-pointer">
        <div className={clsx('rounded-lg border bg-card p-3 transition-all hover:shadow-md hover:-translate-y-[0.5px]',
          p.priorityTier === 1 ? 'border-amber-400/40' : p.priorityTier === 2 ? 'border-cyan-400/30' : 'border-line')}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="rounded p-1" style={{ backgroundColor: CATEGORY_META[p.category].color + '20', color: CATEGORY_META[p.category].color }}>
                <Icon size={13} />
              </div>
              <div>
                <div className="font-bold text-[11px] text-navy dark:text-ice leading-tight">{p.name}</div>
                <div className="text-[9px] text-grey">{CATEGORY_META[p.category].label} · {p.audience}</div>
              </div>
            </div>
            <span className={clsx('text-[8px] px-1.5 py-0.5 rounded-full border font-bold', tierColorMap[p.priorityTier])}>
              T{p.priorityTier}
            </span>
          </div>
          <p className="text-[9px] text-grey-dark dark:text-grey-light leading-snug mb-2 line-clamp-2">{p.description}</p>
          <div className="flex items-center gap-2 text-[9px]">
            <span className={clsx('px-1.5 py-0.5 rounded font-mono font-bold', feasibilityColorMap[clarityEnacted ? p.usPostClarity : p.usPreClarity])}>
              {clarityEnacted ? feasibilityLabel[p.usPostClarity] : feasibilityLabel[p.usPreClarity]} (US)
            </span>
            <span className={clsx('px-1.5 py-0.5 rounded font-mono font-bold', statusColorMap[p.currentStatus])}>
              {statusLabel[p.currentStatus]}
            </span>
            {compCount > 0 && (
              <span className="text-grey font-mono">{compCount} competitors</span>
            )}
          </div>
        </div>
      </div>
    );
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-navy dark:text-ice">Product Catalog</h2>
        <div className="flex items-center gap-1 border border-line rounded-lg overflow-hidden">
          <button onClick={() => setViewMode('table')} className={clsx('px-2 py-1 transition-colors', viewMode === 'table' ? 'bg-navy dark:bg-ice text-card dark:text-navy' : 'hover:bg-ice-soft text-grey')}>
            <Table2 size={14} />
          </button>
          <button onClick={() => setViewMode('card')} className={clsx('px-2 py-1 transition-colors', viewMode === 'card' ? 'bg-navy dark:bg-ice text-card dark:text-navy' : 'hover:bg-ice-soft text-grey')}>
            <LayoutGrid size={14} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as any)}
          className="h-7 rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 text-[10px] font-semibold focus:outline-none text-navy dark:text-ice">
          <option value="All">All Categories</option>
          {categories.map(c => (
            <option key={c} value={c}>{CATEGORY_META[c].label}</option>
          ))}
        </select>
        <select value={audienceFilter} onChange={e => setAudienceFilter(e.target.value as any)}
          className="h-7 rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 text-[10px] font-semibold focus:outline-none text-navy dark:text-ice">
          <option value="All">All Audiences</option>
          <option value="retail">Retail</option>
          <option value="institutional">Institutional</option>
          <option value="both">Both</option>
        </select>
        <select value={tierFilter} onChange={e => setTierFilter(e.target.value === 'All' ? 'All' : parseInt(e.target.value))}
          className="h-7 rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 text-[10px] font-semibold focus:outline-none text-navy dark:text-ice">
          <option value="All">All Priorities</option>
          <option value="1">Tier 1 — Critical</option>
          <option value="2">Tier 2 — High</option>
          <option value="3">Tier 3 — Medium</option>
          <option value="4">Tier 4 — Monitor</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
          className="h-7 rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 text-[10px] font-semibold focus:outline-none text-navy dark:text-ice">
          <option value="All">All Statuses</option>
          <option value="live">Live</option>
          <option value="building">Building</option>
          <option value="planned">Planned</option>
          <option value="not_started">Not Started</option>
        </select>
        <span className="text-[9px] text-grey ml-1 font-mono">{sorted.length} of {productCatalog.length}</span>
      </div>

      {viewMode === 'table' ? (
        <div className="overflow-x-auto border border-line rounded-lg bg-card shadow-sm">
          <table className="w-full border-collapse text-left text-[10px]">
            <thead>
              <tr className="bg-ice-soft/40 dark:bg-navy-deep/20 border-b border-line">
                {COLUMNS.map(col => (
                  <th key={col.key} className={clsx('p-2 text-[9px] font-bold uppercase tracking-wider text-grey select-none whitespace-nowrap', col.width,
                    col.sortable && 'cursor-pointer hover:text-navy dark:hover:text-ice')}
                    onClick={() => col.sortable && handleSort(col.key as ProductSortField)}>
                    <span className="flex items-center gap-1">
                      {col.short}
                      {col.sortable && <SortIcon field={col.key as ProductSortField} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{tableRows}</tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {cardRows}
          {sorted.length === 0 && (
            <p className="col-span-full text-center text-xs text-grey py-8">No products match the active filters.</p>
          )}
        </div>
      )}
    </div>
  );
}
