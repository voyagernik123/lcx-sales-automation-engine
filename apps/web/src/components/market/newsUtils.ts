/** Pure helpers for the Market News page — kept separate for unit testing. */

/** Shape returned by GET /v1/analytics/news (apps/api/src/routes/analytics2.ts). */
export interface NewsItem {
  id: string;
  source: string;
  title: string;
  url: string | null;
  tickers: string[];
  relevanceScore: number;
  matchedProjectIds: string[];
  publishedAt: string | null;
  createdAt: string;
}

export type NewsFilter = 'all' | 'high' | 'ticker';

function itemTs(n: NewsItem): number {
  const t = Date.parse(n.publishedAt ?? n.createdAt);
  return Number.isNaN(t) ? 0 : t;
}

/** Default ordering: relevance score desc, then most recent first. */
export function sortByRelevance(items: NewsItem[]): NewsItem[] {
  return [...items].sort((a, b) => b.relevanceScore - a.relevanceScore || itemTs(b) - itemTs(a));
}

/**
 * Chip + source filtering.
 * - 'high'   → relevanceScore > 0 (matched at least one pipeline project)
 * - 'ticker' → the article mentions at least one ticker symbol
 */
export function applyNewsFilters(items: NewsItem[], filter: NewsFilter, source: string): NewsItem[] {
  return items.filter(
    (n) =>
      (filter === 'high' ? n.relevanceScore > 0 : filter === 'ticker' ? n.tickers.length > 0 : true) &&
      (!source || n.source === source),
  );
}

/** Distinct sources present in the payload, alphabetical. */
export function distinctSources(items: NewsItem[]): string[] {
  return [...new Set(items.map((n) => n.source))].sort((a, b) => a.localeCompare(b));
}

/** Compact relative timestamp ("12m ago", "3h ago", "2d ago"). */
export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(t).toLocaleDateString();
}

export interface BriefingBullet {
  id: string;
  title: string;
  url: string | null;
  why: string;
}

/**
 * Deterministic client-side "Daily Briefing": the top stories by relevance
 * from the last 48h (falls back to the whole payload when the recent window
 * is too thin), each with a one-line "why it matters".
 */
export function buildBriefing(items: NewsItem[], now = Date.now(), top = 5): BriefingBullet[] {
  const windowMs = 48 * 3600 * 1000;
  const recent = items.filter((n) => now - itemTs(n) <= windowMs);
  const pool = recent.length >= 3 ? recent : items;
  return sortByRelevance(pool)
    .slice(0, top)
    .map((n) => {
      const matches = n.matchedProjectIds.length || n.relevanceScore;
      const tickers = n.tickers.slice(0, 4).join(', ');
      const why =
        n.relevanceScore > 0
          ? `Matches ${matches} pipeline project${matches === 1 ? '' : 's'}${tickers ? ` — ${tickers}` : ''}`
          : n.tickers.length > 0
            ? `Mentions ${tickers}${n.tickers.length > 4 ? '…' : ''}`
            : `Broad market headline via ${n.source}`;
      return { id: n.id, title: n.title, url: n.url, why };
    });
}
