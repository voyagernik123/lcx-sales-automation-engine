/**
 * Browser entry for the P1 gate. Mounts the surface, prints the readout, and — when the
 * stage refuses — renders the refusal instead of a blank plate.
 *
 * The refusal branch is not decoration. `3D_WORK_100X.md` §6.3.7 requires a real
 * fallback because "no WebGL2 context" happens on locked-down enterprise browsers, in
 * CI without a GL flag, and after a GPU process restart. A surface that renders nothing
 * in that case tells the reader their data is empty, which is a lie.
 */
import { renderRiskCloud, money, BANDWIDTH_FRACTION, type Samples } from './surface.js';
import { measureGpu, sweepThroughput, rendererString, isSoftware, type FrameStats } from './perf.js';
import { describeToneMapping, MOTION_POLICY, DEPTH_POLICY } from '@lcx/gl';

declare global {
  interface Window {
    __SAMPLES__: Samples;
    __PERF__?: FrameStats;
  }
}

const canvas = document.getElementById('c') as HTMLCanvasElement;
const overlay = document.getElementById('overlay')!;
const data = window.__SAMPLES__;

// The renderer string is read BEFORE the stage takes the context, because it is the fact
// that decides whether any timing below may be quoted at all.
const renderer = rendererString(canvas);

const setupT0 = performance.now();
const out = renderRiskCloud(canvas, overlay, data);
const setupMs = performance.now() - setupT0;

if (out.kind === 'refused') {
  /*
   * THE CANVAS STAYS. Hiding it collapsed the plate to zero height — `.refusal` is
   * `position:absolute; inset:0` inside `.stage`, so the message rendered into nothing
   * and the page showed a title with a blank gap under it. Caught by capturing this
   * path (`capture.mjs` → refusal.png), which is the entire reason it is captured: a
   * fallback nobody has ever looked at is a fallback that does not work.
   */
  document.querySelector('.stage')!.classList.add('refused');
  const box = document.createElement('div');
  box.className = 'refusal';
  box.innerHTML =
    `<b>${out.code}</b><p>${out.reason}</p>` +
    // The remedy is the SURFACE's fact, not the renderer's, so it is stated here. This
    // gate page genuinely has no flat fallback — the per-surface SVG fallback is a P3
    // obligation (§6.3.7) — and saying so is better than implying one exists.
    `<p style="color:#8fa0bd;font-size:13px">This P1 gate page carries no flat fallback: ` +
    `the per-surface SVG or refusal fallback is built with each surface at P3.</p>` +
    (out.detail ? `<code>${out.detail}</code>` : '');
  overlay.appendChild(box);
  // The data legend describes marks that are not on screen. Leaving it up would label an
  // empty plate as though it held a distribution.
  document.querySelector('.legend')!.classList.add('refused');
  document.getElementById('stats')!.textContent =
    'no three-dimensional view on this device — the numbers above are unaffected';
} else {
  const S = data.samples, N = S.length;
  const mean = S.reduce((a, b) => a + b, 0) / N;
  const sd = Math.sqrt(S.reduce((a, b) => a + (b - mean) ** 2, 0) / N);
  const row = (k: string, v: string) => `<div><span>${k}</span>${v}</div>`;
  document.getElementById('ro')!.innerHTML =
    row('runs', N.toLocaleString()) + row('distinct', out.distinct.toLocaleString()) +
    '<hr>' + row('mean', money(mean)) + row('sd', money(sd)) + row('max', money(S[N - 1]!));
  document.getElementById('n')!.textContent = N.toLocaleString();
  document.getElementById('bw')!.textContent =
    `gaussian kernel, h = ${(BANDWIDTH_FRACTION * 100).toFixed(1)}% of range`;
  // `hdr` is NAMED rather than hidden: the 8-bit path is a real degradation (density
  // clips instead of rolling off) and a reader comparing two screenshots deserves to
  // know which one they are looking at.
  document.getElementById('stats')!.textContent =
    `${out.distinct} distinct outcomes · ${out.hdr ? 'HDR float' : '8-bit'} · bloom · linear-light`;
  document.title = 'READY';
}

/* The policies, printed under the figure. They are values in the package precisely so a
   surface can show them instead of paraphrasing them into something weaker. */
document.getElementById('policy')!.textContent =
  [describeToneMapping(), DEPTH_POLICY, MOTION_POLICY].join(' ');

/* ── FRAME TIME, on ?perf ─────────────────────────────────────────────────────────────
   Off by default: it blocks on `gl.finish()` for a hundred-odd frames, which would make
   an ordinary page load feel broken for a number nobody asked for. */
const perfParam = new URLSearchParams(location.search).get('perf');
if (document.title !== 'READY') document.title = 'READY';

if (perfParam !== null && out.kind === 'rendered') {
  // Title is already READY above, so the capture harness is never blocked on this. The
  // measurement takes seconds and announces itself separately.
  /* Deferred one turn so the page paints before the harness blocks the main thread —
     it busy-waits, and a page that never painted looks broken while it runs. */
  setTimeout(() => {
    const gl = canvas.getContext('webgl2')!;
    const policy = document.getElementById('policy')!;

    const gpu = measureGpu(out.redraw, gl, Number(perfParam) || 120);
    const throughput = sweepThroughput(out.redraw, gl);
    // The LARGEST batch, not the best of them. Taking the max would be cherry-picking the
    // run where the sync was cheapest; the largest batch is the one where it is amortised
    // furthest and is the figure the convergence above is evidence for.
    const sustainedFps = throughput[throughput.length - 1]!.framesPerSec;

    const stats: FrameStats = {
      renderer,
      software: isSoftware(renderer),
      canvas: `${canvas.width}×${canvas.height}`,
      samples: out.samples,
      setupMs,
      gpu,
      throughput,
      sustainedFps,
    };
    window.__PERF__ = stats;

    const head = `${stats.samples.toLocaleString()} deposits + 5 post passes at ${stats.canvas} · `;
    const gpuLine = gpu.method === 'UNAVAILABLE'
      ? `GPU timing unavailable (${gpu.reason})`
      : `GPU median ${gpu.medianMs.toFixed(2)} ms · p95 ${gpu.p95Ms.toFixed(2)} ms ` +
        `(${gpu.fpsAtP95.toFixed(0)} fps) · ${gpu.discarded} disjoint samples discarded`;
    policy.textContent =
      `${head}${gpuLine} · sustained ${sustainedFps.toFixed(0)} full frames/sec · ` +
      `setup ${stats.setupMs.toFixed(0)} ms · ${stats.renderer}` +
      (stats.software ? ' · SOFTWARE RASTERISER — these numbers say nothing about a GPU' : '');
    document.title = 'PERF_DONE';
  }, 0);
}
