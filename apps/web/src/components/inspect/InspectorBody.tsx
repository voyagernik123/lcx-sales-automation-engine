import { lazy, Suspense } from 'react';
import type React from 'react';
import { ArrowLeft } from 'lucide-react';
import { CardSkeleton } from '@/components/shared';
import { useInspectorStore, type InspectorEntityType } from '@/stores/useInspectorStore';
import { INSPECTOR_TO_OBJECT, OBJECT_TYPES } from '@/lib/objectRegistry';
import { ProjectInspector } from './payloads/ProjectInspector';
import { DealInspector } from './payloads/DealInspector';
import { HandoffInspector } from './payloads/HandoffInspector';
import { ContactInspector } from './payloads/ContactInspector';
import { ClaimInspector } from './payloads/ClaimInspector';
import {
  DecisionInspector,
  DocumentInspector,
  JurisdictionInspector,
  ListingInspector,
  SignalInspector,
  TaskInspector,
} from './payloads/ExtendedInspectors';
/*
 * S5 · THE JOIN'S PAYLOADS ARE LAZY, AND THE BUDGET IS WHY. The eleven payloads above are static because
 * they were already eager in the shell (see the note above). The seven gps/marketing payloads are NOT: each
 * pulls its compartment's API client (gps.ts, gpsOrigination.ts, marketing.ts with its honesty ceiling) and
 * a static import put +34 KB into the entry chunk — initial JS 820 → 854 of 850, largest chunk 417 → 452 of
 * 440, caught by the perf-budget gate. A payload is opened by a click; its client loads with it.
 */
const pick = <K extends string>(load: () => Promise<Record<K, React.ComponentType<{ id: string; seed?: Record<string, unknown> }>>>, key: K) =>
  lazy(() => load().then((m) => ({ default: m[key] })));
const gps = () => import('./payloads/GpsInspectors');
const marketing = () => import('./payloads/MarketingInspectors');
const EngagementInspector = pick(gps, 'EngagementInspector');
const ClientInspector = pick(gps, 'ClientInspector');
const TargetInspector = pick(gps, 'TargetInspector');
const PartnerInspector = pick(gps, 'PartnerInspector');
const DraftInspector = pick(gps, 'DraftInspector');
const HoldingInspector = pick(marketing, 'HoldingInspector');
const AssetInspector = pick(marketing, 'AssetInspector');
const Lazy = ({ children }: { children: React.ReactNode }) => <Suspense fallback={<CardSkeleton count={2} />}>{children}</Suspense>;
import { RelatedPanel } from './RelatedPanel';

/**
 * What the inspector SHOWS, separated from where it is shown (T1 #12).
 *
 * `⌘\` gives the universal inspector a second container — docked beside the surface
 * instead of over it — and the one thing that must not happen is the two containers
 * drifting into two slightly different inspectors. The payload switch, the pivot trail
 * and the universal `RelatedPanel` are the inspector; `InspectorHost` and `EvidencePane`
 * are only chrome around this. Extracted rather than duplicated for that reason alone: a
 * copy would be the eleventh place a new entity type has to be registered, and the tenth
 * one somebody forgets.
 *
 * It costs the bundle nothing. Every payload below was already a static import in
 * `InspectorHost`, which `AppLayout` imports eagerly, so these lines moved between two
 * modules of the same chunk.
 */
/**
 * The heading both containers use. A pure function of the stack rather than a hook, so
 * each container computes it from the subscription it already has — two subscriptions to
 * the same store, one of which is not rendering, is how a title goes stale.
 */
export function inspectorTitle(stack: readonly { type: InspectorEntityType }[]): string {
  const top = stack[stack.length - 1];
  return top ? OBJECT_TYPES[INSPECTOR_TO_OBJECT[top.type]].label.toUpperCase() : '';
}

export function InspectorBody() {
  const stack = useInspectorStore((s) => s.stack);
  const back = useInspectorStore((s) => s.back);
  const jumpTo = useInspectorStore((s) => s.jumpTo);
  const top = stack[stack.length - 1];

  if (!top) return null;

  const body = (() => {
    switch (top.type) {
      case 'project':
        return <ProjectInspector id={top.id} seed={top.seed} />;
      case 'deal':
        return <DealInspector id={top.id} seed={top.seed} />;
      case 'handoff':
        return <HandoffInspector id={top.id} seed={top.seed} />;
      case 'contact':
        return <ContactInspector id={top.id} seed={top.seed} />;
      case 'claim':
        return <ClaimInspector id={top.id} seed={top.seed} />;
      case 'task':
        return <TaskInspector id={top.id} seed={top.seed} />;
      case 'signal':
        return <SignalInspector id={top.id} seed={top.seed} />;
      case 'listing':
        return <ListingInspector id={top.id} seed={top.seed} />;
      case 'decision':
        return <DecisionInspector id={top.id} seed={top.seed} />;
      case 'jurisdiction':
        return <JurisdictionInspector id={top.id} seed={top.seed} />;
      case 'document':
        return <DocumentInspector id={top.id} seed={top.seed} />;
      /* S5 · the join — gps and marketing objects, so no chip on the platform dead-ends. */
      case 'engagement':
        return <Lazy><EngagementInspector id={top.id} seed={top.seed} /></Lazy>;
      case 'client':
        return <Lazy><ClientInspector id={top.id} seed={top.seed} /></Lazy>;
      case 'target':
        return <Lazy><TargetInspector id={top.id} seed={top.seed} /></Lazy>;
      case 'partner':
        return <Lazy><PartnerInspector id={top.id} seed={top.seed} /></Lazy>;
      case 'draft':
        return <Lazy><DraftInspector id={top.id} seed={top.seed} /></Lazy>;
      case 'holding':
        return <Lazy><HoldingInspector id={top.id} seed={top.seed} /></Lazy>;
      case 'asset':
        return <Lazy><AssetInspector id={top.id} seed={top.seed} /></Lazy>;
    }
  })();

  return (
    <>
      {stack.length > 1 && (
        <nav
          aria-label="Inspector trail"
          className="mb-3 flex flex-wrap items-center gap-1 text-micro font-bold uppercase tracking-wider text-grey"
        >
          <button
            onClick={back}
            className="mr-1 flex items-center transition-colors hover:text-navy"
            aria-label="Back"
          >
            <ArrowLeft size={12} />
          </button>
          {stack.map((t, i) => {
            const label = OBJECT_TYPES[INSPECTOR_TO_OBJECT[t.type]].label;
            const isLast = i === stack.length - 1;
            return (
              <span key={`${t.type}:${t.id}:${i}`} className="flex items-center gap-1">
                {i > 0 && <span className="text-grey/50">/</span>}
                {isLast ? (
                  <span className="text-navy">{label}</span>
                ) : (
                  <button onClick={() => jumpTo(i)} className="transition-colors hover:text-navy">
                    {label}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
      )}
      {body}
      {/* Universal search-around — the complete linked neighborhood, on every object. */}
      <RelatedPanel
        type={top.type}
        id={top.id}
        label={(top.seed?.name as string) || (top.seed?.title as string) || undefined}
      />
    </>
  );
}
