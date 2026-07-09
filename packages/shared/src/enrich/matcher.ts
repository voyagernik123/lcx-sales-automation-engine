import type { CoinGeckoCoin } from './coingecko.js';

export interface MatchResult {
  coinId: string | null;
  method: 'ticker_exact' | 'ticker_fuzzy' | 'name_substring' | 'none';
}

/**
 * Match a project to a CoinGecko coin using ticker + name.
 *
 * Strategy:
 *   1. Exact ticker match (case-insensitive) + project name contains coin name
 *   2. Exact ticker match only (first result)
 *   3. Name substring match (project name contains coin name or vice versa)
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
  const nameLower = projectName.toLowerCase().trim();

  // Strategy 1: exact ticker + name contains coin name
  if (tickerUpper) {
    const tickerCandidates = coins.filter((c) => c.symbol.toUpperCase() === tickerUpper);

    if (tickerCandidates.length === 1) {
      return { coinId: tickerCandidates[0].id, method: 'ticker_exact' };
    }

    if (tickerCandidates.length > 1) {
      // Try to disambiguate by name
      const nameMatch = tickerCandidates.find((c) => {
        const coinName = c.name.toLowerCase();
        return nameLower.includes(coinName) || coinName.includes(nameLower);
      });
      if (nameMatch) {
        return { coinId: nameMatch.id, method: 'ticker_fuzzy' };
      }
      // Return first ticker match as fallback
      return { coinId: tickerCandidates[0].id, method: 'ticker_exact' };
    }
  }

  // Strategy 3: name substring match
  if (nameLower.length >= 3) {
    const nameMatch = coins.find((c) => {
      const coinName = c.name.toLowerCase();
      return nameLower.includes(coinName) || coinName.includes(nameLower);
    });
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
