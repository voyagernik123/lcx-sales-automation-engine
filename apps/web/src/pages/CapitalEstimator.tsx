import { useState, useMemo } from 'react';
import { Card, CardHeader, CardBody } from '@/components/ui';
import { useAuditStore, useFilterStore } from '@/stores';
import { StateCohortGrid } from '@/components/shared';
import { parseMonetaryValue } from '@/lib/formatting';
import { shouldExemptStateCost } from '@/lib/compliance';
import { CAPITAL } from '@/lib/constants';
import { states } from '@/data';
import { Landmark } from 'lucide-react';

export function CapitalEstimator() {
  const { addAuditLog } = useAuditStore();
  const { clarityEnacted, spdiEquivalence } = useFilterStore();
  const [selectedStates, setSelectedStates] = useState<string[]>(['MT', 'WY', 'TX', 'CA']);
  const [leverageRatio, setLeverageRatio] = useState<number>(CAPITAL.DEFAULT_LEVERAGE_RATIO);
  const [monthlyBurn, setMonthlyBurn] = useState<number>(CAPITAL.DEFAULT_MONTHLY_BURN);

  const flags = { clarityEnacted, spdiEquivalence };

  const handleToggle = (abbr: string) => {
    setSelectedStates(prev => {
      const next = prev.includes(abbr) ? prev.filter(x => x !== abbr) : [...prev, abbr];
      return next;
    });
    addAuditLog('Capital Estimator: CCO updated state cohort selection.', 'System');
  };

  const activeStates = useMemo(() => {
    return states.filter(s => selectedStates.includes(s.abbreviation));
  }, [selectedStates]);

  const calculations = useMemo(() => {
    const fees = activeStates.reduce((acc, s) => {
      if (shouldExemptStateCost(s, flags)) return acc;
      const parsed = parseMonetaryValue(s.estCost);
      return acc + (parsed || CAPITAL.DEFAULT_LICENSING_FEE);
    }, 0);

    const totalBonds = activeStates.reduce((acc, s) => {
      if (shouldExemptStateCost(s, flags)) return acc;
      return acc + parseMonetaryValue(s.suretyBond);
    }, 0);

    const cashCollateral = Math.round(totalBonds * (leverageRatio / 100));

    const minNetWorth = activeStates.reduce((acc, s) => {
      if (shouldExemptStateCost(s, flags)) return acc;
      const val = parseMonetaryValue(s.minNetWorth);
      return val > acc ? val : acc;
    }, 0);

    const totalReserve = fees + cashCollateral + minNetWorth;

    return { fees, totalBonds, cashCollateral, minNetWorth, totalReserve };
  }, [activeStates, leverageRatio, clarityEnacted, spdiEquivalence]);

  const monthlyProjection = useMemo(() => {
    const monthlyData = [];
    let cumulativeOutflow = calculations.totalReserve;
    for (let m = 1; m <= 12; m++) {
      cumulativeOutflow += monthlyBurn;
      monthlyData.push({ month: `M${m}`, value: cumulativeOutflow });
    }
    return monthlyData;
  }, [calculations, monthlyBurn]);

  return (
    <div className="space-y-4 text-navy dark:text-ice h-[calc(100vh-6.5rem)] flex flex-col overflow-hidden min-h-0">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Landmark size={24} className="text-navy dark:text-ice" /> Launch Budget &amp; Capital Calculator</h1>
        <p className="text-sm text-grey-dark dark:text-grey-light mt-0.5">
          Model fintech balance sheet reserves, surety bond banking collateral leverage, and 12-month runways.
        </p>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-hidden">

        <div className="w-full lg:w-80 bg-card border border-line rounded-lg p-4 overflow-y-auto space-y-4 shrink-0 shadow-sm">
          <span className="font-bold text-[10px] uppercase tracking-wider text-grey block">
            Budget Control Panel
          </span>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-bold uppercase text-grey-dark">
              <span>Bond Bank Collateral</span>
              <span className="font-mono text-cyan-500">{leverageRatio}%</span>
            </div>
            <input
              type="range"
              min={CAPITAL.MIN_LEVERAGE}
              max={CAPITAL.MAX_LEVERAGE}
              step={5}
              value={leverageRatio}
              onChange={e => setLeverageRatio(parseInt(e.target.value))}
              className="w-full accent-cyan-500 cursor-pointer h-2 bg-line rounded-lg outline-none"
            />
            <p className="text-[9px] text-grey leading-tight">
               fintechs secure bonds by posting 10-20% cash collateral with sponsor banks rather than 100%.
            </p>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-line">
            <div className="flex justify-between text-[10px] font-bold uppercase text-grey-dark">
              <span>Monthly Launch Runrate</span>
              <span className="font-mono text-cyan-500">${(monthlyBurn / 1000).toFixed(0)}K</span>
            </div>
            <input
              type="range"
              min={CAPITAL.MIN_BURN}
              max={CAPITAL.MAX_BURN}
              step={CAPITAL.BURN_STEP}
              value={monthlyBurn}
              onChange={e => setMonthlyBurn(parseInt(e.target.value))}
              className="w-full accent-cyan-500 cursor-pointer h-2 bg-line rounded-lg outline-none"
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-line">
            <span className="font-bold text-[10px] uppercase tracking-wider text-grey block">Launch State Cohort</span>
            <StateCohortGrid selected={selectedStates} onToggle={handleToggle} auditLabel="Capital Estimator" />
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-y-auto pr-1">

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 shrink-0 text-xs">
            <Card>
              <CardBody className="p-3">
                <span className="text-[9px] uppercase tracking-wider text-grey block">Licensing Fees</span>
                <span className="text-lg font-bold font-mono text-navy dark:text-ice block mt-1">${calculations.fees.toLocaleString()}</span>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-3">
                <span className="text-[9px] uppercase tracking-wider text-grey block">Active Surety Bonds</span>
                <span className="text-lg font-bold font-mono text-navy dark:text-ice block mt-1">${calculations.totalBonds.toLocaleString()}</span>
                <span className="text-[9px] text-grey block mt-0.5">Post-leveraged cash: ${(calculations.cashCollateral / 1000).toFixed(0)}K</span>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-3">
                <span className="text-[9px] uppercase tracking-wider text-grey block">Statutory Net Worth</span>
                <span className="text-lg font-bold font-mono text-navy dark:text-ice block mt-1">${calculations.minNetWorth.toLocaleString()}</span>
              </CardBody>
            </Card>
            <Card className="bg-cyan-500/5 dark:bg-cyan-500/2 border-cyan-500/30">
              <CardBody className="p-3">
                <span className="text-[9px] uppercase tracking-wider text-cyan-600 dark:text-cyan-400 block font-bold">Aggregate Reserves Required</span>
                <span className="text-lg font-bold font-mono text-cyan-500 block mt-1">${calculations.totalReserve.toLocaleString()}</span>
              </CardBody>
            </Card>
          </div>

          <Card className="shrink-0">
            <CardHeader className="text-xs uppercase tracking-wider font-extrabold text-grey border-b border-line px-4 py-2 bg-ice-soft/20">
              Capital Reserves Allocation Percentage
            </CardHeader>
            <CardBody className="p-4 space-y-4">
              {(() => {
                const total = calculations.totalReserve || 1;
                const feesPct = Math.round((calculations.fees / total) * 100);
                const cashPct = Math.round((calculations.cashCollateral / total) * 100);
                const nwPct = Math.round((calculations.minNetWorth / total) * 100);

                return (
                  <div className="space-y-3 text-[10px]">
                    <div className="h-6 bg-line rounded-lg overflow-hidden flex shadow-sm">
                      <div className="bg-blue-500 h-full transition-all duration-300" style={{ width: `${feesPct}%` }} title={`Fees: ${feesPct}%`} />
                      <div className="bg-amber-500 h-full transition-all duration-300" style={{ width: `${cashPct}%` }} title={`Bonds cash: ${cashPct}%`} />
                      <div className="bg-purple-500 h-full transition-all duration-300" style={{ width: `${nwPct}%` }} title={`Net worth: ${nwPct}%`} />
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center font-semibold pt-1">
                      <div className="flex items-center gap-1.5 justify-center">
                        <span className="h-2 w-2 rounded bg-blue-500 block shrink-0" />
                        <span>Licensing Fees ({feesPct}%)</span>
                      </div>
                      <div className="flex items-center gap-1.5 justify-center">
                        <span className="h-2 w-2 rounded bg-amber-500 block shrink-0" />
                        <span>Cash Collateral ({cashPct}%)</span>
                      </div>
                      <div className="flex items-center gap-1.5 justify-center">
                        <span className="h-2 w-2 rounded bg-purple-500 block shrink-0" />
                        <span>Statutory Net Worth ({nwPct}%)</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </CardBody>
          </Card>

          <Card className="flex-1 min-h-[220px]">
            <CardHeader className="text-xs uppercase tracking-wider font-extrabold text-grey border-b border-line px-4 py-2 bg-ice-soft/20">
              12-Month Cumulative Runway Outflow Chart ($USD)
            </CardHeader>
            <CardBody className="p-4 flex items-end justify-between gap-1.5 h-44 border-t border-line/45 font-mono text-[9px]">
              {monthlyProjection.map((data, idx) => {
                const maxVal = monthlyProjection[11].value || 1;
                const barHeight = Math.round((data.value / maxVal) * 100);

                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 group relative">
                    <span className="absolute -translate-y-12 bg-slate-900 text-slate-100 text-[8px] rounded px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-25 font-mono">
                      ${(data.value / 1000).toFixed(0)}K
                    </span>
                    <div className="w-full bg-slate-100 dark:bg-slate-900 rounded-t h-28 flex items-end overflow-hidden">
                      <div
                        className="bg-cyan-500/80 group-hover:bg-cyan-500 rounded-t w-full transition-all duration-500"
                        style={{ height: `${barHeight}%` }}
                      />
                    </div>
                    <span className="font-sans font-semibold text-grey">{data.month}</span>
                  </div>
                );
              })}
            </CardBody>
          </Card>

        </div>

      </div>
    </div>
  );
}
export default CapitalEstimator;
