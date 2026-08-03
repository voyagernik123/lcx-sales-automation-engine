// @vitest-environment node
//
// Source-level and DOM-free, so it adds no jsdom worker pressure.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
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
/**
 * EVERY MARKETING ROUTER, NOT JUST THE FIRST ONE.
 *
 * This used to read `routes/marketing.ts` alone, and that made the last test in this file
 * silently stop working the moment the compartment split: `marketingDesk.ts`,
 * `marketingMemory.ts` and `marketingRecord.ts` mount fourteen of the routes the ledger
 * below calls owed, and a ledger row for a route that EXISTS is the exact defect the test
 * was written to catch — a debt somebody already paid, still recorded as outstanding, with
 * a client still typing its response `unknown`.
 *
 * Concatenated rather than checked one by one: the assertions ask "is this segment mounted
 * anywhere", and which file mounts it is the gate agent's business.
 *
 * A NEW ROUTER MUST BE ADDED HERE. There is no glob, deliberately — a glob would make this
 * test quietly weaker on a filename typo, and the failure mode of forgetting a file is a
 * ledger row that stops being checked.
 */
const ROUTE_FILES = [
  'marketing.ts', 'marketingDesk.ts', 'marketingMemory.ts', 'marketingRecord.ts',
  /* The fifth router. It mounts the two gates, the two provenance reads, both silence
     endpoints and the two measurement reads — eight of the routes this ledger tracked as
     unbuilt — so omitting it would have let "no route in the ledger has been quietly built
     already" pass over a router that had built most of them. */
  'marketingGates.ts',
] as const;
const ROUTE = ROUTE_FILES
  .map((f) => {
    const path = resolve(HERE, `../../../../../api/src/routes/${f}`);
    return existsSync(path) ? readFileSync(path, 'utf8') : '';
  })
  .join('\n');

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

  it('the queue no longer ships raw_email to the browser', () => {
    // THIS TEST USED TO ASSERT THE OPPOSITE, DELIBERATELY. `listReplies` was
    // `SELECT * FROM marketing_x_reply`, so up to 20KB of a stranger's forwarded email
    // crossed to the client on every queue read, and `MarketingReply` declared the
    // field because the payload really did contain it — a type that omitted it would
    // have been quietly lying about what arrived. The assertion was written to FAIL the
    // day the route was fixed, with the instruction to delete the field in the same
    // change. That day is this one, so it is inverted rather than deleted: the
    // regression it now guards against is re-adding the wildcard.
    //
    // Comment lines are stripped because `service.ts` quotes the old query verbatim
    // when explaining the fix, and matching prose would make this pass on a revert.
    const serviceCode = SERVICE.split('\n')
      .filter((line) => !/^\s*(?:\*|\/\/|\/\*)/.test(line))
      .join('\n');
    expect(serviceCode).not.toContain('SELECT * FROM marketing_x_reply');
    expect(serviceCode).toContain('REPLY_COLUMNS');
    expect(interfaceFields(WEB, 'MarketingReply')).not.toContain('raw_email');
    // The cleared-at timestamp is an audit fact, not content, and stays on both sides.
    expect(interfaceFields(WEB, 'MarketingReply')).toContain('raw_email_cleared_at');
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

  /**
   * THE OTHER DIRECTION, AND THE ONE THAT WAS MISSING.
   *
   * The tests above prove that an UNCONTRACTED fetcher has a ledger row. Nothing proved that
   * a CONTRACTED one does not — so sixteen paid debts could have sat in the ledger with
   * their fetchers already typed, and the list would have kept reporting twenty-three owed.
   * A ledger that over-reports debt is as misleading as one that under-reports it: it is the
   * number a reader uses to decide how much of this compartment is surface-ready.
   */
  it('a fetcher that imports its shared type is not still listed as owed', () => {
    const owed = new Set(MARKETING_CONTRACTS_OWED.map((c) => c.fn));
    const starts = [...WEB.matchAll(/^export (?:const|function) (\w+)/gm)];
    starts.forEach((m, i) => {
      const name = m[1]!;
      const body = WEB.slice(m.index!, starts[i + 1]?.index ?? WEB.length);
      if (!body.includes('request<{ data: ')) return;
      const typed = /request<\{ data: (\w+) \}>/.exec(body)?.[1];
      if (typed === undefined || typed === 'UncontractedPayload') return;
      expect(
        owed.has(name),
        `${name} is typed \`${typed}\` and still carries a ledger row. Drop the row: a debt `
        + 'that is still recorded after it is paid inflates the count a reader trusts.',
      ).toBe(false);
    });
  });

  it('every type this client imports from @lcx/shared is really declared there', () => {
    /*
     * WHY A FILE READ AND NOT A TYPE IMPORT. The names below are TYPES, so a `tsc` failure is
     * the primary check and it is the right one. This test exists for the case `tsc` cannot
     * make loud enough: the contracts live in `marketing/contracts/*.ts` and reach this
     * client only if `marketing/index.ts` re-exports them. When that barrel line is missing,
     * every one of these fails as TS2305 in a build log alongside the API's own — and the
     * sentence in this failure names the one line that fixes all of them.
     */
    const imported = /import \{([\s\S]*?)\} from '@lcx\/shared';/.exec(WEB)?.[1] ?? '';
    /* Anchored to a whole import LINE. An unanchored `type (\w+)` matches the prose in the
       import block's own docblock — "the type each owes" — and reports `each` as a missing
       contract, which is a test failing on its own comment. */
    const names = [...imported.matchAll(/^\s+type (\w+),$/gm)].map((m) => m[1]!);
    expect(names.length, 'the client stopped importing its contracts from shared').toBeGreaterThan(10);

    const SHARED = resolve(HERE, '../../../../../../packages/shared/src/marketing');
    const sources = [
      'types.ts', 'abuse.ts', 'claimSafety.ts',
      'contracts/desk.ts', 'contracts/memory.ts', 'contracts/record.ts', 'contracts/gates.ts',
    ]
      .map((f) => (existsSync(resolve(SHARED, f)) ? readFileSync(resolve(SHARED, f), 'utf8') : ''))
      .join('\n');
    for (const n of names) {
      expect(
        new RegExp(`export (?:interface|type) ${n}\\b`).test(sources),
        `${n} is imported from '@lcx/shared' and is declared in no marketing module. Either the `
        + 'name is wrong, or the contract has not been written yet — and a web-local copy is not '
        + 'the fix (lib/api/gps.ts:83).',
      ).toBe(true);
    }
  });

  it('no route in the ledger has been quietly built already', () => {
    // The moment one of these lands on the server, its response shape becomes
    // checkable and its row must go. A ledger of debts that were already paid is
    // how the GPS `SELECT *` comment survived being wrong for weeks.
    for (const c of MARKETING_CONTRACTS_OWED) {
      const segment = c.path.replace('/v1/marketing', '').split('/:')[0]!;
      expect(
        // Any of the four routers, and either verb. `Routes.get('` matches
        // `marketingRoutes`, `marketingDeskRoutes`, `marketingMemoryRoutes` and
        // `marketingRecordRoutes` alike.
        ROUTE.includes(`Routes.get('${segment}'`)
        || ROUTE.includes(`Routes.post('${segment}'`),
        `${c.path} is mounted now — import its real type from @lcx/shared and drop the ledger row`,
      ).toBe(false);
    }
  });
});
