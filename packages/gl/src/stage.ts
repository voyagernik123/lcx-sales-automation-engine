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
  /* A PASS ASKED TO SAMPLE A TEXTURE THAT IS AN ATTACHMENT OF THE FRAMEBUFFER IT IS DRAWING INTO.
     The driver's answer is to drop the draw whole — measured as GL_INVALID_OPERATION with ANGLE
     logging "Feedback loop formed between Framebuffer and active Texture", and ZERO pixels written.
     Nothing appears, nothing is reported to the page, and the effect looks like a density or a
     parameter problem rather than a binding one. Named here so a caller is told which it was. */
  'FEEDBACK_LOOP',
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
  FEEDBACK_LOOP:
    'A layer of this view was asked to read the surface it draws into, which every driver refuses, so ' +
    'the layer is not being drawn. This is a defect in the renderer, not in the data.',
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

/* ══ THE TARGET CACHE ═════════════════════════════════════════════════════════════
 *
 * WHAT IT COST TO NOT HAVE ONE. `setRegion` short-circuited only on an IDENTICAL size and
 * otherwise deleted three framebuffers and three textures and allocated six. Four charts
 * alternating two sizes over three redraws made 39 texture allocations against 6 for the same
 * twelve renders at one size (`flat/sharedCost.test.ts`), and `useFlatChart` runs a 420 ms rAF
 * tween per chart, so a dashboard column holding two differently-sized charts paid that per
 * animation frame — O(charts × redraws) on every page load. Timed end to end on a real M1
 * through ANGLE Metal at dpr 2, `docs/3d/blit-cost.mjs` arm D put four mixed-size charts at
 * 1.90 and 2.11 ms per frame above the same four at one size: about 0.5 ms per chart per
 * redraw, which is the same order as the whole `drawImage` blit those runs also measured.
 *
 * So sets are kept, keyed by size. A page that alternates two sizes allocates two sets once
 * and then never again; the region stays EXACT, so nothing about how anything is sampled moves.
 *
 * ── WHY NOT THE QUANTISED-ALLOCATION FIX `3D_VFX_FINAL_PLAN.md` §10.7 SPECIFIES ──────────
 * That fix keeps `region = {w,h}` while allocating the targets on a 256 px grid, and has
 * `bindTarget` take the viewport from the region. It closes the same thrash and it is WRONG
 * here, for a reason one layer below the viewport hazard it was designed around.
 *
 * `look/pipeline.ts` draws its five passes as a full-screen triangle whose `uv` is
 * `q * 0.5 + 0.5` — normalised to the VIEWPORT — and samples its sources with that same `uv`,
 * which is normalised to the WHOLE TEXTURE. The two agree only while a target's texture and the
 * region are the same rectangle. Allocate a 480×40 chart's scene at 1024×512 and the composite
 * reads `uv` 0→1 across the full 1024×512 while writing a 480×40 viewport, so the chart lands
 * in the bottom-left 47% × 8% of its own rectangle and the rest of the frame is whatever the
 * previous chart left in that texture. Nothing throws. Twenty-four `stage.blit` call sites
 * across `env/`, `apps/web` and `docs/3d` make exactly the same assumption, and every one of
 * them would need a source-size uniform threaded through its shader — files this change does
 * not own, and a silent mis-scale in each of them if one is missed.
 *
 * ── WHAT IS KEPT, AND THE BOUND ON WHAT THAT COSTS ──────────────────────────────────────
 * Spares are capped two ways because the two failure modes are different: a count, so a page of
 * many small charts cannot accumulate sets without limit, and an AREA, because that is what
 * GPU memory is. The area figures below are arithmetic from the format, not measurements —
 * RGBA16F is 8 bytes a texel and the two bloom targets add 1/16 each, so a set costs
 * `w × h × 9` bytes. At the cap that is about 22 MB of spares, against the 46 MB the active
 * set alone costs on a page whose largest chart is 3200×1600. It also decides which charts are
 * worth keeping: the 2400×920 dashboard chart (2.21 Mpx) is retained, a 3200×1600 one
 * (5.12 Mpx) is not, and every sparkline and card is far under either.
 *
 * Eviction is least-recently-used, which is right for the alternation this exists to fix and
 * has nothing to say for a round-robin over more sizes than it holds — that page reallocates
 * exactly as it did before, which is the direction to degrade in.
 */
interface TargetSet {
  readonly scene: RenderTarget | StageRefusal;
  readonly bloomA: RenderTarget | StageRefusal;
  readonly bloomB: RenderTarget | StageRefusal;
  /** Scene texels. The eviction budget is in these because GPU bytes are area × format. */
  readonly texels: number;
}

/** Sets kept beyond the active one. Two alternating sizes is the measured case; three has slack. */
export const TARGET_CACHE_SPARES = 3;
/** Total scene texels across the spares. See the byte arithmetic above. */
export const TARGET_CACHE_TEXELS = 2_400_000;

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
   * Resize the render region. Targets are allocated once per DISTINCT size and kept, so a
   * page whose charts alternate between two sizes pays for two sets and not for one set per
   * render — see `TARGET_CACHE_SPARES` for what is kept and what is thrown away.
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

  const makeSet = (w: number, h: number): TargetSet => ({
    scene: makeTarget(w, h),
    bloomA: makeTarget(Math.max(1, w >> shift), Math.max(1, h >> shift)),
    bloomB: makeTarget(Math.max(1, w >> shift), Math.max(1, h >> shift)),
    texels: w * h,
  });

  const freeSet = (s: TargetSet) => {
    for (const t of [s.scene, s.bloomA, s.bloomB]) {
      if (!('kind' in t)) { gl.deleteFramebuffer(t.framebuffer); gl.deleteTexture(t.texture); }
    }
  };

  /* Insertion order IS the LRU order: a hit re-inserts, and `evictSpares` walks oldest-first. */
  const sets = new Map<string, TargetSet>();
  let activeKey = `${W}x${H}`;
  let active = makeSet(W, H);
  for (const t of [active.scene, active.bloomA, active.bloomB]) {
    /* Free the two that succeeded before handing back the refusal. The version before the cache
       returned on the first failure with the earlier targets still allocated, and on a driver that
       refuses the bloom size that leaked a full-size colour texture on a context nobody can reach
       again — `dispose()` cannot help, because no Stage was ever returned to call it on. */
    if ('kind' in t) { freeSet(active); return t; }
  }
  sets.set(activeKey, active);

  const evictSpares = () => {
    let spares = sets.size - 1;
    let texels = 0;
    for (const [k, s] of sets) if (k !== activeKey) texels += s.texels;
    for (const [k, s] of sets) {
      if (spares <= TARGET_CACHE_SPARES && texels <= TARGET_CACHE_TEXELS) return;
      if (k === activeKey) continue;
      sets.delete(k);
      freeSet(s);
      spares -= 1;
      texels -= s.texels;
    }
  };

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
    get scene() { return active.scene as RenderTarget; },
    get bloomA() { return active.bloomA as RenderTarget; },
    get bloomB() { return active.bloomB as RenderTarget; },

    setRegion(w: number, h: number) {
      const nw = Math.max(1, Math.round(w)), nh = Math.max(1, Math.round(h));
      if (nw === region.w && nh === region.h) return;   // repeated same-size charts are free
      region = { w: nw, h: nh };
      const key = `${nw}x${nh}`;
      const hit = sets.get(key);
      if (hit) {
        sets.delete(key);        // re-insert, so Map order stays LRU order for `evictSpares`
        sets.set(key, hit);
        active = hit;
        activeKey = key;
        return;
      }
      active = makeSet(nw, nh);
      activeKey = key;
      sets.set(key, active);
      evictSpares();
    },

    /*
     * EVERY SHADER OBJECT IS DELETED HERE, AND `dispose()` COULD NEVER HAVE DONE IT.
     *
     * The version before this one created two shaders per program and deleted none, on any path.
     * Measured on the full engine — sky, three lit programs, two AO, DOF, two particle, volume — that
     * was 20 shader objects created and 0 deleted, still 20 after `dispose()` on every object AND
     * `stage.dispose()`, with `gl.isShader` true for all twenty. `stage.dispose()` cannot fix it:
     * deleting a program does not free a shader that was never FLAGGED for deletion, so the shaders
     * outlive the program they were attached to and there is no handle left to reach them by.
     *
     * `deleteShader` on a linked program's shader is not premature. It flags the object; the driver
     * frees it when the last attachment goes, and the program keeps its linked binary either way.
     * Detaching first is what makes that "last attachment" happen now rather than at program delete.
     *
     * The three early returns leaked as well, and the link failure was the worst of the three: it
     * leaked the WebGLProgram too, because `programs.push(p)` below only runs on success, so
     * `stage.dispose()` never saw it. Measured 5 shaders and 1 program still valid after the stage
     * was disposed. Each branch now deletes exactly what it had made.
     */
    compile(vertexSrc, fragmentSrc) {
      const build = (type: number, src: string): WebGLShader | StageRefusal => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
          // The driver's log verbatim. Paraphrasing it loses the line number, which is
          // the only part that makes a shader error actionable.
          const log = gl.getShaderInfoLog(s) ?? '(no log)';
          gl.deleteShader(s);
          return stageRefusal('SHADER_COMPILE_FAILED', log);
        }
        return s;
      };
      const vs = build(gl.VERTEX_SHADER, vertexSrc);
      if (typeof vs === 'object' && 'kind' in vs) return vs;
      const fs = build(gl.FRAGMENT_SHADER, fragmentSrc);
      if (typeof fs === 'object' && 'kind' in fs) {
        gl.deleteShader(vs as WebGLShader);
        return fs;
      }
      const p = gl.createProgram()!;
      gl.attachShader(p, vs as WebGLShader);
      gl.attachShader(p, fs as WebGLShader);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(p) ?? '(no log)';
        gl.deleteShader(vs as WebGLShader);
        gl.deleteShader(fs as WebGLShader);
        gl.deleteProgram(p);
        return stageRefusal('PROGRAM_LINK_FAILED', log);
      }
      gl.detachShader(p, vs as WebGLShader);
      gl.detachShader(p, fs as WebGLShader);
      gl.deleteShader(vs as WebGLShader);
      gl.deleteShader(fs as WebGLShader);
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

    /*
     * DELETING THE OBJECTS IS NOT RELEASING THE CONTEXT, AND THE CONTEXT IS THE SCARCE THING.
     *
     * Every `delete*` below frees GPU memory. None of them frees the CONTEXT SLOT: a WebGL context lives
     * until its canvas is garbage-collected, which is a decision the JS engine makes whenever it likes. So
     * a reader toggling a relief off and on could hold more live contexts than there are mounted
     * components. Browsers cap live contexts at commonly 8-16 and past the cap kill the OLDEST one
     * SILENTLY — and on any chart route the oldest is `flat/shared.ts`'s ONE shared context, which every
     * chart on the page draws through. The whole page of charts blanks at once and it reads as a data bug,
     * not a graphics one. `apps/web/src/components/__tests__/glContextBudget.test.ts` named this hazard and
     * could not close it, because closing it meant editing this file.
     *
     * ── WHY THIS IS GATED ON THE CANVAS BEING DETACHED, WHICH IS NOT A HEURISTIC ─────────
     * `getContext('webgl2')` returns the SAME context object every time it is called on a given canvas. Two
     * consequences follow, and together they make `isConnected` exactly the right condition rather than an
     * approximation of one:
     *
     *  · A canvas still IN the document can be handed to `createStage` again — every relief in this repo
     *    rebuilds in place when its size step or its quality tier changes, on the same canvas element. Had
     *    we lost the context there, the rebuild would get the same, now-permanently-lost context back:
     *    `createTexture` returns null, `checkFramebufferStatus` never reports COMPLETE, and the surface
     *    refuses to the flat view for the rest of the page's life after a window resize. That would be a
     *    worse defect than the leak.
     *  · A DETACHED canvas can never be drawn to again — nobody holds it and no `getContext` call can reach
     *    it — so losing its context is always safe, and it is exactly the case that leaks: a relief toggled
     *    off unmounts its canvas.
     *
     * It also settles the second hazard. `loseContext()` fires `webglcontextlost`, and seven components
     * plus `docs/3d/_shared/flatFallback.ts` listen for it to say "the GPU dropped this view" — a legitimate
     * teardown must not be reported to a reader as a crash. On a detached canvas the event cannot reach the
     * document-level capture listener at all, and all seven React teardowns remove their own canvas listener
     * BEFORE calling dispose (verified in each of the seven). If a caller ever disposes while the canvas is
     * still mounted, this line does nothing and the behaviour is exactly what it was before — the guard
     * fails towards the old leak rather than towards a false refusal.
     *
     * LAST, after the deletes: on a lost context every `delete*` is a silent no-op, so losing first would
     * leak the objects this function exists to free.
     */
    dispose() {
      for (const p of programs) gl.deleteProgram(p);
      /* EVERY CACHED SET, not only the active one. The cache is what stops a two-size page
         reallocating per render, and it is also the only handle anything has on the spares:
         a `dispose()` that freed `active` alone would leak up to `TARGET_CACHE_TEXELS` of
         colour attachments per stage, which is the leak class this function exists to close. */
      for (const s of sets.values()) freeSet(s);
      sets.clear();
      gl.deleteBuffer(quadBuf);
      gl.deleteVertexArray(quadVao);
      if (canvas.isConnected) return;
      /* The extension is optional and a fake context in a test returns an object with nothing on it, so
         both the extension and the method are checked. `getExtension` also returns null once a context is
         already lost, which is what makes a second `dispose()` a no-op rather than an error. */
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose !== null && typeof lose.loseContext === 'function') lose.loseContext();
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
