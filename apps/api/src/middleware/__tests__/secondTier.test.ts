import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { closeDb } from '../../db/index.js';
import { invalidateEntitlements } from '../../access/entitlements.js';
import { _resetSecondTier, secondTierUnexpected, secondTierUsage } from '../../lib/secondTier.js';
import { TEAM, isAllowedEmail, isLcxDomainEmail } from '@lcx/shared';

/**
 * SECOND-TIER SIGN-IN — the widening Nik asked for on 2026-08-01, and the four
 * limits that came with it.
 *
 * Any @lcx.com address plus SECONDARY_PASSCODE signs in at 'operator'. That is a
 * deliberate, owner-approved reduction in access control, taken after the tradeoff
 * was stated: a short shared secret is guessable and cannot attribute an action to a
 * person. These tests are not here to argue with the decision — they are here so the
 * decision cannot quietly become something WIDER than what was agreed.
 *
 * The four things that must stay true:
 *   1. The domain gate still holds. "Any colleague", never "anyone".
 *   2. Second tier is never `approver`. The two approve-gated acts (discount
 *      approval, clearing a conflict) stay with the named roster, because handing
 *      approve-tier to a shared code is not recoverable from an audit log.
 *   3. A roster member typing the secondary code is still THEMSELVES — otherwise a
 *      person's audit history would fork by which password they used.
 *   4. The primary passcode still works, and the wrong passcode still fails.
 */

const PRIMARY = 'test#1234';
const SECONDARY = '1234';
const bearer = (cred: string) => ({ Authorization: `Bearer ${cred}` });

describe('second-tier sign-in', () => {
  const app = createApp();

  beforeAll(() => {
    process.env.ALLOW_DB_SKIP = 'true';
    // The path is DISABLED unless SECONDARY_PASSCODE is set — no default in code,
    // because a shared sign-in secret committed to the repo is public to every
    // checkout and to git history. The production value lives in Render; this is a
    // test-only value, and `env.secondaryPasscode` is a getter so setting it here
    // takes effect rather than having been frozen at import.
    process.env.SECONDARY_PASSCODE = SECONDARY;
    invalidateEntitlements();
    _resetSecondTier();
  });

  afterAll(() => {
    delete process.env.SECONDARY_PASSCODE;
  });

  it('is DISABLED when SECONDARY_PASSCODE is unset — the safe default', async () => {
    const saved = process.env.SECONDARY_PASSCODE;
    delete process.env.SECONDARY_PASSCODE;
    try {
      // A non-roster colleague must get nothing at all when the door is shut, and
      // an empty passcode must never match an empty env var.
      expect((await app.request('/v1/me', { headers: bearer(`priya@lcx.com:${SECONDARY}`) })).status).toBe(401);
      expect((await app.request('/v1/me', { headers: bearer('priya@lcx.com:') })).status).toBe(401);
    } finally {
      process.env.SECONDARY_PASSCODE = saved;
    }
  });

  afterAll(async () => {
    await closeDb();
  });

  it('admits a non-roster LCX address with the secondary passcode', async () => {
    const res = await app.request('/v1/me', { headers: bearer(`priya@lcx.com:${SECONDARY}`) });
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { id: string; role: string } };
    // Visibly distinct from a roster id in every audit row it ever writes.
    expect(data.id).toBe('ext:priya');
    expect(data.role).toBe('operator');
  });

  it('NEVER grants approver on the second tier', async () => {
    // The whole point of the limit: a shared code must not be able to approve a
    // discount or clear a conflict of interest.
    for (const who of ['priya@lcx.com', 'anyone@lcx.com', 'ceo@lcx.com']) {
      const res = await app.request('/v1/me', { headers: bearer(`${who}:${SECONDARY}`) });
      expect(res.status).toBe(200);
      const { data } = (await res.json()) as { data: { role: string } };
      expect(data.role, who).toBe('operator');
    }
  });

  it('still refuses a non-LCX address — this is "any colleague", not "anyone"', async () => {
    for (const outsider of [
      'attacker@gmail.com',
      'nik@lcx.com.evil.example',
      'nik@notlcx.com',
      'nik@sub.lcx.com',
    ]) {
      const res = await app.request('/v1/me', { headers: bearer(`${outsider}:${SECONDARY}`) });
      expect(res.status, outsider).toBe(401);
    }
  });

  it('resolves a ROSTER member to their real identity, not an ext: shadow', async () => {
    // Otherwise Nik's audit trail would split in two depending on which password
    // he happened to type, and neither half would be complete.
    const res = await app.request('/v1/me', { headers: bearer(`nik@lcx.com:${SECONDARY}`) });
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { id: string; role: string } };
    expect(data.id).toBe('nik');
    expect(data.role).toBe('approver'); // his own role, via his own identity
  });

  it('leaves the primary passcode working exactly as before', async () => {
    const res = await app.request('/v1/me', { headers: bearer(`nik@lcx.com:${PRIMARY}`) });
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { id: string; role: string } };
    expect(data.id).toBe('nik');
    expect(data.role).toBe('approver');
  });

  it('still rejects a wrong passcode, and a bare email', async () => {
    expect((await app.request('/v1/me', { headers: bearer('priya@lcx.com:hunter2') })).status).toBe(401);
    expect((await app.request('/v1/me', { headers: bearer('priya@lcx.com') })).status).toBe(401);
    expect((await app.request('/v1/me', { headers: bearer('priya@lcx.com:') })).status).toBe(401);
  });

  it('REFUSES a departed member on either passcode', async () => {
    // Migration 0042_lcx_os_access.sql:69-70 deliberately deleted rida's and
    // jatin's entitlements when they left. Their addresses still match the LCX
    // domain, so without DEPARTED_MEMBER_EMAILS the second tier would hand that
    // access straight back — and nothing on this path verifies control of the
    // mailbox, so the address would not even need to still work.
    for (const who of ['jatin@lcx.com', 'rida@lcx.com', 'JATIN@LCX.COM', '  jatin@lcx.com  ']) {
      for (const code of [PRIMARY, SECONDARY]) {
        const res = await app.request('/v1/me', { headers: bearer(`${who}:${code}`) });
        expect(res.status, `${who} / ${code}`).toBe(401);
      }
    }
  });

  it('uses the DOMAIN gate, not the roster gate — the bug caught before shipping', () => {
    // `isAllowedEmail` is a ROSTER check (operators.ts:47). Wiring the second tier
    // to it admitted only the three people who could already sign in, i.e. the
    // feature silently did nothing. This pins the distinction.
    expect(isAllowedEmail('priya@lcx.com')).toBe(false); // not on the roster
    expect(isLcxDomainEmail('priya@lcx.com')).toBe(true); // but is a colleague
  });

  it('the domain gate is exact, not a suffix match', () => {
    for (const spoof of [
      'nik@lcx.com.evil.example', // endsWith('lcx.com') would pass this
      'nik@sub.lcx.com',          // a subdomain is not the domain
      'nik@notlcx.com',
      'a@lcx.com@b.com',          // second @
      '@lcx.com',                 // empty local part
      'niklcx.com',               // no @
    ]) {
      expect(isLcxDomainEmail(spoof), spoof).toBe(false);
    }
    expect(isLcxDomainEmail('  Nik@LCX.com ')).toBe(true); // normalised, still fine
  });

  it('records every second-tier session, and flags the non-roster ones', () => {
    // A silent second door is the dangerous kind. `unexpected` is the number to
    // watch: it grows when a passcode spreads.
    const usage = secondTierUsage();
    expect(usage.length).toBeGreaterThan(0);
    const unexpected = secondTierUnexpected(TEAM.map((m) => m.email));
    expect(unexpected.some((u) => u.email === 'priya@lcx.com')).toBe(true);
    // Nik used the secondary code above but is on the roster, so he must NOT be
    // counted as unexpected.
    expect(unexpected.some((u) => u.email === 'nik@lcx.com')).toBe(false);
  });
});
