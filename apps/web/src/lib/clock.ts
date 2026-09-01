/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE ONE CLOCK — S1 of INSTRUMENT_100X_PLAN.md
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Before this file the shell kept at least five independent clocks: `Footer.tsx` ticked a
 * `setInterval` every second for the UTC readout, `KpiTicker` rotated on a 6 s interval and
 * refetched on a 5 min one, `SelectOperator` and `MarketingCrisis` each ticked their own
 * second, `NotificationBell`, `KpiDashboard`, `MarketNews` and `lib/online` each polled on
 * their own period, and every GL environment read `performance.now()` for itself. Two of
 * them could show a different second at the same instant, and every poller fired at a
 * moment nobody chose. "Synchronized" — the owner's word for what the instrument lacked —
 * is not a metaphor here. It means a timebase. This is it.
 *
 * ── ONE HEARTBEAT, PHASE-ALIGNED TO THE SERVER'S EPOCH ──────────────────────────
 * A single 250 ms `setInterval` is the only unbounded timer this application is allowed to
 * own (`lib/__tests__/oneClock.test.ts` is the ratchet). Every subscriber declares a period
 * and fires when the server-corrected epoch crosses a multiple of that period — so every
 * 1 s display changes on the same tick, every 60 s poller fires in the same heartbeat, and
 * two readings of "now" on one screen cannot disagree. Alignment is to the EPOCH, not to
 * the moment of subscription: a panel mounted at :00.7 and a footer mounted at :00.1 still
 * tick together.
 *
 * WHY `setInterval` AND NOT `requestAnimationFrame`. A pure rAF clock stops in a hidden tab,
 * which is right for animation and wrong for the notification poller the operator relies on
 * while reading another window; and the test runner's fake timers fake intervals, not frames.
 * Frame cadence exists for the callers that need it (`onFrame`) and runs only while the
 * document is visible and the operator has not asked for reduced motion.
 *
 * ── THE SERVER'S TIME WINS ────────────────────────────────────────────────────────
 * `/health` returns `timestamp`; the footer's existing ping hands it to `setServerNow()`, and
 * from then on `now()` is the server's clock as this machine sees it. A desk clock that is
 * five seconds off the server's is five seconds off every `created_at` it renders beside.
 * Until a correction lands, `corrected()` is false and the footer says "local clock" —
 * never "UTC" on a guess.
 *
 * ── REDUCED MOTION IS A CADENCE FLOOR, READ AT CALL TIME ─────────────────────────
 * Under `prefers-reduced-motion`, no subscriber fires faster than once per second and
 * `onFrame` degrades to that cadence. Read at call time, like `lib/motion.ts` — the setting
 * is live on macOS and a cached boolean would keep animating after the operator turned it
 * off to stop feeling sick.
 *
 * ── AN IDLE APP OWNS ZERO TIMERS ─────────────────────────────────────────────────
 * The heartbeat starts on the first subscription and stops on the last unsubscription.
 * S0's runtime audit counts live intervals at rest; with nothing on screen that needs time,
 * the honest count is zero, not "one clock ticking for nobody".
 *
 * NO REACT IN THIS FILE, and that is a contract: `lib/online.ts` and `lib/perf.ts` are
 * documented React-free, GL code subscribes from outside the tree, and S5's environments
 * will read `monotonic()` from inside `@lcx/gl` callbacks. The React hook is a thin
 * subscriber in `lib/useClock.ts`.
 */

import { prefersReducedMotion } from '@/lib/motion';

export const HEARTBEAT_MS = 250;
/** The slowest cadence anything may ask for under reduced motion. */
export const REDUCED_MOTION_FLOOR_MS = 1000;

export interface ClockTick {
  /** Server-corrected epoch milliseconds — the one "now". */
  nowMs: number;
  /** Monotonic milliseconds for durations; never compared with `nowMs`. */
  monotonicMs: number;
  /** Whether the document is visible; pollers may choose to stay quiet when it is not. */
  visible: boolean;
  /** Whether the operator has asked for reduced motion (read this tick, not cached). */
  reducedMotion: boolean;
  /** Whether `nowMs` has been corrected against the server at least once. */
  corrected: boolean;
}

type Listener = (t: ClockTick) => void;
interface Sub { everyMs: number; fn: Listener; bucket: number }

let offsetMs = 0;
let isCorrected = false;
let subs: Sub[] = [];
let heartbeat: ReturnType<typeof setInterval> | null = null;
const frameSubs = new Set<Listener>();
/** Watchers of frames that OTHERS cause. They never keep the frame loop alive — see `observeFrames`. */
const frameObservers = new Set<Listener>();
let rafId: number | null = null;

const hasWindow = () => typeof window !== 'undefined';
const visible = () => (typeof document === 'undefined' ? true : document.visibilityState !== 'hidden');
const mono = () => (typeof performance === 'object' && typeof performance.now === 'function' ? performance.now() : Date.now());

/** The one "now": server-corrected epoch ms. */
export function now(): number {
  return Date.now() + offsetMs;
}

/** Monotonic ms, for durations and tween progress. Injected into `@lcx/gl` motion environments. */
export function monotonic(): number {
  return mono();
}

export function corrected(): boolean {
  return isCorrected;
}

/** Offset applied to this machine's clock, ms. Positive means the server is ahead. */
export function serverOffsetMs(): number {
  return offsetMs;
}

/**
 * Accept the server's instant (an ISO string or epoch ms). Called by whatever already talks
 * to `/health`; a non-finite value is ignored rather than corrupting the timebase.
 */
export function setServerNow(serverInstant: string | number): void {
  const s = typeof serverInstant === 'number' ? serverInstant : Date.parse(serverInstant);
  if (!Number.isFinite(s)) return;
  offsetMs = s - Date.now();
  isCorrected = true;
}

/** Position in `[0, 1)` within a period, on the shared timebase — every rotator on screen agrees. */
export function phase(periodMs: number): number {
  if (!(periodMs > 0)) return 0;
  const m = now() % periodMs;
  return (m < 0 ? m + periodMs : m) / periodMs;
}

/** The cadence a subscriber actually gets, after the reduced-motion floor. */
function effectiveEvery(everyMs: number, reduced: boolean): number {
  const e = Math.max(HEARTBEAT_MS, everyMs);
  return reduced ? Math.max(REDUCED_MOTION_FLOOR_MS, e) : e;
}

function tick(): void {
  const reduced = prefersReducedMotion();
  const t: ClockTick = { nowMs: now(), monotonicMs: mono(), visible: visible(), reducedMotion: reduced, corrected: isCorrected };
  // Snapshot: a listener that unsubscribes another mid-tick must not shift the iteration.
  for (const s of [...subs]) {
    const e = effectiveEvery(s.everyMs, reduced);
    const bucket = Math.floor(t.nowMs / e);
    if (bucket !== s.bucket) {
      s.bucket = bucket;
      try { s.fn(t); } catch (err) { console.error('[clock] subscriber threw', err); }
    }
  }
}

function ensureHeartbeat(): void {
  if (heartbeat !== null || subs.length === 0) return;
  heartbeat = setInterval(tick, HEARTBEAT_MS);
}
function releaseHeartbeat(): void {
  if (heartbeat !== null && subs.length === 0) { clearInterval(heartbeat); heartbeat = null; }
}

/**
 * Fire `fn` every time the shared clock crosses a multiple of `everyMs`. Does NOT fire
 * immediately — callers that want an initial run do it themselves, as they do today, so the
 * first paint never waits on a tick. Returns the unsubscribe.
 */
export function every(everyMs: number, fn: Listener): () => void {
  const reduced = prefersReducedMotion();
  const sub: Sub = { everyMs, fn, bucket: Math.floor(now() / effectiveEvery(everyMs, reduced)) };
  subs.push(sub);
  ensureHeartbeat();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    subs = subs.filter((s) => s !== sub);
    releaseHeartbeat();
  };
}

function frameLoop(): void {
  rafId = null;
  if (frameSubs.size === 0) return;
  if (prefersReducedMotion() || !visible()) {
    // Degrade to the heartbeat's cadence: one frame per second, delivered by the interval.
    return;
  }
  const t: ClockTick = { nowMs: now(), monotonicMs: mono(), visible: true, reducedMotion: false, corrected: isCorrected };
  for (const fn of [...frameSubs]) {
    try { fn(t); } catch (err) { console.error('[clock] frame subscriber threw', err); }
  }
  for (const fn of [...frameObservers]) {
    try { fn(t); } catch (err) { console.error('[clock] frame observer threw', err); }
  }
  if (hasWindow() && typeof requestAnimationFrame === 'function') rafId = requestAnimationFrame(frameLoop);
}

/**
 * Watch the frames the clock delivers to real frame subscribers, WITHOUT causing any.
 *
 * This exists for exactly one caller today, and the reason is S0's central finding:
 * `lib/perf.ts`'s frame sampler ran its own 60 fps `requestAnimationFrame` loop on every
 * route, forever, to measure whether animation broke the frame budget — and at rest it was
 * the only animation there was. An observer is told about every frame the loop produces
 * for someone else and is never a reason for the loop to run. No subscribers, no frames,
 * nothing observed: which is the honest reading of an instrument at rest.
 */
export function observeFrames(fn: Listener): () => void {
  frameObservers.add(fn);
  return () => { frameObservers.delete(fn); };
}

/**
 * Frame cadence, for the few callers that draw every frame (a GL surface with a purpose to
 * move; the `--t` root variable). Runs only while visible and motion is not reduced; under
 * either it falls back to one delivery per second through the heartbeat, so a caller written
 * against `onFrame` never has to special-case the preference.
 */
export function onFrame(fn: Listener): () => void {
  frameSubs.add(fn);
  const offSlow = every(REDUCED_MOTION_FLOOR_MS, (t) => { if (t.reducedMotion || !t.visible) fn(t); });
  if (rafId === null && hasWindow() && typeof requestAnimationFrame === 'function') rafId = requestAnimationFrame(frameLoop);
  return () => {
    frameSubs.delete(fn);
    offSlow();
    if (frameSubs.size === 0 && rafId !== null && typeof cancelAnimationFrame === 'function') { cancelAnimationFrame(rafId); rafId = null; }
  };
}

if (hasWindow() && typeof document !== 'undefined') {
  // Coming back to a hidden tab: resume frames if anyone wants them, and deliver a catch-up tick
  // so a display that slept shows the right second on the first frame, not one heartbeat later.
  document.addEventListener('visibilitychange', () => {
    if (visible()) {
      if (subs.length > 0) tick();
      if (frameSubs.size > 0 && rafId === null && typeof requestAnimationFrame === 'function') rafId = requestAnimationFrame(frameLoop);
    }
  });
}

/** Test seam: drop every subscriber and correction. Never called by product code. */
export function _resetClockForTests(): void {
  subs = [];
  if (heartbeat !== null) { clearInterval(heartbeat); heartbeat = null; }
  frameSubs.clear();
  frameObservers.clear();
  if (rafId !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
  rafId = null;
  offsetMs = 0;
  isCorrected = false;
}
