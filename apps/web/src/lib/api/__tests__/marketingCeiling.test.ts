import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE RUNTIME HALF OF THE HONESTY CEILING, ACTUALLY APPLIED.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `observation.ts` opened with "THREE LAYERS GUARD THE CEILING, AND ONLY THE FIRST TWO ARE
 * PROOFS". Both of those two had ZERO production callers: `assertHonestPayload` appeared
 * only in its own tests, and `HonestFigures<T>` only in its own docblock. The paragraph was
 * describing a design, and a reader would have taken it as a description of the code.
 *
 * Layer 2 is now wired on this module's shared `unwrap`. These tests assert it from the
 * outside — mock the transport, hand back a payload carrying a banned field, and require the
 * read to FAIL rather than return it. The fourth test is the one that matters most: it proves
 * the guard is on `unwrap` and not bolted onto one fetcher, by exercising a different
 * endpoint.
 *
 * THIS FILE ONCE CALLED `unwrap` "the one place every marketing read passes through", copying
 * a claim from `marketing.ts` that was false: `components/marketing/deskApi.ts` was a second
 * client with no ceiling on any of its three calls, and `pages/MarketingHoldings.tsx` is a
 * third that still has none. This file covers `lib/api/marketing.ts`;
 * `components/marketing/__tests__/deskApiCeiling.test.ts` covers the second client. No file
 * claims to cover the compartment — the last describe block below ENUMERATES the clients and
 * fails on a new one, which is the only form of that claim that cannot rot.
 */

const request = vi.fn();
vi.mock('../../apiClient', () => ({ request: (...a: unknown[]) => request(...a) }));

const api = await import('../marketing');

const envelope = (data: unknown) => Promise.resolve({ data, meta: { migrated: true } });

/* `api` is a value (a namespace object from `await import`), so the thrown error's type is
   read off it with `InstanceType` rather than written out here. One declaration, in shared. */
type CeilingError = InstanceType<typeof api.HonestyCeilingError>;

/* BRACES, NOT A CONCISE ARROW BODY. `mockReset()` RETURNS THE MOCK, and vitest treats a
   function returned from `beforeEach` as that test's teardown — so the concise form registers
   the mock as the teardown and CALLS IT after every test. Invisible while every mock here
   resolves; the moment one returns a rejected promise it surfaces as an unhandled rejection
   attributed to a line that is correct. It cost half an hour in the sibling file. */
beforeEach(() => {
  request.mockReset();
});

describe('a payload carrying a forbidden metric fails the read', () => {
  it('refuses `impressions` rather than handing it to a component', async () => {
    request.mockReturnValue(envelope([{ id: 1, impressions: 12_000 }]));
    await expect(api.fetchMarketingQueue()).rejects.toThrow(/cannot be observed without an X credential/);
  });

  it('carries the refusal code, so a surface can render the refusal rather than a stack', async () => {
    request.mockReturnValue(envelope({ counts: {}, shareOfVoice: 0.42 }));
    await expect(api.fetchMarketingSummary()).rejects.toMatchObject({ code: 'METRIC_NOT_OBSERVABLE' });
  });

  it('finds a banned field nested inside the payload', async () => {
    request.mockReturnValue(envelope({ counts: {}, panel: { tiles: [{ label: 'ok' }, { follower_delta: 3 }] } }));
    await expect(api.fetchMarketingSummary()).rejects.toThrow(/follower_delta/);
  });

  it('guards a DIFFERENT endpoint too, which is how we know it is on `unwrap`', async () => {
    request.mockReturnValue(envelope({ bundle: { engagement_rate: 0.031 } }));
    await expect(api.fetchExportBundle('item-1')).rejects.toThrow(/engagement_rate/);
  });
});

describe('it does not refuse the payloads the desk actually returns', () => {
  it('passes an ordinary queue read through unchanged', async () => {
    const rows = [{ id: 1, author_handle: 'someone', body: 'hi', posted_at: null }];
    request.mockReturnValue(envelope(rows));
    await expect(api.fetchMarketingQueue()).resolves.toEqual(rows);
  });

  it('passes `sentiment`, which is declared, never written, and not a banned name', async () => {
    // The ban is on a sentiment SCORE. A nullable column that nothing writes is not a
    // metric being claimed, and refusing it would break every queue read.
    const rows = [{ id: 1, sentiment: null }];
    request.mockReturnValue(envelope(rows));
    await expect(api.fetchMarketingQueue()).resolves.toEqual(rows);
  });

  it('passes the post-time coverage figures the panels now depend on', async () => {
    const s = { counts: { new: 120 }, postTimeCoverage: { openRows: 120, withPostTime: 50 } };
    request.mockReturnValue(envelope(s));
    await expect(api.fetchMarketingSummary()).resolves.toEqual(s);
  });
});

describe('the thrown refusal reaches a surface whole', () => {
  /*
   * IT USED TO BE `throw Object.assign(new Error(refused.sentence), { code })`, which kept
   * the sentence and the code and dropped `rule`, `recovery`, `matched` and
   * `ruleSetVersion` on the floor. The doctrine says a refusal CITES THE RULE IT APPLIES,
   * and at the one place in the browser where the ceiling actually fires it did not — so
   * the best a page could render was a sentence with no provision behind it and no
   * statement of what would make the read succeed.
   */
  it('carries the rule, the recovery and the matched path, not just the sentence', async () => {
    request.mockReturnValue(envelope({ counts: {}, panel: { follower_delta: 3 } }));
    const err = await api.fetchMarketingSummary().then(
      () => null,
      (e: unknown) => e as CeilingError,
    );
    expect(err?.name).toBe('HonestyCeilingError');
    expect(err?.code).toBe('METRIC_NOT_OBSERVABLE');
    expect(err?.refusal.rule.provision).toBe('the honesty ceiling');
    expect(err?.refusal.recovery.kind).toBe('not_recoverable');
    expect(err?.refusal.matched).toBe('panel.follower_delta');
    expect(err?.refusal.ruleSetVersion).toBeGreaterThan(0);
  });

  it('reports EVERY banned field, so the gate cannot be routed around one at a time', async () => {
    // The house pattern at `apps/api/src/routes/marketingDesk.ts`: every refusal, then one
    // response — never the first one found.
    request.mockReturnValue(envelope({ impressions: 1, rows: [{ ctr: 0.2 }], sov: 3 }));
    const err = await api.fetchMarketingQueue().then(
      () => null,
      (e: unknown) => e as CeilingError,
    );
    expect(err?.refusals.map((r: CeilingError['refusal']) => r.matched)).toEqual(['impressions', 'rows[0].ctr', 'sov']);
  });

  it('fails a payload too deep to verify rather than passing it as clean', async () => {
    /*
     * The defect that made this lane necessary: past the walker's depth limit the ceiling
     * returned `null`, so "checked and clean" and "never looked" were the same value at
     * this call site. A payload the guard could not finish reading must not become a read
     * that succeeded.
     */
    let deep: unknown = { ok: true };
    for (let i = 0; i < 40; i += 1) deep = { d: deep };
    request.mockReturnValue(envelope(deep));
    await expect(api.fetchMarketingSummary()).rejects.toMatchObject({
      code: 'PAYLOAD_TOO_DEEP_TO_VERIFY',
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * THE COVERAGE CLAIM IS NOW A TEST, BECAUSE THE COMMENT HAS BEEN WRONG TWICE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Version 1 of `unwrap`'s docblock said "This is the one place every marketing read passes
 * through". Version 2 said "the ceiling covers every marketing READ" and named two
 * exceptions. Both were falsified by the same command — `grep -rn "v1/marketing"
 * apps/web/src` — which found `pages/MarketingHoldings.tsx` calling `request()` directly on
 * three live, mounted holdings routes. The lane's own thesis is that a comment like that is
 * what a reader checks INSTEAD of the imports, and it shipped the defect twice.
 *
 * So the enumeration is pinned here. A new file that names `/v1/marketing` makes this RED,
 * which is the only version of this statement that cannot go stale. Adding a file to the list
 * is deliberately annoying: it requires writing down which client it is, or why it is a
 * bypass, or that it is prose. It matches any string LITERAL rather than a call shape, so a
 * bypass assembled as `const url = ...; request(url)` cannot walk past it either.
 */
describe('every web file that reaches /v1/marketing is one this lane has accounted for', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const WEB_SRC = resolve(HERE, '../../..');

  /** Which files may contain the string, and what each one's ceiling story is. */
  const ACCOUNTED = new Map<string, string>([
    ['lib/api/marketing.ts', 'this module: every fetcher goes through `unwrap`, except `invokeMarketingAbuse` (a committed governed write, exempted with the argument at its call site)'],
    ['components/marketing/deskApi.ts', 'the second client: its GET `findPrecedent` uses `unwrapMarketingRead`; its two POSTs are exempt because their handlers commit before responding'],
    ['pages/MarketingHoldings.tsx', 'NOT BEHIND THE CEILING. Three live reads on mounted routes that answer with a BARE payload rather than a { data, meta } envelope, so `unwrapMarketingRead` cannot be dropped in. Owed, and named in `unwrap`\'s docblock rather than rounded off'],
  ]);

  /**
   * Files that name a marketing route in PROSE, not in a call — a refusal sentence telling an
   * operator which endpoint answered 404. Listed rather than pattern-matched away, because
   * "this occurrence is only prose" is a judgement and the judgement should be written down.
   */
  const PROSE_ONLY = new Map<string, string>([
    ['pages/MarketingDesk.tsx', 'a JSX code-span inside the copy explaining that `/v1/marketing/perimeter` had no reader'],
  ]);

  /** Any STRING LITERAL naming a marketing route. Broader than a call pattern on purpose: a
   *  bypass built as `const url = \`/v1/marketing/x\`; request(url)` must not slip past. */
  const NAMES_A_ROUTE = /['"`]\/v1\/marketing/;
  /** A literal handed straight to the transport. Prose files must contain none of these. */
  const CALLS_A_ROUTE = /(?:request|fetch)\s*(?:<[^>]*>)?\s*\(\s*[`'"]\/v1\/marketing/;

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = resolve(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(full);
      return /\.tsx?$/.test(e.name) ? [full] : [];
    });

  const rel = (f: string) => relative(WEB_SRC, f).split(sep).join('/');

  it('finds no file naming a marketing route that the enumeration does not account for', () => {
    const naming = walk(WEB_SRC)
      .filter((f) => NAMES_A_ROUTE.test(readFileSync(f, 'utf8')))
      .map(rel)
      .sort();
    expect(naming).toEqual([...ACCOUNTED.keys(), ...PROSE_ONLY.keys()].sort());
  });

  it('and the prose-only file is still prose only, so a real call there cannot hide in the list', () => {
    for (const file of PROSE_ONLY.keys()) {
      const src = readFileSync(resolve(WEB_SRC, file), 'utf8');
      expect(CALLS_A_ROUTE.test(src), `${file} now calls a marketing route`).toBe(false);
    }
  });

  it('and the docblock still names each of them, so the code and the list cannot drift apart', () => {
    const src = readFileSync(resolve(WEB_SRC, 'lib/api/marketing.ts'), 'utf8');
    for (const file of ACCOUNTED.keys()) {
      // `lib/api/marketing.ts` refers to itself as "THIS MODULE"; the other two by path.
      if (file === 'lib/api/marketing.ts') continue;
      expect(src, file).toContain(file.split('/').pop());
    }
    // The holdings bypass is the one a reader is most likely to be misled about, so the
    // docblock must name all three of its routes, not just the page.
    for (const route of ['/v1/marketing/holdings', '/holdings/register', '/holdings/cells']) {
      expect(src, route).toContain(route);
    }
  });
});
