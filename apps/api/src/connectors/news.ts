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

/* ── CoinGecko status updates (public, no key) — primary free path ── */
async function fetchCoinGeckoStatus(): Promise<NewsItem[]> {
  const url = 'https://api.coingecko.com/api/v3/status_updates?per_page=50&page=1';
  const json = (await safeJson(url)) as { status_updates?: unknown[] } | null;
  if (!json || !Array.isArray(json.status_updates)) return [];
  const items: NewsItem[] = [];
  for (const r of json.status_updates) {
    const row = r as Record<string, unknown>;
    const desc = typeof row.description === 'string' ? row.description : null;
    const project = row.project as Record<string, unknown> | undefined;
    const projName = project && typeof project.name === 'string' ? project.name : '';
    const title = (desc ?? '').split('\n')[0].slice(0, 240) || projName;
    if (!title) continue;
    const symbol = project ? cleanTicker(project.symbol) : null;
    items.push({
      source: 'coingecko',
      title: projName ? `${projName}: ${title}` : title,
      url: null,
      publishedAt: typeof row.created_at === 'string' ? row.created_at : null,
      tickers: symbol ? [symbol] : [],
      externalId: null,
    });
  }
  return items;
}

/**
 * Pull headlines from all available free sources. NEVER throws — returns [] if
 * everything fails. Token for CryptoPanic is read straight from the env so this
 * works without touching lib/env.ts.
 */
export async function fetchNews(): Promise<NewsItem[]> {
  const out: NewsItem[] = [];
  const token = process.env.CRYPTOPANIC_TOKEN ?? '';

  if (token) {
    try {
      out.push(...(await fetchCryptoPanic(token)));
    } catch {
      /* ignore — resilient by contract */
    }
  }

  try {
    out.push(...(await fetchCoinGeckoStatus()));
  } catch {
    /* ignore */
  }

  return out;
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
