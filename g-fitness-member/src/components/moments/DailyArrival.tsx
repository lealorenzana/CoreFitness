import { useEffect, useState } from 'react';
import { Fire, TrendUp } from '@phosphor-icons/react';
import { getProgression, levelLabel, type Progression } from '../../lib/api/achievements';
import { myStreak, type StreakCard } from '../../lib/api/streak';
import { buzz, holdMoments, loadMomentPrefs, play, reducedMotion, saveMarkers } from '../../lib/moments';
import { todayKey } from '../../utils/dates';

/**
 * The first open of the day (wave 1): a short arrival at the top of Today —
 * the streak and this week's days, the earned level and what the next needs —
 * that folds away into the normal screen. Once per day per account (0216's
 * `arrival_on`); before 0216 it never plays, since it could not tell.
 */
export default function DailyArrival() {
  const [data, setData] = useState<{ streak: StreakCard | null; prog: Progression | null } | null>(null);
  const [open, setOpen] = useState(false);
  const still = reducedMotion();

  useEffect(() => {
    let alive = true;
    const timers: number[] = [];
    void (async () => {
      const prefs = await loadMomentPrefs();
      const today = todayKey();
      if (!prefs.markers || prefs.markers.arrivalOn === today) return;
      const [streak, prog] = await Promise.all([myStreak().catch(() => null), getProgression().catch(() => null)]);
      if (!alive || (!streak && !prog)) return;
      prefs.markers.arrivalOn = today;
      void saveMarkers({ arrival_on: today });
      setData({ streak, prog });
      // The arrival has the screen first; the moments queued meanwhile wait their turn.
      holdMoments(true);
      timers.push(window.setTimeout(() => { setOpen(true); play('chime'); buzz(20); }, still ? 0 : 400));
      timers.push(window.setTimeout(() => setOpen(false), 6000));
      timers.push(window.setTimeout(() => { holdMoments(false); if (alive) setData(null); }, 6800));
    })();
    return () => { alive = false; timers.forEach(clearTimeout); holdMoments(false); };
  }, [still]);

  if (!data) return null;
  const { streak, prog } = data;
  // nextDays / nextWeeks are the next level's totals (LevelProgressCard shows them as targets).
  const moreDays = prog?.nextDays != null ? Math.max(0, prog.nextDays - prog.trainingDays) : null;
  const moreWeeks = prog?.nextWeeks != null ? Math.max(0, prog.nextWeeks - prog.consistentWeeks) : null;
  const fraction = prog?.nextDays ? Math.min(1, prog.trainingDays / prog.nextDays) : null;
  const needs = [moreDays ? `${moreDays} more training ${moreDays === 1 ? 'day' : 'days'}` : null,
    moreWeeks ? `${moreWeeks} more consistent ${moreWeeks === 1 ? 'week' : 'weeks'}` : null].filter(Boolean).join(' and ');
  return (
    <div className={`mo-arrive${open ? ' on' : ''}${still ? ' mo-still' : ''}`} aria-live="polite" data-daily-arrival>
      <div>
        <div style={{ padding: 14 }}>
          {streak && (
            <div className="mo-r">
              <div className="mo-ic" style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}><Fire size={20} weight="fill" /></div>
              <div className="mo-x">
                <b>{streak.current > 0 ? `${streak.current}-week streak` : 'Start a streak this week'}</b>
                {streak.needed > 0
                  ? `${streak.daysThisWeek} of ${streak.target} days this week · ${streak.needed} to go`
                  : `This week's ${streak.target} days are done`}
              </div>
            </div>
          )}
          {prog && (
            <div className="mo-r">
              <div className="mo-ic" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-300)' }}><TrendUp size={20} weight="bold" /></div>
              <div className="mo-x">
                <b>Earned level: {levelLabel(prog.level)}</b>
                {!prog.nextLevel ? 'The top level'
                  : needs ? `${levelLabel(prog.nextLevel)} needs ${needs}` : `${levelLabel(prog.nextLevel)} is close`}
                {fraction != null && (
                  <div className="mo-bar"><i style={{ width: open || still ? `${Math.round(fraction * 100)}%` : '0%' }} /></div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
