import { useEffect, useRef, ReactNode } from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

interface InspectorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function InspectorDrawer({ isOpen, onClose, title, children }: InspectorDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setTimeout(() => {
        panelRef.current?.focus();
      }, 50);
      document.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      if (isOpen) {
        document.body.style.overflow = '';
      }
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

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
          'w-full sm:w-[460px] h-full bg-card border-l border-line shadow-2xl flex flex-col outline-none overflow-hidden animate-slide-in text-navy dark:text-ice'
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
