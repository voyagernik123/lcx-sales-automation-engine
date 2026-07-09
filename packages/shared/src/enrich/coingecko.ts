export interface CoinGeckoCoin {
  id: string;
  symbol: string;
  name: string;
  platforms?: Record<string, string>;
}

export interface CoinGeckoMarketData {
  id: string;
  symbol: string;
  name: string;
  marketCapRank: number | null;
  marketCap: number | null;
  totalVolume: number | null;
  currentPrice: number | null;
  priceChange24h: number | null;
  priceChangePercent24h: number | null;
  categories: string[];
  homepage: string;
  twitter: string;
  platforms: Record<string, string>;
}

export interface EnrichmentResult {
  coinId: string;
  matched: boolean;
  marketData: CoinGeckoMarketData | null;
  error?: string;
}

export interface EnrichmentReport {
  attempted: number;
  matched: number;
  failed: number;
  skipped: number;
  matchRate: string;
}

const CG_BASE = 'https://api.coingecko.com/api/v3';
const CG_PRO_BASE = 'https://pro-api.coingecko.com/api/v3';

export type CoinGeckoKeyType = 'demo' | 'pro';

export class CoinGeckoClient {
  private apiKey: string | undefined;
  private keyType: CoinGeckoKeyType;
  private lastRequest = 0;
  private minIntervalMs: number;
  private coinList: CoinGeckoCoin[] | null = null;

  constructor(opts?: { apiKey?: string; keyType?: CoinGeckoKeyType }) {
    this.apiKey = opts?.apiKey;
    this.keyType = opts?.keyType ?? 'demo';
    // demo plan: 30 calls/min; pro: 500/min; keyless public API: ~5-15/min
    this.minIntervalMs = this.apiKey ? (this.keyType === 'pro' ? 200 : 2100) : 6000;
  }

  private buildUrl(path: string): string {
    if (!this.apiKey) return `${CG_BASE}${path}`;
    const base = this.keyType === 'pro' ? CG_PRO_BASE : CG_BASE;
    const param = this.keyType === 'pro' ? 'x_cg_pro_api_key' : 'x_cg_demo_api_key';
    const sep = path.includes('?') ? '&' : '?';
    return `${base}${path}${sep}${param}=${this.apiKey}`;
  }

  private async request<T>(path: string, retries = 3): Promise<T> {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < this.minIntervalMs) {
      await sleep(this.minIntervalMs - elapsed);
    }

    const url = this.buildUrl(path);

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        this.lastRequest = Date.now();
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
        });

        if (res.status === 429) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 30_000);
          console.warn(`[coingecko] 429 rate-limited, backing off ${backoff}ms (attempt ${attempt})`);
          await sleep(backoff);
          continue;
        }

        if (!res.ok) {
          throw new Error(`CoinGecko HTTP ${res.status}: ${res.statusText}`);
        }

        return (await res.json()) as T;
      } catch (err) {
        if (attempt === retries) throw err;
        const backoff = Math.min(1000 * Math.pow(2, attempt), 10_000);
        console.warn(`[coingecko] request failed, retry ${attempt + 1}/${retries} in ${backoff}ms:`, (err as Error).message);
        await sleep(backoff);
      }
    }

    throw new Error('Unreachable');
  }

  async fetchCoinList(): Promise<CoinGeckoCoin[]> {
    if (this.coinList) return this.coinList;
    const data = await this.request<CoinGeckoCoin[]>('/coins/list?include_platform=true');
    this.coinList = data;
    return data;
  }

  async fetchCoinData(coinId: string): Promise<CoinGeckoMarketData> {
    const data = await this.request<{
      id: string;
      symbol: string;
      name: string;
      market_cap_rank: number | null;
      market_data: {
        market_cap: Record<string, number> | null;
        total_volume: Record<string, number> | null;
        current_price: Record<string, number> | null;
        price_change_24h: number | null;
        price_change_percentage_24h: number | null;
      };
      categories: string[];
      links: { homepage: string[]; twitter_screen_name: string };
      platforms: Record<string, string>;
    }>(`/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`);

    const usd = (v: Record<string, number> | null | undefined) => (v ? v.usd ?? null : null);

    return {
      id: data.id,
      symbol: data.symbol,
      name: data.name,
      marketCapRank: data.market_cap_rank,
      marketCap: usd(data.market_data?.market_cap),
      totalVolume: usd(data.market_data?.total_volume),
      currentPrice: usd(data.market_data?.current_price),
      priceChange24h: data.market_data?.price_change_24h ?? null,
      priceChangePercent24h: data.market_data?.price_change_percentage_24h ?? null,
      categories: data.categories || [],
      homepage: (data.links?.homepage || []).find(Boolean) || '',
      twitter: data.links?.twitter_screen_name
        ? `https://twitter.com/${data.links.twitter_screen_name}`
        : '',
      platforms: data.platforms || {},
    };
  }

  clearCoinList(): void {
    this.coinList = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
