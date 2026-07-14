import { useCallback, useEffect, useState } from 'react';
import { Send, ExternalLink, Copy, Check, SkipForward, Clock, RefreshCw, Linkedin, MessageCircle } from 'lucide-react';
import {
  fetchSendQueue, markQueueItemSent, skipQueueItem, snoozeQueueItem,
  type QueueItem, type QueueCaps,
} from '@/lib/api/bd';
import { toast } from '@/components/shared/Toast';
import { CardSkeleton, EmptyState } from '@/components/shared';
import { PageTitle, Button } from '@/components/ui';

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
      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-micro font-semibold ${
        atCap ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
      }`}
      title={atCap ? 'Cap reached — sends beyond this risk LinkedIn restrictions' : undefined}
    >
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
    <div className="rounded-lg border border-line bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            {isTelegram ? <MessageCircle size={13} className="text-sky-600" /> : <Linkedin size={13} className="text-blue-700" />}
            <span className="text-sm font-bold">{item.personName ?? 'Unknown contact'}</span>
            {item.personTitle && <span className="text-micro text-grey">{item.personTitle}</span>}
          </div>
          <div className="text-label text-grey mt-0.5">
            {item.projectName}
            {item.projectTicker ? ` (${item.projectTicker})` : ''} · touch {item.touchIndex} ·{' '}
            <span className="uppercase font-semibold">{isConnect ? 'Connect request' : isTelegram ? 'Telegram DM' : 'Message'}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-micro font-bold text-indigo-700">P{item.priorityScore}</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-micro font-bold uppercase text-slate-600">{item.band}</span>
        </div>
      </div>

      <div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={Math.min(10, Math.max(3, body.split('\n').length + 1))}
          className="w-full rounded border border-line p-2 text-label leading-relaxed focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        {isConnect && (
          <div className={`text-right text-micro ${overLimit ? 'font-bold text-red-600' : 'text-grey'}`}>
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
            className="inline-flex items-center gap-1 rounded bg-blue-700 px-2.5 py-1.5 text-label font-semibold text-white hover:bg-blue-800"
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
          className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1.5 text-label font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
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
        actions={
          <Button variant="secondary" size="xs" onClick={() => void load()}>
            <RefreshCw size={11} /> Refresh
          </Button>
        }
      >
        Send Queue
      </PageTitle>

      <p className="text-label text-grey">
        LinkedIn and Telegram touches are sent by you, never by automation — open the profile, paste, send, mark done.
        Caps are guidance to keep the account safe.
      </p>

      {caps && (
        <div className="flex flex-wrap gap-2">
          <CapBar label="Connects today" used={caps.connectionsToday} max={caps.limits.dailyConnections} />
          <CapBar label="Connects this week" used={caps.connectionsWeek} max={caps.limits.weeklyConnections} />
          <CapBar label="Messages today" used={caps.messagesToday} max={caps.limits.dailyMessages} />
          <div className="flex-1" />
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="rounded border border-line px-2 py-1 text-label"
          >
            <option value="">All channels</option>
            <option value="linkedin">LinkedIn</option>
            <option value="telegram">Telegram</option>
          </select>
        </div>
      )}

      {loading && <CardSkeleton count={3} />}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-label text-red-700">
          {error}{' '}
          <button onClick={() => void load()} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <EmptyState
          variant="done"
          title="Queue is clear"
          description="Nothing due right now. New touches appear when the scheduler ticks and their delay elapses."
        />
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <QueueCard key={item.id} item={item} onDone={() => void load()} />
        ))}
      </div>
    </div>
  );
}
