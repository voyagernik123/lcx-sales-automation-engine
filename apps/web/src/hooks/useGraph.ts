import { useMemo } from 'react';
import { Node, Edge, MarkerType, Position } from 'reactflow';
import * as d3 from 'd3';
import { ontologyGraph } from '@/data/ontology';
import { RegulatoryNode, Status, Requirement, Product, State } from '@/types/ontology';
import { Competitor } from '@/types/competitors';
import { useFilterStore } from '@/stores/useFilterStore';
import { useAuditStore } from '@/stores/useAuditStore';
import { NODE_LAYOUT } from '@/lib/constants';
import { STATUS_FILL_COLOR, PHASE_COLORS, getDomainColor } from '@/lib/colors';
import { mapReadinessToStatus, PHASE_STEP_THRESHOLDS, getEffectiveStateStatus, getEffectiveRequirementStatus, getEffectiveHoweyScore } from '@/lib/compliance';

const TYPE_ORDER = ['state', 'license', 'requirement', 'product', 'domain', 'phase', 'competitor'];

function forceLayout(
  nodes: RegulatoryNode[],
  edges: { id: string; source: string; target: string }[],
): Array<RegulatoryNode & { x: number; y: number; w: number }> {
  if (nodes.length === 0) return [];

  const W = NODE_LAYOUT.WIDTH;

  const simNodes = nodes.map(n => ({ id: n.id, type: n.type })) as d3.SimulationNodeDatum[];
  const simEdges = edges.map(e => ({ source: e.source, target: e.target }));

  const sim = d3.forceSimulation(simNodes)
    .force('link', d3.forceLink(simEdges).id((d: any) => d.id).distance(160))
    .force('charge', d3.forceManyBody().strength(-400))
    .force('collision', d3.forceCollide().radius(() => 110))
    .force('x', d3.forceX().x((d: any) => {
      const idx = TYPE_ORDER.indexOf(d.type);
      return (idx - 3) * 550;
    }).strength(0.35))
    .force('y', d3.forceY().y(0).strength(0.08))
    .stop();

  for (let i = 0; i < 200; i++) sim.tick();

  const posMap = new Map<string, { x: number; y: number }>();
  simNodes.forEach((n: any) => posMap.set(n.id, { x: n.x, y: n.y }));

  return nodes.map(n => {
    const pos = posMap.get(n.id) || { x: 0, y: 0 };
    return { ...n, x: pos.x, y: pos.y, w: W };
  });
}

interface UseGraphParams {
  colorBy: 'status' | 'phase' | 'domain';
  activeLayers: Set<string>;
  timelineStep: number;
}

export function useGraph({ colorBy, activeLayers, timelineStep }: UseGraphParams) {
  const { clarityEnacted, spdiEquivalence } = useFilterStore();
  const { readinessStatusOverrides, safeHarborToggles } = useAuditStore();
  const { commodityExempt, defiExempt, micaExempt } = safeHarborToggles ?? {};

  const allowedPhases = useMemo(() => {
    return PHASE_STEP_THRESHOLDS[timelineStep] || PHASE_STEP_THRESHOLDS[4];
  }, [timelineStep]);

  const isClarityStepActive = timelineStep === 4;

  const filtered = useMemo(() => {
    let nodes = ontologyGraph.nodes;
    nodes = nodes.filter(n => activeLayers.has(n.type));
    nodes = nodes.filter(n => allowedPhases.includes(n.phase));
    const ids = new Set(nodes.map(n => n.id));
    const edges = ontologyGraph.edges.filter(e => ids.has(e.source) && ids.has(e.target));
    return { nodes, edges };
  }, [activeLayers, allowedPhases]);

  const laidOut = useMemo(() => forceLayout(filtered.nodes, filtered.edges), [filtered]);

  const nodes: Node[] = laidOut.map(n => {
    let nodeStatus = n.status;
    let nodeData = { ...n.data };

    const flags = { clarityEnacted, defiExempt: defiExempt ?? false, micaExempt: micaExempt ?? false };

    if (n.type === 'requirement') {
      const override = readinessStatusOverrides[n.id];
      nodeStatus = override ? mapReadinessToStatus(override) : n.status;
      nodeStatus = getEffectiveRequirementStatus(nodeStatus, n.id, flags);
    } else if (n.type === 'state') {
      const s = n.data as State;
      nodeStatus = getEffectiveStateStatus(s, { clarityEnacted, spdiEquivalence });
    } else if (n.type === 'product') {
      const p = { ...n.data } as Product;
      if (commodityExempt && p.howeyScore !== undefined) {
        p.howeyScore = getEffectiveHoweyScore(p.howeyScore, true) ?? p.howeyScore;
      }
      nodeData = p;
    } else if (n.type === 'competitor') {
      const comp = n.data as Competitor;
      if (comp.threatLevel === 'Critical' || comp.threatLevel === 'High') {
        nodeStatus = 'Blocked';
      } else if (comp.threatLevel === 'Medium') {
        nodeStatus = 'Conditional';
      } else if (comp.threatLevel === 'Low' || comp.threatLevel === 'None') {
        nodeStatus = 'Ready';
      }
    }

    let activeColor = '#64748b';

    if (colorBy === 'status') {
      activeColor = STATUS_FILL_COLOR[nodeStatus] || '#64748b';
    } else if (colorBy === 'phase') {
      activeColor = PHASE_COLORS[n.phase] || '#64748b';
    } else if (colorBy === 'domain') {
      if (n.type === 'requirement') {
        const req = n.data as Requirement;
        activeColor = getDomainColor(req.domain);
      } else if (n.type === 'license') {
        activeColor = getDomainColor('State money transmission and consumer protection');
      } else if (n.type === 'product') {
        activeColor = getDomainColor('Asset listing and token classification');
      } else if (n.type === 'state') {
        activeColor = getDomainColor('State money transmission and consumer protection');
      } else if (n.type === 'competitor') {
        activeColor = '#06b6d4';
      } else {
        activeColor = '#64748b';
      }
    }

    const isReq = n.type === 'requirement';
    const req = isReq ? (n.data as Requirement) : null;
    const isPreempted = (isClarityStepActive || clarityEnacted) && req?.preemptedUnderClarity;

    let label = n.label;
    if (isPreempted) {
      label = `[PREEMPTED] ${n.label}`;
    }

    return {
      id: n.id,
      type: 'custom',
      position: { x: n.x - NODE_LAYOUT.WIDTH / 2, y: n.y - NODE_LAYOUT.HEIGHT / 2 },
      data: {
        node: { ...n, status: nodeStatus as Status, label, data: nodeData },
        activeColor,
        isPreempted,
        showDetails: true,
        scale: 1,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: {
        width: NODE_LAYOUT.WIDTH,
        height: NODE_LAYOUT.HEIGHT,
        border: '0',
        padding: '0',
        background: 'transparent',
      },
    };
  });

  const edges: Edge[] = filtered.edges.map(e => {
    const targetNode = ontologyGraph.nodes.find(n => n.id === e.target);
    const isPreempted = (isClarityStepActive || clarityEnacted) && targetNode?.type === 'requirement' && (targetNode.data as Requirement).preemptedUnderClarity;

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      animated: e.type === 'requires' && !isPreempted,
      label: e.type,
      labelStyle: { fontSize: 8, fill: isPreempted ? '#cbd5e1' : '#64748b', fontFamily: 'monospace' },
      style: {
        stroke: isPreempted ? '#cbd5e1' : '#94a3b8',
        strokeDasharray: isPreempted ? '5,5' : undefined,
        strokeWidth: 1.5,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: isPreempted ? '#cbd5e1' : '#94a3b8' },
    };
  });

  return { nodes, edges, nodeCount: filtered.nodes.length, edgeCount: filtered.edges.length };
}
export default useGraph;
