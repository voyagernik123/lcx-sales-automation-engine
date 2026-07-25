import { useState, useMemo } from 'react';
import { redFlags } from '@/data';
import { useAuditStore } from '@/stores/useAuditStore';
import { Card, CardBody, Badge, ReadinessMeter, PageTitle, SectionLabel, Button } from '@/components/ui';
import { AlertTriangle, ShieldCheck, CheckSquare, Square, RefreshCw, Scale } from 'lucide-react';
import { clsx } from 'clsx';

function getMatrixCellColor(prob: number, sev: number) {
  const sum = prob + sev;
  if (sum >= 8) return 'bg-status-blocked/20 hover:bg-status-blocked/30 text-status-blocked border-status-blocked/30';
  if (sum >= 6) return 'bg-status-conditional/20 hover:bg-status-conditional/30 text-status-conditional border-status-conditional/30';
  return 'bg-status-ready/20 hover:bg-status-ready/30 text-status-ready border-status-ready/30';
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
    <div className="space-y-4 text-navy h-[calc(100vh-6.5rem)] flex flex-col overflow-hidden min-h-0">
      <div className="shrink-0">
        <PageTitle
          icon={<Scale size={20} />}
          subtitle="Model, analyze, and resolve legal friction coordinates using the 2D Probability vs. Impact matrix."
          actions={selectedCell && (
            <Button variant="secondary" size="sm" onClick={() => setSelectedCell(null)}>
              <RefreshCw size={11} />
              Reset Matrix Filter
            </Button>
          )}
        >
          Audit Risk Mitigation Center
        </PageTitle>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-hidden">

        <div className="w-full lg:w-80 bg-card border border-line rounded-lg p-4 flex flex-col space-y-4 shrink-0 shadow-sm">
          <SectionLabel className="block text-center">
            2D Risk Coordinate Matrix (Probability vs Severity)
          </SectionLabel>

          <div className="flex-1 flex flex-col justify-between h-[250px] relative select-none">
            <div className="flex-1 flex justify-between border-l border-b border-line pl-1 pb-1 relative">
              <div className="absolute -left-5 top-1/2 -translate-y-1/2 -rotate-90 text-micro font-bold text-grey uppercase font-mono whitespace-nowrap">
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
                            'flex-1 h-full border m-0.5 rounded transition-all flex items-center justify-center font-mono text-micro font-bold',
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
            <div className="flex justify-between text-micro font-bold text-grey uppercase font-mono mt-1 px-1">
              <span>Impact 1 (Low)</span>
              <span>Impact 5 (Critical)</span>
            </div>
          </div>

          <div className="text-micro text-grey leading-relaxed space-y-1 pt-2 border-t border-line">
            <p className="font-bold">Matrix filtering guidelines:</p>
            <p>Click any cell to isolate red flags matching that coordinate. Click again to clear.</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 shrink-0">
            <Card>
              <CardBody className="p-3 flex items-center gap-3">
                <div className="rounded bg-status-blocked-bg p-2 text-status-blocked">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <div className="text-xl font-bold font-mono leading-tight">{unresolvedCriticalCount}</div>
                  <SectionLabel className="block mt-0.5">Active Critical Risks</SectionLabel>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-3 flex items-center gap-3">
                <div className="rounded bg-status-ready-bg p-2 text-status-ready">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <div className="text-xl font-bold font-mono leading-tight">{completedRemediationsCount} / {totalRemediations}</div>
                  <SectionLabel className="block mt-0.5">Controls Cleared</SectionLabel>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-3 space-y-1">
                <div className="flex justify-between items-center text-grey">
                  <SectionLabel>Overall Mitigation</SectionLabel>
                  <span className="text-micro font-bold font-mono uppercase">{mitigationPercent}%</span>
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
                      ? 'border-status-blocked/20 hover:border-status-blocked/40'
                      : 'border-status-conditional/20 hover:border-status-conditional/40'
                  )}
                >
                  <CardBody className="space-y-3.5">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h3 className="font-bold text-sm leading-snug">{rf.title}</h3>
                        <div className="text-micro font-mono text-grey uppercase tracking-wider mt-0.5">
                          Coordinate: Prob {rf.prob} / Sev {rf.sev} &middot; Risk: {rf.risk}
                        </div>
                      </div>
                      <Badge status={isResolved ? 'ready' : rf.risk === 'Critical' ? 'blocked' : 'conditional'}>
                        {isResolved ? 'Resolved' : rf.risk}
                      </Badge>
                    </div>

                    <p className="text-xs text-grey-dark leading-relaxed">{rf.description}</p>

                    {!isResolved && (
                      <div className="rounded bg-status-blocked-bg border border-status-blocked/20 p-2.5 text-xs font-mono text-status-blocked leading-normal">
                        <span className="font-extrabold uppercase text-micro block mb-0.5">[Consequences of Inaction]</span>
                        {rf.consequences}
                      </div>
                    )}

                    <div className="space-y-2 pt-2.5 border-t border-line">
                      <div className="flex justify-between items-center text-grey">
                        <SectionLabel>Mitigation Controls Checklist</SectionLabel>
                        <span className="text-micro font-bold uppercase font-mono">{completedCount} of {totalCount} done</span>
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
                              <span className="mt-0.5 shrink-0 text-grey hover:text-navy">
                                {active ? (
                                  <CheckSquare size={14} className="text-navy" />
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
                      <SectionLabel as="div">Remediation Reference Evidence</SectionLabel>
                      <div className="flex gap-2">
                        <textarea
                          rows={1}
                          value={evidenceNotes[rf.id] || ''}
                          onChange={e => updateEvidenceNote(rf.id, e.target.value)}
                          placeholder="Input counsel legal citations, bylaws sections, or verification hashes..."
                          className="flex-1 rounded border border-line bg-ice-soft dark:bg-navy-deep p-2 text-xs focus-ring placeholder-grey/50 font-mono"
                        />
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleSaveEvidence(rf.id)}
                          disabled={!evidenceNotes[rf.id]}
                          className="shrink-0"
                        >
                          Submit Evidence
                        </Button>
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
