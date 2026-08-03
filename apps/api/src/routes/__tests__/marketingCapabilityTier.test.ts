import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requiresOperate } from '../../app.js';
import { MARKETING_READ_SHAPED_POSTS } from '../marketingDesk.js';
import { MARKETING_GATES_READ_SHAPED_POSTS } from '../marketingGates.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  WHICH MARKETING POSTS ARE READS — BOTH DIRECTIONS, AND THE SOURCE THAT PROVES IT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `app.ts:requiresOperate` gates GET/HEAD/OPTIONS at `view` and everything else at
 * `operate` unless the path is on its `READ_SHAPED_POSTS` allowlist. Applied by method
 * alone, that is wrong in a specific way this repo has now made in BOTH directions:
 *
 *  · Too strict, which is the bug this file fixes: `POST /regime`, `POST /triage/assess`
 *    and `POST /adoption` mutate nothing. They are POSTs because a classification input
 *    does not fit in a query string. Gating them as writes removed the instrument's
 *    most-used reads from every `view`-granted member — which is exactly what the
 *    request-access flow hands out by default.
 *  · Too loose, which app.ts records in its own docblock: `/v1/projects/score` "reads like
 *    a query and is not one" — it rewrites every project's band — and no exemption may ever
 *    match a GPS path.
 *
 * So this file asserts BOTH directions, and it asserts the second one against the real
 * boundary rather than against a copy of it.
 *
 * ══ WHAT WOULD MAKE EACH TEST FAIL ══
 *  · drop an entry from `MARKETING_READ_SHAPED_POSTS`, or unanchor one → red;
 *  · add a marketing WRITE to that list, or exempt one in `app.ts` itself → red;
 *  · add an INSERT/UPDATE/DELETE, a transaction or a queue write to any of the three
 *    read-shaped handlers → red, because the whole file is scanned and every write marker
 *    must sit inside one of the two handlers that are allowed to have them.
 *
 * ══ THE EXEMPTION IS INSTALLED, AND A FOURTH PATH JOINED IT ══
 * `app.ts:READ_SHAPED_POSTS` now spreads both `MARKETING_READ_SHAPED_POSTS` (this router's
 * three) and `MARKETING_GATES_READ_SHAPED_POSTS` (`POST /review` on `marketingGates.ts`),
 * and `marketingMount.test.ts` carries those four rows at `needed: 'view'`.
 *
 * `effectiveTier` IS KEPT and it is no longer the ratchet. It composes `requiresOperate`
 * with the routers' own lists, so once `app.ts` spreads them it answers 'view' whichever
 * half is doing the work — which means it CANNOT detect the spread being deleted. The
 * assertion that can is `requiresOperate` called directly on all four paths ('app.ts itself
 * gates all four read-shaped POSTs at view'), and that is the one that goes red if the
 * spread is removed. Composition tests that cannot fail are how a boundary quietly moves.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const DESK_SRC = readFileSync(resolve(HERE, '..', 'marketingDesk.ts'), 'utf8');
const GATES_SRC = readFileSync(resolve(HERE, '..', 'marketingGates.ts'), 'utf8');

/** The three paths this router declares as reads, spelled out rather than derived. */
const READ_SHAPED = [
  '/v1/marketing/regime',
  '/v1/marketing/triage/assess',
  '/v1/marketing/adoption',
] as const;

/**
 * Every marketing POST that CHANGES STATE. Hand-listed on purpose: a list derived from the
 * same regexes it is checking would agree with them by construction.
 */
const MUTATIONS = [
  '/v1/marketing/41/triage',
  '/v1/marketing/desk-mode',
  '/v1/marketing/ingest',
  '/v1/marketing/tick',
  '/v1/marketing/41/status',
  '/v1/marketing/41/draft',
  '/v1/marketing/draft/7/approve',
  '/v1/marketing/draft/7/sent',
  '/v1/marketing/precedent/statement',
  '/v1/marketing/crisis/incident',
  '/v1/marketing/crisis/incident/inc-1/first-statement',
  '/v1/marketing/crisis/statements/lcx-holding-1/instance',
  '/v1/marketing/crisis/instance/stmt-1/clearance',
  '/v1/marketing/record',
  '/v1/marketing/subject-access',
  '/v1/marketing/erasure',
  '/v1/marketing/retention/run',
] as const;

/**
 * The tier the compartment demands, as `app.ts` will compute it once this router's
 * allowlist is spread into `READ_SHAPED_POSTS`.
 *
 * The second clause is the pending half and it is deliberately a SEPARATE test from the
 * first: `requiresOperate` is asked first, so once app.ts carries the entries this function
 * returns 'view' from the first clause and the composition stops mattering. It never
 * loosens anything on its own — the only paths it can move are the ones this router
 * declared and verified.
 */
const effectiveTier = (method: string, path: string): 'view' | 'operate' => {
  if (!requiresOperate(method, path)) return 'view';
  // POST ONLY, exactly where `READ_SHAPED_POSTS` is consulted inside `requiresOperate`.
  // Writing this as a path test alone made `PUT /v1/marketing/regime` read at 'view' — the
  // test below caught it, and a PUT to a read endpoint is precisely the request that would
  // arrive from something confused enough to matter.
  if (method.toUpperCase() !== 'POST') return 'operate';
  return MARKETING_READ_SHAPED_POSTS.some((re) => re.test(path)) ? 'view' : 'operate';
};

/* ── The registrations in marketingDesk.ts, each with its own handler body ────── */

interface Handler {
  readonly path: string;
  readonly body: string;
  readonly from: number;
  readonly to: number;
}

/**
 * Strip comments before scanning for writes.
 *
 * Every docblock in `marketingDesk.ts` discusses `object_actions` and the INSERT it
 * appends, so a scan over raw source would find "writes" in the prose that explains why a
 * route has none. Block comments and comment-only lines go; code is untouched.
 */
const stripComments = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => (/^\s*(\/\/|\*)/.test(line) ? ' '.repeat(line.length) : line))
    .join('\n');

const CODE = stripComments(DESK_SRC);

const HANDLERS: readonly Handler[] = (() => {
  const re = /marketingDeskRoutes\.(get|post)\('([^']+)'/g;
  const found = [...CODE.matchAll(re)].map((m) => ({ path: m[2]!, at: m.index ?? 0 }));
  return found.map((r, i) => ({
    path: r.path,
    from: r.at,
    to: i + 1 < found.length ? found[i + 1]!.at : CODE.length,
    body: CODE.slice(r.at, i + 1 < found.length ? found[i + 1]!.at : CODE.length),
  }));
})();

const handler = (path: string): Handler => {
  const hit = HANDLERS.find((h) => h.path === path);
  if (!hit) throw new Error(`${path} is not registered in marketingDesk.ts`);
  return hit;
};

/** The two routes on this router that are allowed to change state. */
const MUTATING_HANDLERS = ['/:id/triage', '/desk-mode'] as const;

/**
 * Anything that changes state, whether written as SQL here or delegated to a helper. The
 * helper names are included because a write moved into a function is still a write:
 * `setReplyStatus` moves a queue row, `appendModeRecord` appends the governance ledger, and
 * `lockModeLedger` only ever precedes one.
 */
const WRITE_MARKERS = [
  /INSERT\s+INTO/gi,
  /\bUPDATE\s+[a-z_]+\s+SET/gi,
  /DELETE\s+FROM/gi,
  /setReplyStatus\s*\(/g,
  /appendModeRecord\s*\(/g,
  /lockModeLedger\s*\(/g,
  /\.connect\s*\(/g,
];

describe('the three read-shaped POSTs gate at view', () => {
  it('declares exactly the three, each anchored to its own path', () => {
    expect(MARKETING_READ_SHAPED_POSTS.length).toBe(READ_SHAPED.length);
    for (const path of READ_SHAPED) {
      const matching = MARKETING_READ_SHAPED_POSTS.filter((re) => re.test(path));
      expect(matching.length, `${path} is matched by ${matching.length} entries`).toBe(1);
    }
    for (const re of MARKETING_READ_SHAPED_POSTS) {
      // Anchored at both ends. An unanchored pattern would exempt a future
      // `/v1/marketing/regime/anything` — the shape of the GPS exemption app.ts forbids.
      expect(re.source.startsWith('^'), re.source).toBe(true);
      expect(re.source.endsWith('$'), re.source).toBe(true);
    }
  });

  it('answers view for each of them under the tier app.ts computes', () => {
    for (const path of READ_SHAPED) {
      expect(effectiveTier('POST', path), path).toBe('view');
    }
  });

  it('matches nothing outside those three paths', () => {
    const strangers = [
      // Sibling and near-miss marketing paths.
      '/v1/marketing/regime/history',
      '/v1/marketing/regimes',
      '/v1/marketing/triage/assess/all',
      '/v1/marketing/41/triage',
      '/v1/marketing/adoption/record',
      '/v1/marketing/desk-mode',
      // Other compartments, including the one app.ts says may never be exempted.
      '/v1/gps/regime',
      '/v1/gps/adoption',
      '/v1/projects/score',
      '/v1/command/adoption',
    ];
    for (const path of strangers) {
      const hit = MARKETING_READ_SHAPED_POSTS.find((re) => re.test(path));
      expect(hit?.source ?? null, `${path} is exempted by ${String(hit?.source)}`).toBeNull();
    }
  });
});

describe('every real marketing mutation still demands operate', () => {
  it('is asserted against the live boundary, not a copy of it', () => {
    // `requiresOperate` DIRECTLY, so an exemption added to `app.ts` itself — by this wave
    // or a later one — that happened to match a marketing write turns this red.
    for (const path of MUTATIONS) {
      expect(requiresOperate('POST', path), path).toBe(true);
    }
  });

  it('stays at operate under the composed tier as well', () => {
    for (const path of MUTATIONS) {
      expect(effectiveTier('POST', path), path).toBe('operate');
    }
  });

  it('leaves the deny-by-default floor intact for a marketing path nobody has listed', () => {
    // The property that makes the next route safe: an endpoint that is not on the list
    // requires the write tier, so adding one is a decision rather than an accident.
    expect(effectiveTier('POST', '/v1/marketing/some-new-route')).toBe('operate');
    expect(effectiveTier('PUT', '/v1/marketing/regime')).toBe('operate');
    expect(effectiveTier('DELETE', '/v1/marketing/adoption')).toBe('operate');
  });

  it('still reads GET at view', () => {
    expect(effectiveTier('GET', '/v1/marketing/desk')).toBe('view');
  });
});

describe('the three downgraded handlers mutate nothing, in the source', () => {
  it('finds all six registrations, so the scans below are not over a short list', () => {
    expect(HANDLERS.map((h) => h.path).sort()).toEqual(
      ['/:id/triage', '/adoption', '/desk', '/desk-mode', '/regime', '/triage/assess'].sort(),
    );
  });

  it('puts every write marker in the file inside one of the two mutating handlers', () => {
    const offsets: { marker: string; at: number; snippet: string }[] = [];
    for (const re of WRITE_MARKERS) {
      for (const m of CODE.matchAll(re)) {
        offsets.push({
          marker: re.source,
          at: m.index ?? 0,
          snippet: CODE.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + 40).replace(/\s+/g, ' '),
        });
      }
    }
    // Non-vacuity: this router DOES write, twice, and a scan that found nothing would pass
    // every assertion below while proving nothing.
    expect(offsets.length).toBeGreaterThan(0);

    const allowed = MUTATING_HANDLERS.map((p) => handler(p));
    const escaped = offsets.filter((o) => !allowed.some((h) => o.at >= h.from && o.at < h.to));
    expect(
      escaped.map((o) => `${o.marker} @ ${String(o.at)}: …${o.snippet}…`),
      'a state change lives outside POST /:id/triage and POST /desk-mode. If it is inside '
      + '/regime, /triage/assess or /adoption, those three are on MARKETING_READ_SHAPED_POSTS '
      + 'and a view-granted member can now reach it.',
    ).toEqual([]);
  });

  it('keeps /regime pure — it does not even take a pool', () => {
    // The strongest of the three: no `getPool` at all, so there is no read to grow into a
    // write. Asserted separately because it is a property worth not losing quietly.
    expect(handler('/regime').body).not.toMatch(/getPool/);
  });

  it('lets /triage/assess and /adoption read, and only read', () => {
    for (const path of ['/triage/assess', '/adoption'] as const) {
      const body = handler(path).body;
      // Both touch the database, so the assertion is about the SHAPE of the traffic:
      // SELECTs and the migration probe, never a transaction to write inside.
      expect(body, `${path} opens a transaction`).not.toMatch(/BEGIN|COMMIT|ROLLBACK/);
      expect(body, `${path} takes a client`).not.toMatch(/\.connect\s*\(/);
    }
    // And each really does read, or the assertion above is about nothing.
    expect(handler('/triage/assess').body).toMatch(/isMigrated|buildTriageReading/);
    expect(handler('/adoption').body).toMatch(/readDeskStanding/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 *  THE FOURTH READ-SHAPED POST: `POST /review` ON marketingGates.ts
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The drafting room's live engine check. It is the route that turns "at least one gate never
 * ran" into a verdict, and a `marketing:view` member — which is what the request-access flow
 * grants by default — is exactly the person who needs it and cannot write. Left at the
 * default tier every gate on that screen renders UNCHECKED behind a 403.
 *
 * The exemption is only safe while the handler stays a read, so that is asserted against
 * the source rather than described. The scan is scoped to THIS handler and not the whole
 * file, because `marketingGates.ts` legitimately writes in three other handlers
 * (`/claim-safety` records the 0062 row, `/corroborate` writes an observation, `/:id/silence`
 * writes the silence record) — a whole-file scan would either be red forever or would have
 * to excuse those three, and the excuse is what rots.
 */

const GATES_CODE = stripComments(GATES_SRC);

const GATES_HANDLERS: readonly Handler[] = (() => {
  const re = /marketingGatesRoutes\.(get|post)\('([^']+)'/g;
  const found = [...GATES_CODE.matchAll(re)].map((m) => ({ path: m[2]!, at: m.index ?? 0 }));
  return found.map((r, i) => ({
    path: r.path,
    from: r.at,
    to: i + 1 < found.length ? found[i + 1]!.at : GATES_CODE.length,
    body: GATES_CODE.slice(r.at, i + 1 < found.length ? found[i + 1]!.at : GATES_CODE.length),
  }));
})();

const gatesHandler = (path: string): Handler => {
  const hit = GATES_HANDLERS.find((h) => h.path === path);
  if (!hit) throw new Error(`${path} is not registered in marketingGates.ts`);
  return hit;
};

describe('POST /review is declared a read, and its handler is one', () => {
  it('finds all eight gate registrations, so the scan below is not over a short list', () => {
    expect(GATES_HANDLERS.map((h) => h.path)).toEqual([
      '/claim-safety', '/review', '/replies/:id/provenance', '/replies/:id/corroborate',
      '/silence', '/:id/silence', '/metrics', '/loop',
    ]);
  });

  it('declares exactly one path, anchored at both ends', () => {
    expect(MARKETING_GATES_READ_SHAPED_POSTS.length).toBe(1);
    const [re] = MARKETING_GATES_READ_SHAPED_POSTS;
    expect(re!.test('/v1/marketing/review')).toBe(true);
    expect(re!.source.startsWith('^'), re!.source).toBe(true);
    expect(re!.source.endsWith('$'), re!.source).toBe(true);
  });

  it('exempts none of the three mutating POSTs on the same router', () => {
    for (const path of [
      '/v1/marketing/claim-safety',
      '/v1/marketing/replies/41/corroborate',
      '/v1/marketing/41/silence',
      // Near-misses on the exempted path itself.
      '/v1/marketing/review/history',
      '/v1/marketing/reviews',
      '/v1/gps/review',
    ]) {
      const hit = MARKETING_GATES_READ_SHAPED_POSTS.find((re) => re.test(path));
      expect(hit?.source ?? null, `${path} is exempted by ${String(hit?.source)}`).toBeNull();
    }
  });

  it('keeps every write marker on this router out of the /review handler', () => {
    const body = gatesHandler('/review').body;
    for (const re of [/INSERT\s+INTO/gi, /\bUPDATE\s+[a-z_]+\s+SET/gi, /DELETE\s+FROM/gi,
      /recordGateDecision\s*\(/g, /writeCorroboration\s*\(/g, /recordPostedOn\s*\(/g,
      /setReplyStatus\s*\(/g, /\.connect\s*\(/g, /BEGIN|COMMIT|ROLLBACK/g]) {
      const hit = new RegExp(re.source, re.flags).exec(body);
      expect(hit?.[0] ?? null, `/review contains ${re.source}`).toBeNull();
    }
    // And it really does run the engines, or the assertion above is about nothing.
    expect(body).toMatch(/gateOutboundText\(getPool\(\)/);
  });

  it('names releasesNoText on the wire rather than only in a comment', () => {
    // The response type has no `usableText` field. This asserts the handler also SAYS so,
    // because that sentence is what a surface renders when it explains why no text appeared.
    expect(gatesHandler('/review').body).toMatch(/releasesNoText: true/);
  });

  it('shows the three mutating handlers really do write, so the scoping is not decoration', () => {
    // If none of them wrote, "scoped to one handler" would be a distinction without a
    // difference and a whole-file scan would have been the honest thing to do.
    expect(gatesHandler('/claim-safety').body).toMatch(/recordGateDecision\s*\(/);
    expect(gatesHandler('/replies/:id/corroborate').body).toMatch(/writeCorroboration\s*\(/);
    expect(gatesHandler('/:id/silence').body).toMatch(/INSERT\s+INTO|setReplyStatus\s*\(/i);
  });
});

describe('app.ts itself gates all four read-shaped marketing POSTs at view', () => {
  /*
   * THE RATCHET FOR THE SPREAD. `effectiveTier` composes `requiresOperate` with the routers'
   * own lists and therefore answers 'view' whichever half is doing the work — it cannot
   * detect `app.ts` dropping the spread. This calls the live boundary DIRECTLY, so removing
   * either spread from `READ_SHAPED_POSTS` turns this red instead of quietly returning four
   * reads to the write tier for every view-granted member.
   */
  const ALL_FOUR = [
    '/v1/marketing/regime',
    '/v1/marketing/triage/assess',
    '/v1/marketing/adoption',
    '/v1/marketing/review',
  ] as const;

  it('answers view for each of the four', () => {
    for (const path of ALL_FOUR) {
      expect(requiresOperate('POST', path), `${path} is not exempted in app.ts`).toBe(false);
    }
  });

  it('still answers operate for a PUT to the same paths', () => {
    // The allowlist is consulted for POST only. A PUT to a read endpoint is exactly the
    // request that arrives from something confused enough to matter.
    for (const path of ALL_FOUR) {
      expect(requiresOperate('PUT', path), path).toBe(true);
    }
  });

  it('exempts nothing else under /v1/marketing', () => {
    for (const path of [
      '/v1/marketing/41/triage', '/v1/marketing/desk-mode', '/v1/marketing/claim-safety',
      '/v1/marketing/41/silence', '/v1/marketing/replies/41/corroborate',
      '/v1/marketing/ingest', '/v1/marketing/tick', '/v1/marketing/record',
      '/v1/marketing/erasure', '/v1/marketing/retention/run', '/v1/marketing/41/draft',
      '/v1/marketing/draft/41/approve', '/v1/marketing/crisis/incident',
    ]) {
      expect(requiresOperate('POST', path), `${path} is exempted from the write tier`).toBe(true);
    }
  });
});
