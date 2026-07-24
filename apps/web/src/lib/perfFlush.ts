/**
 * Ships client-measured latency to POST /v1/perf so the existing SLO machinery
 * can show it (Ops Health panel + Command Center breach banner).
 *
 * Batched deliberately: production rate-limits to 240 requests/minute per
 * key+IP, and a per-interaction POST from a busy desk would eat that budget —
 * and worse, would itself be a network round-trip on the very path we are trying
 * to make fast. So: flush on an interval, and once more on pagehide so a closed
 * window doesn't silently drop its samples.
 *
 * Failure is silent by design. A metric that cannot be delivered must never
 * become an operator-facing error; samples are handed back to the queue so the
 * next flush retries them.
 */

import { request } from './apiClient';
import { drainPending, frameSamplesForFlush, restorePending } from './perf';

const FLUSH_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;

async function flush(): Promise<void> {
  const samples = drainPending();
  const frames = frameSamplesForFlush();
  if (samples.length === 0 && frames.length === 0) return;
  try {
    await request('/v1/perf', {
      method: 'POST',
      body: { samples, frames },
      // Never let a metric flush trigger the purpose/step-up machinery.
      auth: true,
    });
  } catch {
    // Hand the samples back so a blip costs nothing but a delay. Frames are not
    // restored — they are a continuous signal and the next window is as good.
    restorePending(samples);
  }
}

/** Start periodic flushing. Returns a stop function. */
export function startPerfFlush(): () => void {
  if (timer) return () => {};
  timer = setInterval(() => void flush(), FLUSH_MS);

  // pagehide (not unload) is the reliable last-chance hook in modern browsers and
  // fires in the Tauri webview too.
  const onHide = () => void flush();
  window.addEventListener('pagehide', onHide);

  return () => {
    if (timer) clearInterval(timer);
    timer = null;
    window.removeEventListener('pagehide', onHide);
  };
}

/** Flush now (used by the HUD's manual refresh and by tests). */
export const flushPerfNow = flush;
