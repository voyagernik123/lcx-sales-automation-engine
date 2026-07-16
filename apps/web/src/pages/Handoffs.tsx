import { useEffect, useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageSquare, ExternalLink, User, RefreshCw, ChevronLeft, MessageCircle, ThumbsUp, ThumbsDown, RotateCcw, Send, Copy, Mail, Linkedin, Clock } from 'lucide-react';
import { fetchHandoffs, claimHandoff, updateHandoffStatus, addHandoffNote, reEnrollHandoff, fetchReplyDrafts, markHandoffMovedToTelegram, analyzeSentiment, type ReplyDraft, type SentimentResult } from '@/lib/api/bd';
import { computeReplySla, SLA_CLS } from '@/lib/salesIntel';
import { useInspect } from '@/stores';
import { toast } from '@/components/shared/Toast';
import { CardSkeleton, EmptyState } from '@/components/shared';
import { SectionLabel, Button } from '@/components/ui';
import { HANDOFF_STATUS_COLORS, HANDOFF_STATUS_LABELS } from '@/types/bd';
import type { HandoffRecord, HandoffEvent } from '@/types/bd';

const STATUS_OPTIONS = ['open', 'in_progress', 'resolved_won_path', 'resolved_lost', 're_nurture'] as const;

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-micro font-bold leading-none ${HANDOFF_STATUS_COLORS[status] ?? ''}`}>
      {HANDOFF_STATUS_LABELS[status] ?? status}
    </span>
  );
}

/* ── Reply SLA chip (Linear-style aging on every unanswered reply) ── */

function formatAge(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function SlaChip({ createdAt }: { createdAt: string }) {
  const sla = computeReplySla(createdAt);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded border border-line px-1 py-0.5 text-[9px] font-bold uppercase leading-none ${SLA_CLS[sla.state]}`}
      title={`Reply SLA: ${Math.round(sla.ageHours * 10) / 10}h of ${sla.budgetHours}h budget`}
    >
      <Clock size={8} /> {sla.state} {formatAge(sla.ageHours)}
    </span>
  );
}

/* ── Inline sentiment chip on the reply text (same engine as AI Console) ── */

const SENTIMENT_STYLE: Record<string, string> = {
  positive: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  negative: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  objection: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
};

/** Once-per-handoff cache so switching selection never re-runs the classifier. */
const sentimentCache = new Map<string, SentimentResult>();

function SentimentChip({ handoffId, text }: { handoffId: string; text: string }) {
  const [result, setResult] = useState<SentimentResult | null>(() => sentimentCache.get(handoffId) ?? null);

  useEffect(() => {
    const cached = sentimentCache.get(handoffId);
    if (cached) {
      setResult(cached);
      return;
    }
    setResult(null);
    let cancelled = false;
    analyzeSentiment(text)
      .then(r => {
        sentimentCache.set(handoffId, r);
        if (!cancelled) setResult(r);
      })
      .catch(() => {
        /* sentiment is a bonus signal — fail silently */
      });
    return () => {
      cancelled = true;
    };
  }, [handoffId, text]);

  if (!result) return null;
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-micro font-bold leading-none ${SENTIMENT_STYLE[result.sentiment] ?? ''}`}
      title={`Sentiment (${Math.round(result.confidence * 100)}% confidence)${result.matched.length ? ` — signals: ${result.matched.join(', ')}` : ''}`}
    >
      {result.sentiment}
    </span>
  );
}

function ChannelIcon({ channel, size = 11 }: { channel: string; size?: number }) {
  if (channel === 'linkedin') return <Linkedin size={size} className="text-blue-700 dark:text-blue-400 shrink-0" />;
  if (channel === 'telegram') return <Send size={size} className="text-sky-600 dark:text-sky-400 shrink-0" />;
  return <Mail size={size} className="text-emerald-600 dark:text-emerald-400 shrink-0" />;
}

function HandoffEvents({ events }: { events: HandoffEvent[] }) {
  return (
    <div className="space-y-2">
      {events.map(e => (
        <div key={e.id} className="flex gap-2 text-micro border-b border-line last:border-none pb-1.5">
          <span className="text-micro font-bold uppercase text-grey shrink-0 w-16">{e.eventType}</span>
          <div className="flex-1">
            <span className="font-semibold">{e.actor}</span>
            {e.content && <span className="text-grey"> — {e.content}</span>}
            {e.oldStatus && e.newStatus && (
              <span className="text-grey">
                {' '}
                <StatusBadge status={e.oldStatus} /> → <StatusBadge status={e.newStatus} />
              </span>
            )}
          </div>
          <span className="text-grey shrink-0">{new Date(e.createdAt).toLocaleDateString()}</span>
        </div>
      ))}
      {events.length === 0 && <p className="text-micro text-grey italic">No events yet</p>}
    </div>
  );
}

function ReplyDrafts({ handoffId, onMoved }: { handoffId: string; onMoved: () => void }) {
  const [drafts, setDrafts] = useState<ReplyDraft[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [body, setBody] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    try {
      const res = await fetchReplyDrafts(handoffId);
      setDrafts(res.drafts);
      setWarnings(res.warnings);
      setBody(res.drafts[0]?.body ?? '');
      setLoaded(true);
    } catch {
      toast('error', 'Failed to load reply drafts');
    }
  };

  const pick = (i: number) => {
    setActive(i);
    setBody(drafts[i]?.body ?? '');
  };

  const copy = async () => {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const moved = async () => {
    setBusy(true);
    try {
      await markHandoffMovedToTelegram(handoffId);
      toast('success', 'Marked: moved to Telegram');
      onMoved();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) {
    return (
      <Button variant="secondary" size="xs" onClick={() => void load()}>
        <MessageCircle size={10} /> Generate reply drafts
      </Button>
    );
  }

  return (
    <div className="rounded border border-line p-2 space-y-2">
      <div className="flex items-center gap-1">
        {drafts.map((d, i) => (
          <button
            key={d.angle}
            onClick={() => pick(i)}
            className={`rounded px-2 py-0.5 text-micro font-bold uppercase ${i === active ? 'bg-cyan-600 text-white' : 'border border-line hover:bg-ice-soft dark:hover:bg-ice-soft/10'}`}
          >
            {d.angle}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => void copy()} className="rounded border border-line px-2 py-0.5 text-micro font-bold flex items-center gap-1 hover:bg-ice-soft dark:hover:bg-ice-soft/10">
          <Copy size={9} /> {copied ? 'Copied' : 'Copy'}
        </button>
        <button onClick={() => void moved()} disabled={busy} className="rounded bg-sky-600 text-white px-2 py-0.5 text-micro font-bold flex items-center gap-1 hover:bg-sky-700 disabled:opacity-50">
          <Send size={9} /> Moved to Telegram
        </button>
      </div>
      {warnings.map((w) => (
        <p key={w} className="text-micro text-amber-600">{w}</p>
      ))}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={7}
        className="w-full rounded border border-line p-1.5 text-micro leading-relaxed focus:outline-none"
      />
    </div>
  );
}

function HandoffDetail({ handoff, onBack, onRefresh }: { handoff: HandoffRecord; onBack: () => void; onRefresh: () => void }) {
  const inspect = useInspect();
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState('');

  const handleClaim = async () => {
    setSaving('claim');
    try {
      await claimHandoff(handoff.id);
      toast('success', 'Handoff claimed');
      onRefresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to claim');
    } finally {
      setSaving('');
    }
  };

  const handleStatusChange = async (status: string) => {
    setSaving(`status-${status}`);
    try {
      await updateHandoffStatus(handoff.id, status);
      toast('success', `Status updated to ${HANDOFF_STATUS_LABELS[status] ?? status}`);
      onRefresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving('');
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setSaving('note');
    try {
      await addHandoffNote(handoff.id, noteText.trim());
      toast('success', 'Note added');
      setNoteText('');
      onRefresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setSaving('');
    }
  };

  const handleReEnroll = async () => {
    setSaving('re-enroll');
    try {
      await reEnrollHandoff(handoff.id);
      toast('success', 'Sequences re-activated. Override recorded.');
      onRefresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to re-enroll');
    } finally {
      setSaving('');
    }
  };

  const availableStatuses = STATUS_OPTIONS.filter(s => s !== handoff.status);
  const showReEnroll = handoff.status === 'resolved_lost' || handoff.status === 'resolved_won_path' || handoff.status === 're_nurture';
  const sla = handoff.status === 'open' ? computeReplySla(handoff.createdAt) : null;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="md:hidden flex items-center gap-1 text-micro font-bold text-grey hover:text-navy transition-colors">
        <ChevronLeft size={12} /> Back to Inbox
      </button>

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <button
            onClick={() => inspect('project', handoff.projectId)}
            className="font-bold text-sm text-navy hover:text-cyan-600 dark:hover:text-cyan-400 hover:underline text-left truncate block"
            title="Inspect project"
          >
            {handoff.projectName ?? 'Unknown Project'}
          </button>
          <p className="text-micro text-grey">
            {handoff.projectTicker && <>{handoff.projectTicker} · </>}
            {handoff.channel} · Trigger: {handoff.triggerReason}
          </p>
          {sla && (
            <p className={`text-micro font-bold ${SLA_CLS[sla.state]}`}>
              Reply SLA: {sla.state} — {Math.round(sla.ageHours * 10) / 10}h of {sla.budgetHours}h budget
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={handoff.status} />
          {handoff.assignedTo && (
            <span className="inline-flex items-center gap-1 text-micro text-grey">
              <User size={9} /> {handoff.assignedTo}
            </span>
          )}
        </div>
      </div>

      {handoff.personName && (
        <div className="rounded border border-line p-2 text-micro space-y-1">
          <div className="flex items-center gap-2">
            {handoff.personId ? (
              <button
                onClick={() => inspect('contact', `${handoff.projectId}:${handoff.personId}`)}
                className="font-bold text-navy hover:text-cyan-600 dark:hover:text-cyan-400 hover:underline"
                title="Inspect contact"
              >
                {handoff.personName}
              </button>
            ) : (
              <span className="font-bold">{handoff.personName}</span>
            )}
            {handoff.personEmail && <span className="text-grey">{handoff.personEmail}</span>}
          </div>
          {handoff.personLinkedin && (
            <a href={handoff.personLinkedin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-cyan-600 dark:text-cyan-400 hover:underline">
              <ExternalLink size={9} /> LinkedIn Profile
            </a>
          )}
          {handoff.personTelegram && (
            <a
              href={`https://t.me/${handoff.personTelegram.replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:underline"
            >
              <Send size={9} /> Telegram: {handoff.personTelegram}
            </a>
          )}
        </div>
      )}

      {/* Their reply + inline sentiment (same engine the AI Console runs) */}
      {handoff.summary && (
        <div className="rounded border border-line p-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <SectionLabel>Their reply</SectionLabel>
            <SentimentChip handoffId={handoff.id} text={handoff.summary} />
          </div>
          <p className="text-micro leading-relaxed whitespace-pre-wrap text-navy">{handoff.summary}</p>
        </div>
      )}

      <ReplyDrafts handoffId={handoff.id} onMoved={onRefresh} />

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-1.5">
        {!handoff.assignedTo && (
          <button onClick={handleClaim} disabled={saving === 'claim'} className="rounded bg-cyan-600 text-white px-2 py-1 text-micro font-bold hover:bg-cyan-700 transition-colors disabled:opacity-50 flex items-center gap-1">
            <User size={10} /> {saving === 'claim' ? '...' : 'Claim'}
          </button>
        )}
        {availableStatuses.map(s => (
          <Button key={s} variant="secondary" size="xs" onClick={() => handleStatusChange(s)} disabled={saving === `status-${s}`}>
            {s === 'resolved_won_path' && <ThumbsUp size={10} />}
            {s === 'resolved_lost' && <ThumbsDown size={10} />}
            {s === 're_nurture' && <RotateCcw size={10} />}
            {saving === `status-${s}` ? '...' : HANDOFF_STATUS_LABELS[s] ?? s}
          </Button>
        ))}
        {showReEnroll && (
          <button onClick={handleReEnroll} disabled={saving === 're-enroll'} className="rounded bg-amber-600 text-white px-2 py-1 text-micro font-bold hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center gap-1">
            <RotateCcw size={10} /> {saving === 're-enroll' ? '...' : 'Override: Re-enroll'}
          </button>
        )}
      </div>

      {/* Note input */}
      <div className="flex gap-1.5">
        <input
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          placeholder="Add a note..."
          className="flex-1 rounded border border-line px-2 py-1 text-micro bg-surface dark:bg-navy-deep focus:outline-none focus:ring-1 focus:ring-cyan-500"
          onKeyDown={e => { if (e.key === 'Enter') handleAddNote(); }}
        />
        <button onClick={handleAddNote} disabled={saving === 'note' || !noteText.trim()} className="rounded bg-cyan-600 text-white px-2 py-1 text-micro font-bold hover:bg-cyan-700 transition-colors disabled:opacity-50">
          <MessageCircle size={10} />
        </button>
      </div>

      {/* Events timeline */}
      <div>
        <SectionLabel as="h3" className="mb-2 block">Timeline</SectionLabel>
        <HandoffEvents events={handoff.events ?? []} />
      </div>
    </div>
  );
}

/* ── Compact inbox row (left pane) ── */

function InboxRow({ h, active, onSelect }: { h: HandoffRecord; active: boolean; onSelect: () => void }) {
  const snippet = h.summary ?? h.triggerReason.replace(/_/g, ' ');
  return (
    <button
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={`w-full text-left border-b border-line px-2.5 py-2 transition-colors ${
        active
          ? 'bg-cyan-50 dark:bg-cyan-950/30 border-l-2 border-l-cyan-500'
          : 'border-l-2 border-l-transparent hover:bg-ice-soft dark:hover:bg-ice-soft/5'
      }`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <ChannelIcon channel={h.channel} size={10} />
        <span className="font-bold text-micro truncate text-navy">{h.projectName ?? 'Unknown'}</span>
        {h.projectTicker && <span className="text-[9px] text-grey shrink-0 font-mono">{h.projectTicker}</span>}
        <span className="flex-1" />
        {h.status === 'open' ? <SlaChip createdAt={h.createdAt} /> : <StatusBadge status={h.status} />}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
        <p className="text-micro text-grey truncate flex-1">
          {h.personName && <span className="font-semibold">{h.personName} — </span>}
          {snippet}
        </p>
        <span className="text-[9px] text-grey shrink-0">
          {new Date(h.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
      </div>
    </button>
  );
}

export function Handoffs() {
  const [handoffs, setHandoffs] = useState<HandoffRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('open,in_progress');
  const [selected, setSelected] = useState<HandoffRecord | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkId = searchParams.get('handoff');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchHandoffs({ status: statusFilter, limit: 100 });
      setHandoffs(res.data);
      setTotal(res.meta.total);
      return res.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load handoffs');
      return null;
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void (async () => {
      const data = await load();
      if (!data) return;
      setSelected(prev => {
        // deep link (?handoff=<id>) wins, then keep the current selection,
        // then auto-select the top row on desktop widths.
        if (deepLinkId) {
          const hit = data.find(h => h.id === deepLinkId);
          if (hit) return hit;
        }
        if (prev) return data.find(h => h.id === prev.id) ?? prev;
        if (data.length > 0 && typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
          return data[0];
        }
        return null;
      });
      if (deepLinkId) setSearchParams({}, { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const refresh = async () => {
    const data = await load();
    if (!data) return;
    setSelected(prev => (prev ? data.find(h => h.id === prev.id) ?? prev : null));
  };

  return (
    <div className="flex h-[calc(100vh-6.5rem)] overflow-hidden text-navy">
      {/* Left: inbox list */}
      <div className={`${selected ? 'hidden md:flex' : 'flex'} w-full md:w-[340px] shrink-0 flex-col border-r border-line bg-card`}>
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-line">
          <MessageSquare size={15} className="text-cyan-500 shrink-0" />
          <h1 className="text-sm font-bold">Handoff Inbox</h1>
          <span className="text-micro text-grey font-mono">{total}</span>
          <div className="flex-1" />
          <Button variant="secondary" size="xs" onClick={() => void refresh()}>
            <RefreshCw size={10} />
          </Button>
        </div>

        <div className="shrink-0 flex flex-wrap gap-1 px-3 py-1.5 border-b border-line">
          {STATUS_OPTIONS.map(s => {
            const isActive = statusFilter.split(',').includes(s);
            return (
              <button
                key={s}
                onClick={() => {
                  const parts = statusFilter.split(',').filter(Boolean);
                  const next = isActive ? parts.filter(x => x !== s) : [...parts, s];
                  setStatusFilter(next.join(','));
                }}
                className={`rounded px-1.5 py-0.5 text-micro font-bold transition-colors ${isActive ? 'bg-cyan-600 text-white' : 'bg-ice-soft dark:bg-ice-soft/5 text-grey hover:bg-ice-soft/50'}`}
              >
                {HANDOFF_STATUS_LABELS[s] ?? s}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && handoffs.length === 0 && <div className="p-3"><CardSkeleton count={6} /></div>}
          {error && <p className="p-3 text-micro text-red-500">{error}</p>}
          {!loading && handoffs.length === 0 && !error && (
            <EmptyState variant="search" title="No handoffs match the current filter" />
          )}
          {handoffs.map(h => (
            <InboxRow key={h.id} h={h} active={selected?.id === h.id} onSelect={() => setSelected(h)} />
          ))}
        </div>
      </div>

      {/* Right: detail pane — same screen, no page swap */}
      <div className={`${selected ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col overflow-y-auto bg-page`}>
        {selected ? (
          <div className="max-w-2xl w-full mx-auto p-4">
            <HandoffDetail
              handoff={selected}
              onBack={() => setSelected(null)}
              onRefresh={() => void refresh()}
            />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              title="Select a handoff"
              description="Pick a reply from the inbox on the left — the full thread, drafts and actions open here without leaving the queue."
            />
          </div>
        )}
      </div>
    </div>
  );
}
