import { describe, expect, it } from 'vitest';
import { resolveStep } from '../scheduler.js';
import { isWithinSendWindow, nextSendWindowStart } from '../sendWindow.js';
import type { SequenceStep } from '@lcx/shared';

const baseStep: SequenceStep = {
  touchIndex: 1,
  delayDays: 0,
  subject: 'Hi',
  body: 'Hello',
  claimsUsed: [],
  requiresHumanReview: false,
};

describe('resolveStep', () => {
  const seq = { channel: 'email', startedAt: new Date('2026-07-01T10:00:00Z'), createdAt: new Date('2026-07-01T10:00:00Z') };

  it('keeps explicit channel and scheduledAt', () => {
    const step = resolveStep(seq, {
      ...baseStep,
      channel: 'linkedin',
      scheduledAt: '2026-07-05T10:00:00Z',
    });
    expect(step.channel).toBe('linkedin');
    expect(step.scheduledAtDate.toISOString()).toBe('2026-07-05T10:00:00.000Z');
  });

  it('derives mixed-cadence channel for legacy steps', () => {
    expect(resolveStep(seq, { ...baseStep, touchIndex: 1 }).channel).toBe('email');
    expect(resolveStep(seq, { ...baseStep, touchIndex: 3 }).channel).toBe('linkedin');
    expect(resolveStep(seq, { ...baseStep, touchIndex: 4 }).channel).toBe('telegram');
  });

  it('legacy linkedin-only sequences resolve every touch to linkedin', () => {
    const liSeq = { ...seq, channel: 'linkedin' };
    expect(resolveStep(liSeq, { ...baseStep, touchIndex: 2 }).channel).toBe('linkedin');
    expect(resolveStep(liSeq, { ...baseStep, touchIndex: 4 }).channel).toBe('linkedin');
  });

  it('derives scheduledAt from startedAt + delayDays for legacy steps', () => {
    const step = resolveStep(seq, { ...baseStep, delayDays: 3 });
    expect(step.scheduledAtDate.getTime()).toBe(new Date('2026-07-04T10:00:00Z').getTime());
  });
});

describe('send window', () => {
  // Defaults: Tue-Thu (2,3,4), 9-17, Europe/Berlin. 2026-07-08 is a Wednesday.
  it('accepts a Wednesday mid-morning in Berlin', () => {
    expect(isWithinSendWindow(new Date('2026-07-08T09:30:00+02:00'))).toBe(true);
  });

  it('rejects a Saturday', () => {
    expect(isWithinSendWindow(new Date('2026-07-11T11:00:00+02:00'))).toBe(false);
  });

  it('rejects a Wednesday evening after the window', () => {
    expect(isWithinSendWindow(new Date('2026-07-08T19:30:00+02:00'))).toBe(false);
  });

  it('nextSendWindowStart lands inside the window', () => {
    const next = nextSendWindowStart(new Date('2026-07-11T11:00:00+02:00'));
    expect(isWithinSendWindow(next)).toBe(true);
  });
});
