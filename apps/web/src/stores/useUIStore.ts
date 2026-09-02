import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storage } from '@/lib/persistence';
import { STORAGE_KEYS } from '@/lib/storage';

interface UIStore {
  sidebarCollapsed: boolean;
  darkMode: boolean;
  /**
   * `⌘\` — is the evidence pane docked beside the surface instead of over it (T1 #12)?
   *
   * It lives HERE rather than in `useInspectorStore` because it is a workstyle
   * preference about the shell's layout, like `sidebarCollapsed` two lines up, not a
   * property of whatever object happens to be inspected — and this store is already
   * persisted through `lib/persistence`, so it is operator-scoped for free. Phase 2
   * fixed a real leak where UI state was not (see persistenceScope.test.ts); a second
   * hand-rolled persistence site would be the way that leak comes back.
   *
   * Whether the pane is USABLE is a separate question the viewport answers — see
   * `canSplitAt` in lib/split.ts. This flag is only the operator's intent.
   */
  evidenceDocked: boolean;
  toggleSidebar: () => void;
  toggleDarkMode: () => void;
  setEvidenceDocked: (docked: boolean) => void;
}
export const useUIStore = create<UIStore>()(persist(set => ({
  /* DARK BY DEFAULT (THE PRODUCTION, P1): the lit stage reads against black the way a cinema does; light is one toggle away. */
  sidebarCollapsed: false, darkMode: true, evidenceDocked: false,
  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleDarkMode: () => set(s => { const n=!s.darkMode; document.documentElement.classList.toggle('dark', n); return { darkMode: n }; }),
  setEvidenceDocked: (evidenceDocked) => set({ evidenceDocked }),
}), {
  name: STORAGE_KEYS.UI,
  /* Operators who never touched the toggle have `darkMode: false` PERSISTED — the old default, written by persist on
   * the first set. Version 1 flips that stored default to dark ONCE; a later toggle persists at v1 and is honoured. */
  version: 1,
  migrate: (persisted, from) => (from < 1 && persisted && typeof persisted === 'object' ? { ...(persisted as object), darkMode: true } : persisted) as never,
  storage: createJSONStorage(() => ({
    getItem: (n) => JSON.stringify(storage.get(n, null)),
    setItem: (n, v) => storage.set(n, JSON.parse(v)),
    removeItem: (n) => storage.remove(n),
  })),
}));
