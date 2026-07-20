/**
 * Market intelligence feed (Phase 6-5) — FREE, resilient, never throws.
 *
 * fetchNews() pulls headlines from free sources and returns a normalized list.
 * The ONLY hard requirement is resilience: any network/parse failure degrades
 * to [] so the job and route never error out.
 *
 * Sources (all free, best-effort, tried in order — each wrapped in try/catch):
 *   1. CryptoPanic free API   — only if CRYPTOPANIC_TOKEN is set in the env.
 *   2. CoinGecko status updates — public, no key, the primary free path.
 *
 * refreshNews(pool) persists items into market_news and computes relevance by
 * matching each item's tickers against projects.ticker_norm. For matched
 * high-priority projects it also drops a 'news_mention' signal.
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

/** fetch raw text (RSS/Atom XML) with a hard timeout; null on any failure. */
async function safeText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*', 'User-Agent': 'LCXSalesBot/1.0 (+https://www.lcx.com; market-intel)' },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
const RSS_FEEDS: { url: string; source: string }[] = [
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss', source: 'coindesk' },
  { url: 'https://cointelegraph.com/rss', source: 'cointelegraph' },
  { url: 'https://decrypt.co/feed', source: 'decrypt' },
  { url: 'https://www.theblock.co/rss.xml', source: 'theblock' },
  // Regulatory — LCX's MiCA/compliance edge:
  { url: 'https://www.sec.gov/news/pressreleases.rss', source: 'sec' },
  { url: 'https://www.esma.europa.eu/rss.xml', source: 'esma' },
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

async function fetchRss(): Promise<NewsItem[]> {
  const results = await Promise.all(
    RSS_FEEDS.map(async (f) => {
      const xml = await safeText(f.url);
      if (!xml) return [];
      try { return parseRssItems(xml, f.source); } catch { return []; }
    }),
  );
  return results.flat();
}

/**
 * Pull headlines from all available free sources — resilient by contract (never
 * throws; a failing source just contributes nothing). CryptoCompare + RSS need
 * no key; CryptoPanic is an optional widener when CRYPTOPANIC_TOKEN is set.
 * Results are de-duplicated by URL (falling back to title).
 */
export async function fetchNews(): Promise<NewsItem[]> {
  const token = process.env.CRYPTOPANIC_TOKEN ?? '';
  const ccKey = process.env.CRYPTOCOMPARE_API_KEY ?? '';
  // RSS is the free, no-key backbone; the two API sources are optional wideners.
  const sources: Promise<NewsItem[]>[] = [fetchRss().catch(() => [])];
  if (ccKey) sources.push(fetchCryptoCompare(ccKey).catch(() => []));
  if (token) sources.push(fetchCryptoPanic(token).catch(() => []));

  const all = (await Promise.all(sources)).flat();
  const seen = new Set<string>();
  const deduped: NewsItem[] = [];
  for (const item of all) {
    const key = (item.url ?? item.title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
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
  stats.fetched = items.length;
  if (items.length === 0) return stats;

  // Build a ticker_norm → {projectId, priority band} lookup once.
  const tickerMap = new Map<string, { id: string; band: string; priority: number }>();
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.ticker_norm, s.band, s.priority_score
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
        tickerMap.set(tn, { id: String(r.id), band: String(r.band ?? 'unscored'), priority });
      }
    }
  } catch {
    /* no DB → treat everything as unmatched but still store the news */
  }

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
