// @vitest-environment node
//
// Source-level and DOM-free, so it adds no jsdom worker pressure.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * THE GPS SUMMARY CONTRACT — the test that would have caught a shipped crash.
 *
 * WHAT HAPPENED. `apps/web/src/lib/api/gps.ts` declared `GpsSummary` with `counts`,
 * `clientCount`, `openValueCents`, `openMarginCents` and `missingConflictChecks`.
 * The API has never returned any of those; it returns `clients`, `engagements`,
 * `openByCurrency`, `collectedByCurrency`, `awaitingDeposit`, `gaps`, `catalogue`.
 * The page did `Object.entries(s.counts)` on `undefined` and rendered a Module
 * Error reading "Cannot convert undefined or null to object".
 *
 * WHY EVERY EXISTING GATE MISSED IT:
 *   - `tsc` cannot help. A response interface is a CLAIM about a runtime payload.
 *     The compiler checked the page against the claim, and the claim was wrong.
 *   - The page test mocked the API module, so it asserted the page against the SAME
 *     invented shape. Two wrongs agreeing is not a passing test.
 *   - It could not fail before the migration: while 0047 was pending the page
 *     returned early on `migrated: false` and never touched the fields. Applying
 *     0047 is what turned a green build into a broken compartment — the worst
 *     possible timing, since that is the moment real data appears.
 *
 * WHAT THIS DOES INSTEAD. Reads BOTH declarations off disk and requires the web's
 * `GpsSummary` field names to match the API's `DeskSummary`. No mock can satisfy
 * it, and it fails at the moment the two drift rather than when a user clicks.
 *
 * It compares NAMES, not full types — a structural type-level check across package
 * boundaries would need the API as a web dependency, which is a worse trade than
 * this. Names are where this class of bug lives: every field above was a naming
 * mismatch, not a subtle variance.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_API = resolve(HERE, '../gps.ts');
const SERVER = resolve(HERE, '../../../../../api/src/gps/service.ts');

/**
 * Top-level field names of an interface body.
 *
 * Collapses nested groups innermost-first rather than tracking depth per line. The
 * first version of this helper counted braces line by line and reported only ONE of
 * seven fields, because `Array<{ currency: string }>` and
 * `Record<string, number>` leave the count unbalanced across lines. Collapsing is
 * order-independent and cannot drift that way.
 */
function topLevelFields(src: string, interfaceName: string): string[] {
  const start = src.indexOf(`interface ${interfaceName} {`);
  if (start < 0) throw new Error(`interface ${interfaceName} not found — renamed?`);
  const open = src.indexOf('{', start);

  let depth = 0;
  let end = open;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  let body = src
    .slice(open + 1, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  // Innermost-first collapse: braces, then generics, then array literals.
  const collapse = (re: RegExp) => {
    let prev: string;
    do {
      prev = body;
      body = body.replace(re, '§');
    } while (body !== prev);
  };
  collapse(/\{[^{}]*\}/g);
  collapse(/<[^<>]*>/g);
  collapse(/\[[^[\]]*\]/g);

  const names: string[] = [];
  for (const seg of body.split(/[;\n]/)) {
    const m = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\??\s*:/.exec(seg);
    if (m) names.push(m[1]!);
  }
  return [...new Set(names)];
}

describe('web GpsSummary matches server DeskSummary', () => {
  const web = readFileSync(WEB_API, 'utf8');
  const server = readFileSync(SERVER, 'utf8');

  it('both declarations still exist where expected', () => {
    expect(web).toContain('interface GpsSummary');
    expect(server).toContain('interface DeskSummary');
  });

  it('has the same top-level field names, in both directions', () => {
    const webFields = topLevelFields(web, 'GpsSummary').sort();
    const serverFields = topLevelFields(server, 'DeskSummary').sort();

    const missingInWeb = serverFields.filter((f) => !webFields.includes(f));
    const extraInWeb = webFields.filter((f) => !serverFields.includes(f));

    expect(
      missingInWeb,
      `the API returns fields the web does not declare: ${missingInWeb.join(', ')} — ` +
        'the page will silently ignore real data',
    ).toEqual([]);

    expect(
      extraInWeb,
      `the web declares fields the API never returns: ${extraInWeb.join(', ')} — ` +
        'reading one of these yields undefined at runtime, which is exactly how ' +
        '`Object.entries(s.counts)` crashed the compartment on 2026-08-01',
    ).toEqual([]);
  });

  it('the specific phantom fields are gone and cannot come back', () => {
    // Named individually so a regression reads as a regression, not a diff.
    for (const dead of [
      'counts', 'clientCount', 'openValueCents', 'openMarginCents', 'missingConflictChecks',
    ]) {
      expect(
        topLevelFields(web, 'GpsSummary'),
        `${dead} was a field the API never had`,
      ).not.toContain(dead);
    }
  });

  it('the currency-aware fields survived, because summing currencies is a lie', () => {
    // A partner may invoice EUR against a USD price. One total would be true in no
    // currency, which is why the server groups and the web must not flatten.
    const webFields = topLevelFields(web, 'GpsSummary');
    expect(webFields).toContain('openByCurrency');
    expect(webFields).toContain('collectedByCurrency');
  });
});
