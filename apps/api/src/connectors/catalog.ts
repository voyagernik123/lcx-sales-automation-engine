/**
 * Universe catalog sync — the breadth layer that scales the token universe to
 * 50k+ on FREE, no-key sources without blowing the storage budget.
 *
 * Every free-source token identity becomes a lean `tier='catalog'` projects row
 * (name / ticker / chain / contract only — NO scores, NO observations, ~1KB).
 * The expensive intel pipeline runs only on `tier='tracked'` rows, so breadth
 * costs identity rows, not the ~18KB/row a scored project costs.
 *
 * Sources (both no-key, one call each):
 *   • CoinPaprika /coins   — ~60k token identities (id/name/symbol/rank/active).
 *   • CoinGecko /coins/list — ~17k, carries platform contract addresses.
 *
 * Quality-first: CoinGecko-tracked + active/ranked CoinPaprika coins rank ahead
 * of the dead long tail, so a CATALOG_TARGET cap keeps the best identities and
 * drops only the deadest. Deduped by the SAME keying the runner uses
 * (keyProject → name_key + ticker_norm), so catalog rows never duplicate the
 * curated/tracked universe. Insert is a chunked NOT EXISTS anti-join: it only
 * ever ADDS new identities and never touches an existing (tracked) row.
 *
 * Resilient by contract: a failing source degrades to [] and the job still
 * inserts whatever the other source returned.
 */
import type pg from 'pg';
import { CoinPaprikaClient, CoinGeckoClient } from '@lcx/shared';
import { keyProject, type KeyedProject } from '../import/resolve.js';
import type { RawProject } from '../import/types.js';

/** Aim just above 50k so the count reads "50,000+" after cross-source dedup. */
const CATALOG_TARGET = Number(process.env.CATALOG_TARGET) || 52_000;
const INSERT_CHUNK = 1_000;

export interface CatalogSyncStats {
  paprika: number;
  coingecko: number;
  candidates: number;
  deduped: number;
  considered: number;
  inserted: number;
}

/** One retry around a large-body fetch — Render's free tier occasionally drops
    multi-MB response bodies mid-stream (the DefiLlama "terminated" class). */
async function withRetry<T>(fn: () => Promise<T[]>, label: string): Promise<T[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fn();
      return Array.isArray(r) ? r : [];
    } catch (err) {
      if (attempt === 1) {
        console.warn(`[catalog] ${label} failed (${err instanceof Error ? err.message : err}) — skipping`);
        return [];
      }
    }
  }
  return [];
}

type Candidate = { keyed: KeyedProject; quality: number };

export async function syncCatalog(
  pool: pg.Pool,
  opts?: { coingeckoApiKey?: string; coingeckoKeyType?: 'demo' | 'pro' },
): Promise<CatalogSyncStats> {
  const paprika = new CoinPaprikaClient();
  const cg = new CoinGeckoClient({ apiKey: opts?.coingeckoApiKey || undefined, keyType: opts?.coingeckoKeyType ?? 'demo' });

  const [ppCoins, cgCoins] = await Promise.all([
    withRetry(() => paprika.fetchCoins(), 'coinpaprika /coins'),
    withRetry(() => cg.fetchCoinList(), 'coingecko /coins/list'),
  ]);
  console.log(`[catalog] fetched: coinpaprika=${ppCoins.length} coingecko=${cgCoins.length}`);

  // ── Build keyed candidates with a quality score for the cap ordering ──
  const candidates: Candidate[] = [];

  for (const c of cgCoins) {
    if (!c.name || !c.symbol || c.name.length < 2) continue;
    const platform = Object.entries(c.platforms ?? {}).find(([k, v]) => k && v);
    const raw: RawProject = {
      name: c.name,
      ticker: c.symbol,
      chain: platform?.[0] || undefined,
      source: 'coingecko',
      listedOnLcx: false,
      tier: 'catalog',
      rawPayload: { _catalog: { cg: c.id, contract: platform?.[1] || undefined } },
    };
    candidates.push({ keyed: keyProject(raw), quality: 3 }); // CG-tracked → high quality
  }

  for (const c of ppCoins) {
    if (!c.name || !c.symbol || c.name.length < 2) continue;
    const quality =
      (c.is_active ? 2 : 0) + ((c.rank ?? 0) > 0 ? 1 : 0) + (c.type === 'coin' ? 1 : 0) + (c.is_new ? 1 : 0);
    const raw: RawProject = {
      name: c.name,
      ticker: c.symbol,
      source: 'coinpaprika',
      listedOnLcx: false,
      tier: 'catalog',
      rawPayload: { _catalog: { pp: c.id, rank: c.rank ?? null, active: !!c.is_active } },
    };
    candidates.push({ keyed: keyProject(raw), quality });
  }

  // ── Dedup by (name_key, ticker_norm); keep the highest-quality, merge ids ──
  const byKey = new Map<string, Candidate>();
  for (const cand of candidates) {
    const k = `${cand.keyed.nameKey}|${cand.keyed.tickerNorm ?? ''}`;
    const cur = byKey.get(k);
    if (!cur) {
      byKey.set(k, cand);
    } else {
      // Fold provider ids together so a promoted row can hit either source.
      const winner = cand.quality > cur.quality ? cand : cur;
      const loser = cand.quality > cur.quality ? cur : cand;
      const wc = (winner.keyed.rawPayload._catalog ?? {}) as Record<string, unknown>;
      const lc = (loser.keyed.rawPayload._catalog ?? {}) as Record<string, unknown>;
      winner.keyed.rawPayload._catalog = { ...lc, ...wc };
      byKey.set(k, winner);
    }
  }

  const ordered = [...byKey.values()].sort((a, b) => b.quality - a.quality);
  const considered = ordered.slice(0, CATALOG_TARGET).map((c) => c.keyed);

  // ── Chunked anti-join insert (only ADDS new identities; never touches tracked) ──
  let inserted = 0;
  for (let i = 0; i < considered.length; i += INSERT_CHUNK) {
    inserted += await insertCatalogChunk(pool, considered.slice(i, i + INSERT_CHUNK));
  }

  const stats: CatalogSyncStats = {
    paprika: ppCoins.length,
    coingecko: cgCoins.length,
    candidates: candidates.length,
    deduped: byKey.size,
    considered: considered.length,
    inserted,
  };
  console.log(`[catalog] ${JSON.stringify(stats)}`);
  return stats;
}

/** Insert a chunk of catalog identities, skipping any (name_key, ticker_norm)
    that already exists — so re-runs are cheap and tracked rows stay untouched. */
async function insertCatalogChunk(pool: pg.Pool, chunk: KeyedProject[]): Promise<number> {
  if (chunk.length === 0) return 0;
  const values: unknown[] = [];
  const tuples = chunk
    .map((p, i) => {
      const base = i * 8;
      values.push(
        p.name,
        p.ticker ?? null,
        p.chain ?? null,
        p.source,
        p.nameKey,
        p.domain,
        p.tickerNorm,
        JSON.stringify(p.rawPayload ?? {}),
      );
      // Anchor column types on the first tuple (chunks can be all-null in a column).
      return i === 0
        ? `($1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text, $8::jsonb)`
        : `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
    })
    .join(', ');

  const { rowCount } = await pool.query(
    `INSERT INTO projects (id, name, ticker, chain, source, name_key, domain, ticker_norm, listed_on_lcx, raw, tier)
     SELECT gen_random_uuid(), v.name, v.ticker, v.chain, v.source, v.name_key, v.domain, v.ticker_norm, FALSE, v.raw, 'catalog'
     FROM (VALUES ${tuples}) AS v(name, ticker, chain, source, name_key, domain, ticker_norm, raw)
     WHERE NOT EXISTS (
       SELECT 1 FROM projects p
       WHERE p.name_key = v.name_key AND COALESCE(p.ticker_norm, '') = COALESCE(v.ticker_norm, '')
     )`,
    values,
  );
  return rowCount ?? 0;
}
