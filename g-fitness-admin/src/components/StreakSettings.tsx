import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { updateGymSettings } from '../lib/api/settings';
import { moduleOn, useGymModules } from '../hooks/useGymModules';
import { showToast } from '../utils/toast';

/**
 * Streaks (0272): how many weeks a member's streak waits after their membership ends. Inside it a
 * missed week pauses the streak; renewing keeps it. The switch itself is on Your app (Progress →
 * Streaks). Renders nothing before 0272.
 */
export default function StreakSettings() {
  const modules = useGymModules();
  const [grace, setGrace] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.from('gym_settings').select('streak_grace_weeks').maybeSingle();
      if (!error && data) setGrace(Number((data as { streak_grace_weeks: number }).streak_grace_weeks));
    })();
  }, []);
  if (grace === null) return null;

  const pick = async (n: number) => {
    const before = grace;
    setGrace(n);
    setSaving(true);
    try {
      await updateGymSettings({ streak_grace_weeks: n });
      showToast(n === 0 ? 'A streak breaks the week after a membership ends' : `A streak waits ${n} ${n === 1 ? 'week' : 'weeks'} after a membership ends`, 'success');
    } catch (e) {
      setGrace(before);
      showToast(e instanceof Error ? e.message : 'Could not save that', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {!moduleOn(modules, 'streaks') && (
        <p className="a-sub" style={{ marginBottom: 8 }}>Streaks are switched off on Your app. This applies when you switch them on.</p>
      )}
      <div className="a-setting">
        <div className="t"><b>After a membership ends</b><small>missed weeks pause the streak for this long; renewing keeps it</small></div>
        <div role="group" aria-label="Weeks a streak waits" style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2, 3, 4].map((n) => (
            <button key={n} type="button" className={`a-chip${grace === n ? ' v' : ''}`} aria-pressed={grace === n}
              disabled={saving} onClick={() => void pick(n)}>
              {n === 0 ? 'None' : `${n} ${n === 1 ? 'week' : 'weeks'}`}
            </button>
          ))}
        </div>
      </div>
      <p className="a-sub" style={{ marginTop: 6, whiteSpace: 'normal' }}>
        Members can restore a missed week themselves on the Monday after it: 1 a month, up to 5 as their streak grows.
        The desk can restore one from the member's page within 14 days.
      </p>
    </>
  );
}
