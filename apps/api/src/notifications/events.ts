/**
 * In-process notification event bus + SSE stream tokens.
 *
 * notify() emits here after every insert so connected SSE clients get the
 * bell update in real time (single-process deployment — Render runs one
 * instance, so an in-memory bus is sufficient).
 *
 * EventSource cannot send an Authorization header, so /stream authenticates
 * with a short-lived HMAC token minted by an authorized POST — the operator
 * key itself never appears in a URL.
 */
import { EventEmitter } from 'node:events';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../lib/env.js';

export interface NotificationEvent {
  id: string;
  rule: string;
  title: string;
  detail: string | null;
  projectId: string | null;
  href: string | null;
  createdAt: string;
  /**
   * The compartment this alert belongs to (0067). Required, because the bus
   * broadcasts to every connected client — without it the stream cannot filter
   * per subscriber, and a distribution alert lands in a sales-only operator's
   * bell in real time even after the REST list was fixed.
   */
  workspace: string;
}

class NotificationBus extends EventEmitter {}

export const notificationBus = new NotificationBus();
// Many SSE clients may listen; silence the default 10-listener warning.
notificationBus.setMaxListeners(100);

export function emitNotification(event: NotificationEvent): void {
  notificationBus.emit('notification', event);
}

const TOKEN_TTL_MS = 10 * 60 * 1000;

function tokenSecret(): string {
  // Reuse the operator key as HMAC secret — tokens derived from it are
  // short-lived and never grant more than read-only stream access.
  return env.operatorApiKey || 'dev-secret';
}

/**
 * Mint a stream token BOUND TO A SUBJECT (0067).
 *
 * The first version signed only `stream:<expires>`, so the token carried no
 * identity at all. That made per-subscriber filtering impossible even in
 * principle: the stream could authenticate that *somebody* authorised had asked
 * for it, but never *who*, so it had no choice but to broadcast every
 * compartment to every listener. The subject is inside the signed payload, so it
 * cannot be swapped for another actor's without invalidating the HMAC.
 */
export function mintStreamToken(subject: string, now = Date.now()): string {
  const expires = now + TOKEN_TTL_MS;
  // Length-prefixed inside the signed payload so a subject cannot be shifted
  // across a delimiter to impersonate another.
  const payload = `stream:${expires}:${subject.length}:${subject}`;
  const sig = createHmac('sha256', tokenSecret()).update(payload).digest('hex');
  // base64url, NOT encodeURIComponent: '.' is an *unreserved* character so
  // encodeURIComponent leaves it intact, and the second-tier sign-in mints ids
  // like `ext:nikhil.sharma` (middleware/auth.ts). Those produced a four-segment
  // token that failed to verify, silently killing the live stream for every
  // second-tier colleague. base64url's alphabet contains no '.' at all.
  const subj = Buffer.from(subject, 'utf8').toString('base64url');
  return `${expires}.${subj}.${sig}`;
}

/**
 * Verify a stream token and return WHO it was minted for, or null.
 *
 * Returns the subject rather than a boolean because the caller needs the
 * identity to resolve entitlements — a boolean is what forced the old stream to
 * broadcast indiscriminately.
 */
export function verifyStreamToken(token: string, now = Date.now()): { subject: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [expiresRaw, subjectRaw, given] = parts;
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires < now) return null;

  // base64url round-trip. Decoding is lenient by nature, so the value is
  // re-encoded and compared: anything that is not the canonical encoding of what
  // it decoded to is rejected rather than accepted in a second spelling.
  if (!subjectRaw || !/^[A-Za-z0-9_-]+$/.test(subjectRaw)) return null;
  const subject = Buffer.from(subjectRaw, 'base64url').toString('utf8');
  if (!subject) return null;
  if (Buffer.from(subject, 'utf8').toString('base64url') !== subjectRaw) return null;

  const payload = `stream:${expires}:${subject.length}:${subject}`;
  const expected = createHmac('sha256', tokenSecret()).update(payload).digest('hex');
  if (!given || given.length !== expected.length) return null;
  const ok = timingSafeEqual(Buffer.from(given, 'utf8'), Buffer.from(expected, 'utf8'));
  return ok ? { subject } : null;
}
