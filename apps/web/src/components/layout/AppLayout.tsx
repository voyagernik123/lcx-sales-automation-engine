import { useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { TopNav } from './TopNav';
import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { Footer } from './Footer';
import { ErrorBoundary, ToastContainer, CommandPalette, useCommandPalette } from '@/components/shared';
import { InspectorHost } from '@/components/inspect/InspectorHost';
import { useUIStore, useOperatorStore } from '@/stores';

export function AppLayout() {
  const sidebarCollapsed = useUIStore(s => s.sidebarCollapsed);
  const darkMode = useUIStore(s => s.darkMode);
  const operator = useOperatorStore(s => s.operator);
  const { open, setOpen } = useCommandPalette();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  if (!operator) return <Navigate to="/select" replace />;

  return (
    <div className="flex h-screen flex-col bg-page text-navy">
      <TopNav />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <ErrorBoundary>
          <MainContent collapsed={sidebarCollapsed}>
            <Outlet />
          </MainContent>
        </ErrorBoundary>
      </div>
      <Footer />
      <ToastContainer />
      <InspectorHost />
      <CommandPalette open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
