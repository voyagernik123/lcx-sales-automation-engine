import { useMemo } from 'react';

const TYPE_COLORS: Record<string, string> = {
  state: '#6366f1',
  license: '#10b981',
  requirement: '#f59e0b',
  product: '#06b6d4',
  domain: '#8b5cf6',
  phase: '#94a3b8',
  competitor: '#ec4899',
};

const TYPE_LABELS: Record<string, string> = {
  state: 'St',
  license: 'Li',
  requirement: 'Rq',
  product: 'Pr',
  domain: 'Dm',
  phase: 'Ph',
  competitor: 'Cp',
};

interface OntologyMiniMapProps {
  rawNodes: any[];
  rfInstance: any;
}

export function OntologyMiniMap({ rawNodes, rfInstance }: OntologyMiniMapProps) {
  const clusters = useMemo(() => {
    if (!rawNodes || rawNodes.length === 0) return [];
    const groups: Record<string, { totalX: number; totalY: number; count: number }> = {};
    rawNodes.forEach(n => {
      const type = n?.type || (n?.data?.node?.type);
      if (!type) return;
      if (!groups[type]) groups[type] = { totalX: 0, totalY: 0, count: 0 };
      groups[type].totalX += n.position.x;
      groups[type].totalY += n.position.y;
      groups[type].count++;
    });
    return Object.entries(groups).map(([type, g]) => ({
      type,
      label: TYPE_LABELS[type] || type,
      color: TYPE_COLORS[type] || '#94a3b8',
      count: g.count,
      cx: g.totalX / g.count,
      cy: g.totalY / g.count,
    }));
  }, [rawNodes]);

  if (clusters.length === 0) return null;

  const minX = Math.min(...clusters.map(c => c.cx));
  const maxX = Math.max(...clusters.map(c => c.cx));
  const minY = Math.min(...clusters.map(c => c.cy));
  const maxY = Math.max(...clusters.map(c => c.cy));
  const padX = (maxX - minX) * 0.2 || 500;
  const padY = (maxY - minY) * 0.2 || 500;
  const vw = 180, vh = 110;
  const sx = (vw - 30) / (maxX - minX + padX * 2);
  const sy = (vh - 30) / (maxY - minY + padY * 2);
  const sc = Math.min(sx, sy, 0.05);
  const offX = 15 - (minX - padX) * sc;
  const offY = 15 - (minY - padY) * sc;

  const handleClusterClick = (type: string) => {
    if (!rfInstance) return;
    const groupNodes = rawNodes.filter((n: any) => (n?.type || n?.data?.node?.type) === type);
    if (groupNodes.length === 0) return;
    const cx = groupNodes.reduce((a: number, n: any) => a + n.position.x, 0) / groupNodes.length;
    const cy = groupNodes.reduce((a: number, n: any) => a + n.position.y, 0) / groupNodes.length;
    rfInstance.setCenter(cx, cy, { zoom: 0.8, duration: 600 });
  };

  return (
    <div className="absolute bottom-3 left-3 z-10 bg-card/90 backdrop-blur border border-line rounded-lg shadow-md p-1.5 select-none" style={{ width: vw, height: vh }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${vw} ${vh}`}>
        <rect x="0" y="0" width={vw} height={vh} fill="none" rx="6" />
        {clusters.map(c => {
          const rx = offX + c.cx * sc;
          const ry = offY + c.cy * sc;
          const r = Math.max(6, Math.min(12, Math.sqrt(c.count) * 3.5));
          return (
            <g key={c.type} className="cursor-pointer" onClick={() => handleClusterClick(c.type)}>
              <rect x={rx - r} y={ry - r} width={r * 2} height={r * 2} rx="3" fill={c.color} opacity="0.55" />
              <text x={rx} y={ry - r - 1.5} textAnchor="middle" fill={c.color} fontSize="7" fontWeight="800" fontFamily="Inter, sans-serif">{c.label}</text>
              <text x={rx} y={ry + r * 0.35} textAnchor="middle" fill="#fff" fontSize="7" fontWeight="700" fontFamily="JetBrains Mono, monospace">{c.count}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
