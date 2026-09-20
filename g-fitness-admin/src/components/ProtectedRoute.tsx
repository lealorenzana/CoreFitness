import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { getGymContext } from '../lib/gymContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /**
   * Restrict to admins. Use on anything that changes the shape of the business
   * or who has access — plan pricing, trainer management, settings. Everything
   * else is front-desk work that staff are expected to do.
   */
  adminOnly?: boolean;
}

/**
 * Gates the admin dashboard on the real `profiles` row, not a localStorage flag.
 *
 * Two things this checks that the previous version didn't:
 *   - `status === 'active'`, so a suspended or archived account can't keep using
 *     the dashboard just because its password still works.
 *   - the 'staff' role (migration 0011), which otherwise couldn't sign in at all.
 */
export default function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const [status, setStatus] =
    useState<'checking' | 'authorized' | 'unauthorized' | 'forbidden' | 'unset-up' | 'waiting-for-owner'>('checking');
  const { pathname } = useLocation();

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        if (active) setStatus('unauthorized');
        return;
      }
      // The role is the one in *this gym* (lib/gymContext, 0104): the same
      // person can own one gym and be a member of another.
      const profile = await getGymContext();

      if (!active) return;

      const isStaffOrAdmin = profile?.role === 'admin' || profile?.role === 'staff';
      if (!isStaffOrAdmin || profile?.status !== 'active') {
        setStatus('unauthorized');
        return;
      }
      // A gym nobody has set up yet (0107). Its owner types in its name, hours,
      // colour and prices before seeing a dashboard of blanks; the front desk
      // cannot — those are the owner's to decide — so staff are simply told.
      // Skipped on /admin/setup itself, which is where they are being sent.
      if (!profile!.onboarded && pathname !== '/admin/setup') {
        setStatus(profile!.role === 'admin' ? 'unset-up' : 'waiting-for-owner');
        return;
      }
      // Signed in and allowed in the dashboard, but not for this page. Sending
      // them to the login screen here would look like a session failure and
      // invite a pointless re-login, so it's a distinct state.
      setStatus(adminOnly && profile!.role !== 'admin' ? 'forbidden' : 'authorized');
    }

    checkAccess();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => checkAccess());
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [adminOnly, pathname]);

  if (status === 'checking') {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
      >
        Loading…
      </div>
    );
  }

  if (status === 'unauthorized') {
    return <Navigate to="/admin/login" replace />;
  }

  if (status === 'unset-up') {
    return <Navigate to="/admin/setup" replace />;
  }

  if (status === 'waiting-for-owner') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center"
        style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
        <p className="max-w-sm text-sm">
          This gym is not set up yet. Its owner signs in first and fills in the gym's details, hours
          and prices — after that, the desk works as normal.
        </p>
      </div>
    );
  }

  if (status === 'forbidden') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
