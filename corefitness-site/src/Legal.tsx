import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
import { buildDocs, DOC_ORDER, inEffect, VERSION, type DocKey } from './legal';
import { usePlatformFacts } from './usePlatformFacts';

const MEMBER_APP = 'https://corefitness-gym.vercel.app';

/** `#legal/<doc>` or `#legal/<doc>/<section>` — read from the hash so any static host serves it. */
export function parseLegalHash(hash: string): { doc: DocKey; section: string | null } | null {
  const m = /^#legal\/(terms|dpa|privacy)(?:\/([a-z-]+))?$/.exec(hash);
  return m ? { doc: m[1] as DocKey, section: m[2] ?? null } : null;
}

const prettyDate = (iso: string) =>
  new Date(`${iso}T00:00:00+08:00`).toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Manila' });

const splitTitle = (t: string) => {
  const m = /^(\d+)\.\s*(.*)$/.exec(t);
  return m ? { n: m[1]!, text: m[2]! } : { n: '', text: t };
};

/**
 * The gym-facing documents (src/legal.ts), as a page of the site.
 *
 * The numbers a setting decides are read from `platform_public_terms()` (0154).
 * Before that migration is pasted — or if the read fails — the documents fall
 * back to wording that names no number ("the grace period shown in your gym
 * app") rather than printing one somebody typed.
 */
export default function Legal({ doc, section }: { doc: DocKey; section: string | null }) {
  const facts = usePlatformFacts();
  const live = inEffect(facts);
  const [active, setActive] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const docs = useMemo(() => buildDocs(facts), [facts]);
  const d = docs[doc];
  const anchor = (id: string) => `${doc}-${id}`;

  // Arriving on a document: to its top, or to the section the link names.
  useEffect(() => {
    const t = setTimeout(() => {
      const el = section ? document.getElementById(anchor(section)) : null;
      if (el) el.scrollIntoView({ block: 'start' });
      else window.scrollTo({ top: 0 });
    }, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, section]);

  // Which section you are reading.
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (hit) setActive(hit.target.id);
    }, { rootMargin: '-20% 0px -70% 0px' });
    document.querySelectorAll('.lg-sec').forEach((el) => io.observe(el));
    const atEnd = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        setActive(anchor(d.sections[d.sections.length - 1]!.id));
      }
    };
    window.addEventListener('scroll', atEnd, { passive: true });
    return () => { io.disconnect(); window.removeEventListener('scroll', atEnd); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, d]);

  const jump = (id: string) => {
    document.getElementById(anchor(id))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', `#legal/${doc}/${id}`);
  };
  const copy = (id: string) => {
    const url = `${window.location.origin}${window.location.pathname}#legal/${doc}/${id}`;
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
    });
  };

  return (
    <div className="lg">
      <section className="lg-hero">
        <div className="wrap">
          <a className="lg-back" href="#top" onClick={(e) => { e.preventDefault(); history.pushState(null, '', window.location.pathname); window.dispatchEvent(new HashChangeEvent('hashchange')); window.scrollTo({ top: 0 }); }}>
            <Icon name="arrow" className="flip" /> Back to Core Fitness
          </a>
          <span className="eyebrow" style={{ marginTop: 28 }}>For gyms · Legal</span>
          <div className="lg-tabs" role="tablist" aria-label="Documents">
            {DOC_ORDER.map((k) => (
              <a key={k} role="tab" aria-selected={k === doc} className={k === doc ? 'on' : ''} href={`#legal/${k}`}>{docs[k].short}</a>
            ))}
          </div>
          <h1 className="lg-title">{d.title}</h1>
          <div className="lg-meta">
            <span className="pill"><Icon name="clock" /> Version of {prettyDate(VERSION)}</span>
            <span className="pill"><Icon name="shield" /> Written to {d.law}</span>
            {!live && <span className="pill lg-draft"><Icon name="alert" /> Draft — not yet in effect</span>}
          </div>
          <p className="lede">{d.lede}</p>
          {!live && (
            <p className="note bad lg-draft-note">
              <Icon name="alert" /> {facts.published
                ? `This wording is a draft. The version in effect is the one of ${prettyDate(facts.published)}; this one binds no one until Core Fitness puts it in effect.`
                : 'This is a draft under review. Nobody has agreed to it, and it binds no one until Core Fitness puts it in effect.'}
            </p>
          )}
        </div>
      </section>

      <div className="wrap lg-body">
        <nav className="lg-toc" aria-label="Contents">
          <p className="lg-toc-head">Contents</p>
          <ol>
            {d.sections.map((s) => {
              const { n, text } = splitTitle(s.title);
              return (
                <li key={s.id}>
                  <a href={`#legal/${doc}/${s.id}`} className={active === anchor(s.id) ? 'on' : ''}
                    onClick={(e) => { e.preventDefault(); jump(s.id); }}>
                    <span className="n">{n}</span><span>{text}</span>
                  </a>
                </li>
              );
            })}
          </ol>
          <button type="button" className="cta ghost lg-print" onClick={() => window.print()}>Print or save as PDF</button>
        </nav>

        <article className="lg-article">
          {d.sections.map((s) => {
            const { n, text } = splitTitle(s.title);
            return (
              <section key={s.id} id={anchor(s.id)} className="lg-sec">
                <div className="lg-sec-head">
                  <span className="lg-num">{n}</span>
                  <h2>{text}</h2>
                  <button type="button" className="lg-link" onClick={() => copy(s.id)} aria-label={`Copy a link to “${text}”`}>
                    {copied === s.id ? <><Icon name="check" /> Copied</> : <Icon name="link" />}
                  </button>
                </div>
                {Array.isArray(s.body)
                  ? <ul className="lg-list">{s.body.map((b) => <li key={b}>{b}</li>)}</ul>
                  : <p className="lg-p">{s.body}</p>}
              </section>
            );
          })}

          <div className="lg-others">
            {DOC_ORDER.filter((k) => k !== doc).map((k) => (
              <a key={k} className="lg-other tilt" href={`#legal/${k}`}>
                <small>Also read</small>
                <b>{docs[k].title}</b>
                <span>{docs[k].lede}</span>
                <Icon name="arrow" />
              </a>
            ))}
          </div>
          <p className="lg-members">
            A member or a coach at a gym? Your gym’s own <a href={`${MEMBER_APP}/terms`}>Terms</a> and{' '}
            <a href={`${MEMBER_APP}/privacy`}>Privacy Policy</a> are in the member app.
          </p>
        </article>
      </div>
    </div>
  );
}
