import { clsx } from 'clsx';
import { ChartCard } from '@/components/charts';
import { EntityChip } from '@/components/entity';
import { useInspect } from '@/stores';
import type { PostListingTrigger, StalledDeal } from '@/types/kpi';
import { STAGE_LABELS, TRIGGER_DAY_LABELS, TRIGGER_TYPE_LABELS } from '@/types/kpi';

const TH = 'text-left py-2.5 px-2 text-micro font-medium uppercase tracking-wide text-grey';

export function StalledDealsTable({ deals }: { deals: StalledDeal[] }) {
  // deal.id is a DEAL id — the old row click routed it to the lead-detail
  // page (which expects a project id): a dead end. Inspect in place instead.
  const inspect = useInspect();
  if (deals.length === 0) return null;

  return (
    <ChartCard title="Stalled deals" subtitle="Open deals with no update in 3+ days — click a row to inspect the deal">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line">
              <th className={TH}>Project</th>
              <th className={TH}>Stage</th>
              <th className={clsx(TH, 'text-right')}>Stalled (days)</th>
              <th className={TH}>Blocker</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/50">
            {deals.map((deal) => (
              <tr
                key={deal.id}
                onClick={() => inspect('deal', deal.id)}
                tabIndex={0}
                // Stays a table row (role="button" would strip the row semantics).
                // The target guard keeps Enter on the EntityChip inside the row from
                // also opening the row's own inspector.
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    inspect('deal', deal.id);
                  }
                }}
                className="hover:bg-ice-soft/50 dark:hover:bg-ice-soft/10 cursor-pointer transition-colors focus-ring"
              >
                <td className="py-2.5 px-2 font-medium text-navy">
                  <EntityChip
                    type="deal"
                    id={deal.id}
                    name={deal.projectName}
                    stateLine={`${STAGE_LABELS[deal.stage] ?? deal.stage} · stalled ${deal.daysSinceUpdate}d`}
                    vitals={deal.blocker ? [{ label: 'Blocker', value: deal.blocker }] : undefined}
                  />
                </td>
                <td className="py-2.5 px-2 text-grey">{STAGE_LABELS[deal.stage] ?? deal.stage}</td>
                <td className="py-2.5 px-2 text-right">
                  <span className={clsx(
                    'num-tabular font-semibold',
                    deal.daysSinceUpdate >= 21 ? 'text-red-500' : deal.daysSinceUpdate >= 7 ? 'text-amber-500' : 'text-grey',
                  )}>
                    {deal.daysSinceUpdate}d
                  </span>
                </td>
                <td className="py-2.5 px-2 text-grey max-w-[200px] truncate">{deal.blocker}</td>
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
          <tbody className="divide-y divide-line/50">
            {triggers.slice(0, 20).map((t) => {
              const isOverdue = new Date(t.dueAt) < new Date() && t.status === 'pending';
              return (
                <tr key={t.id} className={clsx('transition-colors hover:bg-ice-soft/50 dark:hover:bg-ice-soft/10', isOverdue && 'bg-red-50/30 dark:bg-red-950/10')}>
                  <td className="py-2.5 px-2 font-medium text-navy">{t.projectName}</td>
                  <td className="py-2.5 px-2">
                    <span className="font-medium text-navy">{TRIGGER_DAY_LABELS[t.triggerDay]}</span>
                    <span className="text-grey ml-1">{TRIGGER_TYPE_LABELS[t.triggerType] ?? t.triggerType}</span>
                  </td>
                  <td className="py-2.5 px-2">
                    <span className={clsx('num-tabular', isOverdue ? 'text-red-500 font-semibold' : 'text-grey')}>
                      {new Date(t.dueAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="py-2.5 px-2">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-line/70 px-1.5 py-0.5 text-micro font-semibold text-navy">
                      <span
                        className={clsx(
                          'h-1.5 w-1.5 rounded-full',
                          t.status === 'completed' && 'bg-emerald-500',
                          t.status === 'drafted' && 'bg-cyan-500',
                          t.status === 'skipped' && 'bg-slate-400',
                          t.status === 'pending' && 'bg-amber-500',
                        )}
                        aria-hidden="true"
                      />
                      {t.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-1">
                      {t.status === 'pending' && (
                        <>
                          <button onClick={() => onAction(t, 'drafted')} className="rounded-md border border-line px-2 py-0.5 text-micro font-semibold text-navy hover:bg-ice-soft/50 dark:hover:bg-navy-deep transition-colors">Draft</button>
                          <button onClick={() => onAction(t, 'completed')} className="rounded-md border border-emerald-300 px-2 py-0.5 text-micro font-semibold text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/20 transition-colors">Done</button>
                          <button onClick={() => onAction(t, 'skipped')} className="rounded-md border border-line px-2 py-0.5 text-micro font-semibold text-grey hover:bg-ice-soft/50 dark:hover:bg-navy-deep transition-colors">Skip</button>
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
