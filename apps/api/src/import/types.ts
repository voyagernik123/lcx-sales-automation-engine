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
  | 'manual';

export function normalizeUrl(raw?: string): string | undefined {
  if (!raw || raw.trim() === '') return undefined;
  let url = raw.trim().toLowerCase();
  // Remove common prefixes noise
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  return url;
}

export function extractDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
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
