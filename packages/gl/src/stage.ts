/**
 * L1 · STAGE — the WebGL2 context, its render targets, and its refusals.
 *
 * NO scene graph. NO colour decisions. This layer draws what L0 computed, in the space
 * L2 decided. A `Stage` owns exactly: the context, the HDR targets, the programs it was
 * asked to compile, and the depth/blend policy.
 *
 * ── THE REFUSAL ─────────────────────────────────────────────────────────────────────
 * "No WebGL2 context" is a REAL STATE, not a crash (`3D_WORK_100X.md` §6.3.7). It
 * happens on locked-down enterprise browsers, in headless CI without a GL flag, when a
 * GPU process has died, and behind an extension that blocks fingerprinting. A surface
 * that throws in that case takes the whole page with it; a surface that renders nothing
 * tells the reader their data is empty, which is a lie. So `createStage` returns a
 * discriminated union and every caller has to handle the refusal — the type system makes
 * the fallback unskippable rather than a thing to remember.
 */

/* ══ REFUSALS ═════════════════════════════════════════════════════════════════════ */

export const STAGE_REFUSAL_CODES = [
  'NO_WEBGL2',
  'CONTEXT_LOST',
  'SHADER_COMPILE_FAILED',
  'PROGRAM_LINK_FAILED',
  'FRAMEBUFFER_INCOMPLETE',
  /* L3.5 particles and L4.5 volumetrics each need one WebGL2 EXTENSION that is not core, and whose
     absence DEGRADES SILENTLY rather than failing: without EXT_color_buffer_float the particle state
     textures never update and the field renders frozen; without OES_texture_float_linear a float
     sampler3D falls back to NEAREST and the volume renders as voxel blocks that look like a
     deliberate aesthetic. Neither raises a GL error, so this is the only place either can be caught. */
  'MISSING_EXTENSION',
] as const;
export type StageRefusalCode = (typeof STAGE_REFUSAL_CODES)[number];

export interface StageRefusal {
  readonly kind: 'refused';
  readonly code: StageRefusalCode;
  /** What a reader should be told. Never "an error occurred". */
  readonly reason: string;
  /** The driver's own words where there are any. Kept verbatim; never summarised away. */
  readonly detail?: string;
}

/*
 * These say what happened and what it means for the reader's DATA. They deliberately do
 * NOT promise a fallback — an earlier draft ended with "the flat view below shows the
 * same measurements", and the P1 gate page has no flat view, so the fallback capture
 * rendered a page making a promise it did not keep. What remedy exists is a fact about
 * the SURFACE, not about the renderer, so a surface appends its own.
 */
const REFUSAL_REASON: Record<StageRefusalCode, string> = {
  NO_WEBGL2:
    'This browser did not provide a WebGL2 context, so the three-dimensional view cannot be drawn. ' +
    'Nothing about the underlying measurements has changed — the data is unaffected.',
  CONTEXT_LOST:
    'The graphics context was lost, usually because the GPU process restarted. The view will ' +
    'redraw on the next interaction; the data is unaffected.',
  SHADER_COMPILE_FAILED:
    'A shader failed to compile on this driver. This is a defect in the renderer, not in the data.',
  PROGRAM_LINK_FAILED:
    'A shader program failed to link on this driver. This is a defect in the renderer, not in the data.',
  FRAMEBUFFER_INCOMPLETE:
    'This driver would not allocate the render targets this view needs. The data is unaffected; ' +
    'only the three-dimensional presentation of it is unavailable.',
  MISSING_EXTENSION:
    'This driver is missing a graphics capability this view needs, so it is not being drawn rather ' +
    'than drawn wrongly. The data is unaffected.',
};

export function stageRefusal(code: StageRefusalCode, detail?: string): StageRefusal {
  return detail === undefined
    ? { kind: 'refused', code, reason: REFUSAL_REASON[code] }
    : { kind: 'refused', code, reason: REFUSAL_REASON[code], detail };
}

/* ══ TARGETS ══════════════════════════════════════════════════════════════════════ */

export interface RenderTarget {
  readonly texture: WebGLTexture;
  readonly framebuffer: WebGLFramebuffer;
  readonly width: number;
  readonly height: number;
}

export interface StageOptions {
  /**
   * Resolution of the bloom chain relative to the scene, as a right-shift. 2 → quarter
   * resolution per axis. Blurring at full resolution costs ~16× for a result nobody can
   * distinguish; blurring at 1/8 makes the halo blocky under motion.
   */
  readonly bloomShift?: number;
  /**
   * MSAA samples requested for the default framebuffer. Ignored by the HDR path, which
   * gets its edge quality from the gaussian footprint of its primitives instead — see
   * `primitives/points.ts`.
   */
  readonly antialias?: boolean;
  /**
   * Transparent drawing buffer. Required for a chart layer that sits OVER a card: with
   * `alpha: false` the buffer is opaque and the canvas paints a black rectangle across
   * whatever it overlays, however carefully the composite clears to zero.
   */
  readonly alpha?: boolean;
}

/* ══ STAGE ════════════════════════════════════════════════════════════════════════ */

export interface Stage {
  readonly kind: 'stage';
  readonly gl: WebGL2RenderingContext;
  /** Backing-store size in device pixels. */
  readonly width: number;
  readonly height: number;
  /** CSS size, for positioning DOM overlays against `projectScreen`. */
  readonly cssWidth: number;
  readonly cssHeight: number;
  /**
   * True when `EXT_color_buffer_float` is present and the scene accumulates in RGBA16F.
   *
   * When it is FALSE the pipeline still runs, in 8-bit, and it looks worse: density past
   * 1.0 clips at the framebuffer instead of rolling off, so a dense core reads as a flat
   * white blob. That is a degradation worth NAMING on screen rather than hiding — the
   * P0 legend prints `HDR float` or `8-bit` from exactly this flag.
   */
  readonly hdr: boolean;
  readonly scene: RenderTarget;
  readonly bloomA: RenderTarget;
  readonly bloomB: RenderTarget;
  compile(vertexSrc: string, fragmentSrc: string): WebGLProgram | StageRefusal;
  /** Bind a target (or `null` for the canvas) and set the viewport to match it. */
  bindTarget(t: RenderTarget | null): void;
  /**
   * Resize the render region. Reallocates the targets only when the size actually changes,
   * so a page of same-sized charts pays for one allocation.
   */
  setRegion(width: number, height: number): void;
  /** Draw a full-screen triangle with `program`. Owns its own VAO — see the note below. */
  blit(program: WebGLProgram, setUniforms?: (p: WebGLProgram) => void): void;
  dispose(): void;
}

export type StageOutcome = Stage | StageRefusal;

export function isStage(o: StageOutcome): o is Stage {
  return o.kind === 'stage';
}

export function createStage(canvas: HTMLCanvasElement, opts: StageOptions = {}): StageOutcome {
  const gl = canvas.getContext('webgl2', {
    antialias: opts.antialias ?? false,
    alpha: opts.alpha ?? false,
    premultipliedAlpha: false,
    // The capture harness screenshots after the frame is drawn, and on some drivers the
    // drawing buffer is cleared at composite. Preserving it costs nothing here and is
    // the difference between a capture and a black PNG.
    preserveDrawingBuffer: true,
  });
  if (!gl) return stageRefusal('NO_WEBGL2');

  const float = gl.getExtension('EXT_color_buffer_float');
  const W = canvas.width, H = canvas.height;
  const fmt = float ? gl.RGBA16F : gl.RGBA8;
  const typ = float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

  const makeTarget = (w: number, h: number): RenderTarget | StageRefusal => {
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, gl.RGBA, typ, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const framebuffer = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      return stageRefusal('FRAMEBUFFER_INCOMPLETE', `status 0x${status.toString(16)} at ${w}×${h}`);
    }
    return { texture, framebuffer, width: w, height: h };
  };

  const shift = opts.bloomShift ?? 2;
  /* THE REGION. Targets are allocated to it and `bindTarget` sets the viewport from it.
     Everything below used the CANVAS size instead, which was correct for a stage that owns
     its whole canvas and silently wrong for the shared renderer, where one 1024×512 buffer
     serves many charts: `bindTarget` re-set the viewport to 1024×512 AFTER the shared
     renderer had scissored a 960×312 region, so the chart rendered at full-buffer scale and
     the blit copied a window of it — every mark 1.64× too large and the bottom rows cropped
     clean off. Nothing threw, and the chart merely looked wrong. */
  let region = { w: W, h: H };
  let scene = makeTarget(W, H);
  if ('kind' in scene) return scene;
  let bloomA = makeTarget(Math.max(1, W >> shift), Math.max(1, H >> shift));
  if ('kind' in bloomA) return bloomA;
  let bloomB = makeTarget(Math.max(1, W >> shift), Math.max(1, H >> shift));
  if ('kind' in bloomB) return bloomB;

  /* THE FULL-SCREEN TRIANGLE GETS ITS OWN VAO, AND NOTHING ELSE MAY BIND INTO IT.
     In P0 pass 2 a geometry pass reused this VAO and re-pointed attribute 0 at its own
     buffer. Every post-process blit afterwards then drew a degenerate triangle, the
     composite never reached the canvas, and the frame came out SOLID BLACK — with every
     draw call issued, every uniform set, and no error thrown. Vertex-array state is
     per-VAO and corrupting it fails silently, which is why `blit` owns this privately
     instead of taking one from the caller. */
  const quadVao = gl.createVertexArray()!;
  gl.bindVertexArray(quadVao);
  const quadBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const programs: WebGLProgram[] = [];

  const stage: Stage = {
    kind: 'stage',
    gl,
    cssWidth: canvas.clientWidth || W,
    cssHeight: canvas.clientHeight || H,
    hdr: Boolean(float),
    get width() { return region.w; },
    get height() { return region.h; },
    get scene() { return scene as RenderTarget; },
    get bloomA() { return bloomA as RenderTarget; },
    get bloomB() { return bloomB as RenderTarget; },

    setRegion(w: number, h: number) {
      const nw = Math.max(1, Math.round(w)), nh = Math.max(1, Math.round(h));
      if (nw === region.w && nh === region.h) return;   // repeated same-size charts are free
      region = { w: nw, h: nh };
      for (const t of [scene, bloomA, bloomB]) {
        if (!('kind' in t)) { gl.deleteFramebuffer(t.framebuffer); gl.deleteTexture(t.texture); }
      }
      scene = makeTarget(nw, nh);
      bloomA = makeTarget(Math.max(1, nw >> shift), Math.max(1, nh >> shift));
      bloomB = makeTarget(Math.max(1, nw >> shift), Math.max(1, nh >> shift));
    },

    compile(vertexSrc, fragmentSrc) {
      const build = (type: number, src: string): WebGLShader | StageRefusal => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
          // The driver's log verbatim. Paraphrasing it loses the line number, which is
          // the only part that makes a shader error actionable.
          return stageRefusal('SHADER_COMPILE_FAILED', gl.getShaderInfoLog(s) ?? '(no log)');
        }
        return s;
      };
      const vs = build(gl.VERTEX_SHADER, vertexSrc);
      if (typeof vs === 'object' && 'kind' in vs) return vs;
      const fs = build(gl.FRAGMENT_SHADER, fragmentSrc);
      if (typeof fs === 'object' && 'kind' in fs) return fs;
      const p = gl.createProgram()!;
      gl.attachShader(p, vs as WebGLShader);
      gl.attachShader(p, fs as WebGLShader);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        return stageRefusal('PROGRAM_LINK_FAILED', gl.getProgramInfoLog(p) ?? '(no log)');
      }
      programs.push(p);
      return p;
    },

    bindTarget(t) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.framebuffer : null);
      // The REGION, not the canvas. See the note where `region` is declared.
      gl.viewport(0, 0, t ? t.width : region.w, t ? t.height : region.h);
    },

    blit(program, setUniforms) {
      gl.useProgram(program);
      gl.bindVertexArray(quadVao);
      setUniforms?.(program);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    },

    dispose() {
      for (const p of programs) gl.deleteProgram(p);
      for (const t of [scene, bloomA, bloomB]) {
        if (!('kind' in t)) { gl.deleteFramebuffer(t.framebuffer); gl.deleteTexture(t.texture); }
      }
      gl.deleteBuffer(quadBuf);
      gl.deleteVertexArray(quadVao);
    },
  };
  return stage;
}

/* ══ DEPTH POLICY ═════════════════════════════════════════════════════════════════ */

/**
 * THE STATED DEPTH POLICY (`3D_WORK_100X.md` §4, "z-fighting shimmer").
 *
 * Additive density fields — point clouds, heat accumulation — run with depth test OFF
 * and additive blend ON. This is correct rather than lazy: the quantity being drawn is a
 * SUM, and a depth test would discard contributions that belong in the sum. It also
 * removes the sort entirely, which is why 10,000 points draw in one call.
 *
 * Opaque geometry runs with depth test ON and `polygonOffset` applied to any coplanar
 * decal (a floor rule sitting on a floor). Coplanar geometry without an offset shimmers
 * under the smallest camera movement, and the shimmer is the tell — not the z-fighting.
 */
export const DEPTH_POLICY =
  'Additive density fields draw depth-test-off, additive-blend-on: the quantity is a sum, and a ' +
  'depth test would discard terms of it. Opaque geometry draws depth-tested, with polygon offset ' +
  'on coplanar decals.';

export function beginAdditive(gl: WebGL2RenderingContext): void {
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
}

/**
 * SOURCE-OVER, for fine strokes.
 *
 * Additive is correct for a quantity that ACCUMULATES — a point cloud, a stack of bars —
 * and wrong for a hairline. A polyline ribbon overlaps itself at every mitre join, and under
 * additive blending those overlaps SUM: a 2 px sparkline came out as a thick, blown-out
 * blob, and a donut's arcs summed into slabs. Both looked like geometry bugs and were a
 * blend-mode error.
 *
 * The primitives already write premultiplied colour (`rgb * a, a`), so the correct factors
 * are ONE / ONE_MINUS_SRC_ALPHA rather than SRC_ALPHA / ONE_MINUS_SRC_ALPHA — using the
 * latter would multiply alpha in a second time and darken every edge.
 */
export function beginAlpha(gl: WebGL2RenderingContext): void {
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
}

export function beginOpaque(gl: WebGL2RenderingContext): void {
  gl.disable(gl.BLEND);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
}

export function endPass(gl: WebGL2RenderingContext): void {
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
}
