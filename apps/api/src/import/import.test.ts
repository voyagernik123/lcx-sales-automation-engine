import { describe, expect, it } from 'vitest';
import { readCsv, readXlsx, parseCsvLine } from './csv.js';
import { normalizeEsmaMain } from './normalizers/esma-main.js';
import { normalizePipeline } from './normalizers/pipeline.js';
import { normalizeTop100 } from './normalizers/top100.js';
import { normalizePreTge } from './normalizers/pre-tge.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedupeProjects } from './dedupe.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, 'fixtures');

describe('CSV parser', () => {
  it('parses a single CSV line with quotes', () => {
    const line = '"a","b","c"';
    expect(parseCsvLine(line)).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted commas', () => {
    const line = '"a,b","c"';
    expect(parseCsvLine(line)).toEqual(['a,b', 'c']);
  });

  it('handles empty fields', () => {
    const line = 'a,,c';
    const result = parseCsvLine(line);
    expect(result).toEqual(['a', '', 'c']);
  });

  it('handles BOM prefix', () => {
    const line = '\ufeffa,b,c';
    expect(parseCsvLine(line)).toEqual(['a', 'b', 'c']);
  });
});

describe('ESMA Main normalizer', () => {
  it('parses sample CSV', async () => {
    const rows = await readCsv(`${FIXTURES}/sample-esma-main.csv`);
    expect(rows.length).toBe(3);
    const result = normalizeEsmaMain(rows);
    expect(result.projects.length).toBe(3);
    expect(result.projects[0].name).toBe('Test Project A');
    expect(result.projects[0].esmaTokenId).toBe('TKN001');
    // Listed row
    const listed = result.projects.find((p) => p.name === 'Test Project C');
    expect(listed?.listedOnLcx).toBe(true);
    // People from row 3
    expect(result.people.length).toBe(1);
    expect(result.people[0].person.email).toBe('alice@example.com');
  });

  it('handles empty name gracefully', async () => {
    const rows = await readCsv(`${FIXTURES}/sample-esma-main.csv`);
    // Create a row with empty name
    rows.push({
      '#': '4',
      'Competent Authority (NCA)': 'CNMV',
      'Issuer / Company Name': '',
      'Issuer Country': 'ES',
      'Token ID (FFG)': 'TKN004',
    });
    const result = normalizeEsmaMain(rows);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('Pipeline normalizer', () => {
  it('parses pipeline CSV with Telegram contacts', async () => {
    const rows = await readCsv(`${FIXTURES}/sample-pipeline.csv`);
    expect(rows.length).toBe(2);
    const result = normalizePipeline(rows);
    expect(result.projects.length).toBe(2);
    // Pipeline rows are prospects, not listings (Won rows arrive via 'closed')
    expect(result.projects[0].listedOnLcx).toBe(false);
    // People come from the project's Contact Details, never the internal Owner
    expect(result.people.length).toBe(2);
    expect(result.people[0].person.telegram).toBe('@token_one_telegram');
    expect(result.people[0].person.name).not.toBe('Jatin');
    expect(result.people[1].person.email).toBe('alice@token2.com');
  });
});

describe('Top100 normalizer', () => {
  it('parses top100 with contacts', async () => {
    const rows = await readCsv(`${FIXTURES}/sample-top100.csv`);
    expect(rows.length).toBe(2);
    const result = normalizeTop100(rows);
    expect(result.projects.length).toBe(2);
    expect(result.projects[0].name).toBe('Flying Tulip');
    expect(result.people.length).toBe(2);
    expect(result.people[0].person.linkedin).toBe('https://linkedin.com/company/ft');
  });
});

describe('Pre-TGE normalizer', () => {
  it('parses pre-TGE sheet', async () => {
    const rows = await readCsv(`${FIXTURES}/sample-pre-tge.csv`);
    expect(rows.length).toBe(2);
    const result = normalizePreTge(rows);
    expect(result.projects.length).toBe(2);
    expect(result.projects[0].name).toBe('ProjectX');
  });
});

describe('Dedupe engine', () => {
  it('dedupes by esmaTokenId', () => {
    const projects = [
      {
        name: 'Alpha Protocol',
        website: undefined,
        ticker: 'ALPHA',
        chain: undefined,
        source: 'esma_main' as const,
        esmaTokenId: 'TKN001',
        dti: undefined,
        jurisdiction: 'DE',
        whitepaperUrl: 'https://wp.example.com/a',
        category: undefined,
        marketCap: undefined,
        listedOnLcx: false,
        rawPayload: {},
      },
      {
        name: 'Alpha Protocol', // Same name, same token ID
        website: undefined,
        ticker: 'ALPHA',
        chain: undefined,
        source: 'pipeline' as const,
        esmaTokenId: 'TKN001',
        dti: undefined,
        jurisdiction: undefined,
        whitepaperUrl: undefined,
        category: undefined,
        marketCap: undefined,
        listedOnLcx: true,
        rawPayload: {},
      },
      {
        name: 'Zeta Token',
        website: 'https://zeta.io',
        ticker: 'ZETA',
        chain: undefined,
        source: 'top100' as const,
        esmaTokenId: undefined,
        dti: undefined,
        jurisdiction: undefined,
        whitepaperUrl: undefined,
        category: 'DeFi',
        marketCap: '$10M',
        listedOnLcx: false,
        rawPayload: {},
      },
    ];

    const result = dedupeProjects(projects);
    // Alpha Protocol should merge (2 records → 1 group)
    expect(result.groups.length).toBe(1);
    expect(result.singletons.length).toBe(1); // Zeta is solo
    expect(result.groups[0].confidence).toBe('high');
    // Canonical should have merged fields
    expect(result.groups[0].canonical.listedOnLcx).toBe(true); // merged from pipeline
  });

  it('handles no duplicates', () => {
    const projects = [
      {
        name: 'Unique A',
        website: 'https://a.com',
        ticker: 'AAA',
        chain: undefined,
        source: 'esma_main' as const,
        esmaTokenId: 'TKN-A',
        dti: undefined,
        jurisdiction: 'DE',
        whitepaperUrl: undefined,
        category: undefined,
        marketCap: undefined,
        listedOnLcx: false,
        rawPayload: {},
      },
      {
        name: 'Unique B',
        website: 'https://b.com',
        ticker: 'BBB',
        chain: undefined,
        source: 'top100' as const,
        esmaTokenId: 'TKN-B',
        dti: undefined,
        jurisdiction: undefined,
        whitepaperUrl: undefined,
        category: undefined,
        marketCap: undefined,
        listedOnLcx: false,
        rawPayload: {},
      },
    ];

    const result = dedupeProjects(projects);
    expect(result.groups.length).toBe(0);
    expect(result.singletons.length).toBe(2);
  });

  it('matches by domain', () => {
    const projects = [
      {
        name: 'Same Domain Inc',
        website: 'https://samedomain.com',
        ticker: 'SAME',
        chain: undefined,
        source: 'esma_main' as const,
        esmaTokenId: 'TKN-S1',
        dti: undefined,
        jurisdiction: undefined,
        whitepaperUrl: undefined,
        category: undefined,
        marketCap: undefined,
        listedOnLcx: false,
        rawPayload: {},
      },
      {
        name: 'Same Domain LLC',
        website: 'https://samedomain.com',
        ticker: undefined,
        chain: undefined,
        source: 'pipeline' as const,
        esmaTokenId: 'TKN-S2',
        dti: undefined,
        jurisdiction: undefined,
        whitepaperUrl: undefined,
        category: undefined,
        marketCap: undefined,
        listedOnLcx: true,
        rawPayload: {},
      },
    ];

    const result = dedupeProjects(projects);
    expect(result.groups.length).toBe(1);
    expect(result.groups[0].signals).toContain('domain_match');
  });
});
