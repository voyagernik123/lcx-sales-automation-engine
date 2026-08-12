import { describe, expect, it } from 'vitest';
import { createStage, isStage } from '../stage.js';
import type { StageRefusal } from '../stage.js';
import { createTarget3D, createShadowMap } from './target3d.js';
import { createLitRenderer, uploadMesh } from './lit.js';
import { createSkyBackdrop, DEFAULT_SKY } from './sky.js';
import { createAmbientOcclusion } from './ao.js';
import { createDepthOfField } from './dof.js';
import { createParticleField } from './particles.js';
import { createVolumeField } from './volume.js';
import { box } from './mesh.js';
import { IDENTITY } from '../math.js';

/*
 * THE INSTRUMENT THAT WOULD HAVE CAUGHT ALL FOUR OF THEM.
 *
 * Four separate defects in this engine were the same defect: a pass that sets GL state and does not
 * put it back. `particles.step` left the viewport at its 32x32 state-texture size, `volume.draw` left
 * the depth test disabled, `ao.compute` left CULL_FACE disabled and the viewport at half resolution,
 * `lit.draw` left the shadow map and the AO texture bound on units 0 and 1. Nine environments and
 * several audits missed every one, for one reason: the environments call their passes in an order
 * where each leftover lands somewhere harmless, and a comment in one harness ("stepped FIRST,
 * because…") was doing the work an assertion should do.
 *
 * The engine's other lifecycle invariant failed the same way. `stage.compile` created two shader
 * objects per program and deleted none, on any path — 20 created and 0 deleted across a full engine
 * construction, and still 20 after every `dispose()` AND `stage.dispose()`, because deleting a
 * program does not free a shader that was never flagged for deletion.
 *
 * ── WHY A FAKE CONTEXT, AND WHY THAT IS NOT A CHEAT ──────────────────────────────────
 * There is no WebGL2 in Node, and the two things asserted here are not about PIXELS: they are about
 * the sequence of calls a pass makes. A fake context that MODELS the state those calls change — the
 * enable bits, the viewport, the bindings, the object tables — answers both questions exactly, and it
 * answers them in the gate in milliseconds rather than in a ten-minute headless sweep. The pixel
 * questions stay where they belong, in the captures.
 *
 * The findings themselves were reproduced against a real driver first (Playwright + SwiftShader): 20
 * shaders created / 0 deleted, "0,0,640,400 -> 0,0,32,32" on the viewport, GL_INVALID_OPERATION and
 * zero lit pixels for the feedback loop. This file is the ratchet, not the discovery.
 */

/* ── A WEBGL2 CONTEXT WITH A STATE MODEL ─────────────────────────────────────────── */

interface GlObject { readonly tag: string; readonly id: number }

interface Fake {
  readonly gl: WebGL2RenderingContext;
  readonly canvas: HTMLCanvasElement;
  readonly counts: Record<string, number>;
  readonly liveShaders: () => number;
  readonly liveProgrammes: () => number;
  snapshot(): Record<string, unknown>;
  /** Release every unit, which is the state the engine's own discipline says a frame sits in. */
  releaseUnits(): void;
  /** Injection points for the two refusal paths. The Proxy below cannot be patched from outside. */
  fail(what: 'compile' | 'link' | 'none'): void;
}

function fakeContext(width = 640, height = 400): Fake {
  /*
   * TEXTUREn AND COLOR_ATTACHMENTn GET THEIR REAL VALUES, because the engine does arithmetic on
   * them — `gl.activeTexture(gl.TEXTURE0 + unit)` — and an auto-numbered constant would make
   * `activeTexture(TEXTURE1)` and `activeTexture(TEXTURE0 + 1)` two different units. Everything else
   * only ever has to be distinct.
   */
  const K = new Map<string, number>();
  let nextK = 0x10000;
  const konst = (name: string): number => {
    const found = K.get(name);
    if (found !== undefined) return found;
    const unit = /^TEXTURE(\d{1,2})$/.exec(name);
    const attach = /^COLOR_ATTACHMENT(\d{1,2})$/.exec(name);
    const v = unit ? 0x84C0 + Number(unit[1]) : attach ? 0x8CE0 + Number(attach[1]) : nextK++;
    K.set(name, v);
    return v;
  };

  let nextId = 1;
  const make = (tag: string): GlObject => ({ tag, id: nextId++ });
  const shaders = new Set<GlObject>();
  const programmes = new Set<GlObject>();
  const counts: Record<string, number> = {};
  const bump = (n: string) => { counts[n] = (counts[n] ?? 0) + 1; };

  let compileOk = true, linkOk = true;
  const caps = new Set<number>();
  let viewport: [number, number, number, number] = [0, 0, width, height];
  let scissor: [number, number, number, number] = [0, 0, width, height];
  let unit = 0;
  let framebuffer: GlObject | null = null;
  let vao: GlObject | null = null;
  let programme: GlObject | null = null;
  let depthWrite = true;
  let depthFn = konst('LESS');
  let blend: [number, number] = [konst('ONE'), konst('ZERO')];
  let cullMode = konst('BACK');
  let colourMask: boolean[] = [true, true, true, true];
  const bindings = new Map<string, GlObject | null>();
  const attachments = new Map<number, Map<number, GlObject>>();
  const texKey = (u: number, target: number) => `${u}:${target}`;

  const api: Record<string, (...a: never[]) => unknown> = {
    getExtension: () => ({}),
    getSupportedExtensions: () => [],
    getError: () => 0,
    getShaderParameter: () => compileOk,
    getProgramParameter: () => linkOk,
    getShaderInfoLog: () => '',
    getProgramInfoLog: () => '',
    getUniformLocation: () => make('location'),
    getAttribLocation: () => 0,
    checkFramebufferStatus: () => konst('FRAMEBUFFER_COMPLETE'),
    createShader: () => { const s = make('shader'); shaders.add(s); bump('createShader'); return s; },
    deleteShader: ((s: GlObject) => { shaders.delete(s); bump('deleteShader'); }) as never,
    createProgram: () => { const p = make('program'); programmes.add(p); bump('createProgram'); return p; },
    deleteProgram: ((p: GlObject) => { programmes.delete(p); bump('deleteProgram'); }) as never,
    isShader: ((s: GlObject) => shaders.has(s)) as never,
    isProgram: ((p: GlObject) => programmes.has(p)) as never,
    createTexture: () => make('texture'),
    createFramebuffer: () => make('framebuffer'),
    createRenderbuffer: () => make('renderbuffer'),
    createBuffer: () => make('buffer'),
    createVertexArray: () => make('vao'),

    enable: ((c: number) => { caps.add(c); }) as never,
    disable: ((c: number) => { caps.delete(c); }) as never,
    viewport: ((x: number, y: number, w: number, h: number) => { viewport = [x, y, w, h]; }) as never,
    scissor: ((x: number, y: number, w: number, h: number) => { scissor = [x, y, w, h]; }) as never,
    activeTexture: ((t: number) => { unit = t - konst('TEXTURE0'); }) as never,
    bindTexture: ((target: number, tex: GlObject | null) => {
      bindings.set(texKey(unit, target), tex ?? null);
    }) as never,
    bindFramebuffer: ((_t: number, f: GlObject | null) => { framebuffer = f ?? null; }) as never,
    framebufferTexture2D: ((_t: number, att: number, _tt: number, tex: GlObject) => {
      const id = framebuffer ? framebuffer.id : 0;
      let m = attachments.get(id);
      if (!m) { m = new Map(); attachments.set(id, m); }
      m.set(att, tex);
    }) as never,
    getFramebufferAttachmentParameter: ((_t: number, att: number, pname: number) => {
      const tex = attachments.get(framebuffer ? framebuffer.id : 0)?.get(att) ?? null;
      if (pname === konst('FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE')) {
        return tex ? konst('TEXTURE') : konst('NONE');
      }
      return tex;
    }) as never,
    depthMask: ((v: boolean) => { depthWrite = v; }) as never,
    depthFunc: ((v: number) => { depthFn = v; }) as never,
    blendFunc: ((s: number, d: number) => { blend = [s, d]; }) as never,
    cullFace: ((m: number) => { cullMode = m; }) as never,
    colorMask: ((...m: boolean[]) => { colourMask = m; }) as never,
    useProgram: ((p: GlObject | null) => { programme = p ?? null; }) as never,
    bindVertexArray: ((v: GlObject | null) => { vao = v ?? null; }) as never,

    getParameter: ((p: number) => {
      if (p === konst('VIEWPORT')) return new Int32Array(viewport);
      if (p === konst('SCISSOR_BOX')) return new Int32Array(scissor);
      if (p === konst('ACTIVE_TEXTURE')) return konst('TEXTURE0') + unit;
      if (p === konst('FRAMEBUFFER_BINDING')) return framebuffer;
      if (p === konst('CURRENT_PROGRAM')) return programme;
      if (p === konst('VERTEX_ARRAY_BINDING')) return vao;
      if (p === konst('DEPTH_WRITEMASK')) return depthWrite;
      if (p === konst('DEPTH_FUNC')) return depthFn;
      if (p === konst('BLEND_SRC_RGB')) return blend[0];
      if (p === konst('BLEND_DST_RGB')) return blend[1];
      if (p === konst('CULL_FACE_MODE')) return cullMode;
      if (p === konst('COLOR_WRITEMASK')) return [...colourMask];
      if (p === konst('TEXTURE_BINDING_2D')) return bindings.get(texKey(unit, konst('TEXTURE_2D'))) ?? null;
      if (p === konst('TEXTURE_BINDING_3D')) return bindings.get(texKey(unit, konst('TEXTURE_3D'))) ?? null;
      /* The enable bits share their names with the caps, exactly as real GL does. */
      return caps.has(p);
    }) as never,
  };

  const gl = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined;
      if (/^[A-Z][A-Z0-9_]*$/.test(prop)) return konst(prop);
      const impl = api[prop];
      if (impl) return impl;
      /* Everything else is a void command. Counted, so a test can assert one was made at all. */
      return (...a: never[]) => { bump(prop); void a; return undefined; };
    },
  }) as unknown as WebGL2RenderingContext;

  const canvas = {
    width, height, clientWidth: width, clientHeight: height, getContext: () => gl,
  } as unknown as HTMLCanvasElement;

  /*
   * WHAT A PASS MAY NOT CHANGE. The framebuffer and the viewport decide WHERE a draw lands; the four
   * enable bits and the write masks decide WHETHER it lands; the bindings are how a feedback loop
   * happens. `DEPTH_FUNC`, `BLEND_SRC_RGB`, `BLEND_DST_RGB` and `CURRENT_PROGRAM` are deliberately
   * absent — see passState.ts for why those three are caller-owned rather than restorable.
   */
  const snapshot = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {
      FRAMEBUFFER_BINDING: framebuffer,
      VIEWPORT: viewport.join(','),
      SCISSOR_BOX: scissor.join(','),
      DEPTH_TEST: caps.has(konst('DEPTH_TEST')),
      DEPTH_WRITEMASK: depthWrite,
      CULL_FACE: caps.has(konst('CULL_FACE')),
      BLEND: caps.has(konst('BLEND')),
      SCISSOR_TEST: caps.has(konst('SCISSOR_TEST')),
      COLOR_WRITEMASK: colourMask.join(','),
      ACTIVE_TEXTURE: unit,
      VERTEX_ARRAY_BINDING: vao,
    };
    for (let u = 0; u < 4; u++) {
      out[`TEXTURE_BINDING_2D_${u}`] = bindings.get(texKey(u, konst('TEXTURE_2D'))) ?? null;
      out[`TEXTURE_BINDING_3D_${u}`] = bindings.get(texKey(u, konst('TEXTURE_3D'))) ?? null;
    }
    return out;
  };

  return {
    gl, canvas, counts, snapshot,
    liveShaders: () => shaders.size,
    liveProgrammes: () => programmes.size,
    releaseUnits() {
      for (let u = 0; u < 4; u++) {
        bindings.set(texKey(u, konst('TEXTURE_2D')), null);
        bindings.set(texKey(u, konst('TEXTURE_3D')), null);
      }
      unit = 0;
    },
    fail(what) {
      compileOk = what !== 'compile';
      linkOk = what !== 'link';
    },
  };
}

/** Everything in the engine that compiles a program, built once. */
function buildEngine(fake: Fake) {
  const out = createStage(fake.canvas, {});
  if (!isStage(out)) throw new Error(`the fake context refused a stage: ${out.code}`);
  const stage = out;
  /* `Exclude`, not a cast: with a plain `<T>(v: T | StageRefusal) => T` the compiler infers T as the
     whole union — StageRefusal is assignable to both halves — and every use site loses its methods. */
  const unwrap = <T>(v: T): Exclude<T, StageRefusal> => {
    if (v && typeof v === 'object' && 'kind' in v && (v as { kind: string }).kind === 'refused') {
      throw new Error(`the fake context refused: ${(v as unknown as StageRefusal).code}`);
    }
    return v as Exclude<T, StageRefusal>;
  };
  return {
    stage,
    sky: unwrap(createSkyBackdrop(stage)),
    lit: unwrap(createLitRenderer(stage)),
    ao: unwrap(createAmbientOcclusion(stage, 640, 400)),
    dof: unwrap(createDepthOfField(stage, 640, 400)),
    particles: unwrap(createParticleField(stage, 1024)),
    volume: unwrap(createVolumeField(stage, 8, 8, 8)),
    scene: unwrap(createTarget3D(stage, 640, 400)),
    other: unwrap(createTarget3D(stage, 640, 400)),
    shadow: unwrap(createShadowMap(stage, 512)),
    mesh: unwrap(uploadMesh(stage, box(1, 1, 1))),
  };
}

describe('shader and programme lifetimes — stage.compile() owns them end to end', () => {
  it('deletes every shader it creates, and the count is not left to dispose()', () => {
    const fake = fakeContext();
    const eng = buildEngine(fake);
    /* The number matters less than the equality, but it is worth stating: ten programmes, twenty
       shader objects. A drift in the first number is a new program somebody should know about. */
    expect(fake.counts.createShader).toBe(20);
    expect(fake.counts.deleteShader, 'shaders created but never flagged for deletion')
      .toBe(fake.counts.createShader);
    expect(fake.liveShaders()).toBe(0);
    /* And detached, so the flag takes effect at once rather than at program-delete time. */
    expect(fake.counts.detachShader).toBe(20);
    eng.stage.dispose();
  });

  it('leaves nothing behind after every dispose(), programmes included', () => {
    const fake = fakeContext();
    const eng = buildEngine(fake);
    for (const o of [eng.sky, eng.lit, eng.ao, eng.dof, eng.particles, eng.volume,
      eng.scene, eng.other, eng.shadow, eng.mesh]) {
      (o as { dispose(): void }).dispose();
    }
    eng.stage.dispose();
    expect(fake.liveShaders()).toBe(0);
    expect(fake.liveProgrammes(), 'programmes outlived both their object and the stage').toBe(0);
    expect(fake.counts.deleteProgram).toBeGreaterThanOrEqual(fake.counts.createProgram ?? 0);
  });

  it('a compile failure leaks neither shader, and a LINK failure leaks neither the program', () => {
    /*
     * THE PATH `stage.dispose()` COULD NEVER REACH. `programs.push(p)` runs only after a successful
     * link, so a link failure used to leave a WebGLProgram with no owner and no handle — measured as
     * 5 shaders and 1 program still valid after the stage was disposed.
     */
    const fake = fakeContext();
    const st = createStage(fake.canvas, {});
    if (!isStage(st)) throw new Error('refused');
    const before = { s: fake.counts.createShader ?? 0, p: fake.counts.createProgram ?? 0 };

    /* The fake compiles and links whatever it is given, so each failure is injected at the status
       query — the shape of the refusal is what is under test, not a driver's opinion of GLSL. */
    fake.fail('compile');
    expect(st.compile('a', 'b')).toMatchObject({ code: 'SHADER_COMPILE_FAILED' });
    fake.fail('link');
    expect(st.compile('a', 'b')).toMatchObject({ code: 'PROGRAM_LINK_FAILED' });
    fake.fail('none');

    expect((fake.counts.createShader ?? 0) - before.s).toBeGreaterThan(0);
    expect(fake.liveShaders(), 'a refused compile or link left shader objects behind').toBe(0);
    expect((fake.counts.createProgram ?? 0) - before.p).toBe(1);
    expect(fake.liveProgrammes(), 'the program from a failed link was never deleted').toBe(0);
    st.dispose();
  });
});

describe('every pass restores the state it perturbs', () => {
  /*
   * The entry state is deliberately NOT the GL defaults. Culling on, depth test on, a target bound
   * and the viewport already narrowed is what a real frame looks like at the moment a pass is called,
   * and a restore that only works from the defaults is not a restore.
   */
  const run = (
    name: string,
    act: (e: ReturnType<typeof buildEngine>) => void,
    prepare?: (e: ReturnType<typeof buildEngine>) => void,
  ) => {
    it(name, () => {
      const fake = fakeContext();
      const eng = buildEngine(fake);
      const gl = fake.gl;
      eng.scene.bind();
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.depthMask(true);
      gl.viewport(0, 0, 640, 400);
      prepare?.(eng);
      /* CONSTRUCTION leaves a texture bound on unit 0 — every `allocate` ends mid-setup — and the
         release discipline means a pass ENDS with the units null. Both are true, so the entry state
         has to be the one the discipline describes or the comparison measures the constructor. */
      fake.releaseUnits();
      const before = fake.snapshot();
      act(eng);
      const after = fake.snapshot();
      expect(after, `${name}: state differs across the pass`).toEqual(before);
      eng.stage.dispose();
    });
  };

  const VIEW = { eye: [0, 2, 6] as const, near: 0.5, far: 60, fovDeg: 40, aspect: 1.6 };
  const draws = (e: ReturnType<typeof buildEngine>) => [{
    mesh: e.mesh,
    model: IDENTITY(),
    normalMat: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    material: { baseColour: [0.5, 0.5, 0.5] as const, roughness: 0.4, metalness: 0 },
  }];

  run('sky.draw', (e) => e.sky.draw({
    eye: [0, 2, 6], target: [0, 0, 0], fovDeg: VIEW.fovDeg, aspect: VIEW.aspect, sky: DEFAULT_SKY,
  }));

  run('lit.shadowPass', (e) => e.lit.shadowPass(IDENTITY(), draws(e), e.shadow));

  run('lit.depthPrepass', (e) => e.lit.depthPrepass(IDENTITY(), draws(e)));

  run('lit.draw', (e) => e.lit.draw({
    viewProj: IDENTITY(), eye: VIEW.eye, lightDir: [0, -1, 0], lightColour: [1, 1, 1],
    sky: DEFAULT_SKY, lightVP: IDENTITY(), shadow: e.shadow, draws: draws(e),
    ao: e.ao.texture, screenSize: [640, 400],
  }));

  run('ao.compute', (e) => e.ao.compute({
    depthTexture: e.scene.depthTexture, near: VIEW.near, far: VIEW.far,
    fovDeg: VIEW.fovDeg, aspect: VIEW.aspect,
  }));

  run('dof.apply', (e) => e.dof.apply({
    scene: e.scene.texture, depthTexture: e.scene.depthTexture,
    near: VIEW.near, far: VIEW.far, focusDistance: 8,
  }));

  const SOURCES = [{
    at: [0, 0, 0] as const, velocity: [0, 1, 0] as const, colour: [1, 1, 1] as const,
    rate: 300, life: 2,
  }];

  run('particles.step', (e) => e.particles.step({ dtSeconds: 1 / 60, sources: SOURCES }));

  run('particles.draw', (e) => e.particles.draw({ viewProj: IDENTITY(), sources: SOURCES }));

  run('volume.draw — into a target that does not own sceneDepth', (e) => {
    const r = e.volume.draw({
      eye: VIEW.eye, forward: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0],
      fovDeg: VIEW.fovDeg, aspect: VIEW.aspect, near: VIEW.near, far: VIEW.far,
      sceneDepth: e.scene.depthTexture, boxMin: [-1, -1, -1], boxMax: [1, 1, 1],
      colourLow: [0, 0, 0], colourHigh: [1, 1, 1], lightDir: [0, -1, 0],
    });
    expect(r, 'a legal volume draw must not refuse').toBeUndefined();
  }, (e) => e.other.bind());
});

describe('the volume refuses a feedback loop instead of letting the driver drop the draw', () => {
  it('names the loop when the bound framebuffer owns sceneDepth', () => {
    /*
     * Measured against a real driver, drawing into the target that owns `sceneDepth` gave
     * GL_INVALID_OPERATION, ANGLE's "Feedback loop formed between Framebuffer and active Texture",
     * and ZERO lit pixels — against 13,456 for the identical draw into a second target. A dropped
     * draw is indistinguishable from a density that happens to be invisible, which is why this is a
     * refusal and not a comment.
     */
    const fake = fakeContext();
    const eng = buildEngine(fake);
    eng.scene.bind();
    const r = eng.volume.draw({
      eye: [0, 0, 4], forward: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0],
      fovDeg: 40, aspect: 1, near: 0.5, far: 30,
      sceneDepth: eng.scene.depthTexture, boxMin: [-1, -1, -1], boxMax: [1, 1, 1],
      colourLow: [0, 0, 0], colourHigh: [1, 1, 1], lightDir: [0, -1, 0],
    });
    expect(r).toMatchObject({ kind: 'refused', code: 'FEEDBACK_LOOP' });
    expect(r?.detail, 'the refusal must say what to do instead').toMatch(/separate target/);
    eng.stage.dispose();
  });
});
