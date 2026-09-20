import { useCallback, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { supabase } from './lib/supabaseClient';
import { isPlatformAdmin } from './lib/platform';
import SignIn from './pages/SignIn';
import Gyms from './pages/Gyms';
import Applications from './pages/Applications';
import Platform from './pages/Platform';

/**
 * Core Fitness, the service — the platform owner's own app.
 *
 * Three screens: the gyms on it, the gyms asking to be, and the platform's own
 * health. It runs on the owner's machine only (vite.config.ts): letting a gym
 * in and suspending one are the two most consequential actions in the system,
 * and neither belongs on the open internet.
 *
 * "Signed in" is not enough — every screen waits for `is_platform_admin()`,
 * the same check every function it calls makes in SQL (0106). A gym owner who
 * finds this address sees the door, not the building.
 */
type Gate = 'checking' | 'in' | 'out';

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

  return (
    <div className="shell">
      <div className="head">
        <h1>Core Fitness</h1>
        <span className="muted" style={{ fontSize: 13 }}>the service</span>
        <span className="grow" />
        <button
          className="btn ghost"
          onClick={() => void (async () => { await supabase.auth.signOut(); })()}
        >
          Sign out
        </button>
      </div>
      <p className="sub">Every gym on Core Fitness, and every gym asking to join.</p>

      <nav className="tabs">
        <NavLink to="/gyms" className={({ isActive }) => (isActive ? 'on' : '')}>Gyms</NavLink>
        <NavLink to="/applications" className={({ isActive }) => (isActive ? 'on' : '')}>Applications</NavLink>
        <NavLink to="/platform" className={({ isActive }) => (isActive ? 'on' : '')}>Platform</NavLink>
      </nav>

      <Routes>
        <Route path="/" element={<Navigate to="/gyms" replace />} />
        <Route path="/gyms" element={<Gyms />} />
        <Route path="/applications" element={<Applications />} />
        <Route path="/platform" element={<Platform />} />
        <Route path="*" element={<Navigate to="/gyms" replace />} />
      </Routes>
    </div>
  );
}
