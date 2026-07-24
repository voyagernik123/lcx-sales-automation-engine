import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { capAtLeast, workspaceForPath, type Capability, type EntitlementMap, type WorkspaceId } from '@lcx/shared';
import { fetchAccessMe, type AccessMe, type AccessWorkspaceMeta } from '@/lib/api/access';
import { storage } from '@/lib/persistence';

/**
 * LCX OS access store (LCX ONE Phase 1) — the client's copy of the server's
 * answer to "who are you and what do you need?".
 *
 * The SERVER is authoritative (requireWorkspace + registry gates); this store
 * only shapes the shell: which workspaces appear in the switcher, which nav
 * tree renders, and whether a route shows its page or the request-access
 * surface. Until the first load resolves we render optimistically — the API
 * will still 403 anything that shouldn't happen, and the shell then converges.
 */
interface AccessStore {
  loaded: boolean;
  me: AccessMe | null;
  activeWorkspace: WorkspaceId | null;
  load: () => Promise<void>;
  setActiveWorkspace: (ws: WorkspaceId) => void;
  /** Route-driven sync: entering a workspace's page fronts that workspace. */
  syncFromPath: (pathname: string) => void;
  reset: () => void;
}

export const useAccessStore = create<AccessStore>()(
  persist(
    (set, get) => ({
      loaded: false,
      me: null,
      activeWorkspace: null,
      load: async () => {
        try {
          const me = await fetchAccessMe();
          set({ me, loaded: true });
          // First sign-in (or a revoked front workspace): land on an entitled one.
          const { activeWorkspace } = get();
          if (!activeWorkspace || !capAtLeast(me.entitlements[activeWorkspace], 'view')) {
            const first = me.workspaces.find((w) => capAtLeast(me.entitlements[w.id], 'view'));
            if (first) set({ activeWorkspace: first.id });
          }
        } catch {
          // Network or auth hiccup: keep the previous picture; the shell stays
          // usable and the API remains the enforcer.
          set({ loaded: true });
        }
      },
      setActiveWorkspace: (ws) => set({ activeWorkspace: ws }),
      syncFromPath: (pathname) => {
        const ws = workspaceForPath(pathname);
        if (!ws || ws === get().activeWorkspace) return;
        const me = get().me;
        // Optimistic before first load (server still enforces); strict after.
        if (!me || capAtLeast(me.entitlements[ws], 'view')) {
          set({ activeWorkspace: ws });
        }
      },
      reset: () => set({ loaded: false, me: null, activeWorkspace: null }),
    }),
    {
      name: 'access',
      version: 1,
      storage: createJSONStorage(() => ({
        getItem: (n) => JSON.stringify(storage.get(n, null)),
        setItem: (n, v) => storage.set(n, JSON.parse(v)),
        removeItem: (n) => storage.remove(n),
      })),
      // Only the workspace choice persists; entitlements are re-fetched fresh.
      partialize: (s) => ({ activeWorkspace: s.activeWorkspace }) as Partial<AccessStore>,
    },
  ),
);

/* Selector helpers — components ask questions, not for raw maps. */

export function useEntitlements(): EntitlementMap {
  return useAccessStore((s) => s.me?.entitlements) ?? {};
}

export function useCan(ws: WorkspaceId | null, cap: Capability = 'view'): boolean {
  const me = useAccessStore((s) => s.me);
  const loaded = useAccessStore((s) => s.loaded);
  if (!ws) return true; // desk-level surfaces are always yours
  if (!loaded || !me) return true; // optimistic until first load; server still enforces
  return capAtLeast(me.entitlements[ws], cap);
}

export function useMyWorkspaces(): AccessWorkspaceMeta[] {
  const me = useAccessStore((s) => s.me);
  if (!me) return [];
  return me.workspaces.filter((w) => capAtLeast(me.entitlements[w.id], 'view'));
}
