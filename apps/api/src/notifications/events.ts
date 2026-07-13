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

export function mintStreamToken(now = Date.now()): string {
  const expires = now + TOKEN_TTL_MS;
  const sig = createHmac('sha256', tokenSecret()).update(`stream:${expires}`).digest('hex');
  return `${expires}.${sig}`;
}

export function verifyStreamToken(token: string, now = Date.now()): boolean {
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expires = Number(token.slice(0, dot));
  if (!Number.isFinite(expires) || expires < now) return false;
  const expected = createHmac('sha256', tokenSecret()).update(`stream:${expires}`).digest('hex');
  const given = token.slice(dot + 1);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given, 'utf8'), Buffer.from(expected, 'utf8'));
}
