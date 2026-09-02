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
export type InspectorEntityType =
  | 'project'
  | 'deal'
  | 'handoff'
  | 'contact'
  | 'claim'
  | 'task'
  | 'signal'
  | 'listing'
  | 'decision'
  | 'jurisdiction'
  | 'document'
  // S5 of INSTRUMENT_100X_PLAN (2026-09-02): the join reaches the compartments that carry the money and
  // the liability. Mirrors the API's InspectorType; oneFloor.test.ts pins the two identical.
  | 'engagement'
  | 'target'
  | 'partner'
  | 'client'
  | 'draft'
  | 'holding'
  | 'asset';

export interface InspectorTarget {
  type: InspectorEntityType;
  id: string;
  /** Optional preloaded context so payloads can render instantly. */
  seed?: Record<string, unknown>;
}

interface InspectorStore {
  stack: InspectorTarget[];
  /**
   * THE SURFACE'S CURSOR, so the docked pane can say when it has stopped describing the row
   * the verbs will hit (TERMINAL Phase F open item 0, 2026-09-02). `lib/split.ts` records that
   * the pane does NOT follow `j`/`k`; this makes the mismatch visible instead of documented.
   * Written by the surface that owns a cursor (the BD queue's `move`/peek), cleared on unmount.
   */
  cursor: { type: InspectorEntityType; id: string } | null;
  setCursor: (cursor: { type: InspectorEntityType; id: string } | null) => void;
  open: (type: InspectorEntityType, id: string, seed?: Record<string, unknown>) => void;
  /** Drill deeper without losing the trail. */
  push: (type: InspectorEntityType, id: string, seed?: Record<string, unknown>) => void;
  back: () => void;
  /** Jump to a point in the traversal breadcrumb (0-based stack index). */
  jumpTo: (index: number) => void;
  close: () => void;
}

export const useInspectorStore = create<InspectorStore>(set => ({
  stack: [],
  cursor: null,
  setCursor: cursor => set({ cursor }),
  open: (type, id, seed) => set({ stack: [{ type, id, seed }] }),
  push: (type, id, seed) => set(s => ({ stack: [...s.stack, { type, id, seed }] })),
  back: () => set(s => ({ stack: s.stack.slice(0, -1) })),
  jumpTo: index => set(s => ({ stack: s.stack.slice(0, index + 1) })),
  close: () => set({ stack: [] }),
}));

/** Convenience for components: `const inspect = useInspect(); inspect('deal', id)`. */
export function useInspect() {
  const open = useInspectorStore(s => s.open);
  return open;
}
