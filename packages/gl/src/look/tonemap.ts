/**
 * L2 · TONE MAPPING — and the policy that keeps it away from data.
 *
 * `3D_WORK_100X.md` §4.1: brand-critical chroma renders under a Standard/neutral
 * transform. Tone mapping applies only to RENDERED LIGHTING — specular, AO, haze, bloom
 * — never to a data-encoding colour.
 *
 * ── THAT RULE IS NOT TRUE OF THIS PIPELINE, AND WAS NEVER ENFORCED. MEASURED 2026-08-14 ──
 *
 * The paragraph above describes an intent. What the code does is put the tone map "at the
 * end, on everything" — which is exactly the accident it warns about, because at that point
 * data and light ARE the same pixels. `pipeline.ts` composites `plate + scene + bloom` and
 * calls `lcxToneMap` on the sum; the eight 3-D surfaces do the same thing in their own
 * present shader. Every data-encoding colour in the frame goes through the curve.
 *
 * `docs/3d/brand-fidelity.mjs` renders these shaders on a real driver and reads the bytes
 * back. In the most favourable case that can exist — a flat mark at exactly the palette
 * linear value, plate 0, bloom 0, nothing between the constant and the framebuffer but the
 * tone map and the encode:
 *
 *     #2C6BFF  →  #2C68DC     blue −35/255, ΔE76 18.3
 *     #FF8A3D  →  #DC843C     red  −35/255, ΔE76 14.4
 *
 * For scale, `colour.ts` names AgX as "the fashionable default, and badly wrong" for moving
 * brand blue to #467ECF — ΔE76 41.1. Our own composite moves it 18.3, 45% of the transform
 * the doctrine was written to forbid, and 3.7× the Khronos PBR Neutral transform (4.9) that
 * the same table lists without complaint.
 *
 * What the three structural guards actually do, corrected:
 *
 *   - `TONE_POLICY` is a value, not a comment. It is printed by `describeToneMapping()`
 *     under P1, so it is the one place the claim is made TO A READER — which is why it now
 *     states the measured pixel instead of the intent.
 *   - `toneMapComposite` is the ONLY exported mapping function, and its name says where it
 *     runs. It does not say the data escaped it, because the data does not.
 *   - `assertBrandFidelity` is NOT a gate on any of this. See its own note below.
 *
 * The mapping itself is Reinhard with a shoulder parameter, NOT ACES and NOT AgX. It is
 * chosen because it is monotonic, hue-preserving per channel at low values, and rolls
 * accumulated density off instead of clipping it to white — which is the actual problem
 * we have. It is not chosen because it "looks filmic". Nothing here is chosen for that.
 *
 * ── AND THE 2026-08-14 CONCLUSION WENT ONE STEP TOO FAR. CORRECTED 2026-08-15 ──────────
 *
 * This file, and `3D_VFX_100X_LIVE.md` §5 with it, recorded that a data-preserving CURVE
 * cannot exist — brand blue's blue channel is linear 1.0, so a curve pinned there is the
 * identity at 1.0 and has no headroom above — and then concluded that no data-preserving fix
 * exists. THE PREMISE IS RIGHT AND THE CONCLUSION DOES NOT FOLLOW, because the fix is not a
 * curve. Being monotonic, this map is injective on [0, 2.5) and has an exact inverse there.
 * Write `inverseToneMap(target)` into the scene target and the LIVE, UNMODIFIED curve
 * delivers `target`. Measured on a real driver, all seven palette entries land ΔE 0.00.
 *
 * That is narrow, and `look/precompensate.ts` holds the perimeter, the three measured costs
 * and the refusals that enforce them: it is exact for a FIXED-DENSITY unlit mark over a zero
 * plate with no bloom reaching it, and it consumes the ENTIRE highlight range of an
 * ACCUMULATING field — brand blue goes from 6 resolvable density steps to 3 over the same
 * sweep, because the mark starts at the 1.6667 clip point rather than below it.
 */

import type { Linear } from './colour.js';
import { linearToHex, linearToSrgb, BRAND, BRAND_HEX, type BrandKey } from './colour.js';

/**
 * The shoulder. Lower is gentler. 0.40 was picked by capturing the P0 risk cloud at
 * several values and looking: below ~0.3 the dense core clipped to a flat white blob,
 * above ~0.6 the whole frame went milky and the low-density tail stopped reading.
 */
export const TONE_SHOULDER = 0.4;

/*
 * WHAT A READER IS TOLD, and it used to end "so #2C6BFF leaves the pipeline as #2C6BFF".
 * It does not. This string is printed under P1 (docs/3d/p1/entry.ts:80), so that sentence was
 * the claim being made on screen, and it was false for every frame the surface ever drew.
 *
 * The hex and the ΔE below are asserted against the recorded pixel in `brandPixel.test.ts`,
 * so this sentence cannot drift away from the measurement it quotes.
 */
export const TONE_POLICY =
  'Tone mapping runs once, on the composite — and it maps the WHOLE frame, data-encoding ' +
  'colours included. Measured off rendered pixels, a mark WRITTEN AT #2C6BFF leaves the ' +
  'pipeline as #2C68DC (ΔE76 18). The curve is monotone per channel, so ORDER survives: a ' +
  'denser mark never renders lighter than a sparser one. A mark written at ' +
  'inverseToneMap(#2C6BFF) instead leaves it as #2C6BFF, ΔE 0 — exact, and valid only where ' +
  'look/precompensate.ts says so. Every surface that does NOT pre-compensate ships the ' +
  'shift; docs/3d/brand-fidelity.json carries it for every colour.';

/** For printing under a surface. Callers print this; they do not paraphrase it. */
export function describeToneMapping(): string {
  return `${TONE_POLICY} (Reinhard, shoulder ${TONE_SHOULDER}; not ACES, not AgX.)`;
}

/**
 * Reinhard with shoulder, per channel. `c / (1 + c·s)`.
 *
 * Runs on the composite: background + scene + bloom. "After every data colour has already
 * been placed into the frame" is where it runs, NOT a claim that the data escapes it — the
 * data is in that sum and is mapped with everything else. Because the map is per channel and
 * non-linear, it is not even hue-preserving at the top of a channel: brand blue's blue is
 * linear 1.0 and comes back 0.714, while its red at 0.025 comes back 0.025, so the ratio
 * that IS the hue changes and the colour desaturates toward the neutral axis.
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
 * `hexToLinear` followed by `linearToHex`. That is all it is.
 *
 * It was documented as "THE DATA PATH, end to end … no tone map, because this is data",
 * which described a path no surface has. The identity below stands in for "the surface did
 * its work" — but the real pipeline's work between those two points includes `lcxToneMap`
 * on the composite, and substituting the identity for it is what made this look like proof.
 * What it genuinely establishes is narrower and still worth having: the ENCODE is lossless,
 * so nothing in the 8-bit round trip is the source of the shift measured above.
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
 * A CONSISTENCY CHECK ON THE CONSTANTS TABLE. It is not the §7 P1 gate, whatever its name
 * and its seventeen call sites imply.
 *
 * `BRAND[k]` is defined as `hexToLinear(BRAND_HEX[k])`, so this computes
 * `linearToHex(hexToLinear(BRAND_HEX[k])) === BRAND_HEX[k]` — a self-round-trip of a frozen
 * table through two pure functions. It never sees a material, a light, a tone map, a shader
 * or a pixel, and it returns `[]` no matter what the renderer does to the colour afterwards.
 * Seven web surfaces and ten harnesses call it and refuse on a non-empty result; not one of
 * those seventeen refusals can ever fire from a pipeline change, which is how the tone map
 * came to grade every data colour in the system under a rule that says it must not.
 *
 * KEEP IT — a mistyped hex in the table is a real defect and this catches it before any
 * geometry is built. But the on-screen claim it appeared to back is measured, not asserted:
 * `docs/3d/brand-fidelity.mjs` renders and reads pixels, and `brandPixel.test.ts` holds the
 * result. Read that before believing any sentence about brand fidelity in this repo.
 *
 * Returns the failures rather than throwing, so a caller can render the discrepancy instead
 * of crashing — a wrong brand blue is a defect to SHOW, not a reason to blank the surface.
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
 * WHAT THE SHIPPED COMPOSITE DOES TO BRAND BLUE. `#2c68dc`, matching
 * `docs/3d/brand-fidelity.json`'s framebuffer read to within a channel.
 *
 * RENAMED 2026-08-15 from `brandUnderIllegalToneMap`, and the old name is the whole reason a
 * false claim survived. "Illegal" said the curve was hypothetical — something the pipeline
 * guarded against — so the function's result was read all session as evidence the hex SURVIVED,
 * when what it computes is the 35/255 drop in blue that every surface actually ships. Nothing
 * here is hypothetical and nothing is illegal: this is a CPU model of `pipeline.ts`'s own
 * composite, which is why `brandPixel.test.ts` can check it against real GPU bytes.
 */
export function brandThroughComposite(): string {
  return linearToHex(toneMapComposite(BRAND.brand));
}

/** Encode a linear colour for output. The single sRGB encode in the whole pipeline. */
export function encodeOutput(c: Linear): readonly [number, number, number] {
  return [linearToSrgb(c[0]), linearToSrgb(c[1]), linearToSrgb(c[2])];
}
