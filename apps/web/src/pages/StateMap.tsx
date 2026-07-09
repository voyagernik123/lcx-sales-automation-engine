import { useState, useMemo } from 'react';
import USAMap from 'react-usa-map';
import { InspectorDrawer } from '@/components/ui';
import { StateInspectorPanel } from '@/components/shared';
import { states } from '@/data';
import { useAuditStore, useFilterStore } from '@/stores';
import { getEffectiveStateStatus } from '@/lib/compliance';
import { State } from '@/types/ontology';
import { Map, SlidersHorizontal, Info, RefreshCw } from 'lucide-react';

export function StateMap() {
  const { addAuditLog } = useAuditStore();
  const { selectedStatuses, selectedPhases, clarityEnacted, spdiEquivalence } = useFilterStore();
  const [selectedState, setSelectedState] = useState<State | null>(null);

  const [nmlsFilter, setNmlsFilter] = useState<string>('all');
  const [sandboxFilter, setSandboxFilter] = useState<string>('all');
  const [regimeFilter, setRegimeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [phaseFilter, setPhaseFilter] = useState<string>('all');

  const filteredStates = useMemo(() => {
    return states.filter(s => {
      if (s.tier === 'Unresearched') return true;

      const matchNmls = nmlsFilter === 'all' || (nmlsFilter === 'yes' && s.nmlsRequired) || (nmlsFilter === 'no' && !s.nmlsRequired);
      const matchSandbox = sandboxFilter === 'all' || (sandboxFilter === 'yes' && s.sandboxAvailable) || (sandboxFilter === 'no' && !s.sandboxAvailable);
      const matchRegime = regimeFilter === 'all' || s.regimeType === regimeFilter;
      const matchPriority = priorityFilter === 'all' || s.priority === priorityFilter;
      const matchPhase = phaseFilter === 'all' || s.phase === phaseFilter;

      const matchGlobalStatus = selectedStatuses.length === 0 || selectedStatuses.includes(s.status);
      const matchGlobalPhase = selectedPhases.length === 0 || selectedPhases.includes(s.phase);

      return matchNmls && matchSandbox && matchRegime && matchPriority && matchPhase && matchGlobalStatus && matchGlobalPhase;
    });
  }, [nmlsFilter, sandboxFilter, regimeFilter, priorityFilter, phaseFilter, selectedStatuses, selectedPhases]);

  const handleResetFilters = () => {
    setNmlsFilter('all');
    setSandboxFilter('all');
    setRegimeFilter('all');
    setPriorityFilter('all');
    setPhaseFilter('all');
    addAuditLog('CCO reset state map filter criteria.', 'System');
  };

  const handleStateClick = (state: State) => {
    setSelectedState(state);
    addAuditLog(`CCO inspected state card: [${state.abbreviation}]`, 'Audit');
  };

  const mapConfig = useMemo(() => {
    const config: Record<string, { fill?: string; clickHandler?: () => void }> = {};
    states.forEach(s => {
      const isUnresearched = s.tier === 'Unresearched';
      const isActive = filteredStates.some(x => x.id === s.id);
      const effectiveStatus = getEffectiveStateStatus(s, { clarityEnacted, spdiEquivalence });

      let fill = 'rgb(var(--grey))';
      if (isUnresearched) {
        fill = 'rgba(var(--grey) / 0.25)';
      } else if (!isActive) {
        fill = 'rgba(var(--grey) / 0.08)';
      } else if (effectiveStatus === 'Ready') {
        fill = 'rgb(var(--green))';
      } else if (effectiveStatus === 'Blocked') {
        fill = 'rgb(var(--red))';
      } else if (effectiveStatus === 'Conditional') {
        fill = 'rgb(var(--amber))';
      }

      config[s.abbreviation] = {
        fill,
        clickHandler: () => {
          handleStateClick(s);
        }
      };
    });
    return config;
  }, [filteredStates, clarityEnacted, spdiEquivalence]);

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col gap-4 text-navy dark:text-ice overflow-hidden">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Map size={24} className="text-navy dark:text-ice" /> Jurisdictional Operations Room</h1>
        <p className="text-sm text-grey-dark dark:text-grey-light mt-0.5">
          Map-based digital twin illustrating Money Transmitter Licensing (MTL) and sandbox exemptions across the USA.
        </p>
      </div>

      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden relative">

        <div className="w-64 bg-card border border-line rounded-lg p-4 flex flex-col space-y-4 shrink-0 overflow-y-auto shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-grey flex items-center gap-1.5">
              <SlidersHorizontal size={13} /> Filter Registry
            </h3>
            <button
              onClick={handleResetFilters}
              className="text-[10px] text-grey hover:text-navy dark:hover:text-ice flex items-center gap-1 font-bold font-mono"
            >
              <RefreshCw size={10} /> Reset
            </button>
          </div>

          {['NMLS Registration', 'MTL Sandbox Exemption', 'Regime Classification', 'Launch Priority', 'Launch Phase'].map((label, i) => {
            const filters = [nmlsFilter, sandboxFilter, regimeFilter, priorityFilter, phaseFilter];
            const setters = [setNmlsFilter, setSandboxFilter, setRegimeFilter, setPriorityFilter, setPhaseFilter];
            const options = [
              [{ value: 'all', label: 'All States' }, { value: 'yes', label: 'Required via NMLS' }, { value: 'no', label: 'Exempt / Not Required' }],
              [{ value: 'all', label: 'All States' }, { value: 'yes', label: 'Sandbox Exemption Available' }, { value: 'no', label: 'No Sandbox Program' }],
              [{ value: 'all', label: 'All Classifications' }, { value: 'Money transmitter', label: 'Money transmitter' }, { value: 'Virtual currency', label: 'Virtual currency' }, { value: 'Hybrid', label: 'Hybrid' }, { value: 'No general MTL', label: 'No general MTL' }, { value: 'Special purpose', label: 'Special purpose' }],
              [{ value: 'all', label: 'All Priorities' }, { value: 'Critical', label: 'Critical' }, { value: 'High', label: 'High' }, { value: 'Medium', label: 'Medium' }, { value: 'Low', label: 'Low' }],
              [{ value: 'all', label: 'All Phases' }, { value: 'Pre-launch', label: 'Pre-launch' }, { value: 'Phase 1', label: 'Phase 1' }, { value: 'Phase 2', label: 'Phase 2' }, { value: 'Phase 3', label: 'Phase 3' }],
            ];

            const setter = setters[i] as React.Dispatch<React.SetStateAction<string>>;

            return (
              <div key={label} className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-grey-dark">{label}</label>
                <select
                  value={filters[i]}
                  onChange={e => setter(e.target.value)}
                  className="w-full h-8 rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 text-xs focus:outline-none"
                >
                  {options[i].map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            );
          })}

          <div className="pt-2 border-t border-line text-[10px] text-grey space-y-1 mt-auto leading-relaxed">
            <p className="font-bold flex items-center gap-1"><Info size={10} /> Legend Guides:</p>
            <p>Green (Ready), Amber (Conditional), Red (Blocked), Slate (Needs Verification/Deferred).</p>
          </div>
        </div>

        <div className="flex-1 bg-card border border-line rounded-lg p-6 shadow-sm overflow-auto flex items-center justify-center us-state-map">
          <div className="w-full max-w-2xl select-none">
            <USAMap customize={mapConfig} />
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
export default StateMap;
