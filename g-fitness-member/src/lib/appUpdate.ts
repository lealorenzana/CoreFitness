import { registerSW } from 'virtual:pwa-register';

/**
 * Keep an installed app on the build that is actually deployed.
 *
 * **Why this exists.** The plugin used to inject its plain `registerSW.js`,
 * which registers the service worker and does nothing else. With
 * `registerType: 'autoUpdate'` a new worker installs and takes control in the
 * background — but the page that is already open keeps running the old
 * JavaScript it was served from the precache. On a phone, where the TWA is
 * resumed rather than relaunched, that meant the member app showed the old UI
 * for days after a deploy: the Nocturne redesign was live on Vercel and a
 * member's phone was still drawing the dock and the chat head. A fresh browser
 * with an old worker reproduced it exactly — the first screen old, every screen
 * after it new.
 *
 * `registerSW` from the virtual module reloads the page once the new worker
 * takes control, so a deploy reaches the screen on its own. And because an app
 * left open never re-requests `sw.js`, it also asks for an update when the app
 * comes back to the foreground and every half hour while it stays open.
 *
 * The reload happens only when a new build has just activated — never on an
 * ordinary launch — so it is at most once per deploy.
 */
const CHECK_EVERY_MS = 30 * 60 * 1000;

export function keepAppUpdated(): void {
  if (!('serviceWorker' in navigator)) return;

  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const check = () => {
        // Offline, `update()` rejects; there is nothing to do until we are back.
        if (!navigator.onLine) return;
        registration.update().catch(() => {});
      };
      setInterval(check, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });
}
