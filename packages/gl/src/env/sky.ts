import type { Mat4, Vec3 } from '../math.js';
import { normalise, sub, cross } from '../math.js';
import type { Stage, StageRefusal } from '../stage.js';

/**
 * L6 · ENVIRONMENT — and it is the fix for a defect E0 found rather than a decoration.
 *
 * ── WHY A METAL WAS BLACK ────────────────────────────────────────────────────────────
 * E0's sphere at `metalness 0.92` rendered nearly black, and that is CORRECT behaviour for the
 * material: a metal has almost no diffuse lobe, so essentially all of what you see on it is
 * REFLECTED ENVIRONMENT. With no environment there is nothing to reflect. The bug was never in
 * `lit.ts`; it was the absence of this file. Every "why does my metal look like plastic"
 * question in real-time rendering is this one.
 *
 * ── WHY ANALYTIC AND NOT A CUBEMAP ──────────────────────────────────────────────────
 * A cubemap needs six faces to load, decode and mip — bytes, a fetch, and an asset pipeline
 * `3D_VFX_1000X.md` §3.3 deliberately deferred. A three-stop analytic gradient evaluated per
 * fragment costs a handful of instructions, needs no asset, and is exactly right for the
 * environments in §2, which are dark interiors and night skies rather than daylight exteriors.
 * It also means the backdrop and the reflections are the SAME function, so they cannot disagree
 * — a mismatch there is the tell that a scene was assembled rather than lit.
 *
 * ── THE ROUGHNESS TRICK ─────────────────────────────────────────────────────────────
 * A real IBL prefilters the environment per roughness. With an analytic sky there is nothing to
 * prefilter, so roughness instead LERPS the reflection direction toward the surface normal:
 * a mirror samples along R, a rough surface samples closer to N, and the gradient does the
 * blurring for free. Not physically exact, and it produces the right behaviour — highlights
 * that stretch and soften together — for three instructions.
 */

/** Shared by the material and the backdrop, so a reflection can never disagree with the sky. */
/*
 * A three-stop vertical gradient in LINEAR radiance. smoothstep rather than a linear ramp:
 *      a linear blend across a large dark field bands visibly, and the horizon is where the eye is
 *      most sensitive to it.
 */
export const SKY_GLSL = `
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
vec3 skyColour(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 up = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.85, h));
  vec3 dn = mix(uSkyHorizon, uSkyGround, smoothstep(0.0, 0.55, -h));
  return h >= 0.0 ? up : dn;
}`;

export interface SkyOptions {
  readonly zenith?: Vec3;
  readonly horizon?: Vec3;
  readonly ground?: Vec3;
}

/* A dark instrument interior, not a daylight sky. Cool above, a warmer bounce below — the
   horizon lift is what gives a metal an edge to catch. */
export const DEFAULT_SKY = {
  zenith: [0.012, 0.020, 0.052] as Vec3,
  horizon: [0.075, 0.098, 0.155] as Vec3,
  ground: [0.010, 0.011, 0.016] as Vec3,
};

/** Upload the sky uniforms to any program that includes `SKY_GLSL`. */
export function bindSky(gl: WebGL2RenderingContext, program: WebGLProgram, sky: SkyOptions = {}): void {
  const z = sky.zenith ?? DEFAULT_SKY.zenith;
  const h = sky.horizon ?? DEFAULT_SKY.horizon;
  const g = sky.ground ?? DEFAULT_SKY.ground;
  gl.uniform3f(gl.getUniformLocation(program, 'uSkyZenith'), z[0], z[1], z[2]);
  gl.uniform3f(gl.getUniformLocation(program, 'uSkyHorizon'), h[0], h[1], h[2]);
  gl.uniform3f(gl.getUniformLocation(program, 'uSkyGround'), g[0], g[1], g[2]);
}

/*
 * THE BACKDROP RAY IS BUILT FROM THE CAMERA BASIS, NOT AN INVERSE MATRIX.
 *
 * The obvious approach is to unproject a full-screen quad with `inverse(viewProj)`, which needs a
 * 4×4 inverse `math.ts` does not have and which is numerically the worst-conditioned thing in a
 * renderer. Passing the camera's right/up/forward vectors and the half-FOV tangent reconstructs
 * the same ray with three multiplies and no inversion at all.
 */
const SKY_VERT = `#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`;

const SKY_FRAG = `#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
out vec4 frag;
${SKY_GLSL}
void main(){
  vec3 dir = normalize(
    uForward
    + uRight * (vNdc.x * uTanHalfFov * uAspect)
    + uUp    * (vNdc.y * uTanHalfFov)
  );
  frag = vec4(skyColour(dir), 1.0);
}`;

export interface SkyBackdrop {
  /**
   * Fill the frame with the environment. Call FIRST, before geometry.
   *
   * `gl.depthMask(false)` and no depth test: the backdrop is infinitely far away, so writing
   * depth would make it occlude everything drawn afterwards. Drawing it LAST instead — the other
   * common ordering — needs a depth test against a cleared buffer and gets the near/far
   * convention wrong on exactly one driver.
   */
  draw(opts: {
    readonly eye: Vec3;
    readonly target: Vec3;
    readonly fovDeg: number;
    readonly aspect: number;
    readonly sky?: SkyOptions;
  }): void;
  dispose(): void;
}

export function createSkyBackdrop(stage: Stage): SkyBackdrop | StageRefusal {
  const { gl } = stage;
  const program = stage.compile(SKY_VERT, SKY_FRAG);
  if ('kind' in program) return program;

  return {
    draw(o) {
      const forward = normalise(sub(o.target, o.eye));
      /* An up vector parallel to forward is the same degeneracy as `lookAt`'s, and a camera
         looking straight down is a normal thing for an operator to do. */
      const worldUp: Vec3 = Math.abs(forward[1]) > 0.999 ? [0, 0, 1] : [0, 1, 0];
      const right = normalise(cross(forward, worldUp));
      const up = normalise(cross(right, forward));

      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.BLEND);
      gl.useProgram(program);
      gl.uniform3f(gl.getUniformLocation(program, 'uRight'), right[0], right[1], right[2]);
      gl.uniform3f(gl.getUniformLocation(program, 'uUp'), up[0], up[1], up[2]);
      gl.uniform3f(gl.getUniformLocation(program, 'uForward'), forward[0], forward[1], forward[2]);
      gl.uniform1f(gl.getUniformLocation(program, 'uTanHalfFov'), Math.tan((o.fovDeg * Math.PI) / 360));
      gl.uniform1f(gl.getUniformLocation(program, 'uAspect'), Math.max(1e-3, o.aspect));
      bindSky(gl, program, o.sky);
      stage.blit(program);
      gl.depthMask(true);
      gl.enable(gl.DEPTH_TEST);
    },
    dispose() { gl.deleteProgram(program); },
  };
}

/** Irradiance a surface with normal `n` receives from the sky. Mirrors `skyColour` on the CPU. */
export function skyIrradiance(n: Vec3, sky: SkyOptions = {}): Vec3 {
  const z = sky.zenith ?? DEFAULT_SKY.zenith;
  const h = sky.horizon ?? DEFAULT_SKY.horizon;
  const g = sky.ground ?? DEFAULT_SKY.ground;
  const smooth = (e0: number, e1: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const y = Math.max(-1, Math.min(1, n[1]));
  const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
    a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
  ];
  return y >= 0 ? mix(h, z, smooth(0, 0.85, y)) : mix(h, g, smooth(0, 0.55, -y));
}

/** Unused but exported so a surface can align its own pass with the backdrop's ray basis. */
export type { Mat4 };
