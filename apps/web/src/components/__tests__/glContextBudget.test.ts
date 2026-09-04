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
 * shared one: every flat chart goes through `sharedRenderer()`, built when the first chart paints
 * (until S5 the shell's `SignatureBackdrop` built it on every route), while the 3-D reliefs create
 * theirs only when a reader clicks a toggle.
 * So the first casualty of a breach is not the newest relief — it is the ONE context every
 * chart on the page depends on, and the whole page of charts blanks at once. That reads as a
 * data bug, and it is the reason this file pins a number rather than describing an intention.
 *
 * ── THE NUMBER, AND WHY 3 IS SAFE AGAINST A CAP OF 8-16 ─────────────────────────────────
 * Measured by walking the static AND dynamic import graph from every route in `router.tsx`,
 * UNIONED WITH the shell closure that wraps all of them (78 routes today):
 *
 *   · Routes with no chart of their own reach ZERO. From 2026-08-15 to S5 of INSTRUMENT_100X_PLAN
 *     (2026-09-02) they reached one — the shared context built by the shell's `SignatureBackdrop`
 *     on every route, the S0 instrument's "77 GL contexts at rest". That layer is removed (it drew
 *     nothing in light and an empty plate in dark; docs/instrument/LEDGER.md §5), so the floor is
 *     0 again and a context exists on a route only when one of its own charts builds it.
 *   · Chart routes reach one: the shared context, from their own flat charts.
 *   · Relief routes reach two: that shared one, plus a single relief of their own.
 *   · ONE route reaches three — `pages/CommandDeck.tsx`:
 *        1. the shared context, from the deck's own flat charts (`useFlatChart`), built when the
 *           first of them paints and therefore the OLDEST on the page — the one a browser drops
 *           first when a page runs past the cap
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

/**
 * The maximum number of simultaneously live WebGL contexts any single route can reach.
 * THREE until S5 of INSTRUMENT_100X_PLAN (2026-09-02): the shell's backdrop gave every route one context
 * and CommandDeck held two reliefs (E1 + E5) on top. The backdrop is removed and E1 retired, so a route
 * now holds at most ONE — its own relief, or the shared flat-chart context.
 */
/*
 * TWO since P1 of THE PRODUCTION (2026-09-02): `components/stage/Stage.tsx` is mounted once in the shell and holds
 * one context on every route — the lit studio the page stands on, drawing frames ON DEMAND (never a loop), the
 * eight rooms lit by the watch. It is the one shell-owned context, by design and asserted below; a route's own
 * relief or the shared flat-chart context is the second. Nothing may reach three.
 */
const CONCURRENT_CAP = 2;
/**
 * How many routes sit AT the cap. With a cap of one, every chart route ties, so a single "worst route"
 * name would be a coin toss over ROUTES order; the COUNT is the pin instead — an equality, so a new
 * surface (or a lost one) shows up as a diff. `pages/CommandDeck.tsx` must remain among them: it is the
 * route that was at three, and the one whose reduction S5 was measured on.
 */
const ROUTES_AT_CAP = 16; // six relief routes + nine flat-chart routes (each = the stage + one of its own), measured 2026-09-02;
                          // + pages/Launch.tsx since P6 (2026-09-04): the /lcxos hero is the Forge LIVE over its still — the stage + the Forge

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
/*
 * COMMENTS STRIPPED, AND THE FLOOR IS 1 — this census was satisfied by DOCUMENTATION.
 *
 * It used to test the raw source for `sharedRenderer(` and require at least four matching files. Four did
 * match. Exactly ONE of them contained a call: `charts/gl/useFlatChart.ts`. The other three matched header
 * PROSE — `FlatDial.tsx`, `FlatTrack.tsx` and `FlatBand.tsx` each explain the shared renderer in a comment.
 *
 * It surfaced when `FlatBand.tsx` was deleted (ControlBand failed the GL threshold, so its only consumer
 * went away) and the count fell 4 -> 3, failing a guard that had never been measuring what it claimed.
 *
 * The floor of 4 also asserted an architecture the code deliberately does not have: there is exactly ONE
 * shared-renderer call site by design, because `useFlatChart` owns it and every chart goes through that hook.
 * A guard that demands four would be satisfied by three more files duplicating the thing the design
 * centralises.
 *
 * The per-route budget below never rested on the prose, because `useFlatChart.ts` is in every chart route's
 * import closure — so only this one floor was wrong, and its 31 sibling assertions were unaffected.
 */
const withoutComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const SHARED_USERS = FILES.filter((f) => /sharedRenderer\s*\(/.test(withoutComments(SOURCE.get(f)!)));

const ROUTES = existsSync(ROUTER)
  ? [...new Set([
    ...[...readFileSync(ROUTER, 'utf8').matchAll(/import\(\s*['"](@\/pages\/[^'"]+)['"]/g)].map((m) => m[1]!),
    ...[...readFileSync(ROUTER, 'utf8').matchAll(/from\s*['"](@\/pages\/[^'"]+)['"]/g)].map((m) => m[1]!),
  ])]
    .map((spec) => resolveSpecifier(spec, ROUTER))
    .filter((f): f is string => f !== null)
    .sort()
  : [];

/**
 * The component names whose JSX brings each owner in — derived from the module that imports it
 * rather than hand-listed, so an owner added tomorrow is censused tomorrow.
 */
const MOUNT_NAMES = new Map<string, string[]>(OWNERS.map((owner) => {
  const names: string[] = [];
  for (const file of FILES) {
    if (file === owner) continue;
    /* A ROUTE PAGE IS THE BUDGET'S ROOT, NOT A WRAPPER. Its export is rendered once by the router, so counting it as a
       name that "brings the owner in" made `<Launch />` in router.tsx a second mount site for ForgeBackdrop the day
       Launch.tsx started importing it (P6, 2026-09-04) — a mount that does not exist. Wrappers live under components/. */
    if (ROUTES.includes(file)) continue;
    if (!specifiers(SOURCE.get(file)!).some((s) => resolveSpecifier(s, file) === owner)) continue;
    for (const m of SOURCE.get(file)!.matchAll(/export function ([A-Z]\w*)/g)) names.push(m[1]!);
  }
  return [owner, names];
}));

/** Every page module the router can navigate to, eager or lazy. */

interface RouteBudget {
  readonly route: string;
  readonly own: string[];
  readonly shared: boolean;
  readonly concurrent: number;
  /** Mount sites per owner, which can exceed 1 without the concurrent count doing so. */
  readonly sites: Map<string, number>;
}

/*
 * ── THE SHELL IS A ROOT OF EVERY ROUTE, AND LEAVING IT OUT UNDERCOUNTED ALL 78 ─────────────
 * This census used to walk from route modules alone. That was right only while every GL surface
 * was inside a page. From 2026-08-15 to S5 (2026-09-02) `AppLayout` mounted `SignatureBackdrop`
 * around the `<Outlet>`, so the shared context was on screen for every route including the 63 that
 * reached no GL of their own — and a per-route walk cannot see that, because nothing in a page
 * imports the shell that wraps it. The shell walk stays after the backdrop's removal for the same
 * reason in reverse: it is what PROVES the shell holds nothing.
 *
 * The failure that exposed it was silent in the right direction and therefore worth recording:
 * removing the now-dead `<SignatureBackdrop>` from CommandDeck dropped its count 3 -> 2 and the
 * pin failed. Nothing about the app got safer; the page still holds three. A census that reads a
 * REDUCTION out of a change that only moved a mount upward is measuring the wrong graph.
 *
 * Derived, not named: the shell is whatever `router.tsx` reaches through STATIC imports without
 * descending into a route module. Pages are the lazy half of the router, so stopping at them
 * leaves exactly the always-mounted half. If the shell grows a relief tomorrow, all 78 routes
 * count it tomorrow, with no edit here.
 */
const SHELL: ReadonlySet<string> = (() => {
  const seen = new Set<string>();
  const routeSet = new Set(ROUTES);
  const stack = existsSync(ROUTER) ? [ROUTER] : [];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    /* Route modules are recorded as reached and then NOT descended into: a page's own imports
       belong to that page's budget, not to the shell every other page also pays for. */
    if (routeSet.has(file)) continue;
    const src = SOURCE.get(file) ?? (file === ROUTER ? readFileSync(ROUTER, 'utf8') : undefined);
    if (src === undefined) continue;
    for (const m of src.matchAll(/from\s*['"]([^'"]+)['"]/g)) {
      const next = resolveSpecifier(m[1]!, file);
      if (next !== null && !seen.has(next)) stack.push(next);
    }
  }
  for (const r of routeSet) seen.delete(r);
  return seen;
})();

const BUDGETS: RouteBudget[] = ROUTES.map((route) => {
  const files = new Set([...reachable(route), ...SHELL]);
  const own = OWNERS.filter((o) => files.has(o));
  const shared = SHARED_USERS.some((s) => files.has(s));
  const sites = new Map<string, number>();
  for (const owner of own) {
    let n = 0;
    for (const name of MOUNT_NAMES.get(owner)!) {
      for (const file of files) {
        const src = SOURCE.get(file);
        if (src === undefined) continue;
        /*
         * COMMENTS STRIPPED HERE TOO, and for the same reason the SHARED_USERS census above needed it:
         * prose about a component counts as a mount of it.
         *
         * `OntologyOrreryGl.tsx` explains the ResizeObserver guard with the sentence "Measured both ways,
         * `<OntologyOrrery>` rendered with ...". That backticked tag matched `<Name[\s/>]`, so
         * OntologyExplorer read as TWO Orrery mount sites and the route looked like it held a context the
         * budget did not know about. A false positive here is worse than a false negative: it sends the
         * next reader to EXCLUSIVE_MOUNTS to justify a second mount that does not exist.
         */
        n += [...withoutComments(src).matchAll(new RegExp(`<${name}[\\s/>]`, 'g'))].length;
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
    /* Eight since S5 retired E1 `DeckReliefGl` (2026-09-02): six reliefs, ForgeBackdrop, renderMotion. */
    expect(OWNERS.length, 'no createStage call sites found in apps/web/src').toBeGreaterThanOrEqual(8);
    expect(SHARED_USERS.length, 'no sharedRenderer call sites found — the flat chart path vanished')
      .toBeGreaterThanOrEqual(1);
    /* And it must be the hook that owns it. A second caller would mean a chart bypassing useFlatChart,
       which is how the one-context guarantee gets quietly broken — the floor above cannot catch that, so
       this does. */
    expect(SHARED_USERS.map(id).some((p) => p.endsWith('useFlatChart.ts')),
      `the shared-renderer call must live in useFlatChart; found ${SHARED_USERS.map(id).join(', ')}`)
      .toBe(true);
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

  it('the shell closure is real and — since P1 — carries exactly ONE GL context of its own: the stage', () => {
    /*
     * The negative control for the SHELL walk. An empty or route-free closure would make this file
     * silently revert to the per-route census, and every assertion below would still pass — which
     * is how a guard stops measuring without ever going red.
     */
    expect(SHELL.size, 'the shell closure is empty — router.tsx resolved no static imports')
      .toBeGreaterThan(3);
    for (const r of ROUTES) {
      expect(SHELL.has(r), `${id(r)} is a route and must not be inside the shell closure`).toBe(false);
    }
    /*
     * THE REAL CHANGE THIS ASSERTION USED TO ASK FOR. Until S5 of INSTRUMENT_100X_PLAN (2026-09-02)
     * `AppLayout` mounted `SignatureBackdrop`, the shell's one caller of `sharedRenderer()`, so every
     * route held the shared context whether or not it drew a chart — 77 GL contexts at rest, measured
     * by the S0 instrument. That layer drew nothing in the default theme and an empty plate in dark
     * (docs/instrument/LEDGER.md §5), and it is gone. The shell must now reach NO sharedRenderer
     * caller: a context exists on a route only when one of its own charts builds it. If someone
     * mounts a GL surface in the shell again, this goes red and they say why here.
     */
    expect(SHARED_USERS.some((s) => SHELL.has(s)),
      'the shell reaches sharedRenderer() again — a GL surface was mounted in AppLayout. S5 removed'
      + ' the always-on backdrop for measured reasons; a new one must earn its place here, in words')
      .toBe(false);
    /* THE STAGE (THE PRODUCTION, P1) is the one owner the shell may carry, and it must be exactly that one. */
    const shellOwners = OWNERS.filter((o) => SHELL.has(o)).map(id);
    expect(shellOwners, 'the shell carries a GL owner other than the stage — a second always-on surface must earn its place here, in words')
      .toEqual(['components/stage/Stage.tsx']);
    /* And the census must therefore show routes at ZERO shared contexts — the reduction S5 was for. */
    const atZero = ROUTES.filter((r) => !SHARED_USERS.some((s) => reachable(r).has(s)));
    expect(atZero.length,
      'no route reaches zero GL contexts — something in the shell or in every page still builds one')
      .toBeGreaterThan(0);
  });

  it(`no route can hold more than ${CONCURRENT_CAP} live context, and exactly ${ROUTES_AT_CAP} routes are at the cap`, () => {
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
    const atCap = BUDGETS.filter((b) => b.concurrent === CONCURRENT_CAP).map((b) => b.route).sort();
    expect(atCap.length,
      `${atCap.length} routes are at the cap of ${CONCURRENT_CAP} (pinned ${ROUTES_AT_CAP}): ${atCap.join(', ')}.`
      + ' A surface was added or lost — say which, and move the pin.')
      .toBe(ROUTES_AT_CAP);
    expect(atCap, 'CommandDeck no longer reaches a GL context at all — E5 SurfaceRelief left the deck?')
      .toContain('pages/CommandDeck.tsx');
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
    /* Eight owner/route pairs since S5 retired E1 (2026-09-02). */
    expect(censused, 'no owner/route pairs were censused — the loop above proved nothing')
      .toBeGreaterThanOrEqual(8);

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
