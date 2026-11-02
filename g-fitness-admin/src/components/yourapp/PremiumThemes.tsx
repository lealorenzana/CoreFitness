import { useEffect, useState } from 'react';
import { Check, Lock, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { themeState } from '../../lib/api/paymongo';
import { PREMIUM_THEMES } from '../../lib/premiumThemes';
import { loadGymLook } from '../GymLook';

/**
 * Premium themes on Your app → Look (0233): twelve whole looks — the ground,
 * surfaces and a gradient on the main buttons, bars and member card — over the
 * gym's own two colours. Part of the one-time colours unlock (the purchase on
 * Saved themes above); locked, they are shown and explained, never hidden.
 * Saving re-colours this app at once (GymLook) and the members' app on its next open.
 */
export default function PremiumThemes() {
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase.rpc('my_gym_premium_theme').then(({ data, error }) => { if (alive) setChosen(error ? null : (data as string | null)); });
    void themeState().then((t) => { if (!alive) return; setUnlocked(!!t?.custom_colours); setPrice(t?.price != null ? Number(t.price) : null); });
    return () => { alive = false; };
  }, []);

  const pick = async (key: string | null) => {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('set_premium_theme', { p_key: key });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setChosen(key);
    await loadGymLook();
    setMsg(key ? 'Saved — your members see it the next time they open the app.' : 'Back to your plain colours.');
  };

  if (chosen === undefined) return null;
  return (
    <div data-premium-themes style={{ marginTop: 14 }}>
      <div className="a-ct">
        <h3><Sparkles size={16} />Premium themes</h3>
        <small>{unlocked ? 'yours to use — part of your colours unlock' : `part of the one-time colours unlock${price ? ` (₱${price.toLocaleString('en-PH')})` : ''}`}</small>
      </div>
      {!unlocked && (
        <p className="a-sub" style={{ marginBottom: 10 }}><Lock size={12} style={{ display: 'inline', marginRight: 4 }} />
          Buy custom colours under Saved themes above to use these — one purchase unlocks your own colour codes and every premium theme.</p>
      )}
      <div className="a-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 8 }}>
        {PREMIUM_THEMES.map((t) => {
          const on = chosen === t.key;
          return (
            <button key={t.key} type="button" className={`a-opt${on ? ' on' : ''}`} disabled={busy || !unlocked} aria-pressed={on}
              onClick={() => void pick(on ? null : t.key)} data-theme-key={t.key}
              style={{ padding: 10, opacity: unlocked ? 1 : 0.6, cursor: unlocked ? 'pointer' : 'not-allowed' }}>
              {on && <span className="tick"><Check size={12} /></span>}
              <span style={{ display: 'block', height: 54, borderRadius: 10, background: t.dark.bg, border: '1px solid #ffffff14', padding: 8 }}>
                <span style={{ display: 'block', height: 14, borderRadius: 5, background: t.dark.surface, marginBottom: 6 }} />
                <span style={{ display: 'block', height: 10, width: '70%', borderRadius: 99, background: `linear-gradient(90deg, ${t.dark.grad[0]}, ${t.dark.grad[1]})` }} />
              </span>
              <b style={{ fontSize: 12.5, marginTop: 6 }}>{t.name}</b>
              <span className="a-sub">{t.blurb}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3" style={{ marginTop: 10 }}>
        {chosen && unlocked && <button type="button" className="a-btn sm ghost" disabled={busy} onClick={() => void pick(null)}>Use no premium theme</button>}
        {msg && <span className="a-sub" role="status">{msg}</span>}
      </div>
    </div>
  );
}
