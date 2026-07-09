import { clsx } from 'clsx';

export function MainContent({ collapsed, children }: { collapsed?: boolean; children: React.ReactNode }) {
  return (
    <main className={clsx('flex-1 overflow-auto p-4 transition-all duration-300', collapsed && 'ml-0')}>
      {children}
    </main>
  );
}
