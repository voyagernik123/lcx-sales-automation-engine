import { describe, expect, it } from 'vitest';
import { TEAM, findMemberByEmail, isAllowedEmail, normalizeEmail } from './operators.js';

describe('desk roster / email allowlist', () => {
  it('holds the five desk members with unique ids and emails', () => {
    expect(TEAM).toHaveLength(5);
    expect(new Set(TEAM.map((m) => m.id)).size).toBe(5);
    expect(new Set(TEAM.map((m) => m.email)).size).toBe(5);
    expect(TEAM.map((m) => m.email)).toEqual([
      'monty@lcx.com',
      'sam@lcx.com',
      'nik@lcx.com',
      'rida@lcx.com',
      'jatin@lcx.com',
    ]);
  });

  it('normalizes case and surrounding whitespace', () => {
    expect(normalizeEmail('  Nik@LCX.com ')).toBe('nik@lcx.com');
  });

  it('matches an allowlisted email case-insensitively and returns the owner', () => {
    expect(findMemberByEmail('NIK@lcx.com')?.id).toBe('nik');
    expect(findMemberByEmail('  monty@lcx.com  ')?.role).toBe('approver');
    expect(isAllowedEmail('sam@lcx.com')).toBe(true);
  });

  it('rejects anything not on the roster', () => {
    expect(findMemberByEmail('attacker@lcx.com')).toBeNull();
    expect(findMemberByEmail('nik@gmail.com')).toBeNull();
    expect(findMemberByEmail('')).toBeNull();
    expect(isAllowedEmail('nik@lcx.com.evil.com')).toBe(false);
  });

  it('desk leads are approvers, others operators', () => {
    expect(findMemberByEmail('nik@lcx.com')?.role).toBe('approver');
    expect(findMemberByEmail('monty@lcx.com')?.role).toBe('approver');
    expect(findMemberByEmail('sam@lcx.com')?.role).toBe('operator');
    expect(findMemberByEmail('rida@lcx.com')?.role).toBe('operator');
    expect(findMemberByEmail('jatin@lcx.com')?.role).toBe('operator');
  });
});
