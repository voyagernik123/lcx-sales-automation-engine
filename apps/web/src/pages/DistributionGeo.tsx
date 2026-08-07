import { AiProse } from '@/components/ai/AiProse';
import { useCallback, useEffect, useState } from 'react';
import { Search, Users, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { PageTitle, Button } from '@/components/ui';
import { CardSkeleton, ErrorNotice } from '@/components/shared';
import { toast } from '@/components/shared/Toast';
import { fetchDistributionDeep, draftGeoContent, type DistributionDeep } from '@/lib/api/distribution';

const PRIORITY_TONE: Record<string, string> = {
  high: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  low: 'border-line bg-page text-grey',
};

/**
 * GEO Console + Persona Fleet (LCX ONE Phase 5). The answer-engine question
 * inventory (the queries to win) and the KOL persona roster. Read surfaces for
 * now — the AI content drafter + per-engine answer tracking land in Phase 7.
 */
export function DistributionGeo() {
  const [deep, setDeep] = useState<DistributionDeep | null>(null);
  // `validIds` carries the citation set the SERVER resolved for this draft. It was being
  // thrown away here — `draftGeoContent` returns `citations`, and this state shape simply
  // did not have a field for it — so every `[[id]]` the model emitted rendered as a source
  // marker whether or not anything backed it. `?? []` is not a default standing in for a
  // missing figure: a response with no citation set can back NOTHING, and [] says exactly
  // that. It is the difference between "unverified" and a fabricated attribution.
  const [draft, setDraft] = useState<{ query: string; text: string; usedLlm: boolean; validIds: string[] } | null>(null);
  const [drafting, setDrafting] = useState<string | null>(null);
  // `deep === null` is the LOADING sentinel, so the failure has to land somewhere
  // else: catching into setDeep(null) left the skeleton pulsing forever.
  const [err, setErr] = useState<unknown>(null);

  const load = useCallback(() => {
    setErr(null);
    fetchDistributionDeep().then(setDeep).catch(setErr);
  }, []);
  useEffect(() => { load(); }, [load]);

  const genDraft = async (id: string, query: string) => {
    setDrafting(id);
    try {
      const r = await draftGeoContent(query);
      setDraft({ query, text: r.draft, usedLlm: r.usedLlm, validIds: (r.citations ?? []).map((c) => c.id) });
    } catch { toast('error', 'Draft failed'); }
    finally { setDrafting(null); }
  };

  return (
    <div className="p-5">
      <PageTitle icon={<Search size={20} />} subtitle="Win the AI-answer queries; run the KOL persona fleet">
        GEO & Personas
      </PageTitle>

      {err ? (
        <ErrorNotice error={err} onRetry={load} />
      ) : !deep ? (
        <div className="mt-4"><CardSkeleton /></div>
      ) : (
        <>
          <section className="mt-4">
            <div className="mb-2 text-micro font-bold uppercase tracking-wider text-grey">Answer-engine question inventory — the queries to win</div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {deep.reference.geoQuestions.map((q) => (
                <div key={q.id} className="flex items-center gap-2 rounded-lg border border-line bg-card p-2.5 shadow-card">
                  <span className="min-w-0 flex-1">
                    <span className="block text-label text-navy">“{q.query}”</span>
                    <span className="font-mono text-[10px] text-grey">{q.intent}</span>
                  </span>
                  <span className={clsx('rounded border px-1.5 py-px font-mono text-[10px] font-semibold uppercase', PRIORITY_TONE[q.priority])}>{q.priority}</span>
                  <Button size="xs" variant="secondary" disabled={drafting === q.id} onClick={() => void genDraft(q.id, q.query)}>
                    <Sparkles size={11} /> {drafting === q.id ? '…' : 'Draft'}
                  </Button>
                </div>
              ))}
            </div>
            {draft && (
              <div className="mt-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
                <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-grey">Draft for “{draft.query}”</div>
                <AiProse text={draft.text} validIds={draft.validIds} />
                <p className="mt-1 text-[10px] text-grey">{draft.usedLlm ? 'AI-drafted — review, then publish through your content workflow. AI never publishes.' : 'Deterministic draft — no AI answer was produced; this engine does not report the cause.'}</p>
              </div>
            )}
            <p className="mt-2 text-micro text-grey">Per-engine (ChatGPT/Claude/Perplexity/Gemini) answer-share tracking lands as keys are provisioned.</p>
          </section>

          <section className="mt-5">
            <div className="mb-2 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey"><Users size={12} /> KOL persona fleet</div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {deep.reference.personas.map((p) => (
                <div key={p.id} className="rounded-lg border border-line bg-card p-3 shadow-card">
                  <h3 className="text-label font-bold text-navy">{p.name}</h3>
                  <p className="mt-0.5 font-mono text-[10px] text-grey">{p.channel} · {p.cadence}</p>
                  <p className="mt-1 text-micro text-grey-dark">{p.beat}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-micro text-grey">Surfaces only — the persona post-drafter (policy-checked before a human sees it) lands in Phase 7.</p>
          </section>
        </>
      )}
    </div>
  );
}
