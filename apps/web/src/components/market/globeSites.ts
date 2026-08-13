/**
 * WHERE THE GLOBE IS ALLOWED TO PUT THINGS, and the arithmetic of who is awake.
 *
 * ── THE ONE THING THIS MODULE EXISTS TO PREVENT ──────────────────────────────────────
 * `MarketMap` carries no coordinates. `MapPoint` has a coarse `region` STRING and nothing else
 * geographic; the scatter beside this is positioned by opportunity and momentum, not by latitude and
 * longitude. So a globe of this dataset CANNOT place a project where its issuer is, because the
 * product does not know where its issuer is.
 *
 * What it can do is place a REGION at a documented reference point for that region, and say so in
 * those words. That is what `REGION_SITES` is: two published geographic centres, each with its
 * provenance carried in the same object so the label on the frame can state it rather than implying a
 * precision the data does not have. A globe that LOOKS like it knows where an organisation is, and
 * does not, is the worst thing this programme could ship — so the coordinates live in a table that a
 * reader can check, nothing is derived per project, and everything the table cannot place is counted
 * and named on the frame instead of being dropped or nudged onto a nearby continent.
 *
 * ── WHY THE TABLE IS SHORT, AND WHY IT IS NOT PADDED ─────────────────────────────────
 * `MarketMap`'s own region filter offers exactly two values, `eu` and `us`, and the propensity
 * feature type (`packages/shared/src/scoring/propensity/features.ts`) declares the column as
 * `'eu' | 'us' | 'other' | null`. Those are the region values the product actually knows about, so
 * those are the entries here. Guessing centroids for country codes nobody has observed in this column
 * would be speculative geography sitting in a shipped file; instead an unrecognised value is reported
 * BY NAME under the frame, which is a better prompt to extend this table than a plausible-looking dot.
 *
 * ── AND WHY SOME KEYS ARE REFUSED ON PURPOSE ─────────────────────────────────────────
 * `other`, `global`, `apac`, `emea` and the rest of `NOT_A_PLACE` are buckets, not places. An area
 * centroid of "APAC" lands in the Celebes Sea and represents nobody; `other` has no centroid at all.
 * They are refused with a reason rather than placed, because a marker in the ocean labelled APAC is a
 * fabricated location wearing a real category name.
 */
import type { MapPoint } from '@/lib/api/bd';

export interface RegionSite {
  /** The normalised `region` string this site stands for. */
  readonly key: string;
  readonly label: string;
  readonly lat: number;
  readonly lon: number;
  /** WHAT THE POINT IS. Printed on the frame, so the reader is told rather than trusted to infer. */
  readonly provenance: string;
}

/**
 * The hub, and it is not a placeholder: LCX AG is registered in Vaduz, Liechtenstein. Every corridor
 * on the frame starts here, which is what makes an arc a claim about a route rather than a curve.
 */
export const HUB = {
  label: 'Vaduz',
  lat: 47.14,
  lon: 9.52,
  provenance: 'LCX AG is registered in Vaduz, Liechtenstein — the one position on this figure that is an address.',
} as const;

/**
 * REPRESENTATIVE POINTS FOR A REGION — published reference points, not chosen by eye.
 *
 * Both are geographic centres somebody else computed and published, which is the whole reason they are
 * defensible: a reader can check them, and neither is a compromise this file invented to make a
 * picture balance.
 */
export const REGION_SITES: readonly RegionSite[] = [
  {
    key: 'eu',
    label: 'EU',
    lat: 49.843,
    lon: 9.903,
    provenance: 'geographic centre of the EU-27, near Gadheim, Germany',
  },
  {
    key: 'us',
    label: 'US',
    lat: 39.833,
    lon: -98.583,
    provenance: 'geographic centre of the contiguous United States, near Lebanon, Kansas',
  },
];

/**
 * Region values that are CATEGORIES rather than locations. Refused with this reason so the frame can
 * say "3 projects in a region this figure has no defensible point for" instead of putting them
 * somewhere that looks deliberate.
 */
const NOT_A_PLACE = new Set([
  'other', 'others', 'global', 'worldwide', 'international', 'row', 'rest of world',
  'apac', 'emea', 'amer', 'americas', 'asia', 'unknown', 'n/a', 'na', 'none',
]);

export type UnplacedReason =
  /** A bucket, not a place. See `NOT_A_PLACE`. */
  | 'NOT_A_PLACE'
  /** A value that may well be a place, but this table has no published point for it. Named on the frame. */
  | 'NO_CENTROID_IN_TABLE'
  /** The column is null or blank. Distinct from the two above: nobody recorded a region at all. */
  | 'NO_REGION_RECORDED';

export interface RegionBook extends RegionSite {
  /** Every project whose region normalises to this key. Always exact — a count cannot be unreadable. */
  readonly projects: number;
  /** How many of them LCX already lists. An observed zero, which is why it is a number and not a null. */
  readonly listed: number;
  /**
   * Summed market cap over the members whose value is READABLE. `null` means not one member carried a
   * finite non-negative figure — which is not the same statement as zero and is never printed as one.
   */
  readonly mcapUsd: number | null;
  /** Members whose `marketCapUsd` was present but NaN, infinite or negative. Counted, never summed. */
  readonly mcapUnreadable: number;
}

export interface UnplacedGroup {
  /** The region string exactly as the API delivered it, or the empty string when the column was null. */
  readonly region: string;
  readonly projects: number;
  readonly listed: number;
  readonly reason: UnplacedReason;
}

export interface GlobeBook {
  readonly sites: readonly RegionBook[];
  readonly unplaced: readonly UnplacedGroup[];
  /** Every point handed in, so the frame can print placed-of-considered rather than a bare total. */
  readonly considered: number;
  readonly placedProjects: number;
}

/**
 * Group the visible universe by region and attach each group to a point on the sphere, or to a named
 * refusal. Sites come out in `REGION_SITES` order so the frame is stable across reloads; unplaced
 * groups come out largest first, because that is the order in which they matter.
 */
export function buildGlobeBook(points: readonly MapPoint[]): GlobeBook {
  const byKey = new Map<string, { raw: string; projects: number; listed: number; mcap: number; mcapReadable: number; mcapUnreadable: number }>();

  for (const p of points) {
    const raw = (p.region ?? '').trim();
    const key = raw.toLowerCase();
    const bucket = byKey.get(key) ?? { raw, projects: 0, listed: 0, mcap: 0, mcapReadable: 0, mcapUnreadable: 0 };
    bucket.projects += 1;
    if (p.listedOnLcx) bucket.listed += 1;
    /*
     * A PRESENT-BUT-BROKEN MARKET CAP IS NOT A ZERO. E3's promotion found the same thing on `BdLead`:
     * `Number(null)` is 0 and `Number('')` is 0, so a value that never arrived reaches this line looking
     * exactly like a company worth nothing. Finite and non-negative or it is counted as unreadable and
     * excluded from the sum, and a region with no readable member reports NO TOTAL rather than $0.
     */
    const m = p.marketCapUsd;
    if (Number.isFinite(m) && m >= 0) { bucket.mcap += m; bucket.mcapReadable += 1; } else { bucket.mcapUnreadable += 1; }
    byKey.set(key, bucket);
  }

  const sites: RegionBook[] = [];
  for (const site of REGION_SITES) {
    const b = byKey.get(site.key);
    if (!b || b.projects === 0) continue;
    sites.push({
      ...site,
      projects: b.projects,
      listed: b.listed,
      mcapUsd: b.mcapReadable > 0 ? b.mcap : null,
      mcapUnreadable: b.mcapUnreadable,
    });
    byKey.delete(site.key);
  }

  const unplaced: UnplacedGroup[] = [];
  for (const [key, b] of byKey) {
    const reason: UnplacedReason = key === ''
      ? 'NO_REGION_RECORDED'
      : NOT_A_PLACE.has(key) ? 'NOT_A_PLACE' : 'NO_CENTROID_IN_TABLE';
    unplaced.push({ region: b.raw, projects: b.projects, listed: b.listed, reason });
  }
  unplaced.sort((a, b) => b.projects - a.projects || a.region.localeCompare(b.region));

  return {
    sites,
    unplaced,
    considered: points.length,
    placedProjects: sites.reduce((n, s) => n + s.projects, 0),
  };
}

/**
 * THE SUB-SOLAR POINT FROM THE READER'S OWN CLOCK, which is what makes the terminator on this frame a
 * reading rather than a lighting choice.
 *
 * The harness at `docs/3d/e2` hard-codes 18N 60E because a capture needs a fixed frame. A product view
 * does not: "which desks are awake" is only worth drawing if the answer is about now.
 *
 * ── WHAT THIS IS ACCURATE TO, STATED RATHER THAN IMPLIED ─────────────────────────────
 * Declination is the standard cosine approximation, good to roughly half a degree of latitude. Solar
 * noon is taken as 12:00 UTC on the prime meridian, which ignores the EQUATION OF TIME — up to ±16
 * minutes across the year, so up to about 4 degrees of longitude. Near the terminator 4 degrees is
 * about a quarter of an hour of daylight, and the caller prints that bound beside the reading. It is
 * also the reader's own clock: a machine with the wrong time gets a wrong terminator, and no
 * server-side check here would change that.
 */
export function subSolarPoint(nowMs: number): { readonly lat: number; readonly lon: number } {
  const d = new Date(nowMs);
  const startOfYear = Date.UTC(d.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - startOfYear) / 86_400_000) + 1;
  const lat = -23.44 * Math.cos(((2 * Math.PI) / 365.24) * (dayOfYear + 10));
  const utcHours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  let lon = -15 * (utcHours - 12);
  while (lon > 180) lon -= 360;
  while (lon <= -180) lon += 360;
  return { lat, lon };
}

/**
 * SOLAR time at a longitude — hours since local solar midnight. Deliberately not civil time: a region
 * centroid has no timezone, and printing "14:32 CET" for a point in a field near Gadheim would be a
 * precision the figure has not earned. The caller labels it SOLAR for that reason.
 */
export function solarHourAt(lonDeg: number, nowMs: number): number {
  const d = new Date(nowMs);
  const utcHours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  return (((utcHours + lonDeg / 15) % 24) + 24) % 24;
}

/** `14.53` → `14:31`. Two digits both sides, because a ragged clock in a monospace column reads as noise. */
export function formatSolarHour(h: number): string {
  const total = Math.round(h * 60) % 1440;
  const hh = Math.floor(total / 60), mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Unit vector for a lat/lon on the same axis convention `latLonToVec3` uses: +X at lon 0, +Y north. */
export function geoUnit(latDeg: number, lonDeg: number): [number, number, number] {
  const la = (latDeg * Math.PI) / 180, lo = (lonDeg * Math.PI) / 180;
  const c = Math.cos(la);
  return [c * Math.cos(lo), Math.sin(la), c * Math.sin(lo)];
}

/** Great-circle separation in degrees. Used for the arc-lift claim, which is about distance, not data. */
export function separationDeg(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const a = geoUnit(aLat, aLon), b = geoUnit(bLat, bLon);
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return (Math.acos(dot) * 180) / Math.PI;
}

/**
 * THE CIRCULAR MEAN OF THE LONGITUDES THAT CARRY DATA — the camera's central meridian.
 *
 * An arithmetic mean of -98.6 and 9.9 is -44.3 and happens to be right; an arithmetic mean of 170 and
 * -170 is 0, which points the camera at the exact opposite side of the planet from both sites. So the
 * mean is taken over unit vectors. The hub is always included, because a frame that hides where LCX is
 * cannot show a corridor leaving it.
 *
 * Returns `null` when the vectors cancel — sites exactly antipodal, where no single face can show them
 * and any choice would be arbitrary. The caller then keeps the hub's own meridian and names what is off
 * the face, rather than pretending one camera answers for both.
 */
export function centralMeridian(lons: readonly number[]): number | null {
  let x = 0, y = 0;
  for (const lon of lons) {
    const r = (lon * Math.PI) / 180;
    x += Math.cos(r); y += Math.sin(r);
  }
  if (Math.hypot(x, y) < 1e-6) return null;
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** Sphere radius the globe is drawn at. Shared so the pin arithmetic below and the renderer cannot disagree. */
export const EARTH_R = 1.0;
/** Tallest pin on the frame, in world units. */
export const PIN_MAX = 0.34;

/**
 * PIN HEIGHT IS THE PROJECT COUNT, PROPORTIONALLY, WITH NO BASE OFFSET.
 *
 * A base offset is the tempting fix for the small case and it is the one thing that cannot be allowed
 * here: `0.06 + 0.28 * n / max` makes a pin with one project 21% as tall as a pin with a hundred, so the
 * only quantitative reading a height can carry is destroyed in order to keep a marker visible. Strictly
 * proportional instead — and where that leaves a pin shorter than a pixel, the frame SAYS SO in pixels
 * rather than quietly rounding it up.
 */
export function pinHeight(projects: number, maxProjects: number): number {
  if (!(maxProjects > 0)) return 0;
  return PIN_MAX * (projects / maxProjects);
}

/**
 * A model matrix that stands a Y-axis primitive up along a surface normal, plus its normal matrix.
 *
 * `cylinder()` is built around +Y. A pin at 40 N must lean, and the rotation has two traps — which is why
 * this lives here, next to a test, rather than inline in the renderer where neither could be checked
 * without a GPU.
 *
 * FIRST, HANDEDNESS. The basis columns must satisfy col0 × col1 = col2 or the determinant is negative, the
 * winding inverts, and the renderer's back-face culling deletes the pin — silently, with no GL error and a
 * frame that simply has one fewer marker on it. So the third column is `cross(t, n)`, not `cross(n, t)`.
 *
 * SECOND, THE NORMAL MATRIX IS COLUMN-MAJOR. `LitDraw.normalMat`'s doc comment says row-major, but
 * `lit.ts` uploads it with `uniformMatrix3fv(..., false, ...)`, which is column-major by definition. The
 * comment has been harmless until now because every normal matrix in this programme has been symmetric — an
 * identity or a mirror in x. A rotation is the first one that is not, and getting it the other way round
 * lights the pin as though it leaned the opposite way: plausible, and wrong. The test asserts the property
 * that matters — that this matrix carries the primitive's own +Y onto the site normal.
 */
export function standOnNormal(
  n: readonly [number, number, number], centreRadius: number,
): { model: Float32Array; normalMat: Float32Array } {
  /* A site at a pole is parallel to world up and `cross` would return the zero vector — a NaN basis and an
     invisible pin. Neither region site is polar, but a table entry added later might be. */
  const ref: readonly [number, number, number] = Math.abs(n[1]) > 0.999 ? [1, 0, 0] : [0, 1, 0];
  const tx = ref[1] * n[2] - ref[2] * n[1];
  const ty = ref[2] * n[0] - ref[0] * n[2];
  const tz = ref[0] * n[1] - ref[1] * n[0];
  const tl = Math.hypot(tx, ty, tz) || 1;
  const t: [number, number, number] = [tx / tl, ty / tl, tz / tl];
  const b: [number, number, number] = [
    t[1] * n[2] - t[2] * n[1],
    t[2] * n[0] - t[0] * n[2],
    t[0] * n[1] - t[1] * n[0],
  ];
  /* Column-major 4×4, matching `Mat4` everywhere else in `@lcx/gl`: translation in 12/13/14. */
  const model = new Float32Array([
    t[0], t[1], t[2], 0,
    n[0], n[1], n[2], 0,
    b[0], b[1], b[2], 0,
    n[0] * centreRadius, n[1] * centreRadius, n[2] * centreRadius, 1,
  ]);
  return {
    model,
    normalMat: new Float32Array([t[0], t[1], t[2], n[0], n[1], n[2], b[0], b[1], b[2]]),
  };
}

/*
 * LABEL COLOURS, AND WHY THEY ARE HERE RATHER THAN INLINE.
 *
 * E6 THE VAULT measures every projected label's contrast against the frame's own pixels with
 * `readPixels`, because its labels lie ON fogged slabs whose brightness is the data. This figure's
 * labels float BESIDE the geometry, so the honest cheap answer is the other one: give the label its own
 * opaque backing plate, and the ratio becomes a property of two authored colours that a unit test can
 * check once instead of a measurement that depends on where the terminator fell today.
 *
 * `contrastRatio` is exported so that test is a real check on the shipped constants rather than a
 * comment claiming they pass.
 */
export const LABEL_FG = '#EAF1FF';
export const LABEL_BG = '#0A1020';
export const LABEL_DIM_FG = '#A9BEE4';

/** WCAG 2.1 relative luminance of a `#rrggbb` string. Returns `null` for anything else. */
export function relativeLuminance(hex: string): number | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  const chan = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan((n >> 16) & 255) + 0.7152 * chan((n >> 8) & 255) + 0.0722 * chan(n & 255);
}

/** WCAG contrast ratio between two `#rrggbb` strings, or `null` if either is unparseable. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
