import type { CsvRow } from '../csv.js';
import type { ImportSourceResult, RawProject } from '../types.js';
import { normalizeUrl } from '../types.js';

/** ESMA_MiCA_CASPs.csv — 231 licensed CASPs (partner intel, not listing leads) */
export function normalizeEsmaCasp(rows: CsvRow[]): ImportSourceResult {
  const source = 'esma_casp' as const;
  const projects: RawProject[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const name = r['CASP Name']?.trim() || r['Commercial Name']?.trim();
      if (!name) {
        errors.push(`Row ${i + 2}: empty CASP name`);
        continue;
      }

      projects.push({
        name,
        website: normalizeUrl(r['Website']),
        ticker: undefined,
        chain: undefined,
        source,
        jurisdiction: r['Home Country'] || r['Country'] || undefined,
        category: 'casp',
        marketCap: undefined,
        listedOnLcx: false,
        rawPayload: { ...r },
      });
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { source, rawCount: rows.length, projects, people: [], errors };
}
