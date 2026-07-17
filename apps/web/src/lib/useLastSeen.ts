import { useEffect, useMemo, useRef } from 'react';
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
  const key = `${operatorId}::${surface}`;

  // Capture the PREVIOUS watermark once per operator+surface, before this
  // visit overwrites it. A ref (not memo) so a re-render never re-reads a
  // watermark this session already advanced. Reading is pure; the write is
  // deferred to the effect below.
  const prevRef = useRef<{ key: string; value: string | null }>({ key: '', value: null });
  if (prevRef.current.key !== key) {
    prevRef.current = { key, value: read()[operatorId]?.[surface] ?? null };
  }
  const prev = prevRef.current.value;

  // Stamp "now" after commit — never a side effect during render.
  useEffect(() => {
    const marks = read();
    try {
      marks[operatorId] = { ...(marks[operatorId] ?? {}), [surface]: new Date().toISOString() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(marks));
    } catch {
      // Storage full/blocked — hints simply stay off.
    }
  }, [operatorId, surface]);

  return useMemo<LastSeen>(
    () => ({
      lastSeen: prev,
      isNew: (ts) => (!prev || !ts ? false : Date.parse(ts) > Date.parse(prev)),
    }),
    [prev],
  );
}
