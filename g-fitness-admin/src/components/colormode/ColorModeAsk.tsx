import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { colorModeMustAsk, onColorModeAsk, previewColorMode, setColorMode, type ColorMode } from '../../lib/colorMode';
import './colorModeAsk.css';

/**
 * The first sign-in question (0254, the owner 2026-11-14): Light, Dark, or Match my phone.
 *
 * Shown once per ACCOUNT while `my_color_mode_asked()` says it never chose — never per phone, so a second
 * phone does not ask again. Tapping a choice shows it at once (a preview, not saved); Continue saves it on
 * the account through set_color_mode(), which also answers the question. Choosing in Settings or with the
 * admin's sun/moon answers it too. Before 0254 is pasted, or offline, it never appears.
 *
 * BYTE-IDENTICAL in g-fitness-admin and g-fitness-member (with colorModeAsk.css) — diff before changing one.
 * Its words live here in English and Filipino because the admin app has no translation table.
 */
type Lang = 'en' | 'fil';
type App = 'member' | 'admin';

const WORDS = {
  title: { en: 'How should the app look?', fil: 'Paano mo gustong makita ang app?' },
  hintMember: { en: 'Pick one. You can change it any time in Settings.', fil: 'Pumili ka. Puwede mo itong palitan anytime sa Settings.' },
  hintAdmin: { en: 'Pick one. The sun and moon at the top change it any time.', fil: 'Pumili ka. Mapapalitan mo ito anytime sa araw at buwan sa itaas.' },
  systemMember: { en: 'Match my phone', fil: 'Kapareho ng phone ko' },
  systemAdmin: { en: 'Match my device', fil: 'Kapareho ng device ko' },
  systemLineMember: { en: 'Follows your phone’s light or dark setting', fil: 'Susunod sa light o dark ng phone mo' },
  systemLineAdmin: { en: 'Follows this computer’s light or dark setting', fil: 'Susunod sa light o dark ng computer na ito' },
  light: { en: 'Light', fil: 'Light' },
  lightLine: { en: 'Bright and clear for daytime', fil: 'Maliwanag, bagay sa araw' },
  dark: { en: 'Dark', fil: 'Dark' },
  darkLine: { en: 'Easy on the eyes at night', fil: 'Hindi masakit sa mata sa gabi' },
  go: { en: 'Continue', fil: 'Ituloy' },
} as const;

function Screen({ tone }: { tone: 'light' | 'dark' }) {
  return (
    <span className={`cma-scr cma-${tone}`} aria-hidden="true">
      <i className="cma-top" /><i className="cma-card" /><i className="cma-card cma-short" /><i className="cma-pill" />
    </span>
  );
}

export default function ColorModeAsk({ app, lang = 'en' }: { app: App; lang?: Lang }) {
  const [ask, setAsk] = useState(colorModeMustAsk());
  const [choice, setChoice] = useState<ColorMode>('system');
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => onColorModeAsk(setAsk), []);
  useEffect(() => { if (ask) first.current?.focus(); }, [ask]);
  if (!ask) return null;

  const w = (k: keyof typeof WORDS) => WORDS[k][lang];
  const OPTIONS: [ColorMode, string, string][] = [
    ['system', w(app === 'admin' ? 'systemAdmin' : 'systemMember'), w(app === 'admin' ? 'systemLineAdmin' : 'systemLineMember')],
    ['light', w('light'), w('lightLine')],
    ['dark', w('dark'), w('darkLine')],
  ];
  const pick = (m: ColorMode) => { setChoice(m); previewColorMode(m); };
  const done = () => { void setColorMode(choice); };

  return createPortal(
    <div className="cma-back" data-color-mode-ask>
      <div className="cma-box" role="dialog" aria-modal="true" aria-labelledby="cma-title">
        <h2 id="cma-title" className="cma-title">{w('title')}</h2>
        <p className="cma-hint">{w(app === 'admin' ? 'hintAdmin' : 'hintMember')}</p>
        <div className="cma-opts" role="radiogroup" aria-labelledby="cma-title">
          {OPTIONS.map(([m, label, line], i) => (
            <button key={m} ref={i === 0 ? first : undefined} type="button" role="radio" aria-checked={choice === m}
              className="cma-opt" data-on={choice === m} data-mode-choice={m} onClick={() => pick(m)}>
              <span className="cma-art">
                {m === 'system'
                  ? <span className="cma-split"><Screen tone="light" /><Screen tone="dark" /></span>
                  : <Screen tone={m} />}
                {choice === m && <span className="cma-tick"><Check size={12} strokeWidth={3} /></span>}
              </span>
              <span className="cma-label">{label}</span>
              <span className="cma-line">{line}</span>
            </button>
          ))}
        </div>
        <button type="button" className="cma-go" onClick={done} data-color-mode-go>{w('go')}</button>
      </div>
    </div>,
    document.body,
  );
}
