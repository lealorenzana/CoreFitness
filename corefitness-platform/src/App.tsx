import { useCallback, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Activity, Building2, CreditCard, Inbox, Layers, LayoutDashboard, LogOut, type LucideIcon } from 'lucide-react';
import { supabase } from './lib/supabaseClient';
import { isPlatformAdmin, listApplications } from './lib/platform';
import SignIn from './pages/SignIn';
import Overview from './pages/Overview';
import Gyms from './pages/Gyms';
import Applications from './pages/Applications';
import Platform from './pages/Platform';
import Plans from './pages/Plans';
import Money from './pages/Money';
import ErrorBoundary from './components/ErrorBoundary';

/**
 * Core Fitness, the service — the platform owner's own app.
 *
 * Runs on the owner's machine only (vite.config.ts): letting a gym in and
 * suspending one are the two most consequential actions in the system, and
 * neither belongs on the open internet.
 *
 * "Signed in" is not enough — every screen waits for `is_platform_admin()`,
 * the same check every function it calls makes in SQL (0106). A gym owner who
 * finds this address sees the door, not the building.
 *
 * The shell matches the admin app (2026-09-27): a sidebar, the same tokens,
 * the window filled edge to edge.
 */
type Gate = 'checking' | 'in' | 'out';

interface Page { path: string; label: string; icon: LucideIcon; title: string; lede: string }
const PAGES: Page[] = [
  { path: '/overview', label: 'Overview', icon: LayoutDashboard, title: 'Overview', lede: 'The whole service at a glance — and what needs you.' },
  { path: '/gyms', label: 'Gyms', icon: Building2, title: 'Gyms', lede: 'Every gym on Core Fitness: who runs it, how busy, what it pays.' },
  { path: '/applications', label: 'Applications', icon: Inbox, title: 'Applications', lede: 'Gyms asking to join, from the website.' },
  { path: '/plans', label: 'Plans', icon: Layers, title: 'Plans', lede: 'What you sell to gyms, and what each plan unlocks.' },
  { path: '/money', label: 'Money', icon: CreditCard, title: 'Money', lede: 'What gyms have paid, and who is due.' },
  { path: '/platform', label: 'Platform', icon: Activity, title: 'Platform', lede: 'Health, crashes, backups, admins and support access.' },
];

export default function App() {
  const [gate, setGate] = useState<Gate>('checking');

  const check = useCallback(async () => {
    setGate((await isPlatformAdmin()) ? 'in' : 'out');
  }, []);

  useEffect(() => {
    void check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { void check(); });
    return () => subscription.unsubscribe();
  }, [check]);

  if (gate === 'checking') return null;
  if (gate === 'out') return <SignIn onSignedIn={() => void check()} />;
  return <Shell />;
}

function Shell() {
  const { pathname } = useLocation();
  const [email, setEmail] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (alive) setEmail(data.user?.email ?? null);
    })();
    return () => { alive = false; };
  }, []);

  // Applications waiting: the one number worth a badge. Re-read on every move.
  useEffect(() => {
    let alive = true;
    void listApplications('pending').then((a) => { if (alive) setWaiting(a.length); }, () => undefined);
    return () => { alive = false; };
  }, [pathname]);

  const page = PAGES.find((p) => pathname.startsWith(p.path)) ?? PAGES[0];
  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <img className="brand-logo" src="/core-fitness-logo.png" alt="Core Fitness" />
          <span>
            <span className="brand-name">Core Fitness</span>
            <span className="brand-sub">Platform</span>
          </span>
        </div>

        <div className="nav-label">The service</div>
        <nav className="nav">
          {PAGES.map((p) => {
            const Icon = p.icon;
            return (
              <NavLink key={p.path} to={p.path} className={({ isActive }) => (isActive ? 'on' : '')}>
                <Icon size={17} />
                <span>{p.label}</span>
                {p.path === '/applications' && waiting > 0 && <span className="count" aria-label={`${waiting} waiting`}>{waiting}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="side-foot">
          <div className="me">
            <span className="me-avatar">{(email ?? '?').slice(0, 2).toUpperCase()}</span>
            <span style={{ minWidth: 0 }}>
              <span className="me-name">{email ?? ''}</span>
              <span className="me-role">Platform owner</span>
            </span>
          </div>
          <button className="signout" onClick={() => void (async () => { await supabase.auth.signOut(); })()}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <h1>{page.title}</h1>
            <p className="lede">{page.lede}</p>
          </div>
          <span className="today">
            <span className="local-badge">This computer only</span>
            <span style={{ display: 'block', marginTop: 6 }}>{today}</span>
          </span>
        </header>
        <div className="content">
          <ErrorBoundary>
            <div className="page" key={page.path}>
              <Routes>
                <Route path="/" element={<Navigate to="/overview" replace />} />
                <Route path="/overview" element={<Overview />} />
                <Route path="/gyms" element={<Gyms />} />
                <Route path="/applications" element={<Applications />} />
                <Route path="/plans" element={<Plans />} />
                <Route path="/money" element={<Money />} />
                <Route path="/platform" element={<Platform />} />
                <Route path="*" element={<Navigate to="/overview" replace />} />
              </Routes>
            </div>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
