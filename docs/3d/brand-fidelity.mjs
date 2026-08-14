/**
 * BRAND FIDELITY, MEASURED OFF RENDERED PIXELS.
 *
 * §6 rule 5 says "brand hex exact, `assertBrandFidelity` runs on every new material".
 * `assertBrandFidelity()` computes `linearToHex(hexToLinear(BRAND_HEX[k])) === BRAND_HEX[k]`.
 * That is a self-round-trip of a constants table: it never sees a material, a light, a tone
 * map or a pixel, so it returns `[]` no matter what the renderer does. This file is the
 * instrument that closes that gap — it renders through the SHIPPED shader sources on a real
 * GL driver and reads the bytes back off the framebuffer.
 *
 * THREE CONFIGURATIONS, chosen so the numbers bracket the claim rather than illustrate it:
 *
 *   composite-only  a flat mark at exactly BRAND[k] linear in the scene target, plate 0,
 *                   bloom gain 0. The most favourable case that can exist — nothing but
 *                   `lcxToneMap` then `lcxEncode` stands between the constant and the
 *                   framebuffer. Whatever moves HERE is the floor of the damage.
 *   as-shipped      the same mark under `createPipeline`'s DEFAULTS (plate #0E1628-ish,
 *                   bloomGain 0.9) — what a flat chart surface actually composites.
 *   lit-marker      the real `createLitRenderer` with GlobeReliefGl's shipped marker
 *                   configuration (PIN_MAT roughness 0.42 / metalness 0.05, lightColour
 *                   [6.6,6.2,5.5], MARKER_AMBIENT 120, its plate-derived SKY), presented
 *                   through the same `lcxEncode(lcxToneMap(scene))` shader all eight
 *                   surfaces use. This is the 3-D path the rule actually governs.
 *
 * Run:  node docs/3d/brand-fidelity.mjs
 * Writes docs/3d/brand-fidelity.json, which `packages/gl/src/look/brandPixel.test.ts`
 * asserts against — including a hash of the shader sources, so editing the pipeline
 * invalidates the record instead of silently passing against a stale one.
 *
 * SwiftShader, not the host GPU, and deliberately: the record has to be reproducible on CI
 * hardware nobody has seen. The `driver` field in the JSON says which renderer produced it.
 *
 * TWO METRICS PER ROW since 2026-08-15. `deltaE` is CIE76, which every figure in this repo
 * used until then; `deltaE2000` is CIEDE2000, which is the one a claim about visibility must
 * quote. They do not agree and they do not even rank the palette the same way — CIE76 calls
 * `brand` the worst-hit colour in the composite-only configuration, CIEDE2000 calls it third
 * and puts `reference` first. Both are printed and both are stored.
 *
 * The script REFUSES to write a record measured without `EXT_color_buffer_float`; see the
 * guard after the measurement for what an 8-bit scene target does to the numbers.
 */

import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

/*
 * The measurement runs INSIDE the page, against `@lcx/gl` itself. It is bundled from a
 * string rather than a checked-in entry file so there is no second copy of the pipeline to
 * drift from the first — every shader in here is imported, never retyped.
 */
const ENTRY = `
import {
  createStage, isStage, createPipeline, PIPELINE_SOURCES,
  BRAND, BRAND_HEX, linearToHex, hexToLinear,
  createLitRenderer, uploadMesh, sphere, createTarget3D,
  TONE_MAP_GLSL, SRGB_ENCODE_GLSL, IDENTITY,
  lookAt, perspective, multiply,
} from '@lcx/gl';

const FLAT_VERT = \`#version 300 es
precision highp float;
layout(location=0) in vec2 q;
void main(){ gl_Position = vec4(q, 0.0, 1.0); }\`;

/* Writes an EXACT linear value into the scene target. No gain, no falloff, no mask — the
   primitives all apply one (points.ts multiplies by uGain and a mass ramp, lines.ts by
   uGain and a fade), and including any of those would measure the primitive rather than
   the composite. This is the cleanest data mark that can reach the pipeline. */
const FLAT_FRAG = \`#version 300 es
precision highp float;
uniform vec3 uC;
out vec4 frag;
void main(){ frag = vec4(uC, 1.0); }\`;

/* The present shader all eight 3-D surfaces share, byte for byte — see
   DeckReliefGl.tsx:84, GlobeReliefGl.tsx:97, StormReliefGl.tsx:80 and five more. */
const PRESENT_VERT = \`#version 300 es
precision highp float;
layout(location=0) in vec2 q;
out vec2 vUv;
void main(){ vUv = q * 0.5 + 0.5; gl_Position = vec4(q, 0.0, 1.0); }\`;
const PRESENT_FRAG = \`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
\${TONE_MAP_GLSL}
\${SRGB_ENCODE_GLSL}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }\`;

const W = 128, H = 128;

function centrePixel(gl) {
  const px = new Uint8Array(4);
  gl.readPixels((W >> 1), (H >> 1), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return [px[0], px[1], px[2]];
}

const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const fLab = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
function lab(rgb255) {
  const [r, g, b] = rgb255.map((v) => s2l(v / 255));
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  return [116 * fLab(Y) - 16, 500 * (fLab(X) - fLab(Y)), 200 * (fLab(Y) - fLab(Z))];
}
function dE(a, b) {
  const A = lab(a), B = lab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

/*
 * THE CLOSEST PIXEL ANYWHERE ON THE MARKER, not the centre one.
 *
 * A lit marker is a gradient: its centre is whatever the key light happens to make it, and
 * quoting that one pixel would be quoting a lighting choice. Rule 5 claims the hex is EXACT,
 * so the honest test of it is the most generous one available — if the brand hex does not
 * appear at the single best fragment out of every fragment the marker covers, it does not
 * appear on the marker at all.
 */
function bestPixel(gl, targetBytes) {
  const buf = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let best = null, bestD = Infinity, considered = 0;
  for (let i = 0; i < W * H; i++) {
    const px = [buf[i * 4], buf[i * 4 + 1], buf[i * 4 + 2]];
    // The cleared background is exactly black after the tone map; the marker is not.
    if (px[0] === 0 && px[1] === 0 && px[2] === 0) continue;
    considered++;
    const d = dE(px, targetBytes);
    if (d < bestD) { bestD = d; best = px; }
  }
  return { best, bestD, considered };
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

  const flat = stage.compile(FLAT_VERT, FLAT_FRAG);
  if ('kind' in flat) return { refusal: flat };
  const present = stage.compile(PRESENT_VERT, PRESENT_FRAG);
  if ('kind' in present) return { refusal: present };
  const pipeline = createPipeline(stage);
  if ('kind' in pipeline) return { refusal: pipeline };

  const keys = Object.keys(BRAND_HEX);
  const out = { driver, hdr: stage.hdr, keys, compositeOnly: {}, asShipped: {}, litMarker: {}, litCentre: {}, litCoverage: {} };

  const fill = (c) => {
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    stage.bindTarget(stage.scene);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    stage.blit(flat, (p) => gl.uniform3f(gl.getUniformLocation(p, 'uC'), c[0], c[1], c[2]));
  };

  for (const k of keys) {
    fill(BRAND[k]);
    // The floor: nothing but the tone map and the encode.
    pipeline.resolve({ plate: [0, 0, 0], bloomGain: 0 });
    out.compositeOnly[k] = centrePixel(gl);

    fill(BRAND[k]);
    // The defaults a flat chart surface gets when it passes no options.
    pipeline.resolve({});
    out.asShipped[k] = centrePixel(gl);
  }

  /* ── THE LIT PATH ────────────────────────────────────────────────────────────────────
   * A sphere at the origin, camera on +Z, key light along the view axis. The sphere spans
   * every normal from face-on to grazing, so its fragments sweep the whole range of
   * illumination this material can be under — and the measurement reports the fragment that
   * lands CLOSEST to the brand hex, wherever on the sphere that falls. That is the most
   * generous reading of rule 5 that the shipped configuration can be given.
   */
  const lit = createLitRenderer(stage);
  if ('kind' in lit) return { ...out, litRefusal: lit };
  const meshOrRefusal = uploadMesh(stage, sphere(1.0, 48, 64));
  if ('kind' in meshOrRefusal) return { ...out, litRefusal: meshOrRefusal };

  const eye = [0, 0, 3.2];
  // multiply(proj, view) — the order camera.ts:95 uses; the other order projects nothing.
  const viewProj = multiply(perspective(0.6, W / H, 0.1, 100), lookAt(eye, [0, 0, 0], [0, 1, 0]));
  const NM = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

  // GlobeReliefGl.tsx:382-384 — its sky is derived from the plate, not from DEFAULT_SKY.
  const PLATE = hexToLinear('#0E1628');
  const fromPlate = (kk) => [PLATE[0] * kk, PLATE[1] * kk, PLATE[2] * kk];
  const SKY = { zenith: fromPlate(0.55), horizon: fromPlate(1.6), ground: fromPlate(0.35) };

  /* createTarget3D, not stage.scene, and this is not a detail: stage.scene has NO DEPTH
     ATTACHMENT, so the lit pass rendered a sphere with no depth buffer and every measured
     litMarker pixel came back #000000 for all seven colours. The eight surfaces all bind a
     Target3D here (GlobeReliefGl.tsx:236) — measuring anything else measures a path that
     does not ship. */
  const t3d = createTarget3D(stage, W, H);
  if ('kind' in t3d) return { ...out, litRefusal: t3d };

  for (const k of keys) {
    t3d.bind();
    gl.clearColor(0, 0, 0, 1); gl.clearDepth(1);
    /* depthMask(true) BEFORE the clear. glClear is masked, and the present blit leaves the
       mask off: without this, only the FIRST palette entry rendered and the other six came
       back #000000 because the depth buffer still held iteration 1 and LEQUAL rejected
       every fragment. A silent all-black measurement is exactly the shape of bad number
       this file exists to stop. */
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.BLEND);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const draws = [{
      mesh: meshOrRefusal, model: IDENTITY(), normalMat: NM,
      // PIN_MAT from GlobeReliefGl.tsx:391, with the base colour swapped per palette entry.
      material: { baseColour: BRAND[k], roughness: 0.42, metalness: 0.05 },
    }];
    lit.draw({
      viewProj, eye, lightDir: [0, 0, -1],   // lit.ts:519 negates this, so -Z lights the +Z face
      lightColour: [6.6, 6.2, 5.5],      // GlobeReliefGl.tsx:518
      ambientGain: 120,                   // MARKER_AMBIENT, GlobeReliefGl.tsx:477
      sky: SKY, lightVP: IDENTITY(), shadow: null, ao: null,
      screenSize: [W, H], draws,
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.DEPTH_TEST);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t3d.texture);
    stage.blit(present, (p) => gl.uniform1i(gl.getUniformLocation(p, 'uScene'), 0));
    const tb = [0, 2, 4].map((i) => parseInt(BRAND_HEX[k].replace('#', '').slice(i, i + 2), 16));
    const b = bestPixel(gl, tb);
    /* Assert the marker covered SOMETHING before believing the minimum over its pixels. An
       empty set has no minimum, and an Infinity formatted into a report reads as a number. */
    if (b.considered === 0) return { ...out, litRefusal: { kind: 'refusal', code: 'MARKER_COVERED_NO_PIXELS', detail: k } };
    out.litMarker[k] = b.best;
    out.litCentre[k] = centrePixel(gl);
    out.litCoverage[k] = b.considered;
    /* UNBIND, or the next iteration renders INTO the texture that is still bound as the
       present shader's sampler. That feedback loop is undefined behaviour and SwiftShader
       resolves it by dropping the draw: the first palette entry measured correctly and the
       other six came back #000000. A surface never hits this because it presents once per
       frame; a loop over seven colours does. */
    gl.bindTexture(gl.TEXTURE_2D, null);
    const err = gl.getError();
    if (err !== 0) out.litGlError = { key: k, err };
  }
  /* A measurement of an empty framebuffer is not a measurement. If every entry came back
     pure black the pass did not run, and reporting those deltas as the lit-path shift would
     be fabricating the strongest number in this file. */
  if (keys.every((k) => out.litMarker[k].every((v) => v === 0))) {
    return { ...out, litRefusal: { kind: 'refusal', code: 'LIT_PASS_RENDERED_NOTHING' } };
  }

  out.sources = {
    composite: PIPELINE_SOURCES.composite,
    tone: TONE_MAP_GLSL,
    encode: SRGB_ENCODE_GLSL,
    present: PRESENT_FRAG,
    hexes: JSON.stringify(BRAND_HEX),
    check: linearToHex(BRAND.brand),
  };
  return out;
};
`;

const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
const lab = ([r, g, b]) => {
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
/* CIE76 on the two sRGB byte triples, linearised first. Reported alongside the raw channel
   deltas because a 35/255 move in blue and a 35/255 move in red are not equally visible,
   and the remedy is chosen on visibility. */
const deltaE = (a, b) => {
  const A = lab(a.map((v) => s2l(v / 255))), B = lab(b.map((v) => s2l(v / 255)));
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
};

/*
 * CIEDE2000 — AND THIS IS THE COLUMN THE REMEDY SHOULD BE CHOSEN ON. ADDED 2026-08-15.
 *
 * The sentence above says the delta is reported alongside ΔE "because the remedy is chosen
 * on visibility", and then reported a metric that is not a visibility metric. CIE76 is plain
 * Euclidean distance in Lab with no weighting, and it OVERSTATES in the blue region — where
 * the brand anchor sits. Recomputing the record changed both conclusions drawn from it:
 * the shipped composite is 58% of AgX rather than 45%, 1.33× Khronos rather than 3.7×, and
 * the worst-hit palette entry is `reference` (ΔE2000 6.70), not `brand` (4.64, third).
 *
 * kL = kC = kH = 1 (graphic-arts default). Validated against Sharma/Wu/Dalal's published
 * vectors below before any number here is believed — a hand-rolled CIEDE2000 with a sign
 * error in Rt still returns plausible-looking numbers, which is the whole hazard.
 */
const RAD = Math.PI / 180, DEG = 180 / Math.PI;
function deltaE2000Lab([L1, a1, b1], [L2, a2, b2]) {
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hp = (b, ap) => { if (b === 0 && ap === 0) return 0; const h = Math.atan2(b, ap) * DEG; return h < 0 ? h + 360 : h; };
  const hp1 = hp(b1, ap1), hp2 = hp(b2, ap2);
  const dL = L2 - L1, dC = Cp2 - Cp1;
  let dh = 0;
  if (Cp1 * Cp2 !== 0) { dh = hp2 - hp1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh * RAD) / 2);
  const Lb = (L1 + L2) / 2, Cpb = (Cp1 + Cp2) / 2;
  let hpb;
  if (Cp1 * Cp2 === 0) hpb = hp1 + hp2;
  else if (Math.abs(hp1 - hp2) <= 180) hpb = (hp1 + hp2) / 2;
  else hpb = hp1 + hp2 < 360 ? (hp1 + hp2 + 360) / 2 : (hp1 + hp2 - 360) / 2;
  const T = 1 - 0.17 * Math.cos((hpb - 30) * RAD) + 0.24 * Math.cos(2 * hpb * RAD)
    + 0.32 * Math.cos((3 * hpb + 6) * RAD) - 0.20 * Math.cos((4 * hpb - 63) * RAD);
  const Rc = 2 * Math.sqrt(Math.pow(Cpb, 7) / (Math.pow(Cpb, 7) + Math.pow(25, 7)));
  const Rt = -Math.sin(2 * (30 * Math.exp(-Math.pow((hpb - 275) / 25, 2))) * RAD) * Rc;
  const Sl = 1 + (0.015 * Math.pow(Lb - 50, 2)) / Math.sqrt(20 + Math.pow(Lb - 50, 2));
  const Sc = 1 + 0.045 * Cpb, Sh = 1 + 0.015 * Cpb * T;
  return Math.sqrt(Math.pow(dL / Sl, 2) + Math.pow(dC / Sc, 2) + Math.pow(dH / Sh, 2)
    + Rt * (dC / Sc) * (dH / Sh));
}
const deltaE2000 = (a, b) =>
  deltaE2000Lab(lab(a.map((v) => s2l(v / 255))), lab(b.map((v) => s2l(v / 255))));

/* Sharma/Wu/Dalal, "The CIEDE2000 Color-Difference Formula", table 1. Six of these pairs
   exist only to exercise the hue-rotation term Rt and the 180°-wrap in h̄′; an implementation
   that drops Rt passes the easy ones and misses these by ~0.5. Checked HERE, before the
   browser is launched, so a broken metric cannot reach the record. */
const SHARMA = [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425], [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
  [[50, 2.8361, -74.0200], [50, 0, -82.7485], 3.4412], [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0000],
  [[50, -1.1848, -84.8006], [50, 0, -82.7485], 1.0000], [[50, -0.9009, -85.5211], [50, 0, -82.7485], 1.0000],
  [[50, 0, 0], [50, -1, 2], 2.3669], [[50, -1, 2], [50, 0, 0], 2.3669],
  [[50, 2.4900, -0.0010], [50, -2.4900, 0.0009], 7.1792], [[50, 2.4900, -0.0010], [50, -2.4900, 0.0010], 7.1792],
  [[50, 2.4900, -0.0010], [50, -2.4900, 0.0011], 7.2195], [[50, -0.0010, 2.4900], [50, 0.0009, -2.4900], 4.8045],
  [[50, 2.5, 0], [50, 0, -2.5], 4.3065], [[50, 2.5, 0], [73, 25, -18], 27.1492],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.2630],
  [[35.0831, -44.1164, 3.7933], [35.0232, -40.0716, 1.5901], 1.8645],
  [[22.7233, 20.0904, -46.6940], [23.0331, 14.9730, -42.5619], 2.0373],
  [[2.0776, 0.0795, -1.1350], [0.9033, -0.0636, -0.5514], 0.9082],
];
{
  let worst = 0, at = null;
  for (const [p, q, expected] of SHARMA) {
    const err = Math.abs(deltaE2000Lab(p, q) - expected);
    if (err > worst) { worst = err; at = [p, q, expected, deltaE2000Lab(p, q)]; }
  }
  // The published values carry four decimals, so 1e-4 is the tightest bound they support.
  if (worst > 1e-4) {
    console.error(`CIEDE2000 does not reproduce Sharma: worst error ${worst} at ${JSON.stringify(at)}`);
    process.exit(1);
  }
  console.log(`CIEDE2000 checked against ${SHARMA.length} Sharma vectors — worst error ${worst.toExponential(2)}`);
}

const bundled = await build({
  stdin: { contents: ENTRY, resolveDir: HERE, sourcefile: 'brand-fidelity-entry.ts', loader: 'ts' },
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
/* Printed the moment it happens. A page that throws before setting `__measure` otherwise
   reports only "evaluate: __measure is not a function", one line away from the real cause. */
page.on('pageerror', (e) => console.error('  PAGE ERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('  CONSOLE ERROR: ' + m.text()); });
await page.setContent(`<!doctype html><meta charset="utf-8"><canvas id="c"></canvas>
<script type="module">${js}</script>`);
await page.waitForFunction(() => typeof window.__measure === 'function', null, { timeout: 30_000 });
const m = await page.evaluate(() => window.__measure());
await browser.close();

if (m.refusal) { console.error('stage refused: ' + JSON.stringify(m.refusal)); process.exit(1); }
if (m.litRefusal) console.error('  lit path refused: ' + JSON.stringify(m.litRefusal));

/*
 * RGBA16F OR NOTHING. ADDED 2026-08-15, because this was the one input to the record that
 * could change without anything saying so.
 *
 * `stage.ts:291-294` reads `EXT_color_buffer_float` and falls back to RGBA8/UNSIGNED_BYTE
 * with no refusal and no warning — `hdr` is set from `Boolean(float)` at stage.ts:385 and is
 * otherwise only used to print a legend. On a machine without the extension this script still
 * runs, still succeeds, and writes a record whose pixels came from an 8-bit scene target: the
 * palette is quantised to 1/255 BEFORE the tone map sees it, so `brandDeep` lands at #16316b
 * instead of #12326b — 4 of 255, and `brand` and `plate` move 2 each. `brandPixel.test.ts:123`
 * allows ±1 between the CPU prediction and the recorded pixel, so that record fails a check
 * about tone-map drift for a reason that has nothing to do with the tone map, and the message
 * says "CPU says 214, the GPU wrote 218". Refuse instead, and name the cause here.
 */
if (!m.hdr) {
  console.error(
    'REFUSED: EXT_color_buffer_float is absent, so the scene target is RGBA8 and the palette\n' +
    '  is quantised to 1/255 before the composite. The pixels this run measured are NOT the\n' +
    '  pixels the shipped RGBA16F path produces — brandDeep would be recorded as #16316b\n' +
    '  rather than #12326b, 4/255 outside the ±1 CPU/GPU tolerance in brandPixel.test.ts.\n' +
    `  driver: ${m.driver}`);
  process.exit(1);
}

// ── report ────────────────────────────────────────────────────────────────────────────
const hexes = JSON.parse(m.sources.hexes);
const target = (h) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16));
const hx = (p) => '#' + p.map((v) => v.toString(16).padStart(2, '0')).join('');

console.log(`driver: ${m.driver}   scene target: ${m.hdr ? 'RGBA16F' : 'RGBA8'}`);
const rows = {};
for (const k of m.keys) {
  const t = target(hexes[k]);
  rows[k] = {};
  for (const cfg of ['compositeOnly', 'asShipped', 'litMarker', 'litCentre']) {
    const px = m[cfg]?.[k];
    if (!px) continue;
    rows[k][cfg] = {
      pixel: hx(px),
      delta: px.map((v, i) => v - t[i]),
      /* BOTH, and `deltaE` keeps its name so the numbers already quoted in the history stay
         findable. `deltaE2000` is the one to read — see the note on the formula above. */
      deltaE: +deltaE(px, t).toFixed(2),
      deltaE2000: +deltaE2000(px, t).toFixed(2),
    };
  }
}
for (const cfg of ['compositeOnly', 'asShipped', 'litMarker', 'litCentre']) {
  console.log(`\n── ${cfg}`);
  console.log('  key          target    on screen  Δr   Δg   Δb    ΔE76  ΔE2000');
  for (const k of m.keys) {
    const r = rows[k][cfg];
    if (!r) continue;
    const d = r.delta.map((v) => String(v).padStart(4)).join(' ');
    console.log(`  ${k.padEnd(12)} ${hexes[k].toLowerCase()}   ${r.pixel}  ${d}   ${String(r.deltaE).padStart(6)}  ${String(r.deltaE2000).padStart(6)}`);
  }
  /*
   * THE RANKING UNDER EACH METRIC, printed rather than left for a reader to sort by eye —
   * because it is not the same ranking, and the difference is the point. Under ΔE76 the
   * composite-only worst is `brand`; under ΔE2000 it is `reference`. Whoever reaches for a
   * remedy reads this line, and reading the wrong column aims it at the wrong colour.
   */
  const by = (metric) => m.keys.filter((k) => rows[k][cfg])
    .sort((a, b) => rows[b][cfg][metric] - rows[a][cfg][metric]);
  const r76 = by('deltaE'), r2000 = by('deltaE2000');
  console.log(`  worst-first ΔE76  : ${r76.join(' > ')}`);
  console.log(`  worst-first ΔE2000: ${r2000.join(' > ')}${r76[0] === r2000[0] ? '' : `   ← DIFFERENT WORST COLOUR (${r76[0]} vs ${r2000[0]})`}`);
}

const { createHash } = await import('node:crypto');
const sourceHash = createHash('sha256')
  /* The shared present shader is deliberately NOT hashed: it is assembled from TONE_MAP_GLSL
     and SRGB_ENCODE_GLSL, so every change to it that could move a pixel is already a change to
     one of those two. Hashing a string this file builds itself would detect edits to this file
     and nothing else — and it would force the test to reassemble the same template, a second
     copy free to drift from the eight surfaces it claims to stand for. */
  .update([m.sources.composite, m.sources.tone, m.sources.encode, m.sources.hexes].join(' | '))
  .digest('hex').slice(0, 16);

writeFileSync(join(HERE, 'brand-fidelity.json'), JSON.stringify({
  measuredAt: new Date().toISOString().slice(0, 10),
  driver: m.driver,
  hdr: m.hdr,
  /* The test recomputes this from the LIVE sources. Any edit to the composite, the tone map,
     the sRGB encode or the palette changes it, and the test then fails demanding a fresh
     measurement rather than quietly comparing against a stale one. */
  sourceHash,
  rows,
}, null, 2) + '\n');
console.log(`\nwrote docs/3d/brand-fidelity.json  (sourceHash ${sourceHash})`);
