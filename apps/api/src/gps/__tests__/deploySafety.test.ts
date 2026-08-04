import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PENDING_MIGRATIONS, SHIPPED_MIGRATIONS } from '../../db/migrationLedger.js';

/**
 * DEPLOY SAFETY for GLOBAL SERVICES — the compartment must never look like an
 * outage, and the desk must never be told to retry something that cannot succeed.
 *
 * THE WINDOW THIS PROTECTS. A push to main ships the web bundle and the API
 * together, but migration 0047 is applied by hand against a database whose
 * credentials live in Render's dashboard. So there is a period — possibly hours,
 * possibly a weekend — where this code is live and `gps_client` does not exist.
 *
 * Unguarded, every GPS endpoint throws `relation "gps_engagement" does not exist`
 * and returns 500. The desk then cannot distinguish "one migration is pending" from
 * "the platform is down", and it is the second reading people act on. The
 * marketing compartment learned this the same way and its ratchet
 * (`marketing/__tests__/deploySafety.test.ts`) is the template for this one; the
 * shape is deliberately identical so that the two cannot drift into two different
 * ideas of what degrading honestly means.
 *
 * These assertions are SOURCE-LEVEL on purpose. A behavioural test would need a
 * database WITHOUT the tables, which is the one environment CI does not give us.
 * The failure mode they exist for is not "this was wrong once" — it is a NEW route
 * added months from now without the guard, which is invisible until the next time
 * someone deploys ahead of a migration.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const routes = strip(readFileSync(resolve(SRC, 'routes/gps.ts'), 'utf8'));
const service = strip(readFileSync(resolve(SRC, 'gps/service.ts'), 'utf8'));

/**
 * Handlers that touch NO table and therefore carry no probe.
 *
 * The catalogue listing is the catalogue itself, so it keeps working perfectly
 * during the migration window — adding a probe to it would be cargo cult. The
 * allow-list is what stops that reasoning from being abused: an entry here is only
 * permitted if the handler contains no database access at all, which the next test
 * enforces.
 *
 * `/quote` WAS HERE AND IS NOT ANY MORE. It now reads the jurisdictional perimeter
 * (`perimeterClearanceFor` → `loadPerimeter`) before it returns a price, because a
 * price for work the record says we may not sell is a number a human acts on. So it
 * touches a table, and the allow-list did exactly what its own comment said it
 * would: "adding a query to /quote later fails here rather than silently 500-ing on
 * the first Sunday deploy". It came off the list rather than the assertion coming
 * off the file.
 */
const DB_FREE_HANDLERS: readonly string[] = ['/offers'];

interface Handler {
  method: string;
  path: string;
  body: string;
}

/** Split the route file into one block per handler, in source order. */
function handlers(): Handler[] {
  const re = /gpsRoutes\.(get|post|patch|delete|put)\('([^']+)'/g;
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

describe('every GPS route survives a missing migration', () => {
  it('registers the routes the compartment claims to have', () => {
    // A floor, not an exact count: the point is that the enumeration above is
    // actually finding handlers. If the regex ever stops matching, every other
    // assertion in this file would pass vacuously.
    const hs = handlers();
    expect(hs.length).toBeGreaterThanOrEqual(9);
    const paths = hs.map((h) => h.path);
    for (const required of [
      '/clients', '/engagements', '/quote', '/summary',
      '/engagements/:id/proposal', '/engagements/:id/conflict-check',
      '/engagements/:id/status',
    ]) {
      expect(paths, `missing route ${required}`).toContain(required);
    }
  });

  it('guards every handler that touches the database', () => {
    for (const h of handlers()) {
      if (DB_FREE_HANDLERS.includes(h.path)) continue;
      expect(
        h.body,
        `${h.method.toUpperCase()} ${h.path} has no isMigrated() check — it returns 500 ` +
          'during the deploy-before-migration window',
      ).toContain('isMigrated(');
    }
  });

  it('lets a handler skip the probe ONLY if it touches no table', () => {
    // This is what keeps DB_FREE_HANDLERS honest. Adding a query to /quote later
    // fails here rather than silently 500-ing on the first Sunday deploy.
    for (const h of handlers()) {
      if (!DB_FREE_HANDLERS.includes(h.path)) continue;
      expect(h.body, `${h.path} is allow-listed as DB-free but calls getPool()`)
        .not.toContain('getPool(');
      expect(h.body, `${h.path} is allow-listed as DB-free but runs a query`)
        .not.toMatch(/\.query\(/);
    }
  });

  it('answers reads with an empty, well-shaped body rather than an error', () => {
    // The UI renders its banner off `migrated: false`. A read that threw instead
    // would put the page into its error state and read as broken.
    expect(routes).toMatch(/migrated:\s*false/);
    expect(routes).toContain('data: []');
    // The summary is an object, not a list, so it needs its own empty shape —
    // returning `{}` would make every field on the dashboard read as undefined.
    expect(routes).toContain('emptyDeskSummary()');
    expect(service).toContain('export function emptyDeskSummary');
  });

  it('answers writes 503, not 500', () => {
    // 503 says "valid request, come back later"; 500 says "we are broken".
    expect(routes).toContain('MIGRATION_PENDING');
    expect(routes).toMatch(/NOT_MIGRATED,\s*503/);
    expect(routes).not.toMatch(/NOT_MIGRATED,\s*5(?!03)\d\d/);
  });

  it('validates input BEFORE probing the environment, on every write', () => {
    // A malformed request is malformed in every environment. Answering 503 for a
    // bad uuid would tell the caller to retry something that can never succeed.
    for (const h of handlers()) {
      if (h.method !== 'post' || DB_FREE_HANDLERS.includes(h.path)) continue;
      const probe = h.body.indexOf('isMigrated(');
      const valid = h.body.indexOf('VALIDATION');
      expect(probe, `POST ${h.path} has no probe`).toBeGreaterThan(-1);
      expect(valid, `POST ${h.path} validates nothing`).toBeGreaterThan(-1);
      expect(
        valid,
        `POST ${h.path} probes the migration before it validates the payload`,
      ).toBeLessThan(probe);
    }
  });
});

describe('the probe itself cannot be the thing that breaks', () => {
  it('uses to_regclass, which returns NULL instead of throwing', () => {
    expect(service).toContain('to_regclass');
  });

  it('treats an unanswerable database as not-migrated rather than propagating', () => {
    // Sliced to `_resetMigrated`, not to the first `return migratedCache` — the
    // function opens with a cache-hit early return, so a naive slice ends before
    // the try/catch this is asserting about. (Same trap the marketing ratchet
    // documents at its line 87.)
    const fn = service.slice(service.indexOf('export async function isMigrated'));
    expect(fn.slice(0, fn.indexOf('_resetMigrated'))).toContain('catch');
  });

  it('caches, so a once-ever event does not cost a round trip on every read', () => {
    expect(service).toContain('migratedCache');
    expect(service).toContain('export function _resetMigrated');
  });
});

/**
 * A 503 THAT NAMES AN ALREADY-APPLIED MIGRATION IS WORSE THAN NO 503.
 *
 * Three GPS surfaces await migrations nobody has written, and all three named numbers
 * that were already taken by files on disk and applied on production:
 *   · `gps/loop.ts` said `0051_gps_outcome.sql` — `0051_gps_evidence_refusal.sql` exists
 *   · `routes/gpsOrigination.ts` said "awaiting migration 0050" — `0050_gps_perimeter.sql` exists
 *   · `apps/web/src/lib/api/gpsLoop.ts` hard-coded `0050_gps_outcome.sql` as a fallback
 * An operator told to run 0050 finds 0050 applied in `_migrations` and concludes the
 * API is lying — the exact reaction `MIGRATION_PENDING` exists to prevent. The comment
 * beside the first one claimed the number was "checked against the directory rather
 * than assumed"; nothing checked it. This does.
 *
 * ── WHY THIS ASKS THE LEDGER AND NOT THE DIRECTORY ───────────────────────────
 * It used to assert the declared file was ABSENT from `db/migrations`, using "exists
 * on disk" as a proxy for "already applied". That proxy was only ever true while the
 * pending migrations were unwritten. They are written now (0052-0056), so the proxy
 * inverted: it demanded the operator be sent to a file nobody had authored. Absence
 * was never the invariant. The invariant is that the named file is one they can run
 * and that running it will do something — it EXISTS, and it is NOT YET APPLIED —
 * and only `db/migrationLedger.ts` knows the second half, because applied-ness lives
 * in a Supabase database no test can reach.
 */
describe('every pending-migration filename is free and distinct', () => {
  const MIGRATIONS_DIR = resolve(SRC, 'db/migrations');
  const onDisk = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));

  /** Every `NNNN_name.sql` literal the GPS code offers an operator to run. */
  function declaredPendingFiles(): Array<{ file: string; where: string }> {
    const out: Array<{ file: string; where: string }> = [];
    const files = [
      'gps/loop.ts', 'gps/underwrite.ts', 'gps/origination.ts',
      'routes/gpsOrigination.ts', 'routes/gpsLoop.ts', 'routes/gpsUnderwrite.ts',
    ];
    for (const rel of files) {
      const code = strip(readFileSync(resolve(SRC, rel), 'utf8'));
      for (const m of code.matchAll(/'(\d{4}_[a-z0-9_]+\.sql)'/g)) {
        out.push({ file: m[1]!, where: rel });
      }
    }
    return out;
  }

  it('finds the declarations at all', () => {
    // Non-vacuity: three migrations are genuinely pending, so if this is empty the
    // regex has stopped matching and every assertion below passes for free.
    expect(declaredPendingFiles().length).toBeGreaterThanOrEqual(2);
  });

  it('names a file that exists, so the operator has something to run', () => {
    for (const { file, where } of declaredPendingFiles()) {
      expect(
        onDisk,
        `${where} tells an operator to run ${file} and no such file is in db/migrations. `
          + 'They cannot run it, so that surface refuses forever.',
      ).toContain(file);
    }
  });

  it('names no file whose refusal is not gated by a runtime probe', () => {
    /*
     * REWRITTEN 2026-08-04. The original assertion was `not.toContain(file)` against
     * SHIPPED — "never name a migration the ledger pins as applied". A read-only probe
     * of production then found ALL SIXTEEN "pending" migrations applied
     * (docs/phases/P1_CLAIM.md), so that assertion began demanding that live migrations
     * stay unpinned in order to keep a fallback message legal. That trades a real
     * ratchet for a hypothetical one.
     *
     * THE ORIGINAL BUG, from routes/gpsOrigination.ts:102-106: 0050 was on disk AND
     * applied, "so the one thing this message exists to do, it did wrong: an operator
     * sent to run 0050 found it applied and concluded the API was lying." Note WHY that
     * happened — there was no probe. The message fired unconditionally.
     *
     * So the invariant is not "never name an applied file". It is "never emit that
     * message unless the database has been asked". Every declaring module must gate its
     * refusal on a runtime existence check, and then naming an applied file is harmless
     * because the message cannot fire on an environment that has it.
     *
     * This is strictly stronger than the version it replaces: it survives a migration
     * being applied, and it fails if someone adds a MIGRATION_PENDING constant with no
     * probe behind it — which is the actual defect.
     */
    const PROBE = /to_regclass|is[A-Za-z]*Migrated|_MIGRATED\b/;
    for (const { file, where } of declaredPendingFiles()) {
      expect(
        [...Object.keys(SHIPPED_MIGRATIONS), ...PENDING_MIGRATIONS],
        `${where} names ${file}, which appears in neither ledger list. The desk would `
          + 'be told to run a file this repo does not account for.',
      ).toContain(file);

      const src = readFileSync(resolve(SRC, where), 'utf8');
      expect(
        PROBE.test(src),
        `${where} names ${file} in a MIGRATION_PENDING refusal, but ${where} contains no `
          + 'runtime existence probe. That is exactly the 0050 bug: the message fires on '
          + 'an environment that already has the table, and the operator is sent to run '
          + 'something applied. Gate it on to_regclass (or an is*Migrated helper).',
      ).toBe(true);
    }
  });

  it('uses a distinct number per pending migration', () => {
    const byNumber = new Map<string, Set<string>>();
    for (const { file } of declaredPendingFiles()) {
      const n = file.slice(0, 4);
      byNumber.set(n, (byNumber.get(n) ?? new Set()).add(file));
    }
    for (const [n, files] of byNumber) {
      expect(
        [...files],
        `two different pending migrations both claim number ${n}. Whichever the deploy `
          + 'applies second silently wins.',
      ).toHaveLength(1);
    }
    // …and no pending number is claimed by a DIFFERENT file on disk. Not "unused on
    // disk": the pending migrations have been written, so 0053_gps_outcome.sql
    // legitimately occupies 0053. What must never happen is `gps/loop.ts` naming
    // 0053_gps_outcome.sql while some OTHER 0053_*.sql also exists — whichever the
    // deploy applies second silently wins. That is the original bug verbatim
    // (`0051_gps_outcome.sql` declared, `0051_gps_evidence_refusal.sql` on disk), and
    // it still fails here.
    for (const [n, files] of byNumber) {
      const declared = [...files];
      const rivals = onDisk.filter((f) => f.slice(0, 4) === n && !declared.includes(f));
      expect(
        rivals,
        `pending migration number ${n} is also claimed by ${rivals.join(', ')} on disk. `
          + 'Whichever the deploy applies second silently wins.',
      ).toEqual([]);
    }
  });

  it('hard-codes no migration filename in the web client', () => {
    // A second copy of a filename in the browser is a second thing to keep in sync,
    // and it was wrong. The server names the file in `data.migration.file`.
    const web = resolve(SRC, '../../web/src/lib/api');
    for (const f of readdirSync(web).filter((x) => x.endsWith('.ts'))) {
      const code = strip(readFileSync(resolve(web, f), 'utf8'));
      const hits = [...code.matchAll(/'(\d{4}_[a-z0-9_]+\.sql)'/g)].map((m) => m[1]);
      expect(hits, `${f} hard-codes a migration filename`).toEqual([]);
    }
  });
});
