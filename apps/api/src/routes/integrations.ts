import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { env } from '../lib/env.js';
import {
  listMeetingLinks,
  createMeetingLink,
  bookMeeting,
  listMeetings,
  generateSlots,
  type Availability,
} from '../integrations/meetings.js';
import { runEmailSync, listEmailThreads } from '../integrations/emailSync.js';
import { scanTwitter, listSocialMentions } from '../integrations/twitter.js';
import { scanChat, type ChatPlatform } from '../integrations/chatMonitor.js';
import { createCalendarEvent, listCalendarEvents } from '../integrations/calendar.js';
import {
  storeSubscription,
  listPreferences,
  setPreference,
  webPushConfigured,
} from '../integrations/webpush.js';

export const integrationRoutes = new Hono<{ Variables: AuthVariables }>();

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });
const fail = (label: string, code: string) => (err: unknown) => {
  console.error(`[integrations] ${label} error:`, err);
  return { code, message: `${label} failed` };
};

// ── Meeting scheduling (2-9) ──

integrationRoutes.get('/meeting-links', requireOperator, async (c) => {
  try {
    const links = await listMeetingLinks();
    return c.json({ data: links, meta: meta() });
  } catch (err) {
    const e = fail('meeting-links list', 'MEETING_LINK_ERROR')(err);
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

integrationRoutes.post('/meeting-links', requireOperator, async (c) => {
  const body = (await c.req.json<{ slug?: string; title?: string; durationMin?: number; availability?: Availability }>().catch(() => ({} as never))) as { slug?: string; title?: string; durationMin?: number; availability?: Availability };
  if (!body.slug) return c.json({ error: 'slug is required', code: 'VALIDATION' }, 400);
  try {
    const link = await createMeetingLink({
      slug: body.slug,
      title: body.title,
      durationMin: body.durationMin,
      availability: body.availability,
    });
    const slots = generateSlots(link.availability, link.durationMin).slice(0, 40);
    return c.json({ data: { ...link, slots }, meta: meta() }, 201);
  } catch (err) {
    const e = fail('meeting-link create', 'MEETING_LINK_ERROR')(err);
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

integrationRoutes.post('/meetings', requireOperator, async (c) => {
  const body = (await c.req.json<{ projectId?: string; meetingLinkId?: string; scheduledAt?: string; attendeeEmail?: string }>().catch(() => ({} as never))) as { projectId?: string; meetingLinkId?: string; scheduledAt?: string; attendeeEmail?: string };
  if (!body.scheduledAt) return c.json({ error: 'scheduledAt is required', code: 'VALIDATION' }, 400);
  try {
    const meeting = await bookMeeting({
      projectId: body.projectId,
      meetingLinkId: body.meetingLinkId,
      scheduledAt: body.scheduledAt,
      attendeeEmail: body.attendeeEmail,
    });
    return c.json({ data: meeting, meta: meta() }, 201);
  } catch (err) {
    const e = fail('meeting book', 'MEETING_ERROR')(err);
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

integrationRoutes.get('/meetings', requireOperator, async (c) => {
  try {
    const meetings = await listMeetings(c.req.query('projectId') || undefined);
    return c.json({ data: meetings, meta: meta() });
  } catch (err) {
    const e = fail('meetings list', 'MEETING_ERROR')(err);
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ── Email sync (2-10) ──

integrationRoutes.post('/email-sync/run', requireOperator, async (c) => {
  const body = (await c.req.json<{ projectId?: string }>().catch(() => ({} as never))) as { projectId?: string };
  if (!body.projectId) return c.json({ error: 'projectId is required', code: 'VALIDATION' }, 400);
  try {
    const result = await runEmailSync(body.projectId);
    return c.json({ data: result, meta: meta() });
  } catch (err) {
    const e = fail('email-sync run', 'EMAIL_SYNC_ERROR')(err);
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

integrationRoutes.get('/email-threads/:projectId', requireOperator, async (c) => {
  try {
    const threads = await listEmailThreads(c.req.param('projectId'));
    return c.json({ data: threads, meta: meta() });
  } catch (err) {
    const e = fail('email-threads list', 'EMAIL_SYNC_ERROR')(err);
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ── Twitter / X social selling (4-7) — monitoring only ──

integrationRoutes.post('/twitter/scan', requireOperator, async (c) => {
  const body = (await c.req.json<{ projectId?: string; query?: string }>().catch(() => ({} as never))) as { projectId?: string; query?: string };
  if (!body.projectId) return c.json({ error: 'projectId is required', code: 'VALIDATION' }, 400);
  try {
    const result = await scanTwitter(body.projectId, body.query ?? body.projectId);
    return c.json({ data: result, meta: meta() });
  } catch (err) {
    const e = fail('twitter scan', 'TWITTER_ERROR')(err);
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

integrationRoutes.get('/social-mentions/:projectId', requireOperator, async (c) => {
  try {
    const mentions = await listSocialMentions(c.req.param('projectId'), c.req.query('platform') || undefined);
    return c.json({ data: mentions, meta: meta() });
  } catch (err) {
    const e = fail('social-mentions list', 'TWITTER_ERROR')(err);
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ── Telegram / Discord monitoring (4-9) — monitoring only, never auto-message ──

integrationRoutes.post('/chat/scan', requireOperator, async (c) => {
  const body = (await c.req.json<{ projectId?: string; platform?: ChatPlatform; channel?: string }>().catch(() => ({} as never))) as { projectId?: string; platform?: ChatPlatform; channel?: string };
  if (!body.projectId) return c.json({ error: 'projectId is required', code: 'VALIDATION' }, 400);
  const platform: ChatPlatform = body.platform === 'discord' ? 'discord' : 'telegram';
  try {
    const result = await scanChat({
      projectId: body.projectId,
      platform,
      channel: body.channel ?? body.projectId,
    });
    return c.json({ data: result, meta: meta() });
  } catch (err) {
    const e = fail('chat scan', 'CHAT_MONITOR_ERROR')(err);
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ── Calendar integration (4-10) ──

integrationRoutes.post('/calendar/events', requireOperator, async (c) => {
  const body = (await c.req.json<{ meetingId?: string; title?: string; startAt?: string; endAt?: string; attendeeEmail?: string }>().catch(() => ({} as never))) as { meetingId?: string; title?: string; startAt?: string; endAt?: string; attendeeEmail?: string };
  if (!body.meetingId || !body.startAt || !body.endAt) {
    return c.json({ error: 'meetingId, startAt and endAt are required', code: 'VALIDATION' }, 400);
  }
  try {
    const event = await createCalendarEvent({
      meetingId: body.meetingId,
      title: body.title ?? 'LCX Meeting',
      startAt: body.startAt,
      endAt: body.endAt,
      attendeeEmail: body.attendeeEmail,
    });
    return c.json({ data: event, meta: meta() }, 201);
  } catch (err) {
    const e = fail('calendar create', 'CALENDAR_ERROR')(err);
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

integrationRoutes.get('/calendar/events', requireOperator, async (c) => {
  try {
    const events = await listCalendarEvents(c.req.query('meetingId') || undefined);
    return c.json({ data: events, meta: meta() });
  } catch (err) {
    const e = fail('calendar list', 'CALENDAR_ERROR')(err);
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ── Web push (2-3) ──

integrationRoutes.post('/push/subscribe', requireOperator, async (c) => {
  const body = (await c.req.json<{ endpoint?: string; keys?: Record<string, string> }>().catch(() => ({} as never))) as { endpoint?: string; keys?: Record<string, string> };
  if (!body.endpoint) return c.json({ error: 'endpoint is required', code: 'VALIDATION' }, 400);
  try {
    const sub = await storeSubscription({ endpoint: body.endpoint, keys: body.keys ?? {} });
    return c.json({ data: { ...sub, configured: webPushConfigured }, meta: meta() }, 201);
  } catch (err) {
    const e = fail('push subscribe', 'PUSH_ERROR')(err);
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

integrationRoutes.get('/push/preferences', requireOperator, async (c) => {
  try {
    const prefs = await listPreferences();
    return c.json({ data: { preferences: prefs, configured: webPushConfigured }, meta: meta() });
  } catch (err) {
    const e = fail('push preferences list', 'PUSH_ERROR')(err);
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

integrationRoutes.patch('/push/preferences', requireOperator, async (c) => {
  const body = (await c.req.json<{ rule?: string; enabled?: boolean }>().catch(() => ({} as never))) as { rule?: string; enabled?: boolean };
  if (!body.rule || typeof body.enabled !== 'boolean') {
    return c.json({ error: 'rule and enabled are required', code: 'VALIDATION' }, 400);
  }
  try {
    const pref = await setPreference(body.rule, body.enabled);
    return c.json({ data: pref, meta: meta() });
  } catch (err) {
    const e = fail('push preferences update', 'PUSH_ERROR')(err);
    return c.json({ error: e.message, code: e.code }, 500);
  }
});
