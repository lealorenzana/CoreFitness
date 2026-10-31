import { useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, ImagePlus, Lock, Monitor, Tv } from 'lucide-react';
import { Link } from 'react-router-dom';
import TvBoard from '../tv/TvBoard';
import { showToast } from '../../utils/toast';
import { uploadMedia } from '../../lib/api/media';
import { rampFor } from '../../lib/gymTheme';
import { TV_PANELS, loadTv, loadTvDesign, saveTvDesign, withDefaults, type TvData, type TvDesign, type TvPanel, type TvTheme } from '../../lib/api/tv';
import { cropPhoto } from '../ui/PhotoCropper';

const THEMES: { key: TvTheme; label: string }[] = [
  { key: 'dark', label: 'Dark' }, { key: 'brand', label: 'Your colour' }, { key: 'light', label: 'Light' },
];

/**
 * Your app → Lobby TV (0209): the gym designs the screen on its wall — theme,
 * a background photo of its own, which panels show and for how long, a
 * headline, and whether the clock, today's count and the join code show. The
 * preview is the real board (components/tv/TvBoard) with this gym's real data,
 * scaled down, so what is set here is what the TV shows. Owner only; a plan
 * without the TV locks the tab and says so (gates lock and explain).
 */
export default function TvTab() {
  const [gate, setGate] = useState<{ allowed: boolean; sold: boolean; design: TvDesign } | null | undefined>(undefined);
  const [data, setData] = useState<TvData | null>(null);
  const [d, setD] = useState<ReturnType<typeof withDefaults>>(withDefaults(null));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

  useEffect(() => {
    void (async () => {
      const [g, tv] = await Promise.all([loadTvDesign(), loadTv()]);
      setGate(g); setData(tv);
      if (g) setD(withDefaults(g.design));
    })();
  }, []);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / 1920);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [gate]);

  const save = async () => {
    setSaving(true);
    try {
      const out: TvDesign = { theme: d.theme, panels: d.panels, seconds: d.seconds, show_clock: d.show_clock, show_count: d.show_count, show_qr: d.show_qr,
        ...(d.headline?.trim() ? { headline: d.headline.trim() } : {}), background_url: d.background_url ?? null };
      await saveTvDesign(out);
      showToast('Saved. The TV picks it up within a minute.', 'success');
    } catch (e) { showToast(e instanceof Error ? e.message : 'That could not be saved', 'error'); }
    finally { setSaving(false); }
  };
  const togglePanel = (k: TvPanel) => setD((x) => ({ ...x, panels: x.panels.includes(k) ? x.panels.filter((p) => p !== k) : TV_PANELS.map((p) => p.key).filter((p) => p === k || x.panels.includes(p)) }));

  if (gate === undefined && !data) return <p className="a-sub">Loading…</p>;
  if (gate === undefined) {
    return <div className="a-card"><p className="a-sub">Designing the lobby TV needs migration 0209, which is not pasted yet. The TV itself still runs at /tv as before.</p></div>;
  }
  if (gate === null) return <div className="a-card"><p className="a-sub">Only the gym&rsquo;s owner designs the lobby TV.</p></div>;

  return (
    <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.1fr)', flex: 1 }} data-tv-tab>
      <div className="a-card a-scroll">
        <div className="a-ct"><h3><Tv size={16} />Lobby TV</h3>
          {gate.allowed ? <span className="a-pill v">on your plan</span> : <span className="a-pill"><Lock size={11} />{gate.sold ? 'switched off' : 'not on your plan'}</span>}</div>
        {!gate.allowed && (
          <div className="a-hint" style={{ marginBottom: 10 }}><Lock size={15} />
            <span>{gate.sold
              ? <>The TV is switched off under What you run. Switch it on there, then design it here.</>
              : <>Your Core Fitness plan does not include the lobby TV. <Link to="/subscription" style={{ color: 'var(--a-p300)' }}>See your plan</Link> — you can still look at how it would look.</>}</span>
          </div>
        )}
        <div className="a-lbl" style={{ marginBottom: 6 }}>Theme</div>
        <div className="a-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {THEMES.map((t) => {
            const r = rampFor(data?.app?.accent, 'violet');
            const swatch = t.key === 'dark' ? '#07070A' : t.key === 'light' ? '#F7F5FD' : `linear-gradient(135deg, ${r.c700}, ${r.c900})`;
            return (
            <button key={t.key} type="button" className={`a-pair ${d.theme === t.key ? 'on' : ''}`} aria-pressed={d.theme === t.key} onClick={() => setD({ ...d, theme: t.key })}>
              <i style={{ background: swatch, height: 34, border: '1px solid #ffffff22' }} />{t.label}
            </button>
            );
          })}
        </div>

        <div className="a-lbl" style={{ margin: '14px 0 6px' }}>Background photo <span style={{ fontWeight: 500 }}>· optional, one of your own</span></div>
        <div className="flex items-center gap-2.5">
          {d.background_url
            ? <img src={d.background_url} alt="" style={{ width: 120, height: 68, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--a-line)' }} />
            : <span style={{ width: 120, height: 68, borderRadius: 10, border: '1px dashed var(--a-line)', display: 'grid', placeItems: 'center' }} className="a-sub">None</span>}
          <label className="a-btn sm" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
            <ImagePlus size={13} />{uploading ? 'Uploading…' : d.background_url ? 'Change' : 'Choose a photo'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploading}
              onChange={(e) => {
                const raw = e.target.files?.[0]; e.target.value = '';
                if (!raw) return;
                void (async () => {
                const f = await cropPhoto(raw, { aspect: 16 / 9, title: 'Frame the TV background' });
                if (!f) return;
                setUploading(true);
                void uploadMedia(f, 'tv').then((url) => setD((x) => ({ ...x, background_url: url })))
                  .catch((err) => showToast(err instanceof Error ? err.message : 'That photo would not upload', 'error'))
                  .finally(() => setUploading(false));
                })();
              }} />
          </label>
          {d.background_url && <button type="button" className="a-btn ghost sm" onClick={() => setD({ ...d, background_url: null })}>Remove</button>}
        </div>
        <p className="a-sub" style={{ marginTop: 4 }}>A wide photo of your floor works best; a wash keeps the words readable.</p>

        <div className="a-fld" style={{ marginTop: 14 }}>
          <label htmlFor="tv-headline">Headline <span style={{ fontWeight: 500 }}>· a band under your name, optional</span></label>
          <input id="tv-headline" className="a-in" maxLength={140} value={d.headline ?? ''} placeholder="e.g. Open till 10pm tonight · New squat racks are in"
            onChange={(e) => setD({ ...d, headline: e.target.value })} />
        </div>

        <div className="a-lbl" style={{ margin: '14px 0 2px' }}>What it shows <span style={{ fontWeight: 500 }}>· a panel with nothing in it is skipped</span></div>
        {TV_PANELS.map((p) => (
          <div key={p.key} className="a-setting" data-tv-panel={p.key}>
            <div className="t"><b>{p.label}</b><small>{p.hint}</small></div>
            <button type="button" className={`a-toggle ${d.panels.includes(p.key) ? '' : 'off'}`} aria-pressed={d.panels.includes(p.key)} aria-label={`Show ${p.label}`} onClick={() => togglePanel(p.key)} />
          </div>
        ))}
        <div className="a-setting">
          <div className="t"><b>Each panel shows for</b><small>then the next one slides in</small></div>
          <div className="flex gap-1.5">
            {[8, 12, 20, 30].map((n) => <button key={n} type="button" className={`a-chip ${d.seconds === n ? 'on' : ''}`} onClick={() => setD({ ...d, seconds: n })}>{n}s</button>)}
          </div>
        </div>
        {([['show_clock', 'The clock', 'top right'], ['show_count', 'Today’s count', 'how many trained here today — a number, never names'], ['show_qr', 'Your join code', 'a QR people scan to get your app']] as const).map(([k, label, hint]) => (
          <div key={k} className="a-setting">
            <div className="t"><b>{label}</b><small>{hint}</small></div>
            <button type="button" className={`a-toggle ${d[k] ? '' : 'off'}`} aria-pressed={d[k]} aria-label={`Show ${label}`} onClick={() => setD({ ...d, [k]: !d[k] })} />
          </div>
        ))}
        <div className="flex gap-2 items-center" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
          <a href="/tv" target="_blank" rel="noreferrer" className="a-btn ghost"><ExternalLink size={14} />Open the TV</a>
          <button type="button" className="a-btn violet" disabled={saving || uploading || !gate.allowed || d.panels.length === 0} onClick={() => void save()}>
            <Check size={15} />{saving ? 'Saving…' : 'Save the design'}
          </button>
        </div>
        {d.panels.length === 0 && <p className="a-sub" style={{ textAlign: 'right', marginTop: 4, color: 'var(--a-a300)' }}>Pick at least one panel.</p>}
      </div>

      <div className="a-stage" style={{ flexDirection: 'column', padding: '34px 18px 18px', gap: 10 }}>
        <div className="cap"><Monitor size={13} />Live preview · your real data, as the TV shows it</div>
        <div ref={box} style={{ width: '100%', aspectRatio: '16 / 9', position: 'relative', overflow: 'hidden', borderRadius: 12, border: '6px solid #050508', boxShadow: '0 30px 70px #000c' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <TvBoard data={data} design={d} />
          </div>
        </div>
        <p className="a-sub" style={{ textAlign: 'center' }}>Open /tv on the gym computer connected to your TV, signed in as the owner or the desk, and press F11.</p>
      </div>
    </div>
  );
}
