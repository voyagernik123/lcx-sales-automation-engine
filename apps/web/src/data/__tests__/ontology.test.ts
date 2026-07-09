import { describe, it, expect } from 'vitest';
import { states, licenses, requirements, products, domains, ontologyGraph } from '@/data';

describe('data integrity', () => {
  it('has 50 states with unique ids', () => {
    expect(states).toHaveLength(50);
    const ids = new Set(states.map(s => s.id));
    expect(ids.size).toBe(50);
  });

  it('every product.requirements id resolves to a real requirement (no dangling refs)', () => {
    const reqIds = new Set(requirements.map(r => r.id));
    for (const p of products) {
      for (const rid of p.requirements) {
        expect(reqIds.has(rid), `Product "${p.id}" references missing requirement "${rid}"`).toBe(true);
      }
    }
  });

  it('every requirement.domain matches a defined domain name', () => {
    const domainNames = new Set(domains.map(d => d.name));
    for (const r of requirements) {
      expect(domainNames.has(r.domain), `Requirement "${r.id}" references unknown domain "${r.domain}"`).toBe(true);
    }
  });

  it('every license referenced by a state actually exists', () => {
    const licenseIds = new Set(licenses.map(l => l.id));
    const stateLicenseTargets = ontologyGraph.edges
      .filter(e => e.type === 'requires' && states.some(s => s.id === e.source))
      .map(e => e.target);
    for (const target of stateLicenseTargets) {
      expect(licenseIds.has(target), `Edge references missing license "${target}"`).toBe(true);
    }
  });

  it('ontology graph edges only reference nodes that exist', () => {
    const nodeIds = new Set(ontologyGraph.nodes.map(n => n.id));
    for (const e of ontologyGraph.edges) {
      expect(nodeIds.has(e.source), `Edge "${e.id}" has missing source "${e.source}"`).toBe(true);
      expect(nodeIds.has(e.target), `Edge "${e.id}" has missing target "${e.target}"`).toBe(true);
    }
  });

  it('all 50 states are fully researched — no Unresearched tier remaining', () => {
    expect(states).toHaveLength(50);
    const unresearched = states.filter(s => s.tier === 'Unresearched');
    expect(unresearched).toHaveLength(0);
    for (const s of states) {
      expect(s.tier).not.toBe('Unresearched');
      expect(s.regimeType).not.toBe('Unknown');
      expect(s.status).not.toBe('Needs verification');
      expect(s.priority).not.toBe('Unassessed');
      expect(s.sourceAuthority).toBeLessThan(5);
      expect(s.regulator).toBeDefined();
      expect(s.estCost).toBeDefined();
      expect(s.estTimeline).toBeDefined();
    }
  });

  it('every researched state has a valid regulator name and cost/timeline', () => {
    for (const s of states) {
      expect(s.regulator!.length).toBeGreaterThanOrEqual(3);
      expect(s.estCost!.length).toBeGreaterThan(1);
      expect(s.estTimeline!.length).toBeGreaterThan(1);
    }
  });
});
