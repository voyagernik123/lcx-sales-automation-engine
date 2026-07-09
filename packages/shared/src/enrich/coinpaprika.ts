/**
 * CoinPaprika client — free, no key. The /tickers endpoint returns every
 * active coin (~40k+) with market data in a single call, which makes it the
 * universe backbone: one call a day covers what would cost thousands of
 * per-coin calls elsewhere.
 */

export interface PaprikaTicker {
  id: string; // e.g. "btc-bitcoin"
  name: string;
  symbol: string;
  rank: number;
  total_supply: number | null;
  max_supply: number | null;
  beta_value: number | null;
  first_data_at: string | null;
  last_updated: string | null;
  quotes?: {
    USD?: {
      price: number | null;
      volume_24h: number | null;
      market_cap: number | null;
      percent_change_30d: number | null;
      percent_change_24h: number | null;
    };
  };
}

export interface PaprikaCoin {
  id: string;
  name: string;
  symbol: string;
  rank: number;
  is_new: boolean;
  is_active: boolean;
  type: string; // coin | token
}

const BASE = 'https://api.coinpaprika.com/v1';

export class CoinPaprikaClient {
  private lastRequest = 0;
  private minIntervalMs = 1200; // free tier: be polite

  private async request<T>(path: string, retries = 3): Promise<T> {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < this.minIntervalMs) {
      await sleep(this.minIntervalMs - elapsed);
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        this.lastRequest = Date.now();
        const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' } });
        if (res.status === 429) {
          const backoff = Math.min(2000 * Math.pow(2, attempt), 60_000);
          await sleep(backoff);
          continue;
        }
        if (!res.ok) throw new Error(`CoinPaprika HTTP ${res.status}: ${res.statusText}`);
        return (await res.json()) as T;
      } catch (err) {
        if (attempt === retries) throw err;
        await sleep(Math.min(1000 * Math.pow(2, attempt), 10_000));
      }
    }
    throw new Error('Unreachable');
  }

  /** All active tickers with USD quotes — ONE call. */
  fetchAllTickers(): Promise<PaprikaTicker[]> {
    return this.request<PaprikaTicker[]>('/tickers?quotes=USD');
  }

  /** Full coin list (includes inactive) — one call. */
  fetchCoins(): Promise<PaprikaCoin[]> {
    return this.request<PaprikaCoin[]>('/coins');
  }

  /** Exchange listings for one coin (on-demand; cheap budget). */
  fetchCoinExchanges(coinId: string): Promise<{ exchanges?: unknown[] }[]> {
    return this.request(`/coins/${coinId}/markets?quotes=USD`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
