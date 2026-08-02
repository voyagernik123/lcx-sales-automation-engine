/**
 * M6 — THE WATCH. Regulator, narrative, and claim expiry, entirely keyless.
 *
 * Three jobs, and a fourth that is really the point:
 *
 *   1. FMA Liechtenstein warning watch. FMA is LCX's home regulator and it has
 *      NO RSS FEED — verified: /de/rss.html, /rss and /en.html all 404 and the
 *      string "rss" does not appear in the served homepage HTML. What it does
 *      publish is typed sitemaps, and `sitemap.warning_entry.xml` carries the
 *      investor-warning entries. Verified from this machine on 2026-08-02:
 *      HTTP 200, text/xml, 21,513 bytes, 110 <loc> entries (55 warnings × de/en).
 *      A warning naming LCX, a partner, or a listed asset is the single
 *      highest-value signal available to this desk, and the register already
 *      contains one: entry 205, `warning-lcxairdrop-dot-com-205` — an LCX
 *      impersonation domain FMA has already warned the public about.
 *
 *   2. Regulator and press narrative, read from the ingest that already exists.
 *      `apps/api/src/connectors/news.ts` polls ~20 keyless RSS feeds including
 *      sec.gov press, sec.gov litigation and esma.europa.eu/rss.xml, and
 *      persists them into `market_news`. Marketing reads none of it today. This
 *      module READS that table. It does not open a second ingest, and it does
 *      not add a feed — adding one means editing news.ts, which this module does
 *      not own.
 *
 *   3. A claim expiry ledger. A claim that was true in March is a liability in
 *      August. The claim library (`packages/shared/src/claims/`) has no review
 *      date on `Claim` at all, so the review dates must come from a register the
 *      desk maintains — and when that register is empty or incomplete, this
 *      module REFUSES and says so rather than reporting "0 claims past due".
 *
 *   4. Saying what the watch cannot see. Every figure below is emitted with a
 *      `WatchWindow` recording what the window could and could not see, whether
 *      the count is a lower bound, and which refusals apply. A sitemap gives a
 *      URL and a change timestamp — not a publication date and not the warning's
 *      text. A press feed gives what the press wrote — not what a competitor did.
 *
 * KEYLESS BY CONSTRUCTION. Every source in `WATCH_SOURCES` is typed
 * `credentialRequired: false` as a literal, so adding a keyed source does not
 * typecheck. There is no posting path here, nothing that authenticates as LCX,
 * and no write to any table.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO
 *   - It does not fetch an FMA warning's page body. The page is public and
 *     robots-permitted, but an HTML text extractor that is subtly wrong about a
 *     regulator's words is worse than an honest "open this URL". Every match
 *     therefore carries `WATCH_WARNING_BODY_NOT_READ`.
 *   - It does not treat a 2xx with an empty body as "nothing happened". That
 *     failure mode was observed for real (Binance returns 202 with 0 bytes; X's
 *     syndication timeline endpoints return 200 with 0 bytes) and it manufactures
 *     confident fiction. Every fetch resolves to data | no_data_confirmed |
 *     unknown, and unknown stays unknown.
 *   - It does not compute share of voice, audience sentiment, reach, or
 *     competitor performance. There is no denominator for any of them.
 */
import type pg from 'pg';
import type { Claim, Reliability, Credibility } from '@lcx/shared';
import { admiraltyCode, confidenceFrom } from '@lcx/shared';

/* ────────────────────────────────────────────────────────────────────────────
 * §0 REFUSALS
 *
 * A refusal is not a warning. It is a stable code, a sentence a human can act
 * on, and the rule that caused it. Nothing in this module returns a zero where
 * it means "we could not look".
 * ──────────────────────────────────────────────────────────────────────────── */

export type WatchRefusalCode =
  /* fetch layer */
  | 'WATCH_SOURCE_UNREACHABLE'
  | 'WATCH_SOURCE_EMPTY_BODY'
  | 'WATCH_SOURCE_NOT_XML'
  | 'WATCH_SOURCE_OVERSIZE'
  | 'WATCH_UNCHANGED_WITHOUT_PRIOR'
  /* FMA sitemap layer */
  | 'WATCH_WARNING_BODY_NOT_READ'
  | 'WATCH_SITEMAP_LASTMOD_IS_NOT_PUBLICATION'
  | 'WATCH_WARNING_REGISTER_NOT_EXHAUSTIVE'
  | 'WATCH_WATCH_TERMS_EMPTY'
  /* news spine layer */
  | 'WATCH_NEWS_SPINE_ABSENT'
  | 'WATCH_NEWS_SPINE_UNREADABLE'
  | 'WATCH_NEWS_SPINE_SILENT'
  | 'WATCH_REGULATOR_FEED_NOT_WIRED'
  | 'WATCH_FEED_ITEM_CAP'
  /* competitor layer */
  | 'WATCH_COMPETITOR_REGISTER_EMPTY'
  | 'WATCH_COMPETITOR_NEWSROOMS_UNFETCHABLE'
  | 'WATCH_COMPETITOR_PERFORMANCE_UNKNOWABLE'
  /* claim expiry layer */
  | 'WATCH_CLAIM_REVIEW_REGISTER_EMPTY'
  | 'WATCH_CLAIM_REVIEW_INCOMPLETE'
  | 'WATCH_LIVE_COPY_REGISTER_EMPTY'
  | 'WATCH_COPY_LINK_NOT_DERIVABLE';

export interface WatchRefusal {
  code: WatchRefusalCode;
  /** One sentence, addressed to the human who has to do something about it. */
  sentence: string;
  /** The rule, statute, or recorded observation that caused the refusal. */
  rule: string;
  /** Optional subject: a claim id, an entry id, a competitor name. */
  subject?: string;
}

/**
 * The rule cited by each refusal code. Regulatory codes cite MiCA; data-honesty
 * codes cite the doctrine rule they enforce plus the observation that proved the
 * failure mode is real, because "we measured this" is a stronger citation than
 * "we assumed this".
 */
const REFUSAL_RULE: Record<WatchRefusalCode, string> = {
  WATCH_SOURCE_UNREACHABLE:
    'Doctrine rule 3 (never claim a number you cannot observe): transport failure is unknown, not absence. Verified failure mode: the apex lcx.com is RPZ-blocked by some ISP resolvers, which a naive fetcher reads as "LCX has no blog".',
  WATCH_SOURCE_EMPTY_BODY:
    'Doctrine rule 3. Verified 2026-08-02: binance.com/en/blog/rss returns HTTP 202 with 0 bytes and cdn.syndication.twimg.com timeline endpoints return HTTP 200 with 0 bytes — a bot wall reads as success-with-no-items.',
  WATCH_SOURCE_NOT_XML:
    'Doctrine rule 3. Verified 2026-08-02: esma.europa.eu/press-news/esma-news/rss returns HTTP 200 with text/html — it is a page, not a feed. Use /rss.xml.',
  WATCH_SOURCE_OVERSIZE:
    'Doctrine rule 6 (corroborate before believing): an oversize body from an unauthenticated source is not parsed. FMA warning sitemap observed at 21,513 bytes on 2026-08-02.',
  WATCH_UNCHANGED_WITHOUT_PRIOR:
    'Doctrine rule 3. HTTP 304 means "same as the copy you hold". With no prior snapshot held there is nothing it can mean, so it is unknown.',
  WATCH_WARNING_BODY_NOT_READ:
    'Doctrine rule 3 and rule 6. The sitemap carries <loc>, <lastmod>, <changefreq>, <priority> — and no warning text. Whether this warning names LCX in its body was not read by this instrument.',
  WATCH_SITEMAP_LASTMOD_IS_NOT_PUBLICATION:
    'Measured 2026-08-02 on sitemap.warning_entry.xml: 31 of the 47 English entries share the lastmod 2024-09-02, a CMS regeneration timestamp, and entry ids are not monotonic when ordered by lastmod. <lastmod> is a change timestamp; it does not date the warning.',
  WATCH_WARNING_REGISTER_NOT_EXHAUSTIVE:
    'Measured 2026-08-02: the sitemap lists 55 warning entries while entry ids run to 1665, so it is FMA\'s current list, not the complete warning register. Absence from this sitemap is not absence of a warning.',
  WATCH_WATCH_TERMS_EMPTY:
    'House pattern (the GPS perimeter): a gate you can walk past is decoration. With no terms to watch for, a clean scan means nothing and is refused rather than reported as clean.',
  WATCH_NEWS_SPINE_ABSENT:
    'Migration 0025 creates market_news. Until it is applied on this environment there is no news spine to read, which is unknown, not quiet.',
  WATCH_NEWS_SPINE_UNREADABLE:
    'Doctrine rule 3. A database that cannot answer is not a database reporting silence.',
  WATCH_NEWS_SPINE_SILENT:
    'connectors/news.ts:169-171 polls sec, sec-litigation and esma continuously. Zero regulator rows with no fresh rows from any source means the ingest is not running — reporting "no regulator news" would be a fabrication.',
  WATCH_REGULATOR_FEED_NOT_WIRED:
    'This module reads market_news; it does not ingest. A regulator absent from connectors/news.ts RSS_FEEDS is invisible here, and wiring it means editing a file this module does not own.',
  WATCH_FEED_ITEM_CAP:
    'connectors/news.ts:201 parses `blocks.slice(0, 20)` — at most 20 items per feed per poll. Counts derived from it are lower bounds, never totals.',
  WATCH_COMPETITOR_REGISTER_EMPTY:
    'House pattern (the GPS perimeter): an empty register refuses honestly and says it is empty.',
  WATCH_COMPETITOR_NEWSROOMS_UNFETCHABLE:
    'Verified 2026-08-02, zero of six: kraken.com/blog/feed and bitstamp.net and gemini.com fail to connect, bitpanda 404s, blog.coinbase.com 403s behind a bot wall, binance.com returns 202 with 0 bytes. Competitor monitoring is press coverage about them, not their own publishing.',
  WATCH_COMPETITOR_PERFORMANCE_UNKNOWABLE:
    'Doctrine rule 3. Engagement, reach and share of voice need a denominator that does not exist without an X credential, and no X credential exists or will.',
  WATCH_CLAIM_REVIEW_REGISTER_EMPTY:
    'Doctrine rule 3. `Claim` (packages/shared/src/claims/types.ts:15-24) carries id, category, text, jurisdiction, riskLevel, requiresHumanReview, version, active — and no review date. With no review register there is no expiry to report, and "0 past due" would be a lie.',
  WATCH_CLAIM_REVIEW_INCOMPLETE:
    'FINRA 2210(b)(4)(A) records first AND last use — approved language is an interval with a retirement event, so an active claim with no review record is unreviewed, not current.',
  WATCH_LIVE_COPY_REGISTER_EMPTY:
    'Doctrine rule 3. Which live copy depends on a claim cannot be derived from an empty copy register, so the dependency is null, not an empty list.',
  WATCH_COPY_LINK_NOT_DERIVABLE:
    'marketing_reply_draft has no claims_used column (0046_marketing.sql:95-114), so a claim→copy link must be derived from text. A claim with no phrase distinctive enough to match safely gets a null dependency rather than a false zero.',
};

/** Build a refusal with its rule attached. The rule table is the only source of rules. */
export function watchRefusal(
  code: WatchRefusalCode,
  sentence: string,
  subject?: string,
): WatchRefusal {
  return subject === undefined
    ? { code, sentence, rule: REFUSAL_RULE[code] }
    : { code, sentence, rule: REFUSAL_RULE[code], subject };
}

/** Every refusal code this module can raise, for the surface that renders them. */
export function watchRefusalCodes(): WatchRefusalCode[] {
  return Object.keys(REFUSAL_RULE) as WatchRefusalCode[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * §1 THE SOURCE REGISTRY
 *
 * Everything the watch is allowed to look at, with the HTTP status and byte
 * count actually observed when it was verified, and — the field that matters —
 * what each source CANNOT tell you.
 * ──────────────────────────────────────────────────────────────────────────── */

export type WatchSourceId =
  | 'fma_warning_sitemap'
  | 'fma_news_sitemap'
  | 'news_spine_regulator'
  | 'news_spine_press';

export type WatchSourceTransport = 'sitemap_xml' | 'market_news_table';

export interface WatchSourceDef {
  id: WatchSourceId;
  label: string;
  /** The URL for a sitemap source; for a spine source, the table it reads. */
  locator: string;
  transport: WatchSourceTransport;
  /**
   * Literal `false`. This is the ratchet: there is no X API key and there never
   * will be, so a source that needs a credential cannot be added to this
   * registry without failing the typecheck.
   */
  credentialRequired: false;
  reliability: Reliability;
  credibility: Credibility;
  /** When this source was last verified by hand, and what it returned. */
  verifiedAt: string;
  verifiedHttpStatus: number;
  verifiedBytes: number | null;
  /** Minutes between polls. FMA regenerates its sitemap index several times a day. */
  pollCadenceMinutes: number;
  /** What this source can answer. */
  couldSee: readonly string[];
  /** What it cannot, stated on the source rather than discovered downstream. */
  couldNotSee: readonly string[];
}

export const WATCH_SOURCES: Readonly<Record<WatchSourceId, WatchSourceDef>> = Object.freeze({
  fma_warning_sitemap: {
    id: 'fma_warning_sitemap',
    label: 'FMA Liechtenstein — investor warning entries (sitemap)',
    locator: 'https://www.fma-li.li/sitemap.warning_entry.xml',
    transport: 'sitemap_xml',
    credentialRequired: false,
    // The home regulator publishing about itself: completely reliable. But the
    // sitemap is an index of pages, not the pages, so a claim derived from it is
    // only possibly true until the page is read — credibility 3, not 1.
    reliability: 'A',
    credibility: 3,
    verifiedAt: '2026-08-02',
    verifiedHttpStatus: 200,
    verifiedBytes: 21_513,
    pollCadenceMinutes: 60,
    couldSee: [
      'the URL slug of each listed warning, which usually names the warned domain or entity',
      'the de/en URL pair per entry and the numeric entry id',
      'that an entry changed, via <lastmod>',
    ],
    couldNotSee: [
      'the warning text — the sitemap carries no title and no body',
      'when a warning was published; <lastmod> is a change timestamp (31 of 47 English entries share one CMS date)',
      'warnings not listed in this sitemap: 55 entries are listed while ids run past 1600',
      'anything about a warning that names LCX only in its body and not in its slug',
    ],
  },
  fma_news_sitemap: {
    id: 'fma_news_sitemap',
    label: 'FMA Liechtenstein — news entries (sitemap)',
    locator: 'https://www.fma-li.li/sitemap.news_entry.xml',
    transport: 'sitemap_xml',
    credentialRequired: false,
    reliability: 'A',
    credibility: 3,
    verifiedAt: '2026-08-02',
    verifiedHttpStatus: 200,
    verifiedBytes: 68_331,
    pollCadenceMinutes: 240,
    couldSee: [
      'the URL slug of each FMA news entry, e.g. a dismissal notice or a supervisory-practice note',
    ],
    couldNotSee: [
      'the news text, for the same reason as the warning sitemap',
      'publication dates, for the same reason',
    ],
  },
  news_spine_regulator: {
    id: 'news_spine_regulator',
    label: 'Regulator feeds already ingested into market_news (SEC, SEC litigation, ESMA)',
    locator: 'market_news',
    transport: 'market_news_table',
    credentialRequired: false,
    reliability: 'A',
    credibility: 2,
    verifiedAt: '2026-08-02',
    verifiedHttpStatus: 200,
    verifiedBytes: 55_187, // esma.europa.eu/rss.xml as observed
    pollCadenceMinutes: 30,
    couldSee: [
      'headline, URL and publication date of SEC press, SEC litigation and ESMA items the spine has stored',
    ],
    couldNotSee: [
      'FMA Liechtenstein — it has no RSS feed at all, which is why the sitemap watch exists',
      'EBA — its /rss.xml resolves but is not among the feeds connectors/news.ts polls',
      'more than 20 items per feed per poll (connectors/news.ts:201)',
      'anything at all when the ingest job is not running',
    ],
  },
  news_spine_press: {
    id: 'news_spine_press',
    label: 'Crypto press feeds already ingested into market_news',
    locator: 'market_news',
    transport: 'market_news_table',
    credentialRequired: false,
    // Per-outlet grading already exists in provenance.ts (newsReliability); the
    // registry default here is the floor for a mixed set of outlets.
    reliability: 'C',
    credibility: 3,
    verifiedAt: '2026-08-02',
    verifiedHttpStatus: 200,
    verifiedBytes: null,
    pollCadenceMinutes: 30,
    couldSee: [
      'that the press wrote about a named competitor, and what the headline said',
    ],
    couldNotSee: [
      "a competitor's own publishing — zero of six competitor newsroom feeds are fetchable",
      'any competitor engagement, reach, follower or performance figure',
      'anything the ~20 polled feeds did not carry',
    ],
  },
});

/**
 * Regulators worth watching that this module cannot see, and why. Rendered next
 * to the regulator panel so the gap is on screen rather than in a comment.
 */
export const REGULATOR_FEEDS_NOT_WIRED: readonly {
  authority: string;
  feed: string | null;
  why: string;
  mitigation: string;
}[] = Object.freeze([
  {
    authority: 'FMA Liechtenstein',
    feed: null,
    why: 'has no RSS or Atom feed — /de/rss.html, /rss and /en.html all 404 and the served homepage HTML contains no feed link',
    mitigation: 'watched here via sitemap.warning_entry.xml and sitemap.news_entry.xml instead',
  },
  {
    authority: 'European Banking Authority',
    feed: 'https://www.eba.europa.eu/rss.xml',
    why: 'the feed resolves (HTTP 200, application/rss+xml, 20,656 bytes on 2026-08-02) but is absent from connectors/news.ts RSS_FEEDS',
    mitigation: 'none in this module — adding it means editing connectors/news.ts, which this module does not own',
  },
  {
    authority: 'EUR-Lex / MiCA amendments and the Liechtenstein gazette',
    feed: null,
    why: 'no feed was found and none was verified',
    mitigation: 'none — recorded as an unverified gap, not as a covered source',
  },
]);

/** The source ids in `market_news.source` that are regulators, per connectors/news.ts:169-171. */
export const REGULATOR_SPINE_SOURCES: readonly string[] = Object.freeze([
  'sec',
  'sec-litigation',
  'esma',
]);

/* ────────────────────────────────────────────────────────────────────────────
 * §2 THE TRI-STATE FETCH
 *
 * `data`, `no_data_confirmed`, or `unknown`. There is no fourth state and no
 * empty-array-means-quiet. `unknown` always carries the refusal that explains
 * itself, so the surface can render the reason where the number would have been.
 * ──────────────────────────────────────────────────────────────────────────── */

export type FetchState = 'data' | 'no_data_confirmed' | 'unknown';

export interface FetchMeta {
  sourceId: WatchSourceId;
  fetchedAt: string;
  httpStatus: number | null;
  bytes: number | null;
}

export type FetchOutcome<T> =
  | ({ state: 'data'; value: T } & FetchMeta)
  | ({ state: 'no_data_confirmed'; note: string } & FetchMeta)
  | ({ state: 'unknown'; refusal: WatchRefusal } & FetchMeta);

/** Nothing from an unauthenticated source is parsed above this size. */
export const MAX_SOURCE_BYTES = 2_000_000;

/**
 * Decide what an HTTP response means, without deciding it means "nothing".
 *
 * The rules exist because each of them was observed failing in the wild:
 * a non-2xx is unknown; a 2xx with an empty or whitespace body is unknown (the
 * bot-wall shape); a 2xx whose body has no XML root is unknown (ESMA's
 * /press-news/esma-news/rss serves HTML with a 200); a 304 is only meaningful
 * when a prior snapshot is held.
 */
export function classifyXmlResponse(input: {
  sourceId: WatchSourceId;
  httpStatus: number;
  body: string;
  hadPriorSnapshot: boolean;
  fetchedAt: string;
}): FetchOutcome<string> {
  const meta: FetchMeta = {
    sourceId: input.sourceId,
    fetchedAt: input.fetchedAt,
    httpStatus: input.httpStatus,
    bytes: input.body.length,
  };
  const label = WATCH_SOURCES[input.sourceId].label;

  if (input.httpStatus === 304) {
    return input.hadPriorSnapshot
      ? { state: 'no_data_confirmed', note: `${label} is unchanged since the last poll (HTTP 304).`, ...meta }
      : {
          state: 'unknown',
          refusal: watchRefusal(
            'WATCH_UNCHANGED_WITHOUT_PRIOR',
            `${label} answered "unchanged" but no previous copy is held, so nothing is known about it.`,
            input.sourceId,
          ),
          ...meta,
        };
  }

  if (input.httpStatus < 200 || input.httpStatus >= 300) {
    return {
      state: 'unknown',
      refusal: watchRefusal(
        'WATCH_SOURCE_UNREACHABLE',
        `${label} returned HTTP ${input.httpStatus}, so this window saw nothing — which is not the same as nothing having happened.`,
        input.sourceId,
      ),
      ...meta,
    };
  }

  if (input.body.trim().length === 0) {
    return {
      state: 'unknown',
      refusal: watchRefusal(
        'WATCH_SOURCE_EMPTY_BODY',
        `${label} returned HTTP ${input.httpStatus} with an empty body. That is the shape of a bot wall, not of a quiet week.`,
        input.sourceId,
      ),
      ...meta,
    };
  }

  if (input.body.length > MAX_SOURCE_BYTES) {
    return {
      state: 'unknown',
      refusal: watchRefusal(
        'WATCH_SOURCE_OVERSIZE',
        `${label} returned ${input.body.length} bytes, over the ${MAX_SOURCE_BYTES}-byte cap, and was not parsed.`,
        input.sourceId,
      ),
      ...meta,
    };
  }

  if (!/<(?:urlset|sitemapindex|rss|feed)\b/i.test(input.body)) {
    return {
      state: 'unknown',
      refusal: watchRefusal(
        'WATCH_SOURCE_NOT_XML',
        `${label} returned HTTP ${input.httpStatus} with a body that has no XML root element — most likely a web page or an error page served with a success status.`,
        input.sourceId,
      ),
      ...meta,
    };
  }

  return { state: 'data', value: input.body, ...meta };
}

/* ────────────────────────────────────────────────────────────────────────────
 * §3 THE COVERAGE RECORD
 *
 * Every figure in this module travels with one of these. It is deliberately NOT
 * an `ObservationFrame`: it carries no metric and no estimate, only the coverage
 * facts a caller needs in order to build a frame. When
 * `packages/shared/src/marketing/observation.ts` lands, the frame is constructed
 * FROM this, and this stays the transport-level truth about one source in one
 * window. Do not add a metric field here — that is the frame's job.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface WatchWindow {
  sourceId: WatchSourceId;
  state: FetchState;
  fetchedAt: string;
  /** Inclusive lower bound of the window, ISO-8601, or null when the source is not time-windowed. */
  windowFrom: string | null;
  windowTo: string | null;
  httpStatus: number | null;
  bytes: number | null;
  grade: string;
  confidence: number;
  couldSee: readonly string[];
  couldNotSee: readonly string[];
  /** True when any count derived from this window is a floor, not a total. */
  countsAreLowerBound: boolean;
  refusals: WatchRefusal[];
}

export function watchWindow(input: {
  sourceId: WatchSourceId;
  state: FetchState;
  fetchedAt: string;
  windowFrom?: string | null;
  windowTo?: string | null;
  httpStatus?: number | null;
  bytes?: number | null;
  freshnessDays?: number;
  countsAreLowerBound: boolean;
  refusals: WatchRefusal[];
}): WatchWindow {
  const def = WATCH_SOURCES[input.sourceId];
  return {
    sourceId: input.sourceId,
    state: input.state,
    fetchedAt: input.fetchedAt,
    windowFrom: input.windowFrom ?? null,
    windowTo: input.windowTo ?? null,
    httpStatus: input.httpStatus ?? null,
    bytes: input.bytes ?? null,
    grade: admiraltyCode(def.reliability, def.credibility),
    // A short half-life: a regulator warning matters most the day it appears.
    confidence: confidenceFrom(def.reliability, def.credibility, input.freshnessDays ?? 0, 7),
    couldSee: def.couldSee,
    couldNotSee: def.couldNotSee,
    countsAreLowerBound: input.countsAreLowerBound,
    refusals: input.refusals,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * §4 SITEMAP PARSING — pure
 *
 * Deliberately crude and regex-based, matching the durability argument already
 * made for the X notification parser: a sitemap is a flat list of <url> blocks
 * and a strict XML parse buys nothing but a new way to throw.
 *
 * The one thing this parser will not do is invent a publication date. The field
 * is `sitemapLastmod` and it is never renamed on the way out.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface SitemapEntry {
  loc: string;
  /** <lastmod> verbatim. A CHANGE timestamp — see WATCH_SITEMAP_LASTMOD_IS_NOT_PUBLICATION. */
  sitemapLastmod: string | null;
  changefreq: string | null;
  priority: number | null;
}

/** Parse a <urlset>. Returns null when the body is not a urlset at all. */
export function parseSitemapUrlset(xml: string): SitemapEntry[] | null {
  if (!/<urlset\b/i.test(xml)) return null;
  const out: SitemapEntry[] = [];
  for (const block of xml.match(/<url\b[\s\S]*?<\/url>/gi) ?? []) {
    const loc = block.match(/<loc>([\s\S]*?)<\/loc>/i)?.[1]?.trim();
    if (!loc) continue;
    const lastmod = block.match(/<lastmod>([\s\S]*?)<\/lastmod>/i)?.[1]?.trim() ?? null;
    const changefreq = block.match(/<changefreq>([\s\S]*?)<\/changefreq>/i)?.[1]?.trim() ?? null;
    const priorityRaw = block.match(/<priority>([\s\S]*?)<\/priority>/i)?.[1]?.trim();
    const priority = priorityRaw != null && priorityRaw !== '' && Number.isFinite(Number(priorityRaw))
      ? Number(priorityRaw)
      : null;
    out.push({ loc, sitemapLastmod: lastmod, changefreq, priority });
  }
  return out;
}

export type FmaEntryKind = 'warning' | 'note' | 'announcement' | 'other';

export interface FmaWarningEntry {
  /** The trailing numeric id FMA gives the entry, e.g. 205 — stable across the de/en pair. */
  entryId: string;
  lang: string;
  slug: string;
  kind: FmaEntryKind;
  /** Slug tokens with the kind prefix and id removed, and `-dot-` obfuscation undone. */
  tokens: string[];
  loc: string;
  sitemapLastmod: string | null;
}

const KIND_PREFIX: Record<string, FmaEntryKind> = {
  warning: 'warning',
  warnung: 'warning',
  note: 'note',
  hinweis: 'note',
  announcement: 'announcement',
  mitteilung: 'announcement',
};

/**
 * Decompose an FMA warning URL. The slug is the only text the sitemap gives us,
 * and FMA writes domains into it with `-dot-` in place of the period
 * (`warning-lcxairdrop-dot-com-205`), so undoing that is what turns a slug into
 * something a brand term can be matched against.
 */
export function parseFmaWarningLoc(loc: string): FmaWarningEntry | null {
  const m = loc.match(/^https?:\/\/(?:www\.)?fma-li\.li\/([a-z]{2})\/(?:warning|warnung)\/([^/?#]+)\/?$/i);
  if (!m) return null;
  const lang = m[1].toLowerCase();
  const slug = m[2].toLowerCase();
  const idMatch = slug.match(/-(\d+)$/);
  if (!idMatch) return null;
  const entryId = idMatch[1];
  let body = slug.slice(0, slug.length - idMatch[0].length);
  const firstToken = body.split('-')[0];
  const kind = KIND_PREFIX[firstToken] ?? 'other';
  if (kind !== 'other') body = body.slice(firstToken.length + 1);
  const tokens = body
    .replace(/-dot-/g, '.')
    .split('-')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return { entryId, lang, slug, kind, tokens, loc, sitemapLastmod: null };
}

/* ────────────────────────────────────────────────────────────────────────────
 * §5 THE WARNING MATCH — the highest-value signal in this lane
 *
 * An FMA warning naming LCX, a partner, or a listed asset. The register already
 * contains one: entry 205, `warning-lcxairdrop-dot-com-205`.
 *
 * The match runs against the URL SLUG, because the slug is all the sitemap
 * carries. That is a real blind spot and it is reported, not hidden: a warning
 * that names LCX only in its body is invisible here.
 * ──────────────────────────────────────────────────────────────────────────── */

export type WatchTermKind = 'own_brand' | 'partner' | 'listed_asset';

export interface WatchTerm {
  term: string;
  kind: WatchTermKind;
  /** Whose term this is, for the human who has to act — e.g. 'LCX AG' or a partner name. */
  label: string;
}

export type WarningMatchReason = 'exact_token' | 'substring' | 'lookalike_token';

export interface WarningMatch {
  entryId: string;
  kind: FmaEntryKind;
  /** The English URL when the sitemap listed one, otherwise whichever it listed. */
  url: string;
  /** Every language variant of this entry, so a human can open the German original. */
  urls: string[];
  slug: string;
  sitemapLastmod: string | null;
  matchedTerm: string;
  matchedTermKind: WatchTermKind;
  matchedTermLabel: string;
  matchedToken: string;
  reason: WarningMatchReason;
  /**
   * `act_now` only for LCX's own brand. Everything else is `assess`, because a
   * partner or asset appearing in a warning slug may be coincidence and this
   * instrument has not read the warning.
   */
  severity: 'act_now' | 'assess';
  sentence: string;
  refusals: WatchRefusal[];
}

/** Fold confusable characters so `1cx`, `lcks` and `LCX` collapse together. */
function foldConfusables(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/0/g, 'o')
    .replace(/1/g, 'l')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/vv/g, 'w')
    .replace(/rn/g, 'm');
}

/** True when `a` and `b` differ by at most one insertion, deletion or substitution. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let budget = 1;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
      continue;
    }
    if (budget === 0) return false;
    budget--;
    if (short.length === long.length) {
      i++;
      j++;
    } else {
      j++;
    }
  }
  return true;
}

/** Candidate strings a term can be matched against: the token and its domain labels. */
function matchCandidates(token: string): string[] {
  const parts = token.split('.').filter((p) => p.length > 0);
  return parts.length > 1 ? [token, ...parts] : [token];
}

function classifyTokenMatch(token: string, term: string): WarningMatchReason | null {
  const t = term.toLowerCase();
  if (t.length < 3) return null;
  const candidates = matchCandidates(token.toLowerCase());
  for (const c of candidates) {
    if (c === t) return 'exact_token';
  }
  for (const c of candidates) {
    if (c.includes(t)) return 'substring';
  }
  const foldedTerm = foldConfusables(t);
  for (const c of candidates) {
    const folded = foldConfusables(c);
    if (folded.length < 3) continue;
    if (folded === foldedTerm) return 'lookalike_token';
    if (withinOneEdit(folded, foldedTerm)) return 'lookalike_token';
  }
  return null;
}

const REASON_RANK: Record<WarningMatchReason, number> = {
  exact_token: 3,
  substring: 2,
  lookalike_token: 1,
};

export interface WarningScanResult {
  /** False when the scan could not mean anything — an empty term list. A clean scan is not reported. */
  usable: boolean;
  matches: WarningMatch[];
  /** Distinct warning entries examined, after collapsing the de/en pair. */
  entriesScanned: number;
  /** <loc> elements read, before collapsing. */
  locsRead: number;
  /** Locs that did not parse as an FMA warning entry — reported, never silently dropped. */
  locsUnparsed: string[];
  refusals: WatchRefusal[];
}

/**
 * Scan warning-sitemap entries for watch terms.
 *
 * The de/en pair is collapsed by entry id so one warning raises one match, and
 * the English URL is preferred for display while both are kept.
 */
export function scanWarningEntries(
  entries: readonly SitemapEntry[],
  terms: readonly WatchTerm[],
): WarningScanResult {
  const standing: WatchRefusal[] = [
    watchRefusal(
      'WATCH_WARNING_REGISTER_NOT_EXHAUSTIVE',
      'This is the warning list FMA currently publishes in its sitemap, not the complete warning register — a term absent from this scan may still be the subject of an FMA warning.',
    ),
  ];

  if (terms.length === 0) {
    return {
      usable: false,
      matches: [],
      entriesScanned: 0,
      locsRead: entries.length,
      locsUnparsed: [],
      refusals: [
        ...standing,
        watchRefusal(
          'WATCH_WATCH_TERMS_EMPTY',
          'No watch terms are registered, so this scan cannot report either a hit or a clean result. Register LCX\'s own brand, its partners and its listed assets before relying on this panel.',
        ),
      ],
    };
  }

  const byEntry = new Map<string, FmaWarningEntry[]>();
  const locsUnparsed: string[] = [];
  for (const e of entries) {
    const parsed = parseFmaWarningLoc(e.loc);
    if (!parsed) {
      locsUnparsed.push(e.loc);
      continue;
    }
    parsed.sitemapLastmod = e.sitemapLastmod;
    const list = byEntry.get(parsed.entryId);
    if (list) list.push(parsed);
    else byEntry.set(parsed.entryId, [parsed]);
  }

  const matches: WarningMatch[] = [];
  for (const [entryId, variants] of byEntry) {
    const primary = variants.find((v) => v.lang === 'en') ?? variants[0];
    let best: { term: WatchTerm; token: string; reason: WarningMatchReason } | null = null;
    for (const token of primary.tokens) {
      for (const term of terms) {
        const reason = classifyTokenMatch(token, term.term);
        if (!reason) continue;
        if (!best || REASON_RANK[reason] > REASON_RANK[best.reason]) {
          best = { term, token, reason };
        }
      }
    }
    if (!best) continue;

    const refusals: WatchRefusal[] = [
      watchRefusal(
        'WATCH_WARNING_BODY_NOT_READ',
        `The warning text was not read. Open ${primary.loc} and read it before responding — the slug match is a reason to look, not a finding.`,
        entryId,
      ),
    ];
    if (primary.sitemapLastmod) {
      refusals.push(
        watchRefusal(
          'WATCH_SITEMAP_LASTMOD_IS_NOT_PUBLICATION',
          `This entry last changed at ${primary.sitemapLastmod}. That is not when FMA published the warning, and it must not be presented as a publication date.`,
          entryId,
        ),
      );
    }

    const severity = best.term.kind === 'own_brand' ? 'act_now' : 'assess';
    const reasonPhrase =
      best.reason === 'exact_token'
        ? `names "${best.token}"`
        : best.reason === 'substring'
          ? `contains "${best.term.term}" inside "${best.token}"`
          : `contains "${best.token}", which resembles "${best.term.term}"`;

    matches.push({
      entryId,
      kind: primary.kind,
      url: primary.loc,
      urls: variants.map((v) => v.loc),
      slug: primary.slug,
      sitemapLastmod: primary.sitemapLastmod,
      matchedTerm: best.term.term,
      matchedTermKind: best.term.kind,
      matchedTermLabel: best.term.label,
      matchedToken: best.token,
      reason: best.reason,
      severity,
      sentence: `FMA ${primary.kind === 'warning' ? 'warning' : primary.kind} entry ${entryId} ${reasonPhrase} — watched as ${best.term.kind.replace('_', ' ')} (${best.term.label}).`,
      refusals,
    });
  }

  // Strongest reason first, then newest change, then entry id — deterministic.
  matches.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'act_now' ? -1 : 1;
    if (REASON_RANK[a.reason] !== REASON_RANK[b.reason]) return REASON_RANK[b.reason] - REASON_RANK[a.reason];
    const am = a.sitemapLastmod ?? '';
    const bm = b.sitemapLastmod ?? '';
    if (am !== bm) return am < bm ? 1 : -1;
    return Number(b.entryId) - Number(a.entryId);
  });

  return {
    usable: true,
    matches,
    entriesScanned: byEntry.size,
    locsRead: entries.length,
    locsUnparsed,
    refusals: standing,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * §6 FETCHING THE FMA SITEMAP — the only network call in this module
 *
 * GET, no credential, no cookie, one hard timeout, a byte cap, and a User-Agent
 * that says who is calling. FMA's robots.txt (verified 2026-08-02, 113 bytes)
 * is `User-agent: *` with Disallow only on /de/demo/* and the 404 pages, and it
 * declares this sitemap itself — so this is fetching what FMA published for
 * fetching.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface XmlFetchResult {
  httpStatus: number;
  body: string;
}

/** Injectable so the watch is testable without a network. */
export type XmlFetcher = (url: string) => Promise<XmlFetchResult>;

const WATCH_FETCH_TIMEOUT_MS = 15_000;

const defaultXmlFetcher: XmlFetcher = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WATCH_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/xml, text/xml, */*',
        'User-Agent': 'LCXOSWatch/1.0 (+https://www.lcx.com; regulator-watch)',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    const body = await res.text();
    return { httpStatus: res.status, body };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Fetch and parse the FMA warning sitemap into the tri-state.
 *
 * A transport exception is `unknown`, never an empty list. A urlset that parses
 * to zero entries is `no_data_confirmed`, because FMA answered and its list is
 * genuinely empty — a distinction the caller needs and cannot recover later.
 */
export async function fetchWarningSitemap(opts?: {
  fetcher?: XmlFetcher;
  hadPriorSnapshot?: boolean;
  now?: Date;
}): Promise<FetchOutcome<SitemapEntry[]>> {
  const sourceId: WatchSourceId = 'fma_warning_sitemap';
  const fetchedAt = (opts?.now ?? new Date()).toISOString();
  const fetcher = opts?.fetcher ?? defaultXmlFetcher;
  const url = WATCH_SOURCES[sourceId].locator;

  let raw: XmlFetchResult;
  try {
    raw = await fetcher(url);
  } catch (err) {
    return {
      state: 'unknown',
      refusal: watchRefusal(
        'WATCH_SOURCE_UNREACHABLE',
        `${WATCH_SOURCES[sourceId].label} could not be reached (${err instanceof Error ? err.message : 'transport failure'}), so this window saw nothing.`,
        sourceId,
      ),
      sourceId,
      fetchedAt,
      httpStatus: null,
      bytes: null,
    };
  }

  const classified = classifyXmlResponse({
    sourceId,
    httpStatus: raw.httpStatus,
    body: raw.body,
    hadPriorSnapshot: opts?.hadPriorSnapshot ?? false,
    fetchedAt,
  });
  if (classified.state !== 'data') return classified;

  const entries = parseSitemapUrlset(classified.value);
  if (entries === null) {
    return {
      state: 'unknown',
      refusal: watchRefusal(
        'WATCH_SOURCE_NOT_XML',
        `${WATCH_SOURCES[sourceId].label} returned a body with no <urlset> element, so no warning entries could be read.`,
        sourceId,
      ),
      sourceId,
      fetchedAt,
      httpStatus: classified.httpStatus,
      bytes: classified.bytes,
    };
  }
  if (entries.length === 0) {
    return {
      state: 'no_data_confirmed',
      note: 'FMA answered with a warning sitemap containing no entries.',
      sourceId,
      fetchedAt,
      httpStatus: classified.httpStatus,
      bytes: classified.bytes,
    };
  }
  return {
    state: 'data',
    value: entries,
    sourceId,
    fetchedAt,
    httpStatus: classified.httpStatus,
    bytes: classified.bytes,
  };
}

export interface WarningWatchReport {
  window: WatchWindow;
  scan: WarningScanResult | null;
}

/** Fetch, scan, and wrap the result in its coverage record. */
export async function runWarningWatch(
  terms: readonly WatchTerm[],
  opts?: { fetcher?: XmlFetcher; hadPriorSnapshot?: boolean; now?: Date },
): Promise<WarningWatchReport> {
  const outcome = await fetchWarningSitemap(opts);
  if (outcome.state !== 'data') {
    return {
      window: watchWindow({
        sourceId: 'fma_warning_sitemap',
        state: outcome.state,
        fetchedAt: outcome.fetchedAt,
        httpStatus: outcome.httpStatus,
        bytes: outcome.bytes,
        countsAreLowerBound: false,
        refusals: outcome.state === 'unknown' ? [outcome.refusal] : [],
      }),
      scan: null,
    };
  }
  const scan = scanWarningEntries(outcome.value, terms);
  return {
    window: watchWindow({
      sourceId: 'fma_warning_sitemap',
      state: 'data',
      fetchedAt: outcome.fetchedAt,
      httpStatus: outcome.httpStatus,
      bytes: outcome.bytes,
      countsAreLowerBound: true, // the sitemap is FMA's current list, not the register
      refusals: scan.refusals,
    }),
    scan,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * §7 READING THE NEWS SPINE THAT ALREADY RUNS
 *
 * `connectors/news.ts` already polls the feeds and writes `market_news`. This
 * module reads. The interesting engineering is not the query — it is telling
 * "the regulators were quiet" apart from "the ingest is not running", which look
 * identical from a SELECT that returns no rows.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface NewsSpineRow {
  source: string;
  title: string;
  url: string | null;
  /** COALESCE(published_at, created_at) — the best timestamp the spine holds. */
  at: string | null;
  tickers: string[];
}

/** Has migration 0025 been applied on this environment? Probed once per process. */
let spineTableCache: boolean | null = null;

export async function newsSpineExists(pool: pg.Pool): Promise<boolean | null> {
  if (spineTableCache !== null) return spineTableCache;
  try {
    const res = await pool.query(`SELECT to_regclass('public.market_news') IS NOT NULL AS ok`);
    spineTableCache = Boolean(res.rows[0]?.ok);
    return spineTableCache;
  } catch {
    // Unlike the marketing migration probe, a failure here is NOT cached as
    // false: a database blip must not permanently convince the watch that the
    // news spine does not exist. Null means "could not tell", and the caller
    // turns that into a refusal.
    return null;
  }
}

/** Test-only: forget the probe. */
export function _resetNewsSpineProbe(): void {
  spineTableCache = null;
}

interface SpineQueryResult {
  rows: NewsSpineRow[];
  /** Newest created_at across the WHOLE table — the liveness proof for the ingest. */
  spineMaxCreatedAt: string | null;
  /** Whether the spine has ever stored a row from the sources being asked about. */
  sourceRowsEver: number;
}

function rowsFromJson(value: unknown): NewsSpineRow[] {
  if (!Array.isArray(value)) return [];
  const out: NewsSpineRow[] = [];
  for (const r of value) {
    const row = r as Record<string, unknown>;
    const title = typeof row.title === 'string' ? row.title : null;
    if (!title) continue;
    out.push({
      source: typeof row.source === 'string' ? row.source : 'unknown',
      title,
      url: typeof row.url === 'string' ? row.url : null,
      at: typeof row.at === 'string' ? row.at : null,
      tickers: Array.isArray(row.tickers) ? row.tickers.filter((t): t is string => typeof t === 'string') : [],
    });
  }
  return out;
}

/**
 * The liveness decision, kept pure so it can be tested without a database.
 *
 * Empty + a live ingest + this source has produced rows before  → genuinely quiet.
 * Empty + anything else                                          → unknown.
 */
export function classifySpineWindow(input: {
  sourceId: WatchSourceId;
  rowCount: number;
  spineMaxCreatedAt: string | null;
  sourceRowsEver: number;
  livenessHours: number;
  now: Date;
}): { state: FetchState; refusal: WatchRefusal | null; note: string | null } {
  if (input.rowCount > 0) return { state: 'data', refusal: null, note: null };

  const maxMs = input.spineMaxCreatedAt ? Date.parse(input.spineMaxCreatedAt) : NaN;
  const ingestAlive =
    Number.isFinite(maxMs) && input.now.getTime() - maxMs <= input.livenessHours * 3_600_000;

  if (ingestAlive && input.sourceRowsEver > 0) {
    return {
      state: 'no_data_confirmed',
      refusal: null,
      note: `The news ingest is running (its newest row is ${input.spineMaxCreatedAt}) and these sources have produced rows before, so this window is genuinely quiet.`,
    };
  }
  return {
    state: 'unknown',
    refusal: watchRefusal(
      'WATCH_NEWS_SPINE_SILENT',
      ingestAlive
        ? 'The news ingest is running but has never stored a row from these sources, so an empty window says nothing about what they published.'
        : `The news ingest has stored nothing recently (newest row: ${input.spineMaxCreatedAt ?? 'never'}), so an empty window means the pipeline is down, not that the sources were quiet.`,
      input.sourceId,
    ),
    note: null,
  };
}

async function querySpine(
  pool: pg.Pool,
  /** null means "every source" — used by the competitor lane, which filters on the title instead. */
  sources: readonly string[] | null,
  titlePatterns: readonly string[] | null,
  sinceIso: string,
  limit: number,
): Promise<SpineQueryResult> {
  const params: unknown[] = [sources, sinceIso, limit];
  let titleClause = '';
  if (titlePatterns) {
    params.push(titlePatterns);
    titleClause = ` AND lower(title) LIKE ANY($4::text[])`;
  }
  const sql = `
    WITH windowed AS (
      SELECT source, title, url,
             to_char(COALESCE(published_at, created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at,
             tickers
      FROM market_news
      WHERE ($1::text[] IS NULL OR source = ANY($1::text[]))
        AND COALESCE(published_at, created_at) >= $2::timestamptz${titleClause}
      ORDER BY COALESCE(published_at, created_at) DESC
      LIMIT $3
    )
    SELECT
      (SELECT COALESCE(json_agg(w), '[]'::json) FROM windowed w) AS rows,
      (SELECT to_char(MAX(created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM market_news) AS spine_max_created_at,
      (SELECT COUNT(*) FROM market_news
        WHERE ($1::text[] IS NULL OR source = ANY($1::text[]))) AS source_rows_ever`;
  const res = await pool.query(sql, params);
  const row = (res.rows[0] ?? {}) as Record<string, unknown>;
  return {
    rows: rowsFromJson(row.rows),
    spineMaxCreatedAt: typeof row.spine_max_created_at === 'string' ? row.spine_max_created_at : null,
    sourceRowsEver: Number(row.source_rows_ever ?? 0),
  };
}

export interface RegulatorWatchReport {
  window: WatchWindow;
  items: NewsSpineRow[];
  /** A floor: at most 20 items per feed per poll reach the spine. */
  itemsObservedInWindow: number;
  /** Regulators that are simply not visible from here, with the reason. */
  notWired: typeof REGULATOR_FEEDS_NOT_WIRED;
}

/**
 * Regulator items the spine already holds, for the window asked for.
 *
 * Every count is named `...Observed` and every window carries the item cap and
 * the not-wired list, because the number on screen is a floor over a partial set
 * of regulators.
 */
export async function readRegulatorWatch(
  pool: pg.Pool,
  opts?: { sinceHours?: number; limit?: number; livenessHours?: number; now?: Date },
): Promise<RegulatorWatchReport> {
  const sourceId: WatchSourceId = 'news_spine_regulator';
  const now = opts?.now ?? new Date();
  const sinceHours = opts?.sinceHours ?? 72;
  const windowFrom = new Date(now.getTime() - sinceHours * 3_600_000).toISOString();
  const fetchedAt = now.toISOString();

  const standing: WatchRefusal[] = [
    watchRefusal(
      'WATCH_FEED_ITEM_CAP',
      'At most 20 items per feed per poll reach this table, so the count below is a floor and not a total.',
      sourceId,
    ),
    watchRefusal(
      'WATCH_REGULATOR_FEED_NOT_WIRED',
      'FMA Liechtenstein and the EBA are not among the feeds this table ingests, so nothing they published appears here. FMA is covered separately by the warning-sitemap watch; the EBA is not covered at all.',
      sourceId,
    ),
  ];

  const emptyWindow = (state: FetchState, refusals: WatchRefusal[]): RegulatorWatchReport => ({
    window: watchWindow({
      sourceId,
      state,
      fetchedAt,
      windowFrom,
      windowTo: fetchedAt,
      countsAreLowerBound: true,
      refusals,
    }),
    items: [],
    itemsObservedInWindow: 0,
    notWired: REGULATOR_FEEDS_NOT_WIRED,
  });

  const exists = await newsSpineExists(pool);
  if (exists === null) {
    return emptyWindow('unknown', [
      ...standing,
      watchRefusal(
        'WATCH_NEWS_SPINE_UNREADABLE',
        'The database could not say whether the news spine exists, so nothing is known about what regulators published.',
        sourceId,
      ),
    ]);
  }
  if (!exists) {
    return emptyWindow('unknown', [
      ...standing,
      watchRefusal(
        'WATCH_NEWS_SPINE_ABSENT',
        'Migration 0025 has not been applied on this environment, so there is no news spine to read.',
        sourceId,
      ),
    ]);
  }

  let result: SpineQueryResult;
  try {
    result = await querySpine(pool, REGULATOR_SPINE_SOURCES, null, windowFrom, opts?.limit ?? 50);
  } catch (err) {
    return emptyWindow('unknown', [
      ...standing,
      watchRefusal(
        'WATCH_NEWS_SPINE_UNREADABLE',
        `The news spine could not be read (${err instanceof Error ? err.message : 'query failure'}), so this window is unknown rather than quiet.`,
        sourceId,
      ),
    ]);
  }

  const verdict = classifySpineWindow({
    sourceId,
    rowCount: result.rows.length,
    spineMaxCreatedAt: result.spineMaxCreatedAt,
    sourceRowsEver: result.sourceRowsEver,
    livenessHours: opts?.livenessHours ?? 24,
    now,
  });

  return {
    window: watchWindow({
      sourceId,
      state: verdict.state,
      fetchedAt,
      windowFrom,
      windowTo: fetchedAt,
      countsAreLowerBound: true,
      refusals: verdict.refusal ? [...standing, verdict.refusal] : standing,
    }),
    items: result.rows,
    itemsObservedInWindow: result.rows.length,
    notWired: REGULATOR_FEEDS_NOT_WIRED,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * §8 COMPETITOR NARRATIVE — publishing activity, never performance
 *
 * Be brutally honest about what this sees. Zero of six competitor newsroom feeds
 * are fetchable, so this is not "what Kraken published" — it is "what the ~20
 * press feeds the spine polls happened to write about a name we registered,
 * matched as a substring of a headline". No share of voice. No sentiment. No
 * engagement. A competitor being absent means the press did not write about
 * them in a feed we poll, and nothing more.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface CompetitorTerm {
  name: string;
  aliases: readonly string[];
  /** Set when the name is also an ordinary word, so the desk sees why a match may be spurious. */
  ambiguityNote?: string;
}

export interface CompetitorNarrativeRow {
  name: string;
  /** A LOWER BOUND on headlines in this window that contained the name. Never a share. */
  mentionsObservedInWindow: number;
  /** Distinct spine sources that carried them, so a single outlet cannot look like consensus. */
  sourcesObserved: string[];
  latest: NewsSpineRow[];
  refusals: WatchRefusal[];
}

export interface CompetitorNarrativeReport {
  window: WatchWindow;
  usable: boolean;
  rows: CompetitorNarrativeRow[];
  refusals: WatchRefusal[];
}

/** Escape LIKE metacharacters so a name cannot become a wildcard. */
function likePattern(s: string): string {
  return `%${s.toLowerCase().replace(/([\\%_])/g, '\\$1')}%`;
}

export async function readCompetitorNarrative(
  pool: pg.Pool,
  competitors: readonly CompetitorTerm[],
  opts?: { sinceHours?: number; limit?: number; livenessHours?: number; now?: Date },
): Promise<CompetitorNarrativeReport> {
  const sourceId: WatchSourceId = 'news_spine_press';
  const now = opts?.now ?? new Date();
  const sinceHours = opts?.sinceHours ?? 168;
  const windowFrom = new Date(now.getTime() - sinceHours * 3_600_000).toISOString();
  const fetchedAt = now.toISOString();

  const standing: WatchRefusal[] = [
    watchRefusal(
      'WATCH_COMPETITOR_NEWSROOMS_UNFETCHABLE',
      'This is press coverage about these firms, not their own publishing: none of their newsroom feeds can be fetched.',
      sourceId,
    ),
    watchRefusal(
      'WATCH_COMPETITOR_PERFORMANCE_UNKNOWABLE',
      'No engagement, reach, follower or share-of-voice figure appears here, and none can be produced without an X credential.',
      sourceId,
    ),
    watchRefusal(
      'WATCH_FEED_ITEM_CAP',
      'At most 20 items per feed per poll reach this table, so every mention count below is a floor.',
      sourceId,
    ),
  ];

  const emptyReport = (state: FetchState, refusals: WatchRefusal[], usable: boolean): CompetitorNarrativeReport => ({
    window: watchWindow({
      sourceId,
      state,
      fetchedAt,
      windowFrom,
      windowTo: fetchedAt,
      countsAreLowerBound: true,
      refusals,
    }),
    usable,
    rows: [],
    refusals,
  });

  if (competitors.length === 0) {
    return emptyReport(
      'unknown',
      [
        ...standing,
        watchRefusal(
          'WATCH_COMPETITOR_REGISTER_EMPTY',
          'No competitors are registered, so this panel is empty because nothing was watched — not because nothing was published.',
          sourceId,
        ),
      ],
      false,
    );
  }

  const exists = await newsSpineExists(pool);
  if (exists === null || !exists) {
    return emptyReport(
      'unknown',
      [
        ...standing,
        watchRefusal(
          exists === null ? 'WATCH_NEWS_SPINE_UNREADABLE' : 'WATCH_NEWS_SPINE_ABSENT',
          exists === null
            ? 'The database could not say whether the news spine exists, so competitor coverage is unknown.'
            : 'Migration 0025 has not been applied on this environment, so there is no news spine to read competitor coverage from.',
          sourceId,
        ),
      ],
      false,
    );
  }

  const rows: CompetitorNarrativeRow[] = [];
  let anyUnknown = false;
  let lastVerdictRefusal: WatchRefusal | null = null;

  for (const c of competitors) {
    const needles = [c.name, ...c.aliases].filter((s) => s.trim().length >= 3);
    const perCompetitor: WatchRefusal[] = [];
    if (needles.length === 0) {
      rows.push({
        name: c.name,
        mentionsObservedInWindow: 0,
        sourcesObserved: [],
        latest: [],
        refusals: [
          watchRefusal(
            'WATCH_COMPETITOR_REGISTER_EMPTY',
            `"${c.name}" has no search term of three characters or more, so it was not searched for at all.`,
            c.name,
          ),
        ],
      });
      anyUnknown = true;
      continue;
    }
    if (c.ambiguityNote) {
      perCompetitor.push(
        watchRefusal(
          'WATCH_COMPETITOR_PERFORMANCE_UNKNOWABLE',
          `Matches for "${c.name}" are headline substring matches, not resolved entities: ${c.ambiguityNote}`,
          c.name,
        ),
      );
    }

    let result: SpineQueryResult;
    try {
      result = await querySpine(pool, null, needles.map(likePattern), windowFrom, opts?.limit ?? 25);
    } catch (err) {
      anyUnknown = true;
      lastVerdictRefusal = watchRefusal(
        'WATCH_NEWS_SPINE_UNREADABLE',
        `Coverage of "${c.name}" could not be read (${err instanceof Error ? err.message : 'query failure'}).`,
        c.name,
      );
      rows.push({
        name: c.name,
        mentionsObservedInWindow: 0,
        sourcesObserved: [],
        latest: [],
        refusals: [...perCompetitor, lastVerdictRefusal],
      });
      continue;
    }

    const verdict = classifySpineWindow({
      sourceId,
      rowCount: result.rows.length,
      spineMaxCreatedAt: result.spineMaxCreatedAt,
      sourceRowsEver: result.sourceRowsEver,
      livenessHours: opts?.livenessHours ?? 24,
      now,
    });
    if (verdict.state === 'unknown') {
      anyUnknown = true;
      if (verdict.refusal) {
        lastVerdictRefusal = verdict.refusal;
        perCompetitor.push(verdict.refusal);
      }
    }

    rows.push({
      name: c.name,
      mentionsObservedInWindow: result.rows.length,
      sourcesObserved: [...new Set(result.rows.map((r) => r.source))].sort(),
      latest: result.rows,
      refusals: perCompetitor,
    });
  }

  const reportRefusals = anyUnknown && lastVerdictRefusal ? [...standing, lastVerdictRefusal] : standing;
  return {
    window: watchWindow({
      sourceId,
      state: anyUnknown ? 'unknown' : rows.some((r) => r.mentionsObservedInWindow > 0) ? 'data' : 'no_data_confirmed',
      fetchedAt,
      windowFrom,
      windowTo: fetchedAt,
      countsAreLowerBound: true,
      refusals: reportRefusals,
    }),
    usable: true,
    rows,
    refusals: reportRefusals,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * §9 THE CLAIM EXPIRY LEDGER — a claim true in March is a liability in August
 *
 * FINRA 2210(b)(4)(A) records first AND last use: approved language is an
 * interval with a retirement event, not a fact that stays true. `Claim`
 * (packages/shared/src/claims/types.ts:15-24) carries no review date, so the
 * dates come from a register the desk keeps — and when that register is empty or
 * missing a claim, this ledger refuses instead of reporting "nothing is overdue".
 *
 * Pure. No I/O. Both registers are inputs.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ClaimReviewRecord {
  claimId: string;
  /** Which `Claim.version` was actually reviewed — a claim edited since is not reviewed. */
  claimVersionReviewed: number;
  reviewedAt: string;
  reviewDueAt: string;
  reviewedBy: string;
  /** What was checked, e.g. 'FMA register No. 288159 confirmed active'. */
  basis: string;
}

export interface LiveCopyArtefact {
  id: string;
  /** Where this copy is live — a bio, a pinned post, a landing page. The desk's own vocabulary. */
  surface: string;
  body: string;
  publishedAt: string | null;
  /** Claim ids the artefact declares it uses. Exact when present; absent for legacy copy. */
  claimIdsDeclared?: readonly string[];
}

export type ClaimExpiryBucket = 'unreviewed' | 'version_drift' | 'past_due' | 'due_soon' | 'current';

export interface LiveCopyDependency {
  artefactId: string;
  surface: string;
  /** `declared` is the artefact's own statement; `phrase_match` is derived from its text. */
  basis: 'declared' | 'phrase_match';
  evidence: string;
}

export interface ClaimExpiryRow {
  claimId: string;
  claimText: string;
  category: string;
  riskLevel: string;
  requiresHumanReview: boolean;
  claimVersion: number;
  bucket: ClaimExpiryBucket;
  reviewedAt: string | null;
  reviewDueAt: string | null;
  /** Negative when overdue. Null when there is no review record to count from. */
  daysUntilDue: number | null;
  /** True independently of `bucket`, so a version-drifted claim can also be overdue. */
  pastDue: boolean;
  versionDrift: boolean;
  /** Null means "cannot be determined", never "nothing depends on it". */
  dependentCopy: LiveCopyDependency[] | null;
  refusals: WatchRefusal[];
}

export interface ClaimExpiryLedger {
  /** False when the ledger cannot mean anything. A blank panel is not a clean bill of health. */
  usable: boolean;
  asOf: string;
  dueSoonDays: number;
  rows: ClaimExpiryRow[];
  /** Null while `usable` is false — there is nothing honest to count. */
  counts: Record<ClaimExpiryBucket, number> | null;
  /** How a claim→copy link was derived, stated once rather than implied. */
  dependencyMethodNote: string;
  refusals: WatchRefusal[];
}

const BUCKET_RANK: Record<ClaimExpiryBucket, number> = {
  unreviewed: 4,
  version_drift: 3,
  past_due: 2,
  due_soon: 1,
  current: 0,
};

const RISK_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

const DAY_MS = 86_400_000;

/** Lowercase, collapse whitespace — the comparison form for phrase matching. */
function normaliseCopy(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** The shortest phrase long enough to be evidence of reuse; null when none is. */
const MIN_DISTINCTIVE_CHARS = 24;
const MAX_PHRASE_CHARS = 120;

export function distinctivePhrase(claimText: string): string | null {
  const n = normaliseCopy(claimText);
  if (n.length < MIN_DISTINCTIVE_CHARS) return null;
  return n.slice(0, MAX_PHRASE_CHARS);
}

export function buildClaimExpiryLedger(input: {
  claims: readonly Claim[];
  reviews: readonly ClaimReviewRecord[];
  liveCopy: readonly LiveCopyArtefact[];
  asOf: Date;
  dueSoonDays?: number;
}): ClaimExpiryLedger {
  const asOf = input.asOf.toISOString();
  const dueSoonDays = input.dueSoonDays ?? 30;
  const dependencyMethodNote =
    'A dependency is either declared by the copy artefact or derived by matching the claim\'s opening phrase against the artefact text. A paraphrase of a claim will not be matched, so a non-empty list is a lower bound.';

  if (input.reviews.length === 0) {
    return {
      usable: false,
      asOf,
      dueSoonDays,
      rows: [],
      counts: null,
      dependencyMethodNote,
      refusals: [
        watchRefusal(
          'WATCH_CLAIM_REVIEW_REGISTER_EMPTY',
          `The claim review register is empty, so nothing can be said about which of the ${input.claims.length} claims are due for review. This panel is blank because no claim has ever been booked for review, not because the library is fresh.`,
        ),
      ],
    };
  }

  const reviewByClaim = new Map<string, ClaimReviewRecord>();
  for (const r of input.reviews) {
    const existing = reviewByClaim.get(r.claimId);
    // Latest review wins, so a re-review supersedes rather than duplicating.
    if (!existing || existing.reviewedAt < r.reviewedAt) reviewByClaim.set(r.claimId, r);
  }

  const copyEmpty = input.liveCopy.length === 0;
  const normalisedCopy = copyEmpty
    ? []
    : input.liveCopy.map((a) => ({ artefact: a, normalised: normaliseCopy(a.body) }));

  const ledgerRefusals: WatchRefusal[] = [];
  if (copyEmpty) {
    ledgerRefusals.push(
      watchRefusal(
        'WATCH_LIVE_COPY_REGISTER_EMPTY',
        'No live copy is registered, so which copy depends on an expiring claim cannot be answered. Every dependency below is null rather than empty.',
      ),
    );
  }

  const rows: ClaimExpiryRow[] = [];
  const unreviewedIds: string[] = [];

  for (const claim of input.claims) {
    const review = reviewByClaim.get(claim.id);
    const refusals: WatchRefusal[] = [];

    let bucket: ClaimExpiryBucket;
    let daysUntilDue: number | null = null;
    let pastDue = false;
    let versionDrift = false;

    if (!review) {
      unreviewedIds.push(claim.id);
      bucket = 'unreviewed';
      refusals.push(
        watchRefusal(
          'WATCH_CLAIM_REVIEW_INCOMPLETE',
          `Claim "${claim.id}" is active in the library but has no review record, so it is unreviewed — it is not being treated as current.`,
          claim.id,
        ),
      );
    } else {
      const dueMs = Date.parse(review.reviewDueAt);
      if (!Number.isFinite(dueMs)) {
        bucket = 'unreviewed';
        refusals.push(
          watchRefusal(
            'WATCH_CLAIM_REVIEW_INCOMPLETE',
            `Claim "${claim.id}" has a review record whose review-due date ("${review.reviewDueAt}") is not a date, so its expiry cannot be computed and it counts as unreviewed.`,
            claim.id,
          ),
        );
      } else {
        daysUntilDue = Math.floor((dueMs - input.asOf.getTime()) / DAY_MS);
        pastDue = dueMs <= input.asOf.getTime();
        versionDrift = review.claimVersionReviewed !== claim.version;
        if (versionDrift) {
          refusals.push(
            watchRefusal(
              'WATCH_CLAIM_REVIEW_INCOMPLETE',
              `Claim "${claim.id}" is at version ${claim.version} but was reviewed at version ${review.claimVersionReviewed}, so the wording in use has never been cleared.`,
              claim.id,
            ),
          );
        }
        bucket = versionDrift
          ? 'version_drift'
          : pastDue
            ? 'past_due'
            : daysUntilDue <= dueSoonDays
              ? 'due_soon'
              : 'current';
      }
    }

    // Which live copy depends on this claim.
    let dependentCopy: LiveCopyDependency[] | null;
    if (copyEmpty) {
      dependentCopy = null;
    } else {
      const declared = normalisedCopy
        .filter((c) => c.artefact.claimIdsDeclared?.includes(claim.id))
        .map<LiveCopyDependency>((c) => ({
          artefactId: c.artefact.id,
          surface: c.artefact.surface,
          basis: 'declared',
          evidence: `${c.artefact.id} declares claim ${claim.id}`,
        }));
      const phrase = distinctivePhrase(claim.text);
      if (phrase === null && declared.length === 0) {
        dependentCopy = null;
        refusals.push(
          watchRefusal(
            'WATCH_COPY_LINK_NOT_DERIVABLE',
            `Claim "${claim.id}" is too short to match against copy text (under ${MIN_DISTINCTIVE_CHARS} characters) and no artefact declares it, so which live copy depends on it is unknown.`,
            claim.id,
          ),
        );
      } else {
        const declaredIds = new Set(declared.map((d) => d.artefactId));
        const matched = phrase
          ? normalisedCopy
              .filter((c) => !declaredIds.has(c.artefact.id) && c.normalised.includes(phrase))
              .map<LiveCopyDependency>((c) => ({
                artefactId: c.artefact.id,
                surface: c.artefact.surface,
                basis: 'phrase_match',
                evidence: `${c.artefact.id} contains "${phrase.slice(0, 60)}${phrase.length > 60 ? '…' : ''}"`,
              }))
          : [];
        dependentCopy = [...declared, ...matched];
        if (phrase === null) {
          refusals.push(
            watchRefusal(
              'WATCH_COPY_LINK_NOT_DERIVABLE',
              `Claim "${claim.id}" is too short to match against copy text, so only artefacts that declare it are listed and undeclared copy could not be checked.`,
              claim.id,
            ),
          );
        }
      }
    }

    rows.push({
      claimId: claim.id,
      claimText: claim.text,
      category: claim.category,
      riskLevel: claim.riskLevel,
      requiresHumanReview: claim.requiresHumanReview,
      claimVersion: claim.version,
      bucket,
      reviewedAt: review?.reviewedAt ?? null,
      reviewDueAt: review?.reviewDueAt ?? null,
      daysUntilDue,
      pastDue,
      versionDrift,
      dependentCopy,
      refusals,
    });
  }

  if (unreviewedIds.length > 0) {
    ledgerRefusals.push(
      watchRefusal(
        'WATCH_CLAIM_REVIEW_INCOMPLETE',
        `${unreviewedIds.length} of ${input.claims.length} active claims have no usable review record (${unreviewedIds.slice(0, 5).join(', ')}${unreviewedIds.length > 5 ? ', …' : ''}), so this ledger does not cover the whole library.`,
      ),
    );
  }

  rows.sort((a, b) => {
    if (BUCKET_RANK[a.bucket] !== BUCKET_RANK[b.bucket]) return BUCKET_RANK[b.bucket] - BUCKET_RANK[a.bucket];
    const ar = RISK_RANK[a.riskLevel] ?? 0;
    const br = RISK_RANK[b.riskLevel] ?? 0;
    if (ar !== br) return br - ar;
    const ad = a.daysUntilDue ?? Number.POSITIVE_INFINITY;
    const bd = b.daysUntilDue ?? Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return a.claimId < b.claimId ? -1 : a.claimId > b.claimId ? 1 : 0;
  });

  const counts: Record<ClaimExpiryBucket, number> = {
    unreviewed: 0,
    version_drift: 0,
    past_due: 0,
    due_soon: 0,
    current: 0,
  };
  for (const r of rows) counts[r.bucket]++;

  return {
    usable: true,
    asOf,
    dueSoonDays,
    rows,
    counts,
    dependencyMethodNote,
    refusals: ledgerRefusals,
  };
}
