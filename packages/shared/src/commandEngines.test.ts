import { describe, expect, it } from 'vitest';
import {
  rescore, sensitivity, analyzeSet, parseSpreadBps, rfiEconomics,
  waitlistSim, listingReadiness, tokenDdScore, programReadiness,
  type EngineDim, type EngineRow,
} from './commandEngines.js';

const DIMS: EngineDim[] = [
  { key: 'reg', label: 'US Reg', weight: 0.5 },
  { key: 'liq', label: 'Liquidity', weight: 0.3 },
  { key: 'oes', label: 'OES', weight: 0.2 },
];
const ROWS: EngineRow[] = [
  { subjectId: 'a', subjectLabel: 'Alpha', scores: { reg: 5, liq: 3, oes: 3 } },
  { subjectId: 'b', subjectLabel: 'Beta', scores: { reg: 3, liq: 5, oes: 5 } },
  { subjectId: 'c', subjectLabel: 'Gamma', scores: { reg: 2, liq: 2, oes: 2 } },
];

describe('LP optimizer — rescore', () => {
  it('computes weighted scores and ranks deterministically', () => {
    const r = rescore(DIMS, ROWS);
    expect(r[0].subjectId).toBe('a'); // 5*.5+3*.3+3*.2 = 4.0 vs b: 3*.5+5*.3+5*.2 = 4.0 → tie broken by label
    expect(r[0].weighted).toBe(4.0);
    expect(r[1].weighted).toBe(4.0);
    expect(r[2].subjectId).toBe('c');
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3]);
  });

  it('weight overrides re-rank (liquidity-heavy flips Beta to #1)', () => {
    const r = rescore(DIMS, ROWS, { reg: 0.1, liq: 0.6, oes: 0.3 });
    expect(r[0].subjectId).toBe('b');
  });

  it('normalizes weights that do not sum to 1', () => {
    const a = rescore(DIMS, ROWS, { reg: 5, liq: 3, oes: 2 }); // 10x scale
    const b = rescore(DIMS, ROWS, { reg: 0.5, liq: 0.3, oes: 0.2 });
    expect(a[0].weighted).toBeCloseTo(b[0].weighted, 5);
  });

  it('throws on all-zero weights', () => {
    expect(() => rescore(DIMS, ROWS, { reg: 0, liq: 0, oes: 0 })).toThrow();
  });
});

describe('LP optimizer — sensitivity', () => {
  it('finds the flip weight where #1 and #2 tie', () => {
    const s = sensitivity(DIMS, ROWS);
    const reg = s.find((x) => x.dimKey === 'reg')!;
    // Alpha leads on reg; shrinking reg weight flips toward Beta somewhere below 0.5.
    expect(reg.flipWeight).not.toBeNull();
    expect(reg.flipWeight!).toBeLessThanOrEqual(0.5);
    expect(reg.gapPerHundredth).toBeGreaterThan(0); // more reg weight widens Alpha's lead
  });

  it('returns empty for <2 rows', () => {
    expect(sensitivity(DIMS, [ROWS[0]])).toEqual([]);
  });
});

describe('LP optimizer — set analysis', () => {
  it('reports strengths, gaps and concentration for a chosen set', () => {
    const a = analyzeSet(DIMS, ROWS, ['a', 'b']);
    expect(a.strengths.map((s) => s.dimKey).sort()).toEqual(['liq', 'oes', 'reg']);
    expect(a.gaps).toEqual([]);
    expect(a.concentration).toBeGreaterThan(0.49); // two equal members ≈ 0.5
    const solo = analyzeSet(DIMS, ROWS, ['c']);
    expect(solo.gaps.length).toBe(3); // Gamma covers nothing at ≥4
    expect(solo.concentration).toBe(1);
  });
});

describe('RFI economics', () => {
  it('parses spread ranges, en-dashes and plain numbers', () => {
    expect(parseSpreadBps('2–4')).toBe(3);
    expect(parseSpreadBps('5-12')).toBe(8.5);
    expect(parseSpreadBps(7)).toBe(7);
    expect(parseSpreadBps('n/a')).toBeNull();
    expect(parseSpreadBps(null)).toBeNull();
  });

  it('blends by volume mix and prices monthly cost', () => {
    const e = rfiEconomics(
      { partnerId: 'p', label: 'P', btcEthSpreadBps: '2–4', majorsSpreadBps: '5-12', altSpreadBps: '20–60', credit: 'Bilateral credit', settlementCycle: '24/7 / T+1', oes: 'Fireblocks' },
      { btcEthPct: 60, majorsPct: 30, altsPct: 10, monthlyVolumeUsd: 10_000_000 },
    );
    // 3*.6 + 8.5*.3 + 40*.1 = 1.8+2.55+4 = 8.35
    expect(e.blendedBps).toBe(8.35);
    expect(e.monthlyCostUsd).toBe(8350);
    expect(e.qualityScore).toBe(5);
    expect(e.missing).toEqual([]);
  });

  it('reports missing spreads only for classes actually traded', () => {
    const e = rfiEconomics({ partnerId: 'p', label: 'P', btcEthSpreadBps: '2-4' }, { btcEthPct: 100, majorsPct: 0, altsPct: 0, monthlyVolumeUsd: 1_000_000 });
    expect(e.blendedBps).toBe(3);
    expect(e.missing).toEqual([]);
    const e2 = rfiEconomics({ partnerId: 'p', label: 'P' }, { btcEthPct: 50, majorsPct: 50, altsPct: 0, monthlyVolumeUsd: 1 });
    expect(e2.blendedBps).toBeNull();
    expect(e2.missing).toContain('BTC/ETH spread');
  });
});

describe('waitlist Monte Carlo', () => {
  const CHANNELS = [
    { channelId: 'ads', label: 'Ads', type: 'Paid', budget: 30000, cac: 35 },
    { channelId: 'base', label: 'Warm base', type: 'Organic', budget: 0, cac: null, organicSignups: 8000 },
    { channelId: 'main', label: 'Mainstream', type: 'Paid', budget: 15000, cac: 90, locked: true },
  ];
  const PARAMS = { waitlistToVerified: 0.55, verifiedToFunded: 0.45 };

  it('is deterministic for a fixed seed and respects locks', () => {
    const a = waitlistSim(CHANNELS, PARAMS, { runs: 500, seed: 9 });
    const b = waitlistSim(CHANNELS, PARAMS, { runs: 500, seed: 9 });
    expect(a.funded.p50).toBe(b.funded.p50);
    expect(a.lockedChannels).toEqual(['Mainstream']);
    expect(a.totalPaidBudget).toBe(30000); // locked channel's budget excluded
  });

  it('produces ordered percentiles and sane magnitudes', () => {
    const r = waitlistSim(CHANNELS, PARAMS, { runs: 1000, seed: 3 });
    expect(r.waitlist.p10).toBeLessThanOrEqual(r.waitlist.p50);
    expect(r.waitlist.p50).toBeLessThanOrEqual(r.waitlist.p90);
    // ~30000/35 ≈ 857 paid + ~8000 organic ⇒ p50 in a plausible band
    expect(r.waitlist.p50).toBeGreaterThan(6000);
    expect(r.waitlist.p50).toBeLessThan(12000);
    expect(r.funded.p50).toBeLessThan(r.verified.p50);
  });

  it('ranks marginal spend by CAC efficiency', () => {
    const r = waitlistSim(
      [...CHANNELS, { channelId: 'kol', label: 'KOL', type: 'Paid', budget: 5000, cac: 45 }],
      PARAMS, { runs: 200, seed: 1 },
    );
    expect(r.marginal[0].channelId).toBe('ads'); // cheapest CAC first
    expect(r.marginal[0].fundedPerExtra1k).toBeCloseTo((1000 / 35) * 0.55 * 0.45, 0);
  });
});

describe('listing readiness', () => {
  const BLOCKERS = [
    { num: 1, severity: 'Critical', category: 'Legal', status: 'open' },
    { num: 2, severity: 'High', category: 'Licensing', status: 'mitigating' },
    { num: 3, severity: 'Medium', category: 'Ops', status: 'resolved' },
  ];
  const REQS = [
    { num: 1, path: 'Both', status: 'Done' },
    { num: 2, path: 'Both', status: 'In progress' },
    { num: 3, path: 'B', status: 'Not started' },
    { num: 4, path: 'A', status: 'Done' },
  ];

  it('scores path-aware (Path B requirement excluded on Path A)', () => {
    const a = listingReadiness(BLOCKERS, REQS, 'A');
    const b = listingReadiness(BLOCKERS, REQS, 'B');
    expect(a.score).toBeGreaterThanOrEqual(0);
    expect(a.requirementScore).not.toBe(b.requirementScore); // different requirement sets
    // blockers: (0 + 1 + 1)/(3+2+1) = 2/6 → 33
    expect(a.blockerScore).toBe(33);
  });

  it('all resolved + done → 100', () => {
    const r = listingReadiness(
      BLOCKERS.map((b) => ({ ...b, status: 'resolved' })),
      REQS.map((q) => ({ ...q, status: 'Done' })), 'A',
    );
    expect(r.score).toBe(100);
  });
});

describe('token DD', () => {
  const DIMS2 = [
    { dimension: 'Legal (GATE)', weightPct: 30, gate: true },
    { dimension: 'Disclosure', weightPct: 40, gate: false },
    { dimension: 'Technical', weightPct: 30, gate: false },
  ];

  it('hard-gates without counsel opinion regardless of scores', () => {
    const r = tokenDdScore(DIMS2, { 'Legal (GATE)': 5, Disclosure: 5, Technical: 5 }, false);
    expect(r.gated).toBe(true);
    expect(r.score).toBeNull();
  });

  it('scores weighted 0–100 when the gate passes', () => {
    const r = tokenDdScore(DIMS2, { 'Legal (GATE)': 5, Disclosure: 4, Technical: 3 }, true);
    expect(r.gated).toBe(false);
    // 30 + 32 + 18 = 80
    expect(r.score).toBe(80);
  });
});

describe('program readiness composite', () => {
  it('weights the five dials into one 0–100 score', () => {
    const r = programReadiness({
      gatingDone: 5, gatingTotal: 10,
      blockers: [{ num: 1, severity: 'High', category: 'X', status: 'resolved' }],
      requirements: [{ num: 1, path: 'Both', status: 'Done' }],
      lpsCommitted: 3, lpTarget: 3,
      growthFoundation: 0.5,
    });
    // gating 50*.35 + blockers 100*.25 + reqs 100*.15 + lp 100*.15 + growth 50*.1 = 17.5+25+15+15+5 = 77.5 → 78
    expect(r.score).toBe(78);
    expect(r.dials).toHaveLength(5);
    expect(r.dials.reduce((s, d) => s + d.weight, 0)).toBeCloseTo(1);
  });

  it('zero inputs → zero, never NaN', () => {
    const r = programReadiness({ gatingDone: 0, gatingTotal: 0, blockers: [], requirements: [], lpsCommitted: 0, lpTarget: 0, growthFoundation: 0 });
    expect(r.score).toBe(0);
  });
});
