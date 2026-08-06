#!/usr/bin/env node
/**
 * THE LOCAL GATE AND CI DISAGREED, AND THIS IS WHY.
 *
 * `npm run ci-check` runs the api tests against whatever database DATABASE_URL points
 * at — on a developer machine, a long-lived one. CI does something different: it
 * starts an EMPTY Postgres container and runs `npm run migrate` first
 * (.github/workflows, "Apply migrations to the CI database"). So CI tests the schema
 * INCLUDING every migration still sitting in PENDING_MIGRATIONS, and the laptop tests
 * the schema as it was before them.
 *
 * That gap is invisible until a migration changes behaviour, and then it costs a red
 * CI on a pushed commit. It has now cost exactly that, three failures on 1965b99:
 *
 *   · 0070_audit_seal.sql makes `audit_log` append-only by trigger, so a test whose
 *     cleanup said `DELETE FROM audit_log` failed — correctly. Locally the trigger did
 *     not exist, so the DELETE succeeded and the suite was green.
 *   · 0071_grant_ledger.sql creates `public.entitlement_events`, which a suite testing
 *     the LEDGER-ABSENT branch resolved through its search_path's public fallback. It
 *     was not just asserting the wrong value in CI — it was writing test revocation
 *     events into the real append-only ledger.
 *
 * Neither is reproducible on a populated dev database, and neither is a flake. The
 * only honest local check is the one CI performs: a database built from zero.
 *
 * So this script mirrors CI. It creates a THROWAWAY database, applies every migration
 * from 0000 in order, and runs the api suite against it. It never touches the
 * developer's own database — the mirror has its own name and is dropped and rebuilt on
 * every run, because a mirror that carries state from the last run is not a mirror.
 *
 * Applying every migration from scratch also proves the pending ones apply IN ORDER
 * against a virgin schema, which is the thing the production handoff actually depends
 * on and which no other check in this repo performs.
 *
 * Usage:  npm run ci-mirror              full api suite, as CI runs it
 *         npm run ci-mirror -- <paths>   only those test paths (same DB build)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIRROR_DB = 'lcx_ci_mirror';

/** DATABASE_URL from the environment, else the first one found in a .env file. */
function resolveUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const f of ['.env', 'apps/api/.env']) {
    const p = join(REPO, f);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/^\s*DATABASE_URL\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

const url = resolveUrl();
if (!url) {
  // Not a failure. `apps/api/src/test/db.ts` makes DB-backed suites SKIP without a
  // database, and this script must not invent a reason to fail a machine that has
  // legitimately not got one. It must also not pretend it verified something.
  console.log('ci-mirror: no DATABASE_URL — SKIPPED. This did NOT verify the CI schema.');
  process.exit(0);
}

let target;
try {
  target = new URL(url);
} catch {
  console.error(`ci-mirror: DATABASE_URL is not a URL this script can parse.`);
  process.exit(1);
}

const mirrorUrl = new URL(url);
mirrorUrl.pathname = `/${MIRROR_DB}`;

/** Admin connection: same server, the always-present `postgres` database. */
const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';

if (target.pathname === mirrorUrl.pathname) {
  console.error(
    `ci-mirror: DATABASE_URL already points at ${MIRROR_DB}. Refusing — this script ` +
      `DROPS that database, and it must never be pointed at anything a human is using.`,
  );
  process.exit(1);
}

const run = (cmd, args, env) =>
  execFileSync(cmd, args, { cwd: REPO, stdio: 'inherit', env: { ...process.env, ...env } });

const psql = (sql) =>
  execFileSync('psql', [adminUrl.toString(), '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    cwd: REPO,
    stdio: ['ignore', 'ignore', 'inherit'],
  });

console.log(`ci-mirror: rebuilding ${MIRROR_DB} from zero (your own database is untouched)`);
try {
  // FORCE so an idle connection left by a previous run cannot block the drop; without
  // it this fails intermittently and reads as a database problem rather than a stale
  // client. Requires PG13+; the CI image and the local install are both well past it.
  psql(`DROP DATABASE IF EXISTS ${MIRROR_DB} WITH (FORCE)`);
  psql(`CREATE DATABASE ${MIRROR_DB}`);
} catch {
  console.error(
    'ci-mirror: could not rebuild the mirror database. Is Postgres running, and does ' +
      'this role have CREATEDB? Reporting this rather than falling back to your own ' +
      'database, which would test the wrong schema and call it verified.',
  );
  process.exit(1);
}

const env = { DATABASE_URL: mirrorUrl.toString() };

console.log('ci-mirror: applying every migration from 0000, in order, as CI does');
run('npm', ['run', 'migrate', '-w', '@lcx/api'], env);

const paths = process.argv.slice(2);
console.log(`ci-mirror: running api tests against the mirror${paths.length ? `: ${paths.join(' ')}` : ''}`);
run('npx', ['vitest', 'run', '--root', 'apps/api', ...paths], env);

console.log('✓ ci-mirror: the api suite passes against a database built from every migration');
