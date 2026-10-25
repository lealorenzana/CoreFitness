import { useEffect, useState } from 'react';
import { Bookmark, Lock, Plus, X } from 'lucide-react';
import { showToast } from '../../utils/toast';
import { getGymThemes, saveGymThemes, type SavedTheme } from '../../lib/api/gymApp';
import { gradientOf } from '../../lib/themePairs';
import { themeState, waitForPayment } from '../../lib/api/paymongo';

/**
 * Your app → Look → Your themes (0212): a gym that bought its own colours
 * (0191's one-time unlock) keeps up to eight named colour pairs and switches
 * between them in one tap — this season's colours, an event's, the old ones.
 * Picking one fills the pickers; "Publish to members" is still what changes the
 * app. Without the unlock it says what saving needs; the database refuses too.
 */
export default function SavedThemes({ accent, action, onPick }: { accent: string; action: string; onPick: (accent: string, action: string) => void }) {
  const [state, setState] = useState<{ unlocked: boolean; themes: SavedTheme[] } | null | undefined>(undefined);
  const [price, setPrice] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => { const s = await getGymThemes(); if (alive) setState(s); };
    void load();
    void themeState().then((t) => { if (alive && t?.price != null) setPrice(Number(t.price)); });
    // Bought on this page (PayMongo, 0191): unlock in place.
    const stop = waitForPayment((st, row) => { if (st === 'paid' && (!row || row.purpose === 'custom_colours')) void load(); });
    return () => { alive = false; stop(); };
  }, []);

  if (!state) return null; // before 0212, or not the owner
  const write = async (next: SavedTheme[], ok: string) => {
    setBusy(true);
    try { await saveGymThemes(next); setState({ ...state, themes: next }); showToast(ok, 'success'); return true; }
    catch (e) { showToast(e instanceof Error ? e.message : 'That could not be saved', 'error'); return false; }
    finally { setBusy(false); }
  };
  const same = (t: SavedTheme) => t.accent.toLowerCase() === accent.toLowerCase() && t.action.toLowerCase() === (action || 'amber').toLowerCase();

  return (
    <div style={{ marginTop: 12 }} data-saved-themes>
      <div className="a-lbl" style={{ marginBottom: 6 }}>Your themes <span style={{ fontWeight: 500 }}>· saved colour pairs, one tap to use</span></div>
      {!state.unlocked ? (
        <div className="a-hint"><Lock size={15} />
          <span>Saving your own themes comes with your own colours{price != null ? ` — ₱${price.toLocaleString('en-PH')}, once` : ''}. Buy them with “Your own colour” below, then save as many as eight.</span></div>
      ) : (
        <>
          <div className="a-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
            {state.themes.map((t, i) => (
              <div key={t.name + i} className={`a-pair ${same(t) ? 'on' : ''}`} style={{ position: 'relative' }} data-saved-theme={t.name}>
                <button type="button" onClick={() => onPick(t.accent, t.action)} aria-label={`Use ${t.name}`} style={{ display: 'flex', flexDirection: 'column', gap: 5, textAlign: 'left' }}>
                  <i style={{ display: 'block', height: 20, borderRadius: 7, background: gradientOf(t.accent, t.action) }} />{t.name}
                </button>
                <button type="button" aria-label={`Delete ${t.name}`} disabled={busy} onClick={() => void write(state.themes.filter((_, k) => k !== i), `${t.name} deleted`)}
                  style={{ position: 'absolute', top: 2, right: 2, color: 'var(--a-muted)' }}><X size={12} /></button>
              </div>
            ))}
            {state.themes.length === 0 && <p className="a-sub" style={{ gridColumn: '1 / -1' }}>None saved yet. Set the two colours below, name them, and save.</p>}
          </div>
          {state.themes.length < 8 && (
            <form className="flex gap-2 items-center" style={{ marginTop: 8 }}
              onSubmit={(e) => { e.preventDefault(); const n = name.trim(); if (!n) return;
                void write([...state.themes, { name: n, accent, action: action || 'amber' }], `Saved “${n}”`).then((ok) => { if (ok) setName(''); }); }}>
              <span style={{ width: 34, height: 22, borderRadius: 7, background: gradientOf(accent, action || null), flex: 'none' }} />
              <input className="a-in" value={name} maxLength={30} placeholder="Name these colours, e.g. Christmas" aria-label="Theme name" onChange={(e) => setName(e.target.value)} />
              <button type="submit" className="a-btn sm" disabled={busy || !name.trim()}><Bookmark size={13} />Save theme</button>
            </form>
          )}
          {state.themes.length >= 8 && <p className="a-sub" style={{ marginTop: 6 }}><Plus size={11} className="inline" /> Eight is the most — delete one to save another.</p>}
        </>
      )}
    </div>
  );
}
