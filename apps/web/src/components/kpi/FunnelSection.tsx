import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChartCard, FunnelChart } from '@/components/charts';
import type { FunnelCounts } from '@/types/kpi';

const STAGES: { label: string; route: string; pick: (f: FunnelCounts) => number }[] = [
  { label: 'Contacted', route: '/bd-pipeline', pick: (f) => f.enrolled },
  { label: 'Replied', route: '/outreach', pick: (f) => f.replied },
  { label: 'Proposal', route: '/deal-board', pick: (f) => f.proposal },
  { label: 'Won', route: '/deal-board', pick: (f) => f.won },
];

/**
 * Pipeline funnel with clickable stages. The chart kit's FunnelChart renders
 * one direct child element per stage, so a click anywhere inside a stage row
 * is mapped back to its index and routed to the matching workspace.
 */
export function FunnelSection({ funnel }: { funnel: FunnelCounts }) {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);

  const handleClick = (e: React.MouseEvent) => {
    const root = wrapRef.current?.firstElementChild;
    if (!root) return;
    const idx = Array.from(root.children).findIndex((el) => el.contains(e.target as Node));
    if (idx >= 0 && STAGES[idx]) navigate(STAGES[idx].route);
  };

  return (
    <ChartCard title="Pipeline funnel" subtitle="Click a stage to open its workspace">
      <div ref={wrapRef} onClick={handleClick} className="cursor-pointer">
        <FunnelChart stages={STAGES.map((s) => ({ label: s.label, value: s.pick(funnel) }))} />
      </div>
    </ChartCard>
  );
}
