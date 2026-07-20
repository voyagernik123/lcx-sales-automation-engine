/**
 * Market intelligence feed (Phase 6-5) — FREE, resilient, never throws.
 *
 * fetchNews() pulls headlines from free sources and returns a normalized list.
 * The ONLY hard requirement is resilience: any network/parse failure degrades
 * to [] so the job and route never error out.
 *
 * Sources (all free, best-effort — each wrapped in try/catch):
 *   1. ~20 crypto + regulatory RSS/Atom feeds (no key) — the backbone.
 *   2. Google-News topical queries (no key) — always-fresh, on-theme.
 *   3. CryptoCompare / CryptoPanic — optional wideners, gated behind their keys.
 *
 * refreshNews(pool) persists items into market_news and computes relevance by
 * matching each item's tickers against projects.ticker_norm. It ALSO runs a
 * targeted Google-News query per top tracked token (force-tagged to that
 * ticker) so coverage is deliberately pipeline-aware. For matched high-priority
 * projects it drops a 'news_mention' signal.
 */
import type pg from 'pg';

export interface NewsItem {
  source: string;
  title: string;
  url: string | null;
  publishedAt: string | null; // ISO
  tickers: string[]; // uppercased raw symbols from the source
  externalId: string | null;
}

const FETCH_TIMEOUT_MS = 8_000;

/** fetch with a hard timeout; resolves to null on any failure. */
async function safeJson(url: string, headers?: Record<string, string>): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'lcx-sales-bot', ...(headers ?? {}) },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Per-feed conditional-GET validators, so frequent polling costs a 304 (and
    near-zero bandwidth) whenever a feed hasn't changed — polite + cheap. */
const feedValidators = new Map<string, { etag?: string; lastModified?: string }>();

/**
 * Fetch raw RSS/Atom text: hard timeout, ONE retry on transient failure, and
 * conditional GET (If-None-Match / If-Modified-Since). Returns null when the
 * feed is unchanged (304), errors, or times out — never throws.
 */
async function safeText(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const v = feedValidators.get(url);
      const headers: Record<string, string> = {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        'User-Agent': 'LCXSalesBot/1.0 (+https://www.lcx.com; market-intel)',
      };
      if (v?.etag) headers['If-None-Match'] = v.etag;
      if (v?.lastModified) headers['If-Modified-Since'] = v.lastModified;
      const res = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' });
      if (res.status === 304) return null; // unchanged since last poll — nothing new
      if (!res.ok) return null;
      feedValidators.set(url, {
        etag: res.headers.get('etag') ?? undefined,
        lastModified: res.headers.get('last-modified') ?? undefined,
      });
      return await res.text();
    } catch {
      if (attempt === 1) return null; // give up after one retry
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function cleanTicker(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return t.length >= 2 && t.length <= 12 ? t : null;
}

/* ── CryptoPanic (free tier, token-gated) ── */
async function fetchCryptoPanic(token: string): Promise<NewsItem[]> {
  const url = `https://cryptopanic.com/api/free/v1/posts/?auth_token=${encodeURIComponent(token)}&public=true`;
  const json = (await safeJson(url)) as { results?: unknown[] } | null;
  if (!json || !Array.isArray(json.results)) return [];
  const items: NewsItem[] = [];
  for (const r of json.results) {
    const row = r as Record<string, unknown>;
    const title = typeof row.title === 'string' ? row.title : null;
    if (!title) continue;
    const currencies = Array.isArray(row.currencies) ? row.currencies : [];
    const tickers = currencies
      .map((c) => cleanTicker((c as Record<string, unknown>)?.code))
      .filter((t): t is string => t != null);
    items.push({
      source: 'cryptopanic',
      title,
      url: typeof row.url === 'string' ? row.url : null,
      publishedAt: typeof row.published_at === 'string' ? row.published_at : null,
      tickers: Array.from(new Set(tickers)),
      externalId: row.id != null ? String(row.id) : null,
    });
  }
  return items;
}

/* ── CryptoCompare news — optional widener (their news API now requires a key;
   free RSS below is the no-key backbone). Only called when a key is set. ── */
async function fetchCryptoCompare(apiKey: string): Promise<NewsItem[]> {
  const json = (await safeJson(`https://min-api.cryptocompare.com/data/v2/news/?lang=EN&api_key=${encodeURIComponent(apiKey)}`)) as { Data?: unknown[] } | null;
  if (!json || !Array.isArray(json.Data)) return [];
  const items: NewsItem[] = [];
  for (const r of json.Data) {
    const row = r as Record<string, unknown>;
    const title = typeof row.title === 'string' ? row.title.trim() : null;
    if (!title) continue;
    // `categories` is a pipe-delimited string e.g. "BTC|Regulation|Trading".
    const cats = typeof row.categories === 'string' ? row.categories.split('|') : [];
    const tickers = cats.map(cleanTicker).filter((t): t is string => t != null);
    items.push({
      source: 'cryptocompare',
      title,
      url: typeof row.url === 'string' ? row.url : null,
      publishedAt: row.published_on != null && Number.isFinite(Number(row.published_on))
        ? new Date(Number(row.published_on) * 1000).toISOString() : null,
      tickers: Array.from(new Set(tickers)),
      externalId: row.id != null ? `cc:${String(row.id)}` : null,
    });
  }
  return items;
}

/* ── Free RSS/Atom feeds (no key) — crypto + the regulatory angle LCX cares
   about. Hard-coded hosts (not user input), fetched best-effort; a feed that
   fails or moves simply contributes nothing. ── */
const gnews = (q: string): string =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

const RSS_FEEDS: { url: string; source: string }[] = [
  // ── Crypto news (free, no key) ──
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss', source: 'coindesk' },
  { url: 'https://cointelegraph.com/rss', source: 'cointelegraph' },
  { url: 'https://decrypt.co/feed', source: 'decrypt' },
  { url: 'https://www.theblock.co/rss.xml', source: 'theblock' },
  { url: 'https://bitcoinmagazine.com/.rss/full/', source: 'bitcoinmagazine' },
  { url: 'https://cryptoslate.com/feed/', source: 'cryptoslate' },
  { url: 'https://cryptopotato.com/feed/', source: 'cryptopotato' },
  { url: 'https://bitcoinist.com/feed/', source: 'bitcoinist' },
  { url: 'https://www.newsbtc.com/feed/', source: 'newsbtc' },
  { url: 'https://u.today/rss', source: 'utoday' },
  { url: 'https://ambcrypto.com/feed/', source: 'ambcrypto' },
  { url: 'https://coingape.com/feed/', source: 'coingape' },
  { url: 'https://cryptobriefing.com/feed/', source: 'cryptobriefing' },
  { url: 'https://thedefiant.io/feed', source: 'thedefiant' },
  // ── Regulatory — LCX's MiCA/compliance edge ──
  { url: 'https://www.sec.gov/news/pressreleases.rss', source: 'sec' },
  { url: 'https://www.sec.gov/rss/litigation/litreleases.xml', source: 'sec-litigation' },
  { url: 'https://www.esma.europa.eu/rss.xml', source: 'esma' },
  // ── Google News topical queries (free, no key) — always-fresh, on-theme ──
  { url: gnews('crypto exchange token listing'), source: 'gnews-listings' },
  { url: gnews('MiCA crypto regulation Europe'), source: 'gnews-mica' },
  { url: gnews('SEC crypto enforcement'), source: 'gnews-sec' },
  { url: gnews('crypto token launch fundraise'), source: 'gnews-launch' },
];

const stripTags = (s: string): string =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const decodeEntities = (s: string): string =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));

/** Cashtags ($BTC) and parenthesized tickers ((BTC)) only — conservative, so we
    don't match random ALL-CAPS words in a headline as tickers. */
function tickersFromTitle(title: string): string[] {
  const found = new Set<string>();
  // Reject pure prices like "$64", "$64k", "$1.5M" (→ "64", "64K", "15M") while
  // keeping real tickers such as 1INCH — drop anything that's just digits + an
  // optional magnitude suffix.
  const add = (raw: string) => { const t = cleanTicker(raw); if (t && !/^\d+[KMBT]?$/.test(t)) found.add(t); };
  for (const m of title.matchAll(/\$([A-Za-z0-9]{2,10})\b/g)) add(m[1]);
  for (const m of title.matchAll(/\(([A-Z0-9]{2,6})\)/g)) add(m[1]);
  return [...found];
}

export function parseRssItems(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  for (const block of blocks.slice(0, 20)) {
    const titleRaw = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
    const title = decodeEntities(stripTags(titleRaw)).slice(0, 400);
    if (!title) continue;
    let url = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]?.trim() ?? null; // RSS
    if (!url) url = block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ?? null; // Atom
    const dateRaw =
      block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] ??
      block.match(/<(?:published|updated|dc:date)[^>]*>([\s\S]*?)<\/(?:published|updated|dc:date)>/i)?.[1] ??
      null;
    let publishedAt: string | null = null;
    if (dateRaw) { const d = new Date(dateRaw.trim()); if (!Number.isNaN(d.getTime())) publishedAt = d.toISOString(); }
    items.push({ source, title, url: url ? decodeEntities(url) : null, publishedAt, tickers: tickersFromTitle(title), externalId: url ?? null });
  }
  return items;
}

/** Run async `fn` over `items` with bounded concurrency (kind to the sources
    and to the event loop when the feed list is large). Never rejects. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        out[idx] = await fn(items[idx]);
      } catch {
        out[idx] = [] as unknown as R;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function fetchRss(): Promise<NewsItem[]> {
  const perFeed = await mapLimit(RSS_FEEDS, 8, async (f) => {
    const xml = await safeText(f.url);
    if (!xml) return [];
    try {
      return parseRssItems(xml, f.source);
    } catch {
      return [];
    }
  });
  return perFeed.flat();
}

/** How many top-priority tracked tokens get their own targeted news query. */
const PIPELINE_NEWS_MAX = 12;

/**
 * Deliberate, pipeline-aware coverage: one targeted Google-News query per top
 * tracked token. Each returned headline is force-tagged with that token's
 * ticker — but ONLY when the headline actually names the token — so the feed
 * surfaces news about the tokens the desk is chasing (not just incidental
 * matches), while a generically-named project can't vacuum unrelated crypto
 * news into its signals. Best-effort and never throws (a failed query → []).
 */
async function fetchPipelineTickerNews(
  entries: { ticker: string; name: string }[],
): Promise<NewsItem[]> {
  const perToken = await mapLimit(entries, 6, async (e) => {
    const name = (e.name ?? '').trim();
    const q = name.length >= 3 ? name : e.ticker; // name is the strongest signal
    const xml = await safeText(gnews(`${q} crypto`));
    if (!xml) return [];
    let parsed: NewsItem[];
    try {
      parsed = parseRssItems(xml, 'gnews-pipeline');
    } catch {
      return [];
    }
    const needle = q.toLowerCase();
    for (const it of parsed) {
      if (it.title.toLowerCase().includes(needle)) {
        it.tickers = Array.from(new Set([...it.tickers, e.ticker]));
      }
    }
    return parsed;
  });
  return perToken.flat();
}

/** Normalize a headline for cross-source de-duplication (a syndicated story
    surfaced by several feeds collapses to one). */
function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 120);
}

// Short-TTL cache: rapid/overlapping refreshes (frequent polling, several open
// tabs) reuse the last pull instead of re-hitting every feed. Live-enough at 45s.
const NEWS_TTL_MS = 45_000;
let newsCache: NewsItem[] = [];
let newsCacheAt = 0;

/**
 * Pull headlines from all available free sources — resilient by contract (never
 * throws; a failing source just contributes nothing). RSS (crypto + regulatory
 * + Google-News topical) is the free, no-key backbone; CryptoCompare and
 * CryptoPanic are optional wideners gated behind their keys. De-duplicated by
 * normalized title (falling back to URL). Cached for NEWS_TTL_MS unless forced.
 */
export async function fetchNews(force = false): Promise<NewsItem[]> {
  if (!force && newsCache.length > 0 && Date.now() - newsCacheAt < NEWS_TTL_MS) {
    return newsCache;
  }
  const token = process.env.CRYPTOPANIC_TOKEN ?? '';
  const ccKey = process.env.CRYPTOCOMPARE_API_KEY ?? '';
  const sources: Promise<NewsItem[]>[] = [fetchRss().catch(() => [])];
  if (ccKey) sources.push(fetchCryptoCompare(ccKey).catch(() => []));
  if (token) sources.push(fetchCryptoPanic(token).catch(() => []));

  const all = (await Promise.all(sources)).flat();
  const seen = new Set<string>();
  const deduped: NewsItem[] = [];
  for (const item of all) {
    const key = item.title ? titleKey(item.title) : (item.url ?? '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  newsCache = deduped;
  newsCacheAt = Date.now();
  return deduped;
}

export interface RefreshNewsStats {
  fetched: number;
  inserted: number;
  matchedItems: number;
  signalsCreated: number;
}

/**
 * Persist fetched news, computing relevance against tracked projects.
 * relevance_score = number of tracked projects whose ticker_norm matches one of
 * the item's tickers. High-priority matches (band immediate|high) also get a
 * 'news_mention' signal. Fully resilient — returns zeroed stats on any failure.
 */
export async function refreshNews(pool: pg.Pool): Promise<RefreshNewsStats> {
  const stats: RefreshNewsStats = { fetched: 0, inserted: 0, matchedItems: 0, signalsCreated: 0 };

  let items: NewsItem[] = [];
  try {
    items = await fetchNews();
  } catch {
    return stats;
  }
  if (items.length === 0) return stats;

  // Build a ticker_norm → {projectId, priority band, name} lookup once.
  const tickerMap = new Map<string, { id: string; band: string; priority: number; name: string }>();
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.ticker_norm, s.band, s.priority_score
       FROM projects p
       LEFT JOIN scores s ON s.project_id = p.id
       WHERE p.ticker_norm IS NOT NULL AND p.ticker_norm <> ''`,
    );
    for (const r of rows) {
      const tn = String(r.ticker_norm).toUpperCase();
      // Prefer the highest-priority project for a given ticker.
      const existing = tickerMap.get(tn);
      const priority = Number(r.priority_score ?? 0);
      if (!existing || priority > existing.priority) {
        tickerMap.set(tn, { id: String(r.id), band: String(r.band ?? 'unscored'), priority, name: String(r.name ?? '') });
      }
    }
  } catch {
    /* no DB → treat everything as unmatched but still store the news */
  }

  // Pipeline-aware widening: pull targeted news for the top tracked tokens and
  // merge it in — enriching tickers on stories the general feeds already carry,
  // and adding coverage they missed. Best-effort; failure leaves `items` as-is.
  try {
    const top = [...tickerMap.entries()]
      .map(([ticker, v]) => ({ ticker, name: v.name, priority: v.priority }))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, PIPELINE_NEWS_MAX);
    if (top.length > 0) {
      const tagged = await fetchPipelineTickerNews(top);
      const byKey = new Map<string, NewsItem>();
      for (const it of items) byKey.set(titleKey(it.title), it);
      for (const it of tagged) {
        const k = titleKey(it.title);
        const existing = byKey.get(k);
        if (existing) {
          // Same story — graft the pipeline ticker onto the existing row.
          if (it.tickers.length) existing.tickers = Array.from(new Set([...existing.tickers, ...it.tickers]));
        } else {
          byKey.set(k, it);
          items.push(it);
        }
      }
    }
  } catch {
    /* pipeline widening is best-effort */
  }

  stats.fetched = items.length;

  for (const item of items) {
    const matched: string[] = [];
    const highPriority: string[] = [];
    for (const t of item.tickers) {
      const hit = tickerMap.get(t.toUpperCase());
      if (hit) {
        matched.push(hit.id);
        if (hit.band === 'immediate' || hit.band === 'high') highPriority.push(hit.id);
      }
    }
    if (matched.length > 0) stats.matchedItems++;

    try {
      const { rowCount } = await pool.query(
        `INSERT INTO market_news (source, title, url, published_at, tickers, relevance_score, matched_project_ids, external_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT DO NOTHING`,
        [
          item.source,
          item.title.slice(0, 500),
          item.url,
          item.publishedAt,
          item.tickers,
          matched.length,
          matched,
          item.externalId,
        ],
      );
      if ((rowCount ?? 0) > 0) {
        stats.inserted++;
        // Only emit signals for genuinely new rows (avoids re-signalling on re-runs).
        for (const projectId of highPriority) {
          try {
            await pool.query(
              `INSERT INTO signals (project_id, kind, payload)
               VALUES ($1, 'news_mention', $2::jsonb)`,
              [projectId, JSON.stringify({ source: item.source, title: item.title.slice(0, 240), url: item.url })],
            );
            stats.signalsCreated++;
          } catch {
            /* ignore per-signal failures */
          }
        }
      }
    } catch {
      /* ignore per-row insert failures — keep going */
    }
  }

  return stats;
}
