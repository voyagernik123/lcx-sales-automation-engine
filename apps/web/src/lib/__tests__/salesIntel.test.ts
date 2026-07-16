import { describe, it, expect } from 'vitest';
import {
  computeDealHealthSet,
  computePipelinePulse,
  computeReplySla,
  PLAYBOOK_STEPS,
} from '../salesIntel';
import type { BoardDeal } from '@/lib/api/bd';
import type { DealEvent } from '@/types/bd';

const NOW = Date.parse('2026-07-15T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

function deal(overrides: Partial<BoardDeal> = {}): BoardDeal {
  return {
    id: overrides.id ?? 'd1',
    projectId: 'p1',
    projectName: 'Test Protocol',
    projectTicker: 'TST',
    stage: 'proposal',
    packageType: 'listing',
    packageValue: 20_000_00,
    owner: 'operator',
    band: 'high',
    priorityScore: 70,
    daysSinceUpdate: 1,
    updatedAt: daysAgo(1),
    wonAt: null,
    ...overrides,
  };
}

function stageEvent(dealId: string, atDaysAgo: number): DealEvent {
  return {
    id: `e-${dealId}-${atDaysAgo}`,
    dealId,
    eventType: 'stage_change',
    actor: 'operator',
    oldStage: 'discovery',
    newStage: 'proposal',
    content: null,
    meta: {},
    createdAt: daysAgo(atDaysAgo),
  };
}

describe('computeReplySla', () => {
  it('walks fresh → aging → urgent → breached with age', () => {
    expect(computeReplySla(new Date(NOW - 0.5 * 3_600_000).toISOString(), NOW).state).toBe('fresh');
    expect(computeReplySla(new Date(NOW - 2 * 3_600_000).toISOString(), NOW).state).toBe('aging');
    expect(computeReplySla(new Date(NOW - 3.5 * 3_600_000).toISOString(), NOW).state).toBe('urgent');
    expect(computeReplySla(new Date(NOW - 5 * 3_600_000).toISOString(), NOW).state).toBe('breached');
  });
});

describe('computeDealHealthSet', () => {
  it('gives every deal a health record with why-signals', () => {
    const deals = [deal({ id: 'a' }), deal({ id: 'b', stage: 'contacted', priorityScore: 30 })];
    const health = computeDealHealthSet(deals, {}, NOW);
    expect(health.size).toBe(2);
    const a = health.get('a')!;
    expect(a.likelihood.signals.length).toBeGreaterThan(0);
    expect(a.likelihood.signals[0].detail).toBeTruthy();
    expect(a.playbook).toHaveLength(PLAYBOOK_STEPS.length);
  });

  it('ranks likelihood as a percentile across open deals', () => {
    const deals = [
      deal({ id: 'hot', stage: 'negotiating', priorityScore: 90, daysSinceUpdate: 0, updatedAt: daysAgo(0) }),
      deal({ id: 'mid', stage: 'discovery', priorityScore: 50, daysSinceUpdate: 3, updatedAt: daysAgo(3) }),
      deal({ id: 'cold', stage: 'contacted', priorityScore: 20, daysSinceUpdate: 20, updatedAt: daysAgo(20) }),
    ];
    const health = computeDealHealthSet(deals, {}, NOW);
    const hot = health.get('hot')!.likelihood;
    const cold = health.get('cold')!.likelihood;
    expect(hot.percentile).toBeGreaterThan(cold.percentile);
    expect(hot.band).toBe('high');
    expect(cold.band).toBe('low');
  });

  it('pins won to 100 and lost to 0', () => {
    const deals = [deal({ id: 'w', stage: 'won' }), deal({ id: 'l', stage: 'lost' }), deal({ id: 'o' })];
    const health = computeDealHealthSet(deals, {}, NOW);
    expect(health.get('w')!.likelihood.percentile).toBe(100);
    expect(health.get('l')!.likelihood.percentile).toBe(0);
  });

  it('emits a stalled warning when days-in-stage far exceeds the stage median', () => {
    // Three proposals: two recent (set the median low), one ancient.
    const deals = [
      deal({ id: 'fast1', updatedAt: daysAgo(2) }),
      deal({ id: 'fast2', updatedAt: daysAgo(3) }),
      deal({ id: 'slow', updatedAt: daysAgo(30), daysSinceUpdate: 30 }),
    ];
    const contexts = {
      fast1: { events: [stageEvent('fast1', 2)] },
      fast2: { events: [stageEvent('fast2', 3)] },
      slow: { events: [stageEvent('slow', 30)] },
    };
    const health = computeDealHealthSet(deals, contexts, NOW);
    const slow = health.get('slow')!;
    expect(slow.warnings.some(w => w.code === 'stalled')).toBe(true);
    const stalled = slow.warnings.find(w => w.code === 'stalled')!;
    expect(stalled.detail).toContain('30d in proposal');
    expect(stalled.mitigation).toBeTruthy();
    expect(health.get('fast1')!.warnings.some(w => w.code === 'stalled')).toBe(false);
  });

  it('flags single-threaded and overdue-close from context', () => {
    const deals = [deal({ id: 'a' })];
    const health = computeDealHealthSet(
      deals,
      { a: { contactCount: 1, expectedCloseAt: daysAgo(2) } },
      NOW,
    );
    const codes = health.get('a')!.warnings.map(w => w.code);
    expect(codes).toContain('single_threaded');
    expect(codes).toContain('overdue_close');
  });

  it('computes momentum from event deltas (7d vs prior 7d)', () => {
    const mk = (id: string, days: number[]): DealEvent[] =>
      days.map((d, i) => ({ ...stageEvent(id, d), id: `${id}-${i}`, eventType: 'note' }));
    const deals = [deal({ id: 'up' }), deal({ id: 'down' })];
    const health = computeDealHealthSet(
      deals,
      {
        up: { events: mk('up', [1, 2, 3, 9]) }, // 3 recent vs 1 prior
        down: { events: mk('down', [9, 10, 11]) }, // 0 recent vs 3 prior
      },
      NOW,
    );
    expect(health.get('up')!.momentum).toBe('accelerating');
    expect(health.get('down')!.momentum).toBe('cooling');
  });

  it('degrades gracefully with no context at all', () => {
    const health = computeDealHealthSet([deal({ id: 'bare', daysSinceUpdate: 15, updatedAt: daysAgo(15) })], {}, NOW);
    const bare = health.get('bare')!;
    expect(bare.momentum).toBe('cold');
    expect(bare.warnings.length).toBeGreaterThan(0); // silence warning fires
  });
});

describe('computePipelinePulse', () => {
  it('rolls up open deals, values, warnings and momentum buckets', () => {
    const deals = [
      deal({ id: 'a', daysSinceUpdate: 20, updatedAt: daysAgo(20) }),
      deal({ id: 'b', stage: 'won' }),
      deal({ id: 'c', stage: 'negotiating', packageValue: 50_000_00 }),
    ];
    const health = computeDealHealthSet(deals, {}, NOW);
    const pulse = computePipelinePulse(deals, health);
    expect(pulse.openCount).toBe(2); // won excluded
    expect(pulse.openValue).toBe(20_000_00 + 50_000_00);
    expect(pulse.cold).toBeGreaterThanOrEqual(1);
  });
});
