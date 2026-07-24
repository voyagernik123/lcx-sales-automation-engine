import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Check, Lock } from 'lucide-react';
import { clsx } from 'clsx';
import { WORKSPACES, capAtLeast } from '@lcx/shared';
import { useAccessStore } from '@/stores/useAccessStore';

/**
 * LCX OS workspace switcher (Phase 1) — the one control that answers
 * "which platform am I flying?". Entitled workspaces switch and land on their
 * deck; unentitled ones render locked and deep-link to the request-access
 * surface (need-to-know made visible, never a dead end).
 */
export function WorkspaceSwitcher() {
  const navigate = useNavigate();
  const me = useAccessStore((s) => s.me);
  const activeWorkspace = useAccessStore((s) => s.activeWorkspace);
  const setActiveWorkspace = useAccessStore((s) => s.setActiveWorkspace);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const active = WORKSPACES.find((w) => w.id === activeWorkspace) ?? null;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-line bg-page px-2 py-1 text-[11px] font-semibold tracking-wide text-navy hover:border-cyan-500/50"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch workspace"
      >
        <span className="font-mono uppercase">{active ? active.name : 'Workspaces'}</span>
        <ChevronDown size={12} className={clsx('text-grey transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-md border border-line bg-card p-1 shadow-card" role="listbox">
          {WORKSPACES.map((w) => {
            const entitled = !me || capAtLeast(me.entitlements[w.id], 'view');
            const isActive = w.id === activeWorkspace;
            return (
              <button
                key={w.id}
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  setOpen(false);
                  if (entitled) {
                    setActiveWorkspace(w.id);
                    navigate(w.defaultLanding);
                  } else {
                    navigate(w.defaultLanding); // guard renders the request-access surface
                  }
                }}
                className={clsx(
                  'flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-ice-soft/60 dark:hover:bg-ice-soft/10',
                  !entitled && 'opacity-60',
                )}
              >
                <span className="mt-0.5 w-3.5 shrink-0">
                  {isActive ? <Check size={13} className="text-cyan-600 dark:text-cyan-400" /> : !entitled ? <Lock size={12} className="text-grey" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block font-mono text-[11px] font-bold uppercase tracking-wide text-navy">{w.name}</span>
                  <span className="block truncate text-[10px] text-grey">{w.mission}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
