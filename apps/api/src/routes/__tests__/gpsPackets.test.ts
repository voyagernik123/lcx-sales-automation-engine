import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { buildFounderPackets, PACKET_KINDS } from '@lcx/shared';
import type { AuthVariables } from '../../middleware/auth.js';

/**
 * THE FOUNDER-PACKET ROUTE, AT ITS BOUNDARY.
 *
 * The service (`gps/packets.ts`) is mocked here and unit-tested separately against a fake
 * pool — this file is about the ROUTE's promises: who may decide, what a decision must look
 * like, the approved-means-unedited rule, and the three register states never collapsing.
 *
 * The one cross-file pin that matters most sits at the bottom: the migration's price-band
 * section must be BYTE-IDENTICAL to the DDL the input desk has been promising in its refusal
 * since it shipped. Two copies of a promise drift; this assertion is what makes them one.
 */

const applyProposal = vi.hoisted(() => vi.fn());
const isPacketRegisterPresent = vi.hoisted(() => vi.fn());
const loadStandingDecisions = vi.hoisted(() => vi.fn());
const queries = vi.hoisted(() => [] as Array<{ sql: string; params: unknown[] }>);

vi.mock('../../gps/packets.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../gps/packets.js')>();
  return {
    ...real,
    applyProposal,
    isPacketRegisterPresent,
    loadStandingDecisions,
  };
});

vi.mock('../../db/index.js', () => ({
  getPool: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return { rows: [] };
    },
  }),
}));

vi.mock('../../lib/env.js', () => ({ env: { version: 'test' } }));

const { gpsPacketsRoutes } = await import('../gpsPackets.js');

function appAs(role: 'operator' | 'approver' | null) {
  const app = new Hono<{ Variables: AuthVariables }>();
  app.use('*', async (c, next) => {
    if (role) c.set('operator', { id: 'nik', name: 'Nik', email: 'nik@lcx.com', role } as never);
    await next();
  });
  app.route('/packets', gpsPacketsRoutes);
  return app;
}

const PACKETS = buildFounderPackets('2026-08-21T12:00:00.000Z');
const bandsProposal = PACKETS.find((p) => p.kind === 'price_bands')!.proposal;

beforeEach(() => {
  applyProposal.mockReset();
  isPacketRegisterPresent.mockReset();
  loadStandingDecisions.mockReset();
  queries.length = 0;
  isPacketRegisterPresent.mockResolvedValue(true);
  loadStandingDecisions.mockResolvedValue([]);
  applyProposal.mockResolvedValue({ state: 'applied', detail: '5 rows written.' });
});

describe('GET /packets — the five, plus the standing decisions', () => {
  it('returns all five packets and reports the register honestly when present', async () => {
    const res = await appAs('operator').request('/packets');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.packets.map((p: { kind: string }) => p.kind).sort()).toEqual([...PACKET_KINDS].sort());
    expect(body.data.registerPresent).toBe(true);
    expect(body.data.registerNotice).toBeNull();
  });

  it('register ABSENT and register UNPROBEABLE are different sentences, never collapsed', async () => {
    isPacketRegisterPresent.mockResolvedValue(false);
    let body = await (await appAs('operator').request('/packets')).json();
    expect(body.data.registerPresent).toBe(false);
    expect(body.data.registerNotice).toMatch(/0076_gps_packets\.sql/);

    isPacketRegisterPresent.mockResolvedValue(null);
    body = await (await appAs('operator').request('/packets')).json();
    expect(body.data.registerPresent).toBeNull();
    /* The trap this guards: a probe failure reading as "no decisions exist" would show every
       packet as undecided to an owner who already decided them. */
    expect(body.data.registerNotice).toMatch(/could not be probed|Retry/i);
  });
});

describe('POST /packets/:kind/decide — who, and with what', () => {
  it('refuses a plain operator with 403 — deciding is approver authority', async () => {
    const res = await appAs('operator').request('/packets/price_bands/decide', {
      method: 'POST',
      body: JSON.stringify({ decision: 'approved', proposal: bandsProposal }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('FORBIDDEN_REQUIRES_APPROVER');
    expect(applyProposal).not.toHaveBeenCalled();
  });

  it('refuses an unknown packet kind, naming the five', async () => {
    const res = await appAs('approver').request('/packets/price_list/decide', {
      method: 'POST', body: JSON.stringify({ decision: 'approved' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('PACKET_UNKNOWN');
  });

  it('refuses silent edits: "approved" with a changed proposal is PACKET_EDITS_UNDECLARED', async () => {
    /*
     * The rule this route exists to enforce. An approval that quietly carried edits would
     * record the owner as having approved something he never saw — the difference between
     * "approved" and "approved_with_edits" is the difference between his numbers and mine.
     */
    const edited = JSON.parse(JSON.stringify(bandsProposal));
    edited.rows[0].midCents += 100_000;
    const res = await appAs('approver').request('/packets/price_bands/decide', {
      method: 'POST',
      body: JSON.stringify({ decision: 'approved', proposal: edited }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('PACKET_EDITS_UNDECLARED');
    expect(applyProposal).not.toHaveBeenCalled();
  });

  it('accepts "approved" when the proposal round-trips with reordered keys — order is noise', async () => {
    /* A real reorder: same values, reversed key insertion at every depth. (The first draft
       used JSON.stringify's array-replacer, which FILTERS keys rather than ordering them —
       the test then exercised a mutilated proposal and called the route wrong for refusing.) */
    const reorder = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(reorder);
      if (v && typeof v === 'object') {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(v as object).sort().reverse()) {
          out[k] = reorder((v as Record<string, unknown>)[k]);
        }
        return out;
      }
      return v;
    };
    const reordered = reorder(bandsProposal);
    const res = await appAs('approver').request('/packets/price_bands/decide', {
      method: 'POST',
      body: JSON.stringify({ decision: 'approved', proposal: reordered }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect(applyProposal).toHaveBeenCalledTimes(1);
  });

  it('holds the owner’s edits to the SAME defect predicate the builder passed', async () => {
    const edited = JSON.parse(JSON.stringify(bandsProposal));
    edited.rows[0].lowCents = edited.rows[0].highCents + 1; // descending band
    const res = await appAs('approver').request('/packets/price_bands/decide', {
      method: 'POST',
      body: JSON.stringify({ decision: 'approved_with_edits', proposal: edited }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('PACKET_PROPOSAL_DEFECTIVE');
    expect(body.data.defects.join(' ')).toMatch(/ascend/);
    expect(applyProposal).not.toHaveBeenCalled();
  });

  it('records the decision row AFTER apply, with the apply outcome in it', async () => {
    applyProposal.mockResolvedValue({ state: 'applied', detail: '5 price band(s) written.' });
    const res = await appAs('approver').request('/packets/price_bands/decide', {
      method: 'POST',
      body: JSON.stringify({ decision: 'approved', proposal: bandsProposal, notes: 'looks right' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const insert = queries.find((q) => q.sql.includes('INSERT INTO gps_packet_decision'));
    expect(insert, 'the decision must be recorded').toBeTruthy();
    expect(insert!.params[0]).toBe('price_bands');
    expect(insert!.params[1]).toBe('approved');
    expect(insert!.params[3]).toBe('applied');
    expect(insert!.params[5]).toBe('nik'); // attribution from the session, never the body
    const body = await res.json();
    expect(body.data.applyState).toBe('applied');
  });

  it('a rejection is recorded and applies NOTHING', async () => {
    const res = await appAs('approver').request('/packets/dpo_memo/decide', {
      method: 'POST',
      body: JSON.stringify({ decision: 'rejected', notes: 'not yet' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect(applyProposal).not.toHaveBeenCalled();
    const insert = queries.find((q) => q.sql.includes('INSERT INTO gps_packet_decision'));
    expect(insert!.params[1]).toBe('rejected');
    expect(insert!.params[3]).toBe('recorded_only');
  });

  it('refuses to decide when the register is absent — 503 with the migration named', async () => {
    isPacketRegisterPresent.mockResolvedValue(false);
    const res = await appAs('approver').request('/packets/price_bands/decide', {
      method: 'POST',
      body: JSON.stringify({ decision: 'approved', proposal: bandsProposal }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('PACKET_REGISTER_ABSENT');
    expect(applyProposal).not.toHaveBeenCalled();
  });
});

describe('the migration keeps the input desk’s promise, byte for byte', () => {
  it('0076 embeds PRICE_BAND_REGISTER_DDL verbatim between its markers', async () => {
    /*
     * gpsInputs.ts has refused every band write with "paste this DDL, then land this same
     * text as the next free numbered file". 0076 is that file. If either side is edited
     * alone, this is the assertion that notices — the promise and the migration are one
     * text or they are two lies.
     */
    const { PRICE_BAND_REGISTER_DDL } = await import('../gpsInputs.js');
    const here = dirname(fileURLToPath(import.meta.url));
    const migration = readFileSync(
      resolve(here, '..', '..', 'db', 'migrations', '0076_gps_packets.sql'),
      'utf8',
    );
    expect(migration).toContain(PRICE_BAND_REGISTER_DDL.trim());
  });
});
