import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { TEAM, type TeamRole } from '@lcx/shared';
import { storage } from '@/lib/persistence';
import { STORAGE_KEYS } from '@/lib/storage';

/**
 * Roles (FINAL_MASTER_PLAN 5.2). Approver-gated actions render
 * disabled-with-reason for operators, never hidden — governance is visible.
 * viewer < operator < approver (approver ⊇ operator rights).
 */
export type OperatorRole = TeamRole;

export interface Operator {
  id: string;
  name: string;
  /** LCX email — the sign-in credential and the token sent to the API. */
  email: string;
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
 * The five people this internal tool is shared with. Identity + email + role
 * come from the shared desk roster (@lcx/shared TEAM) so the front door and the
 * API allowlist can't drift; the UI-only fields (initials, brand color) are
 * decorated here by id. Sign-in is email-based (a lightweight team gate) — desk
 * leads carry approver rights (deal close, invoice sign-off).
 */
const UI_BY_ID: Record<string, { initials: string; colorVar: string }> = {
  monty: { initials: 'M', colorVar: 'var(--chart-2)' },
  sam: { initials: 'S', colorVar: 'var(--chart-3)' },
  nik: { initials: 'N', colorVar: 'var(--chart-1)' },
  rida: { initials: 'R', colorVar: 'var(--chart-5)' },
  jatin: { initials: 'J', colorVar: 'var(--chart-8)' },
};

export const OPERATORS: Operator[] = TEAM.map((m) => ({
  id: m.id,
  name: m.name,
  email: m.email,
  role: m.role,
  initials: UI_BY_ID[m.id]?.initials ?? m.name[0]!.toUpperCase(),
  colorVar: UI_BY_ID[m.id]?.colorVar ?? 'var(--chart-1)',
}));

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
      version: 3,
      storage: createJSONStorage(() => ({
        getItem: n => JSON.stringify(storage.get(n, null)),
        setItem: (n, v) => storage.set(n, JSON.parse(v)),
        removeItem: n => storage.remove(n),
      })),
      // v3: sign-in now requires an explicit, authorized email at the gate.
      // Discard any pre-v3 session (name-picker era, or a key-only browser that
      // never entered an email) so the email gate is the first thing everyone
      // sees exactly once — after that, v3 sessions persist normally.
      migrate: () => ({ operator: null }),
    },
  ),
);
