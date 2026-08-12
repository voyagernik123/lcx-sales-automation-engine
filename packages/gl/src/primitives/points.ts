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
  /** Overall exposure. Scales light, not hue. */
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
