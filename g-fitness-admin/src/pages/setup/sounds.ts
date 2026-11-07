/**
 * The build studio's sounds (owner, 2026-11-07: "full: motion and sound").
 * Synthesised with Web Audio — no files to download, nothing to license — and
 * quiet: UI sounds, not music. Off when the person mutes them (remembered on
 * this device only: a convenience, not account state) or when the browser has
 * no audio. Never throws.
 */
const KEY = 'cf-studio-sound';
let ctx: AudioContext | null = null;

export function soundOn(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setSoundOn(on: boolean): void {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
}

function audio(): AudioContext | null {
  if (!soundOn()) return null;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, at: number, dur: number, type: OscillatorType, gain: number) {
  const a = audio(); if (!a) return;
  const o = a.createOscillator(); const g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, a.currentTime + at);
  g.gain.setValueAtTime(0.0001, a.currentTime + at);
  g.gain.exponentialRampToValueAtTime(gain, a.currentTime + at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + at + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + at); o.stop(a.currentTime + at + dur + 0.02);
}

/** A soft click: a choice made. */
export const tick = () => { try { tone(1320, 0, 0.06, 'sine', 0.035); } catch { /* no audio */ } };

/** Moving on: a quick upward sweep. */
export function whoosh() {
  try {
    const a = audio(); if (!a) return;
    const o = a.createOscillator(); const g = a.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(320, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(960, a.currentTime + 0.16);
    g.gain.setValueAtTime(0.0001, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.04, a.currentTime + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.2);
    o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + 0.22);
  } catch { /* no audio */ }
}

/** A step saved: two bright notes. */
export const saved = () => { try { tone(784, 0, 0.12, 'triangle', 0.05); tone(1175, 0.08, 0.16, 'triangle', 0.05); } catch { /* no audio */ } };

/** A chapter complete: a rising major arpeggio with a shimmer on top. */
export function levelUp() {
  try {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.075, 0.32, 'triangle', 0.06));
    tone(2093, 0.32, 0.5, 'sine', 0.025);
  } catch { /* no audio */ }
}

/** Opening the gym: the biggest one. */
export function fanfare() {
  try {
    [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, i * 0.09, 0.42, 'triangle', 0.06));
    tone(1568, 0.55, 0.9, 'sine', 0.035);
  } catch { /* no audio */ }
}
