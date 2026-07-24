import { describe, expect, it } from 'vitest';
import {
  referralViralitySim, emissionBudget, questCacSim,
  channelMix, attributeChannels, presenceScore,
} from './distributionEngines.js';

describe('DISTRIBUTION growth engines (Phase 4)', () => {
  describe('referralViralitySim — K-factor', () => {
    it('computes k = links × conversion × referral and flags viral ≥ 1', () => {
      const r = referralViralitySim({ seedCreators: 100, paidLinkConversion: 0.5, linksPerCreator: 4, agentReferralRate: 0.6, creatorRewardLcx: 1, periods: 6 });
      // 4 × 0.5 × 0.6 = 1.2 → viral
      expect(r.kFactor).toBeCloseTo(1.2, 3);
      expect(r.viral).toBe(true);
    });

    it('flags a sub-1 loop as not viral and it decays', () => {
      const r = referralViralitySim({ seedCreators: 100, paidLinkConversion: 0.3, linksPerCreator: 2, agentReferralRate: 0.2, creatorRewardLcx: 1, periods: 8 });
      expect(r.kFactor).toBeCloseTo(0.12, 3);
      expect(r.viral).toBe(false);
    });

    it('is deterministic under a fixed seed', () => {
      const p = { seedCreators: 50, paidLinkConversion: 0.4, linksPerCreator: 3, agentReferralRate: 0.5, creatorRewardLcx: 1, periods: 5 };
      const a = referralViralitySim(p, { seed: 7, runs: 500 });
      const b = referralViralitySim(p, { seed: 7, runs: 500 });
      expect(a.cumulativeCreators).toEqual(b.cumulativeCreators);
    });

    it('reward cost scales with the per-link reward', () => {
      const base = { seedCreators: 100, paidLinkConversion: 0.5, linksPerCreator: 4, agentReferralRate: 0.4, periods: 4 };
      const one = referralViralitySim({ ...base, creatorRewardLcx: 1 }, { seed: 1 });
      const two = referralViralitySim({ ...base, creatorRewardLcx: 2 }, { seed: 1 });
      expect(two.rewardCostLcx.p50).toBe(one.rewardCostLcx.p50 * 2);
    });
  });

  describe('emissionBudget', () => {
    it('nets fee revenue against emission and reports utilization', () => {
      const r = emissionBudget({ projectedPaidLinks: 1000, creatorRewardLcx: 1, serviceFeeLcx: 1, treasuryBudgetLcx: 2000 });
      expect(r.emittedLcx).toBe(1000);
      expect(r.feeRevenueLcx).toBe(1000);
      expect(r.netTreasuryLcx).toBe(0);
      expect(r.budgetUtilizationPct).toBe(50);
      expect(r.status).toBe('healthy');
      expect(r.withinBudget).toBe(true);
    });

    it('flags breach past 100% of budget', () => {
      const r = emissionBudget({ projectedPaidLinks: 3000, creatorRewardLcx: 1, serviceFeeLcx: 1, treasuryBudgetLcx: 2000 });
      expect(r.status).toBe('breach');
      expect(r.withinBudget).toBe(false);
    });

    it('flags watch in the 80–100% band', () => {
      const r = emissionBudget({ projectedPaidLinks: 900, creatorRewardLcx: 2, serviceFeeLcx: 1, treasuryBudgetLcx: 2000 });
      expect(r.budgetUtilizationPct).toBe(90);
      expect(r.status).toBe('watch');
    });
  });

  describe('questCacSim', () => {
    it('estimates funded agents ~ budget/cac and blends CAC', () => {
      const r = questCacSim([
        { channelId: 'galxe', label: 'Galxe', budgetUsd: 10000, cacUsd: 50 },
        { channelId: 'layer3', label: 'Layer3', budgetUsd: 5000, cacUsd: 40 },
      ], { seed: 11 });
      // ~200 + ~125 = ~325 funded; blended ≈ 15000/325 ≈ 46
      expect(r.fundedAgents.p50).toBeGreaterThan(250);
      expect(r.fundedAgents.p50).toBeLessThan(420);
      expect(r.blendedCacP50).toBeGreaterThan(30);
      expect(r.totalBudgetUsd).toBe(15000);
    });

    it('excludes compliance-locked channels but names them', () => {
      const r = questCacSim([
        { channelId: 'galxe', label: 'Galxe', budgetUsd: 10000, cacUsd: 50 },
        { channelId: 'x', label: 'X promo', budgetUsd: 9999, cacUsd: 10, locked: true },
      ], { seed: 3 });
      expect(r.lockedChannels).toEqual(['X promo']);
      expect(r.totalBudgetUsd).toBe(10000); // locked budget excluded
    });

    it('ranks marginal efficiency (lower CAC = more funded per $1k)', () => {
      const r = questCacSim([
        { channelId: 'a', label: 'A', budgetUsd: 1000, cacUsd: 100 },
        { channelId: 'b', label: 'B', budgetUsd: 1000, cacUsd: 25 },
      ], { seed: 5 });
      expect(r.marginal[0]!.channelId).toBe('b');
    });
  });

  describe('channelMix', () => {
    const dims = [
      { key: 'reach', label: 'Reach', weight: 0.4 },
      { key: 'agentDensity', label: 'Agent density', weight: 0.4 },
      { key: 'cost', label: 'Cost (inverted)', weight: 0.2 },
    ];
    const rows = [
      { subjectId: 'x402_bazaar', subjectLabel: 'x402 Bazaar', scores: { reach: 4, agentDensity: 5, cost: 5 } },
      { subjectId: 'okx_ai', subjectLabel: 'OKX AI', scores: { reach: 5, agentDensity: 4, cost: 3 } },
      { subjectId: 'moltbook', subjectLabel: 'Moltbook', scores: { reach: 3, agentDensity: 3, cost: 4 } },
    ];

    it('rescores and ranks channels', () => {
      const r = channelMix(dims, rows);
      expect(r.rows).toHaveLength(3);
      expect(r.rows[0]!.rank).toBe(1);
      expect(r.rows[0]!.weighted).toBeGreaterThanOrEqual(r.rows[1]!.weighted);
    });

    it('reweighting shifts the ranking', () => {
      const costHeavy = channelMix(dims, rows, { reach: 0.1, agentDensity: 0.1, cost: 0.8 });
      // cost-dominant: x402 Bazaar (cost 5) should lead
      expect(costHeavy.rows[0]!.subjectId).toBe('x402_bazaar');
    });

    it('exposes rank-flip sensitivity', () => {
      const r = channelMix(dims, rows);
      expect(Array.isArray(r.sensitivity)).toBe(true);
      expect(r.sensitivity.length).toBe(dims.length);
    });
  });

  describe('attributeChannels', () => {
    it('merges signals per channel and computes share', () => {
      const r = attributeChannels([
        { channelId: 'galxe', kind: 'utm', fundedAgents: 30 },
        { channelId: 'galxe', kind: 'onchain', fundedAgents: 20 },
        { channelId: 'okx_ai', kind: 'referral_code', fundedAgents: 50 },
      ]);
      expect(r.totalFunded).toBe(100);
      const galxe = r.byChannel.find((c) => c.channelId === 'galxe')!;
      expect(galxe.fundedAgents).toBe(50);
      expect(galxe.byKind.utm).toBe(30);
      expect(galxe.byKind.onchain).toBe(20);
      expect(galxe.sharePct).toBe(50);
    });

    it('handles the empty case', () => {
      const r = attributeChannels([]);
      expect(r.totalFunded).toBe(0);
      expect(r.byChannel).toEqual([]);
    });
  });

  describe('presenceScore', () => {
    it('is zero when nothing is live', () => {
      const r = presenceScore([
        { surfaceId: 'a', label: 'A', status: 'not_started' },
        { surfaceId: 'b', label: 'B', status: 'not_started' },
      ]);
      expect(r.presenceScore).toBe(0);
    });

    it('rewards live + ranked surfaces and usage/rank lift', () => {
      const r = presenceScore([
        { surfaceId: 'a', label: 'A', status: 'ranked', usage: 1, rank: 1 },
        { surfaceId: 'b', label: 'B', status: 'not_started' },
      ]);
      expect(r.surfaces[0]!.surfaceId).toBe('a');
      expect(r.surfaces[0]!.score).toBeGreaterThan(80);
      expect(r.presenceScore).toBeGreaterThan(0);
      expect(r.presenceScore).toBeLessThan(100);
    });
  });
});
