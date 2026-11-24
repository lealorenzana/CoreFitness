import type { CSSProperties } from 'react';
import './page-hero.css';

/** Today's hero card for an inner page (2026-11-24): kicker, a two-line heading with an accented end, one line, art.
 *  The page's <Page> takes `has-page-hero` so its back row stops sticking over the card. */
export function PageHero({ kicker, lead, accent, text, art, label }: {
  kicker: string; lead: string; accent: string; text: string; art: string; label: string;
}) {
  return (
    <section className="page-hero" aria-label={label}>
      <div className="page-hero-atmosphere" aria-hidden="true" />
      <div className="page-hero-orbit" aria-hidden="true" />
      <div className="page-hero-copy">
        <span>{kicker}</span>
        <h2>{lead}<br /><em>{accent}</em></h2>
        <p>{text}</p>
      </div>
      <div className="page-hero-art" aria-hidden="true" style={{ '--art': `url('${art}')` } as CSSProperties}>
        {/* A picture not made yet hides its box instead of showing a broken image. */}
        <img src={art} alt="" onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} /><span />
      </div>
    </section>
  );
}

/** Today's numbered chapter heading. The number counts itself (CSS counter), so a missing chapter never leaves a gap. */
export function Chapter({ id, title, text }: { id: string; title: string; text: string }) {
  return (
    <div className="page-chapter">
      <span aria-hidden="true" />
      <div><h2 id={id}>{title}</h2><p>{text}</p></div>
    </div>
  );
}
