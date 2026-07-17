import { describe, expect, it } from 'vitest';
import {
  eligibilityGate,
  forecastLineage,
  likelihoodLineage,
  marketRecLineage,
  momentumLineage,
  playbookLineage,
  priorityLineage,
  propensityLineage,
  rateAggregateLineage,
  slaLineage,
  sumAggregateLineage,
} from '../lineage';
import { computeReplySla } from '../salesIntel';

describe('lineage builders — every family explains itself', () => {
  it('propensity maps reason trails to signed contributions', () => {
    const l = propensityLineage(79, [
      { factor: 'Market cap', points: 20, max: 25, note: 'Market cap $260M' },
      { factor: 'Listing fit', points: 10, max: 15 },
    ]);
    expect(l.value).toBe('79/100');
    expect(l.nodes).toHaveLength(2);
    expect(l.nodes[0]).toMatchObject({ label: 'Market cap', signed: 20, max: 25 });
  });

  it('propensity degrades honestly without reasons', () => {
    const l = propensityLineage(undefined);
    expect(l.value).toBe('—');
    expect(l.nodes.length).toBeGreaterThan(0);
  });

  it('priority shows the gate math', () => {
    expect(eligibilityGate(74)).toBe(1);
    expect(eligibilityGate(45)).toBe(0.7);
    expect(eligibilityGate(20)).toBe(0.4);
    const l = priorityLineage({ propensityScore: 79, priorityScore: 76, euScore: 71, usScore: 74 });
    expect(l.formula).toContain('propensity × eligibility');
    expect(l.nodes[1].value).toBe('×1.0');
  });

  it('likelihood carries signed signals from the health model', () => {
    const l = likelihoodLineage({
      percentile: 38,
      band: 'fair',
      score: 25,
      signals: [
        { label: 'Stage: contacted', direction: 1, weight: 8, detail: 'base rate' },
        { label: 'Going quiet', direction: -1, weight: 6, detail: '9d idle' },
      ],
    });
    expect(l.value).toBe('38th percentile');
    expect(l.nodes[0].signed).toBe(8);
    expect(l.nodes[1].signed).toBe(-6);
  });

  it('momentum states the window', () => {
    const l = momentumLineage('cooling', '1 events last 7d vs 2 prior 7d');
    expect(l.value).toBe('cooling');
    expect(l.nodes[0].detail).toContain('vs 2 prior');
  });

  it('reply SLA shows age, budget and the band table', () => {
    const createdAt = new Date(Date.now() - 3 * 3_600_000).toISOString();
    const sla = computeReplySla(createdAt);
    const l = slaLineage(sla, createdAt);
    expect(l.value).toBe(sla.state.toUpperCase());
    expect(l.nodes[1].value).toContain('of 4h');
    expect(l.nodes[2].detail).toContain('breached');
  });

  it('market rec compares venues and breaks ties to EU', () => {
    const l = marketRecLineage({ euScore: 71, usPreScore: 76, clarityEnacted: false });
    expect(l.value).toBe('US');
    const tie = marketRecLineage({ euScore: 70, usPreScore: 70 });
    expect(tie.value).toBe('EU');
    expect(tie.nodes[2].detail).toContain('Tie');
  });

  it('forecast exposes the model inputs and percentiles', () => {
    const l = forecastLineage({
      runs: 10_000,
      p10: 120_000,
      p50: 240_000,
      p90: 410_000,
      expected: 255_000,
      deals: [{ id: 'd', projectName: 'X', stage: 'proposal', value: 1, winProbability: 40, daysSinceUpdate: 1 }],
    });
    expect(l.value).toBe('$255K');
    expect(l.nodes.map(n => n.label)).toContain('Simulations');
  });

  it('playbook marks the next step as first-incomplete', () => {
    const l = playbookLineage([
      { key: 'T', label: 'Tokenomics review', status: 'done' },
      { key: 'K', label: 'KYB / entity check', status: 'empty' },
      { key: 'L', label: 'Legal opinion', status: 'empty' },
    ]);
    expect(l.value).toBe('1/3');
    expect(l.nodes[1].value).toBe('→ next');
    expect(l.nodes[2].value).toBe('pending');
  });

  it('rate aggregates break down by channel and respect small-n policy', () => {
    const l = rateAggregateLineage('Reply rate', {
      email: { sent: 40, replied: 5 },
      linkedin: { sent: 12, replied: 2 },
    });
    expect(l.value).toBe('13.5%');
    expect(l.nodes).toHaveLength(2);
    const tiny = rateAggregateLineage('Reply rate', { email: { sent: 3, replied: 1 } });
    expect(tiny.value).toBe('1 of 3');
  });

  it('sum aggregates order streams by size with share-of-total', () => {
    const l = sumAggregateLineage('Revenue closed', { listing: 20_000_00, dual: 50_000_00 }, { dual: 'Dual EU+US' });
    expect(l.value).toBe('$70K');
    expect(l.nodes[0].label).toBe('Dual EU+US');
    expect(l.nodes[0].detail).toContain('71.4%');
  });
});
