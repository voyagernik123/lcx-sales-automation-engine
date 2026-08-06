import { afterEach, describe, expect, it, vi } from 'vitest';

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
  const env = await import('../../lib/env.js');
  const auth = await import('../auth.js');
  return { env: env.env, fallback: env.DESK_PASSCODE_DEV_FALLBACK, resolve: auth.resolvePrincipal };
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
    const { env, resolve } = await loadUnder({ ...PROD_NO_PASSCODE, DESK_PASSCODE: 'a-real-desk-passcode' });
    expect(env.deskPasscodeIsPublicDefault).toBe(false);
    const p = resolve('Bearer nik@lcx.com:a-real-desk-passcode', undefined);
    expect(p?.role).toBe('approver');
    // And the public literal is still worthless, because it is no longer the passcode.
    expect(resolve('Bearer nik@lcx.com:test#1234', undefined)).toBeNull();
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
