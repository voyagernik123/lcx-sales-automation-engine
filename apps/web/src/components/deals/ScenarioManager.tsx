import { useEffect, useState } from 'react';
import { Bookmark, Trash2, Check, Plus } from 'lucide-react';
import { listScenarios, saveScenario, deleteScenario, type SavedScenario } from '@/lib/api/planning';
import { useSalesScenarioStore, useScenarioActive, type SalesScenario } from '@/stores/useSalesScenarioStore';
import { toast } from '@/components/shared/Toast';
import { Button } from '@/components/ui';

/**
 * Named scenarios (Phase 3.3) — save the current what-if dials as a shared,
 * reloadable object, so the desk can fork and compare instead of living with
 * one ephemeral local set. Loading applies the deltas to the live scenario
 * store, reflowing every surface that prices or forecasts.
 */
function fmt(d: SalesScenario): string {
  const parts: string[] = [];
  if (d.closeRateDelta) parts.push(`close ${d.closeRateDelta > 0 ? '+' : ''}${Math.round(d.closeRateDelta * 100)}%`);
  if (d.valueDelta) parts.push(`value ${d.valueDelta > 0 ? '+' : ''}${Math.round(d.valueDelta * 100)}%`);
  if (d.timelineShiftDays) parts.push(`${d.timelineShiftDays > 0 ? '+' : ''}${d.timelineShiftDays}d`);
  return parts.length ? parts.join(' · ') : 'baseline';
}

export function ScenarioManager() {
  const active = useScenarioActive();
  const closeRateDelta = useSalesScenarioStore((s) => s.closeRateDelta);
  const valueDelta = useSalesScenarioStore((s) => s.valueDelta);
  const timelineShiftDays = useSalesScenarioStore((s) => s.timelineShiftDays);
  const setDial = useSalesScenarioStore((s) => s.setDial);
  const [saved, setSaved] = useState<SavedScenario[] | null>(null);
  const [name, setName] = useState('');
  const current: SalesScenario = { closeRateDelta, valueDelta, timelineShiftDays };

  const load = () => { listScenarios().then(setSaved).catch(() => setSaved([])); };
  useEffect(() => { load(); }, []);

  const doSave = async () => {
    if (!name.trim()) return;
    try { await saveScenario(name.trim(), current); setName(''); load(); toast('success', `Saved scenario "${name.trim()}"`); }
    catch { toast('error', 'Failed to save'); }
  };
  const apply = (s: SavedScenario) => {
    setDial('closeRateDelta', s.deltas.closeRateDelta ?? 0);
    setDial('valueDelta', s.deltas.valueDelta ?? 0);
    setDial('timelineShiftDays', s.deltas.timelineShiftDays ?? 0);
    toast('info', `Loaded "${s.name}"`);
  };
  const remove = async (id: string) => { try { await deleteScenario(id); load(); } catch { toast('error', 'Failed'); } };

  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Bookmark size={13} className="text-cyan-600 dark:text-cyan-400" />
        <h3 className="text-micro font-bold uppercase tracking-wider text-grey">Saved scenarios</h3>
        <span className="ml-auto text-micro text-grey">current: {fmt(current)}</span>
      </div>
      <div className="mb-2 flex gap-1.5">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void doSave(); }}
          placeholder={active ? 'Name this scenario…' : 'Adjust a dial, then name it…'}
          className="min-w-0 flex-1 rounded border border-line bg-card px-2 py-1 text-label text-navy outline-none focus:border-cyan-500" />
        <Button size="xs" onClick={() => void doSave()} disabled={!name.trim()}><Plus size={11} /> Save</Button>
      </div>
      <div className="space-y-1">
        {saved == null ? null : saved.length === 0 ? (
          <p className="py-1 text-micro text-grey">No saved scenarios yet.</p>
        ) : saved.map((s) => {
          const isCurrent = fmt(s.deltas) === fmt(current);
          return (
            <div key={s.id} className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-ice-soft dark:hover:bg-ice-soft/10">
              <button onClick={() => apply(s)} className="min-w-0 flex-1 text-left">
                <span className="text-label font-semibold text-navy">{s.name}</span>
                <span className="ml-2 text-micro text-grey">{fmt(s.deltas)}</span>
              </button>
              {isCurrent && <Check size={12} className="shrink-0 text-emerald-600" />}
              <span className="shrink-0 text-micro text-grey">{s.owner}</span>
              <button onClick={() => void remove(s.id)} className="shrink-0 text-grey hover:text-red-500"><Trash2 size={11} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
