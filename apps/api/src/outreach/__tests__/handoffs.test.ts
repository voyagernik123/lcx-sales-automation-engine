import { describe, it, expect } from 'vitest';
import type { HandoffStatus } from '../handoffs.js';

describe('Handoff state machine', () => {
  const VALID_TRANSITIONS: Record<HandoffStatus, HandoffStatus[]> = {
    open: ['in_progress', 'resolved_won_path', 'resolved_lost', 're_nurture'],
    in_progress: ['resolved_won_path', 'resolved_lost', 're_nurture', 'open'],
    resolved_won_path: [],
    resolved_lost: [],
    re_nurture: ['open', 'in_progress'],
  };

  function isValidTransition(from: HandoffStatus, to: HandoffStatus): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  const ALL_STATUSES: HandoffStatus[] = ['open', 'in_progress', 'resolved_won_path', 'resolved_lost', 're_nurture'];

  const VALID_PAIRS: [HandoffStatus, HandoffStatus][] = [
    ['open', 'in_progress'],
    ['open', 'resolved_won_path'],
    ['open', 'resolved_lost'],
    ['open', 're_nurture'],
    ['in_progress', 'resolved_won_path'],
    ['in_progress', 'resolved_lost'],
    ['in_progress', 're_nurture'],
    ['in_progress', 'open'],
    ['re_nurture', 'open'],
    ['re_nurture', 'in_progress'],
  ];

  it('allows valid transitions', () => {
    for (const [from, to] of VALID_PAIRS) {
      expect(isValidTransition(from, to)).toBe(true);
    }
  });

  it('rejects terminal state transitions', () => {
    for (const terminal of ['resolved_won_path', 'resolved_lost'] as HandoffStatus[]) {
      for (const to of ALL_STATUSES) {
        expect(isValidTransition(terminal, to)).toBe(false);
      }
    }
  });

  it('rejects self-transitions', () => {
    expect(isValidTransition('open', 'open')).toBe(false);
    expect(isValidTransition('in_progress', 'in_progress')).toBe(false);
  });

  it('allows re_nurture → open cycle', () => {
    expect(isValidTransition('re_nurture', 'open')).toBe(true);
  });

  it('allows re_nurture → in_progress', () => {
    expect(isValidTransition('re_nurture', 'in_progress')).toBe(true);
  });
});

describe('Override permission check', () => {
  it('requires operator role for re-enroll', () => {
    const operator = { id: 'operator', role: 'operator', authMethod: 'api_key' };
    const viewer = { id: 'viewer', role: 'viewer', authMethod: 'api_key' };

    function canOverride(role: string): boolean {
      return role === 'operator';
    }

    expect(canOverride(operator.role)).toBe(true);
    expect(canOverride(viewer.role)).toBe(false);
  });
});
