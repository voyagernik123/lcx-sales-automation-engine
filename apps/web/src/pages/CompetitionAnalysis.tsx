import { useCallback, useState, useMemo } from 'react';
import { StrategicMatrix, CompetitorGrid, CompetitorInspector, SynthesisPanel } from '@/components/competition';
import { useAuditStore, useFilterStore } from '@/stores';
import { competitors, states } from '@/data';
import { clsx } from 'clsx';
import { ToggleLeft, ToggleRight, Sparkles } from 'lucide-react';

export function CompetitionAnalysis() {
  const { addAuditLog } = useAuditStore();
  const { clarityEnacted, toggleFilterStoreField } = useFilterStore();
  const [selectedCompetitorId, setSelectedCompetitorId] = useState<string | null>(null);

  const handleToggleClarity = useCallback(() => {
    toggleFilterStoreField('clarityEnacted');
    addAuditLog('CCO toggled CLARITY Act simulation for competition analysis.', 'Scenario');
  }, [toggleFilterStoreField, addAuditLog]);

  const handleCompetitorClick = useCallback((competitorId: string) => {
    setSelectedCompetitorId(competitorId);
    addAuditLog(`CCO inspected competitor profile: [${competitorId}]`, 'Audit');
  }, [addAuditLog]);

  const handleCloseInspector = useCallback(() => {
    setSelectedCompetitorId(null);
  }, []);

  const deltaStats = useMemo(() => {
    const strongBeneficiaries = competitors.filter(
      c => c.clarityAct.position === 'strong_beneficiary'
    ).length;
    const totalNmlsStates = new Set<string>();
    competitors.forEach(c => {
      c.statePresence.forEach(abbr => {
        const st = states.find(s => s.abbreviation === abbr);
        if (st?.nmlsRequired) totalNmlsStates.add(abbr);
      });
    });
    const lcxPhase1 = states.filter(s => s.phase === 'Phase 1' && s.tier !== 'Unresearched');
    const lcxPhase2 = states.filter(s => s.phase === 'Phase 2' && s.tier !== 'Unresearched');
    const combinedPhases = new Set([...lcxPhase1, ...lcxPhase2]);

    return {
      beneficiaryCount: strongBeneficiaries,
      totalNmlsStates: totalNmlsStates.size,
      lcxPreClarityStates: lcxPhase1.length,
      lcxPostClarityStates: combinedPhases.size,
    };
  }, []);

  return (
    <>
      <div className="space-y-5 text-navy dark:text-ice h-[calc(100vh-6.5rem)] flex flex-col overflow-hidden min-h-0">
        <div className="shrink-0 space-y-3">
          <h1 className="text-2xl font-bold">Competition Analysis</h1>
          <p className="text-sm text-grey-dark dark:text-grey-light">
            Competitive intelligence on U.S. crypto exchange positioning, regulatory coverage, and strategic threat assessment.
          </p>

          <button
            onClick={handleToggleClarity}
            className={clsx(
              'flex items-center gap-2.5 w-full sm:w-auto h-10 rounded-lg border px-4 text-xs font-bold transition-all duration-300',
              clarityEnacted
                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-600 dark:border-cyan-400 dark:bg-cyan-400/10 dark:text-cyan-400 shadow-sm shadow-cyan-500/10'
                : 'border-line bg-card text-grey-dark hover:bg-ice-soft dark:hover:bg-ice-soft/10'
            )}
          >
            {clarityEnacted ? <ToggleRight size={18} className="text-cyan-500" /> : <ToggleLeft size={18} />}
            <span>
              {clarityEnacted
                ? 'H.R. 3633 CLARITY Act — ENACTED (federal MTL preemption active)'
                : 'H.R. 3633 CLARITY Act — Click to simulate enactment'}
            </span>
          </button>

          {clarityEnacted && (
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 dark:bg-cyan-500/3 px-4 py-3 shadow-sm shadow-cyan-500/5">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={14} className="text-cyan-500" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                  CLARITY Act Delta Summary
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-[10px] leading-snug">
                <div>
                  <span className="text-grey block text-[9px] uppercase font-bold">Exchanges Benefiting</span>
                  <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400 text-sm">
                    {deltaStats.beneficiaryCount}
                  </span>
                  <span className="text-grey"> / {competitors.length} competitors classified as Strong Beneficiaries</span>
                </div>
                <div>
                  <span className="text-grey block text-[9px] uppercase font-bold">NMLS States Preempted</span>
                  <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400 text-sm">
                    {deltaStats.totalNmlsStates}
                  </span>
                  <span className="text-grey"> states where MTL requirements would be federally preempted</span>
                </div>
                <div>
                  <span className="text-grey block text-[9px] uppercase font-bold">LCX Phase 1 (Pre-CLARITY)</span>
                  <span className="font-mono font-bold text-status-conditional text-sm">
                    {deltaStats.lcxPreClarityStates} states
                  </span>
                  <span className="text-grey"> MT/NH/CO/UT non-custodial anchors</span>
                </div>
                <div>
                  <span className="text-grey block text-[9px] uppercase font-bold">LCX Phase 1 (Post-CLARITY)</span>
                  <span className="font-mono font-bold text-status-ready text-sm">
                    {deltaStats.lcxPostClarityStates} states
                  </span>
                  <span className="text-grey"> Phase 1+2 combined via federal preemption</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto pr-1 space-y-5">
          <StrategicMatrix onCompetitorClick={handleCompetitorClick} />
          <CompetitorGrid onCompetitorClick={handleCompetitorClick} />
          <SynthesisPanel />
        </div>
      </div>

      <CompetitorInspector
        competitorId={selectedCompetitorId}
        isOpen={!!selectedCompetitorId}
        onClose={handleCloseInspector}
      />
    </>
  );
}

export default CompetitionAnalysis;
