import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReactFlow, { Background, Controls, ReactFlowProvider, type Node, type Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import * as d3 from 'd3';
import { Share2, Loader2, Crosshair, Bookmark, Trash2 } from 'lucide-react';
import { fetchRelated, listExplorations, saveExploration, deleteExploration, type Exploration } from '@/lib/api/graph';
import { toast } from '@/components/shared/Toast';
import { fetchBdPipeline } from '@/lib/api/bd';
import { useInspectorStore, type InspectorEntityType } from '@/stores/useInspectorStore';
import { OBJECT_TYPES, INSPECTOR_TO_OBJECT } from '@/lib/objectRegistry';
import { PageTitle, Button } from '@/components/ui';

/**
 * The Sales Graph (Palantir-grade Phase 1.3) — Vertex-lite. Seed from any
 * object, then expand nodes to pull their linked neighborhood live from the
 * search-around API (Phase 1.1). Force-directed layout via d3; rendered with
 * ReactFlow (the same engine the regulatory ontology explorer uses). Click a
 * node to expand; open its inspector from the selection card. Depth is bounded
 * by a node cap so the browser stays responsive on a 54k universe.
 */

const NODE_CAP = 150;
const SEED_SEP = '~'; // node id = `${inspector}~${entityId}`; entityId may contain ':' but never '~'

const NODE_COLOR: Record<InspectorEntityType, string> = {
  project: '#06b6d4', contact: '#8b5cf6', deal: '#10b981', listing: '#f59e0b',
  handoff: '#0ea5e9', signal: '#f97316', task: '#14b8a6', document: '#64748b',
  decision: '#d946ef', claim: '#6366f1', jurisdiction: '#f43f5e',
};

interface GNode { id: string; inspector: InspectorEntityType; entityId: string; label: string; seed?: Record<string, unknown>; expanded: boolean; seedNode: boolean; }
interface GEdge { id: string; source: string; target: string; label: string; }

const nodeId = (inspector: InspectorEntityType, entityId: string) => `${inspector}${SEED_SEP}${entityId}`;

/** d3-force layout → positions keyed by node id. Deterministic (fixed ticks). */
function layout(nodes: GNode[], edges: GEdge[]): Map<string, { x: number; y: number }> {
  const sim = d3.forceSimulation(nodes.map((n) => ({ id: n.id })) as d3.SimulationNodeDatum[])
    .force('link', d3.forceLink(edges.map((e) => ({ source: e.source, target: e.target }))).id((d: unknown) => (d as { id: string }).id).distance(150))
    .force('charge', d3.forceManyBody().strength(-520))
    .force('collide', d3.forceCollide().radius(70))
    .force('center', d3.forceCenter(0, 0))
    .stop();
  for (let i = 0; i < 240; i++) sim.tick();
  const pos = new Map<string, { x: number; y: number }>();
  (sim.nodes() as Array<{ id: string; x?: number; y?: number }>).forEach((n) => pos.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 }));
  return pos;
}

function GraphInner() {
  const [params] = useSearchParams();
  const push = useInspectorStore((s) => s.push);
  const [gnodes, setGnodes] = useState<GNode[]>([]);
  const [gedges, setGedges] = useState<GEdge[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<GNode | null>(null);
  const expandingRef = useRef<Set<string>>(new Set());
  const [viewsOpen, setViewsOpen] = useState(false);
  const [views, setViews] = useState<Exploration[]>([]);
  const [saveName, setSaveName] = useState('');

  const refreshViews = useCallback(() => {
    listExplorations().then(setViews).catch(() => setViews([]));
  }, []);
  useEffect(() => { if (viewsOpen) refreshViews(); }, [viewsOpen, refreshViews]);

  const doSave = useCallback(async () => {
    const name = saveName.trim();
    if (!name || gnodes.length === 0) return;
    try {
      await saveExploration(name, { nodes: gnodes, edges: gedges });
      setSaveName('');
      refreshViews();
      toast('success', `Saved view "${name}"`);
    } catch {
      toast('error', 'Failed to save view');
    }
  }, [saveName, gnodes, gedges, refreshViews]);

  const doLoad = useCallback((exp: Exploration) => {
    const p = exp.payload as { nodes?: GNode[]; edges?: GEdge[] } | null;
    if (!p?.nodes) { toast('error', 'View is empty'); return; }
    setGnodes(p.nodes);
    setGedges(p.edges ?? []);
    setSelected(null);
    setViewsOpen(false);
  }, []);

  const doDelete = useCallback(async (id: string) => {
    try { await deleteExploration(id); refreshViews(); } catch { toast('error', 'Failed to delete'); }
  }, [refreshViews]);

  /** Merge a set of new nodes/edges, respecting the node cap and dedup. */
  const merge = useCallback((newNodes: GNode[], newEdges: GEdge[]) => {
    setGnodes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]));
      for (const n of newNodes) {
        if (byId.has(n.id)) { if (n.expanded) byId.get(n.id)!.expanded = true; continue; }
        if (byId.size >= NODE_CAP) continue;
        byId.set(n.id, n);
      }
      return [...byId.values()];
    });
    setGedges((prev) => {
      const byId = new Map(prev.map((e) => [e.id, e]));
      for (const e of newEdges) byId.set(e.id, e);
      return [...byId.values()];
    });
  }, []);

  /** Expand a node: pull its linked neighborhood and graft it in. */
  const expand = useCallback(async (node: GNode) => {
    if (expandingRef.current.has(node.id)) return;
    expandingRef.current.add(node.id);
    setBusy(true);
    try {
      const r = await fetchRelated(node.inspector, node.entityId);
      const addN: GNode[] = [];
      const addE: GEdge[] = [];
      for (const g of r.groups) {
        for (const it of g.items) {
          const nid = nodeId(g.inspector, it.id);
          addN.push({ id: nid, inspector: g.inspector, entityId: it.id, label: it.label, seed: it.seed, expanded: false, seedNode: false });
          addE.push({ id: `${node.id}->${nid}`, source: node.id, target: nid, label: g.label });
        }
      }
      setGnodes((prev) => prev.map((n) => (n.id === node.id ? { ...n, expanded: true } : n)));
      merge(addN, addE);
    } catch { /* a failed expand leaves the graph unchanged */ }
    finally { expandingRef.current.delete(node.id); setBusy(false); }
  }, [merge]);

  // Seed: from ?type=&id= (auto-expand), else the top tracked projects.
  useEffect(() => {
    const type = params.get('type') as InspectorEntityType | null;
    const id = params.get('id');
    const label = params.get('label') ?? undefined;
    let cancelled = false;
    (async () => {
      if (type && id) {
        const seed: GNode = { id: nodeId(type, id), inspector: type, entityId: id, label: label ?? id.slice(0, 8), expanded: false, seedNode: true };
        setGnodes([seed]); setGedges([]); setSelected(seed);
        await expand(seed);
      } else {
        setBusy(true);
        try {
          const res = await fetchBdPipeline(
            { market: null, minScore: 0, source: '', band: '', listedOnLcx: null, hasContact: null, marketRecommendation: '', sort: 'priority', order: 'desc', search: '', tier: 'tracked' },
            { limit: 8 },
          );
          if (cancelled) return;
          setGnodes(res.data.map((l) => ({ id: nodeId('project', l.id), inspector: 'project', entityId: l.id, label: l.name, expanded: false, seedNode: true })));
          setGedges([]);
        } catch { /* empty graph is fine */ }
        finally { if (!cancelled) setBusy(false); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Positioned ReactFlow nodes/edges (recomputed when the graph set changes).
  const { rfNodes, rfEdges } = useMemo(() => {
    const pos = layout(gnodes, gedges);
    const rfNodes: Node[] = gnodes.map((n) => {
      const color = NODE_COLOR[n.inspector] ?? '#64748b';
      const p = pos.get(n.id) ?? { x: 0, y: 0 };
      return {
        id: n.id,
        position: p,
        data: { label: n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label },
        style: {
          background: n.seedNode ? color : 'var(--card)',
          color: n.seedNode ? '#fff' : 'var(--navy)',
          border: `2px solid ${color}`,
          borderRadius: 10, padding: '6px 10px', fontSize: 11, fontWeight: 700,
          width: 'auto', maxWidth: 180,
          opacity: n.expanded || n.seedNode ? 1 : 0.92,
          boxShadow: selected?.id === n.id ? `0 0 0 3px ${color}55` : 'none',
        },
      };
    });
    const rfEdges: Edge[] = gedges.map((e) => ({
      id: e.id, source: e.source, target: e.target,
      style: { stroke: 'var(--line)', strokeWidth: 1.5 }, animated: false,
    }));
    return { rfNodes, rfEdges };
  }, [gnodes, gedges, selected]);

  const onNodeClick = useCallback((_: unknown, rfNode: Node) => {
    const gn = gnodes.find((n) => n.id === rfNode.id);
    if (!gn) return;
    setSelected(gn);
    if (!gn.expanded) void expand(gn);
  }, [gnodes, expand]);

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col p-4">
      <PageTitle
        icon={<Share2 size={20} />}
        subtitle="Every object one pivot away. Click a node to expand its linked neighborhood; open the inspector for full detail."
        actions={
          <div className="flex items-center gap-2 text-micro text-grey">
            {busy && <Loader2 size={13} className="animate-spin" />}
            <span className="num-tabular">{gnodes.length}/{NODE_CAP} nodes</span>
            <Button size="xs" variant="secondary" onClick={() => setViewsOpen((v) => !v)}>
              <Bookmark size={11} /> Views
            </Button>
          </div>
        }
      >
        Sales Graph
      </PageTitle>

      <div className="relative mt-3 flex-1 overflow-hidden rounded-lg border border-line bg-card">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} color="var(--line)" className="opacity-40" />
          <Controls className="!bg-card !border-line !shadow-sm dark:!bg-navy" />
        </ReactFlow>

        {selected && (
          <div className="absolute right-3 top-3 w-60 rounded-lg border border-line bg-card p-3 shadow-card">
            <div className="mb-1 flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${OBJECT_TYPES[INSPECTOR_TO_OBJECT[selected.inspector]].dotCls}`} />
              <span className="text-micro font-bold uppercase tracking-wider text-grey">
                {OBJECT_TYPES[INSPECTOR_TO_OBJECT[selected.inspector]].label}
              </span>
            </div>
            <div className="mb-2 text-body font-bold text-navy">{selected.label}</div>
            <div className="flex gap-2">
              <Button size="xs" variant="secondary" onClick={() => void expand(selected)} disabled={selected.expanded}>
                <Crosshair size={11} /> {selected.expanded ? 'Expanded' : 'Expand'}
              </Button>
              <Button size="xs" onClick={() => push(selected.inspector, selected.entityId, selected.seed)}>
                Open inspector
              </Button>
            </div>
          </div>
        )}

        {viewsOpen && (
          <div className="absolute left-3 top-3 w-64 rounded-lg border border-line bg-card p-3 shadow-card">
            <div className="mb-2 text-micro font-bold uppercase tracking-wider text-grey">Saved views</div>
            <div className="mb-2 flex gap-1.5">
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void doSave(); }}
                placeholder="Name this view…"
                className="min-w-0 flex-1 rounded border border-line bg-card px-2 py-1 text-label text-navy outline-none focus:border-cyan-500"
              />
              <Button size="xs" onClick={() => void doSave()} disabled={!saveName.trim() || gnodes.length === 0}>Save</Button>
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {views.length === 0 && <div className="py-2 text-center text-micro text-grey">No saved views yet</div>}
              {views.map((v) => (
                <div key={v.id} className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-ice-soft dark:hover:bg-ice-soft/10">
                  <button onClick={() => doLoad(v)} className="min-w-0 flex-1 text-left text-label font-semibold text-navy truncate" title={v.name}>
                    {v.name}
                    <span className="ml-1 font-normal text-grey">· {v.owner}</span>
                  </button>
                  <button onClick={() => void doDelete(v.id)} className="shrink-0 text-grey hover:text-red-500" title="Delete view">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {gnodes.length === 0 && !busy && (
          <div className="absolute inset-0 flex items-center justify-center text-label text-grey">
            No seed — open the graph from any object's inspector.
          </div>
        )}
      </div>
    </div>
  );
}

export function SalesGraph() {
  return (
    <ReactFlowProvider>
      <GraphInner />
    </ReactFlowProvider>
  );
}
