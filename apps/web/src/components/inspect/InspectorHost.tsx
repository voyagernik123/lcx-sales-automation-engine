import { InspectorDrawer } from '@/components/ui/InspectorDrawer';
import { useInspectorStore } from '@/stores/useInspectorStore';
import { useUIStore } from '@/stores';
import { useEvidenceDock } from '@/hooks/useSplitView';
import { InspectorBody, inspectorTitle } from './InspectorBody';

/**
 * Mounted once in AppLayout. Renders whatever entity the inspector stack
 * points at, inside the same InspectorDrawer chrome the regulatory toolkit
 * uses — so both halves of the app share one drill-down feel.
 *
 * `docked` is `⌘\` (T1 #12): the SAME inspector, shown in `EvidencePane` beside the
 * surface instead of over it. The two containers are mutually exclusive by construction —
 * this returns null when docked, and `AppLayout` renders the pane only when docked — so
 * one target can never be on screen twice, once modal and once not. What they render is
 * `InspectorBody`, extracted for exactly that reason.
 *
 * The drawer also carries the DOCK button, and only this host passes it: `⌘\` moves the
 * universal inspector, so the six surfaces that render `InspectorDrawer` with their own local
 * content must not offer it. Without the button, docking was reachable by the chord alone —
 * keyboard-ONLY, which this programme's constraint forbids.
 */
export function InspectorHost({ docked }: { docked: boolean }) {
  const stack = useInspectorStore(s => s.stack);
  const back = useInspectorStore(s => s.back);
  const close = useInspectorStore(s => s.close);
  const setEvidenceDocked = useUIStore(s => s.setEvidenceDocked);
  // The button is offered on exactly the widths where the chord works, from the same
  // predicate — a control that docks nothing is worse than no control.
  const { canDock } = useEvidenceDock();
  const top = stack[stack.length - 1];

  if (!top || docked) return null;

  return (
    <InspectorDrawer
      isOpen
      onClose={close}
      // Esc walks the pivot trail back one step; only the last step closes.
      onEscape={stack.length > 1 ? back : close}
      title={inspectorTitle(stack)}
      onDock={canDock ? () => setEvidenceDocked(true) : undefined}
    >
      <InspectorBody />
    </InspectorDrawer>
  );
}
