import { useCallback, useEffect, useState } from 'react';
import { Send, ExternalLink, Copy, Check, SkipForward, Clock, RefreshCw, Linkedin, MessageCircle } from 'lucide-react';
import {
  fetchSendQueue, markQueueItemSent, skipQueueItem, snoozeQueueItem,
  type QueueItem, type QueueCaps,
} from '@/lib/api/bd';
import { toast } from '@/components/shared/Toast';
import { CardSkeleton, EmptyState } from '@/components/shared';
import { PageTitle, Button } from '@/components/ui';
import { EntityChip } from '@/components/entity';

const CONNECT_NOTE_MAX = 300;

function tmeLink(handle: string | null): string | null {
  if (!handle) return null;
  const clean = handle.replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '').trim();
  return clean ? `https://t.me/${clean}` : null;
}

function CapBar({ label, used, max }: { label: string; used: number; max: number }) {
  const atCap = used >= max;
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-micro font-semibold num-tabular ${
        atCap
          ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
          : 'border-line/70 bg-ice-soft/50 dark:bg-navy-deep/50 text-grey-dark'
      }`}
      title={atCap ? 'Cap reached — sends beyond this risk LinkedIn restrictions' : undefined}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${atCap ? 'bg-amber-500' : 'bg-emerald-500'}`} />
      {label}: {used}/{max}
    </span>
  );
}

function QueueCard({ item, onDone }: { item: QueueItem; onDone: () => void }) {
  const [body, setBody] = useState(item.body);
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(false);

  const isConnect = item.action === 'connection_request';
  const isTelegram = item.channel === 'telegram';
  const overLimit = isConnect && body.length > CONNECT_NOTE_MAX;

  const openLink = isTelegram ? tmeLink(item.personTelegram) : item.personLinkedin;

  const copy = async () => {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const act = async (fn: () => Promise<void>, tag: string, okMsg: string) => {
    setBusy(tag);
    try {
      await fn();
      toast('success', okMsg);
      onDone();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="rounded-xl border border-line/70 bg-card shadow-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            {isTelegram ? <MessageCircle size={13} className="text-sky-600" /> : <Linkedin size={13} className="text-blue-700" />}
            {item.personId ? (
              <EntityChip
                type="contact"
                id={`${item.projectId}:${item.personId}`}
                name={item.personName ?? 'Unknown contact'}
                stateLine={`at ${item.projectName}`}
                className="text-sm font-bold"
              />
            ) : (
              <span className="text-sm font-bold">{item.personName ?? 'Unknown contact'}</span>
            )}
            {item.personTitle && <span className="text-micro text-grey">{item.personTitle}</span>}
          </div>
          <div className="text-label text-grey mt-0.5">
            <EntityChip
              type="project"
              id={item.projectId}
              name={item.projectName}
              meta={item.projectTicker}
              stateLine={`touch ${item.touchIndex} · ${item.band} band`}
              className="font-semibold"
            />
            {' '}· touch {item.touchIndex} ·{' '}
            <span className="font-semibold">{isConnect ? 'Connect request' : isTelegram ? 'Telegram DM' : 'Message'}</span>
          </div>
          <div className="text-micro text-grey mt-0.5">
            Why this touch: step {item.stepIndex + 1} of the {isTelegram ? 'Telegram' : 'LinkedIn'} sequence
            {isConnect ? ' — opening connection request' : ` — touch ${item.touchIndex} follow-up`}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="inline-flex h-[18px] items-center rounded border border-line/70 bg-ice-soft/50 dark:bg-navy-deep/50 px-1.5 text-micro font-semibold font-mono num-tabular text-navy"
            title="Priority score"
          >
            P{item.priorityScore}
          </span>
          <span className="inline-flex h-[18px] items-center rounded-full border border-line/70 bg-ice-soft/50 dark:bg-navy-deep/50 px-2 text-micro font-semibold capitalize text-grey-dark">
            {item.band}
          </span>
        </div>
      </div>

      <div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={Math.min(10, Math.max(3, body.split('\n').length + 1))}
          className="w-full rounded border border-line bg-card p-2 text-label leading-relaxed outline-none focus:border-cyan-500 transition-colors"
        />
        {isConnect && (
          <div className={`text-right text-micro num-tabular ${overLimit ? 'font-bold text-red-600 dark:text-red-400' : 'text-grey'}`}>
            {body.length}/{CONNECT_NOTE_MAX} chars {overLimit && '— too long for a connection note'}
          </div>
        )}
      </div>

      {/*
       * ONE PRIMARY ACTION PER CARD, IN THREE TIERS.
       *
       * The defect this fixes is the one the Jobs pass keeps finding, and it was here in
       * its textbook form: FIVE controls, TWO of them saturated filled buttons of
       * identical weight — `Open LinkedIn` in bg-blue-700 and `Mark sent` in
       * bg-emerald-600 — both hand-rolled outside the `Button` component so neither
       * inherited a tier from the design system at all. With two equally loud controls
       * there is no primary action; the eye picks whichever colour it notices first, and
       * on this card that is as likely to be the one that opens a browser tab as the one
       * that writes to the outreach log.
       *
       * The tiering, and why this way round. `Mark sent` is the ONLY control here that
       * changes state and advances the queue — every other one either leaves the app
       * (`Open`), copies to the clipboard (`Copy`) or defers (`Skip`, `Snooze`). So it is
       * the single Tier 1: the design system's `primary`, one size up from everything
       * else. `Open` and `Copy` are the enabling steps and drop to Tier 2 (outlined);
       * `Skip` and `Snooze` are deferrals and drop to Tier 3 (ghost), which is what stops
       * "not now" reading as loudly as "done".
       *
       * ORDER IS UNCHANGED on purpose. Moving the primary to the far right would be the
       * conventional dialog idiom, but it would also make it the LAST thing Tab reaches
       * on a keyboard-first desk, and this pass is about weight, not about churning a
       * screen that works. `Mark sent` stays first in the right-hand group.
       *
       * The green went with the flattening, and that is a real loss — emerald carried
       * "this is the completing action" for free. The size and fill step now carry it,
       * and `Check` stays as the icon.
       */}
      <div className="flex flex-wrap items-center gap-2">
        {openLink ? (
          <a
            href={openLink}
            target="_blank"
            rel="noreferrer"
            /* An anchor cannot be a <Button>, so it carries the secondary recipe by hand —
               deliberately the same tokens `Button variant="secondary" size="xs"` emits, so
               it sits in Tier 2 with Copy rather than inventing a sixth weight. */
            className="inline-flex items-center justify-center gap-1 rounded border border-line bg-ice-soft px-2 py-1 text-micro font-bold text-navy transition-colors hover:bg-ice focus-ring"
          >
            <ExternalLink size={11} /> Open {isTelegram ? 'Telegram' : 'LinkedIn'}
          </a>
        ) : (
          <span className="text-micro italic text-grey">no {isTelegram ? 'telegram handle' : 'LinkedIn URL'} on file</span>
        )}
        <Button variant="secondary" size="xs" onClick={copy}>
          {copied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />} {copied ? 'Copied' : 'Copy'}
        </Button>
        <div className="flex-1" />
        <Button
          variant="primary"
          size="sm"
          disabled={busy !== ''}
          onClick={() => act(() => markQueueItemSent(item.id, body !== item.body ? body : undefined), 'sent', 'Marked sent')}
        >
          <Check size={12} /> {busy === 'sent' ? 'Saving…' : 'Mark sent'}
        </Button>
        <Button variant="ghost" size="xs" disabled={busy !== ''} onClick={() => act(() => skipQueueItem(item.id), 'skip', 'Skipped')}>
          <SkipForward size={11} /> Skip
        </Button>
        <Button variant="ghost" size="xs" disabled={busy !== ''} onClick={() => act(() => snoozeQueueItem(item.id), 'snooze', 'Snoozed to next send window')}>
          <Clock size={11} /> Snooze
        </Button>
      </div>
    </div>
  );
}

export function SendQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [caps, setCaps] = useState<QueueCaps | null>(null);
  const [channel, setChannel] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchSendQueue({ channel: channel || undefined });
      setItems(res.items);
      setCaps(res.caps);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }, [channel]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <PageTitle
        icon={<Send size={20} />}
        className="mb-5"
        subtitle="LinkedIn and Telegram touches are sent by you, never by automation — open the profile, paste, send, mark done. Caps are guidance to keep the account safe."
        actions={
          <Button variant="secondary" size="xs" onClick={() => void load()}>
            <RefreshCw size={11} /> Refresh
          </Button>
        }
      >
        Send Queue
      </PageTitle>

      {caps && (
        <div className="flex flex-wrap gap-2">
          <CapBar label="Connects today" used={caps.connectionsToday} max={caps.limits.dailyConnections} />
          <CapBar label="Connects this week" used={caps.connectionsWeek} max={caps.limits.weeklyConnections} />
          <CapBar label="Messages today" used={caps.messagesToday} max={caps.limits.dailyMessages} />
          <div className="flex-1" />
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 py-1 text-label outline-none focus:border-cyan-500 transition-colors"
          >
            <option value="">All channels</option>
            <option value="linkedin">LinkedIn</option>
            <option value="telegram">Telegram</option>
          </select>
        </div>
      )}

      {loading && <CardSkeleton count={3} />}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-3 text-label text-red-700 dark:text-red-300">
          {error}{' '}
          <button onClick={() => void load()} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="rounded-xl border border-line/70 bg-card shadow-card">
          <EmptyState
            variant="done"
            title="Queue clear — go close something."
            description="Nothing due right now. New touches appear when the scheduler ticks and their delay elapses."
          />
        </div>
      )}

      <div className="space-y-4">
        {items.map((item) => (
          <QueueCard key={item.id} item={item} onDone={() => void load()} />
        ))}
      </div>
    </div>
  );
}
