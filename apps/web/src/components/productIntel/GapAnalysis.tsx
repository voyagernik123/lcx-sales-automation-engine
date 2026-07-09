import { useMemo } from 'react';
import { productCatalog, competitorProductMap } from '@/data';

const EXCHANGE_IDS = ['coinbase','kraken','gemini','binance_us','robinhood','crypto_com','okx','bitstamp','kucoin','bybit'];
const INSTITUTIONAL_IDS = ['anchorage','fireblocks','circle','ripple','figure','securitize','ondo','franklin_templeton','superstate','taurus','bitgo'];
const COMPACT_LABELS: Record<string, string> = {
  coinbase:'CB', kraken:'KR', gemini:'GM', binance_us:'BN', robinhood:'RH',
  crypto_com:'CDC', okx:'OKX', bitstamp:'BS', kucoin:'KC', bybit:'BB',
  anchorage:'AN', fireblocks:'FB', circle:'CIR', ripple:'RIP', figure:'FIG',
  securitize:'SEC', ondo:'OND', franklin_templeton:'FT', superstate:'SS', taurus:'TAU', bitgo:'BG',
};

export function GapAnalysis() {
  const products = useMemo(() => productCatalog.filter(p => p.priorityTier <= 2).slice(0, 18), []);

  const ranges = [
    { label: 'Exchanges', ids: EXCHANGE_IDS, color: '#6366f1' },
    { label: 'Institutional', ids: INSTITUTIONAL_IDS, color: '#10b981' },
  ];

  const cellW = 12, cellH = 12, gap = 2;
  const labelW = 140;
  const totalH = products.length * (cellH + gap) + 30;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-navy dark:text-ice">Gap Analysis</h2>
        <div className="flex items-center gap-3 text-[9px] text-grey">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500 shrink-0" /> Offered</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-400/40 shrink-0" /> Missing</span>
        </div>
      </div>

      <div className="overflow-x-auto border border-line rounded-lg bg-card shadow-sm">
        <svg viewBox={`0 0 ${labelW + ranges.reduce((a, r) => a + r.ids.length * (cellW + gap) + 30, 0)} ${totalH}`}
          className="w-full" style={{ minHeight: totalH * 1.5 }} preserveAspectRatio="xMidYMin meet">

          {/* Row labels */}
          {products.map((p, ri) => (
            <text key={p.id} x={labelW - 4} y={ri * (cellH + gap) + cellH - 1} textAnchor="end" fill="currentColor"
              fontSize="8" fontFamily="JetBrains Mono, monospace" className="fill-navy dark:fill-ice">
              {p.name.length > 18 ? p.name.slice(0, 17) + '…' : p.name}
            </text>
          ))}

          {/* Separators between ranges */}
          {ranges.map((range, ri) => {
            const groupX = labelW + ranges.slice(0, ri).reduce((a, r) => a + r.ids.length * (cellW + gap) + 30, 0);
            return (
              <g key={range.label}>
                {/* Group label */}
                <text x={groupX} y="12" fill={range.color} fontSize="7" fontWeight="700" fontFamily="Inter, sans-serif">{range.label}</text>
                {/* Column headers */}
                {range.ids.map((cid, ci) => (
                  <text key={cid} x={groupX + ci * (cellW + gap) + cellW / 2} y="22" textAnchor="middle" fill="#94a3b8"
                    fontSize="7" fontWeight="600" fontFamily="JetBrains Mono, monospace">
                    {COMPACT_LABELS[cid] || cid}
                  </text>
                ))}
                {/* Cells */}
                {products.map((p, ri) => {
                  return range.ids.map((cid, ci) => {
                    const offered = (competitorProductMap[cid] || []).includes(p.id);
                    return (
                      <rect key={`${p.id}-${cid}`}
                        x={groupX + ci * (cellW + gap)} y={26 + ri * (cellW + gap)}
                        width={cellW} height={cellH} rx="2"
                        fill={offered ? '#10b981' : 'rgba(239,68,68,0.35)'}
                        className="transition-opacity hover:opacity-80"
                      />
                    );
                  });
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
