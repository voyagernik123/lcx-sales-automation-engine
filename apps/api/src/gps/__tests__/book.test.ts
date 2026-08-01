import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * THE BOOK (Phase 6) — the API's own tests, in three layers.
 *
 *  1 SOURCE-LEVEL RATCHETS. Deploy safety and the contract rule, asserted by reading
 *    the files as text. They are source-level because the failure they exist for is
 *    not "this was wrong once" — it is a NEW route added months from now without the
 *    migration guard, which is invisible until the next deploy-ahead-of-a-migration.
 *    A behavioural test cannot catch it: it would need a database WITHOUT the tables,
 *    which is the one environment CI does not give us.
 *
 *  2 D1 ENFORCEMENT. Every decision-bearing field of `BookResponse` must be claimed
 *    by a figure in `BOOK_FIGURES`, every `answers` path must still resolve against a
 *    composed response, and every figure must open to rows or to a stated refusal.
 *    This is the doctrine as a mechanism rather than an aspiration: a number added to
 *    the shared response with no way to open it fails here.
 *
 *  3 BEHAVIOUR over fixtures, including the two engines this phase exists to wire
 *    (`benchHeadroom`, `marginRealisation`) and the drift reconciliation that keeps
 *    the drill-down's mirrored predicates honest.
 *
 * ══ WHY THE MODULE IS LOADED DYNAMICALLY ══
 * `packages/shared/src/gps/index.ts` and `packages/shared/src/index.ts` do not
 * re-export `gps/book.ts`, `benchHeadroom`, `marginRealisation` or `WIP_STATUSES`
 * yet, and `@lcx/shared` declares a single `"."` export so no deep path resolves
 * (TS2307/ERR_MODULE_NOT_FOUND). THE BARRELS BELONG TO THE HUMAN WIRING PASS — this
 * pass owns three files and none of them is a barrel — and `routes/gpsLoop.ts`,
 * `gps/conflict.ts` and `apps/web/src/lib/api/gpsBook.ts` are all in the same
 * position by the same rule.
 *
 * So layer 1 always runs, and layers 2 and 3 are skipped ONLY while the load fails
 * for exactly that reason: the first `it` below asserts the failure names
 * `@lcx/shared`, so any OTHER load failure — a genuine bug, a circular import, a
 * typo — fails the suite loudly instead of hiding behind a skip. When the barrel
 * lands, nothing is skipped and no line of this file changes.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const routesRaw = readFileSync(resolve(SRC, 'routes/gpsBook.ts'), 'utf8');
const routes = strip(routesRaw);
const dataRaw = readFileSync(resolve(SRC, 'gps/book.ts'), 'utf8');
const data = strip(dataRaw);

/* ══ LAYER 1 · DEPLOY SAFETY ═════════════════════════════════════════════════ */

/**
 * Handlers that touch NO table and therefore carry no probe. `/book/figures` is the
 * compiled figure catalogue — arithmetic-free, row-free, and useful precisely while
 * the migration is pending. The allow-list is what stops that reasoning from being
 * abused: the next test proves the entry contains no database access at all.
 */
const DB_FREE_HANDLERS: readonly string[] = ['/book/figures'];

interface Handler {
  method: string;
  path: string;
  body: string;
}

function handlers(): Handler[] {
  const re = /gpsBookRoutes\.(get|post|patch|delete|put)\('([^']+)'/g;
  const found: Array<{ method: string; path: string; start: number }> = [];
  for (let m = re.exec(routes); m; m = re.exec(routes)) {
    found.push({ method: m[1], path: m[2], start: m.index });
  }
  return found.map((h, i) => ({
    method: h.method,
    path: h.path,
    body: routes.slice(h.start, found[i + 1]?.start ?? routes.length),
  }));
}

describe('every book route survives a missing migration', () => {
  it('registers the routes the phase claims to have', () => {
    // A floor, not an exact count: if the regex stops matching, every assertion
    // below would pass vacuously, which is how a source ratchet dies quietly.
    const hs = handlers();
    expect(hs.length).toBeGreaterThanOrEqual(3);
    const paths = hs.map((h) => h.path);
    for (const required of ['/book', '/book/figures', '/book/rows']) {
      expect(paths, `missing route ${required}`).toContain(required);
    }
  });

  it('guards every handler that touches the database', () => {
    for (const h of handlers()) {
      if (DB_FREE_HANDLERS.includes(h.path)) continue;
      expect(
        h.body,
        `GET ${h.path} has no isMigrated() check — it returns 500 during the ` +
          'deploy-before-migration window, which the desk reads as "the platform is down"',
      ).toContain('isMigrated(');
    }
  });

  it('lets a handler skip the probe ONLY if it touches no table', () => {
    for (const h of handlers()) {
      if (!DB_FREE_HANDLERS.includes(h.path)) continue;
      expect(h.body, `${h.path} is allow-listed as DB-free but calls getPool()`).not.toContain('getPool(');
      expect(h.body, `${h.path} is allow-listed as DB-free but runs a query`).not.toMatch(/\.query\(/);
      expect(h.body, `${h.path} is allow-listed as DB-free but reads the book`).not.toMatch(/readBook/);
    }
  });

  it('answers reads with an empty, well-shaped body rather than an error', () => {
    // The UI renders its banner off `migrated: false`, and `emptyBook()` is composed
    // by the real engines so no field is undefined. Returning `{}` would make every
    // number on the page read as undefined, which is how the last GPS outage looked.
    expect(routes).toContain('emptyBook(');
    expect(data).toContain('export function emptyBook');
    expect(data).toMatch(/migrated:\s*false/);
  });

  it('has no write handler at all, so it needs no 503 branch', () => {
    // The honest local form of "writes answer 503, never 500". The book is a READ:
    // every write that could change it already exists on the quote desk, the delivery
    // desk and the conflict register, and a second write path to the same rows is how
    // two surfaces come to disagree about what a deposit is. Asserted rather than
    // intended — and if a write is ever added, this test is where the 503 discipline
    // has to be added with it.
    expect(routes).not.toMatch(/gpsBookRoutes\.(post|put|patch|delete)\(/);
    expect(routes).not.toContain('503');
  });

  it('validates input BEFORE probing the environment, on every parameterised handler', () => {
    // A malformed request is malformed in every environment. Answering an empty 200
    // for an unknown figure would tell the caller to retry something that can never
    // succeed, and answering 400 after the probe would be luck rather than order.
    for (const h of handlers()) {
      if (DB_FREE_HANDLERS.includes(h.path)) continue;
      const probe = h.body.indexOf('isMigrated(');
      const valid = h.body.indexOf('VALIDATION');
      expect(probe, `${h.path} has no probe`).toBeGreaterThan(-1);
      expect(valid, `${h.path} validates nothing`).toBeGreaterThan(-1);
      expect(valid, `${h.path} probes the migration before it validates the query`).toBeLessThan(probe);
    }
  });

  it('probes the three migrations independently', () => {
    // 0047 (the book), 0049 (the coordination ceiling) and gps_outcome (realised
    // margin) are applied by hand at different times. One shared flag would either
    // hide two thirds of the book or throw on a table that has not landed.
    expect(data).toContain('isMigrated(pool)');
    expect(data).toContain('isDeliveryMigrated(pool)');
    expect(data).toContain('isOutcomeMigrated(pool)');
  });
});

describe('the SQL is parameterised and the money survives the driver', () => {
  it('interpolates nothing into a statement except the frozen column list', () => {
    // `POSITION_COLS` is a module constant containing no input; every VALUE is a
    // placeholder. Any other `${` inside a query string is a concatenated statement.
    const queries = [...data.matchAll(/pool\.query<?[^(]*\(\s*`([\s\S]*?)`/g)].map((m) => m[1]);
    expect(queries.length, 'no queries found — the extractor no longer matches').toBeGreaterThan(0);
    for (const q of queries) {
      for (const interpolation of q.match(/\$\{[^}]*\}/g) ?? []) {
        expect(
          interpolation,
          `a statement interpolates ${interpolation}. Only the frozen POSITION_COLS constant may be ` +
            'interpolated; every value is a $n placeholder.',
        ).toBe('${POSITION_COLS}');
      }
    }
    expect(data).toContain('LIMIT $1');
  });

  it('normalises every bigint column through one helper', () => {
    // `bigint` arrives as a STRING from node-postgres. `"1200000" + 0` is
    // `"12000000"` — a figure ten times too large, silently — and concentration is a
    // ratio of sums, so one coerced string poisons every share on the screen.
    for (const col of ['price_cents', 'vendor_cost_cents', 'deposit_required_cents']) {
      const re = new RegExp(`cents\\(r\\.${col}\\)`);
      expect(data, `${col} is not read through cents()`).toMatch(re);
    }
    expect(data).not.toMatch(/parseFloat|toFixed/);
  });
});

describe('the response contract is imported, never re-declared', () => {
  it('declares no copy of a shared response shape', () => {
    // The rule written in blood: a hand-copied `GpsSummary` in the web api directory
    // claimed three fields the API never returned, tsc type-checked the fiction
    // because a copy is syntactically perfect, and the page's own test agreed with it
    // because the test mocked the copy.
    for (const name of [
      'BookResponse', 'BookConcentration', 'CashConversion', 'BookHealth',
      'BookPlaceholders', 'BookUnresolved', 'BenchHeadroom', 'WipLoad', 'MarginRealisation',
    ]) {
      expect(data, `apps/api re-declares ${name}`).not.toMatch(new RegExp(`interface\\s+${name}\\b`));
      expect(routes, `the route file re-declares ${name}`).not.toMatch(new RegExp(`interface\\s+${name}\\b`));
    }
    expect(data).toMatch(/type BookResponse,?/);
  });

  it('names the one shape it does declare, and where it must move', () => {
    // `BookDrill` is the drill-down envelope; the shared layer has no declaration of
    // it and this pass owns no shared file. The docblock must say so, because the
    // failure mode is a web-side copy rather than a move.
    expect(dataRaw).toContain('BookDrill');
    expect(dataRaw).toMatch(/packages\/shared/);
    expect(dataRaw).toMatch(/hand-copied/);
  });
});

/* ══ THE MODULE, LOADED DYNAMICALLY — see the docblock at the top ═════════════ */

type BookModule = typeof import('../book.js');
type Position = Parameters<BookModule['collectionBaseRate']>[0][number];

let mod: BookModule | null = null;
let loadError: unknown = null;
try {
  mod = await import('../book.js');
} catch (err) {
  loadError = err;
}
const wired = mod !== null;
/** Non-null accessor, so the skipped branches need no `!` on every line. */
const M = (): BookModule => {
  if (!mod) throw new Error('book module not loaded');
  return mod;
};

/**
 * THE EXPORTS THIS PHASE IS WAITING ON, as data rather than as prose.
 *
 * Grouped by who needs them, because two different pending items are being tracked:
 * the first group is Phase 6's own dependency, the second is already-shipped API
 * modules this file reuses (`gps/loop.ts`, `gps/deliveryDesk.ts`) whose engines the
 * ROOT barrel also omits — `packages/shared/src/gps/index.ts` exports them and
 * `packages/shared/src/index.ts` re-exports only the Phase 1 subset.
 */
const BARREL_EXPORTS_THIS_PHASE_NEEDS: readonly string[] = [
  // packages/shared/src/gps/book.ts — not re-exported by ANY barrel yet.
  'bookConcentration', 'cashConversion', 'bindingConstraint', 'bookHealth',
  'isOpenPosition', 'positionValueCents', 'ageInDays', 'bracketForAgeDays',
  'VALUE_AXES', 'AXIS_LABEL', 'FUNNEL_STAGES', 'FUNNEL_STAGE_LABELS',
  'AGING_BRACKETS', 'AGED_DEPOSIT_ALARM_DAYS', 'UNATTRIBUTED',
  // The two dark engines this phase exists to wire.
  'benchHeadroom', 'PARTNER_BENCH', 'marginRealisation',
  // The coordination-ceiling policy, imported rather than copied.
  'WIP_STATUSES', 'COORDINATION_HOURS_ARE_PLACEHOLDERS',
];

const BARREL_EXPORTS_THE_REUSED_MODULES_NEED: readonly string[] = [
  'WIN_REASONS', 'LOSS_REASONS', 'MIN_N_FOR_RATE', 'winLossSummary',
  'calibrationHealthView', 'outcomeCaptureForm', 'reviewPacket', 'loopResponse',
  'canAccept', 'composeDeliveryResponse', 'composeEngagementPlan', 'composeWipView',
];

const barrel = (await import('@lcx/shared')) as unknown as Record<string, unknown>;
const missingFromBarrel = [
  ...BARREL_EXPORTS_THIS_PHASE_NEEDS,
  ...BARREL_EXPORTS_THE_REUSED_MODULES_NEED,
].filter((name) => barrel[name] === undefined);

describe('the barrel wiring this phase is waiting on', () => {
  it('is skipped for a NAMED missing export, or not skipped at all', () => {
    // The mechanism that keeps the skips below honest. A skip is justified only while
    // `@lcx/shared` is genuinely missing an export this file's dependency chain needs;
    // any OTHER load failure — a circular import, a typo, a throw at module scope —
    // arrives here as "the module failed to load and nothing is missing", and fails.
    if (wired) {
      expect(loadError).toBeNull();
      expect(missingFromBarrel, 'the module loaded, so nothing should be missing').toEqual([]);
      return;
    }
    expect(
      missingFromBarrel,
      'apps/api/src/gps/book.ts failed to load and @lcx/shared is missing nothing, so this is a real ' +
        `bug rather than pending wiring:\n${String((loadError as { message?: string } | null)?.message ?? loadError)}`,
    ).not.toHaveLength(0);
  });

  it('prints exactly what the human wiring pass has to add', () => {
    if (wired) return;
    // Not a failure — a handover. The list is computed, so it cannot go stale, and it
    // shrinks to nothing on its own the moment the barrels are extended.
    console.warn(
      '[gps/book] pending barrel exports (add to packages/shared/src/gps/index.ts, then ' +
        `packages/shared/src/index.ts):\n  ${missingFromBarrel.join(', ')}`,
    );
    expect(missingFromBarrel.every((n) => typeof n === 'string')).toBe(true);
  });
});

/* ── Fixtures ──────────────────────────────────────────────────────────────── */

const AS_OF = '2026-08-01T00:00:00.000Z';

function pos(over: Partial<Position> & Pick<Position, 'engagementId' | 'clientId'>): Position {
  return {
    clientName: `Client ${over.clientId}`,
    offerKey: 'diagnostic',
    status: 'proposed',
    currency: 'USD',
    priceCents: 1_000_000,
    vendorCostCents: 400_000,
    jurisdiction: 'Liechtenstein',
    partner: null,
    depositRequiredCents: 500_000,
    acceptedAt: null,
    depositPaidAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    ...over,
  } as Position;
}

/**
 * A book with every state this phase has to be honest about: two currencies, a
 * negative-margin position, an aged unpaid deposit, a young unpaid one (censored from
 * the collection rate), a deposit banked with no acceptance date, a live unpriced
 * engagement, two jurisdiction spellings that are one holder, and three terminals.
 */
function fixture(): Position[] {
  return [
    pos({ engagementId: 'e1', clientId: 'A', offerKey: 'mica_whitepaper', status: 'in_delivery',
      priceCents: 2_000_000, vendorCostCents: 700_000, acceptedAt: '2026-06-01T00:00:00.000Z',
      depositPaidAt: '2026-06-05T00:00:00.000Z' }),
    pos({ engagementId: 'e2', clientId: 'A', offerKey: 'gtm_sprint', status: 'accepted',
      priceCents: 1_500_000, vendorCostCents: 600_000, jurisdiction: 'liechtenstein ',
      acceptedAt: '2026-06-15T00:00:00.000Z', depositRequiredCents: 750_000 }),
    pos({ engagementId: 'e3', clientId: 'B', offerKey: 'diagnostic', status: 'proposed',
      priceCents: 300_000, vendorCostCents: 400_000, jurisdiction: 'Malta' }),
    pos({ engagementId: 'e4', clientId: 'C', offerKey: 'marketing_activation', status: 'conflict_pending',
      priceCents: 0, vendorCostCents: 0, jurisdiction: null }),
    pos({ engagementId: 'e5', clientId: 'D', offerKey: 'legal_opinion_coordination', status: 'collected',
      currency: 'EUR', priceCents: 1_000_000, vendorCostCents: 500_000, jurisdiction: 'Germany',
      acceptedAt: '2026-03-01T00:00:00.000Z', depositPaidAt: '2026-03-05T00:00:00.000Z' }),
    pos({ engagementId: 'e6', clientId: 'D', offerKey: 'mica_whitepaper', status: 'invoiced',
      currency: 'EUR', priceCents: 800_000, vendorCostCents: 300_000, jurisdiction: 'Germany',
      acceptedAt: '2026-05-01T00:00:00.000Z', depositPaidAt: '2026-05-10T00:00:00.000Z' }),
    pos({ engagementId: 'e7', clientId: 'E', status: 'closed_lost', priceCents: 500_000,
      vendorCostCents: 100_000, jurisdiction: 'Malta' }),
    pos({ engagementId: 'e8', clientId: 'F', offerKey: 'gtm_sprint', status: 'accepted',
      priceCents: 400_000, vendorCostCents: 100_000, jurisdiction: 'Malta',
      acceptedAt: '2026-07-28T00:00:00.000Z', depositRequiredCents: 200_000 }),
    pos({ engagementId: 'e9', clientId: 'G', status: 'cancelled', priceCents: 250_000,
      vendorCostCents: 50_000, acceptedAt: '2026-05-01T00:00:00.000Z' }),
    pos({ engagementId: 'e10', clientId: 'H', offerKey: 'marketing_activation', status: 'deposit_paid',
      priceCents: 900_000, vendorCostCents: 300_000, depositPaidAt: '2026-07-01T00:00:00.000Z' }),
  ];
}

function composed(over: Partial<Parameters<BookModule['composeBook']>[0]> = {}) {
  return M().composeBook({
    positions: fixture(),
    asOf: AS_OF,
    basis: 'margin',
    migrated: true,
    deliveryMigrated: false,
    outcomeMigrated: false,
    truncated: false,
    rowsRead: 10,
    wip: null,
    margin: null,
    outcomeRejected: 0,
    ...over,
  });
}

/* ══ LAYER 2 · D1 — EVERY NUMBER OPENS ═══════════════════════════════════════ */

/**
 * Resolve a dotted path with `[]` for "every array element" and `{}` for "every value
 * of a record". Returns whether the final key was FOUND, not whether it was truthy: a
 * field present and null is a legitimate answer (`capacity` is null until a bench
 * exists) while a missing field is a renamed or deleted contract.
 */
function pathResolves(root: unknown, path: string): boolean {
  let cur: unknown[] = [root];
  let found = false;
  for (const part of path.split('.')) {
    const isArray = part.endsWith('[]');
    const isRecord = part.endsWith('{}');
    const key = part.replace(/(\[\]|\{\})$/, '');
    const next: unknown[] = [];
    found = false;
    for (const node of cur) {
      if (node == null || typeof node !== 'object') continue;
      if (!(key in (node as Record<string, unknown>))) continue;
      found = true;
      const value = (node as Record<string, unknown>)[key];
      if (isArray && Array.isArray(value)) next.push(...value);
      else if (isRecord && value != null && typeof value === 'object') next.push(...Object.values(value));
      else if (!isArray && !isRecord) next.push(value);
    }
    cur = next;
    if (!found) return false;
  }
  return found;
}

describe.skipIf(!wired)('D1 — no figure on this response is decoration', () => {
  it('claims every decision-bearing field of BookResponse', () => {
    const book = composed();
    const claimed = new Set(M().BOOK_FIGURES.flatMap((f) => f.answers.map((a) => a.split('.')[0].replace(/(\[\]|\{\})$/, ''))));
    // `migrated` and `asOf` are metadata about the read itself, not figures: they
    // describe when and whether, and a drill-down into "the current time" is nonsense.
    const metadata = new Set(['migrated', 'asOf']);
    for (const key of Object.keys(book)) {
      if (metadata.has(key)) continue;
      expect(
        claimed.has(key),
        `BookResponse.${key} is on the screen and no figure in BOOK_FIGURES opens it. ` +
          'A number that cannot be opened is decoration (D1) — add it to a figure\'s `answers`, ' +
          'and add the branch to drillBook that serves it.',
      ).toBe(true);
    }
  });

  it('resolves every answers path against a real composed response', () => {
    const book = composed({ deliveryMigrated: true, outcomeMigrated: true });
    for (const figure of M().BOOK_FIGURES) {
      for (const path of figure.answers) {
        expect(
          pathResolves(book, path),
          `${figure.id} claims to answer '${path}', which does not exist on BookResponse. ` +
            'Either the shared contract was renamed under this catalogue, or the claim was never true.',
        ).toBe(true);
      }
    }
  });

  it('opens every figure to rows or to a stated refusal, never to a blank table', () => {
    const book = composed();
    const positions = fixture();
    // One representative request per figure, built from the figure's own declared
    // parameters — so a new figure with new parameters is exercised without editing
    // this list, and a figure whose parameters cannot be satisfied fails loudly.
    for (const figure of M().BOOK_FIGURES) {
      const query: Record<string, string> = { figure: figure.id };
      for (const p of figure.requires) {
        query[p] =
          p === 'axis' ? 'client'
          : p === 'currency' ? 'USD'
          : p === 'stage' ? 'accepted'
          : p === 'leg' ? 'deposit'
          : p === 'holder' ? 'A'
          : p === 'offerKey' ? 'gtm_sprint'
          : p === 'bracket' ? 'd31_60'
          : 'accepted';
      }
      const validated = M().validateDrill(query);
      expect(validated.ok, `${figure.id} cannot be requested with its own declared parameters`).toBe(true);
      if (!validated.ok) continue;

      const drill = M().drillBook(book, positions, validated.request);
      expect(drill.figure).toBe(figure.id);
      expect(drill.asOf, `${figure.id} lost the timestamp`).toBe(book.asOf);
      expect(drill.formula.length, `${figure.id} states no formula`).toBeGreaterThan(20);
      expect(drill.source.length, `${figure.id} names no source`).toBeGreaterThan(3);
      expect(drill.sourceGrade, `${figure.id} carries no Admiralty grade`).toMatch(/^[A-F][1-6]$/);
      expect(drill.sourceGradeLabel.length).toBeGreaterThan(5);
      expect(drill.rowCount).toBe(drill.rows.length);
      expect(
        drill.rows.length > 0 || drill.refusal !== null || drill.notes.length > 0,
        `${figure.id} opened to an empty table with no reason. "No rows" and "this cannot be ` +
          'answered on this schema" are opposite facts and a blank table reports the wrong one (D2).',
      ).toBe(true);
      for (const row of drill.rows) {
        expect(Number.isInteger(row.priceCents), 'money is not integer cents').toBe(true);
        expect(Number.isInteger(row.marginCents), 'margin is not integer cents').toBe(true);
        if (row.contributionCents != null) {
          expect(Number.isInteger(row.contributionCents), 'a contribution is not integer cents').toBe(true);
        }
        expect(row.because.length, `${figure.id} lists a row with no stated reason`).toBeGreaterThan(5);
      }
    }
  });

  it('never pools two currencies into one total', () => {
    const book = composed();
    const positions = fixture();
    const mix = M().drillBook(book, positions, { figure: 'concentration.currency', basis: 'margin' });
    expect(mix.rows.some((r) => r.currency === 'EUR')).toBe(true);
    expect(mix.rows.some((r) => r.currency === 'USD')).toBe(true);
    expect(mix.totalCents, 'a total was computed across two currencies').toBeNull();
    expect(mix.currency).toBeNull();
    const usd = M().drillBook(book, positions, { figure: 'positions', basis: 'margin', currency: 'USD' });
    expect(usd.currency).toBe('USD');
    expect(usd.totalCents).not.toBeNull();
  });
});

describe.skipIf(!wired)('the drill-down cannot drift from the number it opens', () => {
  it('matches the engine row for row on every stage in every currency', () => {
    const book = composed();
    const positions = fixture();
    for (const funnel of book.cash.perCurrency) {
      for (const stage of funnel.stages) {
        const drill = M().drillBook(book, positions, {
          figure: 'cash.stage', basis: 'margin', currency: funnel.currency, stage: stage.stage,
        });
        expect(
          drill.rowCount,
          `${funnel.currency}/${stage.stage}: the drill-down lists ${drill.rowCount} rows for a count of ${stage.count}`,
        ).toBe(stage.count);
        expect(drill.notes.some((n) => n.startsWith('DRIFT'))).toBe(false);
      }
    }
  });

  it('matches the engine holder for holder on every axis', () => {
    const book = composed();
    const positions = fixture();
    for (const ccy of book.concentration.perCurrency) {
      for (const axis of ['client', 'offer', 'partner', 'jurisdiction'] as const) {
        const reading = ccy.byAxis[axis];
        for (const holder of reading.holders) {
          const drill = M().drillBook(book, positions, {
            figure: 'concentration.holder', basis: 'margin', currency: ccy.currency, axis, holder: holder.key,
          });
          expect(
            drill.rowCount,
            `${ccy.currency}/${axis}/${holder.key}: ${drill.rowCount} rows for ${holder.positions} positions`,
          ).toBe(holder.positions);
          expect(drill.notes.some((n) => n.startsWith('DRIFT'))).toBe(false);
        }
      }
    }
  });

  it('matches the engine on the deposit leg and on the aged alarm', () => {
    const book = composed();
    const positions = fixture();
    for (const funnel of book.cash.perCurrency) {
      const drill = M().drillBook(book, positions, {
        figure: 'cash.aging', basis: 'margin', currency: funnel.currency, leg: 'deposit',
      });
      expect(drill.rowCount).toBe(funnel.awaitingDeposit.count);
      expect(drill.notes.some((n) => n.startsWith('DRIFT'))).toBe(false);
    }
    const aged = M().drillBook(book, positions, { figure: 'cash.aged', basis: 'margin' });
    expect(aged.rowCount).toBe(book.cash.agedDepositCount);
    expect(aged.rowCount).toBe(1);
    expect(aged.rows[0].engagementId, 'the aged deposit is the 47-day-old one, not the 4-day-old one').toBe('e2');
    expect(aged.notes.some((n) => n.startsWith('DRIFT'))).toBe(false);
  });
});

/* ══ LAYER 3 · BEHAVIOUR ═════════════════════════════════════════════════════ */

describe.skipIf(!wired)('the dark engines are actually called', () => {
  it('returns null capacity with no bench, and the engine\'s own shape with one', () => {
    // The point of the phase. `benchHeadroom()` had never been called by anything
    // (GPS_100X_PLAN.md §0), and the guard here is on the DATA, not on a flag: one
    // recorded partner and the engine's output reaches the response intact.
    const noBench = composed();
    expect(noBench.capacity, 'an empty bench must read as unknown, not as zero slots').toBeNull();
    expect(
      noBench.unresolved.some((u) => u.field.includes('PARTNER_BENCH') && u.blocking),
      'a null capacity with no named reason is a silent default',
    ).toBe(true);

    const bench = [
      {
        id: 'p1',
        name: 'Anna',
        active: true,
        capabilities: [{ offerKey: 'gtm_sprint', seniority: 'senior', jurisdictions: null }],
        rateCards: [],
        capacity: { maxConcurrent: 2, activeEngagements: 0, unavailableUntil: null },
      },
    ] as unknown as Parameters<BookModule['benchCapacity']>[2];

    const withBench = composed({ partners: bench });
    expect(withBench.capacity).not.toBeNull();
    expect(withBench.capacity?.totalSpareSlots).toBe(2);
    // The engine's own warnings survive the trip rather than being flattened.
    expect(withBench.capacity?.availabilityEvaluated).toBe(true);
    const gtm = withBench.capacity?.perOffer.find((o) => o.offerKey === 'gtm_sprint');
    expect(gtm?.headroom).toBeGreaterThan(0);
    expect(gtm?.reasons.length).toBeGreaterThan(0);
    // Two fixture engagements are active on offers nobody can deliver.
    expect(withBench.capacity?.unstaffedActiveCount).toBeGreaterThan(0);
  });

  it('passes marginRealisation through when outcomes exist, and refuses when they do not', () => {
    const absent = composed();
    expect(absent.marginRealisation).toBeNull();
    expect(absent.unresolved.some((u) => u.field.includes('gps_outcome') && u.blocking)).toBe(true);
    const drill = M().drillBook(absent, fixture(), { figure: 'margin.realisation', basis: 'margin' });
    expect(drill.refusal, 'an absent margin must say WHY, and that it is not derivable').toMatch(/0% by\s+construction|by construction/);
    expect(drill.sourceGrade).toBe('F6');

    const realised = {
      byOffer: [{ key: 'gtm_sprint', n: 2, slippageMeanCents: -300_000, priceSlippageMeanCents: -100_000, costSlippageMeanCents: 200_000, slippageVarianceCents2: 1 }],
      byPartner: [], overall: null, excludedIncompleteRealisation: 1, excludedLost: 2,
      offersWithNoRealisationData: ['diagnostic'],
    } as unknown as NonNullable<Parameters<BookModule['composeBook']>[0]['margin']>;
    const present = composed({ outcomeMigrated: true, margin: realised });
    expect(present.marginRealisation).toBe(realised);
    const opened = M().drillBook(present, fixture(), { figure: 'margin.realisation', basis: 'margin' });
    expect(opened.refusal).toBeNull();
    expect(opened.notes.join(' ')).toContain('gtm_sprint');
    expect(opened.notes.join(' '), 'the blind spots ARE the finding').toContain('diagnostic');
  });

  it('reduces the engines to NULLABLE scalars so an unknown cannot become a verdict', () => {
    const book = composed();
    const byCode = new Map(book.health.binding.considered.map((c) => [c.code, c]));
    // No bench and no 0049: both checks must be UNEVALUABLE, not "did not bind".
    expect(byCode.get('bench_capacity')?.evaluable).toBe(false);
    expect(byCode.get('coordination_hours')?.evaluable).toBe(false);
    expect(book.health.binding.unevaluable).toContain('bench_capacity');
    for (const check of book.health.binding.considered) {
      expect(check.reason.length, `${check.code} was considered without a reason`).toBeGreaterThan(10);
    }
    // With the WIP load supplied, the same check becomes answerable.
    const withWip = composed({
      deliveryMigrated: true,
      wip: {
        active: 3, byOffer: {}, clients: 2, blocked: 0, awaitingClientInput: 0, awaitingCollection: 1,
        unstaffable: 3, coordinationHoursPerWeek: 15, capacityHoursPerWeek: 12, utilisationPct: 125,
        overCapacity: true, usesPlaceholderHours: true, headline: 'over capacity',
      } as unknown as NonNullable<Parameters<BookModule['composeBook']>[0]['wip']>,
    });
    expect(withWip.health.binding.considered.find((c) => c.code === 'coordination_hours')?.evaluable).toBe(true);
  });
});

describe.skipIf(!wired)('uncertainty sits beside the estimate, never inside it', () => {
  it('bands the score because the partner axis cannot be attributed', () => {
    const book = composed();
    expect(book.health.scoreBand.isPoint, 'no position names a partner, so the score cannot be a point').toBe(false);
    expect(book.health.scoreBand.low).toBeLessThanOrEqual(book.health.scoreBand.high);
    expect(book.health.scoreBand.basis).toMatch(/unattributed/i);
    /**
     * THE BAND CAN SIT ENTIRELY BELOW THE POINT SCORE, AND A SURFACE MUST NOT ASSUME
     * OTHERWISE. This is `bookHealth`'s documented arithmetic, not a defect here: an
     * axis it cannot measure is charged NOTHING against the score (an unknown is not a
     * problem, book.ts:1816) while BOTH ends of the band assume the attribution has
     * arrived and charge the concentration it would imply. With no partner recorded on
     * any position, every reading of the partner axis is more concentrated than "not
     * measurable", so both ends land below the score. Asserted so a renderer that draws
     * the score as a marker inside the band is written knowing it can fall outside it.
     */
    expect(book.health.scoreBand.high).toBeLessThanOrEqual(100);
    // Confidence is reported, never multiplied into the score.
    expect(book.health.confidenceBasis).toMatch(/never multiplies/);
    const sum = book.health.drivers.reduce((a, d) => a + d.points, 0);
    expect(sum, 'the drivers no longer reconstruct the score by addition').toBe(book.health.score);
  });

  it('states a likelihood only from a resolved sample, and censors the unfinished', () => {
    const rate = M().collectionBaseRate(fixture());
    expect(rate).not.toBeNull();
    // e1/e5/e6 paid; e9 was cancelled unpaid (settled); e2 and e8 are live and unpaid.
    expect(rate?.collected).toBe(3);
    expect(rate?.total).toBe(4);
    expect(rate?.censored, 'a two-day-old unpaid deposit is unfinished, not lost').toBe(2);

    const book = composed();
    expect(book.health.collectionOutlook).not.toBeNull();
    expect(book.health.collectionOutlook?.sampleSize).toBe(4);
    expect(book.health.collectionOutlookRefusal).toBeNull();

    // With nothing resolved, the term is refused rather than invented.
    const young = [pos({ engagementId: 'y1', clientId: 'Y', status: 'accepted', acceptedAt: '2026-07-31T00:00:00.000Z' })];
    expect(M().collectionBaseRate(young)).toBeNull();
    const noHistory = composed({ positions: young, rowsRead: 1 });
    expect(noHistory.health.collectionOutlook).toBeNull();
    expect(noHistory.health.collectionOutlookRefusal).toMatch(/invented precision|no outcome table/i);
  });

  it('refuses to age a receivable, and still lists the uncollected work', () => {
    const book = composed();
    expect(book.cash.receivableAnchorAvailable).toBe(false);
    expect(book.cash.receivableAgingRefusal).toMatch(/invoiced_at/);
    const drill = M().drillBook(book, fixture(), {
      figure: 'cash.aging', basis: 'margin', currency: 'EUR', leg: 'receivable',
    });
    // The rows exist and are listed; only the AGE is refused. Hiding uncollected work
    // behind a schema gap is how a services business dies quietly.
    expect(drill.rowCount).toBe(1);
    expect(drill.rows[0].engagementId).toBe('e6');
    expect(drill.rows[0].ageDays).toBeNull();
    expect(drill.refusal).toMatch(/invoiced_at/);
    expect(drill.sourceGrade).toBe('F6');
  });
});

describe.skipIf(!wired)('the empty book is unreadable, not healthy', () => {
  it('is well-shaped, says migrated:false, and says why', () => {
    const empty = M().emptyBook(AS_OF);
    expect(empty.migrated).toBe(false);
    expect(empty.positionCount).toBe(0);
    expect(empty.openPositionCount).toBe(0);
    expect(empty.currencies).toEqual([]);
    expect(empty.concentration.perCurrency).toEqual([]);
    expect(empty.cash.perCurrency).toEqual([]);
    expect(empty.capacity).toBeNull();
    expect(empty.wip).toBeNull();
    expect(empty.marginRealisation).toBeNull();
    // No field on the response may be undefined: the last GPS outage was a page
    // reading `undefined.total` off a response that never carried the field.
    for (const [key, value] of Object.entries(empty)) {
      expect(value, `emptyBook().${key} is undefined`).not.toBeUndefined();
    }
    expect(empty.health.headline, 'an empty screen must not read as a healthy one').toMatch(/not a healthy one/);
    const first = empty.unresolved[0];
    expect(first.blocking).toBe(true);
    expect(first.field).toMatch(/0047/);
    expect(first.consequence).toMatch(/UNREADABLE/);
  });

  it('orders unresolved inputs blocking first, and separates them from placeholders', () => {
    const book = composed();
    const flags = book.unresolved.map((u) => u.blocking);
    expect(flags, 'the blocking inputs are not first').toEqual([...flags].sort((a, b) => Number(b) - Number(a)));
    for (const u of book.unresolved) {
      expect(u.whyItMatters.length).toBeGreaterThan(20);
      expect(u.consequence.length).toBeGreaterThan(20);
      expect(['founder', 'founder+counsel', 'partner', 'engineering']).toContain(u.owner);
    }
    // A placeholder is a number standing in for a real one; an unresolved is a
    // capability that does not exist. Price bands are placeholders and NOT blocking
    // here, because the book reads the price a human typed onto each engagement.
    expect(book.placeholders.priceBandsArePlaceholders).toBe(true);
    expect(book.unresolved.find((u) => u.field.startsWith('price bands'))?.blocking).toBe(false);
    expect(book.placeholders.partnerRateCardsSupplied).toBe(false);
    expect(book.placeholders.vendorCostsArePlaceholders).toBe(true);
    expect(book.placeholders.blockingQuotingDecisions).toBeGreaterThan(0);
  });
});

describe.skipIf(!wired)('the uncomfortable list names the defect on every row', () => {
  it('finds each defect exactly where the fixture put it', () => {
    const book = composed();
    const drill = M().drillBook(book, fixture(), { figure: 'gaps', basis: 'margin' });
    const by = new Map(drill.rows.map((r) => [r.engagementId, r.because]));
    expect(by.get('e4'), 'a live engagement with no price is the cheapest thing to fix').toMatch(/UNPRICED/);
    expect(by.get('e3')).toMatch(/BELOW VENDOR COST/);
    expect(by.get('e10')).toMatch(/DEPOSIT BANKED WITH NO ACCEPTANCE/);
    expect(by.get('e2')).toMatch(/UNPAID/);
    // Every active engagement is on an offer with no partner (partnerOwner is null on
    // all five today), so the staffing defect must appear on the in-delivery rows.
    expect(by.get('e1')).toMatch(/NO PARTNER CAN DELIVER/);
    // Conflict checks are NOT re-counted here — one definition, on the register.
    expect(drill.notes.join(' ')).toMatch(/CONFLICT CHECKS are deliberately not re-counted/);
    // The gap list carries the system-level unresolved inputs too, so a printed page
    // has both halves: what is wrong with the rows and what is missing from the inputs.
    expect(drill.notes.some((n) => n.includes('BLOCKING'))).toBe(true);
  });
});

describe.skipIf(!wired)('a refusal names the valid values', () => {
  const bad = (q: Record<string, string>): string => {
    const v = M().validateDrill(q);
    expect(v.ok, `expected a refusal for ${JSON.stringify(q)}`).toBe(false);
    return v.ok ? '' : v.error;
  };

  it('refuses an unknown figure by listing every one that exists', () => {
    const error = bad({ figure: 'concentration' });
    expect(error).toContain('concentration.axis');
    expect(error).toContain('margin.realisation');
    expect(bad({})).toContain('figure must be one of');
  });

  it('refuses a missing required parameter and says what it is', () => {
    expect(bad({ figure: 'concentration.axis', currency: 'USD' })).toMatch(/axis is required.*client, offer, partner, jurisdiction/);
    expect(bad({ figure: 'concentration.axis', axis: 'client' })).toMatch(/currency is required/);
    expect(bad({ figure: 'concentration.holder', axis: 'client', currency: 'USD' })).toMatch(/holder is required.*not its label/s);
    expect(bad({ figure: 'cash.stage', currency: 'USD' })).toMatch(/stage is required/);
    expect(bad({ figure: 'cash.aging', currency: 'USD' })).toMatch(/leg is required/);
  });

  it('refuses a parameter the figure does not take rather than ignoring it', () => {
    // An ignored filter is how an operator comes to believe a list was scoped.
    expect(bad({ figure: 'wip', axis: 'client' })).toMatch(/does not take 'axis'/);
    expect(bad({ figure: 'health.score', currency: 'USD' })).toMatch(/does not take 'currency'/);
  });

  it('refuses every malformed enum value with its own list', () => {
    expect(bad({ figure: 'concentration.axis', axis: 'partners', currency: 'USD' })).toMatch(/axis must be one of/);
    expect(bad({ figure: 'cash.stage', currency: 'USD', stage: 'won' })).toMatch(/stage must be one of/);
    expect(bad({ figure: 'cash.aging', currency: 'USD', leg: 'both' })).toMatch(/leg must be one of/);
    expect(bad({ figure: 'cash.aging', currency: 'USD', leg: 'deposit', bracket: 'd0_30' })).toMatch(/bracket must be one of/);
    expect(bad({ figure: 'positions', offerKey: 'audit' })).toMatch(/offerKey must be one of/);
    expect(bad({ figure: 'positions', currency: 'US$' })).toMatch(/currency must be/);
    expect(bad({ figure: 'positions', basis: 'revenue' })).toMatch(/basis must be/);
  });

  it('accepts a well-formed request and normalises the currency', () => {
    const v = M().validateDrill({ figure: 'positions', currency: 'usd', basis: 'price' });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.request.currency).toBe('USD');
      expect(v.request.basis).toBe('price');
    }
  });

  it('refuses a currency or a holder the book does not hold, with what it does hold', () => {
    const book = composed();
    const missing = M().drillBook(book, fixture(), {
      figure: 'concentration.axis', basis: 'margin', axis: 'client', currency: 'GBP',
    });
    expect(missing.refusal).toMatch(/No positions are denominated in GBP/);
    expect(missing.refusal).toMatch(/EUR|USD/);
    const ghost = M().drillBook(book, fixture(), {
      figure: 'concentration.holder', basis: 'margin', axis: 'client', currency: 'USD', holder: 'Z',
    });
    expect(ghost.rowCount).toBe(0);
    expect(ghost.refusal).toMatch(/keys, not labels|Holder keys/);
  });
});

describe.skipIf(!wired)('the position load, against the driver\'s actual behaviour', () => {
  /** node-postgres returns `bigint` as a STRING and `timestamptz` as a Date. */
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'e1', client_id: 'A', client_name: 'Client A', jurisdiction: 'Liechtenstein',
    offer_key: 'mica_whitepaper', status: 'accepted', currency: 'usd',
    price_cents: '2000000', vendor_cost_cents: '700000', deposit_required_cents: '1000000',
    accepted_at: new Date('2026-06-01T00:00:00.000Z'), deposit_paid_at: null,
    created_at: new Date('2026-05-01T00:00:00.000Z'),
    ...over,
  });
  const stub = (rows: unknown[]) =>
    ({ query: async () => ({ rows }) }) as unknown as Parameters<BookModule['loadPositions']>[0];

  it('turns bigint strings into exact integer cents', async () => {
    const load = await M().loadPositions(stub([row()]));
    const p = load.positions[0];
    expect(typeof p.priceCents).toBe('number');
    expect(p.priceCents).toBe(2_000_000);
    expect(p.vendorCostCents).toBe(700_000);
    expect(p.depositRequiredCents).toBe(1_000_000);
    // The bug this guards: `"2000000" + 0` is `"20000000"`, and concentration is a
    // ratio of sums, so one coerced string poisons every share on the screen.
    expect(p.priceCents - p.vendorCostCents).toBe(1_300_000);
    expect(p.currency, 'currency is normalised so two spellings cannot be two holders').toBe('USD');
    expect(p.acceptedAt).toBe('2026-06-01T00:00:00.000Z');
    expect(p.depositPaidAt).toBeNull();
    expect(p.partner, 'there is no partner column; a fabricated one would delete the finding').toBeNull();
    expect('invoicedAt' in p, 'no invoice anchor may be invented from updated_at').toBe(false);
    expect(load.truncated).toBe(false);
  });

  it('reports truncation instead of quietly trimming a book it cannot total', async () => {
    const many = Array.from({ length: 5001 }, (_, i) => row({ id: `e${i}` }));
    const load = await M().loadPositions(stub(many));
    expect(load.truncated).toBe(true);
    expect(load.positions.length).toBe(5000);
    expect(load.rowsRead).toBe(5001);
    const book = composed({ positions: load.positions, truncated: true, rowsRead: 5001 });
    const note = book.unresolved.find((u) => u.field.startsWith('book size'));
    expect(note?.blocking, 'a partial read makes every share and rate invalid').toBe(true);
    expect(note?.consequence).toMatch(/invalid/);
  });
});

describe.skipIf(!wired)('the constraint drill-down carries the rows that made the verdict', () => {
  it('names the verdict, every candidate, and the engagements behind it', () => {
    const book = composed();
    const drill = M().drillBook(book, fixture(), { figure: 'constraint.check', basis: 'margin' });
    const notes = drill.notes.join('\n');
    expect(notes).toMatch(/^Verdict: /);
    // D2: every candidate is reported, chosen or not, evaluable or not.
    for (const check of book.health.binding.considered) {
      expect(notes, `candidate ${check.code} vanished from the audit trail`).toContain(check.label);
    }
    expect(notes).toMatch(/UNEVALUABLE/);
    // Today's verdict is unstaffable_offers: no offer names a delivering partner, so
    // the rows are the active engagements nobody can deliver.
    expect(book.health.binding.code).toBe('unstaffable_offers');
    expect(drill.rowCount).toBeGreaterThan(0);
    expect(drill.rows.every((r) => r.because.includes('no delivering partner'))).toBe(true);
  });

  it('refuses a constraint code the book never considered', () => {
    const book = composed();
    const drill = M().drillBook(book, fixture(), { figure: 'constraint.check', basis: 'margin', code: 'vibes' });
    expect(drill.refusal).toMatch(/not a constraint this book considered/);
    expect(drill.refusal).toMatch(/bench_capacity/);
  });
});

describe.skipIf(!wired)('the margin basis is a commercial decision, and it is reported', () => {
  it('reads the same book differently on price than on margin', () => {
    const marginBook = composed();
    const priceBook = composed({ basis: 'price' });
    expect(marginBook.concentration.basis).toBe('margin');
    expect(priceBook.concentration.basis).toBe('price');
    const usdMargin = marginBook.concentration.perCurrency.find((c) => c.currency === 'USD');
    const usdPrice = priceBook.concentration.perCurrency.find((c) => c.currency === 'USD');
    expect(usdPrice?.byAxis.client.totalPositiveCents).toBeGreaterThan(
      usdMargin?.byAxis.client.totalPositiveCents ?? 0,
    );
    // e3 is quoted below cost, so it is a POSITIVE holder on price and an excluded
    // non-positive holder on margin. A Herfindahl index is not defined over negative
    // shares — the loss-making client would otherwise increase measured diversification.
    expect(usdMargin?.byAxis.client.excludedNonPositive.some((h) => h.key === 'B')).toBe(true);
    expect(usdPrice?.byAxis.client.holders.some((h) => h.key === 'B')).toBe(true);
  });

  it('groups two spellings of one jurisdiction as one holder', () => {
    const book = composed();
    const usd = book.concentration.perCurrency.find((c) => c.currency === 'USD');
    const li = usd?.byAxis.jurisdiction.holders.find((h) => h.key === 'liechtenstein');
    expect(li?.positions, '"Liechtenstein" and "liechtenstein " are one holder').toBeGreaterThanOrEqual(2);
    // And the drill-down agrees, which is what the reconciliation test proves generally.
    const drill = M().drillBook(book, fixture(), {
      figure: 'concentration.holder', basis: 'margin', axis: 'jurisdiction', currency: 'USD', holder: 'liechtenstein',
    });
    expect(drill.rowCount).toBe(li?.positions);
  });

  it('bands the partner axis instead of guessing, and says which positions are unattributed', () => {
    const book = composed();
    const usd = book.concentration.perCurrency.find((c) => c.currency === 'USD');
    const partner = usd?.byAxis.partner;
    expect(partner?.hhi, 'no partner is recorded, so there is nothing to index').toBeNull();
    expect(partner?.unattributedPositions).toBeGreaterThan(0);
    expect(partner?.band).not.toBeNull();
    expect(partner?.band?.isPoint).toBe(false);
    const drill = M().drillBook(book, fixture(), {
      figure: 'concentration.holder', basis: 'margin', axis: 'partner', currency: 'USD', holder: '(unattributed)',
    });
    expect(drill.rowCount).toBe(partner?.unattributedPositions);
    expect(drill.rows.every((r) => r.because.includes('nobody recorded'))).toBe(true);
  });
});
