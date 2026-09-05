import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar, { useSidebarCollapsed } from './Sidebar';
import Header from './Header';
import FloatingChatbot from '../ui/FloatingChatbot';

export default function Layout() {
  const location = useLocation();
  const mainRef = useRef<HTMLDivElement>(null);
  const { collapsed, toggle } = useSidebarCollapsed();

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo(0, 0);
    }
  }, [location.pathname]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div
        className="flex-1 flex flex-col overflow-hidden transition-all duration-200"
        style={{ marginLeft: collapsed ? 56 : 208 }}
      >
        <Header />
        <main
          ref={mainRef}
          className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-dark-border scrollbar-track-dark"
          style={{ background: 'var(--color-bg)' }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{    opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              /* `h-full` so a page can ask for the height it has been given.
                 Without it this wrapper is auto-height, a child's `height:100%`
                 resolves to auto, and the only way to fill the screen is to
                 hard-code `calc(100vh - <a guess>)` — which was wrong by 8px on
                 the dashboard and put back the scrollbar it was built to avoid.
                 Pages taller than the viewport still overflow this box visibly,
                 so <main> keeps scrolling them exactly as before. */
              className="h-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <FloatingChatbot />
    </div>
  );
}
