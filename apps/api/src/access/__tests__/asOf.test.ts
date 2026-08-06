import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_DB, describeDb } from '../../test/db.js';
import {
  ENTITLEMENT_AS_OF_CODES,
  entitlementLedgerBoundary,
  entitlementsAsOf,
  isLedgerAppendOnlyRefusal,
  recordRevocation,
} from '../asOf.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  "WHO COULD SEE THIS ON DATE D" WAS UNANSWERABLE, AND THE REASON WAS THAT
 *  REVOKING DELETED THE EVIDENCE.
 * ══════════════════════════════════════════════════════════════════════════════
 *  `entitlements` (0042) holds one row per (member, workspace) and nothing else
 *  recorded a grant. `actions/registry.ts` revoke ran
 *  `DELETE FROM entitlements WHERE member_id=$1 AND workspace=$2`, so the act of
 *  revoking destroyed the grant history. A regulator asking who could read `gps` on
 *  12 July got nothing — and, worse, nothing that could be told apart from "nobody
 *  could".
 *
 *  THE TESTS THAT MATTER HERE ARE THE REFUSALS. It is easy to write a replay that
 *  returns `[]` for every date it cannot see and looks like it works. That empty
 *  array is a CLAIM — "they held nothing" — and it is the one answer the record
 *  does not support. So the assertions below are as much about what is NOT returned
 *  as about what is:
 *
 *    · before the record begins            → unknowable, boundary named, NO holdings
 *    · inside the reconstruction-only gap  → unknowable, its own code
 *    · at a knowable instant with nobody   → known + genuinelyEmpty, which is a
 *                                            different answer and must stay one
 *    · with 0071 unapplied                 → ledger_absent, not an empty history
 *
 *  And the live-behaviour half: `recordRevocation` must revoke EXACTLY as the old
 *  DELETE did (the row leaves `entitlements`, which is what `loadEntitlements`
 *  reads and what cron depends on) while the history survives.
 *
 *  OWN SCHEMA. `entitlements` in the live database is the real access roster and
 *  this suite installs triggers; it must not go near it.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION_0071 = readFileSync(
  resolve(HERE, '..', '..', 'db', 'migrations', '0071_grant_ledger.sql'),
  'utf8',
);

/** 0042's entitlements table, in shape, so 0071 is applied to the real thing. */
const ENTITLEMENTS_DDL = `
  CREATE TABLE entitlements (
    member_id     text NOT NULL,
    workspace     text NOT NULL,
    capability    text NOT NULL CHECK (capability IN ('view', 'operate', 'approve')),
    granted_by    text NOT NULL,
    justification text,
    granted_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (member_id, workspace)
  );`;

/** 0042's no-lockout backfill, dated in the past — the genesis the replay must reach. */
const GENESIS_AT = '2026-07-24T09:00:00Z';

const LEDGERED = `p5_asof_${process.pid}`;
const NO_LEDGER = `p5_noledger_${process.pid}`;
/** 0071 applied to a database whose `entitlements` table is EMPTY. See the last suite. */
const NO_GRANTS = `p5_nogrants_${process.pid}`;

let admin: pg.Pool | undefined;
let led: pg.Pool | undefined;
let bare: pg.Pool | undefined;
let noGrants: pg.Pool | undefined;

/**
 * `publicFallback: false` IS LOAD-BEARING, and CI is what proved it.
 *
 * These suites fabricate three databases in three schemas to test three states of
 * migration 0071. The bare one asserts the LEDGER-ABSENT branch — a revocation that
 * takes effect while its history cannot be written. That branch is detected by
 * `recordRevocation` catching 42P01 (undefined_table) from its INSERT, so the branch
 * is only reachable if `entitlement_events` resolves to NOTHING.
 *
 * With `search_path=<schema>,public` it resolved to something. This suite passed on a
 * laptop whose database has never had 0071 applied, and failed in CI, where the
 * workflow runs `npm run migrate` first and `public.entitlement_events` therefore
 * exists. The INSERT then succeeded through the public fallback — so the test was not
 * merely asserting the wrong value, it was WRITING TEST REVOCATION EVENTS INTO THE
 * REAL LEDGER TABLE, which is append-only and cannot be cleaned up afterwards.
 *
 * The absence has to be real, not arranged by naming. The bare pool therefore drops
 * the public fallback entirely; nothing on this path needs it — `entitlements` is
 * created in the scoped schema below, and every type and function it uses
 * (text, timestamptz, now()) lives in pg_catalog, which is always in scope.
 *
 * The other two pools keep the fallback: each creates its OWN `entitlement_events`
 * in its own schema, which precedes public in the search path and so wins.
 */
const scopedPool = (schema: string, publicFallback = true) =>
  new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${publicFallback ? `${schema},public` : schema}`,
    max: 3,
  });

/** Instants captured as the timeline is built, so the replay has real dates to hit. */
const t: Record<string, string> = {};

/**
 * The occurred_at of the newest event, AT FULL MICROSECOND PRECISION.
 *
 * Deliberately NOT a `Date`. `occurred_at` is a timestamptz with microseconds and a
 * JavaScript Date holds milliseconds, so round-tripping the instant through one
 * truncates it DOWNWARD — and `occurred_at <= at` then excludes the very event the
 * instant came from. The first draft of this file did exactly that and three
 * assertions failed for a reason that had nothing to do with the replay. Keeping the
 * string is also what proves `AsOfQuery.at` accepts one.
 */
async function newestEventAt(pool: pg.Pool): Promise<string> {
  const { rows } = await pool.query<{ at: string }>(
    `SELECT to_char(max(occurred_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at
       FROM entitlement_events`,
  );
  return rows[0]!.at;
}

beforeAll(async () => {
  if (!HAS_DB) return;
  admin = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  for (const s of [LEDGERED, NO_LEDGER, NO_GRANTS]) {
    await admin.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
    await admin.query(`CREATE SCHEMA ${s}`);
  }
  led = scopedPool(LEDGERED);
  // No public fallback: the ledger's absence must be real. See scopedPool's note.
  bare = scopedPool(NO_LEDGER, false);
  noGrants = scopedPool(NO_GRANTS);

  await led.query(ENTITLEMENTS_DDL);
  await bare.query(ENTITLEMENTS_DDL);
  // 0071 on an empty entitlements table: no reconstruction exists at all, which is
  // the case that made the two boundaries one.
  await noGrants.query(ENTITLEMENTS_DDL);
  await noGrants.query(MIGRATION_0071);

  // The 0042-era picture, BEFORE 0071 exists — exactly the situation the
  // reconstruction has to cope with: rows with historical granted_at and no events.
  for (const [member, cap] of [
    ['nik', 'approve'],
    ['sam', 'operate'],
  ] as const) {
    for (const ws of ['governance', 'gps'] as const) {
      await led.query(
        `INSERT INTO entitlements (member_id, workspace, capability, granted_by, justification, granted_at)
         VALUES ($1,$2,$3,'backfill-0042','Phase-1 no-lockout covenant',$4::timestamptz)`,
        [member, ws, cap, GENESIS_AT],
      );
    }
  }
  await bare.query(
    `INSERT INTO entitlements (member_id, workspace, capability, granted_by)
     VALUES ('sam','gps','operate','nik')`,
  );

  await led.query(MIGRATION_0071);

  /*
   * THE TIMELINE, built through the real write paths so the triggers are what is
   * under test rather than a hand-seeded events table.
   *
   * Each step is its own statement and therefore its own transaction, so `now()`
   * differs between them — which is what makes "as of T1" and "as of T2" different
   * questions at all.
   */
  await led.query(
    `INSERT INTO entitlements (member_id, workspace, capability, granted_by, justification)
     VALUES ('monty','marketing','view','nik','reads the desk')`,
  );
  t.granted = await newestEventAt(led);

  await led.query(
    `INSERT INTO entitlements (member_id, workspace, capability, granted_by, justification)
     VALUES ('monty','marketing','operate','nik','runs the desk now')
     ON CONFLICT (member_id, workspace)
     DO UPDATE SET capability=EXCLUDED.capability, granted_by=EXCLUDED.granted_by,
                   justification=EXCLUDED.justification, granted_at=now()`,
  );
  t.upgraded = await newestEventAt(led);

  await recordRevocation(led, {
    memberId: 'monty',
    workspace: 'marketing',
    actor: 'nik',
    justification: 'left the desk',
  });
  t.revoked = await newestEventAt(led);
});

afterAll(async () => {
  await led?.end();
  await bare?.end();
  await noGrants?.end();
  if (admin) {
    for (const s of [LEDGERED, NO_LEDGER, NO_GRANTS]) {
      await admin.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
    }
    await admin.end();
  }
});

describeDb('the replay refuses rather than interpolating', () => {
  it('reports LEDGER ABSENT where 0071 has not been applied', async () => {
    // Not an empty history. `entitlements` in that database still holds a live
    // grant, so "nobody held anything" would be false on its face.
    const r = await entitlementsAsOf(bare!, { at: new Date() });
    expect(r.kind).toBe('ledger_absent');
    if (r.kind === 'ledger_absent') {
      expect(r.code).toBe(ENTITLEMENT_AS_OF_CODES.LEDGER_ABSENT);
      expect(r.message).toMatch(/absence of a record, not a record of nothing/);
    }
    // And it has no `holdings` key at all, so no caller can read one off it.
    expect(Object.prototype.hasOwnProperty.call(r, 'holdings')).toBe(false);
  });

  it('names the 0042 genesis and refuses anything before it', async () => {
    const boundary = await entitlementLedgerBoundary(led!);
    expect(boundary).not.toBeNull();
    expect(boundary!.earliestReconstructedAt).toBe(new Date(GENESIS_AT).toISOString());
    expect(boundary!.reconstructedEvents).toBe(4);

    const r = await entitlementsAsOf(led!, { at: new Date('2026-07-01T00:00:00Z') });
    expect(r.kind).toBe('unknowable');
    if (r.kind !== 'unknowable') return;
    expect(r.code).toBe(ENTITLEMENT_AS_OF_CODES.BEFORE_RECORD);
    expect(r.message).toContain(new Date(GENESIS_AT).toISOString());
    expect(r.message).toMatch(/UNKNOWABLE — not empty/);
    expect(Object.prototype.hasOwnProperty.call(r, 'holdings')).toBe(false);
  });

  it('refuses the reconstruction-only window under its OWN code, and says why both directions are wrong', async () => {
    // Between the 0042 genesis and the ledger floor the only record is surviving
    // grants: revocations left no trace (over-reports) and already-revoked grants
    // are gone (under-reports). A caveated answer would be carried forward as an
    // answer, so it refuses.
    const boundary = (await entitlementLedgerBoundary(led!))!;
    const inGap = new Date(new Date(boundary.ledgerFloor).getTime() - 60_000);
    const r = await entitlementsAsOf(led!, { at: inGap });
    expect(r.kind).toBe('unknowable');
    if (r.kind !== 'unknowable') return;
    expect(r.code).toBe(ENTITLEMENT_AS_OF_CODES.RECONSTRUCTED_ONLY);
    expect(r.code).not.toBe(ENTITLEMENT_AS_OF_CODES.BEFORE_RECORD);
    expect(r.message).toMatch(/UNDER-reports/);
    expect(r.message).toMatch(/OVER-reports/);
    expect(r.boundary.ledgerFloor).toBe(boundary.ledgerFloor);
  });

  it('answers KNOWN + genuinelyEmpty when the replay ran and found nobody', async () => {
    // The third state. Distinct from unknowable and from ledger-absent, and the
    // only one of the three that legitimately means "they held nothing".
    //
    // A REAL COMPARTMENT nobody in this fixture holds — `regulatory` is in
    // WORKSPACE_IDS. The first draft asked about 'a-compartment-nobody-holds' and got
    // the same answer, which was the defect: a typo and a real empty compartment were
    // one state. See the UNKNOWN_SCOPE test below for the other half.
    const r = await entitlementsAsOf(led!, { at: new Date(), workspace: 'regulatory' });
    expect(r.kind).toBe('known');
    if (r.kind !== 'known') return;
    expect(r.holdings).toEqual([]);
    expect(r.genuinelyEmpty).toBe(true);
    expect(r.eventsReplayed).toBe(0);
  });
});

describeDb('the instant asked about is parsed by ONE parser, and it is Postgres', () => {
  /*
   * WHAT WENT WRONG. The boundary comparisons ran in JavaScript
   * (`new Date(q.at) < genesis`) while the replay query used Postgres' own, far
   * wider, timestamptz parser. For any string Postgres accepts and V8 does not,
   * `new Date()` yields NaN, EVERY NaN comparison is false, so both refusals were
   * skipped and the function answered — for instants it declares unanswerable.
   *
   * The comment justifying the design said `new Date()` "truncates DOWNWARD, which
   * for a boundary test errs toward REFUSING". Truncation is not the dominant
   * failure; NaN is, and NaN errs toward ANSWERING. Every case below was a live
   * wrong answer, measured, before this fix.
   */
  it('refuses -infinity instead of answering "they held nothing"', async () => {
    // Previously: kind='known', holdings=[], genuinelyEmpty=true. An empty holder set
    // for no moment at all — the exact claim asOf.ts:24-27 forbids.
    const r = await entitlementsAsOf(led!, { at: '-infinity', workspace: 'gps' });
    expect(r.kind).toBe('unanswerable');
    if (r.kind !== 'unanswerable') return;
    expect(r.code).toBe(ENTITLEMENT_AS_OF_CODES.NOT_AN_INSTANT);
    expect(Object.prototype.hasOwnProperty.call(r, 'holdings')).toBe(false);
    expect(r.unresolved.map((u) => u.field)).toEqual(['at']);
  });

  it('refuses infinity as well — the same non-instant from the other side', async () => {
    const r = await entitlementsAsOf(led!, { at: 'infinity', workspace: 'gps' });
    expect(r.kind).toBe('unanswerable');
    if (r.kind !== 'unanswerable') return;
    expect(r.code).toBe(ENTITLEMENT_AS_OF_CODES.NOT_AN_INSTANT);
  });

  it('sends epoch and a BC date to BEFORE_RECORD, where they belong', async () => {
    // Both are finite instants Postgres reads and V8 does not. Previously both
    // returned known/genuinelyEmpty; both are simply very early.
    for (const at of ['epoch', '4713-01-01 BC']) {
      const r = await entitlementsAsOf(led!, { at, workspace: 'gps' });
      expect(r.kind, `at=${at}`).toBe('unknowable');
      if (r.kind !== 'unknowable') continue;
      expect(r.code, `at=${at}`).toBe(ENTITLEMENT_AS_OF_CODES.BEFORE_RECORD);
      expect(Object.prototype.hasOwnProperty.call(r, 'holdings')).toBe(false);
    }
  });

  it('does not hand out a POSITIVE holder claim for "yesterday"', async () => {
    /*
     * THE WORST OF THEM. `at: 'yesterday'` returned kind='known' with ONE holding —
     * an affirmative statement about who held a compartment yesterday, for an instant
     * inside the reconstruction-only window, laundered out of a photograph of the rows
     * that happened to survive.
     *
     * Yesterday is below the ledger floor in this fixture (0071 was applied during
     * this run), so the honest answer is the reconstruction-only refusal.
     */
    const r = await entitlementsAsOf(led!, { at: 'yesterday', workspace: 'gps' });
    expect(r.kind).toBe('unknowable');
    if (r.kind !== 'unknowable') return;
    expect(r.code).toBe(ENTITLEMENT_AS_OF_CODES.RECONSTRUCTED_ONLY);
    expect(Object.prototype.hasOwnProperty.call(r, 'holdings')).toBe(false);
    // And the answer says what Postgres understood by it, because "yesterday" names
    // no instant on its own.
    expect(r.atResolved).toMatch(/^\d{4}-\d{2}-\d{2} /);
  });

  it('refuses an unreadable instant under a code instead of throwing 22007', async () => {
    for (const at of ['', 'not-a-date']) {
      const r = await entitlementsAsOf(led!, { at, workspace: 'gps' });
      expect(r.kind, `at="${at}"`).toBe('unanswerable');
      if (r.kind !== 'unanswerable') continue;
      expect(r.code, `at="${at}"`).toBe(ENTITLEMENT_AS_OF_CODES.UNPARSEABLE_INSTANT);
      expect(r.message).toMatch(/not an instant this database can read/);
    }
  });

  it('refuses an Invalid Date instead of throwing "Invalid time value"', async () => {
    const r = await entitlementsAsOf(led!, { at: new Date(Number.NaN), workspace: 'gps' });
    expect(r.kind).toBe('unanswerable');
    if (r.kind !== 'unanswerable') return;
    expect(r.code).toBe(ENTITLEMENT_AS_OF_CODES.NOT_AN_INSTANT);
  });

  it('still answers the control case the same way — the refusals are not blanket', async () => {
    // Non-vacuity. A parser change that refused everything would pass every test
    // above and be far worse than the bug.
    const r = await entitlementsAsOf(led!, { at: '1900-01-01T00:00:00Z', workspace: 'gps' });
    expect(r.kind).toBe('unknowable');
    if (r.kind !== 'unknowable') return;
    expect(r.code).toBe(ENTITLEMENT_AS_OF_CODES.BEFORE_RECORD);

    const now = await entitlementsAsOf(led!, { at: new Date(), workspace: 'gps' });
    expect(now.kind).toBe('known');
    if (now.kind !== 'known') return;
    expect(now.holdings.length).toBeGreaterThan(0);
  });
});

describeDb('a scope the ledger has never heard of is refused, not answered empty', () => {
  it('refuses a typo\'d compartment rather than reporting it as held by nobody', async () => {
    // `entitlementsAsOf({ workspace: 'gpss' })` returned known / genuinelyEmpty /
    // eventsReplayed 0 — indistinguishable from a real compartment nobody holds.
    // Nothing checked the value against WorkspaceId, despite the type being imported.
    const r = await entitlementsAsOf(led!, { at: new Date(), workspace: 'gpss' });
    expect(r.kind).toBe('unanswerable');
    if (r.kind !== 'unanswerable') return;
    expect(r.code).toBe(ENTITLEMENT_AS_OF_CODES.UNKNOWN_SCOPE);
    expect(r.unresolved.map((u) => u.field)).toEqual(['workspace']);
    expect(Object.prototype.hasOwnProperty.call(r, 'holdings')).toBe(false);
  });

  it('refuses a member no event names, and returns BOTH unresolved fields at once', async () => {
    const r = await entitlementsAsOf(led!, {
      at: new Date(),
      memberId: 'nobody-here',
      workspace: 'gpss',
    });
    expect(r.kind).toBe('unanswerable');
    if (r.kind !== 'unanswerable') return;
    expect(r.code).toBe(ENTITLEMENT_AS_OF_CODES.UNKNOWN_SCOPE);
    // Every refusal, not the first one found (marketingDesk.ts:1207-1214).
    expect(r.unresolved.map((u) => u.field).sort()).toEqual(['memberId', 'workspace']);
  });

  it('answers for a member the ledger DOES know, even when they hold nothing now', async () => {
    // The line between the two states. `monty` was granted and revoked during this
    // run, so the ledger can speak for him and "nothing" is a real answer.
    const r = await entitlementsAsOf(led!, { at: new Date(), memberId: 'monty' });
    expect(r.kind).toBe('known');
    if (r.kind !== 'known') return;
    expect(r.holdings).toEqual([]);
    expect(r.genuinelyEmpty).toBe(true);
    expect(r.eventsReplayed).toBeGreaterThan(0);
  });
});

describeDb('the replay answers the question the DELETE used to destroy', () => {
  it('still shows a grant that has since been revoked, as of when it was held', async () => {
    // THE WHOLE POINT. Under the old code this row was deleted, so this question
    // had no answer at all — and the absence was indistinguishable from a denial.
    const r = await entitlementsAsOf(led!, {
      at: t.granted!,
      memberId: 'monty',
      workspace: 'marketing',
    });
    expect(r.kind).toBe('known');
    if (r.kind !== 'known') return;
    expect(r.holdings).toHaveLength(1);
    expect(r.holdings[0]!.capability).toBe('view');
    expect(r.holdings[0]!.grantedBy).toBe('nik');
    expect(r.holdings[0]!.provenance).toBe('observed');
    expect(r.holdings[0]!.attribution).toBe('named');
  });

  it('shows the upgraded capability after the upgrade, and not before', async () => {
    // A capability CHANGE is an event too. If the UPDATE branch of the grant
    // upsert left no event, the replay would report `view` forever.
    const before = await entitlementsAsOf(led!, { at: t.granted!, memberId: 'monty' });
    const after = await entitlementsAsOf(led!, { at: t.upgraded!, memberId: 'monty' });
    expect(before.kind).toBe('known');
    expect(after.kind).toBe('known');
    if (before.kind !== 'known' || after.kind !== 'known') return;
    expect(before.holdings[0]!.capability).toBe('view');
    expect(after.holdings[0]!.capability).toBe('operate');
  });

  it('shows nothing held once the revocation lands — absent, not null-capability', async () => {
    const r = await entitlementsAsOf(led!, { at: t.revoked!, memberId: 'monty' });
    expect(r.kind).toBe('known');
    if (r.kind !== 'known') return;
    // The subject must be ABSENT from the result, not present with no capability.
    expect(r.holdings).toEqual([]);
    expect(r.genuinelyEmpty).toBe(true);
    // …and the events were still replayed, which is how this differs from a
    // compartment that never existed.
    expect(r.eventsReplayed).toBeGreaterThan(0);
  });

  it('labels the 0042-era holdings as reconstructed, never as observed grants', async () => {
    // A surface that showed the reconstruction and a real grant event identically
    // would be laundering a photograph into a history.
    const r = await entitlementsAsOf(led!, { at: new Date(), workspace: 'governance' });
    expect(r.kind).toBe('known');
    if (r.kind !== 'known') return;
    expect(r.holdings.map((h) => h.memberId).sort()).toEqual(['nik', 'sam']);
    for (const h of r.holdings) {
      expect(h.provenance).toBe('reconstructed');
      expect(h.grantedBy).toBe('backfill-0042');
      expect(h.grantedAt).toBe(new Date(GENESIS_AT).toISOString());
    }
  });
});

describeDb('revocation keeps its live behaviour and stops destroying the history', () => {
  it('removes the live row — which is what loadEntitlements reads', async () => {
    await led!.query(
      `INSERT INTO entitlements (member_id, workspace, capability, granted_by, justification)
       VALUES ('sam','marketing','view','nik','temporary')`,
    );
    const out = await recordRevocation(led!, {
      memberId: 'sam',
      workspace: 'marketing',
      actor: 'nik',
      justification: 'no longer needed',
    });
    expect(out.kind).toBe('revoked');
    expect(out.historyRecorded).toBe(true);
    expect(out.code).toBeNull();

    const live = await led!.query(
      `SELECT 1 FROM entitlements WHERE member_id='sam' AND workspace='marketing'`,
    );
    expect(live.rowCount).toBe(0);
  });

  it('records the revocation ONCE, named, without the DELETE net duplicating it', async () => {
    // The event is inserted before the DELETE precisely so 0071's AFTER DELETE net
    // sees it in the same transaction and stays quiet. Reverse the order and every
    // revocation is recorded twice — once named, once `unattributed:`.
    const { rows } = await led!.query<{ actor: string; attribution: string }>(
      `SELECT actor, attribution FROM entitlement_events
        WHERE member_id='sam' AND workspace='marketing' AND event='revoke'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actor).toBe('nik');
    expect(rows[0]!.attribution).toBe('named');
  });

  it('reports NOT FOUND and writes no event when there was nothing to revoke', async () => {
    // An event log that records non-events is a replay that invents holdings.
    const before = await led!.query<{ n: string }>(
      `SELECT count(*) AS n FROM entitlement_events WHERE member_id='ghost'`,
    );
    const out = await recordRevocation(led!, {
      memberId: 'ghost',
      workspace: 'gps',
      actor: 'nik',
      justification: 'never held it',
    });
    expect(out.kind).toBe('not_found');
    const after = await led!.query<{ n: string }>(
      `SELECT count(*) AS n FROM entitlement_events WHERE member_id='ghost'`,
    );
    expect(Number(after.rows[0]!.n)).toBe(Number(before.rows[0]!.n));
    expect(Number(after.rows[0]!.n)).toBe(0);
  });

  it('leaves a trace for a bare out-of-band DELETE, and does not invent an actor for it', async () => {
    // 0042:69 and `routes/__tests__/access.test.ts:119` both delete grant rows by
    // hand. The net records that the revocation happened; claiming to know WHO did
    // it would be the laundering this whole lane exists to stop.
    await led!.query(
      `INSERT INTO entitlements (member_id, workspace, capability, granted_by)
       VALUES ('rida','intel','view','nik')`,
    );
    await led!.query(`DELETE FROM entitlements WHERE member_id='rida' AND workspace='intel'`);
    const { rows } = await led!.query<{ actor: string; attribution: string }>(
      `SELECT actor, attribution FROM entitlement_events
        WHERE member_id='rida' AND event='revoke'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.attribution).toBe('unattributed');
    expect(rows[0]!.actor).toMatch(/^unattributed:/);
  });

  it('revokes even when 0071 is absent, and SAYS the history was not written', async () => {
    // Refusing would leave access OPEN, which is strictly worse. What must not
    // happen is succeeding silently — that is the original defect under a new name.
    const out = await recordRevocation(bare!, {
      memberId: 'sam',
      workspace: 'gps',
      actor: 'nik',
      justification: 'ledger not deployed here',
    });
    expect(out.kind).toBe('revoked');
    expect(out.historyRecorded).toBe(false);
    expect(out.code).toBe(ENTITLEMENT_AS_OF_CODES.LEDGER_UNRECORDED);
    const live = await bare!.query(
      `SELECT 1 FROM entitlements WHERE member_id='sam' AND workspace='gps'`,
    );
    expect(live.rowCount).toBe(0);
  });
});

describeDb('the ledger is append-only in the database', () => {
  it('refuses an UPDATE and a DELETE on an event', async () => {
    await expect(led!.query(`UPDATE entitlement_events SET actor='eve'`)).rejects.toThrow(
      /ENTITLEMENT_LEDGER_APPEND_ONLY/,
    );
    await expect(led!.query(`DELETE FROM entitlement_events`)).rejects.toThrow(
      /ENTITLEMENT_LEDGER_APPEND_ONLY/,
    );
  });

  it('refuses a TRUNCATE', async () => {
    await expect(led!.query(`TRUNCATE entitlement_events`)).rejects.toThrow(
      /ENTITLEMENT_LEDGER_APPEND_ONLY/,
    );
  });

  it('raises an error this code can recognise', async () => {
    const err = await led!
      .query(`DELETE FROM entitlement_events`)
      .then(() => null)
      .catch((e: unknown) => e);
    expect(isLedgerAppendOnlyRefusal(err)).toBe(true);
    expect(isLedgerAppendOnlyRefusal({ message: 'permission denied' })).toBe(false);
  });

  it('rejects a revoke event that carries a capability, and a grant that does not', async () => {
    // A revoke with a capability would read as a partial downgrade, which this
    // system has no concept of; a grant without one cannot be replayed at all.
    await expect(
      led!.query(
        `INSERT INTO entitlement_events (member_id, workspace, event, capability, actor, provenance, attribution)
         VALUES ('x','gps','revoke','view','nik','observed','named')`,
      ),
    ).rejects.toThrow(/capability_matches_event/);
    await expect(
      led!.query(
        `INSERT INTO entitlement_events (member_id, workspace, event, capability, actor, provenance, attribution)
         VALUES ('x','gps','grant',NULL,'nik','observed','named')`,
      ),
    ).rejects.toThrow(/capability_matches_event/);
  });
});

describeDb('with no reconstruction at all, the two boundaries do not become one', () => {
  /*
   * 0071 APPLIED TO AN EMPTY `entitlements` TABLE. `earliest_reconstructed_at` is
   * NULL, so the `genesis !== null &&` guard skipped BEFORE_RECORD entirely and every
   * pre-floor instant fell through to RECONSTRUCTED_ONLY — whose message then read
   * "Between (no reconstruction) and that instant the record is 0 reconstructed
   * grant(s) — a photograph of the rows that happened to survive". A refusal citing a
   * rule about a window that does not exist.
   *
   * On production this is latent rather than live ONLY because 0042's backfill leaves
   * rows behind — i.e. the correctness of the branch rested on data, not on code.
   */
  it('names BEFORE_RECORD for a pre-floor instant, and does not invent a reconstruction', async () => {
    const boundary = await entitlementLedgerBoundary(noGrants!);
    expect(boundary).not.toBeNull();
    expect(boundary!.earliestReconstructedAt).toBeNull();
    expect(boundary!.reconstructedEvents).toBe(0);

    const r = await entitlementsAsOf(noGrants!, { at: '1900-01-01T00:00:00Z' });
    expect(r.kind).toBe('unknowable');
    if (r.kind !== 'unknowable') return;
    expect(r.code).toBe(ENTITLEMENT_AS_OF_CODES.BEFORE_RECORD);
    expect(r.code).not.toBe(ENTITLEMENT_AS_OF_CODES.RECONSTRUCTED_ONLY);
    expect(r.message).toMatch(/NO reconstructed grant at all/);
    expect(r.message).toContain(boundary!.ledgerFloor);
    // It must not describe a window it does not have.
    expect(r.message).not.toMatch(/photograph/);
    expect(r.message).not.toMatch(/\(no reconstruction\)/);
    expect(Object.prototype.hasOwnProperty.call(r, 'holdings')).toBe(false);
  });

  it('still answers a post-floor instant there — genuinely empty, not unknowable', async () => {
    // Non-vacuity: the schema is answerable, it just has nothing in it.
    const r = await entitlementsAsOf(noGrants!, { at: new Date() });
    expect(r.kind).toBe('known');
    if (r.kind !== 'known') return;
    expect(r.holdings).toEqual([]);
    expect(r.genuinelyEmpty).toBe(true);
  });
});

describe('coverage honesty', () => {
  it('states plainly when the database half did not run', () => {
    if (!HAS_DB) {
      expect(
        HAS_DB,
        'DATABASE_URL is unset, so the replay, the refusals, the append-only triggers '
          + 'and the revocation path were NOT checked in this run. Nothing in this file '
          + 'is provable without a Postgres.',
      ).toBe(false);
    } else {
      expect(HAS_DB).toBe(true);
    }
  });
});
