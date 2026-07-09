import { useMemo } from 'react';
import { useAuditStore, useFilterStore } from '@/stores';
import { Sliders, Terminal } from 'lucide-react';
import { clsx } from 'clsx';
import { parseMonetaryValue, formatUSD } from '@/lib/formatting';
import { getResearchedStates } from '@/lib/compliance';

interface PolicyScenario {
  id: string;
  name: string;
  desc: string;
  effect: string;
}

function buildPolicyScenarios(): PolicyScenario[] {
  const researched = getResearchedStates();
  const nmlsCount = researched.filter(s => s.nmlsRequired).length;
  const nmlsDisplay = nmlsCount > 0 ? nmlsCount : 46;

  return [
    {
      id: 'clarity-act',
      name: 'H.R. 3633 CLARITY Act preemption',
      desc: 'Simulates federal preemption of state Money Transmitter Licenses (MTLs) for SEC/CFTC registered spot exchanges.',
      effect: `Preempts Money Transmitter License requirements across ${nmlsDisplay} states, turning gates green.`,
    },
    {
      id: 'mica-passport',
      name: 'E.U. MiCA cross-border passporting',
      desc: 'Models international reciprocal licensing agreements between Liechtenstein FMA/MiCA and U.S. Federal regulators.',
      effect: 'Removes local non-US parent corporate setup hurdles, resolving entity covenants.',
    },
    {
      id: 'wyoming-SPDI-equivalence',
      name: 'SPDI Federal trust equivalence',
      desc: 'Models if NYDFS grants federal reciprocity to Wyoming Special Purpose Depository Institutions.',
      effect: 'Exempts SPDI operators from the New York BitLicense, saving $250K+ in licensing costs.',
    },
  ];
}

interface RuleEntry {
  originalText: string;
  isChanged: boolean;
  tag?: string;
}

export function ScenarioPlanner() {
  const { addAuditLog } = useAuditStore();
  const { clarityEnacted, spdiEquivalence, micaPassport, toggleFilterStoreField } = useFilterStore();

  const researched = getResearchedStates();
  const nmlsCount = researched.filter(s => s.nmlsRequired).length;
  const nmlsDisplay = nmlsCount > 0 ? nmlsCount : 46;

  const maxNetWorth = Math.max(...researched.map(s => parseMonetaryValue(s.minNetWorth)), 0);
  const netWorthDisplay = maxNetWorth > 0 ? formatUSD(maxNetWorth) : '$15,000,000';

  const POLICY_SCENARIOS = useMemo(() => buildPolicyScenarios(), []);

  const activeScenarios = useMemo<Record<string, boolean>>(() => ({
    'clarity-act': clarityEnacted,
    'mica-passport': micaPassport,
    'wyoming-SPDI-equivalence': spdiEquivalence,
  }), [clarityEnacted, micaPassport, spdiEquivalence]);

  const handleToggleScenario = (id: string) => {
    const keyMap: Record<string, 'clarityEnacted' | 'spdiEquivalence' | 'micaPassport'> = {
      'clarity-act': 'clarityEnacted',
      'mica-passport': 'micaPassport',
      'wyoming-SPDI-equivalence': 'spdiEquivalence',
    };
    const key = keyMap[id];
    if (key) {
      toggleFilterStoreField(key);
      const nextVal = !activeScenarios[id];
      const action = nextVal ? 'activated' : 'deactivated';
      addAuditLog(`CCO simulated regulatory policy scenario: [${id}] ${action}`, 'Scenario');
    }
  };

  const beforeRules = [
    `State Money Transmitter License (MTL) required across ${nmlsDisplay} states.`,
    'New York BitLicense application required (Estimated $250K cost).',
    'CFIUS mandatory foreign parent filing (Liechtenstein LLC covenants).',
    `Minimum net worth ceiling of ${netWorthDisplay} required globally.`,
    'OFAC / TRUST automated Travel-Rule integration required.',
  ];

  const afterRules: RuleEntry[] = useMemo(() => {
    const rules: RuleEntry[] = beforeRules.map(r => ({ originalText: r, isChanged: false }));

    if (activeScenarios['clarity-act']) {
      const idx = rules.findIndex(r => r.originalText.includes('Money Transmitter License'));
      if (idx !== -1) {
        rules[idx] = {
          originalText: rules[idx].originalText,
          isChanged: true,
          tag: 'PREEMPTED BY H.R. 3633',
        };
      }
    }

    if (activeScenarios['wyoming-SPDI-equivalence']) {
      const idx = rules.findIndex(r => r.originalText.includes('New York BitLicense'));
      if (idx !== -1) {
        rules[idx] = {
          originalText: rules[idx].originalText,
          isChanged: true,
          tag: 'EXEMPT VIA SPDI TRUST RECIPROCITY',
        };
      }
    }

    if (activeScenarios['mica-passport']) {
      const idx = rules.findIndex(r => r.originalText.includes('CFIUS mandatory'));
      if (idx !== -1) {
        rules[idx] = {
          originalText: rules[idx].originalText,
          isChanged: true,
          tag: 'RESOLVED BY MICA RECIPROCATION',
        };
      }
    }

    return rules;
  }, [clarityEnacted, spdiEquivalence, micaPassport]);

  return (
    <div className="space-y-4 text-navy dark:text-ice h-[calc(100vh-6.5rem)] flex flex-col overflow-hidden min-h-0">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Sliders size={24} className="text-navy dark:text-ice" /> Legislative Policy Sandbox</h1>
        <p className="text-sm text-grey-dark dark:text-grey-light mt-0.5">
          Activate pending U.S. cryptocurrency legislation to model changes on Money Transmitter licensing and corporate structures.
        </p>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-hidden">

        <div className="w-full lg:w-96 bg-card border border-line rounded-lg p-4 overflow-y-auto space-y-4 shrink-0 shadow-sm">
          <span className="font-bold text-[10px] uppercase tracking-wider text-grey block">
            Select Legislative Scenarios
          </span>

          <div className="space-y-3.5">
            {POLICY_SCENARIOS.map(sc => {
              const active = !!activeScenarios[sc.id];
              return (
                <button
                  key={sc.id}
                  onClick={() => handleToggleScenario(sc.id)}
                  className={clsx(
                    'flex flex-col text-left p-3 rounded-lg border transition-all duration-300 w-full select-none',
                    active
                      ? 'border-cyan-500 bg-cyan-500/5 dark:bg-cyan-500/2 shadow-sm'
                      : 'border-line hover:border-grey bg-card'
                  )}
                >
                  <div className="flex justify-between items-center w-full">
                    <span className="text-xs font-bold text-navy dark:text-ice leading-tight">{sc.name}</span>
                    <input
                      type="checkbox"
                      checked={active}
                      readOnly
                      className="rounded border-grey/40 text-cyan-500 focus:ring-0 cursor-pointer h-4 w-4"
                    />
                  </div>
                  <p className="text-[10px] text-grey-dark dark:text-grey-light mt-1.5 leading-normal">{sc.desc}</p>
                  <div className="mt-2 text-[9px] font-mono text-cyan-600 dark:text-cyan-400 leading-tight">
                    <strong>Effect</strong>: {sc.effect}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0">

          <div className="flex flex-col bg-slate-950 text-slate-100 rounded-lg border border-slate-900 shadow-md font-mono text-[10px] overflow-hidden h-full">
            <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 flex items-center justify-between shrink-0 select-none">
              <span className="uppercase text-[9px] font-bold text-slate-400">Baseline Compliance Rules</span>
              <Terminal size={11} className="text-slate-500" />
            </div>
            <div className="flex-1 p-4 overflow-y-auto space-y-3 font-mono leading-relaxed text-slate-300">
              {beforeRules.map((rule, idx) => (
                <div key={idx} className="flex gap-2">
                  <span className="text-slate-500 select-none">{(idx + 1).toString().padStart(2, '0')}</span>
                  <span className="text-red-400 font-bold shrink-0">[-]</span>
                  <span>{rule}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col bg-slate-950 text-slate-100 rounded-lg border border-slate-900 shadow-md font-mono text-[10px] overflow-hidden h-full">
            <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 flex items-center justify-between shrink-0 select-none">
              <span className="uppercase text-[9px] font-bold text-cyan-400">Simulated Compliance Rules</span>
              <Terminal size={11} className="text-cyan-500" />
            </div>
            <div className="flex-1 p-4 overflow-y-auto space-y-3 font-mono leading-relaxed text-slate-300">
              {afterRules.map((rule, idx) => (
                <div key={idx} className={clsx('flex gap-2', rule.isChanged && 'text-green-400 font-semibold')}>
                  <span className="text-slate-500 select-none">{(idx + 1).toString().padStart(2, '0')}</span>
                  <span className={clsx('font-bold shrink-0', rule.isChanged ? 'text-green-400' : 'text-slate-500')}>
                    {rule.isChanged ? '[+]' : '[ ]'}
                  </span>
                  <span>
                    {rule.isChanged ? (
                      <>
                        <span className="line-through opacity-50">{rule.originalText}</span>
                        {' '}
                        <span className="text-cyan-400 font-bold">[{rule.tag}]</span>
                      </>
                    ) : (
                      rule.originalText
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
export default ScenarioPlanner;
