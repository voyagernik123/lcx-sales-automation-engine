import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListChecks, Check, X, Plus, RefreshCw } from 'lucide-react';
import { fetchTasks, createTask, completeTask, dismissTask, type OperatorTask } from '@/lib/api/bd';
import { toast } from '@/components/shared/Toast';

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
    <div className="flex items-start gap-2 rounded border border-line bg-white dark:bg-slate-900/40 p-2.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold">{t.title}</span>
          <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[8px] font-bold uppercase text-grey">{KIND_LABEL[t.kind] ?? t.kind}</span>
        </div>
        {t.detail && <p className="text-[10px] text-grey mt-0.5">{t.detail}</p>}
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-grey">
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
        className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-700"
      >
        <Check size={10} /> Done
      </button>
      <button
        onClick={() => void act(() => dismissTask(t.id), 'Dismissed')}
        className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[10px] font-bold hover:bg-ice-soft dark:hover:bg-ice-soft/10"
      >
        <X size={10} />
      </button>
    </div>
  );

  const Bucket = ({ name, label, tone }: { name: keyof typeof buckets; label: string; tone: string }) =>
    buckets[name].length === 0 ? null : (
      <div className="space-y-1.5">
        <h2 className={`text-[10px] font-bold uppercase tracking-wider ${tone}`}>
          {label} ({buckets[name].length})
        </h2>
        {buckets[name].map((t) => <Row key={t.id} t={t} />)}
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <ListChecks size={18} /> My Tasks
        </h1>
        <button onClick={() => void load()} className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] font-semibold hover:bg-ice-soft dark:hover:bg-ice-soft/10">
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      <div className="flex gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void addTask()}
          placeholder="Add a task…"
          className="flex-1 rounded border border-line px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <button onClick={() => void addTask()} className="inline-flex items-center gap-1 rounded bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700">
          <Plus size={12} /> Add
        </button>
      </div>

      {loading && <p className="py-8 text-center text-[12px] text-grey">Loading…</p>}
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{error}</div>}
      {!loading && !error && tasks.length === 0 && (
        <div className="rounded-lg border border-dashed border-line p-8 text-center text-[12px] text-grey">
          Nothing to do — tasks appear automatically when deals advance, replies arrive, or deals stall.
        </div>
      )}

      <Bucket name="overdue" label="Overdue" tone="text-red-600" />
      <Bucket name="today" label="Today" tone="text-amber-600" />
      <Bucket name="later" label="Coming up" tone="text-slate-500" />
      <Bucket name="someday" label="No due date" tone="text-slate-400" />
    </div>
  );
}
