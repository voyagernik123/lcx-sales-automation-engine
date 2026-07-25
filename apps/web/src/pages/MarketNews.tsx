import { useCallback, useEffect, useMemo, useState } from 'react';
import { Newspaper, RefreshCw, ExternalLink, ChevronDown, ChevronRight, Sparkles, AlertTriangle, ListPlus, Check } from 'lucide-react';
import { request } from '@/lib/apiClient';
import { safeHref } from '@/lib/safeHref';
import { createTask } from '@/lib/api/bd';
import { toast } from '@/components/shared/Toast';
import { PageTitle, Button } from '@/components/ui';
import { CardSkeleton, EmptyState } from '@/components/shared';
import { EntityChip } from '@/components/entity';
import { FilterChip } from '@/components/market/FilterChip';
import { GradeBadge } from '@/components/intel/GradeBadge';
import { newsReliability } from '@lcx/shared';
import { useInspect } from '@/stores';
import {
  applyNewsFilters,
  buildBriefing,
  distinctSources,
  relativeTime,
  sortByRelevance,
  type NewsFilter,
  type NewsItem,
} from '@/components/market/newsUtils';
import { storage } from '@/lib/persistence';

// Scoped: an unprefixed key leaked one operator's read-state to the next and
// survived sign-out, which only sweeps the `lcx-os:` prefix.
const VISITED_KEY = 'marketNews.visited';
const VISITED_CAP = 300;

function loadVisited(): Set<string> {
  try {
    const raw = storage.get<string | null>(VISITED_KEY, null);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

function persistVisited(ids: Set<string>): void {
  try {
    storage.set(VISITED_KEY, JSON.stringify([...ids].slice(-VISITED_CAP)));
  } catch {
    /* storage unavailable — visited state is cosmetic */
  }
}

export function MarketNews() {
  const inspect = useInspect();
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<NewsFilter>('all');
  const [source, setSource] = useState('');
  const [briefingOpen, setBriefingOpen] = useState(true);
  const [visited, setVisited] = useState<Set<string>>(loadVisited);
  const [queued, setQueued] = useState<Set<string>>(new Set());
  const [queueBusy, setQueueBusy] = useState('');
  const [live, setLive] = useState(true);

  // `silent` re-reads the store without flashing the skeleton (used by the live poll).
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      // Two slices, merged: the freshest headlines for the "All" stream, PLUS
      // every pipeline-relevant headline regardless of age. The high-frequency
      // general feeds otherwise crowd the pipeline-tagged matches out of the
      // freshest window, starving the relevance/ticker filters of the very
      // signals this page exists to surface.
      const [fresh, relevant] = await Promise.all([
        request<{ data: NewsItem[] }>('/v1/analytics/news?limit=150', { auth: true }),
        request<{ data: NewsItem[] }>('/v1/analytics/news?limit=500&minRelevance=1', { auth: true }).catch(
          () => ({ data: [] as NewsItem[] }),
        ),
      ]);
      const byId = new Map<string, NewsItem>();
      for (const n of fresh.data) byId.set(n.id, n);
      for (const n of relevant.data) if (!byId.has(n.id)) byId.set(n.id, n);
      setItems([...byId.values()]);
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Failed to load news');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live updates while the page is open and `live` is on: re-read the store
  // every 15s (cheap, our own API) and trigger a server-side feed pull roughly
  // every 90s (throttled server-side so it never hammers the sources). Paused
  // when the tab is hidden to stay polite.
  useEffect(() => {
    if (!live) return;
    let ticks = 0;
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      ticks += 1;
      if (ticks % 6 === 0) {
        void request('/v1/analytics/news/refresh', { auth: true, method: 'POST', body: {} })
          .then(() => load(true))
          .catch(() => { /* resilient — ignore transient poll errors */ });
      } else {
        void load(true);
      }
    }, 15_000);
    return () => clearInterval(id);
  }, [live, load]);

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

  /** "Queue it" — spin the matched article into a follow-up task on the project. */
  const queueIt = async (n: NewsItem) => {
    const projectId = n.matchedProjectIds[0];
    if (!projectId) return;
    setQueueBusy(n.id);
    try {
      await createTask(`Follow up on news: ${n.title}`, {
        projectId,
        detail: n.url ?? `via ${n.source}`,
      });
      setQueued((prev) => new Set(prev).add(n.id));
      toast('success', 'Follow-up task queued');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to queue task');
    } finally {
      setQueueBusy('');
    }
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLive((l) => !l)}
              title={live ? 'Live auto-refresh on — click to pause' : 'Auto-refresh paused — click to resume'}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-micro font-semibold transition-colors ${live ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-line text-grey hover:text-navy'}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${live ? 'animate-pulse bg-emerald-500' : 'bg-grey/50'}`} />
              {live ? 'Live' : 'Paused'}
            </button>
            <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={refreshing}>
              <RefreshCw size={12} className={refreshing ? 'animate-spin motion-essential' : ''} /> {refreshing ? 'Fetching…' : 'Fetch latest'}
            </Button>
          </div>
        }
        subtitle="Live headlines from 20+ free crypto & regulatory feeds — SEC, ESMA, Google News and the major crypto media — relevance-scored against your pipeline. Auto-refreshes while open."
      >
        Market Intelligence
      </PageTitle>

      {/* Daily Briefing */}
      {!loading && !error && briefing.length > 0 && (
        <div className="rounded-lg border border-line/70 bg-card shadow-card">
          <button
            type="button"
            onClick={() => setBriefingOpen((v) => !v)}
            aria-expanded={briefingOpen}
            className="flex w-full items-center gap-2 rounded-lg p-3 text-left transition-colors hover:bg-ice-soft/50 dark:hover:bg-ice-soft/10"
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
                  <EntityChip
                    type="signal"
                    id={b.id}
                    name={b.title}
                    seed={{ title: b.title, kind: 'news', detail: b.why, url: b.url ?? undefined }}
                    className="font-semibold"
                  />
                  {b.url && (
                    <a
                      href={safeHref(b.url)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => markVisited(b.id)}
                      className="ml-1 inline-flex align-middle text-grey hover:text-cyan-600 dark:hover:text-cyan-400"
                      title="Open article"
                      aria-label="Open article"
                    >
                      <ExternalLink size={11} />
                    </a>
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
            className="ml-auto rounded border border-line bg-card px-2 py-1 text-label text-navy outline-none focus:border-cyan-500 transition-colors"
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
                <RefreshCw size={12} className={refreshing ? 'animate-spin motion-essential' : ''} /> Run news refresh
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

      <div className="space-y-3">
        {shown.map((n) => {
          const seen = visited.has(n.id);
          return (
            <div key={n.id} className="rounded-lg border border-line/70 bg-card shadow-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-1">
                  <EntityChip
                    type="signal"
                    id={n.id}
                    name={n.title}
                    seed={{
                      title: n.title,
                      kind: 'news',
                      detail: `via ${n.source}`,
                      projectId: n.matchedProjectIds[0],
                      ts: n.publishedAt ?? n.createdAt,
                      url: n.url ?? undefined,
                    }}
                    className={`text-body font-semibold ${seen ? '!text-grey' : ''}`}
                  />
                  {n.url && (
                    <a
                      href={safeHref(n.url)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => markVisited(n.id)}
                      className="mt-0.5 shrink-0 text-grey hover:text-cyan-600 dark:hover:text-cyan-400"
                      title="Open article"
                      aria-label="Open article"
                    >
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
                {n.relevanceScore > 0 && (
                  <span className="shrink-0 rounded bg-cyan-50 px-1.5 py-0.5 text-micro font-bold num-tabular text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
                    rel {n.relevanceScore}
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-grey">
                <span className="rounded bg-ice-soft px-1.5 py-0.5 font-medium dark:bg-ice-soft/10">
                  {n.source}
                </span>
                <GradeBadge reliability={newsReliability(n.source)} />
                {n.publishedAt && <span title={new Date(n.publishedAt).toLocaleString()}>{relativeTime(n.publishedAt)}</span>}
                {seen && <span className="italic">visited</span>}
                {n.tickers.slice(0, 8).map((t) =>
                  n.matchedProjectIds.length > 0 ? (
                    <button
                      key={t}
                      onClick={() => inspect('project', n.matchedProjectIds[0])}
                      className="rounded bg-cyan-50 px-1.5 py-0.5 font-mono font-semibold text-cyan-700 hover:bg-cyan-100 dark:bg-cyan-950/40 dark:text-cyan-300 dark:hover:bg-cyan-950/60 transition-colors"
                      title="Inspect matched pipeline project"
                    >
                      {t}
                    </button>
                  ) : (
                    <span key={t} className="rounded bg-ice-soft px-1.5 py-0.5 font-mono dark:bg-ice-soft/10">
                      {t}
                    </span>
                  ),
                )}
                {n.matchedProjectIds.length > 0 && (
                  <button
                    onClick={() => void queueIt(n)}
                    disabled={queued.has(n.id) || queueBusy === n.id}
                    className="ml-auto inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-micro font-bold text-navy hover:border-cyan-400 hover:bg-ice-soft/50 disabled:opacity-60 dark:hover:bg-ice-soft/10 transition-colors"
                    title="Create a follow-up task on the matched project"
                  >
                    {queued.has(n.id) ? <Check size={10} className="text-emerald-600" /> : <ListPlus size={10} />}
                    {queued.has(n.id) ? 'Queued' : queueBusy === n.id ? 'Queuing…' : 'Queue it'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
