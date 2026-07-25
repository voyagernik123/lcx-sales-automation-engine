import { useEffect, useState } from 'react';
import { Moon } from 'lucide-react';
import { Button } from '@/components/ui';
import { isTypingTarget } from './logic';
import { isCommandOpen } from '@/lib/keyboard';

interface SnoozeMenuProps {
  open: boolean;
  leadName: string;
  onClose: () => void;
  /** Called with either {days} (quick picks) or {until} (custom date, ISO). */
  onSnooze: (opts: { days?: number; until?: string }) => void;
}

const QUICK_DAYS = [1, 3, 7];

/**
 * Linear-style snooze picker: 1d / 3d / 7d quick keys or a custom wake date
 * (wakes at 09:00 local). Rendered as a small centered layer so it works from
 * both the table and session mode.
 */
export function SnoozeMenu({ open, leadName, onClose, onSnooze }: SnoozeMenuProps) {
  const [customDate, setCustomDate] = useState('');

  useEffect(() => {
    if (!open) setCustomDate('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // The command line is a higher-priority overlay: while it is open it owns
        // Escape. Without this, our capture-phase stopPropagation swallows the key
        // and one Escape closes two things at once.
        if (isCommandOpen()) return;
        e.stopPropagation();
        onClose();
        return;
      }
      if (isTypingTarget(e.target)) return;
      const days = Number(e.key);
      if (QUICK_DAYS.includes(days)) {
        e.preventDefault();
        onSnooze({ days });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose, onSnooze]);

  if (!open) return null;

  const minDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/30 backdrop-blur-[1px] p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-72 rounded-lg border border-line bg-card shadow-overlay p-3 text-navy">
        <p className="flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
          <Moon size={11} /> Snooze
        </p>
        <p className="text-xs font-semibold mb-2 truncate" title={leadName}>{leadName}</p>
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          {QUICK_DAYS.map(d => (
            <button
              key={d}
              onClick={() => onSnooze({ days: d })}
              className="flex items-center justify-center gap-1.5 rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 py-1.5 text-xs font-bold hover:border-cyan-500 transition-colors"
            >
              {d}d
              <kbd className="rounded border border-line px-1.5 font-mono text-micro text-grey leading-4">{d}</kbd>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            min={minDate}
            value={customDate}
            onChange={e => setCustomDate(e.target.value)}
            className="flex-1 rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 py-1 text-xs outline-none focus:border-cyan-500 transition-colors"
            aria-label="Custom wake date"
          />
          <Button
            size="xs"
            variant="secondary"
            disabled={!customDate}
            onClick={() => onSnooze({ until: new Date(`${customDate}T09:00:00`).toISOString() })}
          >
            Until
          </Button>
        </div>
        <p className="text-micro text-grey mt-2 leading-tight">
          Snoozed leads leave the working set and resurface in Follow-ups when they wake.
        </p>
      </div>
    </div>
  );
}
