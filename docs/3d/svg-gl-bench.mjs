/**
 * THE MEASUREMENT `PLATFORM_VFX_100X.md` §7.2 PROMISED AND NOBODY TOOK.
 *
 *   "L5 needs a size/complexity threshold below which SVG is simply correct, and that
 *    threshold has to be measured, not guessed."   — PLATFORM_VFX_100X.md:139-141
 *
 * It was guessed instead, twice, in opposite directions: §7.2 guessed that a 40 px sparkline
 * "must never take a GL context", and the shipped kit GL-backed the sparkline and hand-excluded
 * one mark from one other chart (`charts/gl/FlatBand.tsx`, the envelope note). Neither decision
 * has a number under it. `docs/3d/w2/SVG_GL_THRESHOLD.md` derives everything about that threshold
 * that the source code can settle on its own — and it stops at the same place every time, which
 * is why this script exists.
 *
 * ── WHAT IS DERIVABLE FROM THE CODE, AND THEREFORE NOT MEASURED HERE ────────────────────
 * The RESOLUTION arm. Every visual difference the GL layer makes is proportional to the mark:
 * the lit edge is `smoothstep(0.10, 0.0, t)` — the first 10 % of the mark's lit axis — the
 * modelling ramp is `1 - m·t²` along that same axis, and the contact shadow extends `0.48·T`
 * beyond the mark's base. Those constants are in `flat/bars.ts` and `flat/strokes.ts` and they
 * settle, with arithmetic and no browser, the size below which the layer draws nothing a reader
 * can see. That arm is computed in `resolutionGate()` below and printed next to the timings so
 * the two are read together, but it is ALGEBRA, not measurement, and it is labelled as such.
 *
 * ── WHAT IS NOT DERIVABLE, AND IS THE ENTIRE REASON FOR A BROWSER ──────────────────────
 * The COST arm. Reading the render path gives the *shape* of the cost exactly — 6 full-screen
 * passes, ~4.31·A texture fetches, one cross-context `drawImage`, 17 `getUniformLocation`
 * queries, and a full reallocation of three render targets whenever `setRegion` is handed a
 * size different from the previous chart's. It gives none of the CONSTANTS. Texture allocation,
 * `checkFramebufferStatus`, a WebGL→2-D-canvas copy and Blink's style/layout/raster for an SVG
 * of N marks are all driver and engine costs. No amount of reading decides them, and this repo's
 * rule is that a measurement you did not take is not a measurement.
 *
 * ── THE FIVE QUESTIONS THIS ANSWERS ────────────────────────────────────────────────────
 *   Q1  What does ONE `sharedRenderer().render()` cost, at each chart size the kit actually
 *       ships, and how does that split between the post chain, the blit, and the marks?
 *   Q2  How much of it is the `setRegion` reallocation — i.e. what does a dashboard pay for
 *       having charts of DIFFERENT sizes rather than identical ones? The code says this is a
 *       cliff, not a slope (`setRegion` early-returns on an unchanged size). How tall a cliff?
 *   Q3  Does the per-primitive cost ever matter? The derivation says the fixed cost dominates
 *       by 6×-56× at every primitive count this kit produces, so a PRIMITIVE-COUNT threshold
 *       cannot exist. A sweep from N=1 to N=480 either confirms that or refutes it.
 *   Q4  What does the same chart cost as SVG, for the same transition — N marks re-geometried
 *       25 times, which is the 420 ms `useFlatChart` entrance at 60 Hz?
 *   Q5  How many charts fit in one 16.7 ms frame? That is the number a page-level budget can
 *       be written against, and the one thing §7.3's "sixty on a dashboard" needs.
 *
 * ── WHY HEADED CHROMIUM, AND WHY SWIFTSHADER CANNOT PUBLISH ────────────────────────────
 * Same reason `docs/3d/serve.mjs` and `p1/serve.mjs` both give. Headless Chromium runs WebGL on
 * SwiftShader, a CPU rasteriser; a threshold measured there would be a claim about a software
 * renderer nobody ships to. So this launches HEADED, reads `WEBGL_debug_renderer_info`, and
 * REFUSES TO PRINT A VERDICT if the renderer string is SwiftShader — it prints the numbers with
 * a refusal banner instead. `--allow-swiftshader` relaxes the launch but not the refusal: the
 * whole failure mode being prevented is a CPU number getting transcribed into a document as a
 * GPU one, which is exactly the §4.5 defect (`3D_VFX_FINAL_PLAN.md`) in a new place.
 *
 * ── WHY IT BUNDLES THE FLAT LANE DIRECTLY AND NOT `@lcx/gl` ────────────────────────────
 * Two reasons, and the second is the load-bearing one.
 *   1. `packages/gl/src/index.ts` re-exports `env/lit.ts`, `env/particles.ts`, `env/volume.ts`
 *      and the rest of L4. Bundling the barrel would pull ~60 KB of environment shaders into a
 *      chart benchmark and charge the flat lane for code no chart imports.
 *   2. The charts import through the barrel, but what they USE is `flat/shared`, `flat/bars`,
 *      `flat/strokes`, `look/pipeline`, `look/colour` and `stage`. Six modules. Naming them
 *      explicitly means this script cannot be broken by an edit to a layer it does not measure.
 *
 * ── WHY IT WRITES ONLY TO A TEMP DIRECTORY ─────────────────────────────────────────────
 * It is a measuring instrument, not a build step. It produces a bundle, an HTML page, one PNG
 * per cell and one JSON block; all of it lands in `mkdtemp` and the path is printed. Nothing in
 * the repo is touched, so it is safe to run while other work is in flight, and two runs cannot
 * fight over an output file.
 *
 * Usage:
 *   node docs/3d/svg-gl-bench.mjs                 measure, print the table and the verdict
 *   node docs/3d/svg-gl-bench.mjs --json          machine-readable only, for transcription
 *   node docs/3d/svg-gl-bench.mjs --sweep         add the N=1..480 primitive-count sweep (Q3)
 *   node docs/3d/svg-gl-bench.mjs --keep-open     leave the browser open to look at the cells
 *   node docs/3d/svg-gl-bench.mjs --allow-swiftshader   run without a GPU; verdict still refused
 */
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { writeFileSync, mkdtempSync, readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const GL = resolve(ROOT, 'packages/gl/src');

const ARG = new Set(process.argv.slice(2));
const JSON_MODE = ARG.has('--json');
const SWEEP = ARG.has('--sweep');
const KEEP_OPEN = ARG.has('--keep-open');
const ALLOW_SWIFTSHADER = ARG.has('--allow-swiftshader');

/* Under --json stdout is somebody's `JSON.parse`; the human table would corrupt it. Same
   convention as `p1/build.mjs`, for the same reason. */
const say = JSON_MODE ? () => {} : (s) => console.log(s);

/* ════════════════════════════════════════════════════════════════════════════════════════
 * THE CELLS — every one of them is a size the shipped kit actually renders.
 *
 * A benchmark of round numbers measures round numbers. These are read off the components, so a
 * result maps to a chart rather than to a hypothetical: `viewW`/`viewH` are the component's own
 * viewBox, `n` is a plausible series length, and `lit`/`cross` are the two extents the
 * resolution gate needs. `css` is the CSS width the viewBox is scaled to — the `w-full` charts
 * are laid out by their card, and `Sparkline`/`DonutChart` set a fixed pixel width, which is why
 * they carry `fixed: true`.
 *
 * `exposureStops` IS PER CELL AND WAS NOT, and the first captures were wrong because of it.
 * The four GL layers do not agree on exposure: `FlatLine` uses `exposure(..., 0.30)` and
 * `FlatBand`, `FlatDial`, `FlatBars` and `FlatTrack` all use 0.62 — a factor of 2^0.32 = 1.25x in
 * linear radiance before the tone map. This harness hard-coded 0.30 for every stroke, so the
 * `ControlBand` cell was rendered a quarter dimmer than the shipped component and the capture
 * understated its ink. Exposure feeds the tone map, and the whole point of the stroke cells is a
 * claim about how much ink reaches the reader, so a wrong exposure is a wrong answer and not a
 * cosmetic detail. Every value below is transcribed from the layer named in its comment.
 * ════════════════════════════════════════════════════════════════════════════════════════ */
const CELLS = [
  {
    id: 'Sparkline', kind: 'stroke', viewW: 96, viewH: 28, css: 96, fixed: true,
    /* n IS THE DRAW-CALL COUNT, NOT THE DATA-POINT COUNT, and getting that wrong is why the
       first run of this script priced a 192x56 sparkline at 0.671 ms — ten times a 422,400-pixel
       column chart. `Sparkline` emits ONE `polyline()` for the base run plus one more for the
       status tail when `good` is set, whatever the series length; `ControlBand` emits one per
       DASH, which is why its n is 55 and this one's is 2. A stroke batch charges per call. */
    n: 2, halfWidth: 1.15, svgStrokeWidth: 2, bloomGain: 0, threshold: [4, 5], modelling: 0.35,
    exposureStops: 0.30,   // FlatLine
    note: 'default 96x28; halfWidth 1.15 against a strokeWidth-2 polyline; 2 draw calls',
  },
  {
    id: 'ControlBand', kind: 'stroke', viewW: 480, viewH: 200, css: 480,
    // 5-on/3-off dashes with a 1-unit cap: one polyline() call per dash, over the plot width.
    n: Math.round((480 - 46 - 8) / 8) + 2, halfWidth: 1.3, svgStrokeWidth: 2,
    bloomGain: 0.3, threshold: [0.3, 1.1], modelling: 0.22,
    exposureStops: 0.62,   // FlatBand — NOT FlatLine's 0.30; see the note on `exposureStops`
    note: 'HALF=1.3; the dashed actual series is one draw call PER DASH',
  },
  {
    id: 'GaugeChart', kind: 'arc', viewW: 160, viewH: 96, css: 320,
    n: 2, rInner: 55.5, rOuter: 68.5, sweepFrac: 0.66, modelling: 0.52,
    bloomGain: 0.3, threshold: [0.3, 1.1], exposureStops: 0.62,   // FlatDial
    note: 'THICKNESS 13; viewBox 160 scaled to a 320px card',
  },
  {
    id: 'DonutChart', kind: 'arc', viewW: 160, viewH: 160, css: 160, fixed: true,
    n: 5, rInner: 57, rOuter: 79, sweepFrac: 1, modelling: 0.42,
    bloomGain: 0, threshold: [4, 5], exposureStops: 0.30,   // FlatLine
    note: 'size 160, thickness 22, fixed pixel width',
  },
  {
    id: 'StackedBarH', kind: 'bars', orientation: 'horizontal', viewW: 480, viewH: 20, css: 480,
    n: 4, thickness: 20, litSpan: 'length', bloomGain: 0.3, threshold: [0.3, 1.1], exposureStops: 0.62,
    note: 'BAR_H 20; the whole viewBox IS the bar',
  },
  {
    id: 'BarChartH', kind: 'bars', orientation: 'horizontal', viewW: 480, viewH: 156, css: 480,
    n: 6, thickness: 18, litSpan: 'length', bloomGain: 0.3, threshold: [0.3, 1.1], exposureStops: 0.62,
    note: '6 rows at ROW_H 26, BAR_H 18',
  },
  {
    id: 'FunnelChart', kind: 'bars', orientation: 'horizontal', viewW: 480, viewH: 200, css: 480,
    n: 5, thickness: 24, litSpan: 'length', bloomGain: 0.3, threshold: [0.3, 1.1], exposureStops: 0.62,
    note: 'h-6 tracks; measured in CSS px off the DOM, so viewBox == CSS px',
  },
  {
    id: 'ColumnChart', kind: 'bars', orientation: 'vertical', viewW: 480, viewH: 220, css: 480,
    n: 8, thickness: 24, litSpan: 'height', bloomGain: 0.3, threshold: [0.3, 1.1], exposureStops: 0.62,
    note: '8 columns, colW clamped to 24',
  },
  {
    id: 'ColumnChart-40', kind: 'bars', orientation: 'vertical', viewW: 480, viewH: 220, css: 480,
    n: 40, thickness: 8.8, litSpan: 'height', bloomGain: 0.3, threshold: [0.3, 1.1], exposureStops: 0.62,
    note: '40 columns: band 10.8, colW = band-2 = 8.8',
  },
  {
    id: 'Histogram-120', kind: 'bars', orientation: 'vertical', viewW: 480, viewH: 220, css: 480,
    n: 120, thickness: 2.6, litSpan: 'height', bloomGain: 0.3, threshold: [0.3, 1.1], exposureStops: 0.62,
    note: '120 bins: band 3.6, colW = max(1, band-1) = 2.6',
  },
];

/* ════════════════════════════════════════════════════════════════════════════════════════
 * ARM A — THE RESOLUTION GATE. Arithmetic, in Node, no browser involved.
 *
 * Printed beside the timings because the two arms answer different halves of one question and
 * reading either alone gets the threshold wrong: the cost arm alone says "small charts are
 * cheap, back them all", and the resolution arm alone says "small marks gain nothing, back
 * none of them". The threshold is the conjunction.
 * ════════════════════════════════════════════════════════════════════════════════════════ */
const DPR = 2; // Math.min(2, devicePixelRatio) in useFlatChart — 2 is the ceiling and the retina case.

function resolutionGate(c) {
  const scale = (c.css / c.viewW) * DPR;      // viewBox units -> device px
  let litDev, what;
  if (c.kind === 'stroke') {
    /* A polyline is emitted with uSoft = 1, so `smoothstep(1, 0, |vAcross|)` spans the WHOLE
       ribbon: there is no lit edge and no opaque core, only a falloff. The extent that governs
       every varying term is therefore the cross-axis, 2*halfWidth. */
    litDev = 2 * c.halfWidth * scale;
    what = 'ribbon width (2·halfWidth) — uSoft=1, the whole width is falloff';
  } else if (c.kind === 'arc') {
    // `vAcross` runs +1 (outer) to -1 (inner), so the band thickness is the only varying axis.
    litDev = (c.rOuter - c.rInner) * scale;
    what = 'band thickness (rOuter − rInner)';
  } else if (c.litSpan === 'length') {
    /* `t = uHorizontal > 0.5 ? vUV.x : vy` — a HORIZONTAL bar is lit along its LENGTH, so the
       lit axis is the bar's value extent, not its thickness. This is the single fact most
       likely to be got backwards, and it is why the gate is computed rather than eyeballed. */
    litDev = c.viewW * 0.6 * scale;
    what = 'bar length at 60% of the track (lit along x)';
  } else {
    litDev = (c.viewH - 36) * 0.6 * scale;
    what = 'column height at 60% of the plot (lit along y)';
  }
  /* THE TWO CONSTANTS, BOTH READ OFF `flat/bars.ts` / `flat/strokes.ts`:
     the highlight occupies the first 10% of the lit axis, so it EXISTS at 10 device px and
     READS as an edge at 20. Below 10 the layer's only remaining difference from the SVG is a
     one-pixel analytic feather, which the SVG rasteriser already provides. */
  const highlightPx = 0.10 * litDev;
  const contactPx = c.kind === 'bars' ? 0.48 * c.thickness * scale : 0;
  return {
    scale, litDev, what, highlightPx, contactPx,
    verdict: litDev >= 20 ? 'GL' : litDev >= 10 ? 'MARGINAL' : 'SVG',
  };
}

/* ════════════════════════════════════════════════════════════════════════════════════════
 * ARM B — THE HARNESS. This is the page source, and it replicates the SHIPPED call sequence.
 *
 * It deliberately does NOT import the React components. Two reasons:
 *   1. `docs/3d/w2/build.mjs` inlines `apps/web/dist/assets/*.css`, so any harness built on the
 *      components requires a web build to exist. A measuring instrument that cannot run on a
 *      clean checkout does not get run.
 *   2. What is being measured is the ARCHITECTURE — `sharedRenderer().render()`, the post chain,
 *      the blit, the `setRegion` reallocation. Every chart reaches those through the same four
 *      calls, so replicating the calls measures all eleven at once and none of them approximately.
 * The draw bodies below are transcriptions of `FlatBars.draw`, `FlatTrack.draw`, `FlatLine.draw`
 * and `FlatDial.draw`: same batch, same style values, same `resolve` options, same clear.
 * ════════════════════════════════════════════════════════════════════════════════════════ */
const HARNESS = [
  "import { sharedRenderer } from " + JSON.stringify(resolve(GL, 'flat/shared.ts')) + ";",
  "import { createBarBatch, plotMatrix } from " + JSON.stringify(resolve(GL, 'flat/bars.ts')) + ";",
  "import { createStrokeBatch } from " + JSON.stringify(resolve(GL, 'flat/strokes.ts')) + ";",
  "import { createPipeline } from " + JSON.stringify(resolve(GL, 'look/pipeline.ts')) + ";",
  "import { hexToLinear, exposure } from " + JSON.stringify(resolve(GL, 'look/colour.ts')) + ";",
  "import { beginAdditive, endPass } from " + JSON.stringify(resolve(GL, 'stage.ts')) + ";",
  "",
  "const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };",
  "",
  "/* THE RENDERER'S OWN REFUSAL PATH IS THE FIRST THING CHECKED. `sharedRenderer()` returns a",
  "   refusal object rather than throwing, and a benchmark that treated that as a stage would",
  "   time `undefined.gl` and report a very fast renderer. */",
  "const R = sharedRenderer();",
  "if ('kind' in R) { window.__benchError = R.code + ': ' + R.reason; throw new Error(R.code); }",
  "const stage = R.stage;",
  "const gl = stage.gl;",
  "",
  "const dbg = gl.getExtension('WEBGL_debug_renderer_info');",
  "window.__renderer = {",
  "  unmasked: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,",
  "  vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,",
  "  hdr: stage.hdr,",
  "  dpr: window.devicePixelRatio,",
  "};",
  "",
  "/* ONE batch set for the whole run, exactly as each chart holds its kit in a ref across",
  "   frames. Building them per frame is the leak `FlatBand`'s header names — four programs per",
  "   animation frame — and building them per CELL would charge every cell a shader compile,",
  "   which is a mount cost and not a frame cost. Mount cost is timed separately, below. */",
  "const bars = createBarBatch(stage);",
  "const strokes = createStrokeBatch(stage);",
  "const pipeline = createPipeline(stage);",
  "if ('kind' in bars || 'kind' in strokes || 'kind' in pipeline) {",
  "  window.__benchError = 'batch or pipeline refused';",
  "  throw new Error('refused');",
  "}",
  "",
  "const HEX = '#3d7dff';",
  "",
  "function geometry(c) {",
  "  const out = { rects: [], polylines: [], arcs: [] };",
  "  if (c.kind === 'bars') {",
  "    const horizontal = c.orientation === 'horizontal';",
  "    for (let i = 0; i < c.n; i++) {",
  "      const f = 0.25 + 0.75 * Math.abs(Math.sin(i * 1.7));",
  "      if (horizontal) {",
  "        const y = (i + 0.5) * (c.viewH / c.n) - c.thickness / 2;",
  "        out.rects.push({ x0: 0, x1: c.viewW * f, y0: y, y1: y + c.thickness });",
  "      } else {",
  "        const band = c.viewW / c.n;",
  "        const x = i * band + (band - c.thickness) / 2;",
  "        const h = (c.viewH - 36) * f;",
  "        out.rects.push({ x0: x, x1: x + c.thickness, y0: c.viewH - 18 - h, y1: c.viewH - 18 });",
  "      }",
  "    }",
  "  } else if (c.kind === 'stroke') {",
  "    /* ONE POLYLINE PER DASH. `ControlBand` splits its dashed `actual` series into a separate",
  "       `polyline()` call per dash run, so its draw-call count is the dash count and not the",
  "       series count. Modelling that as a single long polyline would hide the one place in this",
  "       kit where the PER-PRIMITIVE cost is large. */",
  "    const seg = Math.max(2, Math.floor(64 / Math.max(1, c.n)) + 2);",
  "    for (let d = 0; d < c.n; d++) {",
  "      const f = new Float32Array(seg * 2);",
  "      for (let k = 0; k < seg; k++) {",
  "        const u = (d + k / (seg - 1)) / c.n;",
  "        f[k * 2] = u * c.viewW;",
  "        f[k * 2 + 1] = c.viewH * (0.5 + 0.35 * Math.sin(u * 9));",
  "      }",
  "      out.polylines.push(f);",
  "    }",
  "  } else {",
  "    const cx = c.viewW / 2, cy = c.viewH / 2;",
  "    for (let i = 0; i < c.n; i++) {",
  "      out.arcs.push({",
  "        cx, cy, rInner: c.rInner, rOuter: c.rOuter,",
  "        a0: (i / c.n) * Math.PI * 2 * c.sweepFrac,",
  "        a1: ((i + 1) / c.n) * Math.PI * 2 * c.sweepFrac,",
  "      });",
  "    }",
  "  }",
  "  return out;",
  "}",
  "",
  "/* THE DRAW, transcribed from the shipped `Flat*` layers. `post` is a knob this harness adds",
  "   and no component has: it lets one run skip the blur chain so the four blur passes can be",
  "   priced on their own. Nothing else deviates. */",
  "function makeDraw(c, g, post) {",
  "  const scaleArc = c.kind === 'arc' ? (Math.max(c.viewW, c.viewH) || 1) : 1;",
  "  return function draw(frame) {",
  "    const s = frame.stage;",
  "    const mvp = c.kind === 'arc'",
  "      ? plotMatrix(0, c.viewW / scaleArc, c.viewH / scaleArc, 0)",
  "      : plotMatrix(0, c.viewW, c.viewH, 0);",
  "    s.bindTarget(s.scene);",
  "    gl.clearColor(0, 0, 0, 0);",
  "    gl.clear(gl.COLOR_BUFFER_BIT);",
  "    beginAdditive(gl);",
  "    if (c.kind === 'bars') {",
  "      bars.draw(mvp, g.rects.map((r) => ({ ...r, colour: exposure(hexToLinear(HEX), c.exposureStops) })), {",
  "        orientation: c.orientation, modelling: 0.52, edgeStops: -0.2,",
  "        contact: post && post.contact !== undefined ? post.contact : 0.7,",
  "        radius: Math.min(6, c.viewH * 0.02),",
  "      });",
  "    } else if (c.kind === 'stroke') {",
  "      for (const p of g.polylines) {",
  "        strokes.polyline(mvp, p, {",
  "          colour: exposure(hexToLinear(HEX), 0.30), halfWidth: c.halfWidth,",
  "          gain: 1, modelling: c.modelling,",
  "        });",
  "      }",
  "    } else {",
  "      for (const a of g.arcs) {",
  "        strokes.arc(mvp, a.cx / scaleArc, a.cy / scaleArc, a.rInner / scaleArc, a.rOuter / scaleArc,",
  "          a.a0, a.a1, { colour: exposure(hexToLinear(HEX), c.exposureStops), gain: 1, modelling: c.modelling });",
  "      }",
  "    }",
  "    endPass(gl);",
  "    pipeline.resolve({",
  "      plate: [0, 0, 0], bloomGain: c.bloomGain, threshold: c.threshold,",
  "      vignetteDepth: 0, transparent: true,",
  "      ...(post && post.blurSteps ? { blurSteps: post.blurSteps } : {}),",
  "    });",
  "  };",
  "}",
  "",
  "const REPS = 400;       // Batch size. See the note below on why this is not 25.",
  "const WARM = 12;",
  "",
  "/* TIMING IS BATCHED, AND THE FIRST VERSION OF THIS FUNCTION WAS NOT — which made the whole",
  "   instrument useless in a way that looked like a result.",
  "",
  "   `performance.now()` in Chromium is CLAMPED TO 100 µs. Timing one `render()` therefore",
  "   returns 0.00, 0.10 or 0.20 for anything under a fifth of a millisecond, and the first run",
  "   of this script duly reported 0.00 ms for six of ten cells, 0.00 for every blit delta and",
  "   0.00 for every blur delta — i.e. it reported that the post chain, the cross-context copy",
  "   and the four blur passes are all free. They are not free; they were BELOW THE TIMER. A",
  "   table of zeros reads as a finding and is the exact failure this repo keeps catching:",
  "   an instrument that cannot resolve its subject reporting a number anyway.",
  "",
  "   So: REPS frames, two clock reads, divide. That puts the effective resolution at 100 µs /",
  "   400 = 250 ns, which is well under everything being measured.",
  "",
  "   WHAT THE TWO NUMBERS MEAN, precisely, because they are not interchangeable:",
  "     `sync`  — wall time to SUBMIT one frame's commands. This is JS plus driver call overhead",
  "               and nothing else; WebGL is queued, so the GPU has not necessarily started.",
  "     `full`  — wall time per frame with the queue drained by one `gl.finish()` at the END of",
  "               the batch. This is THROUGHPUT, not latency: consecutive frames overlap on the",
  "               GPU, so it answers 'how many of these fit in a frame' and NOT 'how long does",
  "               one take from call to pixel'. That is the right question for a dashboard budget",
  "               and the wrong one for a latency claim, and the difference is worth not blurring. */",
  "/* AND THE BATCH IS RUN THREE TIMES, MIN TAKEN. The first batched run of this script produced",
  "   a bars sweep that went 0.07, 0.08, 1.41, 1.25, 1.23, 0.96, 0.32, 0.30, 0.70, 1.15 ms for",
  "   N = 1..480 — non-monotonic by 4x in both directions, which is not a cost curve, it is GPU",
  "   clock ramp and scheduler interference. A MEAN would have smoothed that into a plausible",
  "   flat line and a MEDIAN into a plausible rising one; both would have been fiction. The min",
  "   of several batches is the standard robust estimator here because interference only ever",
  "   adds time: the fastest batch is the one that got closest to the machine's real cost. */",
  "const ROUNDS = 3;",
  "function time(fn, reps, opts) {",
  "  const n = reps || REPS;",
  "  let sync = Infinity, full = Infinity;",
  "  for (let i = 0; i < WARM; i++) fn(i / WARM);",
  "  gl.finish();",
  "  for (let r = 0; r < ROUNDS; r++) {",
  "    const t0 = performance.now();",
  "    for (let i = 0; i < n; i++) fn(i / n);",
  "    const t1 = performance.now();",
  "    if (!opts || opts.finish !== false) gl.finish();",
  "    const t2 = performance.now();",
  "    sync = Math.min(sync, (t1 - t0) / n);",
  "    full = Math.min(full, (t2 - t0) / n);",
  "  }",
  "  return { sync, full };",
  "}",
  "",
  "function makeTarget(dw, dh, cssW, cssH) {",
  "  const el = document.createElement('canvas');",
  "  el.width = dw; el.height = dh;",
  "  el.style.width = cssW + 'px'; el.style.height = cssH + 'px';",
  "  el.style.display = 'block';",
  "  return el;",
  "}",
  "",
  "/* THE SVG SIDE, and the comparison it is standing in for.",
  "",
  "   An SVG is RETAINED MODE: once it is on screen it costs nothing per frame, so 'what does the",
  "   SVG cost' has no answer as a frame time. What it costs is a CHANGE. The comparable unit is",
  "   therefore one transition — N marks re-geometried, style recalculated, layout flushed and the",
  "   dirty rect re-rastered — against the GL path's ~25 renders for the same transition.",
  "",
  "   `getBoundingClientRect()` after the mutation forces style + layout synchronously, which is",
  "   what makes the number comparable to a GL `render()` rather than to an unflushed batch of",
  "   attribute writes. Raster and compositing still happen off this thread; the rAF-interval",
  "   number below is what catches those, and it is why both are collected. */",
  "function svgCell(c, g) {",
  "  const ns = 'http://www.w3.org/2000/svg';",
  "  const svg = document.createElementNS(ns, 'svg');",
  "  svg.setAttribute('viewBox', '0 0 ' + c.viewW + ' ' + c.viewH);",
  "  svg.setAttribute('width', String(c.css));",
  "  svg.style.display = 'block';",
  "  const marks = [];",
  "  if (c.kind === 'bars') {",
  "    for (const r of g.rects) {",
  "      const p = document.createElementNS(ns, 'path');",
  "      p.setAttribute('fill', HEX);",
  "      svg.appendChild(p); marks.push(p);",
  "    }",
  "  } else if (c.kind === 'stroke') {",
  "    for (const _ of g.polylines) {",
  "      const p = document.createElementNS(ns, 'polyline');",
  "      p.setAttribute('fill', 'none');",
  "      p.setAttribute('stroke', HEX);",
  "      p.setAttribute('stroke-width', String(c.svgStrokeWidth));",
  "      p.setAttribute('stroke-linejoin', 'round');",
  "      p.setAttribute('stroke-linecap', 'round');",
  "      svg.appendChild(p); marks.push(p);",
  "    }",
  "  } else {",
  "    for (const _ of g.arcs) {",
  "      const p = document.createElementNS(ns, 'path');",
  "      p.setAttribute('fill', 'none');",
  "      p.setAttribute('stroke', HEX);",
  "      p.setAttribute('stroke-width', String(c.rOuter - c.rInner));",
  "      svg.appendChild(p); marks.push(p);",
  "    }",
  "  }",
  "  const polar = (cx, cy, r, a) => [cx + r * Math.cos(a - Math.PI / 2), cy + r * Math.sin(a - Math.PI / 2)];",
  "  const apply = (t) => {",
  "    if (c.kind === 'bars') {",
  "      g.rects.forEach((r, i) => {",
  "        const horizontal = c.orientation === 'horizontal';",
  "        const x1 = horizontal ? r.x0 + (r.x1 - r.x0) * t : r.x1;",
  "        const y0 = horizontal ? r.y0 : r.y1 - (r.y1 - r.y0) * t;",
  "        marks[i].setAttribute('d',",
  "          'M' + r.x0 + ',' + y0 + 'H' + x1 + 'V' + r.y1 + 'H' + r.x0 + 'Z');",
  "      });",
  "    } else if (c.kind === 'stroke') {",
  "      g.polylines.forEach((f, i) => {",
  "        let s = '';",
  "        for (let k = 0; k < f.length; k += 2) s += f[k] + ',' + (f[k + 1] * (0.5 + 0.5 * t)) + ' ';",
  "        marks[i].setAttribute('points', s);",
  "      });",
  "    } else {",
  "      g.arcs.forEach((a, i) => {",
  "        const rm = (a.rInner + a.rOuter) / 2;",
  "        const a1 = a.a0 + (a.a1 - a.a0) * t;",
  "        const p0 = polar(a.cx, a.cy, rm, a.a0), p1 = polar(a.cx, a.cy, rm, a1);",
  "        marks[i].setAttribute('d', 'M' + p0[0] + ',' + p0[1] + 'A' + rm + ',' + rm",
  "          + ' 0 ' + (a1 - a.a0 > Math.PI ? 1 : 0) + ' 1 ' + p1[0] + ',' + p1[1]);",
  "      });",
  "    }",
  "    // FORCE style + layout. Without this the loop times attribute writes into a dirty queue.",
  "    return svg.getBoundingClientRect().width;",
  "  };",
  "  return { svg, apply, nodes: () => svg.querySelectorAll('*').length };",
  "}",
  "",
  "/* Median interval across real animation frames, for BOTH paths. This is the only number that",
  "   includes raster and compositing, and the only one a '60 fps' claim may be made from. It is",
  "   floored by the display refresh, so a value at ~16.7 means 'inside budget' and not 'this is",
  "   how long the work took' — which is exactly why the sync/finish numbers are kept as well. */",
  "async function rafInterval(step, ticks) {",
  "  const t = [];",
  "  let last = await new Promise((r) => requestAnimationFrame(r));",
  "  for (let i = 0; i < ticks; i++) {",
  "    step(i / ticks);",
  "    const now = await new Promise((r) => requestAnimationFrame(r));",
  "    t.push(now - last);",
  "    last = now;",
  "  }",
  "  return median(t);",
  "}",
  "",
  "window.__bench = async function (cells, opts) {",
  "  const host = document.getElementById('cells');",
  "  const out = [];",
  "  for (const c of cells) {",
  "    const g = geometry(c);",
  "    const dw = Math.round(c.css * Math.min(2, window.devicePixelRatio || 1));",
  "    const dh = Math.round(c.css * (c.viewH / c.viewW) * Math.min(2, window.devicePixelRatio || 1));",
  "    const cssH = c.css * (c.viewH / c.viewW);",
  "",
  "    const row = document.createElement('div');",
  "    row.className = 'row';",
  "    row.innerHTML = '<div class=\"lbl\">' + c.id + '</div>';",
  "    const glWrap = document.createElement('div'); glWrap.className = 'pane';",
  "    const svgWrap = document.createElement('div'); svgWrap.className = 'pane';",
  "    const target = makeTarget(dw, dh, c.css, cssH);",
  "    glWrap.appendChild(target);",
  "    const sv = svgCell(c, g);",
  "    svgWrap.appendChild(sv.svg);",
  "    row.appendChild(glWrap); row.appendChild(svgWrap);",
  "    host.appendChild(row);",
  "",
  "    const draw = makeDraw(c, g, null);",
  "    const drawNoBlur = makeDraw(c, g, { blurSteps: [] });",
  "",
  "    /* FULL PATH — what a chart actually pays: setRegion, viewport, scissor, draw, the six",
  "       post passes, and the cross-context drawImage. */",
  "    const full = time((t) => { R.render(target, (f) => draw({ ...f, t })); }, REPS);",
  "",
  "    /* NO BLIT — the same work with `getContext('2d')`, `clearRect` and `drawImage` removed.",
  "       The difference is the price of the architecture's central trade (`flat/shared.ts` calls",
  "       it 'a rounding error against a frame that already runs five post-process passes'), and",
  "       that sentence has never had a number under it.",
  "",
  "       THE `gl.flush()` IS NOT DECORATION AND THE FIRST VERSION OF THIS DID NOT HAVE IT.",
  "       Without it this A/B measured the wrong thing and produced NEGATIVE deltas — removing",
  "       the blit made six of ten cells 10-16x SLOWER, which cannot be a cost. The reason is",
  "       that `drawImage` from the WebGL canvas implicitly flushes the command buffer every",
  "       frame, so the full path runs flushed-per-frame while the stripped path queued 400",
  "       frames and stalled on transfer-buffer backpressure. Deleting the blit had deleted the",
  "       flush with it, changing the pipelining regime and swamping the effect being measured.",
  "       An explicit flush puts both arms in the same regime, which is the only condition under",
  "       which their difference is the blit. */",
  "    const noBlit = time((t) => {",
  "      stage.setRegion(dw, dh);",
  "      gl.viewport(0, 0, dw, dh); gl.scissor(0, 0, dw, dh); gl.enable(gl.SCISSOR_TEST);",
  "      draw({ stage, width: dw, height: dh, t });",
  "      gl.disable(gl.SCISSOR_TEST);",
  "      gl.flush();",
  "    }, REPS);",
  "",
  "    /* NO BLUR — bright + composite only. Prices the four blur passes, which for the two",
  "       FlatLine charts produce a texture the composite multiplies by bloomGain 0. */",
  "    const noBlur = time((t) => {",
  "      stage.setRegion(dw, dh);",
  "      gl.viewport(0, 0, dw, dh); gl.scissor(0, 0, dw, dh); gl.enable(gl.SCISSOR_TEST);",
  "      drawNoBlur({ stage, width: dw, height: dh, t });",
  "      gl.disable(gl.SCISSOR_TEST);",
  "      gl.flush();   // same regime as noBlit above, or the delta is not the blur",
  "    }, REPS);",
  "",
  "    /* THE REALLOCATION CLIFF (Q2). `setRegion` early-returns on an unchanged size, so a page",
  "       of identical charts allocates once and a page of differently-sized charts reallocates",
  "       three textures and three framebuffers PER CHART PER FRAME. Alternating two sizes",
  "       against holding one isolates exactly that, and nothing else changes between the runs. */",
  "    const steady = time(() => { stage.setRegion(dw, dh); }, REPS);",
  "    const churn = time(() => {",
  "      stage.setRegion(dw, dh);",
  "      stage.setRegion(dw + 7, dh + 3);",
  "    }, REPS);",
  "    stage.setRegion(dw, dh);",
  "",
  "    /* THE BLIT, PRICED DIRECTLY RATHER THAN BY SUBTRACTION — and the subtraction is left in",
  "       below as a diagnostic, because it is WRONG and the reason is worth keeping.",
  "",
  "       Removing `drawImage` also removes the implicit command-buffer flush it performs, so the",
  "       stripped arm stalls on backpressure; adding `gl.flush()` back to match the regime costs",
  "       ~0.38 ms of GPU-process IPC, which is MORE than the copy it was meant to isolate. The",
  "       measured delta duly came out at a near-constant -0.37 to -0.42 ms across eight cells of",
  "       wildly different sizes — a constant, which is the signature of a fixed overhead in the",
  "       instrument rather than a cost that scales with the thing being measured.",
  "",
  "       So the copy is timed ALONE: the shared canvas already holds a rendered frame, and this",
  "       does nothing but the two 2-D calls `render` ends with. No GL work, no regime to match.",
  "",
  "       AND THIS IS STILL WRONG. IT REPORTS ~0.001 ms AND THE COPY COSTS ~0.5 ms.",
  "       `drawImage` into a 2-D canvas is LAZILY EXECUTED, and nothing here forces the",
  "       destination to realise it: `gl.finish()` drains the WebGL command queue, which is a",
  "       different queue. So this times the ISSUING of the call. `docs/3d/blit-cost.mjs` does it",
  "       correctly — it ends each batch with a 1-pixel `getImageData` on the DESTINATION, which",
  "       cannot return until pending copies have applied, and pays it in both arms so the call",
  "       overhead cancels — and measures 0.467 / 0.643 ms on this machine, plus the finding that",
  "       the copy is sized by the SHARED BUFFER and not by the chart rect. Use that number. This",
  "       one is kept, and kept labelled, because the failure it demonstrates is the whole reason",
  "       a forcing function has to be part of any timing whose subject is asynchronous. */",
  "    const blitOnly = time(() => {",
  "      const ctx = target.getContext('2d');",
  "      ctx.clearRect(0, 0, dw, dh);",
  "      ctx.drawImage(R.stage.gl.canvas, 0, R.stage.gl.canvas.height - dh, dw, dh, 0, 0, dw, dh);",
  "    }, REPS, { finish: false });",
  "",
  "    /* 120, not 400: each rep forces a synchronous style + layout flush, and 400 of those on",
  "       the 120-mark cell is seconds of wall clock for a number that is already stable. */",
  "    const svgT = time((t) => { sv.apply(t); }, 120, { finish: false });",
  "",
  "    const glRaf = await rafInterval((t) => { R.render(target, (f) => draw({ ...f, t })); }, 24);",
  "    const svgRaf = await rafInterval((t) => { sv.apply(t); }, 24);",
  "",
  "    out.push({",
  "      id: c.id, kind: c.kind, n: c.n, devicePx: dw * dh, dw, dh,",
  "      glSyncMs: full.sync, glFinishMs: full.full,",
  "      glNoBlitFinishMs: noBlit.full, glNoBlurFinishMs: noBlur.full,",
  "      blitMs: blitOnly.full,",
  "      blitBySubtractionMs: full.full - noBlit.full,   // confounded; see the note above",
  "      blurMs: noBlit.full - noBlur.full,",
  "      reallocMs: (churn.full - steady.full) / 2,",
  "      svgSyncMs: svgT.sync, svgNodes: sv.nodes(),",
  "      glRafMs: glRaf, svgRafMs: svgRaf,",
  "    });",
  "  }",
  "",
  "  /* THE PRIMITIVE-COUNT SWEEP (Q3). One chart size, N from 1 to 480, so the slope of cost",
  "     against primitive count is measured rather than argued. The derivation says the slope is",
  "     nearly flat for bars — `drawArraysInstanced` issues two draw calls for any N — and real",
  "     for strokes, which get one draw call each. A flat bars line is the finding that kills the",
  "     idea of a primitive-count threshold; a steep one refutes the derivation, which is why the",
  "     sweep is worth its runtime. */",
  "  const sweep = [];",
  "  if (opts && opts.sweep) {",
  "    /* THE CONTACT SHADOW IS SWEPT SEPARATELY, and it is the reason this sweep needed a third",
  "       series. The first version ran bars with contact on, and the cost FELL monotonically from",
  "       1.14 ms at N=2 to 0.107 ms at N=120 — cost falling as work rises, which reads as noise",
  "       and is not. `bars.ts` sizes the shadow quad from the bar's THICKNESS: spread = 0.42*T,",
  "       drop = 0.06*T, so one quad is ~1.076*T^2 and the total contact fill is N*1.076*(480/N)^2",
  "       = 1.076*480^2/N. It scales as 1/N. At N=2, T=238, the two quads cover ~62,000 viewBox^2",
  "       against a 105,600 frame — 58% of the chart, in shadow alone; at N=1 they cover 2.35x the",
  "       whole frame and are simply clipped away. The falling curve was the shadow's area, and",
  "       running the same sweep with contact: 0 is the only way to see the draw-call cost under it. */",
  "    const target = makeTarget(960, 440, 480, 220);   // ONE target: 20 of them is 34 MB of canvas.",
  "    for (const n of [1, 2, 4, 8, 16, 32, 64, 120, 240, 480]) {",
  "      for (const kind of ['bars', 'bars-nocontact', 'stroke']) {",
  "        const c = kind === 'stroke'",
  "          ? { id: 'sweep', kind: 'stroke', viewW: 480, viewH: 220, css: 480, n,",
  "              halfWidth: 1.3, modelling: 0.22, bloomGain: 0.3, threshold: [0.3, 1.1], exposureStops: 0.62 }",
  "          : { id: 'sweep', kind: 'bars', orientation: 'vertical', viewW: 480, viewH: 220, css: 480,",
  "              n, thickness: Math.max(1, 480 / n - 2), bloomGain: 0.3, threshold: [0.3, 1.1], exposureStops: 0.62 };",
  "        const g = geometry(c);",
  "        const draw = makeDraw(c, g, kind === 'bars-nocontact' ? { contact: 0 } : null);",
  "        const r = time((t) => { R.render(target, (f) => draw({ ...f, t })); }, 200);",
  "        sweep.push({ kind, n, finishMs: r.full, syncMs: r.sync });",
  "      }",
  "    }",
  "  }",
  "",
  "  /* Q2 + Q5 · THE DASHBOARD. §7.3 of PLATFORM_VFX_100X names the case that decides the",
  "     architecture — 'sixty on a dashboard' — and no measurement in this repo has ever put more",
  "     than one chart in a frame. This renders K charts in ONE frame, twice: all the same device",
  "     size, then each a few pixels different. The code says the second case reallocates three",
  "     textures and three framebuffers PER CHART PER FRAME while the first allocates once, so the",
  "     ratio between these two rows IS the cost of a dashboard whose cards are not on a grid.",
  "     Everything else is held identical: same geometry, same post chain, same blit. */",
  "  const dash = [];",
  "  for (const K of [4, 12, 30, 60]) {",
  "    const c = { id: 'dash', kind: 'bars', orientation: 'vertical', viewW: 480, viewH: 220,",
  "                css: 480, n: 8, thickness: 24, bloomGain: 0.3, threshold: [0.3, 1.1], exposureStops: 0.62 };",
  "    const g = geometry(c);",
  "    const draw = makeDraw(c, g, null);",
  "    const same = [], vary = [];",
  "    for (let i = 0; i < K; i++) {",
  "      same.push(makeTarget(960, 440, 480, 220));",
  "      // A few pixels of difference is enough: setRegion compares for EQUALITY, not proximity.",
  "      vary.push(makeTarget(960 - i * 2, 440 - i, 480, 220));",
  "    }",
  "    const one = (list) => () => { for (const t of list) R.render(t, (f) => draw({ ...f, t: 1 })); };",
  "    const rs = time(one(same), 40);",
  "    const rv = time(one(vary), 40);",
  "    /* THE BACKING STORE IS REPORTED BECAUSE IT IS THE SECOND REGIME IN THIS TABLE.",
  "       Each target is a 960x440 canvas with a 2-D context: 1.69 MB of RGBA, GPU-resident. At",
  "       K = 60 that is ~101 MB of canvas before a single chart has drawn, on the 8 GB machine",
  "       §7.3 of PLATFORM_VFX_100X names. Past some K the numbers above stop being a per-chart",
  "       render cost and become memory pressure, and the tell is that they stop rising",
  "       monotonically. Without this column that transition is invisible and the top row of the",
  "       table gets quoted as a per-chart cost. */",
  "    const bytes = K * 960 * 440 * 4;",
  "    dash.push({",
  "      charts: K, sameSizeMs: rs.full, variedSizeMs: rv.full,",
  "      backingStoreMB: bytes / (1024 * 1024),",
  "      perChartSameMs: rs.full / K, perChartVariedMs: rv.full / K,",
  "    });",
  "    // Detached, so the next K is not measured against the previous K's backing store.",
  "    for (const t of same.concat(vary)) { t.width = 1; t.height = 1; }",
  "  }",
  "",
  "  return { cells: out, sweep, dash, renderer: window.__renderer };",
  "};",
  "document.title = 'READY';",
  "",
].join('\n');

const PAGE = `<!doctype html><meta charset="utf-8"><title>booting</title>
<style>
 body{margin:0;padding:20px;background:#0b1020;color:#c9d4e8;font:12px/1.5 ui-monospace,monospace}
 .row{display:grid;grid-template-columns:130px 1fr 1fr;gap:14px;align-items:start;
      margin-bottom:14px;padding:10px;background:#111a30;border:1px solid #1e2b4a;border-radius:8px}
 .lbl{color:#7fb2ff}
 .pane{position:relative;background:#0e1628;padding:6px;border-radius:6px}
</style>
<div id="cells"></div>
<script type="module" src="./bench.js"></script>`;

/* ──────────────────────────────────────────────────────────────────────────────────────── */

const tmp = mkdtempSync(join(tmpdir(), 'lcx-svg-gl-bench-'));
writeFileSync(join(tmp, 'entry.ts'), HARNESS);
writeFileSync(join(tmp, 'index.html'), PAGE);

const bundled = await build({
  entryPoints: [join(tmp, 'entry.ts')],
  bundle: true, format: 'esm', target: 'es2022', minify: false,
  outfile: join(tmp, 'bench.js'), write: true, logLevel: 'silent',
});
if (bundled.errors?.length) {
  for (const e of bundled.errors) console.error(e);
  process.exit(1);
}

/* Loopback, GET, this temp directory only — the same narrow scope `docs/3d/serve.mjs` argues
   for, and for the same reason: it serves static bytes to one browser for one minute. */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = createServer((req, res) => {
  const rel = new URL(req.url ?? '/', 'http://x').pathname;
  const file = resolve(join(tmp, rel === '/' ? 'index.html' : rel));
  if (!file.startsWith(tmp + '/') || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, {
    'content-type': TYPES[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const launchArgs = ALLOW_SWIFTSHADER
  ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  : [];
const browser = await chromium.launch({ headless: false, args: launchArgs });
const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForFunction(() => document.title === 'READY' || window.__benchError, { timeout: 30000 });
const boot = await page.evaluate(() => window.__benchError ?? null);
if (boot) {
  console.error(`\n  the renderer refused before any measurement: ${boot}\n`);
  await browser.close(); server.close();
  process.exit(1);
}

const result = await page.evaluate(
  ([cells, opts]) => window.__bench(cells, opts),
  [CELLS, { sweep: SWEEP }],
);
if (errs.length) {
  console.error('  page errors: ' + errs.join(' | '));
  await browser.close(); server.close();
  process.exit(1);
}

/* One capture per cell, GL beside SVG at the same size. Rule 8: every claim gets a capture,
   and the resolution arm above is a claim about what a reader can SEE — it is checkable only
   against a picture, so the numbers and the picture are produced by the same run. */
const shots = [];
for (const [i, c] of CELLS.entries()) {
  const el = page.locator('.row').nth(i);
  const path = join(tmp, `cell-${String(i).padStart(2, '0')}-${c.id}.png`);
  try { await el.screenshot({ path }); shots.push(path); } catch { /* a zero-height row */ }
}

const rendererName = result.renderer?.unmasked ?? '(WEBGL_debug_renderer_info unavailable)';
const isSoftware = /swiftshader|software|llvmpipe/i.test(String(rendererName));

/* ── the report ─────────────────────────────────────────────────────────────────────────── */
const f2 = (x) => (typeof x === 'number' ? x.toFixed(3) : '—');
const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);

say('');
say(`  renderer   ${rendererName}`);
say(`  hdr float  ${result.renderer?.hdr}          dpr ${result.renderer?.dpr}`);
say('');
say('  ARM A · RESOLUTION GATE — arithmetic from flat/bars.ts and flat/strokes.ts, not measured');
say('  ─────────────────────────────────────────────────────────────────────────────────────');
say('  chart            lit axis (dev px)  highlight  contact   gate      what the lit axis is');
for (const c of CELLS) {
  const g = resolutionGate(c);
  say(
    `  ${pad(c.id, 16)} ${rpad(g.litDev.toFixed(1), 16)}  ${rpad(g.highlightPx.toFixed(2), 9)}  `
    + `${rpad(g.contactPx.toFixed(2), 7)}   ${pad(g.verdict, 9)} ${g.what}`,
  );
}
say('');
say('  ARM B · COST — measured, this machine, this run. Per-frame THROUGHPUT, ms.');
say('  "submit" = JS + driver call only.  "drained" = with the GPU queue flushed.');
say('  ─────────────────────────────────────────────────────────────────────────────────────');
say('  chart              dev px    N   submit   drained     blit    blur  realloc    svg  nodes');
for (const r of result.cells) {
  say(
    `  ${pad(r.id, 16)} ${rpad(r.devicePx.toLocaleString(), 9)} ${rpad(r.n, 4)}  `
    + `${rpad(f2(r.glSyncMs), 7)}  ${rpad(f2(r.glFinishMs), 9)} ${rpad(f2(r.blitMs), 6)} `
    + `${rpad(f2(r.blurMs), 7)} ${rpad(f2(r.reallocMs), 8)} ${rpad(f2(r.svgSyncMs), 6)} ${rpad(r.svgNodes, 6)}`,
  );
}
say('  "blit" is UNRELIABLE — it times the ISSUING of drawImage, not the copy landing. The');
say('  real figure is 0.467-0.643 ms from docs/3d/blit-cost.mjs, which forces the destination.');
say('  "realloc" is one setRegion at a size it has not just seen, and is per chart per frame.');
say('');
say('  rAF interval (includes raster + compositing; floored by the display refresh)');
for (const r of result.cells) {
  say(`  ${pad(r.id, 16)} gl ${rpad(f2(r.glRafMs), 6)} ms    svg ${rpad(f2(r.svgRafMs), 6)} ms`);
}

if (result.sweep.length) {
  say('');
  say('  Q3 · PRIMITIVE-COUNT SWEEP — 480x220 at dpr 2, ms per frame');
  say('  Total mark area is held ~constant, so only the DRAW-CALL COUNT varies.');
  say('   N        bars   bars, no contact    stroke');
  const byN = new Map();
  for (const s of result.sweep) {
    if (!byN.has(s.n)) byN.set(s.n, {});
    byN.get(s.n)[s.kind] = s.finishMs;
  }
  for (const [n, v] of byN) {
    say(`  ${rpad(n, 4)}  ${rpad(f2(v.bars), 8)}  ${rpad(f2(v['bars-nocontact']), 17)}  ${rpad(f2(v.stroke), 8)}`);
  }
}

say('');
say('  Q2 + Q5 · THE DASHBOARD — K charts of 960x440 in ONE frame, ms per frame');
say('  charts  backing MB   all same size   each different   penalty   per chart (same)');
for (const d of result.dash) {
  say(
    `  ${rpad(d.charts, 6)}  ${rpad(d.backingStoreMB.toFixed(0), 9)}   ${rpad(f2(d.sameSizeMs), 13)}   `
    + `${rpad(f2(d.variedSizeMs), 14)}   ${rpad((d.variedSizeMs / Math.max(1e-9, d.sameSizeMs)).toFixed(1) + 'x', 7)}   `
    + `${rpad(f2(d.perChartSameMs), 8)}`,
  );
}
say('  A row that is not monotonically worse than the row above it is MEMORY-BOUND, not');
say('  render-bound, and its figure is not a per-chart cost. See the note in the harness.');

say('');
say('  ONE TRANSITION — the comparable unit. 25 frames is the 420 ms useFlatChart entrance.');
say('  chart              gl 25 frames   svg 25 frames   charts inside one 16.7 ms frame');
for (const r of result.cells) {
  const perFrame = r.glFinishMs;
  say(
    `  ${pad(r.id, 16)} ${rpad(f2(r.glFinishMs * 25), 12)}   ${rpad(f2(r.svgSyncMs * 25), 13)}   `
    + `${rpad((16.7 / Math.max(1e-9, perFrame)).toFixed(0), 8)}`,
  );
}

say('');
if (isSoftware) {
  say('  ╔══════════════════════════════════════════════════════════════════════════════════╗');
  say('  ║  NO VERDICT. The renderer above is a SOFTWARE rasteriser.                        ║');
  say('  ║  Every cost number in ARM B is a CPU number. The threshold is a claim about a    ║');
  say('  ║  reader on a GPU, so transcribing these into a document would be the same defect ║');
  say('  ║  as 3D_VFX_FINAL_PLAN §4.5 — a figure that reads as a measurement of something    ║');
  say('  ║  it did not measure. Re-run without --allow-swiftshader, on a machine with a GPU.║');
  say('  ╚══════════════════════════════════════════════════════════════════════════════════╝');
} else {
  say('  VERDICT is the CONJUNCTION of the two arms, and neither alone:');
  say('    GL is defensible for a chart only when ARM A says GL (lit axis >= 20 device px)');
  say('    AND the page\'s chart count times ARM B\'s gl-finish figure fits one frame.');
  say('    ARM A gates VALUE and cannot be bought with a faster machine.');
  say('    ARM B gates AFFORDABILITY and moves with the machine, which is why it is dated.');
}
say('');
say(`  bundle, page, JSON and ${shots.length} captures:  ${tmp}`);
say('');

const payload = {
  generatedBy: 'docs/3d/svg-gl-bench.mjs',
  renderer: result.renderer,
  softwareRasteriser: isSoftware,
  resolutionGate: CELLS.map((c) => ({ id: c.id, ...resolutionGate(c), note: c.note })),
  cost: result.cells,
  sweep: result.sweep,
  dashboard: result.dash,
  captures: shots,
};
writeFileSync(join(tmp, 'result.json'), JSON.stringify(payload, null, 2));
if (JSON_MODE) console.log(JSON.stringify(payload, null, 2));

if (KEEP_OPEN) {
  say('  --keep-open: the browser is left up. Ctrl-C when you are done looking.');
  await new Promise(() => {});
}
await browser.close();
server.close();

/* A software-rasteriser run exits non-zero. It produced numbers, and they are in the JSON, but
   it did not answer the question asked, and a green exit is how that gets forgotten. */
process.exit(isSoftware ? 2 : 0);
