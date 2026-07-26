import { AiProse } from '@/components/ai/AiProse';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui';
import { askDistribution, type DistAskAnswer } from '@/lib/api/distribution';

/**
 * Ask-the-Distribution (LCX ONE Phase 7) — cited Q&A over the ontology. Runs
 * at $0 on the deterministic fallback; with an AI key, synthesizes a cited
 * answer. Display-only — the AI never files.
 */
export function AskDistribution() {
  const [q, setQ] = useState('');
  const [ans, setAns] = useState<DistAskAnswer | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    if (q.trim().length < 3) return;
    setBusy(true);
    try { setAns(await askDistribution(q.trim())); }
    catch { setAns({ answer: 'Ask failed — try again.', usedLlm: false }); }
    finally { setBusy(false); }
  };

  return (
    <section className="rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="mb-2 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
        <Sparkles size={12} /> Ask the distribution strategist
      </div>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void ask(); }}
          placeholder="e.g. which rail should PayAgent adopt first, and why?"
          className="min-w-0 flex-1 rounded border border-line bg-page px-2.5 py-1.5 text-label text-navy outline-none focus:border-cyan-500"
        />
        <Button size="xs" disabled={busy || q.trim().length < 3} onClick={() => void ask()}>{busy ? 'Thinking…' : 'Ask'}</Button>
      </div>
      {ans && (
        <div className="mt-2 rounded border border-line bg-page p-2.5">
          <AiProse text={ans.answer} />
          {ans.citations && ans.citations.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {ans.citations.map((c) => (
                c.url
                  ? <a key={c.id} href={c.url} target="_blank" rel="noreferrer" className="rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-px font-mono text-[10px] text-cyan-700 hover:underline dark:text-cyan-300">{c.label}</a>
                  : <span key={c.id} className="rounded border border-line px-1.5 py-px font-mono text-[10px] text-grey">{c.label}</span>
              ))}
            </div>
          )}
          {!ans.usedLlm && <p className="mt-1 text-[10px] text-grey">Deterministic answer — set an AI key for a synthesized, cited response.</p>}
        </div>
      )}
    </section>
  );
}
