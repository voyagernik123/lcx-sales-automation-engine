import { useState, useMemo } from 'react';
import { redFlags } from '@/data';
import { useAuditStore } from '@/stores/useAuditStore';
import { Card, CardBody, Badge, ReadinessMeter } from '@/components/ui';
import { AlertTriangle, ShieldCheck, CheckSquare, Square, RefreshCw, Scale } from 'lucide-react';
import { clsx } from 'clsx';

function getMatrixCellColor(prob: number, sev: number) {
  const sum = prob + sev;
  if (sum >= 8) return 'bg-red-500/20 hover:bg-red-500/30 text-red-500 border-red-500/30';
  if (sum >= 6) return 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-500 border-amber-500/30';
  return 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-500 border-emerald-500/30';
}

export function RedFlags() {
  const { resolvedRemediations, toggleRemediation, addAuditLog, evidenceNotes, updateEvidenceNote } = useAuditStore();

  const [selectedCell, setSelectedCell] = useState<{ prob: number; sev: number } | null>(null);

  const totalRemediations = redFlags.reduce((acc, rf) => acc + rf.remediations.length, 0);
  const completedRemediationsCount = redFlags.reduce((acc, rf) => {
    return acc + rf.remediations.filter(r => resolvedRemediations.includes(r.id)).length;
  }, 0);

  const mitigationPercent = totalRemediations > 0 ? Math.round((completedRemediationsCount / totalRemediations) * 100) : 0;

  const unresolvedCriticalCount = redFlags.filter(rf => {
    if (rf.risk !== 'Critical' && rf.risk !== 'High') return false;
    return rf.remediations.some(r => !resolvedRemediations.includes(r.id));
  }).length;

  const handleGridCellClick = (prob: number, sev: number) => {
    if (selectedCell?.prob === prob && selectedCell?.sev === sev) {
      setSelectedCell(null);
      addAuditLog('CCO cleared risk matrix cell filter.', 'System');
    } else {
      setSelectedCell({ prob, sev });
      addAuditLog(`CCO filtered risk matrix by Probability [${prob}] and Severity [${sev}].`, 'Scenario');
    }
  };

  const handleResolveRemediation = (remediationId: string) => {
    toggleRemediation(remediationId);
  };

  const handleSaveEvidence = (rfId: string) => {
    const text = evidenceNotes[rfId] || '';
    if (!text) return;
    addAuditLog(`CCO submitted remediation audit evidence for Red Flag [${rfId}]: "${text}"`, 'Audit');
  };

  const filteredFlags = useMemo(() => {
    if (!selectedCell) return redFlags;
    return redFlags.filter(rf => rf.prob === selectedCell.prob && rf.sev === selectedCell.sev);
  }, [selectedCell]);

  return (
    <div className="space-y-4 text-navy dark:text-ice h-[calc(100vh-6.5rem)] flex flex-col overflow-hidden min-h-0">
      <div className="shrink-0 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Scale size={24} className="text-navy dark:text-ice" /> Audit Risk Mitigation Center</h1>
          <p className="text-sm text-grey-dark dark:text-grey-light mt-0.5">
            Model, analyze, and resolve legal friction coordinates using the 2D Probability vs. Impact matrix.
          </p>
        </div>

        {selectedCell && (
          <button
            onClick={() => setSelectedCell(null)}
            className="flex items-center gap-1 h-8 rounded border border-line bg-card hover:bg-ice-soft dark:hover:bg-ice-soft/10 px-3 text-xs font-semibold text-grey-dark transition-colors shrink-0"
          >
            <RefreshCw size={11} />
            <span>Reset Matrix Filter</span>
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-hidden">

        <div className="w-full lg:w-80 bg-card border border-line rounded-lg p-4 flex flex-col space-y-4 shrink-0 shadow-sm">
          <span className="font-bold text-[10px] uppercase tracking-wider text-grey block text-center">
            2D Risk Coordinate Matrix (Probability vs Severity)
          </span>

          <div className="flex-1 flex flex-col justify-between h-[250px] relative select-none">
            <div className="flex-1 flex justify-between border-l border-b border-line pl-1 pb-1 relative">
              <div className="absolute -left-5 top-1/2 -translate-y-1/2 -rotate-90 text-[9px] font-bold text-grey uppercase font-mono whitespace-nowrap">
                Probability
              </div>
              <div className="flex-1 flex flex-col justify-between">
              {Array.from({ length: 5 }).map((_, rIdx) => {
                const prob = 5 - rIdx;
                return (
                  <div key={prob} className="flex-1 flex justify-between items-center w-full">
                    {Array.from({ length: 5 }).map((_, cIdx) => {
                      const sev = cIdx + 1;

                      const cellFlagsCount = redFlags.filter(f => f.prob === prob && f.sev === sev).length;
                      const cellColor = getMatrixCellColor(prob, sev);
                      const isSelected = selectedCell?.prob === prob && selectedCell?.sev === sev;

                      return (
                        <button
                          key={sev}
                          onClick={() => handleGridCellClick(prob, sev)}
                          className={clsx(
                            'flex-1 h-full border m-0.5 rounded transition-all flex items-center justify-center font-mono text-[10px] font-bold',
                            cellColor,
                            isSelected ? 'ring-2 ring-cyan-500/60 scale-105 border-cyan-500 shadow-sm' : ''
                          )}
                          title={`Prob: ${prob}, Sev: ${sev} (${cellFlagsCount} flags)`}
                          aria-label={`Probability ${prob}, Severity ${sev}, ${cellFlagsCount} flags`}
                        >
                          {cellFlagsCount > 0 ? cellFlagsCount : ''}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              </div>
            </div>
            <div className="flex justify-between text-[9px] font-bold text-grey uppercase font-mono mt-1 px-1">
              <span>Impact 1 (Low)</span>
              <span>Impact 5 (Critical)</span>
            </div>
          </div>

          <div className="text-[10px] text-grey leading-relaxed space-y-1 pt-2 border-t border-line">
            <p className="font-bold">Matrix filtering guidelines:</p>
            <p>Click any cell to isolate red flags matching that coordinate. Click again to clear.</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 shrink-0">
            <Card>
              <CardBody className="p-3 flex items-center gap-3">
                <div className="rounded bg-red-100 dark:bg-red-950/20 p-2 text-red-600 dark:text-red-400">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <div className="text-xl font-bold font-mono leading-tight">{unresolvedCriticalCount}</div>
                  <div className="text-[10px] text-grey uppercase font-bold mt-0.5">Active Critical Risks</div>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-3 flex items-center gap-3">
                <div className="rounded bg-emerald-100 dark:bg-emerald-950/20 p-2 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <div className="text-xl font-bold font-mono leading-tight">{completedRemediationsCount} / {totalRemediations}</div>
                  <div className="text-[10px] text-grey uppercase font-bold mt-0.5">Controls Cleared</div>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-3 space-y-1">
                <div className="flex justify-between items-center text-[10px] uppercase font-bold text-grey">
                  <span>Overall Mitigation</span>
                  <span className="font-mono">{mitigationPercent}%</span>
                </div>
                <ReadinessMeter percent={mitigationPercent} />
              </CardBody>
            </Card>
          </div>

          <div className="space-y-4">
            {filteredFlags.map(rf => {
              const completedCount = rf.remediations.filter(r => resolvedRemediations.includes(r.id)).length;
              const totalCount = rf.remediations.length;
              const isResolved = completedCount === totalCount;

              return (
                <Card
                  key={rf.id}
                  className={clsx(
                    'border transition-all duration-300',
                    isResolved
                      ? 'border-status-ready/20 bg-status-ready-bg/5'
                      : rf.risk === 'Critical'
                      ? 'border-red-500/20 hover:border-red-500/40'
                      : 'border-amber-500/20 hover:border-amber-500/40'
                  )}
                >
                  <CardBody className="space-y-3.5">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h3 className="font-bold text-sm leading-snug">{rf.title}</h3>
                        <div className="text-[9px] font-mono text-grey uppercase tracking-wider mt-0.5">
                          Coordinate: Prob {rf.prob} / Sev {rf.sev} &middot; Risk: {rf.risk}
                        </div>
                      </div>
                      <Badge status={isResolved ? 'ready' : rf.risk === 'Critical' ? 'blocked' : 'conditional'}>
                        {isResolved ? 'Resolved' : rf.risk}
                      </Badge>
                    </div>

                    <p className="text-xs text-grey-dark dark:text-grey-light leading-relaxed">{rf.description}</p>

                    {!isResolved && (
                      <div className="rounded bg-red-50 dark:bg-red-950/15 border border-red-100/50 dark:border-red-950/30 p-2.5 text-xs font-mono text-red-700 dark:text-red-300 leading-normal">
                        <span className="font-extrabold uppercase text-[9px] block mb-0.5">[Consequences of Inaction]</span>
                        {rf.consequences}
                      </div>
                    )}

                    <div className="space-y-2 pt-2.5 border-t border-line">
                      <div className="flex justify-between items-center text-[10px] uppercase font-bold text-grey">
                        <span>Mitigation Controls Checklist</span>
                        <span className="font-mono">{completedCount} of {totalCount} done</span>
                      </div>

                      <div className="space-y-1.5 pt-1 pl-1">
                        {rf.remediations.map(r => {
                          const active = resolvedRemediations.includes(r.id);
                          return (
                            <button
                              key={r.id}
                              onClick={() => handleResolveRemediation(r.id)}
                              className="flex items-start gap-2.5 w-full text-left text-xs p-1 rounded hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors font-semibold"
                            >
                              <span className="mt-0.5 shrink-0 text-grey hover:text-navy dark:hover:text-ice">
                                {active ? (
                                  <CheckSquare size={14} className="text-navy dark:text-ice" />
                                ) : (
                                  <Square size={14} />
                                )}
                              </span>
                              <span className={active ? 'line-through text-grey' : ''}>{r.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2.5 border-t border-line/60">
                      <label className="font-bold text-[9px] uppercase tracking-wider text-grey block">Remediation Reference Evidence</label>
                      <div className="flex gap-2">
                        <textarea
                          rows={1}
                          value={evidenceNotes[rf.id] || ''}
                          onChange={e => updateEvidenceNote(rf.id, e.target.value)}
                          placeholder="Input counsel legal citations, bylaws sections, or verification hashes..."
                          className="flex-1 rounded border border-line bg-ice-soft dark:bg-navy-deep p-2 text-xs focus:outline-none placeholder-grey/50 font-mono"
                        />
                        <button
                          onClick={() => handleSaveEvidence(rf.id)}
                          disabled={!evidenceNotes[rf.id]}
                          className="h-8 rounded bg-navy dark:bg-ice text-white dark:text-navy px-3 text-xs font-bold transition-opacity hover:opacity-95 disabled:opacity-30 shrink-0"
                        >
                          Submit Evidence
                        </button>
                      </div>
                    </div>

                  </CardBody>
                </Card>
              );
            })}
          </div>

        </div>

      </div>
    </div>
  );
}
export default RedFlags;
