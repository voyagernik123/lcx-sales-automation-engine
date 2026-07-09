type Listener = () => void;

const listeners: Map<string, Set<Listener>> = new Map();

export const safeHarborBus = {
  on(event: string, fn: Listener): () => void {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(fn);
    return () => {
      listeners.get(event)?.delete(fn);
    };
  },

  emit(event: string): void {
    listeners.get(event)?.forEach(fn => {
      try { fn(); } catch { /* prevent listener errors from breaking the bus */ }
    });
  },

  clear(): void {
    listeners.clear();
  }
};
