/**
 * Normalized project shape produced by every normalizer.
 */
export interface RawProject {
  name: string;
  website?: string;
  ticker?: string;
  chain?: string;
  source: ProjectSource;
  esmaTokenId?: string;
  dti?: string;
  jurisdiction?: string;
  whitepaperUrl?: string;
  category?: string;
  marketCap?: string;
  listedOnLcx: boolean;
  rawPayload: Record<string, unknown>;
}

export interface RawPerson {
  name: string;
  title?: string;
  linkedin?: string;
  email?: string;
  telegram?: string;
}

export interface ImportSourceResult {
  source: ProjectSource;
  rawCount: number;
  projects: RawProject[];
  people: { projectRaw: Record<string, unknown>; person: RawPerson }[];
  errors: string[];
}

export type ProjectSource =
  | 'esma_main'
  | 'esma_casp'
  | 'esma_emt'
  | 'potential'
  | 'pre_tge'
  | 'pipeline'
  | 'closed'
  | 'top100'
  | 'manual'
  // Continuous universe connectors
  | 'coinpaprika'
  | 'coingecko'
  | 'defillama'
  | 'geckoterminal_new'
  | 'esma_registry';

export function normalizeUrl(raw?: string): string | undefined {
  if (!raw || raw.trim() === '') return undefined;
  let url = raw.trim().toLowerCase();
  // Free-text junk ("TBD", postal addresses, company names) is not a URL
  if (/\s/.test(url) || !url.includes('.')) return undefined;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  return url;
}

/**
 * Hosts shared by many unrelated projects — never usable as an identity key
 * (a "domain match" on twitter.com would merge strangers).
 */
const SHARED_HOSTS = new Set([
  'twitter.com', 'x.com', 't.me', 'telegram.me', 'linkedin.com', 'linktr.ee',
  'github.com', 'medium.com', 'coingecko.com', 'coinmarketcap.com',
  'discord.gg', 'discord.com', 'youtube.com', 'facebook.com', 'instagram.com',
  'notion.site', 'gitbook.io', 'docs.google.com',
]);

export function extractDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    // Junk like "TBD"/"n/a" parses as a dotless hostname — not a real domain
    if (!host.includes('.')) return undefined;
    if (SHARED_HOSTS.has(host)) return undefined;
    return host;
  } catch {
    return undefined;
  }
}

export function cleanTicker(raw?: string): string | undefined {
  if (!raw || raw.trim() === '') return undefined;
  return raw.trim().replace(/^\$/, '').toUpperCase();
}

export function normalizeName(raw?: string): string {
  if (!raw || raw.trim() === '') return 'UNKNOWN';
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}
