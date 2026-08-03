/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  HOW ⌘K ORDERS ITS ROWS — the two decisions GPS Phase 11's wiring forced
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `rankPaletteRows` was inside a `useMemo` until the eighth compartment was wired into it,
 * and it is exported now for the reason `flattenGroups` was: both of the properties below
 * are invisible in a browser on this database, and both were defects rather than taste.
 *
 *  1. CODES CANNOT SWALLOW THE LIST. Every one of the sixteen GPS codes begins with `g`,
 *     and code rows rank ahead of everything and were unbounded. So a bare `g` — a
 *     keystroke on the way to "graph", "governance", any word an operator types — matched
 *     seventeen codes against a fourteen-row list and left no room for the object results,
 *     the noun rows or the pages. It is not reproducible by hand without knowing to type
 *     one letter and count, which is exactly the case for pinning it here.
 *
 *  2. A GPS NOUN ROW SUPERSEDES ITS DESK'S PAGE ROW. They navigate to the identical path
 *     (no GPS surface reads a query param but delivery and the loop), and only one of the
 *     two says what the noun can actually do. Marketing resolves the same collision the
 *     other way because its noun rows deep-link to a tab; both directions are asserted, so
 *     neither can be "simplified" into the other without a failure naming the compartment.
 *
 * These assertions run over the REAL tables — `COMMAND_CODES`, `GPS_NOUNS`, `DESTINATIONS`
 * — rather than fixtures, because a ranking test built from invented rows would pass while
 * the palette an operator opens is still flooded.
 */

import { describe, it, expect } from 'vitest';
import { rankPaletteRows, COMMAND_CODES, CODE_ROWS, PALETTE_ROWS } from '../CommandBody';
import { GPS_NOUNS, GPS_PALETTE_PAGES, destinationForNoun } from '../gpsGrammar';
import { MARKETING_PALETTE_PAGES } from '../marketingGrammar';

/** The palette's own inputs, with the async halves empty unless a test supplies them. */
const rank = (query: string, extra: Partial<Parameters<typeof rankPaletteRows>[0]> = {}) =>
  rankPaletteRows({
    query,
    // Every page row the real palette assembles. `buildDataCommands()` is deliberately
    // omitted: states, products and red flags are 200+ static rows that match on words this
    // file is not about, and including them would make a supersession assertion depend on
    // whether some US state's name happens to contain "partner".
    allCommands: [...MARKETING_PALETTE_PAGES, ...GPS_PALETTE_PAGES] as never,
    objectResults: [],
    marketingReplies: [],
    gpsEngagements: [],
    ...extra,
  });

describe('code rows cannot swallow the list', () => {
  it('a bare g matches more codes than the list has rows — the premise', () => {
    // If this ever stops being true the cap is no longer load-bearing, and the test above
    // it would pass for the wrong reason.
    const matching = COMMAND_CODES.filter((c) => c.code.startsWith('g'));
    expect(matching.length).toBeGreaterThan(PALETTE_ROWS);
  });

  it('shows at most CODE_ROWS of them, leaving the rest of the list room', () => {
    // THE MUTATION THAT PROVES THIS: delete `.slice(0, CODE_ROWS)` from rankPaletteRows and
    // this goes red at 17.
    const rows = rank('g');
    const codeRows = rows.filter((r) => r.id.startsWith('code-'));
    expect(codeRows.length).toBe(CODE_ROWS);
    expect(rows.length).toBeGreaterThan(CODE_ROWS);
  });

  it('keeps the code the operator actually typed, not the five that sort first', () => {
    // `gp` is an exact code (Proposals) and also prefixes `gpt` and `gpm`. The exact match
    // is sorted to the front before the cap, so it survives a cap of any size.
    const rows = rank('gp');
    expect(rows[0]!.id).toBe('code-gp');
  });

  it('caps by code row, not by trimming the whole list — pages still appear for g', () => {
    const rows = rank('g');
    expect(rows.some((r) => !r.id.startsWith('code-'))).toBe(true);
  });
});

describe('a GPS noun row supersedes its desk page row', () => {
  /**
   * `partner` is the case worth pinning: the noun's own row carries "nothing fetches it
   * (fetchGpsPartners does not exist)", and the underwriting desk's page row carries the
   * word `Partners` in its generated sublabel — so a plain substring match returns both,
   * pointing at the same path.
   */
  const partner = GPS_NOUNS.find((n) => n.kind === 'partner')!;
  const partnerDesk = destinationForNoun(partner)!;

  it('the collision is real: both rows match the query and share a destination', () => {
    const pageRow = GPS_PALETTE_PAGES.find((r) => r.to === partnerDesk.path)!;
    expect(pageRow.sublabel.toLowerCase()).toContain('partner');
    expect(partnerDesk.path).toBe('/gps/underwriting');
  });

  it('keeps the noun rows and drops the page row', () => {
    // THE MUTATION THAT PROVES THIS: change `pageRows` back to `staticMatches` and this goes
    // red with a `dest-go-gps-underwriting` row in the list.
    const rows = rank('partner');
    const toDesk = rows.filter((r) => r.to === partnerDesk.path);
    expect(toDesk.map((r) => r.id)).not.toContain(`dest-${partnerDesk.id}`);
    // TWO noun rows survive and that is correct: 'partner' also matches the rate card's
    // alias 'partner rate', and Partners and Rate cards are two different answers to the
    // question rather than one answer printed twice. What the dedupe removes is the row
    // that would have said the same thing with less on it.
    expect(toDesk.every((r) => r.id.startsWith('gps-noun-'))).toBe(true);
    const own = toDesk.find((r) => r.id === `gps-noun-${partner.kind}`)!;
    // And the row that survived is the one carrying the truth, not just the plurals.
    expect(own.sublabel).toContain('fetchGpsPartners');
  });

  it('a code still supersedes the noun row — typing gpt is an instruction', () => {
    // THE MUTATION THAT PROVES THIS: drop the `codeMatches.some(...)` filter and `gpt`
    // returns the code row AND the noun row for the same path.
    const rows = rank('gpt');
    const toDesk = rows.filter((r) => r.to === partnerDesk.path);
    expect(toDesk.length).toBe(1);
    expect(toDesk[0]!.id).toBe('code-gpt');
  });

  it('marketing keeps the opposite resolution, and that is asserted not assumed', () => {
    // `crisis` matches the Crisis statements noun (to /marketing/crisis) and the Crisis Room
    // page row (same path). Marketing drops the NOUN row. If someone unifies the two
    // compartments onto one rule, this fails and names which.
    const rows = rank('crisis');
    const toCrisis = rows.filter((r) => r.to === '/marketing/crisis');
    expect(toCrisis.length).toBe(1);
    expect(toCrisis[0]!.id).toBe('dest-go-marketing-crisis');
  });
});

describe('instances outrank kinds', () => {
  it('a GPS engagement row sits above every GPS noun row', () => {
    const instance = {
      id: 'gps-engagement-e1', label: 'Acme', sublabel: 'Engagement · conflict cleared',
      to: '/gps', type: 'page' as const,
    };
    const rows = rank('engagement', { gpsEngagements: [instance] });
    const iInstance = rows.findIndex((r) => r.id === 'gps-engagement-e1');
    const iKind = rows.findIndex((r) => r.id.startsWith('gps-noun-'));
    expect(iInstance).toBeGreaterThanOrEqual(0);
    // A kind row may or may not survive the dedupe for this query; when it does, the
    // instance must be above it.
    if (iKind >= 0) expect(iInstance).toBeLessThan(iKind);
  });
});
