import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ThemeProvider } from './contexts/ThemeContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);

/**
 * Dismiss the boot splash in index.html.
 *
 * `MIN_SPLASH_MS` is a floor, not a delay: on a warm load React is up almost
 * instantly and a splash that appears and vanishes inside a frame or two reads
 * as a glitch. On the slow first load this exists for, the bundle usually takes
 * longer than the floor anyway, so it costs nothing there.
 *
 * **Every step here is a timer, not a frame callback.** The first version waited
 * on a double `requestAnimationFrame` to be sure React had painted. rAF does not
 * fire while the page isn't compositing — a background tab, or a phone whose
 * screen locks during launch — so the splash simply stayed, covering the app
 * with no way past it. Caught by loading the page in a hidden pane, where it
 * reproduced every time. Timers still fire in that state, and `visibilitychange`
 * covers the case where throttling stretched them.
 */
const MIN_SPLASH_MS = 2500;
/** Matches the 0.45s fade in index.html, plus slack. */
const FADE_MS = 900;

const boot = document.getElementById('boot');
if (boot) {
  const startedAt = performance.now();
  let dismissed = false;

  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    boot.classList.add('is-gone');
    // transitionend does not fire on a hidden page either, so the timer is the
    // one that actually removes the node in that case.
    boot.addEventListener('transitionend', () => boot.remove(), { once: true });
    setTimeout(() => boot.remove(), FADE_MS);
  };

  const remaining = () => Math.max(0, MIN_SPLASH_MS - (performance.now() - startedAt));

  setTimeout(dismiss, MIN_SPLASH_MS);

  // A hidden tab has its timers throttled, so the one above can overshoot by a
  // long way. Catch up when someone actually looks at the page — but still
  // honour the floor, or tabbing away and back inside it would cut the splash
  // short, which is the flicker the floor exists to prevent.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') setTimeout(dismiss, remaining());
  });
}
