import type { Stage, StageRefusal } from '../stage.js';
import { stageRefusal } from '../stage.js';

/**
 * L1.5 · THE DEPTH-ENABLED TARGET THE STAGE NEVER HAD.
 *
 * ── THE GAP, STATED PLAINLY ─────────────────────────────────────────────────────────
 * `stage.scene`, `stage.bloomA` and `stage.bloomB` carry a COLOUR attachment and nothing else.
 * Grepping `stage.ts` for `DEPTH_ATTACHMENT` returns nothing. That is correct for what the
 * stage was built for — additive point clouds and 2-D charts draw depth-test-off by policy,
 * because the quantity is a sum — and it means the existing pipeline is physically incapable
 * of rendering solid geometry. Two overlapping boxes would composite by draw order.
 *
 * So this is the first thing `3D_VFX_1000X.md` §4 needs, and it is ADDITIVE ON PURPOSE:
 * `stage.ts` is untouched, so all thirteen re-backed chart primitives keep the exact targets
 * they were verified against. A depth buffer bolted onto `stage.scene` would have been fewer
 * lines and would have put every working 2-D surface at risk for a feature none of them use.
 *
 * ── WHY IT HANDS ITS COLOUR TEXTURE BACK ────────────────────────────────────────────
 * The look pipeline (bright → blur ×4 → composite → tone map) is already correct and already
 * proves brand fidelity under HDR. Reproducing it here would fork the one part of the renderer
 * whose output is verified. Instead geometry renders into THIS target with depth, and the
 * result is fed to the existing pipeline as if it were the scene — so environments inherit
 * bloom, the tone curve and exact brand hex for free.
 */

export interface Target3D {
  readonly framebuffer: WebGLFramebuffer;
  /** Linear HDR colour when the stage has float support, 8-bit otherwise. */
  readonly texture: WebGLTexture;
  /** Depth, sampleable — SSAO and DOF both need to read it, not just test against it. */
  readonly depthTexture: WebGLTexture;
  readonly width: number;
  readonly height: number;
  /** Bind for rendering and set the viewport. */
  bind(): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

/**
 * A colour+depth target.
 *
 * DEPTH AS A TEXTURE, not a renderbuffer. A renderbuffer is marginally cheaper and cannot be
 * sampled, and every screen-space effect in §4 — SSAO, DOF, volumetric god rays — reconstructs
 * position from depth. Choosing the cheaper option here would mean rewriting this the moment
 * the first effect lands, and the saving is invisible.
 *
 * `depthFormat` is DEPTH_COMPONENT24 rather than 16: shadow acne and DOF banding are both
 * depth-precision artefacts first, and 16-bit depth over a `distance * 8` far plane is where
 * they start.
 */
export function createTarget3D(stage: Stage, width: number, height: number): Target3D | StageRefusal {
  const { gl } = stage;

  let w = Math.max(1, Math.floor(width));
  let h = Math.max(1, Math.floor(height));

  const framebuffer = gl.createFramebuffer();
  const texture = gl.createTexture();
  const depthTexture = gl.createTexture();
  if (!framebuffer || !texture || !depthTexture) {
    return stageRefusal('FRAMEBUFFER_INCOMPLETE', 'The GPU refused a render target for the 3-D scene.');
  }

  /* HDR WHEN AVAILABLE, and the same honesty as the stage: `stage.hdr` is false when
     EXT_color_buffer_float is missing, and then this runs in 8-bit and looks worse rather
     than pretending. A lit scene clips its specular highlight flat white in 8-bit. */
  const internal = stage.hdr ? gl.RGBA16F : gl.RGBA8;
  const type = stage.hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

  const allocate = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindTexture(gl.TEXTURE_2D, depthTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    /* NEAREST on depth. Linear filtering of depth is meaningless — the average of two depths is
       not a depth of anything — and produces haloes at silhouettes in every effect that reads
       it. Shadow-map PCF does its own multi-tap comparison instead. */
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  allocate();

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    /* CHECKED, because an incomplete framebuffer draws NOTHING and reports NO error — the
       exact silent-black-frame failure that cost a day at P0. */
    return stageRefusal(
      'FRAMEBUFFER_INCOMPLETE',
      `The 3-D render target is incomplete (0x${status.toString(16)}). Depth texture support may be missing.`,
    );
  }

  return {
    framebuffer, texture, depthTexture,
    get width() { return w; },
    get height() { return h; },
    bind() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, w, h);
    },
    resize(nw: number, nh: number) {
      const rw = Math.max(1, Math.floor(nw));
      const rh = Math.max(1, Math.floor(nh));
      // Reallocating every frame is the classic 3-D perf leak. Only on a real size change.
      if (rw === w && rh === h) return;
      w = rw; h = rh;
      allocate();
    },
    dispose() {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      gl.deleteTexture(depthTexture);
    },
  };
}

/**
 * A single-channel depth-only target, for the shadow map.
 *
 * No colour attachment at all: the shadow pass writes depth and nothing else, so allocating a
 * colour buffer for it would cost bandwidth for a value never read. WebGL2 permits a
 * depth-only framebuffer, which many WebGL1 tutorials work around by packing depth into RGBA —
 * a workaround worth NOT inheriting, because the packing costs precision and this file has
 * DEPTH_COMPONENT24 available.
 */
export interface ShadowMap {
  readonly framebuffer: WebGLFramebuffer;
  readonly depthTexture: WebGLTexture;
  readonly size: number;
  bind(): void;
  dispose(): void;
}

export function createShadowMap(stage: Stage, size = 1024): ShadowMap | StageRefusal {
  const { gl } = stage;
  const s = Math.max(256, Math.min(2048, Math.floor(size)));
  const framebuffer = gl.createFramebuffer();
  const depthTexture = gl.createTexture();
  if (!framebuffer || !depthTexture) {
    return stageRefusal('FRAMEBUFFER_INCOMPLETE', 'The GPU refused a shadow map.');
  }

  gl.bindTexture(gl.TEXTURE_2D, depthTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, s, s, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  /* CLAMP_TO_EDGE, and it matters: with REPEAT, geometry outside the light frustum samples a
     wrapped texel and gets a shadow from an unrelated part of the scene — a floating dark
     rectangle that looks like a shader bug and is actually a wrap mode. */
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    return stageRefusal(
      'FRAMEBUFFER_INCOMPLETE',
      `The shadow map framebuffer is incomplete (0x${status.toString(16)}).`,
    );
  }

  return {
    framebuffer, depthTexture, size: s,
    bind() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, s, s);
    },
    dispose() {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(depthTexture);
    },
  };
}
