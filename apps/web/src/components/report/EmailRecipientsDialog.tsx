import { useState, useRef } from 'react';
import { Mail, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { useDismissible } from '@/hooks/useDismissible';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 5;

export interface EmailRecipientsDialogProps {
  open: boolean;
  onClose: () => void;
  /** Resolves on success; the dialog closes itself. Rejections are surfaced by the caller. */
  onSend: (recipients: string[]) => Promise<void>;
}

/** Small modal that collects up to five exec email addresses and sends the report. */
export function EmailRecipientsDialog({ open, onClose, onSend }: EmailRecipientsDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // This dialog declared `aria-modal="true"` and registered with nothing, so Escape did
  // nothing at all on it — a modal that claims the rest of the document is unavailable
  // and cannot be dismissed by the key everyone tries first. Found by the Phase 7 audit
  // grepping the `fixed inset-0` set against the `useDismissible` set.
  useDismissible(open, onClose, 'email recipients', panelRef);
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  if (!open) return null;

  const parse = (): string[] | null => {
    const emails = raw
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      setError('Enter at least one email address.');
      return null;
    }
    if (emails.length > MAX_RECIPIENTS) {
      setError(`Maximum ${MAX_RECIPIENTS} recipients.`);
      return null;
    }
    const bad = emails.find((e) => !EMAIL_RE.test(e));
    if (bad) {
      setError(`"${bad}" is not a valid email address.`);
      return null;
    }
    return emails;
  };

  const handleSend = async () => {
    const emails = parse();
    if (!emails) return;
    setError(null);
    setSending(true);
    try {
      await onSend(emails);
      setRaw('');
      onClose();
    } catch {
      // The caller surfaces the error (toast / demo banner); keep the dialog open.
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="br-no-print fixed inset-0 z-[90] flex items-center justify-center bg-navy/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Email report to execs"
    >
      <div className="w-full max-w-md rounded-xl border border-line/70 bg-card p-4 shadow-overlay">
        <div className="mb-3 flex items-center gap-2">
          <Mail size={15} className="text-accent-icon" />
          <h3 className="text-sm font-bold text-navy">Email report to execs</h3>
          <button
            onClick={onClose}
            className="ml-auto rounded p-1 text-grey hover:text-navy"
            aria-label="Close dialog"
          >
            <X size={14} />
          </button>
        </div>
        <label className="mb-1 block text-label font-semibold text-grey" htmlFor="br-recipients">
          Recipients (comma-separated, max {MAX_RECIPIENTS})
        </label>
        <textarea
          id="br-recipients"
          value={raw}
          onChange={(e) => { setRaw(e.target.value); setError(null); }}
          rows={3}
          placeholder="ceo@lcx.com, cfo@lcx.com"
          className="w-full rounded-lg border border-line bg-page px-2 py-1.5 text-xs text-navy outline-none focus:border-cyan-500"
        />
        {error && <p className="mt-1 text-label font-semibold text-red-500">{error}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} className="text-grey">
            Cancel
          </Button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-cyan-600 disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send report'}
          </button>
        </div>
      </div>
    </div>
  );
}
