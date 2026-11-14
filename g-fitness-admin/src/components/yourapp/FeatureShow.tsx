import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Lock, Monitor, Smartphone, Tv } from 'lucide-react';
import { showFor, type El, type FeatureShow as Show } from '../../lib/featureShows';
import type { GymModule } from '../../lib/api/gymApp';
import { GuideButton } from '../guides/GuidePlayer';
import './featureShow.css';

type Lang = 'en' | 'fil';
const BEAT_MS = 2600;

/**
 * Your app → What you run, the right-hand side (owner, 2026-11-14): instead of a phone listing what is on, an
 * animated explainer of the part the owner is pointing at — hover or focus a row, and it acts out what that part
 * does, beat by beat, with the beat's words below. Member-facing parts play on a phone; the desk's on a screen;
 * the lobby TV on a TV. What each part IS comes from the database description; the beats (lib/featureShows.ts)
 * show how it is used. Motion is CSS transitions driven by a beat counter (setInterval, never rAF); with reduced
 * motion the finished state is shown and nothing loops.
 */
export default function FeatureShow({ module }: { module: GymModule | null }) {
  const [lang, setLang] = useState<Lang>('en');
  const navigate = useNavigate();
  const show = module ? showFor(module.feature_key) : null;

  if (!module) {
    return <div className="a-card fs fs-empty" data-feature-show><p className="a-sub">Point at a part on the left to see what it does.</p></div>;
  }

  const status = module.state === 'not_sold' ? { text: 'Not on your plan', tone: 'off' }
    : module.state === 'parent_off' ? { text: 'Off with its group', tone: 'off' }
    : module.enabled ? { text: 'On', tone: 'on' } : { text: 'Off', tone: 'off' };

  return (
    <div className="a-card fs" data-feature-show={module.feature_key}>
      <div className="fs-head">
        <div className="min-w-0">
          <small className="fs-eyebrow">{lang === 'fil' ? 'Ano ito' : 'What it does'}</small>
          <b className="fs-title">{module.label}</b>
        </div>
        <span className={`fs-status ${status.tone}`} data-fs-status>{status.text}</span>
        <div className="fs-lang" role="radiogroup" aria-label="Language">
          {(['en', 'fil'] as Lang[]).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={lang === l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>{l === 'en' ? 'EN' : 'FIL'}</button>
          ))}
        </div>
      </div>
      {show
        ? <Player key={module.feature_key} show={show} lang={lang} />
        : <div className="fs-stage"><p className="a-sub" style={{ textAlign: 'center', padding: 20 }}>{module.description}</p></div>}
      {show && <p className="fs-desc">{module.description}</p>}
      {show?.guide && (
        <div className="fs-foot">
          <GuideButton id={show.guide} lang={lang} label={lang === 'fil' ? 'Panoorin ang buong set-up' : 'Watch the full set-up'} onGo={(p) => navigate(p)} />
        </div>
      )}
    </div>
  );
}

function Player({ show, lang }: { show: Show; lang: Lang }) {
  const last = show.steps.length - 1;
  const still = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // One extra tick holds the finished screen before it starts over.
  const [tick, setTick] = useState(still ? last : 0);
  useEffect(() => {
    if (still) return;
    const id = window.setInterval(() => setTick((t) => (t >= last + 1 ? 0 : t + 1)), BEAT_MS);
    return () => window.clearInterval(id);
  }, [last, still]);
  const beat = Math.min(tick, last);
  const FrameIcon = show.frame === 'phone' ? Smartphone : show.frame === 'tv' ? Tv : Monitor;

  return (
    <>
      <div className="fs-stage" aria-hidden>
        <span className="fs-cap"><FrameIcon size={12} />{show.frame === 'phone' ? (lang === 'fil' ? 'App ng member' : 'Member’s app') : show.frame === 'tv' ? 'Lobby TV' : (lang === 'fil' ? 'Ang app mo' : 'Your app')} · {lang === 'fil' ? 'halimbawa' : 'sample'}</span>
        <div className={`fs-frame fs-${show.frame}`} data-beat={beat}>
          <div className="fs-scr">
            {show.screen.map((el, i) => <Piece key={i} el={el} beat={beat} />)}
          </div>
        </div>
      </div>
      <ol className="fs-steps" data-fs-steps>
        {show.steps.map((s, i) => (
          <li key={i} className={i === beat ? 'now' : i < beat ? 'done' : ''}>
            <span className="fs-n">{i < beat ? <Check size={11} strokeWidth={3} /> : i + 1}</span>
            <span>{lang === 'fil' ? s.fil : s.en}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

function Piece({ el, beat }: { el: El; beat: number }) {
  const shown = (el.t === 'bar' || el.t === 'chart' || el.t === 'toast' || el.t === 'tick' || el.t === 'float') ? true : beat >= (el.at ?? 0);
  const vis = shown ? 'in' : 'out';
  switch (el.t) {
    case 'head': return <div className={`fs-h ${vis}`}>{el.text}</div>;
    case 'row': {
      const hit = el.hit !== undefined && beat >= el.hit;
      return (
        <div className={`fs-row ${vis}${hit ? ' hit' : ''}`}>
          <span className="fs-row-t"><b>{el.text}</b>{el.sub && <small>{el.sub}</small>}</span>
          {el.pill && <span className="fs-pill">{el.pill}</span>}
        </div>
      );
    }
    case 'btn': {
      const pressed = el.tap !== undefined && beat === el.tap;
      const after = el.tap !== undefined && beat > el.tap && el.done;
      return (
        <div className={`fs-btn ${vis}${pressed ? ' tap' : ''}${after ? ' did' : ''}`}>
          {after ? <><Check size={13} strokeWidth={3} />{el.done}</> : el.text}
          {pressed && <span className="fs-ripple" />}
        </div>
      );
    }
    case 'bubble':
      return <div className={`fs-bub ${el.side} ${vis}`}>{el.who && <small>{el.who}</small>}{el.text}</div>;
    case 'bar': {
      const f = beat >= el.at ? el.to : el.from;
      return (
        <div className="fs-bar in">
          <div className="fs-bar-t"><span>{el.label}</span>{el.note && beat >= el.at && <b>{el.note}</b>}</div>
          <div className="fs-track"><i style={{ width: `${Math.round(f * 100)}%` }} /></div>
        </div>
      );
    }
    case 'toast':
      return <div className={`fs-toast ${beat >= el.at ? 'in' : 'out'}`}><b>{el.title}</b><span>{el.text}</span></div>;
    case 'qr':
      return (
        <div className={`fs-qr ${vis}${beat >= 1 ? ' scan' : ''}`}>
          <span /><span /><span /><span /><i className="fs-scanline" />
        </div>
      );
    case 'tick':
      return <div className={`fs-tick ${beat >= el.at ? 'in' : 'out'}`}><span><Check size={13} strokeWidth={3} /></span>{el.text}</div>;
    case 'chips':
      return <div className={`fs-chips ${vis}`}>{el.items.map((c, i) => <span key={c} className={i === el.hit ? 'on' : ''}>{c}</span>)}</div>;
    case 'tiles':
      return (
        <div className={`fs-tiles ${vis}`}>
          {Array.from({ length: el.n }, (_, i) => <span key={i}>{el.lock && <Lock size={12} />}</span>)}
        </div>
      );
    case 'chart':
      return (
        <div className={`fs-chart ${beat >= el.at ? 'drawn' : ''}`}>
          {el.values.map((v, i) => <i key={i} style={{ height: `${Math.round(v * 100)}%`, transitionDelay: `${i * 90}ms` }} />)}
        </div>
      );
    case 'float':
      return <div className={`fs-float ${beat >= el.at ? 'in' : 'out'}`}>{el.text}</div>;
  }
}
