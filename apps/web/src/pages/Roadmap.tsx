import { useState, useMemo } from 'react';
import { useFilterStore } from '@/stores/useFilterStore';
import { CalendarRange, Network } from 'lucide-react';
import { clsx } from 'clsx';

interface Milestone {
  id: string;
  name: string;
  phase: string;
  startMonth: number;
  duration: number; // in months
  row: number; // track row offset
  dependencies: string[]; // parent ids
  gatedItems: string[]; // child ids
  notes: string;
}

const LAUNCH_MILESTONES: Milestone[] = [
  {
    id: 'corp-setup',
    name: '1. Delaware Entity & CCO hiring',
    phase: 'Pre-launch',
    startMonth: 1,
    duration: 3,
    row: 1,
    dependencies: [],
    gatedItems: ['fincen-reg', 'trust-integ'],
    notes: 'Incorporate Delaware C-Corp and execute CCO employment agreement.',
  },
  {
    id: 'fincen-reg',
    name: '2. FinCEN MSB & Bank Escrow contracts',
    phase: 'Pre-launch',
    startMonth: 3,
    duration: 4,
    row: 2,
    dependencies: ['corp-setup'],
    gatedItems: ['mt-mtl', 'wy-spdi'],
    notes: 'Register as federal MSB and execute escrow account contracts with banking partners.',
  },
  {
    id: 'trust-integ',
    name: '3. TRUST Travel-Rule engineering audits',
    phase: 'Phase 1',
    startMonth: 4,
    duration: 4,
    row: 3,
    dependencies: ['corp-setup'],
    gatedItems: ['mt-mtl'],
    notes: 'Engineering team integrates TRUST protocol and clears OFAC transaction monitoring logs.',
  },
  {
    id: 'mt-mtl',
    name: '4. Montana MTL exemption submission',
    phase: 'Phase 1',
    startMonth: 7,
    duration: 3,
    row: 1,
    dependencies: ['fincen-reg', 'trust-integ'],
    gatedItems: ['mtl-wave-1'],
    notes: 'Submit non-custodial wallet declaration to Montana Division of Banking.',
  },
  {
    id: 'wy-spdi',
    name: '5. Wyoming SPDI charter submission',
    phase: 'Phase 2',
    startMonth: 8,
    duration: 6,
    row: 2,
    dependencies: ['fincen-reg'],
    gatedItems: ['custodial-launch'],
    notes: 'Submit trust charter application for special purpose depository banking operations.',
  },
  {
    id: 'mtl-wave-1',
    name: '6. State Money Transmitter applications (Wave 1)',
    phase: 'Phase 2',
    startMonth: 10,
    duration: 6,
    row: 3,
    dependencies: ['mt-mtl'],
    gatedItems: ['ny-bitlicense'],
    notes: 'Submit NMLS applications for Texas, Illinois, Pennsylvania, and Florida.',
  },
  {
    id: 'custodial-launch',
    name: '7. Custodial fiat exchange launch',
    phase: 'Phase 3',
    startMonth: 15,
    duration: 5,
    row: 1,
    dependencies: ['wy-spdi', 'mtl-wave-1'],
    gatedItems: [],
    notes: 'Clear beta trading and open exchange operations using Wyoming trust custody clearing.',
  },
  {
    id: 'ny-bitlicense',
    name: '8. New York BitLicense review audits',
    phase: 'Phase 3',
    startMonth: 17,
    duration: 8,
    row: 2,
    dependencies: ['mtl-wave-1'],
    gatedItems: [],
    notes: 'Execute DFS forensic compliance examination audits for retail license approval.',
  },
];

export function Roadmap() {
  const { clarityEnacted, spdiEquivalence } = useFilterStore();
  const [hoveredMilestoneId, setHoveredMilestoneId] = useState<string | null>(null);

  // Compute dynamic milestones based on active safe harbors / preemption rules
  const activeMilestones = useMemo(() => {
    return LAUNCH_MILESTONES.map(m => {
      const milestone = { ...m };
      if (clarityEnacted) {
        if (milestone.id === 'mt-mtl' || milestone.id === 'mtl-wave-1') {
          milestone.duration = 0; // preempted to immediate
          milestone.name = `[PREEMPTED] ${milestone.name.replace(/^\d+\.\s*/, '')}`;
        }
      }
      if (spdiEquivalence) {
        if (milestone.id === 'ny-bitlicense') {
          milestone.duration = 2; // compressed DFS review under SPDI trust equivalence
          milestone.name = `[ACCELERATED] ${milestone.name.replace(/^\d+\.\s*/, '')}`;
        }
      }
      return milestone;
    });
  }, [clarityEnacted, spdiEquivalence]);

  // Compute dependency highlights
  const highlightedIds = useMemo(() => {
    if (!hoveredMilestoneId) return new Set<string>();

    const target = activeMilestones.find(m => m.id === hoveredMilestoneId);
    if (!target) return new Set<string>();

    return new Set<string>([
      hoveredMilestoneId,
      ...target.dependencies,
      ...target.gatedItems,
    ]);
  }, [hoveredMilestoneId, activeMilestones]);

  const handleMilestoneHover = (id: string | null) => {
    setHoveredMilestoneId(id);
  };

  return (
    <div className="space-y-4 text-navy dark:text-ice h-[calc(100vh-6.5rem)] flex flex-col overflow-hidden min-h-0">
      {/* Header */}
      <div className="shrink-0">
        <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarRange size={24} className="text-navy dark:text-ice" /> Chronos Gantt Timeline</h1>
        <p className="text-sm text-grey-dark dark:text-grey-light mt-0.5">
          Chronological launch sequence mapping corporate formations, MTL submissions, and custodial launches over a 24-month horizon.
        </p>
      </div>

      {/* Main Gantt workspace */}
      <div className="flex-1 bg-card border border-line rounded-lg p-5 flex flex-col min-h-0 overflow-y-auto shadow-sm">
        
        {/* Timeline Months Ruler */}
        <div className="grid grid-cols-24 border-b border-line pb-2.5 font-mono text-[9px] font-bold text-grey uppercase select-none shrink-0">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="text-center border-r border-line/30 last:border-0">
              M{i + 1}
            </div>
          ))}
        </div>

        {/* Gantt Tracks Viewport */}
        <div className="flex-1 min-h-[300px] py-6 relative select-none">
          
          {/* Background vertical columns helper grid lines */}
          <div className="absolute inset-0 grid grid-cols-24 pointer-events-none opacity-[0.03] select-none z-0">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="border-r border-navy dark:border-ice h-full" />
            ))}
          </div>

          {/* SVG Dependency Vector Overlays */}
          <svg className="absolute inset-0 h-full w-full pointer-events-none z-10" viewBox="0 0 1000 200" preserveAspectRatio="none">
            {hoveredMilestoneId && (() => {
              const target = activeMilestones.find(m => m.id === hoveredMilestoneId);
              if (!target) return null;

              const targetCol = target.startMonth - 1;
              const targetW = target.duration || 0.1; // fallback if 0 duration
              const targetRow = target.row;

              const tX = ((targetCol + targetW / 2) / 24) * 1000;
              const tY = (targetRow * 60) - 20;

              return target.dependencies.map(parentId => {
                const parent = activeMilestones.find(m => m.id === parentId);
                if (!parent) return null;

                const pCol = parent.startMonth - 1;
                const pW = parent.duration || 0.1;
                const pRow = parent.row;

                const pX = ((pCol + pW / 2) / 24) * 1000;
                const pY = (pRow * 60) - 20;

                return (
                  <path
                    key={parentId}
                    d={`M ${pX} ${pY} Q ${(pX + tX) / 2} ${(pY + tY) / 2 - 20} ${tX} ${tY}`}
                    fill="transparent"
                    stroke="#06b6d4"
                    strokeWidth="2"
                    strokeDasharray="4,4"
                    className="animate-pulse-beacon"
                  />
                );
              });
            })()}
          </svg>

          {/* Gantt Bar Cards Stack */}
          <div className="space-y-6 relative z-20">
            {/* Track 1 */}
            <div className="h-[200px] relative w-full">
              {activeMilestones.map(m => {
                const isHovered = hoveredMilestoneId === m.id;
                const isHighlighted = highlightedIds.has(m.id);
                const hasActiveTracing = hoveredMilestoneId !== null;

                const leftPct = ((m.startMonth - 1) / 24) * 100;
                const widthPct = Math.max(0.5, (m.duration / 24) * 100); // minimum width for 0m duration bars

                return (
                  <button
                    key={m.id}
                    onMouseEnter={() => handleMilestoneHover(m.id)}
                    onMouseLeave={() => handleMilestoneHover(null)}
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      top: `${(m.row - 1) * 60}px`,
                    }}
                    className={clsx(
                      'absolute h-10 rounded border text-left p-1.5 flex flex-col justify-between shadow-sm cursor-pointer select-none transition-all duration-300 font-sans',
                      isHovered && 'ring-2 ring-cyan-500/50 scale-[1.02] border-cyan-500 z-30',
                      isHighlighted && !isHovered && 'border-cyan-500 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
                      !isHighlighted && hasActiveTracing && 'opacity-15 grayscale scale-95 pointer-events-none',
                      !hasActiveTracing && (m.duration === 0 ? 'border-dashed border-status-ready bg-status-ready/10 text-status-ready' : 'border-line bg-card hover:border-grey')
                    )}
                  >
                    <div className="flex justify-between items-center w-full leading-none">
                      <span className="text-[9px] font-bold truncate max-w-[80%]">{m.name}</span>
                      <span className="text-[9px] font-mono text-grey uppercase tracking-wider">{m.phase.replace('Phase ', 'P')}</span>
                    </div>
                    <div className="text-[9px] text-grey-dark dark:text-grey-light font-mono truncate leading-none mt-0.5">
                      {m.duration === 0 ? 'Exempt / Immediate' : `M${m.startMonth} - M${m.startMonth + m.duration} (${m.duration}m)`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Floating operational information box */}
        <div className="mt-8 border-t border-line/45 pt-4 text-[10px] text-grey leading-normal space-y-1 select-none shrink-0">
          <p className="font-bold flex items-center gap-1"><Network size={11} className="text-cyan-500" /> Operational Chronos Protocol:</p>
          <p>Hovering over any Gantt block draws live dependency vectors illustrating upstream compliance filings and downstream gating locks.</p>
        </div>

      </div>
    </div>
  );
}
export default Roadmap;
