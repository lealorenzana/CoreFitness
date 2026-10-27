import { supabase } from './supabaseClient';
import { storedSession } from './offlineReads';
import { todayKey } from '../utils/dates';
import { getProgression } from './api/achievements';
import { myStreak } from './api/streak';
import { getBalance } from './api/points';
import { loadMomentPrefs, pointsFor, saveMarkers, showMoment } from './moments';

/**
 * Finds what newly happened and queues its moment (lib/moments.ts) — a check-in
 * at the kiosk while the app was closed, a higher earned level, a target the
 * database settled, a challenge finished. Each is marked played on the account
 * (0216) the moment it is queued, as AchievementWatcher marks a badge seen on
 * show: a closed app or a dropped connection must never mean "plays forever".
 *
 * Before 0216 the markers cannot be read and none of this plays — without one
 * every moment here would replay on each open.
 */

const RANK: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 };
const UNIT: Record<string, string> = { weight_kg: 'kg', lift_kg: 'kg', body_fat_pct: '%', waist_cm: 'cm' };

let running: Promise<void> | null = null;
let lastRun = 0;

/** Safe to call often: it runs at most once a minute unless `force`. */
export function checkForMoments(force = false): Promise<void> {
  if (running) return running;
  if (!force && Date.now() - lastRun < 60_000) return Promise.resolve();
  running = (async () => {
    lastRun = Date.now();
    const uid = storedSession()?.user.id;
    if (!uid || !navigator.onLine) return;
    // Never under the start-up splash: a small card would come and go unseen.
    await splashGone();
    // Badges first: AchievementWatcher re-grades and queues anything new.
    window.dispatchEvent(new Event('cf:check-badges'));
    const prefs = await loadMomentPrefs();
    const marks = prefs.markers;
    if (!marks) return;

    // A check-in this phone did not see (the kiosk, the desk, the app closed).
    if (marks.checkinOn !== todayKey()) await celebrateCheckIn({ onlyIfToday: true }).catch(() => undefined);

    // The earned level. The first sighting is recorded, never celebrated.
    const prog = await getProgression().catch(() => null);
    if (prog) {
      if (marks.level == null) {
        marks.level = prog.level;
        await saveMarkers({ celebrated_level: prog.level });
      } else if ((RANK[prog.level] ?? 0) > (RANK[marks.level] ?? 0)) {
        // What the next level still needs (nextDays/nextWeeks are its totals).
        const moreDays = prog.nextDays != null ? Math.max(0, prog.nextDays - prog.trainingDays) : null;
        const moreWeeks = prog.nextWeeks != null ? Math.max(0, prog.nextWeeks - prog.consistentWeeks) : null;
        showMoment({ kind: 'level', from: marks.level, to: prog.level, next: prog.nextLevel, nextDays: moreDays, nextWeeks: moreWeeks });
        marks.level = prog.level;
        await saveMarkers({ celebrated_level: prog.level });
      }
    }

    // Targets with a number, marked reached by settle_my_goals() (never a hand tick).
    await supabase.rpc('settle_my_goals').then(() => undefined, () => undefined);
    const goals = await supabase.from('fitness_goals')
      .select('id, title, metric, start_value, target_value, template_key')
      .eq('member_id', uid).not('achieved_on', 'is', null).is('celebrated_at', null);
    for (const g of ((goals.error ? [] : goals.data) ?? []) as {
      id: string; title: string; metric: string; start_value: number | null; target_value: number | null; template_key: string | null;
    }[]) {
      // A custom target is ticked by hand and pays nothing (0087): its "Nicely done" is enough.
      if (g.metric === 'custom' && !g.template_key) { await markGoal(g.id); continue; }
      showMoment({ kind: 'target', id: g.id, title: g.title, unit: UNIT[g.metric] ?? '',
        start: g.start_value, target: g.target_value, points: await pointsFor('fitness_goals', g.id) });
      await markGoal(g.id);
    }

    // Challenges finished.
    await supabase.rpc('settle_challenges').then(() => undefined, () => undefined);
    const done = await supabase.from('challenge_participants')
      .select('challenge_id, challenges(title)').eq('member_id', uid).not('completed_on', 'is', null);
    const fresh = ((done.error ? [] : done.data) ?? []) as unknown as { challenge_id: string; challenges: { title: string } | { title: string }[] | null }[];
    const newOnes = fresh.filter((c) => !marks.challenges.includes(c.challenge_id));
    for (const c of newOnes) {
      const ch = Array.isArray(c.challenges) ? c.challenges[0] : c.challenges;
      showMoment({ kind: 'challenge', id: c.challenge_id, title: ch?.title ?? 'Challenge',
        points: await pointsFor('challenge_participants', c.challenge_id) });
    }
    if (newOnes.length) {
      marks.challenges = [...marks.challenges, ...newOnes.map((c) => c.challenge_id)];
      await saveMarkers({ celebrated_challenges: marks.challenges });
    }
  })().finally(() => { running = null; });
  return running;
}

/** The start-up splash (#boot in index.html) has gone, or ten seconds passed. */
export function splashGone(): Promise<void> {
  return new Promise((done) => {
    const t0 = Date.now();
    const look = () => (!document.getElementById('boot') || Date.now() - t0 > 10_000 ? done() : window.setTimeout(look, 200));
    look();
  });
}

async function markGoal(id: string) {
  await supabase.from('fitness_goals').update({ celebrated_at: new Date().toISOString() }).eq('id', id).select('id')
    .then(() => undefined, () => undefined);
}

/**
 * Today's check-in, as a moment: the visit's own points from the ledger, this
 * week's days and the streak from my_streak(), the balance after.
 * `onlyIfToday` — from the watcher: nothing when there is no visit today.
 */
export async function celebrateCheckIn(opts: { onlyIfToday?: boolean } = {}): Promise<void> {
  const uid = storedSession()?.user.id;
  if (!uid) return;
  const prefs = await loadMomentPrefs();
  const today = todayKey();
  if (prefs.markers?.checkinOn === today) return;
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const [visit, me, streak] = await Promise.all([
    supabase.from('attendance').select('id, activity').eq('member_id', uid)
      .gte('check_in_time', since.toISOString()).order('check_in_time', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('profiles').select('first_name').eq('id', uid).maybeSingle(),
    myStreak().catch(() => null),
  ]);
  const row = (visit.error ? null : visit.data) as { id: string; activity: string | null } | null;
  if (!row && opts.onlyIfToday) return;
  const points = row ? await pointsFor('attendance', row.id) : null;
  const balance = points ? await getBalance(uid).catch(() => null) : null;
  showMoment({
    kind: 'checkin',
    firstName: ((me.data as { first_name?: string } | null)?.first_name ?? '').split(' ')[0] || 'there',
    activity: row?.activity ?? null,
    daysThisWeek: streak ? streak.daysThisWeek : null,
    target: streak ? streak.target : null,
    week: streak && streak.week.length === 7 ? streak.week : null,
    todayIndex: streak ? streak.todayIndex : null,
    weeks: streak ? streak.current : null,
    // This visit is the one that made the week's target.
    weekJustMade: !!streak && !streak.frozen && streak.daysThisWeek === streak.target,
    best: streak ? streak.best : null,
    points,
    balance,
  });
  if (prefs.markers) prefs.markers.checkinOn = today;
  await saveMarkers({ checkin_celebrated_on: today });
}
