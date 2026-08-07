import { describe, expect, it } from 'vitest';
import {
  rescore, rescoreDetailed, sensitivity, analyzeSet, parseSpreadBps, rfiEconomics,
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

/**
 * ABSENT IS NOT ZERO — the defect recorded as owed in docs/SECURITY_FINDINGS_2026-08-07.md.
 *
 * `rescore` used to do `(r.scores[d.key] ?? 0)`, so a subject that simply OMITTED a
 * dimension was scored a genuine zero on it and then RANKED against subjects that had been
 * scored on everything. Every test below is written to fail loudly if that line comes back.
 */
describe('LP optimizer — an omitted dimension is not a zero (rescore)', () => {
  // Alpha is scored on `reg` alone. Under the old formula: 5×0.5 + 0×0.3 + 0×0.2 = 2.5,
  // which sorts it BELOW fully-scored Beta (4.0) on the strength of two invented zeroes.
  const PARTIAL: EngineRow[] = [
    { subjectId: 'p', subjectLabel: 'Partial', scores: { reg: 5 } },
    { subjectId: 'b', subjectLabel: 'Beta', scores: { reg: 3, liq: 5, oes: 5 } },
  ];

  it('renormalizes over the dimensions the row actually has', () => {
    const r = rescore(DIMS, PARTIAL);
    const p = r.find((x) => x.subjectId === 'p')!;
    expect(p.weighted).toBe(5);
    expect(p.weighted).not.toBe(2.5); // 2.5 is the old `?? 0` answer, exactly
    expect(p.rank).toBe(1);
  });

  it('carries how many dimensions it was judged on, and which were missing', () => {
    const p = rescore(DIMS, PARTIAL).find((x) => x.subjectId === 'p')!;
    expect(p.scoredDims).toBe(1);
    expect(p.totalDims).toBe(3);
    expect(p.partial).toBe(true);
    expect(p.absentDims.sort()).toEqual(['liq', 'oes']);
  });

  it('leaves a fully-scored row bit-identical to the old arithmetic', () => {
    // The whole point of the safety argument: renormalizing over ALL dimensions is
    // dividing by the same sum, so nothing that is completely scored moves.
    const r = rescore(DIMS, ROWS);
    expect(r.map((x) => x.weighted)).toEqual([4.0, 4.0, 2.0]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3]);
    expect(r.every((x) => x.partial === false && x.scoredDims === 3)).toBe(true);
  });

  it('a fully-scored row is bit-identical to the pre-change expression, across the sensitivity grid', () => {
    /**
     * THE SAFETY ARGUMENT, EXECUTED INSTEAD OF ASSERTED.
     *
     * The change was defended as "for a fully-scored row the denominator is the full
     * weight sum, so the arithmetic is identical". That is true in real arithmetic and
     * FALSE IN DOUBLES: `sum(v·w)/S` is not `sum(v·w/S)` bit for bit. Swept over the real
     * seed at the same 0.005 resolution `sensitivity` scans, 55 of 3,630 points crossed a
     * 2-dp rounding boundary and four of `arch`'s eight published rank-flip thresholds
     * moved a whole scan step (0.46→0.465, 0.40→0.405, 0.43→0.435, 0.38→0.385).
     *
     * `weighted` is rounded to 2dp, so a divergence is invisible at every weight except
     * the ones sitting on a .xx5 boundary — which is exactly why eyeballing a handful of
     * numbers passed it. This sweeps a grid instead, and asserts against the literal old
     * expression recomputed here rather than against remembered constants.
     */
    const oldExpression = (dims: EngineDim[], row: EngineRow, ov: Record<string, number>) => {
      const w: Record<string, number> = {};
      let sum = 0;
      for (const d of dims) { const v = Math.max(0, ov[d.key] ?? d.weight); w[d.key] = v; sum += v; }
      let acc = 0;
      for (const d of dims) acc += (row.scores[d.key] ?? 0) * (w[d.key]! / sum);
      return Math.round(acc * 100) / 100;
    };
    // Scores chosen to land on rounding boundaries under this weight grid; the assertion
    // does not depend on that, but without it the sweep would be vacuously green.
    const rows: EngineRow[] = [
      { subjectId: 'a', subjectLabel: 'A', scores: { reg: 4, liq: 3, oes: 5 } },
      { subjectId: 'b', subjectLabel: 'B', scores: { reg: 3, liq: 5, oes: 2 } },
      { subjectId: 'c', subjectLabel: 'C', scores: { reg: 5, liq: 2, oes: 4 } },
    ];
    let compared = 0;
    for (const d of DIMS) {
      for (let wk = 0; wk <= 0.6001; wk += 0.005) {
        const ov: Record<string, number> = {};
        for (const dd of DIMS) ov[dd.key] = dd.key === d.key ? wk : dd.weight;
        const got = rescore(DIMS, rows, ov);
        for (const r of got) {
          const want = oldExpression(DIMS, rows.find((x) => x.subjectId === r.subjectId)!, ov);
          compared++;
          if (r.weighted !== want) {
            throw new Error(
              `fully-scored row "${r.subjectId}" diverged from the pre-change expression at ` +
              `${d.key}=${wk.toFixed(3)}: got ${r.weighted}, the old engine gave ${want}. ` +
              `sum(v·w)/S is not sum(v·w/S) in doubles — the fully-scored path must keep the ` +
              `original terms, not be re-derived from the renormalized one.`,
            );
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(1000); // the sweep ran, rather than matching nothing
  });

  it('treats a REAL zero as a measurement, not as absence', () => {
    // The half of "absent is not zero" that is easy to break while fixing the other half.
    const r = rescore(DIMS, [{ subjectId: 'z', subjectLabel: 'Zero', scores: { reg: 0, liq: 0, oes: 0 } }]);
    expect(r).toHaveLength(1);
    expect(r[0]!.weighted).toBe(0);
    expect(r[0]!.scoredDims).toBe(3);
    expect(r[0]!.partial).toBe(false);
    expect(r[0]!.absentDims).toEqual([]);
  });

  it('keeps not-scored, withheld and malformed apart instead of collapsing them', () => {
    const row = {
      subjectId: 'm', subjectLabel: 'Mixed',
      scores: { reg: 5, liq: null, oes: NaN } as unknown as Record<string, number>,
    };
    const r = rescore(DIMS, [row])[0]!;
    expect(r.absentDims).toEqual([]);           // nothing is simply missing
    expect(r.withheldDims).toEqual(['liq']);    // explicitly recorded as having no value
    expect(r.malformedDims).toEqual(['oes']);   // present, but not a number
    expect(r.scoredDims).toBe(1);
    // `??` never caught NaN, so the old code let it into `weighted` and from there into
    // the sort comparator, whose ordering for NaN is implementation-defined.
    expect(Number.isFinite(r.weighted)).toBe(true);
    expect(r.weighted).toBe(5);
  });
});

describe('LP optimizer — a row with nothing scored cannot be ranked at all', () => {
  const WITH_EMPTY: EngineRow[] = [
    ...ROWS,
    { subjectId: 'void', subjectLabel: 'Unscored Co', scores: {} },
  ];

  it('refuses the row with a stable code instead of sorting it last on invented zeroes', () => {
    const { ranked, unrankable } = rescoreDetailed(DIMS, WITH_EMPTY);
    expect(ranked.map((r) => r.subjectId)).not.toContain('void');
    expect(unrankable).toHaveLength(1);
    expect(unrankable[0]!.code).toBe('ENGINE_ROW_NO_DIMENSIONS_SCORED');
    expect(unrankable[0]!.subjectId).toBe('void');
    expect(unrankable[0]!.scoredDims).toBe(0);
    expect(unrankable[0]!.absentDims.sort()).toEqual(['liq', 'oes', 'reg']);
    // The refusal cites the rule it is applying, not just that it failed.
    expect(unrankable[0]!.permitted).toMatch(/at least 1 dimension/);
  });

  it('never gives the unscored row a weighted score of zero', () => {
    // The precise old behaviour: rank 4, weighted 0.00, printed beside three real scores
    // as though it had been assessed and found worthless.
    const { ranked } = rescoreDetailed(DIMS, WITH_EMPTY);
    expect(ranked).toHaveLength(3);
    expect(ranked.some((r) => r.weighted === 0)).toBe(false);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('separates "scored on nothing" from "scored only where the weight is zero"', () => {
    // Two different facts. The first says nobody assessed the subject; the second says
    // this WEIGHTING is silent about a subject that was assessed.
    const { ranked, unrankable } = rescoreDetailed(
      DIMS,
      [{ subjectId: 'w', subjectLabel: 'Zero-weight', scores: { liq: 5 } }, ROWS[0]!],
      { reg: 1, liq: 0, oes: 1 },
    );
    expect(ranked.map((r) => r.subjectId)).toEqual(['a']);
    expect(unrankable[0]!.code).toBe('ENGINE_ROW_SCORED_DIMENSIONS_CARRY_NO_WEIGHT');
    expect(unrankable[0]!.scoredDims).toBe(1); // it WAS scored — that is the distinction
  });

  it('rescore() keeps its old signature so out-of-lane .toFixed(2) callers still work', () => {
    // GrowthEngines.tsx:78 and CockpitPanels.tsx:145,147 call .toFixed(2) on every element.
    const r = rescore(DIMS, WITH_EMPTY);
    expect(Array.isArray(r)).toBe(true);
    expect(() => r.map((x) => x.weighted.toFixed(2))).not.toThrow();
    expect(r.every((x) => typeof x.weighted === 'number' && Number.isFinite(x.weighted))).toBe(true);
  });
});

describe('LP optimizer — sensitivity survives a row that is unrankable mid-scan', () => {
  it('does not throw when driving a weight to zero strands a partially-scored leader', () => {
    // THE CRASH RENORMALIZING INTRODUCED, pinned. `sensitivity` scans one dimension's
    // weight down to 0. `Partial` is scored ONLY on `reg`, so at reg=0 its renormalizing
    // denominator is zero, it becomes unrankable, and it drops out of the rescored array —
    // where the old `rs.find(...)!` asserted non-null and would read `.weighted` of
    // undefined. That is a TypeError, not a wrong number.
    const rows: EngineRow[] = [
      { subjectId: 'p', subjectLabel: 'Partial', scores: { reg: 5 } },
      { subjectId: 'b', subjectLabel: 'Beta', scores: { reg: 3, liq: 5, oes: 5 } },
      { subjectId: 'c', subjectLabel: 'Gamma', scores: { reg: 2, liq: 2, oes: 2 } },
    ];
    expect(() => sensitivity(DIMS, rows)).not.toThrow();
    const s = sensitivity(DIMS, rows);
    expect(s).toHaveLength(3);
    // Unevaluable is null, and null is not 0 — 0 would claim the gap does not move.
    const reg = s.find((x) => x.dimKey === 'reg')!;
    expect(reg.gapPerHundredth === null || Number.isFinite(reg.gapPerHundredth)).toBe(true);
  });

  it('still finds the flip on fully-scored rows', () => {
    // The unchanged case must stay unchanged.
    const reg = sensitivity(DIMS, ROWS).find((x) => x.dimKey === 'reg')!;
    expect(reg.flipWeight).not.toBeNull();
    expect(reg.gapPerHundredth).not.toBeNull();
  });
});

describe('LP optimizer — an unassessed dimension is not a gap (analyzeSet)', () => {
  it('reports best=null and unassessed=true rather than best=0', () => {
    // `best` was `max(scores[key] ?? 0)`. A dimension nobody in the set had been scored on
    // came back as `best: 0` and was published as a gap — an assertion that the set is
    // uniformly terrible at something nobody ever looked at.
    const a = analyzeSet(DIMS, [{ subjectId: 'u', subjectLabel: 'Unscored on two', scores: { reg: 5 } }], ['u']);
    expect(a.strengths.map((s) => s.dimKey)).toEqual(['reg']);
    const liq = a.gaps.find((g) => g.dimKey === 'liq')!;
    expect(liq.best).toBeNull();
    expect(liq.best).not.toBe(0);
    expect(liq.unassessed).toBe(true);
  });

  it('a set genuinely scored low is still a gap, with its real number', () => {
    const solo = analyzeSet(DIMS, ROWS, ['c']); // Gamma scored 2 everywhere
    expect(solo.gaps).toHaveLength(3);
    expect(solo.gaps.every((g) => g.best === 2 && g.unassessed === false)).toBe(true);
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
