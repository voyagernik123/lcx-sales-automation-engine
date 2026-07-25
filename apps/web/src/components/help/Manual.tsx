import { useMemo, useRef, useSyncExternalStore } from 'react';
import { BookOpen, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useDismissible } from '@/hooks/useDismissible';
import { isTerminal } from '@/lib/container';
import { MANUAL_LABEL, manualFor, type ManualEntry, type ManualSection } from '@/lib/manual';
import { dismissStack, subscribeDismiss } from '@/lib/dismiss';
import { useInspectorStore } from '@/stores';
import { useAccessStore } from '@/stores/useAccessStore';
import { useOperatorStore } from '@/stores';
import { ACTION_MANIFEST } from '@/lib/command/generated/actionManifest';
import type { Noun, Principal } from '@/components/command/grammar';

/**
 * `?` — the manual for wherever you are standing (TERMINAL Phase 6).
 *
 * Two decisions in here that are the opposite of what a help overlay usually does.
 *
 * `?` WORKS INSIDE A DIALOG. Every other global key in this app goes quiet while an
 * overlay owns the keyboard (see `isOverlayOpen`), and that is right for navigation —
 * typing `g` inside a dialog must not navigate the page out from under it. It is
 * wrong for `?`: an unfamiliar dialog with a gate in it is the single place an
 * operator most needs to ask "what can I do here, and why won't it let me?". So the
 * only guard is `isTypingTarget`, and the manual itself goes on the dismiss stack, so
 * Escape closes the manual first and the dialog second. The ladder stays honest.
 *
 * IT COSTS THE INITIAL BUNDLE NOTHING. The manifest is a committed static import —
 * 22 actions with their descriptions and schemas — so this component is loaded lazily
 * from AppLayout, exactly like the command line body. A manual that made the app
 * slower for the operators who never press `?` (most of them, most days) would be
 * paying for the wrong thing.
 */
export function Manual({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  // The manual was the surface the audit MEASURED escaping — one Shift+Tab from it
  // reached buttons on the page behind. The ref confines Tab to it.
  useDismissible(open, onClose, MANUAL_LABEL, panelRef);

  const operator = useOperatorStore((s) => s.operator);
  const me = useAccessStore((s) => s.me);
  const inspectorStack = useInspectorStore((s) => s.stack);

  // The Escape section is read from the LIVE stack, so the manual has to re-render when
  // it changes. Without this the section was a stale snapshot from the moment the manual
  // opened: press ⌘K with the manual up and it went on saying "nothing else is open".
  const stack = useSyncExternalStore(subscribeDismiss, dismissStack);

  const sections = useMemo<ManualSection[]>(() => {
    if (!open) return [];
    const top = inspectorStack[inspectorStack.length - 1];
    const noun: Noun | null = top
      ? {
          type: top.type,
          id: top.id,
          // `seed` is an untyped context bag, so the label is best-effort. Falling
          // back to the object TYPE rather than to the id: "Deal" is a heading an
          // operator recognises, a uuid is not.
          label: typeof top.seed?.label === 'string' ? top.seed.label : top.type,
          state: top.seed,
        }
      : null;
    const principal: Principal | null =
      operator && me ? { role: operator.role === 'approver' ? 'approver' : 'operator', entitlements: me.entitlements } : null;
    return manualFor({ stack, manifest: ACTION_MANIFEST, principal, noun, isTerminal: isTerminal() });
    // `stack` is both passed in AND a dependency, so ESLint can see the relationship and
    // the Escape section recomputes whenever a layer opens or closes underneath the
    // manual — the whole point of it being a report rather than a description.
  }, [open, operator, me, inspectorStack, stack]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 pt-[8vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Manual"
        className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-lg border border-line bg-card shadow-overlay"
      >
        <div className="sticky top-0 flex items-center gap-2 border-b border-line bg-card px-4 py-3">
          <BookOpen size={15} className="text-cyan-600 dark:text-cyan-400" />
          <h2 className="text-label font-bold text-navy">What you can do here</h2>
          <span className="ml-auto font-mono text-micro text-grey">? closes</span>
          <button onClick={onClose} aria-label="Close manual" className="focus-ring rounded p-1 text-grey hover:text-navy">
            <X size={14} />
          </button>
        </div>

        <div className="divide-y divide-line">
          {sections.map((section) => (
            <Section key={section.title} section={section} />
          ))}
        </div>

        <p className="border-t border-line px-4 py-3 text-micro leading-relaxed text-grey">
          Every line here is generated from the action registry, the destinations table and the live dismiss stack — the
          same sources the command line and the native menu read. It cannot describe a shortcut this build does not have.
        </p>
      </div>
    </div>
  );
}

function Section({ section }: { section: ManualSection }) {
  return (
    <section className="px-4 py-3">
      <h3 className="text-micro font-bold uppercase tracking-wider text-grey">{section.title}</h3>
      {section.entries.length === 0 ? (
        // Saying why a section is empty, rather than hiding it. A missing section
        // reads as a missing feature; an explained one answers the question.
        <p className="mt-1.5 text-body leading-relaxed text-grey">{section.emptyNote}</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {section.entries.map((entry, i) => (
            <Entry key={`${entry.what}-${i}`} entry={entry} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Entry({ entry }: { entry: ManualEntry }) {
  return (
    <li className="flex items-baseline gap-2.5">
      <span className="flex shrink-0 items-center gap-1">
        {entry.keys.map((k) => (
          <kbd
            key={k}
            className={clsx(
              'rounded border border-line px-1.5 font-mono text-micro leading-5',
              entry.blocked ? 'text-grey' : 'text-navy',
            )}
          >
            {k}
          </kbd>
        ))}
      </span>
      <span className="min-w-0">
        <span className={clsx('text-body', entry.blocked ? 'text-grey' : 'text-navy')}>{entry.what}</span>
        {entry.note && (
          <span className={clsx('ml-1.5 text-label', entry.blocked ? 'text-amber-600 dark:text-amber-500' : 'text-grey')}>
            {entry.note}
          </span>
        )}
      </span>
    </li>
  );
}
