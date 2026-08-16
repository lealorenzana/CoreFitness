/**
 * The in-app notification chime.
 *
 * Synthesised with the Web Audio API rather than shipped as an mp3: it is two
 * sine tones, and an audio file would add a network request and a licensing
 * question to something worth about twenty lines.
 *
 * Browsers refuse to start an AudioContext before the user has interacted with
 * the page, so this fails silently by design — a member who has not touched the
 * screen yet simply hears nothing, which is correct. Never surface an error for
 * a failed chime; the notification itself is what matters.
 */

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/** A short two-note rise. No-op when audio is unavailable or still blocked. */
export function playNotificationSound(): void {
  try {
    const audio = context();
    if (!audio) return;
    // Suspended is the normal state before the first gesture; resume() is a
    // promise that rejects harmlessly if the gesture has not happened yet.
    if (audio.state === 'suspended') void audio.resume().catch(() => {});

    const now = audio.currentTime;
    [
      { freq: 660, at: 0 },
      { freq: 880, at: 0.11 },
    ].forEach(({ freq, at }) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;

      // Ramped, not switched: a square-edged start and stop clicks audibly.
      gain.gain.setValueAtTime(0, now + at);
      gain.gain.linearRampToValueAtTime(0.14, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.16);

      osc.connect(gain).connect(audio.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.18);
    });
  } catch {
    /* Audio is a courtesy. Never let it break the caller. */
  }
}
