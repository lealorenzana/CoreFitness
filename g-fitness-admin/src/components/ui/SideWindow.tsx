import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import GymMascot from './GymMascot';

/**
 * The floating page (owner, 2026-11-28: "keep a consistent design"): the am-* shell of Add member and Book for a
 * member. On the left, on the gym's colour: the title, a line, a big figure, a few facts and a mascot that says
 * how it stands. On the right, the work. Esc, the X or the backdrop closes it.
 */
export default function SideWindow({ label, title, blurb, figure, facts, say, art, onClose, children, ...rest }: {
  label: string; title: string; blurb: string;
  figure?: { n: ReactNode; word: string };
  facts?: { icon: ReactNode; text: ReactNode }[];
  say: string; art: string;
  onClose: () => void; children: ReactNode;
  [data: `data-${string}`]: string | boolean | undefined;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal((
    <div className="am-root" role="dialog" aria-modal="true" aria-label={label} {...rest}>
      <div className="am-scrim" onClick={onClose} />
      <div className="am-win pr-win">
        <aside className="am-side">
          <div>
            <h2>{title}</h2>
            <p>{blurb}</p>
          </div>
          {figure && <div className="pr-big"><b>{figure.n}</b><span>{figure.word}</span></div>}
          {facts && facts.length > 0 && <ul className="pr-facts">{facts.map((f, i) => <li key={i}>{f.icon}<span>{f.text}</span></li>)}</ul>}
          <div className="am-buddy" aria-hidden>
            <p key={say} className="am-say">{say}</p>
            <GymMascot src={art} />
          </div>
        </aside>
        <section className="am-main">
          <button type="button" aria-label="Close" onClick={onClose} className="am-x"><X size={16} /></button>
          <div className="am-form pr-form">{children}</div>
        </section>
      </div>
    </div>
  ), document.body);
}
