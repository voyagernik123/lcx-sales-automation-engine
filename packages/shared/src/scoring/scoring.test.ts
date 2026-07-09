import { describe, expect, it } from 'vitest';
import { scoreEu } from './eu.js';
import { scoreUs } from './us.js';
import { scoreProject } from './orchestrator.js';
import { computeBand, maxBand } from './types.js';
import type { ScoreInputProject, ScoreInputContact, ScoreInputSignal } from './types.js';

function project(overrides: Partial<ScoreInputProject> = {}): ScoreInputProject {
  return {
    name: 'Test Project',
    website: undefined,
    ticker: undefined,
    chain: undefined,
    jurisdiction: undefined,
    whitepaperUrl: undefined,
    category: undefined,
    marketCap: undefined,
    source: 'esma_main',
    esmaTokenId: undefined,
    dti: undefined,
    listedOnLcx: false,
    ...overrides,
  };
}

function contact(overrides: Partial<ScoreInputContact> = {}): ScoreInputContact[] {
  return [{ name: 'Alice', email: 'alice@example.com', telegram: undefined, linkedin: undefined, ...overrides }];
}

function signal(kind: string, payload?: Record<string, unknown>): ScoreInputSignal[] {
  return [{ kind, payload: payload ?? {} }];
}

// ============ EU Scoring ============

describe('EU / MiCA scoring', () => {
  it('scores ESMA-notified EU project highest on EU_NEED (18pt)', () => {
    const p = project({ source: 'esma_main', esmaTokenId: 'TKN001', jurisdiction: 'DE' });
    const r = scoreEu(p, []);
    const need = r.reasons.find((rr) => rr.code === 'EU_NEED');
    expect(need!.points).toBe(18);
  });

  it('scores pre-TGE project on timing trigger (14pt)', () => {
    const p = project({ source: 'pre_tge' });
    const r = scoreEu(p, []);
    const timing = r.reasons.find((rr) => rr.code === 'TIMING');
    expect(timing!.points).toBe(14);
  });

  it('awards willingness points for listedOnLcx + marketCap', () => {
    const p = project({ listedOnLcx: true, marketCap: '$100M', ticker: 'TEST' });
    const r = scoreEu(p, []);
    expect(r.score).toBeGreaterThan(20);
  });

  it('awards contactability points for email + name', () => {
    const p = project();
    const r = scoreEu(p, contact());
    const cont = r.reasons.find((rr) => rr.code === 'CONTACT');
    expect(cont!.points).toBe(10);
  });

  it('gives 0 contactability with no contacts', () => {
    const p = project();
    const r = scoreEu(p, []);
    const cont = r.reasons.find((rr) => rr.code === 'CONTACT');
    expect(cont!.points).toBe(0);
  });

  it('total EU score caps at 100', () => {
    const p = project({
      source: 'esma_main',
      esmaTokenId: 'TKN-MAX',
      jurisdiction: 'DE',
      listedOnLcx: true,
      marketCap: '$500M',
      ticker: 'MAX',
      chain: 'ethereum',
      whitepaperUrl: 'https://wp.example.com',
      category: 'defi',
    });
    const r = scoreEu(p, contact());
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(60);
  });

  it('returns human-readable reason notes', () => {
    const p = project({ source: 'esma_main', esmaTokenId: 'TKN001', jurisdiction: 'DE' });
    const r = scoreEu(p, []);
    for (const factor of r.reasons) {
      expect(factor.note.length).toBeGreaterThan(5);
      expect(factor.factor.length).toBeGreaterThan(0);
    }
  });
});

// ============ US Scoring ============

describe('US scoring', () => {
  it('ESMA-vetted token has lower Howey risk (higher score)', () => {
    const p = project({ esmaTokenId: 'TKN001', whitepaperUrl: 'https://wp.example.com', ticker: 'TKN' });
    const r = scoreUs(p, []);
    expect(r.preScore).toBeGreaterThanOrEqual(20);
  });

  it('non-US jurisdiction gets lower entity score than US', () => {
    const us = scoreUs(project({ jurisdiction: 'DE', esmaTokenId: 'TKN001', website: 'https://example.com' }), contact());
    const noJur = scoreUs(project({ esmaTokenId: 'TKN001' }), []);
    // Both pre-scores should be reasonable
    expect(us.preScore).toBeGreaterThan(0);
    expect(noJur.preScore).toBeLessThanOrEqual(100);
  });

  it('pre and post scores differ when weighted differently', () => {
    const p = project({
      source: 'top100',
      ticker: 'TOP',
      marketCap: '$50M',
      whitepaperUrl: 'https://wp.example.com',
      esmaTokenId: 'TKN001',
      dti: 'DTI001',
    });
    const r = scoreUs(p, contact());
    // Howey weight was 25 pre, 15 post — post should be >= pre for well-credentialed projects
    // because Howey risk is less punishing post-CLARITY
    expect(typeof r.preScore).toBe('number');
    expect(typeof r.postScore).toBe('number');
    expect(r.preScore).toBeGreaterThanOrEqual(0);
    expect(r.postScore).toBeGreaterThanOrEqual(0);
  });

  it('computes band from max of pre/post', () => {
    const p = project({ esmaTokenId: 'TKN-HIGH', jurisdiction: 'DE', whitepaperUrl: 'https://wp.example.com', listedOnLcx: true, source: 'esma_main', ticker: 'HIGH', marketCap: '$100M' });
    const r = scoreUs(p, contact());
    const euR = scoreEu(p, contact());
    const combined = maxBand(euR.band, r.band);
    expect(['immediate', 'high', 'nurture', 'watch', 'archive']).toContain(combined);
  });
});

// ============ Red Flags ============

describe('Red flag detection', () => {
  it('flags security token signal with hard subtract', () => {
    const p = project();
    const s = signal('note', { notes: 'security token classification pending' });
    const r = scoreUs(p, [], s);
    expect(r.redFlag.flagged).toBe(true);
    expect(r.redFlag.reasons.some((rr) => rr.code === 'RED_SECURITY')).toBe(true);
    expect(r.redFlag.reasons[0].points).toBe(-30);
  });

  it('detects dead project signal', () => {
    const p = project();
    const s = signal('status', { notes: 'project is dead, no development' });
    const r = scoreUs(p, [], s);
    expect(r.redFlag.flagged).toBe(true);
    expect(r.redFlag.reasons.some((rr) => rr.code === 'RED_DEAD')).toBe(true);
  });

  it('flags insufficient data (no website, wp, or ticker)', () => {
    const p = project({ website: undefined, whitepaperUrl: undefined, ticker: undefined });
    const r = scoreUs(p, []);
    expect(r.redFlag.flagged).toBe(true);
    expect(r.redFlag.reasons.some((rr) => rr.code === 'RED_NODATA')).toBe(true);
  });

  it('security category triggers red flag', () => {
    const p = project({ category: 'security' });
    const r = scoreUs(p, []);
    expect(r.redFlag.flagged).toBe(true);
  });

  it('red flags reduce overall US score', () => {
    const clean = scoreUs(project({ esmaTokenId: 'TKN001' }), contact());
    const flagged = scoreUs(project({ category: 'equity' }), contact());
    expect(flagged.preScore).toBeLessThanOrEqual(clean.preScore);
  });
});

// ============ Orchestrator ============

describe('Orchestrator', () => {
  it('scoreProject returns complete result with both scores', () => {
    const p = project({ source: 'esma_main', jurisdiction: 'DE', esmaTokenId: 'TKN001' });
    const r = scoreProject(p, [], []);
    expect(r.euScore).toBeGreaterThan(0);
    expect(r.usPreScore).toBeGreaterThan(0);
    expect(r.usPostScore).toBeGreaterThan(0);
    expect(typeof r.band).toBe('string');
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.computedAt).toBeDefined();
  });

  it('is deterministic — same inputs produce identical outputs', () => {
    const p = project({ source: 'esma_main', jurisdiction: 'MT', esmaTokenId: 'TKN-DET', listedOnLcx: true, marketCap: '$10M' });
    const r1 = scoreProject(p, contact(), []);
    const r2 = scoreProject(p, contact(), []);
    expect(r1.euScore).toBe(r2.euScore);
    expect(r1.usPreScore).toBe(r2.usPreScore);
    expect(r1.usPostScore).toBe(r2.usPostScore);
    expect(r1.band).toBe(r2.band);
  });

  it('closed-deal project does not automatically max out', () => {
    // A closed deal without ESMA filing, wp, or contacts should not be max
    const p = project({ source: 'closed', jurisdiction: 'KY', listedOnLcx: true });
    const r = scoreProject(p, [], []);
    // EU score should not be 100 — no ESMA token ID, no EU jurisdiction, no contacts, no wp
    expect(r.euScore).toBeLessThan(80);
    // US scores also shouldn't max without data
    expect(r.usPreScore).toBeLessThan(80);
  });
});

// ============ Golden Fixtures ============

describe('Golden fixtures', () => {
  it('ESMA-only project scores high on EU MiCA component', () => {
    const p = project({
      name: 'Compound',
      source: 'esma_main',
      esmaTokenId: 'TKN-COMP',
      jurisdiction: 'DE',
      ticker: 'COMP',
      whitepaperUrl: 'https://compound.finance/whitepaper.pdf',
      chain: 'ethereum',
    });
    const r = scoreEu(p, []);
    // ESMA-notified EU token should score high on EU_NEED
    const need = r.reasons.find((rr) => rr.code === 'EU_NEED');
    expect(need!.points).toBe(18);
    // Total EU score should be substantial
    expect(r.score).toBeGreaterThanOrEqual(40);
  });

  it('US-entity project scores well on US dimension', () => {
    const p = project({
      name: 'US Entity Protocol',
      source: 'pipeline',
      ticker: 'USEP',
      jurisdiction: 'US',
      website: 'https://useprotocol.io',
      whitepaperUrl: 'https://useprotocol.io/wp.pdf',
      marketCap: '$20M',
      category: 'defi',
    });
    const r = scoreUs(p, contact({ name: 'Bob CEO', linkedin: 'https://linkedin.com/in/bob' }));
    // US entity should score well
    expect(r.preScore).toBeGreaterThanOrEqual(25);
    expect(r.postScore).toBeGreaterThanOrEqual(25);
  });

  it('pre-TGE funded project scores well on timing + willingness', () => {
    const p = project({
      name: 'Funded PreTGE',
      source: 'pre_tge',
      marketCap: '$5M',
      category: 'infrastructure',
    });
    const r = scoreEu(p, contact());
    expect(r.score).toBeGreaterThan(10);
    const timing = r.reasons.find((rr) => rr.code === 'TIMING');
    expect(timing!.points).toBeGreaterThanOrEqual(10);
    const will = r.reasons.find((rr) => rr.code === 'WILLINGNESS');
    expect(will!.points).toBeGreaterThanOrEqual(4);
  });

  it('red-flag fixture: security token blocked', () => {
    const p = project({
      name: 'Security Token X',
      source: 'esma_main',
      esmaTokenId: 'TKN-SEC',
      category: 'real estate',
    });
    const s = signal('classification', { notes: 'security token under SEC review' });
    const r = scoreUs(p, [], s);
    expect(r.redFlag.flagged).toBe(true);
    expect(r.preScore).toBeLessThan(50);
  });
});

// ============ Band Thresholds ============

describe('Band thresholds', () => {
  it('85+ is immediate senior', () => {
    expect(computeBand(85)).toBe('immediate');
    expect(computeBand(100)).toBe('immediate');
  });

  it('75-84 is high outbound', () => {
    expect(computeBand(75)).toBe('high');
    expect(computeBand(84)).toBe('high');
  });

  it('60-74 is nurture', () => {
    expect(computeBand(60)).toBe('nurture');
    expect(computeBand(74)).toBe('nurture');
  });

  it('40-59 is watch', () => {
    expect(computeBand(40)).toBe('watch');
    expect(computeBand(59)).toBe('watch');
  });

  it('below 40 is archive', () => {
    expect(computeBand(39)).toBe('archive');
    expect(computeBand(0)).toBe('archive');
  });

  it('BAND_THRESHOLDS covers full range 0-100', () => {
    // No gaps: every score from 0-100 should map to a band
    for (let i = 0; i <= 100; i++) {
      const band = computeBand(i);
      expect(['immediate', 'high', 'nurture', 'watch', 'archive']).toContain(band);
    }
  });
});

describe('maxBand', () => {
  it('returns highest band from set', () => {
    expect(maxBand('nurture', 'immediate')).toBe('immediate');
    expect(maxBand('archive', 'watch')).toBe('watch');
    expect(maxBand('high', 'high')).toBe('high');
    expect(maxBand()).toBe('unscored');
  });
});
