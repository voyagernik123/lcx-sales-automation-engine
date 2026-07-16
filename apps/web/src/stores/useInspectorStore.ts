import { create } from 'zustand';

/**
 * The universal inspector — the sales side's adoption of the toolkit's
 * InspectorDrawer doctrine: inspect in place, never lose context.
 *
 * Any surface can call `useInspectorStore.getState().open('project', id)`
 * (or the `useInspect()` convenience hook) and the InspectorHost mounted in
 * AppLayout renders the right payload in a right-side drawer. A small stack
 * supports drill-through (project → its deal → back).
 */
export type InspectorEntityType = 'project' | 'deal' | 'handoff' | 'contact' | 'claim';

export interface InspectorTarget {
  type: InspectorEntityType;
  id: string;
  /** Optional preloaded context so payloads can render instantly. */
  seed?: Record<string, unknown>;
}

interface InspectorStore {
  stack: InspectorTarget[];
  open: (type: InspectorEntityType, id: string, seed?: Record<string, unknown>) => void;
  /** Drill deeper without losing the trail. */
  push: (type: InspectorEntityType, id: string, seed?: Record<string, unknown>) => void;
  back: () => void;
  close: () => void;
}

export const useInspectorStore = create<InspectorStore>(set => ({
  stack: [],
  open: (type, id, seed) => set({ stack: [{ type, id, seed }] }),
  push: (type, id, seed) => set(s => ({ stack: [...s.stack, { type, id, seed }] })),
  back: () => set(s => ({ stack: s.stack.slice(0, -1) })),
  close: () => set({ stack: [] }),
}));

/** Convenience for components: `const inspect = useInspect(); inspect('deal', id)`. */
export function useInspect() {
  const open = useInspectorStore(s => s.open);
  return open;
}
