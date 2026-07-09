import type { RawProject } from './types.js';
import { normalizeName, extractDomain, cleanTicker } from './types.js';

export interface DedupeGroup {
  projects: RawProject[];
  /** Canonical project to upsert (most complete fields merged). */
  canonical: RawProject;
  confidence: 'exact' | 'high' | 'medium' | 'low';
  signals: string[];
}

export interface DedupeResult {
  groups: DedupeGroup[];
  /** Projects that had zero merge candidates. */
  singletons: DedupeGroup[];
}

/**
 * De-duplicate a flat list of RawProject[] into merge groups.
 *
 * Strategy (applied in order):
 * 1. Exact match on `esmaTokenId` (guaranteed same project)
 * 2. Exact match on `dti` (Digital Token Identifier)
 * 3. Same normalized website domain (highest confidence)
 * 4. Same ticker + normalized name prefix match (first 4 chars)
 * 5. Same normalized name (fuzzy fallback via bigram overlap)
 */
export function dedupeProjects(projects: RawProject[]): DedupeResult {
  const remaining = [...projects];
  const groups: DedupeGroup[] = [];

  const findMatch = (p: RawProject): number | null => {
    // 1. esmaTokenId match
    if (p.esmaTokenId) {
      for (let i = 0; i < groups.length; i++) {
        if (groups[i].projects.some((g) => g.esmaTokenId === p.esmaTokenId)) {
          return i;
        }
      }
    }

    const domain = extractDomain(p.website);
    const ticker = cleanTicker(p.ticker);
    const nameNorm = normalizeName(p.name);

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      for (const g of group.projects) {
        // 3. Same domain
        if (domain && extractDomain(g.website) === domain) {
          return i;
        }
        // 4. Same ticker + name prefix
        if (ticker && cleanTicker(g.ticker) === ticker) {
          const gNameNorm = normalizeName(g.name);
          if (nameNorm.slice(0, 4) === gNameNorm.slice(0, 4)) {
            return i;
          }
        }
      }

      // 5. Name similarity (bigram overlap) — only for names > 8 chars
      if (nameNorm.length > 8) {
        for (const g of group.projects) {
          const gNameNorm = normalizeName(g.name);
          if (gNameNorm.length > 8) {
            const overlap = bigramOverlap(nameNorm, gNameNorm);
            if (overlap >= 0.75) {
              return i;
            }
          }
        }
      }
    }

    return null;
  };

  for (const p of remaining) {
    const idx = findMatch(p);
    if (idx !== null) {
      groups[idx].projects.push(p);
    } else {
      groups.push({ projects: [p], canonical: p, confidence: 'exact', signals: ['new'] });
    }
  }

  // Compute canonical and confidence for each group
  const resultGroups: DedupeGroup[] = groups.map((g) => {
    if (g.projects.length === 1) {
      return {
        ...g,
        canonical: g.projects[0],
        confidence: 'exact',
        signals: [firstSourceLabel(g.projects[0].source)],
      };
    }

    const signals: string[] = [];
    const sources = new Set(g.projects.map((p) => p.source));

    // Signal: same ESMA token
    const tokenIds = g.projects.map((p) => p.esmaTokenId).filter(Boolean);
    const uniqueTokens = new Set(tokenIds);
    if (uniqueTokens.size > 0 && uniqueTokens.size <= tokenIds.length) {
      signals.push('esma_token_match');
    }

    // Signal: same domain
    const domains = g.projects.map((p) => extractDomain(p.website)).filter(Boolean);
    if (new Set(domains).size === 1 && domains.length > 1) {
      signals.push('domain_match');
    }

    // Signal: same ticker
    const tickers = g.projects.map((p) => cleanTicker(p.ticker)).filter(Boolean);
    if (new Set(tickers).size === 1 && tickers.length > 1) {
      signals.push('ticker_match');
    }

signals.push(...Array.from(sources).map((s: string) => firstSourceLabel(s)));

    // Build canonical from most complete record
    const sorted = [...g.projects].sort((a, b) => fieldCount(b) - fieldCount(a));
    const canonical: RawProject = {
      ...sorted[0],
      source: sorted[0].source,
      listedOnLcx: g.projects.some((p) => p.listedOnLcx),
      rawPayload: {
        _merged: g.projects.length,
        _sources: [...sources],
        _records: g.projects.map((p) => ({ source: p.source, id: p.esmaTokenId || p.name })),
      },
    };

    // Merge missing fields from other records
    for (const p of sorted.slice(1)) {
      if (!canonical.website && p.website) canonical.website = p.website;
      if (!canonical.ticker && p.ticker) canonical.ticker = p.ticker;
      if (!canonical.chain && p.chain) canonical.chain = p.chain;
      if (!canonical.jurisdiction && p.jurisdiction) canonical.jurisdiction = p.jurisdiction;
      if (!canonical.whitepaperUrl && p.whitepaperUrl) canonical.whitepaperUrl = p.whitepaperUrl;
      if (!canonical.category && p.category) canonical.category = p.category;
      if (!canonical.marketCap && p.marketCap) canonical.marketCap = p.marketCap;
    }

    const confidence: DedupeGroup['confidence'] = signals.some((s) =>
      ['esma_token_match', 'domain_match'].includes(s),
    )
      ? 'high'
      : 'medium';

    return { projects: g.projects, canonical, confidence, signals };
  });

  const singletons = resultGroups.filter((g) => g.projects.length === 1);
  const merged = resultGroups.filter((g) => g.projects.length > 1);

  return { groups: merged, singletons };
}

function fieldCount(p: RawProject): number {
  let count = 0;
  if (p.website) count++;
  if (p.ticker) count++;
  if (p.chain) count++;
  if (p.jurisdiction) count++;
  if (p.whitepaperUrl) count++;
  if (p.category) count++;
  if (p.marketCap) count++;
  if (p.esmaTokenId) count++;
  return count;
}

function firstSourceLabel(s: string): string {
  const labels: Record<string, string> = {
    esma_main: 'esma',
    esma_casp: 'casp',
    esma_emt: 'emt',
    potential: 'pot',
    pre_tge: 'tge',
    pipeline: 'pipe',
    closed: 'won',
    top100: 'top',
    manual: 'm',
  };
  return labels[s] ?? s;
}

/** Bigram Jaccard similarity between two strings (used for name fuzzy matching). */
function bigramOverlap(a: string, b: string): number {
  const biA = bigrams(a);
  const biB = bigrams(b);
  if (biA.size === 0 && biB.size === 0) return 1;
  if (biA.size === 0 || biB.size === 0) return 0;
  let intersection = 0;
  for (const bg of biA) {
    if (biB.has(bg)) intersection++;
  }
  const union = biA.size + biB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function bigrams(s: string): Set<string> {
  const result = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    result.add(s.slice(i, i + 2));
  }
  return result;
}
