import type { CsvRow } from '../csv.js';
import type { ImportSourceResult, RawProject, RawPerson } from '../types.js';
import { normalizeUrl, cleanTicker } from '../types.js';

/**
 * potential - token listing - lcx — high-rel fundraise/TGE prospects.
 * Columns: COMPANY NAME, WEBSITE, SOURCE, RELEVANCE, RATIONALE
 */
export function normalizePotential(rows: CsvRow[]): ImportSourceResult {
  const source = 'potential' as const;
  const projects: RawProject[] = [];
  const people: { projectRaw: Record<string, unknown>; person: RawPerson }[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const name = (r['COMPANY NAME'] || r['Project'] || r['Name'] || r['Company'] || '').trim();
      if (!name) {
        errors.push(`Row ${i + 2}: empty project name`);
        continue;
      }

      projects.push({
        name,
        website: normalizeUrl(r['WEBSITE'] || r['Website'] || r['URL']),
        ticker: cleanTicker(r['Ticker']),
        chain: r['Chain'] || r['Network'] || undefined,
        source,
        jurisdiction: r['Country'] || r['Jurisdiction'] || undefined,
        category: r['SOURCE'] || r['Category'] || r['Type'] || undefined,
        marketCap: r['RELEVANCE'] || r['Raise Amount'] || r['Market Cap'] || undefined,
        listedOnLcx: false,
        rawPayload: { ...r },
      });
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { source, rawCount: rows.length, projects, people, errors };
}
