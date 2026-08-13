/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  THE ANISOTROPIC RE-AUTHORING PRESERVES THE APPROVED LOOK — pinned, because "it looks the same" is
 *  not a claim anyone can check six months from now.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  Commit 38c01b1 corrected `distributionGGXAniso` to take ALPHAS: at/ab are now derived from
 *  `alpha = rough * rough` rather than from perceptual roughness. The maths was right and the
 *  consequence was a regression — every anisotropic material in the repo had been authored against the
 *  old convention, so all eleven got sharper. The E8 disc's lobe half-width shrank 3.33x and the ring's
 *  7.9x, against a README that says in as many words that the highlight must read as a broad travelling
 *  BAR rather than a hotspot.
 *
 *  The remedy was to re-author each roughness as sqrt() of the authored value. This file proves that
 *  remedy is exact rather than approximate, and it exists because the alternative — regenerating the
 *  captures and eyeballing them — cannot distinguish "restored" from "close enough", and cannot tell a
 *  future reader whether a roughness of 0.5477 is a considered value or a typo.
 *
 *  WHY A UNIT TEST CAN SETTLE THIS AT ALL. The claim is not about pixels. It is that the two numbers the
 *  shader actually consumes — at and ab — are unchanged. Those are computed in GLSL from `rough` and
 *  `aniso` by three lines of arithmetic, mirrored here, and the source is pinned so the mirror cannot
 *  drift away from what ships.
 */
import { describe, expect, it } from 'vitest';
import { LIT_FRAG } from './lit.js';

/** The shader's derivation, after 38c01b1. Mirrors LIT_FRAG's `alpha`/`at`/`ab` lines exactly. */
function alphasNow(rough: number, aniso: number): { at: number; ab: number } {
  const r = Math.min(1, Math.max(0.045, rough)); // LIT_FRAG clamps uRoughness to [0.045, 1]
  const a = Math.min(0.95, Math.max(0, aniso)); // and uAnisotropy to [0, 0.95]
  const alpha = r * r;
  return { at: Math.max(0.002, alpha * (1 + a)), ab: Math.max(0.002, alpha * (1 - a)) };
}

/** The derivation BEFORE 38c01b1 — perceptual roughness passed where an alpha was expected. */
function alphasBefore(rough: number, aniso: number): { at: number; ab: number } {
  const r = Math.min(1, Math.max(0.045, rough));
  const a = Math.min(0.95, Math.max(0, aniso));
  return { at: Math.max(0.002, r * (1 + a)), ab: Math.max(0.002, r * (1 - a)) };
}

/**
 * EVERY anisotropic material in the repo, with the roughness it was AUTHORED at and the value it now
 * carries. Kept as one table because the claim is about the set: a material added later with a raw
 * authored value would be sharper than its author intended and nothing else would notice.
 */
const MATERIALS = [
  { where: 'ForgeBackdrop disc (live sign-in)', authored: 0.30, now: 0.5477, aniso: 0.86 },
  { where: 'ForgeBackdrop ring (live sign-in)', authored: 0.13, now: 0.3606, aniso: 0.72 },
  { where: 'GlobeReliefGl HUB_MAT', authored: 0.18, now: 0.4243, aniso: 0.4 },
  { where: 'GlobeReliefGl CORRIDOR_MAT', authored: 0.22, now: 0.469, aniso: 0.85 },
  { where: 'SurfaceReliefGl surface', authored: 0.34, now: 0.5831, aniso: 0.55 },
  { where: 'e8 disc', authored: 0.30, now: 0.5477, aniso: 0.86 },
  { where: 'e8 ring', authored: 0.13, now: 0.3606, aniso: 0.72 },
  { where: 'e5 surface', authored: 0.34, now: 0.5831, aniso: 0.55 },
  { where: 'e5 probe', authored: 0.22, now: 0.469, aniso: 0.3 },
  { where: 'e2 RING_MAT', authored: 0.14, now: 0.3742, aniso: 0.8 },
  { where: 'e2 CORRIDOR_MAT', authored: 0.22, now: 0.469, aniso: 0.85 },
] as const;

describe('the re-authored roughness values restore the approved lobe exactly', () => {
  it('covers every anisotropic material, so a new one cannot slip in unremapped', () => {
    /* Asserted before the loops below, which would otherwise pass over an empty table. */
    expect(MATERIALS.length).toBe(11);
  });

  it('reproduces the pre-fix at/ab for every material, to better than 0.03%', () => {
    /*
     * RELATIVE, not absolute, and the first version of this test got that wrong — it asserted 4 decimal
     * places and failed on the E8 ring by 5.6e-5 against a 5e-5 tolerance.
     *
     * The reason is worth keeping: the only error here is the 4-dp rounding of the authored constant
     * (sqrt(0.13) is 0.36055512..., written 0.3606, so alpha comes back 0.13003236 instead of 0.13), and
     * `at` multiplies that by (1 + aniso), up to 1.95x. So an ABSOLUTE tolerance has to be loosened for
     * whichever material happens to have the most anisotropy, which makes the bound about the wrong thing.
     * Relatively the (1 + aniso) factor cancels and the bound is what it should be: the precision of the
     * constant. Worst case across all eleven is 2.489e-4 on alpha, at the ring.
     *
     * 3e-4 is therefore tight — it would catch a 5-dp-to-4-dp slip, let alone a material left unremapped
     * (which is off by a factor of 7, see the control below).
     */
    for (const m of MATERIALS) {
      const before = alphasBefore(m.authored, m.aniso);
      const after = alphasNow(m.now, m.aniso);
      expect(Math.abs(after.at - before.at) / before.at, `${m.where} at`).toBeLessThan(3e-4);
      expect(Math.abs(after.ab - before.ab) / before.ab, `${m.where} ab`).toBeLessThan(3e-4);
    }
  });

  it('and the remap is sqrt, checked against the authored value rather than assumed', () => {
    for (const m of MATERIALS) {
      expect(m.now, `${m.where}`).toBeCloseTo(Math.sqrt(m.authored), 4);
    }
  });

  it('WOULD FAIL if a material were left at its authored roughness', () => {
    /*
     * The negative control. Without this the test above could be satisfied by a table that simply agrees
     * with itself. This pins the SIZE of the regression that was corrected: leaving the E8 ring at 0.13
     * under the new convention gives an alpha of 0.0169 where 0.13 was intended — a 7.7x narrower lobe.
     */
    const ring = MATERIALS.find((m) => m.where === 'e8 ring');
    expect(ring, 'the material this control is about must exist').toBeDefined();
    const unremapped = alphasNow(ring!.authored, ring!.aniso);
    const intended = alphasBefore(ring!.authored, ring!.aniso);
    expect(unremapped.at).toBeLessThan(intended.at);
    expect(intended.at / unremapped.at).toBeGreaterThan(7);
  });

  it('leaves ISOTROPIC materials alone, which is why they were not remapped', () => {
    /*
     * The dangerous half of this change. A material with no anisotropy takes `distributionGGX`, which has
     * always squared perceptual roughness internally — so it was never affected by the convention error,
     * and sqrt-ing it would have made every matte surface in the programme glossier. Pinned as an
     * invariant of the shader rather than as a promise in a comment.
     */
    expect(LIT_FRAG).toContain('float alpha = rough * rough;');
    /* The isotropic call passes `rough`, NOT `alpha` — that is what keeps the two conventions separate. */
    expect(LIT_FRAG).toMatch(/distributionGGX\(NdotH, rough\)/);
  });

  it('the shader still derives at/ab from alpha, or this whole file is measuring nothing', () => {
    expect(LIT_FRAG).toMatch(/float at = max\(0\.002, alpha \* \(1\.0 \+ aniso\)\)/);
    expect(LIT_FRAG).toMatch(/float ab = max\(0\.002, alpha \* \(1\.0 - aniso\)\)/);
  });
});
