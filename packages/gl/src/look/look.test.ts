import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BRAND, BRAND_HEX, hexToLinear, linearToHex, srgbToLinear, linearToSrgb,
  exposure, mixLinear, luminance, type BrandKey,
} from './colour.js';
import {
  assertBrandFidelity, brandUnderIllegalToneMap, toneMapComposite,
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
 * `BRAND_HEX[k]`. Nothing in the pipeline is on that path, so no pipeline change can move
 * it. Proof: setting `TONE_SHOULDER` to 0.45 — a real change to the curve every surface
 * runs — leaves all 15 tests in this file passing, while `brandPixel.test.ts` fails two.
 *
 * The negative control below is therefore not a control at all. It computes what the
 * SHIPPED composite does to brand blue, and the answer, confirmed against bytes read off a
 * framebuffer in `docs/3d/brand-fidelity.json`, is `#2c68dc` — a 35/255 drop in blue on
 * every surface in the system. Read `brandPixel.test.ts` alongside this file; the claims
 * about rendered colour live there, because only there is anything rendered.
 */

describe('the data path preserves brand chroma exactly', () => {
  it('every palette colour round-trips to its own hex', () => {
    /* NOT the P1 gate, though it was labelled one here for months. This catches a mistyped
       hex in BRAND_HEX and nothing else — the tone map is not on this path. "Brand hex exact
       after tone mapping" is measured in `brandPixel.test.ts`, and it is false. */
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
     */
    const wrong = brandUnderIllegalToneMap().toLowerCase();
    expect(wrong).not.toBe('#2c6bff');

    const [r, g, b] = [1, 3, 5].map((i) => parseInt(wrong.slice(i, i + 2), 16));
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
