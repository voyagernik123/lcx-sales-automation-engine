import { InspectorDrawer } from '@/components/ui/InspectorDrawer';
import { useInspectorStore } from '@/stores/useInspectorStore';
import { ProjectInspector } from './payloads/ProjectInspector';
import { DealInspector } from './payloads/DealInspector';
import { HandoffInspector } from './payloads/HandoffInspector';
import { ContactInspector } from './payloads/ContactInspector';
import { ClaimInspector } from './payloads/ClaimInspector';
import { ArrowLeft } from 'lucide-react';

/**
 * Mounted once in AppLayout. Renders whatever entity the inspector stack
 * points at, inside the same InspectorDrawer chrome the regulatory toolkit
 * uses — so both halves of the app share one drill-down feel.
 */
export function InspectorHost() {
  const stack = useInspectorStore(s => s.stack);
  const back = useInspectorStore(s => s.back);
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
    }
  })();

  return (
    <InspectorDrawer isOpen onClose={close} title={top.type.toUpperCase()}>
      {stack.length > 1 && (
        <button
          onClick={back}
          className="mb-3 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey hover:text-navy transition-colors"
        >
          <ArrowLeft size={12} /> Back
        </button>
      )}
      {body}
    </InspectorDrawer>
  );
}
