import { useEffect, useRef, ReactNode } from 'react';
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

  // Escape and focus return are both the dismiss stack's job now. This component
  // was the ONLY one of sixteen overlays that restored focus on close; every other
  // one dropped it to <body>, which restarts Tab from the top of the document.
  // Moving it into the stack is what makes that fix universal instead of a habit
  // each new overlay has to remember.
  useDismissible(isOpen, onEscape ?? onClose, `${title} inspector`);

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
        className={clsx(
          'w-full sm:w-[460px] h-full bg-card border-l border-line shadow-2xl flex flex-col outline-none overflow-hidden animate-slide-in text-navy'
        )}
      >


        {/* Drawer Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-ice-soft dark:bg-ice-soft/10">
          <h2 className="text-base font-bold tracking-tight uppercase font-mono">{title}</h2>
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
