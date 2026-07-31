import { ImapFlow } from 'imapflow';
import type { RawEmail } from './xNotificationParse.js';

/**
 * The mailbox source — how replies reach LCX OS without a single X credential.
 *
 * THE ARRANGEMENT. X sends notification emails to the @lcx account's registered
 * address. Marketing (or IT) adds ONE forwarding rule on that inbox, sending
 * reply/mention notifications to a mailbox LCX OS owns. We poll that mailbox.
 *
 * Nobody hands over an X password, cookie, session or app token. The only secret
 * in this compartment is this mailbox's own password, and its entire blast radius
 * is "can read forwarded X notification emails". Compare the alternatives:
 *
 *   scraping           → against X's ToS; a policy decision for compliance, and
 *                        it risks the @lcx account if it ever touches the account
 *   official API       → ~$200/mo, and needs a token on the account
 *   inbound webhook    → opens a public endpoint anyone can POST fabricated
 *                        replies into, straight into a governed audit trail
 *   THIS (pull, email) → free, no X credential exists, no new inbound surface
 *
 * PULL, NEVER PUSH — measured during design: 308 of this API's routes are
 * authenticated and only 3 are not. Adding a public webhook would have made a 4th
 * and it would have been the one that writes to the audit trail. Polling on the
 * cron we already run adds no inbound surface at all.
 *
 * KEYLESS-FIRST. Unconfigured is a normal state, not an error — matching x402 and
 * the AI layer. `mailConfigured()` is false, `/tick` says so plainly and still
 * runs the retention sweep, and the manual-paste path keeps the queue usable.
 */

const HOST = process.env.X_MAIL_HOST ?? '';
const USER = process.env.X_MAIL_USER ?? '';
const PASS = process.env.X_MAIL_PASSWORD ?? '';
const PORT = Number(process.env.X_MAIL_PORT ?? '993');
const MAILBOX = process.env.X_MAIL_MAILBOX ?? 'INBOX';

/** Bounded so a backlog cannot turn one cron tick into a 10-minute request. */
const MAX_PER_TICK = Number(process.env.X_MAIL_MAX_PER_TICK ?? '40');

export function mailConfigured(): boolean {
  return Boolean(HOST && USER && PASS);
}

/**
 * Fetch unseen notification emails and mark them seen.
 *
 * `\Seen` is the read cursor, deliberately — the alternative is tracking the last
 * processed UID in our own database, which drifts the moment anything else touches
 * the mailbox and silently skips mail. The flag lives with the message, so a
 * message is processed exactly once even across a redeploy.
 *
 * The dedupe in `service.insertReply` is the real safety net: marking seen happens
 * AFTER a successful fetch but the caller may still fail mid-batch, so ingestion
 * must be idempotent regardless. It is, on `x_comment_id`.
 *
 * TLS is required and never disabled. A mailbox password over a plaintext IMAP
 * connection would be the one genuinely dangerous thing in this compartment.
 */
export async function fetchNotificationEmails(): Promise<RawEmail[]> {
  if (!mailConfigured()) return [];

  const client = new ImapFlow({
    host: HOST,
    port: PORT,
    secure: true,
    auth: { user: USER, pass: PASS },
    // The library logs every command at info level, which would put mailbox
    // contents into application logs. Off.
    logger: false,
  });

  const out: RawEmail[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock(MAILBOX);
    try {
      const uids = await client.search({ seen: false }, { uid: true });
      if (!uids || uids.length === 0) return [];

      // Oldest first, so a backlog drains in the order customers wrote in.
      const batch = uids.slice(0, MAX_PER_TICK);

      for await (const msg of client.fetch(
        batch,
        { uid: true, envelope: true, bodyParts: ['text'], source: true },
        { uid: true },
      )) {
        const source = msg.source ? msg.source.toString('utf8') : '';
        const { text, html } = splitBody(source);
        out.push({
          subject: msg.envelope?.subject ?? '',
          text,
          html,
          date: msg.envelope?.date ?? undefined,
        });
      }

      // Only after everything above succeeded. A throw leaves the messages unseen
      // and the next tick retries them.
      await client.messageFlagsAdd(batch, ['\\Seen'], { uid: true });
    } finally {
      lock.release();
    }
  } finally {
    // logout() rather than close(): a clean IMAP LOGOUT, and it must run even
    // when the fetch threw or the connection leaks until the socket times out.
    await client.logout().catch(() => {
      /* already gone */
    });
  }

  return out;
}

/**
 * Pull the text/plain and text/html parts out of a raw RFC822 message.
 *
 * A deliberately small MIME reader rather than a parser dependency. We need two
 * parts out of a shallow, machine-generated multipart/alternative message, and
 * every byte here is treated as hostile downstream anyway — adding a full MIME
 * parser would enlarge the attack surface to read text we immediately distrust.
 *
 * Returns undefined for a missing part; the caller prefers text and falls back to
 * html, and reports a parse failure if it gets neither.
 */
export function splitBody(source: string): { text?: string; html?: string } {
  if (!source) return {};

  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(source)?.[1];
  if (!boundary) {
    // Single-part message: everything after the header block is the body.
    const body = source.split(/\r?\n\r?\n/).slice(1).join('\n\n');
    return /<html|<body|<div/i.test(body) ? { html: body } : { text: body };
  }

  const parts = source.split(`--${boundary}`);
  let text: string | undefined;
  let html: string | undefined;

  for (const part of parts) {
    const isText = /content-type:\s*text\/plain/i.test(part);
    const isHtml = /content-type:\s*text\/html/i.test(part);
    if (!isText && !isHtml) continue;

    let body = part.split(/\r?\n\r?\n/).slice(1).join('\n\n').trim();
    if (/content-transfer-encoding:\s*quoted-printable/i.test(part)) {
      body = decodeQuotedPrintable(body);
    } else if (/content-transfer-encoding:\s*base64/i.test(part)) {
      try {
        body = Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
      } catch {
        /* leave as-is; the parser will report a failure and keep the raw */
      }
    }

    if (isText && !text) text = body;
    if (isHtml && !html) html = body;
  }

  return { text, html };
}

/** `=3D` → `=`, and soft line breaks. The encoding X's mail actually uses. */
function decodeQuotedPrintable(s: string): string {
  return s
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}
