import { useMemo } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Card, Badge } from '@/components/ui';
import { useAuditStore } from '@/stores/useAuditStore';
import { useFilterStore } from '@/stores/useFilterStore';
import { toast } from '@/components/shared';
import { clsx } from 'clsx';
import { states, products } from '@/data';
import { parseMonetaryValue, formatUSD } from '@/lib/formatting';
import { shouldExemptStateCost } from '@/lib/compliance';

interface OptionMetrics {
  id: string;
  title: string;
  desc: string;
  fees: string;
  bonds: string;
  netWorth: string;
  nmlsCount: number;
  sandboxes: number;
  howeyAvg: string;
  unlockedStates: string[];
  blockersCount: number;
}

function useSimulatorOptions(): OptionMetrics[] {
  const { clarityEnacted, spdiEquivalence } = useFilterStore();

  return useMemo(() => {
    const flags = { clarityEnacted, spdiEquivalence };

    const optAProduct = products.find(p => p.id === 'NONCUSTODIAL_WALLET');
    const optAStates = states.filter(
      s => s.sandboxAvailable === true || s.phase === 'Phase 1'
    );
    const optANmls = optAStates.filter(s => {
      if (clarityEnacted && s.nmlsRequired) return false;
      return s.nmlsRequired;
    }).length;

    const optACost = optAStates.reduce((sum, s) => {
      if (shouldExemptStateCost(s, flags)) return sum;
      return sum + parseMonetaryValue(s.estCost);
    }, 0);

    const optABonds = optAStates.reduce((sum, s) => {
      if (shouldExemptStateCost(s, flags)) return sum;
      return sum + parseMonetaryValue(s.suretyBond);
    }, 0);

    const optASandboxes = optAStates.filter(s => s.sandboxAvailable).length;
    const optAHowey = optAProduct?.howeyScore ?? 15;

    const optBProduct = products.find(p => p.id === 'CUSTODY');
    const optBStates = states.filter(
      s => (s.phase === 'Phase 1' || s.phase === 'Phase 2') && s.suretyBond !== undefined
    );
    const optBNmls = optBStates.filter(s => {
      if (clarityEnacted && s.nmlsRequired) return false;
      return s.nmlsRequired;
    }).length;

    const optBCost = optBStates.reduce((sum, s) => {
      if (shouldExemptStateCost(s, flags)) return sum;
      return sum + parseMonetaryValue(s.estCost);
    }, 0);

    const optBBonds = optBStates.reduce((sum, s) => {
      if (shouldExemptStateCost(s, flags)) return sum;
      return sum + parseMonetaryValue(s.suretyBond);
    }, 0);

    const optBSandboxes = optBStates.filter(s => s.sandboxAvailable).length;

    const optBMaxNetWorth = Math.max(
      ...optBStates
        .map(s => (shouldExemptStateCost(s, flags) ? 0 : parseMonetaryValue(s.minNetWorth)))
        .filter(v => v > 0),
      0
    );
    const optBHowey = optBProduct?.howeyScore ?? 25;

    const optCProduct = products.find(p => p.id === 'EXCHANGE');
    const optCStates = states.filter(s => s.tier !== 'Unresearched');
    const optCNmls = optCStates.filter(s => {
      if (clarityEnacted && s.nmlsRequired) return false;
      return s.nmlsRequired;
    }).length;

    const optCCost = optCStates.reduce((sum, s) => {
      if (shouldExemptStateCost(s, flags)) return sum;
      return sum + parseMonetaryValue(s.estCost);
    }, 0);

    const optCBonds = optCStates.reduce((sum, s) => {
      if (shouldExemptStateCost(s, flags)) return sum;
      return sum + parseMonetaryValue(s.suretyBond);
    }, 0);

    const optCSandboxes = optCStates.filter(s => s.sandboxAvailable).length;
    const optCMaxNetWorth = Math.max(
      ...optCStates
        .map(s => (shouldExemptStateCost(s, flags) ? 0 : parseMonetaryValue(s.minNetWorth)))
        .filter(v => v > 0),
      0
    );
    const optCHowey = optCProduct?.howeyScore ?? 45;

    const optCBlockers = optCStates.filter(s => {
      if (shouldExemptStateCost(s, flags)) return false;
      return s.status === 'Blocked';
    }).length;

    return [
      {
        id: 'non-custodial',
        title: 'Option A: Non-Custodial Wallet',
        desc: 'Crypto-to-crypto non-custodial custody model. Minimizes licensing triggers by routing custody to user-held private keys.',
        fees: optACost > 0 ? formatUSD(optACost) : '$25,000',
        bonds: optABonds > 0 ? formatUSD(optABonds) : '$0',
        netWorth: '$0 (No corporate MTL requirements)',
        nmlsCount: optANmls,
        sandboxes: optASandboxes,
        howeyAvg: `${optAHowey}% (${optAHowey >= 75 ? 'Critical' : optAHowey >= 45 ? 'High' : optAHowey >= 25 ? 'Medium' : 'Low'} legal risk)`,
        unlockedStates: optAStates.length > 0 ? optAStates.map(s => s.abbreviation) : ['MT'],
        blockersCount: optAStates.filter(s => {
          if (shouldExemptStateCost(s, flags)) return false;
          return s.status === 'Blocked';
        }).length,
      },
      {
        id: 'spdi-custody',
        title: 'Option B: SPDI Wyoming Custody',
        desc: 'Establish Wyoming Special Purpose Depository Institution (SPDI) trust custody routing to avoid full multi-state MTL triggers.',
        fees: optBCost > 0 ? formatUSD(optBCost) : '$120,000',
        bonds: optBBonds > 0 ? formatUSD(optBBonds) : '$500,000',
        netWorth: optBMaxNetWorth > 0 ? `${formatUSD(optBMaxNetWorth)} (Wyoming statutory minimum)` : '$0 (Exempted under Trust Reciprocity)',
        nmlsCount: optBNmls,
        sandboxes: optBSandboxes,
        howeyAvg: `${optBHowey}% (${optBHowey >= 75 ? 'Critical' : optBHowey >= 45 ? 'High' : optBHowey >= 25 ? 'Medium' : 'Low'} legal risk)`,
        unlockedStates: optBStates.length > 0 ? optBStates.map(s => s.abbreviation) : ['WY', 'MT', 'CO', 'UT'],
        blockersCount: optBStates.filter(s => {
          if (shouldExemptStateCost(s, flags)) return false;
          return s.status === 'Blocked';
        }).length,
      },
      {
        id: 'custodial-exchange',
        title: 'Option C: Custodial Exchange',
        desc: 'Full custodial fiat-to-crypto retail exchange platform. Triggers absolute state Money Transmitter Licenses (MTLs) and NY BitLicense.',
        fees: optCCost > 0 ? formatUSD(optCCost) : '$840,000',
        bonds: optCBonds > 0 ? formatUSD(optCBonds) : '$4,250,000',
        netWorth: optCMaxNetWorth > 0 ? `${formatUSD(optCMaxNetWorth)} (Aggregate multi-state ceiling)` : '$0 (Exempted under preemption)',
        nmlsCount: optCNmls,
        sandboxes: optCSandboxes,
        howeyAvg: `${optCHowey}% (${optCHowey >= 75 ? 'Critical' : optCHowey >= 45 ? 'High' : optCHowey >= 25 ? 'Medium' : 'Low'} legal risk)`,
        unlockedStates: optCStates.length > 0 ? ['All ' + optCStates.length + ' researched states'] : ['All 50 states (excluding restricted territories)'],
        blockersCount: optCBlockers,
      },
    ];
  }, [clarityEnacted, spdiEquivalence]);
}

export function Simulator() {
  const { committedArchitecture, commitArchitecture } = useAuditStore();
  const simulatorOptions = useSimulatorOptions();

  const handleSelectArchitecture = (id: string) => {
    if (committedArchitecture === id) {
      commitArchitecture(null);
      toast('info', 'Architecture commitment revoked.');
    } else {
      commitArchitecture(id);
      toast('success', `Architecture committed: [${id}]. Regulatory framework is now locked.`);
    }
  };

  return (
    <div className="space-y-4 text-navy dark:text-ice h-[calc(100vh-6.5rem)] flex flex-col overflow-hidden min-h-0">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold flex items-center gap-2">U.S. Rollout Architecture Modeler</h1>
        <p className="text-sm text-grey-dark dark:text-grey-light mt-0.5">
          Simulate and commit the core custody architecture. Committing locks the regulatory mapping framework and syncs the Audit Trail.
        </p>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 min-h-0 overflow-y-auto pr-1 py-1">
        {simulatorOptions.map(opt => {
          const isCommitted = committedArchitecture === opt.id;
          return (
            <Card
              key={opt.id}
              className={clsx(
                'flex flex-col border-2 transition-all duration-300 relative group h-full justify-between',
                isCommitted
                  ? 'border-cyan-500 bg-cyan-500/5 dark:bg-cyan-500/2 scale-[1.01] shadow-md shadow-cyan-500/10'
                  : 'border-line hover:border-grey'
              )}
            >
              <div className="p-4 border-b border-line">
                <div className="flex justify-between items-start gap-2">
                  <h3 className="font-bold text-sm tracking-tight text-navy dark:text-ice">{opt.title}</h3>
                  {isCommitted && (
                    <Badge status="ready" className="flex items-center gap-1 shrink-0">
                      <CheckCircle2 size={10} /> Committed
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-grey-dark dark:text-grey-light mt-1.5 leading-relaxed">{opt.desc}</p>
              </div>

              <div className="p-4 flex-1 space-y-3.5">
                <span className="font-bold text-[9px] uppercase tracking-wider text-grey block">Operational &amp; Capital Projections</span>

                <div className="space-y-2 font-mono text-[10px]">
                  <div className="flex justify-between pb-1.5 border-b border-line/40">
                    <span className="text-grey uppercase">Licensing Fees:</span>
                    <span className="font-bold text-navy-deep dark:text-ice-soft">{opt.fees}</span>
                  </div>
                  <div className="flex justify-between pb-1.5 border-b border-line/40">
                    <span className="text-grey uppercase">Surety Bond Collateral:</span>
                    <span className="font-bold text-navy-deep dark:text-ice-soft">{opt.bonds}</span>
                  </div>
                  <div className="flex justify-between pb-1.5 border-b border-line/40">
                    <span className="text-grey uppercase">Statutory Net Worth:</span>
                    <span className="font-bold text-navy-deep dark:text-ice-soft text-right max-w-[140px] truncate" title={opt.netWorth}>
                      {opt.netWorth.split(' (')[0]}
                    </span>
                  </div>
                  <div className="flex justify-between pb-1.5 border-b border-line/40">
                    <span className="text-grey uppercase">MTL Jurisdictions:</span>
                    <span className="font-bold text-navy-deep dark:text-ice-soft">{opt.nmlsCount} states</span>
                  </div>
                  <div className="flex justify-between pb-1.5 border-b border-line/40">
                    <span className="text-grey uppercase">Sandbox Program Gates:</span>
                    <span className="font-bold text-navy-deep dark:text-ice-soft">{opt.sandboxes} available</span>
                  </div>
                  <div className="flex justify-between pb-1.5 border-b border-line/40">
                    <span className="text-grey uppercase">Avg. Howey Risk:</span>
                    <span className="font-bold text-navy-deep dark:text-ice-soft">{opt.howeyAvg}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="font-bold text-[9px] uppercase tracking-wider text-grey block">Exemption-Friendly States Unlocked</span>
                  <div className="flex flex-wrap gap-1">
                    {opt.unlockedStates.map((st, i) => (
                      <span key={`${st}-${i}`} className="px-1.5 py-0.5 rounded bg-ice-soft dark:bg-navy-deep border border-line text-[9px] font-semibold text-grey-dark">
                        {st}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-line shrink-0">
                <button
                  onClick={() => handleSelectArchitecture(opt.id)}
                  className={clsx(
                    'w-full h-9 rounded text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5',
                    isCommitted
                      ? 'bg-status-blocked hover:bg-status-blocked/90 text-white'
                      : 'bg-navy dark:bg-ice text-white dark:text-navy hover:opacity-95'
                  )}
                >
                  {isCommitted ? (
                    <span>Revoke Commitment Covenants</span>
                  ) : (
                    <>
                      <span>Commit Rollout Architecture</span>
                      <ArrowRight size={13} />
                    </>
                  )}
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
export default Simulator;
