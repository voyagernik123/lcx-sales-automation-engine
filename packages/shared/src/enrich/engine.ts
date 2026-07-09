import { CoinGeckoClient, type CoinGeckoMarketData, type EnrichmentReport } from './coingecko.js';
import { matchProject, type MatchResult } from './matcher.js';

export interface EnrichableProject {
  id: string;
  name: string;
  ticker?: string;
  marketCap?: string;
  raw?: Record<string, unknown>;
}

export interface EnrichmentSignal {
  kind: 'enrichment' | 'price_movement';
  payload: Record<string, unknown>;
}

export interface EnrichmentOutput {
  projectId: string;
  coinId: string | null;
  matched: boolean;
  marketData: CoinGeckoMarketData | null;
  signals: EnrichmentSignal[];
  error?: string;
}

const MCAP_DELTA_PCT = 0.20;
const RANK_DELTA = 10;

function parseMcap(raw?: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function detectDeltas(
  previousMcap: number | null,
  previousRank: number | null,
  current: CoinGeckoMarketData,
): EnrichmentSignal[] {
  const signals: EnrichmentSignal[] = [];

  if (previousMcap !== null && current.marketCap !== null) {
    const delta = (current.marketCap - previousMcap) / previousMcap;
    if (Math.abs(delta) >= MCAP_DELTA_PCT) {
      signals.push({
        kind: 'price_movement',
        payload: {
          metric: 'market_cap',
          previous: previousMcap,
          current: current.marketCap,
          deltaPct: Math.round(delta * 10000) / 100,
          direction: delta > 0 ? 'up' : 'down',
        },
      });
    }
  }

  if (previousRank !== null && current.marketCapRank !== null) {
    const rankDelta = previousRank - current.marketCapRank;
    if (Math.abs(rankDelta) >= RANK_DELTA) {
      signals.push({
        kind: 'price_movement',
        payload: {
          metric: 'rank',
          previous: previousRank,
          current: current.marketCapRank,
          delta: rankDelta,
          direction: rankDelta > 0 ? 'up' : 'down',
        },
      });
    }
  }

  return signals;
}

export async function enrichProject(
  project: EnrichableProject,
  client: CoinGeckoClient,
): Promise<EnrichmentOutput> {
  try {
    const coins = await client.fetchCoinList();

    const match: MatchResult = matchProject(project.name, project.ticker, coins);
    if (!match.coinId) {
      return {
        projectId: project.id,
        coinId: null,
        matched: false,
        marketData: null,
        signals: [],
      };
    }

    const marketData = await client.fetchCoinData(match.coinId);

    const previousMcap = parseMcap(project.marketCap);
    const signals: EnrichmentSignal[] = [
      {
        kind: 'enrichment',
        payload: {
          coinId: match.coinId,
          matchMethod: match.method,
          marketCap: marketData.marketCap,
          marketCapRank: marketData.marketCapRank,
          totalVolume: marketData.totalVolume,
          currentPrice: marketData.currentPrice,
          priceChange24h: marketData.priceChange24h,
          priceChangePercent24h: marketData.priceChangePercent24h,
          categories: marketData.categories,
          homepage: marketData.homepage,
          twitter: marketData.twitter,
          platforms: marketData.platforms,
          fetchedAt: new Date().toISOString(),
        },
      },
    ];

    const deltas = detectDeltas(previousMcap, null, marketData);
    signals.push(...deltas);

    return {
      projectId: project.id,
      coinId: match.coinId,
      matched: true,
      marketData,
      signals,
    };
  } catch (err) {
    return {
      projectId: project.id,
      coinId: null,
      matched: false,
      marketData: null,
      signals: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function enrichBatch(
  projects: EnrichableProject[],
  client: CoinGeckoClient,
  onProgress?: (done: number, total: number, result: EnrichmentOutput) => void,
): Promise<{
  results: EnrichmentOutput[];
  report: EnrichmentReport;
}> {
  await client.fetchCoinList();

  let matched = 0;
  let failed = 0;
  let skipped = 0;
  const results: EnrichmentOutput[] = [];

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];

    if (!p.ticker && p.name.length < 3) {
      skipped++;
      if (onProgress) onProgress(i + 1, projects.length, {
        projectId: p.id, coinId: null, matched: false, marketData: null, signals: [],
      });
      continue;
    }

    const result = await enrichProject(p, client);
    results.push(result);

    if (result.matched) matched++;
    if (result.error) failed++;

    if (onProgress) onProgress(i + 1, projects.length, result);

    // Small delay between individual fetches to be kind to rate limits
    if (i < projects.length - 1) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  const rate = projects.length > 0 ? Math.round((matched / projects.length) * 100) : 0;

  return {
    results,
    report: {
      attempted: projects.length,
      matched,
      failed,
      skipped,
      matchRate: `${rate}%`,
    },
  };
}

export function formatEnrichmentReport(report: EnrichmentReport): string {
  return [
    `  Attempted: ${report.attempted}`,
    `  Matched:   ${report.matched} (${report.matchRate})`,
    `  Failed:    ${report.failed}`,
    `  Skipped:   ${report.skipped}`,
  ].join('\n');
}
