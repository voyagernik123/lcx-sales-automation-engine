/**
 * THE QUALITY LADDER, ON THE SURFACES THAT SHIP.
 *
 * `3D_VFX_1000X.md:316` records the ladder as the DECIDED answer to §3.2 — "(c) ladder …
 * `packages/gl/src/env/quality.ts`, wired into all nine". All nine `docs/3d/e0..e8` harnesses do read
 * it. **None of the eight shipping components did.** Every one of them hard-coded its shadow-map size, ran
 * AO and DOF unconditionally, and never passed `shadowTaps` — so the ladder that E0 measured as MANDATORY
 * (11.328 ms at 2x against a 16.6 ms budget, 5.3 ms of headroom on the fastest machine this runs on) existed
 * only in the harnesses, and a weak machine got the full frame with nothing to drop. "Wired into all nine"
 * meant PARAMETERISABLE, not adaptive: each harness reads `?tier=` from the URL and defaults to `full`, and
 * `pickQualityTier` — the function that exists to choose a tier from a measurement — had no caller anywhere
 * in the repo. This module is that caller.
 *
 * ── WHY THE TIER IS RESOLVED ONCE PER PAGE LOAD, AND NEVER REVISED ───────────────────
 * `env/quality.ts` states the three reasons a feedback loop is forbidden, and the third is the one that
 * governs here: a tier that drifts makes the picture a function of the machine's mood. So this resolves ONE
 * tier from ONE measured probe and then stops. A second probe cannot change it — first recording wins —
 * which also makes React 18's double-invoked effects and two reliefs mounting together harmless.
 *
 * ── WHY IT DOES NOT GUESS ────────────────────────────────────────────────────────────
 * `userAgent`, `hardwareConcurrency` and `devicePixelRatio` are all available and all rejected: none of them
 * is a frame time, and `pickQualityTier` already REFUSES rather than guessing when handed a number it cannot
 * compare to a budget. Inferring a tier from a device string would be the guess that function was written to
 * avoid. The only input here is a frame this machine actually rendered.
 *
 * ── THE FAIL-SAFE IS THE WHOLE POINT: EVERY FAILURE PATH IS `full` ───────────────────
 * `full` is today's exact behaviour, so any bug in this file must resolve to it. Before a probe exists, on a
 * software rasteriser, on a renderer string that cannot be read, on a non-finite measurement, and on any
 * throw from `pickQualityTier` itself, the answer is `full`. A defect here can cost a slow machine some
 * frame time; it must never silently downgrade what the product looks like.
 *
 * ── WHY THE MEASUREMENT NEEDS A TRAILING `readPixels`, NOT `gl.finish()` ─────────────
 * `gl.finish()` returns when the command buffer is FLUSHED, not when the GPU is done. This programme
 * published **0.45 ms for a frame that really took 63.7 ms** on exactly that mistake, twice, and E0 also
 * measured a sweep that submitted 833 frames in 4 s of CPU time and then blocked 156 s on the sync behind
 * them. A pixel read cannot be satisfied until the frame it reads exists, which is what makes the clock mean
 * something — so `probeSync` reads a pixel, and it reads it from the framebuffer the frame was DRAWN INTO
 * rather than from the default one. Reading the default framebuffer would only guarantee completion of work
 * affecting the default framebuffer, and every frame in these components lands in an offscreen HDR target.
 *
 * ── AND THE READ FORMAT IS ASKED FOR, NOT ASSUMED ───────────────────────────────────
 * E0 lost a probe to this: `RGBA/UNSIGNED_BYTE` against an `RGBA16F` attachment is GL_INVALID_OPERATION on
 * ANGLE, the read is dropped, and the timing then measures submission again — silently, because GL does not
 * throw. `IMPLEMENTATION_COLOR_READ_FORMAT/TYPE` for the currently bound framebuffer is always an accepted
 * pair, so it is queried. On the driver this repo captures on it comes back RGBA/HALF_FLOAT.
 *
 * ── WHY THIS FILE HAS NO RUNTIME IMPORT FROM `@lcx/gl` ──────────────────────────────
 * `ForgeBackdrop` fetches `@lcx/gl` through a dynamic `import()` because static-importing it into the
 * sign-in route once pushed the shell chunk to 441 KB against a 440 KB ceiling. A static import here would
 * put `@lcx/gl` back into the module graph of everything that reads a tier. So `pickQualityTier` is passed
 * IN by the caller, which already holds it, and the only thing this file takes from the package is a type.
 * Initial JS has 11 KB of headroom (839 of 850 KB) and it fails the build when breached.
 *
 * ── AND WHY THE TWO TYPE POSITIONS NAME A SUB-PATH, NOT THE BARREL ──────────────────
 * Both are erased, so this moves no byte today and it is not claimed to. It is a GUARD. This module is
 * imported by nearly every route; the one edit that would put the whole renderer back into the initial
 * chunk is somebody dropping the word `type` from the line below. Pointing the specifier at
 * `env/quality.js` — the module those two names actually live in — makes that slip cost one leaf module
 * instead of `src/index.ts` and everything Rollup groups behind it, which `docs/3d/w2/SUBPATH_COST.md` §9
 * measured at 100,709 B across 13 chunks on a real build.
 */
import { useEffect, useState } from 'react';
import type { QualityTier } from '@lcx/gl/env/quality.js';

/** Structural, so this file carries no runtime dependency on the package the function lives in. */
type PickQualityTier = typeof import('@lcx/gl/env/quality.js')['pickQualityTier'];

/**
 * 60 Hz. Two of the eight surfaces have frames after their first — `ForgeBackdrop`'s five-second arc and
 * `DeckReliefGl`'s focus rack — so a frame budget is literally a frame budget there. For the six that render
 * once and stop it is a LATENCY budget: 16.6 ms is the longest single main-thread block that does not read
 * as a stall, which is the same number for a different reason.
 */
const BUDGET_MS = 16.6;

export interface ResolvedTier {
  readonly tier: QualityTier;
  /** `pickQualityTier`'s own words where it chose, or the fail-safe reason where it did not. */
  readonly reason: string;
  /** Which surface's frame was measured, so a tier can be traced to a scene rather than to "the machine". */
  readonly source: string;
  /** The measurement the tier came from, or null when nothing was measured. */
  readonly msAtProbeTier: number | null;
}

const UNPROBED: ResolvedTier = {
  tier: 'full',
  reason: 'NO_PROBE_YET — nothing has measured a frame on this machine, so the tier is the one that ships',
  source: 'default',
  msAtProbeTier: null,
};

let resolved: ResolvedTier | null = null;
const listeners = new Set<() => void>();

/** The tier every environment built from here on must use. `full` until a probe says otherwise. */
export function resolveQualityTier(): QualityTier {
  return resolved?.tier ?? UNPROBED.tier;
}

/**
 * The resolution WITH its reason.
 *
 * `env/quality.ts` is explicit that a tier which cannot be reported cannot be trusted — "a capture has to be
 * able to say which tier it shows, or the numbers beside it describe a configuration nobody can
 * reconstruct". The app has no capture harness, so the components stamp `data-quality-tier` on their canvas
 * and this is where a debug surface reads the rest.
 */
export function qualityTierReport(): ResolvedTier {
  return resolved ?? UNPROBED;
}

/** True while no tier has been resolved, i.e. the next frame drawn is worth measuring. */
export function needsQualityProbe(): boolean {
  return resolved === null;
}

/**
 * SwiftShader and llvmpipe are the two software rasterisers this repo actually lands on, and E0 refuses to
 * compute headroom on either: the ratio between a CPU rasteriser and real hardware is not a constant, so a
 * tier picked from one describes a machine nobody ships on.
 *
 * ── THIS TREATS "UNKNOWN" AS SOFTWARE, WHERE E0 TREATS IT AS HARDWARE, AND THAT IS DELIBERATE ──
 * E0's asymmetry is about publishing a number: calling hardware "software" loses a figure, calling software
 * "hardware" publishes a fictional budget. Here the asymmetry runs the other way. An unreadable renderer
 * string that we call hardware lets a meaningless measurement DOWNGRADE the product; called software it
 * refuses and the product stays exactly as it ships. So a browser that hides
 * `WEBGL_debug_renderer_info` — some privacy configurations do — never gets a lower tier, which is the
 * direction a bug in this file is allowed to be wrong in.
 */
export function isSoftwareRasteriser(gl: WebGL2RenderingContext): boolean {
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (!dbg) return true;
    const name = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '');
    if (name.length === 0) return true;
    return /swiftshader|llvmpipe|software/i.test(name);
  } catch {
    /* A context that throws on an extension query cannot be characterised, and an uncharacterisable
       machine keeps the frame it ships with. */
    return true;
  }
}

/**
 * Force the currently bound framebuffer's frame to COMPLETE, and return whether the read was accepted.
 *
 * A `false` here is not cosmetic — it means the sync did not happen, so any interval measured across it is a
 * submission time rather than a frame time, and the caller must throw the measurement away instead of
 * feeding it to the ladder. That is the 0.45-vs-63.7 ms failure, caught rather than published.
 */
export function probeSync(gl: WebGL2RenderingContext): boolean {
  /*
   * Drained first, so a pre-existing error from setup is not read as this call's failure — the same reason
   * E0's probe drains before it steps.
   *
   * BOUNDED, AND THE BOUND IS NOT DEFENSIVE PADDING. The first version was `while (gl.getError() !== NO_ERROR)`,
   * which is the form E0 uses, and it HUNG THE TEST RUNNER: a context whose `getError` keeps returning the same
   * code never terminates that loop, and the whole vitest process had to be killed. GL's own contract says the
   * queue empties, so anything past 32 codes is a driver or a stub that is not honouring it — and a
   * non-terminating loop inside a performance probe is a frozen tab, not a lost measurement.
   */
  for (let i = 0; i < 32 && gl.getError() !== gl.NO_ERROR; i++) { /* discard */ }
  const format = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT) as number;
  const type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE) as number;
  /* One pixel. The read exists to be a sync point, not to be looked at, and a larger read would add
     bandwidth to the number being measured. */
  const px = pixelBufferFor(gl, type);
  if (!px) return false;
  gl.readPixels(0, 0, 1, 1, format, type, px);
  return gl.getError() === gl.NO_ERROR;
}

/** The typed array `readPixels` requires for a queried type. Half floats have no typed array of their own. */
function pixelBufferFor(gl: WebGL2RenderingContext, type: number): ArrayBufferView | null {
  if (type === gl.UNSIGNED_BYTE) return new Uint8Array(4);
  if (type === gl.FLOAT) return new Float32Array(4);
  if (type === gl.HALF_FLOAT) return new Uint16Array(4);
  if (type === gl.UNSIGNED_INT) return new Uint32Array(4);
  if (type === gl.INT) return new Int32Array(4);
  /* An unrecognised read type is not guessed at. Returning null makes the caller discard the measurement,
     which resolves to `full`. */
  return null;
}

/**
 * Time ONE frame of `render`, warmed up, synced, and reported as the cheaper of two samples.
 *
 * THE WARM-UP IS NOT OPTIONAL. The first frame pays shader upload and texture allocation; E5 records that
 * averaged over a four-frame batch that alone can dominate the result. Six of the eight components render
 * exactly one frame and then stop, so their only frame IS their warm-up frame — timing it would attribute
 * compilation to the GPU and systematically downgrade every machine. Hence a discarded frame first.
 *
 * TWO TIMED SAMPLES, AND THE MINIMUM OF THEM. One sample can catch a GC pause or a compositor hitch, and a
 * single unlucky 40 ms would drop a fast machine to `minimum` for the rest of the page load. A minimum
 * cannot understate GPU cost — every sample is sync-bounded below by the real frame — so it is the estimator
 * that only ever errs toward keeping quality high.
 *
 * `render` MUST leave the framebuffer it drew into bound. See `probeSync`.
 */
export function measureFrameMs(
  gl: WebGL2RenderingContext,
  render: () => void,
  samples = 2,
): number | null {
  try {
    render();
    if (!probeSync(gl)) return null;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < Math.max(1, samples); i++) {
      const t0 = performance.now();
      render();
      if (!probeSync(gl)) return null;
      best = Math.min(best, performance.now() - t0);
    }
    return Number.isFinite(best) && best > 0 ? best : null;
  } catch {
    /* A renderer that throws mid-probe has not produced a measurement. `null` resolves to `full`. */
    return null;
  }
}

/**
 * Resolve the page load's tier from one measured frame. Idempotent: the FIRST recording wins.
 *
 * `pick` is `pickQualityTier` from `@lcx/gl`, passed in rather than imported — see the header on chunking.
 */
export function recordQualityProbe(opts: {
  readonly pick: PickQualityTier;
  readonly gl: WebGL2RenderingContext;
  /** Null when the frame could not be measured, which is a refusal and therefore `full`. */
  readonly msAtProbeTier: number | null;
  /** The tier the measured frame was actually rendered at. Not the tier we hope for. */
  readonly probeTier: QualityTier;
  /** The component that measured it, for `qualityTierReport`. */
  readonly source: string;
}): ResolvedTier {
  if (resolved) return resolved;
  const { pick, gl, msAtProbeTier, probeTier, source } = opts;

  if (msAtProbeTier === null) {
    return commit({
      tier: 'full',
      reason: 'UNMEASURABLE_FRAME — no sync-bounded frame time, so no tier was chosen',
      source, msAtProbeTier: null,
    });
  }

  let outcome: { tier: QualityTier; reason: string };
  try {
    outcome = pick({
      msAtProbeTier,
      probeTier,
      budgetMs: BUDGET_MS,
      software: isSoftwareRasteriser(gl),
      /*
       * `requested` is the tier the frame was BUILT at, and it caps the answer. On the first probe of a page
       * load that is `full`, so this is a direct measurement of the full tier against the budget rather than
       * an extrapolation — the cost ratios in `pickQualityTier` only come into play for the tiers it is
       * predicting DOWN to.
       */
      requested: probeTier,
    });
  } catch {
    /* The ladder refusing is a documented outcome; the ladder THROWING is a bug in it, and a bug must not
       change what the product looks like. */
    return commit({
      tier: 'full',
      reason: 'LADDER_THREW — tier selection failed, so the shipped configuration stands',
      source, msAtProbeTier,
    });
  }

  return commit({ tier: outcome.tier, reason: outcome.reason, source, msAtProbeTier });
}

function commit(r: ResolvedTier): ResolvedTier {
  resolved = r;
  /* Copied before iterating: a listener that unsubscribes during notification would otherwise mutate the
     set being walked. */
  for (const fn of [...listeners]) fn();
  return r;
}

/**
 * Subscribe to the resolution — for the surfaces that can act on it WITHOUT the reader seeing the change.
 *
 * The six components that render one frame into an offscreen target and only then present it can be rebuilt
 * at a new tier with no visible artefact at all, because nothing has been painted yet. They use this.
 *
 * `ForgeBackdrop` deliberately does NOT: it is mid-animation, and restarting a five-second arc so the
 * ambient occlusion can disappear is precisely the "frame contradicting itself" that `env/quality.ts` bans.
 * It reads the tier once, at effect start, and lives with it until it next mounts.
 */
export function useResolvedQualityTier(): QualityTier {
  const [tier, setTier] = useState<QualityTier>(resolveQualityTier);
  useEffect(() => {
    const onChange = (): void => setTier(resolveQualityTier());
    listeners.add(onChange);
    /* Resolution can land between the first render and this effect — two reliefs mounting together do
       exactly that — so the current value is re-read on subscribe rather than assumed unchanged. */
    onChange();
    return () => { listeners.delete(onChange); };
  }, []);
  return tier;
}

/**
 * Reset the page load's resolution. TESTS ONLY.
 *
 * Module state that survives between tests makes the second test read the first one's tier, which is the
 * kind of order-dependent pass this repo has been bitten by in `ci-mirror` and in Vitest's worker
 * assignment. Exported under a name nobody reaches for by accident.
 */
export function __resetQualityTierForTests(): void {
  resolved = null;
  listeners.clear();
}
