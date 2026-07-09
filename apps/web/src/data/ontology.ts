import { OntologyGraph, RegulatoryNode } from '@/types/ontology';
import { states } from './states';
import { licenses } from './licenses';
import { requirements } from './requirements';
import { products } from './products';
import { domains } from './domains';
import { phases } from './phases';
import { competitors } from './competitors';

const stateNodes: RegulatoryNode[] = states.map(s => ({
  id: s.id, type: 'state', label: s.name, status: s.status, phase: s.phase, data: s, connections: [],
}));
const licenseNodes: RegulatoryNode[] = licenses.map(l => ({
  id: l.id, type: 'license', label: l.name, status: 'Blocked', phase: 'Phase 2', data: l, connections: [],
}));
const requirementNodes: RegulatoryNode[] = requirements.map(r => ({
  id: r.id, type: 'requirement', label: r.name, status: r.status, phase: r.phase, data: r, connections: [],
}));
const productNodes: RegulatoryNode[] = products.map(p => ({
  id: p.id, type: 'product', label: p.name, status: p.status, phase: p.phase, data: p, connections: [],
}));
const domainNodes: RegulatoryNode[] = domains.map(d => ({
  id: d.id, type: 'domain', label: d.name, status: 'Blocked', phase: 'Pre-launch', data: d, connections: [],
}));
const phaseNodes: RegulatoryNode[] = phases.map(p => ({
  id: p.id, type: 'phase', label: p.name, status: 'Blocked', phase: p.name, data: p, connections: [],
}));

const competitorNodes: RegulatoryNode[] = competitors.map(c => ({
  id: `comp_${c.id}`, type: 'competitor', label: c.name, status: c.status === 'public' ? 'Ready' : c.status === 'private' ? 'Conditional' : 'Blocked', phase: 'Phase 1', data: c, connections: [],
}));

const edges: OntologyGraph['edges'] = [];

// State -> license edges (only for states that are actually researched enough to know the license path)
const stateLicenseMap: Record<string, string> = {
  NY: 'NY_BITLICENSE', CA: 'CA_DFAL', TX: 'TX_SM1037', FL: 'FL_HB505', WY: 'WY_SPDI',
};
states.forEach(s => {
  if (s.tier === 'Unresearched') return;
  if (stateLicenseMap[s.id]) {
    edges.push({ id: `${s.id}_requires_${stateLicenseMap[s.id]}`, source: s.id, target: stateLicenseMap[s.id], type: 'requires' });
  } else if (!['MT','NH','ME','NM','SC','SD'].includes(s.id)) {
    edges.push({ id: `${s.id}_requires_MTL`, source: s.id, target: 'MTL', type: 'requires' });
  }
});

// License -> requirement edges
edges.push({ id: 'MTL_governs_STATE_MTL', source: 'MTL', target: 'STATE_MTL', type: 'governs' });
edges.push({ id: 'NY_BITLICENSE_governs_req', source: 'NY_BITLICENSE', target: 'NY_BITLICENSE_REQ', type: 'governs' });
edges.push({ id: 'CA_DFAL_governs_req', source: 'CA_DFAL', target: 'CA_DFAL_REQ', type: 'governs' });
edges.push({ id: 'WY_SPDI_enables_custody', source: 'WY_SPDI', target: 'CUSTODY_QUALIFIED', type: 'enables' });

// Requirement -> domain edges
requirements.forEach(r => {
  const domain = domains.find(d => d.name === r.domain);
  if (domain) edges.push({ id: `${r.id}_classifies_${domain.id}`, source: r.id, target: domain.id, type: 'classifies' });
});

// Product -> requirement edges
products.forEach(p => {
  p.requirements.forEach(reqId => {
    edges.push({ id: `${p.id}_requires_${reqId}`, source: p.id, target: reqId, type: 'requires' });
  });
});

// Product -> phase edges
products.forEach(p => {
  const phase = phases.find(ph => ph.name === p.phase);
  if (phase) edges.push({ id: `${p.id}_triggers_${phase.id}`, source: p.id, target: phase.id, type: 'triggers' });
});

// Competitor -> state edges (competes_in)
const stateIdMap = new Map(states.map(s => [s.abbreviation, s.id]));
competitors.forEach(c => {
  c.statePresence.forEach(abbr => {
    const stateId = stateIdMap.get(abbr);
    if (stateId) {
      edges.push({
        id: `comp_${c.id}_competes_${stateId}`,
        source: `comp_${c.id}`,
        target: stateId,
        type: 'competes_in',
      });
    }
  });
});

// Competitor -> license edges (holds_license)
const licenseFieldMap: Array<{ field: keyof typeof competitors[number]['licenses']; licenseId: string }> = [
  { field: 'bitLicense', licenseId: 'NY_BITLICENSE' },
  { field: 'spdiCharter', licenseId: 'WY_SPDI' },
  { field: 'finraBD', licenseId: 'MTL' },
];
competitors.forEach(c => {
  licenseFieldMap.forEach(({ field, licenseId }) => {
    if (c.licenses[field]) {
      edges.push({
        id: `comp_${c.id}_holds_${licenseId}`,
        source: `comp_${c.id}`,
        target: licenseId,
        type: 'holds_license',
      });
    }
  });
});

export const ontologyGraph: OntologyGraph = {
  nodes: [...stateNodes, ...licenseNodes, ...requirementNodes, ...productNodes, ...domainNodes, ...phaseNodes, ...competitorNodes],
  edges,
};
