import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { toTier, type PublicPlanRow, type Tier } from './pricing';
import StatusPage from './Status';
import Account from './Account';
import Icon, { type IconName } from './Icon';
import Story from './Story';
import PlacePicker from './PlacePicker';
import Legal, { parseLegalHash } from './Legal';
import { inEffect, VERSION } from './legalText';
import { usePlatformFacts } from './usePlatformFacts';
import { useCountUp, useMotionEngine } from './motion';

const MEMBER_APP = 'https://corefitness-gym.vercel.app';
const ADMIN_APP = 'https://corefitness-admin.vercel.app';

interface Gym { id: string; slug: string; name: string }

const peso = (n: number) => '₱' + n.toLocaleString('en-PH');

/**
 * The public page: what Core Fitness is, what it costs, who already uses it,
 * and the form a gym owner fills in to be let in.
 *
 * Everything claimed here is something the system does — the features are the
 * ones in the apps, the gym list is read from the database, and a price that
 * has not been decided says so rather than inventing a number (src/pricing.ts).
 */
/** `#status/<token>`: an applicant's own page (0148). Read from the hash so it survives any static host. */
const statusToken = () => /^#status\/([a-f0-9]{32,})$/i.exec(window.location.hash)?.[1] ?? null;
/** `#account`: an applicant signed in (0187). */
const isAccount = () => window.location.hash === '#account';

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

const FEATURES: { icon: IconName; title: string; body: string; tag: string }[] = [
  { icon: 'desk', tag: 'Desk', title: 'The front desk', body: 'Members and memberships, payments with a receipt number — cash at the desk, or GCash, Maya and bank transfers members send from the app for your desk to confirm (you can keep it desk-only), QR check-in and a kiosk members use themselves, a shop with stock that counts itself, and waivers signed in the app. Freezes, renewals and refunds follow rules you set.' },
  { icon: 'calendar', tag: 'Floor', title: 'Classes and coaches', body: 'A weekly timetable that generates itself, bookings your coaches accept, a waitlist that tells everyone waiting the moment a seat frees, and one-to-one sessions with clash checks.' },
  { icon: 'sparkle', tag: 'AI coach', title: 'A coach in their pocket', body: 'On the membership plans you choose, members get an AI coach that builds and adjusts their routines, weekly schedule and goals. Nothing changes until they tap Apply, every change can be undone, and a stated injury gets a referral to a person, never a changed exercise. You set its daily and monthly limits.' },
  { icon: 'message', tag: 'Coaching', title: 'Coaching between sessions', body: 'A room for every class and one-to-one trainee, where coaches post, set workouts and check-ins members turn in from the app. Private coach–member chat, programs you build, and progress photos only the member — and the coaches they share with — can see.' },
  { icon: 'phone', tag: 'Phone', title: "The member's app", body: "Installs like an app on Android, and from the browser on iPhone. Their membership, bookings, check-in code, workouts, goals, progress and the gym's announcements — in English or Filipino." },
  { icon: 'star', tag: 'Loyalty', title: 'Points that keep them coming', body: 'Points for turning up and personal records, badges for milestones, rewards they redeem at your desk, challenges, weekly quests, monthly seasons, squads of friends, and invite-a-friend rewards that pay only when the friend pays. The rules are yours to set.' },
  { icon: 'brush', tag: 'Brand', title: 'Your gym, your look', body: "Your name, your logo and your colour in your members' app — even your own words for members and coaches. Your plans, your prices, your cancellation reasons and your refund policy." },
  { icon: 'shield', tag: 'Privacy', title: 'Your data stays yours', body: "One gym can never see another's members — the database enforces it, and every change is checked automatically. Core Fitness looks inside your gym only when you grant support access, only for a few hours, and only to read." },
  { icon: 'toggle', tag: 'Fit', title: 'Switch off what you don’t run', body: 'No classes? No shop? Turn whole parts of the system off, and your members’ app and your menus simply stop showing them.' },
];

const TICKER = ['QR check-in', 'Cash & GCash', 'AI coach', 'Class timetable', 'Waitlists', 'Coaching rooms', 'Coach chat', 'Programs', 'Points', 'Badges', 'Rewards', 'Challenges', 'Squads', 'Seasons', 'Workout logs', 'Personal records', 'Progress photos', 'The shop', 'Waivers', 'Freeze & renew', 'Lobby TV', 'English · Filipino', 'Your logo, your colour'];

/** "Nine parts." — the heading counts the cards, so adding one can never leave it wrong. */
const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];

const NAV: [string, string][] = [['top', 'Start'], ['day', 'A day'], ['features', 'Features'], ['floor', 'The floor'], ['how', 'How'], ['pricing', 'Pricing'], ['apply', 'Apply']];

/** Splits a line into words that rise one after another (CSS staggers by --w). */
const Words = ({ text, from = 0 }: { text: string; from?: number }) => (
  <>
    {text.split(' ').map((w, i) => (
      <span key={i}><span className="word" style={{ ['--w' as string]: i + from }}><span>{w}</span></span>{' '}</span>
    ))}
  </>
);

function Stat({ to, suffix = '', label, sub }: { to: number | null; suffix?: string; label: string; sub: string }) {
  const [ref, shown] = useCountUp(to);
  return (
    <div className="stat tilt" data-reveal>
      <b ref={ref}>{shown === null ? '—' : shown.toLocaleString('en-PH')}{suffix}</b>
      <span>{label}</span>
      <small>{sub}</small>
    </div>
  );
}

/** Features as a horizontal track, pinned while vertical scroll drives it sideways. On a phone it is a swipeable row. */
function FeatureTrack() {
  const sec = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const measure = () => {
      if (!sec.current || !track.current) return;
      const dist = Math.max(0, track.current.scrollWidth - window.innerWidth);
      sec.current.style.setProperty('--dist', `${dist}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (track.current) ro.observe(track.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  return (
    <section className="htrack" id="features" ref={sec} data-pin>
      <div className="htrack-stage">
        <div className="wrap htrack-head">
          <span className="eyebrow">What you get</span>
          <h2 className="big">{COUNT_WORDS[FEATURES.length] ?? FEATURES.length} parts.<br /><span className="dim">One system.</span></h2>
          <p className="section-lede">Everything here is in the system today, not on a roadmap.</p>
        </div>
        <div className="htrack-track" ref={track}>
          {FEATURES.map((f, i) => (
            <article className="fcard tilt" key={f.title}>
              <span className="fnum">{String(i + 1).padStart(2, '0')}</span>
              <div className="fglyph"><Icon name={f.icon} /></div>
              <span className="ftag">{f.tag}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
          <div className="fcard fend">
            <h3>Want to see it with your own gym in it?</h3>
            <a className="cta magnetic" href="#apply">Register your gym <Icon name="arrow" className="arrow" /></a>
          </div>
        </div>
        <div className="htrack-bar" aria-hidden="true"><span /></div>
      </div>
    </section>
  );
}

/**
 * The footer, with the documents split by who they are for: a gym's agreement
 * with Core Fitness lives here; a member's Terms and Privacy are the gym's,
 * in the member app. The footer used to send a gym owner to the member Terms.
 */
function SiteFooter() {
  return (
    <footer>
      <div className="wrap foot-row">
        <a className="brand" href="#top">
          <img src="/logo-320.webp" alt="" width={26} height={26} />
          <span>Core Fitness</span>
        </a>
        <span>Mamburao, Occidental Mindoro</span>
        <span className="grow" />
        <a href={ADMIN_APP}>Gym sign in</a>
      </div>
      <div className="wrap foot-legal">
        <div>
          <b>For gyms</b>
          <a href="#legal/terms">Terms of Service</a>
          <a href="#legal/dpa">Data Processing Agreement</a>
          <a href="#legal/privacy">Privacy Policy</a>
        </div>
        <div>
          <b>For members</b>
          <a href={`${MEMBER_APP}/terms`}>Member Terms</a>
          <a href={`${MEMBER_APP}/privacy`}>Member Privacy</a>
          <a href={`${MEMBER_APP}/get-app`}>Get the member app</a>
        </div>
      </div>
      <div className="mega" aria-hidden="true">CORE FITNESS</div>
    </footer>
  );
}

export default function App() {
  useMotionEngine();
  const [gyms, setGyms] = useState<Gym[] | null>(null);
  const [gymsFailed, setGymsFailed] = useState(false);
  const [token, setToken] = useState(statusToken);
  const [account, setAccount] = useState(isAccount);
  /** The plan a tier card's "Choose" put into the form. */
  const [chosen, setChosen] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [yearly, setYearly] = useState(false);
  const [section, setSection] = useState('top');
  /** `#legal/<doc>[/<section>]`: one of the gym documents instead of the page. */
  const [legal, setLegal] = useState(() => parseLegalHash(window.location.hash));
  useEffect(() => {
    const on = () => {
      const t = statusToken();
      setToken(t); setLegal(parseLegalHash(window.location.hash)); setAccount(isAccount());
      // The status link is a page of its own: it opens at its top, not wherever the form was.
      if (t || isAccount()) window.scrollTo({ top: 0 });
    };
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('hashchange', on);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('hashchange', on);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);
  // The section dots watch the page's sections — re-attached when the page comes back from a document,
  // and the header's "#pricing" from a document lands on Pricing once the page has rendered.
  useEffect(() => {
    if (legal || token || account) return;
    const id = window.location.hash.slice(1);
    const target = id && !id.includes('/') ? document.getElementById(id) : null;
    if (target) target.scrollIntoView({ block: 'start' });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setSection(e.target.id); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    NAV.forEach(([nid]) => { const el = document.getElementById(nid); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [legal, token, account]);
  /** null while loading; [] when the price list cannot be read at all. */
  const [tiers, setTiers] = useState<Tier[] | null>(null);

  useEffect(() => {
    void (async () => {
      if (!supabase) { setGyms([]); setGymsFailed(true); setTiers([]); return; }
      const [gymRes, planRes] = await Promise.all([
        supabase.rpc('list_gyms', { p_search: null }),
        // The price list, from the same rows the platform owner edits and
        // `gyms.plan` points at (0108). Before that migration is pasted this
        // function does not exist; the section then says so rather than
        // printing numbers from a file that nobody is maintaining any more.
        supabase.rpc('platform_price_list'),
      ]);
      setGymsFailed(!Array.isArray(gymRes.data));
      setGyms(Array.isArray(gymRes.data) ? (gymRes.data as Gym[]) : []);
      setTiers(Array.isArray(planRes.data) ? (planRes.data as PublicPlanRow[]).map(toTier) : []);
    })();
  }, []);

  const trial = tiers?.find((t) => t.trialDays)?.trialDays ?? null;
  const anyYearly = !!tiers?.some((t) => t.yearly !== null && t.yearly > 0);

  return (
    <>
      <div className="progress" aria-hidden="true"><span /></div>
      <div className="cursor-glow" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <header className={`top${scrolled ? ' scrolled' : ''}`}>
        <div className="wrap">
          <a className="brand" href="#top" aria-label="Core Fitness, back to top">
            <img src="/logo-320.webp" alt="" width={34} height={34} />
            <span>Core Fitness</span>
          </a>
          <nav aria-label="Sections">
            <a href="#day">A day</a>
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <span className="grow" />
          <a className="link-quiet hide-sm" href={`${MEMBER_APP}/get-app`}>Get the member app</a>
          <a className="link-quiet hide-sm" href="#account">My application</a>
          <a className="link-quiet" href={ADMIN_APP} aria-label="Gym sign in"><span className="hide-sm">Gym sign in</span><span className="only-sm">Sign in</span></a>
          <a className="cta magnetic" href="#apply">Register</a>
        </div>
      </header>

      <nav className="dots" aria-label="Jump to section" hidden={!!legal || !!token || account}>
        {NAV.map(([id, label]) => (
          <a key={id} href={`#${id}`} className={section === id ? 'on' : ''}><span>{label}</span></a>
        ))}
      </nav>

      <main id="top">
        {legal ? <><Legal doc={legal.doc} section={legal.section} /><SiteFooter /></>
        : token ? <><div className="wrap status-wrap"><StatusPage token={token} /></div><SiteFooter /></>
        : account ? <><div className="wrap status-wrap"><Account /></div><SiteFooter /></> : <>

        <section className="hero" data-scroll>
          <div className="hero-bg" aria-hidden="true">
            <img src="/gfit-floor.webp" alt="" />
          </div>
          <div className="hero-grid" aria-hidden="true" />
          <div className="blob b1" aria-hidden="true" />
          <div className="blob b2" aria-hidden="true" />
          <div className="wrap hero-inner">
            <div className="hero-copy">
              <span className="eyebrow">Gym software, made in Occidental Mindoro</span>
              <h1>
                <Words text="Run your gym," />
                <br />
                <em><Words text="give your members an app." from={3} /></em>
              </h1>
              <p className="lede">
                Memberships, cash payments, QR check-in, classes and coaches — with a phone app your
                members actually install. Built for a real gym in Mamburao, and open to yours.
              </p>
              <div className="cta-row">
                <a className="cta magnetic" href="#apply">Register your gym <Icon name="arrow" className="arrow" /></a>
                <a className="cta ghost magnetic" href="#day">See a day in it</a>
              </div>
            </div>
            <div className="hero-visual" aria-hidden="true">
              <span className="ring r1" /><span className="ring r2" /><span className="ring r3" />
              <img src="/logo-320.webp" alt="" width={320} height={320} />
              <span className="orbit o1"><Icon name="qr" /> QR check-in</span>
              <span className="orbit o2"><Icon name="cash" /> Cash or GCash, with receipts</span>
              <span className="orbit o3"><Icon name="globe" /> English · Filipino</span>
              <span className="orbit o4"><Icon name="phone" /> Android app</span>
            </div>
          </div>
          <a className="scroll-cue" href="#day" aria-label="Scroll to the story"><Icon name="mouse" /><span>Scroll</span></a>
          <p className="photo-credit">Photo: G Fitness, Mamburao</p>
        </section>

        <div className="ticker" aria-hidden="true">
          <div className="ticker-row">
            {[0, 1].map((k) => <span key={k}>{TICKER.map((t) => <b key={t}>{t}<i>✦</i></b>)}</span>)}
          </div>
          <div className="ticker-row rev">
            {[0, 1].map((k) => <span key={k}>{[...TICKER].reverse().map((t) => <b key={t}>{t}<i>✦</i></b>)}</span>)}
          </div>
        </div>

        <Story />

        <FeatureTrack />

        <section className="photo-band" id="floor" data-scroll>
          <div className="pb-img" aria-hidden="true"><img src="/gfit-coaches.webp" alt="" loading="lazy" /></div>
          <div className="wrap pb-inner">
            <span className="eyebrow">Built on a real gym floor</span>
            <h2 className="big">Coaches carry <br />the app too.</h2>
            <p className="lede">
              Trainers sign in to the same phone app. They run their own classes, decide their own bookings,
              and see only the members they train — and only what those members choose to share.
            </p>
          </div>
          <p className="photo-credit">Photo: the coaches of G Fitness, Mamburao</p>
        </section>

        <section className="stats-sec">
          <div className="wrap">
            <div className="stats">
              <Stat to={229} label="exercises" sub="in the shared library, each with cues and steps" />
              <Stat to={19} label="switches" sub="to turn off the parts your gym does not run" />
              <Stat to={2} label="languages" sub="English and Filipino in the member app" />
              <Stat to={gymsFailed ? null : gyms?.length ?? null} label={gyms?.length === 1 ? 'gym on it now' : 'gyms on it now'} sub="read live from the system" />
            </div>
          </div>
        </section>

        <section className="how" id="how" data-scroll>
          <div className="wrap">
            <span className="eyebrow">How it works</span>
            <h2 className="big">From this page<br /><span className="dim">to your first member.</span></h2>
            <div className="how-path">
              <svg className="how-line" viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true">
                <path d="M20 60 C 200 -10, 300 130, 500 60 S 800 -10, 980 60" pathLength={1} />
              </svg>
              <ol className="steps">
                <li data-reveal style={{ ['--d' as string]: 0 }}>
                  <span className="node"><Icon name="sparkle" /></span>
                  <h3>Apply</h3>
                  <p>Pick a plan and tell us about your gym. You get a private link to your application’s own page.</p>
                </li>
                <li data-reveal style={{ ['--d' as string]: 1 }}>
                  <span className="node"><Icon name="message" /></span>
                  <h3>Talk it through</h3>
                  <p>We read every application ourselves. Our answer and our messages arrive on your link — write back there any time.</p>
                </li>
                <li data-reveal style={{ ['--d' as string]: 2 }}>
                  <span className="node"><Icon name="users" /></span>
                  <h3>Set up and go</h3>
                  <p>Sign in to the gym app, add your name, logo, colour and plans, then print your join poster for members to scan.</p>
                </li>
              </ol>
            </div>
          </div>
        </section>

        <section id="pricing">
          <div className="wrap">
            <span className="eyebrow">Pricing</span>
            <div className="price-head">
              <h2 className="big">
                {tiers === null ? 'What it costs'
                  : tiers.length === 0 ? 'Ask us what it costs'
                  : trial ? <>Start free for <span className="hl">{trial} days.</span></>
                  : 'What it costs'}
              </h2>
              {anyYearly && (
                <div className="switch" role="group" aria-label="Show prices">
                  <button type="button" className={!yearly ? 'on' : ''} aria-pressed={!yearly} onClick={() => setYearly(false)}>Monthly</button>
                  <button type="button" className={yearly ? 'on' : ''} aria-pressed={yearly} onClick={() => setYearly(true)}>Yearly</button>
                  <span className="knob" style={{ transform: yearly ? 'translateX(100%)' : 'none' }} />
                </div>
              )}
            </div>
            <p className="section-lede">Paid from wherever your gym is — send the reference from the gym app and we confirm it. Cancel by telling us.</p>
            <div className="pay-note">
              {['GCash', 'Maya', 'Bank transfer'].map((m) => <span className="pill" key={m}><Icon name="cash" /> {m}</span>)}
            </div>
            {tiers?.length === 0 && (
              <p className="note bad" style={{ marginTop: 24 }}>
                <Icon name="alert" /> Our price list is not loading right now. Send the form below and we will answer with it.
              </p>
            )}
            <div className="grid tiers">
              {tiers === null && [0, 1, 2].map((i) => <div className="skeleton" key={i} aria-hidden="true" />)}
              {tiers?.map((t, i) => {
                const showYear = yearly && t.yearly !== null && t.yearly > 0;
                return (
                  <div className={`card tier tilt${t.trialDays ? ' has-trial' : ''}`} key={t.key} data-reveal style={{ ['--d' as string]: i }}>
                    {t.trialDays ? <span className="badge">{t.trialDays} days free</span> : null}
                    <h3>{t.name}</h3>
                    <div className="price" key={showYear ? 'y' : 'm'}>
                      {showYear ? <>{peso(t.yearly!)}<small> / year</small></>
                        : <>{t.monthly === 0 ? 'Free' : t.monthly === null ? 'Talk to us' : peso(t.monthly)}{t.monthly ? <small> / month</small> : null}</>}
                    </div>
                    {!showYear && t.yearly !== null && t.yearly > 0 && <p className="yearly">or {peso(t.yearly)} a year</p>}
                    {yearly && !showYear && t.monthly !== 0 && t.monthly !== null && <p className="yearly">Monthly only</p>}
                    <p className="line">{t.line}</p>
                    {(t.maxMembers !== null || t.includes.length > 0) && (
                      <ul>
                        {t.maxMembers !== null && <li><Icon name="check" /> Up to {t.maxMembers.toLocaleString('en-PH')} members</li>}
                        {t.includes.map((line) => <li key={line}><Icon name="check" /> {line}</li>)}
                      </ul>
                    )}
                    <div className="choose-wrap">
                      <a className={`cta${t.trialDays ? '' : ' ghost'} choose`} href="#apply"
                        onClick={() => setChosen(t.key)}>Choose {t.name}</a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="gyms">
          <div className="wrap">
            <span className="eyebrow">Already on Core Fitness</span>
            <h2>{gyms === null || gymsFailed ? 'Gyms on Core Fitness'
              : gyms.length === 1 ? 'One gym, so far' : `${gyms.length} gyms`}</h2>
            <p className="section-lede">
              {gymsFailed ? 'The list of gyms is not loading right now.' : 'Members of these gyms sign in with the same app. Tap one to join it.'}
            </p>
            <div className="gyms">
              {gyms?.map((g, i) => (
                <a className="gym" key={g.id} href={`${MEMBER_APP}/join/${g.slug}`} data-reveal style={{ ['--d' as string]: i }}>
                  <span className="mono" aria-hidden="true">{initials(g.name)}</span>
                  {g.name}
                  <Icon name="arrow" />
                </a>
              ))}
            </div>
          </div>
        </section>

        <div className="wrap"><ApplySection tiers={tiers ?? []} chosen={chosen} /></div>

        <SiteFooter />
        </>}
      </main>
    </>
  );
}

/**
 * Register your gym (0148): the plan first, then who they are, then how they
 * heard of us and how they like to be reached.
 *
 * The row lands in `gym_applications` as 'pending' through
 * `submit_gym_application()`, which hands back the applicant's private status
 * link — where they read our answer, write back, and later see how to pay.
 * Before 0148 is pasted the form still works the old way (a plain insert) and
 * simply has no link to give.
 */
const HEARD = ['Facebook', 'A friend or another gym', 'Google', 'TikTok', 'Instagram', 'A Core Fitness gym', 'Other'];
const CONTACT: [string, string][] = [['viber', 'Viber'], ['messenger', 'Messenger'], ['sms', 'Text (SMS)'], ['call', 'A call'], ['whatsapp', 'WhatsApp'], ['email', 'Email']];

function ApplySection({ tiers, chosen }: { tiers: Tier[]; chosen: string | null }) {
  const [form, setForm] = useState({
    gym_name: '', owner_name: '', email: '', phone: '', address: '', member_estimate: '', message: '',
    plan: '', billing: 'monthly', heard_from: '', heard_other: '', contact_pref: 'viber', contact_handle: '',
    password: '', password2: '',
  });
  /** What became of the account (0187): made (confirm the email), already there (sign in), or could not be made. */
  const [acct, setAcct] = useState<'made' | 'exists' | 'failed' | null>(null);
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Left empty by people, filled by bots. A real person never sees it. */
  const [trap, setTrap] = useState('');
  const [copied, setCopied] = useState(false);
  /** Agreement to the gym documents (0154) — asked only once they are in effect. */
  const [agreed, setAgreed] = useState(false);
  /** In effect only when the platform has published this very text (0156). */
  const IN_EFFECT = inEffect(usePlatformFacts());

  // A tier card's "Choose" fills the plan; so does there being only one.
  useEffect(() => {
    if (chosen) setForm((f) => ({ ...f, plan: chosen }));
  }, [chosen]);
  const plan = tiers.find((t) => t.key === form.plan) ?? null;
  /** The place picker composes "street, town, province"; stable, so its effect does not loop. */
  const setAddress = useCallback((address: string) => setForm((f) => (f.address === address ? f : { ...f, address })), []);

  const needed = [...(tiers.length > 0 ? [form.plan] : []), form.gym_name, form.owner_name, form.email, form.phone, form.password];
  const done = needed.filter((v) => v.trim() !== '').length;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (trap) return;                       // quietly ignored
    if (!supabase) { setError('This page cannot reach Core Fitness right now. Please email us instead.'); return; }
    if (tiers.length > 0 && !form.plan) { setError('Choose a plan first — you can change it later.'); return; }
    if (IN_EFFECT && !agreed) { setError('Tick the box to agree to the terms for gyms before sending.'); return; }
    if (form.password.length < 8) { setError('Choose a password of at least 8 characters for your account.'); return; }
    if (form.password !== form.password2) { setError('The two passwords do not match.'); return; }
    setState('sending');
    setError(null);
    const heard = form.heard_from === 'Other' ? form.heard_other.trim() || 'Other' : form.heard_from;
    const { data, error: rpcError } = await supabase.rpc('submit_gym_application', {
      p_gym_name: form.gym_name.trim(), p_owner_name: form.owner_name.trim(), p_email: form.email.trim(),
      p_phone: form.phone.trim(), p_address: form.address.trim() || null,
      p_member_estimate: form.member_estimate ? Number(form.member_estimate) : null,
      p_message: form.message.trim() || null, p_plan_key: form.plan || null, p_billing: form.billing,
      p_heard_from: heard || null, p_contact_pref: form.contact_pref || null, p_contact_handle: form.contact_handle.trim() || null,
    });
    if (rpcError && /schema cache|Could not find the function/i.test(rpcError.message)) {
      // 0148 not pasted yet: the old way, without a status link.
      const { error: insertError } = await supabase.from('gym_applications').insert({
        gym_name: form.gym_name.trim(), owner_name: form.owner_name.trim(), email: form.email.trim(),
        phone: form.phone.trim(), address: form.address.trim() || null,
        member_estimate: form.member_estimate ? Number(form.member_estimate) : null,
        message: [form.message.trim(), plan ? `Plan: ${plan.name} (${form.billing})` : '', heard ? `Heard from: ${heard}` : '']
          .filter(Boolean).join('\n') || null,
      });
      if (insertError) { setError(insertError.message); setState('idle'); return; }
      setState('sent');
      return;
    }
    if (rpcError) { setError(rpcError.message); setState('idle'); return; }
    const newToken = typeof data === 'string' ? data : null;
    // The agreement is recorded against the private status token (0154). Before 0154 is pasted this call
    // fails; the application still went in, and the platform simply sees no acceptance — never a false one.
    if (IN_EFFECT && newToken) {
      try { await supabase.rpc('accept_gym_terms', { p_token: newToken, p_version: VERSION }); } catch { /* see above */ }
    }
    // The account (0187): made after the application, carrying its token, so the
    // database ties the two together — only when the email matches as well.
    if (newToken) {
      const [first, ...rest] = form.owner_name.trim().split(/\s+/);
      const { data: su, error: suError } = await supabase.auth.signUp({
        email: form.email.trim(), password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}${window.location.pathname}#account`,
          data: { signup_source: 'gym_applicant', application_token: newToken, first_name: first ?? '', last_name: rest.join(' '), phone: form.phone.trim() },
        },
      });
      // Supabase answers an address that already has an account with a user and no identities.
      setAcct(suError ? (/registered|exists/i.test(suError.message) ? 'exists' : 'failed')
        : su.user && (su.user.identities?.length ?? 0) === 0 ? 'exists' : 'made');
    }
    setToken(newToken);
    setState('sent');
  };

  if (state === 'sent') {
    const link = token ? `${window.location.origin}${window.location.pathname}#status/${token}` : null;
    return (
      <section id="apply">
        <span className="eyebrow">Register your gym</span>
        <h2>Got it — thank you.</h2>
        <div className="sent">
          <p style={{ marginTop: 0 }}>
            We read every application ourselves and will reach you by {CONTACT.find(([k]) => k === form.contact_pref)?.[1] ?? 'email'}{' '}
            or at <strong style={{ color: 'var(--text)' }}>{form.email}</strong>.
          </p>
          {acct === 'made' && (
            <p data-account-made><strong style={{ color: 'var(--text)' }}>Confirm your email.</strong> We sent a link to {form.email}. Once it is confirmed,
              sign in at <a href="#account" style={{ color: 'var(--violet-text)' }}>My application</a> (or the gym app) to send your
              business documents and follow our answer.</p>
          )}
          {acct === 'exists' && (
            <p>You already have a Core Fitness account with {form.email}. <a href="#account" style={{ color: 'var(--violet-text)' }}>Sign in</a> with
              it to send your business documents — the application is found by your email.</p>
          )}
          {acct === 'failed' && (
            <p>Your application went in, but the account could not be made. <a href="#account" style={{ color: 'var(--violet-text)' }}>Make one</a> with
              the same email to send your documents.</p>
          )}
          {link && (
            <>
              <p><strong style={{ color: 'var(--text)' }}>Keep this link.</strong> It is your application's own page: where it stands,
                our messages, and — once you are in — how to pay from wherever you are.</p>
              <p style={{ wordBreak: 'break-all' }}><a href={link} style={{ color: 'var(--violet-text)' }}>{link}</a></p>
              <div className="cta-row" style={{ marginTop: 18 }}>
                <button className="cta" type="button" onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}>
                  {copied ? 'Link copied' : 'Copy my link'}
                </button>
                <a className="cta ghost" href={`#status/${token}`}>Open it</a>
              </div>
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section id="apply">
      <span className="eyebrow">Register your gym</span>
      <h2>Tell us about your gym</h2>
      <p className="section-lede">No card, no commitment. Pick a plan, tell us who you are, and we will talk it through with you before anything is paid.</p>

      <div className="apply-panel tilt-soft" data-reveal>
        <div className="meter" aria-live="polite">
          <div className="meter-bar"><span style={{ width: `${(done / needed.length) * 100}%` }} /></div>
          <small>{done === needed.length ? 'Ready to send' : `${done} of ${needed.length} required answers`}</small>
        </div>
        <form className="apply" onSubmit={submit}>
          {tiers.length > 0 && (
            <fieldset>
              <legend><span className="num">1</span> Which plan?</legend>
              <div className="full">
                <div className="plan-pick">
                  {tiers.map((t) => (
                    <button type="button" key={t.key} className={`plan-opt${form.plan === t.key ? ' on' : ''}`}
                      aria-pressed={form.plan === t.key} onClick={() => setForm({ ...form, plan: t.key })}>
                      <span className="tick" aria-hidden="true"><Icon name="check" /></span>
                      <b>{t.name}</b>
                      <span>{t.monthly === 0 ? 'Free' : t.monthly === null ? 'Talk to us' : `${peso(t.monthly)} / month`}</span>
                      {t.trialDays ? <small>{t.trialDays} days free</small> : t.line ? <small>{t.line}</small> : null}
                    </button>
                  ))}
                </div>
                {plan && plan.yearly !== null && plan.yearly > 0 && (
                  <div className="billing">
                    <label><input type="radio" name="billing" checked={form.billing === 'monthly'} onChange={() => setForm({ ...form, billing: 'monthly' })} /> Monthly</label>
                    <label><input type="radio" name="billing" checked={form.billing === 'yearly'} onChange={() => setForm({ ...form, billing: 'yearly' })} /> Yearly ({peso(plan.yearly)})</label>
                  </div>
                )}
              </div>
            </fieldset>
          )}

          <fieldset>
            <legend><span className="num">{tiers.length > 0 ? 2 : 1}</span> About your gym</legend>
            <div className="field">
              <label htmlFor="gym_name">Gym name</label>
              <input id="gym_name" required maxLength={80} value={form.gym_name} onChange={set('gym_name')} />
            </div>
            <div className="field">
              <label htmlFor="owner_name">Your name</label>
              <input id="owner_name" required maxLength={80} autoComplete="name" value={form.owner_name} onChange={set('owner_name')} />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" required maxLength={120} autoComplete="email" value={form.email} onChange={set('email')} />
            </div>
            <div className="field">
              <label htmlFor="phone">Mobile number</label>
              <input id="phone" type="tel" required maxLength={20} autoComplete="tel" placeholder="09XX XXX XXXX" value={form.phone} onChange={set('phone')} />
            </div>
            <div className="full">
              <span className="field-legend">Where is the gym?</span>
              <PlacePicker onChange={setAddress} />
            </div>
            <div className="field">
              <label htmlFor="member_estimate">Members you have now, roughly</label>
              <input id="member_estimate" type="number" inputMode="numeric" min={0} max={100000} value={form.member_estimate} onChange={set('member_estimate')} />
            </div>
          </fieldset>

          <fieldset>
            <legend><span className="num">{tiers.length > 0 ? 3 : 2}</span> Your account</legend>
            <p className="full note" style={{ marginTop: 0 }}>You sign in with your email and this password to follow your application, send your
              business documents and — once you are in — run your gym. No temporary password to pass around.</p>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')} />
            </div>
            <div className="field">
              <label htmlFor="password2">Password again</label>
              <input id="password2" type="password" required minLength={8} autoComplete="new-password" value={form.password2} onChange={set('password2')} />
            </div>
          </fieldset>

          <fieldset>
            <legend><span className="num">{tiers.length > 0 ? 4 : 3}</span> How we stay in touch</legend>
            <div className="field">
              <label htmlFor="heard_from">How did you hear about Core Fitness?</label>
              <select id="heard_from" value={form.heard_from} onChange={set('heard_from')}>
                <option value="">Choose one</option>
                {HEARD.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            {form.heard_from === 'Other' && (
              <div className="field">
                <label htmlFor="heard_other">Where?</label>
                <input id="heard_other" maxLength={60} value={form.heard_other} onChange={set('heard_other')} />
              </div>
            )}
            <div className="field">
              <label htmlFor="contact_pref">Best way to reach you</label>
              <select id="contact_pref" value={form.contact_pref} onChange={set('contact_pref')}>
                {CONTACT.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {form.contact_pref === 'messenger' && (
              <div className="field">
                <label htmlFor="contact_handle">Your Facebook name or link</label>
                <input id="contact_handle" maxLength={120} value={form.contact_handle} onChange={set('contact_handle')} />
              </div>
            )}
            <div className="field full">
              <label htmlFor="message">Anything we should know? <span className="opt">(optional)</span></label>
              <textarea id="message" maxLength={1000} value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </div>
          </fieldset>

          <div className="hp" aria-hidden="true">
            <label htmlFor="website">Leave this empty</label>
            <input id="website" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
          </div>

          {IN_EFFECT ? (
            <label className="agree">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>
                For my gym, I have read and agree to the <a href="#legal/terms" target="_blank" rel="noopener">Terms of Service for gyms</a>,
                the <a href="#legal/dpa" target="_blank" rel="noopener">Data Processing Agreement</a> and
                the <a href="#legal/privacy" target="_blank" rel="noopener">Privacy Policy</a> (version of {VERSION}).
              </span>
            </label>
          ) : (
            <p className="note">
              Our terms for gyms are being finalised — you can read the <a href="#legal/terms" target="_blank" rel="noopener">draft</a>.
            </p>
          )}

          {error && <p className="note bad" role="alert"><Icon name="alert" /> {error}</p>}

          <div className="submit-row">
            <button className="cta" type="submit" disabled={state === 'sending'}>
              {state === 'sending' ? 'Sending…' : plan ? `Apply for ${plan.name}` : 'Send application'}
              {state !== 'sending' && <Icon name="arrow" className="arrow" />}
            </button>
            <p className="note">We keep what you send here to answer you, and nothing else.</p>
          </div>
        </form>
      </div>
    </section>
  );
}
