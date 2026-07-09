import type { PropensityWeights } from './features.js';

/**
 * propensity-v2 — calibrated 2026-07-10 against 36 won deals over a 7,887-
 * project universe (weight-of-evidence in apps/api/src/labels/calibrate.ts;
 * transcribed by hand, never auto-fit at this label count).
 *
 * Measured lifts that set these weights:
 *   mcap small        1.92x  → the $10-100M band is the paying sweet spot
 *   mcap large        3.73x  → n=1, noise; nudged up but not trusted
 *   vol hot           1.34x  → active turnover pays
 *   chainFit          5.62x  → STRONGEST signal: won deals are ERC20/EVM
 *   eu/mica           0.14x  → INVERTED vs. intuition: registry entities are
 *                              CASPs/issuers, not token teams buying listings.
 *                              (Caveat: MiCA cohort is young — revisit yearly.)
 *   categoryFit       0.85x  → mostly missing category data on won deals
 *   preTge            0.47x  → cohort too young to have closed; kept tiny
 * Funding/tokenAge/exchanges had no label coverage yet — priors kept modest.
 */
export const MODEL_VERSION = 'propensity-v2';

export const PROPENSITY_WEIGHTS_V1: PropensityWeights = {
  mcap: { micro: 6, small: 20, mid: 12, large: 6 },
  vol: { illiquid: 2, normal: 8, hot: 12 },
  funding: { m6: 18, m12: 14, m24: 8, older: 2 },
  tokenAge: { newborn: 8, young: 6, mature: 2 },
  exchanges: { none: 4, few: 12, several: 6, many: 1 },
  categoryFit: 4,
  chainFit: 12,
  euPresence: 3,
  verifiedContact: 4,
  preTge: 2,
  alreadyListedCap: 10,
};
