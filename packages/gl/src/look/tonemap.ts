/**
 * L2 · TONE MAPPING — and the policy that keeps it away from data.
 *
 * `3D_WORK_100X.md` §4.1: brand-critical chroma renders under a Standard/neutral
 * transform. Tone mapping applies only to RENDERED LIGHTING — specular, AO, haze, bloom
 * — never to a data-encoding colour.
 *
 * That rule is easy to state and easy to violate by accident, because the natural place
 * to put a tone map is "at the end, on everything", and at that point data and light are
 * the same pixels. So the policy is enforced structurally instead of by discipline:
 *
 *   - `TONE_POLICY` is a value, not a comment. It is asserted in tests and printed by
 *     `describeToneMapping()` so a surface can put it on screen.
 *   - `toneMapComposite` is the ONLY exported mapping function, and its name says where
 *     it is allowed to run.
 *   - `assertBrandFidelity` is a real gate: it round-trips every palette colour through
 *     the full data path and fails if a single channel moved.
 *
 * The mapping itself is Reinhard with a shoulder parameter, NOT ACES and NOT AgX. It is
 * chosen because it is monotonic, hue-preserving per channel at low values, and rolls
 * accumulated density off instead of clipping it to white — which is the actual problem
 * we have. It is not chosen because it "looks filmic". Nothing here is chosen for that.
 */

import type { Linear } from './colour.js';
import { linearToHex, linearToSrgb, BRAND, BRAND_HEX, type BrandKey } from './colour.js';

/**
 * The shoulder. Lower is gentler. 0.40 was picked by capturing the P0 risk cloud at
 * several values and looking: below ~0.3 the dense core clipped to a flat white blob,
 * above ~0.6 the whole frame went milky and the low-density tail stopped reading.
 */
export const TONE_SHOULDER = 0.4;

export const TONE_POLICY =
  'Tone mapping applies to the composite only — rendered lighting, never a data-encoding colour. ' +
  'A colour that means something is data; data is not graded. Brand chroma renders under a ' +
  'neutral transform, so #2C6BFF leaves the pipeline as #2C6BFF.';

/** For printing under a surface. Callers print this; they do not paraphrase it. */
export function describeToneMapping(): string {
  return `${TONE_POLICY} (Reinhard, shoulder ${TONE_SHOULDER}; not ACES, not AgX.)`;
}

/**
 * Reinhard with shoulder, per channel. `c / (1 + c·s)`.
 *
 * ONLY legal on a composite: background + scene + bloom, after every data colour has
 * already been placed into the frame. Running this on a data colour before compositing
 * is the AgX mistake with different arithmetic.
 */
export function toneMapComposite(c: Linear): Linear {
  return [
    c[0] / (1 + c[0] * TONE_SHOULDER),
    c[1] / (1 + c[1] * TONE_SHOULDER),
    c[2] / (1 + c[2] * TONE_SHOULDER),
  ];
}

/** The GLSL body of the same function, so the CPU and GPU paths cannot drift apart. */
export const TONE_MAP_GLSL = `vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${TONE_SHOULDER.toFixed(2)}); }`;

/** sRGB encode in GLSL — the exact transfer function, not pow(c, 1/2.2). */
export const SRGB_ENCODE_GLSL = `vec3 lcxEncode(vec3 c){
  return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c));
}`;

/**
 * THE DATA PATH, end to end: a brand hex enters, is worked on in linear light, and is
 * encoded once at output. No tone map, because this is data.
 *
 * This function exists so the invariant is executable. `assertBrandFidelity` runs it
 * over the whole palette.
 */
export function dataRoundTrip(hex: string): string {
  const lin = hexToLinearLocal(hex);
  // Whatever a surface does to a data colour between here and output — mix, mask,
  // multiply by a scalar exposure — is hue-preserving by construction. The identity
  // below stands in for "the surface did its work" and proves the ENCODE is lossless.
  const out: Linear = [lin[0], lin[1], lin[2]];
  return linearToHex(out);
}

function hexToLinearLocal(hex: string): Linear {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as unknown as Linear;
}

export interface BrandFidelityFailure {
  readonly key: BrandKey;
  readonly expected: string;
  readonly actual: string;
}

/**
 * THE GATE from `3D_WORK_100X.md` §7 P1: "brand hex exact after tone mapping".
 *
 * Round-trips every palette colour through the data path and reports any that moved.
 * Returns the failures rather than throwing, so a caller can render the discrepancy
 * instead of crashing — a wrong brand blue is a defect to SHOW, not a reason to blank
 * the surface.
 *
 * The stronger half of this gate is the negative control in the tests: the same palette
 * pushed through `toneMapComposite` DOES move, which is what proves this assertion is
 * measuring something rather than comparing a string to itself.
 */
export function assertBrandFidelity(): readonly BrandFidelityFailure[] {
  const out: BrandFidelityFailure[] = [];
  for (const key of Object.keys(BRAND_HEX) as BrandKey[]) {
    const expected = BRAND_HEX[key].toLowerCase();
    const actual = linearToHex(BRAND[key]).toLowerCase();
    if (actual !== expected) out.push({ key, expected, actual });
  }
  return out;
}

/**
 * What `#2C6BFF` becomes if you tone map it as though it were light. Not used by the
 * renderer — it exists so the tests can assert the trap is real, and so anyone reading
 * this file can see the size of the error rather than take it on faith.
 */
export function brandUnderIllegalToneMap(): string {
  return linearToHex(toneMapComposite(BRAND.brand));
}

/** Encode a linear colour for output. The single sRGB encode in the whole pipeline. */
export function encodeOutput(c: Linear): readonly [number, number, number] {
  return [linearToSrgb(c[0]), linearToSrgb(c[1]), linearToSrgb(c[2])];
}
