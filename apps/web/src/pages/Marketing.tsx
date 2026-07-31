import { useCallback, useEffect, useRef, useState } from 'react';
import { Megaphone, Bot, Check, Copy, ShieldAlert, Send, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { PageTitle, Button } from '@/components/ui';
import { CardSkeleton, ErrorNotice, EmptyState } from '@/components/shared';
import { toast } from '@/components/shared/Toast';
import { AiProse } from '@/components/ai/AiProse';
import {
  approveDraft, draftForReply, fetchMarketingQueue, fetchMarketingSummary,
  ingestReply, setReplyStatus,
  type MarketingDraft, type MarketingReply, type MarketingSummary,
} from '@/lib/api/marketing';

/**
 * LCX MARKETING — the reply desk (the seventh compartment's first instrument).
 *
 * The problem: replies under @lcx posts get lost because nobody owns watching
 * them. This is the queue, the AI draft, and the approval — in one surface.
 *
 * WHAT THIS SURFACE DELIBERATELY CANNOT DO: post to X. There is no button for it
 * and no endpoint behind it. An approved draft is text you copy. That is what
 * keeps a prompt-injected draft — a reply that tried to make the model emit a
 * phishing link — incapable of reaching an LCX customer on its own.
 *
 * Reply text is rendered through `AiProse`, which emits React nodes and never
 * HTML, so hostile markup in a stranger's reply is inert here by construction.
 */
export function Marketing() {
  const [queue, setQueue] = useState<MarketingReply[] | null>(null);
  const [summary, setSummary] = useState<MarketingSummary | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [drafts, setDrafts] = useState<Record<number, MarketingDraft>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(() => {
    setErr(null);
    void Promise.all([fetchMarketingQueue(), fetchMarketingSummary()])
      .then(([q, s]) => { setQueue(q); setSummary(s); })
      .catch(setErr);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const draft = async (id: number) => {
    setBusy(id);
    try {
      const r = await draftForReply(id);
      setDrafts((d) => ({ ...d, [id]: r.draft }));
      if (r.suspiciousInput) {
        toast('error', 'That reply tried to instruct the model — read the draft with suspicion.');
      }
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Draft failed');
    } finally { setBusy(null); }
  };

  const approve = async (d: MarketingDraft) => {
    setBusy(d.reply_id);
    try {
      const row = await approveDraft(d.id);
      setDrafts((x) => ({ ...x, [d.reply_id]: row }));
      toast('success', 'Approved — copy it into X to send.');
      refresh();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Approve failed');
    } finally { setBusy(null); }
  };

  const ignore = async (id: number) => {
    try { await setReplyStatus(id, 'ignored'); refresh(); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
  };

  return (
    <div className="p-5">
      <PageTitle
        icon={<Megaphone size={20} />}
        subtitle="Replies under @lcx posts — triaged, drafted by AI, approved by a human. The desk never auto-posts."
        actions={<Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}><Send size={13} /> Add a reply</Button>}
      >
        Reply Desk
      </PageTitle>

      {open && <PasteForm onDone={() => { setOpen(false); refresh(); }} />}

      {summary && <SummaryStrip s={summary} />}

      {err ? (
        <ErrorNotice error={err} onRetry={refresh} />
      ) : !queue ? (
        <div className="mt-4"><CardSkeleton /></div>
      ) : queue.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Nothing waiting"
            description="No open replies. New ones arrive on the 15-minute tick, or add one by hand above."
          />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {queue.map((r) => (
            <ReplyCard
              key={r.id}
              reply={r}
              draft={drafts[r.id]}
              busy={busy === r.id}
              onDraft={() => void draft(r.id)}
              onApprove={(d) => void approve(d)}
              onIgnore={() => void ignore(r.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryStrip({ s }: { s: MarketingSummary }) {
  const open = (s.counts.new ?? 0) + (s.counts.triaged ?? 0) + (s.counts.drafted ?? 0);
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Open replies" value={String(open)} />
      <Stat
        label="Oldest waiting"
        value={s.oldestUnansweredHours == null ? '—' : `${Math.round(s.oldestUnansweredHours)}h`}
        tone={s.oldestUnansweredHours != null && s.oldestUnansweredHours > 2 ? 'warn' : undefined}
      />
      {/* Surfaced as a first-class number, not buried: a reply trying to steer the
          model is the one the desk most needs to look at. */}
      <Stat label="Suspicious" value={String(s.suspicious)} tone={s.suspicious > 0 ? 'warn' : undefined} />
      <Stat label="Unreadable emails" value={String(s.unparsed)} tone={s.unparsed > 0 ? 'warn' : undefined} />
      {!s.mailConfigured && (
        <p className="sm:col-span-2 lg:col-span-4 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-label text-amber-700 dark:text-amber-400">
          Mailbox not configured — set <span className="font-mono text-micro">X_MAIL_*</span> to poll X notification
          emails automatically. Until then, add replies by hand; everything else works.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-grey">{label}</div>
      <div className={clsx('mt-1 text-[22px] font-bold tabular-nums',
        tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-navy')}>{value}</div>
    </div>
  );
}

function ReplyCard({ reply, draft, busy, onDraft, onApprove, onIgnore }: {
  reply: MarketingReply;
  draft?: MarketingDraft;
  busy: boolean;
  onDraft: () => void;
  onApprove: (d: MarketingDraft) => void;
  onIgnore: () => void;
}) {
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast('success', 'Copied — paste it into X'); }
    catch { toast('error', 'Could not copy'); }
  };

  return (
    <div data-juice className="rounded-lg border border-line bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-navy">@{reply.author_handle}</span>
        {reply.author_display && <span className="text-label text-grey">{reply.author_display}</span>}
        <span className="rounded border border-line px-1.5 py-0.5 font-mono text-micro text-grey" title="Admiralty source grade — how much to trust this record">
          {reply.source_grade}
        </span>
        {reply.parse_failed && (
          <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-micro font-bold text-amber-700 dark:text-amber-400">
            <ShieldAlert size={10} /> unreadable — check by hand
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 font-mono text-micro text-grey">
          <Clock size={10} /> {new Date(reply.received_at).toLocaleString()}
        </span>
      </div>

      {/* Untrusted third-party text. AiProse renders nodes, never HTML. */}
      <div className="mt-2 rounded border border-line bg-ice-soft/40 p-2.5 dark:bg-ice-soft/5">
        <AiProse text={reply.body} />
      </div>

      {draft && (
        <div className="mt-3 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
          <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-grey">
            <Bot size={12} className="text-cyan-600 dark:text-cyan-400" />
            Suggested reply
            {draft.status === 'approved' && (
              <span className="ml-1 rounded bg-emerald-500/10 px-1.5 text-emerald-700 dark:text-emerald-400">
                approved{draft.approved_by ? ` · ${draft.approved_by}` : ''}
              </span>
            )}
          </div>
          <AiProse text={draft.body} />
          {draft.flagged && (
            <p className="mt-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-micro text-amber-700 dark:text-amber-400">
              <ShieldAlert size={10} className="mr-1 inline" />{draft.flag_reason}
            </p>
          )}
          <p className="mt-1 text-[10px] text-grey">
            {draft.used_llm ? 'AI-drafted' : 'Deterministic draft — no AI key set'} · review before sending.
            LCX OS never posts to X.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {draft.status === 'proposed' && (
              <Button size="xs" onClick={() => onApprove(draft)} disabled={busy}>
                <Check size={12} /> Approve
              </Button>
            )}
            <Button size="xs" variant="secondary" onClick={() => void copy(draft.body)}>
              <Copy size={12} /> Copy
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="xs" variant="secondary" onClick={onDraft} disabled={busy}>
          <Bot size={12} /> {busy ? '…' : draft ? 'Re-draft' : 'Draft a reply'}
        </Button>
        {reply.x_comment_id && !reply.x_comment_id.startsWith('manual:') && !reply.x_comment_id.startsWith('unparsed:') && (
          <a
            className="inline-flex items-center rounded border border-line px-2 py-1 text-micro text-cyan-700 hover:underline dark:text-cyan-400"
            href={`https://x.com/${reply.author_handle}/status/${reply.x_comment_id}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            Open on X
          </a>
        )}
        <Button size="xs" variant="secondary" onClick={onIgnore} disabled={busy}>Ignore</Button>
      </div>
    </div>
  );
}

/** Add a reply by hand — makes the desk useful before any mail plumbing exists. */
function PasteForm({ onDone }: { onDone: () => void }) {
  const [handle, setHandle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); }, []);

  const submit = async () => {
    const h = handle.replace(/^@/, '').trim();
    if (!h || !body.trim()) { toast('error', 'Handle and reply text are required'); return; }
    setBusy(true);
    try {
      // Accepts a full permalink and keeps only the id — pasting the URL is what
      // a person actually has to hand.
      const id = /status(?:es)?\/(\d{6,25})/.exec(link)?.[1];
      const r = await ingestReply({ authorHandle: h, body: body.trim(), xCommentId: id });
      toast(r.result === 'inserted' ? 'success' : 'error',
        r.result === 'inserted' ? 'Added to the queue' : 'Already in the queue');
      setHandle(''); setBody(''); setLink('');
      onDone();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed to add');
    } finally { setBusy(false); }
  };

  const cls = 'w-full rounded border border-line bg-card px-2.5 py-2 text-label text-navy focus-ring';
  return (
    <div className="mt-4 rounded-lg border border-line bg-card p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <input ref={first} className={cls} placeholder="@handle" value={handle}
          onChange={(e) => setHandle(e.target.value)} aria-label="X handle" />
        <input className={cls} placeholder="Link to the reply (optional)" value={link}
          onChange={(e) => setLink(e.target.value)} aria-label="Reply permalink" />
      </div>
      <textarea className={`${cls} mt-2 min-h-[72px]`} placeholder="What did they say?"
        value={body} onChange={(e) => setBody(e.target.value)} aria-label="Reply text" />
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={() => void submit()} disabled={busy}>Add to queue</Button>
      </div>
    </div>
  );
}
