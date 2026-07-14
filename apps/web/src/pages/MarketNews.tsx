import { useCallback, useEffect, useMemo, useState } from 'react';
import { Newspaper, RefreshCw, ExternalLink, ChevronDown, ChevronRight, Sparkles, AlertTriangle } from 'lucide-react';
import { request } from '@/lib/apiClient';
import { PageTitle, Button } from '@/components/ui';
import { CardSkeleton, EmptyState } from '@/components/shared';
import { FilterChip } from '@/components/market/FilterChip';
import {
  applyNewsFilters,
  buildBriefing,
  distinctSources,
  relativeTime,
  sortByRelevance,
  type NewsFilter,
  type NewsItem,
} from '@/components/market/newsUtils';

const VISITED_KEY = 'lcx.marketNews.visited';
const VISITED_CAP = 300;

function loadVisited(): Set<string> {
  try {
    const raw = localStorage.getItem(VISITED_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

function persistVisited(ids: Set<string>): void {
  try {
    localStorage.setItem(VISITED_KEY, JSON.stringify([...ids].slice(-VISITED_CAP)));
  } catch {
    /* storage unavailable — visited state is cosmetic */
  }
}

export function MarketNews() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<NewsFilter>('all');
  const [source, setSource] = useState('');
  const [briefingOpen, setBriefingOpen] = useState(true);
  const [visited, setVisited] = useState<Set<string>>(loadVisited);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await request<{ data: NewsItem[] }>('/v1/analytics/news', { auth: true });
      setItems(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load news');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await request('/v1/analytics/news/refresh', { auth: true, method: 'POST', body: {} });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  const markVisited = (id: string) => {
    setVisited((prev) => {
      const next = new Set(prev);
      next.add(id);
      persistVisited(next);
      return next;
    });
  };

  const sources = useMemo(() => distinctSources(items), [items]);
  const briefing = useMemo(() => buildBriefing(items), [items]);
  const shown = useMemo(() => sortByRelevance(applyNewsFilters(items, filter, source)), [items, filter, source]);

  const counts = useMemo(
    () => ({
      all: items.length,
      high: items.filter((n) => n.relevanceScore > 0).length,
      ticker: items.filter((n) => n.tickers.length > 0).length,
    }),
    [items],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <PageTitle
        icon={<Newspaper size={20} />}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Fetching…' : 'Fetch latest'}
          </Button>
        }
        subtitle="Headlines from free crypto/regulatory feeds, relevance-scored against your pipeline tickers. Configure a free CryptoPanic token to widen the source set."
      >
        Market Intelligence
      </PageTitle>

      {/* Daily Briefing */}
      {!loading && !error && briefing.length > 0 && (
        <div className="rounded-lg border border-line bg-card">
          <button
            type="button"
            onClick={() => setBriefingOpen((v) => !v)}
            aria-expanded={briefingOpen}
            className="flex w-full items-center gap-2 p-3 text-left"
          >
            {briefingOpen ? <ChevronDown size={14} className="text-grey" /> : <ChevronRight size={14} className="text-grey" />}
            <Sparkles size={14} className="text-cyan-600 dark:text-cyan-400" />
            <span className="text-body font-bold text-navy">Daily Briefing</span>
            <span className="text-xs text-grey">Compiled from today's top headlines</span>
          </button>
          {briefingOpen && (
            <ul className="space-y-2 border-t border-line p-3 pl-5">
              {briefing.map((b) => (
                <li key={b.id} className="list-disc text-label marker:text-grey">
                  {b.url ? (
                    <a
                      href={b.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => markVisited(b.id)}
                      className="font-semibold text-navy hover:text-cyan-600 dark:hover:text-cyan-400 hover:underline"
                    >
                      {b.title}
                    </a>
                  ) : (
                    <span className="font-semibold text-navy">{b.title}</span>
                  )}
                  <span className="block text-label text-grey">{b.why}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* filters */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
            All ({counts.all})
          </FilterChip>
          <FilterChip
            active={filter === 'high'}
            onClick={() => setFilter('high')}
            title="Articles matching at least one pipeline project"
          >
            High relevance ({counts.high})
          </FilterChip>
          <FilterChip
            active={filter === 'ticker'}
            onClick={() => setFilter('ticker')}
            title="Articles mentioning at least one ticker"
          >
            Ticker match ({counts.ticker})
          </FilterChip>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            aria-label="Filter by source"
            className="ml-auto rounded border border-line bg-card px-2 py-1 text-label text-navy"
          >
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading && <CardSkeleton count={6} />}

      {error && (
        <div className="rounded-lg border border-line bg-card">
          <EmptyState
            icon={<AlertTriangle size={28} className="text-grey" />}
            title="Couldn't load news"
            description={error}
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            }
          />
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-lg border border-line bg-card">
          <EmptyState
            icon={<Newspaper size={28} className="text-grey" />}
            title="No news yet"
            description="Run a news refresh to pull the latest headlines from the free feeds and score them against your pipeline."
            action={
              <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={refreshing}>
                <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Run news refresh
              </Button>
            }
          />
        </div>
      )}

      {!loading && !error && items.length > 0 && shown.length === 0 && (
        <div className="rounded-lg border border-line bg-card">
          <EmptyState
            title="Nothing matches these filters"
            description="Try switching back to All or clearing the source filter."
          />
        </div>
      )}

      <div className="space-y-2">
        {shown.map((n) => {
          const seen = visited.has(n.id);
          return (
            <div key={n.id} className="rounded-lg border border-line bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <a
                  href={n.url ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => markVisited(n.id)}
                  className={`flex items-start gap-1 text-body font-semibold hover:text-cyan-600 dark:hover:text-cyan-400 hover:underline ${
                    seen ? 'text-grey' : 'text-navy'
                  }`}
                >
                  {n.title} {n.url && <ExternalLink size={11} className="mt-0.5 shrink-0" />}
                </a>
                {n.relevanceScore > 0 && (
                  <span className="shrink-0 rounded bg-cyan-50 px-1.5 py-0.5 text-[9px] font-bold text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
                    rel {n.relevanceScore}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-grey">
                <span className="rounded bg-ice-soft px-1.5 py-0.5 font-semibold uppercase dark:bg-ice-soft/10">
                  {n.source}
                </span>
                {n.publishedAt && <span title={new Date(n.publishedAt).toLocaleString()}>{relativeTime(n.publishedAt)}</span>}
                {seen && <span className="italic">visited</span>}
                {n.tickers.slice(0, 8).map((t) => (
                  <span key={t} className="rounded bg-ice-soft px-1.5 py-0.5 font-mono dark:bg-ice-soft/10">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
