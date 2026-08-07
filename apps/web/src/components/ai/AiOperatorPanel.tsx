import { AiProse } from '@/components/ai/AiProse';
import { useState } from 'react';
import { Sparkles, Send, ShieldCheck, Check, ChevronDown, Bot, AlertTriangle } from 'lucide-react';
import {
  askDossier, estimateOutlook, proposeActions, confirmProposal, draftOutreach,
  type DossierAnswer, type ActionProposal,
} from '@/lib/api/aiOperator';
import { toast } from '@/components/shared/Toast';
import { Button } from '@/components/ui';
import { clsx } from 'clsx';

/**
 * AI Operator panel (Phase 5) — grounded Q&A + governed-action proposals on a
 * project, embedded in the inspector where the desk already works. Every answer
 * cites graded evidence; every write is an operator-confirmed registry action.
 * When no ANTHROPIC_API_KEY is set the panel shows the raw graded evidence and
 * deterministic proposals — identical value to Phase 4, just without prose.
 */
const GRADE_TONE = (g: string): string => {
  const r = g[0];
  if (r === 'A' || r === 'B') return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
  if (r === 'C' || r === 'D') return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30';
  return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30';
};

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE PANEL MAY NOT GUESS WHY THE MODEL DID NOT ANSWER.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This surface used to print, on any `usedLlm === false`:
 *
 *     "AI narrative unavailable (no key) — the graded evidence behind this project:"
 *
 * `llm.ts` returned that same false for FOUR unrelated conditions — no provider, a
 * provider error (429, or a 400 on the request shape), an explicit model refusal, and
 * a transport failure. So the sentence above was a FALSE STATEMENT in three cases out
 * of four, and it was the confident kind: someone reading it goes and checks the key,
 * which is fine, and then has nowhere to go. An inference ("usedLlm is false, so
 * probably no key") was being rendered as a certainty.
 *
 * The API now returns a discriminated outcome with a stable code and the rule it
 * cites. This renders THAT, and when the API does not supply one it says so rather
 * than inventing a cause.
 */
type AnswerOutcome = DossierAnswer & {
  status?: string;
  code?: string | null;
  detail?: string;
  rule?: string;
  unbackedCitations?: number;
  looksLikeInjection?: boolean;
};

export function AiOperatorPanel({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState<AnswerOutcome | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [proposals, setProposals] = useState<ActionProposal[] | null>(null);
  const [confirmed, setConfirmed] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState<Set<number>>(new Set());
  const [draft, setDraft] = useState<string | null>(null);

  const ask = async (question: string) => {
    if (!question.trim()) return;
    setBusy('ask'); setAnswer(null);
    try {
      const res = await askDossier(projectId, question.trim());
      setAnswer(res.data); setAiAvailable(res.meta.aiAvailable ?? null);
    } catch { toast('error', 'Dossier query failed'); }
    finally { setBusy(null); }
  };
  const outlook = async () => {
    setBusy('outlook'); setAnswer(null);
    try { const res = await estimateOutlook(projectId); setAnswer(res.data); setAiAvailable(res.meta.aiAvailable ?? null); }
    catch { toast('error', 'Estimate failed'); } finally { setBusy(null); }
  };
  const propose = async () => {
    setBusy('propose'); setProposals(null); setConfirmed(new Set());
    try { const r = await proposeActions(projectId); setProposals(r.proposals); }
    catch { toast('error', 'Propose failed'); } finally { setBusy(null); }
  };
  const confirm = async (p: ActionProposal, i: number) => {
    // Guard against a double-click racing the state update — without this, two
    // rapid clicks fire two invokeActions (a duplicate governed write).
    if (confirming.has(i) || confirmed.has(i)) return;
    setConfirming((s) => new Set(s).add(i));
    try { await confirmProposal(p); setConfirmed((s) => new Set(s).add(i)); toast('success', `Applied: ${p.actionId}`); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Confirm failed'); }
    finally { setConfirming((s) => { const n = new Set(s); n.delete(i); return n; }); }
  };
  const outreach = async () => {
    setBusy('draft'); setDraft(null);
    try { const r = await draftOutreach(projectId); setDraft(r.draft); }
    catch { toast('error', 'Draft failed'); } finally { setBusy(null); }
  };

  return (
    <div className="rounded-lg border border-cyan-500/30 bg-card">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-1.5 px-3 py-2 text-micro font-bold uppercase tracking-wider text-grey">
        <Bot size={13} className="text-cyan-600 dark:text-cyan-400" /> AI Operator
        {aiAvailable === false && <span className="rounded bg-grey/10 px-1 text-[10px] font-semibold normal-case text-grey">evidence-only mode</span>}
        <ChevronDown size={13} className={clsx('ml-auto transition-transform', !open && '-rotate-90')} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-line/60 p-3">
          {/* Ask */}
          <div className="flex gap-1.5">
            <input
              value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void ask(q); }}
              placeholder="Ask the dossier — e.g. why is conviction low?"
              className="min-w-0 flex-1 rounded border border-line bg-card px-2 py-1 text-label text-navy outline-none focus:border-cyan-500"
            />
            <Button size="xs" onClick={() => void ask(q)} disabled={!q.trim() || !!busy}><Send size={11} /></Button>
          </div>
          {/* One request at a time — disabling on any `busy` prevents a slower
              earlier response from overwriting a newer one. */}
          <div className="flex flex-wrap gap-1.5">
            <Button size="xs" variant="secondary" onClick={() => void outlook()} disabled={!!busy}><Sparkles size={11} /> Estimative outlook</Button>
            <Button size="xs" variant="secondary" onClick={() => void propose()} disabled={!!busy}><ShieldCheck size={11} /> Propose actions</Button>
            <Button size="xs" variant="secondary" onClick={() => void outreach()} disabled={!!busy}><Send size={11} /> Draft outreach</Button>
          </div>

          {busy && <p className="text-micro text-grey">Working…</p>}

          {/* Answer */}
          {answer && (
            <div className="rounded border border-line/70 p-2.5">
              {/* The dossier itself tried to talk to the model. Advisory, and above the
                  answer because it changes how the answer should be read. */}
              {answer.looksLikeInjection && (
                <p className="mb-2 flex items-start gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 p-1.5 text-micro text-amber-700 dark:text-amber-300">
                  <AlertTriangle size={12} className="mt-px shrink-0" />
                  <span>
                    A field in this dossier reads like an instruction aimed at the model. It was
                    passed as fenced data, never as instruction — read the answer with that in mind.
                  </span>
                </p>
              )}
              {answer.answer ? (
                <AiProse text={answer.answer} validIds={answer.citations.map((c) => c.id)} />
              ) : (
                <div>
                  <p className="text-label text-grey">
                    {answer.detail
                      ? answer.detail
                      : answer.usedLlm === false
                        ? 'No AI narrative was produced, and this API build did not report why.'
                        : 'No answer.'}
                  </p>
                  {answer.code && (
                    <p className="mt-1 font-mono text-micro font-semibold text-grey">{answer.code}</p>
                  )}
                  {answer.rule && <p className="mt-0.5 text-[10px] italic text-grey">{answer.rule}</p>}
                  {answer.citations.length > 0 && (
                    <p className="mt-1.5 text-micro text-grey">The graded evidence behind this project:</p>
                  )}
                </div>
              )}
              {/* A marker the dossier cannot back is a fabricated attribution, and the
                  count is stated rather than quietly swallowed by the rewrite. */}
              {!!answer.unbackedCitations && answer.unbackedCitations > 0 && (
                <p className="mt-2 flex items-start gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 p-1.5 text-micro text-amber-700 dark:text-amber-300">
                  <AlertTriangle size={12} className="mt-px shrink-0" />
                  <span>
                    {answer.unbackedCitations} citation marker
                    {answer.unbackedCitations === 1 ? '' : 's'} in this answer resolve to no evidence
                    in the dossier. They are shown as unverified, not as sources.
                  </span>
                </p>
              )}
              {answer.citations.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {answer.citations.map((c) => (
                    <span key={c.id} className={clsx('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-micro font-mono', GRADE_TONE(c.grade))}
                      title={`${c.source} · confidence ${c.confidence}%`}>
                      <span className="font-bold">{c.grade}</span> {c.predicate}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-1.5 text-[10px] text-grey">{answer.evidenceCount} graded observations in dossier{answer.usedLlm ? ' · AI-composed' : ''}</p>
            </div>
          )}

          {/* Proposals */}
          {proposals && (
            <div className="space-y-1.5">
              {proposals.length === 0 ? <p className="text-micro text-grey">No proposals.</p> : proposals.map((p, i) => (
                <div key={i} className="rounded border border-line/70 p-2">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-micro font-bold text-cyan-700 dark:text-cyan-300">{p.actionId}</span>
                    <span className="truncate text-label font-semibold text-navy">{String(p.params.title ?? p.params.reason ?? p.params.note ?? '—')}</span>
                    {confirmed.has(i) ? (
                      <span className="ml-auto inline-flex items-center gap-1 text-micro font-semibold text-emerald-600 dark:text-emerald-400"><Check size={12} /> applied</span>
                    ) : (
                      <Button size="xs" className="ml-auto" onClick={() => void confirm(p, i)} disabled={confirming.has(i)}>
                        {confirming.has(i) ? 'Applying…' : 'Confirm'}
                      </Button>
                    )}
                  </div>
                  <p className="mt-0.5 text-micro text-grey">{p.rationale} <span className="opacity-60">· {p.source}</span></p>
                </div>
              ))}
              <p className="text-[10px] text-grey">Every confirm runs through the governed action registry, logged as actor=ai with your sign-off.</p>
            </div>
          )}

          {/* Outreach draft */}
          {draft && (
            <div className="rounded border border-line/70 p-2.5">
              <div className="mb-1 flex items-center gap-1.5">
                <span className="text-micro font-bold uppercase tracking-wider text-grey">Outreach draft</span>
                <Button size="xs" variant="secondary" className="ml-auto" onClick={() => { void navigator.clipboard?.writeText(draft); toast('success', 'Copied'); }}>Copy</Button>
              </div>
              {/* `validIds={[]}` — "this surface can back nothing", and it is the truth
                  rather than a precaution. `draftOutreach` returns no citation set at
                  all, yet it is built by the same `renderContext` whose footer tells the
                  model to cite evidence ids in double brackets. Without this prop any
                  `[[id]]` the model carried into an outreach EMAIL rendered as
                  `<sup title="source: …">` on a panel with no source list behind it —
                  the F2 defect, on the one AiProse call site that can never resolve an
                  id. `markUnbackedCitations` does not run on this path either. */}
              <AiProse text={draft} validIds={[]} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
