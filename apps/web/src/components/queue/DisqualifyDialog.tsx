import { useEffect, useState } from 'react';
import { Modal, Button } from '@/components/ui';

interface DisqualifyDialogProps {
  open: boolean;
  leadName: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

const QUICK_REASONS = [
  'Dead project',
  'No listing fit',
  'Regulatory risk',
  'Already listed elsewhere',
  'Unresponsive',
];

/**
 * Reason-capturing disqualify dialog (replaces window.prompt-style capture).
 * A disqualify without a why is a dead end — the reason is required.
 */
export function DisqualifyDialog({ open, leadName, onClose, onConfirm }: DisqualifyDialogProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) setReason('');
  }, [open]);

  const submit = () => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Disqualify lead"
      footer={
        <>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" variant="danger" disabled={!reason.trim()} onClick={submit}>
            Disqualify
          </Button>
        </>
      }
    >
      <p className="text-xs text-grey-dark mb-2">
        <span className="font-bold text-navy">{leadName}</span> will be suppressed from the queue.
        Capture the why — it feeds win/loss analysis.
      </p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {QUICK_REASONS.map(r => (
          <button
            key={r}
            onClick={() => setReason(r)}
            className={
              reason === r
                ? 'rounded-full border border-cyan-500 bg-cyan-500/10 px-2 py-0.5 text-micro font-bold text-cyan-600 dark:text-cyan-400'
                : 'rounded-full border border-line px-2 py-0.5 text-micro font-bold text-grey hover:text-navy hover:border-navy/30 transition-colors'
            }
          >
            {r}
          </button>
        ))}
      </div>
      <textarea
        value={reason}
        onChange={e => setReason(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
        }}
        rows={2}
        autoFocus
        placeholder="Reason (required)…"
        className="w-full rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 py-1.5 text-xs outline-none focus:border-cyan-500 transition-colors resize-none"
      />
    </Modal>
  );
}
