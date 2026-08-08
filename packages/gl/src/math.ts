/**
 * L1 · MATH — column-major 4×4 matrices and the small vector algebra a renderer needs.
 *
 * Column-major, `Float32Array`, laid out the way `gl.uniformMatrix4fv(..., false, m)`
 * expects. No transpose flag anywhere in this package: a `transpose` argument is a place
 * for two mistakes to cancel out in one view and not in another.
 *
 * Everything here is pure and testable in Node. That matters — the GL binding layer
 * cannot be unit tested without a context, so the arithmetic has to be separable from
 * it, and the arithmetic is where projection bugs actually live.
 */

export type Vec3 = readonly [number, number, number];
export type Mat4 = Float32Array;

export const IDENTITY = (): Mat4 =>
  new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** `a` then `b` — i.e. returns b·a in the usual maths order. */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + j]! * b[i * 4 + k]!;
      o[i * 4 + j] = s;
    }
  }
  return o;
}

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Normalise. A zero-length vector returns itself rather than NaN — see `lookAt`. */
export function normalise(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l === 0 ? a : [a[0] / l, a[1] / l, a[2] / l];
}

/**
 * Right-handed perspective, looking down −z.
 *
 * `fovY` is in RADIANS and is deliberately SMALL for data work — 0.205 rad (≈11.7°) at
 * the P0 camera, against a photographic 50°.
 *
 * The mechanism is worth stating exactly, because the loose version is wrong. At a FIXED
 * depth, perspective is already exactly linear in x: `w` is constant across the row, so
 * equal steps along the value axis project to equal screen steps at any fov. The
 * distortion lives on DEPTH — screen scale goes as 1/w — and that ratio is set by
 * `depth ÷ camera distance`. A narrow fov is what lets the camera sit far away and still
 * fill the frame. The fov is the means; the distance is the mechanism. Pinned in
 * `math.test.ts`.
 */
export function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const t = 1 / Math.tan(fovY / 2);
  return new Float32Array([
    t / aspect, 0, 0, 0,
    0, t, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ]);
}

/** True orthographic, for surfaces where any perspective at all would be a lie. */
export function orthographic(
  left: number, right: number, bottom: number, top: number, near: number, far: number,
): Mat4 {
  const w = right - left, h = top - bottom, d = far - near;
  return new Float32Array([
    2 / w, 0, 0, 0,
    0, 2 / h, 0, 0,
    0, 0, -2 / d, 0,
    -(right + left) / w, -(top + bottom) / h, -(far + near) / d, 1,
  ]);
}

/**
 * View matrix.
 *
 * KEEP THE EYE ON AXIS unless you have a reason not to. An eye offset laterally from the
 * target tilts every horizontal in screen space — measured in P0 pass 4, where it turned
 * a row of tick labels into a slope and the fix was thought to be a text-layout problem
 * for two iterations. Elevation alone gives the depth read; lateral offset only costs
 * alignment.
 *
 * A degenerate basis (eye at target, or `up` parallel to the view direction) yields a
 * matrix that projects everything to one point. This returns identity in that case
 * instead of a `Float32Array` of NaN, because NaN propagates into a blank canvas with no
 * error, and identity at least renders something a human recognises as wrong.
 */
export function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const z = normalise(sub(eye, target));
  const xRaw = cross(up, z);
  if (Math.hypot(xRaw[0], xRaw[1], xRaw[2]) < 1e-8) return IDENTITY();
  const x = normalise(xRaw);
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}

/** Normalised device coordinates after `m`. `w` is returned so callers can detect clipping. */
export function projectNdc(m: Mat4, p: Vec3): { x: number; y: number; z: number; w: number } {
  const c = [0, 1, 2, 3].map(
    (r) => m[0 * 4 + r]! * p[0] + m[1 * 4 + r]! * p[1] + m[2 * 4 + r]! * p[2] + m[3 * 4 + r]!,
  );
  const w = c[3]!;
  return { x: c[0]! / w, y: c[1]! / w, z: c[2]! / w, w };
}

/**
 * Project to SCREEN pixels, y down — the coordinate space DOM overlays live in.
 *
 * This exists because L2 renders type as DOM rather than baking it into a GL texture
 * (`3D_WORK_100X.md` §4: canvas text at 1× is a classic tell), and a DOM label that is
 * positioned by a hand-written copy of the projection drifts from the geometry it
 * labels. There is one projection; overlays use this.
 */
export function projectScreen(
  m: Mat4, p: Vec3, widthCss: number, heightCss: number,
): { sx: number; sy: number; behind: boolean } {
  const n = projectNdc(m, p);
  return {
    sx: (n.x * 0.5 + 0.5) * widthCss,
    sy: (1 - (n.y * 0.5 + 0.5)) * heightCss,
    behind: n.w <= 0,
  };
}

/**
 * World units per NDC-y unit at a given world point.
 *
 * Needed because instanced billboards are expanded in CLIP space (so they stay circular
 * and screen-sized), which leaves the fragment stage with no idea where a world-space
 * plane like the floor is. Measuring the scale here and passing it as a uniform is what
 * lets a point cloud REST on its baseline instead of bleeding through it — P0 pass 4.
 *
 * Measured, not assumed: it samples the actual matrix rather than deriving from `fovY`,
 * so it stays correct under an orthographic projection too.
 */
export function worldPerNdcY(m: Mat4, at: Vec3, probe = 0.2): number {
  const a = projectNdc(m, at).y;
  const b = projectNdc(m, [at[0], at[1] + probe, at[2]]).y;
  const d = b - a;
  return d === 0 ? 0 : probe / d;
}
