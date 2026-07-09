import { env } from '../lib/env.js';

/**
 * Deliverability send window: emails auto-send only on configured weekdays
 * within configured hours, evaluated in the configured timezone
 * (defaults: Tue-Thu 9:00-17:00 Europe/Berlin).
 */

function zonedParts(date: Date): { weekday: number; hour: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: env.sendWindowTz,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return { weekday: weekdayMap[weekdayStr] ?? 1, hour: Number(hourStr) % 24 };
}

export function isWithinSendWindow(now: Date = new Date()): boolean {
  const { weekday, hour } = zonedParts(now);
  if (!env.sendWindowDays.includes(weekday)) return false;
  return hour >= env.sendWindowStartHour && hour < env.sendWindowEndHour;
}

/** Next window opening after `now` — used for snooze defaults and UI display. */
export function nextSendWindowStart(now: Date = new Date()): Date {
  const probe = new Date(now);
  // Step forward hour by hour until inside the window (bounded to 8 days).
  // Don't round the result: zeroing minutes in machine-local time can fall
  // back out of the window on half-hour-offset timezones.
  for (let i = 0; i < 24 * 8; i++) {
    probe.setTime(probe.getTime() + 60 * 60 * 1000);
    if (isWithinSendWindow(probe)) {
      return probe;
    }
  }
  return probe;
}
