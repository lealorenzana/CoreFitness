import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { signupState } from '../lib/api/google';
import { finishSignIn, logout } from '../utils/auth';
import { isOnboardingComplete } from '../services/bookingService';

/**
 * Where Google sends an account back (0190).
 *
 * Already in a gym: signed in exactly as a password sign-in would be. New: on
 * to the sign-up form it came from (its gym, link, code or invitation are in
 * `next`), which finishes the account without asking for a password — or to
 * Find your gym when it came from sign-in and has no gym yet.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('Signing you in…');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const next = params.get('next') || '/login';
      // supabase-js reads the session out of the address; wait for it briefly.
      let session = (await supabase.auth.getSession()).data.session;
      for (let i = 0; !session && i < 20; i++) {
        await new Promise((r) => setTimeout(r, 250));
        session = (await supabase.auth.getSession()).data.session;
      }
      if (cancelled) return;
      if (!session) { setMessage('Google did not sign you in. Try again, or use your email and password.'); return; }

      const state = await signupState();
      const invite = new URL(next, window.location.origin).searchParams.get('invite');
      if (invite && state && state.gyms === 0) {
        // Invited: the invitation is the approval, and it names the role — the
        // account only needs a profile (with Google's email) to accept it.
        await supabase.rpc('ensure_my_profile');
        localStorage.setItem('isLoggedIn', 'true');
        navigate(`/invite/${invite}`, { replace: true });
        return;
      }
      if (!state || state.gyms === 0) {
        // A new account: the sign-up form finishes it.
        navigate(next.startsWith('/register') ? next : `/join${invite ? `?invite=${invite}` : ''}`, { replace: true });
        return;
      }
      if (invite) { localStorage.setItem('isLoggedIn', 'true'); navigate(`/invite/${invite}`, { replace: true }); return; }
      // (An invitation to a new account is handled above the gym check — see below.)

      const result = await finishSignIn(session.user.id);
      if (!result.success || !result.user) { setMessage(result.error ?? 'Could not sign you in.'); return; }
      if (result.chooseGym) { navigate('/choose-gym', { replace: true }); return; }
      if (result.status !== 'active') {
        await logout();
        navigate('/login', { replace: true, state: { pendingApproval: result.status === 'pending_approval' } });
        return;
      }
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('memberId', result.user.id);
      if (result.role === 'trainer') {
        localStorage.setItem('trainerMode', 'true');
        navigate('/trainer/home', { replace: true });
      } else {
        localStorage.removeItem('trainerMode');
        navigate((await isOnboardingComplete(result.user.id)) ? '/member/home' : '/onboarding', { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div className="min-h-[100dvh] grid place-items-center p-6 text-center" style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
      <div>
        <p className="text-sm" data-auth-callback>{message}</p>
        {!message.startsWith('Signing') && (
          <button type="button" className="mt-4 text-sm underline" style={{ color: 'var(--color-primary-300)' }} onClick={() => navigate('/login', { replace: true })}>
            Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}
