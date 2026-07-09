import { useCallback, useEffect, useState } from 'react';
import { Send, ExternalLink, Copy, Check, SkipForward, Clock, RefreshCw, Linkedin, MessageCircle } from 'lucide-react';
import {
  fetchSendQueue, markQueueItemSent, skipQueueItem, snoozeQueueItem,
  type QueueItem, type QueueCaps,
} from '@/lib/api/bd';
import { toast } from '@/components/shared/Toast';

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
      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold ${
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
    <div className="rounded-lg border border-line bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            {isTelegram ? <MessageCircle size={13} className="text-sky-600" /> : <Linkedin size={13} className="text-blue-700" />}
            <span className="text-sm font-bold">{item.personName ?? 'Unknown contact'}</span>
            {item.personTitle && <span className="text-[10px] text-grey">{item.personTitle}</span>}
          </div>
          <div className="text-[11px] text-grey mt-0.5">
            {item.projectName}
            {item.projectTicker ? ` (${item.projectTicker})` : ''} · touch {item.touchIndex} ·{' '}
            <span className="uppercase font-semibold">{isConnect ? 'Connect request' : isTelegram ? 'Telegram DM' : 'Message'}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700">P{item.priorityScore}</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-600">{item.band}</span>
        </div>
      </div>

      <div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={Math.min(10, Math.max(3, body.split('\n').length + 1))}
          className="w-full rounded border border-line p-2 text-[12px] leading-relaxed focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        {isConnect && (
          <div className={`text-right text-[10px] ${overLimit ? 'font-bold text-red-600' : 'text-grey'}`}>
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
            className="inline-flex items-center gap-1 rounded bg-blue-700 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-800"
          >
            <ExternalLink size={11} /> Open {isTelegram ? 'Telegram' : 'LinkedIn'}
          </a>
        ) : (
          <span className="text-[10px] italic text-grey">no {isTelegram ? 'telegram handle' : 'LinkedIn URL'} on file</span>
        )}
        <button
          onClick={copy}
          className="inline-flex items-center gap-1 rounded border border-line px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-50"
        >
          {copied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />} {copied ? 'Copied' : 'Copy'}
        </button>
        <div className="flex-1" />
        <button
          disabled={busy !== ''}
          onClick={() => act(() => markQueueItemSent(item.id, body !== item.body ? body : undefined), 'sent', 'Marked sent')}
          className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <Check size={11} /> {busy === 'sent' ? 'Saving…' : 'Mark sent'}
        </button>
        <button
          disabled={busy !== ''}
          onClick={() => act(() => skipQueueItem(item.id), 'skip', 'Skipped')}
          className="inline-flex items-center gap-1 rounded border border-line px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-50 disabled:opacity-50"
        >
          <SkipForward size={11} /> Skip
        </button>
        <button
          disabled={busy !== ''}
          onClick={() => act(() => snoozeQueueItem(item.id), 'snooze', 'Snoozed to next send window')}
          className="inline-flex items-center gap-1 rounded border border-line px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-50 disabled:opacity-50"
        >
          <Clock size={11} /> Snooze
        </button>
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
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <Send size={18} /> Send Queue
        </h1>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] font-semibold hover:bg-slate-50"
        >
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      <p className="text-[11px] text-grey">
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
            className="rounded border border-line px-2 py-1 text-[11px]"
          >
            <option value="">All channels</option>
            <option value="linkedin">LinkedIn</option>
            <option value="telegram">Telegram</option>
          </select>
        </div>
      )}

      {loading && <p className="py-8 text-center text-[12px] text-grey">Loading queue…</p>}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
          {error}{' '}
          <button onClick={() => void load()} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-line p-8 text-center text-[12px] text-grey">
          Queue is clear — nothing due right now. New touches appear when the scheduler ticks and their delay elapses.
        </div>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <QueueCard key={item.id} item={item} onDone={() => void load()} />
        ))}
      </div>
    </div>
  );
}
