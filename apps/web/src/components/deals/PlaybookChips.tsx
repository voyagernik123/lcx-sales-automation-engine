import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { clsx } from 'clsx';
import type { PlaybookChip } from '@/lib/salesIntel';

/**
 * T·K·L·C·O listing-playbook letter chips (Gong playbook-chip pattern).
 *
 * Empty steps render as outlined grey letters, done steps as filled navy.
 * Clicking the chip row opens a small checklist popover to toggle steps —
 * the parent owns persistence (PATCH with localStorage fallback) and health
 * recompute. `PlaybookChecklist` is exported for inline use (inspector, memo).
 */

export interface PlaybookChipsProps {
  playbook: PlaybookChip[];
  /** Absent → read-only chips (no popover). */
  onToggle?: (key: PlaybookChip['key']) => void;
  /** Show the "saved locally" hint when persistence fell back to localStorage. */
  local?: boolean;
  className?: string;
}

function chipCls(status: PlaybookChip['status']): string {
  return status === 'done'
    ? 'border-navy bg-navy text-card'
    : 'border-line bg-transparent text-grey';
}

export function PlaybookChecklist({
  playbook,
  onToggle,
  local,
}: Pick<PlaybookChipsProps, 'playbook' | 'onToggle' | 'local'>) {
  return (
    <div>
      <ul className="space-y-1">
        {playbook.map(step => {
          const done = step.status === 'done';
          return (
            <li key={step.key}>
              <button
                type="button"
                disabled={!onToggle}
                onClick={e => {
                  e.stopPropagation();
                  onToggle?.(step.key);
                }}
                className={clsx(
                  'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-label transition-colors',
                  onToggle && 'hover:bg-ice-soft dark:hover:bg-ice-soft/10',
                )}
                aria-pressed={done}
              >
                <span
                  className={clsx(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[8px] font-bold',
                    chipCls(step.status),
                  )}
                  aria-hidden="true"
                >
                  {done ? <Check size={9} strokeWidth={3} /> : step.key}
                </span>
                <span className={clsx('min-w-0 truncate', done ? 'text-navy' : 'text-grey')}>{step.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {local && <p className="mt-1.5 text-micro text-grey">Playbook API unavailable — progress saved locally.</p>}
    </div>
  );
}

export function PlaybookChips({ playbook, onToggle, local, className }: PlaybookChipsProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const doneCount = playbook.filter(s => s.status === 'done').length;

  return (
    <div ref={rootRef} className={clsx('relative', className)}>
      <button
        type="button"
        disabled={!onToggle}
        onClick={e => {
          e.stopPropagation();
          if (onToggle) setOpen(o => !o);
        }}
        onKeyDown={e => e.stopPropagation()}
        draggable={false}
        onDragStart={e => {
          // Keep chip interaction from hijacking the card drag.
          e.preventDefault();
          e.stopPropagation();
        }}
        className={clsx('flex items-center gap-0.5 rounded', onToggle && 'cursor-pointer')}
        aria-haspopup={onToggle ? 'dialog' : undefined}
        aria-expanded={onToggle ? open : undefined}
        aria-label={`Listing playbook ${doneCount}/${playbook.length} complete`}
        title={`Listing playbook — ${doneCount}/${playbook.length} done${onToggle ? ' (click to edit)' : ''}`}
      >
        {playbook.map(step => (
          <span
            key={step.key}
            className={clsx(
              'flex h-4 w-4 items-center justify-center rounded border text-[8px] font-bold leading-none',
              chipCls(step.status),
            )}
          >
            {step.key}
          </span>
        ))}
      </button>

      {open && onToggle && (
        <div
          role="dialog"
          aria-label="Listing playbook checklist"
          onClick={e => e.stopPropagation()}
          className="absolute left-0 top-5 z-30 w-56 rounded-lg border border-line bg-card p-2 shadow-xl"
        >
          <div className="mb-1 px-1.5 text-micro font-bold uppercase tracking-wider text-grey">
            Listing playbook · {doneCount}/{playbook.length}
          </div>
          <PlaybookChecklist playbook={playbook} onToggle={onToggle} local={local} />
        </div>
      )}
    </div>
  );
}
