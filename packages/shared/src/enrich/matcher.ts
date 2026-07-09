import type { CoinGeckoCoin } from './coingecko.js';

export interface MatchResult {
  coinId: string | null;
  method: 'ticker_exact' | 'ticker_fuzzy' | 'name_substring' | 'none';
}

/** Collapse to lowercase alphanumerics: "Bera Chain" → "berachain". */
function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Squash after dropping corporate-entity words: "Ether.Fi Foundation" → "etherfi". */
const CORP_WORDS =
  /\b(foundation|stiftung|association|labs?|inc|llc|ltd|limited|gmbh|ag|sa|sezc|pty|uab|oy|dao)\b/gi;
function squashEntity(s: string): string {
  return squash(s.replace(CORP_WORDS, ' '));
}

/**
 * Match a project to a CoinGecko coin using ticker + name.
 *
 * Strategy:
 *   1. Exact ticker match (case-insensitive); ambiguous symbols are
 *      disambiguated by normalized-name equality
 *   2. Normalized name equality, with corporate suffixes stripped
 *      ("Bera Chain Foundation" → "berachain" → coin "Berachain")
 *
 * Substring matching is deliberately NOT used: with 17k+ coins the first
 * substring hit is usually wrong ("Berachain" contains coin "Achain"), and a
 * wrong market cap silently corrupts scoring. Prefer no match over a bad one.
 */
export function matchProject(
  projectName: string,
  ticker: string | undefined,
  coins: CoinGeckoCoin[],
): MatchResult {
  if (!ticker && !projectName) {
    return { coinId: null, method: 'none' };
  }

  const tickerUpper = ticker?.toUpperCase().trim();
  const nameSquashed = squash(projectName);
  const nameEntity = squashEntity(projectName);

  const namesEqual = (coinName: string): boolean => {
    const coinSquashed = squash(coinName);
    if (coinSquashed.length === 0) return false;
    return coinSquashed === nameSquashed || coinSquashed === nameEntity;
  };

  // Strategy 1: exact ticker match
  if (tickerUpper) {
    const tickerCandidates = coins.filter((c) => c.symbol.toUpperCase() === tickerUpper);

    if (tickerCandidates.length === 1) {
      return { coinId: tickerCandidates[0].id, method: 'ticker_exact' };
    }

    if (tickerCandidates.length > 1) {
      // Disambiguate colliding symbols by name
      const nameMatch = tickerCandidates.find((c) => namesEqual(c.name));
      if (nameMatch) {
        return { coinId: nameMatch.id, method: 'ticker_fuzzy' };
      }
      // Ambiguous symbol with no name corroboration — a wrong coin's market
      // data is worse than none, so don't guess
      return { coinId: null, method: 'none' };
    }
  }

  // Strategy 2: normalized name equality
  if (nameSquashed.length >= 3) {
    const nameMatch = coins.find((c) => namesEqual(c.name));
    if (nameMatch) {
      return { coinId: nameMatch.id, method: 'name_substring' };
    }
  }

  return { coinId: null, method: 'none' };
}

export function buildMatchIndex(coins: CoinGeckoCoin[]): Map<string, CoinGeckoCoin[]> {
  const index = new Map<string, CoinGeckoCoin[]>();
  for (const coin of coins) {
    const sym = coin.symbol.toUpperCase();
    if (!index.has(sym)) index.set(sym, []);
    index.get(sym)!.push(coin);
  }
  return index;
}
