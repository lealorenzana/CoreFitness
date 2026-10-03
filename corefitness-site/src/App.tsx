import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { toTier, type PublicPlanRow, type Tier } from './pricing';
import StatusPage from './Status';
import Icon, { type IconName } from './Icon';

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

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'desk', title: 'The front desk', body: 'Members and memberships, cash payments with a receipt number, QR check-in and a kiosk members use themselves. Freezes, renewals and refunds follow rules you set.' },
  { icon: 'calendar', title: 'Classes and coaches', body: 'A weekly timetable that generates itself, bookings your coaches accept, a waitlist that offers the next member a freed seat, and one-to-one sessions with clash checks.' },
  { icon: 'phone', title: "The member's app", body: "Installs like an app on Android. Their membership, bookings, check-in code, workouts, goals, progress and the gym's announcements — in English or Filipino." },
  { icon: 'star', title: 'Points that keep them coming', body: 'Points for turning up, badges for milestones, rewards they redeem at your desk and challenges between members. The rules are yours to set.' },
  { icon: 'brush', title: 'Your gym, your look', body: "Your name, your logo and your colour in your members' app. Your plans, your prices, your cancellation reasons and your refund policy." },
  { icon: 'shield', title: 'Your data stays yours', body: "One gym can never see another's members — the database enforces it, and every change is checked automatically. You are the data controller; we only process it for you." },
];

export default function App() {
  const [gyms, setGyms] = useState<Gym[] | null>(null);
  const [gymsFailed, setGymsFailed] = useState(false);
  const [token, setToken] = useState(statusToken);
  /** The plan a tier card's "Choose" put into the form. */
  const [chosen, setChosen] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setToken(statusToken());
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('hashchange', on);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('hashchange', on);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);
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

  return (
    <>
      <header className={`top${scrolled ? ' scrolled' : ''}`}>
        <div className="wrap">
          <a className="brand" href="#top" aria-label="Core Fitness, back to top">
            <img src="/logo.png" alt="" width={34} height={34} />
            <span>Core Fitness</span>
          </a>
          <nav aria-label="Sections">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#gyms">Gyms</a>
          </nav>
          <span className="grow" />
          <a className="link-quiet hide-sm" href={`${MEMBER_APP}/get-app`}>Get the member app</a>
          <a className="link-quiet" href={ADMIN_APP}>Sign in</a>
          <a className="cta" href="#apply">Register</a>
        </div>
      </header>

      <main className="wrap" id="top">
        {token && <StatusPage token={token} />}

        <section className="hero">
          <div>
            <span className="eyebrow">Gym software, made in Occidental Mindoro</span>
            <h1 style={{ marginTop: 18 }}>Run your gym, and <em>give your members an app.</em></h1>
            <p className="lede">
              Memberships, cash payments, QR check-in, classes and coaches — with a phone app your
              members actually install. Built for a real gym in Mamburao, and open to yours.
            </p>
            <div className="cta-row">
              <a className="cta" href="#apply">Register your gym <Icon name="arrow" className="arrow" /></a>
              <a className="cta ghost" href={MEMBER_APP}>See the member app</a>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <span className="ring" />
            <span className="ring inner" />
            <img src="/logo.png" alt="" width={420} height={420} />
            <span className="orbit o1"><Icon name="qr" /> QR check-in</span>
            <span className="orbit o2"><Icon name="cash" /> Cash, with receipts</span>
            <span className="orbit o3"><Icon name="globe" /> English · Filipino</span>
            <span className="orbit o4"><Icon name="phone" /> Android app</span>
          </div>
        </section>

        <section id="features">
          <span className="eyebrow">What you get</span>
          <h2>The desk, the floor and the phone</h2>
          <p className="section-lede">Everything below is in the system today, not on a roadmap.</p>
          <div className="grid">
            {FEATURES.map((f) => (
              <div className="card feature" key={f.title}>
                <div className="tile"><Icon name={f.icon} /></div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how">
          <span className="eyebrow">How it works</span>
          <h2>From this page to your first member</h2>
          <ol className="steps">
            <li>
              <h3>Apply</h3>
              <p>Pick a plan and tell us about your gym. You get a private link to your application's own page.</p>
            </li>
            <li>
              <h3>Talk it through</h3>
              <p>We read every application ourselves. Our answer and our messages arrive on your link — write back there any time.</p>
            </li>
            <li>
              <h3>Set up and go</h3>
              <p>Sign in to the gym app, add your name, logo, colour and plans, then print your join poster for members to scan.</p>
            </li>
          </ol>
        </section>

        <section id="pricing">
          <span className="eyebrow">Pricing</span>
          <h2>
            {tiers === null ? 'What it costs'
              : tiers.length === 0 ? 'Ask us what it costs'
              : tiers.some((t) => t.trialDays) ? `Start free for ${tiers.find((t) => t.trialDays)!.trialDays} days`
              : 'What it costs'}
          </h2>
          <p className="section-lede">Paid from wherever your gym is — send the reference from the gym app and we confirm it. Cancel by telling us.</p>
          <div className="pay-note">
            {['GCash', 'Maya', 'Bank transfer'].map((m) => <span className="pill" key={m}><Icon name="cash" /> {m}</span>)}
          </div>
          {tiers?.length === 0 && (
            <p className="note bad" style={{ marginTop: 24 }}>
              <Icon name="alert" /> Our price list is not loading right now. Send the form below and we will answer with it.
            </p>
          )}
          <div className="grid">
            {tiers === null && [0, 1, 2].map((i) => <div className="skeleton" key={i} aria-hidden="true" />)}
            {tiers?.map((t) => (
              <div className={`card tier${t.trialDays ? ' has-trial' : ''}`} key={t.key}>
                {t.trialDays ? <span className="badge">{t.trialDays} days free</span> : null}
                <h3>{t.name}</h3>
                <div className="price">
                  {t.monthly === 0 ? 'Free' : t.monthly === null ? 'Talk to us' : peso(t.monthly)}
                  {t.monthly ? <small> / month</small> : null}
                </div>
                {t.yearly !== null && t.yearly > 0 && (
                  <p className="yearly">or {peso(t.yearly)} a year</p>
                )}
                <p className="line">{t.line}</p>
                {(t.maxMembers !== null || t.includes.length > 0) && (
                  <ul>
                    {t.maxMembers !== null && <li><Icon name="check" /> Up to {t.maxMembers.toLocaleString('en-PH')} members</li>}
                    {t.includes.map((line) => <li key={line}><Icon name="check" /> {line}</li>)}
                  </ul>
                )}
                <div className="choose-wrap">
                  <a className={`cta${t.trialDays ? '' : ' ghost'} choose`} href="#apply" onClick={() => setChosen(t.key)}>Choose {t.name}</a>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="gyms">
          <span className="eyebrow">Already on Core Fitness</span>
          <h2>{gyms === null ? 'Gyms on Core Fitness'
            : gymsFailed ? 'Gyms on Core Fitness'
            : gyms.length === 1 ? 'One gym, so far' : `${gyms.length} gyms`}</h2>
          <p className="section-lede">
            {gymsFailed ? 'The list of gyms is not loading right now.' : 'Members of these gyms sign in with the same app. Tap one to join it.'}
          </p>
          <div className="gyms">
            {gyms?.map((g) => (
              <a className="gym" key={g.id} href={`${MEMBER_APP}/join/${g.slug}`}>
                <span className="mono" aria-hidden="true">{initials(g.name)}</span>
                {g.name}
                <Icon name="arrow" />
              </a>
            ))}
          </div>
        </section>

        <ApplySection tiers={tiers ?? []} chosen={chosen} />

        <footer>
          <a className="brand" href="#top">
            <img src="/logo.png" alt="" width={26} height={26} />
            <span>Core Fitness</span>
          </a>
          <span>Mamburao, Occidental Mindoro</span>
          <span className="grow" />
          <span className="links">
            <a href={`${MEMBER_APP}/terms`}>Terms</a>
            <a href={`${MEMBER_APP}/privacy`}>Privacy</a>
            <a href={ADMIN_APP}>Gym sign in</a>
          </span>
        </footer>
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
  });
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Left empty by people, filled by bots. A real person never sees it. */
  const [trap, setTrap] = useState('');
  const [copied, setCopied] = useState(false);

  // A tier card's "Choose" fills the plan; so does there being only one.
  useEffect(() => {
    if (chosen) setForm((f) => ({ ...f, plan: chosen }));
  }, [chosen]);
  const plan = tiers.find((t) => t.key === form.plan) ?? null;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (trap) return;                       // quietly ignored
    if (!supabase) { setError('This page cannot reach Core Fitness right now. Please email us instead.'); return; }
    if (tiers.length > 0 && !form.plan) { setError('Choose a plan first — you can change it later.'); return; }
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
    setToken(typeof data === 'string' ? data : null);
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

      <div className="apply-panel">
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
            <div className="field">
              <label htmlFor="address">Where is the gym? <span className="opt">(town, province)</span></label>
              <input id="address" maxLength={200} placeholder="Mamburao, Occidental Mindoro" value={form.address} onChange={set('address')} />
            </div>
            <div className="field">
              <label htmlFor="member_estimate">Members you have now, roughly</label>
              <input id="member_estimate" type="number" inputMode="numeric" min={0} max={100000} value={form.member_estimate} onChange={set('member_estimate')} />
            </div>
          </fieldset>

          <fieldset>
            <legend><span className="num">{tiers.length > 0 ? 3 : 2}</span> How we stay in touch</legend>
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
