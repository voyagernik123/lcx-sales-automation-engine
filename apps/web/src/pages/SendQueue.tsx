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

      <div className="flex flex-wrap items-center gap-2">
        {openLink ? (
          <a
            href={openLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded bg-blue-700 px-2.5 py-1.5 text-label font-semibold text-white hover:bg-blue-800 transition-colors"
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
        <button
          disabled={busy !== ''}
          onClick={() => act(() => markQueueItemSent(item.id, body !== item.body ? body : undefined), 'sent', 'Marked sent')}
          className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1.5 text-label font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          <Check size={11} /> {busy === 'sent' ? 'Saving…' : 'Mark sent'}
        </button>
        <Button variant="secondary" size="xs" disabled={busy !== ''} onClick={() => act(() => skipQueueItem(item.id), 'skip', 'Skipped')}>
          <SkipForward size={11} /> Skip
        </Button>
        <Button variant="secondary" size="xs" disabled={busy !== ''} onClick={() => act(() => snoozeQueueItem(item.id), 'snooze', 'Snoozed to next send window')}>
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
