import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

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
  const [status, setStatus] = useState<'checking' | 'authorized' | 'unauthorized' | 'forbidden'>('checking');

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
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, status')
        .eq('id', session.user.id)
        .single();

      if (!active) return;

      const isStaffOrAdmin = profile?.role === 'admin' || profile?.role === 'staff';
      if (!isStaffOrAdmin || profile?.status !== 'active') {
        setStatus('unauthorized');
        return;
      }
      // Signed in and allowed in the dashboard, but not for this page. Sending
      // them to the login screen here would look like a session failure and
      // invite a pointless re-login, so it's a distinct state.
      setStatus(adminOnly && profile.role !== 'admin' ? 'forbidden' : 'authorized');
    }

    checkAccess();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => checkAccess());
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [adminOnly]);

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

  if (status === 'forbidden') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
