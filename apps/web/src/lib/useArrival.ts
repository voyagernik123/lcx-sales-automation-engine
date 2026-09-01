import { useEffect } from 'react';
import { create } from 'zustand';
import type { WatchResponse } from '@lcx/shared';
import { request } from '@/lib/apiClient';
import { every, now } from '@/lib/clock';
import { prefersReducedMotion } from '@/lib/motion';
import { scopedKey } from '@/lib/persistence';
import { useOperatorStore } from '@/stores';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE ARRIVAL — S4 of INSTRUMENT_100X_PLAN.md: the one time the shell moves
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * On arrival — a fresh session, or a return after the tab was hidden for a while — the shell asks
 * the watch what changed since the operator last looked, and then performs ONE synchronized
 * sweep: items reveal in rank order, rooms light, the ticker turns over. Everything else stays
 * still. That sweep is the whole motion budget of the application; spinners and pulses that said
 * "please wait" have no place beside it.
 *
 * ONE STORE, THREE READERS. The strip in the TopNav, the room dots in the workspace switcher and the
 * ticker all perform the same arrival, so the state is a store rather than a hook's local state —
 * three hooks would be three fetches and three sweeps out of phase, which is the opposite of the
 * property S1 built. `useArrival()` mounts the driver once (from the shell) and everyone else reads
 * `useArrivalStore`.
 *
 * THE WATERMARK IS THE OPERATOR'S, NOT A SURFACE'S. `useLastSeen` keeps per-surface marks for hint
 * badges; the watch needs one mark for "when did this person last look at the desk at all", kept
 * under the same scoped-key scheme so it is per-operator per-browser and never leaks across seats.
 *
 * PHASE-LOCKED TO THE ONE CLOCK. The reveal steps are heartbeat ticks, not `setTimeout`s — S1's
 * ratchet forbids a private timer, and the point is that the sweep, the footer second and any GL
 * mark that moves on arrival share one timebase. Under reduced motion the sweep is a single step:
 * everything appears at once and nothing animates.
 *
 * ABSENT DATA IS SAID, NEVER ANIMATED. If the API is asleep (Render free tier) or the watch cannot be
 * composed, the state carries the last watermark and an `unavailable` sentence; the sweep does not
 * run on a guess.
 */

export const ARRIVAL_STEP_MS = 250;
/** How long the tab must have been hidden for a return to count as an arrival. */
export const ARRIVAL_AFTER_HIDDEN_MS = 5 * 60_000;

export interface ArrivalState {
  /** null until the first response; then the watch as composed. */
  watch: WatchResponse | null;
  /** How many ranked items have been revealed so far (grows one per heartbeat step). */
  revealed: number;
  /** The watermark this arrival compared against, or null on a first ever arrival. */
  since: string | null;
  /** A sentence when the watch could not be read; null otherwise. */
  unavailable: string | null;
  /** True while the sweep is in progress — the only time the shell is allowed to move. */
  sweeping: boolean;
  /** Reading the watch right now. Still — no spinner; the arrival is the motion, not the wait. */
  reading: boolean;
}

const WATERMARK_KEY = 'watch-last-seen';
function readWatermark(operatorId: string): string | null {
  try {
    const all = JSON.parse(localStorage.getItem(scopedKey(WATERMARK_KEY)) ?? '{}') as Record<string, string>;
    return all[operatorId] ?? null;
  } catch { return null; }
}
function writeWatermark(operatorId: string, iso: string): void {
  try {
    const all = JSON.parse(localStorage.getItem(scopedKey(WATERMARK_KEY)) ?? '{}') as Record<string, string>;
    all[operatorId] = iso;
    localStorage.setItem(scopedKey(WATERMARK_KEY), JSON.stringify(all));
  } catch { /* the next arrival simply reads a wider window */ }
}

interface ArrivalStore extends ArrivalState {
  arrive: (operatorId: string) => Promise<void>;
  step: () => void;
  _reset: () => void;
}

const initial: ArrivalState = { watch: null, revealed: 0, since: null, unavailable: null, sweeping: false, reading: false };
let inFlight = false;

export const useArrivalStore = create<ArrivalStore>((set, get) => ({
  ...initial,
  arrive: async (operatorId) => {
    if (inFlight || operatorId === 'anon') return;
    inFlight = true;
    const since = readWatermark(operatorId);
    const asked = since ?? new Date(now() - 86_400_000).toISOString(); // first arrival: the last 24 h
    set({ reading: true });
    try {
      const res = await request<{ data: WatchResponse }>(`/v1/watch?since=${encodeURIComponent(asked)}`, { auth: true });
      writeWatermark(operatorId, res.data.asOf);
      const reduced = prefersReducedMotion();
      set({
        watch: res.data,
        revealed: reduced ? res.data.items.length : 0,
        since,
        unavailable: null,
        sweeping: !reduced && res.data.items.length > 0,
        reading: false,
      });
    } catch (e) {
      set({
        since,
        unavailable: `The watch is unavailable — ${e instanceof Error ? e.message : 'the API did not answer'}. Last looked ${since ? `${since.slice(0, 16).replace('T', ' ')} UTC` : 'never'}.`,
        sweeping: false,
        reading: false,
      });
    } finally { inFlight = false; }
  },
  step: () => {
    const s = get();
    if (!s.watch) return;
    const next = Math.min(s.watch.items.length, s.revealed + 1);
    set({ revealed: next, sweeping: next < s.watch.items.length });
  },
  _reset: () => { inFlight = false; set({ ...initial }); },
}));

/**
 * Mount the arrival driver ONCE, from the shell. Fetches on mount and on a return after a long
 * absence; runs the sweep on the one clock. Readers use `useArrivalStore` directly.
 */
export function useArrival(): ArrivalState {
  const operatorId = useOperatorStore((s) => s.operator?.id ?? 'anon');
  const arrive = useArrivalStore((s) => s.arrive);
  const sweeping = useArrivalStore((s) => s.sweeping);
  const step = useArrivalStore((s) => s.step);

  useEffect(() => { void arrive(operatorId); }, [operatorId, arrive]);

  // A return after a long absence is an arrival; a quick tab flick is not.
  useEffect(() => {
    let hiddenAt: number | null = null;
    const onVis = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = now(); return; }
      if (hiddenAt !== null && now() - hiddenAt >= ARRIVAL_AFTER_HIDDEN_MS) void arrive(operatorId);
      hiddenAt = null;
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [operatorId, arrive]);

  // THE SWEEP: one item per heartbeat step, on the one clock; stops itself.
  useEffect(() => {
    if (!sweeping) return;
    return every(ARRIVAL_STEP_MS, step);
  }, [sweeping, step]);

  const watch = useArrivalStore((s) => s.watch);
  const revealed = useArrivalStore((s) => s.revealed);
  const since = useArrivalStore((s) => s.since);
  const unavailable = useArrivalStore((s) => s.unavailable);
  const reading = useArrivalStore((s) => s.reading);
  return { watch, revealed, since, unavailable, sweeping, reading };
}
