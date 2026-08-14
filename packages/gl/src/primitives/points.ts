/**
 * L1 · POINTS — 10k–1M samples as instanced gaussian deposits.
 *
 * NOT `gl.POINTS`. `gl_PointSize` is capped by the driver (commonly 63–255 px), is not
 * antialiased, and gives you a square with no control over its falloff. Instanced quads
 * cost one extra attribute and buy the entire footprint.
 *
 * ── WHY A BROAD GAUSSIAN AND NOT A DISC ─────────────────────────────────────────────
 * P0 pass 1 drew discrete columns of hard dots and it read as a GLITCH rather than a
 * distribution. The tempting fix is to jitter x so the columns smear together — and that
 * fabricates positions the simulation never produced, which is the exact dishonesty this
 * whole program exists to avoid.
 *
 * The correct fix is to widen the INK, not to move the DATA: deposit each sample as a
 * gaussian wider than the column pitch, and overlapping deposits sum into a continuous
 * density field. Position stays exact; only the footprint changes. That is why `size` is
 * documented in terms of the pitch it has to exceed, and why `FALLOFF` is a constant of
 * this file rather than a knob per surface.
 */

import type { Mat4, Vec3 } from '../math.js';
import { worldPerNdcY } from '../math.js';
import type { Stage } from '../stage.js';
import { stageRefusal, type StageRefusal } from '../stage.js';
import type { Linear } from '../look/colour.js';

/**
 * Gaussian exponent. `exp(-r²·1.75)`, pedestal-subtracted so the footprint reaches
 * exactly zero at r=1 instead of ending on a visible step. Tighter than ~2.5 and the
 * deposits stop merging (stipple returns); looser than ~1.2 and the field turns to fog
 * and individual mass stops reading.
 *
 * ── THE FOOTPRINT THAT SHIPS IS 3.5, NOT 1.75. MEASURED 2026-08-15 ──────────────────
 *
 * The paragraph above sets a band and names its two failure modes, and the value that
 * reaches the framebuffer is outside it — past the stipple end, by a factor of two.
 *
 * Line 111 puts `g` into the RGB it writes AND into the alpha it writes. Under the blend
 * this primitive is designed for — `beginAdditive`, `SRC_ALPHA/ONE`, the only blend either
 * caller uses — the driver multiplies that RGB by that alpha, so the gaussian is applied
 * TWICE: `exp(-r²·1.75)² = exp(-r²·3.5)`.
 *
 * Measured through this exact shader on a real driver, one deposit with `lo == hi` so the
 * ramp cannot move the colour (`docs/3d/flat-fidelity.mjs`, recorded in
 * `docs/3d/flat-fidelity.json`), on a 64-px-wide deposit:
 *
 *     RGB factor at the core    0.584   (model: g(0)·near = 0.8262 × 0.71 = 0.5866)
 *     alpha at the core         0.321   (model: 0.5866 × 0.55 = 0.3226)
 *     delivered at the core     18.8%   of the data colour  (model 18.9%)
 *     half-max radius           18 px unblended → 13 px as shipped
 *
 * 13/18 = 0.72, and squaring a gaussian narrows its half-max radius by 1/√2 = 0.707. The
 * model and the pixels agree to three figures, so this is not a driver artefact.
 *
 * ── AND IT IS NOT BEING CHANGED HERE, ON PURPOSE ────────────────────────────────────
 *
 * The one-line change is real and is `frag = vec4(lin * near * uGain * (0.30 + 0.70*vMass),
 * g * near * 0.55)` — coverage in the alpha only, which is the correct premultiplication for
 * an additive accumulation. It makes every deposit ~1.7× brighter at the core and restores
 * the documented width, so `size` and the `lo`/`hi` ramp both need re-tuning against it.
 *
 * Two facts say a colour-fidelity pass is the wrong place to spend that:
 *   · REACHABILITY. `createPointCloud` has ONE caller in the whole repo —
 *     `docs/3d/p1/surface.ts:118`, a documentation harness. No `apps/web` surface draws a
 *     point cloud, so nothing a reader of the product sees changes either way.
 *   · §6 rule 8 — every claim gets a capture. Re-tuning a density field is a judgement made
 *     by looking at the P1 cloud at several values, which is how 1.75 was chosen in the
 *     first place, and this pass has no capture of that surface to make it against.
 *
 * So the number is recorded rather than acted on. What is NOT acceptable is the state this
 * replaces, where the constant documented a band and the render sat outside it silently.
 */
export const FALLOFF = 1.75;

export interface PointCloudData {
  /** xyz per sample, world space. Length must be `count·3`. */
  readonly centres: Float32Array;
  /**
   * Two per-sample scalars the shader may shade with, in `[0,1]`:
   *   `.x` — MASS: how much probability this sample's column carries
   *   `.y` — RANK: position within its own column, 0 at the base
   * Both are DATA. Neither may be randomised.
   */
  readonly attributes: Float32Array;
  readonly count: number;
}

export interface PointCloudStyle {
  /**
   * Half-size of the deposit in NDC-y. Must EXCEED half the column pitch or the
   * deposits will not merge and the cloud reads as stipple. For the P0 cloud: 326
   * columns across 3.04 NDC → pitch 0.0093, half-pitch 0.0047, size 0.0205. Comfortable.
   */
  readonly size: number;
  /** Low end of the density ramp, linear. */
  readonly lo: Linear;
  /** High end, linear. Usually above 1.0 so dense regions reach the bloom threshold. */
  readonly hi: Linear;
  /**
   * Overall exposure on the density ramp.
   *
   * IT USED TO SAY "Scales light, not hue", borrowed from `look/colour.ts`'s `exposure()`,
   * which says a scalar on all three channels "cannot shift a hue". That is true in LINEAR
   * space and false at the framebuffer, and this is the same shape of claim §6 rule 5 was
   * retired for: the composite's Reinhard is per channel and non-linear, so scaling before
   * it moves the RATIO between channels, which is the hue. Measured through `lines.ts`'s
   * identical `uColour * uGain` on a real driver (`docs/3d/flat-fidelity.json`), brand blue
   * at gain 0.42 lands `#1a45a1` (ΔE76 33.2) and at gain 3.33 lands `#51abff` (ΔE76 48.9),
   * against 18.3 for the composite alone. A scalar is an exposure decision and it is also a
   * hue decision; whoever picks one is making both.
   *
   * And it has a ceiling — `lines.ts`'s `STROKE_CLIP_LINEAR`, 1/(1-TONE_SHOULDER) = 1.6667.
   * A cloud whose `hi` × `gain` passes it stops encoding density at the top of its ramp,
   * which for a density field is the end that carries the finding.
   */
  readonly gain: number;
  /**
   * World-space y below which fragments are DISCARDED, so the cloud rests on its
   * baseline rather than bleeding through it. Omit for a cloud with no floor.
   */
  readonly floorY?: number;
  /** Half-depth of the aerial-perspective ramp, in world units. */
  readonly depthRange?: number;
}

export const POINTS_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 quad;
layout(location=1) in vec3 centre;
layout(location=2) in vec2 a;
uniform mat4 uMVP;
uniform float uSize, uWorldPerNdcY, uDepthRange;
uniform vec2 uAspect;
out vec2 vQuad;
out float vMass, vRank, vDepth, vWorldY;
void main(){
  vQuad = quad; vMass = a.x; vRank = a.y;
  vec4 clip = uMVP * vec4(centre, 1.0);
  // AERIAL PERSPECTIVE. Depth is otherwise invisible in an additive cloud, and a cloud
  // with no depth cue is precisely what makes 3-D read as a flat smear.
  vDepth = clamp((centre.z + uDepthRange) / (2.0 * uDepthRange), 0.0, 1.0);
  // World y of this CORNER. The quad is expanded in clip space so it stays circular and
  // screen-sized, which leaves the fragment stage no way to know where the floor plane
  // is — uWorldPerNdcY is that missing scale, measured from the matrix, not derived
  // from the field of view (so it stays correct under an orthographic projection).
  vWorldY = centre.y + quad.y * uSize * uWorldPerNdcY;
  clip.xy += quad * uSize * uAspect * clip.w;
  gl_Position = clip;
}`;

export const POINTS_FRAG = `#version 300 es
precision highp float;
in vec2 vQuad;
in float vMass, vRank, vDepth, vWorldY;
uniform vec3 uLo, uHi;
uniform float uGain, uFloorY, uHasFloor;
out vec4 frag;
void main(){
  float r2 = dot(vQuad, vQuad);
  if (r2 > 1.0) discard;
  if (uHasFloor > 0.5 && vWorldY < uFloorY) discard;
  float g = max(exp(-r2 * ${FALLOFF.toFixed(2)}) - ${Math.exp(-FALLOFF).toFixed(6)}, 0.0);
  // Mass drives the ramp; rank fades toward the tip so a column has a top edge rather
  // than ending on a hard cut.
  vec3 lin = mix(uLo, uHi, vMass * (0.40 + 0.60 * (1.0 - vRank)));
  float near = mix(0.42, 1.0, vDepth);
  frag = vec4(lin * g * near * uGain * (0.30 + 0.70 * vMass), g * near * 0.55);
}`;

export interface PointCloud {
  /** Draw into whatever target is currently bound. Blend state is the caller's. */
  draw(mvp: Mat4, style: PointCloudStyle, floorProbe?: Vec3): void;
  dispose(): void;
}

export function createPointCloud(
  stage: Stage,
  data: PointCloudData,
): PointCloud | StageRefusal {
  const { gl } = stage;
  if (data.centres.length !== data.count * 3) {
    return stageRefusal(
      'FRAMEBUFFER_INCOMPLETE',
      `centres has ${data.centres.length} floats, expected ${data.count * 3}`,
    );
  }
  const program = stage.compile(POINTS_VERT, POINTS_FRAG);
  if ('kind' in program) return program;

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buffers: WebGLBuffer[] = [];
  const attach = (src: Float32Array, loc: number, size: number, divisor: number) => {
    const b = gl.createBuffer()!;
    buffers.push(b);
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, src, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    if (divisor) gl.vertexAttribDivisor(loc, divisor);
  };
  attach(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), 0, 2, 0);
  attach(data.centres, 1, 3, 1);
  attach(data.attributes, 2, 2, 1);
  gl.bindVertexArray(null);

  const u = (n: string) => gl.getUniformLocation(program, n);
  const loc = {
    mvp: u('uMVP'), size: u('uSize'), aspect: u('uAspect'), wpn: u('uWorldPerNdcY'),
    depthRange: u('uDepthRange'), lo: u('uLo'), hi: u('uHi'), gain: u('uGain'),
    floorY: u('uFloorY'), hasFloor: u('uHasFloor'),
  };

  return {
    draw(mvp, style, floorProbe) {
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniformMatrix4fv(loc.mvp, false, mvp);
      gl.uniform1f(loc.size, style.size);
      gl.uniform2f(loc.aspect, stage.height / stage.width, 1);
      gl.uniform1f(loc.depthRange, style.depthRange ?? 0.38);
      gl.uniform3fv(loc.lo, style.lo as unknown as number[]);
      gl.uniform3fv(loc.hi, style.hi as unknown as number[]);
      gl.uniform1f(loc.gain, style.gain);
      const hasFloor = style.floorY !== undefined;
      gl.uniform1f(loc.hasFloor, hasFloor ? 1 : 0);
      gl.uniform1f(loc.floorY, style.floorY ?? 0);
      gl.uniform1f(
        loc.wpn,
        hasFloor ? worldPerNdcY(mvp, floorProbe ?? [0, style.floorY!, 0]) : 0,
      );
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, data.count);
      gl.bindVertexArray(null);
    },
    dispose() {
      for (const b of buffers) gl.deleteBuffer(b);
      gl.deleteVertexArray(vao);
      /* See lines.ts: without this a create/dispose cycle leaks a program and its two shaders until
         the stage dies, and the stage may outlive many clouds. */
      gl.deleteProgram(program);
    },
  };
}
