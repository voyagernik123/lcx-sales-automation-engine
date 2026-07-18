import { describe, expect, it } from 'vitest';
import { renderPlay, selectPlay, type PlayFacts } from './plays.js';

const base: PlayFacts = {
  name: 'Acme Protocol', ticker: 'ACME', listedOnLcx: false,
  timingWindow: 'quiet', achVerdict: 'list_soon', priceChange30d: 3,
  competitorCount: 0, topVenue: null, euScore: 30, recommendedMarket: 'none',
  tvlUsd: null, githubCommits30d: 0, dealValueUsd: 50000, contactName: 'Dana Lee',
};

describe('plays — selection', () => {
  it('picks competitive parity when the token is on several rival venues', () => {
    expect(selectPlay({ ...base, competitorCount: 5, topVenue: 'Kraken' }).id).toBe('competitive_parity');
  });

  it('picks momentum strike when hot and not heavily listed elsewhere', () => {
    expect(selectPlay({ ...base, timingWindow: 'hot', priceChange30d: 40 }).id).toBe('momentum_strike');
  });

  it('picks the EU/MiCA play when EU-ready and EU-first', () => {
    expect(selectPlay({ ...base, euScore: 75, recommendedMarket: 'eu_first' }).id).toBe('eu_regulatory');
  });

  it('picks traction proof on strong fundamentals with no sharper trigger', () => {
    expect(selectPlay({ ...base, tvlUsd: 5e7 }).id).toBe('traction_proof');
  });

  it('falls back to nurture when nothing triggers', () => {
    expect(selectPlay(base).id).toBe('nurture');
  });

  it('never pitches a listing to an already-listed token', () => {
    const play = selectPlay({ ...base, competitorCount: 8, listedOnLcx: true });
    expect(play.id).toBe('nurture');
  });
});

describe('plays — rendered draft', () => {
  it('is personalized and evidence-backed', () => {
    const r = renderPlay({ ...base, competitorCount: 5, topVenue: 'Kraken' });
    expect(r.playId).toBe('competitive_parity');
    expect(r.draft.body).toContain('Dana'); // first name
    expect(r.draft.body).toContain('Acme Protocol');
    expect(r.draft.subject).toContain('ACME');
    expect(r.draft.body).toMatch(/5 exchanges/);
    expect(r.evidence.length).toBeGreaterThan(0);
    expect(r.rationale).toBeTruthy();
  });

  it('greets generically when no contact is known', () => {
    const r = renderPlay({ ...base, contactName: null });
    expect(r.draft.body).toContain('Hi there,');
  });
});
