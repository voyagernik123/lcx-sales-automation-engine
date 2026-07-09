import { describe, expect, it } from 'vitest';
import { matchProject } from './matcher.js';
import type { CoinGeckoCoin } from './coingecko.js';

const coins: CoinGeckoCoin[] = [
  { id: 'achain', symbol: 'act', name: 'Achain' },
  { id: 'berachain-bera', symbol: 'bera', name: 'Berachain' },
  { id: 'chain-2', symbol: 'xcn', name: 'Chain' },
  { id: 'ether-fi', symbol: 'ethfi', name: 'Ether.fi' },
  { id: 'gambit-1', symbol: 'gmt', name: 'Gambit' },
  { id: 'stepn', symbol: 'gmt', name: 'STEPN' },
  { id: 'plume', symbol: 'plume', name: 'Plume' },
] as CoinGeckoCoin[];

describe('matchProject', () => {
  it('matches by unique ticker', () => {
    expect(matchProject('Plume Network', 'PLUME', coins)).toEqual({
      coinId: 'plume',
      method: 'ticker_exact',
    });
  });

  it('disambiguates colliding tickers by name', () => {
    expect(matchProject('STEPN', 'GMT', coins)).toEqual({
      coinId: 'stepn',
      method: 'ticker_fuzzy',
    });
  });

  it('refuses to guess between colliding tickers without name corroboration', () => {
    expect(matchProject('Some Unrelated Project', 'GMT', coins)).toEqual({
      coinId: null,
      method: 'none',
    });
  });

  it('does NOT substring-match Berachain to Achain (regression)', () => {
    const result = matchProject('Berachain', undefined, coins);
    expect(result.coinId).toBe('berachain-bera');
  });

  it('does NOT match projects that merely contain a coin name', () => {
    // "Chain" is a real coin; anything containing the word must not match it
    expect(matchProject('Supply Chain Ventures', undefined, coins).coinId).toBeNull();
  });

  it('matches normalized names across spacing and corporate suffixes', () => {
    expect(matchProject('Bera Chain Foundation', undefined, coins).coinId).toBe('berachain-bera');
    expect(matchProject('Ether.Fi SEZC', undefined, coins).coinId).toBe('ether-fi');
  });

  it('returns none when nothing matches', () => {
    expect(matchProject('Crypto Risk Metrics GmbH', undefined, coins)).toEqual({
      coinId: null,
      method: 'none',
    });
  });
});
