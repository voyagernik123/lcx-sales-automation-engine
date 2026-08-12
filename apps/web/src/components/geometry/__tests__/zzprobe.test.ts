import { describe, it } from 'vitest';
import fs from 'node:fs';
import { ontologyGraph } from '@/data/ontology';
import { buildOrrery, isOrreryRefusal } from '@/components/geometry/orrery/orreryLayout';

const OUT: string[] = [];
const log = (...a: unknown[]) => OUT.push(a.map(String).join(' '));

const PHASES: Record<number, string[]> = {
  0: ['Pre-launch'],
  2: ['Pre-launch', 'Phase 1', 'Phase 2'],
  3: ['Pre-launch', 'Phase 1', 'Phase 2', 'Phase 3'],
};

function run(layers: string[], step = 3, selectedId: string | null = null) {
  const allowed = PHASES[step]!;
  const nodes = ontologyGraph.nodes.filter(n => layers.includes(n.type) && allowed.includes(n.phase));
  const ids = new Set(nodes.map(n => n.id));
  const edges = ontologyGraph.edges.filter(e => ids.has(e.source) && ids.has(e.target));
  const t0 = performance.now();
  const out = buildOrrery({
    entities: nodes.map(n => ({ id: n.id, label: n.label, kind: n.type, record: n.data })),
    couplings: edges.map(e => ({ id: e.id, source: e.source, target: e.target, kind: e.type })),
    allCouplings: ontologyGraph.edges,
    selectedId,
    cssWidth: 1200,
    cssHeight: 700,
    flatCentres: nodes.map((n, i) => ({ id: n.id, x: (i % 9) * 260, y: Math.floor(i / 9) * 130 })),
    flatHalfWidth: 90,
  });
  const ms = performance.now() - t0;
  if (isOrreryRefusal(out)) {
    log(layers.join('+'), 'step', step, 'sel', selectedId, '=> REFUSED', out.code, '|', out.reason, `| ${ms.toFixed(0)}ms`);
    return;
  }
  log(layers.join('+'), 'step', step, 'sel', selectedId, `=> OK ${ms.toFixed(0)}ms`, JSON.stringify({
    bodies: out.bodies.length, links: out.links.length, core: out.core.id,
    counts: out.counts, px: out.px, search: out.search, shells: out.shells.map(s => +s.toFixed(2)),
    az: out.view.azimuthDeg, el: out.view.elevationDeg, dist: +out.view.distance.toFixed(1),
    crossings: out.crossings, flatRingsCollapsed: out.flatRingsCollapsed,
  }));
}

describe('probe', () => {
  it('prints', () => {
    run(['state', 'license', 'requirement', 'product']);
    run(['license', 'requirement', 'product']);
    run(['requirement', 'product']);
    run(['license', 'requirement', 'product', 'competitor']);
    run(['state', 'license', 'requirement', 'product'], 0);
    run(['state', 'license', 'requirement', 'product'], 2);
    run(['license', 'requirement', 'product'], 3, 'EXCHANGE');
    run(['state', 'license', 'requirement', 'product', 'competitor']);
    fs.writeFileSync('/tmp/probe.txt', OUT.join('\n\n'));
  });
});
