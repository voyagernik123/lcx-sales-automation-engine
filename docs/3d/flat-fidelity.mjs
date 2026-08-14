/**
 * FLAT-MARK FIDELITY, MEASURED OFF RENDERED PIXELS.
 *
 * `docs/3d/brand-fidelity.mjs` deliberately measures a mark that no primitive draws — its own
 * FLAT_FRAG writes the palette constant with "no gain, no falloff, no mask", and says why:
 * including any of those would measure the primitive rather than the composite. That leaves a
 * gap it named and did not close:
 *
 *   "points.ts:111 and lines.ts:36 multiply the data colour by uGain and a falloff BEFORE the
 *    composite, so the flat chart path breaks the hex independently of the tone map."
 *
 * This file closes it, by rendering through `createLineBatch` and `createPointCloud`
 * THEMSELVES — the shipped primitives, not a stand-in — and reading the framebuffer back.
 * `packages/gl/src/primitives/flatHex.test.ts` asserts against the record, with a hash over the
 * live shader sources so an edit to either primitive invalidates it instead of passing stale.
 *
 * ── WHAT EACH CONFIGURATION IS FOR, and why these and not others ─────────────────────────────
 *
 *   linesUnit      a `rule` covering the whole frame at gain 1, fade 0, plate 0, bloom 0. THE
 *                  CONTROL. If lines.ts damaged the hex on its own, this would differ from
 *                  brand-fidelity.json's `compositeOnly`. It is the measurement that decides
 *                  whether the primitive is an INDEPENDENT cause or only a multiplier feeding
 *                  the one cause already known.
 *   linesFade      the same stroke at gain 1 with `fade` set, sampled where the fade factor is
 *                  exactly 0.725, against `linesGainEquiv` — the same stroke at gain 0.725 with
 *                  no fade. lines.ts:36 is `uColour * uGain * (1 - uFade*t)`: at any one pixel
 *                  the two named causes are ONE scalar. If these two rows are equal byte for
 *                  byte, "uGain" and "the falloff" are not separable causes in this primitive
 *                  and reporting them separately would be reporting the same number twice.
 *   linesCeiling   a per-colour sweep across that colour's OWN derived clip point,
 *                  1/((1-TONE_SHOULDER)*max(BRAND[k])). Derived per key rather than one shared
 *                  ladder, so a palette entry added later is swept at its own cliff and not at
 *                  brand blue's.
 *   linesShipped   plate #0E1628 and the pipeline's default bloom — what `renderMotion.ts`
 *                  passes (`pipeline.resolve({ plate: hexToLinear(BRAND_HEX.plate) })`).
 *   pointsCore     one deposit, `lo == hi == BRAND[k]` so the density ramp cannot move the
 *                  colour, measured with blending OFF and then with the shipped `beginAdditive`.
 *                  The RATIO of those two, inverted back through the composite, is the alpha
 *                  points.ts wrote at the core — the one number that says whether its gaussian
 *                  is applied once or twice.
 *
 * Run:  node docs/3d/flat-fidelity.mjs      →  docs/3d/flat-fidelity.json
 *
 * SwiftShader, matching brand-fidelity.mjs, so the two records are read on the same driver and
 * `linesUnit` can be compared with `compositeOnly` without a hardware caveat between them.
 */

import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

/*
 * Bundled from a string, for brand-fidelity.mjs's reason: there is no second copy of any shader
 * here. Every primitive in this measurement is imported from the package under test.
 */
const ENTRY = `
import {
  createStage, isStage, createPipeline, createLineBatch, createPointCloud,
  beginAdditive, endPass, IDENTITY,
  BRAND, BRAND_HEX, hexToLinear, srgbToLinear,
  TONE_SHOULDER, TONE_MAP_GLSL, SRGB_ENCODE_GLSL, PIPELINE_SOURCES,
  LINES_VERT, LINES_FRAG, POINTS_VERT, POINTS_FRAG, FALLOFF,
} from '@lcx/gl';

const W = 128, H = 128;

function centrePixel(gl) {
  const px = new Uint8Array(4);
  gl.readPixels(W >> 1, H >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return [px[0], px[1], px[2]];
}

/* The centre ROW, for measuring how a deposit falls off across its own footprint. */
function centreRow(gl) {
  const buf = new Uint8Array(W * 4);
  gl.readPixels(0, H >> 1, W, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const out = [];
  for (let x = 0; x < W; x++) out.push([buf[x * 4], buf[x * 4 + 1], buf[x * 4 + 2]]);
  return out;
}

window.__measure = () => {
  const canvas = document.getElementById('c');
  canvas.width = W; canvas.height = H;
  const stage = createStage(canvas, { alpha: false });
  if (!isStage(stage)) return { refusal: stage };
  const { gl } = stage;
  stage.setRegion(W, H);

  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const driver = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

  /* AN 8-BIT SCENE TARGET CANNOT MEASURE A CEILING SWEEP. Every gain above 1.0 would already be
     clipped in the accumulation buffer, so the sweep would report the target's limit and the
     record would read as a fact about the composite. Refuse rather than write that number. */
  if (!stage.hdr) return { refusal: { kind: 'refused', code: 'NO_HDR_TARGET' } };

  const lines = createLineBatch(stage);
  if ('kind' in lines) return { refusal: lines };
  const pipeline = createPipeline(stage);
  if ('kind' in pipeline) return { refusal: pipeline };

  const keys = Object.keys(BRAND_HEX);
  const PLATE = hexToLinear(BRAND_HEX.plate);

  /* THE STROKE COVERS THE WHOLE FRAME. mvp is the identity, so the vertices are already clip
     space: from (-2,0) to (2,0) with half-width 2 the quad spans x -2..2 and y -2..2 and the
     centre pixel is interior — no edge, no partial coverage, nothing for an antialiasing
     argument to hide behind. vY runs -2..2, so at the centre pixel vY is exactly 0. */
  const X0 = -2, X1 = 2, HALF = 2;
  const drawLine = (style, opts) => {
    stage.bindTarget(stage.scene);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    beginAdditive(gl);
    lines.rule(IDENTITY(), X0, 0, X1, 0, HALF, style);
    endPass(gl);
    pipeline.resolve(opts);
    return centrePixel(gl);
  };

  const ISOLATE = { plate: [0, 0, 0], bloomGain: 0 };

  /*
   * THE FADE FACTOR AT THE PIXEL WE ACTUALLY READ, derived rather than assumed.
   *
   * The first run of this file compared fade 0.55 against a hand-written gain of 0.725 — the
   * value at vY = 0 — and four of seven colours came back one byte apart. The centre pixel is
   * not at vY = 0: its centre is at NDC ((64+0.5)/128)*2-1 = 0.0078125, and gl_Position.y is
   * p.y here, so vY is that. The fade is therefore 0.72393, and a one-byte gap that looked like
   * a real difference between the two causes was the sample point.
   */
  const FADE = 0.55, FADE_FROM = -2, FADE_TO = 2;
  const vYAtSample = (((W >> 1) + 0.5) / W) * 2 - 1;
  const fadeEquivGain = 1 - FADE * ((vYAtSample - FADE_FROM) / (FADE_TO - FADE_FROM));

  const out = {
    driver, hdr: stage.hdr, keys, fadeEquivGain,
    toneShoulder: TONE_SHOULDER, falloff: FALLOFF,
    linesUnit: {}, linesFade: {}, linesGainEquiv: {},
    linesShipped: {}, linesCeiling: {},
    pointsCore: {},
  };

  /*
   * THE CLIP POINT, DERIVED. lcxToneMap is c/(1+c*s), so it reaches 1.0 — the largest value the
   * sRGB encode can put in a byte — at c = 1/(1-s). Above that the channel is pinned at 255 and
   * two different linear values become the same pixel. Per colour, the largest scalar a stroke
   * can carry before that happens is that point divided by the colour's brightest channel.
   */
  const CLIP_LINEAR = 1 / (1 - TONE_SHOULDER);
  out.clipLinear = CLIP_LINEAR;

  /* Multipliers OF THE COLOUR'S OWN CEILING, not absolute gains: every key is then swept across
     the same part of its own curve, and a palette entry added later needs no new ladder. */
  const RUNGS = [0.25, 0.5, 0.75, 0.9, 0.98, 1.0, 1.02, 1.1, 1.5, 2.0];

  for (const k of keys) {
    const c = BRAND[k];
    const ceiling = CLIP_LINEAR / Math.max(c[0], c[1], c[2]);

    out.linesUnit[k] = drawLine({ colour: c, gain: 1 }, ISOLATE);

    out.linesFade[k] = drawLine(
      { colour: c, gain: 1, fade: FADE, fadeFrom: FADE_FROM, fadeTo: FADE_TO }, ISOLATE);
    out.linesGainEquiv[k] = drawLine({ colour: c, gain: fadeEquivGain }, ISOLATE);

    /* What renderMotion.ts:118 passes: the plate, and the pipeline's own bloom and vignette
       defaults. Gain 1 so this row differs from linesUnit by the COMPOSITE options alone. */
    out.linesShipped[k] = drawLine({ colour: c, gain: 1 }, { plate: PLATE });

    out.linesCeiling[k] = {
      ceiling,
      /* Which channel the ceiling is set by — the assertions need to read the right one, and
         deriving it here keeps the test from hand-picking "blue". */
      channel: c.indexOf(Math.max(c[0], c[1], c[2])),
      rungs: RUNGS.map((m) => ({ m, gain: m * ceiling, pixel: drawLine({ colour: c, gain: m * ceiling }, ISOLATE) })),
    };
  }

  /*
   * ── POINTS ────────────────────────────────────────────────────────────────────────────────
   * ONE deposit at the origin, mass 1, rank 0. lo == hi, so mix(uLo,uHi,·) is BRAND[k] whatever
   * the ramp does and the only things left modulating the colour are the primitive's own
   * gaussian, its aerial-perspective term and its mass ramp.
   */
  const cloud = createPointCloud(stage, {
    centres: new Float32Array([0, 0, 0]),
    attributes: new Float32Array([1, 0]),
    count: 1,
  });
  if ('kind' in cloud) return { ...out, pointsRefusal: cloud };

  const drawCloud = (k, additive) => {
    stage.bindTarget(stage.scene);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (additive) beginAdditive(gl); else { gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); }
    /* size 0.5 in NDC-y on a square frame: the quad is 64 px across, so the falloff is sampled
       over 32 px of radius and the centre pixel sits at r ~ 0. */
    cloud.draw(IDENTITY(), { size: 0.5, lo: BRAND[k], hi: BRAND[k], gain: 1 });
    endPass(gl);
    pipeline.resolve(ISOLATE);
  };

  for (const k of keys) {
    /* BLENDING OFF writes the fragment's rgb straight into the target. The shipped path is
       SRC_ALPHA/ONE, which multiplies that rgb by the fragment's own alpha a second time. The
       two rows differ by exactly that alpha, and nothing else — same shader, same fragment. */
    drawCloud(k, false);
    const noBlend = centrePixel(gl);
    const noBlendRow = centreRow(gl);
    drawCloud(k, true);
    const additive = centrePixel(gl);
    const additiveRow = centreRow(gl);
    out.pointsCore[k] = { noBlend, additive, noBlendRow, additiveRow };
  }

  /* A row of black is not a measurement of a deposit. If the cloud drew nothing, every ratio
     below would be 0/0 and would be formatted into the report as a number. */
  const blank = keys.filter((k) => out.pointsCore[k].noBlend.every((v) => v === 0));
  if (blank.length) return { ...out, pointsRefusal: { kind: 'refused', code: 'CLOUD_DREW_NOTHING', keys: blank } };

  out.sources = {
    lines: LINES_VERT + ' | ' + LINES_FRAG,
    points: POINTS_VERT + ' | ' + POINTS_FRAG,
    composite: PIPELINE_SOURCES.composite,
    tone: TONE_MAP_GLSL,
    encode: SRGB_ENCODE_GLSL,
    hexes: JSON.stringify(BRAND_HEX),
  };
  return out;
};
`;

const bundled = await build({
  stdin: { contents: ENTRY, resolveDir: HERE, sourcefile: 'flat-fidelity-entry.ts', loader: 'ts' },
  bundle: true, format: 'esm', target: 'es2022', write: false, logLevel: 'silent',
  alias: { '@lcx/gl': join(ROOT, 'packages/gl/src/index.ts') },
  define: { 'process.env.NODE_ENV': '"production"' },
});
if (bundled.errors?.length) { for (const e of bundled.errors) console.error(e); process.exit(1); }
const js = bundled.outputFiles[0].text;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 300, height: 300 } });
page.on('pageerror', (e) => console.error('  PAGE ERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('  CONSOLE ERROR: ' + m.text()); });
await page.setContent(`<!doctype html><meta charset="utf-8"><canvas id="c"></canvas>
<script type="module">${js}</script>`);
await page.waitForFunction(() => typeof window.__measure === 'function', null, { timeout: 30_000 });
const m = await page.evaluate(() => window.__measure());
await browser.close();

if (m.refusal) { console.error('refused: ' + JSON.stringify(m.refusal)); process.exit(1); }
if (m.pointsRefusal) { console.error('points refused: ' + JSON.stringify(m.pointsRefusal)); process.exit(1); }

// ── report ──────────────────────────────────────────────────────────────────────────────────
const hexes = JSON.parse(m.sources.hexes);
const target = (h) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16));
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
const lab = ([r, g, b]) => {
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
/* CIE76, the same arithmetic brand-fidelity.mjs reports, so the two records are comparable. */
const deltaE = (a, b) => {
  const A = lab(a.map((v) => s2l(v / 255))), B = lab(b.map((v) => s2l(v / 255)));
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
};
const hx = (p) => '#' + p.map((v) => v.toString(16).padStart(2, '0')).join('');

/* Undo the composite: byte → sRGB decode → inverse Reinhard. `lcxToneMap` is y = c/(1+c*s), so
   c = y/(1-y*s). Used only to turn a measured PIXEL back into the linear value the primitive
   wrote, which is what makes the points alpha readable off two byte triples. */
const unTone = (y) => y / (1 - y * m.toneShoulder);
const toLinear = (px) => px.map((v) => unTone(s2l(v / 255)));

console.log(`driver: ${m.driver}   scene target: ${m.hdr ? 'RGBA16F' : 'RGBA8'}`);
console.log(`clip point: linear ${m.clipLinear.toFixed(4)} = 1/(1-${m.toneShoulder})`);

const rows = {};
for (const k of m.keys) {
  const t = target(hexes[k]);
  rows[k] = {};
  for (const cfg of ['linesUnit', 'linesFade', 'linesGainEquiv', 'linesShipped']) {
    const px = m[cfg][k];
    rows[k][cfg] = { pixel: hx(px), delta: px.map((v, i) => v - t[i]), deltaE: +deltaE(px, t).toFixed(2) };
  }
}

for (const cfg of ['linesUnit', 'linesShipped']) {
  console.log(`\n── ${cfg}   (a lines.ts rule, gain 1, fully covering the centre pixel)`);
  console.log('  key          target    on screen  Δr   Δg   Δb    ΔE76');
  for (const k of m.keys) {
    const r = rows[k][cfg];
    const d = r.delta.map((v) => String(v).padStart(4)).join(' ');
    console.log(`  ${k.padEnd(12)} ${hexes[k].toLowerCase()}   ${r.pixel}  ${d}   ${String(r.deltaE).padStart(6)}`);
  }
}

console.log(`\n── uGain and the fade are ONE scalar at a pixel (fade ${0.55} lands at gain ${m.fadeEquivGain.toFixed(5)} here)`);
console.log('  key          via fade    via gain    same?');
for (const k of m.keys) {
  const a = hx(m.linesFade[k]), b = hx(m.linesGainEquiv[k]);
  console.log(`  ${k.padEnd(12)} ${a}     ${b}     ${a === b ? 'yes' : 'NO'}`);
}

/*
 * THE COLLAPSE IN THIS TABLE IS THE RESULT, NOT A BUG IN IT. Every key is swept at multiples of
 * its OWN ceiling, and colour[maxChannel] * (m * ceiling) is CLIP * m for every key by
 * construction — so identical bytes down the column is the ceiling formula being exactly right
 * on seven different colours. What differs per key is the gain at which it happens, and what
 * the other two channels are doing while the brightest one is pinned.
 */
console.log('\n── the ceiling: gain as a multiple of 1/((1-s)*max channel)');
const ceilRows = {};
for (const k of m.keys) {
  const c = m.linesCeiling[k];
  const ch = c.channel;
  const t = target(hexes[k]);
  const bytes = c.rungs.map((r) => r.pixel[ch]);
  ceilRows[k] = {
    ceiling: +c.ceiling.toFixed(4), channel: ch,
    rungs: c.rungs.map((r, i) => ({
      m: r.m, gain: +r.gain.toFixed(4), pixel: hx(r.pixel), byte: bytes[i],
      deltaE: +deltaE(r.pixel, t).toFixed(2),
    })),
  };
  console.log(`  ${k.padEnd(12)} ceiling gain ${c.ceiling.toFixed(2)} on ${'rgb'[ch]}:  ` +
    c.rungs.map((r, i) => `${r.m}x→${bytes[i]}`).join('  '));
}
console.log('\n  the same sweep as a whole pixel, and how far it is from the hex:');
for (const k of m.keys) {
  console.log(`  ${k.padEnd(12)} ` + ceilRows[k].rungs
    .filter((r) => [0.25, 0.5, 0.9, 1.0, 2.0].includes(r.m))
    .map((r) => `${r.m}x ${r.pixel} ΔE${String(r.deltaE).padStart(5)}`).join('  '));
}

console.log('\n── points: the gaussian, applied how many times');
const pointRows = {};
for (const k of m.keys) {
  const p = m.pointsCore[k];
  const nb = toLinear(p.noBlend), ad = toLinear(p.additive);
  const base = BRANDLINEAR(hexes[k]);
  /* The channel with the most signal, so the ratio is not read off a byte near zero where
     quantisation dominates. Derived from the palette entry, not chosen. */
  const ch = base.indexOf(Math.max(...base));
  const alphaAtCore = ad[ch] / nb[ch];
  const rgbFactor = nb[ch] / base[ch];
  pointRows[k] = {
    noBlend: hx(p.noBlend), additive: hx(p.additive), channel: ch,
    rgbFactorAtCore: +rgbFactor.toFixed(4),
    alphaAtCore: +alphaAtCore.toFixed(4),
    deliveredFraction: +(rgbFactor * alphaAtCore).toFixed(4),
    halfMaxPx: { noBlend: halfMax(p.noBlendRow, ch), additive: halfMax(p.additiveRow, ch) },
  };
  console.log(`  ${k.padEnd(12)} rgb×${rgbFactor.toFixed(3)}  alpha ${alphaAtCore.toFixed(3)}  ` +
    `delivered ${(rgbFactor * alphaAtCore * 100).toFixed(1)}% of the data colour   ` +
    `half-max radius ${pointRows[k].halfMaxPx.noBlend} px unblended → ${pointRows[k].halfMaxPx.additive} px as shipped`);
}

function BRANDLINEAR(hex) {
  return [0, 2, 4].map((i) => s2l(parseInt(hex.replace('#', '').slice(i, i + 2), 16) / 255));
}
/* Radius in pixels at which the deposit falls to half its centre value IN LINEAR LIGHT. Read
   off the row rather than fitted, because a fit would hide a footprint that is not gaussian. */
function halfMax(row, ch) {
  const lin = row.map((px) => unTone(s2l(px[ch] / 255)));
  const mid = lin.length >> 1;
  const peak = lin[mid];
  if (!(peak > 0)) return null;
  for (let x = mid; x < lin.length; x++) if (lin[x] < peak / 2) return x - mid;
  return null;
}

const { createHash } = await import('node:crypto');
/* Over the two PRIMITIVE sources as well as the composite chain: this record's whole subject is
   what the primitives do before the composite, so an edit to LINES_FRAG or POINTS_FRAG must
   invalidate it. brand-fidelity.json's hash covers neither. */
const sourceHash = createHash('sha256')
  .update([m.sources.lines, m.sources.points, m.sources.composite, m.sources.tone, m.sources.encode, m.sources.hexes].join(' | '))
  .digest('hex').slice(0, 16);

writeFileSync(join(HERE, 'flat-fidelity.json'), JSON.stringify({
  measuredAt: new Date().toISOString().slice(0, 10),
  driver: m.driver,
  hdr: m.hdr,
  sourceHash,
  toneShoulder: m.toneShoulder,
  clipLinear: m.clipLinear,
  falloff: m.falloff,
  /* The gain that reproduces the fade AT THE SAMPLED PIXEL. The test compares the two rows and
     would be comparing nothing if it could not see which gain the comparison was made at. */
  fadeEquivGain: m.fadeEquivGain,
  rows,
  ceiling: ceilRows,
  points: pointRows,
}, null, 2) + '\n');
console.log(`\nwrote docs/3d/flat-fidelity.json  (sourceHash ${sourceHash})`);
