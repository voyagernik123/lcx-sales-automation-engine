import { useAuditStore } from '@/stores/useAuditStore';
import { getResearchedStates } from '@/lib/compliance';
import { clsx } from 'clsx';

interface StateCohortGridProps {
  selected: string[];
  onToggle: (abbr: string) => void;
  auditLabel?: string;
}

export function StateCohortGrid({ selected, onToggle, auditLabel }: StateCohortGridProps) {
  const { addAuditLog } = useAuditStore();
  const researched = getResearchedStates();

  const handleToggle = (abbr: string) => {
    onToggle(abbr);
    if (auditLabel) {
      addAuditLog(`${auditLabel}: CCO toggled state cohort: ${abbr}`, 'System');
    }
  };

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {researched.map(s => {
        const active = selected.includes(s.abbreviation);
        return (
          <button
            key={s.id}
            onClick={() => handleToggle(s.abbreviation)}
            className={clsx(
              'px-1.5 py-1 rounded text-[10px] font-mono border text-center font-bold transition-all',
              active
                ? 'bg-navy border-navy text-white dark:bg-ice dark:border-ice dark:text-navy'
                : 'border-line bg-card text-grey-dark hover:bg-ice-soft dark:hover:bg-ice-soft/10'
            )}
          >
            {s.abbreviation}
          </button>
        );
      })}
    </div>
  );
}

interface BulkSelectActionsProps {
  onSelectPhase1: () => void;
  onSelectNmls: () => void;
  onClear: () => void;
}

export function BulkSelectActions({ onSelectPhase1, onSelectNmls, onClear }: BulkSelectActionsProps) {
  return (
    <div className="flex gap-1.5">
      <button onClick={onSelectPhase1} className="text-[9px] font-bold text-cyan-500 hover:underline">
        Phase 1
      </button>
      <span className="text-grey text-[9px]">&bull;</span>
      <button onClick={onSelectNmls} className="text-[9px] font-bold text-cyan-500 hover:underline">
        NMLS
      </button>
      <span className="text-grey text-[9px]">&bull;</span>
      <button onClick={onClear} className="text-[9px] font-bold text-grey-dark hover:underline">
        Clear
      </button>
    </div>
  );
}
