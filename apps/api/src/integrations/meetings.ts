import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';

// ── Types ──

export interface Availability {
  // ISO weekday numbers (0=Sun … 6=Sat) the operator is bookable on.
  days: number[];
  // Local working window, 24h clock.
  startHour: number;
  endHour: number;
  // Timezone label (informational — slots are generated in UTC-naive terms).
  tz?: string;
}

export const DEFAULT_AVAILABILITY: Availability = {
  days: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 17,
  tz: 'Europe/Berlin',
};

export interface MeetingLink {
  id: string;
  slug: string;
  title: string;
  durationMin: number;
  availability: Availability;
  createdAt: string;
}

export interface Slot {
  startAt: string; // ISO
  endAt: string; // ISO
}

// ── Deterministic slot generation ──
// Given a link's availability + duration, produce the bookable slots for the
// next `days` calendar days. Purely deterministic: same inputs → same slots.

export function generateSlots(
  availability: Availability,
  durationMin: number,
  fromDate: Date = new Date(),
  days = 14,
): Slot[] {
  const slots: Slot[] = [];
  const avail = normalizeAvailability(availability);
  const dur = durationMin > 0 ? durationMin : 30;

  // Anchor at the start of `fromDate` (UTC) so output is stable across a day.
  const anchor = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate()));

  for (let d = 0; d < days; d++) {
    const day = new Date(anchor.getTime() + d * 86_400_000);
    if (!avail.days.includes(day.getUTCDay())) continue;

    for (let hour = avail.startHour; hour < avail.endHour; hour++) {
      for (let min = 0; min < 60; min += dur) {
        if (min + dur > 60 && hour + 1 > avail.endHour) break;
        const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, min));
        const end = new Date(start.getTime() + dur * 60_000);
        // Do not spill past the end of the working window.
        if (end.getUTCHours() > avail.endHour || (end.getUTCHours() === avail.endHour && end.getUTCMinutes() > 0)) {
          continue;
        }
        slots.push({ startAt: start.toISOString(), endAt: end.toISOString() });
      }
    }
  }
  return slots;
}

function normalizeAvailability(a: Availability | null | undefined): Availability {
  if (!a) return DEFAULT_AVAILABILITY;
  return {
    days: Array.isArray(a.days) && a.days.length > 0 ? a.days : DEFAULT_AVAILABILITY.days,
    startHour: Number.isFinite(a.startHour) ? a.startHour : DEFAULT_AVAILABILITY.startHour,
    endHour: Number.isFinite(a.endHour) ? a.endHour : DEFAULT_AVAILABILITY.endHour,
    tz: a.tz ?? DEFAULT_AVAILABILITY.tz,
  };
}

// ── Meeting-intent detection ──
// Flags reply text that signals the prospect wants to talk. Monitoring/assist
// only — never triggers an automated send.

const INTENT_PHRASES = [
  "let's talk",
  'lets talk',
  "let's chat",
  'lets chat',
  'schedule a call',
  'schedule a meeting',
  'set up a call',
  'set up a meeting',
  'book a call',
  'book a meeting',
  'hop on a call',
  'jump on a call',
  'grab some time',
  'find some time',
  'happy to chat',
  'happy to talk',
  'send me a calendar',
  'send a calendar',
  'calendly',
  'when are you free',
  'when are you available',
];

export interface IntentResult {
  matched: boolean;
  phrases: string[];
}

export function detectMeetingIntent(text: string): IntentResult {
  if (!text) return { matched: false, phrases: [] };
  const haystack = text.toLowerCase();
  const phrases = INTENT_PHRASES.filter((p) => haystack.includes(p));
  return { matched: phrases.length > 0, phrases };
}

// ── Persistence ──

function rowToLink(r: Record<string, unknown>): MeetingLink {
  return {
    id: r.id as string,
    slug: r.slug as string,
    title: (r.title as string) ?? '',
    durationMin: Number(r.duration_min ?? 30),
    availability: (r.availability as Availability) ?? DEFAULT_AVAILABILITY,
    createdAt: r.created_at as string,
  };
}

export async function listMeetingLinks(): Promise<MeetingLink[]> {
  const db = getDb();
  const result = await db.execute(sql`
    SELECT id, slug, title, duration_min, availability, created_at
    FROM meeting_links
    ORDER BY created_at DESC
  `);
  return (result.rows ?? []).map(rowToLink);
}

export async function createMeetingLink(params: {
  slug: string;
  title?: string;
  durationMin?: number;
  availability?: Availability;
}): Promise<MeetingLink> {
  const db = getDb();
  const id = randomUUID();
  const availability = normalizeAvailability(params.availability);
  const result = await db.execute(sql`
    INSERT INTO meeting_links (id, slug, title, duration_min, availability)
    VALUES (
      ${id},
      ${params.slug},
      ${params.title ?? params.slug},
      ${params.durationMin ?? 30},
      ${JSON.stringify(availability)}::jsonb
    )
    ON CONFLICT (slug) DO UPDATE SET
      title = EXCLUDED.title,
      duration_min = EXCLUDED.duration_min,
      availability = EXCLUDED.availability
    RETURNING id, slug, title, duration_min, availability, created_at
  `);
  return rowToLink(result.rows[0] as Record<string, unknown>);
}

export interface Meeting {
  id: string;
  projectId: string | null;
  meetingLinkId: string | null;
  scheduledAt: string;
  status: string;
  attendeeEmail: string | null;
  createdAt: string;
}

function rowToMeeting(r: Record<string, unknown>): Meeting {
  return {
    id: r.id as string,
    projectId: (r.project_id as string) ?? null,
    meetingLinkId: (r.meeting_link_id as string) ?? null,
    scheduledAt: r.scheduled_at as string,
    status: r.status as string,
    attendeeEmail: (r.attendee_email as string) ?? null,
    createdAt: r.created_at as string,
  };
}

export async function bookMeeting(params: {
  projectId?: string;
  meetingLinkId?: string;
  scheduledAt: string;
  attendeeEmail?: string;
}): Promise<Meeting> {
  const db = getDb();
  const id = randomUUID();
  const result = await db.execute(sql`
    INSERT INTO meetings (id, project_id, meeting_link_id, scheduled_at, status, attendee_email)
    VALUES (
      ${id},
      ${params.projectId ?? null},
      ${params.meetingLinkId ?? null},
      ${params.scheduledAt}::timestamptz,
      'scheduled',
      ${params.attendeeEmail ?? null}
    )
    RETURNING id, project_id, meeting_link_id, scheduled_at, status, attendee_email, created_at
  `);
  return rowToMeeting(result.rows[0] as Record<string, unknown>);
}

export async function listMeetings(projectId?: string): Promise<Meeting[]> {
  const db = getDb();
  const cond = projectId ? sql`WHERE project_id = ${projectId}` : sql``;
  const result = await db.execute(sql`
    SELECT id, project_id, meeting_link_id, scheduled_at, status, attendee_email, created_at
    FROM meetings
    ${cond}
    ORDER BY scheduled_at DESC
    LIMIT 200
  `);
  return (result.rows ?? []).map(rowToMeeting);
}
