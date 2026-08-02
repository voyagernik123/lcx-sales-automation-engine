import { ImapFlow } from 'imapflow';
import { isXSigningDomain, type SenderAuthEvidence } from './provenanceLadder.js';
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
 *   inbound webhook    → a public endpoint anyone can POST fabricated replies into
 *   THIS (pull, email) → free, no X credential exists, and no new *HTTP* surface
 *
 * ── CORRECTION (M0). THE MAILBOX IS AN INBOUND SURFACE. ─────────────────────────
 * This header used to claim that polling "adds no inbound surface at all" and that
 * nothing here "opens an inbound endpoint that the public internet can write
 * fabricated replies into". That was FALSE, and it was the most dangerous sentence
 * in the compartment because a future reader would trust it.
 *
 * A mailbox address accepts SMTP from anybody. It is a public write path with a
 * slower protocol. And this reader used to fetch `envelope` while reading only
 * `subject` and `date` from it — so a hand-written email containing one
 * `x.com/<handle>/status/<digits>` permalink and one line of prose produced a queue
 * row with an ATTACKER-CHOSEN handle, comment id, display name and body, graded C3
 * "fairly reliable", indistinguishable from a real reply (plan §1 defect 1;
 * mkt-r5 §1.1). The attacker also chose the id, which is the dedupe key, so the
 * same email could pre-claim a real complaint's id and get the genuine one silently
 * discarded (defect 6).
 *
 * WHAT REPLACES THE FALSE CLAIM. Not a `From:` check — that header is free text and
 * a forwarded message fails SPF by construction, because the forwarder is the sender
 * (RFC 7489; ARC exists for exactly this hop, RFC 8617). Acceptance rests on
 * cryptographic evidence that survived the hop:
 *
 *   · a DKIM pass whose `d=` is X-owned, as reported by OUR OWN mail provider; or
 *   · an ARC chain reporting an X DKIM pass, sealed by a sealer this deployment has
 *     NAMED as trusted.
 *
 * Everything else is quarantined at a distinct grade and never promoted — the
 * grading itself lives in `provenanceLadder.ts` (`verifySender`), so this file's job
 * is to produce the evidence honestly and to produce NOTHING where there is none.
 *
 * WHY THE EVIDENCE IS TAKEN FROM A HEADER RATHER THAN VERIFIED HERE. Verifying DKIM
 * or ARC in-process needs canonicalisation plus a DNS public-key lookup per message,
 * and — for a forwarded message — usually fails anyway because the forwarder rewrote
 * the body. The receiving MTA already did that work and recorded it in
 * `Authentication-Results` (RFC 8601). RFC 8601 §5 also states the rule that makes
 * this safe: a consumer must ignore any `Authentication-Results` field it did not
 * add itself. So we accept ONLY the topmost field whose authserv-id equals
 * `X_MAIL_TRUSTED_AUTHSERV`, because our provider prepends its field above anything
 * the sender wrote. With that variable unset there is no trust anchor and every
 * message is unauthenticated — deliberately. An unconfigured anchor must never
 * silently become a trusted one.
 *
 * PULL, NEVER PUSH is still true and still worth keeping — measured during design:
 * 308 of this API's routes are authenticated and only 3 are not. A webhook would
 * have made a 4th and it would have been the one that writes to the audit trail.
 * What is no longer claimed is that the mailbox is not a write path.
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

/**
 * The authserv-id of the mail provider LCX owns — the ONLY `Authentication-Results`
 * field we are allowed to believe (RFC 8601 §5). Empty by default: no anchor, no
 * authentication, everything quarantined.
 */
function trustedAuthserv(): string {
  return (process.env.X_MAIL_TRUSTED_AUTHSERV ?? '').trim().toLowerCase();
}

/**
 * ARC sealers this deployment trusts. Read here and handed to `verifySender` by the
 * ingest, so the trust list lives with the mailbox configuration rather than being
 * hard-coded in the grader.
 */
export function trustedArcSealers(): readonly string[] {
  return (process.env.X_MAIL_TRUSTED_ARC_SEALERS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function mailConfigured(): boolean {
  return Boolean(HOST && USER && PASS);
}

/**
 * Is the trust anchor configured? Reported separately from `mailConfigured()`
 * because the two failures are different and the desk must be able to tell them
 * apart: no mailbox means nothing arrives, no anchor means everything that arrives
 * is quarantined.
 */
export function senderAuthConfigured(): boolean {
  return Boolean(trustedAuthserv());
}

/* ── SENDER AUTHENTICATION EVIDENCE ─────────────────────────────────────────── */

/**
 * Unfold an RFC 5322 header block into `[name-lowercased, value]` pairs, IN ORDER.
 *
 * Order is the security property, not a convenience: RFC 8601 §5 says a consumer
 * trusts only the field its own ADMD added, and an MTA prepends. So "topmost with
 * our authserv-id" is the genuine one even when a hostile sender wrote their own
 * copy of the same field further down. Returning a Map keyed by name would throw
 * that away, which is why this returns a list.
 *
 * Stops at the first empty line — everything after it is body, and a body line that
 * looks like a header is exactly what a forger would write.
 */
export function headerPairs(source: string): ReadonlyArray<readonly [string, string]> {
  const out: Array<[string, string]> = [];
  if (!source) return out;

  const headerBlock = source.split(/\r?\n\r?\n/, 1)[0] ?? '';
  let current: [string, string] | null = null;

  for (const line of headerBlock.split(/\r?\n/)) {
    if (/^[ \t]/.test(line)) {
      // A folded continuation belongs to the field above it.
      if (current) current[1] += ` ${line.trim()}`;
      continue;
    }
    const m = /^([!-9;-~]+):[ \t]*(.*)$/.exec(line);
    if (!m) continue;
    if (current) out.push(current);
    current = [m[1]!.toLowerCase(), m[2] ?? ''];
  }
  if (current) out.push(current);
  return out;
}

function valuesOf(pairs: ReadonlyArray<readonly [string, string]>, name: string): string[] {
  return pairs.filter(([n]) => n === name).map(([, v]) => v);
}

/** The authserv-id is everything before the first `;`, minus any version token. */
function authservIdOf(value: string): string {
  const head = (value.split(';', 1)[0] ?? '').trim();
  return (head.split(/\s+/, 1)[0] ?? '').toLowerCase().replace(/\.$/, '');
}

/**
 * Every `<method>=<result>` in an Authentication-Results value, paired with the
 * `header.d=` that follows it.
 *
 * ONE FIELD CAN CARRY SEVERAL DKIM RESULTS — a forwarded X notification typically
 * carries the forwarder's own signature alongside X's, and one of them will be the
 * failure. Reading "does the string contain dkim=pass" would therefore accept a
 * message whose ONLY passing signature belongs to the forwarder, or to the attacker.
 * So results are read as pairs and a pass only counts when its own `d=` is X's.
 */
export function authResults(value: string): ReadonlyArray<{ method: string; result: string; domain: string | null }> {
  const out: Array<{ method: string; result: string; domain: string | null }> = [];
  const re = /\b(dkim|arc|spf|dmarc)\s*=\s*([a-z]+)((?:(?!\b(?:dkim|arc|spf|dmarc)\s*=)[\s\S])*)/gi;
  for (const m of value.matchAll(re)) {
    const tail = m[3] ?? '';
    const d = /\bheader\.(?:d|i)\s*=\s*@?([A-Za-z0-9.-]+)/i.exec(tail)?.[1] ?? null;
    out.push({
      method: (m[1] ?? '').toLowerCase(),
      result: (m[2] ?? '').toLowerCase(),
      domain: d ? d.toLowerCase().replace(/\.$/, '') : null,
    });
  }
  return out;
}

/** What the mailbox told us about who really sent this message. */
export interface MailSenderReading {
  evidence: SenderAuthEvidence;
  /** The `From:` header verbatim. EVIDENCE ONLY — free text, never authority. */
  from: string | null;
  /**
   * Fields claiming our own authserv-id that were NOT the topmost one. Above zero is
   * a forgery attempt: a legitimate hop has no reason to impersonate our provider's
   * identifier, so this is recorded per row rather than ignored.
   */
  impersonatedAuthservFields: number;
  /** True when `X_MAIL_TRUSTED_AUTHSERV` is unset — no anchor exists to check against. */
  noTrustAnchor: boolean;
}

/**
 * Read sender-authentication evidence out of one raw RFC822 message.
 *
 * PURE, and it produces NOTHING it cannot support. With no trust anchor, or with no
 * field from that anchor, `dkimPass` and `arcPass` are both false and the raw field
 * is still kept for the audit trail — the absence of evidence is recorded as the
 * absence of evidence, never as a pass and never as a zero.
 */
export function readSenderEvidence(source: string, anchor = trustedAuthserv()): MailSenderReading {
  const pairs = headerPairs(source);
  const from = valuesOf(pairs, 'from')[0]?.trim() || null;

  const allAr = valuesOf(pairs, 'authentication-results');
  const mine = anchor ? allAr.filter((v) => authservIdOf(v) === anchor) : [];
  const ours = mine[0] ?? null;

  const evidence: SenderAuthEvidence = {
    dkimPass: false,
    dkimDomain: null,
    arcPass: false,
    arcSealerDomain: null,
    rawAuthenticationResults: ours,
  };

  const reading: MailSenderReading = {
    evidence,
    from,
    impersonatedAuthservFields: Math.max(0, mine.length - 1),
    noTrustAnchor: !anchor,
  };
  if (!ours) return reading;

  const results = authResults(ours);

  // A DKIM pass counts only when the passing signature's OWN d= is X's.
  const xDkim = results.find((r) => r.method === 'dkim' && r.result === 'pass' && isXSigningDomain(r.domain));
  if (xDkim) {
    evidence.dkimPass = true;
    evidence.dkimDomain = xDkim.domain;
    return reading;
  }

  /*
   * ARC. Our provider's `arc=pass` says the chain is intact and unbroken; it does NOT
   * say what the originating hop saw. That is in `ARC-Authentication-Results`, and the
   * ORIGINATING hop is instance 1 — the one that saw the message before any
   * forwarding could alter it. Later instances only restate what a forwarder observed
   * after the damage, so reading the highest instance would read the wrong hop.
   */
  const arc = results.find((r) => r.method === 'arc');
  if (!arc || arc.result !== 'pass') {
    // Record the failure verbatim; nothing is inferred from it.
    evidence.dkimDomain = results.find((r) => r.method === 'dkim')?.domain ?? null;
    return reading;
  }

  const aar = valuesOf(pairs, 'arc-authentication-results')
    .map((v) => ({ i: Number(/\bi\s*=\s*(\d+)/i.exec(v)?.[1] ?? '0'), value: v }))
    .filter((x) => x.i > 0)
    .sort((a, b) => a.i - b.i);
  const originating = aar[0]?.value ?? null;
  const originatingX = originating
    ? authResults(originating).find(
        (r) => r.method === 'dkim' && r.result === 'pass' && isXSigningDomain(r.domain),
      )
    : undefined;

  if (originatingX) {
    evidence.arcPass = true;
    evidence.dkimDomain = originatingX.domain;
    // The sealer we care about is the LAST one — the hop that handed the message to
    // us, i.e. the provider LCX owns and is therefore able to name as trusted.
    const seals = valuesOf(pairs, 'arc-seal')
      .map((v) => ({
        i: Number(/\bi\s*=\s*(\d+)/i.exec(v)?.[1] ?? '0'),
        d: /\bd\s*=\s*([A-Za-z0-9.-]+)/i.exec(v)?.[1]?.toLowerCase().replace(/\.$/, '') ?? null,
      }))
      .filter((s) => s.i > 0)
      .sort((a, b) => b.i - a.i);
    evidence.arcSealerDomain = seals[0]?.d ?? null;
  }

  return reading;
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
      /*
       * NOISE REDUCTION, NOT A SECURITY CONTROL — and the distinction is the whole
       * of defect 1. `X_MAIL_EXPECT_FROM` narrows the search so that a mailbox which
       * also receives ordinary mail does not feed every unrelated message to the
       * parser. It is a `From:` match, so it is spoofable and it is worth exactly
       * nothing against a forger; the acceptance decision is `readSenderEvidence`
       * plus `verifySender`, downstream, on cryptographic evidence. Unset means "no
       * narrowing", which is safe precisely because the narrowing was never the
       * thing keeping forged mail out.
       */
      const expectFrom = (process.env.X_MAIL_EXPECT_FROM ?? '').trim();
      const uids = await client.search(
        expectFrom ? { seen: false, from: expectFrom } : { seen: false },
        { uid: true },
      );
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
        const reading = readSenderEvidence(source);
        out.push({
          subject: msg.envelope?.subject ?? '',
          text,
          html,
          date: msg.envelope?.date ?? undefined,
          // `envelope` was already being fetched; only `subject` and `date` were ever
          // read out of it. The sender was available the whole time (defect 1).
          from:
            reading.from
            ?? (msg.envelope?.from?.[0]?.address
              ? String(msg.envelope.from[0].address)
              : null),
          sender: reading.evidence,
          impersonatedAuthservFields: reading.impersonatedAuthservFields,
          noTrustAnchor: reading.noTrustAnchor,
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
