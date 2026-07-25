import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

/**
 * The guard that lets the API suite run somewhere without a Postgres.
 *
 * WHAT WENT WRONG WITHOUT IT. `.github/workflows/ci.yml` had never been committed —
 * it sat on disk, excluded, because the OAuth token lacked `workflow` scope — so the
 * gate had never once run anywhere but this laptop. The first real run went red
 * immediately: 10 of 30 API test files reach a live database, `.env` is gitignored,
 * so on a GitHub runner `DATABASE_URL` is unset, `pg` falls back to localhost:5432,
 * and every one of them dies on `ECONNREFUSED ::1:5432`.
 *
 * Two of those files LOOKED like they already handled it — vitest reported their
 * tests as "skipped" — and that was a trap. A throwing `beforeAll` marks its tests
 * skipped and its suite FAILED. There was no guard anywhere in this workspace; that
 * was the failure cascade wearing a guard's clothes. Anything added here has to be
 * checked against that: a suite skipped by `skipIf` must not run its hooks either,
 * which is asserted for real in `db.guard.test.ts` rather than assumed from the docs.
 *
 * THE CONTRACT, and the part worth arguing about:
 *
 *   DATABASE_URL unset       → SKIP. This environment has no database and never
 *                              claimed to. Proving nothing is the honest outcome.
 *   DATABASE_URL set, dead   → FAIL. You said there is a database. There is not.
 *                              That is a broken environment and it should be red.
 *
 * The second half is the load-bearing half. A probe-and-skip design — connect, and
 * skip if the connection fails — reads as more robust and is strictly worse: it
 * converts a genuinely broken CI database into a green run that proved 193 tests
 * instead of 241, silently, which is the exact shape of the bug this whole file
 * exists because of. A skip may only ever be caused by an environment that never
 * had a database, never by one whose database broke.
 *
 * This does NOT reduce what CI checks. The same commit gives CI a Postgres service
 * container and runs the migrations against it, so `DATABASE_URL` IS set there and
 * all 241 tests run. The guard is what makes the suite runnable for a contributor
 * with no local Postgres, and what makes the failure legible if the container dies.
 * The two compose in the safe direction — a broken container still fails, because a
 * set-but-dead URL is the FAIL branch above.
 */

/**
 * Load `.env` here, the same way and from the same place `lib/env.ts:6` does.
 *
 * WITHOUT THIS THE GUARD IS IMPORT-ORDER DEPENDENT, which was caught by running it
 * rather than by reading it. `DATABASE_URL` is not in the shell — it lives in
 * `apps/api/.env`, and nothing loads that file until `lib/env.ts` is first imported
 * and calls `config()`. So a guard that read bare `process.env` got whatever the
 * answer happened to be at ITS point in the module graph: a test file whose
 * `import … from '../../test/db.js'` line sat above its `import { createApp }` line
 * evaluated this module first, saw nothing, and skipped its database tests ON A
 * MACHINE WITH A WORKING DATABASE. Sorting the import block would have changed the
 * result. That is worse than the bug being fixed, because it is green.
 *
 * Resolved from this module's own directory, not `process.cwd()`, so it survives
 * vitest being invoked from the repo root or from `apps/api`. `config()` never
 * overwrites an already-set variable, so a real environment still wins — which is
 * what makes the CI service container below authoritative over any stray file.
 */
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env') });

/**
 * Read from `process.env` directly, NOT from `lib/env.ts`.
 *
 * `env.databaseUrl` is `process.env.DATABASE_URL ?? ''` today, which would work — but
 * it is one edit away from acquiring a localhost default the way `db/migrate.ts:13`
 * already has one, and on that day this flag would silently become permanently true
 * and every suite would go back to failing on a runner. The check has to read the
 * only thing that actually answers the question "did someone configure a database".
 */
export const HAS_DB = (process.env.DATABASE_URL ?? '').length > 0;

/**
 * Say so, once, on the way past.
 *
 * A silent skip is how a suite ends up proving nothing while printing green. vitest
 * does report a skip count, but a bare "19 skipped" in a 241-test run does not tell
 * you that a whole category of coverage is absent or why, and nobody reads it as
 * anything but noise.
 */
if (!HAS_DB && !process.env.LCX_DB_GUARD_QUIET) {
  console.warn(
    '[test] DATABASE_URL is unset — suites that need a live Postgres will SKIP.\n' +
      '[test] Route/integration coverage is NOT being checked in this run.\n' +
      '[test] Set DATABASE_URL (see apps/api/.env.example) to run the full suite.',
  );
}

/**
 * A suite that cannot run without a database.
 *
 * Use this over `describe` when EVERY test in the block needs one — it also stops the
 * `beforeAll` from running, which is what the two false-positive files needed and did
 * not have.
 */
export const describeDb = describe.skipIf(!HAS_DB);

/**
 * A single test that needs a database, inside a suite that mostly does not.
 *
 * Six of the ten affected files are mixed: `redteam.test.ts` has 2 of 14 touching the
 * database, `grandAudit.test.ts` 1 of 8. Wrapping those whole files would have thrown
 * away 18 passing assertions to fix 3 failing ones, and that trade — losing real
 * coverage to make a run green — is the thing to avoid, not a shortcut to it.
 */
export const itDb = it.skipIf(!HAS_DB);
