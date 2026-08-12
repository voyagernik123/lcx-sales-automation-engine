/*
 * L4.5 · VOLUMETRIC FIELD — a 3-D texture, raymarched, occluded by the scene.
 *
 * ── WHAT MAKES THIS A READING AND NOT WEATHER ────────────────────────────────────────
 * The whole risk of a volumetric is that noise looks like meteorology. A cloud of curl noise over a
 * calendar is beautiful and says nothing, and §7(b) would rightly kill it.
 *
 * So the density grid is UPLOADED, not generated in the shader. A caller builds a `Float32Array` from
 * measured values and hands it over; the shader's only job is to integrate it. That makes the visible
 * result a consequence of the data by construction — there is no procedural term for a plausible
 * shape to sneak in through. The integral along a ray is then literally an accumulated quantity, which
 * is a sentence an operator can be told: *the depth of colour here is the total risk between you and
 * that day.*
 *
 * ── WHY FRONT-TO-BACK, AND WHY EMISSION IS PREMULTIPLIED ─────────────────────────────
 * Front-to-back accumulation with `1 - alpha` weighting lets the march STOP once the ray is opaque,
 * which is most of the performance of the whole layer. Back-to-front cannot early-out — it must visit
 * every sample to know the answer — and on a 128-step march that is a 3-5x difference for a frame that
 * looks identical.
 *
 * ── WHY THE SCENE DEPTH TEXTURE IS NOT OPTIONAL ──────────────────────────────────────
 * A volumetric drawn without reading scene depth paints over everything, including geometry standing
 * in front of it. It looks like fog on the lens. Marching only as far as the depth buffer says the ray
 * is unoccluded is the difference between a volume that is IN the scene and a wash over it.
 */

import { stageRefusal } from '../stage';
import type { Stage, StageRefusal } from '../stage';
import { savePassState, restorePassState, releaseTextureUnits, depthAttachmentIs } from './passState';

/**
 * Ray-versus-axis-aligned-box, by the slab method — the TS reference that `RAY_BOX_GLSL` below
 * mirrors line for line.
 *
 * Kept here, exported and tested, for a specific reason: this function is where a volumetric goes
 * wrong invisibly. Get it slightly wrong and the volume renders — just clipped, or inside out, or
 * starting behind the camera — and every one of those looks like a density problem rather than an
 * intersection one. Having a tested reference means a disagreement between this and the shader is at
 * least a thing that CAN be found, rather than a difference nobody can see.
 *
 * Returns `null` when the ray misses. `tNear` is clamped to 0 so a camera INSIDE the box marches from
 * the eye rather than from a negative distance behind it.
 */
export function rayBoxSlab(
  origin: readonly [number, number, number],
  dir: readonly [number, number, number],
  boxMin: readonly [number, number, number],
  boxMax: readonly [number, number, number],
): { tNear: number; tFar: number } | null {
  let tNear = -Infinity, tFar = Infinity;
  for (let a = 0; a < 3; a++) {
    const d = dir[a]!;
    const o = origin[a]!;
    const lo = boxMin[a]!, hi = boxMax[a]!;
    if (Math.abs(d) < 1e-12) {
      /*
       * A RAY PARALLEL TO THIS SLAB. The division would be ±Infinity, which the slab method actually
       * handles correctly — EXCEPT when the origin is exactly on a face, where `0 * Infinity` is NaN
       * and NaN fails every comparison, so the ray is reported as a HIT with garbage bounds. Handled
       * explicitly instead: parallel and outside is a definite miss, parallel and inside constrains
       * nothing.
       */
      if (o < lo || o > hi) return null;
      continue;
    }
    const inv = 1 / d;
    let t0 = (lo - o) * inv;
    let t1 = (hi - o) * inv;
    if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
    if (t0 > tNear) tNear = t0;
    if (t1 < tFar) tFar = t1;
    if (tNear > tFar) return null;
  }
  if (tFar < 0) return null;         // the whole box is behind the eye
  return { tNear: Math.max(0, tNear), tFar };
}

/**
 * Step count and size for a march, given the segment length and a quality budget.
 *
 * Pure and tested because a step size derived from the segment alone (`len / steps`) makes the sample
 * spacing depend on the ray, so a ray crossing the box corner-to-corner samples the SAME field at a
 * coarser spacing than one crossing a face — and the field then looks denser at the edges of the
 * volume than at its middle. That is a genuinely confusing artefact: it reads as data.
 *
 * Fixing the WORLD step and capping the count keeps density comparable everywhere, and reports the
 * truncation instead of hiding it.
 */
export function marchPlan(
  segmentLength: number,
  worldStep: number,
  maxSteps: number,
): { steps: number; step: number; truncated: boolean } {
  if (!(segmentLength > 0) || !(worldStep > 0)) return { steps: 0, step: 0, truncated: false };
  const wanted = Math.ceil(segmentLength / worldStep);
  const steps = Math.min(Math.max(1, wanted), Math.max(1, Math.floor(maxSteps)));
  /* Truncation is REPORTED. A ray longer than the budget silently stops part-way and the far side of
     the volume simply is not there — which looks like the data ending, not like the march ending. */
  return { steps, step: worldStep, truncated: wanted > steps };
}

export const RAY_BOX_GLSL = `
/* Mirrors rayBoxSlab() in volume.ts line for line. If one changes, change both. */
bool lcxRayBox(vec3 o, vec3 d, vec3 bmin, vec3 bmax, out float tNear, out float tFar){
  tNear = -1e30; tFar = 1e30;
  for (int a = 0; a < 3; a++) {
    float dd = d[a], oo = o[a], lo = bmin[a], hi = bmax[a];
    if (abs(dd) < 1e-12) {
      if (oo < lo || oo > hi) return false;
      continue;
    }
    float inv = 1.0 / dd;
    float t0 = (lo - oo) * inv;
    float t1 = (hi - oo) * inv;
    if (t0 > t1) { float t = t0; t0 = t1; t1 = t; }
    tNear = max(tNear, t0);
    tFar = min(tFar, t1);
    if (tNear > tFar) return false;
  }
  if (tFar < 0.0) return false;
  tNear = max(0.0, tNear);
  return true;
}
`;

const VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/*
 * The camera basis, passed in rather than inverted from the view-projection here. Inverting a matrix
 *      in a fragment shader for every pixel is both expensive and the kind of code that is wrong in a way
 *      only visible at extreme aspect ratios.
 * OUTSIDE THE BOX IS ZERO, EXPLICITLY. CLAMP_TO_EDGE would instead smear the boundary slab across
 *        all of space, so a shadow ray leaving the volume would keep accumulating the edge value and every
 *        cloud would sit under a black bar extending to infinity.
 * Single-scatter transmittance toward the light. Not a shadow map — a short march, because the volume
 *      is the only thing shadowing itself and 6-8 steps is enough to give a cloud a lit top and a dark
 *      underside, which is the entire cue that makes a volume read as having VOLUME.
 * THE SCENE'S DEPTH CAPS THE MARCH. Without this the volume paints over geometry standing in front
 *   of it and reads as fog on the lens rather than as something in the room.
 *   
 *   The depth buffer is non-linear, so it is converted back to a view-space distance and then to a
 *   distance along THIS ray — dividing by dot(dir, forward) rather than using it directly, because the
 *   depth buffer stores distance along the view AXIS and the ray is only parallel to it at the centre
 *   of the frame. Skipping that cosine makes the volume clip in a bowl shape toward the edges.
 * Colour ramps with the LOCAL value, not with accumulated depth. Ramping on the accumulation
 *          would make a long thin ray through weak field look identical to a short ray through strong
 *          field, which destroys exactly the distinction the volume exists to show.
 * r = the measured quantity, normalised to 0..1 by the caller
 * the scene's depth, so geometry occludes the volume
 * direction the light TRAVELS
 * 0 disables the shadow ray
 * Ray through this pixel, from the camera basis.
 * Emission floor: a fully self-shadowed core still glows a little, or the densest region of the
 * field — the most important part of the reading — renders as a black hole.
 * EARLY OUT. This is most of the performance of the layer, and it is only available because the
 * accumulation is front-to-back.
 */
const FRAG = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vUv;

uniform sampler3D uDensity;
uniform sampler2D uSceneDepth;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform vec3 uEye;
uniform vec3 uForward;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uTanHalfFov;
uniform float uAspect;
uniform float uNear;
uniform float uFar;
uniform float uWorldStep;
uniform int uMaxSteps;
uniform float uDensityScale;
uniform vec3 uColourLow;
uniform vec3 uColourHigh;
uniform vec3 uLightDir;
uniform float uLightSteps;
uniform float uEmission;

out vec4 frag;
${RAY_BOX_GLSL}

float sampleDensity(vec3 p){
  vec3 uvw = (p - uBoxMin) / (uBoxMax - uBoxMin);
  if (any(lessThan(uvw, vec3(0.0))) || any(greaterThan(uvw, vec3(1.0)))) return 0.0;
  return texture(uDensity, uvw).r * uDensityScale;
}

float lightTransmittance(vec3 p){
  if (uLightSteps < 1.0) return 1.0;
  vec3 toLight = -normalize(uLightDir);
  float tN, tF;
  if (!lcxRayBox(p, toLight, uBoxMin, uBoxMax, tN, tF)) return 1.0;
  float len = tF - tN;
  int n = int(uLightSteps);
  float dl = len / float(n);
  float tau = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= n) break;
    tau += sampleDensity(p + toLight * (float(i) + 0.5) * dl) * dl;
  }
  return exp(-tau);
}

void main(){

  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 dir = normalize(uForward + uRight * (ndc.x * uTanHalfFov * uAspect) + uUp * (ndc.y * uTanHalfFov));

  float tN, tF;
  if (!lcxRayBox(uEye, dir, uBoxMin, uBoxMax, tN, tF)) { frag = vec4(0.0); return; }

  float dz = texture(uSceneDepth, vUv).r * 2.0 - 1.0;
  float viewZ = (2.0 * uNear * uFar) / (uFar + uNear - dz * (uFar - uNear));
  float cosA = max(1e-4, dot(dir, normalize(uForward)));
  float tGeom = viewZ / cosA;
  tF = min(tF, tGeom);
  if (tF <= tN) { frag = vec4(0.0); return; }

  float len = tF - tN;
  int steps = int(min(float(uMaxSteps), max(1.0, ceil(len / uWorldStep))));
  float dt = uWorldStep;

  vec3 acc = vec3(0.0);
  float alpha = 0.0;
  for (int i = 0; i < 256; i++) {
    if (i >= steps) break;
    float t = tN + (float(i) + 0.5) * dt;
    if (t > tF) break;
    float d = sampleDensity(uEye + dir * t);
    if (d <= 0.0005) continue;

    vec3 col = mix(uColourLow, uColourHigh, clamp(d, 0.0, 1.0));
    float tr = lightTransmittance(uEye + dir * t);

    vec3 lit = col * (uEmission + (1.0 - uEmission) * tr);

    float a = 1.0 - exp(-d * dt);
    acc += lit * a * (1.0 - alpha);
    alpha += a * (1.0 - alpha);

    if (alpha > 0.995) break;
  }

  frag = vec4(acc, alpha);
}`;

export interface VolumeField {
  /**
   * Replace the density grid. `data` is `nx * ny * nz` floats in x-fastest order, and the caller is
   * expected to have normalised it to roughly 0..1 — the scale it means is `densityScale` at draw
   * time, which keeps the DATA and the LOOK separable.
   */
  upload(data: Float32Array): void;
  /**
   * Draw into the bound framebuffer, blended over what is there. Reads scene depth; writes no depth.
   *
   * THE BOUND FRAMEBUFFER MUST NOT BE THE ONE THAT OWNS `sceneDepth`, and this used to be documented
   * the other way round. Sampling an attachment of your own render target is a feedback loop: the
   * measured result is GL_INVALID_OPERATION, ANGLE logging "Feedback loop formed between Framebuffer
   * and active Texture", and ZERO lit pixels — the draw is dropped whole, so the volume is simply
   * absent and looks like a density problem. The control, drawing into a second target of the same
   * size, gave 13,456 lit pixels and glError 0 with everything else identical.
   *
   * So the volume goes into its own target and is composited afterwards, which is what E7 does. That
   * is now a stated requirement rather than an accident of one call site, and it is CHECKED: this
   * returns a `FEEDBACK_LOOP` refusal instead of issuing a draw the driver will silently discard.
   * Returns nothing when it drew.
   */
  draw(opts: {
    readonly eye: readonly [number, number, number];
    readonly forward: readonly [number, number, number];
    readonly right: readonly [number, number, number];
    readonly up: readonly [number, number, number];
    readonly fovDeg: number;
    readonly aspect: number;
    readonly near: number;
    readonly far: number;
    readonly sceneDepth: WebGLTexture;
    readonly boxMin: readonly [number, number, number];
    readonly boxMax: readonly [number, number, number];
    /** World distance between samples. Smaller is finer and linearly more expensive. */
    readonly worldStep?: number;
    readonly maxSteps?: number;
    readonly densityScale?: number;
    readonly colourLow: readonly [number, number, number];
    readonly colourHigh: readonly [number, number, number];
    readonly lightDir: readonly [number, number, number];
    /** Shadow-ray steps, 0..16. 0 gives a flat, volumeless wash. */
    readonly lightSteps?: number;
    /** Floor on self-illumination, 0..1, so the densest core is not a black hole. */
    readonly emission?: number;
  }): StageRefusal | undefined;
  readonly size: readonly [number, number, number];
  dispose(): void;
}

export function createVolumeField(
  stage: Stage,
  nx: number,
  ny: number,
  nz: number,
): VolumeField | StageRefusal {
  const gl = stage.gl;
  const sx = Math.max(2, Math.floor(nx));
  const sy = Math.max(2, Math.floor(ny));
  const sz = Math.max(2, Math.floor(nz));

  /*
   * A LINEARLY-FILTERABLE FLOAT 3-D TEXTURE IS AN EXTENSION, and its absence must refuse rather than
   * degrade. Without OES_texture_float_linear a FLOAT sampler3D falls back to NEAREST, and the volume
   * renders as visible axis-aligned blocks — which looks like a deliberate voxel aesthetic and would
   * ship as one. R16F is the fallback the caller cannot detect, so it is refused here instead.
   */
  if (!gl.getExtension('OES_texture_float_linear')) {
    return stageRefusal('MISSING_EXTENSION',
      'the volume needs OES_texture_float_linear for trilinear sampling of the density grid — without it a float sampler3D silently falls back to NEAREST and the field renders as voxel blocks');
  }

  const prog = stage.compile(VERT, FRAG);
  if ('kind' in prog) return prog;

  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_3D, tex);
  gl.texStorage3D(gl.TEXTURE_3D, 1, gl.R32F, sx, sy, sz);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  /* CLAMP on all three axes, and the shader ALSO rejects out-of-box coordinates explicitly. Belt and
     braces on purpose: clamping alone smears the boundary slab across all of space, so a shadow ray
     leaving the volume keeps accumulating the edge value and every cloud sits under an infinite bar. */
  for (const axis of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) {
    gl.texParameteri(gl.TEXTURE_3D, axis, gl.CLAMP_TO_EDGE);
  }
  gl.bindTexture(gl.TEXTURE_3D, null);

  const vao = gl.createVertexArray()!;
  const u = (n: string): WebGLUniformLocation | null => gl.getUniformLocation(prog, n);

  return {
    size: [sx, sy, sz],

    upload(data) {
      /* A SHORT ARRAY IS PADDED, NOT PASSED. `texSubImage3D` with an undersized buffer raises
         INVALID_OPERATION and uploads nothing, leaving the previous grid in place — so a caller with
         an off-by-one keeps seeing the LAST frame's data and concludes their new values had no
         effect. Padding with zeros makes the missing region visibly empty instead. */
      const need = sx * sy * sz;
      const src = data.length === need ? data
        : (() => { const p = new Float32Array(need); p.set(data.subarray(0, Math.min(need, data.length))); return p; })();
      gl.bindTexture(gl.TEXTURE_3D, tex);
      gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, sx, sy, sz, gl.RED, gl.FLOAT, src);
      gl.bindTexture(gl.TEXTURE_3D, null);
    },

    draw(o) {
      /*
       * ASKED BEFORE ANYTHING IS BOUND, because after the draw there is nothing to ask: a feedback
       * loop does not throw, it discards. See the note on `draw` in the interface above for the
       * measurement. This is the whole reason the volume gets its own target.
       */
      if (depthAttachmentIs(gl, o.sceneDepth)) {
        return stageRefusal('FEEDBACK_LOOP',
          'the volumetric field was asked to march against the depth attachment of the very framebuffer '
          + 'it is drawing into — draw it into a separate target and composite that, as E7 does');
      }
      const prev = savePassState(gl);
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, tex);
      gl.uniform1i(u('uDensity'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, o.sceneDepth);
      gl.uniform1i(u('uSceneDepth'), 1);
      gl.uniform3fv(u('uBoxMin'), o.boxMin as unknown as number[]);
      gl.uniform3fv(u('uBoxMax'), o.boxMax as unknown as number[]);
      gl.uniform3fv(u('uEye'), o.eye as unknown as number[]);
      gl.uniform3fv(u('uForward'), o.forward as unknown as number[]);
      gl.uniform3fv(u('uRight'), o.right as unknown as number[]);
      gl.uniform3fv(u('uUp'), o.up as unknown as number[]);
      gl.uniform1f(u('uTanHalfFov'), Math.tan((o.fovDeg * Math.PI) / 360));
      gl.uniform1f(u('uAspect'), o.aspect);
      gl.uniform1f(u('uNear'), o.near);
      gl.uniform1f(u('uFar'), o.far);
      gl.uniform1f(u('uWorldStep'), o.worldStep ?? 0.06);
      gl.uniform1i(u('uMaxSteps'), Math.min(256, o.maxSteps ?? 128));
      gl.uniform1f(u('uDensityScale'), o.densityScale ?? 1);
      gl.uniform3fv(u('uColourLow'), o.colourLow as unknown as number[]);
      gl.uniform3fv(u('uColourHigh'), o.colourHigh as unknown as number[]);
      gl.uniform3fv(u('uLightDir'), o.lightDir as unknown as number[]);
      gl.uniform1f(u('uLightSteps'), Math.min(16, Math.max(0, o.lightSteps ?? 6)));
      gl.uniform1f(u('uEmission'), Math.min(1, Math.max(0, o.emission ?? 0.25)));

      /*
       * PREMULTIPLIED SOURCE-OVER, NOT ADDITIVE — and this is the one place in the engine where the
       * two differ on purpose.
       *
       * Particles ACCUMULATE: two overlapping sparks are brighter than one, so additive is right.
       * A volume does not: the accumulation already happened inside the march, and `alpha` is the
       * fraction of the pixel the volume now owns. Compositing that additively would make a dense
       * cloud brighten whatever is behind it instead of hiding it, so the densest region — the most
       * important part of the reading — would be the most transparent.
       *
       * DEPTH TEST OFF, AND THE COMMENT HERE USED TO CLAIM THE OPPOSITE. It said "depth test ON so
       * geometry in front still wins even where the depth cap is imprecise" directly above a
       * `gl.disable(gl.DEPTH_TEST)` — measured `getParameter(DEPTH_TEST) === false` on return. Off is
       * the correct half of that contradiction: the occlusion is done by `uSceneDepth` inside the
       * march, per ray, at the right distance. A depth test could only test the full-screen
       * triangle's own single depth, which is a fact about the triangle and not about the volume.
       * Depth WRITE off for the same reason, and that part was always right.
       */
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      /* Units released — E0 lost three passes to a feedback loop from a texture left bound — and the
         enable-state put back, which it was not: the disabled depth test leaked out of this pass. */
      releaseTextureUnits(gl, 2);
      restorePassState(gl, prev);
      return undefined;
    },

    dispose() {
      gl.deleteTexture(tex);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
    },
  };
}
