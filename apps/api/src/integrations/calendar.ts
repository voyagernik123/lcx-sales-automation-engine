import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';

// Credentials read directly from process.env (shared env module untouched).
const googleCalendarToken = process.env.GOOGLE_CALENDAR_TOKEN ?? '';
const outlookCalendarToken = process.env.OUTLOOK_CALENDAR_TOKEN ?? '';

export interface CalendarEventInput {
  meetingId: string;
  title: string;
  startAt: string; // ISO
  endAt: string; // ISO
  attendeeEmail?: string;
}

export interface CalendarEventResult {
  externalId: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
}

export interface CalendarProvider {
  readonly name: string;
  createEvent(input: CalendarEventInput): Promise<CalendarEventResult>;
}

// ── Mock provider ──

export class MockCalendarProvider implements CalendarProvider {
  readonly name = 'mock';

  async createEvent(input: CalendarEventInput): Promise<CalendarEventResult> {
    await delay(randomBetween(150, 500));
    return { externalId: `mock-cal-${input.meetingId}-${Date.now()}`, status: 'confirmed' };
  }
}

// ── Real provider stubs (fall back to mock until implemented) ──

export class GoogleCalendarProvider implements CalendarProvider {
  readonly name = 'google';
  private fallback = new MockCalendarProvider();

  async createEvent(input: CalendarEventInput): Promise<CalendarEventResult> {
    // Real impl: POST https://www.googleapis.com/calendar/v3/calendars/primary/events
    console.warn('[calendar] Google provider stub — recording mock event');
    return this.fallback.createEvent(input);
  }
}

export class OutlookCalendarProvider implements CalendarProvider {
  readonly name = 'outlook';
  private fallback = new MockCalendarProvider();

  async createEvent(input: CalendarEventInput): Promise<CalendarEventResult> {
    // Real impl: POST https://graph.microsoft.com/v1.0/me/events
    console.warn('[calendar] Outlook provider stub — recording mock event');
    return this.fallback.createEvent(input);
  }
}

// ── Factory ──

export function createCalendarProvider(): CalendarProvider {
  if (googleCalendarToken) return new GoogleCalendarProvider();
  if (outlookCalendarToken) return new OutlookCalendarProvider();
  return new MockCalendarProvider();
}

// ── Create event from a meeting (records only) ──

export interface CalendarEventRow {
  id: string;
  meetingId: string;
  externalId: string;
  startAt: string;
  endAt: string;
  status: string;
  createdAt: string;
}

function rowToEvent(r: Record<string, unknown>): CalendarEventRow {
  return {
    id: r.id as string,
    meetingId: r.meeting_id as string,
    externalId: r.external_id as string,
    startAt: r.start_at as string,
    endAt: r.end_at as string,
    status: r.status as string,
    createdAt: r.created_at as string,
  };
}

export async function createCalendarEvent(input: CalendarEventInput): Promise<CalendarEventRow> {
  const provider = createCalendarProvider();
  const res = await provider.createEvent(input);
  const db = getDb();
  const result = await db.execute(sql`
    INSERT INTO calendar_events (id, meeting_id, external_id, start_at, end_at, status)
    VALUES (
      ${randomUUID()},
      ${input.meetingId},
      ${res.externalId},
      ${input.startAt}::timestamptz,
      ${input.endAt}::timestamptz,
      ${res.status}
    )
    RETURNING id, meeting_id, external_id, start_at, end_at, status, created_at
  `);
  return rowToEvent(result.rows[0] as Record<string, unknown>);
}

export async function listCalendarEvents(meetingId?: string): Promise<CalendarEventRow[]> {
  const db = getDb();
  const cond = meetingId ? sql`WHERE meeting_id = ${meetingId}` : sql``;
  const result = await db.execute(sql`
    SELECT id, meeting_id, external_id, start_at, end_at, status, created_at
    FROM calendar_events
    ${cond}
    ORDER BY start_at DESC
    LIMIT 200
  `);
  return (result.rows ?? []).map(rowToEvent);
}

// ── Helpers ──

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
