/**
 * ORRERY MATERIAL SWEEP — the instrument behind §5b's `orrery` rows, rebuilt so the curve can be
 * measured rather than a single endpoint asserted.
 *
 * Renders the SAME sphere under E4's OWN rig with only the material swapped, one pass per material,
 * reads the whole 128x128 framebuffer back, and compares pairs AT CORRESPONDING FRAGMENTS.
 *
 * THREE THINGS THAT MAKE IT AN INSTRUMENT RATHER THAN A SCRIPT:
 *
 * 1 · PROVENANCE. Before any orrery number is printed it re-renders the Globe marker rig and checks
 *     its centre pixel against `docs/3d/brand-fidelity.json`'s recorded `litCentre` for all seven
 *     palette entries. Same check `docs/3d/w2/CATEGORICAL_SEPARATION.md` opens with. If those seven
 *     byte triples do not reproduce, the rig in this file is not the shipped one and it exits 1.
 *
 * 2 · THE MATERIALS ARE READ OUT OF `OntologyOrreryGl.tsx`, NOT RETYPED. A hand-written table of
 *     hexes and roughnesses cannot fail on the material nobody thought of, and it would go stale the
 *     moment the component is edited — which is the point of running this AFTER an edit.
 *
 * 3 · THE COVERAGE MASK IS MEASURED, NOT ASSUMED. "Not black" excludes the darkest fragments of a
 *     mark, and on E4's dark rig those are exactly the fragments where two colours collapse. So the
 *     mask is taken by rendering one material under TWO different clear colours: a fragment the
 *     sphere covered is byte-identical between them, a background fragment is not.
 *
 * Run:  node orrery-material-sweep.mjs
 */
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = '/Users/nik/Downloads/usclaude-main';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'apps/web/src/components/geometry/OntologyOrreryGl.tsx');
const source = readFileSync(SRC, 'utf8');

/* ── 1 · READ THE SHIPPED MATERIALS OUT OF THE COMPONENT ───────────────────────────────────────── */

const hexes = {};
for (const m of source.matchAll(/const\s+(\w+)_HEX\s*=\s*'(#[0-9A-Fa-f]{6})'/g)) hexes[m[1]] = m[2];

/* Every `material: { … }` block in the file, brace-matched. Deriving the list means a material added
   tomorrow is measured tomorrow; enumerating it means it is not. */
function materialBlocks(text) {
  const out = [];
  const re = /material:\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    let i = m.index + m[0].length, depth = 1;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      i++;
    }
    out.push({ body: text.slice(m.index + m[0].length, i - 1), at: text.slice(0, m.index).split('\n').length });
  }
  return out;
}

/** `0.36` or `b.isCore ? 0.36 : 0.08` → one or two named variants. */
function numbersOf(body, field) {
  const tern = new RegExp(field + ':\\s*b\\.isCore\\s*\\?\\s*([\\d.]+)\\s*:\\s*([\\d.]+)').exec(body);
  if (tern) return { core: Number(tern[1]), other: Number(tern[2]) };
  const lit = new RegExp(field + ':\\s*([\\d.]+)').exec(body);
  return lit ? { one: Number(lit[1]) } : null;
}

const marks = [];
for (const b of materialBlocks(source)) {
  const tern = /baseColour:\s*hexToLinear\(b\.isCore\s*\?\s*(\w+)\s*:\s*(\w+)\)/.exec(b.body);
  const plain = /baseColour:\s*hexToLinear\((\w+)\)/.exec(b.body);
  const scenery = /baseColour:\s*scenery\(/.exec(b.body);
  const r = numbersOf(b.body, 'roughness'), me = numbersOf(b.body, 'metalness');
  if (scenery || !r || !me) continue;                       // scenery is out of scope by construction
  /* A field may be a ternary OR a literal shared by both bodies — `metalness: 0.08` rather than
     `metalness: b.isCore ? … : …`. Reading `.core` off a literal yields undefined, which reaches the
     shader as NaN and renders black with no error, so the shape is resolved here rather than assumed. */
  const pick = (n, which) => (n.one !== undefined ? n.one : n[which]);
  if (tern) {
    marks.push({ name: 'core', hexName: tern[1], hex: hexes[tern[1].replace(/_HEX$/, '')], roughness: pick(r, 'core'), metalness: pick(me, 'core'), at: b.at });
    marks.push({ name: 'observed', hexName: tern[2], hex: hexes[tern[2].replace(/_HEX$/, '')], roughness: pick(r, 'other'), metalness: pick(me, 'other'), at: b.at });
  } else if (plain) {
    const key = plain[1].replace(/_HEX$/, '');
    marks.push({ name: key.toLowerCase(), hexName: plain[1], hex: hexes[key], roughness: r.one, metalness: me.one, at: b.at });
  }
}

/* The rig, also read rather than retyped. */
const lc = /lightColour:\s*\[([\d.]+)\s*\*\s*rig\.key,\s*([\d.]+)\s*\*\s*rig\.key,\s*([\d.]+)\s*\*\s*rig\.key\]/.exec(source);
const ag = /ambientGain:\s*([\d.]+)\s*\*\s*rig\.ambient/.exec(source);
const ld = /const lightDir:[^=]*=\s*\[([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\]/.exec(source);
if (!lc || !ag || !ld) { console.error('could not read the rig out of OntologyOrreryGl.tsx'); process.exit(1); }
const RIG = {
  lightColour: [Number(lc[1]), Number(lc[2]), Number(lc[3])],
  ambient: Number(ag[1]),
  lightDir: [Number(ld[1]), Number(ld[2]), Number(ld[3])],
};

for (const m of marks) {
  if (!m.hex || !Number.isFinite(m.roughness) || !Number.isFinite(m.metalness)) {
    console.error(`could not read ${m.name} out of the component: ${JSON.stringify(m)}`); process.exit(1);
  }
}
console.log('materials read from OntologyOrreryGl.tsx:');
for (const m of marks) console.log(`  ${m.name.padEnd(10)} ${m.hex}  rough ${m.roughness}  metal ${m.metalness}   (:${m.at})`);
console.log(`rig: lightColour ${JSON.stringify(RIG.lightColour)} x rig.key · ambient ${RIG.ambient} x rig.ambient · lightDir ${JSON.stringify(RIG.lightDir)}\n`);

const METRIC = `
export { deltaE2000, chromaOf, RAMP_CHROMA_FLOOR, CATEGORICAL_FLOOR_DE2000, linearToHex, exposure, BRAND } from '@lcx/gl';
export { hexToLinear } from '@lcx/gl';
`;

const alias = {
  '@lcx/gl': join(ROOT, 'packages/gl/src/index.ts'),
  '@lcx/gl/look/theme.js': join(ROOT, 'packages/gl/src/look/theme.ts'),
};
const bundle = async (contents, name, platform) => {
  const r = await build({
    stdin: { contents, resolveDir: HERE, sourcefile: name, loader: 'ts' },
    bundle: true, format: 'esm', target: 'es2022', write: false, logLevel: 'silent', platform,
    alias, define: { 'process.env.NODE_ENV': '"production"' },
  });
  if (r.errors?.length) { for (const e of r.errors) console.error(e); process.exit(1); }
  return r.outputFiles[0].text;
};

/* The metric is the repo's own CIEDE2000 — validated against the Sharma/Wu/Dalal vectors in
   `categorical.test.ts`. A hand-rolled one with a sign error in RT returns plausible numbers. */
const metricJs = await bundle(METRIC, 'metric.ts', 'neutral');
const metricUrl = 'data:text/javascript;base64,' + Buffer.from(metricJs).toString('base64');
const { deltaE2000, hexToLinear, chromaOf, RAMP_CHROMA_FLOOR, CATEGORICAL_FLOOR_DE2000,
        linearToHex, exposure, BRAND } = await import(metricUrl);

/* ── 2 · THE SWEEP ────────────────────────────────────────────────────────────────────────────── */

const CORE = marks.find((m) => m.name === 'core');
const WITHHELD = marks.find((m) => m.name === 'withheld');
const ABSENT = marks.find((m) => m.name === 'absent');
if (!CORE || !WITHHELD) { console.error('core or withheld not found'); process.exit(1); }

const METALNESS_STEPS = [0.36, 0.32, 0.28, 0.24, 0.22, 0.20, 0.18, 0.16, 0.14, 0.12, 0.08, 0.04, 0.0];
const ROUGHNESS_STEPS = [0.10, 0.14, 0.18, 0.22, 0.26, 0.30, 0.34, 0.42, 0.50, 0.60];
/* Candidate settings that keep the core the glossiest body on the frame while dropping the mirror. */
const CANDIDATES = [
  { roughness: 0.10, metalness: 0.08 }, { roughness: 0.12, metalness: 0.10 },
  { roughness: 0.14, metalness: 0.12 }, { roughness: 0.16, metalness: 0.10 },
  { roughness: 0.14, metalness: 0.08 }, { roughness: 0.18, metalness: 0.14 },
  { roughness: 0.12, metalness: 0.14 }, { roughness: 0.10, metalness: 0.16 },
];

const cases = [];
const push = (name, o) => { cases.push({ name, ...o }); return name; };

/*
 * THE ABSENCE FAMILY, DERIVED FROM `refusal` ITSELF RATHER THAN PICKED.
 *
 * The question "could the absent mark move into the absence family" is not a question about four
 * greys somebody liked; it is a question about the whole family. `exposure` scales all three linear
 * channels equally, so every entry here is `refusal` at a different EXPOSURE — same hue, same
 * chroma ratio, one axis of variation. If none of these clears the floor against `refusal` itself,
 * no member of the family does, and that is a statement about the palette rather than about taste.
 */
const GREY_STOPS = [-2.4, -1.8, -1.2, -0.7, -0.35, 0, 0.35, 0.7, 1.1, 1.5];
const GREY_FAMILY = GREY_STOPS.map((st) => ({ stops: st, hex: linearToHex(exposure(BRAND.refusal, st)) }));

/* Provenance: the Globe marker rig, seven palette entries, centre pixel vs brand-fidelity.json. */
const FIDELITY = JSON.parse(readFileSync(join(ROOT, 'docs/3d/brand-fidelity.json'), 'utf8'));
for (const k of Object.keys(FIDELITY.rows)) push('globe:' + k, { rig: 'globe', brandKey: k, roughness: 0.42, metalness: 0.05 });

/*
 * THREE ARMS, because a number that only exists at one light orientation is one viewpoint's opinion.
 *
 *   axis   the key down the view ray — brand-fidelity.mjs's arrangement, the one the recorded §5a/§5b
 *          rows were taken under. Every visible fragment is lit, so the measurement is about ALBEDO.
 *   own    E4's actual key (0.14 / -0.966 / -0.22, nearly plumb) at the same face-on camera. Half the
 *          visible disc is then below the terminator.
 *   own26  E4's key AND E4's lowest camera elevation, 26 degrees (orreryLayout.ts:618,689) — the
 *          closest single-sphere stand-in for the shipped frame there is.
 */
const ARMS = [['axis', 0], ['own', 0], ['own26', 26]];
const armOf = (a) => ({ light: a === 'axis' ? 'axis' : 'own', elevation: a === 'own26' ? 26 : 0 });
const ABSENCE_CANDIDATES = ['#6B7A99', '#5C6880', '#8A93A8', '#4A5568'];

for (const theme of ['dark', 'light']) {
  for (const [arm] of ARMS) {
    const A = armOf(arm), p = `${arm}:${theme}`;
    /* The mask, twice over: same material, two clear colours. Geometry only, so it is per camera. */
    push(`mask:${p}:a`, { rig: theme, hex: CORE.hex, roughness: CORE.roughness, metalness: CORE.metalness, clear: [0, 0, 0], ...A });
    push(`mask:${p}:b`, { rig: theme, hex: CORE.hex, roughness: CORE.roughness, metalness: CORE.metalness, clear: [1, 1, 1], ...A });
    /* Every shipped mark at its shipped material. */
    for (const m of marks) push(`ship:${p}:${m.name}`, { rig: theme, hex: m.hex, roughness: m.roughness, metalness: m.metalness, ...A });
    /* The two sweeps and the candidates, always against the SHIPPED withheld. */
    for (const mv of METALNESS_STEPS) push(`m:${p}:${mv}`, { rig: theme, hex: CORE.hex, roughness: CORE.roughness, metalness: mv, ...A });
    for (const rv of ROUGHNESS_STEPS) push(`r:${p}:${rv}`, { rig: theme, hex: CORE.hex, roughness: rv, metalness: CORE.metalness, ...A });
    /* The same roughness sweep at a DIELECTRIC metalness, which is the half the shipped sweep cannot
       see: with the mirror at 0.36 the roughness term is nearly inert, so its curve there says
       nothing about what roughness is worth once the mirror is gone. */
    for (const rv of ROUGHNESS_STEPS) push(`r2:${p}:${rv}`, { rig: theme, hex: CORE.hex, roughness: rv, metalness: 0.08, ...A });
    for (const c of CANDIDATES) push(`c:${p}:${c.roughness}/${c.metalness}`, { rig: theme, hex: CORE.hex, ...c, ...A });
    /* The absence question: what an absence-family hex would cost against the withheld drum. */
    for (const h of ABSENCE_CANDIDATES) push(`abs:${p}:${h}`, { rig: theme, hex: h, roughness: ABSENT.roughness, metalness: ABSENT.metalness, ...A });
    /* `refusal` at ten exposures, drawn with the ABSENT ring's own material. */
    for (const g of GREY_FAMILY) push(`grey:${p}:${g.stops}`, { rig: theme, hex: g.hex, roughness: ABSENT.roughness, metalness: ABSENT.metalness, ...A });
  }
}

/* ── 3 · THE PAGE ─────────────────────────────────────────────────────────────────────────────── */

const ENTRY = `
import {
  createStage, isStage, sphere, uploadMesh, createLitRenderer, createTarget3D,
  BRAND, hexToLinear, TONE_MAP_GLSL, SRGB_ENCODE_GLSL, IDENTITY, lookAt, perspective, multiply,
} from '@lcx/gl';
import { sceneTheme } from '@lcx/gl/look/theme.js';

/* E4's own present shader, from OntologyOrreryGl.tsx:64-79 — gl_VertexID, no attribute. */
const PRESENT_VERT = \`#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}\`;
const PRESENT_FRAG = \`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
\${TONE_MAP_GLSL}
\${SRGB_ENCODE_GLSL}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }\`;

const W = 128, H = 128;
const TH_DARK = sceneTheme('dark');

function b64(buf) {
  let s = '';
  for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
  return btoa(s);
}

window.__render = (cases, rigConst) => {
  const canvas = document.getElementById('c');
  canvas.width = W; canvas.height = H;
  const stage = createStage(canvas, { alpha: false });
  if (!isStage(stage)) return { refusal: stage };
  const { gl } = stage;
  stage.setRegion(W, H);
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const driver = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

  const present = stage.compile(PRESENT_VERT, PRESENT_FRAG);
  if ('kind' in present) return { refusal: present };
  const lit = createLitRenderer(stage);
  if ('kind' in lit) return { refusal: lit };
  const mesh = uploadMesh(stage, sphere(1.0, 48, 64));
  if ('kind' in mesh) return { refusal: mesh };
  const t3d = createTarget3D(stage, W, H);
  if ('kind' in t3d) return { refusal: t3d };

  const NM = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  /* The same camera brand-fidelity.mjs:195-197 measures on, so the provenance check is like for like. */
  const cameraAt = (elevationDeg) => {
    const d = 3.2, e = (elevationDeg || 0) * Math.PI / 180;
    const eye = [0, Math.sin(e) * d, Math.cos(e) * d];
    return { eye, viewProj: multiply(perspective(0.6, W / H, 0.1, 100), lookAt(eye, [0, 0, 0], [0, 1, 0])) };
  };

  /* GlobeReliefGl's marker rig, for provenance only — brand-fidelity.mjs:200-233. */
  const PLATE = hexToLinear('#0E1628');
  const fromPlate = (k) => [PLATE[0] * k, PLATE[1] * k, PLATE[2] * k];
  const GLOBE = {
    sky: { zenith: fromPlate(0.55), horizon: fromPlate(1.6), ground: fromPlate(0.35) },
    lightColour: [6.6, 6.2, 5.5], ambientGain: 120, lightDir: [0, 0, -1],
  };

  const frames = {};
  /*
   * ONE DISCARDED WARM-UP PASS, and it is not a superstition — it is measured.
   *
   * The FIRST drawElements on a fresh SwiftShader context raises GL_INVALID_OPERATION (1282) and
   * returns a black frame: with shadow null and ao null both of the lit program's sampler2D
   * uniforms sit on texture unit 0 with nothing bound to it. Every later pass is clean. Without this
   * the first case measured would be #000000 — which is exactly the shape of the bad number
   * brand-fidelity.mjs refuses on, so it is absorbed here and every MEASURED pass below is checked
   * for getError() === 0 rather than trusted.
   */
  const warm = { ...cases[0], name: '__warmup' };
  for (const c of [warm, ...cases]) {
    let rig, base;
    const cam = cameraAt(c.elevation);
    /* Down the view ray, whatever the camera is: -normalize(eye), since the target is the origin. */
    const axisLight = (() => {
      const e = cam.eye, l = Math.hypot(e[0], e[1], e[2]) || 1;
      return [-e[0] / l, -e[1] / l, -e[2] / l];
    })();
    if (c.rig === 'globe') {
      rig = GLOBE;
      base = BRAND[c.brandKey];
    } else {
      /* E4's own rig, exactly as OntologyOrreryGl.tsx builds it: the light SCALES by the theme's
         gain ratio against dark, and the sky is undefined on dark so that frame takes the path it
         shipped on (DEFAULT_SKY) and plate-derived on light. */
      const th = sceneTheme(c.rig);
      const key = th.keyGain / TH_DARK.keyGain, amb = th.ambientGain / TH_DARK.ambientGain;
      /*
       * TWO LIGHT ORIENTATIONS, and which one a number came from has to travel with it.
       *
       * 'axis' aims the key down the view ray, which is what brand-fidelity.mjs does and what the
       * recorded §5a/§5b rows reproduce: every fragment a reader can see is lit, so the measurement
       * is about the two ALBEDOS. 'own' uses E4's actual key, 0.14/-0.966/-0.22, which is nearly
       * plumb — half the visible disc then sits below the terminator on pure ambient, and on a dark
       * instrument sky that half is near-black for BOTH colours.
       */
      rig = {
        sky: th.name === 'dark' ? undefined : { zenith: th.skyZenith, horizon: th.skyHorizon, ground: th.ground },
        lightColour: rigConst.lightColour.map((v) => v * key),
        ambientGain: rigConst.ambient * amb,
        lightDir: c.light === 'own' ? rigConst.lightDir : axisLight,
      };
      base = hexToLinear(c.hex);
    }
    const clear = c.clear || [0, 0, 0];

    t3d.bind();
    gl.clearColor(clear[0], clear[1], clear[2], 1); gl.clearDepth(1);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.BLEND);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const e0 = gl.getError();
    const steps = [];
    lit.draw({
      onStep: (l) => { const e = gl.getError(); if (e) steps.push(l + '=' + e); },
      viewProj: cam.viewProj, eye: cam.eye, lightDir: rig.lightDir, lightColour: rig.lightColour,
      ambientGain: rig.ambientGain, sky: rig.sky, lightVP: IDENTITY(), shadow: null, ao: null,
      screenSize: [W, H],
      draws: [{ mesh, model: IDENTITY(), normalMat: NM,
        material: { baseColour: base, roughness: c.roughness, metalness: c.metalness } }],
    });
    const e1 = gl.getError();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.DEPTH_TEST);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t3d.texture);
    stage.blit(present, (p) => gl.uniform1i(gl.getUniformLocation(p, 'uScene'), 0));
    const e2 = gl.getError();
    const buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const e3 = gl.getError();
    if (c.name !== "__warmup" && (e0 || e1 || e2 || e3 || steps.length)) return { refusal: { code: "GL_ERROR_STEP", e0, e1, e2, e3, steps, at: c.name } };
    frames[c.name] = b64(buf);
    /* UNBIND, or the next pass renders into the texture still bound as the present sampler —
       brand-fidelity.mjs:250-254 records what that costs: six of seven colours come back black. */
    gl.bindTexture(gl.TEXTURE_2D, null);
    const err = gl.getError();
    if (err !== 0) return { refusal: { code: 'GL_ERROR', err, at: c.name } };
  }
  return { driver, hdr: stage.hdr, frames };
};
`;


const js = await bundle(ENTRY, 'sweep-entry.ts', 'browser');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 300, height: 300 } });
page.on('pageerror', (e) => console.error('  PAGE ERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('  CONSOLE ERROR: ' + m.text()); });
await page.setContent(`<!doctype html><meta charset="utf-8"><canvas id="c"></canvas>
<script type="module">${js}</script>`);
await page.waitForFunction(() => typeof window.__render === 'function', null, { timeout: 60_000 });
const out = await page.evaluate(([cs, rg]) => window.__render(cs, rg), [cases, RIG]);
await browser.close();

if (out.refusal) { console.error('refused: ' + JSON.stringify(out.refusal)); process.exit(1); }
if (!out.hdr) { console.error('REFUSED: no EXT_color_buffer_float, the scene target is RGBA8 — see brand-fidelity.mjs:409'); process.exit(1); }

const W = 128, H = 128;
const px = {};
for (const [k, v] of Object.entries(out.frames)) px[k] = Buffer.from(v, 'base64');

/* ── 4 · PROVENANCE, BEFORE ANY ORRERY NUMBER IS BELIEVED ─────────────────────────────────────── */
const centre = (b) => { const i = ((H >> 1) * W + (W >> 1)) * 4; return [b[i], b[i + 1], b[i + 2]]; };
const hx = (p) => '#' + p.map((v) => v.toString(16).padStart(2, '0')).join('');
let provOk = 0, provBad = [];
for (const [k, row] of Object.entries(FIDELITY.rows)) {
  const got = hx(centre(px['globe:' + k]));
  if (got === row.litCentre.pixel) provOk++; else provBad.push(`${k}: recorded ${row.litCentre.pixel}, this run ${got}`);
}
console.log(`driver: ${out.driver}   scene target: ${out.hdr ? 'RGBA16F' : 'RGBA8'}`);
console.log(`provenance: ${provOk}/${Object.keys(FIDELITY.rows).length} litCentre pixels reproduce brand-fidelity.json`);
if (provBad.length) { for (const b of provBad) console.error('  ' + b); console.error('the rig in this file is not the recorded one'); process.exit(1); }

/* ── 5 · THE MASK, MEASURED ───────────────────────────────────────────────────────────────────── */
const maskFor = (prefix) => {
  const a = px[`mask:${prefix}:a`], b = px[`mask:${prefix}:b`];
  const m = new Uint8Array(W * H);
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    if (a[o] === b[o] && a[o + 1] === b[o + 1] && a[o + 2] === b[o + 2]) { m[i] = 1; n++; }
  }
  return { m, n };
};
const MASK = {};
for (const [arm] of ARMS) for (const theme of ['dark', 'light']) MASK[`${arm}:${theme}`] = maskFor(`${arm}:${theme}`);
const covs = [...new Set(Object.values(MASK).map((m) => m.n))];
console.log(`coverage: ${covs.join(' / ')} fragments of ${W * H}`
  + (covs.length === 1 ? '  (identical across every arm, as one geometry must be)' : '  <- ARMS DISAGREE ON COVERAGE'));

const S2L = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const asLinear = (b, o) => [S2L(b[o] / 255), S2L(b[o + 1] / 255), S2L(b[o + 2] / 255)];

/** min / p05 / median ΔE2000 over the corresponding covered fragments of two frames. */
function separation(nameA, nameB, mask) {
  const A = px[nameA], B = px[nameB];
  if (!A || !B) throw new Error('no such frame: ' + (A ? nameB : nameA));
  const ds = [];
  for (let i = 0; i < W * H; i++) {
    if (!mask.m[i]) continue;
    ds.push(deltaE2000(asLinear(A, i * 4), asLinear(B, i * 4)));
  }
  ds.sort((x, y) => x - y);
  const at = (q) => ds[Math.min(ds.length - 1, Math.floor(q * (ds.length - 1)))];
  return { n: ds.length, min: ds[0], p05: at(0.05), median: at(0.5), p95: at(0.95), max: ds[ds.length - 1],
    /* How much of the mark a reader could actually SEE a difference on. 2.3 is CIEDE2000's
       perceptibility threshold for a trained observer on a split field — the most generous line
       available, so a low number here is not an artefact of a strict one. */
    visible: ds.filter((d) => d >= 2.3).length / ds.length };
}
const F = CATEGORICAL_FLOOR_DE2000;
const f2 = (v) => v.toFixed(2).padStart(6);
const sep = (arm, theme, a, b) => separation(`${a.includes(':') ? a : 'ship:' + arm + ':' + theme + ':' + a}`
  .replace('%', `${arm}:${theme}`), `${b.includes(':') ? b : 'ship:' + arm + ':' + theme + ':' + b}`
  .replace('%', `${arm}:${theme}`), MASK[`${arm}:${theme}`]);

/* ── 6 · WHAT SHIPS TODAY ─────────────────────────────────────────────────────────────────────── */
const DATA = ['core', 'observed', 'link'], NOREAD = ['absent', 'withheld'];
console.log('\nAS SHIPPED — every cross-state pair on this surface. p05, by arm.');
console.log('  pair                          axis-dark  axis-light   own-dark  own-light  own26-dark own26-light');
const pairs = [];
for (const a of DATA) for (const b of NOREAD) if (marks.some((m) => m.name === a) && marks.some((m) => m.name === b)) pairs.push([a, b]);
pairs.push(['absent', 'withheld']);
for (const [a, b] of pairs) {
  const cells = [];
  for (const [arm] of ARMS) for (const theme of ['dark', 'light']) cells.push(sep(arm, theme, a, b));
  const flag = cells.map((c) => (c.p05 >= F ? ' ' : '!')).join('');
  console.log(`  ${(a + ' / ' + b).padEnd(28)} ` + cells.map((c) => f2(c.p05) + '    ').join('') + `  ${flag.includes('!') ? 'VIOLATES somewhere' : 'ok'}`);
}
console.log('\n  the same pairs at the axis arm, in full (min / p05 / median), which is the recorded arm');
for (const [a, b] of pairs) for (const theme of ['dark', 'light']) {
  const d = sep('axis', theme, a, b);
  console.log(`  ${(theme + '  ' + a + ' / ' + b).padEnd(34)} ${f2(d.min)} ${f2(d.p05)} ${f2(d.median)}   ${d.p05 >= F ? 'ok' : 'VIOLATES'}`);
}

/* ── 7 · THE CURVE ────────────────────────────────────────────────────────────────────────────── */
const sweepTable = (title, steps, keyOf, shippedValue) => {
  console.log(`\n${title}`);
  console.log('  step     axis-dark axis-light   own-dark own-light  own26-dark own26-light   worst   verdict');
  for (const s of steps) {
    const cells = [];
    for (const [arm] of ARMS) for (const theme of ['dark', 'light']) {
      cells.push(separation(keyOf(arm, theme, s), `ship:${arm}:${theme}:withheld`, MASK[`${arm}:${theme}`]));
    }
    const worst = Math.min(...cells.map((c) => c.p05));
    console.log(`  ${String(s).padEnd(7)} ` + cells.map((c) => f2(c.p05) + '   ').join('')
      + ` ${f2(worst)}   ${worst >= F ? 'ok' : 'VIOLATES'}${s === shippedValue ? '   <- SHIPPED' : ''}`);
  }
};
sweepTable(`METALNESS SWEEP — core vs the shipped withheld drum, roughness held at ${CORE.roughness}`,
  METALNESS_STEPS, (arm, theme, s) => `m:${arm}:${theme}:${s}`, CORE.metalness);
sweepTable(`ROUGHNESS SWEEP — core vs the shipped withheld drum, metalness held at ${CORE.metalness}`,
  ROUGHNESS_STEPS, (arm, theme, s) => `r:${arm}:${theme}:${s}`, CORE.roughness);
sweepTable('ROUGHNESS SWEEP AT METALNESS 0.08 — the same sweep with the mirror gone',
  ROUGHNESS_STEPS, (arm, theme, s) => `r2:${arm}:${theme}:${s}`, null);
sweepTable('CANDIDATES — roughness/metalness pairs that keep the core the glossiest body on the frame',
  CANDIDATES.map((c) => `${c.roughness}/${c.metalness}`), (arm, theme, s) => `c:${arm}:${theme}:${s}`, null);
sweepTable('SHIPPED, for the same columns', [`${CORE.roughness}/${CORE.metalness}`],
  (arm, theme) => `ship:${arm}:${theme}:core`, null);

/* ── 8 · THE ABSENCE COLOUR ───────────────────────────────────────────────────────────────────── */
console.log('\nABSENT COLOUR — p05 against the withheld drum, and against the core');
console.log('  hex       chroma  category     vs withheld: axis-d axis-l  own26-d own26-l | vs core axis-d axis-l');
for (const h of ['#FF8A3D', ...ABSENCE_CANDIDATES]) {
  const key = (arm, theme) => (h === ABSENT.hex ? `ship:${arm}:${theme}:absent` : `abs:${arm}:${theme}:${h}`);
  const w = [['axis', 'dark'], ['axis', 'light'], ['own26', 'dark'], ['own26', 'light']]
    .map(([arm, theme]) => separation(key(arm, theme), `ship:${arm}:${theme}:withheld`, MASK[`${arm}:${theme}`]).p05);
  const c = [['axis', 'dark'], ['axis', 'light']]
    .map(([arm, theme]) => separation(key(arm, theme), `ship:${arm}:${theme}:core`, MASK[`${arm}:${theme}`]).p05);
  const cat = chromaOf(hexToLinear(h)) < RAMP_CHROMA_FLOOR ? 'absence' : 'annotation';
  console.log(`  ${h}  ${chromaOf(hexToLinear(h)).toFixed(1).padStart(5)}   ${cat.padEnd(11)}          `
    + w.map(f2).join(' ') + '  | ' + c.map(f2).join(' ')
    + `   ${Math.min(...w, ...c) >= F ? 'ok' : 'VIOLATES'}`);
}

console.log('\nTHE WHOLE ABSENCE FAMILY — `refusal` at ten exposures, drawn as the absent ring');
console.log('  stops  hex       chroma   vs withheld: axis-d axis-l | vs core axis-d axis-l | vs observed axis-d');
for (const g of GREY_FAMILY) {
  const k = (arm, theme) => `grey:${arm}:${theme}:${g.stops}`;
  const w = [['axis', 'dark'], ['axis', 'light']].map(([a, t]) => separation(k(a, t), `ship:${a}:${t}:withheld`, MASK[`${a}:${t}`]).p05);
  const c = [['axis', 'dark'], ['axis', 'light']].map(([a, t]) => separation(k(a, t), `ship:${a}:${t}:core`, MASK[`${a}:${t}`]).p05);
  const o = separation(k('axis', 'dark'), 'ship:axis:dark:observed', MASK['axis:dark']).p05;
  console.log(`  ${String(g.stops).padStart(5)}  ${g.hex}  ${chromaOf(hexToLinear(g.hex)).toFixed(1).padStart(5)}         `
    + w.map(f2).join(' ') + '  |  ' + c.map(f2).join(' ') + '  |     ' + f2(o)
    + `   ${Math.min(...w, ...c, o) >= F ? 'ok' : (Math.min(...w) < F ? 'fails vs withheld' : 'fails vs a data mark')}`);
}

/*
 * WHAT THE CORE LOSES, MEASURED TWO WAYS.
 *
 * `link` carries the SAME hex as the core (#7FB2FF) at a different material, so the separation
 * between them is MATERIAL AND NOTHING ELSE — the cleanest available measure of "does the core still
 * read as a different substance". And a highlight IS the peak fragment, so the brightest pixel on
 * each mark says which body catches the light hardest.
 */
console.log('\nTHE CORE\u2019S DISTINCTION — same hex as `link`, so this separation is MATERIAL ONLY');
console.log('                    vs link (same hex, MATERIAL ONLY)              vs observed (hex+material)');
console.log('  core material     dark p95   max visible%  light p95   max visible%   p05-d  p05-l  vis%   vs withheld');
const peak = (name, mask) => {
  const b = px[name];
  let best = 0;
  for (let i = 0; i < W * H; i++) {
    if (!mask.m[i]) continue;
    const o = i * 4, y = 0.2126 * S2L(b[o] / 255) + 0.7152 * S2L(b[o + 1] / 255) + 0.0722 * S2L(b[o + 2] / 255);
    if (y > best) best = y;
  }
  return best;
};
const pl = peak('ship:axis:dark:link', MASK['axis:dark']);
const po = peak('ship:axis:dark:observed', MASK['axis:dark']);
const distinction = (label, frameOf) => {
  const d = separation(frameOf('axis', 'dark'), 'ship:axis:dark:link', MASK['axis:dark']);
  const l = separation(frameOf('axis', 'light'), 'ship:axis:light:link', MASK['axis:light']);
  const w = separation(frameOf('axis', 'dark'), `ship:axis:dark:withheld`, MASK['axis:dark']).p05;
  const ob = separation(frameOf('axis', 'dark'), 'ship:axis:dark:observed', MASK['axis:dark']);
  const ol = separation(frameOf('axis', 'light'), 'ship:axis:light:observed', MASK['axis:light']);
  console.log(`  ${label.padEnd(16)} ${f2(d.p95)} ${f2(d.max)} ${(d.visible * 100).toFixed(1).padStart(6)}%  `
    + `${f2(l.p95)} ${f2(l.max)} ${(l.visible * 100).toFixed(1).padStart(6)}%   ${f2(ob.p05)} ${f2(ol.p05)} `
    + `${(ob.visible * 100).toFixed(0).padStart(4)}%   ${f2(w)}`);
};
/* A HIGHLIGHT TOO TIGHT TO LAND ON A SMALL BODY IS NOT A DISTINCTION. The layout floors a body at
   9 CSS px (orreryLayout), so a highlight that is 0.05% of a 128 px sphere is a third of a pixel on
   the real thing. This is the fraction of the mark within 10% of clipping. */
const bright = (name, mask) => {
  const b = px[name];
  let n = 0, tot = 0;
  for (let i = 0; i < W * H; i++) {
    if (!mask.m[i]) continue;
    tot++;
    const o = i * 4, y = 0.2126 * S2L(b[o] / 255) + 0.7152 * S2L(b[o + 1] / 255) + 0.0722 * S2L(b[o + 2] / 255);
    if (y >= 0.9) n++;
  }
  return n / tot;
};
console.log('\nHIGHLIGHT AREA at metalness 0.08 — fraction of the mark within 10% of clipping');
console.log('  rough   dark    light     px on a 30 px body (dark)');
for (const rv of ROUGHNESS_STEPS) {
  const d = bright(`r2:axis:dark:${rv}`, MASK['axis:dark']), l = bright(`r2:axis:light:${rv}`, MASK['axis:light']);
  console.log(`  ${String(rv).padEnd(6)} ${(d * 100).toFixed(2).padStart(6)}% ${(l * 100).toFixed(2).padStart(7)}%      ${(d * Math.PI * 225).toFixed(1)}`);
}
console.log(`  the SHIPPED core ${CORE.roughness}/${CORE.metalness}: ${(bright('ship:axis:dark:core', MASK['axis:dark']) * 100).toFixed(2)}% dark`
  + ` · link 0.34/0.12: ${(bright('ship:axis:dark:link', MASK['axis:dark']) * 100).toFixed(2)}%`
  + ` · observed 0.34/0.08: ${(bright('ship:axis:dark:observed', MASK['axis:dark']) * 100).toFixed(2)}%`);

distinction('SHIPPED .22/.36', (a, t) => `ship:${a}:${t}:core`);
for (const rv of ROUGHNESS_STEPS) distinction(`${rv}/0.08`, (a, t) => `r2:${a}:${t}:${rv}`);
for (const c of CANDIDATES) distinction(`${c.roughness}/${c.metalness}`, (a, t) => `c:${a}:${t}:${c.roughness}/${c.metalness}`);
for (const mv of METALNESS_STEPS) distinction(`${CORE.roughness}/${mv}`, (a, t) => `m:${a}:${t}:${mv}`);

console.log(`\nfloor ${F} ΔE2000 at p05. Ramp chroma floor ${RAMP_CHROMA_FLOOR.toFixed(1)} decides absence vs annotation.`);
