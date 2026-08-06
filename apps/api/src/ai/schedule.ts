/**
 * 3-9 Smart scheduling — PURE deterministic, no LLM.
 *
 * Given a jurisdiction/region, returns a timezone-aware recommended send window
 * (local business hours, mid-week, avoiding Monday-morning inbox pileups and
 * Friday-afternoon dead zones). Used to time outreach for maximum open rates.
 */

export interface SendTimeRecommendation {
  region: string;
  timezone: string;
  /** Recommended local hour (24h) to send. */
  bestLocalHour: number;
  /** Recommended weekdays (0=Sun..6=Sat). */
  bestWeekdays: number[];
  /** The next concrete send timestamp (ISO) at or after `from`. */
  nextSendAt: string;
  rationale: string;
}

interface RegionProfile {
  timezone: string;
  bestLocalHour: number;
  bestWeekdays: number[];
}

// Region → timezone + local peak. Tue/Wed/Thu 10:00 local is the global sweet
// spot; US skews to 10:00 ET, APAC handled via 'other' fallback.
const PROFILES: Record<string, RegionProfile> = {
  eu: { timezone: 'Europe/Berlin', bestLocalHour: 10, bestWeekdays: [2, 3, 4] },
  us: { timezone: 'America/New_York', bestLocalHour: 10, bestWeekdays: [2, 3, 4] },
  uk: { timezone: 'Europe/London', bestLocalHour: 10, bestWeekdays: [2, 3, 4] },
  apac: { timezone: 'Asia/Singapore', bestLocalHour: 10, bestWeekdays: [2, 3, 4] },
  other: { timezone: 'UTC', bestLocalHour: 10, bestWeekdays: [2, 3, 4] },
};

function normalizeRegion(input: string | null | undefined): string {
  const r = (input || '').toLowerCase().trim();
  // hasOwnProperty.call, not `in` — see intel/monitors.ts:44. Here the consequence is
  // milder (a bogus region name would be accepted as a profile key and then read as
  // undefined downstream) but the shape is identical and it is not worth keeping.
  if (Object.prototype.hasOwnProperty.call(PROFILES, r)) return r;
  if (['europe', 'eea', 'liechtenstein', 'germany', 'france'].some((x) => r.includes(x))) return 'eu';
  if (['united states', 'usa', 'america'].some((x) => r.includes(x))) return 'us';
  if (['england', 'britain', 'london'].some((x) => r.includes(x))) return 'uk';
  if (['asia', 'singapore', 'japan', 'korea', 'hong kong'].some((x) => r.includes(x))) return 'apac';
  return 'other';
}

/**
 * Get the hour in a given IANA timezone for a Date, using Intl (no deps).
 */
function hourInTz(date: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false });
  return Number(fmt.format(date));
}
function weekdayInTz(date: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' });
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[fmt.format(date)] ?? 0;
}

/**
 * Deterministic best send time. `from` defaults to now — the next matching
 * (weekday, hour) slot in the region's timezone is returned.
 */
export function bestSendTime(region: string | null | undefined, from: Date = new Date()): SendTimeRecommendation {
  const key = normalizeRegion(region);
  const profile = PROFILES[key];

  // Walk forward up to 14 days to find the next slot on a good weekday whose
  // local hour has not yet passed. We advance hour-by-hour for correctness
  // across DST without pulling in a tz library.
  const cursor = new Date(from.getTime());
  let found: Date | null = null;
  for (let i = 0; i < 24 * 14; i++) {
    const wd = weekdayInTz(cursor, profile.timezone);
    const hr = hourInTz(cursor, profile.timezone);
    if (profile.bestWeekdays.includes(wd) && hr === profile.bestLocalHour && cursor.getTime() >= from.getTime()) {
      found = new Date(cursor.getTime());
      break;
    }
    cursor.setTime(cursor.getTime() + 60 * 60 * 1000);
  }

  return {
    region: key,
    timezone: profile.timezone,
    bestLocalHour: profile.bestLocalHour,
    bestWeekdays: profile.bestWeekdays,
    nextSendAt: (found ?? cursor).toISOString(),
    rationale:
      `Mid-week (Tue–Thu) at ${profile.bestLocalHour}:00 ${profile.timezone} maximizes open rates — ` +
      `avoids Monday inbox pileups and Friday drop-off, and lands in the recipient's morning.`,
  };
}
