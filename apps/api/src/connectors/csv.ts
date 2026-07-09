/**
 * CSV/XLSX seed files exposed as connectors. The file's normalizer runs once
 * at fetch time; the staged payload IS the normalized RawProject, so
 * normalize() is a passthrough and content hashing gates change detection.
 */
import { existsSync } from 'node:fs';
import { squashEntity } from '@lcx/shared';
import { readTabular, type CsvRow } from '../import/csv.js';
import type { ImportSourceResult, ProjectSource, RawPerson, RawProject } from '../import/types.js';
import { extractDomain } from '../import/types.js';
import {
  normalizeEsmaMain, normalizeEsmaCasp, normalizeEsmaEmt,
  normalizePotential, normalizePreTge, normalizePipeline,
  normalizeClosed, normalizeTop100,
} from '../import/normalizers/index.js';
import { contentHash, type Connector, type StagedRecord } from './types.js';

export interface CsvSourceJob {
  label: string;
  source: ProjectSource;
  normalizer: (rows: CsvRow[]) => ImportSourceResult;
}

export const CSV_JOBS: CsvSourceJob[] = [
  { label: 'ESMA Main Leads', source: 'esma_main', normalizer: normalizeEsmaMain },
  { label: 'ESMA CASPs', source: 'esma_casp', normalizer: normalizeEsmaCasp },
  { label: 'ESMA EMT Issuers', source: 'esma_emt', normalizer: normalizeEsmaEmt },
  { label: 'Potential Listings', source: 'potential', normalizer: normalizePotential },
  { label: 'Pre-TGE Tokens', source: 'pre_tge', normalizer: normalizePreTge },
  { label: 'Pipeline History', source: 'pipeline', normalizer: normalizePipeline },
  { label: 'Closed Deals', source: 'closed', normalizer: normalizeClosed },
  { label: 'Top 100 Outreach', source: 'top100', normalizer: normalizeTop100 },
];

const FILE_MAP: Record<string, string> = {
  esma_main: 'ESMA_MiCA_Main_Leads.csv',
  esma_casp: 'ESMA_MiCA_CASPs.csv',
  esma_emt: 'ESMA_MiCA_EMT_Issuers.csv',
  potential: 'potential - token listing - lcx.xlsx',
  pre_tge: 'Pre TGE tokens  - Sheet1.csv',
  pipeline: 'LCX Listings - Pipeline.csv',
  closed: 'LCX Listings - Closed Token Listings.csv',
  top100: 'top_100_crypto_projects_lcx_outreach.csv',
};

function resolveFile(dataDir: string, source: string): string | null {
  const name = FILE_MAP[source];
  if (!name) return null;
  const exact = `${dataDir}/${name}`;
  if (existsSync(exact)) return exact;
  const alts = [
    name.replace(/ - /g, '_'),
    name.replace(/\s+/g, '_'),
    name.replace(/\s+/g, ''),
    name.toLowerCase(),
    name.normalize('NFD').replace(/[^a-zA-Z0-9._ ]/g, ''),
  ];
  for (const alt of [...new Set(alts)]) {
    const p = `${dataDir}/${alt}`;
    if (existsSync(p)) return p;
  }
  return null;
}

/** Stable natural key for a normalized project row. */
export function externalIdFor(p: RawProject): string {
  if (p.esmaTokenId) return `esma:${p.esmaTokenId}`;
  const entryId = (p.rawPayload?.['Entry ID'] as string | undefined)?.trim();
  if (entryId) return `entry:${entryId}`;
  return `key:${squashEntity(p.name)}|${extractDomain(p.website) ?? ''}`;
}

export interface LoadedCsvSource {
  job: CsvSourceJob;
  connector: Connector;
  /** People with the externalId of the project row they came from. */
  people: { extId: string; person: RawPerson }[];
  rawRows: number;
  normalized: number;
  errors: string[];
  fileFound: boolean;
}

export async function loadCsvSource(dataDir: string, job: CsvSourceJob): Promise<LoadedCsvSource> {
  const fp = resolveFile(dataDir, job.source);
  if (!fp) {
    return {
      job,
      connector: { name: job.source, fetch: async function* () {}, normalize: () => null },
      people: [],
      rawRows: 0,
      normalized: 0,
      errors: ['file not found'],
      fileFound: false,
    };
  }

  const rows = (await readTabular(fp)) as CsvRow[];
  const result = job.normalizer(rows);

  // externalId ← normalized project; dedupe identical keys within the file
  const records: StagedRecord[] = [];
  const seen = new Set<string>();
  const extIdByRawJson = new Map<string, string>();
  for (const p of result.projects) {
    const extId = externalIdFor(p);
    extIdByRawJson.set(JSON.stringify(p.rawPayload), extId);
    if (seen.has(extId)) continue;
    seen.add(extId);
    const payload = { ...p } as unknown as Record<string, unknown>;
    records.push({ externalId: extId, payload, contentHash: contentHash(payload) });
  }

  const people = result.people
    .map(({ projectRaw, person }) => {
      const extId = extIdByRawJson.get(JSON.stringify(projectRaw));
      return extId ? { extId, person } : null;
    })
    .filter(Boolean) as { extId: string; person: RawPerson }[];

  const connector: Connector = {
    name: job.source,
    fetch: async function* () {
      yield records;
    },
    normalize: (rec) => rec.payload as unknown as RawProject,
  };

  return {
    job,
    connector,
    people,
    rawRows: result.rawCount,
    normalized: result.projects.length,
    errors: result.errors.slice(0, 20),
    fileFound: true,
  };
}
