import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUp, CalendarDays, Check, Clock, Link2, Printer, Scale, type LucideIcon } from 'lucide-react';
import PhoneChassis from '../layout/PhoneChassis';
import GymContact from '../ui/GymContact';
import AgreementBlock from './AgreementBlock';
import type { LegalDocument } from '../../lib/legalVersions';

/**
 * The layout both legal pages share: a document, not a stack of cards.
 *
 * What it adds is navigation, never content — every word on these pages still
 * comes from the `sections` the page passes in, so the clause-to-migration
 * mapping in Terms.tsx and Privacy.tsx stays the single source:
 *
 *   - a sticky bar with a reading-progress line (a CSS variable, not state);
 *   - "at a glance" cards that jump to the clause they summarise;
 *   - contents that follow your scroll — a sidebar on wide screens, a chip
 *     rail on a phone — and link straight to a clause (`/terms#refunds`);
 *   - a copy-link button on each clause, print, and back to top.
 *
 * Motion is CSS (`legal-*` in index.css). Clauses are visible by default; the
 * rise-in only exists under `.legal-anim`, which reduced motion never sets.
 */

export interface LegalSection {
  /** Stable anchor: `/terms#<id>` deep-links to this clause. */
  id: string;
  /** "3. Cancelling, and what you get back" — the number is drawn separately. */
  title: string;
  body: string | string[];
  /** Drawn above the body — a picture of the same rule, never a new one. */
  lead?: ReactNode;
}

export interface GlanceItem {
  icon: LucideIcon;
  label: string;
  detail: string;
  /** The section id it summarises. */
  to: string;
}

interface Props {
  title: string;
  icon: LucideIcon;
  updated: string;
  /** The law the page is written to, e.g. "RA 7394". */
  framework: string;
  intro: string;
  glance: GlanceItem[];
  sections: LegalSection[];
  contactLead: string;
  other: { to: string; label: string; blurb: string };
  /** Which member document this is — shows where the reader stands with this version (0151). */
  agreement?: LegalDocument;
}

const BAR = 60;
const splitTitle = (t: string) => {
  const m = /^(\d+)\.\s*(.*)$/.exec(t);
  return m ? { n: m[1]!, text: m[2]! } : { n: '', text: t };
};
const still = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function LegalPage({ title, icon: DocIcon, updated, framework, intro, glance, sections, contactLead, other, agreement }: Props) {
  const navigate = useNavigate();
  const scroller = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(sections[0]?.id ?? '');
  const [scrolled, setScrolled] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [anim] = useState(() => !still());

  const minutes = useMemo(() => {
    const words = [intro, ...sections.flatMap((s) => (Array.isArray(s.body) ? s.body : [s.body]))]
      .join(' ').split(/\s+/).length;
    return Math.max(1, Math.round(words / 220));
  }, [intro, sections]);

  /** Vertical offset of a clause inside the scroller, clear of the sticky bar (and the rail on a phone). */
  const offsetOf = (id: string) => {
    const box = scroller.current;
    const el = document.getElementById(id);
    if (!box || !el) return null;
    const railH = rail.current && getComputedStyle(rail.current).display !== 'none' ? rail.current.offsetHeight : 0;
    return el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - BAR - railH - 12;
  };

  const jump = (id: string, smooth = true) => {
    const top = offsetOf(id);
    if (top === null) return;
    scroller.current!.scrollTo({ top, behavior: smooth && !still() ? 'smooth' : 'auto' });
    history.replaceState(null, '', `#${id}`);
  };

  // Scroll: progress as a CSS variable (no re-render per frame); state only when a threshold flips.
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const max = box.scrollHeight - box.clientHeight;
      box.style.setProperty('--read', String(max > 0 ? Math.min(1, box.scrollTop / max) : 0));
      const past = box.scrollTop > 220;
      setScrolled((s) => (s === past ? s : past));
      // The last clauses are too short to ever reach the spy's band, so the end of the page names the last one.
      const last = sections[sections.length - 1]?.id;
      if (last && max > 0 && box.scrollTop >= max - 4) setActive(last);
    };
    const on = () => { if (!frame) frame = requestAnimationFrame(paint); };
    frame = requestAnimationFrame(paint);
    box.addEventListener('scroll', on, { passive: true });
    return () => { box.removeEventListener('scroll', on); if (frame) cancelAnimationFrame(frame); };
  }, [sections]);

  // Which clause you are reading, and which clauses have come into view (for the rise-in).
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const spy = new IntersectionObserver((entries) => {
      const atEnd = box.scrollTop >= box.scrollHeight - box.clientHeight - 4;
      if (atEnd) { setActive(sections[sections.length - 1]?.id ?? ''); return; }
      const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (hit) setActive(hit.target.id);
    }, { root: box, rootMargin: '-18% 0px -72% 0px' });
    const seen = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('seen'); seen.unobserve(e.target); }
    }), { root: box, rootMargin: '0px 0px -6% 0px', threshold: 0.05 });
    box.querySelectorAll('.legal-sec').forEach((el) => { spy.observe(el); seen.observe(el); });
    box.querySelectorAll('.legal-reveal').forEach((el) => seen.observe(el));
    return () => { spy.disconnect(); seen.disconnect(); };
  }, [sections]);

  // Arriving on /terms#refunds: go straight there.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    // `#agreement` is the Today strip's link to the end of the page; it appears once the agreement has loaded.
    if (id && sections.some((s) => s.id === id)) {
      const t = setTimeout(() => jump(id, false), 60);
      return () => clearTimeout(t);
    }
    // `#agreement` and `#house-rules` are the Today strip's links. Those blocks appear only once the
    // member's agreements have loaded, so wait for them — a few seconds at most, then stay at the top.
    if (id === 'agreement' || id === 'house-rules') {
      let tries = 0;
      const t = setInterval(() => {
        if (document.getElementById(id)) { clearInterval(t); jump(id, false); }
        else if (++tries > 30) clearInterval(t);
      }, 100);
      return () => clearInterval(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the active chip visible in the phone rail — scrolling the rail only, never the page.
  useEffect(() => {
    const r = rail.current;
    const chip = r?.querySelector<HTMLElement>(`[data-chip="${active}"]`);
    if (!r || !chip) return;
    r.scrollTo({ left: chip.offsetLeft - r.clientWidth / 2 + chip.offsetWidth / 2, behavior: still() ? 'auto' : 'smooth' });
  }, [active]);

  const copyLink = (id: string) => {
    const url = `${window.location.origin}${window.location.pathname}#${id}`;
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
    });
    history.replaceState(null, '', `#${id}`);
  };

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));

  return (
    <PhoneChassis>
      <div ref={scroller} className={`legal legal-scroll${anim ? ' legal-anim' : ''}`}>
        <header className={`legal-bar${scrolled ? ' is-scrolled' : ''}`}>
          <button type="button" className="legal-iconbtn" onClick={back} aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <span className="legal-bar-title" aria-hidden={!scrolled}>{title}</span>
          <span className="legal-grow" />
          <button type="button" className="legal-iconbtn legal-hide-print" onClick={() => window.print()} aria-label="Print or save as PDF">
            <Printer size={17} />
          </button>
          <Link to={other.to} className="legal-switch">{other.label}</Link>
          <span className="legal-read" aria-hidden="true" />
        </header>

        <section className="legal-hero">
          <div className="legal-hero-glow" aria-hidden="true" />
          <div className="legal-wrap">
            <div className="legal-doc-icon"><DocIcon size={26} /></div>
            <p className="legal-eyebrow">Legal</p>
            <h1>{title}</h1>
            <div className="legal-meta">
              <span><CalendarDays size={14} /> Updated {updated}</span>
              <span><Clock size={14} /> {minutes} min read</span>
              <span><Scale size={14} /> Written to {framework}</span>
            </div>
            <p className="legal-intro">{intro}</p>

            <div className="legal-glance">
              {glance.map((g, i) => (
                <button type="button" key={g.label} className="legal-card legal-reveal"
                  style={{ ['--i' as string]: i }} onClick={() => jump(g.to)}>
                  <span className="legal-card-icon"><g.icon size={18} /></span>
                  <span className="legal-card-label">{g.label}</span>
                  <span className="legal-card-detail">{g.detail}</span>
                  <span className="legal-card-go">Read clause {splitTitle(sections.find((s) => s.id === g.to)?.title ?? '').n} <ArrowRight size={13} /></span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <div ref={rail} className="legal-rail" role="navigation" aria-label="Contents">
          {sections.map((s) => {
            const { n, text } = splitTitle(s.title);
            return (
              <button type="button" key={s.id} data-chip={s.id} className={`legal-chip${active === s.id ? ' on' : ''}`} onClick={() => jump(s.id)}>
                <b>{n}</b> {text}
              </button>
            );
          })}
        </div>

        <div className="legal-wrap legal-body">
          <nav className="legal-toc" aria-label="Contents">
            <p className="legal-toc-head">Contents</p>
            <ol>
              {sections.map((s) => {
                const { n, text } = splitTitle(s.title);
                return (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className={active === s.id ? 'on' : ''} aria-current={active === s.id ? 'location' : undefined}
                      onClick={(e) => { e.preventDefault(); jump(s.id); }}>
                      <span className="n">{n}</span><span>{text}</span>
                    </a>
                  </li>
                );
              })}
            </ol>
          </nav>

          <article className="legal-article">
            {sections.map((s) => {
              const { n, text } = splitTitle(s.title);
              return (
                <section key={s.id} id={s.id} className="legal-sec">
                  <div className="legal-sec-head">
                    <span className="legal-num">{n}</span>
                    <h2>{text}</h2>
                    <button type="button" className="legal-anchor legal-hide-print" onClick={() => copyLink(s.id)}
                      aria-label={`Copy a link to “${text}”`}>
                      {copied === s.id ? <><Check size={14} /> Copied</> : <Link2 size={15} />}
                    </button>
                  </div>
                  {s.lead}
                  {Array.isArray(s.body) ? (
                    <ul className="legal-list">
                      {s.body.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  ) : (
                    <p className="legal-p">{s.body}</p>
                  )}
                </section>
              );
            })}

            <div className="legal-end">
              {agreement && <AgreementBlock document={agreement} />}
              <div className="legal-contact"><GymContact lead={contactLead} accent="var(--color-primary-300)" /></div>
              <Link to={other.to} className="legal-next legal-hide-print">
                <span>
                  <small>Also read</small>
                  <b>{other.label}</b>
                  <em>{other.blurb}</em>
                </span>
                <ArrowRight size={20} />
              </Link>
            </div>
          </article>
        </div>

        <button type="button" className={`legal-top legal-hide-print${scrolled ? ' show' : ''}`} aria-label="Back to top"
          tabIndex={scrolled ? 0 : -1} onClick={() => scroller.current?.scrollTo({ top: 0, behavior: still() ? 'auto' : 'smooth' })}>
          <ArrowUp size={18} />
        </button>
      </div>
    </PhoneChassis>
  );
}
