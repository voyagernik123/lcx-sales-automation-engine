import { describe, expect, it } from 'vitest';
import {
  applyNewsFilters,
  buildBriefing,
  distinctSources,
  relativeTime,
  sortByRelevance,
  type NewsItem,
} from '../newsUtils';

const NOW = Date.parse('2026-07-13T12:00:00Z');

function item(overrides: Partial<NewsItem> & { id: string }): NewsItem {
  return {
    source: 'coindesk',
    title: `Story ${overrides.id}`,
    url: 'https://example.com',
    tickers: [],
    relevanceScore: 0,
    matchedProjectIds: [],
    publishedAt: '2026-07-13T10:00:00Z',
    createdAt: '2026-07-13T10:00:00Z',
    ...overrides,
  };
}

describe('sortByRelevance', () => {
  it('orders by relevance desc, then most recent first', () => {
    const items = [
      item({ id: 'a', relevanceScore: 0, publishedAt: '2026-07-13T11:00:00Z' }),
      item({ id: 'b', relevanceScore: 3 }),
      item({ id: 'c', relevanceScore: 0, publishedAt: '2026-07-13T09:00:00Z' }),
      item({ id: 'd', relevanceScore: 1 }),
    ];
    expect(sortByRelevance(items).map((n) => n.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('does not mutate the input array', () => {
    const items = [item({ id: 'a' }), item({ id: 'b', relevanceScore: 5 })];
    sortByRelevance(items);
    expect(items[0].id).toBe('a');
  });
});

describe('applyNewsFilters', () => {
  const items = [
    item({ id: 'a', relevanceScore: 2, tickers: ['BTC'] }),
    item({ id: 'b', tickers: ['ETH'] }),
    item({ id: 'c', source: 'cryptopanic' }),
  ];

  it('high keeps only pipeline-matched items', () => {
    expect(applyNewsFilters(items, 'high', '').map((n) => n.id)).toEqual(['a']);
  });

  it('ticker keeps items with any ticker', () => {
    expect(applyNewsFilters(items, 'ticker', '').map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('source filter composes with chip filter', () => {
    expect(applyNewsFilters(items, 'all', 'cryptopanic').map((n) => n.id)).toEqual(['c']);
    expect(applyNewsFilters(items, 'ticker', 'cryptopanic')).toEqual([]);
  });
});

describe('distinctSources', () => {
  it('returns unique sources alphabetically', () => {
    const items = [item({ id: 'a', source: 'zeta' }), item({ id: 'b' }), item({ id: 'c', source: 'zeta' })];
    expect(distinctSources(items)).toEqual(['coindesk', 'zeta']);
  });
});

describe('relativeTime', () => {
  it('formats minutes, hours and days', () => {
    expect(relativeTime('2026-07-13T11:48:00Z', NOW)).toBe('12m ago');
    expect(relativeTime('2026-07-13T09:00:00Z', NOW)).toBe('3h ago');
    expect(relativeTime('2026-07-11T12:00:00Z', NOW)).toBe('2d ago');
  });

  it('handles nullish and invalid input', () => {
    expect(relativeTime(null, NOW)).toBe('');
    expect(relativeTime('not-a-date', NOW)).toBe('');
  });
});

describe('buildBriefing', () => {
  it('returns top stories by relevance with a why line', () => {
    const items = [
      item({ id: 'a', relevanceScore: 2, matchedProjectIds: ['p1', 'p2'], tickers: ['AAA', 'BBB'] }),
      item({ id: 'b', tickers: ['ETH'] }),
      item({ id: 'c' }),
    ];
    const bullets = buildBriefing(items, NOW);
    expect(bullets.map((b) => b.id)).toEqual(['a', 'b', 'c']);
    expect(bullets[0].why).toBe('Matches 2 pipeline projects — AAA, BBB');
    expect(bullets[1].why).toBe('Mentions ETH');
    expect(bullets[2].why).toBe('Broad market headline via coindesk');
  });

  it('caps at five bullets and prefers the recent window', () => {
    const stale = Array.from({ length: 3 }, (_, i) =>
      item({ id: `old${i}`, relevanceScore: 9, publishedAt: '2026-06-01T00:00:00Z' }),
    );
    const fresh = Array.from({ length: 6 }, (_, i) => item({ id: `new${i}`, relevanceScore: i }));
    const bullets = buildBriefing([...stale, ...fresh], NOW);
    expect(bullets).toHaveLength(5);
    expect(bullets.every((b) => b.id.startsWith('new'))).toBe(true);
    expect(bullets[0].id).toBe('new5');
  });
});
