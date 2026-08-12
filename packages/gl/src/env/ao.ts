import type { Stage, StageRefusal } from '../stage.js';
import { stageRefusal } from '../stage.js';

/**
 * L2.7 · AMBIENT OCCLUSION — the pass that makes objects sit ON things.
 *
 * ── WHAT IT IS ACTUALLY FOR ─────────────────────────────────────────────────────────
 * A shadow map handles the DIRECT light. It says nothing about the environment light, which in
 * `sky.ts` arrives from every direction at once — so a corner, a crevice and the join between an
 * object and the floor all receive full sky irradiance even though geometry is obviously in the
 * way. The result reads as objects hovering in a uniformly lit fog, and it is the single
 * strongest remaining tell in E0's capture after the environment landed.
 *
 * ── HALF RESOLUTION, AND WHY THAT IS NOT A COMPROMISE ────────────────────────────────
 * AO is a low-frequency signal: it describes how enclosed a region is, and enclosure does not
 * change per pixel. Computing it at full resolution costs 4x for a result that a bilateral blur
 * then smooths away anyway. §3.2's frame budget assumed half-res, and this honours it.
 *
 * ── NORMALS FROM DEPTH, NOT FROM A G-BUFFER ─────────────────────────────────────────
 * The textbook version writes a normal buffer via MRT. That is a second full-resolution
 * attachment, its bandwidth every frame, and a change to `target3d.ts` that every other pass
 * would then have to know about. Reconstructing the normal from the depth derivatives costs two
 * `dFdx`/`dFdy` pairs and is exact for any flat surface — which, at half resolution over a
 * 4-sample neighbourhood, is every surface. The one artefact is a one-texel error at a
 * silhouette, and the bilateral blur below rejects across depth discontinuities anyway.
 *
 * ── WHY THE DEPTH PREPASS EARNS ITS PLACE ───────────────────────────────────────────
 * AO needs depth; the lit pass needs AO. That circularity is resolved by rendering geometry
 * DEPTH-ONLY first, which the existing shadow program already does. It is not a tax: the lit
 * pass then runs with a fully populated depth buffer, so every occluded fragment is rejected
 * before its GGX evaluation instead of after. On an overlapping scene the prepass pays for
 * itself.
 */

/** Reconstruct view-space position from a depth sample. Shared with any later depth-reading pass. */
/*
 * Hardware depth is nonlinear — most of its precision sits near the eye. Linearising it is the
 *      difference between an AO radius that means the same thing everywhere and one that silently
 *      shrinks with distance.
 */
export const DEPTH_RECONSTRUCT_GLSL = `
uniform sampler2D uDepth;
uniform vec2 uNearFar;
uniform float uTanHalfFov;
uniform float uAspect;

float linearDepthAt(vec2 uv) {
  float d = texture(uDepth, uv).r * 2.0 - 1.0;
  float n = uNearFar.x, f = uNearFar.y;
  return (2.0 * n * f) / (f + n - d * (f - n));
}

vec3 viewPosAt(vec2 uv) {
  float z = linearDepthAt(uv);
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x * uTanHalfFov * uAspect * z, ndc.y * uTanHalfFov * z, -z);
}`;

const AO_VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/*
 * A cheap hash for per-pixel kernel rotation. Without it the same 12 directions are used at
 *      every pixel and the occlusion shows as banding that follows the kernel's shape — the tell
 *      that says "SSAO" rather than "shadow".
 * THE FAR PLANE IS NOT OCCLUDED. Sky fragments have depth 1.0 and no geometry; sampling
 *        around them produces a dark halo along every silhouette against the backdrop.
 * A DEGENERATE DERIVATIVE PRODUCES A NaN NORMAL, AND ONE NaN NORMAL IS A BLOCK OF GARBAGE.
 *   
 *   The depth texture is full resolution and sampled NEAREST, while this pass runs at half. A
 *   one-half-texel offset can therefore land on the SAME full-res texel, making dx or dy exactly
 *   zero — and normalize of a zero-length cross product is NaN, which then fails every
 *   comparison below and leaves structured stair-step blocks across flat faces. That is what the
 *   first capture showed: not noise, but a pattern following the sampling grid.
 *   
 *   Two fixes together: step a FULL two texels so the samples cannot collide, and use a CENTRAL
 *   difference, which is both twice the baseline and correct on a curved surface rather than
 *   biased toward one side.
 * Still degenerate — a silhouette where both neighbours straddle a depth cliff. Treat as
 *        unoccluded rather than emitting NaN: a wrong-but-finite value is recoverable, a NaN is not.
 * A spiral rather than a ring: a single-radius ring measures enclosure at exactly one
 *          distance and misses both the tight crease and the broad corner.
 * Screen-space step for a constant WORLD-space radius: divide by view depth and by the
 *          frustum half-width at unit distance. The previous magic 0.5 over-reached at this FOV and
 *          sampled across whole objects, which is what put occlusion where there was none.
 * RANGE CHECK. Without it a distant object behind a silhouette counts as an occluder and
 *          paints a dark outline around every foreground shape — the other classic SSAO artefact.
 */
const AO_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
out vec4 frag;
${DEPTH_RECONSTRUCT_GLSL}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main(){
  float centreDepth = linearDepthAt(vUv);
  if (centreDepth >= uNearFar.y * 0.999) { frag = vec4(1.0); return; }

  vec3 p = viewPosAt(vUv);
  vec2 e = uTexel * 2.0;
  vec3 dx = viewPosAt(vUv + vec2(e.x, 0.0)) - viewPosAt(vUv - vec2(e.x, 0.0));
  vec3 dy = viewPosAt(vUv + vec2(0.0, e.y)) - viewPosAt(vUv - vec2(0.0, e.y));
  vec3 nRaw = cross(dx, dy);
  float nLen = length(nRaw);
  if (nLen < 1e-8) { frag = vec4(1.0); return; }
  vec3 n = nRaw / nLen;

  float ang = hash(gl_FragCoord.xy) * 6.2831853;
  float ca = cos(ang), sa = sin(ang);

  float occlusion = 0.0;
  const int SAMPLES = 12;
  for (int i = 0; i < SAMPLES; i++) {
    float t = (float(i) + 0.5) / float(SAMPLES);
    float r = uRadius * sqrt(t);
    float a = ang + t * 6.2831853 * 3.0;
    vec2 offDir = vec2(cos(a) * ca - sin(a) * sa, cos(a) * sa + sin(a) * ca);
    vec2 suv = vUv + offDir * (r / max(0.35, -p.z)) / (2.0 * uTanHalfFov);
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;

    vec3 s = viewPosAt(suv);
    vec3 dir = s - p;
    float len = length(dir);
    if (len < 1e-4) continue;
    float cosine = max(0.0, dot(n, dir / len) - uBias);
    float atten = uRadius / (uRadius + len);
    occlusion += cosine * atten;
  }
  occlusion = clamp(1.0 - (occlusion / float(SAMPLES)) * uStrength, 0.0, 1.0);
  frag = vec4(occlusion, occlusion, occlusion, 1.0);
}`;

/*
 * BILATERAL, not Gaussian. A plain blur bleeds occlusion across a silhouette, so a dark
 *        crease behind an object smears onto the object in front of it. Weighting by depth
 *        similarity keeps the blur inside a surface.
 * Reject across a depth step. 8% of the centre depth is generous enough to survive a
 * sloped surface and tight enough to stop a silhouette leaking.
 */
const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 frag;
${DEPTH_RECONSTRUCT_GLSL}

void main(){
  float centre = linearDepthAt(vUv);
  float sum = 0.0, wsum = 0.0;
  for (int i = -4; i <= 4; i++) {
    vec2 off = uDir * uTexel * float(i);
    float w = exp(-float(i * i) / 8.0);
    float d = linearDepthAt(vUv + off);

    float dw = exp(-abs(d - centre) / max(0.05, centre * 0.08));
    sum += texture(uAO, vUv + off).r * w * dw;
    wsum += w * dw;
  }
  float v = wsum > 0.0 ? sum / wsum : 1.0;
  frag = vec4(v, v, v, 1.0);
}`;

export interface AmbientOcclusion {
  /** Half-resolution occlusion, 1 = unoccluded. Sampled by the lit pass. */
  readonly texture: WebGLTexture;
  readonly width: number;
  readonly height: number;
  /** Compute from a populated depth buffer. Call AFTER the depth prepass, BEFORE the lit pass. */
  compute(opts: {
    readonly depthTexture: WebGLTexture;
    readonly near: number;
    readonly far: number;
    readonly fovDeg: number;
    readonly aspect: number;
    readonly radius?: number;
    readonly strength?: number;
    readonly bias?: number;
  }): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

export function createAmbientOcclusion(
  stage: Stage, fullWidth: number, fullHeight: number,
): AmbientOcclusion | StageRefusal {
  const { gl } = stage;
  const aoProg = stage.compile(AO_VERT, AO_FRAG);
  if ('kind' in aoProg) return aoProg;
  const blurProg = stage.compile(AO_VERT, BLUR_FRAG);
  if ('kind' in blurProg) return blurProg;

  let w = Math.max(1, fullWidth >> 1);
  let h = Math.max(1, fullHeight >> 1);

  const mk = (): { fb: WebGLFramebuffer; tex: WebGLTexture } | null => {
    const fb = gl.createFramebuffer();
    const tex = gl.createTexture();
    if (!fb || !tex) return null;
    return { fb, tex };
  };
  const a = mk(), b = mk();
  if (!a || !b) return stageRefusal('FRAMEBUFFER_INCOMPLETE', 'The GPU refused an AO buffer.');

  const allocate = () => {
    for (const t of [a, b]) {
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      /* R8 is enough: occlusion is a single 0..1 factor and 256 levels are invisible after the
         bilateral blur. RGBA16F here would cost 8x the bandwidth for nothing. */
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };
  allocate();

  gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    return stageRefusal('FRAMEBUFFER_INCOMPLETE', `The AO buffer is incomplete (0x${status.toString(16)}).`);
  }

  const bindDepthUniforms = (
    p: WebGLProgram, depth: WebGLTexture, near: number, far: number, fovDeg: number, aspect: number, unit: number,
  ) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, depth);
    gl.uniform1i(gl.getUniformLocation(p, 'uDepth'), unit);
    gl.uniform2f(gl.getUniformLocation(p, 'uNearFar'), near, far);
    gl.uniform1f(gl.getUniformLocation(p, 'uTanHalfFov'), Math.tan((fovDeg * Math.PI) / 360));
    gl.uniform1f(gl.getUniformLocation(p, 'uAspect'), aspect);
  };

  return {
    get texture() { return a.tex; },
    get width() { return w; },
    get height() { return h; },

    compute(o) {
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);

      // 1 · occlusion into A
      gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb);
      gl.viewport(0, 0, w, h);
      gl.useProgram(aoProg);
      bindDepthUniforms(aoProg, o.depthTexture, o.near, o.far, o.fovDeg, o.aspect, 0);
      gl.uniform2f(gl.getUniformLocation(aoProg, 'uTexel'), 1 / w, 1 / h);
      gl.uniform1f(gl.getUniformLocation(aoProg, 'uRadius'), o.radius ?? 0.55);
      gl.uniform1f(gl.getUniformLocation(aoProg, 'uStrength'), o.strength ?? 1.15);
      gl.uniform1f(gl.getUniformLocation(aoProg, 'uBias'), o.bias ?? 0.035);
      stage.blit(aoProg);

      // 2 · separable bilateral blur, A → B → A. Two 9-tap passes rather than one 81-tap.
      for (const [src, dst, dir] of [[a, b, [1, 0]], [b, a, [0, 1]]] as const) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
        gl.viewport(0, 0, w, h);
        gl.useProgram(blurProg);
        bindDepthUniforms(blurProg, o.depthTexture, o.near, o.far, o.fovDeg, o.aspect, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, src.tex);
        gl.uniform1i(gl.getUniformLocation(blurProg, 'uAO'), 1);
        gl.uniform2f(gl.getUniformLocation(blurProg, 'uTexel'), 1 / w, 1 / h);
        gl.uniform2f(gl.getUniformLocation(blurProg, 'uDir'), dir[0], dir[1]);
        stage.blit(blurProg);
      }

      /* Same hygiene as dof.ts: the depth texture sampled here is an attachment of the scene
         target, so it must not stay bound into a pass that renders to it. */
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, null);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.depthMask(true);
      gl.enable(gl.DEPTH_TEST);
    },

    resize(nw, nh) {
      const rw = Math.max(1, nw >> 1), rh = Math.max(1, nh >> 1);
      if (rw === w && rh === h) return;
      w = rw; h = rh;
      allocate();
    },

    dispose() {
      gl.deleteProgram(aoProg); gl.deleteProgram(blurProg);
      for (const t of [a, b]) { gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex); }
    },
  };
}
