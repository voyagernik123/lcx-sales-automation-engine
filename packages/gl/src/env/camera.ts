import { type Mat4, type Vec3, lookAt, multiply, perspective, orthographic, normalise, sub } from '../math.js';

/**
 * L1.6 · CAMERA — an orbit rig, and the light rig that has to agree with it.
 *
 * ── WHY THE CAMERA IS A DECLARATION AND NOT A METHOD CALL ────────────────────────────
 * A `Viewpoint` is plain numbers, so the whole rig is a pure function of it: `viewProjection`
 * has no internal state, no accumulated drift, and can be unit-tested without a GPU. Every
 * previous camera in this repo was a matrix built inline at the call site, which is why
 * `renderMotion.ts` is the only file in the web app with a 3-D camera and why nothing could
 * share one.
 *
 * ── THE DEGENERACY IS REFUSED, NOT CLAMPED SILENTLY ─────────────────────────────────
 * At elevation ±90° the view direction is parallel to the up vector and `lookAt` produces a
 * matrix full of NaN — every vertex vanishes and the screen goes black with no error, which is
 * exactly the failure mode that cost a day at P0. W4 clamped the azimuth slider to 8..82° for
 * this reason. Here the clamp lives in the rig instead of in each UI that drives it, because a
 * constraint enforced at the widget is a constraint one new widget away from being gone.
 */

export interface Viewpoint {
  /** Where the camera looks AT, in world units. */
  readonly target: Vec3;
  /** Distance from target. */
  readonly distance: number;
  /** Degrees around Y. 0 looks down -Z. */
  readonly azimuthDeg: number;
  /** Degrees above the horizon. Clamped to ±ELEVATION_LIMIT. */
  readonly elevationDeg: number;
  /** Vertical field of view in degrees. */
  readonly fovDeg?: number;
  readonly near?: number;
  readonly far?: number;
}

/**
 * How close to straight down the rig will go.
 *
 * 89° rather than 90°: the matrix is well-conditioned right up to the pole, but a viewpoint
 * exactly ON it has no defined azimuth, so a user dragging through it sees the scene spin.
 * One degree of margin costs nothing visually and removes a whole class of "it jumped".
 */
export const ELEVATION_LIMIT = 89;

const RAD = Math.PI / 180;

/** Camera position derived from the orbit parameters. Exposed because lighting needs it too. */
export function eyeOf(v: Viewpoint): Vec3 {
  const el = Math.max(-ELEVATION_LIMIT, Math.min(ELEVATION_LIMIT, v.elevationDeg)) * RAD;
  const az = v.azimuthDeg * RAD;
  const d = Math.max(1e-4, v.distance);
  const y = Math.sin(el) * d;
  const r = Math.cos(el) * d;
  return [
    v.target[0] + Math.sin(az) * r,
    v.target[1] + y,
    v.target[2] + Math.cos(az) * r,
  ];
}

/**
 * The combined view-projection matrix.
 *
 * `far` defaults to distance × 8 rather than a constant: a fixed far plane either clips a
 * pulled-back camera or wastes most of the depth buffer's precision on empty space in front
 * of a close one, and shadow acne is a depth-precision symptom before it is a bias problem.
 */
/**
 * The near and far planes `viewProjection` will actually use for this viewpoint.
 *
 * Exists because every consumer of the DEPTH BUFFER has to linearise it, and linearising with different
 * constants from the ones the projection was built with is silently wrong. E5 passed ambient occlusion
 * `near 0.1, far 60` while its own projection resolved to `0.085` and `68` — so the reconstructed
 * view-space depth was off, and therefore the world-space radius the occlusion was gathered over was off
 * too. Nothing errors. The AO simply describes a slightly different scene from the one on screen, and it
 * reads as the strength being mistuned.
 *
 * E6 had it, E7's volumetric depth cap needs it, and each of them had hand-written a different pair. One
 * function, so they agree by CONSTRUCTION rather than by everyone remembering the same two numbers.
 */
export function nearFarOf(v: Viewpoint): { near: number; far: number } {
  /* Deliberately the identical expressions used below. If one changes, this must change with it — which
     is why they sit adjacent rather than in separate files. */
  const near = v.near ?? Math.max(0.01, v.distance / 100);
  const far = v.far ?? Math.max(near + 1, v.distance * 8);
  return { near, far };
}

export function viewProjection(v: Viewpoint, aspect: number): Mat4 {
  const eye = eyeOf(v);
  const near = v.near ?? Math.max(0.01, v.distance / 100);
  const far = v.far ?? Math.max(near + 1, v.distance * 8);
  const proj = perspective((v.fovDeg ?? 38) * RAD, Math.max(1e-3, aspect), near, far);
  const view = lookAt(eye, v.target, [0, 1, 0]);
  return multiply(proj, view);
}

export interface DirectionalLight {
  /** Direction the light TRAVELS, world space. Normalised on use. */
  readonly direction: Vec3;
  /** Radiance, linear. Not clamped — this feeds an HDR target on purpose. */
  readonly colour: readonly [number, number, number];
  /** Half-extent of the orthographic shadow frustum, world units. */
  readonly extent?: number;
}

/**
 * The light's view-projection, for rendering the shadow map.
 *
 * ORTHOGRAPHIC, because a directional light has no position — only a direction — and a
 * perspective shadow frustum for one would concentrate resolution somewhere arbitrary. The
 * light is placed far enough back along its own direction to contain the scene, and `extent`
 * sizes the frustum: too large wastes texels and produces blocky shadows, too small clips them
 * mid-floor, which reads as a rendering bug rather than as a missing shadow.
 */
export function lightViewProjection(light: DirectionalLight, centre: Vec3, radius: number): Mat4 {
  const dir = normalise(light.direction);
  const extent = light.extent ?? Math.max(0.1, radius * 1.35);
  // Stand off by 2× the radius so nothing in the scene lands behind the light's near plane.
  const back = Math.max(1, radius * 2);
  const eye: Vec3 = [centre[0] - dir[0] * back, centre[1] - dir[1] * back, centre[2] - dir[2] * back];
  /* An up vector parallel to the light direction is the same NaN trap as the camera pole. A
     light pointing straight down is the single most common case, so this is not hypothetical. */
  const up: Vec3 = Math.abs(dir[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0];
  const view = lookAt(eye, centre, up);
  const proj = orthographic(-extent, extent, -extent, extent, 0.01, back + radius * 2 + extent);
  return multiply(proj, view);
}

/** Bounding-sphere radius of an AABB — what the shadow frustum has to contain. */
export function boundsRadius(min: readonly [number, number, number], max: readonly [number, number, number]): number {
  const d = sub([max[0], max[1], max[2]], [min[0], min[1], min[2]]);
  return Math.hypot(d[0], d[1], d[2]) / 2;
}

/** Centre of an AABB. */
export function boundsCentre(min: readonly [number, number, number], max: readonly [number, number, number]): Vec3 {
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
}
