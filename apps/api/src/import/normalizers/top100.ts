import type { CsvRow } from '../csv.js';
import type { ImportSourceResult, RawProject, RawPerson } from '../types.js';
import { normalizeUrl, cleanTicker } from '../types.js';

/** top_100_crypto_projects_lcx_outreach.csv — 100 ranked outreach targets */
export function normalizeTop100(rows: CsvRow[]): ImportSourceResult {
  const source = 'top100' as const;
  const projects: RawProject[] = [];
  const people: { projectRaw: Record<string, unknown>; person: RawPerson }[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const name = (r['Project'] || r['Name'] || '').trim();
      if (!name) {
        errors.push(`Row ${i + 2}: empty project name`);
        continue;
      }

      // top100 rows have explicit priority system
      const contactName = r['Key Contact'] || '';

      projects.push({
        name,
        website: normalizeUrl(r['Website']),
        ticker: cleanTicker(r['Ticker']),
        chain: undefined,
        source,
        jurisdiction: undefined,
        category: r['Category'] || r['Type'] || undefined,
        marketCap: r['Raise Amount'] || undefined,
        listedOnLcx: false,
        rawPayload: { ...r },
      });

      if (contactName) {
        people.push({
  person: {
    name: contactName,
    title: undefined,
    linkedin: r['LinkedIn'] || undefined,
    email: undefined,
    telegram: undefined,
  },
  projectRaw: { ...r },
});
      }
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { source, rawCount: rows.length, projects, people, errors };
}
