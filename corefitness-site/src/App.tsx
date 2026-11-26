import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { storageWords, toTier, withStorage, type PublicPlanRow, type Tier } from './pricing';
import StatusPage from './Status';
import Account from './Account';
import { GoogleButton } from './google';
import Icon, { type IconName } from './Icon';
import Story from './Story';
import MockupHero from './MockupHero';
import MockupRoles from './MockupRoles';
import MockupRibbon from './MockupRibbon';
import MockupBackdrop from './MockupBackdrop';
import MockupDemoMedia, { DemoOrExample } from './MockupDemoMedia';
import { Catalogue, Manifesto, Phone3D, Scrub } from './Showcase';
import PlacePicker from './PlacePicker';
import Legal, { parseLegalHash } from './Legal';
import { inEffect, VERSION } from './legalText';
import { usePublishedDocs } from './usePublishedDocs';
import { usePlatformFacts } from './usePlatformFacts';
import { useSiteTexts } from './siteTexts';
import { useMotionEngine } from './motion';

const MEMBER_APP = 'https://corefitness-gym.vercel.app';
import { GYM_SIGN_IN, showGymSignIn, useSiteAccount, type SiteAccount } from './siteAccount';

interface Gym { id: string; slug: string; name: string; is_demo?: boolean }

const peso = (n: number) => '₱' + n.toLocaleString('en-PH');

/**
 * The public page: what Core Fitness is, what it costs, who already uses it,
 * and the form a gym owner fills in to be let in.
 *
 * Redesigned 2026-11-21 (design/lessons/LESSONS.md): the product is the picture — app screens with
 * sample data, said so — and the four scroll techniques each carry real content: reveals as you
 * arrive (scroll-triggered), the manifesto, the 3D phone, the month scrub and the how-it-works line
 * (scroll-linked), the hero and the coaches band (parallax), and one day at a gym (scrollytelling).
 * No cursor effects, no glow, no invented numbers.
 *
 * Everything claimed here is something the system does — the features are the
 * ones in the apps, the gym list is read from the database, and a price that
 * has not been decided says so rather than inventing a number (src/pricing.ts).
 */
/** `#status/<token>`: an applicant's own page (0148). Read from the hash so it survives any static host. */
const statusToken = () => /^#status\/([a-f0-9]{32,})$/i.exec(window.location.hash)?.[1] ?? null;
/** `#account`: an applicant signed in (0187). Back from PayMongo (0224, `?paid=`), the page opens there too. */
if (!window.location.hash && /[?&](paid|cancelled)=/.test(window.location.search)) {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#account`);
}
const isAccount = () => window.location.hash === '#account';

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

/** The four people who use it every day, and what each one opens. */
const ROLES: { icon: IconName; who: string; where: string; does: string[] }[] = [
  { icon: 'chart', who: 'The owner', where: 'The gym app, on a computer',
    does: ['Each morning: what needs you, cash and check-ins', 'Your plans, prices, refund rules and look', 'Who is drifting away, before they leave'] },
  { icon: 'desk', who: 'The front desk', where: 'The same gym app, with only what you allow',
    does: ['Scan check-in codes, or let the kiosk do it', 'Take payments with a receipt number', 'Renew, freeze, walk-ins and the shop'] },
  { icon: 'message', who: 'The coaches', where: 'The phone app, built like a chat',
    does: ['Decide their own booking requests', 'A place for each trainee: chat, workouts, progress', 'See only what their members choose to share'] },
  { icon: 'phone', who: 'The members', where: 'The phone app, Android and iPhone',
    does: ['Their check-in code and membership', 'Workouts that log every set and find records', 'Their coach, points and the gym’s news'] },
];

/** Answers to what owners ask first — each one something the system does today. */
const FAQ: [string, string][] = [
  ['Do my members need Android or iPhone?', 'Either. On Android the member app installs like any other app. On an iPhone it opens from the browser and goes on the home screen. Members and coaches use the same app.'],
  ['We take cash. Does that still work?', 'Yes. Cash is the default. Every desk payment gets a receipt number the database issues, never typed and never repeated, and the drawer closes out each day. If you want, members can also pay in the app (QRPh, GCash, Maya or card through your own PayMongo account) or send a GCash or bank reference for your desk to confirm.'],
  ['What happens when the signal drops?', 'The member app keeps showing what it last loaded and says that it is offline. Sets logged in the middle of a workout are kept on the phone and sent when the signal is back.'],
  ['Who can see my members’ information?', 'Your gym only. One gym can never see another’s members. The database enforces it, and it is tested on every change. Core Fitness looks inside your gym only when you grant support access, read-only, for a few hours. You are the controller under RA 10173 and we are your processor, in a signed agreement.'],
  ['We don’t run classes, or a shop. Is it still for us?', 'Yes. Whole parts of the system switch off, and your members’ app and your menus simply stop showing them. Most gyms start with memberships, check-in and personal training.'],
  ['Can it look like our gym?', 'Your name, your logo and your two colours in your members’ app, and even your own words for members, coaches and sessions. Your plans, prices, cancellation reasons and refund rules are yours to set.'],
  ['Is the AI assistant safe for beginners?', 'It only proposes. Every change to a routine, schedule or goal is a card the member accepts or discards, and can be undone. A stated injury gets a referral to a person, never a changed exercise, and it gives no calorie or macro targets. You choose which plans include it and set its limits.'],
  ['How do we start?', 'Fill in the form below. We read every application ourselves and answer on your application’s own page. Once you are in, sign in to the gym app, add your logo, colours and plans, and print your join poster for members to scan.'],
];

const NAV: [string, string][] = [['inside', 'Features'], ['day', 'A day'], ['pricing', 'Pricing'], ['faq', 'Questions']];

/**
 * The coaches band's try-it (2026-11-21): a coach's request queue with three sample requests. Accept tells
 * the member; Decline asks for a reason first, as the app does; each decided card closes without a jump.
 * Sample data, said so. Behaviour shown is the system's: coaches decide their own bookings (0071).
 */
const COACH_REQS = [
  { id: 'lea', who: 'Lea R.', what: 'One-to-one session', when: 'Thu · 6:00 PM', note: 'Week 3 of her package' },
  { id: 'jon', who: 'Jon M.', what: 'One-to-one session', when: 'Fri · 7:00 AM', note: 'His first session' },
  { id: 'mia', who: 'Mia T.', what: 'Monthly package', when: 'Starts Monday', note: '8 sessions, asked in the app' },
];
const DECLINE_WHY = ['Fully booked then', 'Outside my hours', 'On leave that day'];
type ReqState = { step: 'open' | 'why' | 'done' | 'gone'; said?: string };

function CoachDemo() {
  const fresh = () => Object.fromEntries(COACH_REQS.map((r) => [r.id, { step: 'open' } as ReqState]));
  const [st, setSt] = useState<Record<string, ReqState>>(fresh);
  const decide = (id: string, said: string) => {
    setSt((s) => ({ ...s, [id]: { step: 'done', said } }));
    window.setTimeout(() => setSt((s) => (s[id]?.step === 'done' ? { ...s, [id]: { ...s[id]!, step: 'gone' } } : s)), 1400);
  };
  const open = COACH_REQS.filter((r) => st[r.id]?.step !== 'done' && st[r.id]?.step !== 'gone').length;
  const allGone = COACH_REQS.every((r) => st[r.id]?.step === 'gone');
  return (
    <div className="cq" data-coach-demo>
      <div className="cq-head">
        <span><b>Requests</b><small>{open === 0 ? 'Nothing to decide' : `${open} to decide`}</small></span>
        <em>Try it · sample data</em>
      </div>
      <ul className="cq-list" aria-live="polite">
        {COACH_REQS.map((r) => {
          const s = st[r.id]!;
          const first = r.who.split(' ')[0];
          return (
            <li key={r.id} className={`cq-item${s.step === 'gone' ? ' gone' : ''}`}>
              <div className="cq-clip"><div className="cq-card">
                <div className="cq-top">
                  <span className="cq-av" aria-hidden="true">{initials(r.who)}</span>
                  <span className="cq-who"><b>{r.who}</b><small>{r.what} · {r.when}</small></span>
                </div>
                <p className="cq-note">{r.note}</p>
                {s.step === 'open' && (
                  <div className="cq-actions">
                    <button type="button" className="cq-btn" onClick={() => setSt((x) => ({ ...x, [r.id]: { step: 'why' } }))}>Decline</button>
                    <button type="button" className="cq-btn yes" onClick={() => decide(r.id, `Accepted. ${first} was told.`)}>Accept</button>
                  </div>
                )}
                {s.step === 'why' && (
                  <div className="cq-why">
                    <small>Tell {first} why</small>
                    <div>{DECLINE_WHY.map((w) => (
                      <button type="button" key={w} className="cq-chip" onClick={() => decide(r.id, `Declined: ${w.toLowerCase()}. ${first} was told why.`)}>{w}</button>
                    ))}</div>
                  </div>
                )}
                {(s.step === 'done' || s.step === 'gone') && <p className="cq-done"><Icon name="check" /> {s.said}</p>}
              </div></div>
            </li>
          );
        })}
      </ul>
      {allGone && (
        <div className="cq-empty">
          <b>All caught up.</b>
          <button type="button" className="cq-again" onClick={() => setSt(fresh())}>Try again</button>
        </div>
      )}
    </div>
  );
}

function SiteFooter() {
  const siteAccount = useSiteAccount();
  return (
    <>
    <section className="v2-finale" id="community" aria-labelledby="v2-finale-heading">
      <div className="v2-finale-stars" aria-hidden="true">✦ <span>✧</span> ✦</div>
      <h2 id="v2-finale-heading">YOUR GYM.<br />YOUR PEOPLE.<br />ALL CONNECTED.</h2>
      <a className="cta" href="#apply">Register your gym <Icon name="arrow" /></a>
      <div className="v2-finale-art"><img src="/mockup-art/footer-gym-community.webp" alt="A community of cartoon gym members, coaches, and Core Fitness gym mascots" loading="lazy" /></div>
    </section>
    <footer className="v2-footer" id="site-footer">
      <div className="wrap foot-row">
        <a className="brand" href="#top">
          <img src="/logo-320.webp" alt="" width={26} height={26} />
          <span>Core Fitness</span>
        </a>
        <span>Made in Mamburao, Occidental Mindoro</span>
        <span className="grow" />
        {showGymSignIn(siteAccount) && <a href={GYM_SIGN_IN}>Gym sign in</a>}
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
        <div>
          <b>On this page</b>
          <a href="#inside">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#apply">Register your gym</a>
        </div>
      </div>
      <p className="wrap foot-small">Core Fitness · gym software for Philippine gyms</p>
      <div className="v2-footer-wordmark" aria-hidden="true">Core Fitness</div>
      <a className="v2-footer-top" href="#top">Back to top ↑</a>
    </footer>
    </>
  );
}

export default function App() {
  useMotionEngine();
  const siteAccount = useSiteAccount();
  /** Words the platform changed (0241); a missing key keeps the built-in words below. */
  const tx = useSiteTexts();
  /** 0261: sections the platform hid. An id the site does not know is ignored; nothing hidden is the default. */
  const hidden = new Set((tx.hidden_sections ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const [gyms, setGyms] = useState<Gym[] | null>(null);
  const [gymsFailed, setGymsFailed] = useState(false);
  const [token, setToken] = useState(statusToken);
  const [account, setAccount] = useState(isAccount);
  /** The plan a tier card's "Choose" put into the form. */
  const [chosen, setChosen] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [yearly, setYearly] = useState(false);
  const [previewPlan, setPreviewPlan] = useState<string | null>(null);
  const [gymQuery, setGymQuery] = useState('');
  const [gymFilter, setGymFilter] = useState<'all' | 'live' | 'demo'>('all');
  const [gymPage, setGymPage] = useState(0);
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
  // The header marks the section on screen — re-attached when the page comes back from a document,
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
      const [gymRes, planRes, storageRes] = await Promise.all([
        supabase.rpc('list_gyms', { p_search: null }),
        // The price list, from the same rows the platform owner edits and
        // `gyms.plan` points at (0108). Before that migration is pasted this
        // function does not exist; the section then says so rather than
        // printing numbers from a file that nobody is maintaining any more.
        supabase.rpc('platform_price_list'),
        // 0247: what each plan includes in storage. Absent before the migration: the line is then left out.
        supabase.rpc('platform_plan_storage'),
      ]);
      setGymsFailed(!Array.isArray(gymRes.data));
      setGyms(Array.isArray(gymRes.data) ? (gymRes.data as Gym[]) : []);
      setTiers(Array.isArray(planRes.data) ? withStorage((planRes.data as PublicPlanRow[]).map(toTier), storageRes.data) : []);
    })();
  }, []);

  const trial = tiers?.find((t) => t.trialDays)?.trialDays ?? null;
  const anyYearly = !!tiers?.some((t) => t.yearly !== null && t.yearly > 0);

  const directoryMatches = (gyms ?? []).filter(g => g.name.toLowerCase().includes(gymQuery.trim().toLowerCase()) && (gymFilter === 'all' || (gymFilter === 'demo' ? g.is_demo : !g.is_demo)));
  const directoryPages = Math.max(1, Math.ceil(directoryMatches.length / 6));
  const directoryPage = Math.min(gymPage, directoryPages - 1);
  const activePreviewPlan = tiers?.some(t => t.key === previewPlan) ? previewPlan : tiers?.[0]?.key;
  return (
    <>
      <div className="progress" aria-hidden="true"><span /></div>
      <MockupBackdrop />

      <header className={`top${scrolled ? ' scrolled' : ''}`}>
        {tx.notice && <div className="site-notice" role="status" data-site-notice>{tx.notice}</div>}
        <div className="wrap">
          <a className="brand" href="#top" aria-label="Core Fitness, back to top">
            <img src="/logo-320.webp" alt="" width={30} height={30} />
            <span>Core Fitness</span>
          </a>
          <nav aria-label="Sections">
            {NAV.filter(([id]) => !hidden.has(id)).map(([id, label]) => <a key={id} href={`#${id}`} className={section === id ? 'on' : ''}>{label}</a>)}
          </nav>
          <span className="grow" />
          <a className="link-quiet hide-md" href={`${MEMBER_APP}/get-app`}>Get the member app</a>
          {/* Phones hide every quiet link above, and phones are who installs the app (2026-11-26). */}
          <a className="app-sm" href={`${MEMBER_APP}/get-app`}>Get the app</a>
          <a className="link-quiet hide-sm" href="#account">My application</a>
          {/* Hidden for an applicant whose gym is still pending — they have no gym to sign in to yet (2026-11-08). */}
          {showGymSignIn(siteAccount) && <a className="link-quiet" href={GYM_SIGN_IN} aria-label="Gym sign in" data-gym-sign-in><span className="hide-sm">Gym sign in</span><span className="only-sm">Sign in</span></a>}
          <a className="cta" href="#apply">Register</a>
        </div>
      </header>

      <main id="top">
        {legal ? <><Legal doc={legal.doc} section={legal.section} /><SiteFooter /></>
        : token ? <><div className="wrap status-wrap"><StatusPage token={token} /></div><SiteFooter /></>
        : account ? <><div className="wrap status-wrap"><Account /></div><SiteFooter /></> : <>

        <MockupHero tourHidden={hidden.has('ad')} />

        <MockupRoles roles={ROLES} hidden={hidden.has('roles')} title={tx.roles_title} />

        <Manifesto />

        <Story />

        <MockupRibbon />

        <Catalogue />

        <Phone3D />

        <Scrub />

        <section className="photo-band" id="floor" data-scroll hidden={hidden.has('floor') || undefined}>
          <div className="wrap pb-inner"><img className="v2-section-buddy coach-buddy" src="/mockup-art/bottle-mascot.webp" alt="" aria-hidden="true" />
            <div className="pb-copy">
            <h2 data-reveal>{tx.coaches_title ?? <>Coaches carry <br />the app too.</>}</h2>
            <p className="lede" data-reveal style={{ ['--d' as string]: 1 }}>
              {tx.coaches_lede ?? <>Trainers sign in to the same phone app. They run their own classes, decide their own bookings,
              and see only the members they train, and only what those members choose to share.</>}
            </p>
            <ul className="pb-facts">
              {['Accept or decline each request, with a reason', 'A place per trainee: chat, workouts and check-ins', 'Programs that get harder on their own'].map((f, i) => (
                <li key={f} data-reveal style={{ ['--d' as string]: i + 2 }}><Icon name="check" /> {f}</li>
              ))}
            </ul>
            </div>
            <div className="pb-visual">
              <DemoOrExample label="Try the booking flow" video={<MockupDemoMedia name="coach" label="Coach dashboard demo" />}><CoachDemo /></DemoOrExample>
            </div>
          </div>
        </section>

        <section className="how" id="how" data-scroll hidden={hidden.has('how') || undefined}>
          <div className="wrap">
            <div className="sec-head">
              <h2 data-reveal>{tx.how_title ?? 'From this page to your first member.'}</h2>
              <p className="section-lede" data-reveal style={{ ['--d' as string]: 1 }}>No card and no commitment to apply. We talk it through with you before anything is paid.</p>
            </div>
            <div className="v2-section-buddy setup-buddy" aria-hidden="true"><img src="/mockup-art/gym-foreground.webp" alt="" /></div><div className="how-path">
              <span className="how-line" aria-hidden="true"><i /></span>
              <ol className="steps">
                <li data-reveal style={{ ['--d' as string]: 0 }}>
                  <span className="node">1</span>
                  <h3>Apply</h3>
                  <p>Pick a plan and tell us about your gym. You get a private link to your application’s own page.</p>
                </li>
                <li data-reveal style={{ ['--d' as string]: 1 }}>
                  <span className="node">2</span>
                  <h3>Talk it through</h3>
                  <p>We read every application ourselves. Our answer and our messages arrive on your link. Write back there any time.</p>
                </li>
                <li data-reveal style={{ ['--d' as string]: 2 }}>
                  <span className="node">3</span>
                  <h3>Set up and go</h3>
                  <p>Sign in to the gym app, add your name, logo, colours and plans, then print your join poster for members to scan.</p>
                </li>
              </ol>
            </div>
          </div>
        </section>

        <section id="pricing" hidden={hidden.has('pricing') || undefined}>
          <div className="wrap">
            <div className="v2-section-buddy pricing-buddy" aria-hidden="true"><div className="v2-lifting-sprite" /></div><div className="price-head">
              <h2 data-reveal>
                {tiers === null ? 'What it costs'
                  : tiers.length === 0 ? 'Ask us what it costs'
                  : trial ? <>Start free for {trial} days.</>
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
            <p className="pay-line">Pay in the gym app with QRPh, GCash, Maya or card, confirmed the moment it is paid. Or send a bank or GCash reference and we confirm it. Cancel by telling us.</p>
            {tiers?.length === 0 && (
              <p className="note bad" style={{ marginTop: 24 }}>
                <Icon name="alert" /> Our price list is not loading right now. Send the form below and we will answer with it.
              </p>
            )}
            <div className="v2-plan-picker" role="group" aria-label="Preview a membership plan">
              {tiers?.map(plan => <button key={plan.key} type="button" aria-pressed={activePreviewPlan===plan.key} onClick={()=>setPreviewPlan(plan.key)}>{plan.name}</button>)}
              {tiers && tiers.length>1 && <button className="v2-plan-next" type="button" onClick={()=>setPreviewPlan(tiers[(tiers.findIndex(t=>t.key===activePreviewPlan)+1)%tiers.length].key)}>Next plan <Icon name="arrow" /></button>}
            </div>
            <div className="tiers v2-one-plan" style={{ ['--cols' as string]: Math.max(1, Math.min(4, tiers?.length || 3)) }} aria-busy={tiers === null}>
              {tiers === null && [0, 1, 2].map((i) => <div className="skeleton" key={i} aria-hidden="true" />)}
              {tiers?.map((t, i) => {
                const showYear = yearly && t.yearly !== null && t.yearly > 0;
                return (
                  <div className={`tier${t.trialDays ? ' has-trial' : ''}`} key={t.key} hidden={activePreviewPlan !== t.key} data-reveal style={{ ['--d' as string]: i }}>
                    <span className={`badge${t.trialDays ? '' : ' none'}`}>{t.trialDays ? `${t.trialDays} days free` : ''}</span>
                    <h3>{t.name}</h3>
                    <div className="price" key={showYear ? 'y' : 'm'}>
                      {showYear ? <>{peso(t.yearly!)}<small> / year</small></>
                        : <>{t.monthly === 0 ? 'Free' : t.monthly === null ? 'Talk to us' : peso(t.monthly)}{t.monthly ? <small> / month</small> : null}</>}
                    </div>
                    {!showYear && t.yearly !== null && t.yearly > 0 && <p className="yearly">or {peso(t.yearly)} a year</p>}
                    {yearly && !showYear && t.monthly !== 0 && t.monthly !== null && <p className="yearly">Monthly only</p>}
                    {/* Keeps every column's list on the same line, so the plans compare row by row. */}
                    {!(!showYear && t.yearly !== null && t.yearly > 0) && !(yearly && !showYear && t.monthly !== 0 && t.monthly !== null) && <p className="yearly" aria-hidden="true">&nbsp;</p>}
                    <p className="line">{t.line}</p>
                    {(t.maxMembers !== null || t.aiMonthly !== null || t.includes.length > 0) && (
                      <ul>
                        <li><Icon name="check" /> <span>{t.maxMembers !== null ? `Up to ${t.maxMembers.toLocaleString('en-PH')} members` : 'Any number of members'}
                          {t.maxStaff !== null ? `, ${t.maxStaff} staff accounts` : t.maxMembers === null ? ' and staff' : ''}</span></li>
                        {t.storageMb !== undefined && <li data-plan-storage><Icon name="check" /> <span>{t.storageMb === null ? 'No limit on storage for your videos and photos' : `${storageWords(t.storageMb)} for your videos and photos`}</span></li>}
                        {t.aiMonthly !== null && <li><Icon name="check" /> <span>{t.aiMonthly.toLocaleString('en-PH')} AI assistant messages a month, more as you need them</span></li>}
                        {t.includes.slice(0, 3).map((line) => <li key={line}><Icon name="check" /> <span>{line}</span></li>)}
                      </ul>
                    )}
                    {t.includes.length > 3 && <details className="v2-plan-full"><summary>See all {t.includes.length} included features</summary><ul>{t.includes.slice(3).map(line=><li key={line}><Icon name="check" /><span>{line}</span></li>)}</ul></details>}
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

        <section id="faq" hidden={hidden.has('faq') || undefined}>
          <div className="wrap faq-grid">
            <div>
              <h2 data-reveal>{tx.faq_title ?? 'Questions owners ask first.'}</h2>
              <p className="section-lede" data-reveal style={{ ['--d' as string]: 1 }}>Something else? Ask in the form below. We answer every application ourselves.</p><div className="v2-faq-buddy" aria-hidden="true"><img src="/mockup-art/phone-journey-mascot.webp" alt="" /><span className="faq-speech">?</span><span className="faq-spark">✦</span></div>
            </div>
            <div className="faq-list">
              {FAQ.map(([q, a], i) => (
                <details key={q} data-reveal style={{ ['--d' as string]: Math.min(i, 4) }}>
                  <summary>{q}<span className="plus" aria-hidden="true" /></summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="gyms" hidden={hidden.has('gyms') || undefined}>
          <div className="wrap">
            <h2 className="mid">{gyms === null || gymsFailed ? 'Gyms on Core Fitness'
              : gyms.length === 1 ? 'One gym, so far.' : `${gyms.length} gyms on Core Fitness.`}</h2>
            <p className="section-lede">
              {gymsFailed ? 'The list of gyms is not loading right now.' : 'Members of these gyms sign in with the same app. Tap one to join it.'}
            </p>
            <div className="v2-directory-tools">
              <label className="v2-gym-search"><Icon name="globe" /><span className="sr-only">Search gyms</span><input type="search" value={gymQuery} onChange={event=>{setGymQuery(event.target.value);setGymPage(0);}} placeholder="Find your gym by name or city" aria-label="Search gyms" /></label>
              {gyms?.some(g => g.is_demo) && <div className="v2-gym-filters" role="group" aria-label="Filter gyms">{(['all','live','demo'] as const).map(filter=><button type="button" key={filter} aria-pressed={gymFilter===filter} onClick={()=>{setGymFilter(filter);setGymPage(0);}}>{filter==='all'?'All locations':filter==='live'?'Live gyms':'Demo gyms'}</button>)}</div>}
            </div>
            <div className="gyms v2-directory-grid">
              {directoryMatches.slice(directoryPage*6, directoryPage*6+6).map((g, i) => (
                <a className="gym" key={g.id} href={`${MEMBER_APP}/join/${g.slug}`} data-reveal style={{ ['--d' as string]: Math.min(i, 6) }}>
                  <span className="mono" aria-hidden="true">{initials(g.name)}</span>
                  <span>{g.name}</span>
                  {/* One of the platform's demo gyms for a load test (0238). */}
                  {g.is_demo ? <span className="gym-demo">Demo</span> : <span />}
                  <Icon name="arrow" />
                </a>
              ))}
            </div>
            {gyms !== null && <div className="v2-directory-pagination"><span aria-live="polite">{directoryMatches.length ? `${directoryPage*6+1}–${Math.min((directoryPage+1)*6,directoryMatches.length)} of ${directoryMatches.length} gyms` : 'No gyms match your search.'}</span><div><button type="button" disabled={directoryPage===0} onClick={()=>setGymPage(directoryPage-1)}>← Previous</button><span>{directoryPage+1} / {directoryPages}</span><button type="button" disabled={directoryPage+1>=directoryPages} onClick={()=>setGymPage(directoryPage+1)}>Next →</button></div></div>}
          </div>
        </section>

        {!hidden.has('voices') && <Testimonials />}

        <div className="wrap"><ApplySection tiers={tiers ?? []} chosen={chosen} siteAccount={siteAccount} title={tx.apply_title} closed={tx.apply_closed} /></div>

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

function ApplySection({ tiers, chosen, siteAccount, title, closed }: {
  tiers: Tier[]; chosen: string | null; siteAccount: SiteAccount | null;
  /** 0261: the platform's heading for the form, and, when set, the message that pauses applications. */
  title?: string; closed?: string;
}) {
  const [form, setForm] = useState({
    gym_name: '', owner_name: '', email: '', phone: '', address: '', member_estimate: '', message: '',
    plan: '', billing: 'monthly', heard_from: '', heard_other: '', contact_pref: 'viber', contact_handle: '',
    password: '', password2: '',
  });
  /** What became of the account (0187): made (confirm the email), already there (sign in), or could not be made. */
  const [acct, setAcct] = useState<'made' | 'exists' | 'failed' | 'google' | null>(null);
  /**
   * Applying with Google (0190): the name and email come from Google, there is
   * no password, and the rest is asked one step at a time.
   */
  const [google, setGoogle] = useState<{ email: string; name: string } | null>(null);
  const [gstep, setGstep] = useState(1);
  const [formStep, setFormStep] = useState(0);
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      // `provider` is only the FIRST way the account signed in: an account made with email and later linked to Google
      // reads 'email' there, and its Google sign-in was ignored (2026-11-23). Google among its methods is what counts.
      const methods: string[] = u?.app_metadata?.providers ?? (u?.app_metadata?.provider ? [u.app_metadata.provider] : []);
      if (!u || !u.email || !methods.includes('google')) return;
      const name = String(u.user_metadata?.full_name ?? u.user_metadata?.name ?? '');
      setGoogle({ email: u.email, name });
      setForm((f) => ({ ...f, email: u.email!, owner_name: f.owner_name || name }));
    });
  }, []);
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Left empty by people, filled by bots. A real person never sees it. */
  const [trap, setTrap] = useState('');
  const [copied, setCopied] = useState(false);
  /** Agreement to the gym documents (0154) — asked only once they are in effect. */
  const [agreed, setAgreed] = useState(false);
  /** In effect only when the platform has published this very text (0156). */
  const facts = usePlatformFacts();
  /** 0262: a version written in the platform's Settings, in effect; it is what an applicant agrees to. */
  const stored = usePublishedDocs();
  const IN_EFFECT = stored ? true : inEffect(facts);
  const DOC_VERSION = stored?.version ?? VERSION;

  // A tier card's "Choose" fills the plan; so does there being only one.
  useEffect(() => {
    if (chosen) setForm((f) => ({ ...f, plan: chosen }));
  }, [chosen]);
  const plan = tiers.find((t) => t.key === form.plan) ?? null;
  /** The place picker composes "street, town, province"; stable, so its effect does not loop. */
  const setAddress = useCallback((address: string) => setForm((f) => (f.address === address ? f : { ...f, address })), []);

  const needed = [...(tiers.length > 0 ? [form.plan] : []), form.gym_name, form.owner_name, form.email, form.phone, form.password];
  /** The steps when applying with Google: plan (if any), the gym, how we stay in touch. */
  const gSteps = tiers.length > 0 ? 3 : 2;
  const shows = (n: number) => !google || gstep === (tiers.length > 0 ? n : n - 1);
  const stepOk = (): string | null => {
    const at = tiers.length > 0 ? gstep : gstep + 1;
    if (at === 1 && !form.plan) return 'Choose a plan first. You can change it later.';
    if (at === 2 && (!form.gym_name.trim() || !form.owner_name.trim() || !form.phone.trim())) return 'Fill in the gym\u2019s name, your name and your mobile number.';
    return null;
  };
  const done = needed.filter((v) => v.trim() !== '').length;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (trap) return;                       // quietly ignored
    if (!supabase) { setError('This page cannot reach Core Fitness right now. Please email us instead.'); return; }
    if (tiers.length > 0 && !form.plan) { setError('Choose a plan first. You can change it later.'); return; }
    if (IN_EFFECT && !agreed) { setError('Tick the box to agree to the terms for gyms before sending.'); return; }
    // A password even with Google, so the account can also sign in with email and password.
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
      try { await supabase.rpc('accept_gym_terms', { p_token: newToken, p_version: DOC_VERSION }); } catch { /* see above */ }
    }
    // The account (0187): made after the application, carrying its token, so the
    // database ties the two together — only when the email matches as well.
    if (newToken && google) {
      // Signed in with Google already: the application is found by its address on My application,
      // and the password lets the same account sign in with email too.
      const { error: pwError } = await supabase.auth.updateUser({ password: form.password });
      setAcct(pwError ? 'failed' : 'google');
    } else if (newToken) {
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
        <h2>Got it. Thank you.</h2>
        <div className="sent">
          <p style={{ marginTop: 0 }}>
            We read every application ourselves and will reach you by {CONTACT.find(([k]) => k === form.contact_pref)?.[1] ?? 'email'}{' '}
            or at <strong style={{ color: 'var(--text)' }}>{form.email}</strong>.
          </p>
          {acct === 'google' && (
            <p data-account-google><strong style={{ color: 'var(--text)' }}>You are signed in with Google</strong>, and your password works too. Open{' '}
              <a href="#account" style={{ color: 'var(--violet-text)' }}>My application</a> to send your business documents and follow our answer.</p>
          )}
          {acct === 'made' && (
            <p data-account-made><strong style={{ color: 'var(--text)' }}>Confirm your email.</strong> We sent a link to {form.email}. Once it is confirmed,
              sign in at <a href="#account" style={{ color: 'var(--violet-text)' }}>My application</a> (or the gym app) to send your
              business documents and follow our answer.</p>
          )}
          {acct === 'exists' && (
            <p>You already have a Core Fitness account with {form.email}. <a href="#account" style={{ color: 'var(--violet-text)' }}>Sign in</a> with
              it to send your business documents. The application is found by your email.</p>
          )}
          {acct === 'failed' && (
            <p>Your application went in, but the account could not be made. <a href="#account" style={{ color: 'var(--violet-text)' }}>Make one</a> with
              the same email to send your documents.</p>
          )}
          {link && (
            <>
              <p><strong style={{ color: 'var(--text)' }}>Keep this link.</strong> It is your application's own page: where it stands,
                our messages and, once you are in, how to pay from wherever you are.</p>
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

  // An account that already runs a gym is pointed at its dashboard, not asked to apply again (2026-11-08).
  if (siteAccount && siteAccount.runs.length > 0) {
    return (
      <section id="apply" data-runs-gym>
        <span className="eyebrow">Register your gym</span>
        <h2>You already run {siteAccount.runs.map((g) => g.name).join(' and ')}</h2>
        <p className="section-lede">Your gym is on Core Fitness, so there is nothing to apply for. Its dashboard is where you run it.</p>
        <a className="cta" href={GYM_SIGN_IN}>Open your dashboard</a>
      </section>
    );
  }

  // 0261: the platform paused applications. The words are theirs; My application still works for anyone who applied.
  if (closed) {
    return (
      <section id="apply" data-apply-closed>
        <span className="eyebrow">Register your gym</span>
        <h2>Not taking new gyms right now</h2>
        <p className="section-lede" style={{ whiteSpace: 'pre-wrap' }}>{closed}</p>
        <p className="note">Already applied? Open <a href="#account">My application</a> to follow it and write to us.</p>
      </section>
    );
  }
  return (
    <section id="apply">
      <span className="eyebrow">Register your gym</span>
      <h2>{title ?? 'Tell us about your gym'}</h2>
      <p className="section-lede">No card, no commitment. Pick a plan, tell us who you are, and we will talk it through with you before anything is paid.</p>

      <div className="apply-panel tilt-soft" data-reveal>
        <div className="meter" aria-live="polite">
          <div className="meter-bar"><span style={{ width: `${(done / needed.length) * 100}%` }} /></div>
          <small>{done === needed.length ? 'Ready to send' : `${done} of ${needed.length} required answers`}</small>
        </div>
        {google ? (
          <p className="note google-note" data-google-apply>Applying as <strong>{google.email}</strong> with Google. Step {gstep} of {gSteps}.</p>
        ) : (
          <GoogleButton hash="#apply" label="Apply with Google" hint="Fills in your name and email, then asks the rest one step at a time." divider="or fill it in yourself" />
        )}
        {!google && <div className="v2-apply-steps" role="group" aria-label="Application steps">{['Plan','Your gym','Account','Contact','Review'].map((label,i)=><button type="button" key={label} disabled={i>formStep} aria-current={i===formStep?'step':undefined} onClick={()=>{setFormStep(i);setError(null);}}><span>{i+1}</span>{label}</button>)}</div>}
        <form className={`apply${!google?' v2-apply-wizard':''}`} noValidate={!google} onSubmit={event=>{
          if (!google) {
            const invalid = [...event.currentTarget.querySelectorAll<HTMLInputElement>('input,select,textarea')].find(input=>!input.checkValidity());
            if(invalid){event.preventDefault();setFormStep(Number(invalid.closest('fieldset')?.getAttribute('data-form-step')??4));requestAnimationFrame(()=>invalid.reportValidity());return;}
          }
          void submit(event);
        }}>
          {tiers.length > 0 && shows(1) && (
            <fieldset data-form-step="0" hidden={!google && formStep!==0}>
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

          {shows(2) && <fieldset data-form-step="1" hidden={!google && formStep!==1}>
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
              <input id="email" type="email" required maxLength={120} autoComplete="email" value={form.email} onChange={set('email')} readOnly={!!google} />
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
          </fieldset>}

          {(!google || shows(3)) && <fieldset data-form-step="2" hidden={!google && formStep!==2}>
            <legend><span className="num">{tiers.length > 0 ? 3 : 2}</span> Your account</legend>
            <p className="full note" style={{ marginTop: 0 }}>{google
              ? 'You can sign in with Google. Choose a password as well, so you can also sign in with your email and password.'
              : 'You sign in with your email and this password to follow your application, send your business documents and, once you are in, run your gym. No temporary password to pass around.'}</p>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')} />
            </div>
            <div className="field">
              <label htmlFor="password2">Password again</label>
              <input id="password2" type="password" required minLength={8} autoComplete="new-password" value={form.password2} onChange={set('password2')} />
            </div>
          </fieldset>}

          {shows(3) && <fieldset data-form-step="3" hidden={!google && formStep!==3}>
            <legend><span className="num">{google ? (tiers.length > 0 ? 3 : 2) : tiers.length > 0 ? 4 : 3}</span> How we stay in touch</legend>
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
          </fieldset>}

          {!google && formStep===4 && <div className="v2-apply-review"><h3>Ready to review.</h3><dl><div><dt>Plan</dt><dd>{plan?.name??'Not selected'} · {form.billing}</dd></div><div><dt>Gym</dt><dd>{form.gym_name}</dd></div><div><dt>Your name</dt><dd>{form.owner_name}</dd></div><div><dt>Email</dt><dd>{form.email}</dd></div><div><dt>Mobile</dt><dd>{form.phone}</dd></div><div><dt>Location</dt><dd>{form.address}</dd></div><div><dt>Contact preference</dt><dd>{CONTACT.find(([key])=>key===form.contact_pref)?.[1]}</dd></div></dl><p className="note">Your details stay here when you go back to make changes.</p></div>}
          {!google && <div className="v2-wizard-actions">{formStep>0 && <button type="button" className="cta ghost" onClick={()=>{setFormStep(formStep-1);setError(null);}}>Back</button>}{formStep<4 && <button type="button" className="cta" onClick={event=>{
            if(formStep===0 && tiers.length>0 && !form.plan){setError('Choose a plan to continue.');return;}
            const fields=event.currentTarget.form?.querySelectorAll<HTMLInputElement>(`fieldset[data-form-step="${formStep}"] input,fieldset[data-form-step="${formStep}"] select,fieldset[data-form-step="${formStep}"] textarea`);
            if(fields && [...fields].some(field=>!field.reportValidity())) return;
            if(formStep===2 && form.password!==form.password2){setError('The passwords do not match.');return;}
            setError(null);setFormStep(formStep+1);
          }}>Next <Icon name="arrow" /></button>}<span>Step {formStep+1} of 5</span></div>}
          {!google && error && formStep<4 && <p className="note bad" role="alert">{error}</p>}
          {google && gstep < gSteps && (
            <div className="submit-row">
              {gstep > 1 && <button className="cta ghost" type="button" onClick={() => { setError(null); setGstep(gstep - 1); }}>Back</button>}
              <button className="cta" type="button" data-google-next onClick={() => { const e = stepOk(); setError(e); if (!e) setGstep(gstep + 1); }}>Next</button>
              {error && <p className="note bad" role="alert">{error}</p>}
            </div>
          )}

          {((!google && formStep === 4) || (google && gstep === gSteps)) && <>
          {google && gstep > 1 && <button className="cta ghost" type="button" onClick={() => { setError(null); setGstep(gstep - 1); }}>Back</button>}
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
                the <a href="#legal/privacy" target="_blank" rel="noopener">Privacy Policy</a> (version of {DOC_VERSION}).
              </span>
            </label>
          ) : (
            <p className="note">
              Our terms for gyms are being finalised. You can read the <a href="#legal/terms" target="_blank" rel="noopener">draft</a>.
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
          </>}
        </form>
      </div>
    </section>
  );
}

interface Quote { id: string; quote: string; shown_name: string; shown_role: string | null; gym_name: string; logo_url: string | null }

/**
 * Words from gym owners (0188) — only ones Core Fitness approved, from gyms
 * still on the service, and gone the moment an owner takes theirs down. With
 * none, the section is not drawn at all: no placeholder praise.
 */
function Testimonials() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  useEffect(() => {
    void (async () => {
      if (!supabase) return;
      const { data } = await supabase.rpc('public_testimonials');
      if (Array.isArray(data)) setQuotes(data as Quote[]);
    })();
  }, []);
  if (quotes.length === 0) return null;
  return (
    <section id="voices">
      <div className="wrap">
        <span className="eyebrow">From the owners</span>
        <h2>In their words</h2>
        <div className="voices">
          {quotes.map((q) => (
            <figure key={q.id} className="voice" data-reveal>
              <blockquote>“{q.quote}”</blockquote>
              <figcaption>
                {q.logo_url ? <img src={q.logo_url} alt="" width={32} height={32} /> : <span className="mono" aria-hidden="true">{initials(q.gym_name)}</span>}
                <span><b>{q.shown_name}</b>{q.shown_role ? <small>{q.shown_role}</small> : <small>{q.gym_name}</small>}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
