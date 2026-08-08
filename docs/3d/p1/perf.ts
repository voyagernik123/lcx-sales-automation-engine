/**
 * P1 · FRAME TIME — the second half of §7's gate, which I shipped P1 without measuring.
 *
 * The gate is "Brand hex exact after tone mapping; 60fps on M1 proxy". The colour half was
 * measured and the frame-rate half was not, and reporting the first as though it were the
 * whole gate is exactly the quiet gap this programme exists to close.
 *
 * ── THE FIRST VERSION OF THIS FILE WAS WRONG, AND ITS NUMBERS LOOKED GREAT ──────────
 * It timed `redraw()` with `performance.now()` around a `gl.finish()`. On the real M1 it
 * reported a median of 0.1 ms and 5,000 fps for 10,000 instanced deposits plus five
 * post-process passes, which is not a plausible number for any GPU. Two reasons, both
 * fatal:
 *
 *   1. In Chromium, WebGL commands cross into a separate GPU PROCESS. `gl.finish()` on the
 *      renderer side returns once the command buffer has been flushed — not once the GPU
 *      has finished the work. It measures bookkeeping.
 *   2. `performance.now()` is deliberately clamped to 100 µs. A median of exactly 0.1 ms
 *      and a minimum of exactly 0 are the clamp, not a measurement.
 *
 * The lesson is the one this repo keeps paying for: a number that flatters you is the one
 * to distrust first. So this file measures GPU time two independent ways and reports both,
 * because two methods that agree are worth far more than one that is convenient.
 *
 * ── METHOD 1 · EXT_disjoint_timer_query_webgl2 ──────────────────────────────────────
 * The GPU itself timestamps the work and reports nanoseconds. This is the real number.
 * `GPU_DISJOINT_EXT` must be checked: if the GPU was interrupted (a context switch, a
 * power state change) every outstanding timing is invalid and must be THROWN AWAY, not
 * averaged in. Discarded samples are counted and reported.
 *
 * ── METHOD 2 · amortised batch throughput ───────────────────────────────────────────
 * Draw the frame K times back to back, then `gl.finish()` ONCE, and divide. The per-frame
 * flush-vs-complete discrepancy that broke method 1's first version cannot survive this:
 * the GPU can only be a bounded amount ahead when the final sync lands, so over a few
 * hundred frames that error is amortised to nothing. It needs no extension, and it is
 * immune to the clock clamp because the interval being timed is seconds, not microseconds.
 *
 * Sweeping K upward and watching the per-frame figure CONVERGE is what makes it credible —
 * if the numbers still fall as K rises, the sync is not being paid for and none of it can
 * be trusted.
 *
 * ── BOTH METHODS ARE SYNCHRONOUS, AND THAT TOOK TWO TRIES ───────────────────────────
 * The first attempt awaited `requestAnimationFrame` between polls and hung: the browser
 * pane reported `document.hidden === true`, and a hidden tab fires no animation frames at
 * all. The second attempt switched to `setTimeout(0)` and hung for the same reason one
 * level down — Chrome throttles background timers to roughly one per second, so 120 frames
 * of polling would have taken hours.
 *
 * So the poll is a straight busy-wait on `QUERY_RESULT_AVAILABLE` with a wall-clock
 * deadline. It blocks the main thread for a few seconds, which is why the whole harness is
 * opt-in behind `?perf` and never runs on an ordinary load. Measuring something that must
 * work while the page is not foregrounded rules out every cooperative scheduler the
 * platform offers.
 */

export interface GpuTiming {
  readonly method: 'EXT_disjoint_timer_query_webgl2';
  readonly frames: number;
  readonly discarded: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly minMs: number;
  readonly maxMs: number;
  /** Frames per second implied by the p95 — the pessimistic figure, on purpose. */
  readonly fpsAtP95: number;
}

export interface ThroughputStep {
  readonly batch: number;
  readonly msPerFrame: number;
  readonly framesPerSec: number;
}

export interface FrameStats {
  readonly renderer: string;
  readonly software: boolean;
  readonly canvas: string;
  readonly samples: number;
  readonly setupMs: number;
  readonly gpu: GpuTiming | { readonly method: 'UNAVAILABLE'; readonly reason: string };
  readonly throughput: readonly ThroughputStep[];
  /** Best sustained full frames per second across the sweep. */
  readonly sustainedFps: number;
}


function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i]!;
}

export function rendererString(canvas: HTMLCanvasElement): string {
  const gl = canvas.getContext('webgl2');
  if (!gl) return 'NO_WEBGL2';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const value = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return String(value ?? 'UNKNOWN');
}

/** A software rasteriser's frame times say nothing about a GPU, in either direction. */
export function isSoftware(renderer: string): boolean {
  return /swiftshader|llvmpipe|softwarerasterizer|software|mesa\b.*llvm/i.test(renderer);
}

interface TimerExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

export function measureGpu(
  redraw: () => void,
  gl: WebGL2RenderingContext,
  frames = 120,
): GpuTiming | { method: 'UNAVAILABLE'; reason: string } {
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
  if (!ext) {
    return {
      method: 'UNAVAILABLE',
      reason:
        'EXT_disjoint_timer_query_webgl2 is not exposed here. Browsers gate it because GPU ' +
        'timings are a fingerprinting and timing-attack surface. Use the throughput figures.',
    };
  }

  // Warm-up: the first frames pay for shader validation, texture allocation and the
  // driver's own lazy work. Including them reports a one-off as though it were typical.
  for (let i = 0; i < 8; i++) redraw();
  gl.finish();

  const ms: number[] = [];
  let discarded = 0;
  for (let i = 0; i < frames; i++) {
    const q = gl.createQuery()!;
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    redraw();
    gl.endQuery(ext.TIME_ELAPSED_EXT);

    gl.flush();
    let ns: number | null = null;
    // Busy-wait with a wall-clock deadline. 60 ms per frame is generous for work that
    // should take single-digit milliseconds, and a frame that misses it is DISCARDED
    // rather than recorded as slow — an unresolved query is a missing measurement, not a
    // large one, and the two must not be averaged together.
    const deadline = performance.now() + 60;
    while (performance.now() < deadline) {
      // A disjoint event means the GPU was interrupted and EVERY outstanding timing is
      // meaningless. Throwing it away is the only correct response; averaging it in would
      // quietly corrupt the distribution.
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) break;
      if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
        ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
        break;
      }
    }
    gl.deleteQuery(q);
    if (ns == null) discarded++;
    else ms.push(ns / 1e6);
  }

  if (ms.length === 0) {
    return { method: 'UNAVAILABLE', reason: `all ${frames} timings were disjoint or never resolved` };
  }
  const sorted = [...ms].sort((a, b) => a - b);
  const p95 = percentile(sorted, 0.95);
  return {
    method: 'EXT_disjoint_timer_query_webgl2',
    frames: ms.length,
    discarded,
    medianMs: percentile(sorted, 0.5),
    p95Ms: p95,
    minMs: sorted[0]!,
    maxMs: sorted[sorted.length - 1]!,
    fpsAtP95: 1000 / p95,
  };
}

/**
 * Draw `batch` frames back to back, sync ONCE, divide.
 *
 * The single trailing `gl.finish()` is what makes this valid. Per-frame syncing measured
 * the flush and reported 5,000 fps; here the GPU can only be a bounded amount ahead when
 * the sync lands, so across hundreds of frames that error amortises away. The interval is
 * seconds rather than microseconds, so the 100 µs clock clamp is irrelevant too.
 */
export function measureThroughput(
  redraw: () => void,
  gl: WebGL2RenderingContext,
  batch: number,
): ThroughputStep {
  const t0 = performance.now();
  for (let i = 0; i < batch; i++) redraw();
  gl.finish();
  const elapsed = performance.now() - t0;
  return {
    batch,
    msPerFrame: elapsed / batch,
    framesPerSec: (batch * 1000) / elapsed,
  };
}

/**
 * Sweep the batch size and watch the per-frame figure CONVERGE.
 *
 * Convergence is the evidence, not the final number: if ms/frame keeps falling as the
 * batch grows, the trailing sync is not actually paying for the work and none of the
 * figures mean anything. A flat tail across 200/400/800 is what says the measurement is
 * real.
 */
export function sweepThroughput(
  redraw: () => void,
  gl: WebGL2RenderingContext,
  steps: readonly number[] = [100, 200, 400, 800, 1600],
): ThroughputStep[] {
  return steps.map((b) => measureThroughput(redraw, gl, b));
}
