import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storage } from '@/lib/persistence';
import { STORAGE_KEYS } from '@/lib/storage';

interface UIStore { sidebarCollapsed: boolean; darkMode: boolean; toggleSidebar: () => void; toggleDarkMode: () => void; }
export const useUIStore = create<UIStore>()(persist(set => ({
  sidebarCollapsed: false, darkMode: false,
  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleDarkMode: () => set(s => { const n=!s.darkMode; document.documentElement.classList.toggle('dark', n); return { darkMode: n }; }),
}), {
  name: STORAGE_KEYS.UI,
  storage: createJSONStorage(() => ({
    getItem: (n) => JSON.stringify(storage.get(n, null)),
    setItem: (n, v) => storage.set(n, JSON.parse(v)),
    removeItem: (n) => storage.remove(n),
  })),
}));
