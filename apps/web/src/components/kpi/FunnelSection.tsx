import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChartCard, ColumnChart, FunnelChart } from '@/components/charts';
import { isMonotoneFunnel } from '@/lib/metricPolicy';
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

  const values = STAGES.map((s) => s.pick(funnel));
  // Policy: a funnel form asserts monotone flow. When the window's data
  // violates that (stages counted on different populations), showing carried-%
  // arrows would assert conversions >100% — fall back to plain stage counts.
  const funnelValid = isMonotoneFunnel(values);

  return (
    <ChartCard
      title="Pipeline funnel"
      subtitle={funnelValid ? 'Click a stage to open its workspace' : 'Stage counts — populations differ in this window, so carried-% is not shown'}
    >
      <div ref={wrapRef} onClick={handleClick} className="cursor-pointer">
        {funnelValid ? (
          <FunnelChart stages={STAGES.map((s, i) => ({ label: s.label, value: values[i] }))} />
        ) : (
          <ColumnChart data={STAGES.map((s, i) => ({ label: s.label, value: values[i] }))} />
        )}
      </div>
    </ChartCard>
  );
}
