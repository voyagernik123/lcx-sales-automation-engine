import type { CsvRow } from '../csv.js';
import type { ImportSourceResult, RawProject } from '../types.js';
import { normalizeUrl, cleanTicker } from '../types.js';

/** LCX Listings - Closed Token Listings.csv — 37 won deals */
export function normalizeClosed(rows: CsvRow[]): ImportSourceResult {
  const source = 'closed' as const;
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
        chain: undefined,
        source,
        jurisdiction: undefined,
        category: undefined,
        marketCap: undefined,
        listedOnLcx: true,
        rawPayload: { ...r },
      });
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { source, rawCount: rows.length, projects, people: [], errors };
}
