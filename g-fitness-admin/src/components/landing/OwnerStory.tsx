import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'framer-motion';
import {
  BadgeCheck, Banknote, CalendarClock, Check, Clock, Flame, Gift, Palette, QrCode, Receipt, ShieldCheck,
  Smartphone, Snowflake, Sparkles, Tv, UserPlus, Users, WifiOff, Dumbbell,
} from 'lucide-react';
import './ownerStory.css';

/**
 * The admin sign-in page's scroll-told story (the owner, 2026-11-07: "update and enhance the scrollytelling").
 * Three movements below the sign-in card:
 *   1. a statement that writes itself word by word as it scrolls past;
 *   2. an owner's day, pinned: the hour runs 6 AM → 9 PM and a sample screen changes with it — each one a
 *      thing the system really does, each labelled "Sample screen" (made-up names, no claims about a real gym);
 *   3. everything in it, a grid that builds in.
 * Reduced motion: the same words, as a plain list — nothing pinned, nothing hidden.
 */

const MANIFESTO = 'Run your whole gym from one screen. Your members carry it in their pocket. Cash at the desk, coaches on their phones, and nothing written on paper again.';

type Chapter = { id: string; time: string; title: string; body: string; icon: typeof QrCode; screen: () => ReactNode };

const CHAPTERS: Chapter[] = [
  { id: 'open', time: '6:00 AM', title: 'The doors open', icon: QrCode,
    body: 'Members scan their code at the kiosk or the desk. Coaches scan theirs too — a coach is never counted as a visit. No signal? Check-ins wait on the device and are recorded when it is back.',
    screen: () => <KioskScreen /> },
  { id: 'needs', time: '9:00 AM', title: 'What needs you', icon: Sparkles,
    body: 'One list each morning: sign-ups to approve, freeze or cancel requests with the refund already worked out, memberships ending this week. Each count opens the page that fixes it.',
    screen: () => <NeedsScreen /> },
  { id: 'cash', time: '12:00 PM', title: 'Cash at the desk', icon: Banknote,
    body: 'Record a payment in seconds and hand over a numbered receipt the member keeps on their phone. At closing, the drawer is counted against the day — online payments too, when you switch them on.',
    screen: () => <CashScreen /> },
  { id: 'coach', time: '5:00 PM', title: 'Coaches run their sessions', icon: Dumbbell,
    body: 'Members book a coach; the coach decides from their phone. Packages, chat and progress live in one place per trainee — and the coach sees only what each member chose to share.',
    screen: () => <CoachScreen /> },
  { id: 'phone', time: '9:00 PM', title: 'In their pocket', icon: Smartphone,
    body: 'Your members leave with your gym on their phone — your name, your colours, your words. Streaks in weeks, badges, points they spend on your rewards.',
    screen: () => <PhoneScreen /> },
];

const EVERYTHING = [
  { icon: Users, title: 'Members and sign-ups', desc: 'Approve, archive, never lose a history. Switching gyms is tracked both ways.' },
  { icon: QrCode, title: 'Check-in kiosk', desc: 'Member and coach codes, a desk scanner and a self-serve kiosk.' },
  { icon: WifiOff, title: 'Works offline', desc: 'Check-ins and your own records wait on the device until the signal returns.' },
  { icon: Receipt, title: 'Payments and receipts', desc: 'Cash first, numbered receipts, an end-of-day drawer; online by QR Ph when you want it.' },
  { icon: CalendarClock, title: 'Personal training', desc: 'Packages, single sessions, coaches who decide their own bookings.' },
  { icon: Snowflake, title: 'Fair freezes and refunds', desc: 'Members ask with a reason and see the pro-rata refund before they do.' },
  { icon: Palette, title: 'Your own app', desc: 'Your colours, logo and words on every member’s phone, in light and dark.' },
  { icon: Gift, title: 'Rewards that are earned', desc: 'Points, streaks and badges counted on the server — nothing a phone can fake.' },
  { icon: Tv, title: 'Lobby TV', desc: 'Today’s classes and the gym’s wins on the screen by the door.' },
  { icon: ShieldCheck, title: 'Four roles, real locks', desc: 'Owner, front desk, coach and member — each sees exactly their part.' },
];

/* ── 1. The statement ─────────────────────────────────────────────────────────────── */
function Word({ word, i, n, progress }: { word: string; i: number; n: number; progress: MotionValue<number> }) {
  const start = i / n; const end = start + 1 / n;
  const opacity = useTransform(progress, [start, end], [0.14, 1]);
  const y = useTransform(progress, [start, end], [8, 0]);
  return <motion.span style={{ opacity, y }} className="os-word">{word} </motion.span>;
}

function Manifesto() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.45'] });
  const words = MANIFESTO.split(' ');
  return (
    <section ref={ref} className="os-manifesto" aria-label="What Core Fitness is">
      <p className="os-kicker">Core Fitness · for gym owners</p>
      <p className="os-manifesto__text">
        {words.map((w, i) => <Word key={i} word={w} i={i} n={words.length} progress={scrollYProgress} />)}
      </p>
    </section>
  );
}

/* ── 2. An owner's day, pinned ───────────────────────────────────────────────────── */
function Day() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const [at, setAt] = useState(0);
  // React state changes once per chapter, never per frame; the bar and the sun follow the motion value.
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const next = Math.min(CHAPTERS.length - 1, Math.max(0, Math.floor(v * CHAPTERS.length)));
    setAt((cur) => (cur === next ? cur : next));
  });
  const bar = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);
  const sky = useTransform(scrollYProgress, [0, 0.5, 1], [
    'radial-gradient(70% 60% at 20% 0%, rgba(245,158,11,0.22), transparent 70%)',
    'radial-gradient(70% 60% at 50% 0%, rgba(124,58,237,0.26), transparent 70%)',
    'radial-gradient(70% 60% at 80% 0%, rgba(76,29,149,0.34), transparent 70%)',
  ]);
  const c = CHAPTERS[at];
  return (
    <section ref={ref} className="os-day" style={{ height: `${CHAPTERS.length * 100 + 40}vh` }} aria-label="An owner's day">
      <div className="os-day__pin">
        <motion.div className="os-day__sky" style={{ background: sky }} aria-hidden />
        <div className="os-day__grid">
          <div className="os-day__words">
            <p className="os-kicker">An owner’s day</p>
            <div className="os-day__rail" aria-hidden>
              <motion.i style={{ height: bar }} />
              {CHAPTERS.map((ch, i) => (
                <span key={ch.id} className={i <= at ? 'on' : ''} style={{ top: `${(i / (CHAPTERS.length - 1)) * 100}%` }}>
                  <ch.icon size={13} />
                </span>
              ))}
            </div>
            <div key={c.id} className="os-chapter">
              <p className="os-chapter__time"><Clock size={14} /> {c.time}</p>
              <h3 className="os-chapter__title">{c.title}</h3>
              <p className="os-chapter__body">{c.body}</p>
              <p className="os-chapter__count">{at + 1} / {CHAPTERS.length}</p>
            </div>
          </div>
          <div className="os-day__stage">
            <div key={c.id} className="os-screen">
              <span className="os-screen__tag">Sample screen</span>
              {c.screen()}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* The sample screens — made-up names, each a thing the system does. */
function Row({ a, b, tag, tone = 'v', i = 0 }: { a: string; b: string; tag?: string; tone?: 'v' | 'a' | 'g'; i?: number }) {
  return (
    <div className="os-row" style={{ ['--d' as string]: `${120 + i * 140}ms` }}>
      <span className="os-row__av">{a.split(' ').map((p) => p[0]).join('').slice(0, 2)}</span>
      <span className="os-row__t"><b>{a}</b><small>{b}</small></span>
      {tag && <span className={`os-pill os-pill--${tone}`}>{tag}</span>}
    </div>
  );
}
function KioskScreen() {
  return (
    <div className="os-ui">
      <div className="os-scan"><QrCode size={46} /><i className="os-scan__line" /></div>
      <p className="os-ui__h">Checked in today <b className="os-count">18</b></p>
      <Row a="Lea Lorenzana" b="6:02 AM · Premium" tag="Member" i={0} />
      <Row a="Ana Cruz" b="6:05 AM · coach" tag="Coach" tone="a" i={1} />
      <Row a="Paolo Reyes" b="6:09 AM · saved offline, sent 6:11" tag="Member" i={2} />
    </div>
  );
}
function NeedsScreen() {
  return (
    <div className="os-ui">
      <p className="os-ui__h">Needs you <span className="os-pill os-pill--a">5 to do</span></p>
      <div className="os-task" style={{ ['--d' as string]: '120ms' }}><UserPlus size={16} /><span><b>3 sign-ups waiting</b><small>Maria S., Rica B., +1</small></span><em>Approve</em></div>
      <div className="os-task" style={{ ['--d' as string]: '260ms' }}><Snowflake size={16} /><span><b>1 freeze request</b><small>injury · refund quote ready</small></span><em>Decide</em></div>
      <div className="os-task" style={{ ['--d' as string]: '400ms' }}><Clock size={16} /><span><b>1 membership ends this week</b><small>Kevin L. in 2 days</small></span><em>View</em></div>
    </div>
  );
}
function CashScreen() {
  return (
    <div className="os-ui">
      <div className="os-receipt" style={{ ['--d' as string]: '120ms' }}>
        <p className="os-receipt__no">Receipt 2026-000184</p>
        <p className="os-receipt__amt">₱1,500.00</p>
        <p className="os-receipt__what">Premium · 1 month · Cash</p>
        <p className="os-receipt__ok"><BadgeCheck size={14} /> Saved to Lea’s phone</p>
      </div>
      <div className="os-drawer" style={{ ['--d' as string]: '320ms' }}>
        <span>End of day</span><b>₱6,450</b><small>11 payments · drawer counted</small>
      </div>
    </div>
  );
}
function CoachScreen() {
  return (
    <div className="os-ui">
      <p className="os-ui__h">Coach Ana · today</p>
      <Row a="Lea Lorenzana" b="5:00 PM · Strength block" tag="Confirmed" i={0} />
      <div className="os-ask" style={{ ['--d' as string]: '300ms' }}>
        <b>Paolo asks for 6:30 PM</b><small>single session · no clash</small>
        <span><em className="yes"><Check size={13} /> Accept</em><em>Decline</em></span>
      </div>
      <Row a="Mika Cruz" b="Package · 3 months · 1 to review" tag="Package" tone="a" i={2} />
    </div>
  );
}
function PhoneScreen() {
  return (
    <div className="os-phone">
      <div className="os-phone__top"><span className="os-phone__logo">IP</span><span><small>Good evening</small><b>Iron Paradise</b></span></div>
      <div className="os-phone__card" style={{ ['--d' as string]: '120ms' }}><Flame size={18} /><span><b>4-week streak</b><small>3 of 3 this week — done</small></span></div>
      <div className="os-phone__card" style={{ ['--d' as string]: '260ms' }}><Gift size={18} /><span><b>340 Iron Points</b><small>A free shake at 150</small></span></div>
      <div className="os-phone__card" style={{ ['--d' as string]: '400ms' }}><BadgeCheck size={18} /><span><b>New badge</b><small>10 sessions with a coach</small></span></div>
      <div className="os-phone__bar"><i /><i /><i /><i /></div>
    </div>
  );
}

/* ── 3. Everything in it ─────────────────────────────────────────────────────────── */
function Everything() {
  return (
    <section className="os-all" aria-label="Everything in Core Fitness">
      <p className="os-kicker">Everything in it</p>
      <h3 className="os-all__title">One system. Four apps. Your gym.</h3>
      <div className="os-all__grid">
        {EVERYTHING.map((f, i) => (
          <motion.div key={f.title} className="os-feat"
            initial={{ opacity: 0, y: 30, scale: 0.96 }} whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, delay: (i % 5) * 0.07, ease: [0.16, 1, 0.3, 1] }}>
            <span className="os-feat__icon"><f.icon size={18} /></span>
            <b>{f.title}</b>
            <small>{f.desc}</small>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* Reduced motion: the same story as a list. */
function StillStory() {
  return (
    <section className="os-still" aria-label="An owner's day">
      <p className="os-manifesto__text os-manifesto__text--still">{MANIFESTO}</p>
      <p className="os-kicker">An owner’s day</p>
      {CHAPTERS.map((c) => (
        <div key={c.id} className="os-still__ch">
          <p className="os-chapter__time"><Clock size={14} /> {c.time}</p>
          <h3 className="os-chapter__title">{c.title}</h3>
          <p className="os-chapter__body">{c.body}</p>
        </div>
      ))}
    </section>
  );
}

export default function OwnerStory() {
  const [still, setStill] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setStill(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return (
    <div className="os" data-owner-story>
      {still ? <StillStory /> : (<><Manifesto /><Day /></>)}
      <Everything />
    </div>
  );
}
