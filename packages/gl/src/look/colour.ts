/**
 * L2 · COLOUR — the layer that decides professional vs school project.
 *
 * There is exactly one rule here and everything else follows from it:
 *
 *   ┌─────────────────────────────────────────────────────────────────────────┐
 *   │  A colour that MEANS something is DATA. Data is never graded.           │
 *   │  A colour produced by LIGHTING — specular, AO, haze, bloom — is LIGHT.  │
 *   │  Only light gets tone mapped.                                          │
 *   └─────────────────────────────────────────────────────────────────────────┘
 *
 * `3D_WORK_100X.md` §4.1 has this measured from PNG bytes on the Blender track, and it
 * transfers exactly. Brand blue `#2C6BFF` under each view transform:
 *
 *   Standard            #2C6BFF  ← exact
 *   Khronos PBR Neutral #2563EF
 *   AgX                 #467ECF  ← the fashionable default, and badly wrong
 *   Filmic              #2F75CE
 *
 * Reaching for ACES or AgX because it "looks filmic" would silently shift every LCX
 * blue on every chart, and nobody would notice for months.
 *
 * ── AND THAT IS WHAT HAPPENED HERE, WITH OUR OWN CURVE. MEASURED 2026-08-14 ─────────────
 *
 * The sentence that used to end this paragraph — "that is why the tone map in `tonemap.ts`
 * is applied to the COMPOSITE only, after data colour is already placed" — states where the
 * map runs and was read as a reason the data survives it. It is not one. The composite maps
 * `plate + scene + bloom`, and the data colour is inside `scene`. Rendered through the real
 * shaders on a real driver and read back off the framebuffer (`docs/3d/brand-fidelity.mjs`),
 * the table above gains a row it did not have:
 *
 *                                                  ΔE76    ΔE2000
 *   Standard             #2C6BFF  ← exact           0.00     0.00
 *   Khronos PBR Neutral  #2563EF                    4.95     3.49
 *   LCX composite        #2C68DC  ← WHAT WE SHIP   18.31     4.64
 *   Filmic               #2F75CE                   36.04     7.33
 *   AgX                  #467ECF  ← "badly wrong"  41.14     8.04
 *
 * ── THE SECOND COLUMN IS NEW, AND IT IS THE ONE TO READ. CORRECTED 2026-08-15 ───────────
 *
 * Every ΔE in this repo was CIE76 until today, including the 18.3 quoted in the commit that
 * introduced this table. CIE76 is Euclidean distance in Lab with no weighting, and it is
 * known to OVERSTATE in the blue region — which is exactly where the brand anchor sits. So
 * the two conclusions that were drawn off it both move:
 *
 *   · "45% of AgX, 3.7× Khronos" was arithmetic on the wrong metric. Under CIEDE2000 the
 *     shipped composite is 58% of AgX (4.64/8.04) and 1.33× Khronos (4.64/3.49).
 *   · THE RANKING INVERTS. Across the seven palette entries in the composite-only
 *     configuration, CIE76 makes `brand` the worst-hit colour (18.31, against `reference`
 *     14.35); CIEDE2000 makes `reference` the worst (6.70, against `brand` 4.64 — third,
 *     behind `brandBright` 4.74). `brand-fidelity.mjs` reports the deltas alongside ΔE
 *     "because the remedy is chosen on visibility", and under the visibility-correct metric
 *     a remedy would be aimed at the ORANGE, not at the blue.
 *
 * Both metrics are now recorded per row in `docs/3d/brand-fidelity.json` and both are
 * printed by the instrument. Quote ΔE2000 when the question is "can a reader see it";
 * ΔE76 is kept only so the older numbers in the history remain checkable.
 *
 * "Nobody would notice for months" was accurate, and the months have passed. What is true
 * of our curve and not of AgX is that it is MONOTONE per channel, so the density ramp still
 * reads in the right order — see `TONE_POLICY`, which now says so instead of promising a hex.
 *
 * The second rule, which is arithmetic rather than taste: every blend, accumulation and
 * blur happens in LINEAR light, and sRGB is encoded exactly once at output. Additive
 * blending in sRGB is the single most common reason WebGL work looks cheap — the maths
 * is simply wrong, and the result goes grey and muddy at exactly the densities you most
 * want to read.
 */

/** A colour in linear working space. Components are unbounded above 1 — that is the point. */
export type Linear = readonly [number, number, number];

/**
 * sRGB electro-optical transfer function, exact — not the 2.2 gamma approximation.
 *
 * ON THE SHIPPED PATH, which a claim made 2026-08-14 got wrong. The commit said
 * `assertBrandFidelity` "can never fire from a pipeline change"; this function is a pipeline
 * change waiting to happen, because `hexToLinear` calls it and `hexToLinear` authors the
 * `baseColour` of 26 of the 44 materials uploaded to the GPU (GlobeReliefGl.tsx:451-453,
 * ForgeBackdrop.tsx:239, and 23 more). Replacing the body with `Math.pow(c, 2.2)` and
 * running `look.test.ts` makes `assertBrandFidelity()` report 7 failures of 7 keys —
 * reproduced, not reasoned about.
 *
 * The failure it CANNOT see is the matched pair: replace this with `pow(c, 2.2)` AND
 * `linearToSrgb` with `pow(c, 1/2.2)` and the round trip is still the identity, so
 * `assertBrandFidelity()` returns 0 failures while every uploaded linear value is wrong by
 * up to 61.6% (measured on `plate`). That is why `look.test.ts` pins each half against the
 * SPECIFIED curve and not against the other half.
 */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** The inverse. Applied ONCE, at output. */
export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

const HEX = /^#?([0-9a-fA-F]{6})$/;

/**
 * `#RRGGBB` → linear. Throws on anything else rather than falling back to black:
 * a silently-black brand colour is a defect that survives review.
 */
export function hexToLinear(hex: string): Linear {
  const m = HEX.exec(hex.trim());
  if (!m) throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(hex)}`);
  const h = m[1]!;
  return [0, 2, 4].map((i) => srgbToLinear(parseInt(h.slice(i, i + 2), 16) / 255)) as unknown as Linear;
}

/** Linear → `#RRGGBB`. Clamps, because a hex string cannot express HDR. */
export function linearToHex(c: Linear): string {
  const b = c.map((v) => {
    const s = linearToSrgb(Math.min(1, Math.max(0, v)));
    return Math.round(s * 255).toString(16).padStart(2, '0');
  });
  return `#${b.join('')}`;
}

/**
 * THE BRAND PALETTE, and the only colours a surface may encode data in.
 *
 * `brand` is the anchor. The rest exist so a surface never has to invent a hue to show
 * a second series — inventing one is how a figure ends up with library-default blue and
 * orange, which §4 lists as a tell.
 */
export const BRAND_HEX = {
  /** The anchor. Every data encoding starts here. */
  brand: '#2C6BFF',
  /** High end of the density ramp — brand blue lifted, same hue family. */
  brandBright: '#7FB2FF',
  /** Low end. Not black: a data colour that reaches black is indistinguishable from absent. */
  brandDeep: '#12326E',
  /** REFERENCE marks — percentiles, thresholds, targets. Deliberately not a data hue. */
  reference: '#FF8A3D',
  /** REFUSAL / withheld. Reads as "no measurement", never as a low value. */
  refusal: '#6B7A99',
  /** Structure — axes, rules, ticks. Recedes. */
  rule: '#26355A',
  /** Plate background, before the gradient. */
  plate: '#0E1628',
} as const;

export type BrandKey = keyof typeof BRAND_HEX;

/**
 * The palette in linear working space. Computed once.
 *
 * BOTH LEVELS ARE FROZEN, and the inner one was not until 2026-08-15. `Object.freeze` on the
 * record alone stops `BRAND.brand = …`; it does nothing to `BRAND.brand[2] = 0`, because the
 * member was a plain array — `Object.isFrozen(BRAND.brand)` returned FALSE while the type
 * said `readonly [number, number, number]`, so TypeScript refused the write at compile time
 * and the runtime allowed it. That gap matters here specifically: `assertBrandFidelity` is a
 * self-round-trip and cannot fire from a pipeline change, but it CAN fire from a runtime
 * write into this table or a NaN reaching it, and those are precisely the defects a shared
 * mutable palette produces. Freezing the members removes the failure rather than reporting
 * it — the throw (strict mode) now names the line that tried to write.
 */
export const BRAND: Readonly<Record<BrandKey, Linear>> = Object.freeze(
  Object.fromEntries(
    (Object.keys(BRAND_HEX) as BrandKey[]).map((k) => [k, Object.freeze(hexToLinear(BRAND_HEX[k]))]),
  ),
) as Readonly<Record<BrandKey, Linear>>;

/**
 * Scale a linear colour. Used to push a data hue above 1.0 so it survives into the
 * bloom bright-pass — which is a statement about EXPOSURE, not about hue, and so is
 * allowed on data. Multiplying all three channels equally cannot shift a hue.
 */
export function exposure(c: Linear, stops: number): Linear {
  const g = Math.pow(2, stops);
  return [c[0] * g, c[1] * g, c[2] * g];
}

/** Linear interpolation in LINEAR space, which is the only place it is meaningful. */
export function mixLinear(a: Linear, b: Linear, t: number): Linear {
  const u = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

/**
 * Rec. 709 luminance. The bright-pass threshold uses this rather than max(r,g,b) so a
 * saturated blue is not treated as brighter than it looks.
 */
export function luminance(c: Linear): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
