/**
 * DefiLlama client — fully free, no key.
 *  /protocols     → every DeFi protocol with TVL, category, chains (1 call)
 *  /raises        → funding rounds (1 call) — funding recency is one of the
 *                   strongest willingness-to-pay signals we have.
 */

export interface LlamaProtocol {
  id: string;
  name: string;
  symbol: string | null; // "-" when none
  url: string | null;
  category: string | null;
  chains: string[];
  tvl: number | null;
  listedAt: number | null; // unix seconds
  twitter: string | null;
}

export interface LlamaRaise {
  date: number; // unix seconds
  name: string;
  round: string | null;
  amount: number | null; // in millions USD
  category: string | null;
  leadInvestors: string[];
  otherInvestors: string[];
  defillamaId?: string | null;
}

export class DefiLlamaClient {
  private lastRequest = 0;
  private minIntervalMs = 1000;

  private async request<T>(url: string, retries = 3): Promise<T> {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < this.minIntervalMs) {
      await sleep(this.minIntervalMs - elapsed);
    }
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        this.lastRequest = Date.now();
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (res.status === 429) {
          await sleep(Math.min(2000 * Math.pow(2, attempt), 30_000));
          continue;
        }
        if (!res.ok) throw new Error(`DefiLlama HTTP ${res.status}: ${res.statusText}`);
        return (await res.json()) as T;
      } catch (err) {
        if (attempt === retries) throw err;
        await sleep(Math.min(1000 * Math.pow(2, attempt), 10_000));
      }
    }
    throw new Error('Unreachable');
  }

  fetchProtocols(): Promise<LlamaProtocol[]> {
    return this.request<LlamaProtocol[]>('https://api.llama.fi/protocols');
  }

  async fetchRaises(): Promise<LlamaRaise[]> {
    const data = await this.request<{ raises: LlamaRaise[] }>('https://api.llama.fi/raises');
    return data.raises ?? [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
