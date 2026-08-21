import { beforeEach, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { buildFounderPackets } from '@lcx/shared';

/**
 * THE APPLY STEP, UNIT BY UNIT. The route's tests mock this module; these hold the real one
 * against a fake pool that records every (sql, params) pair and THROWS on SQL it does not
 * recognise — an interpolated value or an unexpected statement fails loudly here rather
 * than in production. `enterPosition` is mocked: the perimeter write path has its own tests;
 * what THIS file owns is that the packet walks every row through that one path, counts
 * honestly, and never lets a row failure erase the decision.
 */

const enterPosition = vi.hoisted(() => vi.fn());
vi.mock('../conflict.js', () => ({ enterPosition }));

const { applyProposal, addMonthsIso } = await import('../packets.js');

const PACKETS = buildFounderPackets('2026-08-21T12:00:00.000Z');
const proposalOf = (k: string) => PACKETS.find((p) => p.kind === k)!.proposal;

interface Recorded { sql: string; params: unknown[] }

function fakePool(opts: { priceBand?: boolean; effortTriple?: boolean } = {}) {
  const recorded: Recorded[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      recorded.push({ sql, params });
      if (sql.includes("to_regclass('gps_price_band')")) {
        return { rows: [{ rel: opts.priceBand === false ? null : 'gps_price_band' }] };
      }
      if (sql.includes("to_regclass('gps_effort_triple')")) {
        return { rows: [{ rel: opts.effortTriple === false ? null : 'gps_effort_triple' }] };
      }
      if (sql.includes('INSERT INTO gps_price_band') || sql.includes('INSERT INTO gps_effort_triple')) {
        return { rows: [] };
      }
      throw new Error(`unexpected SQL reached the fake pool: ${sql.slice(0, 60)}`);
    },
  } as unknown as pg.Pool;
  return { pool, recorded };
}

beforeEach(() => {
  enterPosition.mockReset();
  enterPosition.mockResolvedValue({ ok: true, position: {} });
});

describe('price bands and effort triples — parameterised upserts, attributed to the decider', () => {
  it('writes five band rows with the decider as stated_by, never a body value', async () => {
    const { pool, recorded } = fakePool();
    const out = await applyProposal(pool, proposalOf('price_bands'), 'nik', '2026-08-21T13:00:00.000Z');
    expect(out.state).toBe('applied');
    const inserts = recorded.filter((r) => r.sql.includes('INSERT INTO gps_price_band'));
    expect(inserts).toHaveLength(5);
    for (const i of inserts) {
      expect(i.params[5]).toBe('nik');
      // Parameterised, not interpolated: the values live in params, and none appear in the SQL.
      expect(i.sql).not.toMatch(/\d{5,}/);
    }
  });

  it('reports apply_failed with the migration named when the register is missing', async () => {
    const { pool } = fakePool({ priceBand: false });
    const out = await applyProposal(pool, proposalOf('price_bands'), 'nik', '2026-08-21T13:00:00.000Z');
    expect(out.state).toBe('apply_failed');
    expect(out.detail).toMatch(/0076_gps_packets\.sql/);
  });

  it('writes five triples and says what changes: underwriting leaves basis:prior', async () => {
    const { pool, recorded } = fakePool();
    const out = await applyProposal(pool, proposalOf('effort_triples'), 'nik', '2026-08-21T13:00:00.000Z');
    expect(out.state).toBe('applied');
    expect(recorded.filter((r) => r.sql.includes('INSERT INTO gps_effort_triple'))).toHaveLength(5);
    expect(out.detail).toMatch(/basis:prior/);
  });
});

describe('the perimeter seed — one path, honest counts, expiry from the decision instant', () => {
  it('walks all 30 rows through enterPosition with supersede FALSE', async () => {
    const { pool } = fakePool();
    const out = await applyProposal(pool, proposalOf('perimeter_seed'), 'nik', '2026-08-21T13:00:00.000Z');
    expect(out.state).toBe('applied');
    expect(enterPosition).toHaveBeenCalledTimes(30);
    for (const call of enterPosition.mock.calls) {
      /* supersede:false is the packet's humility: it must never silently overwrite a
         position a human entered by hand. */
      expect(call[1].supersede).toBe(false);
      expect(call[1].enteredBy).toBe('nik');
      // Expiry derives from the DECISION instant + 6 months, not from the build instant.
      expect(call[1].reviewBy).toBe('2027-02-21T13:00:00.000Z');
    }
  });

  it('counts hand-entered conflicts separately from failures, and neither erases the rest', async () => {
    enterPosition
      .mockResolvedValueOnce({ ok: false, existing: {} }) // row 1: already hand-entered
      .mockRejectedValueOnce(new Error('deadlock'));      // row 2: genuine failure
    const { pool } = fakePool();
    const out = await applyProposal(pool, proposalOf('perimeter_seed'), 'nik', '2026-08-21T13:00:00.000Z');
    expect(out.state).toBe('apply_failed'); // failures demand a retry —
    expect(out.detail).toMatch(/28 position\(s\) entered/); // — but 28 rows still landed,
    expect(out.detail).toMatch(/1 pair\(s\) already had a hand-entered position/); // conflict ≠ failure,
    expect(out.detail).toMatch(/1 row\(s\) FAILED/); // and the failure is named, not averaged away.
  });

  it('states the second-human dependency in the outcome itself', async () => {
    const { pool } = fakePool();
    const out = await applyProposal(pool, proposalOf('perimeter_seed'), 'nik', '2026-08-21T13:00:00.000Z');
    expect(out.detail).toMatch(/SECOND human/);
    expect(out.detail).toMatch(/Prohibitions block immediately/);
  });
});

describe('the two recorded-only packets say so, by design', () => {
  it('rate cards: nothing written, the named-partner dependency stated', async () => {
    const { pool, recorded } = fakePool();
    const out = await applyProposal(pool, proposalOf('rate_cards'), 'nik', '2026-08-21T13:00:00.000Z');
    expect(out.state).toBe('recorded_only');
    expect(out.detail).toMatch(/NAMED partner/);
    expect(recorded.filter((r) => r.sql.includes('INSERT'))).toHaveLength(0);
  });

  it('dpo memo: the chosen option travels in the detail, G4 named as the reader', async () => {
    const { pool } = fakePool();
    const out = await applyProposal(pool, proposalOf('dpo_memo'), 'nik', '2026-08-21T13:00:00.000Z');
    expect(out.state).toBe('recorded_only');
    expect(out.detail).toMatch(/G4 reads this decision/);
  });
});

describe('addMonthsIso', () => {
  it('adds months in UTC with natural end-of-month rollover', () => {
    expect(addMonthsIso('2026-08-21T13:00:00.000Z', 6)).toBe('2027-02-21T13:00:00.000Z');
    // Jan 31 + 1 month rolls into March in UTC — deterministic, documented, fine for an expiry.
    expect(addMonthsIso('2026-01-31T00:00:00.000Z', 1)).toBe('2026-03-03T00:00:00.000Z');
  });
});
