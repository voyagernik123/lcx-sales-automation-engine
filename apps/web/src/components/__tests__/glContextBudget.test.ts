import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * §6 RULE 7, ENFORCED FOR THE APP — which it was not, for the entire life of the programme.
 *
 * `packages/gl/src/env/harnessRules.test.ts:126-133` enforces rule 7 ("one shared GL context;
 * sixty contexts will exhaust an 8 GB M1") by globbing every `docs/3d/eN/entry.ts` and asserting
 * one `createStage` per environment. NOTHING equivalent existed for `apps/web`. The app is where
 * the rule actually matters — the harnesses are one page each, the app is a shell that mounts
 * many components at once — and it was the half nobody checked.
 *
 * ── WHY A BREACH WOULD NOT LOOK LIKE A GRAPHICS BUG ─────────────────────────────────────
 * Browsers cap live WebGL contexts (commonly 8-16) and past the cap kill the OLDEST context
 * SILENTLY. Nothing throws. And on every route that draws a chart, the oldest context is the
 * shared one: `SignatureBackdrop` and every flat chart go through `sharedRenderer()`, which is
 * built on first paint, while the 3-D reliefs create theirs only when a reader clicks a toggle.
 * So the first casualty of a breach is not the newest relief — it is the ONE context every
 * chart on the page depends on, and the whole page of charts blanks at once. That reads as a
 * data bug, and it is the reason this file pins a number rather than describing an intention.
 *
 * ── THE NUMBER, AND WHY 3 IS SAFE AGAINST A CAP OF 8-16 ─────────────────────────────────
 * Measured by walking the static AND dynamic import graph from every route in `router.tsx`
 * (78 routes today):
 *
 *   · 63 routes reach no GL at all.
 *   · 14 routes reach exactly one context: either the shared renderer (a chart or
 *     `SignatureBackdrop`) or one relief.
 *   · ONE route reaches three — `pages/CommandDeck.tsx`:
 *        1. the shared context, via `SignatureBackdrop` (CommandDeck.tsx:95, always mounted,
 *           so it is created on first paint and is therefore the oldest)
 *        2. `DeckReliefGl`, via `<DeckRelief>` (CommandDeck.tsx:162), opt-in
 *        3. `SurfaceReliefGl`, via `<SurfaceRelief>` inside `LpOptimizerPanel`
 *           (CockpitPanels.tsx:501), opt-in
 *     Both toggles are independent `useState(false)` in their own wrapper with no coordination
 *     between them, so both CAN be on at once. Three is the honest worst case, not two.
 *
 * Three against a cap of 8-16 leaves 5-13 spare, and the two discretionary contexts are
 * reader-initiated one click at a time. That is the whole safety argument, and it is why the
 * cap here is 3 and not a comfortable 8: at 8 the assertion would permit the app to grow to
 * the browser's own limit before anything went red, which is a guard that fires after the
 * damage rather than before it.
 *
 * ── WHAT THIS FILE CANNOT SEE, stated rather than left to be discovered ─────────────────
 *  · A relief mounted inside a `.map()`. The census below counts JSX MOUNT SITES, and one site
 *    inside a loop is N contexts at runtime. A second site is caught; a loop is not.
 *  · Contexts that are no longer mounted but not yet collected. `stage.dispose()`
 *    (`packages/gl/src/stage.ts:322-330`) deletes programs, targets, buffers and the VAO but
 *    does NOT call `WEBGL_lose_context.loseContext()`, so the context slot itself is freed when
 *    the canvas is garbage-collected rather than when the toggle is switched off. Toggling
 *    relief on and off repeatedly can therefore hold more contexts than are mounted. That is a
 *    real hazard, it is NOT measured anywhere, and closing it means editing `stage.ts`.
 *  · Whether the two opt-in toggles on CommandDeck are ever on at once in practice. This
 *    asserts the upper bound, which is the thing a future change can raise.
 */

/*
 * Resolved from `process.cwd()` (apps/web) rather than `import.meta.url`, matching
 * `components/geometry/__tests__/surfaceRelief.test.tsx:97`, and every root is asserted to
 * exist before it is walked — a source census that silently finds nothing is a green test that
 * checks nothing, which is the exact failure this file exists to prevent.
 */
const SRC = resolve(process.cwd(), 'src');
const ROUTER = join(SRC, 'router.tsx');

/** The maximum number of simultaneously live WebGL contexts any single route can reach. */
const CONCURRENT_CAP = 3;
/** The route that is at the cap. Pinned so a NEW worst case shows up as a diff, not a tie. */
const WORST_ROUTE = 'pages/CommandDeck.tsx';

/**
 * Routes with more JSX mount sites for one relief than can be live at once, with the reason.
 *
 * An entry here is an ADMISSION, not an exemption, and the assertion below fails if one stops
 * being true — the discipline `components/ui/__tests__/deadUiComponents.test.ts` uses for its
 * KNOWN_DEAD list, so this cannot quietly become the place unchecked mounts live.
 */
const EXCLUSIVE_MOUNTS = new Map<string, { owner: string; sites: number; why: string }>([
  ['pages/BdPipeline.tsx', {
    owner: 'components/geometry/PipelineReliefGl.tsx',
    sites: 2,
    why: 'the two <PipelineRelief> mounts are the two arms of one ternary on `activeSplit`'
      + ' (BdPipeline.tsx:849 and :893) — the source says so at :890, and only one arm renders,'
      + ' so the page has exactly one channel toggle at a time',
  }],
]);

function walk(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    if (entry === 'node_modules') continue;
    const full = join(root, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = existsSync(SRC)
  ? walk(SRC).filter((f) => !f.includes('__tests__') && !/\.test\.tsx?$/.test(f))
  : [];
const SOURCE = new Map(FILES.map((f) => [f, readFileSync(f, 'utf8')]));
const id = (f: string) => relative(SRC, f);

/** Static imports, re-exports AND dynamic `import()` — a lazy relief is still a relief. */
function specifiers(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/from\s*['"]([^'"]+)['"]/g)) out.push(m[1]!);
  for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]!);
  return out;
}

/** `@/x` and relative specifiers to a real file. Anything else is a package, so not ours. */
function resolveSpecifier(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = SOURCE.get(file);
    if (src === undefined) continue;
    for (const spec of specifiers(src)) {
      const next = resolveSpecifier(spec, file);
      if (next !== null && !seen.has(next)) stack.push(next);
    }
  }
  return seen;
}

/** Modules that build their OWN context. One live context each, while mounted. */
const OWNERS = FILES.filter((f) => /createStage\s*\(/.test(SOURCE.get(f)!));
/** Modules that draw through the ONE offscreen context, however many of them a page mounts. */
const SHARED_USERS = FILES.filter((f) => /sharedRenderer\s*\(/.test(SOURCE.get(f)!));

/**
 * The component names whose JSX brings each owner in — derived from the module that imports it
 * rather than hand-listed, so an owner added tomorrow is censused tomorrow.
 */
const MOUNT_NAMES = new Map<string, string[]>(OWNERS.map((owner) => {
  const names: string[] = [];
  for (const file of FILES) {
    if (file === owner) continue;
    if (!specifiers(SOURCE.get(file)!).some((s) => resolveSpecifier(s, file) === owner)) continue;
    for (const m of SOURCE.get(file)!.matchAll(/export function ([A-Z]\w*)/g)) names.push(m[1]!);
  }
  return [owner, names];
}));

/** Every page module the router can navigate to, eager or lazy. */
const ROUTES = existsSync(ROUTER)
  ? [...new Set([
    ...[...readFileSync(ROUTER, 'utf8').matchAll(/import\(\s*['"](@\/pages\/[^'"]+)['"]/g)].map((m) => m[1]!),
    ...[...readFileSync(ROUTER, 'utf8').matchAll(/from\s*['"](@\/pages\/[^'"]+)['"]/g)].map((m) => m[1]!),
  ])]
    .map((spec) => resolveSpecifier(spec, ROUTER))
    .filter((f): f is string => f !== null)
    .sort()
  : [];

interface RouteBudget {
  readonly route: string;
  readonly own: string[];
  readonly shared: boolean;
  readonly concurrent: number;
  /** Mount sites per owner, which can exceed 1 without the concurrent count doing so. */
  readonly sites: Map<string, number>;
}

const BUDGETS: RouteBudget[] = ROUTES.map((route) => {
  const files = reachable(route);
  const own = OWNERS.filter((o) => files.has(o));
  const shared = SHARED_USERS.some((s) => files.has(s));
  const sites = new Map<string, number>();
  for (const owner of own) {
    let n = 0;
    for (const name of MOUNT_NAMES.get(owner)!) {
      for (const file of files) {
        const src = SOURCE.get(file);
        if (src === undefined) continue;
        n += [...src.matchAll(new RegExp(`<${name}[\\s/>]`, 'g'))].length;
      }
    }
    sites.set(id(owner), n);
  }
  return { route: id(route), own: own.map(id), shared, concurrent: own.length + (shared ? 1 : 0), sites };
});

describe('§6 rule 7 — the live GL context budget of the shipping app', () => {
  it('finds routes, context owners and shared-renderer callers at all', () => {
    /* Three floors, because each of the three censuses below is silently vacuous if its own
       glob comes back empty — and an empty glob is how this class of guard dies. */
    expect(existsSync(SRC), `cannot find ${SRC}`).toBe(true);
    expect(existsSync(ROUTER), `cannot find ${ROUTER}`).toBe(true);
    expect(ROUTES.length, 'no routes parsed out of router.tsx').toBeGreaterThanOrEqual(70);
    expect(OWNERS.length, 'no createStage call sites found in apps/web/src').toBeGreaterThanOrEqual(9);
    expect(SHARED_USERS.length, 'no sharedRenderer call sites found — the flat chart path vanished')
      .toBeGreaterThanOrEqual(4);
    /* Every owner must be reachable from at least one route, or the census is measuring a
       module nobody can navigate to and the cap it produces is not the app's cap. */
    for (const owner of OWNERS) {
      const routes = BUDGETS.filter((b) => b.own.includes(id(owner))).map((b) => b.route);
      expect(routes.length, `${id(owner)} creates a GL context but no route reaches it`)
        .toBeGreaterThanOrEqual(1);
    }
  });

  it('every context-owning module creates exactly ONE context', () => {
    /*
     * The same assertion `harnessRules.test.ts:129` makes for each `docs/3d` environment, now
     * made for each shipping component. A second `createStage` inside one component is the
     * cheapest way to double the app's context count without changing any page.
     */
    for (const owner of OWNERS) {
      const n = [...SOURCE.get(owner)!.matchAll(/createStage\s*\(/g)].length;
      expect(n, `${id(owner)} calls createStage ${n} times — rule 7 allows one context`).toBe(1);
    }
  });

  it('no chart primitive builds its own context — charts share the one offscreen context', () => {
    /*
     * The premise the whole shared renderer rests on (`flat/shared.ts:4-12`): a naive context
     * per chart works on a three-chart test page and blanks the top half of a real dashboard.
     * `KpiDashboard` and `BoardReport` each mount several charts inside `overflow-y-auto`, so
     * one context per chart would put a single route over the cap on its own.
     */
    const chartFiles = FILES.filter((f) => id(f).startsWith('components/charts/'));
    expect(chartFiles.length, 'no chart components found — this check would pass vacuously')
      .toBeGreaterThanOrEqual(10);
    for (const f of chartFiles) {
      expect(/createStage\s*\(/.test(SOURCE.get(f)!),
        `${id(f)} builds its own GL context instead of going through sharedRenderer()`).toBe(false);
    }
  });

  it(`no route can hold more than ${CONCURRENT_CAP} live contexts, and ${WORST_ROUTE} is the one at the cap`, () => {
    expect(BUDGETS.length).toBe(ROUTES.length);
    const worst = BUDGETS.reduce((a, b) => (b.concurrent > a.concurrent ? b : a));
    const describeRoute = (b: RouteBudget) =>
      `${b.route} = ${b.concurrent} (own: ${b.own.join(', ') || 'none'}${b.shared ? '; + the shared context' : ''})`;

    for (const b of BUDGETS) {
      expect(b.concurrent,
        `${describeRoute(b)} exceeds the pinned worst case of ${CONCURRENT_CAP}. Past the`
        + ' browser cap of 8-16 the OLDEST context is killed silently, and on a chart route that'
        + ' is the shared one — every chart on the page blanks and it looks like a data bug.'
        + ' Raising this number is a decision, not a formality: say which route, which component,'
        + ' and why the reader can have both at once.').toBeLessThanOrEqual(CONCURRENT_CAP);
    }

    /* An EQUALITY, not a ceiling. If the worst case drops the pin is stale and should be
       lowered — a cap nobody is at has stopped measuring anything. */
    expect(worst.concurrent, `the worst route is now ${describeRoute(worst)}`).toBe(CONCURRENT_CAP);
    expect(worst.route,
      `${WORST_ROUTE} is no longer the route at the cap — ${describeRoute(worst)} is`)
      .toBe(WORST_ROUTE);
  });

  it('each relief has exactly one mount site per route, unless the exception says why not', () => {
    /*
     * THE BLIND SPOT THE IMPORT GRAPH CANNOT SEE. Reachability counts a component once however
     * many times a route mounts it, so a page that renders two `<GlobeRelief>` side by side
     * reads as one context and is two. This census counts the JSX sites instead, and every
     * count above one has to be justified in `EXCLUSIVE_MOUNTS` by a human who checked that the
     * mounts are mutually exclusive.
     */
    let censused = 0;
    for (const b of BUDGETS) {
      for (const [owner, sites] of b.sites) {
        censused++;
        const allowed = EXCLUSIVE_MOUNTS.get(b.route);
        const cap = allowed && allowed.owner === owner ? allowed.sites : 1;
        expect(sites,
          `${b.route} mounts ${owner} at ${sites} JSX sites (allowed ${cap}). If those mounts are`
          + ' mutually exclusive, add the route to EXCLUSIVE_MOUNTS with the reason; if they can'
          + ' both render, this route holds more contexts than the budget above believes.')
          .toBeLessThanOrEqual(cap);
      }
    }
    expect(censused, 'no owner/route pairs were censused — the loop above proved nothing')
      .toBeGreaterThanOrEqual(9);

    /* AND EVERY EXCEPTION MUST STILL BE NEEDED. A stale entry is how an exemption list becomes
       the place unchecked mounts live. */
    for (const [route, entry] of EXCLUSIVE_MOUNTS) {
      const b = BUDGETS.find((x) => x.route === route);
      expect(b, `EXCLUSIVE_MOUNTS names ${route}, which is no longer a route`).toBeDefined();
      expect(b!.sites.get(entry.owner),
        `EXCLUSIVE_MOUNTS allows ${entry.sites} mounts of ${entry.owner} on ${route} — it now has`
        + ` ${b!.sites.get(entry.owner)}. Delete the entry if the extra mount is gone: ${entry.why}`)
        .toBe(entry.sites);
    }
  });
});
