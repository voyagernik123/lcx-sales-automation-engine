import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  TWO CONTROLS THAT EXISTED AND COULD NOT BE REACHED.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  `verifyAuditSeal` (access/seal.ts, 975 lines, tested against three throwaway
 *  Postgres schemas) and `entitlementsAsOf` (access/asOf.ts, 700 lines, likewise)
 *  had NO PRODUCTION CALLER. Every reference outside their own files was a comment
 *  or a test. `docs/phases/P5_EVIDENCE.md` records both under OUTSTANDING, and the
 *  programme's own named failure mode is an engine surfaced in zero reachable
 *  files — here, in the compartment whose entire job is proving things are what
 *  they claim.
 *
 *  So this file asserts REACHABILITY and REFUSAL SHAPE, which are the two things a
 *  route can get wrong that the module's own suite cannot see:
 *
 *   1. The paths are REGISTERED, behind the governance gate, and an unauthenticated
 *      call is refused BEFORE the handler runs.
 *   2. 0070/0071 NOT BEING APPLIED reaches the wire as a stated, coded finding —
 *      never as a green verdict, never as a 500, never as an empty body.
 *   3. A caller's bad bound is refused rather than widened, THROUGH the query string.
 *   4. An ABSENT `at` refuses without touching the database at all. This is the one
 *      that would be easiest to get wrong invisibly: defaulting to `now()` returns a
 *      payload shaped exactly like a real answer.
 *   5. A genuine fault is a 500 that says it is not a verdict in either direction.
 *
 *  ══ NO DATABASE ══
 *  `getPool` is replaced with a stub whose `query` is set per test. That is not a
 *  convenience: the states worth pinning here are "the relation does not exist"
 *  (42P01) and "the query blew up", and both are easier to produce honestly from a
 *  stub than from a real server. `access/__tests__/seal.test.ts` and
 *  `access/__tests__/asOf.test.ts` already drive the same code against real
 *  Postgres; this file is about the wire, not the walk.
 *
 *  ══ WHAT THIS FILE CANNOT SHOW ══
 *  It mounts the router ITSELF. It therefore proves the router works when mounted at
 *  `/v1/governance` — it does NOT prove `app.ts` mounts it, and at the time of
 *  writing `app.ts` does not (nor does `router.tsx` route to the page). That is a
 *  barrel/mount edit this lane may not make and it is named in the lane report. The
 *  conditional ratchet at the bottom is what stops a HALF-wiring: imported but
 *  mounted somewhere the gate and the browser do not expect.
 */

const hoisted = vi.hoisted(() => ({
  calls: [] as { sql: string; params?: unknown[] }[],
  answer: null as null | ((sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>),
}));

vi.mock('../../db/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db/index.js')>();
  return {
    ...actual,
    getPool: () => ({
      query: (sql: string, params?: unknown[]) => {
        hoisted.calls.push({ sql, params });
        if (hoisted.answer === null) throw new Error('no stub answer configured for this test');
        return hoisted.answer(sql, params);
      },
    }),
  };
});

const { governanceRegisterRoutes } = await import('../governanceRegister.js');
const { AUDIT_SEAL_CODES, AUDIT_SEAL_DOES_NOT_DETECT } = await import('../../access/seal.js');
const { ENTITLEMENT_AS_OF_CODES } = await import('../../access/asOf.js');

/**
 * The shared machine key. `governance` declares `machineAccess: true`, so
 * `loadEntitlements` answers from the constitution and queries NOTHING — which is
 * what keeps these tests free of a database and is asserted directly below.
 */
const MACHINE_KEY = 'dev-operator-key-change-me';

/** Mounted exactly as the lead must mount it, so a prefix change breaks here first. */
function app() {
  const a = new Hono();
  a.route('/v1/governance', governanceRegisterRoutes);
  return a;
}

const get = (path: string, auth = true) =>
  app().request(path, auth ? { headers: { authorization: `Bearer ${MACHINE_KEY}` } } : {});

/** SQLSTATE 42P01 — the relation does not exist. What an unapplied migration is. */
const undefinedTable = (relation: string) =>
  Object.assign(new Error(`relation "${relation}" does not exist`), { code: '42P01' });

beforeEach(() => {
  hoisted.calls = [];
  hoisted.answer = null;
});

/* ════════════════════════════════════════════════════════════════════════════
 *  1. THE PATHS EXIST, AND THE GATE PRECEDES THE HANDLER
 * ════════════════════════════════════════════════════════════════════════════ */
describe('the two evidence reads are reachable, behind the governance gate', () => {
  it.each([
    ['/v1/governance/audit-seal'],
    ['/v1/governance/entitlements-as-of?at=2026-07-12T00:00:00Z'],
  ])('%s is registered — not a 404', async (path) => {
    hoisted.answer = async () => {
      throw undefinedTable('audit_seal_state');
    };
    const res = await get(path);
    expect(res.status).not.toBe(404);
  });

  it.each([
    ['/v1/governance/audit-seal'],
    ['/v1/governance/entitlements-as-of?at=2026-07-12T00:00:00Z'],
  ])('%s refuses an unauthenticated caller BEFORE the handler runs', async (path) => {
    /*
     * NON-VACUITY: `hoisted.answer` is left null, so ANY query throws 'no stub answer
     * configured'. A 401 with zero recorded calls is therefore proof the middleware
     * short-circuited, not merely that nothing crashed.
     */
    const res = await get(path, false);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(hoisted.calls).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  2. NOT INSTALLED REACHES THE WIRE AS A FINDING
 * ════════════════════════════════════════════════════════════════════════════ */
describe('0070 not applied is published as an absent control, not as a verdict', () => {
  it('answers 200 with AUDIT_SEAL_NOT_INSTALLED and names the migration', async () => {
    hoisted.answer = async () => {
      throw undefinedTable('audit_seal_state');
    };
    const res = await get('/v1/governance/audit-seal');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        migration: string;
        frame: { environment: string; source: string; observedAt: string };
        verification: { kind: string; code: string; message: string; rule: string };
        doesNotDetect: { id: string }[];
      };
    };
    expect(body.data.verification.kind).toBe('not_installed');
    expect(body.data.verification.code).toBe(AUDIT_SEAL_CODES.NOT_INSTALLED);
    expect(body.data.verification.rule).toMatch(/absent data refuses/i);
    // The absence points at what would end it. A refusal with no remedy is a shrug.
    expect(body.data.migration).toBe('0070_audit_seal.sql');
    // It says the absence of a chain, not the failure of one.
    expect(body.data.verification.message).toMatch(/absence of one/i);
    // Every figure carries an observation frame AND an environment label.
    expect(body.data.frame.environment).toMatch(/ · /);
    expect(body.data.frame.source).toBe('audit_log + audit_seal_state');
    expect(Date.parse(body.data.frame.observedAt)).not.toBeNaN();
  });

  it('publishes the seal\'s own limits on a NOT-INSTALLED answer too', async () => {
    /*
     * THE OVERCLAIM THIS GUARDS. P5_EVIDENCE F9: `audit_log` is owned by the role the
     * API connects as, ownership permits ALTER TABLE … DISABLE TRIGGER ALL, and a probe
     * drove the real verifier against a re-chained forgery and got INTACT. The repo has
     * carried the opposite claim once. If the limits were attached only to a green
     * verdict, a reader who only ever sees this panel red would never meet them.
     */
    hoisted.answer = async () => {
      throw undefinedTable('audit_seal_state');
    };
    const body = (await (await get('/v1/governance/audit-seal')).json()) as {
      data: { doesNotDetect: { id: string; statement: string; evidence: string }[] };
    };
    expect(body.data.doesNotDetect.map((d) => d.id)).toEqual(
      AUDIT_SEAL_DOES_NOT_DETECT.map((d) => d.id),
    );
    const ownership = body.data.doesNotDetect.find((d) => d.id === 'ownership_level_tampering');
    expect(ownership?.statement).toMatch(/DISABLE TRIGGER ALL/);
    expect(ownership?.statement).toMatch(/NOT evidence against/);
    expect(ownership?.evidence).toMatch(/P5_EVIDENCE\.md F9/);
  });

  it('answers ENTITLEMENT_LEDGER_ABSENT when 0071 has not been applied', async () => {
    hoisted.answer = async () => {
      throw undefinedTable('entitlement_ledger_state');
    };
    const res = await get('/v1/governance/entitlements-as-of?at=2026-07-12T00:00:00Z');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { migration: string; answer: { kind: string; code: string; message: string } };
    };
    expect(body.data.answer.kind).toBe('ledger_absent');
    expect(body.data.answer.code).toBe(ENTITLEMENT_AS_OF_CODES.LEDGER_ABSENT);
    expect(body.data.migration).toBe('0071_grant_ledger.sql');
    // The distinction the whole module exists for.
    expect(body.data.answer.message).toMatch(/absence of a record, not a record of nothing/i);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  3. A BAD BOUND IS REFUSED THROUGH THE QUERY STRING, NOT WIDENED
 * ════════════════════════════════════════════════════════════════════════════ */
describe('a bound the verifier cannot honour is refused from the wire', () => {
  it('?maxRows=abc comes back AUDIT_SEAL_INVALID_BOUNDS and never touches the database', async () => {
    /*
     * `asNumber` deliberately does NOT clamp: it passes `abc` through as NaN so the
     * module's own refusal is reachable. The old failure was the opposite — an
     * unusable cap was dropped and the answer claimed `coversWholeChain: true`, i.e.
     * the verdict came back BROADER than the caller asked for.
     */
    hoisted.answer = async () => {
      throw new Error('the bounds check must run before any query');
    };
    const res = await get('/v1/governance/audit-seal?maxRows=abc&fromSeq=-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { verification: { kind: string; code: string; offending: { option: string }[]; message: string } };
    };
    expect(body.data.verification.kind).toBe('invalid_bounds');
    expect(body.data.verification.code).toBe(AUDIT_SEAL_CODES.INVALID_BOUNDS);
    // EVERY offending bound, not the first one found.
    expect(body.data.verification.offending.map((o) => o.option).sort()).toEqual(['fromSeq', 'maxRows']);
    expect(body.data.verification.message).toMatch(/NOT ignored/);
    expect(hoisted.calls).toHaveLength(0);
  });

  it('an ABSENT bound is not a bad bound — the walk proceeds', async () => {
    // Non-vacuity for the test above: if every request refused, it would pass for the
    // wrong reason. With no bounds the handler must reach the database.
    hoisted.answer = async () => {
      throw undefinedTable('audit_seal_state');
    };
    const body = (await (await get('/v1/governance/audit-seal')).json()) as {
      data: { verification: { kind: string } };
    };
    expect(body.data.verification.kind).toBe('not_installed');
    expect(hoisted.calls.length).toBeGreaterThan(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  4. "AS OF WHEN" IS NEVER ANSWERED WITH `now()`
 * ════════════════════════════════════════════════════════════════════════════ */
describe('an absent instant refuses instead of defaulting to now', () => {
  it.each([
    ['/v1/governance/entitlements-as-of'],
    ['/v1/governance/entitlements-as-of?at='],
    ['/v1/governance/entitlements-as-of?at=%20%20'],
  ])('%s refuses under ENTITLEMENT_AS_OF_INSTANT_REQUIRED', async (path) => {
    /*
     * THE FAILURE THIS PINS. Defaulting `at` to `new Date()` returns `kind: 'known'`
     * with real holdings and NOTHING on the payload saying the instant was invented —
     * "what did this person hold on 12 July" silently becomes "what do they hold
     * today", which is the answer `entitlements` could already give and the exact
     * inadequacy 0071 exists to fix.
     *
     * `hoisted.answer` is null, so the zero-call assertion is load-bearing: any query
     * at all would throw and this would not be a clean refusal.
     */
    const res = await get(path);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { answer: { kind: string; code: string; message: string; unresolved: { field: string }[] } };
    };
    expect(body.data.answer.kind).toBe('unanswerable');
    expect(body.data.answer.code).toBe(ENTITLEMENT_AS_OF_CODES.INSTANT_REQUIRED);
    expect(body.data.answer.unresolved.map((u) => u.field)).toEqual(['at']);
    expect(body.data.answer.message).toMatch(/NOT answered as of now/i);
    expect(hoisted.calls).toHaveLength(0);
  });

  it('an instant that IS supplied reaches the replay — the refusal is not unconditional', async () => {
    // Non-vacuity for the three above.
    hoisted.answer = async () => {
      throw undefinedTable('entitlement_ledger_state');
    };
    const body = (await (await get('/v1/governance/entitlements-as-of?at=2026-07-12T00:00:00Z')).json()) as {
      data: { answer: { kind: string } };
    };
    expect(body.data.answer.kind).toBe('ledger_absent');
    expect(hoisted.calls.length).toBeGreaterThan(0);
  });

  it('an empty memberId is an absent narrowing, not a member nobody has heard of', async () => {
    /*
     * `?memberId=` must NOT reach the module as `''`, or the scope check refuses
     * UNKNOWN_SCOPE — "no event in the ledger names this member" — about a member the
     * caller never asked about. Proved by the SQL that runs: the boundary read is
     * reached, which only happens after scope parsing.
     */
    hoisted.answer = async () => {
      throw undefinedTable('entitlement_ledger_state');
    };
    const body = (await (await get(
      '/v1/governance/entitlements-as-of?at=2026-07-12T00:00:00Z&memberId=&workspace=',
    )).json()) as { data: { answer: { kind: string; code: string } } };
    expect(body.data.answer.kind).toBe('ledger_absent');
    expect(body.data.answer.code).not.toBe(ENTITLEMENT_AS_OF_CODES.UNKNOWN_SCOPE);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  5. A FAULT IS A FAULT, IN NEITHER DIRECTION
 * ════════════════════════════════════════════════════════════════════════════ */
describe('a genuine fault is a 500 that refuses to be read as a verdict', () => {
  it('the seal route does not answer "intact" or "absent" because a query blew up', async () => {
    hoisted.answer = async () => {
      throw Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' });
    };
    const res = await get('/v1/governance/audit-seal');
    expect(res.status).toBe(500);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe('AUDIT_SEAL_VERIFICATION_ERROR');
    expect(body.error).toMatch(/FAULT, not a verdict/);
    expect(body.error).toMatch(/neither a finding that the chain is intact nor/i);
    expect(body).not.toHaveProperty('data');
  });

  it('the as-of route does not answer "nobody held it" because a query blew up', async () => {
    hoisted.answer = async (sql: string) => {
      // The boundary read succeeds, so the ledger IS installed; the replay then fails.
      if (sql.includes('entitlement_ledger_state')) {
        return {
          rows: [{
            ledger_floor: new Date('2026-08-01T00:00:00Z'),
            earliest_reconstructed_at: new Date('2026-05-01T00:00:00Z'),
            reconstructed_events: '3',
          }],
        };
      }
      throw Object.assign(new Error('deadlock detected'), { code: '40P01' });
    };
    const res = await get('/v1/governance/entitlements-as-of?at=2026-08-05T00:00:00Z');
    expect(res.status).toBe(500);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe('ENTITLEMENT_AS_OF_ERROR');
    expect(body.error).toMatch(/not a finding that nobody held this compartment/i);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  6. THE MOUNT RATCHET
 * ════════════════════════════════════════════════════════════════════════════ */
describe('the app-level mount, when it lands, lands in one place', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const appSrc = () => readFileSync(resolve(HERE, '..', '..', 'app.ts'), 'utf8');

  /**
   * A CONDITIONAL RATCHET, AND WHY IT IS NOT A CHEAT.
   *
   * This lane may not edit `app.ts` — four other lanes are in it — so the mount is the
   * lead's, and asserting it unconditionally would fail a suite for work this lane is
   * forbidden from doing. What CAN be pinned now is the half-wiring, which is the
   * failure that actually happens and is silent: `gpsInputsMount.test.ts` records a
   * router mounted at `'/'` instead of `'/inputs'`, where the reads were shadowed and
   * the writes answered on paths no fetcher calls — no error, no 404.
   *
   * So: if `governanceRegisterRoutes` is imported at all, it must be mounted at
   * `/v1/governance`. The page fetches `/v1/governance/audit-seal` and the in-handler
   * `requireWorkspace` is written to be idempotent with an automatic mount on that
   * exact prefix.
   */
  it('is either absent, or at /v1/governance and nowhere else', () => {
    const src = appSrc();
    if (!src.includes('governanceRegisterRoutes')) {
      // Not yet wired. Stated, not hidden: the lane report carries it as owed.
      expect(src).not.toContain('governanceRegisterRoutes');
      return;
    }
    expect(src).toMatch(/app\.route\('\/v1\/governance',\s*governanceRegisterRoutes\)/);
    const mounts = [...src.matchAll(/app\.route\('([^']+)',\s*governanceRegisterRoutes\)/g)]
      .map((m) => m[1]);
    expect(mounts).toEqual(['/v1/governance']);
  });
});
