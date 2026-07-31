import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  _resetMigrated, createClient, createEngagement, deskSummary, getConflictCheck,
  getEngagement, isMigrated, issueProposal, listClients, listEngagements,
  recordConflictCheck, setEngagementStatus,
} from '../service.js';

/**
 * GPS SERVICE — against a REAL Postgres.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE SOURCE-LEVEL RATCHETS. Everything else in
 * this directory reads the source text, which cannot catch a statement that simply
 * does not run: a missing `::bigint` cast on a COALESCE'd NULL parameter, a
 * `FILTER (WHERE ...)` typo, an `ANY($1::text[])` binding, a CHECK constraint that
 * rejects a value the TypeScript union allows. Those are exactly the failures that
 * reach production as a 500, because the code compiles and the tests are green.
 *
 * SKIPPED UNLESS `GPS_TEST_DATABASE_URL` IS SET. CI has no Postgres for this
 * compartment, and a test that fails for want of a database gets deleted rather
 * than fixed. Run it locally against a scratch database with 0047 applied:
 *
 *   createdb gps_scratch
 *   psql gps_scratch -f apps/api/src/db/migrations/0047_gps.sql   # needs `entitlements`
 *   GPS_TEST_DATABASE_URL=postgres:///gps_scratch npx vitest run src/gps/__tests__/serviceDb
 *
 * It creates its own rows and drops nothing, so point it at a scratch database —
 * never at anything real. It refuses to run against a URL whose database name does
 * not contain "scratch" or "test", which is the cheapest available guard against
 * someone exporting the production URL into their shell.
 */

const URL_ = process.env.GPS_TEST_DATABASE_URL ?? '';
const looksScratch = /scratch|test/i.test(URL_);
const enabled = Boolean(URL_) && looksScratch;

if (URL_ && !looksScratch) {
  // Loud rather than silently skipped: a mistyped scratch URL should not look like
  // "the integration tests passed".
  throw new Error(
    'GPS_TEST_DATABASE_URL does not name a scratch/test database — refusing to write to it',
  );
}

let pool: pg.Pool;

beforeAll(async () => {
  if (!enabled) return;
  pool = new pg.Pool({ connectionString: URL_, max: 4 });
  _resetMigrated();
});

afterAll(async () => {
  if (pool) await pool.end();
});

describe.skipIf(!enabled)('GPS service against Postgres', () => {
  it('sees the migration', async () => {
    expect(await isMigrated(pool)).toBe(true);
  });

  it('creates a client and surfaces a same-name second one as a possible duplicate', async () => {
    const name = `Scratch Token ${Date.now()}`;
    const first = await createClient(pool, { name, jurisdiction: 'Liechtenstein' });
    expect(first.client.status).toBe('prospect');
    expect(first.possibleDuplicates).toHaveLength(0);

    // Not a 409: two real companies can share a name (gps_client_name_idx is
    // deliberately non-UNIQUE), so the ambiguity goes to a human.
    const second = await createClient(pool, { name: name.toUpperCase() });
    expect(second.possibleDuplicates.map((d) => d.id)).toContain(first.client.id);

    const listed = await listClients(pool, { status: 'prospect', limit: 500 });
    expect(listed.map((c) => c.id)).toContain(first.client.id);
  });

  it('runs the whole sell path: create → gate → check → propose → accept → collect', async () => {
    const { client } = await createClient(pool, { name: `Path ${Date.now()}` });
    const { engagement, quote } = await createEngagement(pool, {
      clientId: client.id,
      offerKey: 'mica_whitepaper',
      priceCents: 2_000_000,
      vendorCostCents: 700_000,
      owner: 'nik',
    });

    // Money survives the bigint round trip as a NUMBER, not a string.
    expect(typeof engagement.priceCents).toBe('number');
    expect(engagement.priceCents).toBe(2_000_000);
    expect(engagement.vendorCostCents).toBe(700_000);
    expect(quote.marginCents).toBe(1_300_000);
    expect(quote.marginPct).toBe(65);
    // Created in conflict_pending, never draft.
    expect(engagement.status).toBe('conflict_pending');
    // The scope is frozen at creation, exclusions and all.
    const snap = engagement.scopeSnapshot as { exclusions: string[] };
    expect(snap.exclusions.length).toBeGreaterThan(5);

    // THE GATE. No proposal without a recorded conflict position.
    const refused = await issueProposal(pool, engagement.id, 'nik');
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toBe('conflict_check_missing');

    const recorded = await recordConflictCheck(pool, {
      engagementId: engagement.id,
      checkPerformed: 'Checked listing applications, desk positions and any request to influence an outcome.',
      decision: 'cleared_with_disclosure',
      decidedBy: 'nik',
      disclosureTextUsed: 'LCX employment disclosed; services do not affect any listing decision.',
    });
    expect(recorded.ok).toBe(true);
    if (recorded.ok) {
      expect(recorded.amended).toBe(false);
      // Released from conflict_pending by the decision itself.
      expect(recorded.engagementStatus).toBe('draft');
      // client_id is taken from the engagement, never from a caller.
      expect(recorded.check.clientId).toBe(client.id);
    }

    // A second check without `amend` is refused, not upserted.
    const again = await recordConflictCheck(pool, {
      engagementId: engagement.id,
      checkPerformed: 'second look',
      decision: 'cleared',
      decidedBy: 'monty',
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('already_recorded');

    const issued = await issueProposal(pool, engagement.id, 'nik');
    expect(issued.ok).toBe(true);
    if (issued.ok) {
      expect(issued.engagement.status).toBe('proposed');
      expect(issued.proposal.issuedBy).toBe('nik');
      expect(issued.proposal.internal.marginCents).toBe(1_300_000);
      // The client-facing half carries no cost and no margin.
      expect(Object.keys(issued.proposal.clientFacing).join(' ')).not.toMatch(/vendor|margin/i);
      expect(issued.proposal.clientFacing.exclusions.length).toBeGreaterThan(5);
    }

    const accepted = await setEngagementStatus(pool, engagement.id, 'accepted', {
      depositRequiredCents: 1_000_000,
    });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.engagement.acceptedAt).not.toBeNull();
      expect(accepted.engagement.depositRequiredCents).toBe(1_000_000);
      expect(accepted.engagement.depositPaidAt).toBeNull();
    }

    const paid = await setEngagementStatus(pool, engagement.id, 'deposit_paid');
    expect(paid.ok && paid.engagement.depositPaidAt).not.toBeNull();
    // The first acceptance date is never rewritten by a later transition.
    if (paid.ok && accepted.ok) expect(paid.engagement.acceptedAt).toBe(accepted.engagement.acceptedAt);

    const collected = await setEngagementStatus(pool, engagement.id, 'collected');
    expect(collected.ok).toBe(true);

    // Terminal means terminal: reopening would make the revenue number move.
    const reopen = await setEngagementStatus(pool, engagement.id, 'in_delivery');
    expect(reopen.ok).toBe(false);
    if (!reopen.ok) expect(reopen.reason).toBe('terminal');
  });

  it('cancels an engagement when the conflict check is declined, and can amend back', async () => {
    const { client } = await createClient(pool, { name: `Declined ${Date.now()}` });
    const { engagement } = await createEngagement(pool, {
      clientId: client.id, offerKey: 'gtm_sprint', priceCents: 1_500_000,
    });

    const declined = await recordConflictCheck(pool, {
      engagementId: engagement.id,
      checkPerformed: 'Project is in an active LCX listing application.',
      decision: 'declined',
      decidedBy: 'monty',
    });
    expect(declined.ok && declined.engagementStatus).toBe('cancelled');

    // Cancelled by the gate, so the ordinary status path refuses it as terminal.
    const blocked = await setEngagementStatus(pool, engagement.id, 'proposed');
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('terminal');

    // A re-run against better facts is legitimate and restores `draft` — the one
    // documented way out of terminality, and only through the check itself.
    const amended = await recordConflictCheck(pool, {
      engagementId: engagement.id,
      checkPerformed: 'Listing application withdrawn by the project; re-checked.',
      decision: 'cleared',
      decidedBy: 'monty',
      amend: true,
    });
    expect(amended.ok).toBe(true);
    if (amended.ok) {
      expect(amended.amended).toBe(true);
      expect(amended.engagementStatus).toBe('draft');
    }
    const stored = await getConflictCheck(pool, engagement.id);
    expect(stored?.decision).toBe('cleared');
    // Amendment replaced the row; there is exactly one per engagement (UNIQUE).
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM gps_conflict_check WHERE engagement_id = $1',
      [engagement.id],
    );
    expect(rows[0].n).toBe(1);
  });

  it('filters engagements without letting a filter reach the SQL text', async () => {
    const { client } = await createClient(pool, { name: `Filter ${Date.now()}` });
    await createEngagement(pool, { clientId: client.id, offerKey: 'diagnostic', owner: 'sam' });
    const mine = await listEngagements(pool, { clientId: client.id, owner: 'sam' });
    expect(mine).toHaveLength(1);
    expect(await listEngagements(pool, { clientId: client.id, status: 'collected' })).toHaveLength(0);
    // A filter value that would be SQL if it were interpolated returns nothing and
    // breaks nothing.
    expect(await listEngagements(pool, { owner: "' OR 1=1 --" })).toHaveLength(0);
  });

  it('refuses an engagement for a client that does not exist', async () => {
    // The FK is the guard; the route turns 23503 into a 404.
    await expect(
      createEngagement(pool, {
        clientId: '00000000-0000-0000-0000-000000000000', offerKey: 'diagnostic',
      }),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('builds the desk summary, per currency, with the gaps counted', async () => {
    const s = await deskSummary(pool);
    expect(s.migrated).toBe(true);
    expect(s.engagements.total).toBeGreaterThan(0);
    // Money is grouped by currency and never summed across them.
    expect(s.openByCurrency.length).toBeGreaterThan(0);
    for (const t of s.openByCurrency) {
      expect(t.currency).toMatch(/^[A-Z]{3}$/);
      expect(t.marginCents).toBe(t.priceCents - t.vendorCostCents);
    }
    // The `unstaffable` count is not zero: no offer has a named partner (D5).
    expect(s.gaps.unstaffable).toBeGreaterThan(0);
    expect(s.catalogue.priceBandsArePlaceholders).toBe(true);
    expect(s.catalogue.blockingTodoCount).toBeGreaterThan(0);
    // An engagement created and never checked shows up as a gap.
    expect(s.gaps.missingConflictCheck).toBeGreaterThan(0);
  });

  it('does not lose an engagement to a concurrent status change', async () => {
    // FOR UPDATE in setEngagementStatus: two simultaneous transitions must
    // serialise rather than interleave a stale read of the conflict clearance.
    const { client } = await createClient(pool, { name: `Race ${Date.now()}` });
    const { engagement } = await createEngagement(pool, {
      clientId: client.id, offerKey: 'marketing_activation', priceCents: 1_200_000,
    });
    await recordConflictCheck(pool, {
      engagementId: engagement.id, checkPerformed: 'checked', decision: 'cleared', decidedBy: 'nik',
    });
    const results = await Promise.all([
      setEngagementStatus(pool, engagement.id, 'proposed'),
      setEngagementStatus(pool, engagement.id, 'accepted'),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    const final = await getEngagement(pool, engagement.id);
    expect(['proposed', 'accepted']).toContain(final?.status);
  });
});
