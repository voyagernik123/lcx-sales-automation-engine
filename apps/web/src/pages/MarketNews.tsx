import { useCallback, useEffect, useState } from 'react';
import { Newspaper, RefreshCw, ExternalLink } from 'lucide-react';
import { request } from '@/lib/apiClient';

interface NewsItem {
  id: string;
  source: string;
  title: string;
  url: string | null;
  tickers: string[];
  relevanceScore: number;
  publishedAt: string | null;
  createdAt: string;
}

export function MarketNews() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

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

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <Newspaper size={18} /> Market Intelligence
        </h1>
        <button
          onClick={() => void refresh()}
          disabled={refreshing}
          className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] font-semibold hover:bg-ice-soft dark:hover:bg-ice-soft/10 disabled:opacity-50"
        >
          <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Fetching…' : 'Fetch latest'}
        </button>
      </div>
      <p className="text-[11px] text-grey">
        Headlines from free crypto/regulatory feeds, relevance-scored against your pipeline tickers. Configure a
        free CryptoPanic token to widen the source set.
      </p>

      {loading && <p className="py-8 text-center text-[12px] text-grey">Loading…</p>}
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{error}</div>}
      {!loading && !error && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-line p-8 text-center text-[12px] text-grey">
          No news yet — click “Fetch latest” (or run the <code>news_refresh</code> job).
        </div>
      )}

      <div className="space-y-2">
        {items.map((n) => (
          <div key={n.id} className="rounded border border-line bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <a
                href={n.url ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="text-[13px] font-semibold hover:text-cyan-600 hover:underline flex items-start gap-1"
              >
                {n.title} {n.url && <ExternalLink size={11} className="mt-0.5 shrink-0" />}
              </a>
              {n.relevanceScore > 0 && (
                <span className="shrink-0 rounded bg-cyan-50 dark:bg-cyan-950/40 px-1.5 py-0.5 text-[9px] font-bold text-cyan-700 dark:text-cyan-300">
                  rel {n.relevanceScore}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-grey">
              <span className="font-semibold uppercase">{n.source}</span>
              {n.publishedAt && <span>{new Date(n.publishedAt).toLocaleString()}</span>}
              {n.tickers.slice(0, 8).map((t) => (
                <span key={t} className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono">{t}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
