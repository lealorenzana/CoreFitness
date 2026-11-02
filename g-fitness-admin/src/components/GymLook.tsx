import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getGymApp } from '../lib/api/gymApp';
import { rampFor } from '../lib/gymTheme';
import { PREMIUM_THEMES } from '../lib/premiumThemes';

/**
 * The owner's admin app wears its gym's look (2026-11-02): the accent pair the
 * members see, and the premium theme's ground, surfaces and gradient (0233).
 *
 * The redesigned pages draw from their own variables (`.att`'s `--a-*`), so the
 * look is one stylesheet that sets both those and the app's `--color-*` roles —
 * nothing on a page changes. Built from the same colour roles as the member app,
 * so light mode (next) adds a set of values, not a rewrite. Removed with the
 * account (`clearGymLook`, called from clearAdminCaches).
 */
const ID = 'gym-look';

export function clearGymLook(): void {
  document.getElementById(ID)?.remove();
}

/** Read the gym's look and put it on the page — on mount, and again after Your app saves one. */
export async function loadGymLook(alive: () => boolean = () => true): Promise<void> {
      const app = await getGymApp().catch(() => null);
      if (!alive() || !app) return;
      const { data } = await supabase.rpc('my_gym_premium_theme');
      if (!alive()) return;
      const p = rampFor(app.accent, 'violet');
      const a = rampFor(app.accent_action, 'amber');
      const t = PREMIUM_THEMES.find((x) => x.key === data)?.dark;
      const ground = t ? `
  --color-bg: ${t.bg}; --color-surface: ${t.surface}; --color-surface-raised: ${t.raised}; --color-surface-high: ${t.high};
  --grad-primary: linear-gradient(90deg, ${t.grad[0]}, ${t.grad[1]}); --grad-action: linear-gradient(135deg, ${t.grad[0]}, ${t.grad[1]});` : '';
      const att = t ? `--a-surface: ${t.surface}; --a-raised: ${t.raised}; --a-high: ${t.high};` : '';
      const css = `
:root {
  --color-primary: ${p.base}; --color-primary-hover: ${p.hover}; --color-primary-light: ${p.light};
  --color-secondary: ${a.base}; --color-secondary-hover: ${a.hover}; --color-secondary-light: ${a.light};${ground}
}
body { background: var(--color-bg); }
.att {
  --a-primary: ${p.base}; --a-p300: ${p.c300}; --a-p400: ${p.c400}; --a-plight: ${p.light};
  --a-amber: ${a.base}; --a-a300: ${a.c300}; --a-alight: ${a.light}; ${att}
}`;
      let el = document.getElementById(ID) as HTMLStyleElement | null;
      if (!el) { el = document.createElement('style'); el.id = ID; document.head.appendChild(el); }
      el.textContent = css;
}

export default function GymLook() {
  useEffect(() => {
    let alive = true;
    void loadGymLook(() => alive);
    return () => { alive = false; };
  }, []);
  return null;
}
