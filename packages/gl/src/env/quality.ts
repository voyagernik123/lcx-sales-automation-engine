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

export interface QualitySettings {
  readonly tier: QualityTier;
  /** Device-pixel multiplier. Everything here is fill-bound, so this dominates. */
  readonly dprScale: number;
  readonly ao: boolean;
  /** Occlusion is gathered at this fraction of the render target. 0.5 is the engine's default. */
  readonly aoScale: number;
  readonly dof: boolean;
  readonly shadowMapSize: number;
  /** Shadow taps per fragment. 1 is a hard edge; the engine's PCF default is 9. */
  readonly shadowTaps: number;
  readonly particleCapacity: number;
  /** Raymarch steps for a volumetric. The layer caps at 256 regardless. */
  readonly volumeMaxSteps: number;
  /** Shadow-ray steps inside a volumetric. 0 gives a flat, volumeless wash. */
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
    dprScale: 2, ao: true, aoScale: 0.5, dof: true,
    shadowMapSize: 1536, shadowTaps: 9,
    particleCapacity: 4096, volumeMaxSteps: 128, volumeLightSteps: 6,
  },
  reduced: {
    /* DOF goes first and resolution stays at 2×, which is the opposite of the usual instinct. Type and
       edges live in the resolution; the lens is the thing E1 measured as costing four of five readable
       panels. Dropping to 1× to keep a blur would trade the reader's legibility for the author's mood. */
    dprScale: 2, ao: true, aoScale: 0.5, dof: false,
    shadowMapSize: 1024, shadowTaps: 9,
    particleCapacity: 2048, volumeMaxSteps: 96, volumeLightSteps: 4,
  },
  minimum: {
    dprScale: 1, ao: false, aoScale: 0.5, dof: false,
    shadowMapSize: 512, shadowTaps: 1,
    particleCapacity: 512, volumeMaxSteps: 48, volumeLightSteps: 0,
  },
};

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
