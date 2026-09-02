import { useState, useMemo } from 'react';
import { Fig, FigGrid } from '@/components/fig/Fig';
import { chordFor } from '@/components/fig/figAddress';
import { Link } from 'react-router-dom';
import { AlertTriangle, Terminal, ShieldAlert, LayoutDashboard } from 'lucide-react';
import { Card, CardHeader, CardBody, Badge, ReadinessMeter, InspectorDrawer, PageTitle } from '@/components/ui';
import { StateInspectorPanel } from '@/components/shared';
import { states, products, requirements, readinessItems, redFlags, DATA_REVISED_AT } from '@/data';
import { useAuditStore, useFilterStore } from '@/stores';
import { toBadgeStatus } from '@/lib/formatting';
import { getEffectiveStateStatus, getEffectiveRequirementStatus } from '@/lib/compliance';
import { STATUS_DOT_BG, STATUS_TILE_BG } from '@/lib/colors';
import { State } from '@/types/ontology';
import { clsx } from 'clsx';

/*
 * THE FABRICATED FEED THAT USED TO LIVE HERE IS GONE, AND THE RECORD SAYS WHY.
 *
 * Until S1 of INSTRUMENT_100X_PLAN.md this page kept an array of twelve invented "System"
 * events — "OFAC sanctions automated scan executed: 0 alerts matched", "FinCEN MSB check:
 * federal registration number active and valid" — and a 4-second `setInterval` that picked
 * one at random and pushed it into the operation feed beside REAL audit rows, marked
 * `isReal: false` in the data and indistinguishable on the screen. A compliance dashboard
 * that fabricates compliance events is the exact thing this platform exists to refuse. The
 * feed now shows only what the audit store actually recorded, and says so when that is
 * nothing.
 */

export function Dashboard() {
  const { selectedStatuses, selectedPhases, clarityEnacted, spdiEquivalence } = useFilterStore();
  const { resolvedRemediations, readinessStatusOverrides, auditLogs, safeHarborToggles } = useAuditStore();
  const [selectedState, setSelectedState] = useState<State | null>(null);

  // Memoised so downstream memos can depend on it by identity. Before this was
  // a per-render object, `blockers` below depended only on clarityEnacted +
  // spdiEquivalence and therefore went STALE whenever a safe-harbor exemption
  // was toggled — the blocker count silently disagreed with the toggles.
  const flags = useMemo(
    () => ({
      clarityEnacted,
      spdiEquivalence,
      defiExempt: safeHarborToggles?.defiExempt ?? false,
      micaExempt: safeHarborToggles?.micaExempt ?? false,
      commodityExempt: safeHarborToggles?.commodityExempt ?? false,
    }),
    [clarityEnacted, spdiEquivalence, safeHarborToggles],
  );

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
  }, [flags]);

  const phase1States = useMemo(() => filteredStates.filter(s => s.phase === 'Phase 1' && s.tier !== 'Unresearched'), [filteredStates]);
  const criticalStates = useMemo(() => filteredStates.filter(s => s.priority === 'Critical' || s.priority === 'High').slice(0, 5), [filteredStates]);

  // Only what the audit store recorded — no simulation, no fabricated rows (see the note above).
  const allLogs = useMemo(() => auditLogs.map(al => ({
    timestamp: al.timestamp,
    message: al.message,
    category: al.category,
  })).slice(0, 25), [auditLogs]);

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
    <div className="space-y-4 text-navy h-[calc(100vh-6.5rem)] flex flex-col overflow-hidden min-h-0">

      <div className="shrink-0">
        <PageTitle
          icon={<LayoutDashboard size={20} />}
          subtitle="Operational cockpit synthesized from the 784-page U.S. regulatory strategy research."
        >
          Launch Control Dashboard
        </PageTitle>
      </div>

      {unresolvedCriticalCount > 0 && (
        <div className="rounded-md border border-status-blocked/30 bg-status-blocked/10 px-3 py-2.5 text-xs text-status-blocked font-medium flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0 text-status-blocked" />
            <span>
              <strong>Audit Alert</strong>: There are {unresolvedCriticalCount} unresolved Critical/High risk audit flags active. Resolve these before launching.
            </span>
          </div>
          <Link to="/red-flags" className="underline font-bold shrink-0 hover:opacity-80">
            Resolve Gates &rarr;
          </Link>
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-hidden">

        <div className="flex-1 flex flex-col space-y-4 min-h-0 overflow-y-auto pr-1">

          {/* S6 · the cockpit's counts as figures. The compiled research dataset (`@/data`) carries NO instant, so
              every one of these reads "undated" — a true statement about the dataset, kept visible rather than
              papered over with today's date. */}
          <FigGrid cols={6} className="shrink-0">
            <Fig id="regulatory.researched" address={chordFor('regulatory')} label="researched jurisdictions" value={researched.length} kind="int" source={{ at: DATA_REVISED_AT, kind: 'record' }} />
            <Fig id="regulatory.jurisdictions" address={chordFor('regulatory')} label="jurisdictions in scope" value={states.length} kind="int" source={{ at: DATA_REVISED_AT, kind: 'record' }} />
            <Fig id="regulatory.launchable" address={chordFor('regulatory')} label="launchable states" value={readyOrConditional.length} kind="int" source={{ at: DATA_REVISED_AT, kind: 'derived' }} />
            <Fig id="regulatory.blockers" address={chordFor('regulatory')} label="blocked requirements" value={blockers.length} kind="int" source={{ at: DATA_REVISED_AT, kind: 'derived' }} goodIsUp={false} />
            <Fig id="regulatory.products" address={chordFor('regulatory')} label="listed products" value={products.length} kind="int" source={{ at: DATA_REVISED_AT, kind: 'record' }} />
            <Fig id="regulatory.coverage" address={chordFor('regulatory')} label="research coverage" value={states.length > 0 ? (researched.length / states.length) * 100 : null} kind="pct" source={{ at: DATA_REVISED_AT, kind: 'derived' }} />
          </FigGrid>

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
                      className={`relative flex flex-col items-center justify-center p-1 h-10 border rounded text-micro font-bold t-hover ${tileClass} hover:opacity-80`}
                      title={`${s.name} — ${effectiveStatus}`}
                    >
                      <span className={`absolute top-0.5 right-0.5 h-[5px] w-[5px] rounded-full ${dotClass}`} />
                      <span>{s.abbreviation}</span>
                      <span className="text-micro tracking-tight font-normal opacity-75">{s.phase.replace('Phase ', 'P')}</span>
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
                          {s.name} <span className="text-grey font-mono text-micro">({s.tier.replace(/^Tier \d - /, '')})</span>
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
                    className="t-sweep"
                    style={{
                      filter: 'drop-shadow(0 0 4px rgba(6, 182, 212, 0.4))'
                    }}
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center font-mono">
                  <span className="text-3xl font-extrabold text-navy">{readinessPercent}%</span>
                  <span className="text-micro text-grey uppercase tracking-wider font-bold">Readiness</span>
                </div>
              </div>
              <ReadinessMeter percent={readinessPercent} className="px-4" />
              <Link to="/readiness" className="text-micro text-grey hover:underline uppercase font-bold tracking-wider font-mono">
                Open Readiness Controls &rarr;
              </Link>
            </CardBody>
          </Card>

          <Card className="shrink-0" status="blocked">
            <CardHeader className="text-xs uppercase tracking-wider font-extrabold text-status-blocked flex items-center gap-1.5 border-b border-line px-4 py-2 bg-red-50/50 dark:bg-red-950/10">
              <ShieldAlert size={14} /> CFIUS FOREIGN PARENT GATING
            </CardHeader>
            <CardBody className="text-xs leading-relaxed space-y-1">
              <p>
                Liechtenstein parent (LCX AG) exceeds <strong>25% voting control</strong>, triggering mandatory filing.
              </p>
              <p>
                <strong>Mitigation</strong>: Passive covenants limiting voting power &lt; 10% and blocking access to non-public technical data.
              </p>
            </CardBody>
          </Card>

          <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 rounded-lg border border-slate-800 shadow-md font-mono text-micro overflow-hidden min-h-[220px]">
            <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 flex items-center justify-between shrink-0 select-none">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-500 shrink-0" />
                <span className="uppercase text-micro font-bold text-cyan-400">Live Operation Feed</span>
              </div>
              <Terminal size={12} className="text-slate-500" />
            </div>

            <div className="flex-1 p-3 overflow-y-auto space-y-2 leading-relaxed flex flex-col-reverse justify-end select-text">
              <div className="flex items-center gap-1.5 text-cyan-400 font-bold shrink-0 mb-1">
                <span>&gt; SYSTEM ACTIVE</span>
                <span className="h-3 w-1.5 bg-cyan-400 block shrink-0" />
              </div>
              {allLogs.length === 0 && (
                <div className="text-slate-500" data-testid="operation-feed-empty">
                  No audit events recorded yet. This feed shows only real actions taken on the desk — it
                  does not simulate activity.
                </div>
              )}
              {allLogs.map((log, index) => {
                const catColor =
                  log.category === 'Audit' ? 'text-teal-400 border-teal-500/30' :
                  log.category === 'Architecture' ? 'text-cyan-400 border-cyan-500/30' :
                  log.category === 'Scenario' ? 'text-amber-400 border-amber-500/30' :
                  log.category === 'System' ? 'text-purple-400 border-purple-500/30' : 'text-slate-400';
                return (
                  <div key={index} className="text-slate-300 break-words font-mono text-micro flex gap-1.5 items-start">
                    <span className="text-slate-600 shrink-0 select-none">[{log.timestamp}]</span>
                    <span className={clsx('px-1 py-0.5 rounded text-micro uppercase font-bold shrink-0 leading-none bg-slate-900 border', catColor)}>
                      {log.category}
                    </span>
                    <span className="text-slate-100 font-bold">
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
