/**
 * E4 · WHICH SCREENS THE ORRERY CAN BE OPENED ON, as a measurement rather than as an omission.
 *
 * ── THE DEFECT THIS FILE EXISTS TO STOP COMING BACK ──────────────────────────────────
 * The orrery refused the shipped ontology below roughly 800 CSS px of canvas — which is a 13-inch MacBook at
 * its default 1440x900 and a 1366x768 laptop, two of the commonest screens on the desk — and NOTHING recorded
 * that. `docs/3d` states no viewport floor, so an environment a large share of the desk could not reach was
 * filed as delivered. A floor that is not measured is a floor that moves.
 *
 * The refusal itself was never the bug and is not weakened here: a size encoding on a 9-pixel anti-aliased dot
 * is not an encoding, and `theFloorStillRefusesWhenItMust` proves the guard still fires. What was wrong was the
 * FRAMING — the camera was solved against the system's bounding sphere and the drawing is not a sphere, so a
 * third of the height and nearly half the width of every frame was empty canvas the reader had paid for.
 * Measured at 1184x768 over every body silhouette and every drawn ring: 66.5% h / 51.7% w before, 88.2% /
 * 68.6% after. This line previously said 36% and 62% — the complement of a pair that reproduced by no method
 * — and neither figure was guarded by an assertion, which is how it survived. Stated in words here and
 * measured in `orreryLayout.ts` rather than restated as a second copy of a number.
 *
 * ── THE VIEWPORT-TO-CANVAS MAPPING IS MEASURED, NOT ASSUMED ──────────────────────────
 * The layout is handed the CANVAS size, not the window size, so a claim about a laptop has to cross the page
 * chrome to mean anything. Measured in Chrome against the dev server at `/ontology`, signed in, on
 * 2026-08-15 — `document.querySelector('div.flex-1.min-h-0.relative.bg-card')`, which is the element
 * `OntologyOrreryGl` observes:
 *
 *     viewport 1440x900  ->  host 1178x755  ->  snapped 1184x768
 *     viewport 1366x768  ->  host 1104x623  ->  snapped 1120x608
 *
 * The chrome above the canvas is 146.84 px on both, the sidebar takes the rest of the width, and
 * `OntologyOrreryGl` snaps both axes to 32-px steps so a window drag cannot rebuild the layout on every frame.
 * Those are the numbers below. If the page chrome changes height, these stop being about a MacBook — which is
 * exactly why the derivation is written down instead of the two canvas sizes being pasted in as constants.
 */
import { describe, expect, it } from 'vitest';
import {
  buildOrrery, isOrreryRefusal, misreadSizePairs, observedRadius, orbitPoint,
  ORRERY_PLANES, BODY_PX_FLOOR, DECK_Y,
  type OrreryInput, type OrreryLayout, type V3,
} from '../orreryLayout';
import { ontologyGraph } from '@/data/ontology';
import { viewProjection, projectScreen } from '@lcx/gl';

/* ── THE GRAPH THE PAGE ACTUALLY DRAWS ─────────────────────────────────────────────── */

const ALL_PHASES = ['Pre-launch', 'Phase 1', 'Phase 2', 'Phase 3'];

/**
 * The layer set is READ OFF `OntologyExplorer`, not typed out here.
 *
 * A hand-copied list cannot fail on the day somebody adds competitors to the default, which is the exact
 * shape of regression this file is for: the floor is a property of the graph on screen, so a test that pins
 * the floor for a graph nobody opens pins nothing.
 */
const pageDefaultLayers = (): string[] => {
  const src = require('node:fs').readFileSync(
    require('node:path').resolve(process.cwd(), 'src/pages/OntologyExplorer.tsx'), 'utf8',
  ) as string;
  const m = /useState<Set<string>>\(new Set\(\[([^\]]*)\]\)\)/.exec(src);
  expect(m, 'the default layer set must still be a literal in OntologyExplorer.tsx').not.toBeNull();
  const layers = [...m![1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!);
  expect(layers.length).toBeGreaterThan(1);
  return layers;
};

const layersFor = (kinds: readonly string[]) => {
  const nodes = ontologyGraph.nodes.filter((n) => kinds.includes(n.type) && ALL_PHASES.includes(n.phase));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = ontologyGraph.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  return {
    entities: nodes.map((n) => ({ id: n.id, label: n.label, kind: n.type, record: n.data })),
    couplings: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, kind: e.type })),
  };
};

const build = (kinds: readonly string[], cssWidth: number, cssHeight: number) => buildOrrery({
  ...layersFor(kinds),
  allCouplings: ontologyGraph.edges,
  selectedId: null,
  cssWidth,
  cssHeight,
  /* Generous on purpose: a floor that moves with the machine's clock is not a floor. The shipped budget is
     400 ms and the fifty-state sweep measures 17-40 ms here, so this only removes the CI-machine variable. */
  searchBudgetMs: 5000,
} satisfies OrreryInput);

/* ── THE TWO LAPTOPS, DERIVED ──────────────────────────────────────────────────────── */

/** Measured in Chrome; see the header. */
const CHROME_ABOVE_CANVAS_PX = 146.84;
const SIDEBAR_AND_GUTTER_PX = 262;
/** `OntologyOrreryGl`'s own `snap`, copied because the test has to land on the size the layout is handed. */
const snap32 = (n: number): number => Math.max(0, Math.round(n / 32) * 32);
const canvasFor = (viewportW: number, viewportH: number): [number, number] => [
  snap32(viewportW - SIDEBAR_AND_GUTTER_PX),
  snap32(viewportH - CHROME_ABOVE_CANVAS_PX),
];

const LAPTOPS: readonly (readonly [string, number, number])[] = [
  ['MacBook 13-inch at its default scaling', 1440, 900],
  ['1366x768 laptop', 1366, 768],
];

describe('the orrery opens on the two commonest laptop screens', () => {
  it.each(LAPTOPS)('%s (%ix%i) draws the page default with every body above the floor', (_name, vw, vh) => {
    const [w, h] = canvasFor(vw, vh);
    const out = build(pageDefaultLayers(), w, h);
    if (isOrreryRefusal(out)) {
      throw new Error(`${vw}x${vh} -> canvas ${w}x${h} refused with ${out.code}: ${out.reason}`);
    }
    expect(out.bodies.length).toBeGreaterThan(70);
    expect(out.px.smallestBody).toBeGreaterThanOrEqual(BODY_PX_FLOOR);
    /* The floor is checked against the SMALLEST body, so every other one clears it by construction — asserted
       rather than assumed, because `px.smallestBody` is a published number and a published number can drift
       from the array it claims to summarise. */
    const eye = out.eye;
    const scale = (h / 2) / Math.tan(((out.view.fovDeg ?? 36) / 2) * (Math.PI / 180));
    for (const b of out.bodies) {
      const px = (2 * b.radius * scale)
        / Math.hypot(b.pos[0] - eye[0], b.pos[1] - eye[1], b.pos[2] - eye[2]);
      expect(px, `${b.id} is below the legibility floor`).toBeGreaterThanOrEqual(BODY_PX_FLOOR);
    }
  });

  /**
   * THE FLOOR ITSELF, DERIVED BY BISECTION RATHER THAN PASTED IN.
   *
   * Measured 2026-08-15 on the shipped ontology at 1120 px wide: the layout refuses at or below 584 px of
   * canvas height and draws from 588 up. The smaller laptop gives it 608, so the margin is 20 px — under one
   * step of the 32-px snap the host measures in. That is thin, and pinning the floor to the step rather than
   * to a comfortable inequality is the point: if a change costs the layout one snap step, the 1366x768 laptop
   * stops opening, and this says so on the commit that did it instead of in a QA pass months later.
   *
   * Before the lens was fitted the same bisection put the floor at 776 px — a 1440x900 window plus 21 px of
   * chrome it does not have.
   */
  it('has a canvas-height floor that both laptops clear, and the floor is where it was measured', () => {
    const kinds = pageDefaultLayers();
    const [w, smallerLaptopCanvasH] = canvasFor(1366, 768);
    let floor = -1;
    for (let candidate = 240; candidate <= 1200; candidate += 4) {
      if (!isOrreryRefusal(build(kinds, w, candidate))) { floor = candidate; break; }
    }
    expect(floor, 'the fifty-state view must draw at SOME height below 1200').toBeGreaterThan(0);
    expect(floor).toBeLessThanOrEqual(smallerLaptopCanvasH);
    /* Pinned to the step, not to a range: this number IS the deliverable. */
    expect(floor).toBe(588);
    expect(smallerLaptopCanvasH - floor).toBe(20);
    expect(isOrreryRefusal(build(kinds, w, floor - 4))).toBe(true);
  });

  /**
   * THE GUARD IS NOT WEAKENED, WHICH IS THE OTHER HALF OF THE CLAIM.
   *
   * Nothing here deletes the pixel floor or moves it off 9. Below the canvas the layout needs, the fifty-state
   * view still declines to draw and still says which number it declined on.
   */
  it('still refuses below the floor, by the floor, and says so', () => {
    const kinds = pageDefaultLayers();
    const out = build(kinds, 1120, 400);
    if (!isOrreryRefusal(out)) throw new Error('a 400 px canvas must not draw seventy-four entities');
    expect(out.code).toBe('BODIES_BELOW_LEGIBILITY_FLOOR');
    expect(out.reason).toContain('against a floor of 9');
    expect(BODY_PX_FLOOR).toBe(9);
  });
});

describe('what the fitted lens is allowed to change, and what it is not', () => {
  const kinds = () => pageDefaultLayers();

  /**
   * THE CLAIM THE WHOLE CHANGE RESTS ON, MEASURED RATHER THAN ARGUED.
   *
   * At a fixed eye and orientation a field-of-view change is exactly an image crop and scale. If that is true
   * then every screen offset from the principal point and every projected radius must scale by ONE factor —
   * which is what makes the merge search legitimate at the reference lens and the size ordering untouched.
   * If it is false, the frame that ships is not the frame the search approved.
   */
  it('changes the lens as an exact zoom: one factor for every offset and every radius', () => {
    const [w, h] = canvasFor(1440, 900);
    const out = build(kinds(), w, h);
    if (isOrreryRefusal(out)) throw new Error(out.code);
    expect(out.view.fovDeg).toBeLessThan(36);

    const aspect = w / h;
    const eye = out.eye;
    const at = (fovDeg: number) => {
      const vp = viewProjection({ ...out.view, fovDeg }, aspect);
      const scale = (h / 2) / Math.tan((fovDeg / 2) * (Math.PI / 180));
      return out.bodies.map((b) => {
        const q = projectScreen(vp, b.pos, w, h);
        const d = Math.hypot(b.pos[0] - eye[0], b.pos[1] - eye[1], b.pos[2] - eye[2]);
        return { dx: q.sx - w / 2, dy: q.sy - h / 2, r: (b.radius * scale) / d };
      });
    };
    const ref = at(36), fitted = at(out.view.fovDeg!);
    const k = Math.tan((36 / 2) * (Math.PI / 180)) / Math.tan(((out.view.fovDeg!) / 2) * (Math.PI / 180));
    expect(k).toBeGreaterThan(1);
    for (let i = 0; i < ref.length; i++) {
      const a = ref[i]!, b = fitted[i]!;
      /* Relative, because the offsets span three orders of magnitude across the frame. */
      expect(Math.abs(b.dx - a.dx * k)).toBeLessThan(1e-6 * (Math.abs(a.dx) * k + 1));
      expect(Math.abs(b.dy - a.dy * k)).toBeLessThan(1e-6 * (Math.abs(a.dy) * k + 1));
      expect(Math.abs(b.r - a.r * k)).toBeLessThan(1e-9 * (a.r * k + 1));
    }
    /* Therefore the merge verdict is identical, which is the property the search relies on. Measured over
       every pair rather than inferred from the scaling above. */
    const overlaps = (s: { dx: number; dy: number; r: number }[]) => {
      let n = 0;
      for (let i = 0; i < s.length; i++) {
        for (let j = i + 1; j < s.length; j++) {
          const dx = s[i]!.dx - s[j]!.dx, dy = s[i]!.dy - s[j]!.dy, sum = s[i]!.r + s[j]!.r;
          if (dx * dx + dy * dy < sum * sum) n++;
        }
      }
      return n;
    };
    expect(overlaps(fitted)).toBe(overlaps(ref));
    expect(overlaps(fitted)).toBe(0);
  });

  /**
   * WHAT A BODY'S SIZE MEANS IS UNCHANGED, stated as the encoding rather than as a promise. The radius is
   * still `R_BASE + R_PER_DECADE · log10(1 + couplings)` on the FULL ontology, so it is still an
   * order-of-magnitude reading of how much of the requirement web runs through an entity.
   */
  it('leaves the size encoding exactly where it was: log10 of the coupling count, monotonic in world units', () => {
    const [w, h] = canvasFor(1440, 900);
    const out = build(kinds(), w, h);
    if (isOrreryRefusal(out)) throw new Error(out.code);
    expect(observedRadius(0)).toBeCloseTo(0.20, 10);
    expect(observedRadius(9)).toBeCloseTo(0.20 + 0.235, 10);
    for (const b of out.bodies) {
      if (b.magnitude.state !== 'observed') continue;
      expect(b.radius).toBeCloseTo(observedRadius(b.magnitude.couplings), 12);
    }
    const observed = out.bodies.filter((b) => b.magnitude.state === 'observed');
    for (const a of observed) {
      for (const b of observed) {
        if (a.magnitude.state !== 'observed' || b.magnitude.state !== 'observed') continue;
        if (a.magnitude.couplings <= b.magnitude.couplings) continue;
        expect(a.radius, `${a.id} has more couplings than ${b.id} and must not be smaller`)
          .toBeGreaterThan(b.radius);
      }
    }
  });

  /**
   * THE ON-SCREEN ORDERING IS A DIFFERENT AND WORSE STORY, AND IT IS PUBLISHED RATHER THAN CLAIMED.
   *
   * Perspective divides by the distance to the eye, so the world-space ordering above does not survive to the
   * screen: measured on the shipped fifty-state ontology, 480 of 2,056 comparable pairs read backwards, and
   * they did at HEAD too — the count depends only on where the camera is, and a lens change cannot move it.
   *
   * This asserts the number is REAL (recomputed here from the bodies and the camera, not read back from the
   * field that reports it) and non-zero, so nobody can later read `sizeOrder` as a clean bill of health.
   */
  it('publishes how often the frame reads its own size encoding backwards, and the number is recomputable', () => {
    const [w, h] = canvasFor(1440, 900);
    const out = build(kinds(), w, h);
    if (isOrreryRefusal(out)) throw new Error(out.code);
    const eye = out.eye;
    const scale = (h / 2) / Math.tan(((out.view.fovDeg ?? 36) / 2) * (Math.PI / 180));
    const readings = out.bodies
      .filter((b) => b.magnitude.state === 'observed')
      .map((b) => ({
        couplings: (b.magnitude as { couplings: number }).couplings,
        px: (2 * b.radius * scale) / Math.hypot(b.pos[0] - eye[0], b.pos[1] - eye[1], b.pos[2] - eye[2]),
      }));
    const mine = misreadSizePairs(readings);
    expect(out.sizeOrder.comparablePairs).toBe(mine.comparablePairs);
    expect(out.sizeOrder.misread).toBe(mine.misread);
    expect(out.sizeOrder.worstMisreadPx).toBeCloseTo(mine.worstPx, 2);
    expect(out.sizeOrder.fovDeg).toBeCloseTo(out.view.fovDeg!, 2);
    /* Not a formality: this environment ships with the defect and the number must not read as zero. */
    expect(mine.misread).toBeGreaterThan(0);
    expect(mine.comparablePairs).toBeGreaterThan(mine.misread);
  });

  /** The predicate itself, driven directly, including the two cases it must NOT count. */
  it('counts a misread pair only where the data is comparable', () => {
    expect(misreadSizePairs([{ couplings: 9, px: 20 }, { couplings: 2, px: 10 }]).misread).toBe(0);
    const bad = misreadSizePairs([{ couplings: 9, px: 10 }, { couplings: 2, px: 20 }]);
    expect(bad.misread).toBe(1);
    expect(bad.comparablePairs).toBe(1);
    expect(bad.worstPx).toBeCloseTo(10, 10);
    /* Equal counts are not in an order to get wrong. */
    expect(misreadSizePairs([{ couplings: 4, px: 30 }, { couplings: 4, px: 5 }]).comparablePairs).toBe(0);
    /* Equal pixels ARE a misread: the reader cannot see a difference the data has. */
    expect(misreadSizePairs([{ couplings: 9, px: 12 }, { couplings: 2, px: 12 }]).misread).toBe(1);
  });
});

/**
 * ── EVERY GRAPH THE PILLS CAN PRODUCE, NOT THE FIVE SOMEBODY THOUGHT OF ──────────────
 *
 * `OntologyExplorer` exposes five layer pills, so the reader can put 31 different non-empty graphs in front of
 * this layout, and the two guarantees below have to hold on all of them. A hand-written list of interesting
 * cases cannot fail on the combination nobody tried, which is how the 940-px floor survived a QA pass in the
 * first place — every case anybody looked at was a big window.
 */
const everyLayerSubset = (): string[][] => {
  const src = require('node:fs').readFileSync(
    require('node:path').resolve(process.cwd(), 'src/pages/OntologyExplorer.tsx'), 'utf8',
  ) as string;
  const block = /const LAYER_PILLS = \[([\s\S]*?)\n\];/.exec(src);
  expect(block, 'LAYER_PILLS must still be a literal in OntologyExplorer.tsx').not.toBeNull();
  const pills = [...block![1]!.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]!);
  expect(pills.length).toBe(5);
  const out: string[][] = [];
  for (let mask = 1; mask < (1 << pills.length); mask++) {
    out.push(pills.filter((_, i) => (mask & (1 << i)) !== 0));
  }
  expect(out.length).toBe(31);
  return out;
};

describe('the fitted frame is never worse than the one it replaced', () => {
  it('on all 31 layer subsets at both laptops: no smaller bodies, no extra misread pairs', () => {
    let drew = 0, refused = 0, improved = 0;
    for (const kinds of everyLayerSubset()) {
      for (const [, vw, vh] of LAPTOPS) {
        const [w, h] = canvasFor(vw, vh);
        const out = build(kinds, w, h);
        if (isOrreryRefusal(out)) { refused++; continue; }
        drew++;
        const where = `${kinds.join('+')} at ${w}x${h}`;
        /* `incumbent.smallestBodyPx` is measured at the reference lens, so this IS the pre-change number. */
        expect(out.px.smallestBody, `${where}: bodies got smaller`)
          .toBeGreaterThanOrEqual(out.incumbent.smallestBodyPx);
        expect(out.sizeOrder.misread, `${where}: more pairs read backwards than before`)
          .toBeLessThanOrEqual(out.incumbent.misread);
        /* The lens may narrow, never widen — the clamp that makes the first inequality structural. */
        expect(out.sizeOrder.fovDeg, `${where}: the lens opened past the reference`).toBeLessThanOrEqual(36);
        if (out.px.smallestBody > out.incumbent.smallestBodyPx) improved++;
      }
    }
    /*
     * NOT A VACUOUS PASS. Measured 2026-08-15: 25 of the 62 (subset, laptop) pairs draw and EVERY ONE of them
     * comes out larger — between 1.13x and 2.46x — while 37 refuse, 20 of those because the chosen layers
     * share no couplings at all. `improved === drew` is the strong form on purpose: if a future change makes
     * the fit a no-op on even one graph that draws, this goes red rather than averaging it away.
     */
    expect(drew).toBeGreaterThanOrEqual(24);
    expect(improved).toBe(drew);
    expect(refused).toBeGreaterThan(0);
  }, 120_000);
});

describe('the fit frames what the renderer draws', () => {
  const rendererSource = (): string => require('node:fs').readFileSync(
    require('node:path').resolve(process.cwd(), 'src/components/geometry/OntologyOrreryGl.tsx'), 'utf8',
  ) as string;

  /**
   * A CENSUS, NOT A CHECKLIST.
   *
   * `fitLens` frames the bodies, the inclined rings and the flat control rings, and deliberately lets the deck
   * run past the frame. That is only sound while those are the only things drawn. Rather than trusting a
   * comment, this reads every `meshOf(...)` call site out of the renderer and fails on any key the fit does
   * not have an answer for — including one added tomorrow by somebody who never opens this file.
   */
  it('accounts for every geometry the renderer draws, or fails naming the one it does not', () => {
    const src = rendererSource();
    const keys = new Set(
      [...src.matchAll(/meshOf\(\s*'([a-z]+)'/g)].map((m) => m[1]!)
        .concat([...src.matchAll(/meshOf\(\s*'([a-z]+)'\s*\+/g)].map((m) => m[1]!)),
    );
    expect(keys.size, 'no meshOf(...) call sites were found — the regex has gone stale').toBeGreaterThan(3);
    const FRAMED_AS_BODY = ['sphere', 'absent', 'withheld'];
    const FRAMED_AS_RING = ['ring'];
    const INSIDE_THE_BODY_HULL = ['link'];
    const DELIBERATELY_UNFRAMED = ['deck'];
    const accounted = new Set([
      ...FRAMED_AS_BODY, ...FRAMED_AS_RING, ...INSIDE_THE_BODY_HULL, ...DELIBERATELY_UNFRAMED,
    ]);
    const unaccounted = [...keys].filter((k) => !accounted.has(k));
    expect(unaccounted, 'the renderer draws geometry `fitLens` has never heard of').toEqual([]);
    for (const k of accounted) {
      expect([...keys], `nothing draws '${k}' any more — the fit is framing something that is gone`).toContain(k);
    }
  });

  /**
   * AND THE FRAME HOLDS IT — ON EVERY GRAPH THE PILLS CAN MAKE, AT SIX SHAPES OF CANVAS.
   *
   * This is the assertion a pixel count cannot make: a frame can clear the 9-px floor while hanging a third of
   * the outer shell off the edge, and the reader would see a bigger drawing of less of the system.
   *
   * IT IS DELIBERATELY NOT SCOPED TO THE TWO LAPTOPS, and that is a correction rather than thoroughness. The
   * first draft of this test checked only the page default at 1184x768 and 1120x608, and when the rings were
   * deleted from `fitLens` to see it fail, IT PASSED — on that one graph the outermost bodies happen to sit
   * where the outermost ring does. The same mutation runs 85 px of the requirement ring off the edge on
   * licences+requirements+products and 106 px of the flat control ring on requirements+products. A guard that
   * survives the mutation it exists to catch is not a guard, so the census is what it runs on.
   *
   * The canvas shapes are the two measured laptops plus four the sidebar and a window drag can produce: the
   * fit is solved per axis, so a letterbox and a portrait canvas exercise the horizontal bound that a
   * 16:10 window never reaches.
   */
  const CANVASES: readonly (readonly [number, number])[] = [
    canvasFor(1440, 900), canvasFor(1366, 768), [1184, 1000], [640, 900], [1600, 480], [800, 800],
  ];

  it('draws nothing outside the canvas, on every layer subset at six canvas shapes', () => {
    let checked = 0, samplesChecked = 0;
    for (const kinds of everyLayerSubset()) {
      for (const [w, h] of CANVASES) {
        const out = build(kinds, w, h);
        if (isOrreryRefusal(out)) continue;
        checked++;
        const laid: OrreryLayout = out;
        const vp = viewProjection(laid.view, w / h);
        const eye = laid.eye;
        const scale = (h / 2) / Math.tan(((laid.view.fovDeg ?? 36) / 2) * (Math.PI / 180));

        const samples: { p: V3; r: number; what: string }[] =
          laid.bodies.map((b) => ({ p: b.pos, r: b.radius, what: `body ${b.id}` }));
        /* The renderer's own derivation: one inclined ring per occupied (kind, shell), one flat ring per
           shell. Sampled at 180 points, which is denser than the 128 the fit uses, so the test cannot pass by
           landing on the same samples the fit did. */
        const inclined = new Map<string, readonly [number, number, number]>();
        for (const b of laid.bodies) {
          if (b.offSystem || b.isCore || b.hops === null) continue;
          const pl = ORRERY_PLANES[b.kind]!;
          inclined.set(`${b.kind}@${b.hops}`, [b.shell, pl.incDeg, pl.nodeDeg]);
        }
        for (const [key, [r, inc, node]] of inclined) {
          for (let i = 0; i < 180; i++) {
            samples.push({ p: orbitPoint(r, (i * 360) / 180, inc, node), r: laid.ringTube, what: `ring ${key}` });
          }
        }
        for (const s of laid.shells) {
          for (let i = 0; i < 180; i++) {
            const q = orbitPoint(s, (i * 360) / 180, 0, 0);
            samples.push({ p: [q[0], DECK_Y, q[2]], r: laid.ringTube, what: `flat ring ${s.toFixed(2)}` });
          }
        }
        expect(samples.length).toBeGreaterThan(laid.bodies.length);

        const where = `${kinds.join('+')} at ${w}x${h}`;
        for (const s of samples) {
          samplesChecked++;
          const q = projectScreen(vp, s.p, w, h);
          expect(q.behind, `${where}: ${s.what} is behind the camera`).toBe(false);
          const rp = (s.r * scale) / Math.hypot(s.p[0] - eye[0], s.p[1] - eye[1], s.p[2] - eye[2]);
          /* A tenth of a pixel of slack for the difference between the fit's 128 samples plus sagitta and
             this test's 180, which is float noise rather than geometry. */
          expect(q.sx - rp, `${where}: ${s.what} runs off the left edge`).toBeGreaterThanOrEqual(-0.1);
          expect(q.sx + rp, `${where}: ${s.what} runs off the right edge`).toBeLessThanOrEqual(w + 0.1);
          expect(q.sy - rp, `${where}: ${s.what} runs off the top edge`).toBeGreaterThanOrEqual(-0.1);
          expect(q.sy + rp, `${where}: ${s.what} runs off the bottom edge`).toBeLessThanOrEqual(h + 0.1);
        }
      }
    }
    /* Measured 2026-08-15: 61 of the 186 (subset, canvas) pairs draw, and they put 76,506 sample points
       through the projection. Both are floors on the coverage, so a change that quietly stops most graphs
       drawing cannot pass this by having nothing left to check. */
    expect(checked, 'nothing drew — the census is vacuous').toBeGreaterThanOrEqual(61);
    expect(samplesChecked).toBeGreaterThan(70_000);
  }, 300_000);
});
