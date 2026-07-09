import type { CsvRow } from '../csv.js';
import type { ImportSourceResult, RawProject } from '../types.js';
import { normalizeUrl, cleanTicker } from '../types.js';

/** Pre TGE tokens - Sheet1.csv — ~266 pre-launch tokens */
export function normalizePreTge(rows: CsvRow[]): ImportSourceResult {
  const source = 'pre_tge' as const;
  const projects: RawProject[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const name = (r['Name'] || r['Project'] || r['Token'] || '').trim();
      if (!name) {
        errors.push(`Row ${i + 2}: empty name`);
        continue;
      }

      projects.push({
        name,
        website: normalizeUrl(r['Website']),
        ticker: cleanTicker(r['Ticker']),
        chain: r['Chain'] || r['Network'] || undefined,
        source,
        jurisdiction: undefined,
        category: r['Stage'] || r['Category'] || undefined,
        marketCap: r['Raise'] || undefined,
        listedOnLcx: false,
        rawPayload: { ...r },
      });
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { source, rawCount: rows.length, projects, people: [], errors };
}
