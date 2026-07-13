import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { ChartCard } from '@/components/charts';
import type { PostListingTrigger, StalledDeal } from '@/types/kpi';
import { STAGE_LABELS, TRIGGER_DAY_LABELS, TRIGGER_TYPE_LABELS } from '@/types/kpi';

const TH = 'text-left py-2 px-2 text-[10px] font-bold uppercase tracking-wider text-grey';

export function StalledDealsTable({ deals }: { deals: StalledDeal[] }) {
  const navigate = useNavigate();
  if (deals.length === 0) return null;

  return (
    <ChartCard title="Stalled deals" subtitle="Open deals with no update in 3+ days">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line">
              <th className={TH}>Project</th>
              <th className={TH}>Stage</th>
              <th className={TH}>Stalled (days)</th>
              <th className={TH}>Blocker</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/30">
            {deals.map((deal) => (
              <tr
                key={deal.id}
                onClick={() => navigate(`/bd-pipeline/${deal.id}`)}
                className="hover:bg-ice-soft dark:hover:bg-ice-soft/5 cursor-pointer transition-colors"
              >
                <td className="py-2 px-2 font-medium text-navy">{deal.projectName}</td>
                <td className="py-2 px-2 text-grey">{STAGE_LABELS[deal.stage] ?? deal.stage}</td>
                <td className="py-2 px-2">
                  <span className={clsx(
                    'font-bold',
                    deal.daysSinceUpdate >= 21 ? 'text-red-500' : deal.daysSinceUpdate >= 7 ? 'text-amber-500' : 'text-grey',
                  )}>
                    {deal.daysSinceUpdate}d
                  </span>
                </td>
                <td className="py-2 px-2 text-grey max-w-[200px] truncate">{deal.blocker}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

export function TriggersTable({
  triggers,
  onAction,
}: {
  triggers: PostListingTrigger[];
  onAction: (trigger: PostListingTrigger, action: 'drafted' | 'completed' | 'skipped') => void;
}) {
  if (triggers.length === 0) return null;

  return (
    <ChartCard title="Post-listing 30/60/90 triggers" subtitle="Expansion touchpoints after a won deal">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line">
              <th className={TH}>Project</th>
              <th className={TH}>Trigger</th>
              <th className={TH}>Due</th>
              <th className={TH}>Status</th>
              <th className={TH}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/30">
            {triggers.slice(0, 20).map((t) => {
              const isOverdue = new Date(t.dueAt) < new Date() && t.status === 'pending';
              return (
                <tr key={t.id} className={clsx(isOverdue && 'bg-red-50/30 dark:bg-red-950/10')}>
                  <td className="py-2 px-2 font-medium text-navy">{t.projectName}</td>
                  <td className="py-2 px-2">
                    <span className="font-medium text-navy">{TRIGGER_DAY_LABELS[t.triggerDay]}</span>
                    <span className="text-grey ml-1">{TRIGGER_TYPE_LABELS[t.triggerType] ?? t.triggerType}</span>
                  </td>
                  <td className="py-2 px-2">
                    <span className={clsx(isOverdue ? 'text-red-500 font-bold' : 'text-grey')}>
                      {new Date(t.dueAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="py-2 px-2">
                    <span className={clsx(
                      'inline-block rounded-full px-2 py-0.5 text-[10px] font-bold',
                      t.status === 'completed' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                      t.status === 'drafted' && 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
                      t.status === 'skipped' && 'bg-slate-500/10 text-slate-500',
                      t.status === 'pending' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                    )}>
                      {t.status}
                    </span>
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-1">
                      {t.status === 'pending' && (
                        <>
                          <button onClick={() => onAction(t, 'drafted')} className="rounded border border-line px-2 py-0.5 text-[10px] font-bold text-navy hover:bg-ice-soft dark:hover:bg-navy-deep transition-colors">Draft</button>
                          <button onClick={() => onAction(t, 'completed')} className="rounded border border-emerald-300 px-2 py-0.5 text-[10px] font-bold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors">Done</button>
                          <button onClick={() => onAction(t, 'skipped')} className="rounded border border-line px-2 py-0.5 text-[10px] font-bold text-grey hover:bg-ice-soft dark:hover:bg-navy-deep transition-colors">Skip</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
