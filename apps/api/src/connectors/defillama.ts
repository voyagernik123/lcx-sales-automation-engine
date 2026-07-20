import type pg from 'pg';
import type { Reliability } from '@lcx/shared';
import { insertObservations, type ObservationRow } from '../intel/observations.js';
import { setIdentifier } from '../intel/identifiers.js';
import { markOk } from '../intel/collect.js';

/**
 * DefiLlama /protocols connector (free, no key). One bulk fetch, matched to our
 * universe by ticker (with name confirmation), yielding TVL, multichain reach,
 * category and FDV — the liquidity/scale signals. Matching by symbol only (with
 * a name-match upgrading confidence) keeps false positives out; unmatched
 * tokens simply carry no DefiLlama data (honest partial coverage).
 */

interface Protocol {
  name: string;
  symbol?: string;
  slug: string;
  category?: string;
  chains?: string[];
  tvl?: number;
  mcap?: number | null;
  change_7d?: number | null;
  gecko_id?: string | null;
}

const squash = (s: string): string => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Fetch the (large) /protocols payload robustly. On constrained hosts (Render
 * free tier) undici intermittently drops the body mid-stream with
 * `TypeError: terminated`; a bounded retry + a fresh connection each attempt
 * clears it, and gzip shrinks the download to lower the odds. 30s abort guard
 * so a hung socket can't wedge the whole collect job.
 */
async function fetchProtocols(): Promise<Protocol[]> {
  const MAX = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30_000);
    try {
      const res = await fetch('https://api.llama.fi/protocols', {
        signal: ac.signal,
        headers: { 'accept-encoding': 'gzip' },
      });
      if (!res.ok) throw new Error(`defillama /protocols ${res.status}`);
      return (await res.json()) as Protocol[];
    } catch (err) {
      lastErr = err;
      if (attempt < MAX) await new Promise((r) => setTimeout(r, 750 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`defillama /protocols fetch failed after ${MAX} attempts: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

export async function collectDefillama(pool: pg.Pool): Promise<{ matched: number; observations: number }> {
  const protocols = await fetchProtocols();

  // Index by symbol, keeping the highest-TVL protocol per symbol.
  const bySymbol = new Map<string, Protocol>();
  for (const p of protocols) {
    const sym = (p.symbol || '').toUpperCase();
    if (!sym || sym === '-') continue;
    const cur = bySymbol.get(sym);
    if (!cur || (p.tvl ?? 0) > (cur.tvl ?? 0)) bySymbol.set(sym, p);
  }

  let matched = 0;
  let observations = 0;
  const pageSize = 1000;
  let offset = 0;

  for (;;) {
    const { rows } = await pool.query(
      `SELECT id, ticker_norm, ticker, name_key, name FROM projects WHERE tier = 'tracked' ORDER BY id LIMIT $1 OFFSET $2`,
      [pageSize, offset],
    );
    if (rows.length === 0) break;

    for (const r of rows as Record<string, unknown>[]) {
      const sym = String(r.ticker_norm || r.ticker || '').toUpperCase();
      if (!sym) continue;
      const proto = bySymbol.get(sym);
      if (!proto) continue;

      const nk = String(r.name_key || squash(String(r.name || '')));
      const nameMatch = nk && squash(proto.name) === nk;
      const rel: Reliability = nameMatch ? 'A' : 'B';
      matched++;

      const now = new Date();
      const url = `https://defillama.com/protocol/${proto.slug}`;
      const obsRows: ObservationRow[] = [];
      const add = (predicate: string, value: unknown, valueNum: number | null, unit: string | null) => {
        if (value === null || value === undefined) return;
        obsRows.push({
          subjectType: 'project', subjectId: r.id as string, predicate, value, valueNum, unit,
          source: 'defillama', sourceUrl: url, reliability: rel, credibility: 2, observedAt: now,
        });
      };
      const tvl = proto.tvl != null ? Math.round(proto.tvl) : null;
      add('tvl_usd', tvl, tvl, 'USD');
      add('defillama_category', proto.category ?? null, null, null);
      const chains = Array.isArray(proto.chains) ? proto.chains : [];
      if (chains.length) {
        add('chain_count', chains.length, chains.length, null);
        add('chains', chains, null, null);
      }
      if (proto.mcap != null) add('fdv_usd', Math.round(proto.mcap), Math.round(proto.mcap), 'USD');
      if (proto.change_7d != null) add('tvl_change_7d', proto.change_7d, proto.change_7d, '%');

      observations += await insertObservations(pool, obsRows);
      await setIdentifier(pool, r.id as string, 'defillama_slug', proto.slug, 'defillama', nameMatch ? 90 : 70);
      if (proto.gecko_id) await setIdentifier(pool, r.id as string, 'gecko_id', proto.gecko_id, 'defillama', 80);
      await markOk(pool, 'project', r.id as string, 'defillama');
    }
    offset += pageSize;
  }

  return { matched, observations };
}
