import { useCallback, useEffect, useState } from 'react';
import { Building2, LogOut } from 'lucide-react';
import Button from '../components/ui/Button';
import { supabase } from '../lib/supabaseClient';
import { showToast } from '../utils/toast';
import { clearGymContext, getGymContext, homeFor, myGyms, switchGym, type MyGym } from '../lib/gymContext';

/**
 * Which gym's desk is this?
 *
 * Only for someone who works at more than one — one gym never sees it. A gym
 * where this person is a member or a coach is not listed: that is the phone
 * app's business, and offering it here would be a door that opens onto nothing.
 */
export default function ChooseGym() {
  const [gyms, setGyms] = useState<MyGym[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [list, ctx] = await Promise.all([myGyms(), getGymContext()]);
    setGyms(list.filter((g) => g.role === 'admin' || g.role === 'staff'));
    setCurrent(ctx?.gymId ?? null);
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const choose = async (gym: MyGym) => {
    if (gym.status !== 'active') return;
    setBusy(gym.gym_id);
    try {
      await switchGym(gym.gym_id, homeFor(gym.role) ?? '/admin/dashboard');
    } catch (e) {
      setBusy(null);
      showToast(e instanceof Error ? e.message : 'Could not switch gym', 'error');
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    clearGymContext();
    window.location.assign('/admin/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-md">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>Choose a gym</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          You work at more than one. Everything in the dashboard belongs to the gym you pick.
        </p>

        <div className="mt-5 space-y-2">
          {gyms?.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              This account does not run a gym. The phone app is where members and coaches sign in.
            </p>
          )}
          {gyms?.map((gym) => (
            <button
              key={gym.gym_id}
              type="button"
              onClick={() => void choose(gym)}
              disabled={gym.status !== 'active' || busy !== null}
              className="w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left disabled:opacity-60"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
            >
              <Building2 size={18} style={{ color: 'var(--color-text-secondary)' }} />
              <span className="flex-1 min-w-0">
                <span className="block truncate text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  {gym.name}
                </span>
                <span className="block text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {gym.status !== 'active' ? 'Suspended here' : gym.role === 'admin' ? 'Owner' : 'Front desk'}
                </span>
              </span>
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {busy === gym.gym_id ? 'Switching…' : gym.gym_id === current ? 'Current' : ''}
              </span>
            </button>
          ))}
        </div>

        <Button variant="ghost" className="mt-5" onClick={() => void signOut()}>
          <LogOut size={16} className="mr-2" /> Sign out
        </Button>
      </div>
    </div>
  );
}
