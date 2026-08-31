/**
 * One stored origination target, as the read side returns it.
 *
 * Declared HERE, in shared, for the same reason `OriginationResponse` is
 * (`origination.ts:1192`) and `PerimeterView` was moved: the cure surface in the
 * web app consumes this shape AND writes it back, and a hand-copied declaration
 * in the browser is a claim the compiler cannot check — the `GpsSummary`
 * post-mortem (`apps/web/src/lib/api/gps.ts:60`) is what that costs. The API's
 * `toTargetRecord` constructs this type; the web's cure form round-trips it.
 */

import type { GpsTarget } from './targeting.js';

export interface TargetRecord {
  target: GpsTarget;
  status: string;
  clientId: string | null;
  createdBy: string | null;
  createdIso: string;
  updatedIso: string;
  /**
   * The stored instant behind `target.evidence.ageDays` — which is DERIVED and
   * lossy. This field exists because SAVE IS REPLACE, NOT PATCH (`TargetWrite`):
   * a view that dropped the observation instant forced every cure to write the
   * evidence back UNDATED, silently charging the target −10 confidence for being
   * edited. Round-trip it verbatim into `evidence.observedIso` on save.
   */
  evidenceObservedIso: string | null;
}
