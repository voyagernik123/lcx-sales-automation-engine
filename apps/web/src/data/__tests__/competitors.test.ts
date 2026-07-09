import { describe, it, expect } from 'vitest';
import { states, licenses, competitors, ontologyGraph } from '@/data';

describe('competitor data integrity', () => {
  it('has 26 competitor profiles', () => {
    expect(competitors).toHaveLength(26);
    const ids = new Set(competitors.map(c => c.id));
    expect(ids.size).toBe(26);
  });

  it('every competitor statePresence references a valid state abbreviation', () => {
    const stateAbbrs = new Set(states.map(s => s.abbreviation));
    for (const c of competitors) {
      for (const abbr of c.statePresence) {
        expect(
          stateAbbrs.has(abbr),
          `Competitor "${c.id}" references unknown state "${abbr}"`,
        ).toBe(true);
      }
    }
  });

  it('competitor nodes exist in the ontology graph', () => {
    const competitorNodeIds = competitors.map(c => `comp_${c.id}`);
    const graphNodeIds = new Set(ontologyGraph.nodes.map(n => n.id));
    for (const compId of competitorNodeIds) {
      expect(
        graphNodeIds.has(compId),
        `Ontology graph missing competitor node "${compId}"`,
      ).toBe(true);
    }
  });

  it('every competitor node has a valid type in the graph', () => {
    const competitorNodeIds = new Set(competitors.map(c => `comp_${c.id}`));
    const compNodes = ontologyGraph.nodes.filter(n => competitorNodeIds.has(n.id));
    for (const node of compNodes) {
      expect(node.type).toBe('competitor');
    }
  });

  it('competes_in edges connect competitor nodes to valid state nodes', () => {
    const nodeIds = new Set(ontologyGraph.nodes.map(n => n.id));
    const stateIds = new Set(states.map(s => s.id));
    const compEdges = ontologyGraph.edges.filter(e => e.type === 'competes_in');
    expect(compEdges.length).toBeGreaterThan(0);
    for (const e of compEdges) {
      expect(nodeIds.has(e.source), `competes_in edge "${e.id}" missing source "${e.source}"`).toBe(true);
      expect(nodeIds.has(e.target), `competes_in edge "${e.id}" missing target "${e.target}"`).toBe(true);
      expect(stateIds.has(e.target), `competes_in edge "${e.id}" target "${e.target}" is not a valid state`).toBe(true);
      expect(e.source.startsWith('comp_'), `competes_in edge "${e.id}" source "${e.source}" should be a competitor node`).toBe(true);
    }
  });

  it('holds_license edges connect competitor nodes to valid license nodes', () => {
    const nodeIds = new Set(ontologyGraph.nodes.map(n => n.id));
    const licenseIds = new Set(licenses.map(l => l.id));
    const compEdges = ontologyGraph.edges.filter(e => e.type === 'holds_license');
    expect(compEdges.length).toBeGreaterThan(0);
    for (const e of compEdges) {
      expect(nodeIds.has(e.source), `holds_license edge "${e.id}" missing source "${e.source}"`).toBe(true);
      expect(nodeIds.has(e.target), `holds_license edge "${e.id}" missing target "${e.target}"`).toBe(true);
      expect(licenseIds.has(e.target), `holds_license edge "${e.id}" target "${e.target}" is not a valid license`).toBe(true);
      expect(e.source.startsWith('comp_'), `holds_license edge "${e.id}" source "${e.source}" should be a competitor node`).toBe(true);
    }
  });

  it('all competitor CLARITY act positions are valid', () => {
    const validPositions = ['strong_beneficiary', 'moderate', 'minimal', 'irrelevant', 'blocked'];
    for (const c of competitors) {
      expect(
        validPositions.includes(c.clarityAct.position),
        `Competitor "${c.id}" has invalid clarityAct.position "${c.clarityAct.position}"`,
      ).toBe(true);
    }
  });

  it('all competitor threat levels are valid', () => {
    const validThreats = ['Critical', 'High', 'Medium', 'Low', 'None'];
    for (const c of competitors) {
      expect(
        validThreats.includes(c.threatLevel),
        `Competitor "${c.id}" has invalid threatLevel "${c.threatLevel}"`,
      ).toBe(true);
    }
  });

  it('all competitor statuses are valid', () => {
    const validStatuses = ['public', 'private', 'blocked', 'defunct'];
    for (const c of competitors) {
      expect(
        validStatuses.includes(c.status),
        `Competitor "${c.id}" has invalid status "${c.status}"`,
      ).toBe(true);
    }
  });
});
