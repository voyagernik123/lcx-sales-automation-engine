import { describe, expect, it } from 'vitest';
import {
  hexToLinear, inverseToneMap, skyIrradiance, toneMapComposite, encodeOutput,
  TONE_SHOULDER, luminance, type Linear,
} from '@lcx/gl';
import { forgeRig, lightExposure, FORGE_GROUND } from '../ForgeBackdrop';

/**
 * E8'S GROUND MAY NOT RENDER AS WHITE.
 *
 * ── THE DEFECT THIS EXISTS TO CATCH ─────────────────────────────────────────────────
 * Measured on the deployed sign-in screen — headless chromium 1280x800 @2, the app's own theme
 * switch, a real rAF wait — 37.07% of the LIGHT frame was fully clipped, every channel at 254 or
 * above. Segmenting the frame by dropping each draw in turn attributed it: the floor is 40.09% of
 * the frame and 94.86% OF THE FLOOR was one value. The page background is rgb(244,246,250), under
 * the threshold on all three channels, so none of it was the page.
 *
 * The term was the KEY'S DIFFUSE LOBE ON THE GROUND. `lcxToneMap` is c/(1+0.4c) and reaches 1.0 at
 * c = 1/(1-0.4) = 1.6667; the ground's radiance was 1.6886 / 1.7827 / 1.9435 and the key's diffuse
 * term alone was 1.3853 / 1.4295 / 1.4844 of that — 82%, 80%, 76%.
 *
 * ── WHAT THIS FILE ASSERTS, AND WHY IT IS NOT CIRCULAR ──────────────────────────────
 * It does NOT ask `lightExposure` whether `lightExposure` is right; that would be an identity.
 * It takes the gains `forgeRig` ACTUALLY HANDS TO THE RENDERER and pushes them through a
 * transcription of `env/lit.ts`'s ground shading, then through `@lcx/gl`'s own `toneMapComposite`
 * and `encodeOutput` — the real pipeline arithmetic, and the exact place the defect lived. Delete
 * the exposure term, or invert the solve's `min` to a `max`, and the numbers below go over.
 *
 * ── WHAT IT CANNOT MEASURE, SAID PLAINLY ────────────────────────────────────────────
 * THE RENDERED PIXEL. Node has no GPU, and `apps/web` has no capture harness. Everything here is
 * arithmetic. What makes the arithmetic trustworthy is that the same transcription was checked
 * against the GPU: rendered at 1280x800 @2, it agreed with the framebuffer to 0/255 on all twelve
 * on-screen floor pixels in DARK, where nothing clips and a disagreement could not hide behind a
 * saturated channel. The rendered before/after is in the commit message, not in this file.
 */

/** Where the tone map stops encoding. Derived from the shipped shoulder, never written as 1.6667. */
const CLIP = 1 / (1 - TONE_SHOULDER);

const MATH = { hexToLinear, inverseToneMap, skyIrradiance };
const ch = [0, 1, 2] as const;
/* DELIBERATELY NOT CLAMPED. A framebuffer saturates at 255, and clamping here would report the
   defect and the fix as the same number. An over-range channel prints as 256+ and says so. */
const byte = (linear: Linear): [number, number, number] =>
  encodeOutput(toneMapComposite(linear)).map((v) => Math.round(255 * v)) as [number, number, number];

/**
 * THE GROUND'S BRIGHTEST RADIANCE under a given rig — `env/lit.ts`'s ground terms, transcribed.
 *
 *   direct  = kd·albedo/π · lightColour · N·L      (metalness 0, so kd is just the Fresnel rest)
 *   ambient = skyColour(N)·albedo · ambientGain    (metalness 0, so no env specular lobe)
 *
 * `kd` and the key's own specular lobe are dropped, exactly as the shipped solve drops them: they
 * pull opposite ways and cancel to within 1.04%, measured against the full BRDF. The residual sign
 * is conservative — this OVERSTATES the ground — which is the direction a clipping guard wants.
 */
function groundPeak(keyGain: number, ambientGain: number): Linear {
  const albedo = hexToLinear(FORGE_GROUND.hex.light);
  const sky = skyIrradiance([0, 1, 0], FORGE_GROUND.sky);
  return ch.map((c) => albedo[c] * (
    (FORGE_GROUND.keyTint[c] * keyGain * FORGE_GROUND.peakNdotL) / Math.PI + sky[c] * ambientGain
  )) as unknown as Linear;
}

describe('the light rig cannot blow the ground out', () => {
  const rig = forgeRig(false, MATH);
  const peak = groundPeak(rig.keyGain, rig.ambientGain);

  it('no channel of the ground reaches the tone map\'s clip point', () => {
    for (const c of ch) {
      expect(peak[c],
        `channel ${c} of the ground is at ${peak[c].toFixed(4)} against a clip point of ${CLIP.toFixed(4)}.`
        + ' Above it every radiance is the same pixel and 40% of the sign-in screen carries no'
        + ' information. This is the 2026-08-15 defect returning.').toBeLessThan(CLIP);
    }
  });

  it('and therefore encodes below 255, so the specular is the brightest thing in frame', () => {
    /* A ground that cannot reach 255 means anything that DOES reach it is strictly brighter — which
       is the product-shot property: the metal's travelling highlight owns the top of the range, not
       the sweep behind it. Rendered, the brightest pixel moved off the floor and onto the disc. */
    for (const c of ch) expect(byte(peak)[c]).toBeLessThan(255);
  });

  it('the ground renders AT the albedo it was authored with, not above it', () => {
    /* `theme.ts` records E8's light ground as #D7DEEA and this file sets it. The defect was that an
       albedo of 215 rendered at 255. The solve targets `inverseToneMap(albedo)` on the binding
       channel, so the brightest ground pixel comes back as the authored colour. */
    const authored = hexToLinear(FORGE_GROUND.hex.light);
    const target = byte(inverseToneMap(authored));
    const got = byte(peak);
    for (const c of ch) {
      expect(got[c], `channel ${c} renders ${got[c]} against an authored ${target[c]}`).toBeLessThanOrEqual(target[c]);
    }
    expect(Math.max(...ch.map((c) => target[c] - got[c])),
      'no channel landed ON the authored albedo, so the solve is not binding anywhere and the'
      + ' exposure is lower than the criterion asks for — that is a flattened frame, not a fixed one.')
      .toBeGreaterThanOrEqual(0);
    expect(Math.min(...ch.map((c) => target[c] - got[c])),
      'the binding channel must land exactly on the authored albedo').toBe(0);
  });

  it('and is NOT traded for a dead one: the lit floor still outruns the room it sits in', () => {
    /* The failure mode on the other side. An exposure low enough to stop the clip by making the
       ground grey has swapped a blown highlight for a dead one, and the tell is the ground sinking
       to the brightness of the sky that lights it. Every channel of the lit ground must exceed the
       sky's own zenith radiance — the ambient source — or the floor stops reading as lit at all. */
    const zenith = FORGE_GROUND.sky.zenith;
    for (const c of ch) {
      expect(peak[c], `channel ${c}: ground ${peak[c].toFixed(4)} vs sky zenith ${zenith[c]}`)
        .toBeGreaterThan(zenith[c]);
    }
    expect(luminance(peak)).toBeGreaterThan(luminance(zenith as unknown as Linear));
  });

  it('the exposure actually does something — the negative control', () => {
    /* Without this, an exposure that silently resolved to 1 would pass every assertion above only
       if the rig had never been broken, and would pass none of them if it had. Pin the direction. */
    expect(rig.exposure).toBeLessThan(1);
    expect(rig.exposure).toBe(lightExposure(MATH));
    /* And the rig it replaces must FAIL the clip test, or the test above proves nothing. */
    const before = groundPeak(7.4, 0.62);
    expect(Math.max(before[0], before[1], before[2]),
      'the pre-fix rig no longer clips in this model, so the model has drifted away from the defect'
      + ' it was written to catch and none of the assertions above are load-bearing.').toBeGreaterThan(CLIP);
  });
});

describe('and the DARK rig is untouched, by construction', () => {
  const dark = forgeRig(true, MATH);

  it('multiplies by the exact float identity, so the dark frame cannot move', () => {
    /* `dark ? 1 : LIGHT_EXPOSURE`. Multiplication by 1.0 is exact in IEEE 754, so these are strict
       equalities and not approximations. If the exposure ever leaks into the dark branch, this is
       the assertion that says so — before anyone has to look at a screenshot. */
    expect(dark.exposure).toBe(1);
    expect(dark.keyGain).toBe(5.2);
    expect(dark.ambientGain).toBe(1.15);
    expect(dark.shadowStrength).toBe(0.9);
  });

  it('and the light branch is genuinely a different set of numbers', () => {
    /* The negative control for the test above: if light and dark resolved to the same rig, every
       dark assertion would pass while the light theme was unlit. */
    const light = forgeRig(false, MATH);
    expect(light.keyGain).not.toBe(dark.keyGain);
    expect(light.ambientGain).not.toBe(dark.ambientGain);
    expect(light.shadowStrength).not.toBe(dark.shadowStrength);
  });

  it('the dark ground is nowhere near the clip point, which is why it is exempt and not solved', () => {
    /* The criterion the light solve uses — "render at your albedo" — is a light-studio criterion.
       Run against dark it returns 0.692 and would DARKEN a room whose near-black floor was authored
       to be lifted off black on purpose. The reason it is safe to exempt dark is this margin. */
    const albedo = hexToLinear(FORGE_GROUND.hex.dark);
    const sky = skyIrradiance([0, 1, 0], undefined);
    const peak = ch.map((c) => albedo[c] * (
      (FORGE_GROUND.keyTint[c] * dark.keyGain * FORGE_GROUND.peakNdotL) / Math.PI + sky[c] * dark.ambientGain
    )) as unknown as Linear;
    expect(Math.max(peak[0], peak[1], peak[2]) / CLIP).toBeLessThan(0.01);
  });
});
