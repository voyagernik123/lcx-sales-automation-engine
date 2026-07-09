import type { CsvRow } from './csv.js';
import { readTabular } from './csv.js';
import type { ImportSourceResult } from './types.js';
import {
  normalizeEsmaMain,
  normalizeEsmaCasp,
  normalizeEsmaEmt,
  normalizePotential,
  normalizePreTge,
  normalizePipeline,
  normalizeClosed,
  normalizeTop100,
} from './normalizers/index.js';
import { dedupeProjects } from './dedupe.js';
import type { RawProject, RawPerson, ProjectSource } from './types.js';
import { existsSync } from 'node:fs';

export interface ImportJob {
  label: string;
  source: ProjectSource;
  filePath: string;
  normalizer: (rows: CsvRow[]) => ImportSourceResult;
}

export interface ImportReport {
  jobs: {
    label: string;
    source: ProjectSource;
    rawRows: number;
    normalized: number;
    errors: string[];
    people: number;
  }[];
  dedupe: {
    inputProjects: number;
    groups: number;
    singletons: number;
    merged: number;
    mergeRate: number;
  };
  total: {
    projects: number;
    people: number;
  };
}

const DEFAULT_JOBS: ImportJob[] = [
  { label: 'ESMA Main Leads', source: 'esma_main', filePath: 'esma_main', normalizer: normalizeEsmaMain },
  { label: 'ESMA CASPs', source: 'esma_casp', filePath: 'esma_casp', normalizer: normalizeEsmaCasp },
  { label: 'ESMA EMT Issuers', source: 'esma_emt', filePath: 'esma_emt', normalizer: normalizeEsmaEmt },
  { label: 'Potential Listings', source: 'potential', filePath: 'potential', normalizer: normalizePotential },
  { label: 'Pre-TGE Tokens', source: 'pre_tge', filePath: 'pre_tge', normalizer: normalizePreTge },
  { label: 'Pipeline History', source: 'pipeline', filePath: 'pipeline', normalizer: normalizePipeline },
  { label: 'Closed Deals', source: 'closed', filePath: 'closed', normalizer: normalizeClosed },
  { label: 'Top 100 Outreach', source: 'top100', filePath: 'top100', normalizer: normalizeTop100 },
];

const FILE_MAP: Partial<Record<ProjectSource, string>> = {
  esma_main: 'ESMA_MiCA_Main_Leads.csv',
  esma_casp: 'ESMA_MiCA_CASPs.csv',
  esma_emt: 'ESMA_MiCA_EMT_Issuers.csv',
  potential: 'potential - token listing - lcx.xlsx',
  pre_tge: 'Pre TGE tokens  - Sheet1.csv',
  pipeline: 'LCX Listings - Pipeline.csv',
  closed: 'LCX Listings - Closed Token Listings.csv',
  top100: 'top_100_crypto_projects_lcx_outreach.csv',
  manual: '',
};

function resolveFile(dataDir: string, source: ProjectSource): string | null {
  const name = FILE_MAP[source];
  if (!name) return null;

  const exact = `${dataDir}/${name}`;
  if (existsSync(exact)) return exact;

  // Try alternative naming conventions
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

async function loadSource(
  dataDir: string,
  job: ImportJob,
): Promise<{ result?: ImportSourceResult; error?: string }> {
  const fp = resolveFile(dataDir, job.source);
  if (!fp) {
    return { error: `file not found` };
  }
  try {
    const rows = await readTabular(fp);
    const result = job.normalizer(rows as CsvRow[]);
    return { result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Read all available seed files and normalize them.
 */
export async function normalizeAll(
  dataDir: string,
  jobs?: ImportJob[],
): Promise<{
  allProjects: RawProject[];
  allPeople: { projectRaw: Record<string, unknown>; person: RawPerson }[];
  reports: ImportReport['jobs'][0][];
}> {
  const targetJobs = jobs ?? DEFAULT_JOBS;
  const allProjects: RawProject[] = [];
  const allPeople: { projectRaw: Record<string, unknown>; person: RawPerson }[] = [];
  const reports: ImportReport['jobs'][0][] = [];

  for (const job of targetJobs) {
    const { result, error } = await loadSource(dataDir, job);

    if (error || !result) {
      console.warn(`[import] ${job.label}: ${error ?? 'unknown error'} in ${dataDir}`);
      reports.push({
        label: job.label,
        source: job.source,
        rawRows: 0,
        normalized: 0,
        errors: error ? [error] : [],
        people: 0,
      });
      continue;
    }

    allProjects.push(...result.projects);
    allPeople.push(...result.people);

    reports.push({
      label: job.label,
      source: job.source,
      rawRows: result.rawCount,
      normalized: result.projects.length,
      errors: result.errors.slice(0, 20),
      people: result.people.length,
    });

    if (result.errors.length > 0) {
      console.warn(`[import] ${job.label}: ${result.errors.length} parse errors (first 3 shown)`);
      for (const e of result.errors.slice(0, 3)) console.warn(`  ${e}`);
    }

    console.log(
      `[import] ${job.label}: ${result.rawCount} rows → ${result.projects.length} projects + ${result.people.length} people`,
    );
  }

  return { allProjects, allPeople, reports };
}

export function dedupeBatch(projects: RawProject[]) {
  return dedupeProjects(projects);
}

export function buildReport(
  jobReports: ImportReport['jobs'][0][],
  dedupeResult: ReturnType<typeof dedupeProjects>,
): ImportReport {
  const totalNorm = jobReports.reduce((s, r) => s + r.normalized, 0);

  return {
    jobs: jobReports,
    dedupe: {
      inputProjects: totalNorm,
      groups: dedupeResult.groups.length,
      singletons: dedupeResult.singletons.length,
      merged: totalNorm - dedupeResult.singletons.length,
      mergeRate:
        totalNorm > 0
          ? Math.round((1 - dedupeResult.singletons.length / totalNorm) * 100)
          : 0,
    },
    total: {
      projects: dedupeResult.groups.length + dedupeResult.singletons.length,
      people: jobReports.reduce((s, r) => s + r.people, 0),
    },
  };
}
