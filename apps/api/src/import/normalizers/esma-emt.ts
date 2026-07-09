import type { CsvRow } from '../csv.js';
import type { ImportSourceResult, RawProject } from '../types.js';
import { normalizeUrl } from '../types.js';

/** ESMA_MiCA_EMT_Issuers.csv — 40 EMT/stablecoin issuers */
export function normalizeEsmaEmt(rows: CsvRow[]): ImportSourceResult {
  const source = 'esma_emt' as const;
  const projects: RawProject[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const name = r['Issuer Name']?.trim();
      if (!name) {
        errors.push(`Row ${i + 2}: empty Issuer Name`);
        continue;
      }

      projects.push({
        name,
        website: normalizeUrl(r['Website']),
        ticker: undefined,
        chain: undefined,
        source,
        esmaTokenId: r['Token ID (FFG)'] || undefined,
        dti: r['Token DTI'] || r['Token DTI Code(s)'] || undefined,
        jurisdiction: r['Country'] || undefined,
        whitepaperUrl: normalizeUrl(r['Whitepaper URL']),
        category: 'emt',
        marketCap: undefined,
        listedOnLcx: r['On LCX?']?.trim().toLowerCase() === 'yes',
        rawPayload: { ...r },
      });
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { source, rawCount: rows.length, projects, people: [], errors };
}
