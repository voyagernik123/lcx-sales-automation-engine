/**
 * P1 · THE SPINE GATE — S1's risk cloud, rebuilt on `@lcx/gl` and nothing else.
 *
 * P0 proved a picture. P1 has to prove the SPINE, and the only honest proof is that the
 * proven picture comes back out of it — this file is the P0 spike with every line of
 * WebGL removed and replaced by a call into the package. If the capture regresses, the
 * spine is wrong; if it holds, L1–L3 are real.
 *
 * It is also the first L4 lane, and it is written to the contract nine lanes will share
 * (`3D_WORK_100X.md` §3): it imports from `@lcx/gl` and from nowhere else, it never
 * touches a `WebGL*` symbol, and it never makes a colour decision the palette has not
 * already made. Anything it cannot express is a SPINE REQUEST, not a local workaround.
 *
 * Two things it deliberately does NOT do, both of which would be easy:
 *   - it does not jitter x to smooth the cloud (that fabricates outcomes), and
 *   - it does not tone map its own colours (that is §4.1's brand-fidelity trap).
 */

import {
  createStage, isStage, createPointCloud, createLineBatch, createPipeline,
  beginAdditive, endPass, perspective, lookAt, multiply, projectScreen,
  BRAND, BRAND_HEX, exposure, hexToLinear,
  type Stage, type Mat4, type StageRefusal,
} from '@lcx/gl';

export interface Samples {
  /** ASCENDING, in cents, straight from `monteCarloForecast({ keepSamples: true })`. */
  readonly samples: readonly number[];
  readonly p10: number;
  readonly p50: number;
  readonly p90: number;
}

/* Plot box, in world units. FLOOR is the baseline the cloud rests ON, not through. */
const X0 = -1.52, X1 = 1.52, XW = X1 - X0, FLOOR = -0.50, TOP = 1.02;
/* The top of the plate is a HEADER BAND for the marker labels. Letting the curve use the
   full height forced P0 pass 5 to clamp the p50 label down onto its own cap. */
const ENVELOPE_SCALE = 0.76;
const STACK_SCALE = 0.70;
/* Kernel bandwidth as a fraction of the range. A MODELLING CHOICE, so it is printed in
   the legend rather than hidden — the data does not choose it for you. */
export const BANDWIDTH_FRACTION = 0.016;
const TICKS = 8;

export interface RenderResult {
  readonly distinct: number;
  readonly hdr: boolean;
  readonly maxCount: number;
}

export function renderRiskCloud(
  canvas: HTMLCanvasElement,
  overlay: HTMLElement,
  data: Samples,
): RenderResult | StageRefusal {
  const stage = createStage(canvas);
  if (!isStage(stage)) return stage;

  const S = data.samples, N = S.length;
  const lo = S[0]!, hi = S[N - 1]!, span = (hi - lo) || 1;

  const counts = new Map<number, number>();
  for (const v of S) counts.set(v, (counts.get(v) ?? 0) + 1);
  const maxCount = Math.max(...counts.values());

  /* ── sample geometry ─────────────────────────────────────────────────────────────
     x is the exact simulated value. y is the exact rank within its stack. z is a hashed
     offset — the ONLY randomised quantity in the frame, and it lives on the one axis
     that carries no data. A deterministic sequence here (a golden-angle walk was the
     first attempt) is regular, and a regular sequence on a pixel grid aliases into a
     visible lattice. */
  const centres = new Float32Array(N * 3);
  const attributes = new Float32Array(N * 2);
  const seen = new Map<number, number>();
  const hash = (n: number) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let i = 0; i < N; i++) {
    const v = S[i]!, k = seen.get(v) ?? 0;
    seen.set(v, k + 1);
    const c = counts.get(v)!;
    centres[i * 3] = X0 + ((v - lo) / span) * XW;
    centres[i * 3 + 1] = FLOOR + (k / maxCount) * (TOP - FLOOR) * STACK_SCALE;
    centres[i * 3 + 2] = (hash(i * 1.37 + k * 0.61) * 2 - 1) * 0.34;
    attributes[i * 2] = Math.min(1, c / maxCount);
    attributes[i * 2 + 1] = k / Math.max(1, (c - 1) || 1);
  }

  /* ── density envelope ── */
  const bandwidth = BANDWIDTH_FRACTION * span, M = 420;
  const density = new Float32Array(M + 1);
  for (let j = 0; j <= M; j++) {
    const x = lo + (j / M) * span;
    let s = 0;
    for (const [v, c] of counts) {
      const d = (x - v) / bandwidth;
      if (d > -4.5 && d < 4.5) s += c * Math.exp(-0.5 * d * d);
    }
    density[j] = s;
  }
  const maxDensity = Math.max(...density);
  const envY = (u: number) => FLOOR + u * (TOP - FLOOR) * ENVELOPE_SCALE;
  const densityAt = (v: number) =>
    density[Math.max(0, Math.min(M, Math.round(((v - lo) / span) * M)))]! / maxDensity;

  const cloud = createPointCloud(stage, { centres, attributes, count: N });
  if ('kind' in cloud) return cloud;
  const lines = createLineBatch(stage);
  if ('kind' in lines) return lines;
  const pipeline = createPipeline(stage);
  if ('kind' in pipeline) return pipeline;

  const mvp: Mat4 = multiply(
    perspective(0.205, stage.width / stage.height, 0.1, 60),
    lookAt([0, 0.66, 7.6], [0, 0.17, 0], [0, 1, 0]),
  );

  /* ── PASS 1 · the cloud and its references, into HDR ── */
  const { gl } = stage;
  stage.bindTarget(stage.scene);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  beginAdditive(gl);

  cloud.draw(mvp, {
    size: 0.0205,
    lo: exposure(BRAND.brand, -1.25),
    hi: exposure(BRAND.brandBright, 0.43),
    gain: 0.62,
    floorY: FLOOR,
    // Declared, not inherited. The depth ramp has to match the spread the geometry above
    // actually uses (±0.34), and a surface that leaves it to the package default is
    // shading against a range its samples never occupy.
    depthRange: 0.34,
  });

  const rule = hexToLinear(BRAND_HEX.rule);
  lines.rule(mvp, X0, FLOOR, X1, FLOOR, 0.0020, { colour: rule, gain: 1 });
  for (let i = 0; i <= TICKS; i++) {
    const x = X0 + (i / TICKS) * XW;
    lines.rule(mvp, x, FLOOR, x, FLOOR - 0.030, 0.0016, { colour: rule, gain: 1 });
  }

  // The envelope twice: a wide dim pass for the halo, a hairline for the read. The bloom
  // chain does the rest — which is why the hairline is pushed above 1.0 in exposure
  // rather than being drawn thicker.
  const curve = new Float32Array((M + 1) * 2);
  for (let j = 0; j <= M; j++) {
    curve[j * 2] = X0 + (j / M) * XW;
    curve[j * 2 + 1] = envY(density[j]! / maxDensity);
  }
  lines.curve(mvp, curve, 0.018, { colour: exposure(BRAND.brandBright, -3.55), gain: 1 });
  lines.curve(mvp, curve, 0.0024, { colour: exposure(BRAND.brandBright, 0.63), gain: 1 });

  /* Each marker rises to the density at its OWN value, so the reference meets the mass
     it refers to instead of slicing the whole frame. */
  const marks: readonly (readonly [number, string])[] =
    [[data.p10, 'p10'], [data.p50, 'p50'], [data.p90, 'p90']];
  const markTop = (v: number) => envY(densityAt(v)) + 0.115;
  for (const [v] of marks) {
    const x = X0 + ((v - lo) / span) * XW, top = markTop(v);
    lines.rule(mvp, x, FLOOR, x, top, 0.0028,
      { colour: BRAND.reference, gain: 1.45, fade: 0.55, fadeFrom: FLOOR, fadeTo: top });
    lines.rule(mvp, x - 0.011, top - 0.003, x + 0.011, top - 0.003, 0.003,
      { colour: BRAND.reference, gain: 2.2 });
  }
  endPass(gl);

  /* ── PASS 2 · L2 resolves it ── */
  pipeline.resolve({ plate: hexToLinear(BRAND_HEX.plate) });

  /* ── SCREEN-SPACE TYPE, projected through the same matrix ───────────────────────
     DOM, not a GL texture: canvas text at 1× is a classic tell (§4). And positioned by
     `projectScreen` rather than by a hand-written copy of the projection, so a label
     cannot drift from the geometry it names. */
  layOutType(stage, overlay, { lo, span, marks, markTop, mvp });

  return { distinct: counts.size, hdr: stage.hdr, maxCount };
}

function money(cents: number): string {
  const k = cents / 100 / 1000;
  return k >= 1000 ? `$${(k / 1000).toFixed(2)}m` : `$${Math.round(k)}k`;
}

function layOutType(
  stage: Stage,
  overlay: HTMLElement,
  o: {
    lo: number; span: number; mvp: Mat4;
    marks: readonly (readonly [number, string])[];
    markTop: (v: number) => number;
  },
): void {
  const { cssWidth: cw, cssHeight: ch } = stage;

  /* One shared y for the whole tick row, offset in SCREEN space from the projected
     baseline. Projecting the offset from world space made the row's distance from the
     rule depend on the camera, and P0 pass 4 pushed it clean off the bottom of the
     plate. Clamped so it can never leave again. */
  const tickY = Math.min(ch - 19, projectScreen(o.mvp, [0, FLOOR, 0], cw, ch).sy + 15);
  for (let i = 0; i <= TICKS; i++) {
    const t = i / TICKS;
    const p = projectScreen(o.mvp, [X0 + t * XW, FLOOR, 0], cw, ch);
    const el = document.createElement('div');
    el.className = 'tick';
    el.style.left = `${Math.min(cw - 30, Math.max(30, p.sx))}px`;
    el.style.top = `${tickY}px`;
    el.textContent = money(o.lo + t * o.span);
    overlay.appendChild(el);
  }

  for (const [v, label] of o.marks) {
    const p = projectScreen(o.mvp, [X0 + ((v - o.lo) / o.span) * XW, o.markTop(v), 0], cw, ch);
    const el = document.createElement('div');
    el.className = 'ptick';
    el.style.left = `${Math.min(cw - 46, Math.max(46, p.sx))}px`;
    el.style.top = `${Math.max(46, p.sy)}px`;
    el.innerHTML = `<b>${label}</b><i>${money(v)}</i>`;
    overlay.appendChild(el);
  }
}

export { money };
