import { GLASS_PLATE_CLASS } from '@/lib/glass';
import { clsx } from 'clsx';

export function MainContent({ collapsed, children }: { collapsed?: boolean; children: React.ReactNode }) {
  return (
    <main
      id="main-content"
      /* `tabIndex={-1}` is what makes the skip link in AppLayout actually MOVE
       * focus rather than only scroll. A bare `href="#main-content"` pointing at
       * a non-focusable element scrolls the target into view and leaves focus on
       * the link, so the next Tab returns to the top bar — the skip link appears
       * to do nothing, which is the classic way this feature ships broken. */
      tabIndex={-1}
      /* THE PLATE (THE PRODUCTION, P1). The stage fits a lit slab to this element's rect and the page stands on it,
       * so it gets a bezel (the margin is where the floor and the slab's shadow show), a rounded edge, and glass —
       * `GLASS_PLATE_CLASS` is the one place that alpha lives, proven by glass.test.ts. */
      data-stage-plate=""
      className={clsx('flex-1 overflow-auto p-4 t-panel m-4 rounded-2xl border border-line/60', GLASS_PLATE_CLASS, collapsed && 'ml-0')}
    >
      {children}
    </main>
  );
}
