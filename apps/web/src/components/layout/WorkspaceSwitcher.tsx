import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Check, Lock } from 'lucide-react';
import { clsx } from 'clsx';
import { WORKSPACES, capAtLeast } from '@lcx/shared';
import { useAccessStore } from '@/stores/useAccessStore';
import { useArrivalStore } from '@/lib/useArrival';

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
  // THE ROOMS (S4): per compartment held, how much changed since the operator last looked — read from
  // the one arrival store, lit as a STILL dot in the state colour with its count. A room they do not
  // hold has no key and shows nothing, which is need-to-know made visible rather than a quiet zero.
  const rooms = useArrivalStore((s) => s.watch?.byWorkspace ?? null);
  const litTotal = rooms ? Object.values(rooms).reduce((n, r) => n + (r?.changed ?? 0), 0) : 0;

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
        {litTotal > 0 && (
          <span
            className="rounded bg-status-conditional/15 px-1 font-mono text-[10px] font-bold text-status-conditional"
            title={`${litTotal} change${litTotal === 1 ? '' : 's'} across your rooms since you last looked`}
            data-testid="rooms-lit"
          >
            {litTotal}
          </span>
        )}
        <ChevronDown size={12} className={clsx('text-grey transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-md border border-line bg-card p-1 shadow-card" role="listbox">
          {WORKSPACES.map((w) => {
            const entitled = !me || capAtLeast(me.entitlements[w.id], 'view');
            const isActive = w.id === activeWorkspace;
            const room = rooms?.[w.id] ?? null;
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
                  <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-navy">
                    {w.name}
                    {room && room.changed > 0 && (
                      <span
                        className="flex items-center gap-1 text-[10px] font-medium normal-case tracking-normal text-status-conditional"
                        title={room.top ? `${room.top.kind}: ${room.top.title}` : undefined}
                        data-testid={`room-lit-${w.id}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-status-conditional" aria-hidden="true" />
                        {room.changed}
                      </span>
                    )}
                  </span>
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
