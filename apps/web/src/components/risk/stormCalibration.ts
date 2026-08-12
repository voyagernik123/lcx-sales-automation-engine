/**
 * THE CALIBRATION — the numbers that make "the depth of colour here is the total risk between you and
 * that day" a unit conversion rather than a metaphor.
 *
 * This module holds NO renderer and imports nothing, so the wrapper can print the calibration beside the
 * toggle without pulling `@lcx/gl` into the initial bundle. The GL component imports the same constants,
 * so the sentence on the page and the scale in the shader cannot drift apart.
 *
 * ── THE ONE FREE PARAMETER ───────────────────────────────────────────────────────────
 * `RISK_TO_TAU` is optical depth per risk unit. Everything else follows: the density grid is uploaded
 * normalised to 0..1 (the volume layer's contract) and `densityScale` is what turns that back into an
 * integral in risk units — one day's slab is `DAY_M` long, so density × DAY_M must equal cell ×
 * RISK_TO_TAU. That fixes the scale instead of leaving it to be dialled until it looked good, and it is
 * why `docs/3d/e7`'s CPU mirror of the march agrees with the sum of the table to 0.00% on all 21 axial
 * rays.
 *
 * ── AND THE LIMIT, WHICH IS WHAT STOPS THE PICTURE OVER-CLAIMING ─────────────────────
 * The exact form of the claim needs a ray parallel to the day axis. A perspective ray fans out and
 * descends, so it drifts across channels and slides down through severity bands and its accumulation is
 * a MIXTURE. `daysPerRayDescent` is the geometric ceiling: how many days a ray takes to fall the whole
 * height of the field, which is the most any single pixel can integrate. E7's harness measured the real
 * distribution over the 884 sweep rays that cross the field — mean 5.82 days and 1.46 bands, worst case
 * the whole calendar and every band — and those measured figures are quoted rather than recomputed here.
 *
 * The exact instrument for "this channel, this band, total to that day" is an orthographic camera down
 * the day axis, which is a heatmap. Perspective buys the presence and costs the mixture. It is a trade,
 * printed rather than glossed.
 */

/** Metres of calendar per day. */
export const DAY_M = 0.5;
/** Optical depth per risk unit — the only free parameter in the reading. */
export const RISK_TO_TAU = 0.7;
/** Metres of field height per severity band. Within a band there is no gradation. */
export const BAND_H = 0.6;
/** World distance between march samples. One voxel per step. */
export const WORLD_STEP = 0.125;
export const MAX_STEPS = 128;
/** Camera elevation, in degrees. 21.3° is what puts the near and far edges symmetric about the axis. */
export const ELEVATION_DEG = 21.3;

/** Reach of the march. Shorter than the box diagonal means the far side of the field is truncated. */
export const MARCH_REACH_M = WORLD_STEP * MAX_STEPS;

/**
 * The geometric ceiling on how many days one pixel can integrate: a ray at `ELEVATION_DEG` loses
 * `tan(elev)` metres of height per metre travelled down the day axis, so it crosses a field
 * `bands × BAND_H` tall in that many days.
 */
export function daysPerRayDescent(bands: number): number {
  const drop = Math.tan((ELEVATION_DEG * Math.PI) / 180) * DAY_M;
  return (bands * BAND_H) / drop;
}

/** Measured on `docs/3d/e7`'s 884 sweep rays that actually cross the field. Quoted, not recomputed. */
export const E7_MEASURED_SPAN = {
  raysMeasured: 884,
  daysSpannedMean: 5.82,
  daysSpannedMax: 17.5,
  bandsSpannedMean: 1.46,
  bandsSpannedMax: 3,
  axialCheckMaxErrorPct: 0.0,
  axialRays: 21,
} as const;

/** One sentence an operator is owed, with the calibration in it. */
export function calibrationSentence(bands: number): string {
  return `${DAY_M} m per day · ${RISK_TO_TAU} optical depth per risk unit · `
    + `${WORLD_STEP} m × ${MAX_STEPS} steps = ${MARCH_REACH_M.toFixed(1)} m of reach · `
    + `one pixel integrates up to ${daysPerRayDescent(bands).toFixed(1)} days and up to ${bands} band(s) `
    + `(measured mean over ${E7_MEASURED_SPAN.raysMeasured} rays: ${E7_MEASURED_SPAN.daysSpannedMean} days, `
    + `${E7_MEASURED_SPAN.bandsSpannedMean} bands).`;
}
