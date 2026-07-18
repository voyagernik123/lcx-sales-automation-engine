import { useEffect, useState } from 'react';
import { Sparkles, Copy, Check, Save, X } from 'lucide-react';
import { fetchPlay, savePlay, type PlayDraft } from '@/lib/api/intel';
import { toast } from '@/components/shared';

/**
 * Draft outreach (Wave 4) — the signal→play payoff. Opens on a target, shows
 * the play the intelligence picked, the evidence it's grounded in, and a
 * ready-to-send personalized draft. Copy it or save it to the assisted-send
 * drafts (human review always — never auto-sent).
 */

export function DraftPanel({ subjectId, onClose }: { subjectId: string; onClose: () => void }) {
  const [play, setPlay] = useState<PlayDraft | null | 'loading' | 'error'>('loading');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPlay('loading');
    fetchPlay(subjectId)
      .then((d) => !cancelled && setPlay(d ?? 'error'))
      .catch(() => !cancelled && setPlay('error'));
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const doCopy = async () => {
    if (typeof play !== 'object' || !play) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${play.draft.subject}\n\n${play.draft.body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast('error', 'Copy failed');
    }
  };

  const doSave = async () => {
    setSaving(true);
    try {
      await savePlay(subjectId);
      setSaved(true);
      toast('success', 'Draft saved for review');
    } catch {
      toast('error', 'Could not save draft');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="animate-fadeIn fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-6 backdrop-blur-sm dark:bg-black/60"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Draft outreach"
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-line bg-card shadow-overlay"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
            <Sparkles size={13} /> Draft outreach
          </div>
          <button onClick={onClose} className="text-grey hover:text-navy" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {play === 'loading' ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-6 animate-pulse rounded bg-ice-soft/60 dark:bg-ice-soft/10" />
            ))}
          </div>
        ) : play === 'error' || !play ? (
          <p className="p-4 text-label text-grey">Couldn’t build a draft for this target.</p>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {/* Play + rationale */}
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
                  {play.playLabel}
                </span>
                <span className="text-micro text-grey">{play.rationale}</span>
              </div>

              {/* Evidence */}
              {play.evidence.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="text-micro font-semibold text-grey">Briefed on:</span>
                  {play.evidence.map((e) => (
                    <span key={e} className="rounded border border-line px-1.5 py-px text-[10px] text-grey">{e}</span>
                  ))}
                </div>
              )}

              {/* Draft */}
              <div className="mt-3 rounded-lg border border-line bg-page p-3">
                <div className="text-micro font-bold uppercase tracking-wider text-grey">Subject</div>
                <div className="mb-2 text-label font-semibold text-navy">{play.draft.subject}</div>
                <div className="text-micro font-bold uppercase tracking-wider text-grey">Body</div>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-label leading-relaxed text-navy">{play.draft.body}</pre>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 border-t border-line px-4 py-3">
              <button
                onClick={doSave}
                disabled={saving || saved}
                className="flex items-center gap-1.5 rounded-lg bg-navy px-3 py-2 text-label font-semibold text-card transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saved ? <Check size={13} /> : <Save size={13} />}
                {saved ? 'Saved for review' : saving ? 'Saving…' : 'Save to drafts'}
              </button>
              <button
                onClick={doCopy}
                className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-label font-medium text-grey transition-colors hover:text-navy"
              >
                {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <span className="ml-auto text-[10px] text-grey">Human review · never auto-sent</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
