/**
 * Incremental identity resolution — replaces the O(n²) dedupeProjects for
 * ongoing ingestion. Incoming rows are matched against EXISTING projects via
 * indexed blocking keys (esma_token_id, dti, domain, ticker_norm+name prefix,
 * name_key), and against each other within the batch via key buckets.
 *
 * Ticker alone never merges — at 30k+ universe scale, symbol collisions make
 * that a false-merge machine. A missed merge is recoverable; a wrong one isn't.
 */
import { squashEntity } from '@lcx/shared';
import type { RawProject } from './types.js';
import { extractDomain, cleanTicker, normalizeName } from './types.js';

export interface KeyedProject extends RawProject {
  nameKey: string;
  domain: string | null;
  tickerNorm: string | null;
}

export interface ResolveDb {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface ResolveResult {
  /** Incoming rows that matched an existing project. */
  attach: { projectId: string; incoming: KeyedProject; matchedBy: string }[];
  /** New canonical rows (within-batch duplicates already merged). */
  insert: KeyedProject[];
}

export function keyProject(p: RawProject): KeyedProject {
  return {
    ...p,
    nameKey: squashEntity(p.name) || normalizeName(p.name),
    domain: extractDomain(p.website) ?? null,
    tickerNorm: cleanTicker(p.ticker) ?? null,
  };
}

/** Merge b into a: fill missing fields, OR listedOnLcx. */
function mergeInto(a: KeyedProject, b: KeyedProject): void {
  a.website = a.website ?? b.website;
  a.ticker = a.ticker ?? b.ticker;
  a.chain = a.chain ?? b.chain;
  a.esmaTokenId = a.esmaTokenId ?? b.esmaTokenId;
  a.dti = a.dti ?? b.dti;
  a.jurisdiction = a.jurisdiction ?? b.jurisdiction;
  a.whitepaperUrl = a.whitepaperUrl ?? b.whitepaperUrl;
  a.category = a.category ?? b.category;
  a.marketCap = a.marketCap ?? b.marketCap;
  a.listedOnLcx = a.listedOnLcx || b.listedOnLcx;
  a.domain = a.domain ?? b.domain;
  a.tickerNorm = a.tickerNorm ?? b.tickerNorm;
}

function namePrefixAgrees(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return na.slice(0, 4) === nb.slice(0, 4);
}

/**
 * `incoming` must be pre-keyed (keyProject) — returned attach/insert entries
 * are the SAME object references, so callers can map results back by identity.
 */
export async function resolveIncoming(
  db: ResolveDb,
  incoming: KeyedProject[],
): Promise<ResolveResult> {
  const keyed = incoming;

  // ── Within-batch grouping by strong keys ──
  const canonicalByKey = new Map<string, KeyedProject>();
  const batchCanonicals: KeyedProject[] = [];

  for (const p of keyed) {
    const keys: string[] = [];
    if (p.esmaTokenId) keys.push(`esma:${p.esmaTokenId}`);
    if (p.domain) keys.push(`dom:${p.domain}`);
    keys.push(`name:${p.nameKey}`);

    const existing = keys.map((k) => canonicalByKey.get(k)).find(Boolean);
    if (existing) {
      mergeInto(existing, p);
      for (const k of keys) if (!canonicalByKey.has(k)) canonicalByKey.set(k, existing);
    } else {
      batchCanonicals.push(p);
      for (const k of keys) canonicalByKey.set(k, p);
    }
  }

  // ── Candidate fetch from DB (single query per key type, indexed) ──
  const esmaIds = [...new Set(batchCanonicals.map((p) => p.esmaTokenId).filter(Boolean))] as string[];
  const dtis = [...new Set(batchCanonicals.map((p) => p.dti).filter(Boolean))] as string[];
  const domains = [...new Set(batchCanonicals.map((p) => p.domain).filter(Boolean))] as string[];
  const tickers = [...new Set(batchCanonicals.map((p) => p.tickerNorm).filter(Boolean))] as string[];
  const nameKeys = [...new Set(batchCanonicals.map((p) => p.nameKey).filter(Boolean))];

  type Candidate = { id: string; name: string; esma_token_id: string | null; dti: string | null; domain: string | null; ticker_norm: string | null; name_key: string | null };

  const fetchCandidates = async (column: string, values: string[]): Promise<Candidate[]> => {
    if (values.length === 0) return [];
    const res = await db.query(
      `SELECT id, name, esma_token_id, dti, domain, ticker_norm, name_key
       FROM projects WHERE ${column} = ANY($1)`,
      [values],
    );
    return res.rows as unknown as Candidate[];
  };

  const [byEsma, byDti, byDomain, byTicker, byNameKey] = await Promise.all([
    fetchCandidates('esma_token_id', esmaIds),
    fetchCandidates('dti', dtis),
    fetchCandidates('domain', domains),
    fetchCandidates('ticker_norm', tickers),
    fetchCandidates('name_key', nameKeys),
  ]);

  const esmaMap = new Map(byEsma.map((c) => [c.esma_token_id as string, c]));
  const dtiMap = new Map(byDti.map((c) => [c.dti as string, c]));
  const domainMap = new Map(byDomain.map((c) => [c.domain as string, c]));
  const tickerMap = new Map<string, Candidate[]>();
  for (const c of byTicker) {
    const key = c.ticker_norm as string;
    if (!tickerMap.has(key)) tickerMap.set(key, []);
    tickerMap.get(key)!.push(c);
  }
  const nameKeyMap = new Map(byNameKey.map((c) => [c.name_key as string, c]));

  // ── Match precedence per canonical batch row ──
  const attach: ResolveResult['attach'] = [];
  const insert: KeyedProject[] = [];

  for (const p of batchCanonicals) {
    let matched: { id: string } | undefined;
    let matchedBy = '';

    if (p.esmaTokenId && esmaMap.has(p.esmaTokenId)) {
      matched = esmaMap.get(p.esmaTokenId)!;
      matchedBy = 'esma_token';
    } else if (p.dti && dtiMap.has(p.dti)) {
      matched = dtiMap.get(p.dti)!;
      matchedBy = 'dti';
    } else if (p.domain && domainMap.has(p.domain)) {
      matched = domainMap.get(p.domain)!;
      matchedBy = 'domain';
    } else if (p.tickerNorm && tickerMap.has(p.tickerNorm)) {
      // Ticker must be corroborated by name-prefix agreement
      const candidate = tickerMap.get(p.tickerNorm)!.find((c) => namePrefixAgrees(c.name, p.name));
      if (candidate) {
        matched = candidate;
        matchedBy = 'ticker_name';
      }
    }
    if (!matched && nameKeyMap.has(p.nameKey)) {
      matched = nameKeyMap.get(p.nameKey)!;
      matchedBy = 'name_key';
    }

    if (matched) {
      attach.push({ projectId: matched.id, incoming: p, matchedBy });
    } else {
      insert.push(p);
    }
  }

  return { attach, insert };
}
