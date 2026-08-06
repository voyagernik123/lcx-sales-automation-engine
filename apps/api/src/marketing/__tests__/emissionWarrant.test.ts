import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetAbuseRegisterMigrated } from '../abuseRegister.js';
import { _resetGateLedgerMigrated, gateTextSha256 } from '../outboundGate.js';
import {
  CAMPAIGN_DESCRIPTION_FALLBACK_PREFIX,
  CAMPAIGN_TASK_LABELS,
  DECLARED_EMISSION_CAP,
  capDeclarationFaults,
  campaignPublicDescription,
  EMISSION_ASSET,
  EMISSION_WARRANT_ACTION,
  EMISSION_WARRANT_ENTITY,
  WARRANT_REQUIRED_STATUSES,
  composeCampaignPublicText,
  evaluateEmissionWarrant,
  mayReachStatus,
  readEmissionWarrants,
  warrantCoversText,
  type EmissionCapDeclaration,
} from '../emissionWarrant.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE EMISSION WARRANT — this one STOPS a campaign, and it stops it by default.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Written before the module. It decides whether a token-incentivised campaign becomes
 * public, and MiCA Art 91(3)(c) attaches personally at roughly EUR 700,000 to whoever
 * launches a promotion about an asset they hold — so a test written afterwards would
 * prove nothing about the gate.
 *
 * ── WHAT EACH GROUP DEFENDS ──────────────────────────────────────────────────
 *  1. THE DEFAULT ANSWER IS NO. No cap is declared, so the budget limb REFUSES. A gate
 *     compared against an absent cap returns OK for every input; this platform shipped
 *     exactly that once (`budget <= budget` in the launch limb) and the refusal is what
 *     makes this one capable of failing. AND THE SAME DEFECT CAN ARRIVE THROUGH THE
 *     DECLARATION: `capLcx: NaN` cannot be exceeded by any emission, `JSON.stringify`
 *     writes it as `null`, and an unattributed number in a compliance gate is a magic
 *     constant — so a declaration that is not a cap refuses on its own code and names
 *     EVERY fault. A negative quantity, in this campaign's row or in another campaign's,
 *     refuses too: one such value would satisfy any cap.
 *  2. THE TRIGGER IS READ FROM THE DATABASE. `token_incentivized` is a column, not a
 *     request field, so nothing a caller sends or omits can suppress the warrant — and
 *     nothing a caller sends reaches the immutable record either. A trigger that is
 *     neither true nor false is UNKNOWN and refuses; only the literal `false` means "the
 *     gate does not apply".
 *  3. THE WARRANT IS THE LEDGER ROW. It carries the sha256 of the exact text checked and
 *     the refusal codes, it goes into `audit_log` (append-only as of 0070), and a failed
 *     append REFUSES — a warrant nobody can look up is not a warrant.
 *  4. THE LAUNCHER'S LCX POSITION IS CHECKED WHATEVER THE COPY SAYS. `LCX` is on the
 *     gate's not-a-ticker list, so the text limb alone would miss it.
 *  5. NOT APPLICABLE IS NOT GRANTED. A three-member union, so no caller can read a
 *     boolean the wrong way round. And its narrative does not claim a control is running:
 *     the shadow engine next door has no caller, the sentence says so, and a source walk
 *     here fails the day that stops being true.
 *  6. THE DIGEST IS OVER THE BYTES THE PLATFORM PUBLISHES. Verbatim — no trim — and
 *     including the sentence the export substitutes for a NULL `detail`. A warrant over
 *     tidied-up or missing bytes identifies text nobody published, and
 *     `warrantCoversText` would be false against the actual page forever.
 *
 * ── WHAT THESE TESTS CANNOT SEE ──────────────────────────────────────────────
 * The pool is a fake dispatching on SQL text. They prove the composition, the arithmetic
 * and every refusal path, and NOTHING about whether 0070's append-only trigger actually
 * refuses an UPDATE — that is asserted as text in the migration and in `access/seal.ts`.
 */

interface Row { [k: string]: unknown }

const NOW = '2026-08-06T12:00:00.000Z';
const LAUNCHER = 'nik@lcx.com';
const CAMPAIGN = '11111111-2222-3333-4444-555555555555';

const missingTable = (rel: string) =>
  Object.assign(new Error(`relation "${rel}" does not exist`), { code: '42P01' });

/** A declared cap, for the limbs that cannot be exercised without one. Production has
 *  none — see `DECLARED_EMISSION_CAP` and the refusal that covers it. */
const cap = (capLcx: number): EmissionCapDeclaration => ({
  capLcx,
  basis: 'concurrent_in_flight',
  declaredBy: 'test-owner',
  declaredAt: '2026-08-01T00:00:00.000Z',
  instrument: 'test fixture — not a policy',
});

function stub(opts: {
  campaign?: Row | null;
  campaignAbsent?: boolean;
  embargoRows?: Row[];
  holdingsRows?: Row[];
  inFlight?: { total?: unknown; unstated?: unknown; n?: unknown } | null;
  auditWriteFails?: boolean;
  auditAbsent?: boolean;
  warrantRows?: Row[];
} = {}) {
  const audit: { params: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      if (/to_regclass/.test(sql)) return { rows: [{ ok: true }], rowCount: 1 };
      if (/FROM dist_campaigns WHERE id = \$1/.test(sql)) {
        if (opts.campaignAbsent) throw missingTable('dist_campaigns');
        const row = opts.campaign === undefined ? defaultCampaign : opts.campaign;
        return { rows: row === null ? [] : [row], rowCount: row === null ? 0 : 1 };
      }
      if (/COALESCE\(SUM\(budget_lcx\), 0\)/.test(sql)) {
        if (opts.inFlight === null) throw missingTable('dist_campaigns');
        return {
          rows: [{ total: '0', unstated: '0', n: '0', ...(opts.inFlight ?? {}) }],
          rowCount: 1,
        };
      }
      if (/EXISTS \(SELECT 1 FROM marketing_asset_embargo/.test(sql)) {
        return { rows: [{ any_rows: (opts.embargoRows ?? []).length > 0 }], rowCount: 1 };
      }
      if (/SELECT asset_symbol, state, embargoed_from/.test(sql)) {
        return { rows: opts.embargoRows ?? [], rowCount: (opts.embargoRows ?? []).length };
      }
      if (/SELECT d\.member_id, d\.asset_symbol, d\.holds/.test(sql)) {
        return { rows: opts.holdingsRows ?? [], rowCount: (opts.holdingsRows ?? []).length };
      }
      if (/SELECT DISTINCT asset_symbol/.test(sql)) {
        const wanted = new Set((params[0] as string[] | undefined) ?? []);
        const symbols = [
          ...(opts.embargoRows ?? []).map((r) => r.asset_symbol as string),
          ...(opts.holdingsRows ?? []).map((r) => r.asset_symbol as string),
        ];
        const hit = [...new Set(symbols.filter((s) => wanted.has(s)))];
        return { rows: hit.map((asset_symbol) => ({ asset_symbol })), rowCount: hit.length };
      }
      if (/INSERT INTO marketing_outbound_gate_decision/.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO audit_log/.test(sql)) {
        if (opts.auditWriteFails) throw new Error('AUDIT_SEAL_APPEND_ONLY-adjacent failure');
        audit.push({ params });
        return { rows: [{ id: 'audit-row-1' }], rowCount: 1 };
      }
      if (/FROM audit_log/.test(sql)) {
        if (opts.auditAbsent) throw missingTable('audit_log');
        return { rows: opts.warrantRows ?? [], rowCount: (opts.warrantRows ?? []).length };
      }
      throw new Error(`stub pool: unexpected statement\n${sql}`);
    },
  };
  return { pool: pool as unknown as pg.Pool, audit };
}

const defaultCampaign: Row = {
  id: CAMPAIGN,
  name: 'PayAgent launch quests',
  detail: 'Complete three quests to earn rewards.',
  token_incentivized: true,
  budget_lcx: '1000',
  status: 'compliance_review',
};

const embargo = (symbol: string, state: string): Row => ({
  asset_symbol: symbol,
  state,
  embargoed_from: '2026-08-01T00:00:00.000Z',
  review_by: '2026-12-01T00:00:00.000Z',
  entered_by: 'monty',
  entered_at: '2026-08-01T00:00:00.000Z',
});

const declaration = (symbol: string, holds: boolean, member = LAUNCHER): Row => ({
  member_id: member,
  asset_symbol: symbol,
  holds,
  declared_at: '2026-07-01T00:00:00.000Z',
  renew_by: '2026-12-01T00:00:00.000Z',
});

/**
 * The perimeter answering YES for everything the composed campaign text can name, plus
 * the launcher's LCX declaration. Anything less refuses somewhere, which is the point of
 * the perimeter — every "this is granted" assertion has to supply these facts first.
 */
const perimeterClear = () => ({
  embargoRows: [embargo('LCX', 'clear'), embargo('PAYAGENT', 'clear')],
  holdingsRows: [declaration('LCX', false), declaration('PAYAGENT', false)],
});

const input = (over: Partial<Parameters<typeof evaluateEmissionWarrant>[1]> = {}) => ({
  campaignId: CAMPAIGN,
  targetStatus: 'approved',
  launcher: LAUNCHER,
  now: NOW,
  ...over,
});

beforeEach(() => {
  _resetAbuseRegisterMigrated();
  _resetGateLedgerMigrated();
});

/* ════════ 1. NO CAP ⇒ REFUSE. THE DEFAULT CASE. ════════ */

describe('an undeclared cap refuses and can never pass', () => {
  it('refuses with a stable code when no cap is declared, even with everything else clean', async () => {
    const { pool } = stub(perimeterClear());
    const d = await evaluateEmissionWarrant(pool, input());

    expect(d.outcome).toBe('refused');
    if (d.outcome !== 'refused') throw new Error('unreachable');
    expect(d.refusals.map((r) => r.code)).toContain('EMISSION_CAP_NOT_DECLARED');
    expect(mayReachStatus(d)).toBe(false);
  });

  it('refuses on an absent cap even when the in-flight aggregate is zero', async () => {
    /*
     * A ZERO AGGREGATE UNDER NO CAP IS NOT "PLENTY OF ROOM" — it is an unbounded
     * envelope. This is the assertion that stops the limb from being satisfied by the
     * cheapest possible database.
     */
    const { pool } = stub({ ...perimeterClear(), inFlight: { total: '0', unstated: '0', n: '0' } });
    const d = await evaluateEmissionWarrant(pool, input());
    expect(d.outcome).toBe('refused');
    if (d.outcome !== 'refused') throw new Error('unreachable');
    expect(d.refusals.map((r) => r.code)).toContain('EMISSION_CAP_NOT_DECLARED');
  });

  it('ships with no cap declared, so the refusal is the production path', () => {
    // If this ever becomes non-null it is because an owner declared one, and the
    // provenance fields are required so the number cannot arrive anonymously.
    expect(DECLARED_EMISSION_CAP).toBeNull();
  });

  it('is not the budget <= budget shape: the same numbers can pass and fail', async () => {
    /*
     * THE DEFECT THIS MIRRORS. `actions/registry.ts` computes
     * `emissionBudget({ projectedPaidLinks: budget, treasuryBudgetLcx: Math.max(budget, 1) })`
     * — the projection and the envelope are the same number, so `withinBudget` is true for
     * every input and the limb cannot fail. Here the cap is EXTERNAL to the campaign, and
     * the same campaign passes under one cap and fails under another.
     */
    const rows = { ...perimeterClear(), inFlight: { total: '500', unstated: '0', n: '1' } };

    const within = await evaluateEmissionWarrant(stub(rows).pool, input({ cap: cap(2000) }));
    expect(within.outcome).toBe('granted');

    const over = await evaluateEmissionWarrant(stub(rows).pool, input({ cap: cap(1200) }));
    expect(over.outcome).toBe('refused');
    if (over.outcome !== 'refused') throw new Error('unreachable');
    expect(over.refusals.map((r) => r.code)).toContain('EMISSION_CAP_EXCEEDED');
    // 500 in flight + 1000 here = 1500 against a cap of 1200. The numbers are in the
    // sentence so a human can check the arithmetic rather than trust it.
    const sentence = over.refusals.find((r) => r.code === 'EMISSION_CAP_EXCEEDED')!.sentence;
    expect(sentence).toContain('1500');
    expect(sentence).toContain('1200');
  });

  it('refuses a lower-bound aggregate rather than comparing it to the cap', async () => {
    // A sum over rows some of which state no amount is a LOWER BOUND, and a lower bound
    // compared against a cap can only ever pass — the same defect as no cap at all.
    const { pool } = stub({
      ...perimeterClear(),
      inFlight: { total: '400', unstated: '2', n: '3' },
    });
    const d = await evaluateEmissionWarrant(pool, input({ cap: cap(100_000) }));
    expect(d.outcome).toBe('refused');
    if (d.outcome !== 'refused') throw new Error('unreachable');
    expect(d.refusals.map((r) => r.code)).toContain('EMISSION_AGGREGATE_INCOMPLETE');
  });

  it('refuses when this campaign states no emission amount', async () => {
    const { pool } = stub({
      ...perimeterClear(),
      campaign: { ...defaultCampaign, budget_lcx: null },
    });
    const d = await evaluateEmissionWarrant(pool, input({ cap: cap(2000) }));
    expect(d.outcome).toBe('refused');
    if (d.outcome !== 'refused') throw new Error('unreachable');
    expect(d.refusals.map((r) => r.code)).toContain('EMISSION_AMOUNT_NOT_STATED');
  });

  it('refuses when the in-flight aggregate cannot be read', async () => {
    const { pool } = stub({ ...perimeterClear(), inFlight: null });
    const d = await evaluateEmissionWarrant(pool, input({ cap: cap(2000) }));
    expect(d.outcome).toBe('refused');
    if (d.outcome !== 'refused') throw new Error('unreachable');
    expect(d.refusals.map((r) => r.code)).toContain('EMISSION_AGGREGATE_UNREADABLE');
  });
});

/* ════════ 2. THE TRIGGER IS A COLUMN, NOT A REQUEST FIELD ════════ */

describe('the trigger condition is read server-side', () => {
  it('cannot be suppressed by anything the caller sends, and nothing it sends reaches the warrant', async () => {
    /*
     * WHAT THE FIRST VERSION OF THIS TEST PROVED, WHICH WAS NOTHING. It added
     * `tokenIncentivized: false` and `capLcx: 1e9` to the payload and asserted the check still
     * refused. No interface declares those keys, so no implementation could read them without
     * being written to: the assertion held for every possible implementation.
     *
     * WHAT IS FALSIFIABLE. The payload's claims CONTRADICT the database row (which says
     * token_incentivized = true and budget_lcx = 1000), and the assertions are that the
     * database won on every axis AND that not one caller-supplied value reached the immutable
     * record. The second half is the one that bites: `1000000000` appearing in
     * `audit_log.meta` is what a `{ ...input, ...draft }` implementation produces, and that is
     * a caller-controlled number inside a compliance record.
     */
    const { pool, audit } = stub(perimeterClear());
    const payload = {
      ...input(),
      tokenIncentivized: false,
      token_incentivized: false,
      capLcx: 1_000_000_000,
      cap: undefined,
      namedAssets: ['DOGE'],
      granted: true,
    } as Parameters<typeof evaluateEmissionWarrant>[1];

    const d = await evaluateEmissionWarrant(pool, payload);
    expect(d.outcome).toBe('refused');
    if (d.outcome !== 'refused') throw new Error('unreachable');
    // The trigger came from the column, so the token limbs ran at all.
    expect(d.warrant!.thisCampaignLcx).toBe(1000);
    // The caller's cap was not a cap.
    expect(d.refusals.map((r) => r.code)).toContain('EMISSION_CAP_NOT_DECLARED');
    expect(d.warrant!.capLcx).toBeNull();
    expect(d.warrant!.granted).toBe(false);
    // And nothing the caller sent is in the permanent record.
    const metaJson = String((audit[0]!.params as unknown[])[4]);
    expect(metaJson).not.toContain('1000000000');
    expect(metaJson).not.toContain('DOGE');
    expect(Object.keys(JSON.parse(metaJson) as object)).not.toContain('namedAssets');
  });

  it('refuses a cap declaration that is not a cap, and names every fault', async () => {
    /*
     * THE SAME DEFECT ONE LEVEL UP, AND IT SHIPPED. `capLcx: NaN` makes `total > cap.capLcx`
     * false for every total, so the limb becomes arithmetically incapable of failing — the
     * `budget <= budget` shape this whole module exists to replace. Worse,
     * `JSON.stringify(NaN)` is `null`, so the IMMUTABLE warrant recorded `"capLcx":null`
     * beside `"granted":true`: the permanent record of a launch asserting the one state this
     * module says must refuse.
     *
     * A rejected declaration is also NOT an absent one. Falling through to
     * EMISSION_CAP_NOT_DECLARED ("No owner has declared a cap") would be false and would send
     * the owner to declare a cap they had already declared.
     */
    const { pool, audit } = stub({ ...perimeterClear(), inFlight: { total: '0' } });
    const d = await evaluateEmissionWarrant(pool, input({
      cap: { ...cap(Number.NaN) },
    }));

    expect(d.outcome).toBe('refused');
    if (d.outcome !== 'refused') throw new Error('unreachable');
    const codes = d.refusals.map((r) => r.code);
    expect(codes).toContain('EMISSION_CAP_DECLARATION_INVALID');
    // NEGATIVE: the arithmetic must not have run, and the absent-cap sentence must not be
    // used for a declaration that was supplied.
    expect(codes).not.toContain('EMISSION_CAP_EXCEEDED');
    expect(codes).not.toContain('EMISSION_CAP_NOT_DECLARED');
    expect(d.warrant!.granted).toBe(false);

    // The immutable record distinguishes "none was declared" from "one was and it was
    // rejected" — `capLcx: null` cannot carry that, and the warrant cannot be edited later.
    const meta = JSON.parse(String((audit[0]!.params as unknown[])[4])) as Record<string, unknown>;
    expect(meta.capLcx).toBeNull();
    expect(meta.granted).toBe(false);
    expect((meta.capDeclarationFaults as string[]).length).toBeGreaterThan(0);
    expect((meta.capDeclarationFaults as string[]).join(' ')).toContain('NaN');
  });

  it('rejects every shape of non-cap, and reports all of a declaration\'s faults at once', () => {
    /*
     * DIRECT, BECAUSE THE FAULT LIST IS THE THING A HUMAN READS. An owner who fixes one fault,
     * re-runs, and finds the next is an owner who abandons the control — so every fault is
     * named on the first pass.
     */
    expect(capDeclarationFaults(cap(1000))).toEqual([]);
    expect(capDeclarationFaults(cap(0))).toEqual([]);

    // Each of these on its own is a limb that could never fail, or a number nobody owns.
    expect(capDeclarationFaults(cap(Number.NaN)).join(' ')).toContain('not a finite number');
    expect(capDeclarationFaults(cap(Number.POSITIVE_INFINITY)).join(' '))
      .toContain('not a finite number');
    expect(capDeclarationFaults(cap(-1)).join(' ')).toContain('negative envelope');
    expect(capDeclarationFaults({ ...cap(1000), capLcx: '1000' as unknown as number }).join(' '))
      .toContain('not a finite number');

    // Provenance is required by the type AND, now, by the code: `declaredBy: ''` was accepted
    // and the launch was granted, against an interface docblock saying an unattributed number
    // in a compliance gate is a magic constant.
    const unattributed = capDeclarationFaults({
      capLcx: Number.NaN,
      basis: 'per_quarter' as unknown as 'concurrent_in_flight',
      declaredBy: '',
      declaredAt: '   ',
      instrument: '',
    });
    expect(unattributed.length).toBe(5);
    for (const field of ['declaredBy', 'declaredAt', 'instrument']) {
      expect(unattributed.some((f) => f.startsWith(field))).toBe(true);
    }
    // And a date this runtime cannot read means WHEN is unknown.
    expect(capDeclarationFaults({ ...cap(1000), declaredAt: 'last Tuesday' }).join(' '))
      .toContain('not a date this runtime can read');
  });

  it('refuses a negative emission rather than treating it as headroom', async () => {
    /*
     * `dist_campaigns.budget_lcx` IS A BARE `numeric` WITH NO CHECK (0043:39), so this is a
     * value the database will hold. Read as a measurement it satisfies any cap on its own —
     * the same "a gate that cannot fail is not a gate" defect, arriving as data instead of as
     * code. Note the cap here is TINY and the campaign would still clear it.
     */
    const { pool } = stub({
      ...perimeterClear(),
      campaign: { ...defaultCampaign, budget_lcx: '-5000' },
      inFlight: { total: '0' },
    });
    const d = await evaluateEmissionWarrant(pool, input({ cap: cap(1) }));

    expect(d.outcome).toBe('refused');
    if (d.outcome !== 'refused') throw new Error('unreachable');
    expect(d.refusals.map((r) => r.code)).toContain('EMISSION_AMOUNT_NEGATIVE');
    expect(d.warrant!.granted).toBe(false);
    expect(d.warrant!.thisCampaignLcx).toBe(-5000);
  });

  it('refuses when the in-flight aggregate is negative, whatever it does to the sum', async () => {
    /*
     * ONE ROW DEFEATS THE LIMB FOR EVERY LAUNCH AFTER IT. A single approved or live campaign
     * with a negative `budget_lcx` drags `SUM(budget_lcx)` below zero, and this campaign's
     * emission is then added to a negative number — clearing any cap. The refusal is what
     * stops another campaign's data defect from becoming this campaign's clearance.
     */
    const { pool } = stub({
      ...perimeterClear(),
      inFlight: { total: '-1000000', unstated: '0', n: '2' },
    });
    const d = await evaluateEmissionWarrant(pool, input({ cap: cap(1) }));

    expect(d.outcome).toBe('refused');
    if (d.outcome !== 'refused') throw new Error('unreachable');
    const codes = d.refusals.map((r) => r.code);
    expect(codes).toContain('EMISSION_AGGREGATE_NEGATIVE');
    // The arithmetic would have PASSED: -1000000 + 1000 is inside a cap of 1. That is the
    // whole point — the limb is not saved by the comparison, it is saved by the refusal.
    expect(codes).not.toContain('EMISSION_CAP_EXCEEDED');
    expect(d.warrant!.granted).toBe(false);
    // And the remedy names the missing constraint rather than implying the read was wrong.
    expect(d.refusals.find((r) => r.code === 'EMISSION_AGGREGATE_NEGATIVE')!.remedy)
      .toContain('CHECK constraint');
  });

  it('refuses rather than skipping when the campaign register cannot be read', async () => {
    // An unknown trigger condition must never resolve to "the gate does not apply".
    const { pool } = stub({ campaignAbsent: true });
    const d = await evaluateEmissionWarrant(pool, input());
    expect(d.outcome).toBe('refused');
    if (d.outcome !== 'refused') throw new Error('unreachable');
    expect(d.refusals.map((r) => r.code)).toEqual(['EMISSION_CAMPAIGN_REGISTER_ABSENT']);
    expect(d.warrant).toBeNull();
  });

  it('refuses when the trigger condition is neither true nor false', async () => {
    /*
     * THE THIRD STATE, WHICH THE FIRST VERSION DID NOT HAVE. It read
     * `row.token_incentivized === true`, so NULL, the string 'true', and anything a driver
     * shape change produced went down the `not_applicable` branch — and `mayReachStatus`
     * returns TRUE for that, so the wiring `if (!mayReachStatus(w)) throw` would have let a
     * possibly token-incentivised campaign reach approved or live with no warrant and no Art
     * 91(3)(c) check on the launcher. Unknown must never resolve to "the gate does not apply".
     *
     * The union declares `tokenIncentivized: boolean | null`; before this the third member was
     * typed and never produced.
     */
    for (const value of [null, 'true', 1, undefined]) {
      const { pool, audit } = stub({
        ...perimeterClear(),
        campaign: { ...defaultCampaign, token_incentivized: value },
      });
      const d = await evaluateEmissionWarrant(pool, input({ cap: cap(1_000_000) }));

      expect(d.outcome, `token_incentivized = ${JSON.stringify(value)}`).toBe('refused');
      if (d.outcome !== 'refused') throw new Error('unreachable');
      expect(d.refusals.map((r) => r.code)).toEqual(['EMISSION_TRIGGER_NOT_STATED']);
      expect(mayReachStatus(d)).toBe(false);
      // No warrant is minted, because nothing was checked — and nothing is written that a
      // later reader could mistake for a check.
      expect(d.warrant).toBeNull();
      expect(audit).toHaveLength(0);
    }

    // And the literal `false` is still the ONLY value that means "the gate does not apply".
    const { pool } = stub({ campaign: { ...defaultCampaign, token_incentivized: false } });
    expect((await evaluateEmissionWarrant(pool, input())).outcome).toBe('not_applicable');
  });

  it('refuses a campaign that does not exist, as a genuine absence', async () => {
    const { pool } = stub({ campaign: null });
    const d = await evaluateEmissionWarrant(pool, input());
    expect(d.outcome).toBe('refused');
    if (d.outcome !== 'refused') throw new Error('unreachable');
    expect(d.refusals.map((r) => r.code)).toEqual(['EMISSION_CAMPAIGN_NOT_FOUND']);
  });

  it('extracts asset symbols from the campaign text server-side', async () => {
    /*
     * The text is READ FROM THE DATABASE, not supplied by the caller — there is no text
     * field on the input at all — and the symbols are extracted from it by the gate. A
     * campaign whose detail names an embargoed asset is refused whatever the caller says.
     */
    const { pool } = stub({
      campaign: {
        ...defaultCampaign,
        detail: 'Quests unlock ahead of the $SOL listing.',
      },
      embargoRows: [embargo('SOL', 'mnpi_pending'), embargo('LCX', 'clear')],
      holdingsRows: [declaration('SOL', false), declaration('LCX', false)],
    });
    const d = await evaluateEmissionWarrant(pool, input({ cap: cap(1_000_000) }));

    expect(d.outcome).toBe('refused');
    if (d.outcome !== 'refused') throw new Error('unreachable');
    expect(d.refusals.map((r) => r.code)).toContain('EMISSION_TITLE_VI_REFUSED');
    expect(d.warrant!.assetsExtracted).toContain('SOL');
    expect(d.warrant!.gateRefusalCodes).toContain('ART_90_ASSET_UNDER_EMBARGO');
  });

  it('refuses when the Title VI engine itself could not complete', async () => {
    const pool = {
      query: async (sql: string) => {
        if (/to_regclass/.test(sql)) return { rows: [{ ok: true }], rowCount: 1 };
        if (/FROM dist_campaigns WHERE id = \$1/.test(sql)) {
          return { rows: [defaultCampaign], rowCount: 1 };
        }
        if (/COALESCE\(SUM\(budget_lcx\), 0\)/.test(sql)) {
          return { rows: [{ total: '0', unstated: '0', n: '0' }], rowCount: 1 };
        }
        if (/SELECT DISTINCT asset_symbol/.test(sql)) throw new Error('connection reset');
        if (/INSERT INTO audit_log/.test(sql)) return { rows: [{ id: 'a1' }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
    } as unknown as pg.Pool;

    const d = await evaluateEmissionWarrant(pool, input({ cap: cap(1_000_000) }));
    expect(d.outcome).toBe('refused');
    if (d.outcome !== 'refused') throw new Error('unreachable');
    expect(d.refusals.map((r) => r.code)).toContain('EMISSION_TITLE_VI_UNAVAILABLE');
    expect(d.warrant!.gateError).toBe('connection reset');
  });
});

/* ════════ 3. THE WARRANT IS THE LEDGER ROW ════════ */

describe('the warrant is ledgered into audit_log with the digest and the codes', () => {
  it('appends one row carrying the sha256 of the checked text and the refusal codes', async () => {
    const { pool, audit } = stub({ ...perimeterClear(), inFlight: { total: '500' } });
    const d = await evaluateEmissionWarrant(pool, input({ cap: cap(2000) }));

    expect(d.outcome).toBe('granted');
    if (d.outcome !== 'granted') throw new Error('unreachable');
    expect(audit).toHaveLength(1);

    const [actor, action, entity, entityId, metaJson] = audit[0]!.params as string[];
    expect(actor).toBe(LAUNCHER);
    expect(action).toBe(EMISSION_WARRANT_ACTION);
    expect(entity).toBe(EMISSION_WARRANT_ENTITY);
    expect(entityId).toBe(CAMPAIGN);

    const meta = JSON.parse(metaJson) as Record<string, unknown>;
    expect(meta.textSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(meta.textSha256).toBe(d.warrant.textSha256);
    expect(meta.granted).toBe(true);
    expect(meta.refusalCodes).toEqual([]);
    /*
     * The composition travels with the digest: a digest whose composition is unstated cannot
     * be recomputed by anybody checking it later.
     *
     * `toContain` ON THE DETAIL LINE WAS AN EXACT-ELEMENT MATCH AND IT FAILED, correctly. The
     * composition entry no longer reads `dist_campaigns.detail` alone, because the published
     * description is `detail` OR the route's fallback sentence, and an entry naming only the
     * column would describe a composition this module does not use. So the assertion is what
     * the field has to promise: the column is named, and so is what happens when it is NULL.
     */
    const composition = meta.textComposition as string[];
    expect(composition).toContain('dist_campaigns.name');
    expect(composition.some((c) => c.startsWith('dist_campaigns.detail'))).toBe(true);
    expect(composition.join(' ')).toContain(CAMPAIGN_DESCRIPTION_FALLBACK_PREFIX);
    // And NOT the text itself. A warrant is a control record, not a second copy of the
    // campaign copy.
    expect(metaJson).not.toContain('Complete three quests');
  });

  it('ledgers a REFUSED warrant too, with its codes', async () => {
    // "The check ran and refused" is exactly as much a record as "the check cleared it",
    // and a ledger holding only grants cannot tell a refusal from a check that never ran.
    const { pool, audit } = stub(perimeterClear());
    const d = await evaluateEmissionWarrant(pool, input());

    expect(d.outcome).toBe('refused');
    expect(audit).toHaveLength(1);
    const meta = JSON.parse((audit[0]!.params as string[])[4]!) as Record<string, unknown>;
    expect(meta.granted).toBe(false);
    expect(meta.refusalCodes).toContain('EMISSION_CAP_NOT_DECLARED');
  });

  it('refuses when the warrant could not be appended — a warrant nobody can find is none', async () => {
    /*
     * THE OPPOSITE ORDERING FROM `recordGateDecision`, deliberately. There a failed
     * INSERT must not turn a clean refusal into a 500. HERE the ledger row IS the
     * warrant: granting a launch whose warrant was never written produces a live token
     * campaign that no reader can find a warrant for, which is indistinguishable from one
     * that never had a check.
     */
    const { pool } = stub({
      ...perimeterClear(),
      inFlight: { total: '0' },
      auditWriteFails: true,
    });
    const d = await evaluateEmissionWarrant(pool, input({ cap: cap(1_000_000) }));

    expect(d.outcome).toBe('refused');
    if (d.outcome !== 'refused') throw new Error('unreachable');
    expect(d.refusals.map((r) => r.code)).toContain('EMISSION_WARRANT_NOT_LEDGERED');
    expect(d.warrant!.granted).toBe(false);
    expect(d.warrant!.auditRowId).toBeNull();
  });

  it('records whether the audit log was sealed when the warrant was written', async () => {
    // 0070 is pending, so `sealedAtWrite` is false and the warrant says so rather than
    // implying a tamper-evidence it does not have yet.
    const { pool } = stub({ ...perimeterClear(), inFlight: { total: '0' } });
    const d = await evaluateEmissionWarrant(pool, input({ cap: cap(1_000_000) }));
    if (d.outcome !== 'granted') throw new Error('unreachable');
    expect(typeof d.warrant.sealedAtWrite).toBe('boolean');
    expect(d.warrant.sealedAtWrite).toBe(false);
  });

  it('reads the warrant back, and refuses when a campaign has none', async () => {
    const { pool } = stub({ warrantRows: [] });
    const none = await readEmissionWarrants(pool, CAMPAIGN);
    expect(none.ok).toBe(false);
    if (none.ok) throw new Error('unreachable');
    expect(none.code).toBe('WARRANT_ABSENT');
    // A campaign with no warrant is the state it must not be approved or live in, so this
    // is a refusal rather than an empty list.
    expect(none.sentence).toContain('genuine absence');

    const one = await readEmissionWarrants(
      stub({ warrantRows: [{ id: 'a1', meta: { granted: true, textSha256: 'a'.repeat(64) } }] }).pool,
      CAMPAIGN,
    );
    expect(one.ok).toBe(true);
    if (!one.ok) throw new Error('unreachable');
    expect(one.warrants[0]!.auditRowId).toBe('a1');
    expect(one.note).toContain('appended and never edited');
  });

  it('distinguishes an unreadable warrant ledger from a campaign with no warrant', async () => {
    const { pool } = stub({ auditAbsent: true });
    const r = await readEmissionWarrants(pool, CAMPAIGN);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.code).toBe('WARRANT_LEDGER_ABSENT');
  });

  it('only counts a warrant as covering text whose digest matches', async () => {
    // A granted warrant over an earlier draft of the copy is not a warrant over the copy
    // that shipped, and nothing but a digest comparison can tell the two apart.
    const { pool } = stub({ ...perimeterClear(), inFlight: { total: '0' } });
    const d = await evaluateEmissionWarrant(pool, input({ cap: cap(1_000_000) }));
    if (d.outcome !== 'granted') throw new Error('unreachable');

    expect(warrantCoversText(d.warrant, d.warrant.textSha256)).toBe(true);
    expect(warrantCoversText(d.warrant, 'b'.repeat(64))).toBe(false);
    // And a refused warrant covers nothing, whatever the digest says.
    expect(warrantCoversText({ ...d.warrant, granted: false }, d.warrant.textSha256)).toBe(false);
  });
});

/* ════════ 4. THE LAUNCHER'S LCX POSITION ════════ */

describe("the launcher's position in the emission asset is checked on its own limb", () => {
  it('refuses when the launcher holds LCX, whatever the copy says about it', async () => {
    /*
     * THE HOLE THIS CLOSES. `LCX` is on `outboundGate.ts`'s not-a-ticker presumption
     * list, so the text limb extracts it only when the desk has already recorded a row
     * naming it. A token-incentivised campaign emits LCX whether the copy spells it out
     * or not — so the position is resolved here, directly, against the launcher.
     */
    const { pool } = stub({
      embargoRows: [embargo('LCX', 'clear'), embargo('PAYAGENT', 'clear')],
      holdingsRows: [declaration('LCX', true), declaration('PAYAGENT', false)],
      inFlight: { total: '0' },
    });
    const d = await evaluateEmissionWarrant(pool, input({ cap: cap(1_000_000) }));

    expect(d.outcome).toBe('refused');
    if (d.outcome !== 'refused') throw new Error('unreachable');
    expect(d.refusals.map((r) => r.code)).toContain('EMISSION_LAUNCHER_HOLDS_EMISSION_ASSET');
    expect(d.warrant!.launcherPosition).toBe('declared_holding');
    const r = d.refusals.find((x) => x.code === 'EMISSION_LAUNCHER_HOLDS_EMISSION_ASSET')!;
    expect(r.rule).toBe('MiCA Art 91(3)(c)');
    expect(r.ruleText).toContain('PERSONAL');
  });

  it('refuses when the launcher has not declared a position at all', async () => {
    const { pool } = stub({
      embargoRows: [embargo('PAYAGENT', 'clear')],
      holdingsRows: [declaration('PAYAGENT', false)],
      inFlight: { total: '0' },
    });
    const d = await evaluateEmissionWarrant(pool, input({ cap: cap(1_000_000) }));
    if (d.outcome !== 'refused') throw new Error('unreachable');
    expect(d.refusals.map((r) => r.code)).toContain('EMISSION_LAUNCHER_POSITION_UNDECLARED');
    // Silence is not a declaration of no position.
    expect(['not_declared', 'register_absent']).toContain(d.warrant!.launcherPosition);
  });

  it('names LCX as the emission asset from the schema rather than from the copy', () => {
    expect(EMISSION_ASSET).toBe('LCX');
  });
});

/* ════════ 5. NOT APPLICABLE IS NOT GRANTED ════════ */

describe('not applicable is a third outcome and never a grant', () => {
  it('is not applicable for a non-token campaign, and says so without minting a warrant', async () => {
    const { pool, audit } = stub({
      campaign: { ...defaultCampaign, token_incentivized: false },
    });
    const d = await evaluateEmissionWarrant(pool, input());

    expect(d.outcome).toBe('not_applicable');
    if (d.outcome !== 'not_applicable') throw new Error('unreachable');
    expect(d.tokenIncentivized).toBe(false);
    expect(d.why).toContain('token_incentivized is false');
    // Nothing is written, because there is no warrant. A reader asking "which live
    // campaigns hold a warrant" must not be told yes about a campaign nothing checked.
    expect(audit).toHaveLength(0);
    expect(mayReachStatus(d)).toBe(true);
    expect('warrant' in d).toBe(false);
    /*
     * AND IT MUST NOT CLAIM A CONTROL IS RUNNING. This sentence is surfaced to a human, and
     * the first version told them "the Title VI engine over campaign text runs in shadow mode
     * for every campaign (marketing/oneMouth.ts)" — present tense, about a module with no
     * caller anywhere in the repository. A non-token campaign's COPY has met no check at all,
     * and that is what the sentence has to say.
     */
    expect(d.why).toContain('NOT WIRED');
    expect(d.why).toContain('met no check');
    expect(d.why).not.toMatch(/runs (in shadow mode )?for every campaign/);
  });

  it('is telling the truth about the shadow engine not being wired in', () => {
    /*
     * THE SENTENCE ABOVE IS A CLAIM ABOUT THE REPOSITORY, so it is checked against the
     * repository rather than trusted — the same reasoning as the route-parity test.
     *
     * THE DAY SOMEBODY WIRES `observeOneMouth` INTO A SEND OR LAUNCH PATH, THIS FAILS. That is
     * the intended outcome: the disclosure becomes false at that moment, and a governance
     * sentence that has quietly gone stale is worse than no sentence. Update the narrative in
     * `evaluateEmissionWarrant` and this list together.
     */
    const here = dirname(fileURLToPath(import.meta.url));
    const roots = [resolve(here, '..', '..'), resolve(here, '..', '..', '..', '..', 'web', 'src')];
    const callers: string[] = [];
    let scanned = 0;
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === 'dist') continue;
          walk(full);
        } else if (/\.tsx?$/.test(entry.name) && !/oneMouth/.test(entry.name)) {
          scanned += 1;
          if (/\b(observeOneMouth|sweepOneMouth)\s*\(/.test(readFileSync(full, 'utf8'))) {
            callers.push(full);
          }
        }
      }
    };
    for (const root of roots) walk(root);

    // NON-VACUITY FIRST. An empty walk makes the assertion below pass for free, which is the
    // standard way a content ratchet dies quietly (`migrationImmutability.test.ts` opens the
    // same way and for the same reason).
    expect(scanned, 'the source walk read nothing, so it proves nothing').toBeGreaterThan(50);
    expect(
      callers,
      'observeOneMouth/sweepOneMouth now HAS a caller, so the not_applicable narrative in '
      + 'evaluateEmissionWarrant — which tells a human the shadow engine is NOT WIRED into any '
      + 'send or launch path — has become false. Update the sentence, then this assertion.',
    ).toEqual([]);
    const module = readFileSync(resolve(here, '..', 'oneMouth.ts'), 'utf8');
    expect(module).toContain('export async function observeOneMouth');
  });

  it('is not applicable for a status that is not a publication point', async () => {
    const { pool } = stub({});
    const d = await evaluateEmissionWarrant(pool, input({ targetStatus: 'compliance_review' }));
    expect(d.outcome).toBe('not_applicable');
    if (d.outcome !== 'not_applicable') throw new Error('unreachable');
    expect(d.why).toContain('NOT a cleared warrant');
  });

  it('governs both publication points', async () => {
    expect([...WARRANT_REQUIRED_STATUSES]).toEqual(['approved', 'live']);
    for (const status of WARRANT_REQUIRED_STATUSES) {
      const { pool } = stub(perimeterClear());
      const d = await evaluateEmissionWarrant(pool, input({ targetStatus: status }));
      expect(d.outcome, `${status} must be gated`).toBe('refused');
    }
  });
});

/* ════════ 6. THE TEXT THAT IS WARRANTED ════════ */

describe('the warranted text is the campaign name, detail and task labels', () => {
  it('composes them canonically and stably', () => {
    const text = composeCampaignPublicText({ name: 'Quests', detail: 'Do three things.' });
    expect(text.split('\n')).toEqual(['Quests', 'Do three things.', ...CAMPAIGN_TASK_LABELS]);

    // NULL and absent are the same input — both mean "the column states no detail" — so the
    // digest is the same for either.
    expect(composeCampaignPublicText({ name: 'Quests', detail: null }))
      .toBe(composeCampaignPublicText({ name: 'Quests' }));
  });

  it('digests the sentence the export publishes when detail is NULL, not nothing', async () => {
    /*
     * WHAT THE FIRST VERSION DID, AND WHY IT WAS A WARRANT OVER NOTHING. It contributed NO
     * line for a NULL `detail`. The export does not: `routes/distribution.ts` publishes
     * `camp.detail ?? 'PayAgent distribution campaign — ' + name`, which is a REAL sentence a
     * human reads on Galxe or Layer3. So the digest identified bytes nobody publishes, the
     * published description met no check at all, and `warrantCoversText` was false against
     * the actual page for every campaign with no detail.
     *
     * This is the assertion that pins the fallback, and it is a source-parity assertion as
     * well: the sibling test below checks the same prefix is still in the route file.
     */
    const lines = composeCampaignPublicText({ name: 'Quests', detail: null }).split('\n');
    expect(lines[1]).toBe(`${CAMPAIGN_DESCRIPTION_FALLBACK_PREFIX}Quests`);
    expect(lines[1]).not.toBe('');
    expect(campaignPublicDescription({ name: 'Quests', detail: null })).toBe(lines[1]);

    // An EMPTY-STRING detail is a stated empty description and is digested as one: the route
    // uses `??`, not a truthiness test, so '' publishes ''.
    expect(composeCampaignPublicText({ name: 'Quests', detail: '' }).split('\n')[1]).toBe('');

    // And the warrant a campaign with no detail gets covers the text the export would emit.
    const { pool } = stub({
      ...perimeterClear(),
      campaign: { ...defaultCampaign, detail: null },
      inFlight: { total: '0' },
    });
    const d = await evaluateEmissionWarrant(pool, input({ cap: cap(1_000_000) }));
    if (d.outcome !== 'granted') throw new Error(`expected granted, got ${d.outcome}`);
    const published = composeCampaignPublicText({ name: 'PayAgent launch quests', detail: null });
    expect(warrantCoversText(d.warrant, await gateTextSha256(published))).toBe(true);
  });

  it('never edits the text it is about to warrant', async () => {
    /*
     * THE VERBATIM RULE, PINNED. The first version `.trim()`ed `detail`; the export emits
     * `camp.detail` untouched. A digest over tidied-up bytes identifies something else, and
     * the failure is silent — `warrantCoversText` simply returns false forever against a page
     * whose copy has a leading space in the database.
     */
    const padded = '  Complete three quests to earn rewards.\n\n';
    expect(composeCampaignPublicText({ name: 'Quests', detail: padded }).split('\n')[1])
      .toBe('  Complete three quests to earn rewards.');
    expect(campaignPublicDescription({ name: 'Quests', detail: padded })).toBe(padded);

    // The whole composition, byte for byte, against the export's own concatenation order.
    expect(composeCampaignPublicText({ name: ' Quests ', detail: padded }))
      .toBe([' Quests ', padded, ...CAMPAIGN_TASK_LABELS].join('\n'));

    // And the digest on the warrant is over exactly those bytes.
    const { pool } = stub({
      ...perimeterClear(),
      campaign: { ...defaultCampaign, name: ' Quests ', detail: padded },
      inFlight: { total: '0' },
    });
    const d = await evaluateEmissionWarrant(pool, input({ cap: cap(1_000_000) }));
    if (d.outcome !== 'granted') throw new Error(`expected granted, got ${d.outcome}`);
    expect(d.warrant.textSha256).toBe(
      await gateTextSha256(composeCampaignPublicText({ name: ' Quests ', detail: padded })),
    );
  });

  it('keeps the mirrored task labels honest against the route that publishes them', () => {
    /*
     * `routes/distribution.ts` builds the export spec's task labels inline inside the
     * handler, so there is nothing exported to import and that file is another lane's.
     * A silent drift would mean the warrant covers text the platform never saw — so the
     * copy is checked against the source instead of trusted.
     */
    const here = dirname(fileURLToPath(import.meta.url));
    const route = readFileSync(resolve(here, '..', '..', 'routes', 'distribution.ts'), 'utf8');
    expect(route).toContain('keyless-export');
    /*
     * THE FALLBACK IS MIRRORED TOO, AND THIS IS THE ASSERTION THE DOCBLOCK PROMISED. The file
     * docblock claims "both the fallback and the verbatim rule are pinned by the source-parity
     * test below"; before this line only the task labels were checked, so the sentence the
     * export publishes for a NULL detail could have been reworded in the route and every
     * warrant afterwards would have digested a sentence the platform no longer emits.
     */
    expect(
      route,
      'routes/distribution.ts no longer publishes the description fallback '
      + `"${CAMPAIGN_DESCRIPTION_FALLBACK_PREFIX}<name>". CAMPAIGN_DESCRIPTION_FALLBACK_PREFIX `
      + 'mirrors it; update it, and note that every warrant minted before the change covers a '
      + 'different composition.',
    ).toContain(CAMPAIGN_DESCRIPTION_FALLBACK_PREFIX);
    // The route reaches the fallback with `??`, so an empty-string detail publishes empty.
    // A truthiness test there would change what every warrant is over.
    expect(route).toContain(`camp.detail ?? \`${CAMPAIGN_DESCRIPTION_FALLBACK_PREFIX}`);
    for (const label of CAMPAIGN_TASK_LABELS) {
      expect(
        route,
        `the export spec in routes/distribution.ts no longer contains the task label `
        + `"${label}". CAMPAIGN_TASK_LABELS is a mirror of that list; update it, and note that `
        + 'every warrant minted before the change covers a different composition.',
      ).toContain(label);
    }
  });
});
