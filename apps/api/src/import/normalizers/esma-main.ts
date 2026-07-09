import type { CsvRow } from '../csv.js';
import type { ImportSourceResult, RawProject, RawPerson } from '../types.js';
import { normalizeUrl } from '../types.js';

/** ESMA_MiCA_Main_Leads.csv — 896 Non-ART/EMT whitepaper filers */
export function normalizeEsmaMain(rows: CsvRow[]): ImportSourceResult {
  const source = 'esma_main' as const;
  const projects: RawProject[] = [];
  const people: { projectRaw: Record<string, unknown>; person: RawPerson }[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const name = r['Issuer / Company Name']?.trim();
      if (!name) {
        errors.push(`Row ${i + 2}: empty Issuer / Company Name`);
        continue;
      }

      const project: RawProject = {
        name,
        website: normalizeUrl(r['Website'] || r['Issuer / Company Name']),
        ticker: undefined,
        chain: undefined,
        source,
        esmaTokenId: r['Token ID (FFG)'] || undefined,
        dti: r['Token DTI Code(s)'] || undefined,
        jurisdiction: r['Issuer Country'] || undefined,
        whitepaperUrl: normalizeUrl(r['Whitepaper URL']),
        category: undefined,
        marketCap: undefined,
        listedOnLcx: r['On LCX?']?.trim().toLowerCase() === 'yes',
        rawPayload: { ...r },
      };

      projects.push(project);

      // BD Status fields contain contact info
      const rawContactField = (r['Contact TG/Email'] || '').trim();
      const contactName = r['Contact Name']?.trim();

      // Extract email from combined Contact TG/Email field
      const emailMatch = rawContactField.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      const resolvedEmail = emailMatch?.[1];
      const resolvedName = contactName || (rawContactField.replace(emailMatch?.[0] || '', '').trim() || undefined);
      const resolvedTelegram = !emailMatch && rawContactField.startsWith('@') ? rawContactField : undefined;

      if (resolvedName) {
        people.push({
          person: {
            name: resolvedName,
            title: undefined,
            linkedin: undefined,
            email: resolvedEmail,
            telegram: resolvedTelegram,
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
