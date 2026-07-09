import { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuditStore } from '@/stores/useAuditStore';
import { Scale, RotateCcw } from 'lucide-react';
import { clsx } from 'clsx';
import { products } from '@/data';


interface HoweyFactor {
  id: string;
  label: string;
  weight: number;
}

const PRONG_FACTORS: Record<string, { title: string; prongKey: keyof NonNullable<typeof products[number]['howeyAnalysis']>; factors: HoweyFactor[] }> = {
  prong1: {
    title: '1. Investment of Money',
    prongKey: 'investmentOfMoney',
    factors: [
      { id: 'fiat-purchase', label: 'Purchased directly with fiat currency or standard tokens (+20)', weight: 20 },
      { id: 'airdrop', label: 'Distributed entirely via free marketing airdrops (-15)', weight: -15 },
      { id: 'staking-lock', label: 'Requires token lockups / staking capital commitments (+15)', weight: 15 },
    ],
  },
  prong2: {
    title: '2. Common Enterprise',
    prongKey: 'commonEnterprise',
    factors: [
      { id: 'pooled-treasury', label: 'Funds pooled in a centralized corporate treasury (+20)', weight: 20 },
      { id: 'dao-nodes', label: 'Decentralized nodes receive independent fees (-15)', weight: -15 },
      { id: 'promoter-correlate', label: 'Token value directly matches promoter revenues (+15)', weight: 15 },
    ],
  },
  prong3: {
    title: '3. Expectation of Profits',
    prongKey: 'profitExpectation',
    factors: [
      { id: 'passive-returns', label: 'Official materials promote passive investment yields (+25)', weight: 25 },
      { id: 'gas-utility', label: 'Exclusively serves as L1 gas utility with zero yields (-15)', weight: -15 },
      { id: 'buyback-burn', label: 'Includes deflationary buyback/burn schedules (+20)', weight: 20 },
    ],
  },
  prong4: {
    title: '4. Efforts of Others',
    prongKey: 'effortsOfOthers',
    factors: [
      { id: 'central-issuer', label: 'Managed by a centralized founding team (+25)', weight: 25 },
      { id: 'active-dao', label: 'Fully governed via active, decentralized votes (-20)', weight: -20 },
      { id: 'roadmap-control', label: 'Founding entity holds unilateral veto power (+15)', weight: 15 },
    ],
  },
};

export function HoweyCalculator() {
  const { addAuditLog, safeHarborToggles } = useAuditStore();
  const commodityExempt = safeHarborToggles?.commodityExempt ?? false;
  const [tokenSymbol, setTokenSymbol] = useState<string>('LCX');

  const [checkedFactors, setCheckedFactors] = useState<Record<string, boolean>>({});
  const [selectedProductId, setSelectedProductId] = useState<string>('');

  const selectedProduct = useMemo(() => {
    return products.find(p => p.id === selectedProductId) ?? null;
  }, [selectedProductId]);

  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const assetId = params.get('asset');
    if (assetId) {
      const match = products.find(p => p.id === assetId);
      if (match) {
        setSelectedProductId(assetId);
        setTokenSymbol(match.id);
      }
    }
  }, [location.search]);


  const handleCheckboxChange = (factorId: string) => {
    setCheckedFactors(prev => {
      const next = { ...prev, [factorId]: !prev[factorId] };
      const action = next[factorId] ? 'checked' : 'unchecked';
      addAuditLog(`Howey Analysis: ${tokenSymbol} factor [${factorId}] was ${action}.`, 'Scenario');
      return next;
    });
  };

  const handleResetAll = () => {
    setCheckedFactors({});
    addAuditLog(`Howey Analysis: All factors reset for ${tokenSymbol}.`, 'Scenario');
  };

  // Calculate overall Howey Score
  const scoreResult = useMemo(() => {
    let totalScore = 30; // base score constant

    Object.keys(PRONG_FACTORS).forEach(prongKey => {
      PRONG_FACTORS[prongKey].factors.forEach(f => {
        if (checkedFactors[f.id]) {
          totalScore += f.weight;
        }
      });
    });

    if (commodityExempt) {
      totalScore = Math.round(totalScore * 0.75); // reduce by 25%
    }

    // clamp between 0 and 100
    return Math.max(0, Math.min(100, totalScore));
  }, [checkedFactors, tokenSymbol, commodityExempt]);


  // SEC Enforcement Probability Mapping
  const secRisk = useMemo(() => {
    if (scoreResult >= 75) {
      return {
        level: 'Critical Risk',
        color: 'text-status-blocked border-status-blocked/30 bg-status-blocked/5',
        desc: 'Unmistakable investment contract characteristics. Extreme probability of SEC investigation or enforcement action.',
      };
    }
    if (scoreResult >= 45) {
      return {
        level: 'Medium Risk',
        color: 'text-status-conditional border-status-conditional/30 bg-status-conditional/5',
        desc: 'Hybrid characteristics. Token has utility but features expectations of profit. Counsel opinion required.',
      };
    }
    return {
      level: 'Low Risk',
      color: 'text-status-ready border-status-ready/30 bg-status-ready/5',
      desc: 'Likely classified as a utility token or digital commodity. Low probability of SEC securities enforcement.',
    };
  }, [scoreResult]);

  return (
    <div className="space-y-4 text-navy dark:text-ice h-[calc(100vh-6.5rem)] flex flex-col overflow-hidden min-h-0">
      {/* Header */}
      <div className="shrink-0 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Scale size={24} className="text-navy dark:text-ice" /> Securities Forensic Analyzer</h1>
          <p className="text-sm text-grey-dark dark:text-grey-light mt-0.5">
            Model token securities classifications under the U.S. Supreme Court Howey Test factors.
          </p>
        </div>
        
        {/* Token Symbol Input + Reset */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleResetAll}
            className="flex items-center gap-1.5 border border-line bg-card rounded px-3 py-1.5 text-[10px] font-bold text-grey uppercase tracking-wider hover:bg-ice-soft/20 dark:hover:bg-navy-deep/50 transition-colors"
          >
            <RotateCcw size={11} />
            Reset All Factors
          </button>
          <div className="flex items-center gap-2 border border-line bg-card rounded px-3 py-1 shrink-0">
            <span className="text-[10px] font-bold text-grey uppercase tracking-wider">Asset:</span>
            <input
              type="text"
              value={tokenSymbol}
              onChange={e => setTokenSymbol(e.target.value.toUpperCase())}
              className="w-16 h-7 rounded border border-line bg-ice-soft dark:bg-navy-deep text-center text-xs font-bold font-mono focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Product Selector */}
      <div className="shrink-0 flex items-center gap-3 bg-card border border-line rounded-lg px-4 py-2.5">
        <span className="text-[10px] font-bold text-grey uppercase tracking-wider whitespace-nowrap">Reference Product:</span>
        <select
          value={selectedProductId}
          onChange={e => setSelectedProductId(e.target.value)}
          className="flex-1 h-8 rounded border border-line bg-ice-soft dark:bg-navy-deep text-xs font-semibold font-mono focus:outline-none px-2 text-navy dark:text-ice"
        >
          <option value="">— Select a product to view Howey analysis —</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>
              {p.name} {p.howeyScore !== undefined ? `(Howey: ${p.howeyScore}%)` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Main split work grid */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0 overflow-hidden">
        
        {/* Left Side: Checkbox Grids */}
        <div className="flex-1 bg-card border border-line rounded-lg p-4 overflow-y-auto space-y-4 shadow-sm">
          {Object.keys(PRONG_FACTORS).map(prongKey => {
            const prong = PRONG_FACTORS[prongKey];
            const productAnalysis = selectedProduct?.howeyAnalysis?.[prong.prongKey];
            return (
              <div key={prongKey} className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-grey border-b border-line pb-1">
                  {prong.title}
                </h3>
                <div className="space-y-2 pl-1">
                  {prong.factors.map(f => {
                    const isChecked = !!checkedFactors[f.id];
                    return (
                      <button
                        key={f.id}
                        onClick={() => handleCheckboxChange(f.id)}
                        className={clsx(
                          'flex items-center gap-3 w-full text-left p-2.5 rounded border transition-colors text-xs font-semibold',
                          isChecked
                            ? 'border-navy bg-ice-soft/30 dark:border-ice dark:bg-ice-soft/5 text-navy dark:text-ice'
                            : 'border-line hover:bg-ice-soft/10 text-grey-dark'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          readOnly
                          className="rounded border-grey/40 text-navy focus:ring-0 cursor-pointer h-4 w-4"
                        />
                        <span>{f.label}</span>
                      </button>
                    );
                  })}
                </div>
                {/* Show product's real Howey analysis for this prong */}
                {productAnalysis && (
                  <div className="ml-1 mt-1 px-3 py-2 rounded border border-cyan-500/20 bg-cyan-500/5 text-[11px] leading-relaxed text-grey-dark dark:text-grey-light">
                    <span className="font-bold text-[9px] uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                      {selectedProduct?.name} — Analysis:
                    </span>
                    <p className="mt-0.5">{productAnalysis}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right Side: Radial Risk speed gauge */}
        <div className="w-full md:w-80 bg-card border border-line rounded-lg p-5 flex flex-col items-center justify-center space-y-6 shrink-0 shadow-sm">
          
          <span className="font-bold text-[10px] uppercase tracking-wider text-grey text-center block">
            SEC Enforcement Probability Dial
          </span>

          {/* Radial SVG Needle Gauge */}
          <div className="relative flex flex-col items-center justify-center w-full mt-2 select-none">
            <div className="h-32 w-52 relative">
              <svg className="w-full h-full" viewBox="0 0 100 60">
                <defs>
                  <linearGradient id="gauge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#0d9488" />
                    <stop offset="50%" stopColor="#d97706" />
                    <stop offset="100%" stopColor="#e11d48" />
                  </linearGradient>
                </defs>
                {/* Track */}
                <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="var(--line)" strokeWidth="6" strokeLinecap="round" />
                {/* Fills dynamically */}
                <path
                  d="M 10 50 A 40 40 0 0 1 90 50"
                  fill="none"
                  stroke="url(#gauge-gradient)"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray="125.6"
                  strokeDashoffset={125.6 * (1 - scoreResult / 100)}
                  className="transition-all duration-700 ease-out"
                />
                {/* Needle */}
                <g transform={`rotate(${(scoreResult / 100) * 180 - 180}, 50, 50)`} className="transition-transform duration-700 ease-out origin-[50px_50px]">
                  <line x1="50" y1="50" x2="15" y2="50" stroke="var(--navy)" strokeWidth="2" strokeLinecap="round" className="dark:stroke-ice" />
                  <circle cx="50" cy="50" r="3" fill="var(--navy)" className="dark:fill-ice" />
                </g>
              </svg>
              <div className="absolute bottom-2 left-0 right-0 flex flex-col items-center justify-center font-mono">
                <span className="text-3xl font-extrabold text-navy dark:text-ice leading-none">{scoreResult}%</span>
                <span className="text-[10px] text-grey uppercase tracking-wider font-bold mt-1">Howey Index</span>
              </div>
            </div>
          </div>


          {/* Enforcement risk statement */}
          <div className={clsx('rounded p-4 border text-center text-xs space-y-2 w-full', secRisk.color)}>
            <h4 className="font-bold uppercase tracking-wide">{secRisk.level}</h4>
            <p className="leading-relaxed text-[11px]">{secRisk.desc}</p>
          </div>

          {/* Product reference score */}
          {selectedProduct && selectedProduct.howeyScore !== undefined && (
            <div className="w-full rounded border border-cyan-500/20 bg-cyan-500/5 p-3 text-center space-y-1">
              <span className="text-[9px] font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400 block">
                {selectedProduct.name} Reference Score
              </span>
              <span className="text-lg font-extrabold font-mono text-navy dark:text-ice">{selectedProduct.howeyScore}%</span>
            </div>
          )}

          {/* Base score note */}
          <div className="pt-2 border-t border-line text-[9px] text-grey text-center leading-normal space-y-1">
            <p>Base assessment score: 30% (adjusted by selected factors)</p>
            <p>Calculated score integrates asset properties and management covenants against case-law precedents.</p>
          </div>
        </div>

      </div>
    </div>
  );
}
export default HoweyCalculator;
