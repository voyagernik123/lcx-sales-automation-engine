import { createBrowserRouter, Outlet, useLocation } from 'react-router-dom';
import { lazy, useEffect } from 'react';
import { AppLayout } from '@/components/layout';
import { SelectOperator } from '@/pages/SelectOperator';
import { ToastContainer, useToastStore } from '@/components/shared/Toast';
import { useOperatorStore } from '@/stores';
import { isTerminal } from '@/lib/container';
import { verifyPersistedIdentity } from '@/lib/apiClient';

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
const Decisions = lazy(() => import('@/pages/Decisions').then((m) => ({ default: m.Decisions })));
const CommandDeck = lazy(() => import('@/pages/CommandDeck').then((m) => ({ default: m.CommandDeck })));
const CommandPartners = lazy(() => import('@/pages/CommandPartners').then((m) => ({ default: m.CommandPartners })));
const CommandOps = lazy(() => import('@/pages/CommandOps').then((m) => ({ default: m.CommandOps })));
const CheatCard = lazy(() => import('@/pages/CheatCard').then((m) => ({ default: m.CheatCard })));

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
          { path: 'access', element: <AccessControl /> },
          { path: 'distribution', element: <DistributionCockpit /> },
          { path: 'distribution/atlas', element: <DistributionHome /> },
          { path: 'distribution/listings', element: <DistributionListings /> },
          { path: 'distribution/campaigns', element: <DistributionCampaigns /> },
          { path: 'distribution/geo', element: <DistributionGeo /> },
          { path: 'decisions', element: <Decisions /> },
          { path: 'command-deck', element: <CommandDeck /> },
          { path: 'command-partners', element: <CommandPartners /> },
          { path: 'command-ops', element: <CommandOps /> },
          { path: 'cheat-card', element: <CheatCard /> },
        ],
      },
    ],
  },
]);
