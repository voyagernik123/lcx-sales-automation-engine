import { useEffect, useCallback, useState } from 'react';
import { MessageSquare, ExternalLink, User, RefreshCw, ChevronLeft, MessageCircle, ThumbsUp, ThumbsDown, RotateCcw, Send, Copy } from 'lucide-react';
import { fetchHandoffs, claimHandoff, updateHandoffStatus, addHandoffNote, reEnrollHandoff, fetchReplyDrafts, markHandoffMovedToTelegram, type ReplyDraft } from '@/lib/api/bd';
import { toast } from '@/components/shared/Toast';
import { HANDOFF_STATUS_COLORS, HANDOFF_STATUS_LABELS } from '@/types/bd';
import type { HandoffRecord, HandoffEvent } from '@/types/bd';

const STATUS_OPTIONS = ['open', 'in_progress', 'resolved_won_path', 'resolved_lost', 're_nurture'] as const;

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-bold leading-none ${HANDOFF_STATUS_COLORS[status] ?? ''}`}>
      {HANDOFF_STATUS_LABELS[status] ?? status}
    </span>
  );
}

function HandoffEvents({ events }: { events: HandoffEvent[] }) {
  return (
    <div className="space-y-2">
      {events.map(e => (
        <div key={e.id} className="flex gap-2 text-[10px] border-b border-line last:border-none pb-1.5">
          <span className="text-[9px] font-bold uppercase text-grey shrink-0 w-16">{e.eventType}</span>
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
      {events.length === 0 && <p className="text-[10px] text-grey italic">No events yet</p>}
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
      <button onClick={() => void load()} className="rounded border border-line px-2 py-1 text-[10px] font-bold hover:bg-ice-soft dark:hover:bg-ice-soft/10 flex items-center gap-1">
        <MessageCircle size={10} /> Generate reply drafts
      </button>
    );
  }

  return (
    <div className="rounded border border-line p-2 space-y-2">
      <div className="flex items-center gap-1">
        {drafts.map((d, i) => (
          <button
            key={d.angle}
            onClick={() => pick(i)}
            className={`rounded px-2 py-0.5 text-[9px] font-bold uppercase ${i === active ? 'bg-cyan-600 text-white' : 'border border-line hover:bg-ice-soft dark:hover:bg-ice-soft/10'}`}
          >
            {d.angle}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => void copy()} className="rounded border border-line px-2 py-0.5 text-[9px] font-bold flex items-center gap-1 hover:bg-ice-soft dark:hover:bg-ice-soft/10">
          <Copy size={9} /> {copied ? 'Copied' : 'Copy'}
        </button>
        <button onClick={() => void moved()} disabled={busy} className="rounded bg-sky-600 text-white px-2 py-0.5 text-[9px] font-bold flex items-center gap-1 hover:bg-sky-700 disabled:opacity-50">
          <Send size={9} /> Moved to Telegram
        </button>
      </div>
      {warnings.map((w) => (
        <p key={w} className="text-[9px] text-amber-600">{w}</p>
      ))}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={7}
        className="w-full rounded border border-line p-1.5 text-[10px] leading-relaxed focus:outline-none"
      />
    </div>
  );
}

function HandoffDetail({ handoff, onBack, onRefresh }: { handoff: HandoffRecord; onBack: () => void; onRefresh: () => void }) {
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

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-[10px] font-bold text-grey hover:text-navy dark:hover:text-ice transition-colors">
        <ChevronLeft size={12} /> Back to Inbox
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-sm">{handoff.projectName ?? 'Unknown Project'}</h2>
          <p className="text-[10px] text-grey">
            {handoff.projectTicker && <>{handoff.projectTicker} · </>}
            {handoff.channel} · Trigger: {handoff.triggerReason}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={handoff.status} />
          {handoff.assignedTo && (
            <span className="inline-flex items-center gap-1 text-[9px] text-grey">
              <User size={9} /> {handoff.assignedTo}
            </span>
          )}
        </div>
      </div>

      {handoff.personName && (
        <div className="rounded border border-line p-2 text-[10px] space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-bold">{handoff.personName}</span>
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

      <ReplyDrafts handoffId={handoff.id} onMoved={onRefresh} />

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-1.5">
        {!handoff.assignedTo && (
          <button onClick={handleClaim} disabled={saving === 'claim'} className="rounded bg-cyan-600 text-white px-2 py-1 text-[10px] font-bold hover:bg-cyan-700 transition-colors disabled:opacity-50 flex items-center gap-1">
            <User size={10} /> {saving === 'claim' ? '...' : 'Claim'}
          </button>
        )}
        {availableStatuses.map(s => (
          <button key={s} onClick={() => handleStatusChange(s)} disabled={saving === `status-${s}`} className="rounded border border-line px-2 py-1 text-[10px] font-bold hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors disabled:opacity-50 flex items-center gap-1">
            {s === 'resolved_won_path' && <ThumbsUp size={10} />}
            {s === 'resolved_lost' && <ThumbsDown size={10} />}
            {s === 're_nurture' && <RotateCcw size={10} />}
            {saving === `status-${s}` ? '...' : HANDOFF_STATUS_LABELS[s] ?? s}
          </button>
        ))}
        {showReEnroll && (
          <button onClick={handleReEnroll} disabled={saving === 're-enroll'} className="rounded bg-amber-600 text-white px-2 py-1 text-[10px] font-bold hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center gap-1">
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
          className="flex-1 rounded border border-line px-2 py-1 text-[10px] bg-surface dark:bg-navy-deep focus:outline-none focus:ring-1 focus:ring-cyan-500"
          onKeyDown={e => { if (e.key === 'Enter') handleAddNote(); }}
        />
        <button onClick={handleAddNote} disabled={saving === 'note' || !noteText.trim()} className="rounded bg-cyan-600 text-white px-2 py-1 text-[10px] font-bold hover:bg-cyan-700 transition-colors disabled:opacity-50">
          <MessageCircle size={10} />
        </button>
      </div>

      {/* Events timeline */}
      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-grey mb-2">Timeline</h3>
        <HandoffEvents events={handoff.events ?? []} />
      </div>
    </div>
  );
}

export function Handoffs() {
  const [handoffs, setHandoffs] = useState<HandoffRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('open,in_progress');
  const [selectedHandoff, setSelectedHandoff] = useState<HandoffRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchHandoffs({ status: statusFilter, limit: 100 });
      setHandoffs(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load handoffs');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  if (selectedHandoff) {
    return (
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <HandoffDetail
          handoff={selectedHandoff}
          onBack={() => setSelectedHandoff(null)}
          onRefresh={async () => {
            const res = await fetchHandoffs({ status: statusFilter, limit: 100 });
            setHandoffs(res.data);
            setTotal(res.meta.total);
            const updated = res.data.find(h => h.id === selectedHandoff.id);
            if (updated) setSelectedHandoff(updated);
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-bold text-sm">Human Handoff Queue</h1>
          <p className="text-[10px] text-grey">{total} open handoffs — any reply pauses automation</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded border border-line overflow-hidden">
            {STATUS_OPTIONS.map(s => {
              const isActive = statusFilter.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => {
                    const others = STATUS_OPTIONS.filter(x => x !== s).filter(x => statusFilter.includes(x));
                    setSelectedHandoff(null);
                    setStatusFilter(isActive ? others.join(',') : [...statusFilter.split(',').filter(Boolean), s].join(','));
                  }}
                  className={`px-2 py-1 text-[10px] font-bold transition-colors ${isActive ? 'bg-cyan-600 text-white' : 'bg-ice-soft dark:bg-ice-soft/5 text-grey hover:bg-ice-soft/50'}`}
                >
                  {HANDOFF_STATUS_LABELS[s] ?? s}
                </button>
              );
            })}
          </div>
          <button onClick={load} className="rounded border border-line px-2 py-1 text-[10px] font-bold hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors flex items-center gap-1">
            <RefreshCw size={10} /> Refresh
          </button>
        </div>
      </div>

      {loading && handoffs.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
        </div>
      )}

      {error && <p className="text-[10px] text-red-500">{error}</p>}

      {!loading && handoffs.length === 0 && !error && (
        <div className="text-center py-12">
          <MessageSquare size={24} className="mx-auto text-grey mb-2" />
          <p className="text-[10px] text-grey">No handoffs match the current filter</p>
        </div>
      )}

      {handoffs.length > 0 && (
        <div className="space-y-1">
          {handoffs.map(h => (
            <button
              key={h.id}
              onClick={() => setSelectedHandoff(h)}
              className="w-full text-left rounded border border-line p-2 hover:bg-ice-soft dark:hover:bg-ice-soft/5 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-[10px] truncate">{h.projectName ?? 'Unknown'}</span>
                  {h.projectTicker && <span className="text-[9px] text-grey shrink-0">{h.projectTicker}</span>}
                  <span className={`inline-flex rounded px-1 py-0.5 text-[8px] font-bold leading-none ${h.channel === 'linkedin' ? 'text-cyan-600 bg-cyan-50 dark:bg-cyan-950/30' : 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30'}`}>
                    {h.channel}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={h.status} />
                  {h.assignedTo && <span className="text-[9px] text-grey flex items-center gap-1"><User size={8} />{h.assignedTo}</span>}
                  <span className="text-[9px] text-grey">{new Date(h.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              {h.personName && <p className="text-[9px] text-grey mt-0.5">{h.personName}{h.personEmail ? ` · ${h.personEmail}` : ''}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
