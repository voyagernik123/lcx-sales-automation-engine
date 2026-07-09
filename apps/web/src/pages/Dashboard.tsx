import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, MapPin, ShieldCheck, Coins, Terminal, ShieldAlert } from 'lucide-react';
import { Card, CardHeader, CardBody, Badge, ReadinessMeter, InspectorDrawer } from '@/components/ui';
import { StateInspectorPanel } from '@/components/shared';
import { states, products, requirements, readinessItems, redFlags } from '@/data';
import { useAuditStore, useFilterStore } from '@/stores';
import { toBadgeStatus } from '@/lib/formatting';
import { getEffectiveStateStatus, getEffectiveRequirementStatus } from '@/lib/compliance';
import { STATUS_DOT_BG, STATUS_TILE_BG } from '@/lib/colors';
import { State } from '@/types/ontology';
import { clsx } from 'clsx';

const simulatedEvents = [
  'OFAC sanctions automated scan executed: 0 alerts matched.',
  'TRUST Travel-Rule transaction payload validated for wallet_8213.',
  'NYDFS BitLicense panel request: CCO submitted Delaware corporate filings.',
  'CFIUS verification: foreign voting covenants validated under 25% threshold.',
  'Wyoming SPDI audit: segregated customer reserve balances verified.',
  'BSA/AML training logs updated for compliance operations team.',
  'BitLicense review: NYDFS requested revised risk disclosure document.',
  'Texas DOB memorandum 1037: stablecoin reserves audit completed.',
  'California DFAL registration: CCO verified CCO employment covenant.',
  'Intercompany licensing agreement signed between LCX AG and LCX USA.',
  'FinCEN MSB check: federal registration number active and valid.',
  'Howey analysis verified for listed digital commodities.',
];

function StatCard({ icon: Icon, label, value, hint }: { icon: React.ElementType; label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-ice-soft p-2 text-navy dark:bg-ice-soft/10 dark:text-ice"><Icon size={20} /></div>
          <div>
            <div className="text-2xl font-bold leading-none font-mono">{value}</div>
            <div className="text-xs text-grey-dark dark:text-grey-light mt-1">{label}</div>
          </div>
        </div>
        {hint && <p className="mt-2 text-[10px] text-grey dark:text-grey-light/60 leading-tight">{hint}</p>}
      </CardBody>
    </Card>
  );
}

export function Dashboard() {
  const { selectedStatuses, selectedPhases, clarityEnacted, spdiEquivalence } = useFilterStore();
  const { resolvedRemediations, readinessStatusOverrides, auditLogs, safeHarborToggles } = useAuditStore();
  const [selectedState, setSelectedState] = useState<State | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const flags = { clarityEnacted, spdiEquivalence, defiExempt: safeHarborToggles?.defiExempt ?? false, micaExempt: safeHarborToggles?.micaExempt ?? false, commodityExempt: safeHarborToggles?.commodityExempt ?? false };

  const filteredStates = useMemo(() => {
    return states.filter(s => {
      const effectiveStatus = getEffectiveStateStatus(s, { clarityEnacted, spdiEquivalence });
      const matchStatus = selectedStatuses.length === 0 || selectedStatuses.includes(effectiveStatus);
      const matchPhase = selectedPhases.length === 0 || selectedPhases.includes(s.phase);
      return matchStatus && matchPhase;
    });
  }, [selectedStatuses, selectedPhases, clarityEnacted, spdiEquivalence]);

  const researched = useMemo(() => filteredStates.filter(s => s.tier !== 'Unresearched'), [filteredStates]);
  const readyOrConditional = useMemo(() => {
    return filteredStates.filter(s => {
      const effectiveStatus = getEffectiveStateStatus(s, { clarityEnacted, spdiEquivalence });
      return effectiveStatus === 'Ready' || effectiveStatus === 'Conditional';
    });
  }, [filteredStates, clarityEnacted, spdiEquivalence]);

  const blockers = useMemo(() => {
    return requirements.filter(r => {
      const effectiveStatus = getEffectiveRequirementStatus(r.status, r.id, flags);
      return effectiveStatus === 'Blocked';
    });
  }, [clarityEnacted, spdiEquivalence]);

  const phase1States = useMemo(() => filteredStates.filter(s => s.phase === 'Phase 1' && s.tier !== 'Unresearched'), [filteredStates]);
  const criticalStates = useMemo(() => filteredStates.filter(s => s.priority === 'Critical' || s.priority === 'High').slice(0, 5), [filteredStates]);

  const allLogs = useMemo(() => {
    const storeLogs = auditLogs.map(al => ({
      timestamp: al.timestamp,
      message: al.message,
      category: al.category,
      isReal: true,
    }));

    const simLogs = logs.map(l => {
      const match = l.match(/^\[(.*?)\] (.*)$/);
      return {
        timestamp: match ? match[1] : new Date().toLocaleTimeString(),
        message: match ? match[2] : l,
        category: 'System' as const,
        isReal: false,
      };
    });

    return [...storeLogs, ...simLogs].slice(0, 25);
  }, [auditLogs, logs]);

  useEffect(() => {
    const initial = Array.from({ length: 5 }).map(() => {
      const idx = Math.floor(Math.random() * simulatedEvents.length);
      const timestamp = new Date(Date.now() - Math.random() * 3600000).toLocaleTimeString();
      return `[${timestamp}] ${simulatedEvents[idx]}`;
    });
    setLogs(initial.sort());

    const interval = setInterval(() => {
      const idx = Math.floor(Math.random() * simulatedEvents.length);
      const timestamp = new Date().toLocaleTimeString();
      setLogs(prev => [`[${timestamp}] ${simulatedEvents[idx]}`, ...prev].slice(0, 15));
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const unresolvedCriticalCount = redFlags.filter(rf => {
    if (rf.risk !== 'Critical' && rf.risk !== 'High') return false;
    return rf.remediations.some(r => !resolvedRemediations.includes(r.id));
  }).length;

  const totalReadiness = readinessItems.length;
  const completedReadiness = readinessItems.filter(r => {
    let effectiveStatus = readinessStatusOverrides[r.id] || r.status;
    if (safeHarborToggles?.defiExempt && r.id === 'SURV_TRUST') {
      effectiveStatus = 'Complete';
    }
    if (safeHarborToggles?.micaExempt && (r.id === 'CORP_PARENT' || r.id === 'CORP_CFIUS')) {
      effectiveStatus = 'Complete';
    }
    return effectiveStatus === 'Complete';
  }).length;
  const readinessPercent = Math.round((completedReadiness / totalReadiness) * 100);

  return (
    <div className="space-y-4 text-navy dark:text-ice h-[calc(100vh-6.5rem)] flex flex-col overflow-hidden min-h-0">

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 shrink-0">
        <div>
          <h1 className="text-2xl font-bold">Launch Control Dashboard</h1>
          <p className="text-sm text-grey-dark dark:text-grey-light mt-0.5">
            Operational cockpit synthesized from the 784-page U.S. regulatory strategy research.
          </p>
        </div>
      </div>

      {unresolvedCriticalCount > 0 && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-700 dark:text-red-300 font-medium flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0 text-red-500 animate-pulse-beacon" />
            <span>
              <strong>Audit Alert</strong>: There are {unresolvedCriticalCount} unresolved Critical/High risk audit flags active. Resolve these before launching.
            </span>
          </div>
          <Link to="/red-flags" className="underline font-bold shrink-0 hover:text-red-500">
            Resolve Gates &rarr;
          </Link>
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-hidden">

        <div className="flex-1 flex flex-col space-y-4 min-h-0 overflow-y-auto pr-1">

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 shrink-0">
            <StatCard icon={MapPin} label="Researched jurisdictions" value={`${researched.length} / ${states.length}`} hint="Remaining states are unresearched." />
            <StatCard icon={ShieldCheck} label="Launchable States" value={readyOrConditional.length} hint="Phase 1 states, pending counsel sign-off." />
            <StatCard icon={AlertTriangle} label="Blocked Requirements" value={blockers.length} hint="Active domain-level blocker gates." />
            <StatCard icon={Coins} label="Listed Products" value={products.length} hint="Tokens, custody modules, and stablecoins." />
          </div>

          <Card className="shrink-0">
            <CardHeader className="text-xs uppercase tracking-wider font-extrabold text-grey">
              Geographic Risk Heatmap Matrix (All 50 States)
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                {states.map(s => {
                  const effectiveStatus = getEffectiveStateStatus(s, { clarityEnacted, spdiEquivalence });
                  const tileClass = STATUS_TILE_BG[effectiveStatus] || 'bg-slate-400/10 border-slate-400/25 text-slate-500 dark:text-slate-400';
                  const dotClass = STATUS_DOT_BG[effectiveStatus] || 'bg-status-unverified';
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelectedState(s)}
                      className={`relative flex flex-col items-center justify-center p-1 h-10 border rounded text-[10px] font-bold transition-all transform active:scale-95 ${tileClass} hover:opacity-80`}
                      title={`${s.name} — ${effectiveStatus}`}
                    >
                      <span className={`absolute top-0.5 right-0.5 h-[5px] w-[5px] rounded-full ${dotClass}`} />
                      <span>{s.abbreviation}</span>
                      <span className="text-[9px] tracking-tight font-normal opacity-75">{s.phase.replace('Phase ', 'P')}</span>
                    </button>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 flex-1">
            <Card className="flex flex-col min-h-[200px]">
              <CardHeader className="text-xs uppercase tracking-wider font-extrabold text-grey border-b border-line px-4 py-2 bg-ice-soft/20">
                Phase 1 launch candidates
              </CardHeader>
              <CardBody className="overflow-y-auto flex-1 p-3">
                <ul className="space-y-2">
                  {phase1States.map(s => {
                    const effectiveStatus = getEffectiveStateStatus(s, { clarityEnacted, spdiEquivalence });
                    return (
                      <li key={s.id} className="flex items-center justify-between text-xs">
                        <button onClick={() => setSelectedState(s)} className="hover:underline font-bold text-left">{s.name}</button>
                        <Badge status={toBadgeStatus(effectiveStatus)}>{effectiveStatus}</Badge>
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>

            <Card className="flex flex-col min-h-[200px]">
              <CardHeader className="text-xs uppercase tracking-wider font-extrabold text-grey border-b border-line px-4 py-2 bg-ice-soft/20">
                Highest-Priority States
              </CardHeader>
              <CardBody className="overflow-y-auto flex-1 p-3">
                <ul className="space-y-2">
                  {criticalStates.map(s => {
                    const effectiveStatus = getEffectiveStateStatus(s, { clarityEnacted, spdiEquivalence });
                    return (
                      <li key={s.id} className="flex items-center justify-between text-xs">
                        <button onClick={() => setSelectedState(s)} className="hover:underline font-bold text-left">
                          {s.name} <span className="text-grey font-mono text-[9px]">({s.tier.replace(/^Tier \d - /, '')})</span>
                        </button>
                        <Badge status={toBadgeStatus(effectiveStatus)}>{effectiveStatus}</Badge>
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          </div>

        </div>

        <div className="w-full lg:w-80 shrink-0 flex flex-col space-y-4 min-h-0 overflow-y-auto pl-1">

          <Card className="shrink-0">
            <CardHeader className="text-xs uppercase tracking-wider font-extrabold text-grey text-center">
              Compliance Readiness Beacon
            </CardHeader>
            <CardBody className="flex flex-col items-center justify-center py-4 space-y-3">
              <div className="relative flex items-center justify-center h-32 w-32">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="transparent" stroke="var(--line)" strokeWidth="6" />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#06b6d4"
                    strokeWidth="6"
                    strokeDasharray={`${2 * Math.PI * 40}`}
                    strokeDashoffset={`${2 * Math.PI * 40 * (1 - readinessPercent / 100)}`}
                    strokeLinecap="round"
                    className="transition-all duration-700 ease-out"
                    style={{
                      filter: 'drop-shadow(0 0 4px rgba(6, 182, 212, 0.4))'
                    }}
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center font-mono">
                  <span className="text-3xl font-extrabold text-navy dark:text-ice">{readinessPercent}%</span>
                  <span className="text-[9px] text-grey uppercase tracking-wider font-bold">Readiness</span>
                </div>
              </div>
              <ReadinessMeter percent={readinessPercent} className="px-4" />
              <Link to="/readiness" className="text-[10px] text-grey hover:underline uppercase font-bold tracking-wider font-mono">
                Open Readiness Controls &rarr;
              </Link>
            </CardBody>
          </Card>

          <Card className="shrink-0" status="blocked">
            <CardHeader className="text-xs uppercase tracking-wider font-extrabold text-status-blocked flex items-center gap-1.5 border-b border-line px-4 py-2 bg-red-50/50 dark:bg-red-950/10">
              <ShieldAlert size={14} /> CFIUS FOREIGN PARENT GATING
            </CardHeader>
            <CardBody className="text-[10px] leading-relaxed space-y-1">
              <p>
                Liechtenstein parent (LCX AG) exceeds <strong>25% voting control</strong>, triggering mandatory filing.
              </p>
              <p>
                <strong>Mitigation</strong>: Passive covenants limiting voting power &lt; 10% and blocking access to non-public technical data.
              </p>
            </CardBody>
          </Card>

          <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 rounded-lg border border-slate-800 shadow-md font-mono text-[10px] overflow-hidden min-h-[220px]">
            <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 flex items-center justify-between shrink-0 select-none">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-500 shrink-0" />
                <span className="uppercase text-[9px] font-bold text-cyan-400">Live Operation Feed</span>
              </div>
              <Terminal size={12} className="text-slate-500" />
            </div>

            <div className="flex-1 p-3 overflow-y-auto space-y-2 leading-relaxed flex flex-col-reverse justify-end select-text">
              <div className="flex items-center gap-1.5 text-cyan-400 font-bold shrink-0 mb-1">
                <span>&gt; SYSTEM ACTIVE</span>
                <span className="h-3 w-1.5 bg-cyan-400 animate-pulse block shrink-0" />
              </div>
              {allLogs.map((log, index) => {
                const catColor =
                  log.category === 'Audit' ? 'text-teal-400 border-teal-500/30' :
                  log.category === 'Architecture' ? 'text-cyan-400 border-cyan-500/30' :
                  log.category === 'Scenario' ? 'text-amber-400 border-amber-500/30' :
                  log.category === 'System' ? 'text-purple-400 border-purple-500/30' : 'text-slate-400';
                return (
                  <div key={index} className="text-slate-300 break-words font-mono text-[9px] flex gap-1.5 items-start">
                    <span className="text-slate-600 shrink-0 select-none">[{log.timestamp}]</span>
                    {log.isReal && (
                      <span className={clsx('px-1 py-0.5 rounded text-[7px] uppercase font-bold shrink-0 leading-none bg-slate-900 border', catColor)}>
                        {log.category}
                      </span>
                    )}
                    <span className={log.isReal ? 'text-slate-100 font-bold' : 'text-slate-400'}>
                      {log.message}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </div>

      <InspectorDrawer isOpen={!!selectedState} onClose={() => setSelectedState(null)} title={selectedState?.name ?? ''}>
        {selectedState && (
          <StateInspectorPanel
            state={selectedState}
            effectiveStatus={getEffectiveStateStatus(selectedState, { clarityEnacted, spdiEquivalence })}
          />
        )}
      </InspectorDrawer>
    </div>
  );
}
