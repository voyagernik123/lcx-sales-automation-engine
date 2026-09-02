import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createStage, isStage, stageRefusal, STAGE_REFUSAL_CODES, DEPTH_POLICY, type Stage,
} from './stage.js';

/**
 * "NO WEBGL2" IS A REAL STATE (`3D_WORK_100X.md` §6.3.7), and the whole point of making
 * it a discriminated union is that a caller cannot forget it. These tests exercise the
 * refusal path — which, on the machines that actually hit it, is the ONLY path.
 *
 * There is no context in Node, so `createStage` here always refuses. That is convenient
 * rather than limiting: the refusal is the branch least likely to be exercised by hand
 * and most likely to be wrong.
 */

function fakeCanvas(ctx: unknown): HTMLCanvasElement {
  const c = { width: 64, height: 64, clientWidth: 32, clientHeight: 32, getContext: () => ctx };
  return c as unknown as HTMLCanvasElement;
}

describe('the stage refuses instead of throwing', () => {
  it('a browser with no WebGL2 gets a refusal, not an exception', () => {
    const out = createStage(fakeCanvas(null));
    expect(isStage(out)).toBe(false);
    expect(out.kind).toBe('refused');
    if (isStage(out)) expect.unreachable('should have refused');
    expect(out.code).toBe('NO_WEBGL2');
  });

  it('the reason is addressed to a READER, and says the data is unaffected', () => {
    const out = createStage(fakeCanvas(null));
    if (isStage(out)) expect.unreachable('should have refused');
    // "An error occurred" tells a reader nothing and implies their data is broken.
    expect(out.reason).not.toMatch(/error occurred|something went wrong|failed to/i);
    expect(out.reason).toMatch(/data is unaffected/);
    expect(out.reason.length).toBeGreaterThan(60);
  });

  it('every declared refusal code carries a distinct, non-empty reason', () => {
    const reasons = STAGE_REFUSAL_CODES.map((c) => stageRefusal(c).reason);
    for (const r of reasons) expect(r.trim().length).toBeGreaterThan(40);
    expect(new Set(reasons).size).toBe(STAGE_REFUSAL_CODES.length);
  });

  it('driver detail is carried VERBATIM — paraphrasing loses the line number', () => {
    const raw = `ERROR: 0:42: 'vFog' : undeclared identifier`;
    expect(stageRefusal('SHADER_COMPILE_FAILED', raw).detail).toBe(raw);
    // Absent detail is absent, not an empty string pretending to be a driver log.
    expect(stageRefusal('NO_WEBGL2').detail).toBeUndefined();
  });
});

describe('the VAO discipline that cost P0 a whole pass', () => {
  const stageSrc = readFileSync(resolve(process.cwd(), 'src/stage.ts'), 'utf8');
  const pointsSrc = readFileSync(resolve(process.cwd(), 'src/primitives/points.ts'), 'utf8');
  const linesSrc = readFileSync(resolve(process.cwd(), 'src/primitives/lines.ts'), 'utf8');

  it('blit owns its VAO privately — it is never a parameter', () => {
    /*
     * P0 pass 2 rendered a SOLID BLACK FRAME. Every draw call was issued, every uniform
     * was set, nothing threw. A geometry pass had reused the full-screen triangle's VAO
     * and re-pointed attribute 0 at its own buffer, so every post-process blit afterwards
     * drew a degenerate triangle. Vertex-array state is per-VAO and corrupting it is
     * silent, so the structural fix is that callers cannot reach the VAO at all.
     */
    expect(stageSrc).toMatch(/blit\(program: WebGLProgram, setUniforms\?/);
    expect(stageSrc).not.toMatch(/blit\([^)]*vao/i);
  });

  it('each primitive creates its own VAO rather than binding into a shared one', () => {
    for (const [name, src] of [['points', pointsSrc], ['lines', linesSrc]] as const) {
      expect(src, `${name} does not create its own vertex array`).toContain('createVertexArray()');
      // And unbinds when finished, so a later pass inherits nothing.
      expect(src, `${name} leaves a VAO bound`).toContain('bindVertexArray(null)');
    }
  });
});

/* ── DISPOSAL RELEASES THE CONTEXT, NOT ONLY THE OBJECTS IN IT ────────────────────── */

/**
 * A CONTEXT-LIFETIME MODEL, and it models exactly two rules from the WebGL spec.
 *
 * (1) `canvas.getContext('webgl2')` returns the SAME context object for the life of the canvas — a
 * canvas never hands out a second one. (2) Once a context is lost, `create*` returns null and
 * `checkFramebufferStatus` never reports COMPLETE, so nothing can be built on it again.
 *
 * Those two together are what make `dispose()`'s guard load-bearing rather than decorative, and they are
 * quoted from the spec rather than measured here: this package's tests run in `node`, where there is no
 * WebGL2 at all (see `vitest.config.ts`). What is verified below is the CALL SEQUENCE and the branch —
 * the pixels and the real driver's context table stay in `docs/3d/p0`'s headless capture.
 */
interface FakeGl {
  readonly canvas: { isConnected: boolean; width: number; height: number; getContext: () => unknown };
  readonly log: string[];
  readonly deleted: () => number;
  readonly isLost: () => boolean;
  /** Programs the context still considers valid. The program cache's whole subject. */
  readonly liveProgrammes: () => number;
  /** Bind something, so a `deleteProgram` on what WAS bound takes effect. See `useProgram` below. */
  readonly bind: (p: unknown) => void;
  /** Injects a link failure at the status query, as `env/glState.test.ts:305` does. */
  failLink: boolean;
  /** What `getExtension('WEBGL_lose_context')` hands back. */
  extension: 'real' | 'absent' | 'empty-object';
}

/**
 * The proxy answers any `SCREAMING_CASE` property with `0x1000 + name.length`, which is enough for
 * a stage that does arithmetic on none of them. The cache queries two of those enums and must tell
 * them apart, so they are named here rather than left as an incidental collision — `LINK_STATUS`
 * and `DELETE_STATUS` differ in length, and a rename that made them equal would otherwise turn
 * "is this program flagged for deletion" into "did it link" with nothing to notice it.
 */
const ENUM = (name: string): number => 0x1000 + name.length;

function fakeGl(opts: { connected: boolean; extension?: FakeGl['extension'] } = { connected: false }): FakeGl {
  const log: string[] = [];
  let lost = false;
  let deleted = 0;
  /*
   * PROGRAM LIFETIME, MODELLED FROM THE SPEC RATHER THAN SIMPLIFIED, because the two states this
   * models are exactly what the program cache has to distinguish and a boolean `alive` could not.
   *
   * `deleteProgram` on the program that is CURRENTLY BOUND does not delete it — it FLAGS it, and
   * the driver frees it when something else is bound. A flagged program is still a program to
   * `isProgram`, which is why the cache also asks `DELETE_STATUS`, and why this fake has to have a
   * notion of "current" at all.
   */
  const programState = new Map<unknown, { flagged: boolean; gone: boolean }>();
  let current: unknown = null;
  const unbindCurrent = (next: unknown): void => {
    const s = programState.get(current);
    if (current !== next && s !== undefined && s.flagged) s.gone = true;
    current = next;
  };

  const state = {
    canvas: { isConnected: opts.connected, width: 64, height: 64, getContext: () => proxy },
    log,
    deleted: () => deleted,
    isLost: () => lost,
    liveProgrammes: () => [...programState.values()].filter((s) => !s.gone).length,
    bind: (p: unknown) => unbindCurrent(p),
    failLink: false,
    extension: opts.extension ?? 'real',
  };

  const api: Record<string, (...a: never[]) => unknown> = {
    getExtension: ((name: string) => {
      log.push(`getExtension:${name}`);
      /* A LOST CONTEXT RETURNS NULL FROM `getExtension`, which is what makes a second `dispose()` safe
         rather than an error. Modelled, because it is the only thing standing between this fix and a
         throw on a double teardown. */
      if (lost) return null;
      if (name !== 'WEBGL_lose_context') return name === 'EXT_color_buffer_float' ? {} : null;
      if (state.extension === 'absent') return null;
      if (state.extension === 'empty-object') return {};
      return { loseContext: () => { log.push('loseContext'); lost = true; } };
    }) as never,
    checkFramebufferStatus: () => (lost ? 0 : 0x8CD5),
    /* LOGGED, and each call returns a DISTINCT object: the target-cache tests below count these
       and compare identity to tell a reused set from a rebuilt one, which a shared sentinel
       object would make indistinguishable. */
    createTexture: () => { log.push('createTexture'); return lost ? null : { tag: 'texture' }; },
    createFramebuffer: () => (lost ? null : { tag: 'framebuffer' }),
    createBuffer: () => (lost ? null : { tag: 'buffer' }),
    createVertexArray: () => (lost ? null : { tag: 'vao' }),
    getError: () => 0,
    createProgram: () => {
      log.push('createProgram');
      if (lost) return null;
      const p = { tag: 'program', n: programState.size };
      programState.set(p, { flagged: false, gone: false });
      return p;
    },
    useProgram: ((p: unknown) => { log.push('useProgram'); unbindCurrent(p); }) as never,
    isProgram: ((p: unknown) => {
      const s = programState.get(p);
      return s !== undefined && !s.gone;
    }) as never,
    getProgramParameter: ((p: unknown, pname: number) => {
      if (pname !== ENUM('DELETE_STATUS')) return !state.failLink;   // LINK_STATUS and anything else
      const s = programState.get(p);
      /* A DELETED name is not a program, and the real driver raises INVALID_OPERATION and returns
         null here. Modelled, because `null` is falsy and the cache must treat it as a miss. */
      return s === undefined || s.gone ? null : s.flagged;
    }) as never,
    deleteProgram: ((p: unknown) => {
      deleted += 1;
      log.push('deleteProgram');
      const s = programState.get(p);
      if (s === undefined) return;
      if (current === p) s.flagged = true; else s.gone = true;
    }) as never,
  };
  for (const name of ['deleteTexture', 'deleteFramebuffer', 'deleteBuffer', 'deleteVertexArray']) {
    api[name] = (() => { deleted += 1; log.push(name); }) as never;
  }

  const proxy = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'canvas') return state.canvas;
      if (prop in api) return api[prop];
      /* FRAMEBUFFER_COMPLETE has to be the value `checkFramebufferStatus` returns above, and the rest only
         have to be distinct — the stage does arithmetic on none of them. */
      if (prop === 'FRAMEBUFFER_COMPLETE') return 0x8CD5;
      if (/^[A-Z][A-Z0-9_]*$/.test(prop)) return ENUM(prop);
      return (...a: unknown[]) => { log.push(prop); return a.length; };
    },
  }) as unknown as WebGL2RenderingContext;

  return state as FakeGl;
}

const stageOn = (f: FakeGl) => createStage(f.canvas as unknown as HTMLCanvasElement, { alpha: true });

describe('dispose releases the CONTEXT SLOT, which deleting objects does not', () => {
  it('loses the context on a canvas that has left the document, AFTER freeing its objects', () => {
    /*
     * THE DEFECT: `dispose()` deleted programs, targets, the buffer and the VAO and never called
     * `WEBGL_lose_context.loseContext()`, so the context itself survived until its canvas was
     * garbage-collected — a moment the engine chooses. Toggling a relief off and on could therefore hold
     * more live contexts than there are mounted components, and past the browser cap (commonly 8-16) the
     * OLDEST context is killed silently. On any chart route the oldest is `flat/shared.ts`'s single shared
     * context, so the first casualty is every chart on the page at once.
     *
     * ORDER MATTERS AS MUCH AS THE CALL: on a lost context every `delete*` is a silent no-op, so losing
     * first would leak exactly what this function exists to free. Asserted as an index comparison rather
     * than "loseContext was called", because a future tidy-up moving one line up is invisible otherwise.
     */
    const f = fakeGl({ connected: false });
    const out = stageOn(f);
    if (!isStage(out)) expect.unreachable(`the fake context should have produced a stage: ${out.code}`);
    out.dispose();

    expect(f.log.filter((l) => l === 'loseContext').length, 'the context was never released').toBe(1);
    expect(f.deleted(), 'nothing was deleted, so this test is not watching a real dispose').toBeGreaterThan(4);
    expect(f.log.lastIndexOf('deleteVertexArray'), 'the VAO delete landed on an already-lost context')
      .toBeLessThan(f.log.indexOf('loseContext'));
    expect(f.isLost(), 'the context slot is still held').toBe(true);
  });

  it('does NOT lose the context while the canvas is still mounted, so an in-place rebuild still works', () => {
    /*
     * THE REGRESSION THIS GUARD EXISTS TO PREVENT, and it would be worse than the leak it fixes.
     *
     * Every relief in `apps/web` rebuilds IN PLACE when its size step or its resolved quality tier changes:
     * the effect's cleanup disposes and the effect re-runs on the SAME canvas element. Because a canvas only
     * ever hands out one context, an unconditional `loseContext()` would give that rebuild a permanently
     * lost context back — `createTexture` null, framebuffer never COMPLETE — and the surface would refuse to
     * flat for the rest of the page's life after one window resize.
     *
     * Removing the `canvas.isConnected` guard fails this test with FRAMEBUFFER_INCOMPLETE, which is the
     * exact refusal a reader would have met.
     */
    const f = fakeGl({ connected: true });
    const first = stageOn(f);
    if (!isStage(first)) expect.unreachable(`first build refused: ${first.code}`);
    first.dispose();

    const second = stageOn(f);
    expect(
      isStage(second) ? 'stage' : second.code,
      'the in-place rebuild got a dead context back: this is what an unguarded loseContext() costs',
    ).toBe('stage');
    expect(f.log.includes('loseContext'), 'a mounted canvas had its context killed under it').toBe(false);
    expect(f.isLost()).toBe(false);
  });

  it('a driver without the extension, and a context already lost, both dispose without throwing', () => {
    /*
     * `WEBGL_lose_context` is optional, and `getExtension` returns null on a context that is ALREADY lost —
     * which is the state a second `dispose()` finds. Both paths must be no-ops rather than a TypeError on
     * `undefined.loseContext`, because a throw here happens inside a React effect cleanup, where it takes
     * the whole subtree down and destroys the flat surface the relief was supposed to fall back to.
     *
     * The `empty-object` case is not hypothetical: the fake context in `env/glState.test.ts` answers every
     * `getExtension` with `{}`, so an unguarded `lose.loseContext()` would fail that suite too.
     */
    for (const extension of ['absent', 'empty-object'] as const) {
      const f = fakeGl({ connected: false, extension });
      const out = stageOn(f);
      if (!isStage(out)) expect.unreachable(`${extension}: build refused ${out.code}`);
      expect(() => out.dispose(), `${extension} threw out of dispose`).not.toThrow();
      expect(f.log.includes('loseContext'), `${extension} somehow lost the context`).toBe(false);
      expect(f.deleted(), `${extension}: nothing was freed`).toBeGreaterThan(4);
    }

    const twice = fakeGl({ connected: false });
    const out = stageOn(twice);
    if (!isStage(out)) expect.unreachable('build refused');
    out.dispose();
    expect(() => out.dispose(), 'a second dispose threw on an already-lost context').not.toThrow();
    expect(twice.log.filter((l) => l === 'loseContext').length, 'the context was lost twice').toBe(1);
  });
});

/* ── THE TARGET CACHE ─────────────────────────────────────────────────────────────── */

const tally = (f: FakeGl, call: string) => f.log.filter((l) => l === call).length;

/** A stage on a fresh fake context, with the build set's three allocations already counted. */
function cached(): { f: FakeGl; s: Stage; built: number } {
  const f = fakeGl({ connected: false });
  const s = stageOn(f);
  if (!isStage(s)) throw new Error(`the fake context should have produced a stage: ${s.code}`);
  const built = tally(f, 'createTexture');
  if (built !== 3) throw new Error(`the build set is no longer three targets but ${built}`);
  return { f, s, built };
}

describe('setRegion keeps a set per size instead of rebuilding on every change', () => {
  it('allocates once per DISTINCT size, not once per size CHANGE', () => {
    /*
     * THE DEFECT AND ITS NUMBER. `setRegion` short-circuited only on an identical size, so a page
     * whose charts differ deleted three framebuffers and three textures and allocated six on every
     * single render: 39 texture allocations against 6 for four charts alternating two sizes over
     * three redraws (`flat/sharedCost.test.ts`), repeated per animation frame through
     * `useFlatChart`'s 420 ms entrance. Against the pre-cache code the counts below are 18 and 18.
     */
    const { f, s, built } = cached();
    for (let pass = 0; pass < 3; pass++) { s.setRegion(480, 160); s.setRegion(320, 320); }
    expect(tally(f, 'createTexture') - built,
      'a size the page is still alternating with was rebuilt rather than kept').toBe(6);
    expect(tally(f, 'deleteTexture'),
      'a set still in the rotation was freed, so the next render must rebuild it').toBe(0);
  });

  it('hands back the SAME textures when a size comes round again', () => {
    /* Counting allocations cannot tell "kept" from "rebuilt into a new object that happens to
       cost the same". Identity can, and identity is what the GPU pays for. */
    const { s } = cached();
    s.setRegion(480, 160);
    const scene = s.scene.texture, bloom = s.bloomA.texture;
    s.setRegion(320, 320);
    expect(s.scene.texture, 'a different size somehow reused the same texture').not.toBe(scene);
    s.setRegion(480, 160);
    expect(s.scene.texture, 'the scene target was rebuilt for a size already held').toBe(scene);
    expect(s.bloomA.texture, 'the bloom target was rebuilt for a size already held').toBe(bloom);
  });

  it('allocates the scene at the region EXACTLY — the quantisation trap in §10.7', () => {
    /*
     * A GUARD AGAINST THE NEXT FIX, not a regression test: the pre-cache code passes it too.
     *
     * `3D_VFX_FINAL_PLAN.md` §10.7 proposes closing the same thrash by allocating the targets on a
     * 256 px grid while keeping the region exact. It is wrong one layer below the viewport hazard
     * it was written around: `look/pipeline.ts` draws every pass as a full-screen triangle whose
     * `uv` is normalised to the VIEWPORT and samples its sources with that same `uv`, normalised to
     * the whole TEXTURE. Allocate this 480x40 chart's scene at 1024x512 and the composite reads
     * `uv` 0 to 1 across all 1024x512 while writing a 480x40 viewport, so the chart lands in the
     * bottom-left 47% x 8% of its own rectangle with the previous chart's pixels around it, and
     * nothing throws. Twenty-four `stage.blit` call sites make the same assumption.
     */
    const { s } = cached();
    s.setRegion(480, 40);
    expect([s.scene.width, s.scene.height], 'the scene target is no longer the region itself')
      .toEqual([480, 40]);
    expect([s.bloomA.width, s.bloomA.height], 'the bloom chain is no longer region >> 2')
      .toEqual([120, 10]);
    expect([s.width, s.height], 'the region stopped being the size the caller asked for')
      .toEqual([480, 40]);
  });

  it('bounds what it keeps by AREA, because area is what GPU memory is', () => {
    /*
     * The spares are capped at `TARGET_CACHE_TEXELS` scene texels. Sizes chosen so the cap is what
     * decides, not the count: 1.60 Mpx then 1.20 Mpx are both held (2.60 Mpx of spares would be
     * over, so the 64x64 build set goes first, and 2.80 is still over so the 1600x1000 goes too).
     * Without the area cap the third size would keep both and the assertion below reads 0 deletes.
     */
    const { f, s } = cached();
    s.setRegion(1600, 1000);
    s.setRegion(1200, 1000);
    expect(tally(f, 'deleteTexture'), 'a spare was freed while the budget still had room').toBe(0);
    s.setRegion(900, 900);
    expect(tally(f, 'deleteTexture'), 'the spare budget did not evict anything').toBe(6);

    const before = tally(f, 'createTexture');
    s.setRegion(1200, 1000);
    expect(tally(f, 'createTexture'), 'the most recent spare was evicted before the oldest')
      .toBe(before);
    s.setRegion(1600, 1000);
    expect(tally(f, 'createTexture') - before, 'an evicted size came back without being rebuilt')
      .toBe(3);
  });

  it('dispose frees every cached set, not only the one in use', () => {
    /*
     * A LEAK GUARD ON THE CACHE ITSELF. The pre-cache code passes this trivially — it only ever
     * held one set — which is exactly why it needs writing down now: the spares are reachable
     * from nothing but the map, so a `dispose()` that freed `active` alone would strand up to
     * `TARGET_CACHE_TEXELS` of colour attachments on a context nobody can reach again. Deleting
     * the loop over the map in `dispose()` fails this with 6 against 12.
     */
    const { f, s } = cached();
    s.setRegion(480, 160);
    s.setRegion(320, 320);
    s.setRegion(200, 100);
    const created = tally(f, 'createTexture');
    expect(created, 'the sets under test were never built').toBe(12);
    s.dispose();
    expect(tally(f, 'deleteTexture'), 'a cached spare outlived the stage that owned it')
      .toBe(created);
  });
});

/* ── THE PROGRAM CACHE ────────────────────────────────────────────────────────────── */

/**
 * WHAT IT IS FOR, AND THE NUMBER. A relief rebuilds IN PLACE on a size step or a tier resolution —
 * every one of the seven keys its setup effect on `[heightPx, onRefused, tier]`, and
 * `GlobeRelief.tsx:99` quantises the measured height to 24 px BECAUSE each distinct value tears the
 * stage down, so a window drag walks through one rebuild per 24 px. Measured on the real M1 through
 * ANGLE Metal by `docs/3d/blit-cost.mjs` arm H over seven runs, a relief-shaped rebuild costs
 * **23.2 to 27.6 ms** with every program recompiled and **6.1 to 7.4 ms** with every program kept —
 * **3.6 to 4.7x**, and resolved above the run's own spread every time. Compilation is essentially
 * the whole of a rebuild.
 *
 * WHAT THIS FILE'S CACHE ACTUALLY RECOVERS IS FAR LESS THAN THAT, and the tests below are written
 * against the MECHANISM rather than the headline for exactly that reason. Thirteen call sites
 * outside `stage.ts` delete the programs the stage compiled for them — `env/lit.ts:883-885`,
 * `env/ao.ts:354`, `env/sky.ts:159`, `env/dof.ts:219`, `env/volume.ts:500`,
 * `env/particles.ts:596-597`, `primitives/points.ts`, `primitives/lines.ts`, `flat/bars.ts:276`,
 * `flat/strokes.ts:168` — ten modules, counted by the ratchet below rather than listed, so nothing
 * written here can keep those programs. `look/pipeline.ts:197` already leaves them to the stage.
 *
 * SO THE TIME THIS CACHE SAVES ON ITS OWN IS NOT REPORTABLE: 1.0 to 6.2 ms, clearing the run's
 * spread in one of seven. The quantity that IS exact is the count, and it is what these tests pin:
 * **24 shader compilations per rebuild today, 16 with this cache, 0 with those thirteen lines also
 * fixed.** The cache has to land first — removing those thirteen deletes without somewhere for the
 * programs to live is a straight leak — which is why it ships ahead of the number that justifies it.
 */
const compilesIn = (f: FakeGl): number => f.log.filter((l) => l === 'createProgram').length;

describe('the program cache keeps a linked program across a rebuild on the same canvas', () => {
  it('a rebuild in place recompiles nothing, and gets the SAME program object back', () => {
    /*
     * THE OPERATION UNDER TEST, exactly: a mounted canvas, disposed and built again. That is what a
     * React effect cleanup and re-run do on a size step, and `canvas.isConnected` is what tells the
     * two apart. Against the pre-cache code this reads 2 programs and two different objects.
     */
    const f = fakeGl({ connected: true });
    const first = stageOn(f);
    if (!isStage(first)) expect.unreachable(`first build refused: ${first.code}`);
    const p1 = first.compile('VS', 'FS');
    expect(compilesIn(f), 'the first build did not compile anything, so nothing is under test').toBe(1);
    first.dispose();

    const second = stageOn(f);
    if (!isStage(second)) expect.unreachable(`rebuild refused: ${second.code}`);
    const p2 = second.compile('VS', 'FS');
    expect(compilesIn(f), 'the rebuild recompiled a program the context still holds').toBe(1);
    expect(p2, 'the rebuild got a different program object, so nothing was reused').toBe(p1);
  });

  it('BOTH sources are the key — a shared vertex shader does not collapse two programs', () => {
    /*
     * `env/ao.ts:229-231` compiles AO_VERT with AO_FRAG and AO_VERT with BLUR_FRAG, and
     * `env/lit.ts:735-739` reuses SHADOW_FRAG under two different vertex shaders. A cache keyed on
     * either source alone returns the wrong program for one of each pair, and the frame that
     * results is wrong rather than absent — the exact failure mode §10.9 records.
     */
    const f = fakeGl({ connected: true });
    const s = stageOn(f);
    if (!isStage(s)) expect.unreachable(`refused: ${s.code}`);
    const a = s.compile('VS', 'FRAG_A');
    const b = s.compile('VS', 'FRAG_B');
    const c = s.compile('VS_OTHER', 'FRAG_A');
    expect(new Set([a, b, c]).size, 'two source pairs collapsed onto one program').toBe(3);
    expect(compilesIn(f)).toBe(3);
    expect(s.compile('VS', 'FRAG_B'), 'the second lookup of a held pair missed').toBe(b);
    expect(compilesIn(f), 'a pair already held was recompiled').toBe(3);
  });

  it('never hands a program from one context to another, which would be a use-after-free', () => {
    /*
     * A `WebGLProgram` belongs to its CONTEXT. Keyed on source alone, the second canvas below would
     * receive the first canvas's program — and the moment the first canvas is disposed and its
     * context released, the second would be drawing with a name that no longer exists. Nothing
     * throws; the surface simply stops drawing that pass.
     */
    const one = fakeGl({ connected: true });
    const two = fakeGl({ connected: true });
    const s1 = stageOn(one), s2 = stageOn(two);
    if (!isStage(s1) || !isStage(s2)) expect.unreachable('a build refused');
    const p1 = s1.compile('VS', 'FS');
    const p2 = s2.compile('VS', 'FS');
    expect(p2, 'a program crossed contexts').not.toBe(p1);
    expect(compilesIn(one), 'the first context compiled the wrong number').toBe(1);
    expect(compilesIn(two), 'the second context reused rather than compiled').toBe(1);
  });

  it('frees every cached program when — and only when — it releases the context', () => {
    /*
     * OWNERSHIP, AND WHY THERE IS NO REFERENCE COUNT. A program cannot outlive its context, so the
     * context's own release is both the earliest safe moment to free them and a bound that needs no
     * bookkeeping. A mounted canvas keeps them because an in-place rebuild is the only thing that
     * ever follows that dispose; a detached one can never be drawn to again, so nothing is left to
     * use them. Deleting the `canvas.isConnected` guard makes the first half read 1 and 0.
     */
    const mounted = fakeGl({ connected: true });
    const live = stageOn(mounted);
    if (!isStage(live)) expect.unreachable('refused');
    live.compile('VS', 'FS');
    live.dispose();
    expect(mounted.liveProgrammes(), 'a rebuild that is about to happen lost its programs').toBe(1);
    expect(mounted.log.includes('deleteProgram'), 'a mounted canvas had its programs deleted').toBe(false);

    const detached = fakeGl({ connected: false });
    const gone = stageOn(detached);
    if (!isStage(gone)) expect.unreachable('refused');
    gone.compile('VS', 'FS');
    gone.compile('VS2', 'FS2');
    gone.dispose();
    expect(detached.liveProgrammes(), 'a released context leaked its programs').toBe(0);
    expect(detached.log.lastIndexOf('deleteProgram'), 'a program was deleted on an already-lost context')
      .toBeLessThan(detached.log.indexOf('loseContext'));
  });

  it('does not hand back a program another owner deleted', () => {
    /*
     * THE HAZARD THIS CACHE INHERITED RATHER THAN CREATED. Thirteen call sites listed at the top of
     * this block delete programs the stage also holds; `look/pipeline.ts:197` is the only one that
     * leaves them to the stage. So a cached entry can be freed under the cache at any time, and a
     * deleted program draws NOTHING and reports nothing. Removing the `gl.isProgram` check makes
     * this pass the dead program straight back: 1 program compiled, not 2.
     */
    const f = fakeGl({ connected: true });
    const s = stageOn(f);
    if (!isStage(s)) expect.unreachable('refused');
    const p = s.compile('VS', 'FS');
    (f.canvas.getContext() as WebGL2RenderingContext).deleteProgram(p as WebGLProgram);
    expect(f.liveProgrammes(), 'the fake did not actually delete it, so this test watches nothing').toBe(0);

    const again = s.compile('VS', 'FS');
    expect(compilesIn(f), 'the cache handed back a deleted program').toBe(2);
    expect(again, 'the dead program came back').not.toBe(p);
  });

  it('does not hand back a program that is FLAGGED for deletion, which is still a program', () => {
    /*
     * THE ONE THE OBVIOUS GUARD MISSES, and it was found by measurement rather than by reading.
     * `deleteProgram` on the program that is CURRENTLY BOUND does not delete it — the spec only
     * FLAGS it, and the driver frees it when something else is bound. Such a program answers
     * `isProgram` with true, so a cache that checks only that hands it out and it then dies
     * mid-frame at the next `useProgram`.
     *
     * MEASURED, not hypothesised: `blit-cost.mjs` arm H rendered 30 frames through three rebuild
     * arms and produced TWO distinct frame hashes, alternating — every other rebuild composited
     * with a program that had died between being handed out and being used. With the
     * `DELETE_STATUS` query in place the same 30 frames produce one hash. Delete that query and
     * this test reports 1 compile instead of 2.
     */
    const f = fakeGl({ connected: true });
    const s = stageOn(f);
    if (!isStage(s)) expect.unreachable('refused');
    const p = s.compile('VS', 'FS');
    const gl = f.canvas.getContext() as WebGL2RenderingContext;
    gl.useProgram(p as WebGLProgram);          // as `blit` does on the last pass of a frame
    gl.deleteProgram(p as WebGLProgram);       // as a renderer's own dispose() does, straight after
    expect(gl.isProgram(p as WebGLProgram), 'the fake deleted it outright, so the flag is untested')
      .toBe(true);

    const again = s.compile('VS', 'FS');
    expect(compilesIn(f), 'the cache handed back a program flagged for deletion').toBe(2);
    expect(again).not.toBe(p);
  });

  it('caches successes only — a refusal is not remembered as one', () => {
    /*
     * A cached refusal would return the FIRST driver log for every later compile of that pair, and
     * the log's line number is the only part of a shader error that is actionable. It would also
     * make a link failure permanent for the life of the context.
     */
    const f = fakeGl({ connected: true });
    const s = stageOn(f);
    if (!isStage(s)) expect.unreachable('refused');
    /* Injected at the status query rather than in the GLSL: the shape of the refusal is what is
       under test, not a driver's opinion of a shader. `env/glState.test.ts:305` does the same. */
    f.failLink = true;
    const refused = s.compile('VS', 'FS');
    expect(refused, 'the link failure was not injected').toMatchObject({ code: 'PROGRAM_LINK_FAILED' });
    f.failLink = false;
    const ok = s.compile('VS', 'FS');
    expect('kind' in (ok as object), 'the refusal was cached and returned again').toBe(false);
    expect(compilesIn(f), 'the retry did not reach the driver').toBe(2);
  });
});

describe('the source pair is a SUFFICIENT key, and that is derived rather than asserted', () => {
  /*
   * THE PREMISE THE WHOLE CACHE RESTS ON. A linked program is a pure function of
   * (context, vertexSrc, fragmentSrc) only while nothing else contributes to the link — no
   * `bindAttribLocation`, no `transformFeedbackVaryings`, and no second place that links at all.
   * If any of those appeared outside `compile()`, two programs with identical sources could differ
   * and the cache would hand back the wrong one, silently.
   *
   * SEARCHED, NOT LISTED. Every recurring defect in this package has been a hand-list that could
   * not fail on the item nobody thought of, so this walks the source tree and would fail on a
   * module written tomorrow.
   */
  const SRC = resolve(process.cwd(), 'src');
  const sources = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((p) => p.endsWith('.ts') && !p.endsWith('.test.ts'))
    .map((p) => ({ path: p, text: readFileSync(resolve(SRC, p), 'utf8') }));

  it('found the package to search, so the assertions below are not vacuous', () => {
    expect(sources.length, 'the source walk found nothing').toBeGreaterThan(15);
    expect(sources.map((s) => s.path)).toContain('stage.ts');
  });

  /**
   * THE RATCHET ON THE OTHER HALF OF THIS CHANGE, and it is a count from a search rather than the
   * list of file:line references that would rot the moment anyone reformats one of them.
   *
   * Every module here deletes a program `stage.compile()` also holds, which is why the cache has to
   * verify each hit and why it recovers 16 shader compilations a rebuild instead of 24
   * (`blit-cost.mjs` arm H). `look/pipeline.ts` is deliberately NOT among them — "Programs are
   * owned and freed by the Stage" — and its three programs are most of what the cache does keep.
   *
   * This number is expected to go DOWN, to zero, and this test failing is the signal that it has:
   * arm H measured that change at 3.6 to 4.7x on a rebuild. It also fails if a NEW module starts
   * deleting programs, which is the case a hand-written list could never have caught — that
   * module's programs would silently stop being cacheable and nothing else would say so.
   */
  it('counts the modules that delete a program the stage also holds', () => {
    const owners = sources
      .filter((s) => s.path !== 'stage.ts' && /\bgl\.deleteProgram\s*\(/.test(s.text))
      .map((s) => s.path)
      .sort();
    expect(owners, 'the search found none, so it is matching nothing').not.toEqual([]);
    expect(
      owners.length,
      'the set of modules that free their own programs changed. DOWN means the second half of the '
      + 'program-cache work has landed and this cache can now keep everything — re-run '
      + '`node docs/3d/blit-cost.mjs --headless --gpu` arm H and update the figures in stage.ts. '
      + `UP means a new module opted out of the cache without saying so. Current set: ${owners.join(', ')}`,
    ).toBe(11); // 11 since P3: look/aa.ts frees its FXAA program in dispose(), one per stage, like the other ten
  });

  it('nothing but compile() creates a program, links one, or sets pre-link state', () => {
    const offenders = sources
      .filter((s) => s.path !== 'stage.ts')
      .filter((s) => /\b(createProgram|linkProgram|bindAttribLocation|transformFeedbackVaryings)\s*\(/.test(s.text))
      .map((s) => s.path);
    expect(
      offenders,
      'a program is being built outside stage.compile(), so the source pair no longer determines it '
      + 'and the cache can return a program linked under different state',
    ).toEqual([]);
  });

  it('and compile() itself sets nothing between createProgram and linkProgram but the two shaders', () => {
    const src = readFileSync(resolve(SRC, 'stage.ts'), 'utf8');
    const between = src.slice(src.indexOf('gl.createProgram()'), src.indexOf('gl.linkProgram(p)'));
    expect(between.length, 'the createProgram/linkProgram pair moved and this slice is empty')
      .toBeGreaterThan(20);
    expect(between.match(/gl\.\w+\(/g) ?? [], 'compile() gained pre-link state the cache key cannot see')
      .toEqual(['gl.createProgram(', 'gl.attachShader(', 'gl.attachShader(']);
  });
});

describe('the depth policy is stated, not implied', () => {
  it('says WHY additive fields skip the depth test', () => {
    // Depth-test-off looks like an oversight unless the reason is written down. The
    // quantity is a sum; a depth test would discard terms of it.
    expect(DEPTH_POLICY).toMatch(/sum/);
    expect(DEPTH_POLICY).toMatch(/polygon offset/i);
  });
});
