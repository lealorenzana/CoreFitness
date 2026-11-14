import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GUIDES, guideById, type Guide, type L, type Scene } from '../../lib/guides';
import './guides.css';

/**
 * The animated set-up guides (2026-11-14). A guide opens over the page: an animated scene that acts out the
 * step (a browser, the sidebar, a switch, a phone, the kiosk, the TV…) beside the step's words, Back/Next,
 * EN | Filipino, and "Take me there". Motion is CSS only (gd-* in guides.css; never requestAnimationFrame),
 * in the gym's own colours, light and dark; with reduced motion every scene shows its finished state.
 *
 * BYTE-IDENTICAL in g-fitness-admin and g-fitness-member (no icon library, no router) — diff before changing.
 */

export type Lang = 'en' | 'fil';
const tx = (l: L, lang: Lang) => (lang === 'fil' ? l.fil : l.en);

/** A small button that opens one guide — put it beside the feature it explains. */
export function GuideButton({ id, label, lang = 'en', onGo }: { id: string; label?: string; lang?: Lang; onGo?: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  const g = guideById(id);
  if (!g) return null;
  return (
    <>
      <button type="button" className="gd-open" data-guide-button={id} onClick={() => setOpen(true)}>
        <PlayMark /> {label ?? (lang === 'fil' ? 'Paano ito i-set up' : 'How to set this up')}
      </button>
      {open && <GuidePlayer guide={g} lang={lang} onClose={() => setOpen(false)} onGo={onGo} />}
    </>
  );
}

/** Every guide for this reader, as cards (Help → Guides). */
export function GuideList({ forWho, lang = 'en', onGo }: { forWho: 'owner' | 'member'; lang?: Lang; onGo?: (path: string) => void }) {
  const [open, setOpen] = useState<Guide | null>(null);
  // Owners also get the member guides, to show members how.
  const list = GUIDES.filter((g) => forWho === 'owner' || g.for === 'member');
  return (
    <div className="gd-list" data-guide-list>
      {list.map((g) => (
        <button key={g.id} type="button" className="gd-card" data-guide-card={g.id} onClick={() => setOpen(g)}>
          <span className="gd-card-ico"><PlayMark /></span>
          <span className="gd-card-body">
            <b>{tx(g.title, lang)}</b>
            <small>{tx(g.blurb, lang)}</small>
            <em>{g.steps.length} {lang === 'fil' ? 'hakbang' : 'steps'}{g.for === 'member' && forWho === 'owner' ? (lang === 'fil' ? ' · para sa members' : ' · for members') : ''}</em>
          </span>
        </button>
      ))}
      {open && <GuidePlayer guide={open} lang={lang} onClose={() => setOpen(null)} onGo={onGo} />}
    </div>
  );
}

export function GuidePlayer({ guide, lang: lang0 = 'en', onClose, onGo }: { guide: Guide; lang?: Lang; onClose: () => void; onGo?: (path: string) => void }) {
  const [i, setI] = useState(0);
  const [lang, setLang] = useState<Lang>(lang0);
  const step = guide.steps[i];
  const last = i === guide.steps.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, guide.steps.length - 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guide, onClose]);

  const go = () => {
    if (!guide.where) return;
    onClose();
    if (onGo) onGo(guide.where); else window.location.assign(guide.where);
  };

  return createPortal(
    <div className="gd-scrim" onClick={onClose} data-guide-player={guide.id}>
      <div className="gd-dialog" role="dialog" aria-modal="true" aria-label={tx(guide.title, lang)} onClick={(e) => e.stopPropagation()}>
        <div className="gd-head">
          <div className="gd-head-t">
            <small>{lang === 'fil' ? 'Gabay' : 'Guide'} · {i + 1}/{guide.steps.length}</small>
            <h2>{tx(guide.title, lang)}</h2>
          </div>
          <div className="gd-lang" role="radiogroup" aria-label="Language">
            {(['en', 'fil'] as Lang[]).map((l) => (
              <button key={l} type="button" role="radio" aria-checked={lang === l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>
                {l === 'en' ? 'EN' : 'FIL'}
              </button>
            ))}
          </div>
          <button type="button" className="gd-x" aria-label={lang === 'fil' ? 'Isara' : 'Close'} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <div className="gd-body">
          {/* key = step: the scene's animation restarts on every step */}
          <div className="gd-stage" key={`${guide.id}-${i}`} aria-hidden>
            <SceneView s={step.scene} />
          </div>
          <div className="gd-words" key={`w-${guide.id}-${i}-${lang}`}>
            <span className="gd-n">{i + 1}</span>
            <h3>{tx(step.title, lang)}</h3>
            <p>{tx(step.text, lang)}</p>
          </div>
        </div>

        <div className="gd-foot">
          <div className="gd-dots" aria-hidden>
            {guide.steps.map((_, n) => <span key={n} className={n === i ? 'on' : n < i ? 'done' : ''} />)}
          </div>
          {guide.where && <button type="button" className="gd-btn ghost" onClick={go}>{lang === 'fil' ? 'Dalhin ako roon' : 'Take me there'}</button>}
          <button type="button" className="gd-btn ghost" disabled={i === 0} onClick={() => setI(i - 1)}>{lang === 'fil' ? 'Bumalik' : 'Back'}</button>
          {last
            ? <button type="button" className="gd-btn fill" onClick={() => setI(0)}>{lang === 'fil' ? 'Ulitin' : 'Replay'}</button>
            : <button type="button" className="gd-btn fill" onClick={() => setI(i + 1)}>{lang === 'fil' ? 'Susunod' : 'Next'}</button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PlayMark() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>;
}
function Check({ size = 40 }: { size?: number }) {
  return <svg className="gd-check" width={size} height={size} viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="21" /><path d="M14 25l7 7 13-15" /></svg>;
}
function Phone({ children }: { children: ReactNode }) {
  return <div className="gd-phone"><div className="gd-notch" />{children}</div>;
}

/** One animated scene per step kind. Pure CSS motion; shapes only, plus the step's own labels. */
function SceneView({ s }: { s: Scene }) {
  switch (s.k) {
    case 'browser':
      return (
        <div className="gd-browser">
          <div className="gd-bar"><i /><i /><i /><span className="gd-url"><span className="gd-type">{s.url}</span></span></div>
          <div className="gd-page">
            <div className="gd-line w60" /><div className="gd-line w80" /><div className="gd-line w40" />
            <span className="gd-cta">{s.cta}</span>
            <span className="gd-tap" />
          </div>
        </div>
      );
    case 'nav':
      return (
        <div className="gd-app">
          <div className="gd-side">
            {['Dashboard', ...s.path, 'Help'].filter((v, n, a) => a.indexOf(v) === n).slice(0, 6).map((row) => {
              const at = s.path.indexOf(row);
              return <div key={row} className={`gd-row${at >= 0 ? ' hit' : ''}`} style={at >= 0 ? { animationDelay: `${0.5 + at * 1.1}s` } : undefined}><i />{row}</div>;
            })}
          </div>
          <div className="gd-main"><div className="gd-line w60" /><div className="gd-line w80" /><div className="gd-card-ph" /></div>
        </div>
      );
    case 'toggle':
      return (
        <div className="gd-panel">
          <div className="gd-setting"><span><b>{s.label}</b><small /></span><span className="gd-switch"><i /></span></div>
          <div className="gd-setting dim"><span><b /><small /></span><span className="gd-switch off"><i /></span></div>
          <span className="gd-tap at-switch" />
        </div>
      );
    case 'form':
      return (
        <div className="gd-panel">
          <label className="gd-label">{s.label}</label>
          <div className="gd-input"><span className={`gd-type${s.secret ? ' secret' : ''}`}>{s.value}</span><span className="gd-caret" /></div>
          <span className="gd-cta late">{s.cta}</span>
          <span className="gd-tap at-cta" />
        </div>
      );
    case 'phone':
      return (
        <Phone>
          {s.screen === 'pay' && <><div className="gd-ph-t">Renew</div><div className="gd-ph-plan on">Monthly · ₱1,500</div><div className="gd-ph-plan">Quarterly</div><span className="gd-ph-btn pulse">Pay in the app</span></>}
          {s.screen === 'qr' && <><div className="gd-ph-t">Check in</div><div className="gd-qr"><span /><span /><span /><span /></div><div className="gd-ph-code">7K2 QF9</div></>}
          {s.screen === 'install' && <><div className="gd-ph-t">core-fitness.apk</div><div className="gd-prog"><i /></div><span className="gd-ph-btn pulse late">Install</span></>}
          {s.screen === 'share' && <><div className="gd-ph-t">Safari</div><div className="gd-sheet"><div>Copy</div><div className="hit">Add to Home Screen</div><div>Bookmark</div></div></>}
          {s.screen === 'notify' && <><div className="gd-ph-t">Today</div><div className="gd-ph-card"><b>Turn on notifications</b><span className="gd-ph-btn pulse">Turn on</span></div></>}
          {s.screen === 'allow' && <><div className="gd-ph-t">Core Fitness</div><div className="gd-ph-dialog"><b>Allow?</b><div><span>Don’t allow</span><span className="hit">Allow</span></div></div></>}
          {s.screen === 'chat' && <><div className="gd-ph-t">Gym chat</div><div className="gd-bub l">Leg day 6pm? 💪</div><div className="gd-bub r">I’m in!</div><div className="gd-bub l late">See you there</div></>}
          {s.screen === 'reel' && <><div className="gd-reel"><span className="gd-reel-play"><PlayMark /></span></div><div className="gd-heart">♥</div></>}
        </Phone>
      );
    case 'kiosk':
      return (
        <div className="gd-kiosk">
          <div className="gd-tablet"><div className="gd-cam" /><div className="gd-frame"><span className="gd-scanline" /></div><div className="gd-ok late"><Check size={26} /> Mia</div></div>
          <div className="gd-mini-phone"><div className="gd-qr sm"><span /><span /><span /><span /></div></div>
        </div>
      );
    case 'tv':
      return (
        <div className="gd-tvwrap">
          <div className="gd-tv">
            <span className="gd-live">LIVE</span>
            <div className="gd-slides"><div>Today · 6:00 PM HIIT</div><div>42 checked in</div><div>Open till 10pm</div></div>
          </div>
          <div className="gd-stand" />
          {s.key && <span className="gd-key">{s.key}</span>}
        </div>
      );
    case 'cable':
      return (
        <div className="gd-cable">
          <div className="gd-laptop"><div className="gd-scr" /><div className="gd-base" /></div>
          <svg className="gd-wire" viewBox="0 0 120 40" preserveAspectRatio="none"><path d="M2 30 C 40 30, 60 6, 118 10" /></svg>
          <div className="gd-tv sm"><span className="gd-live late">HDMI</span></div>
        </div>
      );
    case 'slip':
      return (
        <div className="gd-printer">
          <div className="gd-slot" />
          <div className="gd-paper"><b>Login slip</b><div><small>Username</small>ana.cruz</div><div><small>One-time password</small>7Hq-29xk</div></div>
        </div>
      );
    case 'hold':
      return (
        <div className="gd-panel center">
          <div className="gd-hold">
            <svg viewBox="0 0 64 64"><circle className="bg" cx="32" cy="32" r="28" /><circle className="fg" cx="32" cy="32" r="28" /></svg>
            <span>{s.label}</span>
          </div>
          <small className="gd-holdtip">Hold…</small>
        </div>
      );
    case 'done':
      return (
        <div className="gd-panel center">
          <Check size={58} />
          <b className="gd-done">{s.text}</b>
        </div>
      );
  }
}
