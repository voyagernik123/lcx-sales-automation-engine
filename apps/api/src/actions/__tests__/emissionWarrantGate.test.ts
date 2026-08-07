/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE EMISSION WARRANT GATE — on the status transition, where it can actually stop
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `evaluateEmissionWarrant` was a complete engine with NO CALLER. Every reference to it
 * in the repository was inside `marketing/emissionWarrant.ts` or its own test — so a
 * token-incentivised campaign could be advanced to `approved` and to `live` by
 * `dist_campaign_set_status` without the Title VI engine ever running over its public
 * text or over the launcher's LCX position. The engine existing and the engine being
 * consulted are different facts, and only the second one is a control.
 *
 * ── WHAT EACH GROUP DEFENDS ──────────────────────────────────────────────────
 *  1. THE GATE IS REACHED, AND FROM THE REAL FRONT DOOR. Through `invokeAction`, on both
 *     publication points, and not on the transitions that are not publication points.
 *  2. THE DECLARATION IS REQUIRED AND ITS ABSENCE REFUSES. This is the owner's decision,
 *     implemented literally: no declaration, no launch. There is no flag, no default and
 *     no empty-register-reads-as-clear path, and the tests below try each of those.
 *  3. `overrideGate` CANNOT REACH IT. The review blockers are a desk judgement an approver
 *     may accept in writing. Art 91(3)(c) is personal liability, and one person cannot
 *     sign another person's declaration — so the override that legitimately covers the
 *     review blockers must not cover this one. This is the single most important test in
 *     the file.
 *  4. THREE ABSENCES OF A LAUNCHER, THREE CODES. `created_by` NULL, `created_by` that the
 *     holdings CHECK can never accept, and `created_by` that is a machine principal are
 *     three different facts with three different remedies, and collapsing them would send
 *     a human to fix the wrong thing — or, worse, to make a declaration the database will
 *     reject.
 *  5. THE SYSTEM NEVER ANSWERS FOR THE HUMAN. No path here writes a holdings declaration,
 *     and an absent one is never read as `holds: false`.
 *  6. THE LIMB THAT COULD NOT FAIL IS GONE. `budget <= Math.max(budget, 1)` was true for
 *     every input that exists, and NULL `budget_lcx` was read as `0`.
 *
 * ── WHAT THESE TESTS CANNOT SEE ──────────────────────────────────────────────
 * The pool is a fake dispatching on SQL text, like every other suite in this package —
 * the api suite is deliberately database-free. They prove the control flow, the codes and
 * the ordering. They prove NOTHING about whether Postgres enforces the
 * `marketing_holdings_declaration.member_id` CHECK, which is asserted here by reading the
 * migration text, nor about 0070's append-only trigger on `audit_log`.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { invokeAction, ACTION_REGISTRY } from '../registry.js';
import { invalidateEntitlements } from '../../access/entitlements.js';
import { _resetAbuseRegisterMigrated, loadHoldingsRegister } from '../../marketing/abuseRegister.js';
import { _resetGateLedgerMigrated } from '../../marketing/outboundGate.js';
import { _resetOneMouthLedgerMigrated } from '../../marketing/oneMouth.js';
import { gateTextSha256 } from '../../marketing/outboundGate.js';
import { DECLARED_EMISSION_CAP, capDeclarationFaults, composeCampaignPublicText } from '../../marketing/emissionWarrant.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CAMPAIGN = '11111111-2222-3333-4444-555555555555';

interface Row { [k: string]: unknown }
interface Recorded { sql: string; params: unknown[] }

/** A roster member (`operators.ts` TEAM) whose id also satisfies the 0060 CHECK. */
const HUMAN = 'nik';

const defaultCampaign: Row = {
  token_incentivized: true,
  budget_lcx: '1000',
  name: 'PayAgent launch quest',
  detail: 'Create a payment link and get it paid.',
  created_by: HUMAN,
};

/**
 * A pool that answers every query the launch path makes.
 *
 * THE TWO CAMPAIGN READS ARE DISPATCHED ON THEIR COLUMN LISTS, not on
 * `/FROM dist_campaigns WHERE id/`, which both of them match. The gate reads
 * `token_incentivized, budget_lcx, name, detail, created_by`; the warrant reads
 * `id::text AS id, name, detail, …`. A regex that caught both would have made every test
 * below pass or fail for reasons the test did not choose.
 */
function stubPool(opts: {
  campaign?: Row | null;
  reviewKinds?: string[];
  holdingsRows?: Row[];
  oneMouthLedger?: boolean;
} = {}) {
  const queries: Recorded[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (/to_regclass\('public\.marketing_one_mouth_shadow'\)/.test(sql)) {
        return { rows: [{ ok: opts.oneMouthLedger ?? true }], rowCount: 1 };
      }
      if (/to_regclass/.test(sql)) return { rows: [{ ok: true }], rowCount: 1 };

      // The GATE's read.
      if (/SELECT token_incentivized, budget_lcx, name, detail, created_by/.test(sql)) {
        const row = opts.campaign === undefined ? defaultCampaign : opts.campaign;
        return { rows: row === null ? [] : [row], rowCount: row === null ? 0 : 1 };
      }
      // The WARRANT's read.
      if (/SELECT id::text AS id, name, detail, token_incentivized/.test(sql)) {
        const row = opts.campaign === undefined ? defaultCampaign : opts.campaign;
        return {
          rows: row === null ? [] : [{ ...row, id: CAMPAIGN, status: 'compliance_review' }],
          rowCount: row === null ? 0 : 1,
        };
      }
      if (/FROM analytic_reviews/.test(sql)) {
        const kinds = opts.reviewKinds ?? ['premortem', 'legal_check'];
        return { rows: kinds.map((kind) => ({ kind })), rowCount: kinds.length };
      }
      if (/COALESCE\(SUM\(budget_lcx\), 0\)/.test(sql)) {
        return { rows: [{ total: '0', unstated: '0', n: '0' }], rowCount: 1 };
      }
      if (/EXISTS \(SELECT 1 FROM marketing_asset_embargo/.test(sql)) {
        return { rows: [{ any_rows: false }], rowCount: 1 };
      }
      if (/SELECT d\.member_id, d\.asset_symbol, d\.holds/.test(sql)) {
        const rows = opts.holdingsRows ?? [];
        return { rows, rowCount: rows.length };
      }
      if (/INSERT INTO audit_log/.test(sql)) {
        return { rows: [{ id: 'audit-row-1' }], rowCount: 1 };
      }
      // Only consulted when the ACTING principal is a roster human; the machine
      // principal used everywhere else never reaches the pool for this.
      if (/FROM entitlements WHERE member_id/.test(sql)) {
        return { rows: [{ workspace: 'distribution', capability: 'approve' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  return { pool: pool as unknown as pg.Pool, queries };
}

const launch = (
  pool: pg.Pool,
  params: Record<string, unknown> = { status: 'live' },
  actor = 'operator',
) => invokeAction(pool, 'dist_campaign_set_status', {
  subjectType: 'dist_campaign',
  subjectId: CAMPAIGN,
  params,
  // 'operator' is not a roster id, so it is treated as a machine principal and
  // loadEntitlements never touches the pool — keeping these tests about the gate.
  // It is the PRINCIPAL PRESSING THE BUTTON and is deliberately NOT the launcher of
  // record; that is `dist_campaigns.created_by`, and the difference is tested below.
  actor,
  role: 'approver' as const,
});

beforeEach(() => {
  _resetAbuseRegisterMigrated();
  _resetGateLedgerMigrated();
  _resetOneMouthLedgerMigrated();
  // The entitlement cache is process-wide with a TTL, so one test that resolves a
  // roster human would otherwise decide the answer for every later test in the file.
  invalidateEntitlements();
});

/**
 * registry.ts WITH ITS COMMENTS REMOVED.
 *
 * The replacement comment on the emission-warrant limb QUOTES THE DELETED DEFECT
 * verbatim — `emissionBudget({ … treasuryBudgetLcx: Math.max(budget, 1) })` — because a
 * reader needs to see what was there. Matching the raw file for that string therefore
 * fails against correct code, which is exactly the trap `authority.test.ts` records:
 * "Assert on code, never on prose." This is the same rule applied to a whole file
 * instead of to one `Function.prototype.toString()`.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/* ════════ 1. THE GATE IS REACHED ════════ */

describe('the warrant gates both publication points and only those', () => {
  for (const status of ['approved', 'live']) {
    it(`refuses a token campaign reaching ${status}`, async () => {
      const { pool } = stubPool();
      await expect(launch(pool, { status })).rejects.toMatchObject({
        code: 'EMISSION_WARRANT_REFUSED',
      });
    });
  }

  for (const status of ['draft', 'compliance_review', 'measured']) {
    it(`does not gate the transition to ${status}, which is not a publication point`, async () => {
      const { pool, queries } = stubPool();
      await expect(launch(pool, { status })).resolves.toMatchObject({ status });
      // Not merely "it did not throw": the warrant must not have been evaluated at all,
      // or a `measured` transition would mint an audit warrant for a campaign nobody
      // was launching.
      expect(queries.some((q) => /SELECT id::text AS id, name, detail/.test(q.sql))).toBe(false);
    });
  }

  it('is reached through invokeAction rather than only by direct call', async () => {
    // A CAPABILITY NOBODY CAN REACH IS NOT A CAPABILITY, and that is the exact defect
    // this gate was built to close: the engine existed and nothing called it. The
    // refusal arriving from `invokeAction` is what proves the front door reaches it.
    const { pool } = stubPool();
    await expect(launch(pool)).rejects.toMatchObject({ status: 409 });
    expect(ACTION_REGISTRY.dist_campaign_set_status).toBeDefined();
  });

  it('names the refusal codes and the rule, not just a sentence', async () => {
    const { pool } = stubPool();
    const err = await launch(pool).catch((e: unknown) => e) as {
      data?: { refusalCodes?: string[]; refusals?: { rule: string }[]; launcher?: string };
    };
    /*
     * The live blocker changed on 2026-08-07: a cap IS now declared, so what stops a token
     * launch is the LAUNCHER'S POSITION, not the treasury envelope. The subject of this test
     * is unchanged — every refusal names a code AND cites a rule, and the record says whose
     * position was resolved — so only the code moved.
     */
    expect(err.data?.refusalCodes).toContain('EMISSION_LAUNCHER_POSITION_UNDECLARED');
    expect(err.data?.refusalCodes, 'the cap is declared; it must not be a blocker').not.toContain('EMISSION_CAP_NOT_DECLARED');
    expect(err.data?.refusals?.every((r) => typeof r.rule === 'string' && r.rule !== '')).toBe(true);
    // WHOSE position was resolved, on the record. The acting principal is not it.
    expect(err.data?.launcher).toBe(HUMAN);
  });
});

/* ════════ 2. ABSENCE REFUSES, AND THERE IS NO WAY TO MAKE IT NOT ════════ */

describe('the declaration is required and its absence refuses', () => {
  it('refuses when the holdings register holds no declaration for the launcher', async () => {
    // The register is READABLE and has no row for (nik, LCX). That is an unanswered
    // question, and the whole decision is that an unanswered question refuses.
    const { pool } = stubPool({ holdingsRows: [] });
    const err = await launch(pool).catch((e: unknown) => e) as { data?: { refusalCodes?: string[] } };
    expect(err.data?.refusalCodes).toContain('EMISSION_LAUNCHER_POSITION_UNDECLARED');
  });

  it('an empty register is never read as "declared none"', async () => {
    /*
     * THE DEFECT THIS FORBIDS, stated as an assertion rather than as a comment: an empty
     * register meaning "nobody holds anything" would clear the Art 91(3)(c) limb for the
     * entire desk at once, silently, and it is the single most attractive shortcut in
     * this whole gate.
     */
    const { pool } = stubPool({ holdingsRows: [] });
    const err = await launch(pool).catch((e: unknown) => e) as { data?: { refusalCodes?: string[] } };
    expect(err.data?.refusalCodes).not.toContain('EMISSION_LAUNCHER_HOLDS_EMISSION_ASSET');
    expect(err.data?.refusalCodes).toContain('EMISSION_LAUNCHER_POSITION_UNDECLARED');
  });

  it('still refuses on the cap when the launcher HAS declared no position', async () => {
    /*
     * The launcher limb is satisfiable and the launch still does not happen, because the
     * treasury cap is undeclared. TWO INDEPENDENT LIMBS — if this passed, the cap limb
     * would be decorative.
     */
    const { pool } = stubPool({
      holdingsRows: [{
        member_id: HUMAN, asset_symbol: 'LCX', holds: false,
        declared_at: '2026-08-01T00:00:00.000Z', renew_by: '2027-08-01T00:00:00.000Z',
      }],
    });
    /*
     * SINCE 2026-08-07 BOTH LIMBS CAN BE SATISFIED, so this now asserts the thing the old
     * version could not: that the gate is PASSABLE. A control that has never granted is
     * indistinguishable from one that cannot, and "it refuses everything" is not evidence
     * that it refuses the right things.
     *
     * 1000 LCX against a 6,212,723.65805169 concurrent ceiling, with the launcher's position
     * on file. The launch must SUCCEED.
     */
    await expect(launch(pool), 'a declared cap and a declared position must permit a launch').resolves.toBeTruthy();
  });

  it('keeps the two limbs independent — a declared cap does not excuse an undeclared position', async () => {
    /*
     * The other half of the same property, and the half that still bites. The cap limb is now
     * satisfied for every campaign under the ceiling, so if the limbs were ever collapsed this
     * is where it would show: a launch with NO holdings declaration must still refuse, and
     * must refuse on the LAUNCHER, never on the cap.
     */
    const { pool } = stubPool({ holdingsRows: [] });
    const err = await launch(pool).catch((e: unknown) => e) as { data?: { refusalCodes?: string[] } };
    expect(err.data?.refusalCodes).toContain('EMISSION_LAUNCHER_POSITION_UNDECLARED');
    expect(err.data?.refusalCodes).not.toContain('EMISSION_CAP_NOT_DECLARED');
  });

  it('refuses when the launcher has declared a holding', async () => {
    const { pool } = stubPool({
      holdingsRows: [{
        member_id: HUMAN, asset_symbol: 'LCX', holds: true,
        declared_at: '2026-08-01T00:00:00.000Z', renew_by: '2027-08-01T00:00:00.000Z',
      }],
    });
    const err = await launch(pool).catch((e: unknown) => e) as { data?: { refusalCodes?: string[] } };
    expect(err.data?.refusalCodes).toContain('EMISSION_LAUNCHER_HOLDS_EMISSION_ASSET');
  });

  it('HAS a declared cap in this build, so the cap is no longer what blocks a launch', async () => {
    /*
     * STATED AS A TEST BECAUSE IT IS AN OPERATIONAL FACT, not a detail — and the fact
     * changed on 2026-08-07. It used to read "has no declared cap … so no token campaign can
     * launch today", which was true for as long as nobody had declared one.
     *
     * A cap is now declared on founder authority. What still blocks a launch is the
     * LAUNCHER'S OWN LCX POSITION, which no system may answer for: Art 91(3)(c) attaches to a
     * person. So the gate is still shut for any launcher who has not declared, and this test
     * pins WHICH limb is holding it shut, because "blocked" without "by what" is the kind of
     * thing that gets discovered in production.
     */
    expect(DECLARED_EMISSION_CAP, 'the cap was un-declared without updating this test').not.toBeNull();
    expect(capDeclarationFaults(DECLARED_EMISSION_CAP!), 'the shipped cap is not a valid cap').toEqual([]);

    const { pool } = stubPool();
    const err = await launch(pool).catch((e: unknown) => e) as { data?: { refusalCodes?: string[] } };
    expect(err.data?.refusalCodes).toContain('EMISSION_LAUNCHER_POSITION_UNDECLARED');
    expect(err.data?.refusalCodes).not.toContain('EMISSION_CAP_NOT_DECLARED');
  });
});

/* ════════ 3. THE OVERRIDE CANNOT REACH THE WARRANT ════════ */

describe('overrideGate covers the review blockers and NOT the warrant', () => {
  it('does not let an override with a reason launch a campaign with no warrant', async () => {
    /*
     * THE MOST IMPORTANT ASSERTION IN THIS FILE. `overrideGate` is a legitimate, audited
     * escape hatch for the premortem/legal_check blockers — a desk judgement an approver
     * may accept in writing. It must not reach this limb: Art 91(3)(c) attaches
     * personally, at roughly EUR 700,000, to the human whose name is on the launch, and
     * an approver overriding it would be signing a colleague up to a liability that
     * colleague was never asked about.
     */
    const { pool } = stubPool();
    await expect(launch(pool, {
      status: 'live',
      overrideGate: true,
      overrideReason: 'Board approved verbally, launching ahead of the paperwork.',
    })).rejects.toMatchObject({ code: 'EMISSION_WARRANT_REFUSED' });
  });

  it('says on the refusal itself that it is not overridable', async () => {
    // The operator has to learn this from the refusal, not from the source.
    const { pool } = stubPool();
    const err = await launch(pool, { status: 'live', overrideGate: true, overrideReason: 'x' })
      .catch((e: unknown) => e) as { data?: { overridable?: boolean }; message?: string };
    expect(err.data?.overridable).toBe(false);
    expect(err.message).toMatch(/NOT overridable/);
  });

  it('reports the review blockers in the same refusal rather than one at a time', async () => {
    // A refusal naming only the warrant while the reviews are also missing sends the
    // approver back twice. The engine returns every refusal; this carries them across.
    const { pool } = stubPool({ reviewKinds: [] });
    const err = await launch(pool).catch((e: unknown) => e) as { data?: { missing?: string[] } };
    expect(err.data?.missing).toEqual(['premortem', 'legal_check']);
  });

  it('still refuses a non-approver before any of this', async () => {
    // Authority is not overridable either, and narrowing that must not have been undone.
    const { pool } = stubPool();
    await expect(invokeAction(pool, 'dist_campaign_set_status', {
      subjectType: 'dist_campaign',
      subjectId: CAMPAIGN,
      params: { status: 'live', overrideGate: true, overrideReason: 'please' },
      actor: 'operator',
      role: 'operator' as const,
    })).rejects.toMatchObject({ code: 'APPROVER_REQUIRED' });
  });
});

/* ════════ 4. THREE ABSENCES OF A LAUNCHER, THREE CODES ════════ */

describe('who the Art 91(3)(c) question is about is resolved, never assumed', () => {
  const cases: Array<[string, unknown, string]> = [
    ['NULL created_by', null, 'CAMPAIGN_LAUNCHER_NOT_RECORDED'],
    ['empty created_by', '   ', 'CAMPAIGN_LAUNCHER_NOT_RECORDED'],
    // An email is the realistic one: `emissionWarrant.test.ts` itself uses
    // 'nik@lcx.com' as its launcher fixture, and `@` is not in the 0060 CHECK's
    // character class — so no declaration for it could ever be stored.
    ['an email address', 'nik@lcx.com', 'CAMPAIGN_LAUNCHER_NOT_JOINABLE'],
    ['a display name', 'Nik Sharma', 'CAMPAIGN_LAUNCHER_NOT_JOINABLE'],
    ['the shared desk key', 'operator', 'CAMPAIGN_LAUNCHER_NOT_A_NAMED_HUMAN'],
    ['a monitor', 'monitor:uptime', 'CAMPAIGN_LAUNCHER_NOT_A_NAMED_HUMAN'],
    ['the AI principal', 'ai', 'CAMPAIGN_LAUNCHER_NOT_A_NAMED_HUMAN'],
    ['a second-tier sign-in', 'ext:acme', 'CAMPAIGN_LAUNCHER_NOT_A_NAMED_HUMAN'],
  ];

  for (const [label, created_by, code] of cases) {
    it(`refuses ${label} with ${code}`, async () => {
      const { pool } = stubPool({ campaign: { ...defaultCampaign, created_by } });
      await expect(launch(pool)).rejects.toMatchObject({ code });
    });
  }

  it('gives the three absences three different codes', () => {
    // The point of the matrix above, asserted directly so that collapsing two of them
    // fails here even if somebody rewrites the cases.
    expect(new Set(cases.map(([, , code]) => code)).size).toBe(3);
  });

  it('never falls back to the principal pressing the button', async () => {
    /*
     * THE WORST AVAILABLE SHORTCUT. `actor` is authenticated and conveniently to hand, and
     * substituting it would resolve the holdings question against the approver rather than
     * the launcher — quietly moving a personal liability onto whoever happened to click.
     * The acting principal here IS a roster human, so a fallback would succeed.
     */
    const { pool } = stubPool({ campaign: { ...defaultCampaign, created_by: null } });
    await expect(launch(pool, { status: 'live' }, HUMAN))
      .rejects.toMatchObject({ code: 'CAMPAIGN_LAUNCHER_NOT_RECORDED' });
  });

  it('records the acting principal beside the launcher rather than instead of it', async () => {
    const { pool } = stubPool();
    const err = await launch(pool).catch((e: unknown) => e) as {
      data?: { launcher?: string; actingPrincipal?: string };
    };
    expect(err.data?.launcher).toBe(HUMAN);
    expect(err.data?.actingPrincipal).toBe('operator');
  });

  it('accepts the shape the holdings register actually stores', () => {
    /*
     * SOURCE PARITY, because the claim is about another file. `HOLDINGS_MEMBER_ID_RE` in
     * registry.ts mirrors a SQL CHECK that has no exported constant. If 0060 is edited and
     * the mirror is not, the gate would refuse ids the database accepts (or admit ids it
     * rejects), and nothing else in the suite would notice.
     */
    const sql = readFileSync(
      resolve(HERE, '..', '..', 'db', 'migrations', '0060_marketing_abuse.sql'), 'utf8',
    );
    expect(sql).toContain("member_id      text NOT NULL CHECK (member_id ~ '^[a-z0-9][a-z0-9._:-]{0,63}$')");
    const source = readFileSync(resolve(HERE, '..', 'registry.ts'), 'utf8');
    expect(source).toContain('/^[a-z0-9][a-z0-9._:-]{0,63}$/');
  });
});

/* ════════ 5. THE SYSTEM NEVER ANSWERS FOR THE HUMAN ════════ */

describe('the gate demands a declaration and never makes one', () => {
  it('writes nothing to the holdings register on any refusal path', async () => {
    const { pool, queries } = stubPool({ holdingsRows: [] });
    await launch(pool).catch(() => {});
    const wrote = queries.filter((q) =>
      /INSERT INTO marketing_holdings_declaration|UPDATE marketing_holdings_declaration/i.test(q.sql));
    expect(wrote).toEqual([]);
  });

  it('writes nothing to the holdings register when the launcher cannot be identified', async () => {
    // The tempting moment: nobody is recorded, so record one. It must not.
    const { pool, queries } = stubPool({ campaign: { ...defaultCampaign, created_by: null } });
    await launch(pool).catch(() => {});
    expect(queries.some((q) => /marketing_holdings_declaration/i.test(q.sql))).toBe(false);
  });

  it('has no source path that defaults a holding to false', () => {
    const source = codeOnly(readFileSync(resolve(HERE, '..', 'registry.ts'), 'utf8'));
    expect(source).not.toMatch(/holds\s*[:=]\s*false/);
    expect(source).not.toMatch(/holds\s*\?\?\s*false/);
  });

  it('has no flag anywhere that lets an empty register read as attested', async () => {
    /*
     * THE STRUCTURAL VERSION OF THE SAME PROMISE, checked at the register rather than at
     * the gate. `loadHoldingsRegister` returns `completeness: { kind: 'not_attested' }` on
     * BOTH its return paths — the empty one and the one that successfully read rows — so
     * there is no argument, no option and no environment variable that produces an
     * attested register. That is deliberate: an attested-looking empty register would
     * clear the Art 91(3)(c) limb for the whole desk in one step.
     *
     * Asserted through the module rather than by reading its source, so a refactor that
     * keeps the property passes and one that introduces a flag fails.
     */
    const { pool } = stubPool({ holdingsRows: [] });
    const empty = await loadHoldingsRegister(pool, { memberIds: [HUMAN], symbols: ['LCX'] });
    expect(empty.completeness.kind).toBe('not_attested');
    expect(empty.entries).toEqual([]);

    const { pool: populated } = stubPool({
      holdingsRows: [{
        member_id: HUMAN, asset_symbol: 'LCX', holds: false,
        declared_at: '2026-08-01T00:00:00.000Z', renew_by: '2027-08-01T00:00:00.000Z',
      }],
    });
    _resetAbuseRegisterMigrated();
    const full = await loadHoldingsRegister(populated, { memberIds: [HUMAN], symbols: ['LCX'] });
    // Rows were READ, and the register still does not claim to be attested.
    expect(full.entries).toHaveLength(1);
    expect(full.completeness.kind).toBe('not_attested');
  });
});

/* ════════ 6. THE TRIGGER HAS THREE STATES ════════ */

describe('token_incentivized is read from the database and unknown refuses', () => {
  for (const [label, value] of [
    ['null', null], ['the string true', 'true'], ['undefined', undefined], ['1', 1],
  ] as Array<[string, unknown]>) {
    it(`refuses when the trigger is ${label} rather than advancing ungated`, async () => {
      /*
       * `if (camp.token_incentivized)` was a truthiness test, so NULL and undefined took
       * the else branch and the campaign advanced with NO gate at all. Note that `'true'`
       * and `1` are truthy and WOULD have been gated — the dangerous half is the falsy
       * half, and both halves are wrong for the same reason.
       */
      const { pool } = stubPool({ campaign: { ...defaultCampaign, token_incentivized: value } });
      await expect(launch(pool)).rejects.toMatchObject({ code: 'CAMPAIGN_TRIGGER_NOT_STATED' });
    });
  }

  it('lets a non-token campaign through, because the flag said so', async () => {
    const { pool } = stubPool({ campaign: { ...defaultCampaign, token_incentivized: false } });
    await expect(launch(pool)).resolves.toMatchObject({ status: 'live' });
  });

  it('does not take the trigger from the request', async () => {
    // A body field cannot turn the gate off; the column is what decides.
    const { pool } = stubPool();
    await expect(launch(pool, { status: 'live', tokenIncentivized: false }))
      .rejects.toMatchObject({ code: 'EMISSION_WARRANT_REFUSED' });
  });
});

/* ════════ 7. THE LIMB THAT COULD NOT FAIL ════════ */

describe('the budget limb that was arithmetically incapable of failing is gone', () => {
  const source = codeOnly(readFileSync(resolve(HERE, '..', 'registry.ts'), 'utf8'));

  it('still reads the file it thinks it is reading', () => {
    // NON-VACUITY. A `codeOnly` that stripped everything would make both assertions
    // below pass for free, which is how a source ratchet dies quietly.
    expect(source).toMatch(/evaluateEmissionWarrant\s*\(/);
    expect(source.length).toBeGreaterThan(20_000);
  });

  it('no longer compares a budget against itself', () => {
    /*
     * The exact defect: `emissionBudget({ projectedPaidLinks: budget, creatorRewardLcx: 1,
     * …, treasuryBudgetLcx: Math.max(budget, 1) })` computes
     * `withinBudget: budget <= Math.max(budget, 1)`, which is true for every input that
     * exists. It is quoted verbatim in the replacement comment, so this asserts on the
     * CALL rather than on any string — a comment quoting the defect would otherwise fail
     * this test against correct code.
     */
    expect(source).not.toMatch(/emissionBudget\s*\(/);
    expect(source).not.toMatch(/treasuryBudgetLcx:\s*Math\.max/);
  });

  it('no longer reads an absent budget as zero', () => {
    expect(source).not.toMatch(/budget_lcx\s*!=\s*null\s*\?\s*Number\(camp\.budget_lcx\)\s*:\s*0/);
  });

  it('refuses when the campaign states no budget at all', async () => {
    // The replacement's behaviour, not just the deletion: absent is not zero.
    const { pool } = stubPool({
      campaign: { ...defaultCampaign, budget_lcx: null },
      holdingsRows: [{
        member_id: HUMAN, asset_symbol: 'LCX', holds: false,
        declared_at: '2026-08-01T00:00:00.000Z', renew_by: '2027-08-01T00:00:00.000Z',
      }],
    });
    const err = await launch(pool).catch((e: unknown) => e) as { data?: { refusalCodes?: string[] } };
    expect(err.data?.refusalCodes).toContain('EMISSION_AMOUNT_NOT_STATED');
  });

  it('refuses a negative budget rather than treating it as headroom', async () => {
    const { pool } = stubPool({ campaign: { ...defaultCampaign, budget_lcx: '-5000' } });
    const err = await launch(pool).catch((e: unknown) => e) as { data?: { refusalCodes?: string[] } };
    expect(err.data?.refusalCodes).toContain('EMISSION_AMOUNT_NEGATIVE');
  });
});

/* ════════ 8. A CAMPAIGN THAT REACHED approved BEFORE THIS GATE ════════ */

describe('a pre-gate approved campaign is not retro-blessed', () => {
  it('is still gated on its way to live', async () => {
    /*
     * THE DECISION, MADE EXPLICIT. This is a TRANSITION gate: it fires when a campaign is
     * moved INTO approved or live. A campaign already sitting at `approved` from before
     * the gate existed carries no warrant, and the honest treatment is that it is caught
     * at the next transition rather than blessed where it stands. `approved -> live` is
     * that chokepoint and it is gated identically — the gate never consults the CURRENT
     * status, only the target.
     */
    const { pool } = stubPool({ campaign: { ...defaultCampaign, status: 'approved' } });
    await expect(launch(pool, { status: 'live' }))
      .rejects.toMatchObject({ code: 'EMISSION_WARRANT_REFUSED' });
  });

  it('never infers a warrant from the campaign status', () => {
    // A reader asking "which live campaigns hold a warrant" must be answered from the
    // audit ledger, never from `status = 'live'`. Nothing in the gate reads it.
    const source = codeOnly(readFileSync(resolve(HERE, '..', 'registry.ts'), 'utf8'));
    expect(source).not.toMatch(/status\s*===\s*'approved'\s*\)\s*return/);
    expect(source).not.toMatch(/alreadyApproved|retroWarrant|grandfather/i);
  });
});

/* ════════ 9. THE ONE MOUTH OBSERVATION ACTUALLY RUNS ON THIS PATH ════════ */

describe('the shadow observation is reached by executing the action, not by grepping it', () => {
  /*
   * WHY THIS GROUP EXISTS, AND IT IS THE FINDING OF AN ADVERSARIAL PASS.
   *
   * Every assertion that the one-mouth engine is wired in lived in
   * `marketing/__tests__/oneMouthWiring.test.ts` and was a SOURCE GREP:
   * `expect(registry).toMatch(/observeAndRecordOneMouth\s*\(/)` plus a walk of the tree
   * looking for the same identifier. A source grep is satisfied by a call site that can
   * never execute. Replacing the call with
   *
   *     const shadow = camp === undefined || camp !== undefined ? null : await observe…
   *
   * — permanently unreachable, identifier untouched — left 62/62 of this lane's tests
   * GREEN. That is precisely the defect the wiring was built to close, reproduced one
   * level up: an engine that is referenced and not run, proven "wired" by a test that
   * reads text instead of behaviour.
   *
   * These assertions go through `invokeAction` and look at what reached the pool.
   */
  const shadowInsert = (queries: Recorded[]) =>
    queries.find((q) => /INSERT INTO marketing_one_mouth_shadow/.test(q.sql));

  it('ledgers an observation over the campaign that actually reached live', async () => {
    // A NON-token campaign, because the warrant refuses every token launch in this build
    // and the observation is deliberately taken over EVERY campaign that publishes.
    const { pool, queries } = stubPool({
      campaign: { ...defaultCampaign, token_incentivized: false },
    });
    const out = await launch(pool, { status: 'live' }) as { shadowObservation?: string };
    expect(out.shadowObservation).toBe('recorded');

    const write = shadowInsert(queries);
    expect(write, 'the launch path did not put anything through the shadow engine').toBeDefined();
    // THE BYTES, not merely that something was written: the digest must be the one a
    // warrant over the same campaign would carry, or the two ledgers never join.
    const expected = await gateTextSha256(composeCampaignPublicText({
      name: defaultCampaign.name as string,
      detail: defaultCampaign.detail as string,
    }));
    expect(write?.params).toContain(expected);
    // And the surface it claims to be about.
    expect(write?.params).toContain('dist_campaign');
  });

  it('observes on the way to approved as well, not only to live', async () => {
    const { pool, queries } = stubPool({
      campaign: { ...defaultCampaign, token_incentivized: false },
    });
    const out = await launch(pool, { status: 'approved' }) as { shadowObservation?: string };
    expect(out.shadowObservation).toBe('recorded');
    expect(shadowInsert(queries)).toBeDefined();
  });

  it('reports observed-but-not-ledgered as its own state when 0073 is absent', async () => {
    /*
     * The dangerous state, and it must not read as either "clean" or "skipped": the engine
     * ran, this process knows what it found, and the ledger does not.
     */
    const { pool, queries } = stubPool({
      campaign: { ...defaultCampaign, token_incentivized: false },
      oneMouthLedger: false,
    });
    const out = await launch(pool, { status: 'live' }) as { shadowObservation?: string };
    expect(out.shadowObservation).toBe('observed_not_recorded');
    expect(shadowInsert(queries)).toBeUndefined();
  });

  it('does not observe a transition that publishes nothing, and says which state that is', async () => {
    const { pool, queries } = stubPool({
      campaign: { ...defaultCampaign, token_incentivized: false },
    });
    const out = await launch(pool, { status: 'measured' }) as { shadowObservation?: string };
    // NOT the same token as a failed engine. `not_observed` used to cover both.
    expect(out.shadowObservation).toBe('not_a_publication_point');
    expect(shadowInsert(queries)).toBeUndefined();
  });

  it('gives a blown-up engine a state of its own rather than the skip state', async () => {
    /*
     * `observeAndRecordOneMouth` swallows a contract violation and returns `null` — the
     * SAME value it returns for "there was no text". Collapsed, a control that exploded on
     * a campaign that did reach the public was reported as a deliberate skip.
     */
    const { pool } = stubPool({ campaign: { ...defaultCampaign, token_incentivized: false } });
    const boom = {
      query: async (sql: string, params: unknown[] = []) => {
        if (/gate_decisions|marketing_one_mouth_shadow|marketing_asset_embargo/.test(sql)) {
          // Not a pg error object — a raw throw from inside the engine, which is what a
          // contract violation looks like.
          throw new Error('the engine broke its own never-throws contract');
        }
        return pool.query(sql, params);
      },
    } as unknown as pg.Pool;
    const out = await launch(boom, { status: 'live' }) as { shadowObservation?: string };
    expect(['engine_failed', 'observed_not_recorded', 'recorded']).toContain(out.shadowObservation);
    // Whatever it is, it is NOT the token that means "this transition publishes nothing".
    expect(out.shadowObservation).not.toBe('not_a_publication_point');
  });
});
