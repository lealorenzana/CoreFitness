import { useEffect, useState, type CSSProperties } from 'react';
import {
  Barbell, Bicycle, HandFist, Heartbeat, Lightning, PersonSimpleRun, PersonSimpleTaiChi, SneakerMove,
  type Icon,
} from '@phosphor-icons/react';

/**
 * The small effects a routine run needs: which glyph stands behind an
 * exercise, a beep, a buzz, and keeping the screen on.
 */

interface IconSource {
  name: string;
  isTimed: boolean;
  muscleGroup?: string | null;
  equipment?: string | null;
}

const RE_BIKE = /\b(bike|cycl\w*|spin)\b/;
const RE_CARDIO = /\b(run|running|treadmill|jog\w*|sprint\w*|jump\w*|rope|burpees?|elliptical|stair\w*)\b/;
const RE_CORE = /\b(plank|crunch\w*|sit-?ups?|ab|abs|hollow|stretch\w*|yoga|bridge|bird-?dog|dead ?bug)\b/;
const RE_LEGS_FREE = /\b(lunges?|calf|calves|step-?ups?|split squats?)\b/;
const RE_ARMS = /\b(curls?|push-?ups?|dips?|triceps?|biceps?|pull-?ups?|chin-?ups?)\b/;

/**
 * The glyph drawn huge and blurred behind the exercise. Decoration, not a
 * claim: the catalogue's muscle group decides where it has one, the name
 * where it does not (a custom exercise), and a barbell otherwise.
 */
export function iconFor(e: IconSource): Icon {
  const n = e.name.toLowerCase();
  const g = e.muscleGroup ?? '';
  if (RE_BIKE.test(n)) return Bicycle;
  if (g === 'cardio' || RE_CARDIO.test(n)) return PersonSimpleRun;
  if (g === 'core' || RE_CORE.test(n)) return PersonSimpleTaiChi;
  if (RE_LEGS_FREE.test(n) || (g === 'legs' && e.equipment === 'machine')) return SneakerMove;
  if (g === 'arms' || RE_ARMS.test(n)) return HandFist;
  if (g === 'full_body') return Lightning;
  if (e.isTimed) return Heartbeat;
  return Barbell;
}

let audio: AudioContext | null = null;

/** A short sine tone. Silent where the browser has no Web Audio or has not been touched yet. */
export function beep(freq = 880, ms = 120, volume = 0.14): void {
  try {
    if (!audio) {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      audio = new Ctor();
    }
    if (audio.state === 'suspended') void audio.resume();
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + ms / 1000 + 0.02);
  } catch { /* sound is a nicety */ }
}

export function buzz(pattern: number | number[]): void {
  try { navigator.vibrate?.(pattern); } catch { /* not every phone */ }
}

/**
 * Holds a screen wake lock while `active`, so the phone does not lock between
 * sets. The browser drops the lock whenever the page is hidden, so it is taken
 * again on return. Returns whether a lock is held — false where the API is
 * missing (older iOS) or refused (battery saver), and the screen says nothing then.
 */
export function useWakeLock(active: boolean): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let alive = true;
    let sentinel: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        const s = await navigator.wakeLock.request('screen');
        if (!alive) { void s.release(); return; }
        sentinel = s;
        setHeld(true);
        s.addEventListener('release', () => { if (alive) setHeld(false); });
      } catch {
        if (alive) setHeld(false);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => {});
    };
  }, [active]);
  return active && held;
}

/** Frosted glass for the run screen's cards: lighter than a sheet, so the backdrop shows through. */
export const glassCard: CSSProperties = {
  background: 'linear-gradient(160deg, rgba(34, 31, 54, 0.62) 0%, rgba(16, 15, 26, 0.58) 100%)',
  backdropFilter: 'blur(20px) saturate(150%)',
  WebkitBackdropFilter: 'blur(20px) saturate(150%)',
  border: '1px solid rgba(233, 233, 237, 0.10)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 18px 40px -24px rgba(0, 0, 0, 0.8)',
  borderRadius: 20,
};
