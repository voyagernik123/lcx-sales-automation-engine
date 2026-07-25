import { useEffect, useRef, useState } from 'react';
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
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) setReason('');
  }, [open]);

  /**
   * WHY THIS IS NOT `autoFocus`, which is one attribute and reads better.
   *
   * `autoFocus` is applied by React in the COMMIT's mutation phase — measured, not
   * assumed: it lands before the textarea's own layout effect, let alone any passive
   * one. `Modal` registers with `lib/dismiss` in a passive effect, and
   * `pushDismissible` snapshots `document.activeElement` there as the origin to hand
   * focus back to on close. With `autoFocus`, that snapshot was THIS TEXTAREA — a
   * node that is unmounted moments later — so `flushRestore` found a disconnected
   * origin, bailed, and left focus orphaned on `<body>`. After which Tab restarts at
   * the top of the document and a keyboard operator has lost their place: the exact
   * defect `lib/dismiss.ts` calls the worst keyboard bug in the app, reintroduced
   * through the back door by an attribute.
   *
   * Passive effects run child-first, so moving the focus here puts it strictly AFTER
   * the Modal's push: the origin is now the queue row the operator pressed `d` on,
   * and the field still ends up focused before the operator can type. Modal's own
   * container-focus rAF sees focus already inside and stands down.
   */
  useEffect(() => {
    if (open) fieldRef.current?.focus();
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
                ? 'rounded-full border border-cyan-500 bg-cyan-500/10 px-2 py-0.5 text-micro font-bold text-cyan-700 dark:text-cyan-400'
                : 'rounded-full border border-line px-2 py-0.5 text-micro font-bold text-grey hover:text-navy hover:border-navy/30 transition-colors'
            }
          >
            {r}
          </button>
        ))}
      </div>
      <textarea
        ref={fieldRef}
        value={reason}
        onChange={e => setReason(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
        }}
        rows={2}
        placeholder="Reason (required)…"
        className="w-full rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 py-1.5 text-xs outline-none focus:border-cyan-500 transition-colors resize-none"
      />
    </Modal>
  );
}
