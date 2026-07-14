import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListChecks, Check, X, Plus, RefreshCw } from 'lucide-react';
import { fetchTasks, createTask, completeTask, dismissTask, type OperatorTask } from '@/lib/api/bd';
import { toast } from '@/components/shared/Toast';
import { TableSkeleton, EmptyState } from '@/components/shared';
import { PageTitle, Button } from '@/components/ui';

const KIND_LABEL: Record<string, string> = {
  manual: 'manual',
  auto_stage: 'deal stage',
  auto_handoff: 'reply',
  auto_stalled: 'stalled',
};

function bucketOf(t: OperatorTask): 'overdue' | 'today' | 'later' | 'someday' {
  if (!t.dueAt) return 'someday';
  const due = new Date(t.dueAt);
  const now = new Date();
  if (due < now && due.toDateString() !== now.toDateString()) return 'overdue';
  if (due.toDateString() === now.toDateString()) return 'today';
  return 'later';
}

export function MyTasks() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<OperatorTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newTitle, setNewTitle] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setTasks(await fetchTasks());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const buckets = useMemo(() => {
    const map: Record<string, OperatorTask[]> = { overdue: [], today: [], later: [], someday: [] };
    for (const t of tasks) map[bucketOf(t)].push(t);
    return map;
  }, [tasks]);

  const act = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      toast('success', ok);
      void load();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed');
    }
  };

  const addTask = async () => {
    if (!newTitle.trim()) return;
    await act(() => createTask(newTitle.trim()), 'Task added');
    setNewTitle('');
  };

  const Row = ({ t }: { t: OperatorTask }) => (
    <div className="flex items-start gap-2 rounded-lg border border-line bg-white dark:bg-slate-900/40 p-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{t.title}</span>
          <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-micro font-bold uppercase text-grey">{KIND_LABEL[t.kind] ?? t.kind}</span>
        </div>
        {t.detail && <p className="text-xs text-grey mt-0.5">{t.detail}</p>}
        <div className="mt-1 flex items-center gap-2 text-xs text-grey">
          {t.projectName && (
            <button onClick={() => t.projectId && navigate(`/bd-pipeline/${t.projectId}`)} className="font-semibold text-cyan-600 hover:underline">
              {t.projectName}
            </button>
          )}
          {t.dueAt && <span>due {new Date(t.dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
        </div>
      </div>
      <button
        onClick={() => void act(() => completeTask(t.id), 'Done')}
        className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-xs font-bold text-white hover:bg-emerald-700"
      >
        <Check size={12} /> Done
      </button>
      <Button variant="secondary" size="xs" aria-label="Dismiss task" onClick={() => void act(() => dismissTask(t.id), 'Dismissed')}>
        <X size={12} />
      </Button>
    </div>
  );

  const Bucket = ({ name, label, tone }: { name: keyof typeof buckets; label: string; tone: string }) =>
    buckets[name].length === 0 ? null : (
      <div className="space-y-2">
        <h2 className={`text-xs font-bold uppercase tracking-wider ${tone}`}>
          {label} ({buckets[name].length})
        </h2>
        {buckets[name].map((t) => <Row key={t.id} t={t} />)}
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <PageTitle
        icon={<ListChecks size={20} />}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshCw size={12} /> Refresh
          </Button>
        }
      >
        My Tasks
      </PageTitle>

      <div className="flex gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void addTask()}
          placeholder="Add a task…"
          className="flex-1 rounded-lg border border-line px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <button onClick={() => void addTask()} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-label font-bold text-white hover:bg-indigo-700">
          <Plus size={12} /> Add
        </button>
      </div>

      {loading && <TableSkeleton rows={6} cols={4} />}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
      {!loading && !error && tasks.length === 0 && (
        <EmptyState
          variant="done"
          title="Nothing to do"
          description="Tasks appear automatically when deals advance, replies arrive, or deals stall."
        />
      )}

      <Bucket name="overdue" label="Overdue" tone="text-red-600" />
      <Bucket name="today" label="Today" tone="text-amber-600" />
      <Bucket name="later" label="Coming up" tone="text-slate-500" />
      <Bucket name="someday" label="No due date" tone="text-slate-400" />
    </div>
  );
}
