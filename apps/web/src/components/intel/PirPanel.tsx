import { useEffect, useState } from 'react';
import { Crosshair, Plus, Trash2 } from 'lucide-react';
import { listPirs, savePir, deletePir, type Pir } from '@/lib/api/planning';
import { toast } from '@/components/shared/Toast';
import { Button } from '@/components/ui';

/**
 * PIRs (Phase 3.4) — Priority Intelligence Requirements. The named questions
 * that justify collection, so every sensor serves a stated requirement rather
 * than running blind. Each PIR links the collection sources that answer it;
 * their live freshness (from Ops) shows whether the requirement is actually
 * being met. CIA collection management, on the free-data stack.
 */
const PRIORITY_LABEL: Record<number, string> = { 1: 'P1 · critical', 2: 'P2 · high', 3: 'P3 · standard', 4: 'P4 · low', 5: 'P5 · backlog' };
const HEALTH_DOT: Record<string, string> = { ok: 'bg-emerald-500', degraded: 'bg-amber-500', stale: 'bg-orange-500', down: 'bg-red-500' };

export function PirPanel({ sources }: { sources: Array<{ source: string; health: string }> }) {
  const [pirs, setPirs] = useState<Pir[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [question, setQuestion] = useState('');
  const [priority, setPriority] = useState(3);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const load = () => { listPirs().then(setPirs).catch(() => setPirs([])); };
  useEffect(() => { load(); }, []);

  const healthOf = (src: string) => sources.find((s) => s.source === src)?.health;

  const doSave = async () => {
    if (!name.trim()) return;
    try {
      await savePir({ name: name.trim(), question: question.trim(), sources: [...picked], priority });
      setName(''); setQuestion(''); setPicked(new Set()); setPriority(3); setAdding(false);
      load(); toast('success', 'PIR added');
    } catch { toast('error', 'Failed to save PIR'); }
  };
  const remove = async (id: string) => { try { await deletePir(id); load(); } catch { toast('error', 'Failed'); } };

  return (
    <div className="rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
        <Crosshair size={12} /> Collection vs. requirements (PIRs)
        <Button size="xs" variant="secondary" className="ml-auto" onClick={() => setAdding((v) => !v)}><Plus size={11} /> New PIR</Button>
      </div>

      {adding && (
        <div className="mb-3 space-y-2 rounded border border-cyan-500/30 p-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Requirement name — e.g. Q3 listing-ready targets"
            className="w-full rounded border border-line bg-card px-2 py-1 text-label font-semibold text-navy outline-none focus:border-cyan-500" />
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="The question this answers…"
            className="w-full rounded border border-line bg-card px-2 py-1 text-label text-navy outline-none focus:border-cyan-500" />
          <div className="flex items-center gap-2 text-micro">
            <span className="text-grey">Priority</span>
            <select value={priority} onChange={(e) => setPriority(Number(e.target.value))} className="rounded border border-line bg-card px-1.5 py-1 text-label text-navy">
              {[1, 2, 3, 4, 5].map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </div>
          <div>
            <div className="mb-1 text-micro text-grey">Collection sources that serve it:</div>
            <div className="flex flex-wrap gap-1">
              {sources.map((s) => (
                <button key={s.source} onClick={() => setPicked((prev) => { const n = new Set(prev); n.has(s.source) ? n.delete(s.source) : n.add(s.source); return n; })}
                  className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-micro font-mono ${picked.has(s.source) ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' : 'border-line text-grey'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${HEALTH_DOT[s.health] ?? 'bg-grey'}`} />{s.source}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2"><Button size="xs" onClick={() => void doSave()} disabled={!name.trim()}>Save PIR</Button><Button size="xs" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button></div>
        </div>
      )}

      {pirs == null ? null : pirs.length === 0 ? (
        <p className="py-2 text-label text-grey">No requirements yet — name what the desk needs to know, and link the sensors that answer it.</p>
      ) : (
        <div className="space-y-2">
          {pirs.map((p) => (
            <div key={p.id} className="rounded border border-line/70 p-2">
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-ice-soft px-1.5 py-0.5 text-micro font-bold text-grey-dark dark:bg-ice-soft/10">{PRIORITY_LABEL[p.priority] ?? `P${p.priority}`}</span>
                <span className="text-label font-bold text-navy">{p.name}</span>
                <button onClick={() => void remove(p.id)} className="ml-auto text-grey hover:text-red-500"><Trash2 size={12} /></button>
              </div>
              {p.question && <p className="mt-0.5 text-micro text-grey">{p.question}</p>}
              <div className="mt-1.5 flex flex-wrap gap-1">
                {p.sources.length === 0 ? (
                  <span className="text-micro text-amber-600 dark:text-amber-400">⚠ no sources linked — this requirement is uncovered</span>
                ) : p.sources.map((src) => {
                  const h = healthOf(src);
                  return (
                    <span key={src} className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-micro font-mono text-grey-dark" title={h ? `freshness: ${h}` : 'not a live collection source'}>
                      <span className={`h-1.5 w-1.5 rounded-full ${h ? HEALTH_DOT[h] ?? 'bg-grey' : 'bg-grey/40'}`} />{src}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
