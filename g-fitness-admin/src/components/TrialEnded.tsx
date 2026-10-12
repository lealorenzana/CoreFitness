import { LogOut, PauseCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { clearGymContext, type GymContext } from '../lib/gymContext';
import Subscription from '../pages/Subscription';

/**
 * The gym's free trial has ended (0198, `gym_lock_reason() = 'trial_ended'`).
 *
 * Nothing of the dashboard opens: no sidebar, no pages — every write there is
 * refused in SQL from this day anyway, and a dashboard that looks usable and
 * then fails is the ambush CLAUDE.md warns about. The owner gets one thing,
 * their plan page, where they pay online or send a reference; the moment a
 * payment is confirmed it lifts and the app comes back (Subscription reloads).
 *
 * The front desk is never shown the gym's bill (my_gym_subscription returns no
 * row to staff), so they are told who can open it again.
 */
export default function TrialEnded({ ctx }: { ctx: GymContext }) {
  const signOut = async () => {
    await supabase.auth.signOut();
    clearGymContext();
    window.location.assign('/admin/login');
  };
  const owner = ctx.role === 'admin';
  return (
    <div data-trial-ended className="h-screen flex flex-col overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      <header className="flex items-center gap-3 px-6 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <span className="text-sm font-semibold text-white truncate">{ctx.gymName ?? 'Your gym'}</span>
        <span className="flex-1" />
        <button type="button" onClick={() => void signOut()}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
          style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
          <LogOut size={14} /> Sign out
        </button>
      </header>
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start gap-3 rounded-2xl p-5 mb-5"
            style={{ background: 'var(--color-secondary-light)', border: '1px solid var(--color-secondary)' }}>
            <PauseCircle size={26} className="shrink-0" style={{ color: 'var(--color-secondary)' }} />
            <div>
              <h1 className="text-lg font-bold text-white">Your free trial has ended</h1>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                {owner
                  ? 'The app is paused for you, your front desk, your coaches and your members. Choose a plan below and everything opens again the moment the payment is confirmed — every member, payment and record is kept exactly as it was.'
                  : 'The app is paused for everyone at the gym until its owner chooses a Core Fitness plan. Everything is kept exactly as it was; ask the owner when it will be back.'}
              </p>
            </div>
          </div>
          {owner && <Subscription />}
        </div>
      </main>
    </div>
  );
}
