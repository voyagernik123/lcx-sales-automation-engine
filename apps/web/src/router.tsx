import { createBrowserRouter, Outlet, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { AppLayout } from '@/components/layout';
import { SelectOperator } from '@/pages/SelectOperator';
import { ToastContainer, useToastStore } from '@/components/shared/Toast';
import { useOperatorStore } from '@/stores';
import { isTerminal } from '@/lib/container';
import { verifyPersistedIdentity } from '@/lib/apiClient';
import { prefersReducedMotion } from '@/lib/motion';

/**
 * Every workspace page is code-split (plan D2): only the shell + the front
 * door land in the entry chunk; each route's JS is fetched on first visit.
 * The Suspense boundary lives in AppLayout around the Outlet.
 */
const DistributionCockpit = lazy(() => import('@/pages/DistributionCockpit').then((m) => ({ default: m.DistributionCockpit })));
const DistributionListings = lazy(() => import('@/pages/DistributionListings').then((m) => ({ default: m.DistributionListings })));
const DistributionCampaigns = lazy(() => import('@/pages/DistributionCampaigns').then((m) => ({ default: m.DistributionCampaigns })));
const DistributionGeo = lazy(() => import('@/pages/DistributionGeo').then((m) => ({ default: m.DistributionGeo })));
const DistributionHome = lazy(() => import('@/pages/DistributionHome').then((m) => ({ default: m.DistributionHome })));
const Marketing = lazy(() => import('@/pages/Marketing').then((m) => ({ default: m.Marketing })));
/**
 * LCX MARKETING's three built surfaces, each its own lazy chunk.
 *
 * ALL THREE WERE UNROUTED. `MarketingDesk`, `MarketingRecord` and `MarketingCrisis` were
 * built (183KB of TSX between them) and reachable from nothing — `MarketingCrisis` alone
 * is 85KB of statement prose. The build emitted exactly one `Marketing-*.js` chunk, which
 * is how the omission was found: three pages that compile, have passing tests, and cannot
 * be opened.
 *
 * LAZY IS LOAD-BEARING, NOT A STYLE CHOICE. The initial bundle budget is 850KB and sat at
 * 826KB before this compartment existed — 24KB of headroom against 183KB of page. Eagerly
 * importing any one of them breaks `perf-budget`, and the answer to that is never to raise
 * the budget.
 */
const MarketingDesk = lazy(() => import('@/pages/MarketingDesk').then((m) => ({ default: m.MarketingDesk })));
const MarketingRecord = lazy(() => import('@/pages/MarketingRecord').then((m) => ({ default: m.MarketingRecord })));
const MarketingCrisis = lazy(() => import('@/pages/MarketingCrisis').then((m) => ({ default: m.MarketingCrisis })));
// The fourth: the staff holdings register (Art 91(3)(c)). Lazy for the reason above —
// the budget is 850KB and the initial bundle measures 828KB, so 22KB is the whole
// margin and this page is larger than that. A static import here is what would break
// `perf-budget`, and raising the budget is not the fix.
const MarketingHoldings = lazy(() => import('@/pages/MarketingHoldings').then((m) => ({ default: m.MarketingHoldings })));
const Gps = lazy(() => import('@/pages/Gps').then((m) => ({ default: m.Gps })));
// GPS Phases 6-12. Each is its own lazy chunk — six eagerly-imported desks would
// land in the initial bundle and the web perf budget has ~26KB of headroom, so a
// static import here is the thing that would break the build rather than a slow page.
const GpsBook = lazy(() => import('@/pages/GpsBook').then((m) => ({ default: m.GpsBook })));
const GpsUnderwriting = lazy(() => import('@/pages/GpsUnderwriting').then((m) => ({ default: m.GpsUnderwriting })));
const GpsOrigination = lazy(() => import('@/pages/GpsOrigination').then((m) => ({ default: m.GpsOrigination })));
const GpsConflict = lazy(() => import('@/pages/GpsConflict').then((m) => ({ default: m.GpsConflict })));
const GpsDelivery = lazy(() => import('@/pages/GpsDelivery').then((m) => ({ default: m.GpsDelivery })));
const GpsLoop = lazy(() => import('@/pages/GpsLoop').then((m) => ({ default: m.GpsLoop })));
// The input desk (price bands, effort triples, rate cards). Lazy on the same argument:
// it is the screen where the founder types the five numbers the whole underwriting
// stack is still waiting on, and it must not cost the initial bundle to ship.
const GpsInputs = lazy(() => import('@/pages/GpsInputs').then((m) => ({ default: m.GpsInputs })));
const GpsPartnerRegistry = lazy(() => import('@/pages/GpsPartnerRegistry').then((m) => ({ default: m.GpsPartnerRegistry })));
const ControlRegister = lazy(() => import('@/pages/ControlRegister').then((m) => ({ default: m.ControlRegister })));
const AccessControl = lazy(() => import('@/pages/AccessControl').then((m) => ({ default: m.AccessControl })));
const Dashboard = lazy(() => import('@/pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Home = lazy(() => import('@/pages/Home').then((m) => ({ default: m.Home })));
const OntologyExplorer = lazy(() => import('@/pages/OntologyExplorer').then((m) => ({ default: m.OntologyExplorer })));
const StateMap = lazy(() => import('@/pages/StateMap').then((m) => ({ default: m.StateMap })));
const ProductMatrix = lazy(() => import('@/pages/ProductMatrix').then((m) => ({ default: m.ProductMatrix })));
const Simulator = lazy(() => import('@/pages/Simulator').then((m) => ({ default: m.Simulator })));
const Settings = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.Settings })));
const HoweyCalculator = lazy(() => import('@/pages/HoweyCalculator').then((m) => ({ default: m.HoweyCalculator })));
const ScenarioPlanner = lazy(() => import('@/pages/ScenarioPlanner').then((m) => ({ default: m.ScenarioPlanner })));
const ReadinessStack = lazy(() => import('@/pages/ReadinessStack').then((m) => ({ default: m.ReadinessStack })));
const BriefGenerator = lazy(() => import('@/pages/BriefGenerator').then((m) => ({ default: m.BriefGenerator })));
const CapitalEstimator = lazy(() => import('@/pages/CapitalEstimator').then((m) => ({ default: m.CapitalEstimator })));
const Roadmap = lazy(() => import('@/pages/Roadmap').then((m) => ({ default: m.Roadmap })));
const RedFlags = lazy(() => import('@/pages/RedFlags').then((m) => ({ default: m.RedFlags })));
const CompetitionAnalysis = lazy(() => import('@/pages/CompetitionAnalysis').then((m) => ({ default: m.CompetitionAnalysis })));
const ProductIntelligence = lazy(() => import('@/pages/ProductIntelligence').then((m) => ({ default: m.ProductIntelligence })));
const BdPipeline = lazy(() => import('@/pages/BdPipeline').then((m) => ({ default: m.BdPipeline })));
const LeadDetail = lazy(() => import('@/pages/LeadDetail').then((m) => ({ default: m.LeadDetail })));
const ContactWorkspace = lazy(() => import('@/pages/ContactWorkspace').then((m) => ({ default: m.ContactWorkspace })));
const ClaimLibrary = lazy(() => import('@/pages/ClaimLibrary').then((m) => ({ default: m.ClaimLibrary })));
const Handoffs = lazy(() => import('@/pages/Handoffs').then((m) => ({ default: m.Handoffs })));
const SendQueue = lazy(() => import('@/pages/SendQueue').then((m) => ({ default: m.SendQueue })));
const ExchangeGaps = lazy(() => import('@/pages/ExchangeGaps').then((m) => ({ default: m.ExchangeGaps })));
const DealBoard = lazy(() => import('@/pages/DealBoard').then((m) => ({ default: m.DealBoard })));
const MyTasks = lazy(() => import('@/pages/MyTasks').then((m) => ({ default: m.MyTasks })));
const MarketMap = lazy(() => import('@/pages/MarketMap').then((m) => ({ default: m.MarketMap })));
const SalesGraph = lazy(() => import('@/pages/SalesGraph').then((m) => ({ default: m.SalesGraph })));
const Monitors = lazy(() => import('@/pages/Monitors').then((m) => ({ default: m.Monitors })));
const Targets = lazy(() => import('@/pages/Targets').then((m) => ({ default: m.Targets })));
const DailyBrief = lazy(() => import('@/pages/DailyBrief').then((m) => ({ default: m.DailyBrief })));
const Forecast = lazy(() => import('@/pages/Forecast').then((m) => ({ default: m.Forecast })));
const CommandCenter = lazy(() => import('@/pages/CommandCenter').then((m) => ({ default: m.CommandCenter })));
const Scorecard = lazy(() => import('@/pages/Scorecard').then((m) => ({ default: m.Scorecard })));
const CoverageReport = lazy(() => import('@/pages/CoverageReport').then((m) => ({ default: m.CoverageReport })));
const Customer360 = lazy(() => import('@/pages/Customer360').then((m) => ({ default: m.Customer360 })));
const Notes = lazy(() => import('@/pages/Notes').then((m) => ({ default: m.Notes })));
const WinLoss = lazy(() => import('@/pages/WinLoss').then((m) => ({ default: m.WinLoss })));
const AiTools = lazy(() => import('@/pages/AiTools').then((m) => ({ default: m.AiTools })));
const OutreachOps = lazy(() => import('@/pages/OutreachOps').then((m) => ({ default: m.OutreachOps })));
const DealDesk = lazy(() => import('@/pages/DealDesk').then((m) => ({ default: m.DealDesk })));
const Integrations = lazy(() => import('@/pages/Integrations').then((m) => ({ default: m.Integrations })));
const BoardReport = lazy(() => import('@/pages/BoardReport').then((m) => ({ default: m.BoardReport })));
const MarketNews = lazy(() => import('@/pages/MarketNews').then((m) => ({ default: m.MarketNews })));
const ReportBuilder = lazy(() => import('@/pages/ReportBuilder').then((m) => ({ default: m.ReportBuilder })));
const KpiDashboard = lazy(() => import('@/pages/KpiDashboard').then((m) => ({ default: m.KpiDashboard })));
const AuditLog = lazy(() => import('@/pages/AuditLog').then((m) => ({ default: m.AuditLog })));
const Ops = lazy(() => import('@/pages/Ops').then((m) => ({ default: m.Ops })));
const Wbr = lazy(() => import('@/pages/Wbr').then((m) => ({ default: m.Wbr })));
/*
 * LAZY IS NOT OPTIONAL HERE. `npm run perf-budget -w @lcx/web` measures the initial JS at
 * 835KB against an 850KB budget — fifteen kilobytes of headroom. An eager import of a new
 * page fails the build, which is the correct outcome and the reason this is a ratchet.
 */
const Readout = lazy(() => import('@/pages/Readout').then((m) => ({ default: m.Readout })));
const Decisions = lazy(() => import('@/pages/Decisions').then((m) => ({ default: m.Decisions })));
const CommandDeck = lazy(() => import('@/pages/CommandDeck').then((m) => ({ default: m.CommandDeck })));
const CommandPartners = lazy(() => import('@/pages/CommandPartners').then((m) => ({ default: m.CommandPartners })));
const CommandOps = lazy(() => import('@/pages/CommandOps').then((m) => ({ default: m.CommandOps })));
const CheatCard = lazy(() => import('@/pages/CheatCard').then((m) => ({ default: m.CheatCard })));
// The sandbox (Phase 8, T1 #20). Lazy like every other page, and it matters more
// here than most: this chunk is the only eager-bundle risk in the feature, since it
// is what pulls in the generated 22-action manifest.
const Launch = lazy(() => import('@/pages/Launch').then((m) => ({ default: m.Launch })));
const Portal = lazy(() => import('@/pages/Portal').then((m) => ({ default: m.Portal })));
const PracticeRange = lazy(() => import('@/pages/PracticeRange').then((m) => ({ default: m.PracticeRange })));

/**
 * The layer above the sign-in gate.
 *
 * It exists because of one structural fact: `/select` is a SIBLING of `AppLayout`,
 * not a child, so nothing inside `AppLayout` runs while the desk is signed out. The
 * self-updater lived in there. That meant the update check did not run at the front
 * door, and the native "Check for Updates…" menu item emitted an event no listener
 * had subscribed to — so a build that was broken AT the gate had no way to repair
 * itself at all, and the only road back was reinstalling the DMG by hand. Anything
 * that must work on a desk nobody can sign in to belongs here.
 *
 * What deliberately does NOT move up here: the navigation half of the terminal
 * bridge (⌘1-6, ⌘K, ⌘[ / ⌘]). Those are routes inside the signed-in shell and there
 * is nowhere to send them from the front door.
 */
function AboveTheGate() {
  const operator = useOperatorStore((s) => s.operator);
  const { pathname } = useLocation();

  // Identity, re-checked once per launch. See verifyPersistedIdentity for what this
  // can and cannot prove — in particular, it does not detect a different PERSON at a
  // shared desk, and pretending otherwise would be the more dangerous outcome.
  useEffect(() => {
    void verifyPersistedIdentity();
  }, []);

  useEffect(() => {
    if (!isTerminal()) return; // browser: never fetch the Tauri chunk at all
    let detach: (() => void) | undefined;
    void (async () => {
      const { attachUpdateBridge } = await import('@/lib/terminal');
      detach = await attachUpdateBridge((kind, message, action) =>
        // `addToast` directly rather than the `toast()` helper, which cannot carry an
        // action. Duration 0 for anything actionable: the store only sets a
        // dismissal timer when duration > 0, and an install decision that erases
        // itself after six seconds is a decision the operator will miss. The X
        // dismisses it.
        useToastStore
          .getState()
          .addToast(kind, message, action ? 0 : kind === 'warning' ? 9000 : 6000, action),
      );
    })();
    return () => detach?.();
  }, []);

  return (
    <>
      <Outlet />
      {/* The toast surface, but ONLY while the signed-in shell is not mounted.
        * `AppLayout` renders its own `ToastContainer`, and both subscribe to the same
        * store, so two mounted at once would draw every toast twice.
        *
        * The condition is "not signed in OR standing at the front door", and it needs
        * both halves. `!operator` alone was the first version and it left a third
        * state uncovered: `/select` WITH a persisted operator — which `SelectOperator`
        * does not redirect away from, and which is what the app shows for the render
        * between `setOperator` and the router committing `navigate('/')`, as well as
        * to anyone who simply opens `/select` while signed in. In that state
        * `AppLayout` is not mounted either, so there was NO container anywhere and an
        * updater notice raised at the gate — the whole reason the updater moved above
        * the gate — had nowhere to appear. `/select` is the only route outside
        * `AppLayout`, so the pathname test is exactly "the shell is not mounted". */}
      {(!operator || pathname === '/select') && <ToastContainer />}
    </>
  );
}

export const router = createBrowserRouter([
  {
    // A pathless layout route: it wraps both branches without owning a URL.
    element: <AboveTheGate />,
    children: [
      // The public face. A SIBLING of AppLayout, so it renders outside the
      // signed-in shell entirely — which is what makes "no action is reachable
      // from this page" structural rather than a promise.
      // Its OWN Suspense boundary. Every other lazy page sits under AppLayout,
      // whose Outlet is already wrapped; this route is a sibling of AppLayout, so
      // without this the lazy chunk suspends with no boundary above it and React
      // throws instead of rendering the page. `null` rather than a skeleton: this
      // is a static page behind a CDN, so the gap is a frame, and a flashing
      // skeleton would be more noticeable than the load it hides.
      { path: '/lcxos', element: <Suspense fallback={null}><Launch /></Suspense> },
      /* G4: the client portal — a public sibling like /lcxos, its own chunk, its own
       * country (D9). The magic-link token rides the URL HASH and the page strips it
       * on first read; nothing about this route touches the desk's auth or layout. */
      { path: '/portal', element: <Suspense fallback={null}><Portal /></Suspense> },
      { path: '/select', element: <SelectOperator /> },
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: <Home /> },
          { path: 'regulatory-dashboard', element: <Dashboard /> },
          { path: 'ontology', element: <OntologyExplorer /> },
          { path: 'states', element: <StateMap /> },
          { path: 'products', element: <ProductMatrix /> },
          { path: 'simulator', element: <Simulator /> },
          { path: 'howey', element: <HoweyCalculator /> },
          { path: 'scenario', element: <ScenarioPlanner /> },
          { path: 'readiness', element: <ReadinessStack /> },
          { path: 'brief-generator', element: <BriefGenerator /> },
          { path: 'capital-estimator', element: <CapitalEstimator /> },
          { path: 'roadmap', element: <Roadmap /> },
          { path: 'red-flags', element: <RedFlags /> },
          { path: 'settings', element: <Settings /> },
          { path: 'competition', element: <CompetitionAnalysis /> },
          { path: 'product-intel', element: <ProductIntelligence /> },
          { path: 'bd-pipeline', element: <BdPipeline /> },
          { path: 'bd-pipeline/:id', element: <LeadDetail /> },
          { path: 'contacts/:id', element: <ContactWorkspace /> },
          { path: 'claim-library', element: <ClaimLibrary /> },
          { path: 'outreach', element: <Handoffs /> },
          { path: 'send-queue', element: <SendQueue /> },
          { path: 'exchange-gaps', element: <ExchangeGaps /> },
          { path: 'deal-board', element: <DealBoard /> },
          { path: 'tasks', element: <MyTasks /> },
          { path: 'market-map', element: <MarketMap /> },
          { path: 'graph', element: <SalesGraph /> },
          { path: 'monitors', element: <Monitors /> },
          { path: 'targets', element: <Targets /> },
          { path: 'brief', element: <DailyBrief /> },
          { path: 'forecast', element: <Forecast /> },
          { path: 'command', element: <CommandCenter /> },
          { path: 'scorecard', element: <Scorecard /> },
          { path: 'coverage/:id', element: <CoverageReport /> },
          { path: 'customer/:id', element: <Customer360 /> },
          { path: 'notes', element: <Notes /> },
          { path: 'notes/:projectId', element: <Notes /> },
          { path: 'win-loss', element: <WinLoss /> },
          { path: 'ai-tools', element: <AiTools /> },
          { path: 'outreach-ops', element: <OutreachOps /> },
          { path: 'deal-desk', element: <DealDesk /> },
          { path: 'integrations', element: <Integrations /> },
          { path: 'board-report', element: <BoardReport /> },
          { path: 'market-news', element: <MarketNews /> },
          { path: 'report-builder', element: <ReportBuilder /> },
          { path: 'bd-kpis', element: <KpiDashboard /> },
          { path: 'audit-log', element: <AuditLog /> },
          { path: 'ops', element: <Ops /> },
          { path: 'wbr', element: <Wbr /> },
          { path: 'readout', element: <Readout /> },
          { path: 'access', element: <AccessControl /> },
          { path: 'distribution', element: <DistributionCockpit /> },
          { path: 'distribution/atlas', element: <DistributionHome /> },
          { path: 'distribution/listings', element: <DistributionListings /> },
          { path: 'distribution/campaigns', element: <DistributionCampaigns /> },
          { path: 'distribution/geo', element: <DistributionGeo /> },
          { path: 'marketing', element: <Marketing /> },
          // The three surfaces above. `workspaceForPath` classifies by prefix, so all
          // four belong to `marketing` from the `webPaths: ['marketing']` declaration
          // alone — none of them needed a second registry entry. The SERVER gate is what
          // enforces the compartment: an unentitled operator reaching one of these paths
          // gets a page whose every fetch 403s, not a hidden route.
          { path: 'marketing/desk', element: <MarketingDesk /> },
          { path: 'marketing/record', element: <MarketingRecord /> },
          { path: 'marketing/crisis', element: <MarketingCrisis /> },
          // `marketing/holdings` — the fourth surface. It needs no registry entry either:
          // `webPaths: ['marketing']` classifies by prefix, and the SERVER gate is what
          // enforces the compartment. Every fetch on this page 403s for an unentitled
          // operator; `/holdings/register` additionally answers only to an approver, which
          // the route enforces and this table cannot.
          { path: 'marketing/holdings', element: <MarketingHoldings /> },
          // GLOBAL SERVICES (GPS). The desk at /gps, plus one route per Phase 6-12
          // surface. The server gate is what enforces the compartment — an
          // unentitled operator reaching any of these paths gets a page whose every
          // fetch 403s, not a hidden route. `workspaceForPath` classifies by prefix,
          // so all seven belong to `gps` from the `webPaths: ['gps']` declaration
          // alone and none of them needed a second entry in the registry.
          { path: 'gps', element: <Gps /> },
          { path: 'gps/book', element: <GpsBook /> },
          { path: 'gps/underwriting', element: <GpsUnderwriting /> },
          { path: 'gps/origination', element: <GpsOrigination /> },
          { path: 'gps/conflict', element: <GpsConflict /> },
          { path: 'gps/delivery', element: <GpsDelivery /> },
          { path: 'gps/loop', element: <GpsLoop /> },
          // The input desk. Same prefix classification as the seven above, so no second
          // registry entry — and the writes behind it demand 'operate', which this table
          // does not and cannot express: `app.ts:requiresOperate` does.
          { path: 'gps/inputs', element: <GpsInputs /> },
          { path: 'gps/partner-registry', element: <GpsPartnerRegistry /> },
          /*
           * THE CONTROL REGISTER HAS NEVER BEEN REACHABLE. The page shipped in P3 and no
           * router entry was ever added, so `verifyAuditSeal` — the seal's own evidence —
           * had no surface at all. Same failure as the readout's four unreachable files.
           */
          { path: 'governance/controls', element: <ControlRegister /> },
          { path: 'decisions', element: <Decisions /> },
          { path: 'command-deck', element: <CommandDeck /> },
          { path: 'command-partners', element: <CommandPartners /> },
          { path: 'command-ops', element: <CommandOps /> },
          { path: 'cheat-card', element: <CheatCard /> },
          { path: 'practice', element: <PracticeRange /> },
        ],
      },
    ],
  },
]);

/*
 * ══════════════════════════════════════════════════════════════════════════════
 *  ONE CAMERA — S3 of INSTRUMENT_100X_PLAN.md: every navigation is a view transition
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * S0 measured 0 of 79 route commits attempting a view transition — every navigation in the
 * app was a hard cut. THE SOLID (`DIMENSIONAL_100X_PLAN.md`) wanted one camera and proposed
 * building it as a raymarched shell; the browser ships it as a primitive, and react-router
 * 6.30 carries a `viewTransition` option from every <Link> and every navigate() into this
 * data router, where RouterProvider itself performs `document.startViewTransition` around
 * the state update with the commit timing already correct (react-router-dom/dist/index.js,
 * the `viewTransitionOpts` branch). So the whole camera is ONE default, set here.
 *
 * WHY A WRAP AND NOT 80 PROPS. `useNavigate()` and <Link> read `router.navigate` at call time
 * through the data-router context, so defaulting the option on the instance covers every
 * caller in the app — pages that never heard of continuity get it, and a caller that
 * deliberately passes `viewTransition: false` still wins (its options are spread last).
 *
 * REDUCED MOTION, TWICE. The option is read from `prefersReducedMotion()` at CALL time (never
 * cached — the OS setting is live), so an operator who has asked for less motion never even
 * starts a transition; and `globals.css` switches the transition pseudo-elements off under the
 * same media query, so a caller that forces the option on still cuts for them. Two layers,
 * because a courtesy that depends on every caller remembering it is not a courtesy.
 *
 * MEASURED BEFORE WIRED: on the shipping WebKit (the desktop probe, same framework binary as
 * the app) `startViewTransition` is present and `finished` resolves in 87 ms; a hidden document
 * takes the skip path cleanly — which is exactly the fallback the reduced-motion layer relies on.
 *
 * `history.go(n)` — a numeric `to` — takes no options and is passed through untouched.
 *
 * THE DEFAULT APPLIES ONLY WHEN THE CALLER SAID NOTHING, and the first version got this wrong in
 * a way the instrument caught: <Link> forwards its `viewTransition` prop even when it is undefined,
 * so `{ viewTransition: true, ...opts }` was clobbered by an explicit `undefined` on every click
 * and the probe measured zero transitions after a real navigation. `??` on the caller's value is
 * the whole fix: undefined and null take the default; an explicit false still wins.
 */
{
  const nav = router.navigate.bind(router);
  router.navigate = ((to: Parameters<typeof nav>[0], opts?: Parameters<typeof nav>[1]) => {
    if (typeof to === 'number') return nav(to);
    return nav(to, { ...(opts ?? {}), viewTransition: opts?.viewTransition ?? !prefersReducedMotion() });
  }) as typeof router.navigate;
}
