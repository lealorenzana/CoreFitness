import { useEffect, useRef, useState } from 'react';
import { CATALOGUE, FEATURE_COUNT, WHERE, WHERE_LABEL } from './catalogue';
import { DETAIL } from './catalogueDetail';
import { pinProgress, reducedMotion, useChapter } from './motion';

/**
 * The scroll-told sections added 2026-10-11 — each one a different scroll
 * technique, and each one carrying real content:
 *
 *   Manifesto   text reveal — the words light up one by one as you scroll
 *   Phone3D     assembling — the member's Today screen builds itself piece by
 *               piece with the scroll; each line on the left jumps to its piece
 *   Scrub       scrubbing — a 28-day calendar tied to the scrollbar: a member's
 *               first month, any passed day tappable (replaced the canvas 2026-11-21)
 *   Catalogue   sticky / pinning — each group's title holds while its
 *               features scroll past; every feature in the system is listed
 *
 * (Parallax and the scroll-linked marquee live in index.css on the hero, the
 * photo bands and the ticker.) Without motion everything renders whole and
 * still: every piece in place, every day filled in.
 */

/* ---------------------------------------------------------------- text reveal */

const MANIFESTO = 'Most gym software stops at the counter. Core Fitness goes home with your members: their check-in code, their workouts, their coach, their streak. And it comes back to your desk as renewals.';

export function Manifesto() {
  const words = MANIFESTO.split(' ');
  return (
    <section className="manifesto" data-pin aria-label="Why Core Fitness">
      <div className="manifesto-stage">
        <p className="manifesto-text" style={{ ['--n' as string]: words.length }}>
          {words.map((w, i) => (
            <span key={i} className={/check-in|workouts,|coach,|streak|renewals\./.test(w) ? 'mw hl-word' : 'mw'} style={{ ['--i' as string]: i }}>{w} </span>
          ))}
        </p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- the member's screen, assembling */

/**
 * The member app's Today screen builds itself as you scroll: each piece slides into its slot while
 * its line on the left lights up (scroll-linked, by chapter), and every line is a button that jumps
 * to its piece (interactive). The phone stays upright and readable at every point — no 3D tumble.
 */
const PIECES = [
  { key: 'code', title: 'Their check-in code', body: 'Shown at the desk, or at the kiosk by the door.' },
  { key: 'next', title: 'Their next session', body: 'The time, the coach, and whether it was accepted.' },
  { key: 'streak', title: 'Their streak, in weeks', body: 'Training days this week, and how many are left.' },
  { key: 'ai', title: 'The assistant', body: 'It proposes; nothing changes until they tap Apply.' },
];

/** Scrolls a pinned section to the middle of chapter `i` of `n`. */
export function jumpToChapter(el: HTMLElement | null, i: number, n: number) {
  if (!el) return;
  const span = el.offsetHeight - window.innerHeight;
  const top = el.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: top + span * ((i + 0.5) / n), behavior: reducedMotion() ? 'auto' : 'smooth' });
}

const MiniQr = () => (
  <svg viewBox="0 0 7 7" className="mini-qr" aria-hidden="true">
    {[[0, 0], [4, 0], [0, 4]].map(([x, y]) => <rect key={`${x}${y}`} x={x + .35} y={y + .35} width="2.3" height="2.3" rx=".4" fill="none" stroke="currentColor" strokeWidth=".7" />)}
    {[[1.2, 1.2], [5.2, 1.2], [1.2, 5.2], [4.2, 4.2], [5.6, 5.6], [4.2, 5.8], [5.8, 4.2]].map(([x, y]) => <rect key={`${x}${y}`} x={x} y={y} width=".7" height=".7" />)}
  </svg>
);

export function Phone3D() {
  const [ref, step] = useChapter<HTMLElement>(PIECES.length);
  const at = reducedMotion() ? PIECES.length - 1 : step;
  const cls = (i: number) => `as-piece${i <= at ? ' in' : ''}${i === at ? ' now' : ''}`;
  return (
    <section className="assemble" ref={ref} data-pin style={{ ['--n' as string]: PIECES.length }} aria-label="The member app, piece by piece">
      <div className="as-stage">
        <div className="as-copy">
          <h2>One phone. Everything that brings them back.</h2>
          <p className="section-lede">The screen a member opens every day, built here piece by piece. Tap a line to see its part.</p>
          <ol className="as-key">
            {PIECES.map((p, i) => (
              <li key={p.key}>
                <button type="button" className={i === at ? 'on' : i < at ? 'done' : ''} aria-current={i === at ? 'step' : undefined}
                  onClick={() => jumpToChapter(ref.current, i, PIECES.length)}>
                  <span className="n">{String(i + 1).padStart(2, '0')}</span>
                  <span><b>{p.title}</b><span>{p.body}</span></span>
                </button>
              </li>
            ))}
          </ol>
          <p className="illus-note">Illustration with sample data</p>
        </div>
        <div className="as-visual" aria-hidden="true">
          <div className="as-phone phone">
            <div className="phone-screen">
              <span className="phone-notch" />
              <span className="p-gym"><i />Your gym</span>
              <div className="p-card"><small>Premium membership</small><div className="p-days"><b>Until Dec 14</b><strong>23</strong></div><div className="p-bar"><i /></div></div>
              <div className={cls(0)} data-piece="code">
                <div className="as-code"><MiniQr /><span><b>Not checked in yet</b><small>Open until 9:00 PM</small></span></div>
                <div className="p-btn">Show my code</div>
              </div>
              <div className={cls(1)} data-piece="next">
                <div className="p-card as-next"><small>Next session</small><b>Thu · 6:00 PM</b><span>Coach Ana · <em>Accepted</em></span></div>
              </div>
              <div className={cls(2)} data-piece="streak">
                <div className="p-card"><div className="as-streak"><b>4 weeks in a row</b><small>2 days left</small></div>
                  <div className="p-week"><i className="on" /><i /><i className="on" /><i className="today" /><i /><i /><i /></div></div>
              </div>
              <div className={cls(3)} data-piece="ai">
                <div className="p-card as-ai"><small>Assistant</small><b>Add 2.5 kg to your squat next week?</b>
                  <div className="as-ai-btns"><span>Not now</span><span className="yes">Apply</span></div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- a member's first month (scrub) */

/**
 * Four weeks as a real calendar. The scrollbar is the clock: days fill in one by one as you scroll
 * (scroll-linked), the counts follow, and any day that has happened can be tapped or hovered to read
 * what it held (interactive). Sample data, said so; every behaviour in it is one the system has.
 */
const DAYS = 28;
const VISIT = new Set([0, 2, 4, 7, 9, 11, 14, 16, 18, 21, 23, 25]);
const RECORD = 16;
const RENEWED = 27;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_STEPS = [
  { title: 'Week 1: they check in', body: 'A QR code at the desk or the kiosk. Every visit counts, for them and for you.' },
  { title: 'Week 2: the streak starts', body: 'Two training days a week keeps it alive; a frozen week never breaks it.' },
  { title: 'Week 3: points and a record', body: 'Points for turning up, and a personal record the database finds itself.' },
  { title: 'Week 4: they renew', body: 'A reminder before it lapses, and they pay in the app with QRPh, GCash, Maya or card.' },
];
const dayWords = (d: number) => {
  const when = `Week ${Math.floor(d / 7) + 1}, ${WEEKDAYS[d % 7]}`;
  if (d === RENEWED) return { when, what: 'Renewed for another month', more: 'Paid in the app with GCash. The desk saw it the moment it was paid.' };
  if (d === RECORD) return { when, what: 'Checked in · new personal record', more: 'Lat pulldown, 55 kg. The database spotted the record itself.' };
  if (VISIT.has(d)) return { when, what: 'Checked in', more: 'Scanned at the kiosk by the door.' };
  return { when, what: 'Rest day', more: 'Nothing logged, and nothing lost.' };
};

export function Scrub() {
  const ref = useRef<HTMLElement>(null);
  const [lit, setLit] = useState(() => (reducedMotion() ? DAYS : 0));
  const [pick, setPick] = useState<number | null>(null);
  useEffect(() => {
    if (reducedMotion()) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      if (!ref.current) return;
      const n = Math.min(DAYS, Math.round(pinProgress(ref.current) * (DAYS + 2)));
      setLit((v) => (v === n ? v : n));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf); };
  }, []);
  const visits = [...VISIT].filter((d) => d < lit).length;
  const points = visits * 10 + (lit > RECORD ? 25 : 0);
  const weeks = [0, 1, 2, 3].filter((w) => lit >= (w + 1) * 7 && [...VISIT].filter((d) => d >= w * 7 && d < (w + 1) * 7).length >= 2).length;
  const shown = pick ?? (lit > 0 ? lit - 1 : null);
  const info = shown !== null ? dayWords(shown) : null;
  const week = Math.min(3, Math.floor(Math.max(0, lit - 1) / 7));
  return (
    <section className="month" ref={ref} data-pin data-lit={lit} aria-label="A member's first month">
      <div className="month-stage">
        <div className="wrap month-grid">
          <div className="month-copy">
            <h2>A member’s first month, as you scroll.</h2>
            <ol className="month-steps">
              {MONTH_STEPS.map((c, i) => (
                <li key={c.title} className={lit === 0 ? '' : i === week ? 'on' : i < week ? 'done' : ''}>
                  <b>{c.title}</b><span>{c.body}</span>
                </li>
              ))}
            </ol>
            <p className="illus-note">Illustration with sample data · tap any day that has passed</p>
          </div>
          <div className="month-card">
            <div className="month-counts">
              <div><b className="num">{visits}</b><small>visits</small></div>
              <div><b className="num">{points}</b><small>points</small></div>
              <div><b className="num">{weeks}</b><small>week streak</small></div>
            </div>
            <div className="cal" role="grid" aria-label="Four weeks" onPointerLeave={() => setPick(null)}>
              {WEEKDAYS.map((d) => <span key={d} className="cal-h" role="columnheader">{d.slice(0, 1)}</span>)}
              {Array.from({ length: DAYS }, (_, d) => {
                const past = d < lit;
                const kind = d === RENEWED ? 'renew' : d === RECORD ? 'record' : VISIT.has(d) ? 'visit' : 'rest';
                return (
                  <button type="button" key={d} role="gridcell" disabled={!past}
                    className={`cal-d ${kind}${past ? ' past' : ''}${shown === d ? ' sel' : ''}`}
                    aria-label={`${dayWords(d).when}: ${dayWords(d).what}`}
                    onPointerEnter={() => past && setPick(d)} onFocus={() => setPick(d)} onClick={() => setPick(d)}>
                    <span>{d + 1}</span>
                  </button>
                );
              })}
            </div>
            <div className="cal-info" aria-live="polite">
              {info ? <><small>{info.when}</small><b>{info.what}</b><span>{info.more}</span></>
                : <><small>Day 1</small><b>Scroll to start the month</b><span>Each day fills in as you go.</span></>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- the catalogue */

/** Lower-case words of a search, without punctuation. */
const words = (q: string) => q.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(Boolean);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The text with every searched word marked. */
function Marked({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>;
  const re = new RegExp(`(${terms.map(escapeRe).join('|')})`, 'gi');
  return <>{text.split(re).map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part))}</>;
}

/**
 * Everything inside (redesign 2026-11-21): the 65 features, findable and readable at a glance.
 *   - a search over every title and line ("4 of 65"); groups with nothing matching fold away
 *   - group tabs whose highlight slides to the group on screen, and scrolls itself into view
 *   - under each pinned group title, a line that fills as its rows pass, with "3 of 8"
 *   - each row's check draws itself as the row arrives; tapping a row opens where it lives
 * The scroll loop writes CSS variables and text only — React state changes only when the group does.
 */
export function Catalogue() {
  const [open, setOpen] = useState<string>(CATALOGUE[0].id);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const index = useRef<HTMLElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const terms = words(query);
  const hit = (t: string, b: string) => terms.every((w) => `${t} ${b}`.toLowerCase().includes(w));
  const groups = CATALOGUE.map((g) => ({ ...g, shown: g.items.filter(([t, b]) => hit(t, b)) }));
  const found = groups.reduce((n, g) => n + g.shown.length, 0);

  // Which group is on screen (state, only on change); each group's progress line and count (CSS var + text).
  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const line = window.innerHeight * 0.45;
      let cur = CATALOGUE[0].id;
      for (const g of CATALOGUE) {
        const el = document.getElementById(`cat-${g.id}`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.top < line) cur = g.id;
        const rows = el.querySelectorAll<HTMLElement>('.cat-item');
        let passed = 0;
        rows.forEach((row) => { if (row.getBoundingClientRect().top < line) passed++; });
        el.style.setProperty('--gp', rows.length ? (passed / rows.length).toFixed(3) : '0');
        const count = el.querySelector<HTMLElement>('[data-gcount]');
        if (count) count.textContent = `${passed} of ${rows.length}`;
      }
      setOpen((o) => (o === cur ? o : cur));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf); };
  }, [query]);

  // The tab highlight slides to the open group, and the tab row scrolls so it is in view.
  useEffect(() => {
    const nav = index.current, p = pill.current;
    const a = nav?.querySelector<HTMLElement>(`a[data-g="${open}"]`);
    if (!nav || !p || !a) return;
    p.style.width = `${a.offsetWidth}px`;
    p.style.transform = `translateX(${a.offsetLeft}px)`;
    p.style.opacity = '1';
    const target = a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2;
    nav.scrollTo({ left: Math.max(0, target), behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [open, query]);

  // A fade on whichever edge of the tab row has more tabs past it.
  const [edges, setEdges] = useState({ l: false, r: false });
  useEffect(() => {
    const nav = index.current;
    if (!nav) return;
    const read = () => setEdges({ l: nav.scrollLeft > 4, r: nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 4 });
    read();
    nav.addEventListener('scroll', read, { passive: true });
    window.addEventListener('resize', read);
    return () => { nav.removeEventListener('scroll', read); window.removeEventListener('resize', read); };
  }, []);

  return (
    <section className="catalogue" id="inside">
      <div className="wrap">
        <div className="sec-head">
          <h2 data-reveal>{FEATURE_COUNT} things it does, all live today.</h2>
          <p className="section-lede" data-reveal style={{ ['--d' as string]: 1 }}>The desk, the coaches, the members and an AI assistant, in one system for one price. Search it, or read it by who it serves. Tap a feature to see where it lives.</p>
        </div>

        <div className="cat-search">
          <label htmlFor="cat-q" className="cat-search__label">Find a feature</label>
          <div className="cat-search__box">
            <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>
            <input id="cat-q" type="search" value={query} onChange={(e) => { setQuery(e.target.value); setExpanded(null); }}
              placeholder="GCash, refunds, coach chat…" autoComplete="off" enterKeyHint="search" />
            {query && <button type="button" className="cat-search__clear" onClick={() => setQuery('')} aria-label="Clear the search">Clear</button>}
          </div>
          <p className="cat-search__count" aria-live="polite" data-cat-count>
            {terms.length === 0 ? `${FEATURE_COUNT} features in ${CATALOGUE.length} groups` : `${found} of ${FEATURE_COUNT}`}
          </p>
        </div>

        <nav className={`cat-index${edges.l ? ' fade-l' : ''}${edges.r ? ' fade-r' : ''}`} aria-label="Feature groups" ref={index}>
          <span className="cat-pill" ref={pill} aria-hidden="true" />
          {groups.map((g) => (
            <a key={g.id} data-g={g.id} href={`#cat-${g.id}`} className={`${open === g.id ? 'on' : ''}${g.shown.length === 0 ? ' none' : ''}`}
              aria-current={open === g.id ? 'true' : undefined}>
              {g.title}{terms.length > 0 && <small>{g.shown.length}</small>}
            </a>
          ))}
        </nav>

        <div className="cat-groups">
          {found === 0 && (
            <p className="cat-none" data-cat-none>Nothing matches “{query.trim()}”. Try fewer words, or <button type="button" onClick={() => setQuery('')}>show everything</button>.</p>
          )}
          {groups.map((g, gi) => (
            <div className={`cat-group${g.shown.length === 0 ? ' folded' : ''}`} id={`cat-${g.id}`} key={g.id} aria-hidden={g.shown.length === 0 || undefined}>
              <div className="cat-fold">
                <header className="cat-head">
                  <span className="n">{String(gi + 1).padStart(2, '0')} / {String(CATALOGUE.length).padStart(2, '0')}</span>
                  <h3>{g.title}</h3>
                  <p>{g.lede}</p>
                  <div className="cat-prog" aria-hidden="true"><i /></div>
                  <small><span data-gcount>0 of {g.shown.length}</span> read</small>
                </header>
                <ul className="cat-items">
                  {g.shown.map(([title, body], i) => {
                    const isOpen = expanded === title;
                    const where = WHERE[title] ?? [];
                    const detail = DETAIL[title];
                    return (
                      // Open is an attribute, never a class: the reveal's `in` class is added outside React, and a className
                      // change would wipe it and blank the row (2026-11-22).
                      <li key={title} className="cat-item" data-open={isOpen || undefined} data-reveal style={{ ['--d' as string]: i % 4 }}>
                        <button type="button" className="cat-row" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : title)}>
                          <svg className="icon cat-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5l4.8 4.8L19.5 7" pathLength={1} /></svg>
                          <span className="cat-text"><b><Marked text={title} terms={terms} /></b><span><Marked text={body} terms={terms} /></span></span>
                          <span className="cat-chev" aria-hidden="true" />
                        </button>
                        <div className="cat-more" role="region" aria-label={`Where ${title} lives`}>
                          <div className="cat-more__in">
                            <div className="cat-detail">
                              {detail && <p className="cat-who"><span>Who uses it</span>{detail.who}</p>}
                              {detail && detail.steps.length > 0 && (
                                <ol className="cat-steps" aria-label="How it works">
                                  {detail.steps.map((s, k) => <li key={k}><span className="n" aria-hidden="true">{k + 1}</span>{s}</li>)}
                                </ol>
                              )}
                              <div className="cat-meta">
                                {where.length > 0 && (
                                  <p className="cat-where"><span>Lives in</span>{where.map((w) => <em key={w} className={`w-${w}`}>{WHERE_LABEL[w]}</em>)}</p>
                                )}
                                {detail?.optional && <p className="cat-optional">Your gym can switch this off</p>}
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
