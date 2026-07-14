import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storage } from '@/lib/persistence';
import { STORAGE_KEYS } from '@/lib/storage';

export interface Operator {
  id: string;
  name: string;
  initials: string;
  /** One of the validated chart CSS vars — keeps identity colors on-brand. */
  colorVar: string;
}

/**
 * The five people this internal tool is shared with today. No real auth yet
 * (emails/SSO land later) — this is a lightweight "who's driving" switch so
 * the dashboard can greet the right person and, later, attribute their work.
 */
export const OPERATORS: Operator[] = [
  { id: 'monty', name: 'Monty', initials: 'M', colorVar: 'var(--chart-2)' },
  { id: 'sam', name: 'Sam', initials: 'S', colorVar: 'var(--chart-3)' },
  { id: 'nik', name: 'Nik', initials: 'N', colorVar: 'var(--chart-1)' },
  { id: 'rida', name: 'Rida', initials: 'R', colorVar: 'var(--chart-5)' },
  { id: 'jatin', name: 'Jatin', initials: 'J', colorVar: 'var(--chart-8)' },
];

interface OperatorStore {
  operator: Operator | null;
  setOperator: (op: Operator) => void;
  clearOperator: () => void;
}

export const useOperatorStore = create<OperatorStore>()(
  persist(
    set => ({
      operator: null,
      setOperator: op => set({ operator: op }),
      clearOperator: () => set({ operator: null }),
    }),
    {
      name: STORAGE_KEYS.OPERATOR,
      storage: createJSONStorage(() => ({
        getItem: n => JSON.stringify(storage.get(n, null)),
        setItem: (n, v) => storage.set(n, JSON.parse(v)),
        removeItem: n => storage.remove(n),
      })),
    },
  ),
);
