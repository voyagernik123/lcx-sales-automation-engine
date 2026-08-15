import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
/**
 * Statically imported so a test can SET `DESK_PASSCODE` to the committed literal before
 * `lib/env.ts` is re-evaluated under production — the value is needed to arrange the
 * environment, and the environment is what decides the value the dynamic import sees.
 * One constant, never a second copy of the string in this file.
 */
import { DESK_PASSCODE_DEV_FALLBACK } from '../../lib/env.js';

/**
 * THE FRONT DOOR IS CLOSED WHEN ITS SECRET IS PUBLIC.
 *
 * `lib/env.ts` gives DESK_PASSCODE a committed dev fallback so a checkout works with no
 * setup. Every other real secret routes through `required()`, which refuses to fall back in
 * production — this one did not, so an unset DESK_PASSCODE in production silently became the
 * literal in the source. Both halves of the credential are then public: the roster emails
 * are committed in `@lcx/shared` (two of them `role: 'approver'`), and the passcode is in
 * this repository and in test fixtures. `nik@lcx.com:test#1234` would have been an approver
 * session — the tier that clears deal sign-off and conflict-clearing.
 *
 * ── WHY THE REFUSAL IS AT THE DOOR AND NOT AT BOOT ───────────────────────────────
 * The first fix routed `deskPasscode` through `required()`. That closes the hole and takes
 * the whole API down with it: a deploy without the variable does not start, so JWT and
 * OPERATOR_API_KEY requests that authenticate perfectly well fail too, and eight
 * compartments go dark to fix one path. This refuses ONLY the path whose secret is known.
 *
 * These tests run the REAL modules under `NODE_ENV=production` in an isolated module
 * registry, because the flag is computed at import time and every other suite in this
 * repository imports these modules under the test environment.
 */

/**
 * Load env + auth fresh under a chosen environment.
 *
 * `vi.resetModules()`, not a cache-busting query string: Vite cannot resolve
 * `import(\`../../lib/env.js${bust}\`)` at all — it fails with "Unknown variable dynamic
 * import", because the specifier has to be statically analysable. resetModules drops the
 * registry so the next static-specifier `await import()` re-evaluates the module, which is
 * what makes the import-time flag observable under different environments.
 *
 * ── AND THE ENVIRONMENT MUST STILL BE IN PLACE WHILE THE ASSERTIONS RUN ──────────
 * Getting that wrong failed exactly one of these tests, against correct code.
 *
 * `env.deskPasscode` is a SNAPSHOT taken when the module is evaluated, so restoring
 * process.env immediately after the import leaves it intact. `env.secondaryPasscode` is a
 * GETTER (`lib/env.ts` makes it one deliberately, so rotating the code takes effect without
 * a module reload) and therefore reads process.env at CALL time. A `finally` that restored
 * the variables before the test body ran took SECONDARY_PASSCODE away again, and the
 * second-tier assertion failed against correct code.
 *
 * So restoration happens in afterEach, once the assertions are done.
 */
const saved: Record<string, string | undefined> = {};
let dirty = false;

async function loadUnder(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (!(k in saved)) saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  dirty = true;
  vi.resetModules();
  // The boot announcement is emitted while `lib/env.ts` is being EVALUATED, so the spy
  // has to be in place across the import itself — capturing it afterwards captures
  // nothing, and a test that asserts on nothing passes on code that says nothing.
  const boot: string[] = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    boot.push(args.map((a) => String(a)).join(' '));
  });
  try {
    const env = await import('../../lib/env.js');
    const auth = await import('../auth.js');
    return { env: env.env, fallback: env.DESK_PASSCODE_DEV_FALLBACK, resolve: auth.resolvePrincipal, boot };
  } finally {
    spy.mockRestore();
  }
}

afterEach(() => {
  if (!dirty) return;
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  dirty = false;
});

const PROD_NO_PASSCODE = {
  NODE_ENV: 'production',
  DESK_PASSCODE: undefined,
  OPERATOR_API_KEY: 'a-real-operator-key',
  SECONDARY_PASSCODE: 'a-real-second-tier-code',
};

describe('the desk passcode is refused when production is running on the committed literal', () => {
  it('boots rather than throwing, because an API that will not start is a worse failure', async () => {
    const { env } = await loadUnder(PROD_NO_PASSCODE);
    // The assertion IS that the import above resolved. A `required()` throw here would
    // reject this promise, which is exactly the behaviour this design rejected.
    expect(env.deskPasscodeIsPublicDefault).toBe(true);
  });

  it('refuses the public literal for a roster APPROVER, which is what it would have granted', async () => {
    const { fallback, resolve } = await loadUnder(PROD_NO_PASSCODE);
    expect(resolve(`Bearer nik@lcx.com:${fallback}`, undefined)).toBeNull();
    expect(resolve(`Bearer monty@lcx.com:${fallback}`, undefined)).toBeNull();
  });

  it('still admits the second tier, because that path has its own secret and this guard is not about it', async () => {
    const { resolve } = await loadUnder(PROD_NO_PASSCODE);
    const p = resolve('Bearer nik@lcx.com:a-real-second-tier-code', undefined);
    // The bug this pins: an early `return null` in the desk-passcode branch also skips
    // case (3), so a colleague signing in with SECONDARY_PASSCODE would be refused by a
    // guard that has nothing to do with their credential.
    expect(p).not.toBeNull();
    expect(p?.id).toBe('nik');
  });

  it('leaves the shared operator key alone — one path is refused, not the API', async () => {
    const { resolve } = await loadUnder(PROD_NO_PASSCODE);
    const p = resolve('Bearer a-real-operator-key', undefined);
    expect(p).not.toBeNull();
    expect(p?.authMethod).toBe('api_key');
  });

  it('re-opens the moment DESK_PASSCODE is set, so this is a missing variable and not a mode', async () => {
    const { env, fallback, resolve } = await loadUnder({ ...PROD_NO_PASSCODE, DESK_PASSCODE: 'a-real-desk-passcode' });
    expect(env.deskPasscodeIsPublicDefault).toBe(false);
    const p = resolve('Bearer nik@lcx.com:a-real-desk-passcode', undefined);
    expect(p?.role).toBe('approver');
    // And the public literal is still worthless, because it is no longer the passcode.
    // `fallback`, not a typed-out copy: a second copy of the string in this file would
    // silently stop tracking the constant it is supposed to be about.
    expect(resolve(`Bearer nik@lcx.com:${fallback}`, undefined)).toBeNull();
  });

  /* ── the guard tested UNSET-NESS, and the danger is the VALUE ──────────────────── */

  it('refuses the committed literal when it is SET ON PURPOSE, not only when it is missing', async () => {
    /*
     * THE HOLE THIS CLOSES, MEASURED ON A LOCAL PRODUCTION BUILD ON 2026-08-15.
     * With DESK_PASSCODE unset, `nik@lcx.com` + the committed literal returned 401 and
     * `/health` reported `refused-public-default`. With DESK_PASSCODE explicitly SET to
     * that same literal, the identical request returned 200 with `role: approver`,
     * `canApprove: true` and `approve` on all eight compartments, and `/health` reported
     * `open`. Setting the variable to the value printed in the source was enough to
     * "configure" the front door, and every signal in the system then said it was safe.
     *
     * `fallback` comes from the module under test — the one constant the repository
     * defines for this value. Typing the literal here would create a second copy that
     * could drift from the first, and the drift would be invisible: this test would go
     * green while the door opened.
     */
    const { env, fallback, resolve } = await loadUnder({
      ...PROD_NO_PASSCODE,
      DESK_PASSCODE: DESK_PASSCODE_DEV_FALLBACK,
    });
    expect(env.deskPasscodeIsPublicDefault).toBe(true);
    expect(resolve(`Bearer nik@lcx.com:${fallback}`, undefined)).toBeNull();
    expect(resolve(`Bearer monty@lcx.com:${fallback}`, undefined)).toBeNull();
  });

  it('refuses an EMPTY passcode too — a door with no lock is not a configured door', async () => {
    const { env, resolve } = await loadUnder({ ...PROD_NO_PASSCODE, DESK_PASSCODE: '' });
    expect(env.deskPasscodeIsPublicDefault).toBe(true);
    expect(resolve('Bearer nik@lcx.com:', undefined)).toBeNull();
  });

  it('says so AT BOOT, because the refusal is only visible to whoever is refused', async () => {
    // The request-time refusal is the right place for the ENFORCEMENT and the wrong place
    // for the ANNOUNCEMENT: an operator who set DESK_PASSCODE to the value they found in
    // the repo would get a working-looking service and learn nothing until someone tried
    // to sign in — and the first person to try is the attacker.
    const { boot } = await loadUnder({ ...PROD_NO_PASSCODE, DESK_PASSCODE: DESK_PASSCODE_DEV_FALLBACK });
    const line = boot.find((l) => l.includes('DESK_PASSCODE'));
    expect(line, 'no boot line mentioned DESK_PASSCODE').toBeTruthy();
    expect(line).toContain('public');
  });

  it('the boot line never prints the passcode it is complaining about', async () => {
    // Printing it to make the message clearer would publish the secret into a log
    // aggregator — the same class of mistake as committing it, and worse in an
    // environment where the value is NOT the committed default.
    const { fallback, boot } = await loadUnder({ ...PROD_NO_PASSCODE, DESK_PASSCODE: DESK_PASSCODE_DEV_FALLBACK });
    for (const line of boot) expect(line).not.toContain(fallback);
  });

  it('stays silent when the passcode is a real secret', async () => {
    const { env, boot } = await loadUnder({ ...PROD_NO_PASSCODE, DESK_PASSCODE: 'a-real-desk-passcode' });
    expect(env.deskPasscodeIsPublicDefault).toBe(false);
    expect(boot.filter((l) => l.includes('DESK_PASSCODE'))).toEqual([]);
  });

  it('does not fire outside production, where the fallback is the point', async () => {
    const { env, fallback, resolve } = await loadUnder({
      NODE_ENV: 'test',
      DESK_PASSCODE: undefined,
      OPERATOR_API_KEY: 'a-real-operator-key',
    });
    expect(env.deskPasscodeIsPublicDefault).toBe(false);
    expect(resolve(`Bearer nik@lcx.com:${fallback}`, undefined)?.id).toBe('nik');
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  EVERY DOOR TO THE DESK PASSCODE, NOT JUST THE ONE THAT WAS BROKEN.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  The front door at `auth.ts:270` refuses the passcode when it is the committed public literal.
 *  `actions/registry.ts` compares against the SAME secret for the step-up on `revoke_entitlement`,
 *  and had no such guard. Proved live: with the front door correctly refusing, a principal obtained
 *  through the SECONDARY passcode invoked the destructive action with the public literal and got
 *  `{"revoked":true}` and HTTP 200 — while a wrong step-up on the same principal returned
 *  `STEP_UP_REQUIRED`, so the public value was being accepted rather than the check bypassed.
 *
 *  A test for that one call site would have been the wrong test. It was found by a human tracing an
 *  unrelated fix, and a THIRD site added next month would be found the same way or not at all. So
 *  this censuses the comparison rather than the site: every place that compares something to
 *  `env.deskPasscode` must also consult `deskPasscodeIsPublicDefault`, and a new door fails here on
 *  the day it is written.
 *
 *  It reads source rather than behaviour deliberately — the behavioural test needs a live server,
 *  a database and a seeded approver, and would therefore be written for one route at a time, which
 *  is the failure mode this file exists to close.
 */
describe('every comparison against the desk passcode consults the public-default guard', () => {
  const API_SRC = resolve(process.cwd(), 'src');

  const walk = (dir: string): string[] => readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) return e === 'node_modules' ? [] : walk(full);
    return /\.ts$/.test(e) && !/\.test\.ts$/.test(e) ? [full] : [];
  });

  /* Comments stripped before anything is counted. PROSE ABOUT A SYMBOL IS NOT A USE OF IT, and this
     repository has shipped two censuses that measured their own documentation. */
  const withoutComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  it('finds the guard beside every use, and the census is not vacuous', () => {
    const files = walk(API_SRC);
    expect(files.length, 'the walk found no source files — this check would pass vacuously')
      .toBeGreaterThan(50);

    const offenders: string[] = [];
    let sites = 0;
    for (const f of files) {
      const src = withoutComments(readFileSync(f, 'utf8'));
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        /*
         * `\b` already excludes the FLAG: `env.deskPasscodeIsPublicDefault` has no word boundary
         * after `deskPasscode`, so only a read of the secret itself matches. An earlier draft also
         * skipped any line MENTIONING the flag, which silently dropped `auth.ts:270` — where the
         * guard and the comparison share one line — and left the census counting one site instead
         * of two. The vacuity floor below is what caught it, which is the whole reason it is there.
         */
        if (!/env\.deskPasscode\b/.test(line)) return;
        sites++;
        /* The guard may sit on the same line or in the condition just above it — both spellings
           appear in the codebase, so the window is small and stated rather than exact. */
        const window = lines.slice(Math.max(0, i - 4), i + 1).join('\n');
        if (!/deskPasscodeIsPublicDefault/.test(window)) {
          offenders.push(`${relative(API_SRC, f)}:${i + 1}  ${line.trim().slice(0, 90)}`);
        }
      });
    }

    expect(sites, 'no comparison against env.deskPasscode was found at all — the census is broken')
      .toBeGreaterThanOrEqual(2);
    expect(offenders,
      'these compare against the desk passcode without consulting deskPasscodeIsPublicDefault,'
      + ' so they accept the value committed to this repository when a deploy mirrors it')
      .toEqual([]);
  });
});
