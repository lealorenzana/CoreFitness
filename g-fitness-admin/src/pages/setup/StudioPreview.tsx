import { useEffect, useRef, useState } from 'react';
import { Bell, CalendarDays, Dumbbell, LayoutDashboard, Moon, QrCode, Smartphone, Sun, Users, Wallet } from 'lucide-react';
import { rampFor } from '../../lib/gymTheme';

/**
 * The build studio's live result: the members' phone, or this dashboard, drawn
 * from the gym's own colours, name, logo and words as they are chosen. Members
 * pick light or dark for themselves, so the preview has its own switch. A
 * sample screen — and it says so.
 */
export default function StudioPreview({ name, shortName, logoUrl, accent, action, pointsName, welcome, members, coaches, classes, plans, hours }: {
  name: string; shortName: string; logoUrl: string | null; accent: string; action: string;
  pointsName: string; welcome: string; members: string; coaches: string; classes: string;
  plans: { name: string; price: number }[]; hours: string;
}) {
  const [view, setView] = useState<'phone' | 'dashboard'>('phone');
  const [dark, setDark] = useState(() => document.documentElement.dataset.mode !== 'light');
  const p = rampFor(accent, 'violet');
  const a = rampFor(action || null, 'amber');
  const shown = shortName.trim() || name.trim() || 'Your gym';
  const mono = shown.slice(0, 2).toUpperCase();

  // A soft ring whenever what it shows changes — the "you changed this" cue.
  const sig = [name, shortName, logoUrl, accent, action, pointsName, welcome, members, coaches, classes, plans.length].join('|');
  const [flash, setFlash] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = window.setTimeout(() => setFlash((n) => n + 1), 0);
    return () => window.clearTimeout(t);
  }, [sig]);

  const c = dark
    ? { bg: '#0B0B12', s1: '#15141F', s2: '#1C1B29', line: 'rgba(255,255,255,0.08)', ink: '#F4F4F8', sub: '#A1A1B5', mute: '#6E6E85', fillP: p.base, fillA: a.base, pText: p.c300, aText: a.c300, onA: '#120d02' }
    : { bg: `color-mix(in srgb, ${p.base} 7%, #ECECF2)`, s1: `color-mix(in srgb, ${p.base} 3%, #FBFBFD)`, s2: `color-mix(in srgb, ${p.base} 8%, #F1F1F6)`,
        line: 'rgba(22,22,38,0.16)', ink: '#15151C', sub: '#474A5C', mute: '#686B7E', fillP: p.c700, fillA: a.c700, pText: p.c700, aText: a.c700, onA: '#FFFFFF' };
  const tr = 'background 0.5s ease, color 0.5s ease, border-color 0.5s ease';

  return (
    <aside className="ob-preview" aria-label="Live preview" data-studio-preview>
      <div className="ob-pv-tabs" role="group" aria-label="What to preview">
        <button type="button" aria-pressed={view === 'phone'} onClick={() => setView('phone')}><Smartphone size={14} />Members&rsquo; app</button>
        <button type="button" aria-pressed={view === 'dashboard'} onClick={() => setView('dashboard')}><LayoutDashboard size={14} />Your dashboard</button>
        <button type="button" aria-label={dark ? 'Preview in light' : 'Preview in dark'} onClick={() => setDark(!dark)}
          style={{ flex: '0 0 38px' }} aria-pressed={false}>{dark ? <Sun size={14} /> : <Moon size={14} />}</button>
      </div>

      <div className="ob-pv-stage">
        {view === 'phone' ? (
          <div key={'p' + flash} className={flash ? 'ob-flash' : ''} data-preview-phone
            style={{ width: 252, height: 516, borderRadius: 40, padding: 9, transition: 'box-shadow .5s, background .5s',
              // In light the handset is silver (no near-black block on a light page); in dark, the black one.
              background: dark ? '#050508' : 'linear-gradient(160deg, #E4E4EC, #C9C9D5)',
              boxShadow: dark ? `0 30px 70px -30px ${p.base}` : `0 0 0 1px rgba(22,22,38,0.18), 0 30px 60px -32px ${p.base}` }}>
            <div style={{ height: '100%', borderRadius: 32, overflow: 'hidden', background: c.bg, display: 'flex', flexDirection: 'column', transition: tr }}>
              <div style={{ height: 26, display: 'grid', placeItems: 'center' }}><span style={{ width: 84, height: 18, borderRadius: 99, background: dark ? '#050508' : '#4A4A55' }} /></div>
              <div style={{ padding: '6px 14px 0', display: 'flex', alignItems: 'center', gap: 9 }}>
                <PvLogo size={30} logoUrl={logoUrl} mono={mono} fill={c.fillP} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 10, color: c.mute, fontWeight: 700 }}>Good morning</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shown}</div>
                </div>
                <Bell size={15} color={c.sub} />
              </div>
              {welcome.trim() && (
                <div style={{ margin: '10px 12px 0', padding: '8px 10px', borderRadius: 12, fontSize: 10.5, lineHeight: 1.4, color: c.ink,
                  background: dark ? `${p.base}26` : `color-mix(in srgb, ${p.base} 13%, #FFFFFF)`, border: `1px solid ${c.line}`, transition: tr }}>📣 {welcome}</div>
              )}
              <div style={{ margin: '10px 12px 0', padding: 12, borderRadius: 16, background: c.s1, border: `1px solid ${c.line}`, transition: tr }}>
                <div style={{ fontSize: 10, color: c.sub, fontWeight: 700 }}>This week</div>
                <div style={{ fontSize: 17, fontWeight: 850, color: c.pText, marginTop: 2, transition: tr }}>3 of 4 days</div>
                <div style={{ height: 6, borderRadius: 9, background: c.s2, marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ width: '75%', height: '100%', borderRadius: 9, background: c.fillP, transition: tr }} />
                </div>
              </div>
              <div style={{ margin: '8px 12px 0', padding: 12, borderRadius: 16, background: c.s1, border: `1px solid ${c.line}`, transition: tr }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: c.ink }}>1-on-1 with your {one(coaches) || 'coach'}</div>
                <div style={{ fontSize: 10, color: c.sub, marginTop: 2 }}>Today 7:00 AM{hours ? ` · open ${hours}` : ''}</div>
                <div style={{ marginTop: 9, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 11.5, fontWeight: 800,
                  background: c.fillA, color: c.onA, transition: tr }}>Book</div>
              </div>
              <div style={{ margin: '8px 12px 0', padding: '10px 12px', borderRadius: 16, background: c.s1, border: `1px solid ${c.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: tr }}>
                <span style={{ fontSize: 10.5, color: c.pText, fontWeight: 700 }}>{pointsName.trim() || 'Points'}</span>
                <span style={{ fontSize: 14, fontWeight: 850, color: c.pText }}>340</span>
              </div>
              {plans[0] && (
                <div style={{ margin: '8px 12px 0', fontSize: 10, color: c.mute, textAlign: 'center' }}>
                  {plans.slice(0, 2).map((x) => `${x.name} ₱${x.price.toLocaleString('en-PH')}`).join(' · ')}
                </div>
              )}
              <div style={{ marginTop: 'auto', borderTop: `1px solid ${c.line}`, display: 'flex', justifyContent: 'space-around', padding: '9px 6px 12px' }}>
                {([[CalendarDays, 'Today'], [Dumbbell, 'Train'], [Users, 'You'], [QrCode, 'Check in']] as const).map(([I, t], i) => (
                  <span key={t} style={{ display: 'grid', justifyItems: 'center', gap: 2, fontSize: 9, fontWeight: 700, color: i === 0 ? c.pText : c.mute }}>
                    <I size={14} />{t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div key={'d' + flash} className={flash ? 'ob-flash' : ''} data-preview-dashboard
            style={{ width: '100%', aspectRatio: '4 / 3.4', borderRadius: 16, overflow: 'hidden', display: 'flex', border: `1px solid ${c.line}`, background: c.bg, transition: tr }}>
            <div style={{ width: '34%', padding: 10, display: 'flex', flexDirection: 'column', gap: 5, borderRight: `1px solid ${c.line}`,
              background: dark ? c.s1 : `color-mix(in srgb, ${p.base} 9%, #F8F8FB)`, transition: tr }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <PvLogo size={22} logoUrl={logoUrl} mono={mono} fill={c.fillP} />
                <span style={{ fontSize: 9.5, fontWeight: 800, color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shown.toUpperCase()}</span>
              </div>
              {([[LayoutDashboard, 'Dashboard'], [Users, members ? members[0].toUpperCase() + members.slice(1) : 'Members'], [CalendarDays, 'Schedule'], [Wallet, 'Payments']] as const).map(([I, t], i) => (
                <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9.5, fontWeight: 700, padding: '5px 6px', borderRadius: 7,
                  color: i === 0 ? c.pText : c.sub, background: i === 0 ? (dark ? `${p.base}2E` : `color-mix(in srgb, ${p.base} 20%, #FFFFFF)`) : 'transparent', transition: tr }}>
                  <I size={11} />{t}
                </span>
              ))}
            </div>
            <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 850, color: c.ink }}>Good morning</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[['Checked in', '42', c.pText], ['Cash today', '₱8,400', c.aText]].map(([l, v, col]) => (
                  <div key={l} style={{ padding: 8, borderRadius: 10, background: c.s1, border: `1px solid ${c.line}` }}>
                    <div style={{ fontSize: 8.5, color: c.sub, fontWeight: 700 }}>{l}</div>
                    <div style={{ fontSize: 14, fontWeight: 850, color: col, transition: tr }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: 8, borderRadius: 10, background: c.s1, border: `1px solid ${c.line}`, flex: 1 }}>
                <div style={{ fontSize: 8.5, color: c.sub, fontWeight: 700 }}>Busy hours</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: '70%', marginTop: 6 }}>
                  {[30, 55, 80, 45, 35, 60, 90, 70, 40].map((h, i) => <span key={i} style={{ flex: 1, height: `${h}%`, borderRadius: 3, background: c.fillP, opacity: 0.35 + h / 160, transition: tr }} />)}
                </div>
              </div>
              <div style={{ alignSelf: 'flex-end', padding: '6px 10px', borderRadius: 8, fontSize: 9.5, fontWeight: 800, background: c.fillP, color: '#fff', transition: tr }}>Record payment</div>
            </div>
          </div>
        )}
      </div>
      <p className="ob-pv-cap">Sample screen — your colours, name and words, live. {view === 'phone' ? `Your ${members || 'members'} pick light or dark.` : 'This dashboard wears them too.'}</p>
    </aside>
  );
}

function PvLogo({ size, logoUrl, mono, fill }: { size: number; logoUrl: string | null; mono: string; fill: string }) {
  return (
    <span style={{ width: size, height: size, borderRadius: size * 0.3, display: 'grid', placeItems: 'center', flex: 'none', overflow: 'hidden',
      background: fill, color: '#fff', fontWeight: 800, fontSize: size * 0.36, transition: 'background 0.5s ease' }}>
      {logoUrl ? <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : mono}
    </span>
  );
}

/** "coaches" → "coach", "trainers" → "trainer": the singular for a sample line. */
const one = (w: string) => (/(ch|sh|ss|x)es$/i.test(w) ? w.slice(0, -2) : w.replace(/s$/i, ''));
