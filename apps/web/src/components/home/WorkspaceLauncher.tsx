import { useNavigate } from 'react-router-dom';
import { Command, Target, Radar, Scale, Rocket, Shield, Lock, type LucideIcon } from 'lucide-react';
import { WORKSPACES, capAtLeast, type WorkspaceId } from '@lcx/shared';
import { useAccessStore } from '@/stores/useAccessStore';

const ICONS: Record<WorkspaceId, LucideIcon> = {
  command: Command,
  sales: Target,
  intel: Radar,
  regulatory: Scale,
  distribution: Rocket,
  governance: Shield,
};

/**
 * MY DESK v2 (LCX OS, Phase 1) — the launcher strip: your workspaces as decks
 * you step onto. Entitled ones open on their landing surface; locked ones lead
 * to the request-access flow (need-to-know is visible, never hidden).
 */
export function WorkspaceLauncher() {
  const navigate = useNavigate();
  const me = useAccessStore((s) => s.me);
  const setActiveWorkspace = useAccessStore((s) => s.setActiveWorkspace);

  return (
    <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {WORKSPACES.map((w) => {
        const entitled = !me || capAtLeast(me.entitlements[w.id], 'view');
        const Icon = ICONS[w.id];
        return (
          <button
            key={w.id}
            onClick={() => {
              if (entitled) setActiveWorkspace(w.id);
              navigate(w.defaultLanding);
            }}
            title={w.mission}
            className={`group flex flex-col items-start gap-1.5 rounded-lg border p-2.5 text-left transition-colors ${
              entitled
                ? 'border-line bg-card shadow-card hover:border-cyan-500/50'
                : 'border-dashed border-line bg-page opacity-70 hover:opacity-100'
            }`}
          >
            <span className="flex w-full items-center justify-between">
              <Icon size={15} className={entitled ? 'text-cyan-600 dark:text-cyan-400' : 'text-grey'} />
              {!entitled && <Lock size={11} className="text-grey" />}
            </span>
            <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-navy">{w.name}</span>
          </button>
        );
      })}
    </div>
  );
}
