import { useState, useMemo } from 'react';
import { competitors as allCompetitors, states, products } from '@/data';
import { useAuditStore, useFilterStore } from '@/stores';
import { Badge, Card, CardBody } from '@/components/ui';
import {
  Competitor,
  ThreatLevel,
  ClarityActPosition,
  CompetitorStatus,
  CompetitorSortField,
} from '@/types/competitors';
import { clsx } from 'clsx';
import {
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  LayoutGrid,
  Table2,
  Check,
  X,
  AlertTriangle,
  Shield,
  Building2,
} from 'lucide-react';

type ViewMode = 'table' | 'card';
type SortDirection = 'asc' | 'desc';

interface ColumnDef {
  key: CompetitorSortField;
  label: string;
  shortLabel: string;
  sortable: boolean;
  width: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Exchange', shortLabel: 'Exchange', sortable: true, width: 'min-w-[140px]' },
  { key: 'threatLevel', label: 'Threat to LCX', shortLabel: 'Threat', sortable: true, width: 'min-w-[90px]' },
  { key: 'users', label: 'Users', shortLabel: 'Users', sortable: true, width: 'min-w-[85px]' },
  { key: 'quarterlyVolume', label: 'Quarterly Vol.', shortLabel: 'Vol.', sortable: true, width: 'min-w-[100px]' },
  { key: 'mtlCount', label: 'MTL States', shortLabel: 'MTLs', sortable: true, width: 'min-w-[80px]' },
  { key: 'assetsOnPlatform', label: 'Custody Assets', shortLabel: 'Assets', sortable: true, width: 'min-w-[100px]' },
  { key: 'marketShare', label: 'Est. Share', shortLabel: 'Share', sortable: true, width: 'min-w-[70px]' },
  { key: 'howeyScore', label: 'Howey Risk', shortLabel: 'Howey', sortable: true, width: 'min-w-[80px]' },
  { key: 'clarityActPosition', label: 'CLARITY Position', shortLabel: 'CLARITY', sortable: true, width: 'min-w-[110px]' },
];

const threatBadgeMap: Record<string, 'blocked' | 'conditional' | 'deferred' | 'ready'> = {
  Critical: 'blocked',
  High: 'conditional',
  Medium: 'deferred',
  Low: 'ready',
  None: 'ready',
};

const clarityLabelMap: Record<string, string> = {
  strong_beneficiary: 'Strong Beneficiary',
  moderate: 'Moderate',
  minimal: 'Minimal',
  irrelevant: 'Irrelevant',
  blocked: 'Blocked',
};

const clarityColorMap: Record<string, string> = {
  strong_beneficiary: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  moderate: 'bg-sky-100 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400',
  minimal: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  irrelevant: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
  blocked: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400',
};

const statusLabelMap: Record<string, string> = {
  public: 'Public',
  private: 'Private',
  blocked: 'Blocked',
  defunct: 'Defunct',
};

function getMTLCount(c: Competitor): number {
  return c.statePresence.length;
}

function resolveSortValue(competitor: Competitor, key: CompetitorSortField): number | string {
  switch (key) {
    case 'name': return competitor.name.toLowerCase();
    case 'users': {
      const u = competitor.users.replace(/[^0-9.MmBb]/g, '');
      if (/[Bb]/.test(u)) return parseFloat(u) * 1_000_000_000;
      if (/[Mm]/.test(u)) return parseFloat(u) * 1_000_000;
      return parseFloat(u) || 0;
    }
    case 'revenue': {
      const r = competitor.financials.revenue.replace(/[^0-9.Bb]/g, '');
      if (/[Bb]/.test(r)) return parseFloat(r) * 1_000_000_000;
      return parseFloat(r) || 0;
    }
    case 'quarterlyVolume': {
      const v = competitor.financials.quarterlyVolume.replace(/[^0-9.Bb]/g, '');
      if (/[Bb]/.test(v)) return parseFloat(v) * 1_000_000_000;
      return parseFloat(v) || 0;
    }
    case 'assetsOnPlatform': {
      const a = competitor.financials.assetsOnPlatform.replace(/[^0-9.Bb]/g, '');
      if (/[Bb]/.test(a)) return parseFloat(a) * 1_000_000_000;
      return parseFloat(a) || 0;
    }
    case 'marketShare': return competitor.marketShare;
    case 'mtlCount': return getMTLCount(competitor);
    case 'threatLevel': {
      const order: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, None: 4 };
      return order[competitor.threatLevel] ?? 5;
    }
    case 'howeyScore': return competitor.howeyProfile.avgScore;
    case 'clarityActPosition': {
      const order: Record<string, number> = { strong_beneficiary: 0, moderate: 1, minimal: 2, irrelevant: 3, blocked: 4 };
      return order[competitor.clarityAct.position] ?? 5;
    }
    default: return '';
  }
}

interface CompetitorGridProps {
  onCompetitorClick?: (competitorId: string) => void;
}

export function CompetitorGrid({ onCompetitorClick }: CompetitorGridProps) {
  const [sortField, setSortField] = useState<CompetitorSortField>('threatLevel');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [threatFilter, setThreatFilter] = useState<ThreatLevel | 'All'>('All');
  const [clarityFilter, setClarityFilter] = useState<ClarityActPosition | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<CompetitorStatus | 'All'>('All');
  const { addAuditLog } = useAuditStore();
  const { clarityEnacted } = useFilterStore();

  const filtered = useMemo(() => {
    return allCompetitors.filter(c => {
      if (threatFilter !== 'All' && c.threatLevel !== threatFilter) return false;
      if (clarityFilter !== 'All' && c.clarityAct.position !== clarityFilter) return false;
      if (statusFilter !== 'All' && c.status !== statusFilter) return false;
      return true;
    });
  }, [threatFilter, clarityFilter, statusFilter]);

  const sorted = useMemo(() => {
    let result = [...filtered];
    if (clarityEnacted) {
      result.sort((a, b) => {
        const order: Record<string, number> = { strong_beneficiary: 0, moderate: 1, minimal: 2, irrelevant: 3, blocked: 4 };
        const ca = order[a.clarityAct.position] ?? 5;
        const cb = order[b.clarityAct.position] ?? 5;
        if (ca !== cb) return ca - cb;
        const va = resolveSortValue(a, sortField);
        const vb = resolveSortValue(b, sortField);
        if (va < vb) return sortDir === 'asc' ? -1 : 1;
        if (va > vb) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      result.sort((a, b) => {
        const va = resolveSortValue(a, sortField);
        const vb = resolveSortValue(b, sortField);
        if (va < vb) return sortDir === 'asc' ? -1 : 1;
        if (va > vb) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [filtered, sortField, sortDir, clarityEnacted]);

  const handleSort = (field: CompetitorSortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    addAuditLog(`CCO sorted competition grid by: ${field}`, 'System');
  };

  const handleFilterChange = (
    setter: React.Dispatch<React.SetStateAction<any>>,
    value: string,
    label: string,
  ) => {
    setter(value);
    addAuditLog(`CCO filtered competition grid: ${label} = ${value}`, 'System');
  };

  const lcxMTLCount = useMemo(() => {
    const p1States = states.filter(s => s.phase === 'Phase 1' && s.tier !== 'Unresearched');
    const p2States = states.filter(s => s.phase === 'Phase 2' && s.tier !== 'Unresearched');
    const p3States = states.filter(s => s.phase === 'Phase 3' && s.tier !== 'Unresearched');
    const allPhased = new Set([...p1States, ...p2States, ...p3States].map(s => s.id));
    return allPhased.size;
  }, []);

  const lcxAvgHowey = useMemo(() => {
    const howeys = products.map(p => p.howeyScore ?? 0).filter(s => s > 0);
    return howeys.length ? Math.round(howeys.reduce((a, b) => a + b, 0) / howeys.length) : 30;
  }, []);

  const lcxTrustCharter = 'Wyoming SPDI (Option B target)';

  const SortIcon = ({ field }: { field: CompetitorSortField }) => {
    if (sortField !== field) return <ArrowUpDown size={11} className="inline opacity-30" />;
    return sortDir === 'asc'
      ? <ChevronUp size={13} className="inline text-cyan-500" />
      : <ChevronDown size={13} className="inline text-cyan-500" />;
  };

  const renderCell = (c: Competitor, col: ColumnDef) => {
    switch (col.key) {
      case 'name':
        return (
          <div className="flex items-center gap-2">
            <span className="font-bold text-xs text-navy dark:text-ice whitespace-nowrap">{c.name}</span>
            {c.ticker && (
              <span className="text-[9px] font-mono text-grey dark:text-grey-light bg-ice-soft dark:bg-navy-deep px-1 rounded">
                {c.ticker}
              </span>
            )}
            <span className={clsx(
              'text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase',
              statusLabelMap[c.status] === 'Public' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-400' :
              statusLabelMap[c.status] === 'Private' ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400' :
              'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400'
            )}>
              {statusLabelMap[c.status] || c.status}
            </span>
          </div>
        );

      case 'threatLevel': {
        const badgeStatus = threatBadgeMap[c.threatLevel] || 'deferred';
        return (
          <Badge status={badgeStatus} className="text-[10px] gap-1 px-1.5 py-0">
            {c.threatLevel}
          </Badge>
        );
      }

      case 'users':
        return <span className="font-mono text-[11px] font-semibold">{c.users}</span>;

      case 'quarterlyVolume':
        return <span className="font-mono text-[11px]">{c.financials.quarterlyVolume.replace('+', '').replace('(global)', '').replace('(crypto only, est.)', '').replace('(global, pre-hack)', '').trim()}</span>;

      case 'mtlCount': {
        const count = clarityEnacted && c.clarityAct.position === 'strong_beneficiary' ? 0 : getMTLCount(c);
        const color = clarityEnacted && c.clarityAct.position === 'strong_beneficiary'
          ? 'text-status-ready'
          : count >= 35 ? 'text-status-ready' : count >= 15 ? 'text-status-conditional' : count > 0 ? 'text-status-blocked' : 'text-grey';
        return (
          <span className="flex items-center gap-1">
            <span className={clsx('font-mono text-[11px] font-bold', color)}>
              {clarityEnacted && c.clarityAct.position === 'strong_beneficiary' ? '0' : count}{c.statePresence.length > 0 ? '/50' : ''}
            </span>
            {clarityEnacted && c.clarityAct.position === 'strong_beneficiary' && (
              <span className="text-[8px] text-status-ready font-bold">PREEMPTED</span>
            )}
          </span>
        );
      }

      case 'assetsOnPlatform':
        return <span className="font-mono text-[11px]">{c.financials.assetsOnPlatform}</span>;

      case 'marketShare':
        return (
          <span className={clsx(
            'font-mono text-[11px] font-bold',
            c.marketShare >= 10 ? 'text-cyan-600 dark:text-cyan-400' :
            c.marketShare > 0 ? 'text-grey-dark dark:text-grey-light' :
            'text-grey'
          )}>
            {c.marketShare > 0 ? `${c.marketShare}%` : '—'}
          </span>
        );

      case 'howeyScore':
        return (
          <span className={clsx(
            'font-mono text-[11px] font-bold',
            c.howeyProfile.avgScore >= 35 ? 'text-status-blocked' :
            c.howeyProfile.avgScore >= 25 ? 'text-status-conditional' :
            'text-status-ready'
          )}>
            {c.howeyProfile.avgScore}%
          </span>
        );

      case 'clarityActPosition':
        return (
          <span className={clsx(
            'text-[9px] px-1.5 py-0.5 rounded-full font-bold',
            clarityColorMap[c.clarityAct.position]
          )}>
            {clarityLabelMap[c.clarityAct.position]}
          </span>
        );

      default:
        return null;
    }
  };

  const renderExtraInfo = (c: Competitor) => {
    return (
      <div className="flex items-center gap-3 text-[10px]">
        <span className="flex items-center gap-1">
          {c.licenses.bitLicense ? <Check size={12} className="text-status-ready" /> : <X size={12} className="text-grey" />}
          <span className={c.licenses.bitLicense ? '' : 'text-grey'}>BitLicense</span>
        </span>
        <span className="flex items-center gap-1">
          {c.licenses.spdiCharter || c.licenses.nyTrustCharter || c.licenses.occTrustCharter
            ? <Shield size={12} className="text-cyan-500" />
            : <X size={12} className="text-grey" />
          }
          <span className={c.licenses.spdiCharter || c.licenses.nyTrustCharter || c.licenses.occTrustCharter ? '' : 'text-grey'}>
            {c.licenses.occTrustCharter ? 'OCC' : c.licenses.spdiCharter ? 'SPDI' : c.licenses.nyTrustCharter ? 'NY Tr.' : 'None'}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <AlertTriangle size={12} className={clsx(
            c.legalHistory.filter(e => e.severity === 'Criminal' || (e.severity === 'Lawsuit' && e.status === 'Ongoing')).length > 0 ? 'text-status-blocked' :
            c.legalHistory.length > 0 ? 'text-status-conditional' : 'text-status-ready'
          )} />
          <span className="font-mono text-[9px] text-grey">{c.legalHistory.length} events</span>
        </span>
      </div>
    );
  };

  const renderLCXRow = () => (
    <tr className="border-t-2 border-cyan-500/50 bg-cyan-500/[0.04] dark:bg-cyan-500/[0.03] font-semibold">
      <td className="p-2.5 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span className="font-bold text-xs text-cyan-600 dark:text-cyan-400">LCX USA</span>
          <span className="text-[9px] font-mono text-cyan-500 bg-cyan-50 dark:bg-cyan-950/20 px-1 rounded tracking-tight">
            PROJECTED
          </span>
        </div>
      </td>
      <td className="p-2.5">
        <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-bold">New Entrant</span>
      </td>
      <td className="p-2.5">
        <span className="font-mono text-[11px] text-cyan-600 dark:text-cyan-400">—</span>
      </td>
      <td className="p-2.5">
        <span className="font-mono text-[11px] text-grey">—</span>
      </td>
      <td className="p-2.5">
        <span className="font-mono text-[11px] font-bold text-status-conditional">{lcxMTLCount}/50</span>
      </td>
      <td className="p-2.5">
        <span className="font-mono text-[11px] text-grey">—</span>
      </td>
      <td className="p-2.5">
        <span className="font-mono text-[11px] font-bold text-grey">0%</span>
      </td>
      <td className="p-2.5">
        <span className="font-mono text-[11px] font-bold text-status-conditional">{lcxAvgHowey}%</span>
      </td>
      <td className="p-2.5">
        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
          Strong Beneficiary
        </span>
      </td>
      <td className="p-2.5">
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1">
            <X size={12} className="text-grey" />
            <span className="text-grey">BitLicense</span>
          </span>
          <span className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400">
            <Building2 size={12} />
            <span>SPDI (Option B)</span>
          </span>
          <span className="flex items-center gap-1 text-status-ready">
            <Check size={12} />
            <span>Clean</span>
          </span>
        </div>
      </td>
    </tr>
  );

  const tableRows = sorted.map(c => (
      <tr
        key={c.id}
        className={clsx(
          'border-b border-line hover:bg-ice-soft/30 dark:hover:bg-ice-soft/5 transition-colors cursor-pointer',
          c.status === 'blocked' && 'opacity-60',
          clarityEnacted && c.clarityAct.position === 'strong_beneficiary' && 'border-l-2 border-l-cyan-500 bg-cyan-500/[0.02] dark:bg-cyan-500/[0.01]'
        )}
        onClick={() => onCompetitorClick?.(c.id)}
      >
      {COLUMNS.filter(col => col.sortable).map(col => (
        <td key={col.key} className="p-2.5 whitespace-nowrap">
          {renderCell(c, col)}
        </td>
      ))}
      <td className="p-2.5 text-[10px]">
        {renderExtraInfo(c)}
      </td>
    </tr>
  ));

  const cardRows = sorted.map(c => (
    <div
      key={c.id}
      onClick={() => onCompetitorClick?.(c.id)}
      className="cursor-pointer"
    >
      <Card
        className={clsx(
          'transition-all hover:shadow-md hover:-translate-y-[0.5px]',
          c.status === 'blocked' && 'opacity-60',
          c.threatLevel === 'Critical' ? 'border-red-500/30' :
          c.threatLevel === 'High' ? 'border-orange-500/20' : ''
        )}
      >
      <CardBody className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-navy dark:text-ice">{c.name}</span>
            {c.ticker && (
              <span className="text-[9px] font-mono text-grey dark:text-grey-light bg-ice-soft dark:bg-navy-deep px-1.5 rounded">
                {c.ticker}
              </span>
            )}
            <span className={clsx(
              'text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase',
              statusLabelMap[c.status] === 'Public' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-400' :
              statusLabelMap[c.status] === 'Private' ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400' :
              'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400'
            )}>
              {statusLabelMap[c.status] || c.status}
            </span>
          </div>
          <Badge status={threatBadgeMap[c.threatLevel] || 'deferred'} className="text-[10px] px-1.5">
            {c.threatLevel}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] mb-2">
          <div className="flex justify-between">
            <span className="text-grey">Users:</span>
            <span className="font-mono font-semibold">{c.users}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-grey">Vol.:</span>
            <span className="font-mono">{c.financials.quarterlyVolume.replace('+', '').replace('(global)', '').replace('(crypto only, est.)', '').replace('(global, pre-hack)', '').trim()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-grey">MTL States:</span>
            <span className={clsx(
              'font-mono font-bold',
              getMTLCount(c) >= 35 ? 'text-status-ready' :
              getMTLCount(c) >= 15 ? 'text-status-conditional' :
              getMTLCount(c) > 0 ? 'text-status-blocked' : 'text-grey'
            )}>
              {getMTLCount(c)}/50
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-grey">Share:</span>
            <span className={clsx('font-mono font-bold', c.marketShare > 0 ? 'text-cyan-600 dark:text-cyan-400' : 'text-grey')}>
              {c.marketShare > 0 ? `${c.marketShare}%` : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-grey">Howey:</span>
            <span className={clsx(
              'font-mono font-bold',
              c.howeyProfile.avgScore >= 35 ? 'text-status-blocked' :
              c.howeyProfile.avgScore >= 25 ? 'text-status-conditional' : 'text-status-ready'
            )}>
              {c.howeyProfile.avgScore}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-grey">CLARITY:</span>
            <span className={clsx('text-[9px]', clarityColorMap[c.clarityAct.position])}>
              {clarityLabelMap[c.clarityAct.position]}
            </span>
          </div>
        </div>
        {renderExtraInfo(c)}
      </CardBody>
    </Card>
    </div>
  ));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-navy dark:text-ice">Exchange Comparison</h2>
        <div className="flex items-center gap-1 border border-line rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('table')}
            className={clsx(
              'px-2.5 py-1.5 transition-colors',
              viewMode === 'table' ? 'bg-navy dark:bg-ice text-card dark:text-navy' : 'hover:bg-ice-soft text-grey'
            )}
            title="Table view"
          >
            <Table2 size={15} />
          </button>
          <button
            onClick={() => setViewMode('card')}
            className={clsx(
              'px-2.5 py-1.5 transition-colors',
              viewMode === 'card' ? 'bg-navy dark:bg-ice text-card dark:text-navy' : 'hover:bg-ice-soft text-grey'
            )}
            title="Card view"
          >
            <LayoutGrid size={15} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={threatFilter}
          onChange={e => handleFilterChange(setThreatFilter, e.target.value, 'Threat Level')}
          className="h-7 rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 text-[10px] font-semibold focus:outline-none text-navy dark:text-ice"
        >
          <option value="All">All Threat Levels</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
          <option value="None">None</option>
        </select>

        <select
          value={clarityFilter}
          onChange={e => handleFilterChange(setClarityFilter, e.target.value, 'CLARITY')}
          className="h-7 rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 text-[10px] font-semibold focus:outline-none text-navy dark:text-ice"
        >
          <option value="All">All CLARITY Positions</option>
          <option value="strong_beneficiary">Strong Beneficiary</option>
          <option value="moderate">Moderate</option>
          <option value="minimal">Minimal</option>
          <option value="irrelevant">Irrelevant</option>
          <option value="blocked">Blocked</option>
        </select>

        <select
          value={statusFilter}
          onChange={e => handleFilterChange(setStatusFilter, e.target.value, 'Status')}
          className="h-7 rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 text-[10px] font-semibold focus:outline-none text-navy dark:text-ice"
        >
          <option value="All">All Statuses</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
          <option value="blocked">Blocked</option>
          <option value="defunct">Defunct</option>
        </select>

        <span className="text-[9px] text-grey ml-1 font-mono">
          {sorted.length} of {allCompetitors.length}
        </span>
      </div>

      {viewMode === 'table' ? (
        <div className="overflow-x-auto border border-line rounded-lg bg-card shadow-sm">
          <table className="w-full border-collapse text-left text-[11px]">
            <thead>
              <tr className="bg-ice-soft/40 dark:bg-navy-deep/20 border-b border-line">
                {COLUMNS.filter(c => c.sortable).map(col => (
                  <th
                    key={col.key}
                    className={clsx(
                      'p-2.5 text-[9px] font-bold uppercase tracking-wider text-grey cursor-pointer hover:text-navy dark:hover:text-ice select-none whitespace-nowrap',
                      col.width,
                    )}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <span className="flex items-center gap-1">
                      {col.shortLabel}
                      {col.sortable && <SortIcon field={col.key} />}
                    </span>
                  </th>
                ))}
                <th className="p-2.5 text-[9px] font-bold uppercase tracking-wider text-grey min-w-[200px]">
                  Licenses &amp; Legal
                </th>
              </tr>
            </thead>
            <tbody>
              {tableRows}
              {renderLCXRow()}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {cardRows}
          </div>
          {sorted.length === 0 && (
            <p className="text-center text-xs text-grey py-8">No competitors match the active filters.</p>
          )}
          <Card className="border-cyan-500/40 bg-cyan-500/[0.03] dark:bg-cyan-500/[0.02]">
            <CardBody className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-cyan-600 dark:text-cyan-400">LCX USA</span>
                  <span className="text-[9px] font-mono text-cyan-500 bg-cyan-50 dark:bg-cyan-950/20 px-1.5 rounded tracking-tight">
                    PROJECTED (Phase 1–3)
                  </span>
                </div>
                <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-bold">New Entrant</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] mb-2">
                <div className="flex justify-between">
                  <span className="text-grey">MTL States (Ph 1-3):</span>
                  <span className="font-mono font-bold text-status-conditional">{lcxMTLCount}/50</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-grey">Avg Howey Score:</span>
                  <span className="font-mono font-bold text-status-conditional">{lcxAvgHowey}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-grey">Trust Charter:</span>
                  <span className="text-cyan-600 dark:text-cyan-400 font-mono">{lcxTrustCharter}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-grey">CLARITY Position:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-mono">Strong Beneficiary</span>
                </div>
              </div>
              <p className="text-[9px] text-grey leading-tight">
                LCX's non-custodial Phase 1 entry through MT/NH/CO/UT + Liechtenstein MiCA passport creates an asymmetric advantage no existing competitor holds.
              </p>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
