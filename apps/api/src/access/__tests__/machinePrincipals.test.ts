import { describe, expect, it, beforeEach } from 'vitest';
import type pg from 'pg';
import { WORKSPACES, capAtLeast } from '@lcx/shared';
import { invalidateEntitlements, isMachinePrincipal, loadEntitlements } from '../entitlements.js';

/**
 * UNKNOWN PRINCIPALS WERE CLASSIFIED AS MACHINES, AND MACHINES HOLD SEVEN
 * COMPARTMENTS.
 *
 * `loadEntitlements` was `if (!findMemberById(actorId)) return machineMap()`, with the
 * comment "Non-roster actors are machines (shared key, monitor:<id>, ai)". That was true
 * when those were the only credentials. Then the second-tier sign-in landed
 * (`middleware/auth.ts`): any `@lcx.com` address plus `SECONDARY_PASSCODE` mints
 * `ext:<local-part>`, which is not on the roster — so every colleague holding a short
 * shared secret was treated as a MACHINE and handed command, sales, intel, regulatory,
 * distribution, marketing and GOVERNANCE at `operate`, with no grant row anywhere.
 *
 * Governance owns `/v1/audit`, whose rows carry GPS action params verbatim —
 * `checkPerformed` (the conflict narrative on a named client) and `disclosureTextUsed`
 * (the exact words a client was given). So `gps.machineAccess: false`, the one boolean
 * written to keep machines out of client-confidential material, was bypassed through a
 * second compartment. `redactSecrets` matches none of those keys, because they are not
 * secrets; they are somebody else's confidential material.
 *
 * The fix is an ALLOWLIST. An unknown principal is not a machine and not a member — it
 * is unknown, and unknown must default to nothing.
 */

/** A pool that answers "no grant rows", i.e. the roster-member zero-grant path. */
const emptyPool = {
  query: async () => ({ rows: [], rowCount: 0 }),
} as unknown as pg.Pool;

beforeEach(() => invalidateEntitlements());

describe('the machine allowlist is closed', () => {
  it('recognises exactly the three machine credentials', () => {
    expect(isMachinePrincipal('operator')).toBe(true);
    expect(isMachinePrincipal('ai')).toBe(true);
    expect(isMachinePrincipal('monitor:token_risk')).toBe(true);
    expect(isMachinePrincipal('monitor:anything-at-all')).toBe(true);
  });

  it('does NOT recognise a second-tier ext: principal', () => {
    // The whole finding, in one assertion.
    expect(isMachinePrincipal('ext:someone')).toBe(false);
    expect(isMachinePrincipal('ext:nikhil.sharma')).toBe(false);
  });

  it('does not recognise a lookalike, a prefix or an empty id', () => {
    for (const id of ['operator2', 'Operator', 'xoperator', 'monitors:x', 'monitor', 'aiX', '', 'unknown']) {
      expect(isMachinePrincipal(id), id).toBe(false);
    }
  });
});

describe('an unknown principal holds nothing', () => {
  it('gives a second-tier ext: principal ZERO compartments', async () => {
    const ents = await loadEntitlements(emptyPool, 'ext:someone');
    expect(ents).toEqual({});
    for (const ws of WORKSPACES) {
      expect(capAtLeast(ents[ws.id], 'view'), `${ws.id} is readable by ext:someone`).toBe(false);
    }
  });

  it('specifically gives it no GOVERNANCE, which is the door onto /v1/audit', async () => {
    // Before the fix: `operate`. `/v1/audit?entity=gps_engagement` then returned the
    // conflict narrative and the verbatim client disclosure text in `meta`.
    const ents = await loadEntitlements(emptyPool, 'ext:someone');
    expect(capAtLeast(ents.governance, 'view')).toBe(false);
    expect(capAtLeast(ents.gps, 'view')).toBe(false);
  });

  it('gives an arbitrary unrecognised id nothing either', async () => {
    for (const id of ['', 'nobody', 'cron', 'service-account', 'monitors:x']) {
      expect(await loadEntitlements(emptyPool, id), id).toEqual({});
      invalidateEntitlements();
    }
  });
});

describe('the machines that do have automation keep working', () => {
  it('the shared key still holds every machineAccess compartment at operate', async () => {
    const ents = await loadEntitlements(emptyPool, 'operator');
    const expected = WORKSPACES.filter((w) => w.machineAccess).map((w) => w.id).sort();
    expect(Object.keys(ents).sort()).toEqual(expected);
    for (const id of expected) expect(ents[id]).toBe('operate');
    // Non-empty, or this test would pass on a total lockout.
    expect(expected.length).toBeGreaterThan(0);
  });

  it('and STILL does not hold gps — machineAccess: false is the boundary', async () => {
    for (const id of ['operator', 'ai', 'monitor:token_risk']) {
      const ents = await loadEntitlements(emptyPool, id);
      expect(capAtLeast(ents.gps, 'view'), id).toBe(false);
      invalidateEntitlements();
    }
  });

  it('no machine ever reaches approve on anything', async () => {
    for (const id of ['operator', 'ai', 'monitor:x']) {
      const ents = await loadEntitlements(emptyPool, id);
      for (const ws of WORKSPACES) {
        expect(capAtLeast(ents[ws.id], 'approve'), `${id} → ${ws.id}`).toBe(false);
      }
      invalidateEntitlements();
    }
  });
});
