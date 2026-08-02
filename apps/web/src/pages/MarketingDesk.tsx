import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, SectionLabel } from '@/components/ui';
import { CardSkeleton, ErrorNotice } from '@/components/shared';
import { toast } from '@/components/shared/Toast';
import { mergedMetaNotices } from '@/lib/api/meta';
import {
  approveDraft, draftForReply, fetchMarketingQueue, fetchMarketingSummary, ingestReply,
  type MarketingDraft, type MarketingReply, type MarketingSummary,
} from '@/lib/api/marketing';
import { Absent, Nothing } from '@/components/marketing/DeskAtoms';
import { CrisisRoom } from '@/components/marketing/CrisisRoom';
import { DeskMeasurement } from '@/components/marketing/DeskMeasurement';
import { DraftingRoom } from '@/components/marketing/DraftingRoom';
import { PrecedentPanel } from '@/components/marketing/PrecedentPanel';
import { SilenceLog } from '@/components/marketing/SilenceLog';
import { TriageBoard } from '@/components/marketing/TriageBoard';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE DESK — six surfaces, one compartment, and no way to publish from any of them
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `pages/Marketing.tsx` is the door; this is the room. It is split into six because the
 * six are genuinely different jobs and a single scrolling column made the desk look like
 * a reply queue with extras bolted on:
 *
 *   Triage        the decision, in RESIST 2's vocabulary. Comes first because the
 *                 default answer to an inbound item is not "draft a reply".
 *   Drafting      where the refusals arrive while you type, and where taking the text
 *                 is itself a recorded act.
 *   Silence       every decision NOT to answer. Half the desk's judgement.
 *   Precedent     what we said before, and whether it still holds.
 *   Crisis        prepared language and three parallel clears. Needs no data at all.
 *   Measurement   what can honestly be counted, and the seven figures that cannot.
 *
 * PANELS STAY MOUNTED across a tab switch, the way `pages/AiTools.tsx` keeps its own:
 * a half-finished assessment is work, and losing it to a mis-click teaches an operator
 * to distrust the surface.
 */

type Tab = 'triage' | 'drafting' | 'silence' | 'precedent' | 'crisis' | 'measurement';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'triage', label: 'Triage' },
  { id: 'drafting', label: 'Drafting' },
  { id: 'silence', label: 'Silence' },
  { id: 'precedent', label: 'Precedent' },
  { id: 'crisis', label: 'Crisis' },
  { id: 'measurement', label: 'Measurement' },
];

export function MarketingDesk() {
  const [queue, setQueue] = useState<MarketingReply[] | null>(null);
  const [summary, setSummary] = useState<MarketingSummary | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [drafts, setDrafts] = useState<Record<number, MarketingDraft>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('triage');
  const [selected, setSelected] = useState<number | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);

  /**
   * ONE `now` FOR THE WHOLE DESK, taken on mount.
   *
   * Every clock on this page — the wait since a post, an overdue revisit date, whether
   * the prepared statements are stale — is derived from it, so two panels can never
   * disagree about what time it is. It is not a ticking clock: a latency that increments
   * while an operator reads it invites the number to be watched instead of the item.
   */
  const [now] = useState(() => Date.now());

  const refresh = useCallback(() => {
    setErr(null);
    void Promise.all([fetchMarketingQueue(), fetchMarketingSummary()])
      .then(([q, s]) => { setQueue(q); setSummary(s); })
      .catch(setErr);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const notices = useMemo(() => mergedMetaNotices([queue, summary]), [queue, summary]);
  const unmigrated = summary?.migrated === false;

  const draft = async (id: number) => {
    setBusy(id);
    try {
      const r = await draftForReply(id);
      setDrafts((d) => ({ ...d, [id]: r.draft }));
      if (r.suspiciousInput) {
        toast('error', 'That reply tried to instruct the model — read the draft as hostile output, not as a suggestion.');
      }
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'The draft request failed');
    } finally { setBusy(null); }
  };

  const approve = async (d: MarketingDraft) => {
    setBusy(d.reply_id);
    try {
      const row = await approveDraft(d.id);
      setDrafts((x) => ({ ...x, [d.reply_id]: row }));
      toast('success', 'Approved. Approval is not sending — taking the text is a separate, recorded act.');
      refresh();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Approve failed');
    } finally { setBusy(null); }
  };

  const current = queue?.find((r) => r.id === selected) ?? null;

  return (
    <div className="space-y-3">
      {/* ── WHAT THIS ENVIRONMENT CANNOT DO. Before anything else on the page. */}
      {unmigrated && (
        <Absent title="LCX MARKETING is awaiting migration 0046 on this environment.">
          The compartment is deployed and its tables are not. The queue below is an empty shape rather than an
          empty inbox, and every write is declined. Applying <span className="font-mono">0046_marketing.sql</span> is
          what changes the answer — nothing else in LCX OS is affected.
        </Absent>
      )}
      {notices.map((n) => (
        <div
          key={n.id}
          role="note"
          className={n.tone === 'refusal'
            ? 'border-l-2 border-status-blocked/50 bg-status-blocked-bg px-2 py-1.5 text-micro leading-snug text-status-blocked'
            : 'border-l-2 border-status-conditional/60 bg-status-conditional-bg px-2 py-1.5 text-micro leading-snug text-status-conditional'}
        >
          <strong>{n.headline}</strong>
          <span className="mt-1 block text-[10px] text-grey">{n.detail}</span>
        </div>
      ))}
      {summary?.migrated === true && !summary.mailConfigured && (
        <p role="note" className="border-l-2 border-status-conditional/60 bg-status-conditional-bg px-2 py-1.5 text-micro leading-snug text-status-conditional">
          <strong>No mailbox is configured, so nothing arrives on its own.</strong>
          <span className="mt-1 block text-[10px] text-grey">
            Set <span className="font-mono">X_MAIL_*</span> to poll X notification emails. Until then the only items
            here are ones a person pasted in, and an empty queue says nothing about what is being said.
          </span>
        </p>
      )}

      <div className="flex gap-1 border-b border-line" role="tablist" aria-label="Marketing desk">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
              tab === t.id
                ? 'border-cyan-500 text-navy'
                : 'border-transparent text-grey hover:border-line hover:text-navy'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {err ? (
        <ErrorNotice error={err} onRetry={refresh} />
      ) : (
        <>
          {/* ── TRIAGE ──────────────────────────────────────────────────────────── */}
          <div className={tab === 'triage' ? 'space-y-3' : 'hidden'}>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="xs" variant="secondary" disabled={unmigrated} onClick={() => setPasteOpen((v) => !v)}>
                Add an item by hand
              </Button>
              <span className="text-[10px] leading-snug text-grey">
                A hand-pasted item is uncorroborated by construction: nothing checks that the handle, the id or
                the text are what the person on X actually wrote.
              </span>
            </div>
            {pasteOpen && !unmigrated && <PasteForm onDone={() => { setPasteOpen(false); refresh(); }} />}
            {queue === null ? <CardSkeleton /> : <TriageBoard queue={queue} now={now} onChanged={refresh} />}
          </div>

          {/* ── DRAFTING ────────────────────────────────────────────────────────── */}
          <div className={tab === 'drafting' ? 'space-y-3' : 'hidden'}>
            <div>
              <SectionLabel as="h3">Which item</SectionLabel>
              <p className="mt-0.5 text-[10px] leading-snug text-grey">
                Drafting is downstream of a decision. If this item has not been assessed on the triage board, you
                are answering something nobody decided to answer.
              </p>
              <select
                className="mt-1 w-full rounded border border-line bg-card px-2 py-1 text-micro text-navy focus-ring sm:max-w-lg"
                aria-label="Item to draft for"
                value={selected ?? ''}
                onChange={(e) => setSelected(e.target.value === '' ? null : Number(e.target.value))}
              >
                <option value="">— choose an item —</option>
                {(queue ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    @{r.author_handle} · {r.body.slice(0, 60)}
                  </option>
                ))}
              </select>
            </div>
            {current === null ? (
              <Nothing>
                No item chosen. Nothing is being drafted, and this panel will not offer a blank box to write an
                unprompted post into — an original post is a different surface with a different approval regime,
                and pretending otherwise is how static content ends up cleared as if it were a reply.
              </Nothing>
            ) : (
              <>
                <DraftingRoom
                  reply={current}
                  draft={drafts[current.id]}
                  busy={busy === current.id}
                  onDraft={() => void draft(current.id)}
                  onApprove={(d) => void approve(d)}
                />
                <PrecedentPanel query={current.body} />
              </>
            )}
          </div>

          {/* ── THE OTHER FOUR ──────────────────────────────────────────────────── */}
          <div className={tab === 'silence' ? '' : 'hidden'}><SilenceLog now={now} /></div>
          <div className={tab === 'precedent' ? '' : 'hidden'}>
            <PrecedentPanel query={current?.body ?? ''} />
          </div>
          <div className={tab === 'crisis' ? '' : 'hidden'}><CrisisRoom now={now} /></div>
          <div className={tab === 'measurement' ? '' : 'hidden'}>
            <DeskMeasurement queue={queue ?? []} summary={summary} now={now} />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Add an item by hand — the path that works with no mail plumbing at all, kept from the
 * original desk because it is the only reason this compartment is usable before the
 * mailbox exists.
 *
 * It now says what it is: an uncorroborated record. The ingest has no sender check, so a
 * pasted item and a forged notification email are indistinguishable to the desk until an
 * independent channel confirms the post exists.
 */
function PasteForm({ onDone }: { onDone: () => void }) {
  const [handle, setHandle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const cls = 'w-full rounded border border-line bg-card px-2 py-1 text-micro text-navy focus-ring';

  const submit = async () => {
    const h = handle.replace(/^@/, '').trim();
    if (!h || !body.trim()) { toast('error', 'A handle and the text are both required'); return; }
    setBusy(true);
    try {
      // Accepts a full permalink and keeps only the id — a URL is what a person has to
      // hand. The id is attacker-chosen either way, which is why the row is graded low.
      const id = /status(?:es)?\/(\d{6,25})/.exec(link)?.[1];
      const r = await ingestReply({ authorHandle: h, body: body.trim(), xCommentId: id });
      toast(r.result === 'inserted' ? 'success' : 'error',
        r.result === 'inserted' ? 'Added to the queue, uncorroborated.' : 'Already in the queue');
      setHandle(''); setBody(''); setLink('');
      onDone();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed to add');
    } finally { setBusy(false); }
  };

  return (
    <div className="border border-line bg-card p-2">
      <div className="grid gap-1.5 sm:grid-cols-2">
        <input className={cls} placeholder="@handle" value={handle}
          onChange={(e) => setHandle(e.target.value)} aria-label="X handle" />
        <input className={cls} placeholder="Link to the post (optional)" value={link}
          onChange={(e) => setLink(e.target.value)} aria-label="Post permalink" />
      </div>
      <textarea className={`${cls} mt-1.5 min-h-[60px]`} placeholder="What did they say?"
        value={body} onChange={(e) => setBody(e.target.value)} aria-label="Their text" />
      <div className="mt-1.5 flex items-center gap-2">
        <Button size="xs" onClick={() => void submit()} disabled={busy}>Add to the queue</Button>
        <span className="text-[10px] text-grey">Recorded as pasted by hand, and graded accordingly.</span>
      </div>
    </div>
  );
}
