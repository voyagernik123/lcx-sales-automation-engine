import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * DEPLOY SAFETY — the compartment must never look like an outage.
 *
 * THE WINDOW THIS PROTECTS. A push to main ships the web bundle and the API
 * together, but migration 0046 is applied by hand against a database whose
 * credentials live in Render's dashboard. So there is a period — possibly hours,
 * possibly a weekend — where the code is live and the tables are not.
 *
 * Unguarded, every marketing endpoint throws `relation "marketing_x_reply" does
 * not exist` and returns 500. The desk then cannot distinguish "one migration is
 * pending" from "the platform is down", and they act on the second reading.
 *
 * Verified empirically before this test was written, by renaming both tables on a
 * running API and re-hitting every endpoint:
 *
 *   GET  summary / queue / :id/drafts   → 200, empty, migrated:false
 *   POST tick                           → 200, "nothing to sweep or poll yet"
 *   POST ingest (valid input)           → 503  (valid request, env not ready)
 *   POST ingest (bad handle)            → 400  (validation precedes the probe)
 *   5xx anywhere                        → none
 *
 * These assertions exist so that stays true. They are source-level on purpose: a
 * behavioural test would need a database WITHOUT the tables, which is the one
 * environment CI does not give us.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const routes = strip(readFileSync(resolve(SRC, 'routes/marketing.ts'), 'utf8'));
const service = strip(readFileSync(resolve(SRC, 'marketing/service.ts'), 'utf8'));

describe('every marketing route survives a missing migration', () => {
  /**
   * One `isMigrated` call per handler. Counted rather than spot-checked, because
   * the failure mode is a NEW route added later without the guard — which is
   * invisible until the next time someone deploys ahead of a migration.
   */
  it('guards every handler in the file', () => {
    const handlers = routes.match(/marketingRoutes\.(get|post|patch|delete)\(/g) ?? [];
    const guards = routes.match(/isMigrated\(/g) ?? [];
    expect(handlers.length).toBeGreaterThan(5);
    expect(
      guards.length,
      `${handlers.length} handlers but only ${guards.length} isMigrated() checks — ` +
        'a route without one returns 500 during the deploy-before-migration window',
    ).toBeGreaterThanOrEqual(handlers.length);
  });

  it('answers reads with an empty body rather than an error', () => {
    // The UI renders its banner off `migrated:false`. If a read threw instead,
    // the page would show its error state and read as broken.
    expect(routes).toMatch(/migrated:\s*false/);
    expect(routes).toContain('data: []');
  });

  it('answers writes 503, not 500', () => {
    // 503 says "valid request, come back later"; 500 says "we are broken".
    expect(routes).toContain('MIGRATION_PENDING');
    expect(routes).toMatch(/NOT_MIGRATED,\s*503/);
  });

  it('validates input BEFORE probing the environment', () => {
    // A malformed request is malformed everywhere. Answering 503 for a bad handle
    // would tell the caller to retry something that can never succeed.
    const ingest = routes.slice(routes.indexOf("marketingRoutes.post('/ingest'"));
    const body = ingest.slice(0, ingest.indexOf('insertReply'));
    expect(body.indexOf('VALIDATION')).toBeLessThan(body.indexOf('isMigrated'));
  });
});

describe('the probe itself cannot be the thing that breaks', () => {
  it('uses to_regclass, which returns NULL instead of throwing', () => {
    // Asking information_schema, or simply attempting a SELECT and catching, both
    // work — but to_regclass is one cheap lookup that cannot error on absence.
    expect(service).toContain('to_regclass');
  });

  it('treats an unanswerable database as not-migrated rather than propagating', () => {
    // Sliced to `_resetMigrated`, not to the first `return migratedCache` — the
    // function opens with a cache-hit early return, so the naive slice ended
    // before the try/catch it is asserting about.
    const fn = service.slice(service.indexOf('export async function isMigrated'));
    expect(fn.slice(0, fn.indexOf('_resetMigrated'))).toContain('catch');
  });

  it('caches, so a once-ever event does not cost a round trip on every read', () => {
    expect(service).toContain('migratedCache');
  });
});

describe('the write-nothing property is still structural', () => {
  it('no route posts to X, and none can be added by accident', () => {
    // The strongest layer of the injection defence is that there is nowhere for a
    // draft to go except an operator's clipboard. Assert the absence.
    expect(routes).not.toMatch(/api\.(?:twitter|x)\.com/);
    expect(routes).not.toMatch(/\bpostTweet\b|\bpublish\b|\bsendReply\b/);
  });

  it('approval attribution comes from the session, never the request body', () => {
    // Verified live: a body claiming approved_by "IMPERSONATED" was ignored and the
    // row recorded the authenticated principal. This keeps that true.
    // Sliced to the approveDraft call rather than the first `return c.json` —
    // the handler validates the id and returns early, so the naive slice stopped
    // before the attribution it is asserting about.
    const approve = routes.slice(routes.indexOf("marketingRoutes.post('/draft/:id/approve'"));
    const call = approve.slice(0, approve.indexOf('approveDraft('));
    expect(call).toContain("c.get('operator')");
    expect(call).not.toMatch(/body\.\s*approved_by|body\.\s*approvedBy/);
  });
});
