/**
 * MARKETING — oEmbed: the INDEPENDENT channel.
 *
 * `publish.twitter.com/oembed` is X's own oEmbed endpoint: OFFICIAL, DOCUMENTED and
 * KEYLESS. No token, no account, no LCX credential — so it satisfies both owner
 * constraints by construction (mkt-r3 §1.5a, verified 200/579 B on 2026-08-02).
 *
 * WHY IT IS CORROBORATION AND NOT DECORATION. The queue's inbound path is a mailbox
 * anyone can send SMTP to (mkt-r5 §1.1). An attacker who forges a notification email
 * controls the handle, the comment id and the whole body. What they do NOT control is
 * X's oEmbed endpoint. So "an email says @alice replied X" and "an email says @alice
 * replied X, and X's own endpoint returns @alice saying X" are different facts, and
 * `provenanceLadder.ts` grades them differently. This module's only job is to fetch
 * that second fact honestly, or to say clearly that it could not.
 *
 * WHAT IT RETURNS: author name, author url, the post's own text, `lang`, and the post
 * date as X renders it. Note the date carefully — it is a CALENDAR DATE with no
 * time-of-day and no timezone ("August 1, 2026"). It is therefore surfaced as
 * `postedOnDisplayed`, never as an instant, because rounding a date to midnight UTC and
 * calling it a timestamp is the same class of lie as calling the email header date
 * "posted_at" (mkt-r3 §1.1). The exact ISO instant exists ONLY on the undocumented
 * syndication endpoint at the bottom of this file, which is off by default.
 *
 * THREE OUTCOMES, NEVER TWO. Every call resolves to `confirmed`, `not_public` or
 * `unknown`. A post oEmbed cannot reach is NOT thereby proven fake: a deleted post, a
 * protected account, a rate limit and a DNS failure are four different things and only
 * the first two are facts about the post. `unknown` must reach the operator as unknown
 * (mkt-r3 §2.1 — a 2xx with an empty body read as "nothing happened" is the failure mode
 * that manufactures confident fiction).
 *
 * NO POSTING PATH. This module only ever issues GET requests to two read-only hosts.
 * It holds no credential, so there is nothing here that could act as the LCX account.
 */

/** A post identity we are willing to look up. Both halves are validated. */
export interface PostRef {
  /** X handle without the `@`. */
  handle: string;
  /** Numeric status id as X issues them. */
  postId: string;
}

export type OEmbedStatus = 'confirmed' | 'not_public' | 'unknown';

export type OEmbedCode =
  /** X returned an embeddable post and we parsed it. */
  | 'CONFIRMED'
  /** X returned 404 — no publicly embeddable post at that URL (deleted, or never existed). */
  | 'POST_NOT_FOUND'
  /** X returned 401/403 — protected or suspended account. The post may well exist. */
  | 'POST_NOT_VISIBLE'
  /** 429 or 5xx from X. Says nothing about the post. */
  | 'CHANNEL_RATE_LIMITED'
  | 'CHANNEL_UPSTREAM_ERROR'
  /** Transport failure or our own abort. Says nothing about the post. */
  | 'CHANNEL_TIMEOUT'
  | 'CHANNEL_TRANSPORT_FAILED'
  /** Breaker open: we are deliberately not hammering a channel that just failed. */
  | 'CHANNEL_COOLING'
  /** 2xx whose body we could not believe — empty, non-JSON, no `html`, no `<p>`. */
  | 'MALFORMED_RESPONSE'
  /** The URL resolved to a profile embed, not a post — no text exists to confirm. */
  | 'NOT_A_POST'
  /** X answered about a different status id than the one we asked for. */
  | 'ID_MISMATCH'
  /** We refused to make the call: the ref itself is not a valid X post identity. */
  | 'INVALID_REF';

/** Human sentence per code — shown to the operator verbatim, never a bare code. */
export const OEMBED_CODE_MESSAGE: Record<OEmbedCode, string> = {
  CONFIRMED: 'X returned this post and its text.',
  POST_NOT_FOUND: 'X has no publicly embeddable post at this URL — it was deleted, or never existed. This is not proof the reply was fabricated.',
  POST_NOT_VISIBLE: 'X declined to embed this post (protected or suspended account). The post may exist; we cannot see it.',
  CHANNEL_RATE_LIMITED: 'X rate-limited the corroboration channel. Nothing was learned about this post.',
  CHANNEL_UPSTREAM_ERROR: 'X returned a server error. Nothing was learned about this post.',
  CHANNEL_TIMEOUT: 'The corroboration channel timed out. Nothing was learned about this post.',
  CHANNEL_TRANSPORT_FAILED: 'The corroboration channel could not be reached. Nothing was learned about this post.',
  CHANNEL_COOLING: 'The corroboration channel failed repeatedly and is cooling down; this post was not looked up.',
  MALFORMED_RESPONSE: 'X answered, but the response could not be read as a post. Treated as unknown, never as absent.',
  NOT_A_POST: 'That URL is a profile, not a post. oEmbed carries no profile data — no followers, no bio, no counts.',
  ID_MISMATCH: 'X answered about a different post id than the one requested. Discarded.',
  INVALID_REF: 'Not a valid X post identity, so no request was made.',
};

/** What a successful oEmbed read actually proves. */
export interface OEmbedPost {
  /** The status id we asked about, echoed back from X's canonical URL. */
  postId: string;
  /** Handle from `author_url` — X's own answer to "whose post is this". */
  authorHandle: string;
  /** Display name from `author_name`. Repairs the low-reliability subject-line guess. */
  authorName: string | null;
  /** The post's own text, tags stripped and entities decoded. */
  text: string;
  /** `lang` from the embedded `<p>` — language detection, from X, for free. */
  lang: string | null;
  /**
   * The date X renders in the embed, ISO calendar date only (`YYYY-MM-DD`).
   * NO time-of-day and NO timezone: X prints "August 1, 2026" and nothing finer.
   * Never widen this into an instant.
   */
  postedOnDisplayed: string | null;
  /** Exactly as X printed it, kept so the audit trail can show the source string. */
  postedOnRaw: string | null;
  canonicalUrl: string;
}

export interface OEmbedResult {
  status: OEmbedStatus;
  code: OEmbedCode;
  /** The human sentence for `code`. */
  message: string;
  /** Present only when `status === 'confirmed'`. */
  post: OEmbedPost | null;
  /** When we looked. Every claim this module makes is as-of this instant. */
  fetchedAt: string;
  /** HTTP status observed, when we got one. */
  httpStatus: number | null;
  requestedUrl: string;
}

export interface OEmbedOptions {
  timeoutMs?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Test seam only — the instant stamped on the result. */
  now?: () => Date;
}

const DEFAULT_TIMEOUT_MS = 6_000;
const USER_AGENT = 'LCXOS-Marketing/1.0 (+https://lcx.com; oembed corroboration)';

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const POST_ID_RE = /^[0-9]{6,25}$/;

/** Canonical post URL. Only ever built from a validated ref. */
export function postUrl(ref: PostRef): string {
  return `https://x.com/${ref.handle}/status/${ref.postId}`;
}

/**
 * Parse a permalink into a ref. Returns null rather than a partial ref — a half-known
 * identity is not a lookup we are willing to make.
 */
export function parsePostRef(url: string): PostRef | null {
  const m = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/([0-9]{6,25})(?:[/?#]|$)/.exec(
    (url || '').trim(),
  );
  if (!m) return null;
  return { handle: m[1], postId: m[2] };
}

function validRef(ref: PostRef | null | undefined): ref is PostRef {
  return !!ref && HANDLE_RE.test(ref.handle ?? '') && POST_ID_RE.test(ref.postId ?? '');
}

/** The handful of entities that appear in X's generated embed markup. */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&mdash;/gi, '—')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/gi, '&');
}

function stripTags(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '');
}

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

/**
 * X prints the embed date as "August 1, 2026". Converted to a calendar date and
 * nothing more — see the note on `postedOnDisplayed`.
 */
export function parseEmbedDate(raw: string): string | null {
  const m = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const mm = MONTHS[m[1].toLowerCase()];
  if (!mm) return null;
  const dd = m[2].padStart(2, '0');
  if (Number(dd) < 1 || Number(dd) > 31) return null;
  return `${m[3]}-${mm}-${dd}`;
}

interface OEmbedBody {
  url?: unknown;
  author_name?: unknown;
  author_url?: unknown;
  html?: unknown;
}

/** Pull a handle out of `author_url`. */
function handleFromAuthorUrl(u: unknown): string | null {
  if (typeof u !== 'string') return null;
  const m = /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?$/.exec(u.trim());
  return m ? m[1] : null;
}

/**
 * Turn a 200 body into a post, or into the reason it is not one. Deliberately strict:
 * anything we cannot read becomes `MALFORMED_RESPONSE` (unknown), never a confirmation
 * and never an absence.
 */
export function readOEmbedBody(
  body: unknown,
  expected: PostRef,
): { post: OEmbedPost } | { code: 'MALFORMED_RESPONSE' | 'NOT_A_POST' | 'ID_MISMATCH' } {
  if (!body || typeof body !== 'object') return { code: 'MALFORMED_RESPONSE' };
  const b = body as OEmbedBody;
  const html = typeof b.html === 'string' ? b.html : '';
  if (!html.trim()) return { code: 'MALFORMED_RESPONSE' };

  // A profile URL 200s with a `twitter-timeline` anchor and no text at all
  // (mkt-r3 §1.5a: `title: ""`, no followers, no bio). That is not a post.
  if (/twitter-timeline/i.test(html)) return { code: 'NOT_A_POST' };

  const p = /<p\b([^>]*)>([\s\S]*?)<\/p>/i.exec(html);
  if (!p) return { code: 'NOT_A_POST' };
  const text = decodeEntities(stripTags(p[2])).replace(/[ \t]+\n/g, '\n').trim();
  if (!text) return { code: 'MALFORMED_RESPONSE' };
  const langMatch = /\blang="([A-Za-z-]{2,10})"/.exec(p[1]);

  // The status id X answered about. Prefer the canonical `url`, fall back to the
  // permalink anchor inside the markup.
  const idFrom =
    (typeof b.url === 'string' ? /\/status\/(\d{6,25})/.exec(b.url)?.[1] : null) ??
    /\/status\/(\d{6,25})/.exec(html)?.[1] ??
    null;
  if (!idFrom) return { code: 'MALFORMED_RESPONSE' };
  if (idFrom !== expected.postId) return { code: 'ID_MISMATCH' };

  const authorHandle =
    handleFromAuthorUrl(b.author_url) ??
    /\(@([A-Za-z0-9_]{1,15})\)/.exec(decodeEntities(html))?.[1] ??
    null;
  if (!authorHandle) return { code: 'MALFORMED_RESPONSE' };

  const dateRaw = (() => {
    const anchors = [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)];
    for (const a of anchors) {
      const t = decodeEntities(stripTags(a[1])).trim();
      if (parseEmbedDate(t)) return t;
    }
    return null;
  })();

  return {
    post: {
      postId: expected.postId,
      authorHandle,
      authorName: typeof b.author_name === 'string' && b.author_name.trim() ? b.author_name.trim() : null,
      text,
      lang: langMatch ? langMatch[1] : null,
      postedOnDisplayed: dateRaw ? parseEmbedDate(dateRaw) : null,
      postedOnRaw: dateRaw,
      canonicalUrl: postUrl({ handle: authorHandle, postId: expected.postId }),
    },
  };
}

/**
 * CHANNEL HEALTH — so an outage can never quietly downgrade a whole queue.
 *
 * Consecutive channel-level failures (timeout, transport, 429, 5xx) open a breaker.
 * While it is open, calls short-circuit to `CHANNEL_COOLING` instead of retrying into a
 * rate limit — one attempt per call, no retries, no storms. `provenanceLadder.ts` reads
 * this and is required to state on the batch that corroboration was unavailable; that
 * statement is what stops "we could not check" from rendering as "checked, fine".
 */
export interface OEmbedHealth {
  consecutiveChannelFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureCode: OEmbedCode | null;
  /** True while the breaker is open. */
  cooling: boolean;
  coolingUntil: string | null;
}

const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 60_000;

const health = {
  consecutiveChannelFailures: 0,
  lastSuccessAt: null as string | null,
  lastFailureAt: null as string | null,
  lastFailureCode: null as OEmbedCode | null,
  coolingUntilMs: 0,
};

/** Test seam and operational reset. */
export function resetOEmbedHealth(): void {
  health.consecutiveChannelFailures = 0;
  health.lastSuccessAt = null;
  health.lastFailureAt = null;
  health.lastFailureCode = null;
  health.coolingUntilMs = 0;
}

export function oembedHealth(nowMs = Date.now()): OEmbedHealth {
  const cooling = health.coolingUntilMs > nowMs;
  return {
    consecutiveChannelFailures: health.consecutiveChannelFailures,
    lastSuccessAt: health.lastSuccessAt,
    lastFailureAt: health.lastFailureAt,
    lastFailureCode: health.lastFailureCode,
    cooling,
    coolingUntil: cooling ? new Date(health.coolingUntilMs).toISOString() : null,
  };
}

/** Codes that are facts about the CHANNEL, not about the post. */
const CHANNEL_FAILURE_CODES: ReadonlySet<OEmbedCode> = new Set<OEmbedCode>([
  'CHANNEL_RATE_LIMITED',
  'CHANNEL_UPSTREAM_ERROR',
  'CHANNEL_TIMEOUT',
  'CHANNEL_TRANSPORT_FAILED',
]);

function noteOutcome(code: OEmbedCode, at: string, nowMs: number): void {
  if (code === 'CONFIRMED') {
    health.consecutiveChannelFailures = 0;
    health.lastSuccessAt = at;
    health.coolingUntilMs = 0;
    return;
  }
  if (!CHANNEL_FAILURE_CODES.has(code)) return; // a fact about the post; the channel is fine
  health.consecutiveChannelFailures += 1;
  health.lastFailureAt = at;
  health.lastFailureCode = code;
  if (health.consecutiveChannelFailures >= BREAKER_THRESHOLD) {
    health.coolingUntilMs = nowMs + BREAKER_COOLDOWN_MS;
  }
}

const STATUS_FOR: Record<OEmbedCode, OEmbedStatus> = {
  CONFIRMED: 'confirmed',
  POST_NOT_FOUND: 'not_public',
  POST_NOT_VISIBLE: 'not_public',
  CHANNEL_RATE_LIMITED: 'unknown',
  CHANNEL_UPSTREAM_ERROR: 'unknown',
  CHANNEL_TIMEOUT: 'unknown',
  CHANNEL_TRANSPORT_FAILED: 'unknown',
  CHANNEL_COOLING: 'unknown',
  MALFORMED_RESPONSE: 'unknown',
  NOT_A_POST: 'unknown',
  ID_MISMATCH: 'unknown',
  INVALID_REF: 'unknown',
};

function result(
  code: OEmbedCode,
  requestedUrl: string,
  fetchedAt: string,
  httpStatus: number | null,
  post: OEmbedPost | null,
): OEmbedResult {
  return {
    status: STATUS_FOR[code],
    code,
    message: OEMBED_CODE_MESSAGE[code],
    post,
    fetchedAt,
    httpStatus,
    requestedUrl,
  };
}

/**
 * Look up ONE post. Never throws, never retries, always resolves to a three-state
 * outcome with a citable code.
 */
export async function fetchOEmbed(ref: PostRef, opts: OEmbedOptions = {}): Promise<OEmbedResult> {
  const now = opts.now ?? (() => new Date());
  const at = now().toISOString();
  const nowMs = Date.parse(at);

  if (!validRef(ref)) return result('INVALID_REF', '', at, null, null);

  const target = postUrl(ref);
  const endpoint = `https://publish.twitter.com/oembed?url=${encodeURIComponent(target)}&omit_script=1&dnt=true`;

  if (oembedHealth(nowMs).cooling) return result('CHANNEL_COOLING', target, at, null, null);

  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let code: OEmbedCode;
  let httpStatus: number | null = null;
  let post: OEmbedPost | null = null;
  try {
    const res = await doFetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
      redirect: 'follow',
    });
    httpStatus = res.status;
    if (res.status === 404 || res.status === 400) {
      code = 'POST_NOT_FOUND';
    } else if (res.status === 401 || res.status === 403) {
      code = 'POST_NOT_VISIBLE';
    } else if (res.status === 429) {
      code = 'CHANNEL_RATE_LIMITED';
    } else if (!res.ok) {
      code = 'CHANNEL_UPSTREAM_ERROR';
    } else {
      // A 2xx is not yet an answer: the syndication family returns 200 with zero bytes
      // (mkt-r3 §2.1) and that must read as unknown, not as "no post".
      const raw = await res.text();
      if (!raw.trim()) {
        code = 'MALFORMED_RESPONSE';
      } else {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = null;
        }
        const read = parsed === null ? { code: 'MALFORMED_RESPONSE' as const } : readOEmbedBody(parsed, ref);
        if ('post' in read) {
          code = 'CONFIRMED';
          post = read.post;
        } else {
          code = read.code;
        }
      }
    }
  } catch (err) {
    code = (err as { name?: string })?.name === 'AbortError' ? 'CHANNEL_TIMEOUT' : 'CHANNEL_TRANSPORT_FAILED';
  } finally {
    clearTimeout(timer);
  }

  noteOutcome(code, at, nowMs);
  return result(code, target, at, httpStatus, post);
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE UNDOCUMENTED EXTRA — `cdn.syndication.twimg.com/tweet-result`
 *
 * READ THIS BEFORE ENABLING IT. This endpoint is NOT documented. It is X's own
 * embed backend, so unlike a third-party mirror it cannot lie about X's content —
 * that is a genuine integrity advantage — but it is not a public contract. It
 * accepted the literal string `token=a` on 2026-08-02, which is how much of a
 * contract it is. Its ToS standing is a compliance judgement, not an engineering
 * one (the house position is already recorded at `xMail.ts:16-17`).
 *
 * Therefore, and these are load-bearing, not stylistic:
 *   • OFF BY DEFAULT. `enabled: true` must be passed explicitly, per call.
 *   • Graded LOW by `provenanceLadder.ts` (D4), never C3 and never as a text source.
 *   • PER-POST PULL ONLY. There is no batch form and no crawl form in this file.
 *   • HARD-CAPPED per process, because the syndication family rate-limited on the
 *     first request from this IP on another path (mkt-r3 §1.5b).
 *   • Every count it returns is a LOWER BOUND, named as one, stamped with the fetch
 *     time, and never divided by anything. There is no denominator anywhere in this
 *     compartment — no impressions, so no rate. See FORBIDDEN_DERIVATIONS in
 *     `provenanceLadder.ts`.
 * ──────────────────────────────────────────────────────────────────────────── */

export type SyndicationCode =
  | 'CONFIRMED'
  | 'SYNDICATION_DISABLED'
  | 'SYNDICATION_BUDGET_EXHAUSTED'
  | 'POST_NOT_FOUND'
  | 'CHANNEL_RATE_LIMITED'
  | 'CHANNEL_UPSTREAM_ERROR'
  | 'CHANNEL_TIMEOUT'
  | 'CHANNEL_TRANSPORT_FAILED'
  | 'MALFORMED_RESPONSE'
  | 'INVALID_REF';

export const SYNDICATION_CODE_MESSAGE: Record<SyndicationCode, string> = {
  CONFIRMED: 'Undocumented syndication endpoint answered. Counts are lower bounds as of the fetch time.',
  SYNDICATION_DISABLED: 'The undocumented syndication source is off. It must be enabled per call, deliberately, and its output is graded low.',
  SYNDICATION_BUDGET_EXHAUSTED: 'The per-process cap on undocumented syndication lookups is spent. No further calls this window.',
  POST_NOT_FOUND: 'The syndication endpoint has no record of this post. Not proof it never existed.',
  CHANNEL_RATE_LIMITED: 'The syndication endpoint rate-limited us. Nothing was learned.',
  CHANNEL_UPSTREAM_ERROR: 'The syndication endpoint returned a server error. Nothing was learned.',
  CHANNEL_TIMEOUT: 'The syndication endpoint timed out. Nothing was learned.',
  CHANNEL_TRANSPORT_FAILED: 'The syndication endpoint could not be reached. Nothing was learned.',
  MALFORMED_RESPONSE: 'The syndication endpoint answered in a shape we do not recognise — expected, since it is undocumented. Treated as unknown.',
  INVALID_REF: 'Not a valid X post identity, so no request was made.',
};

/**
 * Observed counters. Every field name says what it is: `Observed` means "at least
 * this many, as counted by X at `fetchedAt`". Nothing here may be aggregated.
 */
export interface SyndicationObservation {
  postId: string;
  /** At least this many likes at `fetchedAt`. A lower bound, always. */
  favouritesObservedLowerBound: number | null;
  /** At least this many replies in the conversation at `fetchedAt`. A lower bound. */
  repliesObservedLowerBound: number | null;
  /** Exact ISO instant from X — the one place a true timestamp exists keylessly. */
  createdAtExact: string | null;
  isBlueVerified: boolean | null;
  verifiedType: string | null;
  isEdited: boolean | null;
  /** For polls, X's own flag. A non-final count must never be presented as a result. */
  pollCountsAreFinal: boolean | null;
  fetchedAt: string;
  /** Stamped on every row so a reader cannot mistake this for a documented source. */
  sourceIsUndocumented: true;
}

export interface SyndicationResult {
  code: SyndicationCode;
  message: string;
  observation: SyndicationObservation | null;
  fetchedAt: string;
  httpStatus: number | null;
}

const SYNDICATION_BUDGET = 30;
const syndicationBudget = { spent: 0 };

/** Test seam and operational reset for the hard cap. */
export function resetSyndicationBudget(): void {
  syndicationBudget.spent = 0;
}

/** Remaining undocumented-source lookups in this process. */
export function syndicationBudgetRemaining(): number {
  return Math.max(0, SYNDICATION_BUDGET - syndicationBudget.spent);
}

/**
 * Is the undocumented source switched on in this deployment? Unconfigured is the
 * normal state, matching `mailConfigured()` and the x402/AI layers.
 */
export function syndicationConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return env.X_SYNDICATION_UNDOCUMENTED === 'true';
}

function synResult(
  code: SyndicationCode,
  fetchedAt: string,
  httpStatus: number | null,
  observation: SyndicationObservation | null,
): SyndicationResult {
  return { code, message: SYNDICATION_CODE_MESSAGE[code], observation, fetchedAt, httpStatus };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

export async function fetchSyndicationCounts(
  ref: PostRef,
  opts: OEmbedOptions & { enabled?: boolean } = {},
): Promise<SyndicationResult> {
  const now = opts.now ?? (() => new Date());
  const at = now().toISOString();

  // Off by default. There is no env var that flips this on without a caller also
  // deciding, per call, that it wants an undocumented source.
  if (opts.enabled !== true) return synResult('SYNDICATION_DISABLED', at, null, null);
  if (!validRef(ref)) return synResult('INVALID_REF', at, null, null);
  if (syndicationBudgetRemaining() <= 0) return synResult('SYNDICATION_BUDGET_EXHAUSTED', at, null, null);
  syndicationBudget.spent += 1;

  const endpoint = `https://cdn.syndication.twimg.com/tweet-result?id=${ref.postId}&lang=en&token=a`;
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await doFetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (res.status === 404) return synResult('POST_NOT_FOUND', at, res.status, null);
    if (res.status === 429) return synResult('CHANNEL_RATE_LIMITED', at, res.status, null);
    if (!res.ok) return synResult('CHANNEL_UPSTREAM_ERROR', at, res.status, null);
    const raw = await res.text();
    if (!raw.trim()) return synResult('MALFORMED_RESPONSE', at, res.status, null);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return synResult('MALFORMED_RESPONSE', at, res.status, null);
    }
    if (!body || typeof body !== 'object' || String(body.id_str ?? '') !== ref.postId) {
      return synResult('MALFORMED_RESPONSE', at, res.status, null);
    }
    const user = (body.user ?? {}) as Record<string, unknown>;
    const card = (body.card ?? {}) as Record<string, unknown>;
    const created = typeof body.created_at === 'string' ? body.created_at : null;
    return synResult('CONFIRMED', at, res.status, {
      postId: ref.postId,
      favouritesObservedLowerBound: num(body.favorite_count),
      repliesObservedLowerBound: num(body.conversation_count),
      createdAtExact: created && !Number.isNaN(Date.parse(created)) ? new Date(created).toISOString() : null,
      isBlueVerified: bool(user.is_blue_verified),
      verifiedType: typeof user.verified_type === 'string' ? user.verified_type : null,
      isEdited: bool(body.isEdited),
      pollCountsAreFinal: 'counts_are_final' in card ? bool(card.counts_are_final) : null,
      fetchedAt: at,
      sourceIsUndocumented: true,
    });
  } catch (err) {
    const code: SyndicationCode =
      (err as { name?: string })?.name === 'AbortError' ? 'CHANNEL_TIMEOUT' : 'CHANNEL_TRANSPORT_FAILED';
    return synResult(code, at, null, null);
  } finally {
    clearTimeout(timer);
  }
}
