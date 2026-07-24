import { describe, expect, it } from 'vitest';
import { TEAM, findMemberByEmail, findMemberById, ownerLabel, isAllowedEmail, normalizeEmail } from './operators.js';

describe('desk roster / email allowlist', () => {
  it('holds the three desk members with unique ids and emails', () => {
    expect(TEAM).toHaveLength(3);
    expect(new Set(TEAM.map((m) => m.id)).size).toBe(3);
    expect(new Set(TEAM.map((m) => m.email)).size).toBe(3);
    expect(TEAM.map((m) => m.email)).toEqual([
      'monty@lcx.com',
      'sam@lcx.com',
      'nik@lcx.com',
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
    expect(findMemberByEmail('sam@lcx.com')?.role).toBe('operator');
  });

  it('resolves an owner id to a member, and null for the shared/unknown ids (Phase 4.4)', () => {
    expect(findMemberById('nik')?.name).toBe('Nik');
    expect(findMemberById('operator')).toBeNull();
    expect(findMemberById('ghost')).toBeNull();
  });

  it('labels an owner id for display', () => {
    expect(ownerLabel('nik')).toBe('Nik');
    expect(ownerLabel('operator')).toBe('Desk (shared)');
    expect(ownerLabel(null)).toBe('Unassigned');
    expect(ownerLabel('ghost')).toBe('ghost'); // unknown id falls back to itself
  });
});
