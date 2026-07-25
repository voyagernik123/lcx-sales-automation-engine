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
      className={clsx('flex-1 overflow-auto p-4 transition-all duration-300', collapsed && 'ml-0')}
    >
      {children}
    </main>
  );
}
