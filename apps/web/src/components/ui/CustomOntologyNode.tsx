import { Handle, Position } from 'reactflow';
import { State, License, Requirement, Product, RegulatoryNode } from '@/types/ontology';
import { Competitor } from '@/types/competitors';
import { Map, Shield, Key, Coins, Network, Clock, Swords } from 'lucide-react';
import { clsx } from 'clsx';
import { truncateDomain } from '@/lib/formatting';

const icons: Record<RegulatoryNode['type'], typeof Shield> = {
  state: Map,
  license: Key,
  requirement: Shield,
  product: Coins,
  domain: Network,
  phase: Clock,
  competitor: Swords,
};

interface CustomNodeData {
  node: RegulatoryNode;
  activeColor: string;
  isPreempted: boolean;
  isDimmed?: boolean;
  isHighlighted?: boolean;
  showDetails?: boolean;
  scale?: number;
}

function CardProperties({ node }: { node: RegulatoryNode }) {
  const isReq = node.type === 'requirement';
  const isState = node.type === 'state';
  const isProduct = node.type === 'product';
  const isLicense = node.type === 'license';
  const isCompetitor = node.type === 'competitor';

  if (isCompetitor) {
    const c = node.data as Competitor;
    return (
      <div className="mt-1.5 pt-1.5 border-t border-line/50 space-y-0.5 text-[9px] font-mono leading-tight">
        <div className="flex justify-between">
          <span className="text-grey uppercase">Status:</span>
          <span className="font-bold text-navy-deep dark:text-ice-soft">{c.status}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-grey uppercase">MTL States:</span>
          <span className="font-bold text-navy-deep dark:text-ice-soft">{c.statePresence.length}/50</span>
        </div>
        <div className="flex justify-between">
          <span className="text-grey uppercase">Share:</span>
          <span className="font-bold text-navy-deep dark:text-ice-soft">{c.marketShare > 0 ? `${c.marketShare}%` : '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-grey uppercase">Threat:</span>
          <span className={c.threatLevel === 'Critical' || c.threatLevel === 'High' ? 'text-status-blocked font-bold' : c.threatLevel === 'Medium' ? 'text-status-conditional font-bold' : 'text-status-ready font-bold'}>
            {c.threatLevel}
          </span>
        </div>
      </div>
    );
  }

  if (isState) {
    const s = node.data as State;
    return (
      <div className="mt-1.5 pt-1.5 border-t border-line/50 space-y-0.5 text-[9px] font-mono leading-tight">
        <div className="flex justify-between">
          <span className="text-grey uppercase">Net Worth:</span>
          <span className="font-bold text-navy-deep dark:text-ice-soft">{s.minNetWorth || 'None'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-grey uppercase">Surety Bond:</span>
          <span className="font-bold text-navy-deep dark:text-ice-soft">{s.suretyBond || 'None'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-grey uppercase">Sandbox:</span>
          <span className={s.sandboxAvailable ? 'text-status-ready font-extrabold' : 'text-grey'}>
            {s.sandboxAvailable ? 'Yes' : 'No'}
          </span>
        </div>
      </div>
    );
  }

  if (isProduct) {
    const p = node.data as Product;
    return (
      <div className="mt-1.5 pt-1.5 border-t border-line/50 space-y-0.5 text-[9px] font-mono leading-tight">
        {p.category && (
          <div className="flex justify-between">
            <span className="text-grey uppercase">Category:</span>
            <span className="font-bold text-navy-deep dark:text-ice-soft">{p.category}</span>
          </div>
        )}
        {p.howeyScore !== undefined && (
          <div className="flex justify-between">
            <span className="text-grey uppercase">Howey Risk:</span>
            <span className={p.howeyScore >= 70 ? 'text-status-blocked font-bold' : p.howeyScore >= 40 ? 'text-status-conditional font-bold' : 'text-status-ready font-bold'}>
              {p.howeyScore}%
            </span>
          </div>
        )}
        {p.requirements && (
          <div className="flex justify-between">
            <span className="text-grey uppercase">Gated Rules:</span>
            <span className="font-bold text-navy-deep dark:text-ice-soft">{p.requirements.length}</span>
          </div>
        )}
      </div>
    );
  }

  if (isReq) {
    const r = node.data as Requirement;
    const shortDomain = truncateDomain(r.domain, 18);
    return (
      <div className="mt-1.5 pt-1.5 border-t border-line/50 space-y-0.5 text-[9px] font-mono leading-tight">
        <div className="flex justify-between">
          <span className="text-grey uppercase">Domain:</span>
          <span className="font-bold text-navy-deep dark:text-ice-soft truncate max-w-[120px]" title={r.domain}>{shortDomain}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-grey uppercase">Trigger:</span>
          <span className="font-bold text-navy-deep dark:text-ice-soft truncate max-w-[120px]" title={r.trigger}>{r.trigger}</span>
        </div>
      </div>
    );
  }

  if (isLicense) {
    const l = node.data as License;
    return (
      <div className="mt-1.5 pt-1.5 border-t border-line/50 space-y-0.5 text-[9px] font-mono leading-tight">
        <div className="flex justify-between">
          <span className="text-grey uppercase">Authority:</span>
          <span className="font-bold text-navy-deep dark:text-ice-soft truncate max-w-[120px]">{l.issuingAuthority}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-grey uppercase">Rules Gated:</span>
          <span className="font-bold text-navy-deep dark:text-ice-soft">{l.requirements.length}</span>
        </div>
      </div>
    );
  }

  return null;
}

export function CustomOntologyNode({ data }: { data: CustomNodeData }) {
  const { node, activeColor, isPreempted, isDimmed, isHighlighted, showDetails } = data;
  const IconComponent = icons[node.type] || Shield;
  const detailVisible = showDetails !== false;

  return (
    <div
      className={clsx(
        'flex flex-col rounded border bg-card p-2.5 text-left shadow-sm select-none font-sans transition-all duration-300 w-full',
        isPreempted
          ? 'border-dashed border-grey/40 opacity-55'
          : 'border-line border-l-4',
        isHighlighted && 'ring-2 ring-cyan-500/50 shadow-md shadow-cyan-500/10 border-cyan-500 scale-[1.02]',
        isDimmed && 'opacity-15 grayscale pointer-events-none'
      )}
      style={{
        width: '100%',
        borderLeftColor: isPreempted ? undefined : activeColor,
        animation: 'fadeIn 0.4s ease-out',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-grey-light !h-1.5 !w-1.5 !border-0 dark:!bg-grey-dark"
      />

      <div className="flex items-center gap-2">
        <div
          className={clsx('rounded p-1.5 shrink-0 transition-colors')}
          style={{
            backgroundColor: isPreempted ? undefined : `${activeColor}15`,
            color: isPreempted ? undefined : activeColor,
          }}
        >
          <IconComponent size={13} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold text-navy dark:text-ice truncate leading-tight font-mono">
            {isPreempted ? `[Preemption] ${node.label}` : node.label}
          </div>
          <div className="text-[9px] font-semibold text-grey uppercase tracking-wider mt-0.5 font-sans flex items-center gap-1">
            <span>{node.type}</span>
            <span>&middot;</span>
            <span>{node.phase}</span>
          </div>
        </div>

        {!isPreempted && (
          <div className="shrink-0 flex items-center justify-center">
            <span
              className={clsx(
                'h-1.5 w-1.5 rounded-full block',
                node.status === 'Blocked' && 'animate-pulse-beacon'
              )}
              style={{
                backgroundColor: activeColor,
                boxShadow: `0 0 6px ${activeColor}`,
              }}
            />
          </div>
        )}
      </div>

      {!isPreempted && detailVisible && <CardProperties node={node} />}

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-grey-light !h-1.5 !w-1.5 !border-0 dark:!bg-grey-dark"
      />
    </div>
  );
}
export default CustomOntologyNode;
