/**
 * Turning an X notification email into a reply we can triage (LCX MARKETING).
 *
 * WHY THIS FILE IS THE RISKIEST IN THE COMPARTMENT. Everything else here is our
 * own schema and our own rules. This parses somebody else's HTML email, whose
 * format we do not control and which will change without notice. It is the one
 * component guaranteed to break eventually.
 *
 * So it is built to FAIL LOUDLY AND LOSSLESSLY rather than accurately:
 *
 *   - A parse failure never drops the email. It returns `ok: false` with the raw
 *     body, the caller stores it with `parse_failed = true`, and a human sees it
 *     in the queue. A missed customer comment is the harm we are preventing;
 *     silently discarding one because a regex moved is strictly worse than
 *     showing an operator something ugly.
 *   - Every field except the body is optional. A reply we can show but cannot
 *     attribute is still worth showing.
 *   - It does not try to be clever about threading. If the parent post id is not
 *     plainly there, it stays null and the reply is unparented.
 *
 * NO HTML PARSER DEPENDENCY. Notification emails are shallow, generated markup —
 * a tag-stripping pass plus entity decoding gets the text out. Pulling in a DOM
 * for this would add an attack surface (HTML parsers have had their own CVEs) to
 * read text we immediately treat as hostile anyway.
 *
 * SECURITY NOTE. Everything this returns is UNTRUSTED. It is stored, and later
 * shown through `AiProse` (React nodes, never HTML) and fed to the model as
 * delimited data. Nothing here sanitises — that is `sanitise.ts`, deliberately a
 * separate concern so neither can be skipped by "the other one handles it".
 */

export interface ParsedReply {
  ok: true;
  xCommentId: string;
  xPostId: string | null;
  authorHandle: string;
  authorDisplay: string | null;
  body: string;
  postedAt: Date | null;
}

export interface ParseFailure {
  ok: false;
  reason: string;
  raw: string;
}

export type ParseResult = ParsedReply | ParseFailure;

/** Minimal entity decode — the handful that appear in generated mail. */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)));
}

/** Strip tags to readable text, preserving line structure from block elements. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|td|h[1-6]|li)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
}

/**
 * A status id out of any x.com / twitter.com permalink.
 * `https://x.com/someone/status/1234567890` → `1234567890`
 */
const STATUS_URL = /https?:\/\/(?:www\.)?(?:x|twitter|mobile\.twitter)\.com\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{6,25})/gi;

/** `@handle`, bounded to X's own handle rules (1–15 word chars). */
const HANDLE = /@([A-Za-z0-9_]{1,15})\b/;

export interface RawEmail {
  subject: string;
  /** text/plain part when present — always preferred over HTML. */
  text?: string;
  /** text/html part, used only as a fallback. */
  html?: string;
  /** Header date, the last resort for `postedAt`. */
  date?: Date;
}

/**
 * Parse one notification email.
 *
 * Strategy, in order of trust:
 *   1. Collect every status permalink. X's reply notifications link the REPLY
 *      itself, and usually the parent post too. The first is taken as the reply
 *      (its handle is the author) and a second, different one as the parent.
 *   2. Author handle from that permalink — it is the most reliable signal in the
 *      email, far better than the subject line, which gets localised and
 *      restyled.
 *   3. Body from the text part if present, else from stripped HTML, with the
 *      email's own chrome removed.
 */
export function parseXNotification(email: RawEmail): ParseResult {
  const raw = email.text?.trim() || email.html?.trim() || '';
  if (!raw) {
    return { ok: false, reason: 'email had no text or html body', raw: email.subject ?? '' };
  }

  const source = `${email.subject ?? ''}\n${raw}`;
  const links = [...source.matchAll(STATUS_URL)].map((m) => ({
    handle: m[1] as string,
    id: m[2] as string,
  }));

  if (links.length === 0) {
    // No permalink at all: either not a reply notification (a follow, a like, a
    // product announcement) or the format changed. Either way a human decides.
    return {
      ok: false,
      reason: 'no x.com/*/status/* permalink found — not a reply notification, or the format changed',
      raw,
    };
  }

  const reply = links[0]!;
  const parent = links.find((l) => l.id !== reply.id) ?? null;

  const text = email.text?.trim() ? email.text.trim() : htmlToText(raw);
  const body = extractBody(text, reply.handle);

  if (!body) {
    return { ok: false, reason: 'permalink found but no reply text could be isolated', raw };
  }

  const displayFromSubject = subjectDisplayName(email.subject ?? '');

  return {
    ok: true,
    xCommentId: reply.id,
    xPostId: parent?.id ?? null,
    // The permalink handle beats the subject line: subjects are localised and
    // reworded, permalinks are structural.
    authorHandle: reply.handle,
    authorDisplay: displayFromSubject,
    body,
    postedAt: email.date ?? null,
  };
}

/**
 * Isolate what the person actually wrote from the email's furniture.
 *
 * Notification emails wrap the reply in unsubscribe blurb, app promos and legal
 * footers. Rather than pattern-match X's current layout — which is exactly the
 * thing that will change — we drop lines that are recognisably chrome and keep
 * the longest remaining run of prose. Cruder, and far more durable.
 */
function extractBody(text: string, authorHandle: string): string {
  const CHROME = [
    /unsubscribe/i, /notification settings/i, /^view (?:on|in) x\b/i, /^open in app/i,
    /^download the app/i, /^©/, /all rights reserved/i, /privacy policy/i,
    /terms of service/i, /^x corp/i, /^\d{3,} [A-Z]/, /help center/i,
    /^https?:\/\//i, /^@?[A-Za-z0-9_]{1,15}$/, /^reply$/i, /^like$/i, /^repost$/i,
    /you (?:are )?receiv/i, /^sent by/i,
  ];

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !CHROME.some((re) => re.test(l)))
    // Drop the bare "Someone (@handle) replied to your post" header line.
    .filter((l) => !(new RegExp(`@${authorHandle}\\b`, 'i').test(l) && /repl(?:y|ied)/i.test(l)));

  if (lines.length === 0) return '';

  // The longest contiguous block of kept lines is the message; short scattered
  // leftovers are almost always residual furniture.
  let best: string[] = [];
  let run: string[] = [];
  for (const line of lines) {
    if (line.length < 3) {
      if (run.join(' ').length > best.join(' ').length) best = run;
      run = [];
    } else {
      run.push(line);
    }
  }
  if (run.join(' ').length > best.join(' ').length) best = run;

  return best.join('\n').trim().slice(0, 4000);
}

/** `Someone Nice (@handle) replied to your post` → `Someone Nice`. */
function subjectDisplayName(subject: string): string | null {
  const m = /^(.+?)\s*\(@[A-Za-z0-9_]{1,15}\)/.exec(subject.trim());
  if (m?.[1]) return m[1].trim().slice(0, 120) || null;
  const h = HANDLE.exec(subject);
  return h ? null : null;
}
