import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { BRAND, BRAND_HEX, linearToHex, srgbToLinear, type BrandKey } from './colour.js';
import { toneMapComposite, TONE_POLICY, TONE_MAP_GLSL, SRGB_ENCODE_GLSL } from './tonemap.js';
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
      for (const cfg of ['compositeOnly', 'asShipped', 'litMarker', 'litCentre']) {
        expect(record.rows[k][cfg]?.pixel, `${k}/${cfg} missing`).toMatch(/^#[0-9a-f]{6}$/);
      }
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
     * THE REPLACEMENT INVARIANT. The exact hex does not survive the composite and cannot be
     * made to (a curve that fixes brand blue's linear-1.0 blue channel has no headroom left
     * above 1.0, which deletes the only reason this pipeline has a tone map at all). What
     * survives, and what a reader of a chart actually depends on, is that a denser mark
     * never renders lighter than a sparser one.
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
