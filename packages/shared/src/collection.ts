/**
 * The collection registry — the free-data sensors and how fresh each must stay.
 *
 * One source of truth for the backend collector (what to run, how often) and the
 * frontend coverage surface (which sensors an object has, and whether the data
 * is fresh or stale). Everything here is free-tier: no paid feeds, no keys
 * required beyond optional GitHub/CoinGecko tokens that only raise rate limits.
 */

export interface ConnectorDef {
  /** Connector id, stored in collection_state.source. */
  id: string;
  label: string;
  /** The provenance source id (see SOURCES) this connector writes as. */
  source: string;
  /** How long collected data stays fresh before it's due again. */
  freshnessDays: number;
  /** What it yields, for the coverage surface. */
  yields: string;
}

export const CONNECTORS: ConnectorDef[] = [
  { id: 'defillama', label: 'DefiLlama', source: 'defillama', freshnessDays: 2, yields: 'TVL · multichain reach · category · FDV' },
  { id: 'coinpaprika_detail', label: 'CoinPaprika', source: 'coinpaprika', freshnessDays: 30, yields: 'team · dev status · tags · GitHub' },
  { id: 'github', label: 'GitHub', source: 'github', freshnessDays: 7, yields: 'stars · commit velocity · activity' },
];

export function getConnector(id: string): ConnectorDef | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

/** Is a source stale (or never collected) given its last success and SLA? */
export function isStale(lastOkAt: string | null | undefined, freshnessDays: number, now = Date.now()): boolean {
  if (!lastOkAt) return true;
  const ageDays = (now - new Date(lastOkAt).getTime()) / 86_400_000;
  return ageDays > freshnessDays;
}
