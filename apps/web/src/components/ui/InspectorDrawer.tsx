import { useEffect, useId, useRef, ReactNode } from 'react';
import { useDismissible } from '@/hooks/useDismissible';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

interface InspectorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Esc handler — hosts pass "walk the trail back" instead of hard close. */
  onEscape?: () => void;
  title: string;
  children: ReactNode;
}

export function InspectorDrawer({ isOpen, onClose, onEscape, title, children }: InspectorDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Named from the visible <h2>, not a parallel aria-label — one source of truth.
  const titleId = useId();

  // Escape and focus return are both the dismiss stack's job now. This component
  // was the ONLY one of sixteen overlays that restored focus on close; every other
  // one dropped it to <body>, which restarts Tab from the top of the document.
  // Moving it into the stack is what makes that fix universal instead of a habit
  // each new overlay has to remember.
  // The ref makes this modal: it confines Tab, which is what licenses `aria-modal`.
  useDismissible(isOpen, onEscape ?? onClose, `${title} inspector`, panelRef);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    const raf = requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      document.body.style.overflow = '';
      cancelAnimationFrame(raf);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/10 dark:bg-black/35 backdrop-blur-[1px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Sliding Side Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        /* This drawer is focused on open (below) but had no role, so AT
         * announced the move into an unnamed group. role="dialog" + a name from
         * the header is what makes "the inspector opened, and it is about X"
         * audible.
         *
         * No aria-modal here, but NOT for the reason this comment used to give.
         * It cited Modal.tsx for "nothing in this app traps Tab" — that stopped
         * being true when `lib/dismiss.ts` took over Tab confinement, and
         * Modal.tsx now declares `aria-modal` precisely because it is honest
         * there. This drawer passes `panelRef` to `useDismissible` above, so it
         * traps Tab too and could declare modality on the same grounds.
         *
         * It is left off pending a decision, not a capability: hosts may pass
         * `onEscape` to "walk the trail back" to a PARENT inspector rather than
         * close, so a trail of drawers is a stack of peers the operator moves
         * through — and marking each one modal would tell a screen reader the
         * others no longer exist. Whether that reading is right is an a11y call,
         * not something to settle in a comment. */
        role="dialog"
        aria-labelledby={titleId}
        className={clsx(
          'w-full sm:w-[460px] h-full bg-card border-l border-line shadow-2xl flex flex-col outline-none overflow-hidden animate-slide-in text-navy'
        )}
      >


        {/* Drawer Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-ice-soft dark:bg-ice-soft/10">
          <h2 id={titleId} className="text-base font-bold tracking-tight uppercase font-mono">{title}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-grey hover:bg-ice-soft dark:hover:bg-ice-soft/20 transition-colors"
            aria-label="Close panel"
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 px-4 py-4 overflow-y-auto space-y-4">{children}</div>
      </div>
    </div>
  );
}
