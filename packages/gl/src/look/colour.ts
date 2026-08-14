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
 *   Standard             #2C6BFF  ← exact          ΔE76  0.0
 *   Khronos PBR Neutral  #2563EF                   ΔE76  4.9
 *   LCX composite        #2C68DC  ← WHAT WE SHIP   ΔE76 18.3
 *   Filmic               #2F75CE                   ΔE76 36.0
 *   AgX                  #467ECF  ← "badly wrong"  ΔE76 41.1
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

/** sRGB electro-optical transfer function, exact — not the 2.2 gamma approximation. */
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

/** The palette in linear working space. Computed once. */
export const BRAND: Readonly<Record<BrandKey, Linear>> = Object.freeze(
  Object.fromEntries(
    (Object.keys(BRAND_HEX) as BrandKey[]).map((k) => [k, hexToLinear(BRAND_HEX[k])]),
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
