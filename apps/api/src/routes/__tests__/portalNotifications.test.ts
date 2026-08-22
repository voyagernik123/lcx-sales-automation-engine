import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * G4's LAST LIMB — portal events on the desk's own notification readout.
 *
 * Two properties, and the second one is the one that keeps the channel usable:
 *  1. The four acts that CREATE AN OBLIGATION notify, scoped to `gps` so a member
 *     without the compartment never sees them.
 *  2. A page view does NOT. A readout that fires every time a client opens their
 *     portal is a readout the desk mutes, and then the acceptance notification — the
 *     one that makes an invoice issuable — is lost with it.
 *
 * The audit row is asserted to survive a notification failure, because the event
 * table is the obligation and the readout is a courtesy.
 */

const notify = vi.hoisted(() => vi.fn());
vi.mock('../../notifications/service.js', () => ({ notify }));
vi.mock('../../gps/deliveryDesk.js', () => ({ acceptDeliverable: vi.fn(), recordDeliverableReview: vi.fn() }));

const queries = vi.hoisted(() => [] as Array<{ sql: string; params: unknown[] }>);
const pool = {
  query: async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    return { rows: [], rowCount: 1 };
  },
} as never;

const { recordPortalEvent } = await import('../../portal/service.js');

const SESSION = {
  id: 'sess-1', engagementId: 'eng-1', clientId: 'cli-1', label: 'founder@sable.example',
  mintedBy: 'nik', mintedAt: '2026-08-22T00:00:00.000Z', expiresAt: '2027-01-01T00:00:00.000Z',
  revokedAt: null, revokedBy: null, lastSeenAt: null,
};

beforeEach(() => {
  notify.mockReset();
  notify.mockResolvedValue(undefined);
  queries.length = 0;
});

describe('what reaches the desk', () => {
  it('notifies the acceptance — the event that makes an invoice issuable', async () => {
    await recordPortalEvent(pool, SESSION, 'acceptance_recorded', 'deliverable del-1 accepted');
    expect(notify).toHaveBeenCalledOnce();
    const arg = notify.mock.calls[0][0];
    expect(arg.workspace).toBe('gps');
    expect(arg.rule).toBe('gps.portal.acceptance');
    expect(arg.title).toContain('founder@sable.example');
    expect(arg.href).toContain('eng-1');
    // Deduped per session per kind per day: three fixes in a row are one interruption.
    expect(arg.dedupKey).toContain('sess-1');
  });

  it('notifies the three other obligations', async () => {
    for (const kind of ['facts_submitted', 'acceptance_refused', 'upload_refused'] as const) {
      notify.mockClear();
      await recordPortalEvent(pool, SESSION, kind, 'detail');
      expect(notify, `${kind} did not notify`).toHaveBeenCalledOnce();
    }
  });

  it('does NOT notify a page view or a readiness note — the channel stays worth reading', async () => {
    await recordPortalEvent(pool, SESSION, 'session_used', 'viewed');
    await recordPortalEvent(pool, SESSION, 'upload_intent_recorded', 'ready');
    expect(notify).not.toHaveBeenCalled();
    // Both are still on the audit floor, which is the point of the distinction.
    expect(queries.filter((q) => q.sql.includes('INSERT INTO gps_portal_event'))).toHaveLength(2);
  });
});

describe('the audit row outranks the courtesy', () => {
  it('records the event even when the notification throws', async () => {
    notify.mockRejectedValue(new Error('notifications table absent'));
    await expect(recordPortalEvent(pool, SESSION, 'acceptance_recorded', 'still recorded')).resolves.toBeUndefined();
    const insert = queries.find((q) => q.sql.includes('INSERT INTO gps_portal_event'))!;
    expect(insert.params[2]).toBe('acceptance_recorded');
  });
});
