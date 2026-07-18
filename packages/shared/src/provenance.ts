/**
 * Provenance — the backbone of the intelligence spine.
 *
 * Every fact the platform learns is an Observation carrying WHERE it came from
 * (source), HOW trustworthy the source is (reliability, Admiralty A–F), HOW
 * credible the specific claim is (credibility, Admiralty 1–6), and a derived
 * 0–100 confidence that also decays with staleness. This lets any score or view
 * trace back to sourced evidence, and lets the desk read data quality at a
 * glance instead of trusting a black-box number.
 */

export type Reliability = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type Credibility = 1 | 2 | 3 | 4 | 5 | 6;

/** Admiralty (NATO) source-reliability scale. */
export const RELIABILITY_LABEL: Record<Reliability, string> = {
  A: 'Completely reliable',
  B: 'Usually reliable',
  C: 'Fairly reliable',
  D: 'Not usually reliable',
  E: 'Unreliable',
  F: 'Reliability unknown',
};

/** Admiralty information-credibility scale. */
export const CREDIBILITY_LABEL: Record<Credibility, string> = {
  1: 'Confirmed by other sources',
  2: 'Probably true',
  3: 'Possibly true',
  4: 'Doubtful',
  5: 'Improbable',
  6: 'Cannot be judged',
};

export type SourceKind =
  | 'onchain' | 'market' | 'dev' | 'governance' | 'social' | 'news' | 'internal' | 'manual';

export interface SourceDef {
  id: string;
  label: string;
  kind: SourceKind;
  /** Default reliability when a writer doesn't specify one. */
  defaultReliability: Reliability;
  homepage?: string;
}

/** Canonical source registry — the free-data stack from the 100x plan + internal. */
export const SOURCES: Record<string, SourceDef> = {
  manual: { id: 'manual', label: 'Operator', kind: 'manual', defaultReliability: 'B' },
  internal: { id: 'internal', label: 'LCX model', kind: 'internal', defaultReliability: 'B' },
  coingecko: { id: 'coingecko', label: 'CoinGecko', kind: 'market', defaultReliability: 'A', homepage: 'https://www.coingecko.com' },
  coinpaprika: { id: 'coinpaprika', label: 'CoinPaprika', kind: 'market', defaultReliability: 'B', homepage: 'https://coinpaprika.com' },
  defillama: { id: 'defillama', label: 'DefiLlama', kind: 'onchain', defaultReliability: 'A', homepage: 'https://defillama.com' },
  thegraph: { id: 'thegraph', label: 'The Graph', kind: 'onchain', defaultReliability: 'B', homepage: 'https://thegraph.com' },
  dexscreener: { id: 'dexscreener', label: 'DEX Screener', kind: 'market', defaultReliability: 'B', homepage: 'https://dexscreener.com' },
  etherscan: { id: 'etherscan', label: 'Etherscan', kind: 'onchain', defaultReliability: 'A', homepage: 'https://etherscan.io' },
  rpc: { id: 'rpc', label: 'On-chain RPC', kind: 'onchain', defaultReliability: 'A' },
  github: { id: 'github', label: 'GitHub', kind: 'dev', defaultReliability: 'A', homepage: 'https://github.com' },
  snapshot: { id: 'snapshot', label: 'Snapshot', kind: 'governance', defaultReliability: 'B', homepage: 'https://snapshot.org' },
  tally: { id: 'tally', label: 'Tally', kind: 'governance', defaultReliability: 'B', homepage: 'https://www.tally.xyz' },
  news: { id: 'news', label: 'News', kind: 'news', defaultReliability: 'C' },
};

/** Look up a source; unknown ids degrade to an F-reliability manual stub. */
export function getSource(id: string): SourceDef {
  return SOURCES[id] ?? { id, label: id, kind: 'manual', defaultReliability: 'F' };
}

/**
 * Derive a 0–100 confidence from Admiralty reliability × credibility, decayed by
 * staleness. Reliability A..F maps 1.0..0.0; credibility 1..6 maps 1.0..0.0; the
 * base is their mean, then multiplied by a freshness factor that halves every
 * `halfLifeDays`. Deterministic and pure — safe for the free-tier mandate.
 */
export function confidenceFrom(
  reliability: Reliability,
  credibility: Credibility,
  freshnessDays = 0,
  halfLifeDays = 30,
): number {
  const relScore = ('F'.charCodeAt(0) - reliability.charCodeAt(0)) / 5; // A=1 … F=0
  const credScore = (6 - credibility) / 5; // 1=1 … 6=0
  const base = (relScore + credScore) / 2;
  const decay = halfLifeDays > 0 ? Math.pow(0.5, Math.max(0, freshnessDays) / halfLifeDays) : 1;
  return Math.round(Math.max(0, Math.min(1, base)) * decay * 100);
}

/** A single sourced fact about an ontology object (client-facing shape). */
export interface Observation {
  id: string;
  subjectType: string;
  subjectId: string;
  predicate: string;
  value: unknown;
  valueNum: number | null;
  unit: string | null;
  source: string;
  sourceUrl: string | null;
  reliability: Reliability;
  credibility: Credibility;
  confidence: number;
  observedAt: string;
  collectedAt: string;
  actor: string | null;
}
