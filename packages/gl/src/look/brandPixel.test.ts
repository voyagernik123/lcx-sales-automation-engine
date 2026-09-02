import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { BRAND, BRAND_HEX, linearToHex, luminance, srgbToLinear, type BrandKey } from './colour.js';
import { toneMapComposite, TONE_POLICY, TONE_MAP_GLSL, SRGB_ENCODE_GLSL } from './tonemap.js';
import {
  inverseToneMap, precompensate, precompHeadroom, isPrecompRefusal,
  PRECOMP_CLIP, PRECOMP_POLE, PRECOMP_RULE, type CompositeSite,
} from './precompensate.js';
import { PIPELINE_SOURCES } from './pipeline.js';

/**
 * THE TEST THAT READS A PIXEL.
 *
 * `look.test.ts` asserts `assertBrandFidelity()` returns `[]` and calls it "THE P1 GATE:
 * brand hex exact after tone mapping". That assertion compares
 * `linearToHex(hexToLinear(BRAND_HEX[k]))` with `BRAND_HEX[k]` — two pure functions over a
 * frozen table. No edit to the composite, the tone map, the shoulder, the encode or any
 * shader in the package can make it fail. That is why the pipeline came to tone-map every
 * data colour in the system for months under a rule forbidding exactly that: the rule had
 * a test, and the test could not fail.
 *
 * This file asserts against BYTES READ OFF A FRAMEBUFFER. `docs/3d/brand-fidelity.mjs`
 * renders the shipped shaders in headless Chromium on SwiftShader and records the result;
 * that record is the ground truth here, and it is pinned two ways so it cannot go stale
 * without saying so:
 *
 *   1. `sourceHash` is recomputed from the LIVE composite, tone map, encode and palette.
 *      Any edit to any of them fails this file and demands a fresh measurement.
 *   2. The recorded GPU pixels are reproduced from the LIVE `toneMapComposite`. A hand-
 *      edited record fails, and so does a CPU/GPU drift the string checks in `look.test.ts`
 *      cannot see — those only assert that "0.40" appears in `TONE_MAP_GLSL`.
 *
 * Re-measure with:  node docs/3d/brand-fidelity.mjs
 */

const HERE = dirname(fileURLToPath(import.meta.url));
/* Resolved from this file, NOT from `process.cwd()`. `look.test.ts` reads its shader
   sources off cwd, which works only because vitest is launched from the package root; a
   run from the repo root would silently read nothing. */
const RECORD_PATH = resolve(HERE, '../../../../docs/3d/brand-fidelity.json');

interface Row {
  readonly pixel: string;
  readonly delta: readonly [number, number, number];
  readonly deltaE: number;
}
/* Named `Measurement`, not `Record` — the obvious name shadows TypeScript's built-in
   `Record<K,V>` in this file, and the next person to reach for it here gets a mapped type
   that silently is not one. */
interface Measurement {
  readonly measuredAt: string;
  readonly driver: string;
  readonly hdr: boolean;
  readonly sourceHash: string;
  readonly rows: { readonly [k in BrandKey]: { readonly [cfg: string]: Row } };
}

const record = JSON.parse(readFileSync(RECORD_PATH, 'utf8')) as Measurement;
const KEYS = Object.keys(BRAND_HEX) as BrandKey[];

const bytesOf = (hex: string): [number, number, number] =>
  [0, 2, 4].map((i) => parseInt(hex.replace('#', '').slice(i, i + 2), 16)) as [number, number, number];

/** CIE76, the same arithmetic the instrument reports, so the two numbers are comparable. */
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
function lab(px: readonly number[]): [number, number, number] {
  const [r, g, b] = px.map((v) => srgbToLinear(v / 255)) as [number, number, number];
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const deltaE = (a: readonly number[], b: readonly number[]) => {
  const A = lab(a), B = lab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
};

describe('the recorded measurement is current and was not written by hand', () => {
  it('covers every palette colour — derived from BRAND_HEX, not listed here', () => {
    /* Enumerating the seven keys is how the next palette entry gets added with no
       measurement behind it. This walks the table instead. */
    expect(KEYS.length).toBeGreaterThan(0);
    for (const k of KEYS) {
      expect(record.rows[k], `${k} has no measured pixel — re-run docs/3d/brand-fidelity.mjs`)
        .toBeTruthy();
      for (const cfg of ['compositeOnly', 'asShipped', 'antialiased', 'litMarker', 'litCentre']) {
        expect(record.rows[k][cfg]?.pixel, `${k}/${cfg} missing`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('the anti-alias pass returns a flat field untouched — antialiased equals compositeOnly, every colour', () => {
    /* THE PRODUCTION, P3. FXAA blends only across a luma edge; a flat brand mark has none, so the pass must hand
       the composite's pixel through EXACTLY — not "within ΔE 2". Measured by docs/3d/brand-fidelity.mjs on the
       shipped path (composite → LDR target → FXAA → canvas), held here to the byte. */
    for (const k of KEYS) {
      expect(record.rows[k].antialiased!.pixel, `${k}: FXAA moved a flat field`).toBe(record.rows[k].compositeOnly!.pixel);
    }
  });

  it('the shader sources have not changed since the pixels were read', () => {
    /*
     * THE HINGE OF THIS FILE. Without it every assertion below compares a stale record to
     * itself and passes forever — which is the exact failure of `assertBrandFidelity`, one
     * level up. Change TONE_SHOULDER, edit COMPOSITE_FRAG, add a colour to the palette, and
     * this fails with "re-measure", instead of the suite reporting a fidelity it last
     * observed under different code.
     */
    const live = createHash('sha256')
      .update([PIPELINE_SOURCES.composite, TONE_MAP_GLSL, SRGB_ENCODE_GLSL, JSON.stringify(BRAND_HEX)].join(' | '))
      .digest('hex').slice(0, 16);
    expect(live, `pipeline changed since ${record.measuredAt} — re-run: node docs/3d/brand-fidelity.mjs`)
      .toBe(record.sourceHash);
  });

  it('the GPU pixels are reproduced by the CPU tone map — first check that they agree', () => {
    /*
     * `look.test.ts` checks CPU/GPU agreement by asserting the string "0.40" appears in
     * TONE_MAP_GLSL. That catches a changed constant and nothing else: a different
     * expression with the same constant, or a driver that evaluates it differently in
     * half-float, both pass. This compares the two by their OUTPUT.
     *
     * ±1/255 because the scene target is RGBA16F and the composite reads it back through a
     * half-float texture fetch; the record names the driver it was taken on.
     */
    for (const k of KEYS) {
      const predicted = bytesOf(linearToHex(toneMapComposite(BRAND[k])));
      const measured = bytesOf(record.rows[k].compositeOnly!.pixel);
      for (let c = 0; c < 3; c++) {
        expect(
          Math.abs(predicted[c]! - measured[c]!),
          `${k} channel ${c}: CPU says ${predicted[c]}, the GPU wrote ${measured[c]}`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('§6 rule 5 is false in this pipeline, and here is the pixel that says so', () => {
  it('brand blue does not arrive as #2C6BFF — it arrives as #2C68DC', () => {
    /*
     * The claim under test is "brand hex exact". This is the most favourable configuration
     * that can exist: a flat mark written at exactly BRAND.brand into the scene target,
     * plate 0, bloom gain 0, so nothing stands between the constant and the framebuffer but
     * `lcxToneMap` and `lcxEncode`. It still moves 35/255 in blue.
     */
    const measured = record.rows.brand.compositeOnly!;
    expect(measured.pixel).not.toBe(BRAND_HEX.brand.toLowerCase());
    expect(measured.delta[2], 'blue channel shift, 0-255').toBeLessThanOrEqual(-30);
    expect(Math.round(measured.deltaE), 'ΔE76 against #2C6BFF').toBe(18);
  });

  it('TONE_POLICY quotes the measured pixel, so the sentence on screen cannot drift', () => {
    /*
     * `describeToneMapping()` prints TONE_POLICY under P1 (docs/3d/p1/entry.ts:80) — it is
     * the one place this claim is made to a reader. It used to end "so #2C6BFF leaves the
     * pipeline as #2C6BFF". Whatever it says now must be what the framebuffer says.
     */
    const measured = record.rows.brand.compositeOnly!;
    expect(TONE_POLICY.toLowerCase()).toContain(measured.pixel);
    expect(TONE_POLICY.toLowerCase()).toContain(BRAND_HEX.brand.toLowerCase());
    /* The whole token, not `toContain(String(round))`. A bare "18" matches any string with
       an 18 anywhere in it — and when the recorded ΔE was 0, that check degraded to "does
       this sentence contain a zero", which almost anything does. */
    expect(TONE_POLICY).toContain(`ΔE76 ${Math.round(measured.deltaE)}`);
  });

  it('no palette colour escapes the curve except the plate, which is already near black', () => {
    /*
     * DERIVED, not a list of the ones that happen to move. Every entry whose brightest
     * channel is high enough for the shoulder to bite must be shown to have moved; the
     * assertion below finds them rather than naming them, so a palette entry added later is
     * covered without anyone remembering to add it here.
     */
    const bitten = KEYS.filter((k) => Math.max(...BRAND[k]) > 0.2);
    expect(bitten.length, 'no palette colour is bright enough to test the shoulder').toBeGreaterThan(0);
    for (const k of bitten) {
      expect(
        record.rows[k].compositeOnly!.pixel,
        `${k} came back exact, which would mean the composite stopped mapping it`,
      ).not.toBe(BRAND_HEX[k].toLowerCase());
    }
  });
});

describe('what IS true of the pipeline, and what a surface may rely on instead', () => {
  it('order survives: the curve is monotone, so the density ramp still reads correctly', () => {
    /*
     * THE REPLACEMENT INVARIANT. The exact hex does not survive the composite FOR A MARK
     * WRITTEN AT ITS PALETTE VALUE, and no curve can change that — one pinned at brand blue's
     * linear-1.0 blue channel has no headroom left above 1.0, which deletes the only reason
     * this pipeline has a tone map at all. What survives, and what a reader of a chart
     * actually depends on, is that a denser mark never renders lighter than a sparser one.
     *
     * That sentence used to read "and cannot be made to", which was wrong and is corrected in
     * the PRE-COMPENSATION block at the foot of this file: writing `inverseToneMap(target)`
     * instead lands all seven entries at ΔE 0.00 through this same curve. ORDER SURVIVES is
     * still the invariant every mark has, because pre-compensation is refused for the
     * accumulating case — this test therefore stays exactly as it is.
     *
     * Checked over EVERY ordered pair and EVERY channel, off the measured bytes — not over
     * the three-step brand ramp somebody would otherwise hand-list.
     */
    let pairs = 0;
    for (const a of KEYS) {
      for (const b of KEYS) {
        if (a === b) continue;
        const ta = bytesOf(BRAND_HEX[a]), tb = bytesOf(BRAND_HEX[b]);
        const ma = bytesOf(record.rows[a].compositeOnly!.pixel);
        const mb = bytesOf(record.rows[b].compositeOnly!.pixel);
        for (let c = 0; c < 3; c++) {
          if (ta[c]! >= tb[c]!) continue;
          pairs++;
          expect(
            ma[c]!,
            `${a}.${'rgb'[c]} < ${b}.${'rgb'[c]} in the palette but not on screen`,
          ).toBeLessThanOrEqual(mb[c]!);
        }
      }
    }
    expect(pairs, 'no ordered channel pairs were compared').toBeGreaterThan(0);
  });

  it('the 3-D lit path never shows the base hex at all, which is what lighting means', () => {
    /*
     * A lit material's radiance is base colour × illumination, so "brand hex exact" over a
     * lit mesh is a category error rather than a bug: there is no illumination at which a
     * shaded sphere is a flat swatch. Measured at one fixed geometric point — the fragment
     * facing the camera — under GlobeReliefGl's shipped marker configuration (PIN_MAT,
     * lightColour [6.6,6.2,5.5], MARKER_AMBIENT 120), every palette entry lands 46-88 ΔE
     * from its hex.
     *
     * The instrument also searched all 16,384 fragments for the closest match to each hex;
     * brand blue's best is still ΔE 15.2. Only `brandBright` lands near its hex (ΔE 1.3),
     * and it does so because some fragment on the gradient happens to pass through it — a
     * coincidence of illumination, not a preserved colour. That is why this asserts on the
     * fixed point and not on the search.
     */
    for (const k of KEYS) {
      const px = bytesOf(record.rows[k].litCentre!.pixel);
      expect(
        deltaE(px, bytesOf(BRAND_HEX[k])),
        `${k}: the lit centre fragment matched its flat hex, which no shading model does`,
      ).toBeGreaterThan(20);
    }
  });
});

/* ══ PRE-COMPENSATION ═══════════════════════════════════════════════════════════════════
 *
 * The block above is correct that "brand hex exact" was never enforced and that a
 * data-preserving CURVE cannot exist. It also concluded no data-preserving fix exists, and
 * that does not follow: the fix is not a curve. Writing `inverseToneMap(BRAND[k])` into the
 * scene target makes the LIVE, UNMODIFIED curve deliver `BRAND_HEX[k]` exactly.
 *
 * These bytes were read off a framebuffer by the same instrument shape `docs/3d/
 * brand-fidelity.mjs` uses — bundled `@lcx/gl`, headless Chromium on ANGLE/SwiftShader,
 * RGBA16F scene target, centre pixel of a 128x128 frame. They are recorded HERE rather than in
 * `docs/3d/brand-fidelity.json` because that record is another lane's and re-running its
 * instrument would rewrite it; the pin below makes this block go stale on exactly the same
 * edits that stale the JSON.
 *
 * A PLAIN write at each palette entry was measured in the same run as a control, and it
 * reproduces `brand-fidelity.json`'s `compositeOnly` byte for byte on all seven entries —
 * asserted below, so "my instrument agrees with the shipped one" is a test rather than a
 * claim. That control is `sweepPlain[k][2]`, the 1.0x multiple.
 */
const PRECOMP = {
  measuredAt: '2026-08-15',
  driver: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)',
  hdr: true,
  /* Recomputed live below from the SAME four inputs `sourceHash` above uses. An independent
     literal, not a read of `record.sourceHash`: re-running brand-fidelity.mjs updates that
     field, and a shared pin would let this block pass against a pipeline it never saw. */
  sourceHash: '5858a9d80b9b32d7',
  /** `pipeline.resolve({ plate: [0,0,0], bloomGain: 0 })` — nothing but the curve and the encode. */
  precompOnly: {
    brand: '#2c6bff', brandBright: '#7fb2ff', brandDeep: '#12326e', reference: '#ff8a3d',
    refusal: '#6b7a99', rule: '#26355a', plate: '#0e1628',
  },
  /** `FlatLine.tsx:116` exactly: plate 0, bloomGain 0, threshold [4,5], vignetteDepth 0, transparent. */
  precompFlatLine: {
    brand: '#2c6bff', brandBright: '#7fb2ff', brandDeep: '#12326e', reference: '#ff8a3d',
    refusal: '#6b7a99', rule: '#26355a', plate: '#0e1628',
  },
  /** COST 2 — `pipeline.resolve({ bloomGain: 0 })`, so the DEFAULT plate at `pipeline.ts:188`. */
  precompDefaultPlate: {
    brand: '#306dff', brandBright: '#80b3ff', brandDeep: '#1a3873', reference: '#ff8b48',
    refusal: '#6c7c9c', rule: '#2a3a61', plate: '#172139',
  },
  /** COST 3 — plate 0, `bloomGain: 0.3`, the value FlatBars/FlatDial/FlatTrack all ship. */
  precompBloom03: {
    brand: '#2d6dff', brandBright: '#8cc1ff', brandDeep: '#12326e', reference: '#ff9744',
    refusal: '#6c7b9a', rule: '#26355a', plate: '#0e1628',
  },
  /** COST 1 — the same mark scaled by each multiple, plate 0, bloom 0. Full RGB per shot. */
  multiples: [0.5, 0.75, 1, 1.25, 1.5, 2],
  sweepPlain: {
    brand: [[29,76,173], [37,91,200], [44,104,220], [49,115,235], [54,124,248], [63,140,255]],
    brandBright: [[90,125,173], [108,148,200], [122,165,220], [134,180,235], [145,192,248], [162,212,255]],
    brandDeep: [[10,34,78], [14,43,94], [18,50,107], [21,56,118], [24,61,127], [29,71,144]],
    reference: [[173,98,42], [200,117,52], [220,132,60], [235,145,68], [248,156,74], [255,174,85]],
    refusal: [[76,86,108], [91,104,129], [104,118,145], [115,130,158], [124,140,170], [140,157,189]],
    rule: [[25,36,63], [32,45,77], [38,53,88], [43,59,98], [47,65,106], [55,74,120]],
    plate: [[7,13,26], [11,18,34], [14,22,40], [17,25,45], [19,29,50], [23,34,58]],
  },
  sweepPrecomp: {
    brand: [[30,78,207], [38,94,235], [44,107,255], [50,118,255], [55,128,255], [63,144,255]],
    brandBright: [[94,136,207], [112,160,235], [127,178,255], [139,193,255], [150,205,255], [168,225,255]],
    brandDeep: [[10,34,80], [14,43,97], [18,50,110], [21,56,121], [24,62,131], [29,71,147]],
    reference: [[207,102,42], [235,122,53], [255,138,61], [255,151,68], [255,162,74], [255,181,85]],
    refusal: [[78,90,115], [94,108,136], [107,122,153], [118,134,167], [128,145,179], [144,162,198]],
    rule: [[25,36,65], [32,46,79], [38,53,90], [43,59,100], [47,65,108], [55,75,123]],
    plate: [[7,13,27], [11,18,34], [14,22,40], [17,26,45], [19,29,50], [23,34,58]],
  },
} as const;

type Sweep = readonly (readonly [number, number, number])[];
const sweepPlain = PRECOMP.sweepPlain as unknown as Record<BrandKey, Sweep>;
const sweepPrecomp = PRECOMP.sweepPrecomp as unknown as Record<BrandKey, Sweep>;
const cfg = (name: 'precompOnly' | 'precompFlatLine' | 'precompDefaultPlate' | 'precompBloom03') =>
  PRECOMP[name] as unknown as Record<BrandKey, string>;

/** The index of the channel the palette entry is brightest in — the one that clips first. */
const pinnedChannel = (k: BrandKey): number => {
  const t = bytesOf(BRAND_HEX[k]);
  return [0, 1, 2].reduce((a, i) => (t[i]! > t[a]! ? i : a), 0);
};

/**
 * How many DISTINCT bytes a density sweep can produce on a channel whose scene value at 1.0x
 * is `peak`. Every multiple at or above the clip collapses to 255, so the count is the number
 * of multiples below the clip plus one for the collapsed group.
 *
 * ONE formula, applied to both the plain and the pre-compensated column, because the cost of
 * pre-compensation IS the change in `peak` and nothing else. Writing the two expected counts
 * out by hand would pass against any `peak` at all.
 */
const distinctBytes = (peak: number): number => {
  const below = PRECOMP.multiples.filter((m) => m * peak < PRECOMP_CLIP).length;
  return below + (below < PRECOMP.multiples.length ? 1 : 0);
};

const FLOOR_SITE: CompositeSite = {
  dstFactor: 'one-minus-src-alpha', plate: [0, 0, 0], bloomGain: 0,
  threshold: [0.12, 0.7], shaderScale: 1,
};

describe('pre-compensation: the curve delivers the exact hex, and the record says so', () => {
  it('the instrument agrees with docs/3d/brand-fidelity.json — same driver, same bytes', () => {
    /*
     * THE CROSS-CHECK THAT MAKES THE REST OF THIS BLOCK USABLE. A second instrument reporting
     * a flattering number is the failure mode a fidelity record exists to stop, so the run
     * that produced these bytes also measured a PLAIN write, and it must reproduce the record
     * the P1 lane already publishes. Derived over the palette, not spot-checked on brand.
     */
    for (const k of KEYS) {
      const plainAtUnity = sweepPlain[k][2]!;
      expect(
        `#${plainAtUnity.map((v) => v.toString(16).padStart(2, '0')).join('')}`,
        `${k}: this file's instrument disagrees with brand-fidelity.json's compositeOnly`,
      ).toBe(record.rows[k].compositeOnly!.pixel);
    }
  });

  it('the shader sources have not changed since these pixels were read', () => {
    const live = createHash('sha256')
      .update([PIPELINE_SOURCES.composite, TONE_MAP_GLSL, SRGB_ENCODE_GLSL, JSON.stringify(BRAND_HEX)].join(' | '))
      .digest('hex').slice(0, 16);
    expect(live, `pipeline changed since ${PRECOMP.measuredAt} — the pre-compensation record is stale`)
      .toBe(PRECOMP.sourceHash);
  });

  it('every palette entry comes back EXACT — measured, not derived from the algebra', () => {
    /*
     * The claim the commit of 2026-08-14 said could not exist. `#2c68dc` (ΔE 18.31) becomes
     * `#2c6bff` (ΔE 0.00) with the curve, the shoulder and the composite all untouched — the
     * only change is WHAT IS WRITTEN INTO THE SCENE TARGET.
     *
     * Walks BRAND_HEX so a palette entry added later is covered without anyone remembering.
     */
    for (const k of KEYS) {
      expect(cfg('precompOnly')[k], `${k} did not land exact under pre-compensation`)
        .toBe(BRAND_HEX[k].toLowerCase());
      expect(cfg('precompFlatLine')[k], `${k} is not exact under FlatLine.tsx:116's own options`)
        .toBe(BRAND_HEX[k].toLowerCase());
    }
  });

  it('the live precompensate() reproduces those GPU bytes through the live tone map', () => {
    /*
     * CPU-vs-GPU, the same discipline the block above applies to a plain write. Without this
     * the exactness assertion is a comparison of two frozen strings and cannot fail on a
     * change to `inverseToneMap` — which is the one function the whole result rests on.
     *
     * ±1/255 for the same reason: RGBA16F, read back through a half-float texture fetch.
     */
    for (const k of KEYS) {
      const pre = precompensate(BRAND[k], FLOOR_SITE);
      expect(isPrecompRefusal(pre), `${k}: refused on a zero plate with no bloom`).toBe(false);
      const predicted = bytesOf(linearToHex(toneMapComposite(pre as typeof BRAND.brand)));
      const measured = bytesOf(cfg('precompOnly')[k]!);
      for (let c = 0; c < 3; c++) {
        expect(
          Math.abs(predicted[c]! - measured[c]!),
          `${k} channel ${c}: CPU says ${predicted[c]}, the GPU wrote ${measured[c]}`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it('the scene values stay far inside RGBA16F — the format was never the constraint', () => {
    /* 1.6667 against 65504. Recorded because "the buffer cannot hold it" is the objection
       this approach attracts, and it is four orders of magnitude wrong. */
    const peak = Math.max(...KEYS.flatMap((k) => [...inverseToneMap(BRAND[k])]));
    expect(peak).toBeLessThanOrEqual(PRECOMP_CLIP);
    expect(peak).toBeLessThan(65504);
  });
});

describe('COST 1 — pre-compensation consumes the highlight range of a saturated mark', () => {
  it('a linear-1.0 channel is left EXACTLY 1.0x of headroom, and that is derived', () => {
    /*
     * `precompHeadroom` is `(1-s·m)/(m·(1-s))`, which is 1.0 at m = 1 for any shoulder. The
     * three entries with a linear-1.0 channel are found by that property, not listed: adding a
     * fourth saturated colour to the palette must be covered automatically.
     */
    const saturated = KEYS.filter((k) => Math.max(...BRAND[k]) >= 1);
    expect(saturated.length, 'no palette entry has a saturated channel to test the ceiling on')
      .toBeGreaterThan(0);
    for (const k of saturated) {
      expect(precompHeadroom(BRAND[k]), `${k} should have no headroom left`).toBeCloseTo(1, 10);
      expect(PRECOMP_CLIP / Math.max(...BRAND[k]), `${k} plain headroom`).toBeCloseTo(PRECOMP_CLIP, 10);
    }
    for (const k of KEYS.filter((k) => Math.max(...BRAND[k]) < 1)) {
      expect(precompHeadroom(BRAND[k]), `${k} is unsaturated and should keep headroom`)
        .toBeGreaterThan(1);
    }
  });

  it('and the measured sweep loses exactly the steps that arithmetic predicts', () => {
    /*
     * THE COST, IN PIXELS. Brand blue resolves 6 distinct bytes over 0.5-2.0x plain and 3
     * pre-compensated; brandDeep, refusal, rule and plate lose nothing. `distinctBytes` is one
     * formula applied to both columns, so this fails if the shoulder moves, if a palette entry
     * changes saturation, or if the recorded bytes are edited by hand.
     *
     * A collision between two sub-clip multiples would also fail it, and correctly: it would
     * mean the sweep no longer resolves the steps it is being used to count.
     */
    let lost = 0;
    for (const k of KEYS) {
      const c = pinnedChannel(k);
      const plainSeen = new Set(sweepPlain[k]!.map((p) => p[c]!));
      const preSeen = new Set(sweepPrecomp[k]!.map((p) => p[c]!));
      expect(plainSeen.size, `${k}: plain sweep on channel ${'rgb'[c]}`)
        .toBe(distinctBytes(Math.max(...BRAND[k])));
      expect(preSeen.size, `${k}: pre-compensated sweep on channel ${'rgb'[c]}`)
        .toBe(distinctBytes(Math.max(...inverseToneMap(BRAND[k]))));
      lost += plainSeen.size - preSeen.size;
    }
    expect(lost, 'pre-compensation cost nothing anywhere, which would make COST 1 fiction')
      .toBeGreaterThan(0);
  });

  it('so an accumulating field is REFUSED, decided by the blend dstFactor and nothing else', () => {
    /*
     * The taxonomy is not "does this look like a rule or a cloud". `dstFactor: 'one'` — the
     * SRC_ALPHA/ONE of `stage.ts:593` and the ONE/ONE of `env/particles.ts:565` — makes
     * overlap SUM and is unbounded. `'one-minus-src-alpha'` (`stage.ts:612`) is a convex
     * combination bounded by its larger contributor, so overlap replaces and cannot
     * accumulate. Same primitive, same colour, opposite answer.
     */
    const additive = precompensate(BRAND.brand, { ...FLOOR_SITE, dstFactor: 'one' });
    expect(isPrecompRefusal(additive)).toBe(true);
    expect((additive as { code: string }).code).toBe('ACCUMULATES');
    expect((additive as { detail: string }).detail).toContain('1.0000x');
    for (const d of ['one-minus-src-alpha', 'none'] as const) {
      expect(isPrecompRefusal(precompensate(BRAND.brand, { ...FLOOR_SITE, dstFactor: d })))
        .toBe(false);
    }
  });

  it('a target above the pole is refused rather than returned as a negative colour', () => {
    /* `exposure(BRAND.brand, 2)` is a 4x scale and 4 > 2.5, so the inverse is −6.6667 in blue
       — a BLACK mark, returned with no error. This is the one refusal that catches a caller
       composing pre-compensation with an exposure decision. */
    const over: readonly [number, number, number] = [0.1, 0.1, PRECOMP_POLE + 0.5];
    expect(inverseToneMap(over)[2]).toBeLessThan(0);
    const r = precompensate(over, FLOOR_SITE);
    expect(isPrecompRefusal(r)).toBe(true);
    expect((r as { code: string }).code).toBe('TARGET_ABOVE_POLE');
  });
});

describe('COST 2 and COST 3 — what the plate and the bloom do to it, measured', () => {
  it('the default plate breaks exactness, so a non-zero plate is refused', () => {
    /*
     * The composite adds `uPlate` before the curve, so pre-compensating `scene` alone misses:
     * brand lands #306dff rather than #2c6bff. The refusal names the vignette because that is
     * why subtracting the plate is not the fix — `pipeline.ts:97` scales it per pixel from
     * 0.38 to 1.0, so the residual would move across the frame instead of being constant.
     */
    const withPlate = cfg('precompDefaultPlate');
    for (const k of KEYS) {
      expect(withPlate[k], `${k} survived the default plate, which would mean it is not added`)
        .not.toBe(BRAND_HEX[k].toLowerCase());
    }
    expect(withPlate.brand).toBe('#306dff');
    const r = precompensate(BRAND.brand, { ...FLOOR_SITE, plate: [0.0045, 0.0075, 0.0205] });
    expect(isPrecompRefusal(r)).toBe(true);
    expect((r as { code: string }).code).toBe('PLATE_NOT_ZERO');
    expect((r as { detail: string }).detail).toContain('vignette');
  });

  it('bloom is decided by LUMINANCE against the bright-pass floor, not by the colour', () => {
    /*
     * THE PREDICATE, AND THE MEASUREMENT IT WAS DERIVED FROM. At bloomGain 0.3 — what
     * FlatBars.tsx:135, FlatDial.tsx:172 and FlatTrack.tsx:150 all ship — three entries stayed
     * EXACT and four shifted, up to ΔE 10.20 on brandBright. The three that stayed exact are
     * exactly the three whose pre-compensated luminance falls below `threshold[0]`, where the
     * bright pass contributes nothing (`pipeline.ts:49-50`).
     *
     * So the split is asserted BOTH WAYS off one predicate. A rule that only checked the
     * shifted rows would pass if the predicate were "always true".
     */
    const floor = 0.12;
    const bloomed = cfg('precompBloom03');
    let below = 0, above = 0;
    for (const k of KEYS) {
      const lum = luminance(inverseToneMap(BRAND[k]));
      const site: CompositeSite = { ...FLOOR_SITE, bloomGain: 0.3, threshold: [floor, 0.7] };
      const exact = bloomed[k] === BRAND_HEX[k].toLowerCase();
      if (lum < floor) {
        below++;
        expect(exact, `${k}: luminance ${lum.toFixed(4)} is under the floor but the pixel moved`).toBe(true);
        expect(isPrecompRefusal(precompensate(BRAND[k], site)), `${k} was refused under a bloom that cannot reach it`).toBe(false);
      } else {
        above++;
        expect(exact, `${k}: luminance ${lum.toFixed(4)} is over the floor but the pixel held`).toBe(false);
        const r = precompensate(BRAND[k], site);
        expect(isPrecompRefusal(r), `${k} was allowed under a bloom that reaches it`).toBe(true);
        expect((r as { code: string }).code).toBe('BLOOM_REACHES_MARK');
      }
    }
    expect(below, 'no entry fell under the bright-pass floor').toBeGreaterThan(0);
    expect(above, 'no entry rose over the bright-pass floor').toBeGreaterThan(0);
  });

  it('a known constant shader scalar is divided out, so the shader delivers the inverse', () => {
    /* `lines.ts:70` writes `uColour * uGain`. Passing the pre-compensated colour straight in at
       gain 2 would double it past the clip; dividing by the gain is what makes the value AT
       THE FRAMEBUFFER the inverse. The header of `precompensate.ts` records why this may not
       be used on `renderMotion.ts:100`, whose gain is driven by data. */
    const scaled = precompensate(BRAND.brand, { ...FLOOR_SITE, shaderScale: 2 });
    expect(isPrecompRefusal(scaled)).toBe(false);
    const wanted = inverseToneMap(BRAND.brand);
    for (let c = 0; c < 3; c++) {
      expect((scaled as readonly number[])[c]! * 2).toBeCloseTo(wanted[c]!, 12);
    }
    expect(isPrecompRefusal(precompensate(BRAND.brand, { ...FLOOR_SITE, shaderScale: 0 }))).toBe(true);
  });

  it('PRECOMP_RULE quotes the measured numbers, so the sentence cannot drift from them', () => {
    /*
     * Same discipline as TONE_POLICY above, and for the same reason: this string is the claim
     * a reader is shown, and the last two universal claims made in this area — "brand hex
     * exact" and "no data-preserving fix exists" — were both false.
     */
    expect(PRECOMP_RULE).toContain(String(record.rows.brand.compositeOnly!.deltaE));
    expect(PRECOMP_RULE).toContain(PRECOMP_CLIP.toFixed(4));
    const c = pinnedChannel('brand');
    expect(PRECOMP_RULE).toContain(`${new Set(sweepPlain.brand!.map((p) => p[c]!)).size} resolvable density steps`);
    expect(PRECOMP_RULE).toContain(`to ${new Set(sweepPrecomp.brand!.map((p) => p[c]!)).size}`);
  });
});
