import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Siren, ListChecks, GitPullRequestArrow, LayoutGrid } from 'lucide-react';
import { fetchMyDesk, type MyDesk as MyDeskData } from '@/lib/api/desk';
import { formatMoney } from '@/lib/format';
import { clsx } from 'clsx';

/**
 * MY DESK (Phase 4.4) — the operator's own lanes on the home brief: the deals I
 * own, my monitors' recent fires, my open commitments, and the decisions
 * waiting on my review. Ownership finally gives the five-person desk lanes; this
 * is where each person sees theirs. Every row opens the surface that acts on it.
 */
export function MyDesk({ ownerName }: { ownerName: string }) {
  const navigate = useNavigate();
  const [desk, setDesk] = useState<MyDeskData | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { fetchMyDesk().then(setDesk).catch(() => setErr(true)); }, []);

  if (err) return null;
  const total = desk ? desk.deals.length + desk.monitorFires.length + desk.commitments.length + desk.decisions.length : 0;

  return (
    <div className="mb-6 rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-1.5">
        <LayoutGrid size={14} className="text-cyan-600 dark:text-cyan-400" />
        <h2 className="text-label font-bold text-navy">My desk</h2>
        <span className="text-micro text-grey">— {ownerName}'s lanes</span>
        {desk && total === 0 && <span className="ml-auto text-micro text-grey">nothing assigned to you yet</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Lane icon={<Briefcase size={12} />} title="My deals" count={desk?.deals.length} onAll={() => navigate('/deal-board')}>
          {desk?.deals.slice(0, 5).map((d) => (
            <Row key={d.id} onClick={() => navigate('/deal-board')}
              main={`${d.projectName}${d.ticker ? ` (${d.ticker})` : ''}`}
              sub={`${d.stage.replace(/_/g, ' ')}${d.packageValue ? ` · ${formatMoney(d.packageValue / 100)}` : ''}`}
              flag={d.daysSinceUpdate > 7 ? `${d.daysSinceUpdate}d` : undefined} />
          ))}
        </Lane>
        <Lane icon={<Siren size={12} />} title="Monitor fires" count={desk?.monitorFires.length} onAll={() => navigate('/monitors')}>
          {desk?.monitorFires.slice(0, 5).map((f, i) => (
            <Row key={`${f.monitorId}-${f.subjectId}-${i}`} onClick={() => navigate('/monitors')}
              main={f.name} sub={new Date(f.firedAt).toLocaleDateString()} />
          ))}
        </Lane>
        <Lane icon={<ListChecks size={12} />} title="Commitments" count={desk?.commitments.length} onAll={() => navigate('/tasks')}>
          {desk?.commitments.slice(0, 5).map((t) => (
            <Row key={t.id} onClick={() => navigate('/tasks')}
              main={t.title} sub={t.projectName ?? ''}
              flag={t.overdue ? 'overdue' : undefined} flagTone="bad" />
          ))}
        </Lane>
        <Lane icon={<GitPullRequestArrow size={12} />} title="Reviews due" count={desk?.decisions.length} onAll={() => navigate('/decisions')}>
          {desk?.decisions.slice(0, 5).map((d) => (
            <Row key={d.id} onClick={() => navigate('/decisions')}
              main={d.title} sub={d.reviewBy ? `review ${d.reviewBy}` : ''} flag="due" flagTone="warn" />
          ))}
        </Lane>
      </div>
    </div>
  );
}

function Lane({ icon, title, count, onAll, children }: { icon: React.ReactNode; title: string; count: number | undefined; onAll: () => void; children: React.ReactNode }) {
  const kids = Array.isArray(children) ? children.filter(Boolean) : children;
  const empty = count === 0;
  return (
    <div className="rounded border border-line/70 p-2.5">
      <button onClick={onAll} className="mb-1.5 flex w-full items-center gap-1 text-micro font-bold uppercase tracking-wider text-grey hover:text-navy">
        {icon} {title}
        {count != null && <span className="ml-auto rounded bg-ice-soft px-1 font-mono text-[10px] text-grey-dark dark:bg-ice-soft/10">{count}</span>}
      </button>
      {count == null ? (
        <p className="py-1 text-micro text-grey">…</p>
      ) : empty ? (
        <p className="py-1 text-micro text-grey">Clear</p>
      ) : (
        <div className="space-y-1">{kids}</div>
      )}
    </div>
  );
}

function Row({ main, sub, flag, flagTone = 'muted', onClick }: { main: string; sub?: string; flag?: string; flagTone?: 'muted' | 'warn' | 'bad'; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-ice-soft/60 dark:hover:bg-ice-soft/10">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-label font-medium text-navy">{main}</span>
        {sub && <span className="block truncate text-micro text-grey">{sub}</span>}
      </span>
      {flag && (
        <span className={clsx('shrink-0 rounded px-1 font-mono text-[10px] font-bold',
          flagTone === 'bad' ? 'bg-red-500/10 text-red-600 dark:text-red-400'
          : flagTone === 'warn' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
          : 'bg-ice-soft text-grey dark:bg-ice-soft/10')}>
          {flag}
        </span>
      )}
    </button>
  );
}
