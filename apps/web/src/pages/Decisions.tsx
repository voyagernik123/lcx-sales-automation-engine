import { useCallback, useEffect, useState } from 'react';
import { GitPullRequestArrow, Plus, Trash2, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { listDecisions, createDecision, updateDecision, deleteDecision, type Decision } from '@/lib/api/decisions';
import { useOperatorStore } from '@/stores';
import { EmptyState, PageSkeleton, toast } from '@/components/shared';
import { PageTitle, Button } from '@/components/ui';
import { clsx } from 'clsx';

/**
 * Decision Log (Phase 4.2) — the institution's memory. Consequential calls are
 * captured as structured memos (context, options, decision, rationale, owner,
 * review-by); the outcome is recorded at review. Deal closes past negotiating
 * land here automatically; anything else can be logged by hand.
 */
type Filter = 'open' | 'review_due' | 'mine' | 'all';
const SOURCE_LABEL: Record<string, string> = { manual: 'logged', deal_close: 'deal close', monitor: 'monitor', suppression: 'suppression' };

export function Decisions() {
  const me = useOperatorStore((s) => s.operator?.id);
  const [items, setItems] = useState<Decision[] | null>(null);
  const [filter, setFilter] = useState<Filter>('open');
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const load = useCallback(() => {
    setError(null); setItems(null);
    const f = filter === 'review_due' ? { reviewDue: true } : filter === 'mine' && me ? { owner: me } : {};
    listDecisions(f)
      .then((d) => setItems(filter === 'open' ? d.filter((x) => !x.outcome) : d))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [filter, me]);
  useEffect(load, [load]);

  return (
    <div className="p-5">
      <PageTitle
        icon={<GitPullRequestArrow size={20} />}
        subtitle="Why we made the calls we made — and, at review, whether they worked. Deal closes are captured automatically."
        actions={<Button size="sm" onClick={() => setComposing((v) => !v)}><Plus size={13} /> Log decision</Button>}
      >
        Decision Log
      </PageTitle>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {(['open', 'review_due', 'mine', 'all'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'rounded-md border px-2.5 py-1 text-label font-medium',
              filter === f ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' : 'border-line text-grey hover:text-navy',
            )}
          >
            {f === 'open' ? 'Open' : f === 'review_due' ? 'Review due' : f === 'mine' ? 'Mine' : 'All'}
          </button>
        ))}
      </div>

      {composing && <Composer onDone={() => { setComposing(false); load(); }} onCancel={() => setComposing(false)} />}

      {error ? (
        <EmptyState variant="error" title="Decisions unavailable" description={error} />
      ) : !items ? (
        <PageSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          variant="default"
          title={filter === 'review_due' ? 'No reviews due' : 'No decisions yet'}
          description={filter === 'review_due' ? 'Nothing waiting on an outcome.' : 'Log the next consequential call — or close a deal and it captures itself.'}
        />
      ) : (
        <div className="space-y-2.5">
          {items.map((d) => <DecisionCard key={d.id} d={d} onChange={load} />)}
        </div>
      )}
    </div>
  );
}

function Composer({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({ title: '', context: '', optionsConsidered: '', decision: '', rationale: '', reviewBy: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (!f.title.trim()) return;
    try {
      await createDecision({ ...f, reviewBy: f.reviewBy || null });
      toast('success', 'Decision logged'); onDone();
    } catch { toast('error', 'Failed to save'); }
  };
  const input = 'w-full rounded border border-line bg-card px-2 py-1.5 text-label text-navy outline-none focus:border-cyan-500';
  return (
    <div className="mb-4 space-y-2 rounded-lg border border-cyan-500/30 bg-card p-3 shadow-card">
      <input value={f.title} onChange={set('title')} placeholder="Decision title — e.g. Pass on listing TOKENX this quarter" className={clsx(input, 'font-semibold')} />
      <div className="grid gap-2 sm:grid-cols-2">
        <textarea value={f.context} onChange={set('context')} placeholder="Context — what prompted this?" rows={2} className={input} />
        <textarea value={f.optionsConsidered} onChange={set('optionsConsidered')} placeholder="Options considered" rows={2} className={input} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={f.decision} onChange={set('decision')} placeholder="The decision" className={input} />
        <textarea value={f.rationale} onChange={set('rationale')} placeholder="Rationale — why this over the alternatives?" rows={1} className={input} />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-micro text-grey">Review by</label>
        <input type="date" value={f.reviewBy} onChange={set('reviewBy')} className="rounded border border-line bg-card px-2 py-1 text-label text-navy" />
        <div className="ml-auto flex gap-2">
          <Button size="xs" variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button size="xs" onClick={() => void save()} disabled={!f.title.trim()}>Save decision</Button>
        </div>
      </div>
    </div>
  );
}

function DecisionCard({ d, onChange }: { d: Decision; onChange: () => void }) {
  const [recording, setRecording] = useState(false);
  const [outcome, setOutcome] = useState('');
  const reviewDue = d.reviewBy && d.reviewBy <= new Date().toISOString().slice(0, 10) && !d.outcome;

  const record = async () => {
    if (!outcome.trim()) return;
    try { await updateDecision(d.id, { outcome: outcome.trim() }); toast('success', 'Outcome recorded'); setRecording(false); onChange(); }
    catch { toast('error', 'Failed'); }
  };
  const remove = async () => { try { await deleteDecision(d.id); onChange(); } catch { toast('error', 'Failed'); } };

  return (
    <div className={clsx('rounded-lg border bg-card p-3.5 shadow-card', reviewDue ? 'border-amber-500/50' : 'border-line')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-body font-bold text-navy">{d.title}</span>
            <span className="rounded bg-ice-soft px-1.5 py-0.5 text-micro font-semibold text-grey-dark dark:bg-ice-soft/10">{SOURCE_LABEL[d.source] ?? d.source}</span>
            <span className="text-micro text-grey">· {d.owner}</span>
          </div>
          {d.context && <p className="mt-1 text-label text-grey-dark">{d.context}</p>}
        </div>
        <button onClick={() => void remove()} className="shrink-0 text-grey hover:text-red-500"><Trash2 size={13} /></button>
      </div>

      {(d.optionsConsidered || d.decision || d.rationale) && (
        <div className="mt-2 grid gap-2 border-t border-line/60 pt-2 text-label sm:grid-cols-3">
          {d.optionsConsidered && <Field label="Options" value={d.optionsConsidered} />}
          {d.decision && <Field label="Decision" value={d.decision} />}
          {d.rationale && <Field label="Rationale" value={d.rationale} />}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line/60 pt-2">
        {d.reviewBy && (
          <span className={clsx('inline-flex items-center gap-1 text-micro font-medium', reviewDue ? 'text-amber-600 dark:text-amber-400' : 'text-grey')}>
            {reviewDue ? <AlertTriangle size={11} /> : <Clock size={11} />} review {reviewDue ? 'due' : 'by'} {d.reviewBy}
          </span>
        )}
        {d.outcome ? (
          <span className="inline-flex items-center gap-1 text-micro font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={12} /> Outcome: {d.outcome}
          </span>
        ) : recording ? (
          <div className="flex flex-1 items-center gap-2">
            <input autoFocus value={outcome} onChange={(e) => setOutcome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void record(); }}
              placeholder="What actually happened?" className="min-w-0 flex-1 rounded border border-line bg-card px-2 py-1 text-label text-navy outline-none focus:border-cyan-500" />
            <Button size="xs" onClick={() => void record()} disabled={!outcome.trim()}>Record</Button>
            <Button size="xs" variant="secondary" onClick={() => setRecording(false)}>Cancel</Button>
          </div>
        ) : (
          <button onClick={() => setRecording(true)} className="ml-auto text-micro font-semibold text-cyan-600 hover:underline dark:text-cyan-400">
            Record outcome
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-micro font-bold uppercase tracking-wider text-grey">{label}</div>
      <div className="text-label text-navy">{value}</div>
    </div>
  );
}
