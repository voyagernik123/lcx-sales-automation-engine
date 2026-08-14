import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  BRAND, BRAND_HEX, hexToLinear, linearToHex, srgbToLinear, linearToSrgb,
  exposure, mixLinear, luminance, type BrandKey,
} from './colour.js';
import {
  assertBrandFidelity, brandThroughComposite, toneMapComposite,
  dataRoundTrip, describeToneMapping, TONE_SHOULDER, TONE_MAP_GLSL, SRGB_ENCODE_GLSL,
} from './tonemap.js';
import { PIPELINE_SOURCES } from './pipeline.js';

/**
 * L2 IS THE LAYER THAT DECIDES PROFESSIONAL VS SCHOOL PROJECT, and its central claim —
 * "brand chroma survives the pipeline exactly" — is the kind of claim that passes review
 * for months while being false, because nobody has the previous render open beside the
 * new one.
 *
 * `3D_WORK_100X.md` §4.1 measured the failure on the Blender track: brand blue `#2C6BFF`
 * comes out of AgX as `#467ECF`. That is a shift of 26 in red and 48 in green. It is
 * enormous, it is invisible without a reference, and the fashionable default causes it.
 *
 * So this file does not merely assert the good case. It asserts the BAD case too — that
 * tone mapping a data colour genuinely moves it — because an equality test between two
 * things that were never going to differ proves nothing at all.
 *
 * ── AND THE "GOOD CASE" IN THIS FILE IS EXACTLY THAT EQUALITY TEST. MEASURED 2026-08-14 ──
 *
 * `assertBrandFidelity()` compares `linearToHex(hexToLinear(BRAND_HEX[k]))` with
 * `BRAND_HEX[k]`. Proof that the tone map is not on that path: setting `TONE_SHOULDER` to
 * 0.45 — a real change to the curve every surface runs — leaves every test in this file
 * passing, while `brandPixel.test.ts` fails two.
 *
 * ── THE 2026-08-14 WORDING WAS TOO STRONG, AND CORRECTED HERE 2026-08-15 ─────────────────
 *
 * That commit said the check "can never fire from a pipeline change". Narrow it to what is
 * true, because the overstatement invites deleting a check that does real work:
 *
 *   IT CANNOT FIRE from a change to the composite, the tone curve or the sRGB ENCODE. None
 *   of the three is on the path, which is the whole finding.
 *
 *   IT CAN FIRE from a break in the sRGB TRANSFER PAIR, and that pair ships: `hexToLinear`
 *   calls `srgbToLinear`, and `hexToLinear` authors the `baseColour` of 26 of the 44
 *   materials uploaded to the GPU. REPRODUCED — replacing the body of `srgbToLinear` with
 *   `Math.pow(c, 2.2)` and running this file makes `assertBrandFidelity()` report SEVEN
 *   FAILURES OF SEVEN KEYS (brand #2c6bff→#286bff, brandDeep #12326e→#0a2e6e, and five
 *   more), and four of the fifteen tests fail. That is a pipeline change, and this is the
 *   defect the check exists for.
 *
 * The hole it still has is the MATCHED pair — `pow(c, 2.2)` with `pow(c, 1/2.2)` — which
 * round-trips exactly and reports 0 failures while every uploaded linear value is wrong by
 * up to 61.6%. The last describe block pins each half against its specified curve for
 * exactly that reason.
 *
 * The negative control below is therefore not a control at all. It computes what the
 * SHIPPED composite does to brand blue, and the answer, confirmed against bytes read off a
 * framebuffer in `docs/3d/brand-fidelity.json`, is `#2c68dc` — a 35/255 drop in blue on
 * every surface in the system. Read `brandPixel.test.ts` alongside this file; the claims
 * about rendered colour live there, because only there is anything rendered.
 */

/* The block was named "the data path preserves brand chroma exactly" until 2026-08-15. A describe
   name is printed by the runner, so that sentence was a false claim published on every green run —
   the constants table round-trips; the rendered pixel does not (`brandPixel.test.ts`). */
describe('the palette CONSTANTS table is self-consistent — not that a rendered mark keeps its hex', () => {
  it('every palette colour round-trips to its own hex', () => {
    /* NOT the P1 gate, though it was labelled one here for months. The tone map is not on
       this path, so "brand hex exact after tone mapping" is not what this measures — that is
       in `brandPixel.test.ts`, and it is false.

       "A mistyped hex in BRAND_HEX and nothing else" was itself too narrow, corrected
       2026-08-15: this also fires on a runtime write into BRAND, a NaN reaching it, and a
       break in the sRGB transfer pair — 7 failures of 7 when `srgbToLinear` becomes
       `pow(c, 2.2)`, reproduced. See the header. */
    expect(assertBrandFidelity()).toEqual([]);
  });

  it('#2C6BFF specifically, spelled out, because it is the anchor', () => {
    expect(dataRoundTrip('#2C6BFF').toLowerCase()).toBe('#2c6bff');
    expect(linearToHex(BRAND.brand).toLowerCase()).toBe('#2c6bff');
  });

  it('THE SIZE OF THE SHIFT THE COMPOSITE APPLIES — not a control, the shipped behaviour', () => {
    /*
     * This was called "THE NEGATIVE CONTROL" and described as pinning "the size of the error
     * the policy prevents". The policy prevents nothing: `pipeline.ts:100` runs exactly this
     * function's GLSL twin over `plate + scene + bloom`, and the data colour is inside
     * `scene`. So what this pins is the size of the error the composite CAUSES — 35/255 in
     * blue — and `brandPixel.test.ts` checks the same number against a real framebuffer.
     *
     * The function was `brandUnderIllegalToneMap` until 2026-08-15. `shipped` rather than
     * `wrong` for the same reason the name changed: the curve is not a mistake being
     * demonstrated, it is what every surface runs.
     */
    const shipped = brandThroughComposite().toLowerCase();
    expect(shipped).not.toBe('#2c6bff');

    const [r, g, b] = [1, 3, 5].map((i) => parseInt(shipped.slice(i, i + 2), 16));
    const [R, G, B] = [0x2c, 0x6b, 0xff];
    // Not a rounding wobble — a visible, brand-breaking shift, and it is what ships.
    expect(Math.abs(b! - B)).toBeGreaterThan(20);
    expect(r).toBeLessThanOrEqual(R!);
    expect(g).toBeLessThanOrEqual(G!);
  });

  it('the shift is NOT uniform across the palette, so no single correction undoes it', () => {
    // The tempting "fix" for a graded palette is one global multiplier. Reinhard is
    // non-linear, so the error depends on the value — different colours move by
    // different fractions and there is no scalar that restores all of them.
    const ratios = (Object.keys(BRAND_HEX) as BrandKey[])
      .map((k) => {
        const before = BRAND[k];
        const after = toneMapComposite(before);
        const lb = luminance(before);
        return lb === 0 ? 1 : luminance(after) / lb;
      });
    const spread = Math.max(...ratios) - Math.min(...ratios);
    expect(spread).toBeGreaterThan(0.05);
  });
});

describe('the tone map runs in exactly one place', () => {
  const shaders = {
    'pipeline bright': PIPELINE_SOURCES.bright,
    'pipeline blur': PIPELINE_SOURCES.blur,
    'points fragment': readFileSync(
      resolve(process.cwd(), 'src/primitives/points.ts'), 'utf8'),
    'lines fragment': readFileSync(
      resolve(process.cwd(), 'src/primitives/lines.ts'), 'utf8'),
  };

  it('only the composite calls it', () => {
    expect(PIPELINE_SOURCES.composite).toContain('lcxToneMap(');
    for (const [name, src] of Object.entries(shaders)) {
      expect(src, `${name} tone maps — §4.1 forbids it outside the composite`)
        .not.toContain('lcxToneMap(');
    }
  });

  it('only the composite encodes sRGB — a double encode washes the whole frame out', () => {
    expect(PIPELINE_SOURCES.composite).toContain('lcxEncode(');
    for (const [name, src] of Object.entries(shaders)) {
      expect(src, `${name} encodes sRGB`).not.toContain('lcxEncode(');
    }
  });

  it('no shader in this package reaches for ACES or AgX', () => {
    // Named because they are what a later change would reach for, and because both are
    // wrong here for a reason that has nothing to do with how they look.
    const all = [...Object.values(shaders), PIPELINE_SOURCES.composite].join('\n');
    expect(all).not.toMatch(/\bACES\b|\bAgX\b|RRTAndODT|agxDefaultContrast/i);
  });

  it('the CPU and GPU tone maps use the same shoulder — they cannot silently drift', () => {
    expect(TONE_MAP_GLSL).toContain(TONE_SHOULDER.toFixed(2));
    expect(describeToneMapping()).toContain(String(TONE_SHOULDER));
  });

  it('the GLSL sRGB encode is the real transfer function, not pow(c, 1/2.2)', () => {
    // The 2.2 approximation is off by up to 4% in the darks, which is exactly where a
    // dark instrument plate lives, and it bands visibly across a large gradient.
    expect(SRGB_ENCODE_GLSL).toContain('1.0/2.4');
    expect(SRGB_ENCODE_GLSL).toContain('0.0031308');
    expect(SRGB_ENCODE_GLSL).not.toContain('2.2');
  });
});

describe('the transfer functions are the real ones', () => {
  it('srgbToLinear and linearToSrgb invert each other across the range', () => {
    for (let i = 0; i <= 255; i++) {
      const c = i / 255;
      expect(linearToSrgb(srgbToLinear(c))).toBeCloseTo(c, 10);
    }
  });

  it('the linear segment near black is used, not the power curve', () => {
    // Below 0.04045 sRGB is LINEAR. Using the power curve there crushes the darks, and
    // every surface in this system is a dark instrument plate.
    expect(srgbToLinear(0.02)).toBeCloseTo(0.02 / 12.92, 12);
    expect(srgbToLinear(0.02)).not.toBeCloseTo(Math.pow(0.02, 2.4), 6);
  });

  it('hexToLinear refuses malformed input instead of quietly returning black', () => {
    // A silently-black brand colour survives review; a thrown error does not.
    for (const bad of ['', '#fff', 'blue', '#12345g', '#1234567']) {
      expect(() => hexToLinear(bad)).toThrow(/expected #RRGGBB/);
    }
    expect(hexToLinear('2C6BFF')).toEqual(hexToLinear('#2c6bff'));
  });
});

describe('the operations allowed on a data colour cannot shift its hue', () => {
  it('exposure scales all three channels by the same factor', () => {
    const c = BRAND.brand;
    const up = exposure(c, 1.5);
    const g = Math.pow(2, 1.5);
    expect(up[0]).toBeCloseTo(c[0] * g, 12);
    expect(up[1]).toBeCloseTo(c[1] * g, 12);
    expect(up[2]).toBeCloseTo(c[2] * g, 12);
    // Ratios are the hue. They are unchanged.
    expect(up[2] / up[0]).toBeCloseTo(c[2] / c[0], 12);
  });

  it('mixLinear clamps rather than extrapolating past its endpoints', () => {
    const a = BRAND.brandDeep, b = BRAND.brandBright;
    expect(mixLinear(a, b, -3)).toEqual(a);
    expect(mixLinear(a, b, 4)).toEqual(b);
  });

  it('luminance is Rec.709, so a saturated blue does not out-rank a brighter neutral', () => {
    // A max()-based threshold would bloom pure blue before mid grey. This is why the
    // bright pass thresholds on luminance.
    const blue = hexToLinear('#0000FF');
    const grey = hexToLinear('#808080');
    expect(luminance(blue)).toBeLessThan(luminance(grey));
    expect(Math.max(...blue)).toBeGreaterThan(Math.max(...grey));
  });
});

/* ══ WHAT `assertBrandFidelity` CAN AND CANNOT SEE ═══════════════════════════════════════ */

describe('the palette is immutable and the transfer pair is the specified one', () => {
  it('every BRAND member array is frozen, not merely the record that holds them', () => {
    /*
     * `Object.freeze` on the record alone was all colour.ts had until 2026-08-15:
     * `Object.isFrozen(BRAND.brand)` returned FALSE, so `(BRAND.brand as number[])[2] = 0`
     * succeeded at runtime while the `readonly [number, number, number]` type said it could
     * not. Seven surfaces share these arrays; one write corrupts the palette for all of them
     * for the life of the module, and `assertBrandFidelity` would then report it as a
     * mistyped hex — the right alarm with entirely the wrong cause on it.
     *
     * DERIVED over the table. A hand-list would miss the next palette entry, which is the
     * only one anybody would actually get wrong.
     */
    expect(Object.isFrozen(BRAND)).toBe(true);
    for (const k of Object.keys(BRAND_HEX) as BrandKey[]) {
      expect(Object.isFrozen(BRAND[k]), `BRAND.${k} is a writable array shared by every surface`)
        .toBe(true);
    }
  });

  it('a write into the palette is refused rather than silently corrupting every surface', () => {
    // The freeze above is only worth having if it actually stops the write. Module code is
    // strict, so this throws; before the fix it succeeded and left BRAND.brand[2] === 0.
    expect(() => { (BRAND.brand as unknown as number[])[2] = 0; }).toThrow(TypeError);
    expect(BRAND.brand[2]).toBe(1);
  });

  it('srgbToLinear is the SPECIFIED curve, which a matched pow(2.2) pair would not be', () => {
    /*
     * WHY THIS IS PINNED AGAINST THE SPEC AND NOT AGAINST ITS OWN INVERSE.
     *
     * `assertBrandFidelity` is a round trip, so it sees any break in ONE half of the pair —
     * measured below, 7 of 7 — and NOTHING at all when both halves are replaced together.
     * Substituting `pow(c, 2.2)` and `pow(c, 1/2.2)` leaves the round trip exact and the
     * check clean, while the linear values actually uploaded as `baseColour` are wrong by
     * 16.8% on brand blue and 61.6% on the plate. So the anchor has to be the standard.
     *
     * IEC 61966-2-1: linear segment below 0.04045, then ((c+0.055)/1.055)^2.4.
     */
    expect(srgbToLinear(0.5)).toBeCloseTo(Math.pow((0.5 + 0.055) / 1.055, 2.4), 15);
    expect(srgbToLinear(0.5)).not.toBeCloseTo(Math.pow(0.5, 2.2), 4);
    expect(linearToSrgb(0.5)).toBeCloseTo(1.055 * Math.pow(0.5, 1 / 2.4) - 0.055, 15);
    expect(linearToSrgb(0.5)).not.toBeCloseTo(Math.pow(0.5, 1 / 2.2), 4);
  });

  it('breaking ONE half of the pair fails every key — this is what the check is for', () => {
    /*
     * The 2026-08-14 claim was that `assertBrandFidelity` "can never fire from a pipeline
     * change". `hexToLinear` calls `srgbToLinear` and authors the `baseColour` of 26 of the
     * 44 materials in the system, so the pair IS the pipeline. This recomputes what the
     * check computes with the EOTF replaced by `pow(c, 2.2)` and asserts EVERY key breaks —
     * derived, so a palette entry that survived the substitution (and would therefore be
     * invisible to the real check) fails this instead of being silently tolerated.
     *
     * Confirmed against the real thing: editing `srgbToLinear` in colour.ts to
     * `Math.pow(c, 2.2)` makes `assertBrandFidelity()` return 7 entries and this file report
     * 4 failed tests.
     */
    const keys = Object.keys(BRAND_HEX) as BrandKey[];
    const roundTrip = (eotf: (c: number) => number, oetf: (c: number) => number, hex: string) =>
      '#' + [0, 2, 4].map((i) => {
        const v = parseInt(hex.replace('#', '').slice(i, i + 2), 16) / 255;
        return Math.round(oetf(eotf(v)) * 255).toString(16).padStart(2, '0');
      }).join('');

    const broken = keys.filter((k) =>
      roundTrip((c) => Math.pow(c, 2.2), linearToSrgb, BRAND_HEX[k]) !== BRAND_HEX[k].toLowerCase());
    expect(broken.length, 'a key survived a wrong EOTF, so the check is blind to it there')
      .toBe(keys.length);

    // And the hole, stated as a number rather than a worry: the matched pair is invisible.
    const matched = keys.filter((k) =>
      roundTrip((c) => Math.pow(c, 2.2), (c) => Math.pow(c, 1 / 2.2), BRAND_HEX[k]) !== BRAND_HEX[k].toLowerCase());
    expect(matched.length, 'if this is non-zero the spec pin above can be relaxed').toBe(0);
  });
});

/* ══ THE RECORD'S PRECONDITIONS ═════════════════════════════════════════════════════════ */

const RECORD_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../docs/3d/brand-fidelity.json');
interface Row { readonly pixel: string; readonly deltaE: number; readonly deltaE2000: number }
const RECORD = JSON.parse(readFileSync(RECORD_PATH, 'utf8')) as {
  readonly hdr: boolean;
  readonly driver: string;
  readonly rows: { readonly [k in BrandKey]: { readonly [cfg: string]: Row } };
};

describe('the recorded measurement was taken on the path that ships', () => {
  it('the scene target was RGBA16F — an 8-bit fallback records different pixels', () => {
    /*
     * `record.hdr` was written by the instrument and read by nobody. It was declared in
     * `brandPixel.test.ts` (interface field `hdr`) and never asserted, so the one input that
     * silently changes the answer had no check on it.
     *
     * `stage.ts:291-294` takes `EXT_color_buffer_float` and falls back to RGBA8 with no
     * refusal; `hdr` is `Boolean(float)` at stage.ts:385. On a machine without the extension
     * the palette is quantised to 1/255 BEFORE the composite, and the record shifts:
     * brandDeep #12326b → #16316b (4/255), brand #2c68dc → #2a68dc, plate #0e1628 → #0d1626.
     * Measured by modelling the quantisation against this record, not assumed.
     *
     * The consequence is the diagnosis, which is why this message says it: 4/255 is outside
     * the ±1 CPU/GPU tolerance at `brandPixel.test.ts:123`, so that file would fail with
     * "brandDeep channel 0: CPU says 18, the GPU wrote 22" — a tone-map-drift message for a
     * missing texture-format extension. `brand-fidelity.mjs` now refuses to write such a
     * record at all; this is the second lock, on the record already in the tree.
     */
    expect(
      RECORD.hdr,
      'brand-fidelity.json was measured WITHOUT EXT_color_buffer_float, so its pixels came ' +
      'from an RGBA8 scene target: the palette was quantised to 1/255 before the composite ' +
      '(brandDeep #12326b→#16316b, 4/255) and the ±1 CPU/GPU check in brandPixel.test.ts ' +
      `will fail for that reason and not for a tone-map change. driver: ${RECORD.driver}`,
    ).toBe(true);
  });
});

/* ══ THE METRIC ═════════════════════════════════════════════════════════════════════════ */

/*
 * CIEDE2000, implemented HERE and not imported from `docs/3d/brand-fidelity.mjs`, which is
 * the whole point: that file launches a browser at import time, and a metric checked against
 * its own source is checked against nothing. This one is validated against Sharma/Wu/Dalal's
 * published vectors below, so the record's `deltaE2000` column is confirmed by an
 * independent implementation of the same standard.
 */
const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const fLab = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
function labOf(px: readonly number[]): [number, number, number] {
  const [r, g, b] = px.map((v) => srgbToLinear(v / 255)) as [number, number, number];
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  return [116 * fLab(Y) - 16, 500 * (fLab(X) - fLab(Y)), 200 * (fLab(Y) - fLab(Z))];
}
function de2000Lab(p: readonly number[], q: readonly number[]): number {
  const [L1, a1, b1] = p as [number, number, number], [L2, a2, b2] = q as [number, number, number];
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hue = (bb: number, aa: number) => {
    if (bb === 0 && aa === 0) return 0;
    const h = Math.atan2(bb, aa) * DEG;
    return h < 0 ? h + 360 : h;
  };
  const hp1 = hue(b1, ap1), hp2 = hue(b2, ap2);
  const dL = L2 - L1, dC = Cp2 - Cp1;
  let dh = 0;
  if (Cp1 * Cp2 !== 0) { dh = hp2 - hp1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh * RAD) / 2);
  const Lb = (L1 + L2) / 2, Cpb = (Cp1 + Cp2) / 2;
  let hpb: number;
  if (Cp1 * Cp2 === 0) hpb = hp1 + hp2;
  else if (Math.abs(hp1 - hp2) <= 180) hpb = (hp1 + hp2) / 2;
  else hpb = hp1 + hp2 < 360 ? (hp1 + hp2 + 360) / 2 : (hp1 + hp2 - 360) / 2;
  const T = 1 - 0.17 * Math.cos((hpb - 30) * RAD) + 0.24 * Math.cos(2 * hpb * RAD)
    + 0.32 * Math.cos((3 * hpb + 6) * RAD) - 0.20 * Math.cos((4 * hpb - 63) * RAD);
  const Rc = 2 * Math.sqrt(Math.pow(Cpb, 7) / (Math.pow(Cpb, 7) + Math.pow(25, 7)));
  const Rt = -Math.sin(2 * (30 * Math.exp(-Math.pow((hpb - 275) / 25, 2))) * RAD) * Rc;
  const Sl = 1 + (0.015 * Math.pow(Lb - 50, 2)) / Math.sqrt(20 + Math.pow(Lb - 50, 2));
  const Sc = 1 + 0.045 * Cpb, Sh = 1 + 0.015 * Cpb * T;
  return Math.sqrt(Math.pow(dL / Sl, 2) + Math.pow(dC / Sc, 2) + Math.pow(dH / Sh, 2)
    + Rt * (dC / Sc) * (dH / Sh));
}
const bytesOf = (hex: string): number[] =>
  [0, 2, 4].map((i) => parseInt(hex.replace('#', '').slice(i, i + 2), 16));
const de76 = (a: readonly number[], b: readonly number[]) => {
  const A = labOf(a), B = labOf(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
};
const de2000 = (a: readonly number[], b: readonly number[]) => de2000Lab(labOf(a), labOf(b));

describe('ΔE76 was the wrong metric, and it inverted the ranking', () => {
  it('the CIEDE2000 implementation reproduces Sharma\'s published vectors', () => {
    /* Six of these exist only to exercise the Rt hue-rotation term and the 180° wrap in h̄′.
       An implementation that drops Rt passes the easy pairs and misses these by ~0.5 —
       which is the size of the effect being claimed below, so without this check the
       conclusion rests on an unverified formula. */
    const cases: readonly (readonly [number[], number[], number])[] = [
      [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
      [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0000],
      [[50, 0, 0], [50, -1, 2], 2.3669],
      [[50, 2.4900, -0.0010], [50, -2.4900, 0.0009], 7.1792],
      [[50, 2.4900, -0.0010], [50, -2.4900, 0.0011], 7.2195],
      [[50, -0.0010, 2.4900], [50, 0.0009, -2.4900], 4.8045],
      [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
      [[50, 2.5, 0], [73, 25, -18], 27.1492],
      [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
      [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.2630],
      [[35.0831, -44.1164, 3.7933], [35.0232, -40.0716, 1.5901], 1.8645],
      [[22.7233, 20.0904, -46.6940], [23.0331, 14.9730, -42.5619], 2.0373],
      [[2.0776, 0.0795, -1.1350], [0.9033, -0.0636, -0.5514], 0.9082],
    ];
    for (const [p, q, expected] of cases) {
      // Four decimals is all the published table carries; tighter would be asserting noise.
      expect(de2000Lab(p, q), `Sharma pair ${JSON.stringify(p)}`).toBeCloseTo(expected, 4);
    }
  });

  it('the record\'s two ΔE columns are both reproduced from its own pixels', () => {
    /* The record is regenerated by a script; a metric column that nobody recomputes is a
       number that can be edited by hand or left behind by a partial re-run. Both are checked
       against this file's independent arithmetic, over every row the record carries. */
    let checked = 0;
    for (const k of Object.keys(BRAND_HEX) as BrandKey[]) {
      const t = bytesOf(BRAND_HEX[k]);
      for (const [cfg, row] of Object.entries(RECORD.rows[k])) {
        const px = bytesOf(row.pixel);
        expect(row.deltaE, `${k}/${cfg} ΔE76`).toBeCloseTo(de76(px, t), 2);
        expect(row.deltaE2000, `${k}/${cfg} ΔE2000 — re-run docs/3d/brand-fidelity.mjs`)
          .toBeCloseTo(de2000(px, t), 2);
        checked++;
      }
    }
    expect(checked, 'no rows were checked').toBeGreaterThan(0);
  });

  it('the two metrics disagree about WHICH colour the composite hurts most', () => {
    /*
     * THE CORRECTION THAT CHANGES A CONCLUSION, not just a figure.
     *
     * Every ΔE in this repo was CIE76 until 2026-08-15 — unweighted Euclidean distance in
     * Lab, which overstates in the blue region where the brand anchor sits. Recomputed as
     * CIEDE2000 the composite-only record reads:
     *
     *     brand      ΔE76 18.31 → ΔE2000 4.64      reference  ΔE76 14.35 → ΔE2000 6.70
     *     AgX        ΔE76 41.14 → ΔE2000 8.04      Khronos    ΔE76  4.95 → ΔE2000 3.49
     *
     * so "45% of AgX, 3.7× Khronos" becomes 58% and 1.33×, and the worst-hit colour stops
     * being the blue. `brand-fidelity.mjs` reports the deltas alongside ΔE "because the
     * remedy is chosen on visibility" — under the visibility-correct metric that remedy
     * belongs on `reference`, the orange.
     *
     * ARGMAX, not a hand-written pair of names: if a future re-measure makes the two metrics
     * agree, this fails and the sentence above has to be re-drawn rather than left standing.
     */
    const keys = Object.keys(BRAND_HEX) as BrandKey[];
    const worstBy = (metric: 'deltaE' | 'deltaE2000') =>
      keys.reduce((a, b) =>
        RECORD.rows[b].compositeOnly![metric] > RECORD.rows[a].compositeOnly![metric] ? b : a);

    const w76 = worstBy('deltaE'), w2000 = worstBy('deltaE2000');
    expect(w76).toBe('brand');
    expect(w2000).toBe('reference');
    expect(w76, 'the metrics now agree — re-draw the ranking claim in colour.ts').not.toBe(w2000);

    // And the magnitude claim the header of colour.ts makes, from the record itself.
    const brand = RECORD.rows.brand.compositeOnly!;
    expect(brand.deltaE).toBeGreaterThan(15);          // CIE76 says "brand-breaking"
    expect(brand.deltaE2000).toBeLessThan(5);          // CIEDE2000 says "visible, not gross"
    expect(RECORD.rows.reference.compositeOnly!.deltaE2000).toBeGreaterThan(brand.deltaE2000);
  });
});
