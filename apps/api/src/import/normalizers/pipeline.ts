import type { CsvRow } from '../csv.js';
import type { ImportSourceResult, RawProject, RawPerson } from '../types.js';
import { normalizeUrl, cleanTicker } from '../types.js';

/** LCX Listings - Pipeline.csv — ~950 CRM history records */
export function normalizePipeline(rows: CsvRow[]): ImportSourceResult {
  const source = 'pipeline' as const;
  const projects: RawProject[] = [];
  const people: { projectRaw: Record<string, unknown>; person: RawPerson }[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const name = (r['Record'] || r['Name'] || r['Project'] || '').trim();
      if (!name) {
        errors.push(`Row ${i + 2}: empty Record`);
        continue;
      }

      const contactDetails = r['Contact Details'] || '';
      // Pipeline telegrams are typically "https://t.me/..." or "@handle"
      const telegram = contactDetails.startsWith('https://t.me/') || contactDetails.startsWith('@')
        ? contactDetails.trim()
        : undefined;
      const email = contactDetails.includes('@') && !contactDetails.includes('t.me')
        ? contactDetails.trim()
        : undefined;

      projects.push({
        name,
        website: normalizeUrl(r['Parent Record > Domains']),
        ticker: cleanTicker(r['Ticker'] || r['Symbol']),
        chain: undefined,
        source,
        jurisdiction: undefined,
        category: undefined,
        marketCap: undefined,
        // Pipeline rows are prospects, not listings — Won rows arrive via the
        // closed source. Marking them listed inflated willingness scoring.
        listedOnLcx: false,
        rawPayload: { ...r },
      });

      // Contact Details holds the PROJECT's contact (telegram/email); Owner is
      // internal LCX staff and must not become a project contact.
      if (telegram || email) {
        people.push({
          person: {
            name: `${name} contact`,
            title: 'Pipeline contact',
            linkedin: undefined,
            email,
            telegram,
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
