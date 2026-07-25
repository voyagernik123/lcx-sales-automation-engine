/**
 * Two security defects found by the Phase 3 recon, pinned so they cannot return.
 *
 * 1. AUTHORITY WAS OVERRIDABLE. The token-incentivized campaign launch checked
 *    `role !== 'approver' && !params.overrideGate`, so any operator could grant
 *    themselves approver authority by sending `overrideGate: true`. And because a
 *    reason is only demanded when review/budget blockers exist, an operator acting
 *    on a clean campaign could take that path with no approver involved and no
 *    justification recorded anywhere.
 *
 * 2. THE STEP-UP PASSCODE WAS PERSISTED. `revoke_entitlement` takes a
 *    `stepUpPasscode`, and the whole params object was written verbatim into both
 *    `object_actions.params` and `audit_log.meta` — putting the shared desk
 *    passcode in plaintext into two queryable tables on every revoke.
 *
 * These assert against the executor source rather than by running SQL, because
 * the suite is deliberately network- and database-free. That is a real limit: it
 * proves the guard is present, not that the runtime semantics are right. The
 * behavioural coverage lives in distGate.test.ts.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { ACTION_REGISTRY, redactSecrets } from '../registry.js';

/**
 * Comments survive into `Function.prototype.toString()` after the test
 * transform, and the comment documenting this very defect quotes it verbatim —
 * which made an earlier version of this test fail against correct code. Assert
 * on code, never on prose.
 */
function codeOnly(fn: (...args: never[]) => unknown): string {
  return fn
    .toString()
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('authority is not overridable by a client flag', () => {
  const source = codeOnly(ACTION_REGISTRY.dist_campaign_set_status.execute);

  it('the approver check does not consult overrideGate', () => {
    expect(source).toMatch(/role\s*!==\s*['"]approver['"]/);
    // The exact shape of the defect.
    expect(source).not.toMatch(/role\s*!==\s*['"]approver['"]\s*&&\s*!\s*params\.overrideGate/);
  });

  it('still lets overrideGate accept documented risk on the review blockers', () => {
    // The flag must keep working for what it is FOR, or the fix would have
    // removed a legitimate, audited escape hatch instead of narrowing it.
    expect(source).toMatch(/params\.overrideGate/);
    expect(source).toMatch(/OVERRIDE_REASON_REQUIRED/);
  });

  it('still raises APPROVER_REQUIRED for a non-approver', () => {
    expect(source).toMatch(/APPROVER_REQUIRED/);
  });
});

describe('secrets never reach the ledger or the audit log', () => {
  it('redacts a step-up passcode while keeping the field present', () => {
    const out = redactSecrets({ memberId: 'sam', workspace: 'command', stepUpPasscode: 'test#1234' });
    expect(out.stepUpPasscode).toBe('[redacted]');
    // Present-but-redacted, so the record still shows step-up was performed.
    expect(Object.keys(out)).toContain('stepUpPasscode');
    expect(out.memberId).toBe('sam');
    expect(JSON.stringify(out)).not.toContain('test#1234');
  });

  it('catches other credential-shaped names without anyone updating a list', () => {
    const out = redactSecrets({
      password: 'p',
      apiKey: 'k',
      api_key: 'k2',
      someSecret: 's',
      authToken: 't',
      newStepUpPasscode: 'n',
    });
    for (const [k, v] of Object.entries(out)) expect(v, k).toBe('[redacted]');
  });

  it('leaves ordinary params untouched and returns the same object when nothing matched', () => {
    const input = { status: 'live', reason: 'because', count: 3, flag: true };
    // Same reference: no copy when there is nothing to redact.
    expect(redactSecrets(input)).toBe(input);
  });

  it('over-redacts any STRING whose name merely suggests a credential', () => {
    // The tradeoff, unchanged and still deliberate: the cost of over-redacting is a
    // less informative audit row, the cost of under-redacting is a credential in a
    // queryable table. Name-matching stays over-broad for strings.
    const out = redactSecrets({ title: 'x', tokenValue: 'eyJhbGciOi', secretNote: 'shh' });
    expect(out.title).toBe('x');
    expect(out.tokenValue).toBe('[redacted]');
    expect(out.secretNote).toBe('[redacted]');
  });

  it('but keeps a boolean, because a boolean cannot BE a credential', () => {
    // This test used to assert the opposite, and the P7 audit was right that the
    // opposite had a real cost: `dist_campaign_create.tokenIncentivized` matches
    // `token`, so the audit row for creating a token-incentivized campaign did not
    // record that it was token-incentivized — the exact flag that makes the action
    // require an approver, absent from the trail that records the approval.
    //
    // The exemption is by VALUE TYPE, not by adding a special case to the name
    // pattern. That keeps deny-by-default intact for every string and generalises to
    // any future `tokenEnabled` / `secretBallot` boolean.
    const out = redactSecrets({ tokenIncentivized: true, secretBallot: false });
    expect(out.tokenIncentivized).toBe(true);
    expect(out.secretBallot).toBe(false);
  });

  it('invokeAction records the redacted copy, not the raw params', () => {
    // redactSecrets existing is worthless if the INSERT still stringifies
    // `params`. Read the source and pin the wiring at the only place it matters:
    // a passing unit test on the helper alongside an unchanged INSERT would be
    // the most misleading possible outcome.
    const raw = readFileSync(new URL('../registry.ts', import.meta.url), 'utf8');
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/gm, '$1');

    const ledgerInsert = src.slice(src.indexOf('INSERT INTO object_actions'));
    expect(ledgerInsert).toContain('JSON.stringify(recorded)');
    expect(ledgerInsert.slice(0, 400)).not.toContain('JSON.stringify(params)');

    // ...and the audit row is built from the redacted copy too.
    expect(src).toMatch(/auditMeta\s*=\s*input\.confirmedBy\s*\?\s*\{\s*\.\.\.recorded/);
  });
});
