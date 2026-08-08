/**
 * L3 · MOTION — and the two rules that make most of this layer a set of refusals.
 *
 *   1. MOTION CARRIES INFORMATION OR IT DOES NOT EXIST.
 *      `3D_WORK_100X.md` §4 lists "spinning for no reason" as a tell, because it is the
 *      single loudest signal that a 3-D view is decoration. An idle orbit tells the
 *      reader nothing they did not know one frame earlier. Every motion this layer will
 *      start must name the QUESTION it answers, and `IdleMotionError` is thrown for
 *      anything that cannot.
 *
 *   2. `prefers-reduced-motion` IS AN INSTRUCTION, NOT A HINT.
 *      Honouring it by "making it a bit slower" is not honouring it. Under reduced
 *      motion every transition here resolves to its FINAL STATE on the next frame. The
 *      reader sees the same information; they do not see it move.
 *
 * Both rules are enforced in code rather than review, because both are the kind of thing
 * that gets added back by a later "just make it feel more alive" change.
 */

/** Why a motion exists. There is no "because it looks good" member, deliberately. */
export type MotionPurpose =
  /** The data changed and the reader must see WHICH values moved, not just that they did. */
  | 'data-transition'
  /** Geometry is hidden behind other geometry and the camera moves to reveal it. */
  | 'occlusion-resolve'
  /** The reader asked — a drag, a scrub, a click on a legend entry. */
  | 'user-driven'
  /** First paint. Runs once, never loops. */
  | 'entrance';

const PURPOSES: readonly MotionPurpose[] = [
  'data-transition', 'occlusion-resolve', 'user-driven', 'entrance',
];

export class IdleMotionError extends Error {
  constructor(purpose: string) {
    super(
      `Motion refused: ${JSON.stringify(purpose)} is not a purpose. Motion carries information ` +
        `or it does not exist (3D_WORK_100X.md §4). Valid: ${PURPOSES.join(', ')}.`,
    );
    this.name = 'IdleMotionError';
  }
}

export interface MotionSpec {
  readonly purpose: MotionPurpose;
  /** Milliseconds. Ignored entirely under reduced motion. */
  readonly durationMs: number;
  /**
   * Whether this motion may repeat. `true` is only reachable for `user-driven` — a
   * looping data transition would be re-telling the reader the same fact forever, which
   * is the idle-orbit problem wearing a purpose.
   */
  readonly loop?: boolean;
}

export interface MotionEnvironment {
  /** Usually `matchMedia('(prefers-reduced-motion: reduce)').matches`. */
  readonly reducedMotion: boolean;
  /** Monotonic clock, ms. Injected so the whole layer is testable without a browser. */
  now(): number;
}

/** Reads the real environment. Returns `reducedMotion: true` where it cannot tell. */
export function browserMotionEnvironment(): MotionEnvironment {
  const mm = typeof globalThis.matchMedia === 'function'
    ? globalThis.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  return {
    // No matchMedia means we do not KNOW the reader's preference. Defaulting to "they
    // want motion" would be inventing consent; defaulting to reduced costs nothing but
    // an animation.
    reducedMotion: mm ? mm.matches : true,
    now: () => (typeof performance === 'object' ? performance.now() : Date.now()),
  };
}

/**
 * Cubic ease-in-out. Chosen because it is symmetric — a data transition that eases in
 * and snaps out implies a direction the data does not have.
 */
export function easeInOut(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

export interface Tween {
  /** Progress in `[0,1]` at the current time. Always exactly 1 under reduced motion. */
  progress(): number;
  /** Eased progress — what a caller interpolates with. */
  value(): number;
  readonly done: boolean;
  readonly instant: boolean;
}

/**
 * Start a motion. Throws `IdleMotionError` for a purpose outside the enum — including at
 * runtime, so a value that arrives from configuration or an API cannot slip past the
 * type check.
 */
export function startMotion(spec: MotionSpec, env: MotionEnvironment): Tween {
  if (!PURPOSES.includes(spec.purpose)) throw new IdleMotionError(String(spec.purpose));
  if (spec.loop && spec.purpose !== 'user-driven') {
    throw new IdleMotionError(
      `${spec.purpose} may not loop — a repeating transition re-tells the reader the same fact`,
    );
  }

  // REDUCED MOTION RESOLVES TO THE FINAL STATE, immediately. Not slower; not shorter.
  if (env.reducedMotion) {
    return { progress: () => 1, value: () => 1, done: true, instant: true };
  }

  const t0 = env.now();
  const d = Math.max(1, spec.durationMs);
  const raw = () => Math.min(1, (env.now() - t0) / d);
  return {
    progress: raw,
    value: () => easeInOut(raw()),
    get done() { return raw() >= 1; },
    instant: false,
  };
}

/**
 * Interpolate a camera between two framings. The ONE camera motion this layer offers,
 * and it takes a purpose like everything else — there is deliberately no `orbit()`.
 */
export interface Framing {
  readonly eye: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

export function interpolateFraming(a: Framing, b: Framing, t: number): Framing {
  const m = (u: readonly [number, number, number], v: readonly [number, number, number]) =>
    [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t, u[2] + (v[2] - u[2]) * t] as const;
  return { eye: m(a.eye, b.eye), target: m(a.target, b.target) };
}

export const MOTION_POLICY =
  'Motion carries information or it does not exist: it responds to a data change, to occlusion, ' +
  'or to the reader. There is no idle animation. Under prefers-reduced-motion every transition ' +
  'resolves to its final state on the next frame — the same information, without the movement.';
