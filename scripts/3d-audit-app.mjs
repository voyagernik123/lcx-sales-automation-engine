/*
 * THE APP SWEEP — the same four axes as `scripts/3d-audit.mjs`, run against apps/web instead of docs/3d.
 *
 * ── THE GAP THIS CLOSES ──────────────────────────────────────────────────────────────
 * `scripts/3d-audit.mjs` sweeps reduced motion, print, no-WebGL, a lost context and the quality ladder over
 * every `docs/3d/eN/live.html`. Every one of those checks runs against a STATIC HARNESS PAGE. None of it runs
 * against `apps/web`, which is where the eight relief surfaces actually ship — so the programme's audit has
 * always been an audit of the laboratory.
 *
 * That gap has already cost two concrete things:
 *
 *   · Nothing in `apps/web` had ever exercised the refusal path. All seven relief component tests stop at the
 *     Suspense fallback, so no renderer effect had ever run in a test — jsdom has no WebGL.
 *   · `components/__tests__/reliefPrintPath.test.tsx:37-48` names two print questions no test in the repo can
 *     answer, both for the same reason: jsdom does not evaluate `@media print` and rasterises nothing.
 *
 * A real browser can answer both. This file is that browser.
 *
 * ── WHY A SEPARATE DRIVER RATHER THAN AN EXTENSION OF `3d-audit.mjs` ─────────────────
 * Three reasons, in order of weight:
 *
 *   1. THE TWO SWEEPS DRIVE A PAGE DIFFERENTLY, AND NOT BY A LITTLE. A harness is one static file with a
 *      control surface built into its query string: `?refuse=1` takes the real refusal branch, `?tier=minimum`
 *      picks a rung, `?frames=6` sets the timing loop, and `document.title === 'READY'` is the readiness
 *      signal. The app has NONE of that. Reaching a relief surface means seeding a persisted operator session,
 *      replacing the network for the route's own endpoints, finding a button by its accessible name, checking
 *      it is not `aria-disabled`, clicking it, and then waiting on `canvas.dataset.qualityTier` — which two of
 *      the eight surfaces never set (see the TIER STAMP column). Sharing one loop between those two shapes
 *      means a parameter matrix in place of a sweep.
 *   2. THEIR PREREQUISITES ARE DIFFERENT AND SO ARE THEIR FAILURES. The harness sweep needs each `build.mjs`
 *      to have run; this needs a Vite dev server. Folded together, a stale harness bundle would take the app
 *      report down with it and leave BOTH files on disk describing a run that did not happen.
 *   3. TWO GENERATORS MUST NOT WRITE ONE FILE. `docs/3d/e9/README.md` is generated, and its whole argument is
 *      that it cannot go stale because it is rewritten from a live sweep. A second writer makes its contents
 *      depend on which script ran last — which is the failure it exists to prevent. So this writes its own
 *      output file, and `3d-audit.mjs` now states in its generated README that the app is out of its scope and
 *      names this file.
 *
 * ── WHAT IS AUDITED HERE, AND WHY THESE FOUR ────────────────────────────────────────
 * Only axes that a real browser can settle and the component tests structurally cannot:
 *
 *   · PRINT. jsdom applies no `@media print`. This emulates print media on a page whose relief is ON — the one
 *     configuration `reliefPrintPath.test.tsx` says is unverified anywhere — and also renders the PDF, so
 *     "does a drawn canvas reach paper" stops being an argument about `preserveDrawingBuffer`.
 *   · REDUCED MOTION. The components are documented as rendering one frame and stopping. The harness sweep
 *     wraps `requestAnimationFrame` on the live page to check the same claim, and reports the result as
 *     VACUOUS because no harness animates. One app surface DOES animate — `ForgeBackdrop` runs a five-second
 *     arc on the sign-in route — so here the check is not vacuous, and the no-preference control run below is
 *     what proves the counter works before any zero from it is believed.
 *   · CONTEXT LOSS. The app's recovery path is different code from the harness's: each `*ReliefGl` registers
 *     `webglcontextlost` on its own canvas and calls the wrapper's `onRefused`, which sets `wantRelief` back
 *     to false. That branch has never run in any test.
 *   · THE GL CONTEXT COUNT. `components/__tests__/glContextBudget.test.ts` pins the worst route at 3 by
 *     walking the import graph. A count of real contexts in a real browser is strictly stronger, and it is
 *     the one number in this programme where the static and dynamic answers can be compared.
 *
 * ── WHAT THIS SWEEP DELIBERATELY DOES NOT CLAIM ─────────────────────────────────────
 *   · It is not a perf sweep. Every frame here is SwiftShader, for the reason `docs/3d/e9/README.md` gives at
 *     length: the ratio between a CPU rasteriser and real hardware is not a constant, so a frame time from
 *     here describes a machine nobody ships on. No timing column exists in the output on purpose.
 *   · It is not a data test. Where a route needs seeded data, the network is replaced with the smallest
 *     fixture that makes the surface DRAWABLE, and nothing below asserts a number that came out of it. A
 *     check on its own fixture teaches nothing.
 *   · A surface it could not reach is reported as NOT REACHED on every axis, never as a pass. The whole point
 *     of the gap this file closes is that never-ran is not the same as ran-and-found-nothing.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'apps/web');
const OUT = join(ROOT, 'docs/3d/APP_SWEEP.md');
/* Captures live beside the report, and only for the one question bytes could not settle — see the E8 branch of
   the context-loss axis, where a DOM-only reading produced a finding the pixels then withdrew. */
const SHOTS = join(ROOT, 'docs/3d/app-sweep');
const PORT = Number(process.env.APP_AUDIT_PORT ?? 5188);
const BASE = `http://127.0.0.1:${PORT}`;

/*
 * THE SEAT, COPIED IN PRINCIPLE FROM `apps/web/e2e/seat.ts` AND NOT IMPORTED FROM IT.
 *
 * That file is a Playwright-test module in another workspace and lives behind `@playwright/test`'s fixture
 * machinery; importing it from a plain script drags the runner in. What is copied is only the SHAPE of the
 * persisted session, and the two constraints its header records the hard way are both load-bearing here:
 *
 *   · `lcx_operator_email` must be written FIRST, because it scopes every other key (`lib/persistence.ts`).
 *     Written second, the operator record lands under the `anon` scope and the guard redirects to /select.
 *   · `version: 3` exactly. `useOperatorStore`'s `migrate()` unconditionally returns `{ operator: null }`, so
 *     any other version wipes the seat and every route below lands on the sign-in gate with no clue why.
 *
 * `addInitScript`, not an `evaluate` after `goto`: the store reads localStorage during module init, so a write
 * after navigation arrives after the guard has already decided.
 */
const SEAT = {
  email: 'nik@lcx.com',
  operator: {
    id: 'nik', name: 'Nik', email: 'nik@lcx.com', role: 'approver',
    initials: 'N', colorVar: 'var(--chart-1)',
  },
};

const iso = (msAgo) => new Date(Date.parse('2026-08-12T00:00:00.000Z') - msAgo).toISOString();
const envelope = (data, meta) => ({
  status: 200,
  contentType: 'application/json',
  /* The dev server is same-origin for these paths (see `forcedApiBase` below), so this header is belt and
     braces rather than load-bearing — but it costs nothing and a future absolute API base would need it. */
  headers: { 'access-control-allow-origin': '*' },
  body: JSON.stringify({ data, meta: meta ?? { timestamp: new Date(0).toISOString() } }),
});

/* ── FIXTURES ─────────────────────────────────────────────────────────────────────────
 * Each one is the SMALLEST payload that makes its surface drawable, and nothing in the report is read off
 * any of them. Shapes mirror `apps/web/src/lib/api/*.ts`; a drifted shape shows up as NOT REACHED with the
 * page's own refusal text beside it, which is the failure mode to want.
 */
const lead = (i) => ({
  id: `audit-lead-${i}`, name: `PROBE CHAIN ${String(i).padStart(2, '0')}`, ticker: `PC${i}`, website: null,
  source: 'audit', chain: 'ethereum', jurisdiction: 'US', category: 'defi', listedOnLcx: false,
  euScore: 40 + i, usPreScore: 35 + i, usPostScore: 45 + i, band: 'watch',
  marketCapUsd: 250_000 + i * 40_000, peopleCount: 2, verifiedContactCount: 1, tier: 'tracked',
  createdAt: iso(90 * 86_400_000), updatedAt: iso(i * 86_400_000), hasContact: true, marketTag: null,
});
const mapPoint = (i) => ({
  id: `audit-map-${i}`, name: `MAP PROJECT ${i}`, ticker: `MP${i}`, marketCapUsd: 1e6 + i * 1e5,
  volume24hUsd: 5e4 + i * 1e3, priceChange30d: 0.1, category: 'defi', region: i % 2 ? 'us' : 'eu',
  listedOnLcx: false, exchangeCount: i % 4, band: 'watch', priorityScore: 1 + i, propensityScore: 1 + i,
  euScore: 50, usPreScore: 40, usPostScore: 45, recommendedMarket: 'eu',
});
const auditRow = (i) => ({
  id: `audit-row-${i}`, actor: 'n.sharma', action: i % 3 === 0 ? 'lead_score' : 'campaign_publish',
  entity: 'projects', entityId: `0191abcd-ef01-2345-6789-abcdef0123${String(i).padStart(2, '0')}`,
  meta: {}, projectName: `Aster ${i}`, createdAt: iso(i * 3_600_000),
});

const COMMAND_OVERVIEW = {
  generatedAt: new Date(0).toISOString(),
  /* `partners` MUST be non-zero: `CommandDeck.tsx:117` renders an EmptyState instead of the deck when it is
     0, and the deck is what carries E1 and E5. */
  counts: { products: 4, partners: 9, workstreams: 5, tasks: 41, decisions: 7, risks: 9 },
  workstreams: [
    { id: 'w1', name: 'Liquidity', owner: 'Nik', total: 10, done: 4, open: 5, blocked: 1 },
    { id: 'w2', name: 'Payment rails', owner: null, total: 8, done: 2, open: 6, blocked: 0 },
  ],
  partnersByType: [
    { type: 'Market maker', total: 4, recommended: 2, inProgress: 1 },
    { type: 'Payment rail', total: 5, recommended: 1, inProgress: 2 },
  ],
  riskHeat: [
    { impact: 'Critical', likelihood: 'High', count: 2 },
    { impact: 'High', likelihood: 'Medium', count: 3 },
  ],
  topRisks: [
    { id: 'r1', title: 'Anchor date unconfirmed', category: 'Programme', likelihood: 'High', impact: 'Critical', mitigation: 'Confirm with the board' },
    { id: 'r2', title: 'Rail provider terms open', category: 'Commercial', likelihood: 'Medium', impact: 'High', mitigation: 'Issue the RFI' },
  ],
  launch: {
    anchor: 'Unconfirmed', anchorConfirmed: false,
    targets: [{ id: 't1', name: 'US launch', targetDate: null, confirmed: false, note: null }],
    gating: [
      { id: 'g1', title: 'Licence', status: 'in_progress', done: false },
      { id: 'g2', title: 'Rails', status: 'open', done: true },
      { id: 'g3', title: 'Listing policy', status: 'open', done: true },
    ],
    gatingDone: 2, gatingTotal: 3,
  },
  decisions: { open: 3, total: 7, byPhase: { P1: 3, P2: 4 } },
  gaps: { partnersMissingContact: 2, partnersMissingTerms: 3, planningAssumptions: 4, unconfirmedTargets: 1, notes: ['audit fixture'] },
};

const LP_DIMS = [
  { key: 'depth', label: 'Book depth', weight: 0.3 },
  { key: 'spread', label: 'Spread discipline', weight: 0.25 },
  { key: 'venues', label: 'Venue coverage', weight: 0.25 },
  { key: 'terms', label: 'Commercial terms', weight: 0.2 },
];
const LP_RESCORE = {
  dimensions: LP_DIMS,
  rows: ['ALPHA MM', 'BOREAL', 'CASTOR', 'DELTA FLOW', 'ECHO CAP'].map((subjectLabel, i) => ({
    subjectId: `lp-${i}`, subjectLabel, tier: 'A', weighted: 3.4 - i * 0.2, rank: i + 1,
    /* Varied on BOTH axes on purpose: a surface that is flat in one direction is the degenerate case
       `buildScorecardSurface` refuses, and a refusal here would read as an unreachable surface. */
    scores: {
      depth: 1 + ((i * 0.9) % 4), spread: 4.4 - i * 0.7,
      venues: 2 + ((i * 1.3) % 3), terms: 1.2 + i * 0.6,
    },
  })),
  sensitivity: LP_DIMS.map((d) => ({
    dimKey: d.key, dimLabel: d.label, currentWeight: d.weight, flipWeight: null, gapPerHundredth: 0.01,
  })),
  setAnalysis: {
    strengths: [{ dimKey: 'spread', dimLabel: 'Spread discipline', best: 4.4, coveredBy: 'ALPHA MM' }],
    gaps: [{ dimKey: 'terms', dimLabel: 'Commercial terms', best: 3.6 }],
    concentration: 0.42,
  },
};

const COMMAND_STUBS = [
  ['**/v1/command/overview*', () => envelope(COMMAND_OVERVIEW)],
  ['**/v1/command/partners*', () => envelope([{ id: 'pa1', name: 'ALPHA MM', type: 'Market maker', subtype: null, pipeline_stage: 'rfi', capability_score: 4, tier: 'A', primary_contact: null, terms: null, notes: null, source: 'audit' }])],
  ['**/v1/command/tasks*', () => envelope([{ id: 'tk1', workstream: 'Liquidity', title: 'Sign the market maker', owner: 'Nik', target_date: null, status: 'open', depends_on: [], notes: null, source: 'audit' }])],
  ['**/v1/command/decisions*', () => envelope([{ id: 'd1', phase: 'P1', decision: 'Rail choice', recommendation: null, status: 'open', chosen: null }])],
  ['**/v1/command/risks*', () => envelope([{ id: 'r1', category: 'Programme', title: 'Anchor unconfirmed', likelihood: 'High', impact: 'Critical', mitigation: 'Confirm', phase: 'P1' }])],
  ['**/v1/command/financials*', () => envelope([{ id: 'f1', area: 'Rails', item: 'Setup', value: '50000', unit: 'USD', assumption: true, source: 'audit' }])],
  ['**/v1/command/engines/lp-rescore*', () => envelope(LP_RESCORE)],
];

/* ── THE SURFACES ────────────────────────────────────────────────────────────────────
 * Eight relief surfaces ship in `apps/web`. All eight are listed, INCLUDING the ones this sweep cannot
 * reach — a list that quietly omits what it failed on is how a sweep reports green by covering nothing.
 *
 * `nudge` is the one field that needs explaining, and it exists because of a defect this sweep found rather
 * than because of anything about 3-D: see the E6 row.
 */
const SURFACES = [
  {
    id: 'E8', name: 'ForgeBackdrop', file: 'src/components/brand/ForgeBackdrop.tsx',
    /* E8 has no separate renderer module: the wrapper IS the renderer. */
    glFile: 'src/components/brand/ForgeBackdrop.tsx',
    route: '/select', page: 'src/pages/SelectOperator.tsx',
    /* The ONE surface that needs no seat: the sign-in screen is outside `AppLayout`, so it is what an
       unauthenticated stranger sees. It is also the only one that is not opt-in — no toggle, it mounts and
       runs — and the only one that animates. */
    seat: false, toggle: null, stubs: [], printSheet: false,
    animatesByDesign: true,
    note: 'the sign-in route; no seat, no fixture, no toggle — it mounts and runs',
  },
  {
    id: 'E4', name: 'OntologyOrrery', file: 'src/components/geometry/OntologyOrrery.tsx',
    glFile: 'src/components/geometry/OntologyOrreryGl.tsx',
    route: '/ontology', page: 'src/pages/OntologyExplorer.tsx',
    /* Its data is static (`OntologyExplorer.tsx:12` imports the graph from `@/data`), so this is the only
       opt-in surface reachable with the network entirely dead. */
    seat: true, toggle: /orrery view/i, stubs: [], printSheet: false,
    note: 'static ontology data — reachable with the network dead',
  },
  {
    id: 'E3', name: 'PipelineRelief', file: 'src/components/geometry/PipelineRelief.tsx',
    glFile: 'src/components/geometry/PipelineReliefGl.tsx',
    route: '/bd-pipeline', page: 'src/pages/BdPipeline.tsx',
    seat: true, toggle: /channel view/i, printSheet: false,
    stubs: [['**/v1/projects?*', () => envelope(
      Array.from({ length: 14 }, (_, i) => lead(i)),
      { total: 14, limit: 50, offset: 0, timestamp: new Date(0).toISOString() },
    )]],
    note: 'one stubbed lead page, the same shape e2e/populated.spec.ts uses',
  },
  {
    id: 'E2', name: 'GlobeRelief', file: 'src/components/market/GlobeRelief.tsx',
    glFile: 'src/components/market/GlobeReliefGl.tsx',
    route: '/market-map', page: 'src/pages/MarketMap.tsx',
    seat: true, toggle: /globe view/i, printSheet: false,
    stubs: [['**/v1/analytics/map*', () => envelope(Array.from({ length: 24 }, (_, i) => mapPoint(i)))]],
    note: 'one stubbed map page',
  },
  {
    id: 'E6', name: 'VaultRelief', file: 'src/components/geometry/VaultRelief.tsx',
    glFile: 'src/components/geometry/VaultReliefGl.tsx',
    route: '/audit-log', page: 'src/pages/AuditLog.tsx',
    seat: true, toggle: /vault view/i, printSheet: false,
    stubs: [['**/v1/audit*', () => envelope(
      Array.from({ length: 18 }, (_, i) => auditRow(i)),
      { total: 18, page: 1, limit: 50, totalPages: 1 },
    )]],
    /*
     * THE NUDGE, AND WHY THIS SURFACE NEEDS ONE. `/audit-log` renders "0 events · No audit events found" on
     * first mount even with a healthy endpoint, so `entries.length > 0` is false and `AuditLog.tsx:237` never
     * mounts `VaultRelief` at all — there is no toggle to click.
     *
     * MEASURED CAUSE, not a guess: the page's only `/v1/audit` fetch is dispatched with a signal that is
     * ALREADY `aborted === true` and rejects with `AbortError: signal is aborted without reason`. See the
     * FINDINGS section of the generated report; it is a defect in the read layer, not in this page, and it is
     * NOT this file's to fix.
     *
     * Changing the entity filter issues a DIFFERENT canonical URL with a fresh controller and one subscriber,
     * which lands. So the sweep changes the filter and says so, rather than reporting E6 unreachable — an
     * unreachable verdict caused by the sweep's own choice of route state would be a false negative.
     */
    nudge: async (page) => { await page.selectOption('select', 'projects'); },
    note: 'stubbed audit page PLUS a filter change, because the page\'s first audit read is dispatched dead — '
      + 'see the dead-read column',
  },
  {
    id: 'E1', name: 'DeckRelief', file: 'src/components/geometry/DeckRelief.tsx',
    glFile: 'src/components/geometry/DeckReliefGl.tsx',
    route: '/command-deck', page: 'src/pages/CommandDeck.tsx',
    seat: true, toggle: /theatre view/i, stubs: COMMAND_STUBS, printSheet: true,
    note: 'six stubbed command endpoints; the page mounts the house print sheet',
  },
  {
    id: 'E5', name: 'SurfaceRelief', file: 'src/components/geometry/SurfaceRelief.tsx',
    glFile: 'src/components/geometry/SurfaceReliefGl.tsx',
    route: '/command-deck', page: 'src/pages/CommandDeck.tsx',
    /* It reaches the deck inside `CockpitPanels`' LpOptimizerPanel, which fetches the ranking itself — so the
       six command endpoints are not enough and the POST engine has to answer too. */
    seat: true, toggle: /relief view/i, stubs: COMMAND_STUBS, printSheet: true,
    note: 'the same deck, plus POST /v1/command/engines/lp-rescore for the ranking it draws',
  },
  {
    id: 'E7', name: 'StormRelief', file: 'src/components/risk/StormRelief.tsx',
    glFile: 'src/components/risk/StormReliefGl.tsx',
    route: '/marketing/crisis', page: 'src/pages/MarketingCrisis.tsx',
    seat: true, toggle: /storm view/i, stubs: [], printSheet: true,
    /*
     * UNREACHABLE BY DESIGN, AND THE ONLY ONE OF THE EIGHT WHERE THAT IS THE CORRECT STATE.
     * `MarketingCrisis.tsx:89` builds the field with `riskFieldUnavailable(...)`, a NAMED ABSENCE: no forward
     * risk feed is produced anywhere in the system. `StormRelief.tsx:101` therefore has `drawable === false`
     * and the toggle is permanently `aria-disabled`. Confirmed by this sweep rather than read off the source.
     *
     * It is listed and attempted anyway. The day a feed lands, this row starts reaching a canvas on a page
     * that mounts `PrintStyles` — and that is exactly when someone needs the print axis to already exist.
     */
    expectUnreachable: 'TOGGLE_DISABLED',
    note: 'refuses by design: no forward risk feed exists, so the field is a named absence',
  },
];

/* ── THE PROBE, installed before any app script runs ────────────────────────────────
 * Two instruments, one init script:
 *
 *   · A GL CONTEXT CENSUS. `HTMLCanvasElement.prototype.getContext` is wrapped, so every context the route
 *     creates is recorded with the canvas that owns it. Note precisely what this can and cannot say:
 *     `stage.dispose()` does NOT call `WEBGL_lose_context.loseContext()` (`packages/gl/src/stage.ts:322-330`,
 *     and 3D_VFX_FINAL_PLAN §10.4 names it), so a context released by React is still not `isContextLost()`.
 *     The census therefore reports CREATED and NOT-LOST, which is the honest pair. This sweep toggles each
 *     surface on once and never off, so on these runs they coincide.
 *   · A rAF COUNTER that can be reset from the outside, so the reduced-motion window starts when the surface
 *     is up rather than when the page loaded. Wrapping it on the live page rather than grepping the source is
 *     the same argument `3d-audit.mjs:127-128` makes: a scheduler installed by a bundled dependency would
 *     not appear in a grep of the component.
 */
const PROBE = () => {
  const w = /** @type {any} */ (globalThis);
  w.__lcxAudit = { contexts: [], raf: 0 };
  /*
   * HMR IS SWITCHED OFF FROM INSIDE THE PAGE, and this is not tidiness — it is the difference between a
   * measurement and a false pass.
   *
   * Vite's client reloads the document on `full-reload`, and a dev server serving a repo somebody is editing
   * sends those constantly: this sweep's first clean run was corrupted by six of them, triggered by edits to
   * files it does not touch (`reliefPrintPath.test.tsx`, `TrendDelta.tsx`). A reload re-runs this init script,
   * so the context census and the draw counters are REBUILT mid-pass. Everything then reads zero — and zero is
   * the passing value on the reduced-motion axis, and "the toggle is off again" is the passing value on the
   * print axis. One observed consequence: `/command-deck` reported no print findings on a pass where the
   * previous run had found two, because the reload had reset the toggle before the print media was applied.
   *
   * The HMR socket is refused rather than the app being changed: nothing in `apps/web` is touched, and the
   * page still runs exactly the code the dev server served. `close` is never signalled, so Vite's reconnect
   * path — which ends in its own `location.reload()` — is never entered either.
   */
  const RealWebSocket = w.WebSocket;
  w.WebSocket = function (url, protocols) {
    const wants = Array.isArray(protocols) ? protocols.includes('vite-hmr') : protocols === 'vite-hmr';
    if (!wants) return new RealWebSocket(url, protocols);
    return {
      readyState: 3, url: String(url), protocol: 'vite-hmr',
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
      send() {}, close() {},
      onopen: null, onmessage: null, onclose: null, onerror: null,
    };
  };
  w.WebSocket.prototype = RealWebSocket.prototype;
  for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) w.WebSocket[k] = RealWebSocket[k];
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
    const out = getContext.call(this, kind, ...rest);
    if (out && /webgl/i.test(String(kind))) {
      /*
       * DEDUPED BY CONTEXT IDENTITY, AND THE FIRST VERSION WAS NOT.
       *
       * `getContext('webgl2')` returns the SAME object every time it is called on a given canvas
       * (`packages/gl/src/stage.ts:336` says so, and it is why `dispose` gates on the canvas being detached).
       * Every relief in this repo rebuilds IN PLACE when its size step or its tier changes, so one component
       * on one canvas produces several calls and ONE context. Counting calls made `/bd-pipeline` report two
       * contexts for a single toggle and one canvas — a number that flatly contradicted the canvas count in
       * the same table, and would have been read as a context leak.
       *
       * The call count is kept, because a rebuild in place is a real event worth seeing; it is just not a
       * second context.
       */
      w.__lcxAudit.getContextCalls = (w.__lcxAudit.getContextCalls ?? 0) + 1;
      const already = w.__lcxAudit.contexts.find((c) => c.gl === out);
      if (already) return out;
      const rec = { gl: out, canvas: this, draws: 0 };
      /*
       * DRAW CALLS PER CONTEXT, and this is the axis's whole attribution.
       *
       * The first version of this sweep counted `requestAnimationFrame` page-wide, the way `3d-audit.mjs`
       * does. That works on a harness, which is one file with nothing else in it. In the app it measured the
       * SHELL: it reported 36 frames scheduled after the surface was drawn on `/ontology`, where ReactFlow
       * runs its own loop, and 9-36 frames on routes with nothing to do with the relief at all — while the
       * same surface on the same route returned 10 and then 36 on two consecutive passes. A number that moves
       * like that is measuring the page, and reporting it as "this surface animates" is asserting a code path
       * without checking which one ran.
       *
       * A draw call on THIS context cannot belong to anything else. Wrapped on the instance so the count is
       * per context rather than per class, which is what makes the shared 2-D context separable from a
       * relief's own on a route that has both.
       */
      for (const m of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        const orig = out[m];
        if (typeof orig !== 'function') continue;
        out[m] = function (...a) { rec.draws += 1; return orig.apply(this, a); };
      }
      w.__lcxAudit.contexts.push(rec);
    }
    return out;
  };
  const raf = w.requestAnimationFrame.bind(w);
  w.requestAnimationFrame = (cb) => { w.__lcxAudit.raf += 1; return raf(cb); };
  /*
   * WHETHER A READ WAS DISPATCHED DEAD. Added because it is what stopped E6 from being reachable, and the
   * cause is not in the page: `/audit-log` renders "0 events" on first mount with a healthy endpoint, and the
   * single `/v1/audit` fetch goes out with `signal.aborted` ALREADY true.
   *
   * Recorded at the `fetch` boundary — not at Playwright's request router, which never sees these at all,
   * because a fetch with a pre-aborted signal is rejected by the browser before a request exists. That is
   * precisely why the failure is invisible: there is nothing in the network panel to look at.
   */
  w.__lcxAudit.deadReads = [];
  const realFetch = w.fetch;
  w.fetch = function (input, init) {
    const u = String(input && input.url ? input.url : input);
    const signal = (init && init.signal) || (input && input.signal);
    if (/\/v1\//.test(u) && signal && signal.aborted) w.__lcxAudit.deadReads.push(u.slice(-70));
    return realFetch.call(this, input, init);
  };
};

/**
 * The context census, with enough per-context detail that the total is interpretable.
 *
 * A bare count is not: on `/command-deck` three contexts exist and they are not three reliefs — one is the
 * shared 2-D renderer every chart draws through, whose canvas is offscreen and never in the document. Without
 * `inDocument` and the size, the number cannot be compared with the static pin in `glContextBudget.test.ts`,
 * which counts owners and the shared renderer separately.
 */
const readAudit = () => {
  const a = /** @type {any} */ (globalThis).__lcxAudit;
  const contexts = a.contexts.map((c) => {
    const box = c.canvas.getBoundingClientRect();
    return {
      lost: c.gl.isContextLost(),
      inDocument: document.contains(c.canvas),
      w: Math.round(box.width), h: Math.round(box.height),
      tier: c.canvas.dataset.qualityTier ?? null,
      draws: c.draws,
    };
  });
  return {
    created: contexts.length,
    notLost: contexts.filter((c) => !c.lost).length,
    inDocument: contexts.filter((c) => c.inDocument && !c.lost).length,
    offscreen: contexts.filter((c) => !c.inDocument && !c.lost).length,
    raf: a.raf,
    getContextCalls: a.getContextCalls ?? 0,
    deadReads: [...new Set(a.deadReads)],
    contexts,
  };
};

/** Every relief canvas on the page, with the two facts each axis is decided on. */
const readCanvases = () => Array.from(document.querySelectorAll('canvas')).map((c) => {
  const box = c.getBoundingClientRect();
  return {
    tier: c.dataset.qualityTier ?? null,
    w: Math.round(box.width), h: Math.round(box.height),
    /* GEOMETRY, NOT `display`, for the reason `3d-audit.mjs:69-81` records: the flat fallback in the harness
       is CLIPPED to 1x1 on success rather than `display:none`, so a `display` test reports the wrong verdict
       about a fix. The same rule is applied to canvases here for consistency of meaning. */
    shown: getComputedStyle(c).display !== 'none' && box.height > 4 && box.width > 4,
    display: getComputedStyle(c).display,
  };
});

/* ── THE DEV SERVER ─────────────────────────────────────────────────────────────────
 * Spawned rather than reused, on a port of this sweep's own, for one reason that matters:
 *
 * `apps/web/.env.local` sets `VITE_API_URL=http://localhost:8791`, which makes every API call CROSS-ORIGIN.
 * A cross-origin fulfilment needs the browser's preflight to be intercepted too, and a preflight that escapes
 * the router reaches a port with nothing on it — so a fixture silently does not apply and the surface reports
 * as unreachable for a reason that has nothing to do with the surface. Forcing `VITE_API_URL=''` puts the
 * calls back on the dev origin, where one route pattern covers them.
 *
 * That changes WHERE requests are addressed and nothing about what the components render, and it is recorded
 * in the generated report rather than left as a detail of this file.
 */
function startDevServer() {
  const bin = join(ROOT, 'node_modules/.bin/vite');
  if (!existsSync(bin)) {
    console.error(`  REFUSED: no vite binary at ${bin}. Run npm install first.`);
    process.exit(1);
  }
  const child = spawn(bin, ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: WEB,
    env: { ...process.env, VITE_API_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = [];
  child.stdout.on('data', (d) => log.push(String(d)));
  child.stderr.on('data', (d) => log.push(String(d)));
  return { child, log };
}

async function waitForServer(log) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error(`  REFUSED: the dev server never answered on ${BASE}.`);
  console.error(`  If ${PORT} is already taken, --strictPort makes vite exit rather than move — set`);
  console.error('  APP_AUDIT_PORT to a free port. A sweep that cannot load the app has measured nothing.');
  console.error(log.join('').split('\n').slice(-12).join('\n'));
  process.exit(1);
}

/* ── ONE SURFACE, ONE PAGE, ONE AXIS AT A TIME ──────────────────────────────────────── */

async function newSeatedPage(browser, surface, extraStubs = []) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => { page.__errs = [...(page.__errs ?? []), e.message]; });
  /*
   * NAVIGATIONS ARE COUNTED, AND THAT IS A CORRECTNESS GUARD RATHER THAN DIAGNOSTICS.
   *
   * `/select` performs a real document navigation a couple of seconds after load — `forceFrontDoor`
   * (`apiClient.ts:302`) races a bounded 2 s credential clear and then re-enters the front door. A reload
   * re-runs `addInitScript`, so `__lcxAudit` is REBUILT: any measurement window straddling it returns 0 draws
   * and 0 frames. Zero is the passing value on the reduced-motion axis, so an unnoticed reload turns a
   * measurement into a green result from a page that was not there. It also cost this sweep an outright crash
   * ("Execution context was destroyed") before it was handled, which is the friendlier of the two failures.
   */
  page.__navs = 0;
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) page.__navs += 1; });
  if (surface.seat) await page.addInitScript((s) => {
    localStorage.setItem('lcx_operator_email', s.email);
    localStorage.setItem('lcx_desk_passcode', 'audit-no-api');
    localStorage.setItem(`lcx-os:${s.email}:operator:v1`, JSON.stringify({ state: { operator: s.operator }, version: 3 }));
  }, SEAT);
  await page.addInitScript(PROBE);
  /*
   * THE FLOOR IS "NO API", ENFORCED RATHER THAN ASSUMED — `e2e/seat.ts` records what it cost to learn this:
   * with a live API on the dev proxy, the seeded passcode 401s, `apiClient` calls `forceFrontDoor()`, the seat
   * is torn out and every assertion fails on the sign-in gate with no hint that the cause is a process on
   * another port. Three agents each suspected their own change. Aborting first makes the premise a property of
   * this sweep instead of a property of the machine.
   *
   * Registered FIRST on purpose: Playwright gives later handlers priority, so each surface's own fixtures
   * below still win. This is the floor, not a ceiling.
   */
  await page.route('**/v1/**', (r) => r.abort('connectionrefused'));
  for (const [glob, body] of [...surface.stubs, ...extraStubs]) {
    await page.route(glob, (r) => r.fulfill(body()));
  }
  return page;
}

/**
 * Navigate, opt in, and wait for a frame — or say which step failed.
 *
 * The four outcomes are deliberately distinguished, because they are four different facts about the app and
 * collapsing them into "unreachable" is what makes a sweep useless: the toggle can be ABSENT (the page never
 * mounted the surface, usually because its data did not arrive), DISABLED (the surface refused before any
 * renderer ran, which for E7 is the correct state), REFUSED (the renderer ran and declined), or DRAWN.
 */
async function reach(page, surface) {
  await page.goto(BASE + surface.route, { waitUntil: 'domcontentloaded' });
  /* The status-bar disclaimer is what `e2e/seat.ts` anchors on to know the shell has mounted: it is rendered
     on every route and cannot pass early the way a sleep can. /select is outside the shell, so it waits on
     its own heading instead. */
  const anchor = surface.seat
    ? page.getByText(/NOT LEGAL ADVICE/i).first()
    : page.getByText(/Sign in to the desk/i).first();
  try { await anchor.waitFor({ state: 'visible', timeout: 30_000 }); }
  catch { return { state: 'SHELL_NEVER_MOUNTED' }; }

  if (surface.nudge) {
    await page.waitForTimeout(2500);
    try { await surface.nudge(page); } catch (e) { return { state: 'NUDGE_FAILED', detail: String(e).slice(0, 90) }; }
  }

  if (surface.toggle === null) {
    /* E8 only: nothing to press, so readiness is the canvas appearing at all. Its "before" state is the page
       with no renderer on it at all, which is what `preClick: 0` and the flat census taken now describe. */
    const flatBefore = await guarded(page, () => page.evaluate(readFlat));
    const ok = await waitForDrawn(page, 45_000);
    return { state: ok ? 'DRAWN' : 'NEVER_DREW', preClick: 0, flatBefore };
  }

  const btn = page.getByRole('button', { name: surface.toggle });
  try { await btn.first().waitFor({ state: 'attached', timeout: 25_000 }); }
  catch { return { state: 'TOGGLE_ABSENT', detail: await pageHeadline(page) }; }

  if (await btn.first().getAttribute('aria-disabled') === 'true') {
    return { state: 'TOGGLE_DISABLED', detail: (await reasonBeside(page)) ?? null };
  }

  /*
   * BOTH BASELINES ARE TAKEN HERE, BEFORE THE CLICK, and each is what makes one axis attributable:
   *
   *   · `preClick` is how many GL contexts the route had already built on its own. The contexts created from
   *     this index on are the ones the toggle is responsible for — which is what the context-loss axis has to
   *     target. Losing the first context it finds instead cost this sweep a false finding: on
   *     `/command-deck` that is the SHARED 2-D context behind the deck, whose loss the relief's listener is
   *     correctly not registered for, and the sweep reported "a lost context was never named to the reader"
   *     about a component whose branch had never been reached.
   *   · `flatBefore` is the flat figure the reader has with the relief OFF. Every wrapper swaps rather than
   *     layers, so the print question is whether opening the relief REMOVES readable data from the document —
   *     a drop, not an absence. Measured as an absence it fired on the sign-in screen, which has no flat data
   *     figure to lose and never claimed one.
   */
  const preClick = await guarded(page, () => page.evaluate(() => globalThis.__lcxAudit.contexts.length));
  const flatBefore = await guarded(page, () => page.evaluate(readFlat));

  await btn.first().scrollIntoViewIfNeeded();
  await btn.first().click();
  /* PRESSED IS CHECKED SEPARATELY FROM DRAWN. A click that did not flip `aria-pressed` and a renderer that
     refused are different failures, and during development of this sweep the first one happened — reported as
     "no canvas" it would have been blamed on the renderer. */
  try {
    await page.waitForFunction(
      (sel) => Array.from(document.querySelectorAll('button'))
        .some((b) => sel.test(b.textContent ?? '') && b.getAttribute('aria-pressed') === 'true'),
      new RegExp(surface.toggle.source, surface.toggle.flags),
      { timeout: 10_000 },
    );
  } catch { return { state: 'TOGGLE_DID_NOT_ENGAGE', preClick, flatBefore }; }

  if (await waitForDrawn(page, 60_000)) return { state: 'DRAWN', preClick, flatBefore };
  const alert = await reasonBeside(page);
  return { state: alert ? 'RENDERER_REFUSED' : 'NEVER_DREW', detail: alert, preClick, flatBefore };
}

/**
 * The readable flat surface, counted the way a reader finds it: a data table, or an SVG figure with text in
 * it. Both are what these wrappers swap out, and both are what survives to paper; a canvas is neither.
 */
const readFlat = () => ({
  tables: document.querySelectorAll('table').length,
  svgsWithText: Array.from(document.querySelectorAll('svg')).filter((s) => s.querySelector('text') !== null).length,
});

/** A canvas with real geometry on it. `?? null` on the tier because two of the eight never stamp one. */
async function waitForDrawn(page, timeout) {
  try {
    await page.waitForFunction(() => Array.from(document.querySelectorAll('canvas')).some((c) => {
      const b = c.getBoundingClientRect();
      return b.width > 4 && b.height > 4 && getComputedStyle(c).display !== 'none';
    }), undefined, { timeout });
    /* SwiftShader compiles the shaders on the first draw; a canvas can be laid out a beat before it holds a
       frame, and the print and context-loss axes both read a drawn canvas. */
    await page.waitForTimeout(1200);
    return true;
  } catch { return false; }
}

/**
 * Wait until the page stops navigating, then take a measurement window — and VOID it if a navigation happened
 * while it was open. Returns `null` when it could not get a clean window, so the caller reports "unmeasured"
 * rather than the zero a torn-down page would hand it.
 */
async function cleanWindow(page, take, { settle = true, recover = null, attempts = 3 } = {}) {
  for (let i = 0; i < attempts; i++) {
    if (settle) {
      /* Three seconds with no navigation. `/select` reloads about two seconds in, once per document. */
      let quiet = page.__navs;
      for (let waited = 0; waited < 12_000; waited += 500) {
        await page.waitForTimeout(500);
        if (page.__navs === quiet) { if (waited >= 3000) break; } else { quiet = page.__navs; waited = 0; }
      }
    }
    const before = page.__navs;
    try {
      const out = await take();
      if (page.__navs === before) return out;
    } catch { /* context destroyed mid-window — same verdict as a straddled window */ }
    /* The window was straddled by a navigation, so the new document has to be back on a frame before the next
       attempt means anything. */
    if (recover) await recover();
  }
  return null;
}

const pageHeadline = (page) => page.evaluate(() => (document.body.innerText ?? '')
  .replace(/\s+/g, ' ').slice(0, 150));
const reasonBeside = (page) => page.evaluate(() => {
  /* The FIRST live region only, and cut at a sentence. A page can hold several — `/marketing/crisis` has the
     refusal code and its full explanation in two of them — and concatenating them produced a run-on truncated
     mid-word in the generated report, which is the sort of thing a reader stops trusting the file over. */
  /* `innerText`, not `textContent`: `/marketing/crisis` puts a refusal code and its explanation in adjacent
     children with no whitespace between them, and `textContent` ran them into "NO_FORWARD_RISK_FEEDNo forward
     risk feed…" in the generated report. `innerText` is layout-aware and separates them. */
  const el = document.querySelector('[role="alert"]');
  const text = el === null ? null : (el.innerText ?? el.textContent ?? '').trim().replace(/\s+/g, ' ');
  if (text === null) return null;
  const stop = text.indexOf('. ');
  return (stop > 20 && stop < 200 ? text.slice(0, stop + 1) : text.slice(0, 180)).trim();
});

/* ── THE AXES ───────────────────────────────────────────────────────────────────────── */

/**
 * A reload during an axis makes that axis's numbers describe a document that is no longer there — and on two
 * of the four axes the numbers it then produces are the PASSING ones. So a straddled pass is thrown away and
 * re-run rather than reported. `RELOADED` is the sentinel; `sweepSurface` catches it.
 */
const RELOADED = Symbol('reloaded');
async function guarded(page, fn) {
  const before = page.__navs;
  let out;
  try { out = await fn(); } catch (e) {
    if (page.__navs !== before) throw RELOADED;
    throw e;
  }
  if (page.__navs !== before) throw RELOADED;
  return out;
}

/**
 * One surface, all four axes, retried whole if a reload straddled any of them.
 *
 * Retried WHOLE rather than per axis because `reach()` is what establishes the baselines the axes are compared
 * against (`preClick`, `flatBefore`); re-running one axis against another pass's baseline is how a comparison
 * becomes a coincidence.
 */
async function sweepSurface(browser, surface, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    /* Every page a pass opens, closed whatever happens to it. A discarded pass throws past each axis's own
       `page.close()`, and a leaked page keeps a GL context alive that the next pass would then census. */
    const open = [];
    try {
      return await sweep(browser, surface, open);
    } catch (e) {
      if (e !== RELOADED) throw e;
      console.log(`      (${surface.id}: the page reloaded mid-pass — attempt ${i} discarded, not reported)`);
    } finally {
      for (const p of open) await p.close().catch(() => {});
    }
  }
  return {
    ...surface, problems: [
      `every one of ${attempts} passes was straddled by a page reload, so nothing here was measured. `
      + 'Reported as unmeasured rather than as a pass: a reload resets the draw counters and the relief '
      + 'toggle, and zero draws with the toggle off is what a pass looks like.',
    ], axes: {}, reach: 'RELOADED_EVERY_PASS',
  };
}

async function sweep(browser, surface, open) {
  const row = { ...surface, problems: [], axes: {} };

  /* ── 1 · REACH, the tier stamp, and the context census, in one pass ──────────────── */
  {
    const page = await newSeatedPage(browser, surface);
    open.push(page);
    const got = await reach(page, surface);
    row.reach = got.state;
    row.reachDetail = got.detail ?? null;

    if (got.state === 'DRAWN') {
      const canvases = await guarded(page, () => page.evaluate(readCanvases));
      const census = await guarded(page, () => page.evaluate(readAudit));
      row.canvases = canvases;
      row.contextsCreated = census.created;
      row.contextsNotLost = census.notLost;
      row.contextsInDocument = census.inDocument;
      row.contextsOffscreen = census.offscreen;
      row.contextsByToggle = census.created - (got.preClick ?? 0);
      row.getContextCalls = census.getContextCalls;
      row.deadReads = census.deadReads;
      if (census.deadReads.length > 0) {
        /*
         * NOT A 3-D FINDING, AND REPORTED ANYWAY, because it is what decides whether a surface is reachable at
         * all — and because it is invisible from the network panel.
         *
         * `readCache.ts:375-379` states the opposite of what `readCache.ts:380-389` does: "The coalescer owns
         * its own fetch and deliberately ignores any caller's abort signal ... A caller's signal DETACHES that
         * subscriber, it does not kill the request." The coalescer runs `() => networkRequest(path, opts, ...)`
         * with the FIRST caller's `opts`, so the one shared fetch is bound to the first subscriber's signal and
         * every later subscriber dies with it. The trigger on `/audit-log` is React's dev double-mount, which
         * does not happen in a production build — so the SYMPTOM measured here is dev-only for this page, and
         * the DEFECT is in shipped code with a comment asserting the reverse. Ten modules under `lib/api` pass
         * a signal, so any page with two concurrent identical reads and one abort can reach it.
         */
        row.problems.push(`${census.deadReads.length} read(s) on this route were dispatched with an `
          + `ALREADY-ABORTED signal and never became a request: ${census.deadReads.join(', ')}. `
          + 'The page renders as empty with no error and nothing appears in the network panel. '
          + 'readCache.ts:375-379 claims a caller\'s signal "detaches that subscriber, it does not kill the '
          + 'request", but readCache.ts:380-389 runs the shared fetch with the FIRST caller\'s opts — so it '
          + 'does kill it. Reachable in production wherever two concurrent identical GETs exist and one aborts');
      }
      /* The relief canvas is the one the toggle just added. Where a route has several (CommandDeck carries
         the shared 2-D context behind the deck as well), the tier stamp is read off ALL of them and reported
         as a count, so "no canvas here stamps a tier" cannot be confused with "the page has no canvas". */
      row.tierStamped = canvases.filter((c) => c.tier !== null).length;
      row.tierValues = [...new Set(canvases.map((c) => c.tier).filter(Boolean))];
      if (row.tierStamped === 0) {
        /*
         * The claim is at `shared/useQualityTier.ts:94-99`: "The app has no capture harness, so the components
         * stamp `data-quality-tier` on their canvas and this is where a debug surface reads the rest." Six of
         * the eight do, at one line each. Named against the RENDERER file rather than the wrapper, because the
         * stamp belongs beside the draw that finished.
         */
        row.problems.push(`${surface.glFile} never sets \`canvas.dataset.qualityTier\`, so the tier this `
          + 'surface rendered at cannot be read back off the live page. `shared/useQualityTier.ts:94-99` '
          + 'states that the components stamp it, and six of the eight do — DeckReliefGl.tsx:608, '
          + 'SurfaceReliefGl.tsx:336, OntologyOrreryGl.tsx:516, PipelineReliefGl.tsx:535, '
          + 'VaultReliefGl.tsx:522, StormReliefGl.tsx:559. `env/quality.ts` is the reason it matters: a tier '
          + 'that cannot be reported cannot be trusted');
      }
    } else if (surface.expectUnreachable && got.state === surface.expectUnreachable) {
      /* Not a problem: the surface refused for the documented reason, and this is the confirmation. */
    } else {
      row.problems.push(`could not reach the surface: ${got.state}`
        + (got.detail ? ` — ${got.detail}` : ''));
    }
    row.pageErrors = page.__errs ?? [];
    if (row.pageErrors.length) {
      row.problems.push(`page errors: ${row.pageErrors.slice(0, 2).join(' | ')}`);
    }
    await page.close();
  }

  if (row.reach !== 'DRAWN') return row;

  /* ── 2 · REDUCED MOTION, on the live page ────────────────────────────────────────── */
  {
    const page = await newSeatedPage(browser, surface);
    open.push(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const got = await reach(page, surface);
    if (got.state !== 'DRAWN') {
      row.problems.push(`reaches a frame normally but ${got.state} under prefers-reduced-motion: reduce`);
      row.axes.reducedMotion = { reached: false };
    } else {
      /*
       * The window starts NOW, not at load: everything before the frame is setup, and counting it would charge
       * the surface for the frames it needed to exist.
       *
       * TWO NUMBERS, AND ONLY ONE OF THEM IS A VERDICT. `drawsAfterDrawn` is draw calls on the contexts THIS
       * TOGGLE created, which nothing else on the page can produce, and it is what the finding is raised on.
       * `rafAfterDrawn` is page-wide and reported as CONTEXT ONLY — on these routes the shell, ReactFlow and
       * the entrance transitions all schedule frames, so it is a fact about the page and not about the relief.
       */
      /*
       * ── THE PER-SURFACE FLOOR, BECAUSE THE CONTROL RUN ONLY PROVES ONE CONTEXT ─────────
       *
       * E8's control run proves the counter works on E8's context. It does not prove the wrapper caught the
       * draw calls THIS surface makes: a renderer reaching the screen through a call this probe does not wrap
       * would report 0 for ever, and 0 is the passing value. So the cumulative count is read BEFORE the window
       * is reset — the frame the reader is looking at has already been drawn, so it must be non-zero.
       */
      const drawsSoFar = await guarded(page, () => page.evaluate(
        (from) => globalThis.__lcxAudit.contexts.slice(from).reduce((n, c) => n + c.draws, 0),
        got.preClick ?? 0,
      ));
      if (drawsSoFar === 0) {
        row.problems.push('the draw counter recorded ZERO draws on this surface\'s own context even though a '
          + 'frame is on screen, so it does not see this renderer\'s draw path and the zero below is not a '
          + 'measurement');
      }
      const win = await cleanWindow(page, () => page.evaluate((from) => new Promise((ok) => {
        const a = globalThis.__lcxAudit;
        a.raf = 0;
        for (const c of a.contexts) c.draws = 0;
        setTimeout(() => ok({
          raf: a.raf,
          draws: a.contexts.slice(from).reduce((n, c) => n + c.draws, 0),
          drawsAll: a.contexts.reduce((n, c) => n + c.draws, 0),
        }), 600);
      }), got.preClick ?? 0));
      if (win === null) {
        row.axes.reducedMotion = { reached: true, unmeasured: true };
        row.problems.push('the page kept navigating, so no clean 600 ms window could be taken under '
          + 'prefers-reduced-motion: reduce — this axis is UNMEASURED here, NOT passing');
      } else {
        row.axes.reducedMotion = {
          reached: true, drawsBeforeWindow: drawsSoFar,
          rafAfterDrawn: win.raf, drawsAfterDrawn: win.draws, drawsAllContexts: win.drawsAll,
        };
        if (win.draws > 0) {
          row.problems.push(`kept drawing after its first frame under prefers-reduced-motion: reduce — `
            + `${win.draws} draw calls in 600 ms on the ${row.contextsByToggle} context(s) this surface created `
            + '(§6 rule 2: zero idle motion; rule 3: reduced motion resolves to the FINAL frame)');
        }
      }
    }
    await page.close();
  }

  /*
   * ── 2b · THE CONTROL RUN, and it is what makes every zero above mean anything ──────
   *
   * A rAF counter that is broken reports 0 for every surface, and 0 is the passing value — so the reduced
   * motion audit above is exactly the shape of check this programme keeps catching: one that cannot fail.
   * `docs/3d/e9/README.md` records its own version of this as a VACUOUS pass, because no harness animates.
   *
   * One app surface does animate, by design and by name: `ForgeBackdrop` runs a five-second arc
   * (`SWEEP_MS = 5000`) unless the reader has asked for reduced motion. So on that surface, and only there,
   * this sweep also loads with NO motion preference and requires the counter to see frames. If it sees none,
   * the instrument is broken and the zeros elsewhere are withdrawn rather than reported.
   */
  if (surface.animatesByDesign) {
    const page = await newSeatedPage(browser, surface);
    open.push(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const got = await reach(page, surface);
    if (got.state !== 'DRAWN') {
      row.problems.push('the control run for the animation counter could not reach a frame, so the '
        + 'reduced-motion zeros in this sweep are UNPROVEN');
      row.axes.control = { reached: false };
    } else {
      const window600 = () => page.evaluate(() => new Promise((ok) => {
        const a = globalThis.__lcxAudit;
        for (const c of a.contexts) c.draws = 0;
        setTimeout(() => ok(a.contexts.reduce((n, c) => n + c.draws, 0)), 600);
      }));
      /*
       * THE ARC STARTS WHEN THE RENDERER MOUNTS, WHICH IS WHY THIS WINDOW DOES NOT SETTLE FIRST.
       *
       * `SWEEP_MS` is 5000 and the settle in `cleanWindow` waits three quiet seconds — so a settled window can
       * legitimately open after the arc has already finished, and the zero it then reports would be correct
       * behaviour presented as a broken instrument. Taken immediately instead, and VOIDED rather than believed
       * if a navigation lands inside it: `/select` performs one document navigation about two seconds in, and
       * the recovery is to wait for the new document's frame before trying again.
       */
      const during = await cleanWindow(page, window600, {
        settle: false,
        recover: () => waitForDrawn(page, 45_000),
      });
      /* And then it must STOP. The arc is five seconds; past it, a surface still drawing is idle motion, which
         is what §6 rule 2 forbids. This one DOES settle: by now the page is quiet and the arc is over. */
      await page.waitForTimeout(6500);
      const after = await cleanWindow(page, window600);
      if (during === null || after === null) {
        row.axes.control = { reached: true, unmeasured: true };
        row.problems.push('the control run could not get a clean window, so the reduced-motion zeros in this '
          + 'sweep are UNPROVEN rather than confirmed');
      } else {
        row.axes.control = { reached: true, drawsDuringSweep: during, drawsAfterSweep: after };
        if (during === 0) {
          row.problems.push('the draw-call counter saw ZERO draws on a surface documented to animate for '
            + '5000 ms, so it cannot distinguish "stopped" from "not measured" — every reduced-motion zero in '
            + 'this sweep is unproven');
        }
        if (after > 0) {
          row.problems.push(`still drawing ${after} times per 600 ms after its 5000 ms arc has finished `
            + '(§6 rule 2: zero idle motion)');
        }
      }
    }
    await page.close();
  }

  /*
   * ── 2c · WHAT A TOGGLE OFF RELEASES — the measurement §10.4 asked for ────────────────
   *
   * `3D_VFX_FINAL_PLAN.md` §10.4 records, as newly-found and unmeasured work, that `stage.dispose()` never
   * called `WEBGL_lose_context.loseContext()`, so "toggling a relief off and on can hold more live contexts
   * than there are mounted components — against a cap where exceeding it kills the OLDEST, which on a chart
   * route is the one shared context every chart depends on."
   *
   * `packages/gl/src/stage.ts:322-360` now DOES lose the context, gated on the canvas being detached. So this
   * axis is not here to restate the hazard — it is here to check the fix in a real browser, and to keep
   * checking it. It is measured rather than read off the source for the reason the whole programme keeps
   * relearning: a claim about which branch runs is worth exactly as much as the trace behind it.
   */
  if (surface.toggle !== null) {
    const page = await newSeatedPage(browser, surface);
    open.push(page);
    const got = await reach(page, surface);
    if (got.state !== 'DRAWN') {
      row.axes.release = { reached: false };
    } else {
      const on = await guarded(page, () => page.evaluate(readAudit));
      const btn = page.getByRole('button', { name: surface.toggle });
      await btn.first().scrollIntoViewIfNeeded();
      await btn.first().click();
      /* The canvas has to be off the document and React's cleanup has to have run before `dispose` can decide
         the canvas is detached, which is the condition the fix turns on. */
      await page.waitForTimeout(2000);
      const off = await guarded(page, () => page.evaluate(readAudit));
      row.axes.release = {
        reached: true,
        notLostWithReliefOn: on.notLost,
        notLostAfterToggleOff: off.notLost,
        createdTotal: off.created,
      };
      const releasedByToggle = on.notLost - off.notLost;
      if (releasedByToggle < (row.contextsByToggle ?? 1)) {
        row.problems.push(`switching the relief off released ${releasedByToggle} of the `
          + `${row.contextsByToggle} context(s) it created — ${off.notLost} are still not reporting `
          + '`isContextLost()`. Past the browser cap of 8-16 the OLDEST context is killed silently, and on a '
          + 'route that draws charts that is the shared one (3D_VFX_FINAL_PLAN.md §10.4)');
      }
    }
    await page.close();
  }

  /* ── 3 · PRINT, with the relief ON — the configuration nothing else in the repo checks ── */
  {
    const page = await newSeatedPage(browser, surface);
    open.push(page);
    const got = await reach(page, surface);
    if (got.state !== 'DRAWN') {
      row.axes.print = { reached: false };
      row.problems.push(`reaches a frame normally but ${got.state} on the print pass`);
    } else {
      const before = await guarded(page, () => page.evaluate(readCanvases));
      await page.emulateMedia({ media: 'print' });
      /* One frame for the print stylesheet to apply before anything is measured. */
      await page.waitForTimeout(400);
      const after = await guarded(page, () => page.evaluate(() => {
        const canvases = Array.from(document.querySelectorAll('canvas')).map((c) => {
          const b = c.getBoundingClientRect();
          return {
            shown: getComputedStyle(c).display !== 'none' && b.width > 4 && b.height > 4,
            h: Math.round(b.height),
            /* `.br-no-print` is the house class `PrintStyles.tsx:55` deletes from the printed sheet. Which
               canvases carry it is the difference between a page that thought about print and one that did
               not — on CommandDeck the signature backdrop is inside it and the relief is not. */
            noPrint: c.closest('.br-no-print') !== null,
          };
        });
        /* THE FLAT SURFACE, as the reader would find it on paper. Compared against the census taken with the
           relief OFF: every wrapper SWAPS rather than layers, so the question is whether opening the relief
           takes readable data OUT of the printed document. */
        const flatTables = document.querySelectorAll('table').length;
        const flatSvgs = Array.from(document.querySelectorAll('svg'))
          .filter((s) => s.querySelector('text') !== null).length;
        /* The toggle and its "nobody has yet timed whether it answers faster" sentence. On a page with a
           print sheet these are chrome; `GpsPrint.tsx:94` records the same class of defect in the same
           words — "a button printed on a client proposal". */
        const controls = Array.from(document.querySelectorAll('button'))
          .filter((b) => /view:\s*(on|off)/i.test(b.textContent ?? ''))
          .map((b) => ({
            text: (b.textContent ?? '').trim().slice(0, 30),
            printed: getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().height > 1,
            noPrint: b.closest('.br-no-print') !== null,
          }));
        /*
         * THE MECHANISM, MEASURED RATHER THAN ASSUMED. `PrintStyles.tsx:93-94` hides `[data-relief-live]`
         * and reveals `[data-relief-print-flat]` in print, and the flat copy carries `display:none` as an
         * INLINE style so it stays hidden on a page with no sheet — which means the rule's `!important` is
         * the only thing that can bring it back, and whether it did is a fact about the live document.
         *
         * Which page mounts the sheet is read off the page's own stylesheets rather than declared in this
         * file's surface table: a hand-maintained boolean is exactly the kind of claim that is true when
         * typed and false when read.
         */
        const sheetPresent = Array.from(document.querySelectorAll('style'))
          .some((st) => (st.textContent ?? '').includes('[data-relief-print-flat]'));
        const laidOut = (el) => {
          const b = el.getBoundingClientRect();
          return getComputedStyle(el).display !== 'none' && b.height > 4 && b.width > 4;
        };
        const live = Array.from(document.querySelectorAll('[data-relief-live]'));
        const flatCopy = Array.from(document.querySelectorAll('[data-relief-print-flat]'));
        return {
          canvases, flatTables, flatSvgs, controls, sheetPresent,
          liveMarked: live.length,
          liveStillShown: live.filter(laidOut).length,
          flatCopyPresent: flatCopy.length,
          flatCopyShown: flatCopy.filter(laidOut).length,
        };
      }));

      /*
       * AND THE PDF, because a computed style is not ink. `reliefPrintPath.test.tsx:41-43` names this exact
       * item as unverified: `createStage` sets `preserveDrawingBuffer: true` so the buffer "should print, but
       * nobody has produced the PDF". Producing it is one call, and the answer is either an image in the
       * file or not.
       */
      let pdf = null;
      try {
        const buf = await guarded(page, () => page.pdf({ printBackground: true, format: 'A4' }));
        pdf = { bytes: buf.length, hasImage: buf.includes(Buffer.from('/Image')) };
      } catch (e) {
        pdf = { error: String(e).slice(0, 90) };
      }

      const flatBefore = got.flatBefore ?? { tables: 0, svgsWithText: 0 };
      const lostTables = Math.max(0, flatBefore.tables - after.flatTables);
      const lostSvgs = Math.max(0, flatBefore.svgsWithText - after.flatSvgs);
      row.axes.print = {
        reached: true,
        canvasesShownOnScreen: before.filter((c) => c.shown).length,
        canvasesShownInPrint: after.canvases.filter((c) => c.shown).length,
        canvasesInsideNoPrint: after.canvases.filter((c) => c.noPrint).length,
        flatBefore, flatTables: after.flatTables, flatSvgsWithText: after.flatSvgs,
        lostTables, lostSvgs,
        controls: after.controls,
        sheetPresent: after.sheetPresent,
        liveMarked: after.liveMarked, liveStillShown: after.liveStillShown,
        flatCopyPresent: after.flatCopyPresent, flatCopyShown: after.flatCopyShown,
        pdf,
      };

      const printedControls = after.controls.filter((c) => c.printed && !c.noPrint);
      if (after.sheetPresent && printedControls.length > 0) {
        row.problems.push(`the relief toggle prints as furniture on a page that mounts the print sheet: `
          + `${printedControls.map((c) => `"${c.text}"`).join(', ')} is outside \`.br-no-print\``);
      }

      /*
       * ── WHAT IS AND IS NOT A FINDING ON THIS AXIS, and the gate is `sheetPresent` ────────────────
       *
       * A page with NO print sheet prints its dark theme, its chrome and its clipped scroll containers for
       * everything on it, relief or not. Losing a figure to a canvas there is not a separate defect and is
       * recorded in the table rather than raised — `reliefPrintPath.test.tsx:298-318` makes exactly this
       * distinction and calls it "not a defect and not a licence". A page WITH the sheet has a designed print
       * output and every clause below is a promise it makes.
       */
      if (after.sheetPresent) {
        if (after.liveMarked === 0) {
          row.problems.push('a relief is open on a page with a designed print output and NOTHING carries '
            + '`data-relief-live`, so PrintStyles.tsx:93 cannot match it — the canvas prints');
        } else if (after.liveStillShown > 0) {
          row.problems.push(`${after.liveStillShown} of ${after.liveMarked} \`[data-relief-live]\` blocks are `
            + 'still laid out under print media, so the live relief reaches paper (PrintStyles.tsx:93)');
        }
        if (after.flatCopyPresent === 0) {
          row.problems.push('no `[data-relief-print-flat]` copy exists while the relief is open, so hiding '
            + 'the live block prints nothing in its place (PrintStyles.tsx:94)');
        } else if (after.flatCopyShown === 0) {
          row.problems.push('the `[data-relief-print-flat]` copy stayed hidden under print media — its '
            + 'inline `display:none` was not beaten, so the printed page has neither the relief nor the flat '
            + 'figure (PrintStyles.tsx:94 needs its `!important`)');
        }
      }
    }
    await page.close();
  }

  /* ── 4 · A LOST CONTEXT, provoked for real ───────────────────────────────────────── */
  {
    const page = await newSeatedPage(browser, surface);
    open.push(page);
    const got = await reach(page, surface);
    if (got.state !== 'DRAWN') {
      row.axes.contextLoss = { reached: false };
      row.problems.push(`reaches a frame normally but ${got.state} on the context-loss pass`);
    } else {
      /*
       * Through the real `WEBGL_lose_context` extension, which is how Chrome itself simulates the event —
       * not a synthetic `dispatchEvent`, which would prove only that a listener exists.
       *
       * TARGETED AT THE CONTEXTS THE TOGGLE CREATED, and that is a correction rather than a refinement. The
       * first version lost the first non-lost context it found and then asserted that the relief had failed to
       * name the refusal. On `/command-deck` the first context is the SHARED 2-D renderer behind the deck; the
       * relief's `webglcontextlost` listener is registered on its OWN canvas and is correctly not called for
       * someone else's, so the sweep produced a finding about a branch it had never reached — the exact error
       * an adversarial pass caught twice in `3D_VFX_FINAL_PLAN.md` §10.6.
       *
       * The census's recorded contexts are used rather than a fresh `getContext` call: asking a canvas for a
       * context it already has returns the same object, but asking for the WRONG api returns null and the
       * probe would then report "could not provoke" about a canvas that was perfectly losable.
       */
      /* Marked so the canvases THIS surface owns can be told from the page's own — on `/command-deck` the
         signature backdrop's canvas stays on screen through a relief's context loss, correctly, and counting it
         as "a dead canvas left behind" would be a finding about the wrong element. */
      await guarded(page, () => page.evaluate((from) => {
        for (const c of globalThis.__lcxAudit.contexts.slice(from)) c.canvas.dataset.auditTarget = '1';
      }, got.preClick ?? 0));
      const target = page.locator('canvas[data-audit-target="1"]').first();
      const shot = async () => {
        try { return await target.screenshot({ timeout: 8000 }); } catch { return null; }
      };
      /* PIXELS, BECAUSE `display` IS NOT WHAT THE READER SEES. This is the measurement that first established
         the harness's own context-loss defect: an element screenshot that fell from 101,420 to 5,140 bytes
         while `document.title` still said READY and every DOM check passed. A PNG of a uniform rectangle
         compresses to almost nothing, so a collapse in bytes is a blank canvas. */
      const shotBefore = await shot();

      const provoked = await guarded(page, () => page.evaluate((from) => {
        let n = 0;
        for (const { gl } of globalThis.__lcxAudit.contexts.slice(from)) {
          if (gl.isContextLost()) continue;
          const ext = gl.getExtension('WEBGL_lose_context');
          if (ext) { ext.loseContext(); n += 1; }
        }
        return n > 0;
      }, got.preClick ?? 0));
      await page.waitForTimeout(1200);
      const shotAfter = await shot();
      const after = await guarded(page, () => page.evaluate(() => {
        const laidOut = (el) => {
          const b = el.getBoundingClientRect();
          return getComputedStyle(el).display !== 'none' && b.width > 4 && b.height > 4;
        };
        return {
          canvasesShown: Array.from(document.querySelectorAll('canvas')).filter(laidOut).length,
          ownCanvasesShown: Array.from(document.querySelectorAll('canvas[data-audit-target="1"]')).filter(laidOut).length,
          alert: document.querySelector('[role="alert"]')?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 120) ?? null,
          pressed: Array.from(document.querySelectorAll('button[aria-pressed]'))
            .filter((b) => /view:/i.test(b.textContent ?? ''))
            .map((b) => b.getAttribute('aria-pressed')),
          flatTables: document.querySelectorAll('table').length,
          flatSvgsWithText: Array.from(document.querySelectorAll('svg')).filter((s) => s.querySelector('text')).length,
        };
      }));
      after.bytesBefore = shotBefore?.length ?? null;
      after.bytesAfter = shotAfter?.length ?? null;
      row.axes.contextLoss = { reached: true, provoked, ...after };
      if (!provoked) {
        /* NOT A PASS. An audit that could not stage its own failure has measured nothing — the same rule as
           refusing an empty surface list, and the same one `3d-audit.mjs:318-321` applies. */
        row.problems.push('could not provoke a context loss on any context this toggle created '
          + '(no WEBGL_lose_context, or the toggle created none) — this axis proved nothing');
      } else if (surface.toggle !== null) {
        const flat = after.flatTables + after.flatSvgsWithText;
        if (after.alert === null) {
          row.problems.push('a lost WebGL context was never named to the reader (no live region appeared)');
        }
        if (after.pressed.some((p) => p === 'true')) {
          row.problems.push('the relief toggle still reads pressed after the context was lost');
        }
        if (after.ownCanvasesShown > 0 && flat === 0) {
          row.problems.push('a lost WebGL context left this surface\'s own canvas laid out with no readable '
            + 'flat figure anywhere on the page — the wrapper did not swap back');
        }
      } else {
        /*
         * ── E8, AND A FINDING I WITHDREW ON LOOKING AT THE PIXELS ─────────────────────────────────────
         *
         * `ForgeBackdrop` is the one relief surface in `apps/web` with no `webglcontextlost` listener anywhere
         * in the file, and after the loss its canvas is still laid out with no data figure behind it. On the
         * DOM evidence alone that is the harness's own defect exactly — a dead canvas left in front of the
         * reader — and this sweep raised it as a finding on the sign-in route, which is the worst place for it.
         *
         * IT IS NOT TRUE. The element screenshots settle it: after the loss the canvas composites as
         * TRANSPARENT and `ForgePlate`'s gradient — the CSS fallback §6 rule 1 relies on for this screen —
         * shows through with the whole form intact and readable. `alpha: false` governs the drawing buffer, not
         * what a lost context presents. So the byte pair does not support the claim either: it went UP
         * (127,994 → 315,019 on one run), and I had asserted a collapse.
         *
         * What is left is a real difference in KIND, recorded rather than raised: the other seven surfaces hide
         * the canvas and name the refusal, while this one relies on the compositor to reveal the plate. Nothing
         * tells the reader the object went away, and nothing needs to — it carries no data. The captures are
         * written next to the report so the next person can check this rather than take it from me.
         */
        row.axes.contextLoss.noListener = true;
        row.axes.contextLoss.captures = null;
        if (after.ownCanvasesShown > 0) {
          try {
            mkdirSync(SHOTS, { recursive: true });
            const stem = `${surface.id.toLowerCase()}-context-loss`;
            if (shotBefore) writeFileSync(join(SHOTS, `${stem}-before.png`), shotBefore);
            if (shotAfter) writeFileSync(join(SHOTS, `${stem}-after.png`), shotAfter);
            row.axes.contextLoss.captures = shotBefore && shotAfter ? stem : null;
          } catch { row.axes.contextLoss.captures = null; }
        }
      }
    }
    await page.close();
  }

  return row;
}

/* ── RUN ─────────────────────────────────────────────────────────────────────────────── */

if (SURFACES.length === 0) {
  console.error('  REFUSED: no surfaces to sweep. An audit that finds nothing to audit must not report success.');
  process.exit(1);
}

const { child, log } = startDevServer();
const rows = [];
const worstRoutes = [];
let browser;
try {
  await waitForServer(log);
  browser = await chromium.launch({
    /* The same three flags `3d-audit.mjs:101-103` uses: headless Chrome has no GPU, so ANGLE is pointed at
       SwiftShader and the unsafe-swiftshader switch is what stops WebGL2 being refused outright. Every frame
       in this sweep is therefore a CPU rasterisation, which is why no timing is reported. */
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  for (const surface of SURFACES) {
    const row = await sweepSurface(browser, surface);
    rows.push(row);
    const bad = row.problems.length;
    console.log(`  ${bad === 0 ? '✓' : '✗'} ${row.id} ${row.name.padEnd(16)} ${row.reach.padEnd(22)}`
      + `tier ${row.tierStamped ?? '—'}  ctx ${row.contextsNotLost ?? '—'}`
      + (bad ? `  — ${bad} problem${bad > 1 ? 's' : ''}` : ''));
    for (const p of row.problems) console.log(`      · ${p}`);
  }
  /*
   * ── THE WORST ROUTE, WITH EVERY OPT-IN ON AT ONCE ───────────────────────────────────
   *
   * `glContextBudget.test.ts` pins the worst case at 3 and derives it from the import graph: the shared
   * context plus BOTH of `/command-deck`'s independent toggles, which are separate `useState(false)` in
   * separate wrappers with no coordination, so both can be on together. Every pass above engages ONE toggle,
   * so every number above is a lower bound on that route and comparing it to the pin would be comparing two
   * different configurations. This engages every toggle a route has.
   *
   * Derived from the surface table rather than hardcoded to `/command-deck`: a second relief added to any
   * route tomorrow is measured tomorrow.
   */
  const byRoute = new Map();
  for (const r of rows.filter((x) => x.reach === 'DRAWN' && x.toggle !== null)) {
    byRoute.set(r.route, [...(byRoute.get(r.route) ?? []), r]);
  }
  for (const [route, group] of byRoute) {
    if (group.length < 2) continue;
    const page = await newSeatedPage(browser, { ...group[0], stubs: group.flatMap((g) => g.stubs) });
    try {
      const got = await reach(page, group[0]);
      if (got.state !== 'DRAWN') continue;
      const engaged = [group[0].id];
      for (const other of group.slice(1)) {
        const btn = page.getByRole('button', { name: other.toggle });
        if (await btn.count() === 0) continue;
        await btn.first().scrollIntoViewIfNeeded();
        await btn.first().click();
        if (await waitForDrawn(page, 60_000)) engaged.push(other.id);
      }
      const census = await page.evaluate(readAudit);
      worstRoutes.push({ route, engaged, created: census.created, notLost: census.notLost,
        inDocument: census.inDocument, offscreen: census.offscreen });
      console.log(`  · ${route} with ${engaged.join(' + ')} on together: ${census.notLost} contexts not lost`);
    } finally {
      await page.close().catch(() => {});
    }
  }
} finally {
  await browser?.close();
  child.kill('SIGTERM');
}

/*
 * THE FLOOR THAT MAKES THIS REPORT WORTH READING. A sweep that reached nothing must not write a green file:
 * "no findings" and "no measurements" print identically and only one of them is good news.
 */
const reached = rows.filter((r) => r.reach === 'DRAWN');
if (reached.length === 0) {
  console.error('\n  REFUSED: not one surface was reached, so every axis above is unmeasured. Nothing written.');
  console.error('  This is the failure this file exists to prevent — a green report from a sweep that ran no check.');
  process.exit(1);
}

/* ── THE GENERATED REPORT ───────────────────────────────────────────────────────────── */

const t = (v, dash = '—') => (v === null || v === undefined ? dash : String(v));
const yn = (v) => (v === null || v === undefined ? '—' : v ? 'yes' : 'NO');
const stamp = process.env.AUDIT_DATE ?? new Date().toISOString().slice(0, 10);
const failing = rows.filter((r) => r.problems.length > 0);
const unreachable = rows.filter((r) => r.reach !== 'DRAWN');

writeFileSync(OUT, `# THE APP SWEEP — status: **${reached.length} of ${rows.length} relief surfaces reached\
${failing.length === 0 ? ', no findings' : `, ${failing.length} with findings`}**

<!-- GENERATED by scripts/3d-audit-app.mjs. Do not edit: run \`node scripts/3d-audit-app.mjs\`. -->

Swept ${stamp}. **This file is output, not prose** — the same discipline as \`docs/3d/e9/README.md\` and for the
same reason: every hand-written README in this programme has been caught carrying a sentence that was true when
typed and false when read. If this disagrees with the code, run it again rather than editing it.

## What this is, and what \`e9\` is not

\`scripts/3d-audit.mjs\` sweeps reduced motion, print, no-WebGL, a lost context and the quality ladder over the
\`docs/3d/eN\` harness pages. **Every one of those checks runs against a static harness.** None of them runs
against \`apps/web\`, where the eight relief surfaces actually ship. This file is that half.

It exists because the gap had already cost something twice over: nothing in \`apps/web\` had ever exercised the
refusal path — all seven relief component tests stop at the Suspense fallback, so no renderer effect had ever
run in a test — and \`components/__tests__/reliefPrintPath.test.tsx:37-48\` names two print questions that no
test in the repo can answer, because jsdom evaluates no \`@media print\` and rasterises nothing.

**Every frame below is SwiftShader**, a CPU rasteriser. No timing is reported and none should be read into
this file; \`docs/3d/e9/README.md\` gives the argument at length.

## Reach — what a headless sweep can actually get to

| surface | route | reached | how | tier stamped | reads dispatched dead |
|---|---|---|---|---|---|
${rows.map((r) => `| **${r.id}** ${r.name} | \`${r.route}\` | ${r.reach === 'DRAWN' ? 'yes' : `**${r.reach}**`} | ${r.note} | ${r.reach === 'DRAWN' ? `${r.tierStamped} of ${r.canvases.length} canvases${r.tierValues.length ? ` (\`${r.tierValues.join('`, `')}\`)` : ''}` : '—'} | ${r.deadReads === undefined ? '—' : (r.deadReads.length === 0 ? '0' : `**${r.deadReads.length}**`)} |`).join('\n')}

Four things about that table are worth stating rather than leaving to be inferred.

**The seat is seeded, not typed.** Sign-in is an email plus a desk passcode verified server-side, so a sweep
cannot perform it without a database. The persisted session is written before the app's first script runs, the
way \`apps/web/e2e/seat.ts\` does it, and every \`/v1/**\` request is then aborted with \`connectionrefused\` so
the sweep behaves identically whether or not an API happens to be listening. What is NOT tested here, as a
consequence, is the sign-in path itself.

**Where a route needs data, the network is replaced with the smallest fixture that makes the surface
drawable** — and no number in this report is read off one. \`/ontology\` needs none: its graph is static.
\`/select\` needs neither a seat nor a fixture, because it is what a stranger sees.

**"Reads dispatched dead" is not about 3-D, and it is here because it decides reachability.** A count above zero
means the route issued a \`/v1/**\` fetch whose \`AbortSignal\` was ALREADY aborted, so the browser rejected it
before a request existed — nothing appears in a network panel and the page renders as empty with no error. That
is why one surface above needs a filter change before its data arrives. The findings section carries the
mechanism.

**The dev server is started by this script with \`VITE_API_URL=''\`.** \`apps/web/.env.local\` points the API at
another origin, which makes every call cross-origin; a preflight that escapes the request router reaches a port
with nothing on it, and the fixture then silently does not apply. Forcing the calls back onto the dev origin
changes where they are addressed and nothing about what the components render.
${unreachable.length === 0 ? '' : `
### Not reached, itemised

${unreachable.map((r) => `- **${r.id} ${r.name}** (\`${r.route}\`) — \`${r.reach}\`${r.reachDetail ? `: ${r.reachDetail}` : ''}`).join('\n')}
`}
## Axis 1 · Reduced motion — measured as draw calls, not as scheduled frames

| surface | reaches a frame under \`reduce\` | draws already recorded on its own context | draw calls in the 600 ms after it drew | page-wide \`rAF\` in the same window (context only) |
|---|---|---|---|---|
${rows.map((r) => {
  const a = r.axes.reducedMotion;
  if (!a) return `| **${r.id}** | — | — | — | — |`;
  if (!a.reached) return `| **${r.id}** | NO | — | — | — |`;
  if (a.unmeasured) return `| **${r.id}** | yes | ${t(a.drawsBeforeWindow)} | **unmeasured** | — |`;
  return `| **${r.id}** | yes | ${a.drawsBeforeWindow === 0 ? '**0 — see findings**' : a.drawsBeforeWindow} | ${a.drawsAfterDrawn === 0 ? '**0**' : `**${a.drawsAfterDrawn}**`} | ${a.rafAfterDrawn} |`;
}).join('\n')}

**The last column is not a verdict; "draw calls in the 600 ms after it drew" is.** The first version of this sweep counted
\`requestAnimationFrame\` page-wide, which is what \`3d-audit.mjs\` does — correctly, because a harness page is
one file with nothing else in it. In the app that counted the SHELL: 36 frames on \`/ontology\`, where ReactFlow
runs its own loop, and 10 then 36 on two consecutive passes over the same surface. A number that moves like that
is a fact about the page. Draw calls on the contexts the toggle itself created cannot belong to anything else.

**"Draws already recorded on its own context" is the per-surface floor.** The control run below proves the counter works on ONE context; it
does not prove the wrapper caught the draw path THIS renderer uses, and a renderer reaching the screen through an
unwrapped call would report 0 for ever. So the cumulative count is read before the window is reset: the frame is
already on screen, so it must be non-zero, and a zero there is reported as an instrument failure rather than as a
still surface.

A zero in the verdict column is the passing value, which means a broken counter passes every surface. \`docs/3d/e9/README.md\` reports
its own version of this check as **VACUOUS** for exactly that reason: no harness animates, so nothing could ever
make the number non-zero. **In the app it is not vacuous, and one surface is why.** \`ForgeBackdrop\` runs a
five-second arc on the sign-in route by design (\`SWEEP_MS = 5000\`), so it is also loaded with **no motion
preference**, where the counter must see draws, and then again after the arc should have finished, where it
must not:

${(() => {
  const c = rows.find((r) => r.axes.control);
  if (!c) return 'No surface in this sweep animates by design, so the counter is UNPROVEN and every zero above should be read as "not measured".';
  const a = c.axes.control;
  if (!a.reached) return `The control run on **${c.id}** could not reach a frame, so the counter is UNPROVEN and every zero above should be read as "not measured".`;
  return `| **${c.id} ${c.name}**, no motion preference | draw calls per 600 ms |\n|---|---|\n`
    + `| during its 5000 ms arc | **${a.drawsDuringSweep}** |\n`
    + `| after the arc has finished | **${a.drawsAfterSweep}** |\n\n`
    + (a.drawsDuringSweep > 0
      ? 'The counter sees draws when draws exist, so the zeros above are measurements rather than silence.'
      : '**The counter saw none, so it cannot tell "stopped" from "not measured" and every zero above is withdrawn.**')
    + (a.drawsAfterSweep === 0
      ? ' And it stops: zero idle motion, measured on the live page rather than read off the source.'
      : ' **And it does not stop**, which §6 rule 2 forbids.');
})()}

## Axis 2 · Print, with the relief OPEN

This is the configuration \`reliefPrintPath.test.tsx\` states it cannot verify, and both of its named items are
settled here. Measured under emulated print media, with the relief on:

| surface | designed print output | canvases shown on screen → in print | \`[data-relief-live]\` marked → still shown | \`[data-relief-print-flat]\` present → revealed | readable figures, relief off → on | toggle prints |
|---|---|---|---|---|---|---|
${rows.map((r) => {
  const p = r.axes.print;
  if (!p?.reached) return `| **${r.id}** | — | — | — | — | — | — |`;
  const printed = p.controls.filter((c) => c.printed && !c.noPrint).length;
  const beforeN = p.flatBefore.tables + p.flatBefore.svgsWithText;
  const afterN = p.flatTables + p.flatSvgsWithText;
  return `| **${r.id}** | ${yn(p.sheetPresent)} | ${p.canvasesShownOnScreen} → ${p.canvasesShownInPrint} | ${p.liveMarked} → ${p.liveStillShown} | ${p.flatCopyPresent} → ${p.flatCopyShown} | ${beforeN} → ${afterN}${beforeN > afterN ? ' **(lost)**' : ''} | ${printed > 0 ? `**${printed}**` : '0'} |`;
}).join('\n')}

**"Designed print output" is read off the page**, not declared here: it is true when one of the page's own
stylesheets carries the \`[data-relief-print-flat]\` rule. A hand-maintained boolean in the sweep would be the
same class of claim this whole programme keeps catching — true when typed, false when read.

The two middle columns are the mechanism \`PrintStyles.tsx:93-94\` installs, measured on the live document rather
than matched in the source: with a relief open, every \`[data-relief-live]\` block must stop being laid out and
the \`[data-relief-print-flat]\` copy must start. The copy carries \`display: none\` as an INLINE style so it stays
hidden on a page with no sheet, which means the rule's \`!important\` is the only thing that can reveal it — and
whether it did is exactly what jsdom cannot answer.

**"Readable figures" counts data tables and SVGs that contain text**, compared relief-off against relief-on
under the same print media. Two limits worth stating: a drop is the finding and an absence is not (the sign-in
screen has no flat data figure to lose and never claimed one — an absence test flagged it), and a flat form
made of \`<div>\` panels rather than a table or a titled SVG is INVISIBLE to this count, which is why **E1** can
swap four panels for a canvas and show no drop. On a page with a designed print output the two middle columns
are the ones that carry the verdict; this column is corroboration.

A drop on a page with **no** designed print output is recorded and not raised. Such a page prints its dark
theme, its chrome and its clipped scroll containers for everything on it, relief or not
(\`reliefPrintPath.test.tsx:298-318\`, "not a defect and not a licence"). The day one of those four pages becomes
printable, this table is where the canvas on it becomes a print question.

And the PDF, which is the half a computed style cannot answer — \`createStage\` sets
\`preserveDrawingBuffer: true\` (\`packages/gl/src/stage.ts:161\`) so the buffer *should* survive compositing,
and until now nobody had produced the file:

| surface | PDF bytes | carries an image |
|---|---|---|
${rows.map((r) => {
  const p = r.axes.print?.pdf;
  if (!p) return `| **${r.id}** | — | — |`;
  if (p.error) return `| **${r.id}** | refused | \`${p.error}\` |`;
  return `| **${r.id}** | ${p.bytes.toLocaleString('en-GB')} | ${yn(p.hasImage)} |`;
}).join('\n')}

An \`/Image\` XObject in the file is the canvas reaching paper. What it does **not** establish is that the image
is the right one, or that it is legible at print resolution — a byte pattern is presence, not fidelity.

## Axis 3 · A lost WebGL context, on a surface that had already drawn

The app's recovery path is different code from the harness's. Each \`*ReliefGl\` registers
\`webglcontextlost\` on **its own** canvas and calls the wrapper's \`onRefused\`, which sets \`wantRelief\`
back to false — so the flat figure returns and the refusal is announced in a live region. That branch had never
run in any test, because jsdom has no WebGL context to lose.

| surface | loss provoked | refusal named to the reader | toggle still pressed | its OWN canvas still shown | other canvases on the page | flat surface behind it | canvas PNG, before → after |
|---|---|---|---|---|---|---|---|
${rows.map((r) => {
  const c = r.axes.contextLoss;
  if (!c?.reached) return `| **${r.id}** | — | — | — | — | — | — | — |`;
  const flat = (c.flatTables ?? 0) + (c.flatSvgsWithText ?? 0);
  const others = (c.canvasesShown ?? 0) - (c.ownCanvasesShown ?? 0);
  const px = (c.bytesBefore != null && c.bytesAfter != null)
    ? `${c.bytesBefore.toLocaleString('en-GB')} → ${c.bytesAfter.toLocaleString('en-GB')} B` : '—';
  return `| **${r.id}** | ${yn(c.provoked)} | ${c.noListener ? '**no listener**' : (c.alert ? 'yes' : 'NO')} | ${c.pressed?.some((p) => p === 'true') ? 'YES' : 'no'} | ${c.ownCanvasesShown > 0 ? `**${c.ownCanvasesShown}**` : '0'} | ${others} | ${flat > 0 ? `${flat} element${flat > 1 ? 's' : ''}` : 'NONE'} | ${px} |`;
}).join('\n')}

Two columns rather than one for the canvases, and that split is a correction. Counting every canvas on the page
made \`/command-deck\` look as though a dead one had been left behind: the signature backdrop's canvas is still
there, correctly, because a relief losing its context says nothing about the plate the deck sits on. Only a
canvas belonging to a context THIS surface created can be a dead canvas of its own.

The PNG column is an element screenshot of that canvas either side of the loss. It is here because it is the
measurement that first established this defect class in the harness — 101,420 bytes down to 5,140 while
\`document.title\` still said READY and every DOM assertion passed.

**And on this sweep it withdrew a finding rather than supporting one.** On the DOM evidence alone, E8 looks like
that harness defect exactly: no \`webglcontextlost\` listener anywhere in \`ForgeBackdrop.tsx\`, its own canvas
still laid out after the loss, and no data figure behind it. This sweep raised it — on the sign-in route, the
worst possible place for it to be true. The captures say otherwise: after the loss the canvas composites as
TRANSPARENT and \`ForgePlate\`'s gradient shows through with the form intact, which is exactly the CSS fallback
§6 rule 1 relies on for that screen. \`alpha: false\` governs the drawing buffer, not what a lost context
presents. The bytes did not settle it either — they went UP.
${(() => {
  const withShots = rows.filter((r) => r.axes.contextLoss?.captures);
  if (withShots.length === 0) return '';
  return '\nThe pair is written out so this is checkable rather than taken on trust:\n\n'
    + withShots.map((r) => `- **${r.id}**: \`docs/3d/app-sweep/${r.axes.contextLoss.captures}-before.png\``
      + ' and \`…-after.png\`').join('\n') + '\n';
})()}
What remains is a difference in KIND, recorded and not raised: the other surfaces hide the canvas and name the
refusal in a live region, while this one relies on the compositor to reveal the plate underneath. Nothing tells
the reader the object went away — and nothing needs to, because it carries no data.

## Axis 4 · The GL context count, measured rather than derived

\`apps/web/src/components/__tests__/glContextBudget.test.ts\` pins the worst route at **3 live contexts** by
walking the static and dynamic import graph from all 78 routes, and names \`pages/CommandDeck.tsx\` as the route
at the cap: the shared 2-D context behind the deck, plus \`DeckReliefGl\`, plus \`SurfaceReliefGl\`, the last two
independent opt-ins with no coordination between them. Counting real contexts in a real browser answers a
question the import graph can only bound, and this is the one place the two can be compared.

| surface | route | contexts created | not lost | canvas in the document | offscreen | created by this toggle | \`getContext\` calls | not lost after the toggle goes OFF |
|---|---|---|---|---|---|---|---|---|
${rows.filter((r) => r.reach === 'DRAWN').map((r) => {
  const rel = r.axes.release;
  return `| **${r.id}** | \`${r.route}\` | ${t(r.contextsCreated)} | ${t(r.contextsNotLost)} | ${t(r.contextsInDocument)} | ${t(r.contextsOffscreen)} | ${t(r.contextsByToggle)} | ${t(r.getContextCalls)} | ${rel?.reached ? `${rel.notLostWithReliefOn} → **${rel.notLostAfterToggleOff}**` : 'n/a — no toggle'} |`;
}).join('\n')}

${worstRoutes.length === 0 ? '' : `Every row above engages ONE toggle, so every row above is a LOWER BOUND for
its route. The pin of 3 is a route with both of its independent opt-ins on together, which is a different
configuration — so that configuration is loaded as well:

| route | opt-ins engaged together | contexts created | not lost | in the document | offscreen |
|---|---|---|---|---|---|
${worstRoutes.map((w) => `| \`${w.route}\` | ${w.engaged.join(' + ')} | ${w.created} | **${w.notLost}** | ${w.inDocument} | ${w.offscreen} |`).join('\n')}

${(() => {
  const worst = worstRoutes.reduce((a, b) => (b.notLost > a.notLost ? b : a));
  return `Measured worst case on this sweep: **${worst.notLost} contexts** on \`${worst.route}\` with `
    + `${worst.engaged.join(' + ')} on at once, against the static pin of 3 and a browser cap of 8-16. The `
    + 'static census and the browser agree, which is worth recording as a negative result: the import graph '
    + 'was not over- or under-counting.';
})()}
`}
The offscreen column is the shared 2-D renderer: its canvas is never in the document, which is how it is told
apart from a relief's own without naming either. \`glContextBudget.test.ts\` counts the same split — owners plus
the shared context — so the two numbers are comparable rather than merely both being three.

**A context is counted once, however many times it is asked for**, which the \`getContext\` column makes visible.
\`getContext('webgl2')\` returns the SAME object every time it is called on a given canvas
(\`packages/gl/src/stage.ts:336\`), and every relief here rebuilds IN PLACE when its size step or its tier
changes — so counting calls reported two contexts for one toggle on one canvas, contradicting the canvas count
in the reach table above. That would have read as a leak. Calls above contexts are rebuilds, not leaks.

**The last column is the measurement \`3D_VFX_FINAL_PLAN.md\` §10.4 asked for.** It recorded, as newly-found and
unmeasured, that \`stage.dispose()\` never called \`WEBGL_lose_context.loseContext()\` — so toggling a relief off
and on could hold more contexts than there are mounted components, against a cap where exceeding it kills the
OLDEST, which on a chart route is the shared one every chart draws through. \`stage.ts:322-360\` now loses the
context, gated on the canvas being detached, and this column is that fix observed rather than read: the relief is
switched back off and the census retaken.${(() => {
  const rel = rows.filter((r) => r.axes.release?.reached);
  if (rel.length === 0) return ' On this run no toggled surface could be measured, so nothing is established.';
  const clean = rel.filter((r) => r.axes.release.notLostAfterToggleOff
    < r.axes.release.notLostWithReliefOn);
  return clean.length === rel.length
    ? ` On this run every one of the ${rel.length} toggled surfaces released a context on the way out.`
    : ` On this run ${rel.length - clean.length} of ${rel.length} toggled surfaces released nothing — see the findings.`;
})()}

## What this sweep does NOT establish

- **Sign-in.** The session is seeded. The email-plus-passcode gate is verified server-side and needs a
  database, so it is out of scope here and belongs in an integration test with a real API.
- **Real-hardware anything.** SwiftShader only.
- **That the printed image is the right image.** Axis 2 establishes that a canvas reaches the PDF, not that it
  is legible on paper at print resolution.
- **§7(b), the operator timing.** Unmeasured on every environment, harness or app.
${failing.length === 0 ? '' : `
## Findings — open, not explained away

None of these has been diagnosed and no threshold was loosened to make this section empty. The components are
owned elsewhere; this file reports.

${failing.map((r) => `**${r.id} ${r.name}** — \`${r.file}\`, on \`${r.route}\`\n${r.problems.map((p) => `- ${p}`).join('\n')}`).join('\n\n')}
`}
## Reproduce

\`\`\`bash
node scripts/3d-audit-app.mjs          # APP_AUDIT_PORT=5188 by default
\`\`\`

It starts its own dev server on that port and stops it again. \`--strictPort\` is deliberate: a sweep that
silently moved to another port could be measuring a server it did not configure.
`);

console.log(`\n  wrote ${OUT.replace(`${ROOT}/`, '')} — ${reached.length}/${rows.length} surfaces reached, `
  + `${failing.length} with findings`);
process.exit(failing.length > 0 ? 1 : 0);
