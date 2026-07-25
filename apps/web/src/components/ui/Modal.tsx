import { useEffect, useId, useRef, ReactNode } from 'react';
import { useDismissible } from '@/hooks/useDismissible';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Modal({ isOpen, onClose, title, children, footer, className }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Ties the panel to the <h2> it already renders, so the dialog's accessible
  // name comes from the visible heading rather than a duplicated aria-label
  // that can drift out of sync with it.
  const titleId = useId();

  // Escape belongs to the dismiss stack, which closes the TOP overlay only. A
  // listener here would fire even when this modal sits under a newer one.
  // The ref makes this modal: it confines Tab, which is what licenses `aria-modal`.
  useDismissible(isOpen, onClose, `${title} dialog`, dialogRef);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    // A frame, not a 50ms timeout: the delay only ever needed to outlast the
    // mount, and a magic number that happens to work is a race waiting for a
    // slower machine.
    const raf = requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      document.body.style.overflow = '';
      cancelAnimationFrame(raf);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        /* Without role="dialog" this is an anonymous <div> to a screen reader:
         * the panel is announced as nothing, and the operator gets no signal
         * that a layer opened over the page.
         *
         * `aria-modal` is now honest. The Phase 7 audit measured that no overlay in
         * this app contained Tab — with the Manual open, one Shift+Tab reached the
         * "Retry" and "Refresh" buttons on the page behind it — and correctly refused
         * to declare modality it could not back up: per the ARIA practices, claiming
         * it makes the author responsible for focus, and claiming it falsely scopes a
         * screen reader's virtual cursor to a dialog the tab ring can still leave.
         * `lib/dismiss.ts` now traps Tab for whichever entry is on top, so the
         * declaration and the behaviour agree. Passing `dialogRef` to
         * `useDismissible` above is what turns it on. */
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={clsx(
          'relative w-full max-w-lg rounded-lg border border-line bg-card shadow-xl p-0 outline-none overflow-hidden t-panel text-navy',
          className
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-ice-soft dark:bg-ice-soft/10">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-grey hover:bg-ice-soft dark:hover:bg-ice-soft/20"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-4 py-3 max-h-[75vh] overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-4 py-3 border-t border-line flex justify-end gap-2 bg-ice-soft dark:bg-ice-soft/10">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
