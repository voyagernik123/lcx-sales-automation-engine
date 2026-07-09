import type { CsvRow } from '../csv.js';
import type { ImportSourceResult, RawProject } from '../types.js';
import { cleanTicker } from '../types.js';

/**
 * LCX Listings - Closed Token Listings.csv — won deals (ground-truth labels).
 * Actual headers: Entry ID, Record ID, Record (=name), Token (=ticker), Stage,
 * "Stage" Changed At, "Stage" Previous Values, Marketing Fee, Listing Fee,
 * Liquidity Amount, Market Maker, Chain, Notes, Owner.
 */
export function normalizeClosed(rows: CsvRow[]): ImportSourceResult {
  const source = 'closed' as const;
  const projects: RawProject[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const name = (r['Record'] || r['Name'] || r['Project'] || '').trim();
      if (!name) {
        errors.push(`Row ${i + 2}: empty name`);
        continue;
      }

      projects.push({
        name,
        website: undefined,
        ticker: cleanTicker(r['Token'] || r['Ticker']),
        chain: r['Chain']?.trim() || undefined,
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
