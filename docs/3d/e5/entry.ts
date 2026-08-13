/**
 * E5 · THE SURFACE — the score surface, promoted from a projection to a lit mesh.
 *
 * `3D_VFX_1000X.md` §2: "the existing score surface, promoted: real mesh with normals, shadowed,
 * contour ribbons, a probe you drag across it." §5 sequences it after E3 because it is the first
 * environment where the 3D version replaces a surface that ALREADY SHIPS.
 *
 * ── WHY THIS ONE IS THE STRONGEST §7(b) CANDIDATE ────────────────────────────────────
 * Every other environment in the programme invents its own 3D reading of a flat component. This one
 * does not have to: `buildSurfaceMesh` in `@lcx/shared` already computes a projected surface from a
 * grid, and `SurfacePlot` already draws it. So the 3D promotion can be driven from the IDENTICAL
 * input — the same rows, the same axes, the same frame — and the two can then be checked against
 * each other rather than admired separately.
 *
 * That is what the report at the bottom of this file does, and it is the whole reason to build E5
 * before E3, E4, E6 or E7. §7(b) asks whether an operator still gets their answer at least as fast.
 * Here that question has a precondition that can be settled first and mechanically: whether the two
 * surfaces are showing the same data at all.
 *
 * ── THE THREE STATES ARE THE HARD PART, AND THEY ARE WHY A PRETTY MESH WOULD BE A REGRESSION ──
 * The flat engine is careful in a way that is easy to throw away. A grid point is OBSERVED, ABSENT
 * (never measured), or WITHHELD (measured, may not be shown) — and a cell touching a non-observed
 * corner is drawn as a HOLE rather than interpolated across. Absent and withheld are never added
 * together, because an operator does something different about each.
 *
 * A watertight 3D grid would be smoother, handsomer, and would assert values nobody took. So:
 *   · ABSENT  → no cell. The hole is visible, and you can see the plinth through it.
 *   · WITHHELD → no cell EITHER, but a marker plate sits at the base of that grid point. The gap
 *     reads as deliberate rather than as missing, which is exactly the distinction the flat figure
 *     makes with its own hatching and which a mesh with a hole in it would otherwise lose.
 *
 * ── NO DEPTH OF FIELD, AND THAT IS E1's LESSON APPLIED ───────────────────────────────
 * E1 measured the cost: at a wide aperture only the focused panel is readable, so the rack and the
 * information requirement fight and the lens wins. A score surface is read, not admired. The camera
 * here is stopped down and everything is sharp; the depth cues are the shadow, the AO in the
 * hollows, and the perspective. Consistency with E1 would have been the wrong kind of consistency.
 */
import {
  createStage, isStage, box, plane, uploadMesh, createLitRenderer, createTarget3D,
  createShadowMap, createSkyBackdrop, createAmbientOcclusion,
  heightfield, projectQuad, isQuadRefusal, contourSegments,
  viewProjection, eyeOf, nearFarOf, lightViewProjection, boundsRadius, boundsCentre, triangleCount,
  hexToLinear, assertBrandFidelity, projectScreen, TONE_MAP_GLSL, SRGB_ENCODE_GLSL, IDENTITY,
  type LitDraw, type Viewpoint, type StageRefusal,
  QUALITY_TIERS, qualitySettings, shadowMapSizeFor, type QualityTier,
} from '@lcx/gl';
import {
  buildSurfaceMesh, isProjectedSurface, WITHHELD,
  type GridCellValue, type SurfaceGridInput,
} from '@lcx/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { SurfacePlot } from '@/components/geometry/SurfacePlot';
import { installFlatFallback } from '../_shared/flatFallback.js';

const params = new URLSearchParams(location.search);

/*
 * A NUMERIC URL PARAMETER, VALIDATED — and a non-numeric one REFUSES rather than falling back silently.
 *
 * `Number('abc')` is NaN, and `Math.max(1, Math.min(3, NaN))` is NaN, not the default: Math.max propagates
 * NaN rather than rejecting it. So `?scale=abc` produced a NaN canvas size, and a NaN size is a canvas of
 * zero area — a blank frame with every program compiled and no error anywhere. E0 through E4 were given this
 * treatment by the pen-test; E5 through E8 were not, so they still had it.
 *
 * A CLAMP IS RECORDED, NOT SILENT. `?scale=99` is a request the harness cannot honour, and honouring 3
 * without saying so means the report's resolution disagrees with what the reader asked for.
 */
const badParams: string[] = [];
const paramClamps: string[] = [];
function numParam(name: string, dflt: number, lo: number, hi: number): number {
  const raw = params.get(name);
  if (raw === null) return dflt;
  const v = Number(raw);
  if (!Number.isFinite(v)) { badParams.push(`${name}=${raw}`); return dflt; }
  const clamped = Math.max(lo, Math.min(hi, v));
  if (clamped !== v) paramClamps.push(`${name}=${raw} used as ${clamped}`);
  return clamped;
}
/*
 * THE QUALITY LADDER, WIRED. E9's `qualitySettings` is authoritative for the EFFECTS this frame runs:
 * ambient occlusion, depth of field, shadow-map size, and (where present) particle capacity and raymarch
 * depth. `?tier=full|reduced|minimum`, defaulting to full.
 *
 * `dprScale` is the one field the tier does NOT drive here, and that is a stated exception rather than an
 * oversight: every capture in this programme is 1200x720 so the sweep compares like with like, and letting
 * a tier change the pixel count would make two rows of the perf table incomparable. The tier's
 * recommendation is reported as `tierDprScale` beside the resolution actually used, so the difference is
 * visible rather than silent.
 *
 * The existing `?ao=0` / `?dof=0` switches still work and now compose with the tier by AND: a control can
 * turn an effect off, never on. A flag that could re-enable what the tier dropped would let a capture claim
 * a tier it is not rendering.
 */
const TIER: QualityTier = (QUALITY_TIERS as readonly string[]).includes(params.get('tier') ?? '')
  ? (params.get('tier') as QualityTier)
  : 'full';
const Q = qualitySettings(TIER);
const AO_ON = params.get('ao') !== '0' && Q.ao;
/* THE FLAT-ONLY CONTROL. `?mesh=0` renders the plinth and the annotations with no surface on it,
   which is what a broken heightfield would also produce — so the two captures together are what
   prove the mesh is the thing carrying the reading rather than the frame around it. */
const MESH_ON = params.get('mesh') !== '0';
/* The contour control exists so the ribbons can be shown to CARRY the reading rather than asserted to: the
   `no-contours` capture is the same surface with the iso-lines off. */
const CONTOURS_ON = params.get('contours') !== '0';
/* A deliberate refusal, so rule 1's claim can be CAPTURED — you cannot switch off WebGL from inside the
   page, which is why this claim had never been photographed anywhere in the programme. Not a mock: it
   calls the same `die` a failed shader compile calls. */
const FORCE_REFUSE = params.get('refuse') === '1';
const SCALE = numParam('scale', 1, 1, 3);
/* Bounded at both ends: frames=0 or -5 would publish a one-frame time as an n-frame
   sweep, and Math.trunc because a fractional loop bound is a fractional divisor two lines later. */
const FRAMES = Math.trunc(numParam('frames', 300, 1, 20000));

const W = 1200 * SCALE, H = 720 * SCALE;
const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.width = W; canvas.height = H;
const log = document.getElementById('log')!;

function die(m: string): never {
  document.title = 'REFUSED';
  /* Resolved here rather than closed over. `die` is now reachable BEFORE the harness's own `const log`
     is initialised — the flat fallback and its forced-refusal switch both sit above the stage on
     purpose — and a closure over an uninitialised const fails with "Cannot set properties of
     undefined", which reads as a DOM problem rather than an ordering one. */
  const logEl = document.getElementById('log');
  if (logEl) logEl.textContent = m;
  /* The refusal goes ABOVE the flat surface, not instead of it. */
  const [code, ...rest] = m.split(':');
  fallbackRef?.showRefusal(code?.trim() ?? 'REFUSED', rest.join(':').trim() || m);
  throw new Error(m);
}
/* Assigned once the fallback is installed. `die` is declared first because a `function` declaration
   returning `never` is what gives the compiler its control-flow narrowing; a const arrow does not. */
let fallbackRef: ReturnType<typeof installFlatFallback> | null = null;
function required<T extends object>(what: string, v: T | StageRefusal): T {
  if ('kind' in v) die(`${what}: ${v.code} — ${v.reason} ${v.detail ?? ''}`);
  return v;
}

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE DATA. Synthetic, and SAID SO by the engine's own mechanism rather than by a comment.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * `valuesArePlaceholders: true` makes `buildSurfaceMesh` emit a `VALUES_ARE_PLACEHOLDERS` notice,
 * which this harness then prints on the frame. §6 rule 8 forbids placeholder numbers in a rendered
 * environment, and the reason is that a plausible number in a beautiful frame is the most persuasive
 * lie this codebase can tell — so the flag is not a formality, it is the thing that keeps the
 * capture from being one. A reviewer who sees this frame sees the disclaimer in it.
 *
 * The SHAPE, though, is deliberately real: a win-rate surface over ticket size and time-to-close has
 * a ridge and a cliff, two absent cells where a band was never sampled, and a withheld block where
 * the underlying deals are too few to publish. Those are the four states the flat engine handles, and
 * a demo grid without them would exercise none of the code that matters.
 */
const X_TICKS = [25, 50, 100, 250, 500, 1000, 2500];
const Y_TICKS = [7, 14, 30, 60, 90, 180];

const ROWS: readonly (readonly GridCellValue[])[] = [
  /*  25    50    100   250   500   1000  2500  ← ticket size, $k */
  [0.31, 0.44, 0.52, 0.58, 0.49, 0.33, 0.18], // 7 days
  [0.28, 0.41, 0.55, 0.66, 0.61, 0.42, 0.24], // 14
  [0.22, 0.36, 0.51, 0.71, 0.74, 0.58, 0.35], // 30 — the ridge
  [0.17, 0.29, 0.42, 0.63, 0.72, 0.66, 0.44], // 60
  [null, 0.21, 0.33, 0.48, 0.59, WITHHELD, WITHHELD], // 90 — one never sampled, two too thin to publish
  [null, 0.14, 0.24, 0.36, 0.45, WITHHELD, 0.29], // 180
];

const INPUT: SurfaceGridInput = {
  rows: ROWS,
  xAxis: { label: 'Ticket size', unit: '$k', ticks: X_TICKS.map((v) => ({ value: v, label: String(v) })) },
  yAxis: { label: 'Days to close', unit: 'd', ticks: Y_TICKS.map((v) => ({ value: v, label: String(v) })) },
  zAxis: { label: 'Win rate', unit: '', tickCount: 5 },
  frame: {
    environment: 'harness',
    observedAt: '2026-08-11T00:00:00.000Z',
    windowFrom: null,
    windowTo: null,
    source: 'docs/3d/e5/entry.ts — synthetic',
    valuesArePlaceholders: true,
  },
};

/*
 * THE DOMAIN OF A RATE, ASSERTED — because "finite" is not "possible".
 *
 * WHAT WENT WRONG: validation was delegated entirely to `buildSurfaceMesh`, which refuses a non-finite
 * cell (`GEOMETRY_Z_NOT_FINITE`) and accepts ANY finite number. `zAxis` here is declared as a win rate
 * and every probe label is formatted as a percentage, so a cell of 12.5 rendered the on-frame headline
 * `PEAK 1250%` with no notice and no refusal, and -0.9 was accepted as a win rate of -90%. Measured on a
 * copy of this harness: `title READY`, frame text `PEAK / 1250% / $2500k · 180 d`. The control — the same
 * grid with one `NaN` — refused correctly, which is what made the gap look like coverage.
 *
 * WHY IT IS ASSERTED HERE: the ENGINE cannot know the domain, because `SurfaceGridInput` has no field
 * for it — `zAxis` carries a label and a unit and nothing about range. The declaring surface is the only
 * place that knows this quantity is a fraction of deals won, so it is the place that owns the bound. The
 * engine-level fix is an optional `zAxis.domain` on `SurfaceGridInput` refused the same way non-finite is;
 * until that exists, a rate surface must not be ABLE to plot 1250%, and this refuses rather than clamps:
 * a clamped 12.5 is a plausible 100% and that is the lie this environment's disclaimer exists to prevent.
 *
 * It sits here, ahead of the flat fallback's installation, for the same reason the engine-refusal below it
 * does: this environment's fallback IS the flat surface built from these cells, so there is nothing honest
 * to fall back TO when the cells are impossible. Verified on a copy — `title REFUSED`, and the log names
 * both offending cells with their coordinates rather than just the code.
 */
const Z_DOMAIN: readonly [number, number] = [0, 1];
const outOfDomain = ROWS.flatMap((row, r) => row.flatMap((v, c) => (
  typeof v === 'number' && Number.isFinite(v) && (v < Z_DOMAIN[0] || v > Z_DOMAIN[1])
    ? [`${X_TICKS[c]}k/${Y_TICKS[r]}d=${v}`] : []
)));
if (outOfDomain.length > 0) {
  die(`Z_OUT_OF_DOMAIN: ${INPUT.zAxis.label} is a rate and must lie in`
    + ` [${Z_DOMAIN[0]}, ${Z_DOMAIN[1]}] — ${outOfDomain.join(', ')}`);
}

/* THE FLAT SURFACE, BUILT FROM THE SAME INPUT. Not to draw — to CHECK against. If it refuses, the
   3D version has no business rendering: it would be showing a surface the shipping engine declined
   to show, which is the worst possible direction for a disagreement to run. */
const flatOutcome = buildSurfaceMesh(INPUT);
if (!isProjectedSurface(flatOutcome)) {
  die(`the flat engine REFUSED this input, so the mesh must too: ${flatOutcome.refusals.map((r) => r.code).join(', ')}`);
}
const flat = flatOutcome;

/*
 * §6 RULE 1, SATISFIED LITERALLY. "SSR, print, no-WebGL and reduced-motion all resolve to THE EXISTING
 * SURFACE" — and E5 is the one environment in the programme that has an existing surface to resolve to.
 *
 * So the fallback is not a table that re-states the same fields. It is `SurfacePlot`, the component the
 * app actually ships, rendered from the SAME `SurfaceGeometry` object the mesh above was built from.
 * A second implementation of the flat view could drift from the real one; this cannot, because it IS
 * the real one.
 *
 * Installed before `createStage`, because a shader compile failure happens during module evaluation and
 * anything built after the renderer is constructed never runs on the failure it exists for. Print and
 * the accessibility tree are not errors at all, so for those there is nothing to catch.
 */
const fallback = installFlatFallback({
  title: 'E5 · The Surface — win rate by ticket size and days to close',
  readsAs: 'The rendered view adds relief, a shadow and ambient occlusion, so the ridge and the cliff '
    + 'are read at a glance rather than decoded from shading. The flat figure below is the shipping '
    + 'SurfacePlot component, built from the identical grid — it carries every cell, every hole and '
    + 'every withheld marker, and the cell counts are asserted equal to the mesh.',
  notices: [
    'VALUES ARE PLACEHOLDERS — declared by the engine, not by this harness.',
    'Absent and withheld cells are drawn differently here, exactly as in the mesh.',
  ],
  columns: [], rows: [],
  html: renderToStaticMarkup(
    SurfacePlot({
      surface: flatOutcome,
      title: 'Win rate · ticket size × days to close',
      readsAs: 'Higher is better. Holes are cells never measured; hatched cells are withheld.',
      heightPx: 380,
    }),
  ),
});

fallbackRef = fallback;

/* A NONSENSICAL PARAMETER REFUSES, and it refuses AFTER the flat fallback exists so the reader still gets
   the data. Drawn at a NaN size the canvas has zero area: a blank frame, every program compiled, no error. */
if (badParams.length > 0) {
  die(`BAD_PARAM: ${badParams.join(', ')} — not a number, so the view was not drawn rather than `
    + 'drawn at a nonsensical size. Nothing about the underlying measurements has changed; correct '
    + 'the URL and reload.');
}
if (FORCE_REFUSE) {
  die('FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. '
    + 'The three-dimensional view is not being drawn.');
}

const out = createStage(canvas, { alpha: false });
if (!isStage(out)) die(`stage: ${out.code} — ${out.reason}`);
const stage = out;
const gl = stage.gl;

const PRESENT_VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
const PRESENT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${TONE_MAP_GLSL}
${SRGB_ENCODE_GLSL}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`;

const present = required('present', stage.compile(PRESENT_VERT, PRESENT_FRAG));
const lit = required('lit', createLitRenderer(stage));
const target = required('target', createTarget3D(stage, W, H));
const shadow = required('shadow', createShadowMap(stage, shadowMapSizeFor(TIER, 1536)));
const skyBox = required('sky', createSkyBackdrop(stage));
const ao = required('ao', createAmbientOcclusion(stage, W, H));



/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE MESH, FROM THE SAME ROWS.
 * ══════════════════════════════════════════════════════════════════════════════════════
 */
const NX = X_TICKS.length, NZ = Y_TICKS.length;
const SURF_W = 4.6, SURF_D = 3.4, SURF_H = 1.15;

/* Absent and withheld are counted SEPARATELY here even though both produce no cell, because the
   moment they share a counter the report can no longer tell an operator which one they are looking
   at — and those two facts call for different actions. */
let withheldPoints = 0, absentPoints = 0;
const withheldAt: [number, number][] = [];
const cellAt = (c: number, r: number): GridCellValue => ROWS[r]![c]!;

const field = heightfield(NX, NZ, (c, r) => {
  const v = cellAt(c, r);
  if (v === WITHHELD) { withheldPoints++; withheldAt.push([c, r]); return null; }
  if (v === null) { absentPoints++; return null; }
  return v;
}, SURF_W, SURF_D, SURF_H);

const PLINTH_H = 0.16;
const plinthGeo = box(SURF_W + 0.5, PLINTH_H, SURF_D + 0.5);
const deckGeo = plane(26, 22);
/* One marker geometry, instanced by model matrix. A withheld plate carries no value, so it needs no
   height and no per-instance shape — which is the point: it is a statement that something is here
   and is not being shown, not a bar whose size could be read as a quantity. */
const markerGeo = box(0.30, 0.055, 0.30);

const deckMesh = required('deck', uploadMesh(stage, deckGeo));
const plinthMesh = required('plinth', uploadMesh(stage, plinthGeo));
const markerMesh = required('marker', uploadMesh(stage, markerGeo));
const surfMesh = field.cellsDrawn > 0 ? required('surface', uploadMesh(stage, field.geometry)) : null;

const N3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const translate = (x: number, y: number, z: number): Float32Array => {
  /* `IDENTITY` IS A FACTORY. `new Float32Array(IDENTITY)` is length 0, `uniformMatrix4fv` raises
     GL_INVALID_VALUE, and every vertex collapses to the origin with a complete framebuffer and no
     refusal anywhere. It cost E0 a day and it is worth the reminder at every call site. */
  const m = IDENTITY();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
};

/* Grid point to world, so markers, the probe and the DOM annotations all agree about where a cell
   is. Derived once: three call sites computing this independently is three chances to drift. */
const SURF_Y = PLINTH_H;
const worldAt = (c: number, r: number): [number, number, number] => [
  -SURF_W / 2 + (c / (NX - 1)) * SURF_W,
  SURF_Y,
  -SURF_D / 2 + (r / (NZ - 1)) * SURF_D,
];

/* The peak of the OBSERVED data, found by measurement. A hard-coded "the ridge is at 500/30" would
   silently stop being true the moment a row changes, and the probe would then point at nothing. */
const peak = (() => {
  let best: { c: number; r: number; v: number } | null = null;
  for (let r = 0; r < NZ; r++) {
    for (let c = 0; c < NX; c++) {
      const v = cellAt(c, r);
      if (typeof v !== 'number') continue;
      if (!best || v > best.v) best = { c, r, v };
    }
  }
  return best;
})();

const range = field.observedRange;
const yOfValue = (v: number): number => (
  !range || range[1] === range[0] ? SURF_Y : SURF_Y + ((v - range[0]) / (range[1] - range[0])) * SURF_H
);

/* The probe: a slim column from the plinth to the peak, plus a DOM label. Vertical, because the
   quantity it reads is vertical — a marker floating beside the peak would leave the reader to guess
   which cell it belongs to, which is the one thing a probe exists to remove. */
/*
 * THE PROBE IS MOVABLE, and making it so meant changing how it is built.
 *
 * It used to be a column sized to the peak: `box(0.045, PROBE_H + 0.30, 0.045)` with the height baked into the
 * geometry. §2 asks for "a probe you drag across it", and a probe whose LENGTH encodes the value cannot move
 * without new geometry every frame — or a non-uniform scale, which stops the normal matrix being a rotation and
 * tilts the lighting off the surface as the probe travels.
 *
 * So the column is a FIXED length and slides in y until its top sits at the probed value. The part below the
 * plinth is hidden by the plinth, so the visible length above it still reads as the quantity — the encoding is
 * unchanged and the geometry is now constant. One upload, one translate per frame.
 */
const PROBE_COL = SURF_H + PLINTH_H + 0.60;
const probeGeo = box(0.045, PROBE_COL, 0.045);
const probeMesh = peak ? required('probe', uploadMesh(stage, probeGeo)) : null;

/* Which cell the probe is reading. Starts on the measured peak — the same default as before, so a capture with
   no interaction is unchanged — and moves on a pointer event. */
let probeCell: { c: number; r: number } = peak ? { c: peak.c, r: peak.r } : { c: 0, r: 0 };
let probeMoves = 0;
const probeValueAt = (c: number, r: number): number | null => {
  const v = cellAt(c, r);
  return typeof v === 'number' ? v : null;
};

/* 8.5 m, not 7.6. At 7.6 the outermost tick on each axis fell off the bottom and right edges — the
   harness reported `ticksOffFrame: 2` and the capture showed the x axis ending at 1000 and the y axis
   at 90. An axis missing its last tick is worse than no axis: the reader scales the surface against a
   range that stops short of the data. Caught by the count, not by looking. */
const view: Viewpoint = { target: [0, 0.52, 0.05], distance: 8.5, azimuthDeg: 38, elevationDeg: 26, fovDeg: 34 };
const eye = eyeOf(view);

/*
 * CONTOUR RIBBONS — §2 asks for them and §5 named them outstanding. They are not decoration.
 *
 * Smooth shading tells a reader the surface RISES and nothing more. A contour tells them WHERE a specific
 * value is, which is the question actually asked of a score surface: "which bands clear 60%" is answered by
 * looking at one ribbon and is not answerable from a gradient at all.
 *
 * The levels are round numbers in the DATA's units, not evenly spaced across the observed range. A reader
 * asks about 60%, never about "the fourth of five equal steps between 0.14 and 0.74" — and a level that falls
 * outside the observed range is REPORTED as empty rather than dropped, because a legend naming a contour that
 * was never drawn is a legend that lies.
 */
const CONTOUR_LEVELS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
const contours = contourSegments(NX, NZ, (c, r) => {
  const v = cellAt(c, r);
  /* Withheld and absent are BOTH unmeasured as far as an iso-line is concerned — you cannot interpolate a
     crossing through a value you were not shown any more than through one nobody took. The two states stay
     distinct everywhere else; here they agree, and that agreement is the honest one. */
  return typeof v === 'number' ? v : null;
}, CONTOUR_LEVELS);

/* Grid coordinates to world, on the surface. Shares `worldAt`'s mapping so a ribbon cannot drift from the
   mesh it lies on; the height comes from bilinear interpolation of the same cells the mesh was built from. */
const surfaceAt = (gc: number, gr: number): [number, number, number] => {
  const c0 = Math.floor(gc), r0 = Math.floor(gr);
  const c1 = Math.min(NX - 1, c0 + 1), r1 = Math.min(NZ - 1, r0 + 1);
  const fc = gc - c0, fr = gr - r0;
  const val = (c: number, r: number): number => {
    const v = cellAt(c, r);
    return typeof v === 'number' ? v : (range ? range[0] : 0);
  };
  const v = val(c0, r0) * (1 - fc) * (1 - fr) + val(c1, r0) * fc * (1 - fr)
    + val(c0, r1) * (1 - fc) * fr + val(c1, r1) * fc * fr;
  return [
    -SURF_W / 2 + (gc / (NX - 1)) * SURF_W,
    yOfValue(v) + 0.006,
    -SURF_D / 2 + (gr / (NZ - 1)) * SURF_D,
  ];
};

/*
 * One thin quad per segment, in the surface plane. 1.8 cm, not the 1.1 cm I first used: measured off the
 * capture rather than chosen, where 1.1 cm came out at barely a pixel and the ribbons read as scratches in the
 * material instead of as lines drawn on it. Still narrow enough that six of them do not become the surface.
 */
const RIBBON_W = 0.018;
const ribbonGeo = (() => {
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], tan: number[] = [], idx: number[] = [];
  for (const seg of contours.segments) {
    const a = surfaceAt(seg.from[0], seg.from[1]);
    const b = surfaceAt(seg.to[0], seg.to[1]);
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const len = Math.hypot(dx, dz);
    if (len < 1e-9) continue;
    /* Perpendicular in the XZ plane. Offsetting in 3-D along the surface normal would make a ribbon on a
       steep face wider on screen than one on a flat face, so the width would encode slope by accident. */
    const px = (-dz / len) * (RIBBON_W / 2), pz = (dx / len) * (RIBBON_W / 2);
    const base = pos.length / 3;
    for (const [x, y, z] of [
      [a[0] - px, a[1], a[2] - pz], [a[0] + px, a[1], a[2] + pz],
      [b[0] + px, b[1], b[2] + pz], [b[0] - px, b[1], b[2] - pz],
    ] as [number, number, number][]) {
      pos.push(x, y, z); nrm.push(0, 1, 0); uv.push(0, 0); tan.push(1, 0, 0);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  if (idx.length === 0) return null;
  const positions = new Float32Array(pos);
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]!); maxX = Math.max(maxX, positions[i]!);
    minY = Math.min(minY, positions[i + 1]!); maxY = Math.max(maxY, positions[i + 1]!);
    minZ = Math.min(minZ, positions[i + 2]!); maxZ = Math.max(maxZ, positions[i + 2]!);
  }
  return {
    positions, normals: new Float32Array(nrm), uvs: new Float32Array(uv), tangents: new Float32Array(tan),
    indices: idx.length > 65535 ? new Uint32Array(idx) : new Uint16Array(idx),
    min: [minX, minY, minZ] as const, max: [maxX, maxY, maxZ] as const,
  };
})();
const ribbonMesh = CONTOURS_ON && ribbonGeo ? required('contours', uploadMesh(stage, ribbonGeo)) : null;

const draws: LitDraw[] = [
  { mesh: deckMesh, model: translate(0, 0, 0), normalMat: N3,
    material: { baseColour: hexToLinear('#070B14'), roughness: 0.88, metalness: 0 } },
  { mesh: plinthMesh, model: translate(0, PLINTH_H / 2, 0), normalMat: N3,
    material: { baseColour: hexToLinear('#101A31'), roughness: 0.62, metalness: 0.04 } },
];

if (MESH_ON && surfMesh) {
  draws.push({
    mesh: surfMesh, model: translate(0, SURF_Y, 0), normalMat: N3,
    /*
     * BRAND BLUE, DIELECTRIC, AND ANISOTROPIC ALONG THE SAMPLING GRID.
     *
     * §6 rule 5 keeps the hex exact, which forbids metalness: a metal has no diffuse lobe, so its
     * colour arrives only through the specular F0 and #2C6BFF becomes a blue-tinted mirror of the
     * sky. The anisotropy runs along the tangent the heightfield built, which is the +x grid
     * direction — so the highlight travels WITH the axis the samples were taken on rather than
     * across it, and a ridge reads as a ridge instead of as a scratch.
     */
    material: { baseColour: hexToLinear('#2C6BFF'), roughness: 0.34, metalness: 0.05, anisotropy: 0.55 },
  });
}

if (ribbonMesh) {
  draws.push({
    mesh: ribbonMesh, model: translate(0, SURF_Y, 0), normalMat: N3,
    /* BRAND-BRIGHT, dielectric, and matte. A specular ribbon would catch the key light and read as a raised
       wire rather than as a line drawn ON the surface — the highlight would say "object" where the geometry
       is meant to say "value". */
    material: { baseColour: hexToLinear('#7FB2FF'), roughness: 0.72, metalness: 0.0 },
  });
}

/* WITHHELD MARKERS, in a colour that is neither the surface nor the plinth. Brand blue would read as
   data and the plinth hex would read as absence; amber reads as "there is something here you are not
   being shown", which is the actual state. */
for (const [c, r] of withheldAt) {
  const [x, , z] = worldAt(c, r);
  draws.push({
    mesh: markerMesh, model: translate(x, SURF_Y + 0.028, z), normalMat: N3,
    material: { baseColour: hexToLinear('#C98A2B'), roughness: 0.55, metalness: 0.08 },
  });
}

/* Pushed LAST and rebuilt per frame, because the probe moves. Its index is kept so `frame()` can rewrite the
   model matrix without reconstructing the whole draw list on every pointer event. */
let probeDrawIndex = -1;
if (MESH_ON && probeMesh && peak) {
  probeDrawIndex = draws.length;
  draws.push({
    mesh: probeMesh, model: IDENTITY(), normalMat: N3,
    material: { baseColour: hexToLinear('#E8EEF9'), roughness: 0.22, metalness: 0.75, anisotropy: 0.3 },
  });
}

/*
 * Where the probe column sits for a given cell: top of the column at the cell's value, so the visible length
 * above the plinth is the reading. A cell with no measurement REFUSES to move the probe rather than parking it
 * at zero — zero is a win rate, and absent is not.
 */
const probeModel = (): Float32Array => {
  const v = probeValueAt(probeCell.c, probeCell.r);
  const [x, , z] = worldAt(probeCell.c, probeCell.r);
  const topY = v === null ? SURF_Y : yOfValue(v);
  return translate(x, topY - PROBE_COL / 2, z);
};

const lightDir: [number, number, number] = [0.48, -0.62, -0.62];
const sceneMin: [number, number, number] = [-3.6, 0, -2.8];
const sceneMax: [number, number, number] = [4.2, 1.8, 3.2];
const lightVP = lightViewProjection(
  { direction: lightDir, colour: [1, 1, 1], extent: 6.4 },
  boundsCentre(sceneMin, sceneMax), boundsRadius(sceneMin, sceneMax),
);

const tris = draws.reduce((n, _d, i) => n + (i === 0 ? triangleCount(deckGeo) : 0), 0)
  + triangleCount(plinthGeo)
  + (MESH_ON && surfMesh ? field.cellsDrawn * 2 : 0)
  + withheldAt.length * triangleCount(markerGeo)
  + (MESH_ON && probeMesh ? triangleCount(probeGeo) : 0);

/*
 * FROM THE VIEWPOINT, NOT HAND-WRITTEN. These constants are used to LINEARISE the depth buffer for
 * ambient occlusion, and linearising with different planes from the ones the projection was built with
 * is silently wrong: 0.1 and 60 against this view's actual 0.085 and 68. The reconstructed view-space
 * depth was off, so the world-space radius the occlusion gathered over was off with it. Nothing errors —
 * the AO just describes a slightly different scene from the one on screen, and it reads as the strength
 * being mistuned, which is what sends you tuning `strength` instead of fixing the planes.
 */
const { near, far } = nearFarOf(view);

function frame() {
  /* The probe's matrix is refreshed here rather than at the pointer event, so a re-render for any reason —
     a resize, a tier change, the timing sweep — cannot leave the column somewhere the readout is not. */
  if (probeDrawIndex >= 0) {
    (draws[probeDrawIndex] as { model: Float32Array }).model = probeModel();
  }
  const vp = viewProjection(view, W / H);
  lit.shadowPass(lightVP, draws, shadow);
  target.bind();
  gl.clear(gl.DEPTH_BUFFER_BIT);
  skyBox.draw({ eye, target: view.target, fovDeg: view.fovDeg ?? 34, aspect: W / H });
  lit.depthPrepass(vp, draws);
  if (AO_ON) {
    /* 0.35 m, about a third of the surface's relief. Larger and the occlusion stops describing the
       hollows between ridges — which is the cue that makes relief readable at all — and starts
       dimming the whole sheet against the plinth. */
    ao.compute({ depthTexture: target.depthTexture, near, far, fovDeg: view.fovDeg ?? 34, aspect: W / H, radius: 0.35, strength: 1.25 });
    target.bind();
  }
  lit.draw({
    viewProj: vp, eye, lightDir, lightColour: [3.4, 3.35, 3.2],
    ambientGain: 1.0, lightVP, shadow, shadowStrength: 0.9, shadowTaps: Q.shadowTaps, draws,
    ao: AO_ON ? ao.texture : null, screenSize: [W, H],
  });
  /* `blit(program, setUniforms?)` — the second argument is a CALLBACK, not a texture, and the
     caller binds the sampler itself. Passing the texture straight through threw "setUniforms is not
     a function" at module evaluation, which the harness reported as a 30-second TIMEOUT because a
     page that throws never sets its title. That is what made the capture print page errors on the
     spot rather than after the wait. */
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  gl.disable(gl.DEPTH_TEST);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  stage.blit(present, (prog) => gl.uniform1i(gl.getUniformLocation(prog, 'uScene'), 0));
}

/*
 * THE INSTRUMENT, CORRECTED. The first version was `gl.finish()` over a 4-frame batch with no
 * warm-up, and it reported 0.45 ms for a shadow-mapped, AO'd 1200x720 frame under a CPU rasteriser —
 * a number that is not physically plausible and that I published in a README and a commit message
 * as fact.
 *
 * `gl.finish()` returns once the command buffer is FLUSHED, not once the GPU has finished; this repo
 * had already written that down twice (docs/3d/p1/README.md and E1's own comment) and E0, E1, E2 and
 * E8 all use the trailing-readPixels form. E5 and E6 did not. A pixel read cannot be satisfied until
 * the frame it reads actually exists, which is what makes the clock mean something.
 *
 * The warm-up frame matters too: the first frame pays shader upload and texture allocation, and
 * averaged over a 4-frame batch that alone can dominate the result.
 */
function measure(n: number): number {
  frame();
  const px = new Uint8Array(4);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const t0 = performance.now();
  for (let i = 0; i < n; i++) frame();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return (performance.now() - t0) / n;
}
const ms = measure(Math.max(1, FRAMES));

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE ANNOTATIONS — DOM, per §6 rule 4, and two different projections for two different jobs.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * The title plate uses `projectQuad`: it belongs TO the plinth's front face and should foreshorten
 * with it, exactly as E1's panel content does.
 *
 * The tick labels use `projectScreen`: they are annotations ABOUT the surface, not content on it, so
 * they must stay screen-parallel and legible. Laying them on the plinth would be consistency for its
 * own sake and would make the numbers hardest to read at precisely the azimuths where the axis is
 * most foreshortened. Choosing per-element is the point of having both.
 */
const vpFinal = viewProjection(view, W / H);
const CSS_W = W / SCALE, CSS_H = H / SCALE;

const wrap = document.createElement('div');
/* `overflow:hidden` IS NOT COSMETIC. A projected element is clipped to the canvas box or it
   extends the PAGE box, and a surface seen nearly edge-on produces a homography whose
   coefficients are enormous — the element's transformed bounding box then runs to millions of
   pixels and Playwright's `fullPage` screenshot fails with "Unable to capture screenshot",
   naming the screenshot rather than the transform three layers away that caused it. */
wrap.style.cssText = `position:relative;overflow:hidden;width:${CSS_W}px;height:${CSS_H}px`;
canvas.parentNode?.insertBefore(wrap, canvas);
wrap.appendChild(canvas);
const overlay = document.createElement('div');
overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none';
wrap.appendChild(overlay);

const label = (x: number, y: number, html: string, extra = ''): void => {
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;`
    + `transform:translate(-50%,-50%);white-space:nowrap;${extra}`;
  el.innerHTML = html;
  overlay.appendChild(el);
};

const TICK_CSS = 'font:500 10.5px/1 ui-monospace,monospace;color:rgba(196,212,240,0.82);letter-spacing:.06em';

/* Axis ticks along the two NEAR edges of the plinth. Which edges those are depends on the azimuth,
   so they are chosen by projecting both candidates and taking the one further down the frame —
   rather than hard-coding an edge that is only near at some camera angles. */
const xTickLabels = X_TICKS.map((v, c) => {
  const a = projectScreen(vpFinal, [worldAt(c, 0)[0], 0, -SURF_D / 2 - 0.42], CSS_W, CSS_H);
  const b = projectScreen(vpFinal, [worldAt(c, 0)[0], 0, SURF_D / 2 + 0.42], CSS_W, CSS_H);
  const p = a.sy > b.sy ? a : b;
  if (!p.behind) label(p.sx, p.sy, String(v), TICK_CSS);
  return { value: v, sx: Math.round(p.sx), sy: Math.round(p.sy), behind: p.behind };
});
const yTickLabels = Y_TICKS.map((v, r) => {
  const a = projectScreen(vpFinal, [-SURF_W / 2 - 0.46, 0, worldAt(0, r)[2]], CSS_W, CSS_H);
  const b = projectScreen(vpFinal, [SURF_W / 2 + 0.46, 0, worldAt(0, r)[2]], CSS_W, CSS_H);
  const p = a.sx > b.sx ? a : b;
  if (!p.behind) label(p.sx, p.sy, String(v), TICK_CSS);
  return { value: v, sx: Math.round(p.sx), sy: Math.round(p.sy), behind: p.behind };
});

/* The probe's readout, at the top of its column. The value is printed from the SAME cell the probe's
   height was computed from, so the number and the geometry cannot disagree. */
let probeLabel: { sx: number; sy: number } | null = null;
let probeReadout: HTMLElement | null = null;

/*
 * THE READOUT FOLLOWS THE PROBE, not the peak. It used to be built once at the peak's position with the peak's
 * value; now that the column moves, a fixed readout would have the number and the geometry disagree the moment
 * a reader dragged it — which is the one thing this probe exists to prevent.
 *
 * Rebuilt on demand and positioned from the SAME cell the column's height came from.
 */
const paintProbe = (): void => {
  if (!MESH_ON || !peak) return;
  const v = probeValueAt(probeCell.c, probeCell.r);
  const [px, , pz] = worldAt(probeCell.c, probeCell.r);
  const topY = v === null ? SURF_Y : yOfValue(v);
  const pr = projectScreen(vpFinal, [px, topY + 0.34, pz], CSS_W, CSS_H);
  if (!probeReadout) {
    probeReadout = document.createElement('div');
    probeReadout.style.cssText = 'position:absolute;transform:translate(-50%,-50%);text-align:center;'
      + 'white-space:nowrap;pointer-events:none';
    overlay.appendChild(probeReadout);
  }
  if (pr.behind) { probeReadout.style.display = 'none'; probeLabel = null; return; }
  probeReadout.style.display = 'block';
  probeReadout.style.left = `${pr.sx.toFixed(1)}px`;
  probeReadout.style.top = `${pr.sy.toFixed(1)}px`;
  /* An unmeasured cell REFUSES a number rather than printing 0%. Zero is a win rate; absent is not, and the
     whole surface is built on keeping those apart. */
  const head = probeMoves === 0 ? 'PEAK' : 'PROBE';
  const value = v === null
    ? '<span style="font:700 15px/1.1 system-ui,sans-serif;color:#6B7A99">NOT MEASURED</span>'
    : `<span style="font:700 19px/1.1 system-ui,sans-serif;color:#fff">${(v * 100).toFixed(0)}%</span>`;
  probeReadout.innerHTML =
    `<div style="font:600 9.5px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">${head}</div>`
    + `<div>${value}</div>`
    + `<div style="font:400 10px/1.3 system-ui,sans-serif;color:rgba(214,226,246,0.8)">`
    + `$${X_TICKS[probeCell.c]}k · ${Y_TICKS[probeCell.r]} d</div>`;
  probeLabel = { sx: Math.round(pr.sx), sy: Math.round(pr.sy) };
};
paintProbe();

/*
 * DRAGGING IT — §2 asks for "a probe you drag across it", and this is the first interaction in the whole
 * programme. Two constraints made it what it is:
 *
 *   1 · §6 RULE 2 FORBIDS IDLE ANIMATION, not interaction. So there is no rAF loop: a pointer event renders
 *       exactly one frame and stops. The page is as still after a drag as before it, which is also what makes
 *       the reduced-motion case need no special path — there is no motion to reduce, only a new still frame.
 *   2 · THE NEAREST CELL IS FOUND BY PROJECTING, not by unprojecting. Casting a ray through the surface would
 *       need an intersection test against 24 quads with holes in them, and would answer "which triangle" when
 *       the question is "which measured cell". Projecting all 42 grid points and taking the closest in screen
 *       space is exact for the question asked, cheap at this size, and cannot pick a cell that is not there.
 */
if (MESH_ON && peak) {
  const pick = (clientX: number, clientY: number): { c: number; r: number } | null => {
    const box = canvas.getBoundingClientRect();
    const sx = ((clientX - box.left) / box.width) * CSS_W;
    const sy = ((clientY - box.top) / box.height) * CSS_H;
    let best: { c: number; r: number; d: number } | null = null;
    for (let r = 0; r < NZ; r++) {
      for (let c = 0; c < NX; c++) {
        const v = probeValueAt(c, r);
        const [x, , z] = worldAt(c, r);
        const pr = projectScreen(vpFinal, [x, v === null ? SURF_Y : yOfValue(v), z], CSS_W, CSS_H);
        if (pr.behind) continue;
        const d = Math.hypot(pr.sx - sx, pr.sy - sy);
        if (!best || d < best.d) best = { c, r, d };
      }
    }
    /* A pick further than 90 px from every grid point is a click on the deck, not on the surface. Moving the
       probe to the nearest cell anyway would teleport it across the sheet for a click that missed. */
    return best && best.d <= 90 ? { c: best.c, r: best.r } : null;
  };

  const moveTo = (clientX: number, clientY: number): void => {
    const hit = pick(clientX, clientY);
    if (!hit || (hit.c === probeCell.c && hit.r === probeCell.r)) return;
    probeCell = hit;
    probeMoves += 1;
    frame();
    paintProbe();
  };

  canvas.style.cursor = 'crosshair';
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    moveTo(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointermove', (e) => {
    /* Only while a button is held. A probe that followed the bare cursor would change the reading every time
       the pointer crossed the frame on its way somewhere else. */
    if (e.buttons === 0) return;
    moveTo(e.clientX, e.clientY);
  });
  /* Keyboard equivalent, because a drag that is the only way to move the probe makes the reading unavailable
     to anyone not using a mouse — and rule 4 keeps text in the DOM for exactly that reader. */
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Win-rate surface. Arrow keys move the probe between measured cells.');
  canvas.addEventListener('keydown', (e) => {
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const d = step[e.key];
    if (!d) return;
    e.preventDefault();
    const c = Math.max(0, Math.min(NX - 1, probeCell.c + d[0]));
    const r = Math.max(0, Math.min(NZ - 1, probeCell.r + d[1]));
    if (c === probeCell.c && r === probeCell.r) return;
    probeCell = { c, r };
    probeMoves += 1;
    frame();
    paintProbe();
  });
}

/*
 * EVERY RIBBON CARRIES ITS VALUE — and without this the contours were the weaker half of the feature.
 *
 * The first capture drew six iso-lines and named none of them. A contour with no value is a line: it says the
 * surface changes here, which the shading already said. §2's justification for ribbons is that they answer
 * "which bands clear 60%", and that question needs the 60 printed on the line. Six pale curves are a texture.
 *
 * One label per drawn level, on the segment whose midpoint sits highest up-frame — the far side of the ridge,
 * where a label has surface behind it rather than sky, so it reads without a plate behind it. Screen-parallel
 * via `projectScreen` rather than laid on the surface with `projectQuad`: this annotates the surface, it is not
 * content on it, which is the distinction the title plate settled a hundred lines below.
 */
const contourLabels = contours.levelsDrawn.map((level) => {
  const mine = contours.segments.filter((sg) => sg.level === level);
  let best: { sx: number; sy: number } | null = null;
  for (const sg of mine) {
    const mid = surfaceAt((sg.from[0] + sg.to[0]) / 2, (sg.from[1] + sg.to[1]) / 2);
    const pr = projectScreen(vpFinal, [mid[0], mid[1] + SURF_Y + 0.012, mid[2]], CSS_W, CSS_H);
    if (pr.behind || pr.sx < 24 || pr.sx > CSS_W - 24 || pr.sy < 16 || pr.sy > CSS_H - 16) continue;
    /* Highest up-frame = smallest sy. That is the far side of the surface, which is where a label has the
       sheet behind it instead of the sky. */
    if (!best || pr.sy < best.sy) best = { sx: pr.sx, sy: pr.sy };
  }
  if (!best) return { level, drawn: false };
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;left:${best.sx.toFixed(1)}px;top:${best.sy.toFixed(1)}px;`
    + 'transform:translate(-50%,-50%);font:600 10px/1 ui-monospace,monospace;letter-spacing:.06em;'
    + 'color:#DCE9FF;text-shadow:0 0 3px rgba(4,6,11,0.95),0 0 6px rgba(4,6,11,0.8);white-space:nowrap';
  /* The unit, not the raw fraction. `0.6` on a win-rate surface is a number the reader has to convert; 60%
     is the number they asked about. */
  el.textContent = `${Math.round(level * 100)}%`;
  overlay.appendChild(el);
  return { level, drawn: true, sx: Math.round(best.sx), sy: Math.round(best.sy) };
});

/*
 * THE TITLE — PROJECTED ONLY IF IT WOULD BE LEGIBLE, and it is NOT legible here.
 *
 * The first version put the title on the plinth's front face with `projectQuad`, reusing E1's
 * mechanism because it was there. The capture is the argument against it: at azimuth 38° that face is
 * nearly edge-on, so a 16 cm strip projected to about 20 px of screen height running diagonally
 * across the corner. The transform was correct — `perspectiveX` of -339 says so — and the result was
 * unreadable. A correct transform is not the same as a legible one.
 *
 * So legibility is MEASURED and the fallback is screen space. The test is the projected height of the
 * plate's shorter vertical edge: below the point where 13 px type fits, the plate loses and a
 * screen-parallel title wins. Reported either way, so a future camera that DOES present that face
 * gets the projected plate back without anyone remembering to re-enable it.
 *
 * This is the same judgement the tick labels make, arrived at from the opposite direction: content
 * belongs ON a surface, annotation belongs in front of it, and which one a title is depends on
 * whether the surface is facing you.
 */
const plateCorners = (() => {
  const zf = SURF_D / 2 + 0.25;
  const hw = (SURF_W + 0.5) / 2 - 0.18;
  return {
    topLeft: [-hw, PLINTH_H - 0.022, zf + 0.002] as [number, number, number],
    topRight: [hw, PLINTH_H - 0.022, zf + 0.002] as [number, number, number],
    bottomRight: [hw, 0.024, zf + 0.002] as [number, number, number],
    bottomLeft: [-hw, 0.024, zf + 0.002] as [number, number, number],
  };
})();
const PLATE_PX = [Math.round(2 * ((SURF_W + 0.5) / 2 - 0.18) * 190), Math.round((PLINTH_H - 0.046) * 190)];

const MIN_PLATE_PX = 26;
const plate = projectQuad(vpFinal, plateCorners, CSS_W, CSS_H, PLATE_PX[0]!, PLATE_PX[1]!);
const plateHeightPx = isQuadRefusal(plate) ? 0 : Math.min(
  Math.hypot(plate.screen[0]!.x - plate.screen[3]!.x, plate.screen[0]!.y - plate.screen[3]!.y),
  Math.hypot(plate.screen[1]!.x - plate.screen[2]!.x, plate.screen[1]!.y - plate.screen[2]!.y),
);
const titleProjected = !isQuadRefusal(plate) && plate.signedArea > 0 && plateHeightPx >= MIN_PLATE_PX;

const TITLE_HTML =
  `<span style="font:600 13px/1 ui-monospace,monospace;letter-spacing:.13em;color:rgba(233,240,255,0.92)">`
  + `WIN RATE · TICKET SIZE × DAYS TO CLOSE</span>`
  + `<span style="font:500 12px/1 ui-monospace,monospace;color:rgba(160,184,224,0.82)">`
  + `n=${flat.frame.cellsDrawn}/${flat.frame.cellsTotal} CELLS</span>`;

if (titleProjected && !isQuadRefusal(plate)) {
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;left:0;top:0;width:${PLATE_PX[0]}px;height:${PLATE_PX[1]}px;`
    + `transform-origin:0 0;transform:${plate.transform};display:flex;align-items:center;`
    + 'justify-content:space-between;padding:0 6px;overflow:hidden;-webkit-font-smoothing:antialiased';
  el.innerHTML = TITLE_HTML;
  overlay.appendChild(el);
} else {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:16px;bottom:16px;display:flex;flex-direction:column;gap:5px';
  el.innerHTML = TITLE_HTML;
  overlay.appendChild(el);
}

/* THE ENGINE'S OWN NOTICES, printed. `VALUES_ARE_PLACEHOLDERS` is in this list, which is what stops
   the capture being the lie §6 rule 8 is about. A harness that computed notices and did not show
   them would be strictly worse than one that never computed them, because the omission would look
   like an absence of problems. */
const noticeBox = document.createElement('div');
noticeBox.style.cssText = 'position:absolute;left:16px;top:14px;max-width:340px;display:flex;'
  + 'flex-direction:column;gap:5px';
noticeBox.innerHTML = flat.notices.map((n) => (
  `<div style="font:500 10.5px/1.4 ui-monospace,monospace;letter-spacing:.04em;`
  + `color:${n.code === 'VALUES_ARE_PLACEHOLDERS' ? '#E0A94A' : 'rgba(150,176,220,0.85)'}">`
  + `${n.code}</div>`
)).join('');
overlay.appendChild(noticeBox);

/* The legend for the three states, because a hole and a marker plate are only self-explanatory to
   the person who built them. */
const legend = document.createElement('div');
legend.style.cssText = 'position:absolute;right:16px;bottom:14px;display:flex;flex-direction:column;'
  + 'gap:6px;align-items:flex-end;font:500 10.5px/1 ui-monospace,monospace;letter-spacing:.05em';
legend.innerHTML = [
  ['#2C6BFF', `OBSERVED · ${field.cellsDrawn} cells`],
  ['#C98A2B', `WITHHELD · ${withheldPoints} points`],
  ['transparent', `ABSENT · ${absentPoints} points (holed)`],
/*
 * `forced-color-adjust:none` ON THE SWATCHES ONLY, measured rather than assumed.
 *
 * WHAT WENT WRONG: under `forced-colors: active` the browser replaces every author colour. Measured with
 * `newPage({forcedColors:'active'})`, OBSERVED `#2C6BFF` and WITHHELD `#C98A2B` BOTH computed to
 * `rgb(255,255,255)` — two states, one white square, and the ABSENT swatch went transparent-white with
 * them. The canvas is a bitmap and is untouched, so the surface kept its blue cells and its amber marker
 * plates while the key that maps those colours to states became indistinguishable.
 *
 * WHY ONLY HERE: a swatch is a SAMPLE of a colour the renderer actually produces, which is one of the
 * narrow cases where the author's colour has to win over the forced palette. The label text beside it
 * keeps its forced colours, and every state is still named in words, so nothing depends on hue alone.
 */
].map(([c, t]) => (
  `<div style="display:flex;align-items:center;gap:7px;color:rgba(196,212,240,0.85)">`
  + `<span>${t}</span>`
  + `<span style="width:11px;height:11px;background:${c};`
  + `${c === 'transparent' ? 'border:1px dashed rgba(196,212,240,0.55)' : ''};display:inline-block;`
  + `forced-color-adjust:none"></span></div>`
)).join('');
overlay.appendChild(legend);

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE REPORT — and the assertion that makes this a promotion rather than a second opinion.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * `agreesWithFlat` compares the mesh's cell accounting against the SHIPPING engine's, from the same
 * input. If it is ever false, one of the two surfaces is showing data the other is not, and it does
 * not matter in the slightest which one is prettier. Every other number here describes the render;
 * this one describes whether the render is entitled to exist.
 */
const agreement = {
  cellsTotal: [flat.frame.cellsTotal, (NX - 1) * (NZ - 1)],
  cellsDrawn: [flat.frame.cellsDrawn, field.cellsDrawn],
  cellsHoles: [flat.frame.cellsHoles, field.cellsHoles],
  pointsAbsent: [flat.frame.pointsAbsent, absentPoints],
  pointsWithheld: [flat.frame.pointsWithheld, withheldPoints],
};
const agreesWithFlat = Object.values(agreement).every(([a, b]) => a === b);

/* Read ONCE, before the report, because two call sites for the same string is two chances for the
   refusal below to key off something different from what is printed. */
const RENDERER = (() => {
  const d = gl.getExtension('WEBGL_debug_renderer_info');
  return d ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : 'unknown';
})();
/* Matched on the driver's own words. SwiftShader and llvmpipe are the two software rasterisers a
   headless capture actually lands on; anything else is treated as hardware, which is the safe
   direction to be wrong in — a hardware machine wrongly called software loses a number, whereas
   software wrongly called hardware publishes a fictional budget. */
const SOFTWARE = /swiftshader|llvmpipe|software/i.test(RENDERER);

/*
 * §6 RULE 5 — "Brand hex exact. `assertBrandFidelity` runs on every new material."
 *
 * It ran on NO material. An audit found the call absent from all six environments, so every claim any
 * of them made about brand-exactness rested on the palette having been correct at some point in the
 * past, in a different file.
 *
 * What it checks is the round trip: each `BRAND_HEX` entry, taken to linear and back through this
 * pipeline's single tone map and sRGB encode, must return its own hex. That is worth running per
 * harness rather than once in a unit test, because a harness is where a SECOND tone map gets
 * introduced — the composite in this file encodes once, and any environment that added another would
 * shift every brand colour by a fraction too small to see and too large to be exact.
 *
 * It DIES rather than warns. A frame that has silently moved the brand blue is worse than no frame,
 * because it will be screenshotted into a deck.
 */
const brandFailures = assertBrandFidelity();
if (brandFailures.length > 0) {
  const msg = 'BRAND FIDELITY FAILED — '
    + brandFailures.map((f) => `${f.key}: expected ${f.expected}, got ${f.actual}`).join('; ');
  document.title = 'REFUSED';
  const logEl = document.getElementById('log');
  if (logEl) logEl.textContent = msg;
  throw new Error(msg);
}

const report = {
  /* WHAT THE RIBBONS ACTUALLY DREW. `levelsEmpty` is the honest half: a level outside the observed range is
     named rather than dropped, because a legend listing a contour nobody drew is a legend that lies. */
  contours: CONTOURS_ON,
  contourLevels: CONTOUR_LEVELS,
  contourLevelsDrawn: contours.levelsDrawn,
  contourLevelsEmpty: contours.levelsEmpty,
  contourSegments: contours.segments.length,
  contourCellsSkippedAbsent: contours.cellsSkippedAbsent,
  /* A ribbon whose label could not be placed is REPORTED. An unlabelled contour is a line, not a reading, so
     an unplaceable label is a partial loss of the feature rather than a cosmetic miss. */
  contourLabels,
  contourLabelsUnplaced: contourLabels.filter((l) => !l.drawn).map((l) => l.level),
  /* A clamped parameter is REPORTED, so the resolution in this report cannot silently disagree
     with what the reader asked for. */
  paramClamps,
  /* WHICH TIER THIS FRAME IS, so the numbers beside it describe a configuration a reader can reconstruct.
     A tier that cannot be reported is a tier that cannot be trusted. */
  tier: Q.tier,
  tierDprScale: Q.dprScale,
  /* The tier SCALES this environment's own baseline (1536) rather than replacing it — the
     ladder must not change what the frame looks like at its highest tier. */
  tierShadowMapSize: shadowMapSizeFor(TIER, 1536),
  shadowBaseline: 1536,
  /* Empty means every brand hex round-tripped exactly through this frame's own pipeline. */
  brandFidelity: brandFailures,
  ao: AO_ON,
  mesh: MESH_ON,
  hdr: stage.hdr,
  eye: eye.map((v) => Number(v.toFixed(2))),
  /* THE HEADLINE. A false here invalidates the frame regardless of how it looks. */
  agreesWithFlat,
  agreement,
  observedRange: range ? range.map((v) => Number(v.toFixed(3))) : null,
  peak: peak ? { value: peak.v, ticket: X_TICKS[peak.c], days: Y_TICKS[peak.r] } : null,
  /* THE PROBE IS INTERACTIVE, and the report says so with the state to prove it: which cell it is on, how many
     times it has moved, and whether that cell has a measurement at all. */
  /*
   * A GETTER, NOT A SNAPSHOT — and this is the bug the drag capture caught.
   *
   * Every other field in this report describes a frame that has already been drawn and will not change, so a
   * plain value is right for them. The probe is the first thing in this programme that MOVES after the report
   * exists, and a snapshot of it is frozen at module evaluation: the drag worked, the readout on the frame
   * updated, and `globalThis.E5.probe.moves` stayed 0 for ever. The capture asserted on the report and
   * therefore reported that dragging did nothing, while the picture showed it working.
   *
   * A static report cannot describe an interactive surface. `JSON.stringify` invokes getters, so the printed
   * log and a live read both see current state.
   */
  get probe() {
    return {
      interactive: MESH_ON && !!peak,
      cell: [probeCell.c, probeCell.r],
      ticket: X_TICKS[probeCell.c] ?? null,
      days: Y_TICKS[probeCell.r] ?? null,
      value: probeValueAt(probeCell.c, probeCell.r),
      moves: probeMoves,
      keyboard: true,
    };
  },
  probeLabel,
  /* Ticks are only useful if they are ON the frame. A tick behind the eye projects to a perfectly
     plausible pixel, so `behind` is reported rather than assumed false. */
  ticksOffFrame: [...xTickLabels, ...yTickLabels].filter((t) => (
    t.behind || t.sx < 0 || t.sx > CSS_W || t.sy < 0 || t.sy > CSS_H
  )).length,
  notices: flat.notices.map((n) => n.code),
  /* WHICH TITLE WON, and the measurement that decided it. `projected` with a small height would be
     a correct transform producing unreadable text, which is why the number is reported next to the
     mode rather than instead of it. */
  title: {
    mode: titleProjected ? 'projected' : 'screen',
    plateHeightPx: Number(plateHeightPx.toFixed(1)),
    minPlatePx: MIN_PLATE_PX,
    refusal: isQuadRefusal(plate) ? plate.refusal : null,
    perspectiveX: isQuadRefusal(plate) ? null : Number((plate.matrix[6]! * 1000).toFixed(3)),
  },
  glError: gl.getError(),
  triangles: tris,
  surfaceTriangles: MESH_ON && surfMesh ? field.cellsDrawn * 2 : 0,
  shadowMap: shadow.size,
  resolution: `${W}x${H}`,
  dprScale: SCALE,
  frames: FRAMES,
  msPerFrame: Number(ms.toFixed(3)),
  fps: Math.round(1000 / ms),
  /*
   * HEADROOM REFUSES ON A SOFTWARE RASTERISER, and reporting it was the second half of the same
   * mistake as the broken timer.
   *
   * SwiftShader is a CPU rasteriser. Comparing its frame time to a 60 Hz budget is not a
   * conservative estimate of anything — it measures a machine nobody ships on, and the ratio to real
   * hardware is not a constant (E0 measured 1.305 ms on an M1 for a scene SwiftShader takes tens of
   * milliseconds over). So the budget comparison is REFUSED with a code rather than computed, exactly
   * as absent data refuses everywhere else in this codebase.
   *
   * The frame time itself is still reported, because it IS a real measurement — of SwiftShader.
   */
  renderer: RENDERER,
  rendererClass: SOFTWARE ? 'software' : 'hardware',
  headroom: SOFTWARE ? null : Number((16.6 - ms).toFixed(3)),
  headroomRefusal: SOFTWARE ? 'SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET' : null,
  /* Real-hardware timing for this environment is UNMEASURED. E0's and E8's M1 figures came from
     manual browser sessions on real hardware; this harness has only ever run under SwiftShader. */
  hardwareMsPerFrame: null,
};
(globalThis as unknown as { E5: typeof report }).E5 = report;
log.textContent = JSON.stringify(report, null, 2);
frame();
/* AFTER the final frame. The failure mode of this ordering is a visible flat surface under a working
   canvas, which is loud and self-announcing — the right direction for a fallback to fail in. */
fallback.markRendered();
document.title = 'READY';
