/*
 * E9 · THE QUALITY LADDER.
 *
 * §8 of the plan hedged this: "the frame budget in §3.2 is an estimate … my AO and DOF numbers are the
 * shakiest; if they are 2× out, the ladder becomes mandatory rather than optional." E0 measured, and the
 * answer is that it is MANDATORY. 11.328 ms at 2× with depth of field, against a 16.6 ms budget, is 5.3 ms
 * of headroom on an M1 — the fastest machine this will run on. There is no version of "optional" that
 * survives that.
 *
 * ── WHAT A LADDER MUST NOT DO ────────────────────────────────────────────────────────
 * The obvious design is a frame-time feedback loop that drops a tier when it sees a slow frame. Three
 * reasons this does not do that, and the third is the one that matters:
 *
 *   1 · §6 rule 2 forbids idle animation, so there is no continuous loop to measure from. A harness renders
 *       N frames, then one, then stops.
 *   2 · A loop that changes quality while the reader looks at it makes the picture a function of the
 *       machine's mood. Ambient occlusion appearing three seconds in is not a graceful degradation, it is
 *       the frame contradicting itself.
 *   3 · IT WOULD MAKE THE TIER UNREPORTABLE. A capture has to be able to say which tier it shows, or the
 *       numbers beside it describe a configuration nobody can reconstruct. A tier chosen once, from an
 *       explicit probe, is a fact about the frame. A tier that drifts is not.
 *
 * So: the tier is resolved ONCE, from either an explicit request or one measured probe, and it is a value
 * the caller reports. Every environment renders at a stated tier.
 *
 * ── WHY THE TIERS DROP WHAT THEY DROP ────────────────────────────────────────────────
 * In cost order, measured on E0's real M1 rather than guessed: depth of field is the most expensive single
 * pass (11.328 against 4.914 with it off at 2×, so it is roughly 6.4 ms on its own), ambient occlusion is
 * next, and the shadow map's cost is quadratic in its size and cheap to halve. Resolution scale multiplies
 * everything that is fill-bound, which is all of it.
 *
 * The ladder therefore drops in that order, and it drops DOF first even though DOF is the most cinematic
 * thing here — because E1 already measured that a wide aperture costs an operator four of five readable
 * panels. The most expensive pass is also the one whose loss costs the reader least. That is a happy
 * accident and it is worth saying out loud, because it will not be true of the next effect.
 */

/** Coarsest first, so a numeric comparison and the reading order agree. */
export const QUALITY_TIERS = ['minimum', 'reduced', 'full'] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];

/*
 * ── THREE FIELDS DELETED, 2026-08-13. WHY EACH WAS A FICTION ──────────────────────────
 * §4.2 of the plan wired `shadowTaps` and then found the same defect in three more fields: declared per
 * tier, read by nothing — not the app, not one of the nine harnesses. A field nobody reads is worse than
 * no field, because the monotonicity test below made all three look load-bearing. Each was checked
 * against what it would actually have done if wired, and none of the three survived:
 *
 *   · `aoScale: 0.5` — IDENTICAL IN ALL THREE TIERS, so it could not describe anything a tier controlled
 *     even in principle, and AO is off entirely at `minimum`. The 0.5 is a property of the AO pass
 *     (`ao.ts` gathers at `fullWidth >> 1`) and is argued there as CORRECT rather than as a compromise:
 *     occlusion is low-frequency and a bilateral blur smooths a full-res result away anyway. Quarter-res
 *     would also double the silhouette error in the depth-derivative normal, because that central
 *     difference steps two AO texels. A constant belongs where the constant is true, not in the ladder.
 *
 *   · `particleCapacity: 4096/2048/512` — the ONE caller, E3, needs 956 particles simultaneously alive
 *     (published in `docs/3d/e3/README.md`: 952-955 observed against an analytic 956) and its capture
 *     gate fails outside 2% of that. `minimum`'s 512 slots cannot hold 956, so the tier would have
 *     capped the live count at 54% of the reading — and density IS the reading here, one particle per
 *     $800/day. At the OTHER end it would have doubled E3's 2048 to 4096 — the same silent enlargement
 *     `shadowMapSizeFor` below exists to prevent, on the tier every capture is taken at. And capacity is
 *     not free to choose in the first place: `slotRecycleSeconds = slots / emissionPerSec` must exceed the
 *     longest life or emission kills particles that should still be alive, so capacity is FIXED by the
 *     emitter's own arithmetic. A tier cannot know that number; only the environment can.
 *
 *   · `volumeMaxSteps: 128/96/48` — at a fixed world step, steps are REACH, not quality:
 *     `volume.ts` caps the view ray at `uMaxSteps`, so reach = worldStep × maxSteps. E7 prints
 *     `marchReachM` (0.125 × 128 = 16.0 m) beside `boxDiagonalM`, and StormRelief prints the same reach
 *     to the operator in `calibrationSentence`. E7's box is 14.00 m in z alone (28 days × 0.5 m), so
 *     `reduced`'s 96 steps reach 12.0 m and `minimum`'s 48 reach 6.0 m — BOTH truncate the far side of
 *     the field while the printed sentence still claims 16.0. Distant days would show less risk than
 *     they have. That is the "gaps never zeros" rule with the sign flipped, and it is why
 *     `StormReliefGl.tsx` had already refused this field in a comment before the field was removed.
 *
 * `volumeLightSteps` survived because it modulates RADIANCE only — `lightTransmittance` never touches
 * `alpha`, and alpha is the channel a volumetric reading assigns to magnitude. Its minimum changed; see
 * the ladder below.
 */
export interface QualitySettings {
  readonly tier: QualityTier;
  /** Device-pixel multiplier. Everything here is fill-bound, so this dominates. */
  readonly dprScale: number;
  readonly ao: boolean;
  readonly dof: boolean;
  /**
   * The shadow rung, as an absolute. NOT to be handed to `createShadowMap` — see `shadowMapSizeFor`,
   * which reads THIS field to derive its multiplier so there is one statement of the rung and not two.
   */
  readonly shadowMapSize: number;
  /** Shadow taps per fragment. 1 is a hard edge; the engine's PCF default is 9. */
  readonly shadowTaps: number;
  /**
   * Shadow-ray steps inside a volumetric, 0..16. 0 makes `lightTransmittance` return 1 for every
   * sample: a flat wash with no lit top and no dark underside, which `volume.ts` calls the entire cue
   * that makes a volume read as having volume. The ladder therefore floors this at 1, not 0.
   */
  readonly volumeLightSteps: number;
}

/**
 * The ladder itself.
 *
 * `minimum` is deliberately not "nothing": it keeps the shadow map, at one tap. A scene with no shadow at
 * all loses contact between object and ground, and an object that does not sit on a surface reads as a
 * mistake rather than as a cheaper render — which is worse than a hard-edged shadow by a wide margin.
 */
const LADDER: Record<QualityTier, Omit<QualitySettings, 'tier'>> = {
  full: {
    dprScale: 2, ao: true, dof: true,
    shadowMapSize: 1536, shadowTaps: 9, volumeLightSteps: 6,
  },
  reduced: {
    /* DOF goes first and resolution stays at 2×, which is the opposite of the usual instinct. Type and
       edges live in the resolution; the lens is the thing E1 measured as costing four of five readable
       panels. Dropping to 1× to keep a blur would trade the reader's legibility for the author's mood. */
    dprScale: 2, ao: true, dof: false,
    shadowMapSize: 1024, shadowTaps: 9, volumeLightSteps: 4,
  },
  minimum: {
    /*
     * `volumeLightSteps` WAS 0 HERE, AND 0 IS THE ONE VALUE THIS RUNG IS NOT ALLOWED TO TAKE.
     *
     * The field's own doc said 0 gives "a flat, volumeless wash" and the ladder shipped it anyway —
     * exactly the mistake the paragraph above forbids for the shadow map. `volume.ts` returns
     * transmittance 1.0 for every sample below 1 step, so the cloud loses its lit top and dark
     * underside entirely and reads as fog on the lens rather than as something occupying the room.
     * 1 step is one texture fetch and one exp() per march sample, and it still darkens an underside
     * because a ray from below crosses more field: the cheapest thing that is not nothing.
     *
     * This changes no published capture — every harness defaults to `full` and every capture is taken
     * there — so the surface it changes is the weak machine, which is the surface the ladder is for.
     */
    dprScale: 1, ao: false, dof: false,
    shadowMapSize: 512, shadowTaps: 1, volumeLightSteps: 1,
  },
};

/**
 * Scale an environment's OWN shadow-map size by tier, rather than replacing it.
 *
 * Wiring the ladder in naively used the tier's absolute `shadowMapSize`, which silently ENLARGED three
 * environments: E0, E2 and E8 had each chosen 1024 and were handed 1536 at the default tier — a 2.25x bigger
 * map, and three captures that changed without anyone saying so. A quality ladder that alters what an
 * environment looks like at its highest tier is not a ladder, it is a redesign.
 *
 * So the tier is a MULTIPLIER on a baseline the environment picked for its own scene. E1's 1536 was chosen
 * because its shadow tails cross a 15 m deck; E8's 1024 because its subject is one disc. Both are right, and
 * neither is the ladder's business.
 *
 * Snapped to a power of two, since the baselines are and a non-power-of-two depth texture is a needless
 * driver risk for no benefit.
 *
 * ── THE MULTIPLIER IS NOW DERIVED, BECAUSE THERE WERE TWO LADDERS ─────────────────────
 * This function hard-coded `1 / 0.5 / 0.25` while LADDER above declared `1536 / 1024 / 512`, which is
 * `1 / 0.667 / 0.333`. Two statements of one rung, disagreeing, neither aware of the other — and the
 * monotonicity test asserted the declared one while every shipped shadow map came from the hard-coded
 * one. That is the same defect class as `shadowTaps`: the field read as the guarantee and was not it.
 *
 * The declared numbers win, since they are what the interface documents and what the test checks.
 * MEASURED BEFORE THE CHANGE, because "behaviour-identical" is the kind of claim that is usually assumed:
 * across every power-of-two baseline from 1 to 16384 and the 1536/3072/6144 family, the power-of-two snap
 * makes the two factors return the identical size — 0 mismatches of 54 — and the only baselines in this
 * repo are 1024 (seven components, plus E0, E2, E8) and 1536 (DeckReliefGl, plus E1, E3-E7). So no shipped
 * shadow map moves by a texel. Over the integer baselines 1..8192 the two disagree on 5,249, every one of
 * them a non-power-of-two, where the old factors shrank `reduced` by up to 2.5× against a declared 1.5×.
 */
export function shadowMapSizeFor(tier: QualityTier, baseline: number): number {
  const base = Number.isFinite(baseline) && baseline > 0 ? baseline : 1024;
  const factor = LADDER[tier].shadowMapSize / LADDER.full.shadowMapSize;
  const wanted = base * factor;
  const pot = 2 ** Math.round(Math.log2(wanted));
  /* 256 is the floor: below that the map is coarser than the contact shadow it exists to draw, and a
     contact shadow that misses its own object is worse than a hard-edged one. */
  return Math.max(256, Math.min(base, pot));
}

export function qualitySettings(tier: QualityTier): QualitySettings {
  return { tier, ...LADDER[tier] };
}

/**
 * Choose a tier from a measured frame time at a KNOWN tier.
 *
 * `msAtProbeTier` must be a real measurement — the trailing-`readPixels` kind, not `gl.finish()`, which
 * returns on command-buffer flush and produced two published numbers 140× wrong in this programme.
 *
 * The scaling factors are E0's measurements, not guesses: 11.328 ms at 2× with DOF, 4.914 at 2× without,
 * 1.305 at 1× without. So DOF is about 2.3× the rest of the frame, and 2× is about 3.8× the cost of 1×.
 * Those ratios are what let one probe predict another tier instead of requiring three.
 */
export function pickQualityTier(opts: {
  readonly msAtProbeTier: number;
  readonly probeTier: QualityTier;
  /** Frame budget in ms. 16.6 for 60 Hz, 33.3 for 30. */
  readonly budgetMs: number;
  /**
   * A software rasteriser cannot be compared to a frame budget at all — the ratio to real hardware is not
   * a constant. Rather than pick a tier from a meaningless number, this REFUSES and returns the caller's
   * requested tier with a reason, so a headless capture renders what it was asked for and says so.
   */
  readonly software?: boolean;
  readonly requested?: QualityTier;
}): { tier: QualityTier; reason: string; predictedMs: Record<QualityTier, number> } {
  const { msAtProbeTier, probeTier, budgetMs } = opts;
  const requested = opts.requested ?? 'full';

  /* Relative cost of each tier, normalised so the probe tier is 1. Derived from E0's three measurements:
     the DOF pass is ~2.3× the rest of the frame at 2×, and 2× is ~3.8× 1×. */
  const COST: Record<QualityTier, number> = { full: 11.328, reduced: 4.914, minimum: 1.305 };

  if (opts.software) {
    return {
      tier: requested,
      reason: 'SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET — tier not chosen by measurement',
      predictedMs: { full: Number.NaN, reduced: Number.NaN, minimum: Number.NaN },
    };
  }
  if (!(msAtProbeTier > 0) || !Number.isFinite(msAtProbeTier) || !(budgetMs > 0)) {
    return {
      tier: requested,
      reason: 'NO_USABLE_PROBE — a tier chosen from an unmeasured frame would be a guess wearing a number',
      predictedMs: { full: Number.NaN, reduced: Number.NaN, minimum: Number.NaN },
    };
  }

  const unit = msAtProbeTier / COST[probeTier];
  const predictedMs = {
    full: Number((COST.full * unit).toFixed(3)),
    reduced: Number((COST.reduced * unit).toFixed(3)),
    minimum: Number((COST.minimum * unit).toFixed(3)),
  };

  /* Highest tier that FITS, capped by what was requested — a caller asking for `reduced` on a fast machine
     gets `reduced`, because the request may be about legibility rather than speed. E1's DOF finding is
     exactly that case. */
  const cap = QUALITY_TIERS.indexOf(requested);
  for (let i = QUALITY_TIERS.length - 1; i >= 0; i--) {
    if (i > cap) continue;
    const t = QUALITY_TIERS[i]!;
    if (predictedMs[t] <= budgetMs) {
      return { tier: t, reason: `${predictedMs[t]} ms predicted against a ${budgetMs} ms budget`, predictedMs };
    }
  }
  /*
   * NOTHING FITS. Returns `minimum` and says so rather than inventing a fourth tier below it: a machine
   * that cannot render `minimum` inside its budget should be shown the flat surface, and that is a decision
   * for the caller — §6 rule 1 already requires every environment to have one.
   */
  return {
    tier: 'minimum',
    reason: `BUDGET_UNREACHABLE — even minimum is ${predictedMs.minimum} ms against ${budgetMs} ms; `
      + 'the caller should prefer its flat fallback',
    predictedMs,
  };
}

/**
 * Reduced motion — §6 rule 3, "resolves to the final frame, not a faster animation".
 *
 * Returns `true` when the environment must present its END STATE immediately. Defaults to TRUE when the
 * preference cannot be read, which is the safe direction: a reader who cannot be asked is assumed to want
 * no motion, and the cost of being wrong is a still frame rather than unwanted movement.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    /* Some embedded webviews throw on an unrecognised media feature rather than returning false. Treated
       as "cannot be read", which means reduced. */
    return true;
  }
}

/**
 * Has the reader asked their OS for more contrast?
 *
 * THIS EXISTED NOWHERE, and it was the only user preference the engine did not read: `prefers-contrast`
 * appears in no file under `docs/3d` or `packages/gl`. Measured with Playwright's `contrast: 'more'` on
 * E6 and E7 — `mq.more = true`, and every computed colour, every swatch and the canvas filter byte-for-
 * byte identical to the normal run. A reader who has explicitly asked for more contrast was still being
 * handed E6's 1.25:1 tick and its 1.47:1 panel note.
 *
 * Both signals, because they mean the same thing to a renderer and only one of them is widely
 * implemented: `forced-colors: active` is Windows High Contrast, which also replaces the palette
 * outright, and `prefers-contrast: more` is the explicit request on macOS and Android.
 *
 * ── WHY THIS DEFAULTS TO FALSE, WHERE REDUCED MOTION DEFAULTS TO TRUE ────────────────
 * The asymmetry is deliberate and is the whole reason this is a separate function rather than a copy.
 * An unasked-for STILL frame costs a reader nothing, so an unreadable motion preference resolves to
 * "no motion". An unasked-for high-contrast treatment changes the design for everyone whose browser
 * does not implement the query — including every capture this programme is gated on. Absence of a
 * request is not a request, so it resolves to false.
 *
 * WHAT A CALLER IS EXPECTED TO DO WITH IT: raise projected DOM content to full opacity, drop the blur
 * on it to zero, floor any fog-driven attenuation of label colour, and put a solid plate behind
 * overlay text. All four are decisions the SURFACE owns — this package renders no DOM — so this
 * function is the hook and not the fix.
 */
export function prefersMoreContrast(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  for (const q of ['(forced-colors: active)', '(prefers-contrast: more)']) {
    try {
      if (window.matchMedia(q).matches) return true;
    } catch {
      /* Same webviews as above: an unrecognised media feature throws rather than returning false. One
         unreadable query must not hide the other, so this continues instead of returning. */
    }
  }
  return false;
}
