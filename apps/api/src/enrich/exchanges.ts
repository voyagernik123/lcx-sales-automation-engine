/**
 * Competitive exchange tracking — which exchanges already list each project.
 *
 * Primary source: CoinPaprika /coins/{id}/markets (free, no key) for projects
 * with a coinpaprika external id. Fallback: CoinGecko /coins/{id}/tickers for
 * top-priority projects without one, capped per run to protect the demo-key
 * budget.
 *
 * Side effects per synced project:
 *   - exchange_listings upserted (aggregated per exchange)
 *   - projects.exchange_count + exchanges_synced_at updated
 *   - listed_on_lcx flipped true if LCX appears among the exchanges
 *   - a 'competitor_listing' signal when a NEW exchange appears for a
 *     nurture-or-better project (alert rules consume these)
 */
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { CoinPaprikaClient, CoinGeckoClient, type PaprikaMarket } from '@lcx/shared';

const PAPRIKA_PER_RUN = 150;
const COINGECKO_PER_RUN = 40;
const RESYNC_AFTER_DAYS = 14;

export interface ExchangeSyncReport {
  synced: number;
  listingsUpserted: number;
  newListings: number;
  lcxDetected: number;
  errors: number;
  paprikaCalls: number;
  coingeckoCalls: number;
}

interface AggregatedListing {
  exchangeId: string;
  exchangeName: string;
  category: string | null;
  pairsCount: number;
  volume24hUsd: number | null;
}

function aggregateMarkets(markets: PaprikaMarket[]): AggregatedListing[] {
  const byExchange = new Map<string, AggregatedListing>();
  for (const m of markets) {
    if (!m.exchange_id || m.outlier) continue;
    const existing = byExchange.get(m.exchange_id);
    const vol = m.quotes?.USD?.volume_24h ?? null;
    if (existing) {
      existing.pairsCount++;
      if (vol != null) existing.volume24hUsd = (existing.volume24hUsd ?? 0) + vol;
    } else {
      byExchange.set(m.exchange_id, {
        exchangeId: m.exchange_id,
        exchangeName: m.exchange_name || m.exchange_id,
        category: m.category ?? null,
        pairsCount: 1,
        volume24hUsd: vol,
      });
    }
  }
  return [...byExchange.values()];
}

export async function syncExchangeListings(
  pool: pg.Pool,
  opts: { coingeckoApiKey?: string; coingeckoKeyType?: 'demo' | 'pro' } = {},
): Promise<ExchangeSyncReport> {
  const report: ExchangeSyncReport = {
    synced: 0, listingsUpserted: 0, newListings: 0, lcxDetected: 0,
    errors: 0, paprikaCalls: 0, coingeckoCalls: 0,
  };

  // Highest-priority projects with stale/missing exchange data, provider id required
  const { rows: candidates } = await pool.query(
    `SELECT p.id, p.name, s.band,
            pap.external_id AS paprika_id,
            cg.external_id AS coingecko_id
     FROM projects p
     LEFT JOIN scores s ON s.project_id = p.id
     LEFT JOIN project_external_ids pap ON pap.project_id = p.id AND pap.provider = 'coinpaprika'
     LEFT JOIN project_external_ids cg ON cg.project_id = p.id AND cg.provider = 'coingecko'
     WHERE (pap.external_id IS NOT NULL OR cg.external_id IS NOT NULL)
       AND p.tier = 'tracked'
       AND (p.exchanges_synced_at IS NULL OR p.exchanges_synced_at < NOW() - INTERVAL '${RESYNC_AFTER_DAYS} days')
     ORDER BY s.priority_score DESC NULLS LAST
     LIMIT ${PAPRIKA_PER_RUN + COINGECKO_PER_RUN}`,
  );

  const paprika = new CoinPaprikaClient();
  const coingecko = new CoinGeckoClient({
    apiKey: opts.coingeckoApiKey || undefined,
    keyType: opts.coingeckoKeyType ?? 'demo',
  });

  // Paprika's markets endpoint rations free calls (402 after ~80/run) — once
  // it starts paying-walling, stop asking and fall through to CoinGecko.
  let paprikaDead = false;

  for (const c of candidates) {
    let listings: AggregatedListing[] | null = null;
    let source = 'coinpaprika';

    try {
      if (c.paprika_id && !paprikaDead && report.paprikaCalls < PAPRIKA_PER_RUN) {
        report.paprikaCalls++;
        listings = aggregateMarkets(await paprika.fetchCoinMarkets(c.paprika_id as string));
      } else if (c.coingecko_id && report.coingeckoCalls < COINGECKO_PER_RUN) {
        source = 'coingecko';
        report.coingeckoCalls++;
        listings = await fetchCoinGeckoListings(coingecko, c.coingecko_id as string);
      } else {
        continue; // budget for this source exhausted
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (source === 'coinpaprika' && msg.includes('402')) {
        paprikaDead = true;
        console.warn('[exchanges] paprika markets quota hit (402) — switching to CoinGecko for the rest of this run');
      } else {
        report.errors++;
        console.warn(`[exchanges] ${c.name}: ${msg}`);
      }
      continue;
    }

    try {
      const { upserted, fresh } = await persistListings(pool, c.id as string, c.band as string | null, listings, source);
      report.listingsUpserted += upserted;
      report.newListings += fresh;

      const onLcx = listings.some((l) => l.exchangeId === 'lcx' || /^lcx( exchange)?$/i.test(l.exchangeName));
      if (onLcx) report.lcxDetected++;

      await pool.query(
        `UPDATE projects SET
           exchange_count = $2,
           exchanges_synced_at = NOW(),
           listed_on_lcx = listed_on_lcx OR $3,
           updated_at = NOW()
         WHERE id = $1`,
        [c.id, listings.length, onLcx],
      );
      report.synced++;
    } catch (err) {
      report.errors++;
      console.warn(`[exchanges] persist ${c.name}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return report;
}

async function fetchCoinGeckoListings(cg: CoinGeckoClient, coinId: string): Promise<AggregatedListing[]> {
  const data = await cg.fetchCoinTickers(coinId);
  return aggregateMarkets(
    data.map((t) => ({
      exchange_id: t.marketIdentifier,
      exchange_name: t.marketName,
      pair: `${t.base}/${t.target}`,
      category: null,
      outlier: t.anomaly,
      quotes: { USD: { volume_24h: t.volumeUsd } },
    })),
  );
}

async function persistListings(
  pool: pg.Pool,
  projectId: string,
  band: string | null,
  listings: AggregatedListing[],
  source: string,
): Promise<{ upserted: number; fresh: number }> {
  if (listings.length === 0) return { upserted: 0, fresh: 0 };

  const values: unknown[] = [];
  const tuples = listings
    .map((l, i) => {
      const base = i * 7;
      values.push(randomUUID(), projectId, l.exchangeId, l.exchangeName, l.category, l.pairsCount, l.volume24hUsd);
      return `($${base + 1}::uuid, $${base + 2}::uuid, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::int, $${base + 7}::numeric)`;
    })
    .join(', ');

  const { rows } = await pool.query(
    `INSERT INTO exchange_listings (id, project_id, exchange_id, exchange_name, category, pairs_count, volume_24h_usd, source)
     SELECT v.id, v.project_id, v.exchange_id, v.exchange_name, v.category, v.pairs, v.vol, '${source}'
     FROM (VALUES ${tuples}) AS v(id, project_id, exchange_id, exchange_name, category, pairs, vol)
     ON CONFLICT (project_id, exchange_id) DO UPDATE SET
       exchange_name = EXCLUDED.exchange_name,
       category = EXCLUDED.category,
       pairs_count = EXCLUDED.pairs_count,
       volume_24h_usd = EXCLUDED.volume_24h_usd,
       last_seen_at = NOW()
     RETURNING (xmax = 0) AS was_insert, exchange_name`,
    values,
  );

  const freshNames = rows.filter((r) => r.was_insert === true).map((r) => r.exchange_name as string);

  // New listing on a lead we care about → signal (consumed by alert rules).
  // Skip the very first sync (everything is "new" then).
  if (freshNames.length > 0 && freshNames.length < listings.length && band && ['nurture', 'high', 'immediate'].includes(band)) {
    await pool.query(
      `INSERT INTO signals (id, project_id, kind, payload) VALUES ($1, $2, 'competitor_listing', $3)`,
      [randomUUID(), projectId, JSON.stringify({ exchanges: freshNames.slice(0, 10) })],
    );
  }

  return { upserted: rows.length, fresh: freshNames.length };
}
