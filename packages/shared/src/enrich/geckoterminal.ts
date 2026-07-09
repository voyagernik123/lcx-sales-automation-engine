/**
 * GeckoTerminal client — free, no key, 30 calls/min. Used for new-token
 * discovery: recently created DEX pools per network.
 */

export interface GtNewPool {
  poolAddress: string;
  name: string; // "TOKEN / WETH"
  network: string;
  baseTokenAddress: string | null;
  baseTokenName: string | null;
  baseTokenSymbol: string | null;
  reserveUsd: number | null;
  volume24hUsd: number | null;
  createdAt: string | null;
}

const BASE = 'https://api.geckoterminal.com/api/v2';

interface GtPoolResource {
  id: string;
  attributes: {
    address: string;
    name: string;
    reserve_in_usd: string | null;
    volume_usd?: { h24?: string | null };
    pool_created_at: string | null;
  };
  relationships?: {
    base_token?: { data?: { id?: string } };
  };
}

interface GtTokenResource {
  id: string;
  attributes: { address: string; name: string; symbol: string };
}

export class GeckoTerminalClient {
  private lastRequest = 0;
  private minIntervalMs = 2100; // 30/min

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
          await sleep(Math.min(3000 * Math.pow(2, attempt), 60_000));
          continue;
        }
        if (!res.ok) throw new Error(`GeckoTerminal HTTP ${res.status}: ${res.statusText}`);
        return (await res.json()) as T;
      } catch (err) {
        if (attempt === retries) throw err;
        await sleep(Math.min(1000 * Math.pow(2, attempt), 10_000));
      }
    }
    throw new Error('Unreachable');
  }

  /** Newest pools on a network, one page (20 pools). */
  async fetchNewPools(network: string, page = 1): Promise<GtNewPool[]> {
    const data = await this.request<{ data: GtPoolResource[]; included?: GtTokenResource[] }>(
      `/networks/${network}/new_pools?page=${page}&include=base_token`,
    );
    const tokensById = new Map((data.included ?? []).map((t) => [t.id, t]));
    return (data.data ?? []).map((p) => {
      const baseId = p.relationships?.base_token?.data?.id;
      const base = baseId ? tokensById.get(baseId) : undefined;
      return {
        poolAddress: p.attributes.address,
        name: p.attributes.name,
        network,
        baseTokenAddress: base?.attributes.address ?? null,
        baseTokenName: base?.attributes.name ?? null,
        baseTokenSymbol: base?.attributes.symbol ?? null,
        reserveUsd: p.attributes.reserve_in_usd ? Number(p.attributes.reserve_in_usd) : null,
        volume24hUsd: p.attributes.volume_usd?.h24 ? Number(p.attributes.volume_usd.h24) : null,
        createdAt: p.attributes.pool_created_at,
      };
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
