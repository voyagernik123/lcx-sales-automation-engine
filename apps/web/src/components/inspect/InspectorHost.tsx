import { InspectorDrawer } from '@/components/ui/InspectorDrawer';
import { useInspectorStore } from '@/stores/useInspectorStore';
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
import { ArrowLeft } from 'lucide-react';
import { RelatedPanel } from './RelatedPanel';

/**
 * Mounted once in AppLayout. Renders whatever entity the inspector stack
 * points at, inside the same InspectorDrawer chrome the regulatory toolkit
 * uses — so both halves of the app share one drill-down feel.
 */
export function InspectorHost() {
  const stack = useInspectorStore(s => s.stack);
  const back = useInspectorStore(s => s.back);
  const jumpTo = useInspectorStore(s => s.jumpTo);
  const close = useInspectorStore(s => s.close);
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
    }
  })();

  const title = OBJECT_TYPES[INSPECTOR_TO_OBJECT[top.type]].label.toUpperCase();

  return (
    <InspectorDrawer
      isOpen
      onClose={close}
      // Esc walks the pivot trail back one step; only the last step closes.
      onEscape={stack.length > 1 ? back : close}
      title={title}
    >
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
    </InspectorDrawer>
  );
}
