import { supabase } from './supabaseClient';
import { currentGymId } from './gymContext';
import { storedSession } from './offlineReads';
import type { AchievementDef } from '../data/achievements';
import type { CoachMilestone } from './api/coachMoments';

/**
 * The big moments (wave 1 of the lively member app, 2026-10-27; spec
 * docs/superpowers/specs/2026-10-27-lively-member-app-design.md, mock-up
 * 2026-10-27-lively-wave1/mock-wave1.html — approved as drawn).
 *
 * One queue, so two moments never play over each other: a check-in that also
 * finished a challenge and earned a badge plays them one after another. What
 * each shows is read, never made up — the points are the ledger row that paid
 * for the thing (`source_table` + `source_id`), the streak is `my_streak()`,
 * the level is `member_progression()`.
 *
 * Whether one has already played is on the account (0216: member_profiles'
 * markers, fitness_goals.celebrated_at), never the phone. Before 0216 the
 * markers cannot be read, so the moments that would replay without one
 * (arrival, level, target, challenge, a missed check-in) do not play at all.
 */

// ── Moments ──────────────────────────────────────────────────────────────────

export type Moment =
  | { kind: 'checkin'; firstName: string; activity: string | null; daysThisWeek: number | null; target: number | null;
      week: boolean[] | null; todayIndex: number | null; weeks: number | null; weekJustMade: boolean;
      best: number | null; points: number | null; balance: number | null }
  | { kind: 'badge'; def: AchievementDef; rarity: { holders: number; audience: number } | null; remaining: number }
  /** nextDays / nextWeeks: what the next level still needs, not its totals. */
  | { kind: 'level'; from: string | null; to: string; next: string | null; nextDays: number | null; nextWeeks: number | null }
  | { kind: 'target'; id: string; title: string; unit: string; start: number | null; target: number | null; points: number | null }
  | { kind: 'challenge'; id: string; title: string; points: number | null }
  /** A coach's own milestone (0218): counted in SQL, played once per account. */
  | { kind: 'coach'; milestone: CoachMilestone };

let queue: Moment[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export function subscribeMoments(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
let held = false;
/**
 * Holds the queue while something else has the screen — Today's arrival plays
 * first, then the moments take their turn. Nothing is dropped, only waits.
 */
export function holdMoments(on: boolean): void {
  if (held === on) return;
  held = on;
  emit();
}

/** The moment on screen now, or null (also while held). */
export function currentMoment(): Moment | null {
  return held ? null : queue[0] ?? null;
}
export function showMoment(m: Moment): void {
  // The same thing twice in a row (a re-render, two listeners) is one moment.
  const key = (x: Moment) => (x.kind === 'badge' ? `badge:${x.def.key}` : JSON.stringify(x));
  if (queue.some((q) => key(q) === key(m))) return;
  queue = [...queue, m];
  emit();
}
export function nextMoment(): void {
  queue = queue.slice(1);
  emit();
}

// ── Switches ─────────────────────────────────────────────────────────────────

export interface MomentPrefs {
  /** The gym owner's switch: off makes every moment a small card. */
  celebrations: boolean;
  /** The gym owner's switch and the member's own, both on. */
  sounds: boolean;
  /** The member's own (Settings), for the switch there. */
  memberSounds: boolean;
  /** The gym owner's sound switch alone. */
  gymSounds: boolean;
  /** 0216's markers; null before 0216, when the replaying moments stay off. */
  markers: Markers | null;
}
export interface Markers {
  level: string | null;
  arrivalOn: string | null;
  checkinOn: string | null;
  challenges: string[];
}

const DEFAULTS: MomentPrefs = { celebrations: true, sounds: true, memberSounds: true, gymSounds: true, markers: null };
let prefs: MomentPrefs = DEFAULTS;
let loaded: Promise<MomentPrefs> | null = null;

export function momentPrefs(): MomentPrefs {
  return prefs;
}

/** Read once per account and gym; `clearMomentCache()` forgets it. */
export function loadMomentPrefs(): Promise<MomentPrefs> {
  loaded ??= (async () => {
    const uid = storedSession()?.user.id;
    const gymId = await currentGymId().catch(() => null);
    const [g, m] = await Promise.all([
      gymId
        ? supabase.from('gym_settings').select('celebrations, celebration_sounds').eq('gym_id', gymId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      uid
        ? supabase.from('member_profiles')
          .select('celebration_sounds, celebrated_level, arrival_on, checkin_celebrated_on, celebrated_challenges')
          .eq('profile_id', uid).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    const gym = (g.error ? null : g.data) as { celebrations: boolean; celebration_sounds: boolean } | null;
    const me = (m.error ? null : m.data) as {
      celebration_sounds: boolean; celebrated_level: string | null; arrival_on: string | null;
      checkin_celebrated_on: string | null; celebrated_challenges: string[] | null;
    } | null;
    const memberSounds = me?.celebration_sounds ?? true;
    const gymSounds = gym?.celebration_sounds ?? true;
    prefs = {
      celebrations: gym?.celebrations ?? true,
      sounds: gymSounds && memberSounds,
      memberSounds,
      gymSounds,
      markers: me ? {
        level: me.celebrated_level, arrivalOn: me.arrival_on, checkinOn: me.checkin_celebrated_on,
        challenges: me.celebrated_challenges ?? [],
      } : null,
    };
    emit();
    return prefs;
  })();
  return loaded;
}

/** Writes the member's own row (0216). Best effort: a lost write only means a moment may play once more. */
export async function saveMarkers(patch: Record<string, unknown>): Promise<void> {
  const uid = storedSession()?.user.id;
  if (!uid) return;
  await supabase.from('member_profiles').update(patch).eq('profile_id', uid).select('profile_id')
    .then(() => undefined, () => undefined);
}

/** The member's own sound switch (Settings). Thrown on failure — it is a setting they asked for. */
export async function setMemberSounds(on: boolean): Promise<void> {
  const uid = storedSession()?.user.id;
  if (!uid) throw new Error('Not signed in');
  const { data, error } = await supabase.from('member_profiles').update({ celebration_sounds: on })
    .eq('profile_id', uid).select('profile_id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('That setting was not saved.');
  prefs = { ...prefs, memberSounds: on, sounds: on && prefs.gymSounds };
  emit();
}

/** Account or gym changed (memberCaches.ts). */
export function clearMomentCache(): void {
  loaded = null;
  queue = [];
  held = false;
  prefs = DEFAULTS;
  emit();
}

// ── The points a thing paid ──────────────────────────────────────────────────

/** What the ledger credited for one row (a visit, a workout, a target…), or null when nothing was paid. */
export async function pointsFor(sourceTable: string, sourceId: string): Promise<number | null> {
  const { data, error } = await supabase.from('point_ledger').select('points')
    .eq('source_table', sourceTable).eq('source_id', sourceId);
  if (error || !data || data.length === 0) return null;
  return (data as { points: number }[]).reduce((n, r) => n + r.points, 0);
}

/**
 * Why a finished workout paid nothing (0219), or null when we cannot say for sure:
 * 'short' — the database did not count it (fewer than 3 sets or under 10 minutes);
 * 'today' — it counted, but another workout already paid today. Anything else (the plan,
 * the gym's rules) stays unsaid rather than guessed.
 */
export async function workoutUnpaidReason(logId: string, dayStartIso: string): Promise<'short' | 'today' | null> {
  const { data: log, error } = await supabase.from('workout_logs').select('counts').eq('id', logId).maybeSingle();
  if (error || !log) return null;
  if ((log as { counts?: boolean | null }).counts === false) return 'short';
  const { data: paid, error: e2 } = await supabase.from('point_ledger').select('id')
    .eq('source_table', 'workout_logs').neq('source_id', logId).gte('created_at', dayStartIso).limit(1);
  if (e2) return null;
  return paid && paid.length > 0 ? 'today' : null;
}

// ── Sound and touch ──────────────────────────────────────────────────────────

let ac: AudioContext | null = null;
function tone(freq: number, at: number, dur: number, vol = 0.12, type: OscillatorType = 'sine') {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    ac ??= new Ctx();
    if (ac.state === 'suspended') void ac.resume();
    const t = ac.currentTime + at;
    for (const [mult, v, d] of [[1, vol, dur], [2, vol * 0.25, dur * 0.6]] as const) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = mult === 1 ? type : 'sine';
      o.frequency.setValueAtTime(freq * mult, t);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0008, t + d);
      o.connect(g).connect(ac.destination);
      o.start(t); o.stop(t + d + 0.05);
    }
  } catch { /* no audio on this device */ }
}

/** Soft synthesized chimes and pops — "clean and modern", no files to license. */
const SOUNDS = {
  chime: () => [659.25, 987.77].forEach((f, i) => tone(f, i * 0.09, 0.9, 0.1)),
  arrive: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.085, 1.1, 0.1)),
  pop: () => { tone(880, 0, 0.12, 0.09, 'triangle'); tone(1318.5, 0.04, 0.18, 0.06); },
  tick: () => tone(1567.98, 0, 0.05, 0.035, 'triangle'),
  record: () => [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => tone(f, i * 0.07, 1.2, 0.09)),
  level: () => { [392, 523.25, 659.25, 783.99].forEach((f, i) => tone(f, i * 0.11, 1.4, 0.1)); tone(1046.5, 0.5, 1.8, 0.11); },
  medal: () => { tone(1318.5, 0, 1.6, 0.08); tone(1975.5, 0.12, 1.4, 0.05); tone(659.25, 0.12, 1.6, 0.08); },
  snap: () => { tone(1046.5, 0, 0.2, 0.1, 'triangle'); tone(1568, 0.06, 0.6, 0.07); },
};
export type SoundName = keyof typeof SOUNDS;

export function play(name: SoundName): void {
  if (prefs.sounds) SOUNDS[name]();
}
/** A short buzz. Android only; an iPhone ignores it. */
export function buzz(pattern: number | number[]): void {
  try { navigator.vibrate?.(pattern); } catch { /* not allowed here */ }
}

/** The phone asked for less motion: every moment arrives finished and still. */
export function reducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
