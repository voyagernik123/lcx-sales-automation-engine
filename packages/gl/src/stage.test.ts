import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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
  /** What `getExtension('WEBGL_lose_context')` hands back. */
  extension: 'real' | 'absent' | 'empty-object';
}

function fakeGl(opts: { connected: boolean; extension?: FakeGl['extension'] } = { connected: false }): FakeGl {
  const log: string[] = [];
  let lost = false;
  let deleted = 0;
  const state = {
    canvas: { isConnected: opts.connected, width: 64, height: 64, getContext: () => proxy },
    log,
    deleted: () => deleted,
    isLost: () => lost,
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
  };
  for (const name of ['deleteTexture', 'deleteFramebuffer', 'deleteBuffer', 'deleteVertexArray', 'deleteProgram']) {
    api[name] = (() => { deleted += 1; log.push(name); }) as never;
  }

  const proxy = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'canvas') return state.canvas;
      if (prop in api) return api[prop];
      /* FRAMEBUFFER_COMPLETE has to be the value `checkFramebufferStatus` returns above, and the rest only
         have to be distinct — the stage does arithmetic on none of them. */
      if (prop === 'FRAMEBUFFER_COMPLETE') return 0x8CD5;
      if (/^[A-Z][A-Z0-9_]*$/.test(prop)) return 0x1000 + prop.length;
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

describe('the depth policy is stated, not implied', () => {
  it('says WHY additive fields skip the depth test', () => {
    // Depth-test-off looks like an oversight unless the reason is written down. The
    // quantity is a sum; a depth test would discard terms of it.
    expect(DEPTH_POLICY).toMatch(/sum/);
    expect(DEPTH_POLICY).toMatch(/polygon offset/i);
  });
});
