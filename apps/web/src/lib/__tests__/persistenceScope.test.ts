/**
 * Local persistence must be scoped to the signed-in operator, and sign-out must
 * actually wipe it.
 *
 * The bug this guards: keys were `lcx-os:<key>:v1` with no operator in them, and
 * sign-out cleared only the credential. Every member signs in with the SAME desk
 * passcode, so on a shared Mac the next person inherited the previous person's
 * active workspace, filters, BD notes, deal playbooks, scenario forks and local
 * audit log. Seven stores plus three raw-key call sites were affected.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { storage, scopedKey } from '@/lib/persistence';

const EMAIL_KEY = 'lcx_operator_email';

function signInAs(email: string) {
  localStorage.setItem(EMAIL_KEY, email);
}

describe('operator-scoped persistence', () => {
  beforeEach(() => localStorage.clear());

  it('keys include the signed-in operator', () => {
    signInAs('nik@lcx.com');
    expect(scopedKey('filters')).toBe('lcx-os:nik@lcx.com:filters:v1');
  });

  it('normalises the operator so casing cannot fork a namespace', () => {
    signInAs('  NIK@LCX.com  ');
    expect(scopedKey('filters')).toBe('lcx-os:nik@lcx.com:filters:v1');
  });

  it('falls back to anon before sign-in rather than throwing', () => {
    expect(scopedKey('filters')).toBe('lcx-os:anon:filters:v1');
  });

  it('does NOT leak one operator state to the next on the same machine', () => {
    signInAs('nik@lcx.com');
    storage.set('activeWorkspace', 'distribution');
    storage.set('bd-notes', { acme: 'ready to close' });

    // Sam signs in on the same Mac.
    signInAs('sam@lcx.com');

    // This is the whole point: Sam must see defaults, not Nik's desk.
    expect(storage.get('activeWorkspace', null)).toBeNull();
    expect(storage.get('bd-notes', null)).toBeNull();

    // ...and Nik's data is still intact under his own scope when he returns.
    signInAs('nik@lcx.com');
    expect(storage.get('activeWorkspace', null)).toBe('distribution');
  });

  it('clearAll() wipes every operator, so sign-out means sign-out', () => {
    signInAs('nik@lcx.com');
    storage.set('activeWorkspace', 'command');
    signInAs('sam@lcx.com');
    storage.set('activeWorkspace', 'sales');
    localStorage.setItem('unrelated-key', 'keep me');

    storage.clearAll();

    expect(storage.get('activeWorkspace', null)).toBeNull();
    signInAs('nik@lcx.com');
    expect(storage.get('activeWorkspace', null)).toBeNull();

    // Scoped only to our own prefix — never other apps' storage.
    expect(localStorage.getItem('unrelated-key')).toBe('keep me');
  });

  it('round-trips values and honours the default on a miss', () => {
    signInAs('monty@lcx.com');
    expect(storage.get('missing', 'fallback')).toBe('fallback');
    storage.set('missing', 'present');
    expect(storage.get('missing', 'fallback')).toBe('present');
    storage.remove('missing');
    expect(storage.get('missing', 'fallback')).toBe('fallback');
  });

  it('survives corrupt JSON without throwing', () => {
    signInAs('nik@lcx.com');
    localStorage.setItem(scopedKey('broken'), '{not json');
    expect(storage.get('broken', 'safe')).toBe('safe');
  });
});
