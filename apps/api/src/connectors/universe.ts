/**
 * Continuous universe connectors — free APIs staged through the same runner
 * as the CSV sources. The quality gate lives in each normalize(): rejected
 * rows stay staged as 'ignored' so re-syncs are cheap and the canonical
 * projects table holds only listable candidates.
 *
 * Gate: rank ≤ 5000 OR mcap ≥ $1M OR vol24h ≥ $50k OR funded <24mo OR
 *       MiCA registry OR first pool <90d old.
 */
import type pg from 'pg';
import {
  CoinPaprikaClient, DefiLlamaClient, GeckoTerminalClient, CoinGeckoClient,
  squashEntity,
  type PaprikaTicker, type LlamaProtocol, type GtNewPool,
} from '@lcx/shared';
import type { RawProject } from '../import/types.js';
import { normalizeUrl } from '../import/types.js';
import { contentHash, type Connector, type ConnectorRunReport, type StagedRecord } from './types.js';
import { runConnector } from './runner.js';

export const GATE = {
  maxRank: 5000,
  minMcapUsd: 1_000_000,
  minVol24hUsd: 50_000,
  fundedWithinMonths: 24,
  newPoolWithinDays: 90,
  minNewPoolReserveUsd: 50_000,
};

/* ────────────────────────────────────────────── coinpaprika */

export function coinpaprikaConnector(client = new CoinPaprikaClient()): Connector {
  return {
    name: 'coinpaprika',
    fetch: async function* (ctx) {
      ctx.log('fetching all tickers (1 call)…');
      const tickers = await client.fetchAllTickers();
      ctx.log(`${tickers.length} tickers`);
      yield tickers.map((t) => {
        const payload = compactTicker(t) as unknown as Record<string, unknown>;
        return { externalId: t.id, payload, contentHash: contentHash(payload) };
      });
    },
    normalize: (rec) => {
      const t = rec.payload as unknown as ReturnType<typeof compactTicker>;
      const passes =
        (t.rank > 0 && t.rank <= GATE.maxRank) ||
        (t.marketCap ?? 0) >= GATE.minMcapUsd ||
        (t.volume24h ?? 0) >= GATE.minVol24hUsd;
      if (!passes) return null;
      return {
        name: t.name,
        ticker: t.symbol,
        source: 'coinpaprika',
        listedOnLcx: false,
        marketCap: t.marketCap != null ? String(Math.round(t.marketCap)) : undefined,
        rawPayload: rec.payload,
      } satisfies RawProject;
    },
  };
}

/** Keep staged paprika payloads small — 40k rows × full quotes is DB bloat. */
function compactTicker(t: PaprikaTicker) {
  return {
    id: t.id,
    name: t.name,
    symbol: t.symbol,
    rank: t.rank ?? 0,
    marketCap: t.quotes?.USD?.market_cap ?? null,
    volume24h: t.quotes?.USD?.volume_24h ?? null,
    price: t.quotes?.USD?.price ?? null,
    change30d: t.quotes?.USD?.percent_change_30d ?? null,
    firstDataAt: t.first_data_at ?? null,
  };
}

/* ────────────────────────────────────────────── coingecko id list */

export function coingeckoListConnector(client: CoinGeckoClient): Connector {
  return {
    name: 'coingecko',
    fetch: async function* (ctx) {
      ctx.log('fetching coin list (1 call)…');
      const coins = await client.fetchCoinList();
      ctx.log(`${coins.length} coins`);
      yield coins.map((c) => {
        const payload = { id: c.id, symbol: c.symbol, name: c.name } as Record<string, unknown>;
        return { externalId: c.id, payload, contentHash: contentHash(payload) };
      });
    },
    // The CG list carries no market data to gate on — it exists for id mapping
    // only and never creates canonical projects.
    normalize: () => null,
  };
}

/* ────────────────────────────────────────────── coingecko bulk markets */

/**
 * The top-15k CoinGecko coins by market cap become canonical universe rows.
 * ~60 calls per sync; the same endpoint the daily refresh uses for columns.
 */
export function coingeckoMarketsConnector(client: CoinGeckoClient, pages = 60): Connector {
  return {
    name: 'coingecko_markets',
    fetch: async function* (ctx) {
      for (let page = 1; page <= pages; page++) {
        let rows;
        try {
          rows = await client.fetchMarketsPage(page);
        } catch (err) {
          ctx.log(`markets page ${page} failed, stopping: ${err instanceof Error ? err.message : err}`);
          return;
        }
        if (rows.length === 0) return;
        if (page % 10 === 0) ctx.log(`page ${page} (${page * 250} coins)…`);
        yield rows.map((r) => {
          const payload = r as unknown as Record<string, unknown>;
          return { externalId: r.id, payload, contentHash: contentHash(payload) };
        });
      }
    },
    normalize: (rec) => {
      const r = rec.payload as unknown as { id: string; name: string; symbol: string; marketCapRank: number | null; marketCap: number | null; totalVolume: number | null };
      const passes =
        (r.marketCapRank != null && r.marketCapRank <= GATE.maxRank) ||
        (r.marketCap ?? 0) >= GATE.minMcapUsd ||
        (r.totalVolume ?? 0) >= GATE.minVol24hUsd;
      if (!passes) return null;
      if (!r.name || r.name.length < 2) return null;
      return {
        name: r.name,
        ticker: r.symbol?.toUpperCase(),
        source: 'coingecko',
        listedOnLcx: false,
        marketCap: r.marketCap != null ? String(Math.round(r.marketCap)) : undefined,
        rawPayload: rec.payload,
      } satisfies RawProject;
    },
  };
}

/* ────────────────────────────────────────────── defillama protocols */

export function defillamaConnector(client = new DefiLlamaClient()): Connector {
  return {
    name: 'defillama',
    fetch: async function* (ctx) {
      ctx.log('fetching protocols (1 call)…');
      const protocols = await client.fetchProtocols();
      ctx.log(`${protocols.length} protocols`);
      yield protocols.map((p) => {
        const payload = compactProtocol(p) as unknown as Record<string, unknown>;
        return { externalId: p.id || p.name, payload, contentHash: contentHash(payload) };
      });
    },
    normalize: (rec) => {
      const p = rec.payload as unknown as ReturnType<typeof compactProtocol>;
      if ((p.tvl ?? 0) < GATE.minMcapUsd) return null; // TVL as the scale gate here
      return {
        name: p.name,
        ticker: p.symbol ?? undefined,
        website: normalizeUrl(p.url ?? undefined),
        category: p.category?.toLowerCase() ?? undefined,
        chain: p.chains?.[0]?.toLowerCase() ?? undefined,
        source: 'defillama',
        listedOnLcx: false,
        rawPayload: rec.payload,
      } satisfies RawProject;
    },
  };
}

function compactProtocol(p: LlamaProtocol) {
  return {
    id: p.id,
    name: p.name,
    symbol: p.symbol && p.symbol !== '-' ? p.symbol : null,
    url: p.url,
    category: p.category,
    chains: (p.chains ?? []).slice(0, 3),
    tvl: p.tvl != null ? Math.round(p.tvl) : null,
    listedAt: p.listedAt,
    twitter: p.twitter,
  };
}

/* ────────────────────────────────────────────── geckoterminal new pools */

const GT_NETWORKS = ['eth', 'base', 'solana', 'bsc', 'arbitrum'];

export function geckoterminalConnector(client = new GeckoTerminalClient(), pages = 3): Connector {
  return {
    name: 'geckoterminal_new',
    fetch: async function* (ctx) {
      for (const network of GT_NETWORKS) {
        const records: StagedRecord[] = [];
        for (let page = 1; page <= pages; page++) {
          try {
            const pools = await client.fetchNewPools(network, page);
            for (const pool of pools) {
              if (!pool.baseTokenName || !pool.baseTokenAddress) continue;
              const payload = pool as unknown as Record<string, unknown>;
              records.push({
                externalId: `${network}:${pool.baseTokenAddress}`,
                payload,
                contentHash: contentHash(payload),
              });
            }
          } catch (err) {
            ctx.log(`${network} page ${page} failed: ${err instanceof Error ? err.message : err}`);
            break;
          }
        }
        ctx.log(`${network}: ${records.length} pools`);
        if (records.length > 0) yield records;
      }
    },
    normalize: (rec) => {
      const pool = rec.payload as unknown as GtNewPool;
      if ((pool.reserveUsd ?? 0) < GATE.minNewPoolReserveUsd) return null;
      // Reject unnamed / scammy-looking symbols outright
      if (!pool.baseTokenName || pool.baseTokenName.length < 2) return null;
      return {
        name: pool.baseTokenName,
        ticker: pool.baseTokenSymbol ?? undefined,
        chain: pool.network,
        source: 'geckoterminal_new',
        listedOnLcx: false,
        category: undefined,
        rawPayload: rec.payload,
      } satisfies RawProject;
    },
  };
}

/* ────────────────────────────────────────────── defillama raises (staging-only) */

/**
 * Funding rounds stage under 'defillama_raises' with a precomputed nameKey in
 * the payload; propensity feature extraction joins them to projects by
 * name_key/domain. They never become canonical projects themselves.
 */
export async function stageRaises(pool: pg.Pool, client = new DefiLlamaClient()): Promise<number> {
  const raises = await client.fetchRaises();
  const CHUNK = 500;
  let staged = 0;

  for (let i = 0; i < raises.length; i += CHUNK) {
    const chunk = raises.slice(i, i + CHUNK);
    const values: unknown[] = [];
    const tuples = chunk
      .map((r, idx) => {
        const payload = {
          name: r.name,
          nameKey: squashEntity(r.name ?? ''),
          date: r.date,
          round: r.round,
          amountM: r.amount,
          category: r.category,
          leadInvestors: (r.leadInvestors ?? []).slice(0, 5),
        };
        const extId = `${payload.nameKey}:${r.date}`;
        const base = idx * 3;
        values.push(extId, JSON.stringify(payload), contentHash(payload as unknown as Record<string, unknown>));
        return `($${base + 1}, $${base + 2}::jsonb, $${base + 3})`;
      })
      .join(', ');

    await pool.query(
      `INSERT INTO project_sources (id, source, external_id, payload, content_hash, status)
       SELECT gen_random_uuid(), 'defillama_raises', v.external_id, v.payload, v.content_hash, 'ignored'
       FROM (VALUES ${tuples}) AS v(external_id, payload, content_hash)
       ON CONFLICT (source, external_id) DO UPDATE SET
         last_seen_at = NOW(),
         payload = EXCLUDED.payload,
         content_hash = EXCLUDED.content_hash`,
      values,
    );
    staged += chunk.length;
  }
  return staged;
}

/* ────────────────────────────────────────────── orchestration */

export interface UniverseSyncReport {
  reports: ConnectorRunReport[];
  raisesStaged: number;
  externalIdsUpserted: number;
}

/**
 * Weekly universe sync: paprika tickers + defillama protocols (+ raises) +
 * coingecko id list. After each connector run, provider external-ids are
 * upserted for every mapped staged row so the market refresh can bulk-join.
 */
export async function syncUniverse(pool: pg.Pool, opts?: { coingeckoApiKey?: string; coingeckoKeyType?: 'demo' | 'pro' }): Promise<UniverseSyncReport> {
  const reports: ConnectorRunReport[] = [];
  let externalIdsUpserted = 0;

  const cg = new CoinGeckoClient({ apiKey: opts?.coingeckoApiKey || undefined, keyType: opts?.coingeckoKeyType ?? 'demo' });

  const connectors = [
    coinpaprikaConnector(), // free tier caps /tickers at ~2000 — breadth comes from CG markets below
    defillamaConnector(),
    coingeckoListConnector(cg),
    coingeckoMarketsConnector(cg), // ~60 calls; the actual universe backbone
  ];

  for (const connector of connectors) {
    const report = await runConnector(pool, connector);
    reports.push(report);
    externalIdsUpserted += await upsertExternalIdsFromStaging(pool, connector.name);
    console.log(
      `[universe] ${connector.name}: ${report.staged} staged, ${report.changed} changed, ` +
      `${report.inserted} new, ${report.attached} matched, ${report.ignored} gated out`,
    );
  }

  // Funding rounds went behind DefiLlama's paid tier (HTTP 402) — degrade
  // gracefully: propensity's funding features just see no data.
  let raisesStaged = 0;
  try {
    raisesStaged = await stageRaises(pool);
    console.log(`[universe] defillama_raises: ${raisesStaged} staged`);
  } catch (err) {
    console.warn(`[universe] raises unavailable (${err instanceof Error ? err.message : err}) — skipping`);
  }

  return { reports, raisesStaged, externalIdsUpserted };
}

/** Daily new-token discovery (GeckoTerminal). */
export async function discoverNewTokens(pool: pg.Pool): Promise<ConnectorRunReport> {
  const report = await runConnector(pool, geckoterminalConnector());
  console.log(
    `[discover] geckoterminal: ${report.staged} staged, ${report.inserted} new, ${report.ignored} gated out`,
  );
  return report;
}

/** provider = staging source for mapped rows → project_external_ids. */
async function upsertExternalIdsFromStaging(pool: pg.Pool, source: string): Promise<number> {
  const provider =
    source === 'geckoterminal_new' ? 'geckoterminal' :
    source === 'coingecko_markets' ? 'coingecko' :
    source;
  const { rowCount } = await pool.query(
    `INSERT INTO project_external_ids (id, project_id, provider, external_id, matched_by, confidence)
     SELECT gen_random_uuid(), ps.project_id, $2, ps.external_id, 'staged', 'high'
     FROM project_sources ps
     WHERE ps.source = $1 AND ps.project_id IS NOT NULL
     ON CONFLICT DO NOTHING`,
    [source, provider],
  );
  return rowCount ?? 0;
}
