import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { toTier, type PublicPlanRow, type Tier } from './pricing';

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
export default function App() {
  const [gyms, setGyms] = useState<Gym[] | null>(null);
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
          <a href={ADMIN_APP}>Gym sign in</a>
        </header>

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
          <p>Paid in cash or bank transfer, like the gyms we built this for. Cancel by telling us.</p>
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
                  {t.maxMembers !== null && <li>Up to {t.maxMembers.toLocaleString('en-PH')} members</li>}
                  {t.includes.map((line) => <li key={line}>{line}</li>)}
                </ul>
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

        <ApplySection />

        <footer>
          Core Fitness · Mamburao, Occidental Mindoro ·{' '}
          <a href={`${MEMBER_APP}/terms`}>Terms</a> · <a href={`${MEMBER_APP}/privacy`}>Privacy</a>
        </footer>
      </div>
    </>
  );
}

/**
 * Register your gym.
 *
 * The row lands in `gym_applications` as 'pending' — that is the only thing a
 * stranger may write anywhere in this system, and the database enforces both
 * the status and the shape (0097). It is not an account: the platform owner
 * reads it, and creates the gym if they say yes.
 */
function ApplySection() {
  const [form, setForm] = useState({
    gym_name: '', owner_name: '', email: '', phone: '', address: '', member_estimate: '', message: '',
  });
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  /** Left empty by people, filled by bots. A real person never sees it. */
  const [trap, setTrap] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (trap) return;                       // quietly ignored
    if (!supabase) { setError('This page cannot reach Core Fitness right now. Please email us instead.'); return; }
    setState('sending');
    setError(null);
    const { error: insertError } = await supabase.from('gym_applications').insert({
      gym_name: form.gym_name.trim(),
      owner_name: form.owner_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim() || null,
      member_estimate: form.member_estimate ? Number(form.member_estimate) : null,
      message: form.message.trim() || null,
    });
    if (insertError) {
      setError(insertError.message);
      setState('idle');
      return;
    }
    setState('sent');
  };

  if (state === 'sent') {
    return (
      <section id="apply">
        <span className="eyebrow">Register your gym</span>
        <h2>Got it — thank you.</h2>
        <div className="sent">
          <p>
            We read every application ourselves. You will hear back by email at{' '}
            <strong style={{ color: 'var(--text)' }}>{form.email}</strong>. If we say yes, your gym is
            set up with plans and rules you can change, and you sign in at the gym app.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section id="apply">
      <span className="eyebrow">Register your gym</span>
      <h2>Tell us about your gym</h2>
      <p>No card, no commitment. We answer by email.</p>

      <form className="apply" onSubmit={submit}>
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
          <label htmlFor="address">Where is the gym?</label>
          <input id="address" maxLength={200} value={form.address} onChange={set('address')} />
        </div>
        <div>
          <label htmlFor="member_estimate">Roughly how many members?</label>
          <input id="member_estimate" type="number" min={0} max={100000} value={form.member_estimate} onChange={set('member_estimate')} />
        </div>
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
            {state === 'sending' ? 'Sending…' : 'Send application'}
          </button>
          <p className="note">
            We keep what you send here to answer you, and nothing else.
          </p>
        </div>
      </form>
    </section>
  );
}
