import { useCallback, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Activity, Building2, CreditCard, Grid3x3, History, Inbox, Layers, HardDrive, LayoutDashboard, LifeBuoy, Search, LogOut, Megaphone, Settings as SettingsIcon, TrendingUp, type LucideIcon } from 'lucide-react';
import { supabase } from './lib/supabaseClient';
import { CHANGED, isPlatformAdmin, listApplications, listTickets, sweepBilling } from './lib/platform';
import SignIn from './pages/SignIn';
import Overview from './pages/Overview';
import Gyms from './pages/Gyms';
import GymProfile from './pages/GymProfile';
import Applications from './pages/Applications';
import Platform from './pages/Platform';
import Plans from './pages/Plans';
import Money from './pages/Money';
import Growth from './pages/Growth';
import Support from './pages/Support';
import Announcements from './pages/Announcements';
import Bell from './components/Bell';
import Capacity from './pages/Capacity';
import CommandPalette from './components/CommandPalette';
import ErrorBoundary from './components/ErrorBoundary';
import TooltipLayer from './components/TooltipLayer';
import ActivityPage from './pages/Activity';
import Usage from './pages/Usage';
import Settings from './pages/Settings';
import SupportView from './pages/SupportView';

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

interface Page { path: string; label: string; icon: LucideIcon; title: string; lede: string; group: 'The service' | 'Talk to gyms' | 'Run it' }
const PAGES: Page[] = [
  { group: 'The service', path: '/overview', label: 'Overview', icon: LayoutDashboard, title: 'Overview', lede: 'The whole service at a glance — and what needs you.' },
  { group: 'The service', path: '/gyms', label: 'Gyms', icon: Building2, title: 'Gyms', lede: 'Every gym on Core Fitness: who runs it, how busy, what it pays.' },
  { group: 'The service', path: '/growth', label: 'Growth', icon: TrendingUp, title: 'Growth', lede: 'The service as a business — and the gyms about to leave it.' },
  { group: 'The service', path: '/usage', label: 'Usage', icon: Grid3x3, title: 'Usage', lede: 'Every gym against every feature — who uses what, and what nobody has found.' },
  { group: 'Talk to gyms', path: '/applications', label: 'Applications', icon: Inbox, title: 'Applications', lede: 'Gyms asking to join, from the website.' },
  { group: 'Talk to gyms', path: '/support', label: 'Support', icon: LifeBuoy, title: 'Support', lede: 'What gym owners and desks have asked Core Fitness.' },
  { group: 'Talk to gyms', path: '/announcements', label: 'Announcements', icon: Megaphone, title: 'Announcements', lede: 'Tell every gym — or one plan — something, as a banner in their admin app.' },
  { group: 'Run it', path: '/plans', label: 'Plans', icon: Layers, title: 'Plans', lede: 'What you sell to gyms, and what each plan unlocks.' },
  { group: 'Run it', path: '/money', label: 'Money', icon: CreditCard, title: 'Money', lede: 'What gyms have paid, and who is due.' },
  { group: 'Run it', path: '/capacity', label: 'Capacity', icon: HardDrive, title: 'Capacity', lede: 'How close the service is to the free tier, how fast, and where the space goes.' },
  { group: 'Run it', path: '/activity', label: 'Activity', icon: History, title: 'Activity', lede: 'Everything the platform did — searchable, by gym, action and day.' },
  { group: 'Run it', path: '/platform', label: 'Platform', icon: Activity, title: 'Platform', lede: 'Health, crashes, backups and support access.' },
  { group: 'Run it', path: '/settings', label: 'Settings', icon: SettingsIcon, title: 'Settings', lede: 'Receipts, billing rules and who can run the platform.' },
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
  const [supportWaiting, setSupportWaiting] = useState(0);
  // Reminders to every gym's owners before a lock (0138): pg_cron is optional, so the platform's own visits sweep.
  useEffect(() => { sweepBilling(); }, []);

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
    const count = () => {
      void listApplications('pending').then((a) => { if (alive) setWaiting(a.length); }, () => undefined);
      void listTickets().then((t) => { if (alive) setSupportWaiting(t.filter((x) => x.status !== 'closed' && x.last_from === 'gym').length); }, () => undefined);
    };
    count();
    window.addEventListener(CHANGED, count);
    return () => { alive = false; window.removeEventListener(CHANGED, count); };
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

        <nav className="nav">
          {PAGES.map((p, i) => {
            const Icon = p.icon;
            return (
              <div key={p.path} style={{ display: 'contents' }}>
              {(i === 0 || PAGES[i - 1].group !== p.group) && <div className="nav-label">{p.group}</div>}
              <NavLink to={p.path} className={({ isActive }) => (isActive ? 'on' : '')} data-tip={p.lede}>
                <Icon size={17} />
                <span>{p.label}</span>
                {p.path === '/applications' && waiting > 0 && <span className="count" aria-label={`${waiting} waiting`}>{waiting}</span>}
                {p.path === '/support' && supportWaiting > 0 && <span className="count" aria-label={`${supportWaiting} support waiting`}>{supportWaiting}</span>}
              </NavLink>
              </div>
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
          <button type="button" className="find" style={{ marginLeft: 'auto' }} data-tip="Find any gym, applicant, payment reference, ticket, log entry or screen — Ctrl K or /" onClick={() => window.dispatchEvent(new Event('platform:search'))}>
            <Search size={15} /> <span>Find anything</span> <kbd>Ctrl K</kbd>
          </button>
          <span><Bell /></span>
          <CommandPalette pages={PAGES} />
          <TooltipLayer />
          <span className="today" style={{ marginLeft: 0 }}>
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
                <Route path="/gyms/:gymId" element={<GymProfile />} />
                <Route path="/applications" element={<Applications />} />
                <Route path="/plans" element={<Plans />} />
                <Route path="/money" element={<Money />} />
                <Route path="/growth" element={<Growth />} />
                <Route path="/support" element={<Support />} />
                <Route path="/support-access/:gymId" element={<SupportView />} />
                <Route path="/announcements" element={<Announcements />} />
                <Route path="/capacity" element={<Capacity />} />
                <Route path="/activity" element={<ActivityPage />} />
                <Route path="/usage" element={<Usage />} />
                <Route path="/settings" element={<Settings />} />
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
