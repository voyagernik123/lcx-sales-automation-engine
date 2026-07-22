import { useCallback, useEffect, useState } from 'react';
import { Radar, Plus, Play, Trash2, ChevronDown, ChevronRight, Loader2, Zap } from 'lucide-react';
import {
  listMonitors, createMonitor, updateMonitor, deleteMonitor, monitorActivity, tickMonitors, listActions,
  MONITOR_METRICS, MONITOR_OPS, type Monitor, type RegistryActionInfo,
} from '@/lib/api/monitors';
import { toast } from '@/components/shared/Toast';
import { PageTitle, Button } from '@/components/ui';
import { CardSkeleton, EmptyState } from '@/components/shared';

/**
 * Object Monitors (Phase 3.1) — the standing watch. Define a condition over the
 * token universe and the action it fires; the machine evaluates on every tick
 * and executes through the governed registry. This is where the platform stops
 * being a dashboard and starts acting.
 */
const metricLabel = (k: string) => MONITOR_METRICS.find((m) => m.key === k)?.label ?? k;
const opLabel = (k: string) => MONITOR_OPS.find((o) => o.key === k)?.label ?? k;

export function Monitors() {
  const [monitors, setMonitors] = useState<Monitor[] | null>(null);
  const [actions, setActions] = useState<RegistryActionInfo[]>([]);
  const [creating, setCreating] = useState(false);
  const [ticking, setTicking] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => { listMonitors().then(setMonitors).catch(() => setMonitors([])); }, []);
  useEffect(() => { load(); listActions().then(setActions).catch(() => setActions([])); }, [load]);

  const runTick = async () => {
    setTicking(true);
    try {
      const s = await tickMonitors();
      toast('success', `Evaluated ${s.monitors} monitor${s.monitors === 1 ? '' : 's'} — ${s.fired} new fire${s.fired === 1 ? '' : 's'}`);
      load();
    } catch { toast('error', 'Tick failed'); }
    finally { setTicking(false); }
  };

  const toggle = async (m: Monitor) => { try { await updateMonitor(m.id, { enabled: !m.enabled }); load(); } catch { toast('error', 'Failed'); } };
  const remove = async (id: string) => { try { await deleteMonitor(id); load(); } catch { toast('error', 'Failed'); } };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <PageTitle
        icon={<Radar size={20} />}
        subtitle="Standing watches over the universe. When a condition fires, a governed action runs — notify, queue a task, watchlist, or promote — fully audited."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => void runTick()} disabled={ticking}>
              {ticking ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Run now
            </Button>
            <Button size="sm" onClick={() => setCreating((v) => !v)}><Plus size={12} /> New monitor</Button>
          </div>
        }
      >
        Object Monitors
      </PageTitle>

      {creating && (
        <MonitorBuilder
          actions={actions}
          onCancel={() => setCreating(false)}
          onCreated={() => { setCreating(false); load(); }}
        />
      )}

      {monitors == null ? (
        <CardSkeleton count={3} />
      ) : monitors.length === 0 ? (
        <div className="rounded-lg border border-line bg-card">
          <EmptyState icon={<Radar size={28} className="text-grey" />} title="No monitors yet"
            description="Create a standing watch — e.g. conviction ≥ 60 on unlisted tokens → queue a task." />
        </div>
      ) : (
        <div className="space-y-2">
          {monitors.map((m) => (
            <div key={m.id} className="rounded-lg border border-line bg-card p-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setExpanded(expanded === m.id ? null : m.id)} className="text-grey hover:text-navy">
                  {expanded === m.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <span className="text-body font-bold text-navy">{m.name}</span>
                <span className="rounded bg-ice-soft px-1.5 py-0.5 text-micro font-mono dark:bg-ice-soft/10">
                  {metricLabel(m.condition.metric)} {opLabel(m.condition.op)} {m.condition.threshold}
                </span>
                <span className="inline-flex items-center gap-1 text-micro font-semibold text-cyan-600 dark:text-cyan-400">
                  <Zap size={10} /> {m.action.id}
                </span>
                <span className="ml-auto text-micro text-grey num-tabular">{m.lastMatchCount} match{m.lastMatchCount === 1 ? '' : 'es'}</span>
                <button onClick={() => void toggle(m)} title={m.enabled ? 'Enabled — click to pause' : 'Paused'}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-micro font-bold ${m.enabled ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-line text-grey'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${m.enabled ? 'animate-pulse bg-emerald-500' : 'bg-grey/50'}`} />
                  {m.enabled ? 'Live' : 'Paused'}
                </button>
                <button onClick={() => void remove(m.id)} className="text-grey hover:text-red-500"><Trash2 size={13} /></button>
              </div>
              {expanded === m.id && <MonitorActivity id={m.id} lastRunAt={m.lastRunAt} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MonitorBuilder({ actions, onCancel, onCreated }: { actions: RegistryActionInfo[]; onCancel: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [metric, setMetric] = useState('conviction');
  const [op, setOp] = useState('gte');
  const [threshold, setThreshold] = useState('60');
  const [tier, setTier] = useState('tracked');
  const [actionId, setActionId] = useState('notify');
  const [busy, setBusy] = useState(false);
  const projectActions = actions.filter((a) => a.subjectTypes.includes('project') || a.subjectTypes.includes('*'));

  const save = async () => {
    if (!name.trim() || !Number.isFinite(Number(threshold))) { toast('error', 'Name + numeric threshold required'); return; }
    setBusy(true);
    try {
      await createMonitor({
        name: name.trim(),
        filter: { tier },
        condition: { metric, op, threshold: Number(threshold) },
        action: { id: actionId, params: {} },
      });
      toast('success', 'Monitor created');
      onCreated();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Failed to create'); }
    finally { setBusy(false); }
  };

  const sel = 'rounded border border-line bg-card px-2 py-1 text-label text-navy outline-none focus:border-cyan-500';
  return (
    <div className="rounded-lg border border-cyan-500/30 bg-card p-3 space-y-3">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Monitor name — e.g. Ripe unlisted targets"
        className="w-full rounded border border-line bg-card px-2 py-1.5 text-body font-semibold text-navy outline-none focus:border-cyan-500" />
      <div className="flex flex-wrap items-center gap-2 text-label">
        <span className="text-grey">When</span>
        <select value={metric} onChange={(e) => setMetric(e.target.value)} className={sel}>
          {MONITOR_METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <select value={op} onChange={(e) => setOp(e.target.value)} className={sel}>
          {MONITOR_OPS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <input value={threshold} onChange={(e) => setThreshold(e.target.value)} className={`${sel} w-24 num-tabular`} />
        <span className="text-grey">on</span>
        <select value={tier} onChange={(e) => setTier(e.target.value)} className={sel}>
          <option value="tracked">tracked</option>
          <option value="catalog">catalog</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-label">
        <span className="text-grey">→ then</span>
        <select value={actionId} onChange={(e) => setActionId(e.target.value)} className={sel}>
          {projectActions.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <span className="text-micro text-grey">{projectActions.find((a) => a.id === actionId)?.description}</span>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void save()} disabled={busy}>{busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Create</Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function MonitorActivity({ id, lastRunAt }: { id: string; lastRunAt: string | null }) {
  const [fires, setFires] = useState<Array<{ subjectId: string; name: string | null; ticker: string | null; firedAt: string }> | null>(null);
  useEffect(() => { monitorActivity(id).then(setFires).catch(() => setFires([])); }, [id]);
  return (
    <div className="mt-2 border-t border-line pt-2">
      <div className="mb-1 text-micro text-grey">
        {lastRunAt ? `Last run ${new Date(lastRunAt).toLocaleString()}` : 'Not yet run'} · fired on:
      </div>
      {fires == null ? (
        <Loader2 size={12} className="animate-spin text-grey" />
      ) : fires.length === 0 ? (
        <p className="text-micro text-grey">No fires yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {fires.slice(0, 30).map((f) => (
            <span key={f.subjectId} className="rounded border border-line px-1.5 py-0.5 text-micro text-grey-dark" title={new Date(f.firedAt).toLocaleString()}>
              {f.name ?? f.subjectId.slice(0, 8)}{f.ticker ? ` · ${f.ticker}` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
