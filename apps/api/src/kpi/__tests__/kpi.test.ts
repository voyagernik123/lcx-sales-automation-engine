import { describe, it, expect } from 'vitest';
import { kpisToCsv, TRIGGER_TYPE_LABELS, TRIGGER_DAY_LABELS } from '../service.js';
import type { KpiDashboard } from '../service.js';

function makeMockKpis(overrides?: Partial<KpiDashboard>): KpiDashboard {
  return {
    newHighScoreLeadsThisWeek: 5,
    replyRateBySource: { esma_main: { sent: 100, replied: 25, rate: 25 } },
    replyRateByChannel: { email: { sent: 80, replied: 20, rate: 25 }, linkedin: { sent: 20, replied: 5, rate: 25 } },
    avgDaysFirstTouchToHandoff: 3,
    avgDaysHandoffToProposal: 7,
    avgDaysProposalToWon: 14,
    funnel: { enrolled: 200, replied: 50, proposal: 20, won: 5 },
    revenueByStream: { listing: 2000000, marketing: 0, liquidity: 0, dual: 0, emt: 0, custom: 0 },
    topObjections: [{ category: 'pricing', count: 5 }, { category: 'timeline', count: 3 }],
    stalledDeals: [
      { id: '1', projectName: 'Project A', stage: 'negotiating', daysSinceUpdate: 14, blocker: 'Price' },
    ],
    postListingExpansion: { totalWon: 5, withExpansion: 2, expansionRevenue: 1000000 },
    weeklyView: { hot: 3, stalled: 5, overdue: 2 },
    ...overrides,
  };
}

describe('kpisToCsv', () => {
  it('produces CSV with all sections', () => {
    const kpis = makeMockKpis();
    const csv = kpisToCsv(kpis);

    expect(csv).toContain('LCX Sales Automation — KPI Report');
    expect(csv).toContain('=== Lead Generation ===');
    expect(csv).toContain('=== Reply Rate by Channel ===');
    expect(csv).toContain('=== Reply Rate by Source ===');
    expect(csv).toContain('=== Timeline (avg days) ===');
    expect(csv).toContain('=== Funnel ===');
    expect(csv).toContain('=== Revenue by Stream (cents) ===');
    expect(csv).toContain('=== Top Objections ===');
    expect(csv).toContain('=== Weekly Operator View ===');
    expect(csv).toContain('=== Post-Listing Expansion ===');
  });

  it('includes correct KPI values', () => {
    const kpis = makeMockKpis();
    const csv = kpisToCsv(kpis);

    expect(csv).toContain('New High-Score Leads (7d),5');
    expect(csv).toContain('email,80,20,25');
    expect(csv).toContain('linkedin,20,5,25');
    expect(csv).toContain('esma_main,100,25,25');
    expect(csv).toContain('First Touch → Handoff,3');
    expect(csv).toContain('Handoff → Proposal,7');
    expect(csv).toContain('Proposal → Won,14');
    expect(csv).toContain('Enrolled,200');
    expect(csv).toContain('Replied,50');
    expect(csv).toContain('Proposal,20');
    expect(csv).toContain('Won,5');
    expect(csv).toContain('listing,2000000');
    expect(csv).toContain('pricing,5');
    expect(csv).toContain('timeline,3');
    expect(csv).toContain('Hot (active),3');
    expect(csv).toContain('Stalled (7-21d),5');
    expect(csv).toContain('Overdue (21d+),2');
    expect(csv).toContain('Total Won Deals,5');
    expect(csv).toContain('With Expansion,2');
    expect(csv).toContain('Expansion Revenue (cents),1000000');
  });

  it('handles null timeline values', () => {
    const kpis = makeMockKpis({ avgDaysFirstTouchToHandoff: null, avgDaysHandoffToProposal: null, avgDaysProposalToWon: null });
    const csv = kpisToCsv(kpis);

    expect(csv).toContain('First Touch → Handoff,N/A');
    expect(csv).toContain('Handoff → Proposal,N/A');
    expect(csv).toContain('Proposal → Won,N/A');
  });

  it('handles empty reply rates', () => {
    const kpis = makeMockKpis({ replyRateBySource: {}, replyRateByChannel: {} });
    const csv = kpisToCsv(kpis);

    expect(csv).not.toContain('undefined');
  });

  it('handles empty top objections', () => {
    const kpis = makeMockKpis({ topObjections: [] });
    const csv = kpisToCsv(kpis);

    expect(csv).not.toContain('undefined');
  });
});

describe('Trigger constants', () => {
  it('has labels for all trigger types', () => {
    expect(TRIGGER_TYPE_LABELS.campaign_upsell).toBe('Campaign Upsell');
    expect(TRIGGER_TYPE_LABELS.mm_referral).toBe('MM Referral');
    expect(TRIGGER_TYPE_LABELS.mica_legal).toBe('MiCA/Legal');
    expect(TRIGGER_TYPE_LABELS.trading_incentives).toBe('Trading Incentives');
  });

  it('has labels for all trigger days', () => {
    expect(TRIGGER_DAY_LABELS[30]).toBe('30-Day');
    expect(TRIGGER_DAY_LABELS[60]).toBe('60-Day');
    expect(TRIGGER_DAY_LABELS[90]).toBe('90-Day');
  });
});
