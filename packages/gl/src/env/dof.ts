import type { Stage, StageRefusal } from '../stage.js';
import { stageRefusal } from '../stage.js';
import { LINEAR_DEPTH_GLSL } from './ao.js';
import { savePassState, restorePassState, releaseTextureUnits } from './passState.js';

/**
 * L2.8 · DEPTH OF FIELD — the pass that makes a frame read as photographed.
 *
 * ── WHY IT MATTERS MORE THAN IT SOUNDS ──────────────────────────────────────────────
 * Everything in focus everywhere is the single most recognisable signature of computer graphics,
 * because no lens behaves that way. A shallow depth of field also does something no other effect
 * can: it tells the eye WHERE TO LOOK. On E1 THE THEATRE that is the whole mechanism — the panel
 * an operator addresses is sharp and the rest of the room falls away, which is why §2 describes a
 * camera that racks focus rather than a camera that moves.
 *
 * ── GATHER, NOT SCATTER ─────────────────────────────────────────────────────────────
 * The physically-correct approach scatters each pixel's energy over its circle of confusion,
 * which needs blending, sorting and a variable-size splat. A gather reads a fixed disc around
 * each output pixel and weights by whether the sample COULD blur onto it. Wrong at a silhouette
 * where a sharp foreground should not bleed, right everywhere else, and one pass instead of three.
 *
 * ── THE ONE ARTEFACT THAT IS GUARDED ────────────────────────────────────────────────
 * A naive gather pulls colour from a SHARP foreground into a blurred background, painting a halo
 * of the foreground's colour around every near object. Weighting each sample by its own CoC — a
 * sharp sample contributes almost nothing to a blurred pixel — removes it, and that weighting is
 * the difference between depth of field and smeared depth of field.
 */

const DOF_VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/*
 * Circle of confusion in UV units. The thin-lens relation reduces to a difference of
 *      reciprocals, which is why a subject 1 m from a 2 m focus blurs far more than one 11 m from
 *      12 m — a linear distance falloff gets that backwards and is the usual shortcut.
 * In focus: return the sharp sample untouched. Blurring by a sub-texel radius still costs 24
 *        taps and still softens the image slightly, and "slightly soft everywhere" is the exact look
 *        this effect exists to avoid.
 * 24 taps on a golden-angle spiral. A square grid at this count shows its axes in the bokeh;
 *        the spiral has no preferred direction, so the out-of-focus highlight stays round.
 * WEIGHT BY THE SAMPLE'S OWN CoC, and this is the whole difference between depth of field
 *   and smear. A SHARP sample must not bleed into a blurred pixel, or every near object grows
 *   a halo of its own colour across the background behind it. A sample can only contribute as
 *   far as its own circle of confusion actually reaches.
 * Blend rather than replace: at a small CoC the gather is undersampled and shows its taps, and
 *        easing in over the first part of the range hides that entirely.
 */
const DOF_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uFocusDistance;
uniform float uAperture;
uniform float uMaxCoc;
out vec4 frag;
${LINEAR_DEPTH_GLSL}

float cocAt(vec2 uv) {
  float z = linearDepthAt(uv);
  float c = abs(1.0 / max(0.05, uFocusDistance) - 1.0 / max(0.05, z)) * uAperture;
  return clamp(c, 0.0, uMaxCoc);
}

void main(){
  float centreCoc = cocAt(vUv);
  vec3 sharp = texture(uScene, vUv).rgb;

  if (centreCoc < 0.0015) { frag = vec4(sharp, 1.0); return; }

  vec3 sum = sharp * 0.001;
  float wsum = 0.001;

  const int TAPS = 24;
  for (int i = 0; i < TAPS; i++) {
    float t = (float(i) + 0.5) / float(TAPS);
    float r = sqrt(t) * centreCoc;
    float a = float(i) * 2.39996323;
    vec2 off = vec2(cos(a), sin(a)) * r;
    vec2 suv = vUv + off;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;

    float sc = cocAt(suv);
    float reach = step(r, sc + uTexel.x);
    float w = reach * (0.35 + sc / max(1e-4, uMaxCoc));
    sum += texture(uScene, suv).rgb * w;
    wsum += w;
  }

  vec3 blurred = sum / wsum;
  float mixAmt = smoothstep(0.0015, uMaxCoc * 0.45, centreCoc);
  frag = vec4(mix(sharp, blurred, mixAmt), 1.0);
}`;

export interface DepthOfField {
  /** The resolved texture: scene with focus applied. Feed this to the present pass. */
  readonly texture: WebGLTexture;
  apply(opts: {
    readonly scene: WebGLTexture;
    readonly depthTexture: WebGLTexture;
    readonly near: number;
    readonly far: number;
    /**
     * ACCEPTED AND UNUSED, and now optional so that is sayable in the type.
     *
     * The gather needs a DISTANCE per pixel, not a view-space position, so the shader calls
     * `linearDepthAt` and never `viewPosAt` — which means the compiler drops `uTanHalfFov` and
     * `uAspect` from this program entirely. Setting them was two `uniform1f` calls against a null
     * location every frame, which WebGL performs as a silent no-op. They stay in the signature because
     * every environment passes them and their call sites are not this package's to edit.
     */
    readonly fovDeg?: number;
    readonly aspect?: number;
    /** World-space distance that stays sharp. Usually the distance to the subject. */
    readonly focusDistance: number;
    /** Higher = shallower. 0 disables the effect without changing the pass structure. */
    readonly aperture?: number;
    /** Largest circle of confusion, in UV units. Bounds the cost. */
    readonly maxCoc?: number;
  }): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

export function createDepthOfField(
  stage: Stage, width: number, height: number,
): DepthOfField | StageRefusal {
  const { gl } = stage;
  const prog = stage.compile(DOF_VERT, DOF_FRAG);
  if ('kind' in prog) return prog;

  let w = Math.max(1, Math.floor(width));
  let h = Math.max(1, Math.floor(height));
  const framebuffer = gl.createFramebuffer();
  const texture = gl.createTexture();
  if (!framebuffer || !texture) {
    return stageRefusal('FRAMEBUFFER_INCOMPLETE', 'The GPU refused a depth-of-field buffer.');
  }

  const allocate = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    /* FULL resolution and HDR. A half-res DOF buffer is the usual optimisation and it is wrong
       here: the sharp region passes through this pass untouched, so halving it would soften
       everything that is meant to be crisp. And the input is HDR — resolving to 8-bit before the
       tone map would clip every highlight the bokeh is supposed to show. */
    const internal = stage.hdr ? gl.RGBA16F : gl.RGBA8;
    const type = stage.hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };
  allocate();

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    return stageRefusal('FRAMEBUFFER_INCOMPLETE', `The DOF buffer is incomplete (0x${status.toString(16)}).`);
  }

  return {
    texture,
    apply(o) {
      const prev = savePassState(gl);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, w, h);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(prog);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, o.scene);
      gl.uniform1i(gl.getUniformLocation(prog, 'uScene'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, o.depthTexture);
      gl.uniform1i(gl.getUniformLocation(prog, 'uDepth'), 1);

      gl.uniform2f(gl.getUniformLocation(prog, 'uNearFar'), o.near, o.far);
      /* `uTanHalfFov` and `uAspect` are NOT set here any more. See the note on those two options. */
      gl.uniform2f(gl.getUniformLocation(prog, 'uTexel'), 1 / w, 1 / h);
      gl.uniform1f(gl.getUniformLocation(prog, 'uFocusDistance'), o.focusDistance);
      gl.uniform1f(gl.getUniformLocation(prog, 'uAperture'), o.aperture ?? 12);
      gl.uniform1f(gl.getUniformLocation(prog, 'uMaxCoc'), o.maxCoc ?? 0.012);
      stage.blit(prog);

      /*
       * RELEASE THE TEXTURE UNITS. This pass samples the scene colour AND the depth texture, and
       * both are attachments of the render target that the NEXT frame's geometry passes draw
       * into. Leaving them bound is a feedback loop the moment anything renders to that target —
       * undefined behaviour, and it reported as GL_INVALID_OPERATION on the LIT draw, three
       * passes away from the pass that actually caused it.
       */
      releaseTextureUnits(gl, 2);
      /* And the enable-state, which was previously RE-ENABLED rather than restored: this ended with an
         unconditional `enable(DEPTH_TEST)`, so a caller that had it off got it back on, and CULL_FACE
         — disabled above — was never put back at all. */
      restorePassState(gl, prev);
    },
    resize(nw, nh) {
      const rw = Math.max(1, Math.floor(nw)), rh = Math.max(1, Math.floor(nh));
      if (rw === w && rh === h) return;
      w = rw; h = rh;
      allocate();
    },
    dispose() {
      gl.deleteProgram(prog);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
    },
  };
}
