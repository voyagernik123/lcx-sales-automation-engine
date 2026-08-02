// @vitest-environment node
//
// Source-level and DOM-free, so it adds no jsdom worker pressure.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKETING_CLIENT_OVERLAPS, MARKETING_CONTRACTS_OWED } from '../marketing';

/**
 * THE MARKETING RESPONSE CONTRACT.
 *
 * `lib/api/gps.ts:83` records what this class of test exists to catch: a web-side
 * `GpsSummary` declared five fields the API has never returned, `tsc` was green,
 * the module-mocked page test agreed with the same invented shape, and the page
 * was guaranteed to crash the moment the migration was applied — i.e. the moment
 * real data first arrived. A response interface is a CLAIM about a runtime
 * payload, and the compiler checks the page against the claim rather than the
 * claim against the server.
 *
 * `lib/api/marketing.ts` still declares its three live row shapes locally,
 * because this wave does not own `packages/shared/src/marketing/types.ts` and
 * cannot move them there. So the binding is enforced from outside the type
 * system: this test reads BOTH declarations off disk and requires the field names
 * to agree. No mock can satisfy it, and it fails at the moment the two drift
 * rather than when an operator clicks.
 *
 * It compares NAMES, not full types — a structural check across the package
 * boundary would need the API as a web dependency, which is a worse trade. Names
 * are where this bug lives: every field in the GPS incident was a naming
 * mismatch, not a subtle variance.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = readFileSync(resolve(HERE, '../marketing.ts'), 'utf8');
const SERVICE = readFileSync(
  resolve(HERE, '../../../../../api/src/marketing/service.ts'), 'utf8',
);
const ROUTE = readFileSync(
  resolve(HERE, '../../../../../api/src/routes/marketing.ts'), 'utf8',
);

/**
 * Top-level field names of a `{ ... }` block starting at `from`.
 *
 * Collapses nested groups innermost-first rather than counting braces per line:
 * `Partial<Record<ReplyStatus, number>>` leaves a line-by-line count unbalanced,
 * which is how the GPS version of this helper first reported one field out of
 * seven. Collapsing is order-independent and cannot drift that way.
 */
function fieldsOfBlock(src: string, from: number): string[] {
  const open = src.indexOf('{', from);
  if (open < 0) throw new Error('no block found');

  let depth = 0;
  let end = open;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }

  let body = src.slice(open + 1, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  const collapse = (re: RegExp) => {
    let prev: string;
    do { prev = body; body = body.replace(re, '§'); } while (body !== prev);
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

function interfaceFields(src: string, name: string): string[] {
  const start = src.indexOf(`interface ${name} {`);
  if (start < 0) throw new Error(`interface ${name} not found — renamed?`);
  return fieldsOfBlock(src, start);
}

/** The inline `Promise<{ ... }>` return type of an exported API function. */
function returnFields(src: string, fnName: string): string[] {
  const start = src.indexOf(`export async function ${fnName}(`);
  if (start < 0) throw new Error(`${fnName} not found — renamed?`);
  const promise = src.indexOf('Promise<{', start);
  if (promise < 0) throw new Error(`${fnName} does not return an inline object type`);
  return fieldsOfBlock(src, promise);
}

/** Both directions, named so a failure reads as a diagnosis. */
function expectSameFields(
  webName: string, webFields: string[],
  serverName: string, serverFields: string[],
  routeAdds: readonly string[] = [],
) {
  const missingInWeb = serverFields.filter((f) => !webFields.includes(f));
  const extraInWeb = webFields.filter(
    (f) => !serverFields.includes(f) && !routeAdds.includes(f),
  );

  expect(
    extraInWeb,
    `${webName} declares fields the API never returns: ${extraInWeb.join(', ')} — `
    + 'reading one of these yields undefined at runtime, which is exactly how '
    + '`Object.entries(s.counts)` crashed the GPS compartment on 2026-08-01',
  ).toEqual([]);

  expect(
    missingInWeb,
    `${serverName} returns fields ${webName} does not declare: ${missingInWeb.join(', ')} — `
    + 'the page cannot render them, and if one is sensitive it is crossing to the '
    + 'browser unnoticed',
  ).toEqual([]);
}

describe('web marketing row shapes match the API', () => {
  it('MarketingReply matches service.ts ReplyRow', () => {
    expectSameFields(
      'MarketingReply', interfaceFields(WEB, 'MarketingReply'),
      'ReplyRow', interfaceFields(SERVICE, 'ReplyRow'),
    );
  });

  it('MarketingDraft matches service.ts DraftRow', () => {
    expectSameFields(
      'MarketingDraft', interfaceFields(WEB, 'MarketingDraft'),
      'DraftRow', interfaceFields(SERVICE, 'DraftRow'),
    );
  });

  it('MarketingSummary matches queueSummary plus the two fields the ROUTE adds', () => {
    // `GET /summary` spreads `queueSummary`'s result and adds these two itself
    // (`routes/marketing.ts:80`), so they are legitimately absent from the
    // service function's return type. Asserted against the route source rather
    // than assumed, or this allowance would outlive the code that earns it.
    for (const added of ['mailConfigured', 'migrated']) {
      expect(ROUTE, `GET /summary no longer adds ${added}`).toContain(`${added}:`);
    }
    expectSameFields(
      'MarketingSummary', interfaceFields(WEB, 'MarketingSummary'),
      'queueSummary', returnFields(SERVICE, 'queueSummary'),
      ['mailConfigured', 'migrated'],
    );
  });

  it('the queue really does ship raw_email to the browser', () => {
    // NOT a nice-to-have assertion. `listReplies` is `SELECT *`
    // (`service.ts:201`), so up to 20KB of a stranger's forwarded email crosses
    // to the client on every queue read. `MarketingReply` declares the field
    // because the payload contains it — the alternative is a type that quietly
    // lies about what arrived.
    //
    // WHEN THE ROUTE IS FIXED to a column list, this test fails. That is the
    // point: delete `raw_email` from `MarketingReply` in the same commit, and
    // the pair stays honest in both directions.
    expect(SERVICE).toContain('SELECT * FROM marketing_x_reply');
    expect(interfaceFields(WEB, 'MarketingReply')).toContain('raw_email');
  });
});

describe('the owed-contract ledger cannot drift from the code', () => {
  /**
   * Every fetcher whose response is still `UncontractedPayload`.
   *
   * Sliced between one `export` and the next rather than matched with a
   * fixed-width window: a window long enough for `fetchPrecedent` (which builds a
   * query string before it calls) is also long enough to bridge from a
   * fully-typed fetcher into the next uncontracted one and report the wrong name.
   */
  const uncontracted = (() => {
    const starts = [...WEB.matchAll(/^export (?:const|function) (\w+)/gm)];
    const out: string[] = [];
    starts.forEach((m, i) => {
      const body = WEB.slice(m.index!, starts[i + 1]?.index ?? WEB.length);
      if (body.includes('request<{ data: UncontractedPayload }>')) out.push(m[1]!);
    });
    return out;
  })();

  it('every uncontracted fetcher has a ledger row, and every row a fetcher', () => {
    const ledger = MARKETING_CONTRACTS_OWED.map((c) => c.fn).sort();
    expect(
      uncontracted.sort(),
      'a fetcher returning `unknown` with no ledger row is an undocumented debt; '
      + 'a ledger row with no fetcher is a debt somebody already paid',
    ).toEqual(ledger);
  });

  it('each row names a distinct route and a shared type to declare it in', () => {
    const paths = MARKETING_CONTRACTS_OWED.map((c) => `${c.method} ${c.path}`);
    expect(new Set(paths).size, `duplicate route in the ledger: ${paths.join(', ')}`)
      .toBe(paths.length);
    for (const c of MARKETING_CONTRACTS_OWED) {
      expect(c.path, `${c.fn} must call a /v1/marketing route`).toMatch(/^\/v1\/marketing\//);
      expect(c.sharedTypeOwed, `${c.fn} owes a named shared type`).toMatch(/^[A-Z]\w+$/);
    }
  });

  it("the ledger's static path prefixes are the ones the code actually calls", () => {
    // Catches the failure mode a string ledger invites: a row saying `/desk`
    // beside a fetcher calling `/board`. Compared on the prefix before the first
    // `:param`, because the code builds those with template literals.
    for (const c of MARKETING_CONTRACTS_OWED) {
      const prefix = c.path.split('/:')[0]!;
      expect(WEB, `${c.fn} does not call ${prefix}`).toContain(prefix);
    }
  });

  it('the second client really does still call the overlapping routes', () => {
    // `MARKETING_CLIENT_OVERLAPS` is a claim about a file this wave does not own.
    // A claim about someone else's file goes stale the week it is written, so it is
    // checked: when the desk wave renames a fetcher or drops a route, this fails
    // and the note gets corrected instead of quietly misdescribing the codebase.
    const desk = readFileSync(
      resolve(HERE, '../../../components/marketing/deskApi.ts'), 'utf8',
    );
    expect(MARKETING_CLIENT_OVERLAPS.length).toBeGreaterThan(0);
    for (const line of MARKETING_CLIENT_OVERLAPS) {
      const [, fn, path] = /\s(\w+) → \w+ (\/v1\/marketing[^\s(]*)/.exec(line) ?? [];
      expect(fn, `unparseable overlap row: ${line}`).toBeTruthy();
      expect(desk, `deskApi.ts no longer exports ${fn}`).toContain(`export const ${fn}`);
      // Path compared on the static prefix, since both clients build ids with
      // template literals.
      expect(desk, `deskApi.ts no longer calls ${path}`).toContain(path!.split('/:')[0]!);
    }
  });

  it('no route in the ledger has been quietly built already', () => {
    // The moment one of these lands on the server, its response shape becomes
    // checkable and its row must go. A ledger of debts that were already paid is
    // how the GPS `SELECT *` comment survived being wrong for weeks.
    for (const c of MARKETING_CONTRACTS_OWED) {
      const segment = c.path.replace('/v1/marketing', '').split('/:')[0]!;
      expect(
        ROUTE.includes(`marketingRoutes.get('${segment}'`)
        || ROUTE.includes(`marketingRoutes.post('${segment}'`),
        `${c.path} is mounted now — import its real type from @lcx/shared and drop the ledger row`,
      ).toBe(false);
    }
  });
});
