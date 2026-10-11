import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { CATALOGUE, FEATURE_COUNT } from './catalogue';
import { pinProgress, reducedMotion, useChapter } from './motion';

/**
 * The scroll-told sections added 2026-10-11 — each one a different scroll
 * technique, and each one carrying real content:
 *
 *   Manifesto   text reveal — the words light up one by one as you scroll
 *   Phone3D     3D — a phone turns and comes apart in layers with the scroll
 *   Scrub       scrubbing — a frame-by-frame sequence (drawn on a canvas)
 *               tied to the scrollbar: a member's first month
 *   Catalogue   sticky / pinning — each group's title holds while its
 *               features scroll past; every feature in the system is listed
 *
 * (Parallax and the scroll-linked marquee live in index.css on the hero, the
 * photo bands and the ticker.) Without motion everything renders whole and
 * still: --pin falls back to 1, the canvas draws its last frame.
 */

/* ---------------------------------------------------------------- text reveal */

const MANIFESTO = 'Most gym software stops at the counter. Core Fitness goes home with your members — their check-in code, their workouts, their coach, their streak — and comes back to your desk as renewals.';

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

/* ---------------------------------------------------------------- 3D phone */

const LAYERS = [
  { z: 1, cls: 'l-qr', title: 'Check-in code', body: 'Shown at the desk or the kiosk', icon: 'qr' as const },
  { z: 2, cls: 'l-class', title: 'Next class · 6:00 PM', body: 'HIIT with Coach Ben · 4 places left', icon: 'calendar' as const },
  { z: 3, cls: 'l-streak', title: '4-week streak', body: 'Two training days left this week', icon: 'star' as const },
  { z: 4, cls: 'l-ai', title: 'AI coach', body: '“Add 2.5 kg to your squat this week.” · Apply', icon: 'sparkle' as const },
];

export function Phone3D() {
  return (
    <section className="p3d" data-pin aria-label="The member app, in layers">
      <div className="p3d-stage">
        <div className="wrap p3d-copy">
          <span className="eyebrow">The member’s app</span>
          <h2 className="big">One phone.<br /><span className="dim">Everything that brings them back.</span></h2>
          <p className="section-lede">Their check-in code, their next class, their streak and their coach — on the screen they open every day.</p>
          <p className="illus-note">Illustration with sample data</p>
        </div>
        <div className="p3d-scene" aria-hidden="true">
          <div className="p3d-phone">
            <div className="p3d-body">
              <div className="p3d-screen">
                <span className="p3d-notch" />
                <p className="p3d-hello">Good evening, Lea</p>
                <p className="p3d-gym">G Fitness · Premium · 23 days left</p>
                <div className="p3d-bars">{[40, 64, 52, 80, 72, 90, 60].map((h, i) => <span key={i} style={{ height: `${h}%` }} />)}</div>
                <p className="p3d-cap">Workouts this week</p>
              </div>
            </div>
            {LAYERS.map((l) => (
              <div key={l.cls} className={`p3d-layer ${l.cls}`} style={{ ['--z' as string]: l.z }}>
                <Icon name={l.icon} />
                <span><b>{l.title}</b><small>{l.body}</small></span>
              </div>
            ))}
          </div>
          <div className="p3d-shadow" />
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- scrub sequence */

const FRAMES = 120;
const SCRUB_CHAPTERS = [
  { title: 'Week 1 — they check in', body: 'A QR code at the desk or the kiosk. Every visit counts, for them and for you.' },
  { title: 'Week 2 — the streak starts', body: 'Two training days a week keeps it alive; a frozen week never breaks it.' },
  { title: 'Week 3 — points and a record', body: 'Points for turning up, a personal record the database finds itself.' },
  { title: 'Week 4 — they renew', body: 'A reminder before it lapses, and they pay in the app — QRPh, GCash, Maya or card.' },
];

/** Draws frame `f` of the sequence: a month of training filling up. Deterministic, so it scrubs both ways. */
function drawFrame(ctx: CanvasRenderingContext2D, f: number, w: number, h: number) {
  const t = f / (FRAMES - 1);
  const css = getComputedStyle(document.documentElement);
  const violet = css.getPropertyValue('--violet').trim() || '#7c3aed';
  const violetText = css.getPropertyValue('--violet-text').trim() || '#c4b5fd';
  const amber = css.getPropertyValue('--amber').trim() || '#f59e0b';
  const text = css.getPropertyValue('--text').trim() || '#f4f4f7';
  const dim = css.getPropertyValue('--hairline-strong').trim() || '#36354f';
  ctx.clearRect(0, 0, w, h);
  const s = Math.min(w, h);
  const cx = w / 2, cy = h * 0.36;

  // The ring: visits this month, 0 → 12.
  const visits = Math.round(t * 12);
  const R = s * 0.22;
  ctx.lineCap = 'round';
  ctx.lineWidth = s * 0.035;
  ctx.strokeStyle = dim;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  const grad = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  grad.addColorStop(0, violet); grad.addColorStop(1, amber);
  ctx.strokeStyle = grad;
  ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, t * 1.02)); ctx.stroke();

  ctx.fillStyle = text;
  ctx.textAlign = 'center';
  ctx.font = `800 ${Math.round(s * 0.12)}px Inter, system-ui, sans-serif`;
  ctx.fillText(String(visits), cx, cy + s * 0.03);
  ctx.fillStyle = violetText;
  ctx.font = `600 ${Math.round(s * 0.032)}px Inter, system-ui, sans-serif`;
  ctx.fillText('visits this month', cx, cy + s * 0.08);

  // The month: 4 weeks × 7 days lighting up in order; training days glow amber.
  const train = [1, 3, 5, 8, 10, 12, 15, 17, 19, 22, 24, 26];
  const cell = s * 0.06, gap = s * 0.018;
  const gw = 7 * cell + 6 * gap;
  const gx = cx - gw / 2, gy = cy + R + s * 0.08;
  const lit = Math.round(t * 28);
  for (let d = 0; d < 28; d++) {
    const x = gx + (d % 7) * (cell + gap), y = gy + Math.floor(d / 7) * (cell + gap);
    const on = d < lit;
    ctx.fillStyle = on ? (train.includes(d) ? amber : violet) : dim;
    ctx.globalAlpha = on ? 1 : 0.5;
    ctx.beginPath(); ctx.roundRect(x, y, cell, cell, cell * 0.28); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Points, counting up, and the streak weeks.
  const points = Math.round(t * 340);
  ctx.textAlign = 'left';
  ctx.fillStyle = amber;
  ctx.font = `800 ${Math.round(s * 0.05)}px Inter, system-ui, sans-serif`;
  ctx.fillText(`+${points}`, w * 0.06, h * 0.1);
  ctx.fillStyle = text; ctx.font = `600 ${Math.round(s * 0.028)}px Inter, system-ui, sans-serif`;
  ctx.fillText('points', w * 0.06, h * 0.1 + s * 0.045);
  ctx.textAlign = 'right';
  ctx.fillStyle = violetText;
  ctx.font = `800 ${Math.round(s * 0.05)}px Inter, system-ui, sans-serif`;
  ctx.fillText(`${Math.min(4, Math.floor(t * 4.2))} wk`, w * 0.94, h * 0.1);
  ctx.fillStyle = text; ctx.font = `600 ${Math.round(s * 0.028)}px Inter, system-ui, sans-serif`;
  ctx.fillText('streak', w * 0.94, h * 0.1 + s * 0.045);

  // Renewed: the last frames stamp it.
  if (t > 0.86) {
    const k = Math.min(1, (t - 0.86) / 0.12);
    ctx.globalAlpha = k;
    ctx.textAlign = 'center';
    ctx.fillStyle = amber;
    ctx.font = `800 ${Math.round(s * 0.045)}px Inter, system-ui, sans-serif`;
    ctx.fillText('Renewed · paid in the app', cx, h * 0.97);
    ctx.globalAlpha = 1;
  }
}

export function Scrub() {
  const [ref, chapter] = useChapter<HTMLElement>(SCRUB_CHAPTERS.length);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    const sec = ref.current;
    if (!c || !sec) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let last = -1, raf = 0;
    const size = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      last = -1; paint();
    };
    const paint = () => {
      raf = 0;
      const f = reducedMotion() ? FRAMES - 1 : Math.round(pinProgress(sec) * (FRAMES - 1));
      if (f === last) return;
      last = f;
      const r = c.getBoundingClientRect();
      drawFrame(ctx, f, r.width, r.height);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(paint); };
    size();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', size);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', size); if (raf) cancelAnimationFrame(raf); };
  }, [ref]);
  const ch = reducedMotion() ? SCRUB_CHAPTERS.length - 1 : chapter;
  return (
    <section className="scrub" ref={ref} data-pin aria-label="A member's first month">
      <div className="scrub-stage">
        <div className="wrap scrub-grid">
          <div className="scrub-copy">
            <span className="eyebrow">A member’s first month</span>
            <h2 className="big">Scroll through<br /><span className="dim">four weeks.</span></h2>
            <ol className="scrub-steps">
              {SCRUB_CHAPTERS.map((c, i) => (
                <li key={c.title} className={i === ch ? 'on' : i < ch ? 'done' : ''}>
                  <b>{c.title}</b><span>{c.body}</span>
                </li>
              ))}
            </ol>
            <p className="illus-note">Illustration with sample data</p>
          </div>
          <div className="scrub-canvas-wrap"><canvas ref={canvas} className="scrub-canvas" aria-hidden="true" /></div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- the catalogue */

export function Catalogue() {
  const [open, setOpen] = useState<string>(CATALOGUE[0].id);
  // Which group is on screen, for the index chips — read on scroll, set only on change.
  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      let cur = CATALOGUE[0].id;
      for (const g of CATALOGUE) {
        const el = document.getElementById(`cat-${g.id}`);
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.45) cur = g.id;
      }
      setOpen((o) => (o === cur ? o : cur));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    window.addEventListener('scroll', on, { passive: true });
    return () => { window.removeEventListener('scroll', on); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return (
    <section className="catalogue" id="inside">
      <div className="wrap">
        <span className="eyebrow">Everything inside</span>
        <h2 className="big">{FEATURE_COUNT} things it does.<br /><span className="dim">All of them live today.</span></h2>
        <p className="section-lede">The desk, the coaches, the members and an AI coach — in one system, for one price. Here is all of it.</p>
        <nav className="cat-index" aria-label="Feature groups">
          {CATALOGUE.map((g) => (
            <a key={g.id} href={`#cat-${g.id}`} className={open === g.id ? 'on' : ''}><Icon name={g.icon} /> {g.title}</a>
          ))}
        </nav>
        <div className="cat-groups">
          {CATALOGUE.map((g, gi) => (
            <div className="cat-group" id={`cat-${g.id}`} key={g.id}>
              <header className="cat-head">
                <span className="cat-num">{String(gi + 1).padStart(2, '0')}</span>
                <span className="cat-glyph"><Icon name={g.icon} /></span>
                <h3>{g.title}</h3>
                <p>{g.lede}</p>
                <small>{g.items.length} features</small>
              </header>
              <ul className="cat-items">
                {g.items.map(([title, body], i) => (
                  <li key={title} className="cat-item tilt" data-reveal style={{ ['--d' as string]: i % 4 }}>
                    <Icon name="check" />
                    <span><b>{title}</b><span>{body}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
