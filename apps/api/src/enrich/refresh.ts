/**
 * Bulk market refresh — replaces per-coin enrichment for the batch path.
 *
 *  1. Match pass: projects without a coingecko/coinpaprika external id are
 *     matched against the STAGED provider lists (no API calls) and persisted
 *     to project_external_ids.
 *  2. CoinGecko /coins/markets pages (250/call, ~60 calls = top 15k) update
 *     typed market columns via bulk joins.
 *  3. CoinPaprika staged tickers cover everything CG missed — zero extra calls
 *     (they were staged during universe sync).
 *  4. Delta signals fire only on real moves (±20% mcap, ±10 rank) vs the
 *     previous column values, throttled to one per project per week.
 *
 * Usage: DATABASE_URL=... COINGECKO_API_KEY=... npx tsx src/enrich/refresh.ts [--pages 60]
 */
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { CoinGeckoClient, matchProject, type CoinGeckoCoin, type CoinGeckoMarketRow } from '@lcx/shared';

const CHUNK = 500;
const MCAP_DELTA_PCT = 20;
const RANK_DELTA = 10;

export interface RefreshReport {
  matchedNew: number;
  cgUpdated: number;
  paprikaUpdated: number;
  deltaSignals: number;
  cgCalls: number;
}

export async function refreshMarketData(
  pool: pg.Pool,
  opts: { coingeckoApiKey?: string; coingeckoKeyType?: 'demo' | 'pro'; pages?: number },
): Promise<RefreshReport> {
  const report: RefreshReport = { matchedNew: 0, cgUpdated: 0, paprikaUpdated: 0, deltaSignals: 0, cgCalls: 0 };

  // ── 1. Match pass against staged CG list ──
  report.matchedNew = await matchUnmappedProjects(pool);

  // ── 2. CoinGecko bulk pages ──
  const cg = new CoinGeckoClient({ apiKey: opts.coingeckoApiKey || undefined, keyType: opts.coingeckoKeyType ?? 'demo' });
  const pages = opts.pages ?? 60;
  const updatedProjectIds = new Set<string>();

  for (let page = 1; page <= pages; page++) {
    let rows: CoinGeckoMarketRow[];
    try {
      rows = await cg.fetchMarketsPage(page);
      report.cgCalls++;
    } catch (err) {
      console.warn(`[refresh] markets page ${page} failed, stopping CG sweep:`, err instanceof Error ? err.message : err);
      break;
    }
    if (rows.length === 0) break;

    const { updated, signals } = await applyMarketRows(pool, 'coingecko', rows.map((r) => ({
      externalId: r.id,
      mcapUsd: r.marketCap,
      rank: r.marketCapRank,
      volume24hUsd: r.totalVolume,
      priceUsd: r.currentPrice,
      priceChange30d: r.priceChange30d,
      tokenAgeDays: null,
    })), updatedProjectIds);
    report.cgUpdated += updated;
    report.deltaSignals += signals;
  }

  // ── 3. CoinPaprika staged tickers for projects CG didn't cover ──
  const paprika = await loadStagedPaprika(pool);
  const { updated, signals } = await applyMarketRows(pool, 'coinpaprika', paprika, updatedProjectIds);
  report.paprikaUpdated = updated;
  report.deltaSignals += signals;

  return report;
}

/* ────────────────────────────────────────────── match pass */

async function matchUnmappedProjects(pool: pg.Pool): Promise<number> {
  const { rows: coins } = await pool.query(
    `SELECT external_id, payload FROM project_sources WHERE source = 'coingecko'`,
  );
  if (coins.length === 0) return 0;

  const coinList: CoinGeckoCoin[] = coins.map((c) => ({
    id: c.external_id as string,
    symbol: ((c.payload as Record<string, unknown>).symbol as string) ?? '',
    name: ((c.payload as Record<string, unknown>).name as string) ?? '',
  })) as CoinGeckoCoin[];

  const { rows: unmapped } = await pool.query(
    `SELECT p.id, p.name, p.ticker FROM projects p
     WHERE NOT EXISTS (
       SELECT 1 FROM project_external_ids e
       WHERE e.project_id = p.id AND e.provider = 'coingecko'
     )
     AND (p.ticker IS NOT NULL OR p.name IS NOT NULL)`,
  );

  let matched = 0;
  const inserts: { projectId: string; coinId: string; method: string }[] = [];
  for (const p of unmapped) {
    const m = matchProject(p.name as string, (p.ticker as string) ?? undefined, coinList);
    if (m.coinId) inserts.push({ projectId: p.id as string, coinId: m.coinId, method: m.method });
  }

  for (let i = 0; i < inserts.length; i += CHUNK) {
    const chunk = inserts.slice(i, i + CHUNK);
    const values: unknown[] = [];
    const tuples = chunk
      .map((ins, idx) => {
        const base = idx * 4;
        values.push(randomUUID(), ins.projectId, ins.coinId, ins.method);
        return `($${base + 1}::uuid, $${base + 2}::uuid, 'coingecko', $${base + 3}, $${base + 4}, 'high')`;
      })
      .join(', ');
    const { rowCount } = await pool.query(
      `INSERT INTO project_external_ids (id, project_id, provider, external_id, matched_by, confidence)
       VALUES ${tuples}
       ON CONFLICT DO NOTHING`,
      values,
    );
    matched += rowCount ?? 0;
  }
  return matched;
}

/* ────────────────────────────────────────────── bulk column updates */

interface MarketUpdateRow {
  externalId: string;
  mcapUsd: number | null;
  rank: number | null;
  volume24hUsd: number | null;
  priceUsd: number | null;
  priceChange30d: number | null;
  tokenAgeDays: number | null;
}

async function loadStagedPaprika(pool: pg.Pool): Promise<MarketUpdateRow[]> {
  const { rows } = await pool.query(
    `SELECT external_id, payload FROM project_sources WHERE source = 'coinpaprika' AND project_id IS NOT NULL`,
  );
  const now = Date.now();
  return rows.map((r) => {
    const p = r.payload as Record<string, unknown>;
    const firstData = p.firstDataAt ? Date.parse(p.firstDataAt as string) : NaN;
    return {
      externalId: r.external_id as string,
      mcapUsd: (p.marketCap as number) ?? null,
      rank: (p.rank as number) || null,
      volume24hUsd: (p.volume24h as number) ?? null,
      priceUsd: (p.price as number) ?? null,
      priceChange30d: (p.change30d as number) ?? null,
      tokenAgeDays: Number.isFinite(firstData) ? Math.floor((now - firstData) / 86_400_000) : null,
    };
  });
}

async function applyMarketRows(
  pool: pg.Pool,
  provider: 'coingecko' | 'coinpaprika',
  rows: MarketUpdateRow[],
  alreadyUpdated: Set<string>,
): Promise<{ updated: number; signals: number }> {
  let updated = 0;
  let signals = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values: unknown[] = [];
    const tuples = chunk
      .map((r, idx) => {
        const base = idx * 7;
        values.push(r.externalId, r.mcapUsd, r.rank, r.volume24hUsd, r.priceUsd, r.priceChange30d, r.tokenAgeDays);
        return `($${base + 1}, $${base + 2}::numeric, $${base + 3}::integer, $${base + 4}::numeric, $${base + 5}::numeric, $${base + 6}::numeric, $${base + 7}::integer)`;
      })
      .join(', ');

    // Delta detection reads OLD column values, so it must run before the update
    signals += await emitDeltaSignals(pool, provider, chunk);

    const { rows: applied } = await pool.query(
      `UPDATE projects p SET
         market_cap_usd = v.mcap,
         market_cap_rank = COALESCE(v.rank, p.market_cap_rank),
         volume_24h_usd = v.vol,
         price_usd = v.price,
         price_change_30d = v.chg30,
         token_age_days = COALESCE(v.age, p.token_age_days),
         last_enriched_at = NOW(),
         updated_at = NOW()
       FROM (VALUES ${tuples}) AS v(external_id, mcap, rank, vol, price, chg30, age)
       JOIN project_external_ids e ON e.provider = '${provider}' AND e.external_id = v.external_id
       WHERE p.id = e.project_id
         AND NOT (p.id = ANY($${chunk.length * 7 + 1}::uuid[]))
       RETURNING p.id`,
      [...values, [...alreadyUpdated]],
    );

    for (const row of applied) {
      alreadyUpdated.add(row.id as string);
    }
    updated += applied.length;
  }

  return { updated, signals };
}

/**
 * Delta signals: compare incoming values against current column values BEFORE
 * the update lands. Called per chunk with a pre-read. Throttled: skip projects
 * with any price_movement signal in the last 7 days.
 */
async function emitDeltaSignals(
  pool: pg.Pool,
  provider: string,
  chunk: MarketUpdateRow[],
): Promise<number> {
  const extIds = chunk.map((c) => c.externalId);
  const { rows: prev } = await pool.query(
    `SELECT e.external_id, p.id AS project_id, p.market_cap_usd, p.market_cap_rank
     FROM project_external_ids e
     JOIN projects p ON p.id = e.project_id
     WHERE e.provider = $1 AND e.external_id = ANY($2)
       AND NOT EXISTS (
         SELECT 1 FROM signals s
         WHERE s.project_id = p.id AND s.kind = 'price_movement'
           AND s.observed_at > NOW() - INTERVAL '7 days'
       )`,
    [provider, extIds],
  );

  const byExt = new Map(chunk.map((c) => [c.externalId, c]));
  const inserts: { projectId: string; payload: Record<string, unknown> }[] = [];

  for (const p of prev) {
    const next = byExt.get(p.external_id as string);
    if (!next) continue;
    const oldMcap = p.market_cap_usd != null ? Number(p.market_cap_usd) : null;
    const oldRank = p.market_cap_rank != null ? Number(p.market_cap_rank) : null;

    const mcapMove =
      oldMcap && next.mcapUsd && oldMcap > 0
        ? Math.abs(((next.mcapUsd - oldMcap) / oldMcap) * 100)
        : 0;
    const rankMove = oldRank && next.rank ? Math.abs(next.rank - oldRank) : 0;

    if (mcapMove >= MCAP_DELTA_PCT || rankMove >= RANK_DELTA) {
      inserts.push({
        projectId: p.project_id as string,
        payload: {
          provider,
          mcapUsd: next.mcapUsd,
          prevMcapUsd: oldMcap,
          mcapMovePct: Math.round(mcapMove * 10) / 10,
          rank: next.rank,
          prevRank: oldRank,
        },
      });
    }
  }

  for (const ins of inserts) {
    await pool.query(
      `INSERT INTO signals (id, project_id, kind, payload) VALUES ($1, $2, 'price_movement', $3)`,
      [randomUUID(), ins.projectId, JSON.stringify(ins.payload)],
    );
  }
  return inserts.length;
}

/* ────────────────────────────────────────────── CLI */

const isMain = process.argv[1]?.endsWith('refresh.ts') || process.argv[1]?.endsWith('refresh.js');
if (isMain) {
  const pagesArg = process.argv.indexOf('--pages');
  const pages = pagesArg > -1 ? Number(process.argv[pagesArg + 1]) : 60;
  const dbUrl = process.env.DATABASE_URL ?? 'postgresql://lcx:lcx_dev_password@localhost:5432/lcx_sales';
  const pool = new pg.Pool({ connectionString: dbUrl, max: 4 });

  refreshMarketData(pool, {
    coingeckoApiKey: process.env.COINGECKO_API_KEY,
    coingeckoKeyType: process.env.COINGECKO_KEY_TYPE === 'pro' ? 'pro' : 'demo',
    pages,
  })
    .then((r) => {
      console.log(
        `\nRefresh complete: ${r.matchedNew} newly matched, ${r.cgUpdated} CG-updated, ` +
        `${r.paprikaUpdated} paprika-updated, ${r.deltaSignals} delta signals, ${r.cgCalls} CG calls.\n`,
      );
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
