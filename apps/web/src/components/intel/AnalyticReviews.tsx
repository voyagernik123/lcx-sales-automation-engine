import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, Skull, Swords, Plus, Trash2, Check, X, Loader2, Bot } from 'lucide-react';
import {
  listReviews, suggestReview, createReview, updateReview, deleteReview,
  type AnalyticReview, type ReviewKind,
} from '@/lib/api/reviews';
import { toast } from '@/components/shared/Toast';
import { Button } from '@/components/ui';

/**
 * Analytic reviews (Phase 2.3) — human structured analytic techniques on a deal
 * or project. Key Assumptions Check, Premortem, Devil's Advocate. Each opens
 * from a "suggest" prefill (removes the blank page), edits in a generic
 * structured editor, and is owned by its author. The premortem here is what
 * satisfies the >$25k deal gate.
 */

const KIND_META: Record<ReviewKind, { label: string; Icon: typeof ClipboardCheck; blurb: string }> = {
  key_assumptions: { label: 'Key Assumptions', Icon: ClipboardCheck, blurb: 'What must be true for this to work?' },
  premortem: { label: 'Premortem', Icon: Skull, blurb: "It's 6 months on and this failed — why?" },
  devils_advocate: { label: "Devil's Advocate", Icon: Swords, blurb: 'The strongest case against.' },
};

type Content = Record<string, unknown>;

export function AnalyticReviews({ subjectType, subjectId }: { subjectType: 'deal' | 'project' | 'command_decision'; subjectId: string }) {
  const [reviews, setReviews] = useState<AnalyticReview[] | null>(null);
  const [draft, setDraft] = useState<{ kind: ReviewKind; title: string; content: Content; id?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listReviews(subjectType, subjectId).then(setReviews).catch(() => setReviews([]));
  }, [subjectType, subjectId]);
  useEffect(() => { load(); }, [load]);

  const startNew = async (kind: ReviewKind) => {
    setBusy(true);
    try {
      const s = await suggestReview(kind, subjectType, subjectId);
      setDraft({ kind, title: s.title, content: s.content as Content });
    } catch {
      setDraft({ kind, title: KIND_META[kind].label, content: {} });
    } finally { setBusy(false); }
  };

  const edit = (r: AnalyticReview) => setDraft({ kind: r.kind, title: r.title, content: (r.content ?? {}) as Content, id: r.id });

  // SAT copilot (Phase 5.3) — re-draft the open review with the LLM, grounded in
  // the project's evidence. The analyst still edits and files; AI never saves.
  const aiDraft = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const s = await suggestReview(draft.kind, subjectType, subjectId, true);
      setDraft({ ...draft, title: s.title, content: s.content as Content });
      toast('success', 'AI draft ready — review and edit before saving');
    } catch { toast('error', 'AI draft failed'); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      if (draft.id) await updateReview(draft.id, { title: draft.title, content: draft.content });
      else await createReview({ kind: draft.kind, subjectType, subjectId, title: draft.title, content: draft.content });
      setDraft(null);
      load();
      toast('success', 'Review saved');
    } catch {
      toast('error', 'Failed to save review');
    } finally { setBusy(false); }
  };

  const resolve = async (r: AnalyticReview) => {
    try { await updateReview(r.id, { status: r.status === 'resolved' ? 'active' : 'resolved' }); load(); }
    catch { toast('error', 'Failed to update'); }
  };
  const remove = async (id: string) => { try { await deleteReview(id); load(); } catch { toast('error', 'Failed to delete'); } };

  return (
    <section className="rounded-lg border border-line bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-micro font-bold uppercase tracking-wider text-grey">Analytic Reviews</h3>
        {!draft && (
          <div className="flex gap-1">
            {(Object.keys(KIND_META) as ReviewKind[]).map((k) => {
              const { Icon, label } = KIND_META[k];
              return (
                <button key={k} onClick={() => void startNew(k)} disabled={busy} title={KIND_META[k].blurb}
                  className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-1 text-micro font-semibold text-grey-dark hover:border-cyan-500/50 hover:text-navy transition-colors">
                  <Icon size={11} /> {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {draft ? (
        <>
          <div className="mb-2 flex justify-end">
            <button onClick={() => void aiDraft()} disabled={busy}
              className="inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/5 px-1.5 py-1 text-micro font-semibold text-cyan-700 hover:bg-cyan-500/10 disabled:opacity-50 dark:text-cyan-300">
              <Bot size={11} /> Draft with AI
            </button>
          </div>
          <ReviewEditor
            draft={draft}
            onChange={(content, title) => setDraft({ ...draft, content, title: title ?? draft.title })}
            onSave={() => void save()}
            onCancel={() => setDraft(null)}
            busy={busy}
          />
        </>
      ) : reviews == null ? (
        <div className="py-3 text-center text-micro text-grey"><Loader2 size={13} className="inline animate-spin motion-essential" /></div>
      ) : reviews.length === 0 ? (
        <p className="py-2 text-micro text-grey">No reviews yet. Run a structured technique before you commit.</p>
      ) : (
        <ul className="space-y-2">
          {reviews.map((r) => {
            const { Icon, label } = KIND_META[r.kind];
            return (
              <li key={r.id} className="rounded border border-line/70 p-2">
                <div className="flex items-center gap-1.5">
                  <Icon size={12} className="text-cyan-600 dark:text-cyan-400" />
                  <span className="text-label font-bold text-navy">{r.title || label}</span>
                  {r.status === 'resolved' && <span className="rounded bg-emerald-500/15 px-1 text-micro font-bold text-emerald-700 dark:text-emerald-300">resolved</span>}
                  <span className="ml-auto text-micro text-grey">{r.author}</span>
                </div>
                <ReviewSummary content={(r.content ?? {}) as Content} />
                <div className="mt-1.5 flex gap-2">
                  <button onClick={() => edit(r)} className="text-micro font-semibold text-grey hover:text-navy">Edit</button>
                  <button onClick={() => void resolve(r)} className="text-micro font-semibold text-grey hover:text-navy">{r.status === 'resolved' ? 'Reopen' : 'Resolve'}</button>
                  <button onClick={() => void remove(r.id)} className="ml-auto text-micro font-semibold text-grey hover:text-red-500">Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ── generic structured editor: strings → textarea, object-arrays → rows ── */

function ReviewEditor({ draft, onChange, onSave, onCancel, busy }: {
  draft: { kind: ReviewKind; title: string; content: Content };
  onChange: (content: Content, title?: string) => void;
  onSave: () => void; onCancel: () => void; busy: boolean;
}) {
  const { content } = draft;
  const setField = (key: string, value: unknown) => onChange({ ...content, [key]: value });

  return (
    <div className="space-y-2">
      <input
        value={draft.title}
        onChange={(e) => onChange(content, e.target.value)}
        className="w-full rounded border border-line bg-card px-2 py-1 text-label font-semibold text-navy outline-none focus:border-cyan-500"
      />
      {Object.entries(content).map(([key, value]) => {
        if (Array.isArray(value)) {
          const rows = value as Array<Record<string, unknown>>;
          const keys = rows[0] && typeof rows[0] === 'object' ? Object.keys(rows[0]) : ['text'];
          return (
            <div key={key}>
              <div className="mb-1 text-micro font-bold uppercase tracking-wide text-grey">{labelize(key)}</div>
              <div className="space-y-1.5">
                {rows.map((row, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-1 rounded border border-line/60 p-1.5">
                    {keys.map((rk) => {
                      const v = row[rk];
                      if (typeof v === 'boolean') {
                        return (
                          <label key={rk} className="flex items-center gap-1 text-micro text-grey">
                            <input type="checkbox" checked={v} onChange={(e) => {
                              const next = rows.slice(); next[i] = { ...row, [rk]: e.target.checked }; setField(key, next);
                            }} />
                            {labelize(rk)}
                          </label>
                        );
                      }
                      return (
                        <input key={rk} value={String(v ?? '')} placeholder={labelize(rk)}
                          onChange={(e) => { const next = rows.slice(); next[i] = { ...row, [rk]: e.target.value }; setField(key, next); }}
                          className="min-w-[120px] flex-1 rounded border border-line bg-card px-1.5 py-1 text-micro text-navy outline-none focus:border-cyan-500" />
                      );
                    })}
                    <button onClick={() => setField(key, rows.filter((_, j) => j !== i))} className="text-grey hover:text-red-500"><Trash2 size={11} /></button>
                  </div>
                ))}
                <button onClick={() => setField(key, [...rows, Object.fromEntries(keys.map((k) => [k, typeof rows[0]?.[k] === 'boolean' ? false : '']))])}
                  className="inline-flex items-center gap-1 text-micro font-semibold text-grey hover:text-navy"><Plus size={11} /> Add</button>
              </div>
            </div>
          );
        }
        return (
          <div key={key}>
            <div className="mb-1 text-micro font-bold uppercase tracking-wide text-grey">{labelize(key)}</div>
            <textarea value={String(value ?? '')} onChange={(e) => setField(key, e.target.value)} rows={2}
              className="w-full rounded border border-line bg-card px-2 py-1 text-label text-navy outline-none focus:border-cyan-500" />
          </div>
        );
      })}
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} disabled={busy}><Check size={12} /> Save</Button>
        <Button size="sm" variant="secondary" onClick={onCancel}><X size={12} /> Cancel</Button>
      </div>
    </div>
  );
}

function ReviewSummary({ content }: { content: Content }) {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(content)) {
    if (Array.isArray(value)) parts.push(`${value.length} ${labelize(key).toLowerCase()}`);
    else if (typeof value === 'string' && value.trim()) parts.push(value.trim().slice(0, 80));
  }
  if (parts.length === 0) return null;
  return <p className="mt-1 text-micro text-grey">{parts.join(' · ')}</p>;
}

function labelize(k: string): string {
  return k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}
