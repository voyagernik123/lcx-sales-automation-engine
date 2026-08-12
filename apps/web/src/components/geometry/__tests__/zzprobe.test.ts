import { describe, it } from 'vitest';
import { ontologyGraph } from '@/data/ontology';
import fs from 'node:fs';
const OUT: string[] = [];
const log = (...a: unknown[]) => OUT.push(a.map(String).join(' '));

const PHASES: Record<number, string[]> = {
  3: ['Pre-launch', 'Phase 1', 'Phase 2', 'Phase 3'],
};

function probe(layers: string[], step = 3) {
  const allowed = PHASES[step]!;
  const nodes = ontologyGraph.nodes.filter(n => layers.includes(n.type) && allowed.includes(n.phase));
  const ids = new Set(nodes.map(n => n.id));
  const edges = ontologyGraph.edges.filter(e => ids.has(e.source) && ids.has(e.target));
  const deg = new Map<string, number>();
  for (const e of edges) {
    deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
    deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
  }
  const top = [...deg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  // hops from top node
  const adj = new Map<string, string[]>(nodes.map(n => [n.id, [] as string[]]));
  for (const e of edges) { adj.get(e.source)?.push(e.target); adj.get(e.target)?.push(e.source); }
  const core = top[0]?.[0] ?? nodes[0]?.id ?? '';
  const hops = new Map<string, number>([[core, 0]]);
  for (let f = [core]; f.length;) {
    const nx: string[] = [];
    for (const id of f) for (const n of adj.get(id) ?? []) if (!hops.has(n)) { hops.set(n, (hops.get(id) ?? 0) + 1); nx.push(n); }
    f = nx;
  }
  const hist = new Map<number, number>();
  for (const [, h] of hops) hist.set(h, (hist.get(h) ?? 0) + 1);
  const byKind = new Map<string, number>();
  for (const n of nodes) byKind.set(n.type, (byKind.get(n.type) ?? 0) + 1);
  const edgeKinds = new Map<string, number>();
  for (const e of edges) edgeKinds.set(e.type, (edgeKinds.get(e.type) ?? 0) + 1);
  return {
    layers: layers.join('+'), nodes: nodes.length, edges: edges.length, core,
    byKind: [...byKind], edgeKinds: [...edgeKinds], top,
    hops: [...hist].sort((a, b) => a[0] - b[0]),
    unreachable: nodes.filter(n => !hops.has(n.id)).length,
  };
}

describe('probe', () => {
  it('prints', () => {
    for (const ls of [
      ['state', 'license', 'requirement', 'product'],
      ['license', 'requirement', 'product'],
      ['license', 'requirement', 'product', 'competitor'],
      ['state', 'license', 'requirement', 'product', 'competitor'],
      ['requirement', 'product'],
    ]) log(JSON.stringify(probe(ls), null, 1));
    // sourceAuthority availability
    const sa = ontologyGraph.nodes.map(n => ({ t: n.type, a: (n.data as { sourceAuthority?: number }).sourceAuthority }));
    const missing = sa.filter(s => s.a === undefined);
    log('nodes missing sourceAuthority:', missing.length, JSON.stringify([...new Set(missing.map(m => m.t))]));
    const prods = ontologyGraph.nodes.filter(n => n.type === 'product');
    log('howey', JSON.stringify(prods.map(p => [p.id, (p.data as { howeyScore?: number }).howeyScore])));
    log('phases per type', JSON.stringify([...new Set(ontologyGraph.nodes.map(n => `${n.type}:${n.phase}`))]));
    fs.writeFileSync('/tmp/probe.txt', OUT.join('\n'));
  });
});
