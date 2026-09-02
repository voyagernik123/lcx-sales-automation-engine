/**
 * THE APP-SIDE QUALITY LADDER, TESTED FOR THE TWO THINGS THAT CAN GO WRONG.
 *
 * `3D_VFX_1000X.md:316` recorded the ladder as decided and "wired into all nine" harnesses. It was wired into
 * NONE of the eight shipping components, and `pickQualityTier` — the function that turns a measurement into a
 * tier — had no caller anywhere in the repo. These tests cover the caller that now exists.
 *
 * ── WHAT IS NOT TESTED HERE, DELIBERATELY ────────────────────────────────────────────
 * Nothing below asserts that a GPU is fast. There is no GPU in this runner, and a test that measured one would
 * be a test whose result depends on the machine it runs on — which is the same defect the ladder exists to
 * handle rather than a way to verify it. What IS tested: that every refusal path lands on `full`, that a
 * measured slow frame lands lower, that the tier scales a component's own baseline instead of replacing it,
 * and that no component reads the tier's absolute `shadowMapSize`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pickQualityTier, shadowMapSizeFor, QUALITY_TIERS, qualitySettings } from '@lcx/gl';
import {
  resolveQualityTier, qualityTierReport, needsQualityProbe, recordQualityProbe,
  measureFrameMs, isSoftwareRasteriser, probeSync, __resetQualityTierForTests,
} from '../useQualityTier';

/**
 * A GL context that answers only what the probe asks it, and models `getError` as GL specifies it: a QUEUE
 * that a read pops and empties.
 *
 * That detail is the test rather than the scaffolding. `readAccepted: false` makes `readPixels` raise
 * GL_INVALID_OPERATION — E0's real failure, from asking UNSIGNED_BYTE of an RGBA16F attachment — which the
 * probe must notice and discard, because an unsynced interval is a submission time and not a frame time.
 * `stuckError` is the other shape: a context that keeps reporting the same code forever.
 *
 * `renderer` is what `WEBGL_debug_renderer_info` reports; `null` means the extension is absent, which some
 * privacy configurations do.
 */
function fakeGl(opts: {
  renderer?: string | null;
  readAccepted?: boolean;
  readType?: 'byte' | 'half' | 'unknown';
  stuckError?: boolean;
} = {}): { gl: WebGL2RenderingContext; reads: () => number } {
  const {
    renderer = 'Apple M1', readAccepted = true, readType = 'half', stuckError = false,
  } = opts;
  let reads = 0;
  const errors: number[] = [];
  const TYPE = { byte: 0x1401, half: 0x140b, unknown: 0x9999 }[readType];
  const gl = {
    NO_ERROR: 0,
    UNSIGNED_BYTE: 0x1401,
    FLOAT: 0x1406,
    HALF_FLOAT: 0x140b,
    UNSIGNED_INT: 0x1405,
    INT: 0x1404,
    RGBA: 0x1908,
    IMPLEMENTATION_COLOR_READ_FORMAT: 0x8b9b,
    IMPLEMENTATION_COLOR_READ_TYPE: 0x8b9a,
    getExtension: (name: string) =>
      name === 'WEBGL_debug_renderer_info' && renderer !== null
        ? { UNMASKED_RENDERER_WEBGL: 0x9246 }
        : null,
    getParameter: (p: number) => {
      if (p === 0x9246) return renderer;
      if (p === 0x8b9b) return 0x1908;
      if (p === 0x8b9a) return TYPE;
      return 0;
    },
    readPixels: () => {
      reads++;
      if (!readAccepted) errors.push(0x0502);
    },
    getError: () => (stuckError ? 0x0505 : (errors.shift() ?? 0)),
  } as unknown as WebGL2RenderingContext;
  return { gl, reads: () => reads };
}

beforeEach(() => {
  /* Module state that survives between tests makes the second test read the first one's tier. This repo has
     been bitten by order-dependent passes twice — the `ci-mirror` database and Vitest's worker assignment. */
  __resetQualityTierForTests();
});

describe('the fail-safe: every refusal path is `full`, which is what ships today', () => {
  it('is `full` before anything has been measured', () => {
    expect(needsQualityProbe()).toBe(true);
    expect(resolveQualityTier()).toBe('full');
    expect(qualityTierReport().msAtProbeTier).toBeNull();
    expect(qualityTierReport().reason).toContain('NO_PROBE_YET');
  });

  it('refuses on a software rasteriser rather than comparing a CPU frame to a 60 Hz budget', () => {
    /* 400 ms is what SwiftShader does to a scene an M1 renders in 1.3 ms. The ratio between the two is not a
       constant, so a tier picked from it describes a machine nobody ships on. */
    for (const name of ['Google SwiftShader', 'llvmpipe (LLVM 15.0.7, 256 bits)', 'Software Rasterizer']) {
      __resetQualityTierForTests();
      const { gl } = fakeGl({ renderer: name });
      expect(isSoftwareRasteriser(gl), name).toBe(true);
      const r = recordQualityProbe({
        pick: pickQualityTier, gl, msAtProbeTier: 400, probeTier: 'full', source: 'test',
      });
      expect(r.tier, name).toBe('full');
      expect(r.reason, name).toContain('SOFTWARE_RASTERISER');
    }
  });

  it('treats an unreadable renderer string as software, so a hidden GPU name never downgrades anything', () => {
    /* E0 treats "unknown" as HARDWARE because its risk is publishing a fictional number. Here the risk runs the
       other way: an uncharacterisable machine that we call hardware lets a meaningless measurement change what
       the product looks like. So the two files disagree on purpose. */
    for (const renderer of [null, '']) {
      __resetQualityTierForTests();
      const { gl } = fakeGl({ renderer });
      expect(isSoftwareRasteriser(gl)).toBe(true);
      const r = recordQualityProbe({
        pick: pickQualityTier, gl, msAtProbeTier: 90, probeTier: 'full', source: 'test',
      });
      expect(r.tier).toBe('full');
    }
  });

  it('refuses when the frame could not be measured at all', () => {
    const { gl } = fakeGl();
    const r = recordQualityProbe({
      pick: pickQualityTier, gl, msAtProbeTier: null, probeTier: 'full', source: 'test',
    });
    expect(r.tier).toBe('full');
    expect(r.reason).toContain('UNMEASURABLE_FRAME');
  });

  it('refuses when the ladder itself throws — a bug in it must not change what the product looks like', () => {
    const { gl } = fakeGl();
    const r = recordQualityProbe({
      pick: (() => { throw new Error('boom'); }) as unknown as typeof pickQualityTier,
      gl, msAtProbeTier: 90, probeTier: 'full', source: 'test',
    });
    expect(r.tier).toBe('full');
    expect(r.reason).toContain('LADDER_THREW');
    /* And it is COMMITTED, so a throwing ladder cannot be re-entered on every subsequent mount. */
    expect(needsQualityProbe()).toBe(false);
  });

  it('discards a measurement whose sync was not accepted, which is the 0.45-vs-63.7 ms failure', () => {
    /*
     * `gl.finish()` returns on command-buffer FLUSH, not GPU completion, and this programme published 0.45 ms
     * for a frame that really took 63.7 ms on exactly that. The trailing `readPixels` is the sync — so if the
     * read is rejected (E0 measured GL_INVALID_OPERATION from asking UNSIGNED_BYTE of an RGBA16F attachment)
     * the interval is a submission time and must be thrown away, not fed to the ladder.
     */
    const { gl } = fakeGl({ readAccepted: false });
    expect(probeSync(gl)).toBe(false);
    expect(measureFrameMs(gl, () => { /* a frame that never completes */ })).toBeNull();
  });

  it('terminates on a context whose error queue never empties, instead of hanging the tab', () => {
    /*
     * THE DRAIN IS BOUNDED AND THE BOUND IS NOT DEFENSIVE PADDING. It was written as
     * `while (gl.getError() !== NO_ERROR)`, the form `docs/3d/e0/entry.ts` uses, and this test HUNG THE VITEST
     * PROCESS until it had to be killed. GL's contract says the queue empties; a context that does not honour it
     * gives a frozen tab rather than a lost measurement, and a probe is the last place that is acceptable.
     */
    const { gl } = fakeGl({ stuckError: true });
    expect(probeSync(gl)).toBe(false);
    expect(measureFrameMs(gl, () => { /* nothing */ })).toBeNull();
  });

  it('discards a measurement when the read type is one it will not guess a buffer for', () => {
    const { gl } = fakeGl({ readType: 'unknown' });
    expect(probeSync(gl)).toBe(false);
    expect(measureFrameMs(gl, () => { /* nothing */ })).toBeNull();
  });

  it('discards a measurement when the render function throws', () => {
    const { gl } = fakeGl();
    expect(measureFrameMs(gl, () => { throw new Error('shader gone'); })).toBeNull();
  });
});

describe('the measurement instrument', () => {
  it('takes a warm-up frame first, then the samples — so shader upload is not charged to the GPU', () => {
    const { gl, reads } = fakeGl();
    let n = 0;
    measureFrameMs(gl, () => { n++; });
    /* One sync per frame, warm-up included — the sync is what makes the clock mean anything. */
    expect(reads()).toBe(3);
    /* One warm-up plus the default two samples. The warm-up is not optional: E5 records that the first frame's
       shader upload, averaged into a four-frame batch, can dominate the result — and six of the eight shipping
       components render exactly one frame, so their only frame IS their warm-up frame. */
    expect(n).toBe(3);
  });

  it('reports the MINIMUM of its samples, so one GC pause cannot downgrade a fast machine', () => {
    const { gl } = fakeGl();
    /* A fake clock, because a real one makes this test's result a property of the runner. The sequence is:
       warm-up (untimed), then t0/t1 per sample. Sample 1 spans 40 ms — a pause — and sample 2 spans 4 ms. */
    const seq = [0, 40, 40, 44];
    let i = 0;
    const realNow = performance.now;
    performance.now = () => seq[Math.min(i++, seq.length - 1)]!;
    try {
      const ms = measureFrameMs(gl, () => { /* nothing */ }, 2);
      expect(ms).toBe(4);
    } finally {
      performance.now = realNow;
    }
  });
});

describe('a measured slow frame resolves a lower tier', () => {
  /* Every case is a real frame time against E0's measured cost ratios (11.328 / 4.914 / 1.305 ms) and a 16.6 ms
     budget. The expectations are the tier, not the predicted milliseconds — those belong to `pickQualityTier`. */
  const cases: { ms: number; tier: string; why: string }[] = [
    { ms: 8, tier: 'full', why: 'fits the budget outright, so nothing is dropped' },
    { ms: 30, tier: 'reduced', why: 'full misses 16.6 ms but the frame without the lens fits' },
    { ms: 100, tier: 'minimum', why: 'only the cheapest rung fits' },
    { ms: 400, tier: 'minimum', why: 'nothing fits and the ladder says so rather than inventing a fourth rung' },
  ];

  it('has cases to run', () => {
    /* A loop over an empty array passes silently. This repo has been bitten by exactly that. */
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const c of cases) {
    it(`${c.ms} ms at the full tier resolves ${c.tier} — ${c.why}`, () => {
      const { gl } = fakeGl({ renderer: 'Apple M1' });
      const r = recordQualityProbe({
        pick: pickQualityTier, gl, msAtProbeTier: c.ms, probeTier: 'full', source: 'test',
      });
      expect(r.tier).toBe(c.tier);
      expect(r.reason.length).toBeGreaterThan(0);
      expect(r.msAtProbeTier).toBe(c.ms);
      expect(resolveQualityTier()).toBe(c.tier);
      expect(needsQualityProbe()).toBe(false);
    });
  }

  it('resolves ONCE — a second probe cannot revise the tier the page load is already rendering at', () => {
    /*
     * `env/quality.ts` gives three reasons a drifting tier is forbidden and the third is the governing one: a
     * tier that changes makes the picture a function of the machine's mood. First recording wins, which also
     * makes React 18's double-invoked effects and two reliefs mounting together harmless.
     */
    const { gl } = fakeGl();
    expect(recordQualityProbe({
      pick: pickQualityTier, gl, msAtProbeTier: 100, probeTier: 'full', source: 'first',
    }).tier).toBe('minimum');
    const second = recordQualityProbe({
      pick: pickQualityTier, gl, msAtProbeTier: 2, probeTier: 'full', source: 'second',
    });
    expect(second.tier).toBe('minimum');
    expect(second.source).toBe('first');
  });

  it('names which surface measured it, so a tier traces to a scene rather than to "the machine"', () => {
    const { gl } = fakeGl();
    recordQualityProbe({
      pick: pickQualityTier, gl, msAtProbeTier: 30, probeTier: 'full', source: 'StormReliefGl',
    });
    expect(qualityTierReport().source).toBe('StormReliefGl');
  });
});

describe('the tier SCALES each environment baseline, it does not replace it', () => {
  /*
   * `env/quality.ts:91` records the defect this prevents: wiring the ladder in with the tier's ABSOLUTE
   * `shadowMapSize` silently enlarged three environments — E0, E2 and E8 had each chosen 1024 and were handed
   * 1536 at the default tier. A 2.25x bigger map, and three captures that changed without anyone saying so.
   */
  const BASELINES = [1024, 1536] as const;

  it('has baselines to check, and they are the ones the eight components actually pass', () => {
    expect(BASELINES.length).toBeGreaterThan(0);
  });

  it('returns the baseline UNCHANGED at the top tier, so the ladder never alters the shipped look', () => {
    for (const base of BASELINES) {
      expect(shadowMapSizeFor('full', base), `full of ${base}`).toBe(base);
    }
  });

  it('never returns more than the baseline at any tier', () => {
    for (const base of BASELINES) {
      for (const t of QUALITY_TIERS) {
        expect(shadowMapSizeFor(t, base), `${t} of ${base}`).toBeLessThanOrEqual(base);
      }
    }
  });

  it('is strictly cheaper going down the ladder, and the absolute table is NOT what a component gets', () => {
    for (const base of BASELINES) {
      const [min, red, full] = QUALITY_TIERS.map((t) => shadowMapSizeFor(t, base));
      expect(min!).toBeLessThan(red!);
      expect(red!).toBeLessThan(full!);
    }
    /* The specific collision the comment above records: E8's own baseline is 1024 and the `full` rung of the
       absolute table is 1536. Scaling gives 1024; replacing would give 1536. */
    expect(qualitySettings('full').shadowMapSize).toBe(1536);
    expect(shadowMapSizeFor('full', 1024)).toBe(1024);
  });
});

describe('every shipping component derives its tier rather than hard-coding the frame', () => {
  /*
   * A RATCHET, NOT A STYLE RULE. The finding this whole module answers is that eight components hard-coded
   * `createShadowMap(stage, 1024)` and ran AO and DOF unconditionally while the docs recorded the ladder as
   * wired. Nothing prevented that but attention, and attention is what failed. So the source is read.
   */
  /* `import.meta.url` is an http URL under Vite, so it cannot be turned into a path. Vitest's cwd is the
     workspace root of the project it is running, i.e. `apps/web`. */
  const ROOT = path.resolve(process.cwd(), 'src');
  const COMPONENTS = [
    'components/geometry/SurfaceReliefGl.tsx',
    'components/geometry/PipelineReliefGl.tsx',
    'components/geometry/VaultReliefGl.tsx',
    'components/geometry/OntologyOrreryGl.tsx',
    'components/market/GlobeReliefGl.tsx',
    'components/risk/StormReliefGl.tsx',
    'components/brand/ForgeBackdrop.tsx',
  ] as const;

  it('reads all seven files', () => {
    /* Named first, because a glob that matched nothing would make every assertion below vacuous.
       Eight until S5 of INSTRUMENT_100X_PLAN retired `DeckReliefGl` (2026-09-02). */
    expect(COMPONENTS.length).toBe(7);
    for (const rel of COMPONENTS) {
      expect(readFileSync(path.join(ROOT, rel), 'utf8').length, rel).toBeGreaterThan(0);
    }
  });

  it('sizes its shadow map through `shadowMapSizeFor`, never with a bare literal', () => {
    for (const rel of COMPONENTS) {
      const src = readFileSync(path.join(ROOT, rel), 'utf8');
      expect(src, `${rel} must scale its own baseline`).toMatch(/shadowMapSizeFor\(\s*tier\s*,/);
      /* The exact call this replaced. A literal here is the defect, whatever the number. */
      expect(src, `${rel} still hard-codes a shadow-map size`)
        .not.toMatch(/createShadowMap\(\s*stage\s*,\s*\d+\s*\)/);
    }
  });

  it('never reads the tier\'s ABSOLUTE shadowMapSize, which is the enlargement defect', () => {
    for (const rel of COMPONENTS) {
      const src = readFileSync(path.join(ROOT, rel), 'utf8');
      /* Comments in these files quote the field name while explaining why it is not used, so the test looks for
         a property ACCESS on the settings object rather than for the word. */
      expect(src, rel).not.toMatch(/\bQ\.shadowMapSize\b/);
    }
  });

  it('passes `shadowTaps` from the tier — the field `3D_VFX_FINAL_PLAN.md` §4.2 found nobody reading', () => {
    for (const rel of COMPONENTS) {
      const src = readFileSync(path.join(ROOT, rel), 'utf8');
      expect(src, `${rel} pays 9 taps at the minimum tier`).toMatch(/shadowTaps:\s*Q\.shadowTaps/);
    }
  });

  it('takes its device-pixel cap from the tier rather than from a literal 2', () => {
    for (const rel of COMPONENTS) {
      const src = readFileSync(path.join(ROOT, rel), 'utf8');
      expect(src, rel).toMatch(/Math\.min\(\s*Q\.dprScale\s*,/);
    }
  });

  it('gates the two effects the ladder drops, in the components that have them', () => {
    /* AO and DOF are not in every scene — E4's orrery measured AO at 0.44% of the frame and never had it, and
       only the deck and the forge carry a lens. So this asserts the gate wherever the resource is created, and
       it asserts that at least one component was actually checked. */
    let aoGated = 0, dofGated = 0;
    for (const rel of COMPONENTS) {
      const src = readFileSync(path.join(ROOT, rel), 'utf8');
      if (/createAmbientOcclusion\(/.test(src)) {
        expect(src, `${rel} allocates AO unconditionally`).toMatch(/Q\.ao\s*\?/);
        aoGated++;
      }
      if (/createDepthOfField\(/.test(src)) {
        expect(src, `${rel} allocates DOF unconditionally`).toMatch(/Q\.dof\s*\?/);
        dofGated++;
      }
    }
    expect(aoGated, 'no component was found allocating AO — the pattern must have changed').toBeGreaterThan(0);
    expect(dofGated, 'no component was found allocating DOF — the pattern must have changed').toBeGreaterThan(0);
  });

  it('does not let the tier shorten E7\'s raymarch, because that reach is DATA and is printed', () => {
    /*
     * `volume.ts:230` caps the view-ray march at `uMaxSteps`, so the step count fixes MARCH_REACH_M =
     * WORLD_STEP × MAX_STEPS = 16.0 m — and `stormCalibration.ts` prints that reach to the operator. At the
     * minimum tier's 48 steps the reach is 6.0 m, the far side of the field is truncated, and distant days show
     * less risk than they have while the sentence under the frame still claims 16.0 m.
     */
    const src = readFileSync(path.join(ROOT, 'components/risk/StormReliefGl.tsx'), 'utf8');
    expect(src).toMatch(/maxSteps:\s*MAX_STEPS/);
    /*
     * NOW UNFALSIFIABLE BY CONSTRUCTION, and kept deliberately. `volumeMaxSteps` was DELETED from
     * QualitySettings on 2026-08-13, so this pattern cannot appear whatever anyone writes — the refusal it
     * guarded is enforced by the type rather than by this assertion. Left in place because a future author
     * re-adding the field would reach for exactly this line, and finding the argument attached to it is
     * cheaper than rediscovering that steps are reach rather than quality.
     */
    expect(src).not.toMatch(/maxSteps:\s*Q\.volumeMaxSteps/);
    /* The light march IS a look knob — it feeds `lightTransmittance`, which modulates radiance and never
       touches alpha, and alpha is the channel this reading assigns to magnitude. */
    expect(src).toMatch(/lightSteps:\s*Math\.min\(6,\s*Q\.volumeLightSteps\)/);
  });
});
