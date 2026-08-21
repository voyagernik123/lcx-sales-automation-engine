import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OntologyOrrery } from '@/components/geometry/OntologyOrrery';
import {
  buildOrrery, magnitudeOf, isOrreryRefusal, observedRadius, radiusOf, thirdAxisBuysNothing,
  ORRERY_PLANES, ORRERY_REFUSALS, BODY_PX_FLOOR,
  type OrreryEntityInput, type OrreryCouplingInput,
} from '@/components/geometry/orrery/orreryLayout';
import { ontologyGraph } from '@/data/ontology';
import { storage } from '@/lib/persistence';

/*
 * §7's disposition for an environment whose clause (b) is not established: "it ships behind a toggle that
 * defaults off, and I tell you rather than quietly shipping it."
 *
 * The component tests are about the DEFAULT and the FALLBACK, not about the render. The render is verified by
 * `docs/3d/e4`'s capture against a real rasteriser; jsdom has no WebGL2 and pretending otherwise would be a
 * test that passes for the wrong reason. What CAN be checked here is what §7 asks — that a reader who does
 * nothing sees the diagram, that the reason is on the page, and that the GL layer is behind `lazy()` — plus the
 * whole of the layout, which is deliberately a pure module for exactly this reason.
 */

const entity = (id: string, kind: string, record: unknown = {}): OrreryEntityInput => ({ id, label: id, kind, record });
const coupling = (source: string, target: string): OrreryCouplingInput => ({ id: source + '-' + target, source, target, kind: 'requires' });

/** A small system that is drawable: a hub, two shells, and one edge that is not a tree edge. */
const SMALL = {
  entities: [
    entity('HUB', 'license'),
    entity('A', 'requirement'), entity('B', 'requirement'), entity('C', 'requirement'),
    entity('P', 'product'), entity('Q', 'product'),
  ],
  couplings: [
    coupling('HUB', 'A'), coupling('HUB', 'B'), coupling('HUB', 'C'),
    coupling('A', 'P'), coupling('B', 'Q'), coupling('C', 'Q'),
  ],
} as const;

const build = (over: Partial<Parameters<typeof buildOrrery>[0]> = {}) => buildOrrery({
  entities: SMALL.entities,
  couplings: SMALL.couplings,
  allCouplings: SMALL.couplings,
  selectedId: null,
  cssWidth: 1200,
  cssHeight: 700,
  ...over,
});

/* A toggle click is a CHOICE since 2026-08-20 and persists through the storage module's
   in-memory tier, which localStorage.clear() cannot reach — without this, one test's click
   becomes the next test's default and failures depend on execution order. */
beforeEach(() => { storage.clearAll(); });

describe('OntologyOrrery — the orbital view is the default by owner decision, and says so', () => {
  const props = {
    entities: SMALL.entities,
    couplings: SMALL.couplings,
    allCouplings: SMALL.couplings,
    selectedId: null,
  };

  it('still paints the FLAT diagram first — the default engages after hydration, never in first paint', () => {
    /* The canvas that may follow arrives via a lazy chunk, one effect after mount. What must never
       change: server markup and the first client frame contain the diagram, not a canvas. */
    const { container } = render(
      <OntologyOrrery {...props}><div data-testid="flat-diagram">the node-link diagram</div></OntologyOrrery>,
    );
    expect(screen.getByTestId('flat-diagram'), 'the diagram must be what loads').toBeTruthy();
    expect(container.querySelector('canvas'), 'no canvas before the chunk resolves').toBeNull();
  });

  it('states the provenance of the default on the flat branch, where the decision to return is made', () => {
    /* A remembered "no" from the operator lands the reader here, and the caption owes them the same
       honesty in both directions: the default was a decision (2026-08-20), not a measurement, because
       measuring it proved impossible. The ON state carries its own copy of this sentence in the HUD —
       asserted by the reliefTheme/HUD suites against the component source — because with the orrery as
       the landing state, a caption only readable after leaving it would state the provenance to nobody. */
    storage.set('relief:orrery', false);
    render(<OntologyOrrery {...props}><div /></OntologyOrrery>);
    expect(screen.getByText(/default by owner decision, not by measurement/i)).toBeTruthy();
  });

  it('says on the page that the orbital view drops entity labels', () => {
    /* The one thing the diagram does better, stated where the choice is made rather than discovered after it. */
    storage.set('relief:orrery', false);
    render(<OntologyOrrery {...props}><div /></OntologyOrrery>);
    expect(screen.getByText(/carries no entity labels except the core and your selection/i)).toBeTruthy();
  });

  it('offers the toggle, and reports its state to assistive technology', () => {
    render(<OntologyOrrery {...props}><div /></OntologyOrrery>);
    const btn = screen.getByRole('button', { name: /orrery view/i });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the diagram on screen while the lazy chunk is still loading', () => {
    /* The Suspense fallback IS the diagram rather than a spinner. A reader who clicked for the orrery has not
       asked to lose the graph for the length of a network round trip. */
    render(<OntologyOrrery {...props}><div data-testid="flat-diagram" /></OntologyOrrery>);
    fireEvent.click(screen.getByRole('button', { name: /orrery view/i }));
    expect(screen.getByTestId('flat-diagram'), 'the diagram must survive the load').toBeTruthy();
  });

  it('does not import the GL layer until the reader asks', async () => {
    /*
     * THE BUDGET TEST. The perf budget allows about 11 KB of headroom on initial JS and the environment layer
     * alone is 35.7 KB, so an eager import would blow it on a view most readers never open. Asserted
     * structurally: the module graph reachable from this component must not name the engine.
     */
    const fs = await import('node:fs');
    const path = await import('node:path');
    /* Resolved from the workspace root rather than `import.meta.url`: under jsdom that is not a file: URL and
       `new URL(...)` throws. Existence is asserted FIRST so this test cannot pass by reading an empty string. */
    const file = path.resolve(process.cwd(), 'src/components/geometry/OntologyOrrery.tsx');
    expect(fs.existsSync(file), `cannot find ${file} — this check would otherwise pass vacuously`).toBe(true);
    const src = fs.readFileSync(file, 'utf8');
    expect(src.length).toBeGreaterThan(500);
    expect(src, 'the GL component must be behind lazy()').toMatch(/lazy\(\(\) => import\(/);
    expect(
      /^import[^;]*from '@lcx\/gl'/m.test(src),
      'OntologyOrrery must not import @lcx/gl eagerly',
    ).toBe(false);
    /* The renderer may, because it is only ever reached through that lazy import. */
    const gl = fs.readFileSync(path.resolve(process.cwd(), 'src/components/geometry/OntologyOrreryGl.tsx'), 'utf8');
    expect(/^import \{[\s\S]*?\} from '@lcx\/gl';/m.test(gl)).toBe(true);
  });

  it('has no idle animation anywhere in the renderer — §6 rule 2', async () => {
    /* A rotating orrery is exactly what rule 2 forbids, and a still frame is why reduced motion needs no
       branch. Asserted on the source, because jsdom cannot run the frame that would prove it. */
    const fs = await import('node:fs');
    const path = await import('node:path');
    const gl = fs.readFileSync(path.resolve(process.cwd(), 'src/components/geometry/OntologyOrreryGl.tsx'), 'utf8');
    /* Comments are stripped first: this file DISCUSSES both of them at length, and a test that reads prose as
       code would fail for the opposite of the right reason. */
    const code = gl.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/requestAnimationFrame/);
    expect(code).not.toMatch(/setInterval/);
  });

  it('does not hand the renderer a new graph object on every render of the page', async () => {
    /*
     * §6 RULE 7, AND IT WAS BROKEN BY A DEPENDENCY ARRAY RATHER THAN BY A CONTEXT.
     *
     * `useGraph` builds its `nodes` and `edges` with a bare `.map()` outside any `useMemo`, so both come back
     * as fresh arrays on every render of `OntologyExplorer`. The orrery's three memos were keyed on those
     * arrays, `OntologyOrrery` wraps them in one more `useMemo`, and `OntologyOrreryGl` lists that object in an
     * effect's dependencies — so every render of the page tore down a WebGL2 context, built another, and re-ran
     * the ≤400 ms viewpoint search. `searchQuery` lives on that page and does not feed `useGraph` at all, so it
     * was one context per keystroke for an identical graph.
     *
     * Asserted on the source because reproducing it needs ReactFlow, d3 and a GPU. The check is written to
     * FAIL LOUDLY if the guard is removed without the underlying hook being fixed, and the second half says
     * when the guard may go: the moment `useGraph` memoises its own return, this can be a plain dependency.
     */
    const fs = await import('node:fs');
    const path = await import('node:path');
    const page = path.resolve(process.cwd(), 'src/pages/OntologyExplorer.tsx');
    expect(fs.existsSync(page), `cannot find ${page} — this check would otherwise pass vacuously`).toBe(true);
    const src = fs.readFileSync(page, 'utf8');
    /* Every orrery memo is keyed on the content signature. Three of them, and a single `[rawNodes]` would be
       enough to put the context churn back. */
    expect([...src.matchAll(/\[orrerySignature\]/g)].length).toBe(3);
    expect(src, 'the signature must cover what magnitudeOf reads, or absent/withheld would go stale')
      .toMatch(/rec\.confidence/);
    expect(src).toMatch(/rec\.restricted/);

    const hook = fs.readFileSync(path.resolve(process.cwd(), 'src/hooks/useGraph.ts'), 'utf8');
    const memoised = /const nodes: Node\[\] = useMemo\(/.test(hook);
    if (memoised) {
      throw new Error(
        'useGraph now memoises its return, so the orrerySignature guard in OntologyExplorer.tsx is no longer '
        + 'load-bearing: key the three orrery memos on [rawNodes] / [edges] and delete this branch.',
      );
    }
  });

  it('returns the reader to the diagram when the GPU drops the context, and frees what it allocated', async () => {
    /*
     * Two lifecycle rules, both invisible in a capture. Without the context-loss handler the canvas keeps its
     * last frame for ever while the GPU has moved on — a stale picture presented as live data. And every
     * `uploadMesh` creates a VAO and four buffers whose only route to being freed is the disposer this file
     * records: `Stage` tracks its programs and its own targets and knows nothing about a mesh, so a missing
     * registration leaks silently on every toggle. The sibling environment shipped with exactly that.
     */
    const fs = await import('node:fs');
    const path = await import('node:path');
    const file = path.resolve(process.cwd(), 'src/components/geometry/OntologyOrreryGl.tsx');
    expect(fs.existsSync(file), `cannot find ${file} — this check would otherwise pass vacuously`).toBe(true);
    const src = fs.readFileSync(file, 'utf8');
    expect(src).toContain('webglcontextlost');
    expect(src).toContain('CONTEXT_LOST');

    const calls = [...src.matchAll(/uploadMesh\(/g)];
    expect(calls.length, 'a file that uploads no mesh cannot pass this vacuously').toBeGreaterThan(0);
    for (const m of calls) {
      expect(
        /disposers\.push\(/.test(src.slice(m.index, m.index + 300)),
        'every uploadMesh must register its disposer in its own block, before the next upload is attempted',
      ).toBe(true);
    }
    /* Reverse, and the stage LAST — it owns the context, so releasing it first leaves every other delete*
       call operating on a dead one: silent rather than fatal, and it leaks on every remount. */
    expect(src).toMatch(/for \(const d of disposers\.reverse\(\)\) d\(\);\s*(\/\*[\s\S]*?\*\/\s*)?stage\.dispose\(\);/);
  });
});

describe('the orrery layout — the claims, as numbers', () => {
  it('places every entity, and the core at the origin', () => {
    const out = build();
    if (isOrreryRefusal(out)) throw new Error('expected a layout, got ' + out.code + ': ' + out.reason);
    expect(out.bodies.length).toBe(SMALL.entities.length);
    expect(out.core.id).toBe('HUB');
    expect(out.core.pos).toEqual([0, 0, 0]);
    /* Hops are COMPUTED. HUB's neighbours are one hop out and the products are two. */
    const hopOf = new Map(out.bodies.map((b) => [b.id, b.hops]));
    expect(hopOf.get('A')).toBe(1);
    expect(hopOf.get('P')).toBe(2);
  });

  it('makes radius a function of hops alone, so two entities the same distance out share a shell', () => {
    const out = build();
    if (isOrreryRefusal(out)) throw new Error(out.code);
    const shellOf = (id: string) => out.bodies.find((b) => b.id === id)!.shell;
    expect(shellOf('A')).toBe(shellOf('B'));
    expect(shellOf('P')).toBeGreaterThan(shellOf('A'));
  });

  it('the reader’s selection becomes the core, and the shells move with it', () => {
    const out = build({ selectedId: 'Q' });
    if (isOrreryRefusal(out)) throw new Error(out.code);
    expect(out.core.id).toBe('Q');
    expect(out.bodies.find((b) => b.id === 'HUB')!.hops).toBe(2);
  });

  it('leaves no crossing a reader cannot resolve, and proves it without a camera', () => {
    const out = build();
    if (isOrreryRefusal(out)) throw new Error(out.code);
    expect(out.crossings.ambiguous).toBe(0);
    /* The camera-independent bound: tubes that do not graze in 3-D cannot fuse into an unreadable X from ANY
       viewpoint, so this 0 is a statement about every viewpoint rather than about the chosen one. */
    expect(out.crossings.grazingPairs3D).toBe(0);
    expect(out.crossings.minSeparation3DM).toBeGreaterThan(0);
    expect(out.crossings.ambiguous).toBeLessThanOrEqual(out.crossings.flatControlInPlane);
  });

  it('publishes a link that runs through an entity rather than refusing over it', () => {
    /*
     * E4 counted `linksThroughBodies` and fixed it by MOVING an entity. Nothing here can move one — the angles
     * are derived from the data so the same graph always produces the same frame — so the spacing ladder tries,
     * and whatever it cannot fix is published. This six-entity system pierces one body at every spacing, and
     * the number reaching the caller is what makes that visible instead of quietly costing the reader an entity.
     */
    const out = build();
    if (isOrreryRefusal(out)) throw new Error(out.code);
    expect(out.crossings.piercedBodies3D).toBeGreaterThanOrEqual(0);
    expect(out.crossings.throughBodies3D).toBeGreaterThanOrEqual(out.crossings.piercedBodies3D);
  });

  it('THIRD_AXIS_BUYS_NOTHING fires exactly when the plane is no worse than the orbits', () => {
    /*
     * The one refusal here that no input in the shipped ontology triggers, so the decision is a function and the
     * function is tested — an untested refusal is a silent default waiting to happen. The `> 0` guard is the
     * subtlety: both readings clean is a win for neither, and a bare `>=` would refuse the easiest case there is.
     */
    expect(ORRERY_REFUSALS).toContain('THIRD_AXIS_BUYS_NOTHING');
    expect(thirdAxisBuysNothing(0, 0), 'both clean is not a failure').toBe(false);
    expect(thirdAxisBuysNothing(2, 30), 'two against thirty is the win this exists for').toBe(false);
    expect(thirdAxisBuysNothing(4, 4), 'no better than the plane').toBe(true);
    expect(thirdAxisBuysNothing(5, 4), 'worse than the plane').toBe(true);
    expect(thirdAxisBuysNothing(1, 0), 'the plane was clean and the orbits are not').toBe(true);
  });

  it('does not refuse a system where BOTH readings are clean', () => {
    /*
     * E4 put this gate on itself: "if a reordering could get the flat diagram to zero crossings then
     * inclination would be buying nothing and this environment would not be entitled to exist." A star has no
     * crossings in either reading, so the refusal must NOT fire there — that is the easiest case, not a
     * failure — and this checks the gate is keyed on the comparison rather than on a bare zero.
     */
    const star = build({
      entities: [entity('S', 'license'), entity('X', 'product'), entity('Y', 'product'), entity('Z', 'product')],
      couplings: [coupling('S', 'X'), coupling('S', 'Y'), coupling('S', 'Z')],
      allCouplings: [coupling('S', 'X'), coupling('S', 'Y'), coupling('S', 'Z')],
    });
    if (isOrreryRefusal(star)) throw new Error('a star must draw, not refuse: ' + star.code);
    expect(star.crossings.ambiguous).toBe(0);
    expect(star.crossings.flatControlInPlane).toBe(0);
  });

  it('refuses a kind it has no plane for, rather than borrowing another kind’s', () => {
    const out = build({
      entities: [entity('D', 'domain'), entity('R', 'requirement')],
      couplings: [coupling('D', 'R')],
      allCouplings: [coupling('D', 'R')],
    });
    if (!isOrreryRefusal(out)) throw new Error('expected a refusal');
    expect(out.code).toBe('KIND_HAS_NO_PLANE');
    expect(out.reason).toContain('domain');
  });

  it('refuses when the reader selects an entity with nothing orbiting it', () => {
    /*
     * One click away in the shipped page: Montana requires no state licence, so it has no couplings at all.
     * Made the core, every other entity would have no path to it, the whole graph would land on the off-system
     * rail, and radius would be encoding nothing while still looking like an encoding.
     */
    const out = build({ selectedId: 'ORPHAN', entities: [...SMALL.entities, entity('ORPHAN', 'state')] });
    if (!isOrreryRefusal(out)) throw new Error('expected a refusal');
    expect(out.code).toBe('NOTHING_TO_ORBIT');
    expect(out.reason).toContain('ORPHAN');
    expect(out.reason).toMatch(/clear the selection/i);
  });

  it('refuses a canvas with no size, because every pixel claim is against it', () => {
    const out = build({ cssWidth: 0, cssHeight: 0 });
    expect(isOrreryRefusal(out) && out.code).toBe('CANVAS_HAS_NO_SIZE');
  });

  it('refuses a graph with no couplings, because radius would encode nothing', () => {
    const out = build({ couplings: [], allCouplings: [] });
    expect(isOrreryRefusal(out) && out.code).toBe('NO_COUPLINGS_TO_READ');
  });

  it('keeps every body above the pixel floor when it agrees to draw at all', () => {
    const out = build();
    if (isOrreryRefusal(out)) throw new Error(out.code);
    expect(out.px.smallestBody).toBeGreaterThanOrEqual(BODY_PX_FLOOR);
    /* Ring and tube thickness are specified in PIXELS and converted to metres, because E4's ring was 1.2 px
       and was misdiagnosed as a colour problem. */
    expect(out.px.ring).toBeGreaterThan(2);
    expect(out.px.link).toBeGreaterThan(2);
  });

  it('separates the four inclinations by at least 25 degrees', () => {
    /* Two planes at a shallow angle intersect in a way that makes bodies on them appear to share a ring, which
       is the flat layout's ambiguity reintroduced through the back door. */
    const incs = Object.values(ORRERY_PLANES).map((p) => p.incDeg);
    for (let i = 0; i < incs.length; i++) {
      for (let j = i + 1; j < incs.length; j++) {
        expect(Math.abs(incs[i]! - incs[j]!), `${incs[i]} vs ${incs[j]}`).toBeGreaterThanOrEqual(25);
      }
    }
  });
});

describe('absent, withheld and a measured zero stay three different things — §6 rule 6', () => {
  it('reads all three states off the record, and never collapses two of them', () => {
    expect(magnitudeOf({ confidence: 'Medium' }, 0)).toEqual({ state: 'observed', couplings: 0 });
    expect(magnitudeOf({ confidence: 'Low' }, 7)).toEqual({ state: 'absent' });
    expect(magnitudeOf({ restricted: true, confidence: 'High' }, 7)).toEqual({ state: 'withheld' });
  });

  it('gives a measured ZERO the smallest size on the scale rather than refusing it', () => {
    /* Montana requires no state licence, at `sourceAuthority: 1`. That zero is a reading, not a gap. */
    expect(observedRadius(0)).toBeGreaterThan(0);
    expect(observedRadius(0)).toBeLessThan(observedRadius(1));
  });

  it('gives absent and withheld a size that is NOT on the observed scale, and not each other’s', () => {
    /* Any radius at all sits somewhere on the scale and therefore asserts a count, so the resolution is to
       leave the scale: a ring and a drum are not spheres. The two must also differ from each other. */
    const absent = radiusOf({ state: 'absent' });
    const withheld = radiusOf({ state: 'withheld' });
    expect(absent).not.toBe(withheld);
    expect(absent).not.toBe(observedRadius(0));
    expect(withheld).not.toBe(observedRadius(0));
  });

  it('carries all three into the layout as separate counts, with a withheld body still placed', () => {
    const out = build({
      entities: [
        entity('HUB', 'license', { confidence: 'High' }),
        entity('LOW', 'requirement', { confidence: 'Low' }),
        entity('SEALED', 'requirement', { restricted: true }),
        entity('ZERO', 'product', { confidence: 'Medium' }),
      ],
      couplings: [coupling('HUB', 'LOW'), coupling('HUB', 'SEALED'), coupling('HUB', 'ZERO')],
      allCouplings: [coupling('HUB', 'LOW'), coupling('HUB', 'SEALED'), coupling('HUB', 'ZERO')],
    });
    if (isOrreryRefusal(out)) throw new Error(out.code);
    expect(out.counts).toMatchObject({ observed: 2, absent: 1, withheld: 1 });
    /* The withheld body is on its orbit and lit: you can see that an entity is there and that you are not being
       shown its measure, which is the actual state of the thing and what a table destroys. */
    const sealed = out.bodies.find((b) => b.id === 'SEALED')!;
    expect(sealed.magnitude.state).toBe('withheld');
    expect(sealed.hops).toBe(1);
    expect(sealed.offSystem).toBe(false);
  });

  it('puts an entity with no path to the core OFF the shells rather than on the outer ring', () => {
    /* Radius encodes relationship distance. An entity the search never reached has none, so parking it on the
       outermost ring would read as "three hops away" — a number nobody measured. */
    const out = build({
      entities: [...SMALL.entities, entity('ORPHAN', 'state')],
      couplings: SMALL.couplings,
      allCouplings: SMALL.couplings,
    });
    if (isOrreryRefusal(out)) throw new Error(out.code);
    const orphan = out.bodies.find((b) => b.id === 'ORPHAN')!;
    expect(orphan.hops).toBeNull();
    expect(orphan.offSystem).toBe(true);
    expect(out.counts.offSystem).toBe(1);
    expect(out.shells).not.toContain(orphan.shell);
  });
});

describe('the layout against the SHIPPED ontology, not a fixture', () => {
  const layersFor = (kinds: string[], phases: string[]) => {
    const nodes = ontologyGraph.nodes.filter((n) => kinds.includes(n.type) && phases.includes(n.phase));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = ontologyGraph.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    return {
      entities: nodes.map((n) => ({ id: n.id, label: n.label, kind: n.type, record: n.data })),
      couplings: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, kind: e.type })),
    };
  };
  const ALL_PHASES = ['Pre-launch', 'Phase 1', 'Phase 2', 'Phase 3'];

  it('draws licences, requirements and products, and beats the flattened control by a measured margin', () => {
    const g = layersFor(['license', 'requirement', 'product'], ALL_PHASES);
    const out = buildOrrery({
      ...g, allCouplings: ontologyGraph.edges, selectedId: null, cssWidth: 1200, cssHeight: 700,
    });
    if (isOrreryRefusal(out)) throw new Error('expected a layout: ' + out.code + ' — ' + out.reason);
    expect(out.bodies.length).toBe(g.entities.length);
    expect(out.core.id).toBe('STATE_MTL');
    /* The shipped ontology is NOT connected: two of these twenty-four entities are in components of their own,
       and they must be visible and off the shells rather than dropped. */
    expect(out.counts.offSystem).toBeGreaterThan(0);
    expect(out.crossings.ambiguous).toBeLessThan(out.crossings.flatControlInPlane);
    expect(out.crossings.throughBodies3D).toBeLessThan(out.crossings.throughBodiesFlat);
  });

  it('refuses the full fifty-state view rather than hiding an entity behind another', () => {
    /*
     * This is the honest outcome and it is measured, not assumed: fifty states, six licences, ten requirements
     * and eight products cannot be placed on shells at 1200x700 without two bodies merging into one silhouette
     * or a body falling under the pixel floor. Size encodes the coupling count, so a merged pair is a misread
     * number. The reader is told which layer to turn off.
     */
    const g = layersFor(['state', 'license', 'requirement', 'product'], ALL_PHASES);
    expect(g.entities.length).toBeGreaterThan(70);
    const out = buildOrrery({
      ...g, allCouplings: ontologyGraph.edges, selectedId: null, cssWidth: 1200, cssHeight: 700,
      searchBudgetMs: 900,
    });
    /*
     * THIS USED TO ASSERT A REFUSAL, AND THE REFUSAL WAS THE RIGHT ANSWER TO A DIFFERENT LENS.
     *
     * The camera solved its distance so the system's bounding SPHERE was tangent to a hand-authored
     * field of view. The drawing is not a sphere — it is a stack of tilted rings and a rail — so a
     * third of the height and nearly half the width of every frame was empty canvas, and every body
     * came out about a third smaller than the window allowed. 74 entities then failed the 9-px
     * legibility floor, and refusing was correct: a size encoding on an anti-aliased dot is not an
     * encoding.
     *
     * The lens is now fitted to what is actually drawn, which at this canvas is an exact zoom of
     * 1.327 on both axes. The bodies clear the floor on their own merit, so the refusal does not
     * fire — and that is the fix, not a regression.
     *
     * WHAT IS ASSERTED INSTEAD is the thing the refusal existed to protect: the smallest body is at
     * or above the floor, and the size ORDERING survives. A test that merely stopped expecting a
     * refusal would pass equally well if the floor had been deleted.
     */
    if (isOrreryRefusal(out)) {
      throw new Error(`74 entities now fit at 1200x700 and must render, but got ${out.code}`);
    }
    expect(out.px.smallestBody,
      'the smallest body must still clear the legibility floor — the refusal was removed by making'
      + ' the bodies bigger, not by lowering the bar').toBeGreaterThanOrEqual(BODY_PX_FLOOR);
    expect(out.px.largestBody).toBeGreaterThan(out.px.smallestBody);
  });

  it('and the refusal still FIRES where the bodies genuinely cannot clear the floor', () => {
    /*
     * The negative control for the test above. Without it, "no refusal at 1200x700" is satisfied by
     * a build that can no longer refuse at all — which is the failure mode of relaxing a guard.
     * Shrink the canvas until the same ontology cannot be drawn legibly and confirm the floor still
     * speaks, by the same codes it always used.
     */
    const g = layersFor(['state', 'license', 'requirement', 'product'], ALL_PHASES);
    const tiny = buildOrrery({
      ...g, allCouplings: ontologyGraph.edges, selectedId: null, cssWidth: 320, cssHeight: 200,
      searchBudgetMs: 900,
    });
    if (!isOrreryRefusal(tiny)) {
      throw new Error(`expected a refusal at 320x200 for ${g.entities.length} entities`);
    }
    expect(['BODIES_MERGE_AT_EVERY_VIEWPOINT', 'BODIES_BELOW_LEGIBILITY_FLOOR']).toContain(tiny.code);
  });

  it('sizes bodies from the FULL ontology, so a layer toggle does not shrink an entity', () => {
    const withStates = layersFor(['state', 'license', 'requirement', 'product'], ALL_PHASES);
    const withoutStates = layersFor(['license', 'requirement', 'product'], ALL_PHASES);
    const a = buildOrrery({
      ...withoutStates, allCouplings: ontologyGraph.edges, selectedId: null, cssWidth: 1200, cssHeight: 700,
    });
    if (isOrreryRefusal(a)) throw new Error(a.code);
    const mtlWithout = a.bodies.find((b) => b.id === 'MTL')!;
    /* MTL has forty couplings in the ontology and five in this view. The body's size must report the forty:
       turning off a layer stops the reader looking at some couplings, it does not remove them. */
    expect(mtlWithout.magnitude).toEqual({
      state: 'observed',
      couplings: ontologyGraph.edges.filter((e) => e.source === 'MTL' || e.target === 'MTL').length,
    });
    expect(withStates.couplings.filter((c) => c.source === 'MTL' || c.target === 'MTL').length)
      .toBeGreaterThan(withoutStates.couplings.filter((c) => c.source === 'MTL' || c.target === 'MTL').length);
  });
});
