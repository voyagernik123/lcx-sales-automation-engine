import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@/components/layout';
import { Dashboard, OntologyExplorer, StateMap, ProductMatrix, Simulator, Settings, HoweyCalculator, ScenarioPlanner, ReadinessStack, BriefGenerator, CapitalEstimator, Roadmap, RedFlags, CompetitionAnalysis, ProductIntelligence, BdPipeline, LeadDetail, ClaimLibrary, Handoffs, SendQueue, ExchangeGaps, DealBoard, MyTasks, KpiDashboard, AuditLog } from '@/pages';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Dashboard /> },
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
      { path: 'claim-library', element: <ClaimLibrary /> },
      { path: 'outreach', element: <Handoffs /> },
      { path: 'send-queue', element: <SendQueue /> },
      { path: 'exchange-gaps', element: <ExchangeGaps /> },
      { path: 'deal-board', element: <DealBoard /> },
      { path: 'tasks', element: <MyTasks /> },
      { path: 'bd-kpis', element: <KpiDashboard /> },
      { path: 'audit-log', element: <AuditLog /> },
    ],
  },
]);
