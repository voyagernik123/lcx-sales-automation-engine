import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storage } from '@/lib/persistence';
import { STORAGE_KEYS } from '@/lib/storage';

/**
 * Roles (FINAL_MASTER_PLAN 5.2). Approver-gated actions render
 * disabled-with-reason for operators, never hidden — governance is visible.
 * viewer < operator < approver (approver ⊇ operator rights).
 */
export type OperatorRole = 'viewer' | 'operator' | 'approver';

export interface Operator {
  id: string;
  name: string;
  initials: string;
  /** One of the validated chart CSS vars — keeps identity colors on-brand. */
  colorVar: string;
  role: OperatorRole;
}

/** Does this operator hold at least the required role? */
export function hasRole(op: Operator | null, min: OperatorRole): boolean {
  const rank: Record<OperatorRole, number> = { viewer: 0, operator: 1, approver: 2 };
  return !!op && rank[op.role] >= rank[min];
}

export const ROLE_LABEL: Record<OperatorRole, string> = {
  viewer: 'Viewer',
  operator: 'Operator',
  approver: 'Approver',
};

/**
 * The five people this internal tool is shared with today. No real auth yet
 * (emails/SSO land later) — this is a lightweight "who's driving" switch so
 * the dashboard can greet the right person and attribute their work. Desk
 * leads carry approver rights (deal close, invoice sign-off).
 */
export const OPERATORS: Operator[] = [
  { id: 'monty', name: 'Monty', initials: 'M', colorVar: 'var(--chart-2)', role: 'approver' },
  { id: 'sam', name: 'Sam', initials: 'S', colorVar: 'var(--chart-3)', role: 'operator' },
  { id: 'nik', name: 'Nik', initials: 'N', colorVar: 'var(--chart-1)', role: 'approver' },
  { id: 'rida', name: 'Rida', initials: 'R', colorVar: 'var(--chart-5)', role: 'operator' },
  { id: 'jatin', name: 'Jatin', initials: 'J', colorVar: 'var(--chart-8)', role: 'operator' },
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
