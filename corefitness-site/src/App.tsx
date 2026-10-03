import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { toTier, type PublicPlanRow, type Tier } from './pricing';
import StatusPage from './Status';

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

export default function App() {
  const [gyms, setGyms] = useState<Gym[] | null>(null);
  const [token, setToken] = useState(statusToken);
  /** The plan a tier card's "Choose" put into the form. */
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => {
    const on = () => setToken(statusToken());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  /** null while loading; [] when the price list cannot be read at all. */
  const [tiers, setTiers] = useState<Tier[] | null>(null);

  useEffect(() => {
    void (async () => {
      if (!supabase) { setGyms([]); setTiers([]); return; }
      const [gymRes, planRes] = await Promise.all([
        supabase.rpc('list_gyms', { p_search: null }),
        // The price list, from the same rows the platform owner edits and
        // `gyms.plan` points at (0108). Before that migration is pasted this
        // function does not exist; the section then says so rather than
        // printing numbers from a file that nobody is maintaining any more.
        supabase.rpc('platform_price_list'),
      ]);
      setGyms(Array.isArray(gymRes.data) ? (gymRes.data as Gym[]) : []);
      setTiers(Array.isArray(planRes.data) ? (planRes.data as PublicPlanRow[]).map(toTier) : []);
    })();
  }, []);

  return (
    <>
      <div className="wrap">
        <header className="top">
          <span className="mark">CF</span>
          <span className="name">Core Fitness</span>
          <span className="grow" />
          <a href={`${MEMBER_APP}/get-app`} style={{ marginRight: 14 }}>Get the member app</a>
          <a href={ADMIN_APP}>Gym sign in</a>
        </header>

        {token && <StatusPage token={token} />}

        <section className="hero">
          <span className="eyebrow">Gym software, made in Occidental Mindoro</span>
          <h1>Run your gym, and give your members an app.</h1>
          <p className="lede">
            Memberships, cash payments, QR check-in, classes and coaches — with a phone app your
            members actually install. Built for a real gym in Mamburao, and open to yours.
          </p>
          <div>
            <a className="cta" href="#apply">Register your gym</a>
            <a className="cta ghost" href={MEMBER_APP}>See the member app</a>
          </div>
        </section>

        <section>
          <span className="eyebrow">What you get</span>
          <h2>The desk, the floor and the phone</h2>
          <p>Everything below is in the system today, not on a roadmap.</p>
          <div className="grid">
            <div className="card">
              <h3>The front desk</h3>
              <p>
                Members and memberships, cash payments with a receipt number, QR check-in and a
                kiosk members use themselves. Freezes, renewals and refunds follow rules you set.
              </p>
            </div>
            <div className="card">
              <h3>Classes and coaches</h3>
              <p>
                A weekly timetable that generates itself, bookings your coaches accept, a waitlist
                that offers the next member a freed seat, and one-to-one sessions with clash checks.
              </p>
            </div>
            <div className="card">
              <h3>The member's app</h3>
              <p>
                Installs like an app on Android. Their membership, bookings, check-in code, workouts,
                goals, progress and the gym's announcements — in English or Filipino.
              </p>
            </div>
            <div className="card">
              <h3>Points that keep them coming</h3>
              <p>
                Points for turning up, badges for milestones, rewards they redeem at your desk and
                challenges between members. The rules are yours to set.
              </p>
            </div>
            <div className="card">
              <h3>Your gym, your look</h3>
              <p>
                Your name, your logo and your colour in your members' app. Your plans, your prices,
                your cancellation reasons and your refund policy.
              </p>
            </div>
            <div className="card">
              <h3>Your data stays yours</h3>
              <p>
                One gym can never see another's members — the database enforces it, and every change
                is checked automatically. You are the data controller; we only process it for you.
              </p>
            </div>
          </div>
        </section>

        <section>
          <span className="eyebrow">Pricing</span>
          <h2>
            {tiers === null ? 'Loading…'
              : tiers.length === 0 ? 'Ask us what it costs'
              : tiers.some((t) => t.trialDays) ? `Start free for ${tiers.find((t) => t.trialDays)!.trialDays} days`
              : 'What it costs'}
          </h2>
          <p>Paid by GCash, Maya or bank transfer from wherever your gym is — send the reference from the gym app and we confirm it. Cancel by telling us.</p>
          {tiers?.length === 0 && (
            <p>
              Our price list is not loading right now. Send the form below and we will answer with it.
            </p>
          )}
          <div className="grid">
            {tiers?.map((t) => (
              <div className="card tier" key={t.key}>
                <h3>{t.name}</h3>
                <div className="price">
                  {t.monthly === 0 ? 'Free' : t.monthly === null ? 'Talk to us' : peso(t.monthly)}
                  {t.monthly ? <small> / month</small> : null}
                </div>
                {t.yearly !== null && t.yearly > 0 && (
                  <p className="yearly">or {peso(t.yearly)} a year</p>
                )}
                {t.line && <p>{t.line}</p>}
                <ul>
                  {t.trialDays ? <li>{t.trialDays} days free</li> : null}
                  {t.maxMembers !== null && <li>Up to {t.maxMembers.toLocaleString('en-PH')} members</li>}
                  {t.includes.map((line) => <li key={line}>{line}</li>)}
                </ul>
                <a className="cta ghost choose" href="#apply" onClick={() => setChosen(t.key)}>Choose {t.name}</a>
              </div>
            ))}
          </div>
        </section>

        <section>
          <span className="eyebrow">Already on Core Fitness</span>
          <h2>{gyms === null ? 'Loading…' : gyms.length === 1 ? 'One gym, so far' : `${gyms.length} gyms`}</h2>
          <p>Members of these gyms sign in with the same app.</p>
          <div className="gyms">
            {gyms?.map((g) => (
              <a className="gym" key={g.id} href={`${MEMBER_APP}/join/${g.slug}`}>{g.name}</a>
            ))}
          </div>
        </section>

        <ApplySection tiers={tiers ?? []} chosen={chosen} />

        <footer>
          Core Fitness · Mamburao, Occidental Mindoro ·{' '}
          <a href={`${MEMBER_APP}/terms`}>Terms</a> · <a href={`${MEMBER_APP}/privacy`}>Privacy</a>
        </footer>
      </div>
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
          <p>
            We read every application ourselves and will reach you by {CONTACT.find(([k]) => k === form.contact_pref)?.[1] ?? 'email'}{' '}
            or at <strong style={{ color: 'var(--text)' }}>{form.email}</strong>.
          </p>
          {link && (
            <>
              <p><strong style={{ color: 'var(--text)' }}>Keep this link.</strong> It is your application's own page: where it stands,
                our messages, and — once you are in — how to pay from wherever you are.</p>
              <p style={{ wordBreak: 'break-all' }}><a href={link} style={{ color: 'var(--violet-text)' }}>{link}</a></p>
              <button className="cta" type="button" onClick={() => void navigator.clipboard.writeText(link)}>Copy my link</button>
              <a className="cta ghost" href={`#status/${token}`}>Open it</a>
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
      <p>No card, no commitment. Pick a plan, tell us who you are, and we will talk it through with you before anything is paid.</p>

      <form className="apply" onSubmit={submit}>
        {tiers.length > 0 && (
          <div className="full">
            <label>1. Which plan?</label>
            <div className="plan-pick">
              {tiers.map((t) => (
                <button type="button" key={t.key} className={`plan-opt${form.plan === t.key ? ' on' : ''}`}
                  aria-pressed={form.plan === t.key} onClick={() => setForm({ ...form, plan: t.key })}>
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
        )}
        <div className="full"><label style={{ marginTop: 8 }}>2. About your gym</label></div>
        <div>
          <label htmlFor="gym_name">Gym name</label>
          <input id="gym_name" required maxLength={80} value={form.gym_name} onChange={set('gym_name')} />
        </div>
        <div>
          <label htmlFor="owner_name">Your name</label>
          <input id="owner_name" required maxLength={80} value={form.owner_name} onChange={set('owner_name')} />
        </div>
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required maxLength={120} value={form.email} onChange={set('email')} />
        </div>
        <div>
          <label htmlFor="phone">Mobile number</label>
          <input id="phone" required maxLength={20} placeholder="09XX XXX XXXX" value={form.phone} onChange={set('phone')} />
        </div>
        <div>
          <label htmlFor="address">Where is the gym? (town, province)</label>
          <input id="address" maxLength={200} placeholder="Mamburao, Occidental Mindoro" value={form.address} onChange={set('address')} />
        </div>
        <div>
          <label htmlFor="member_estimate">Roughly how many members do you have now?</label>
          <input id="member_estimate" type="number" min={0} max={100000} value={form.member_estimate} onChange={set('member_estimate')} />
        </div>
        <div className="full"><label style={{ marginTop: 8 }}>3. How we stay in touch</label></div>
        <div>
          <label htmlFor="heard_from">How did you hear about Core Fitness?</label>
          <select id="heard_from" value={form.heard_from} onChange={set('heard_from')}>
            <option value="">Choose one</option>
            {HEARD.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
        {form.heard_from === 'Other' && (
          <div>
            <label htmlFor="heard_other">Where?</label>
            <input id="heard_other" maxLength={60} value={form.heard_other} onChange={set('heard_other')} />
          </div>
        )}
        <div>
          <label htmlFor="contact_pref">Best way to reach you</label>
          <select id="contact_pref" value={form.contact_pref} onChange={set('contact_pref')}>
            {CONTACT.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {form.contact_pref === 'messenger' && (
          <div>
            <label htmlFor="contact_handle">Your Facebook name or link</label>
            <input id="contact_handle" maxLength={120} value={form.contact_handle} onChange={set('contact_handle')} />
          </div>
        )}
        <div className="full">
          <label htmlFor="message">Anything we should know? (optional)</label>
          <textarea id="message" maxLength={1000} value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })} />
        </div>

        <div className="hp" aria-hidden="true">
          <label htmlFor="website">Leave this empty</label>
          <input id="website" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
        </div>

        {error && <p className="note bad full">{error}</p>}

        <div className="full">
          <button className="cta" type="submit" disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending…' : plan ? `Apply for ${plan.name}` : 'Send application'}
          </button>
          <p className="note">
            We keep what you send here to answer you, and nothing else.
          </p>
        </div>
      </form>
    </section>
  );
}
