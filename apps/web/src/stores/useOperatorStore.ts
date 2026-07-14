import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { OPERATOR_ROSTER } from '@lcx/shared';
import { storage } from '@/lib/persistence';
import { STORAGE_KEYS } from '@/lib/storage';

export interface Operator {
  id: string;
  name: string;
  email: string;
  initials: string;
  /** One of the validated chart CSS vars — keeps identity colors on-brand. */
  colorVar: string;
}

const COLOR_BY_ID: Record<string, string> = {
  monty: 'var(--chart-2)',
  sam: 'var(--chart-3)',
  nik: 'var(--chart-1)',
  rida: 'var(--chart-5)',
  jatin: 'var(--chart-8)',
};

/**
 * The five people this internal tool is shared with today, decorated with
 * display color/initials on top of the canonical roster in @lcx/shared
 * (which also gates real Google logins to these exact emails).
 */
export const OPERATORS: Operator[] = OPERATOR_ROSTER.map(o => ({
  id: o.id,
  name: o.name,
  email: o.email,
  initials: o.name.charAt(0).toUpperCase(),
  colorVar: COLOR_BY_ID[o.id] ?? 'var(--chart-1)',
}));

interface OperatorStore {
  operator: Operator | null;
  /** Set when a Google login succeeds but isn't an @lcx.com address. */
  authError: string | null;
  setOperator: (op: Operator) => void;
  clearOperator: () => void;
  setAuthError: (msg: string | null) => void;
}

export const useOperatorStore = create<OperatorStore>()(
  persist(
    set => ({
      operator: null,
      authError: null,
      setOperator: op => set({ operator: op, authError: null }),
      clearOperator: () => set({ operator: null }),
      setAuthError: msg => set({ authError: msg }),
    }),
    {
      name: STORAGE_KEYS.OPERATOR,
      // authError is transient UI state — never persist it, only the identity.
      partialize: state => ({ operator: state.operator }),
      storage: createJSONStorage(() => ({
        getItem: n => JSON.stringify(storage.get(n, null)),
        setItem: (n, v) => storage.set(n, JSON.parse(v)),
        removeItem: n => storage.remove(n),
      })),
    },
  ),
);
