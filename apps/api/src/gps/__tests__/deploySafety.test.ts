import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
 * A quote is arithmetic over the compiled catalogue (`packages/shared/src/gps/
 * catalogue.ts`) and the catalogue listing is the catalogue itself, so both keep
 * working perfectly during the migration window — adding a probe to them would be
 * cargo cult. The allow-list is what stops that reasoning from being abused: an
 * entry here is only permitted if the handler contains no database access at all,
 * which the next test enforces.
 */
const DB_FREE_HANDLERS: readonly string[] = ['/offers', '/quote'];

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
