import { useMemo } from 'react';
import { useOperatorStore } from '@/stores';

/**
 * "Since you were here" (FINAL_MASTER_PLAN 3.4) — a per-operator, per-surface
 * watermark. On mount the hook reads the previous visit's timestamp, then
 * stamps now; `isNew(ts)` marks anything that changed while you were away.
 * Stored locally per browser — a hint layer, not an audit record.
 */

const STORAGE_KEY = 'lcx-os:last-seen:v1';

type Watermarks = Record<string, Record<string, string>>;

function read(): Watermarks {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Watermarks;
  } catch {
    return {};
  }
}

export interface LastSeen {
  /** ISO of the previous visit, or null on the first ever visit. */
  lastSeen: string | null;
  /** True when `ts` is newer than the previous visit (never true on first visit). */
  isNew: (ts: string | null | undefined) => boolean;
}

export function useLastSeen(surface: string): LastSeen {
  const operatorId = useOperatorStore(s => s.operator?.id ?? 'anon');

  // Read-then-stamp exactly once per operator+surface mount.
  return useMemo(() => {
    const marks = read();
    const prev = marks[operatorId]?.[surface] ?? null;
    try {
      marks[operatorId] = { ...(marks[operatorId] ?? {}), [surface]: new Date().toISOString() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(marks));
    } catch {
      // Storage full/blocked — hints simply stay off.
    }
    return {
      lastSeen: prev,
      isNew: (ts: string | null | undefined) => {
        if (!prev || !ts) return false;
        return Date.parse(ts) > Date.parse(prev);
      },
    };
  }, [operatorId, surface]);
}
