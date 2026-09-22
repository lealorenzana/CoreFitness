import { useCallback, useEffect, useState } from 'react';
import { Check, LogOut } from 'lucide-react';
import Button from '../components/ui/Button';
import { supabase } from '../lib/supabaseClient';
import { showToast } from '../utils/toast';
import { ACCENTS } from '../lib/accents';
import { clearGymContext, getGymContext } from '../lib/gymContext';
import {
  finishGymSetup, getGymSettings, mustChangePassword, setFirstPassword, updateGymSettings,
} from '../lib/api/settings';
import { createPlan, listPlans, updatePlan } from '../lib/api/membershipPlans';
import {
  getGymApp, saveGymLook, saveGymWords, setJoinPolicy, setOnboardingStep, type JoinPolicy,
} from '../lib/api/gymApp';
import { uploadMedia } from '../lib/api/media';
import type { MembershipPlanRow } from '../types/db';

/**
 * A gym's first day.
 *
 * `create_gym()` copies Core Fitness's *rules* into a new gym — plans, point
 * rules, cancellation reasons, badges — and deliberately copies none of its
 * *identity*: a new gym must never inherit someone else's address on its own
 * receipts. So a new owner's first sign-in would otherwise land on a dashboard
 * of blanks and a plan list priced for a gym in Mamburao.
 *
 * This asks for the four things nothing else can supply, in the order they
 * matter, and stamps `gyms.onboarded_at` (0107) at the end so it never appears
 * again. Nothing here is unavailable afterwards: every field lives on Settings
 * and Membership Plans, which is where they change it from then on.
 *
 * Existing gyms never see this screen — 0107's backfill stamped every gym that
 * had already been configured.
 */

type Step = 'gym' | 'look' | 'plans' | 'door' | 'password';

const STEPS: { key: Step; title: string; blurb: string }[] = [
  { key: 'gym', title: 'Your gym', blurb: 'What your members and your receipts will say.' },
  { key: 'look', title: 'Your look and your words', blurb: 'When you are open, your colour, and what you call your points.' },
  { key: 'plans', title: 'Your plans', blurb: 'These came from a working gym. Make them yours before anyone pays.' },
  { key: 'door', title: 'How members join', blurb: 'Who can ask to join you, and how they find you.' },
  { key: 'password', title: 'Your password', blurb: 'Replace the temporary one you were given.' },
];

const peso = (n: number) => '₱' + n.toLocaleString('en-PH');

export default function Setup() {
  const [step, setStep] = useState<Step>('gym');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);

  const [gym, setGym] = useState({
    gym_name: '', short_name: '', tagline: '', address: '', phone: '', email: '',
    opening_time: '', closing_time: '', accent: 'violet',
    points_name: '', points_name_short: '', welcome_message: '',
  });
  const [action, setAction] = useState<string>('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  /** Plans typed on this screen that do not exist yet. */
  const [adding, setAdding] = useState<{ name: string; price: string; days: string }[]>([]);
  const [door, setDoor] = useState<JoinPolicy>('open');
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [plans, setPlans] = useState<MembershipPlanRow[]>([]);
  const [edited, setEdited] = useState<Record<string, { name: string; price: string }>>({});
  const [password, setPassword] = useState({ next: '', again: '' });

  const load = useCallback(async () => {
    try {
      const [ctx, settings, planRows, temp, app] = await Promise.all([
        getGymContext(true), getGymSettings(), listPlans(), mustChangePassword(), getGymApp(),
      ]);
      // Already set up — someone typed the address, or came back later.
      if (ctx?.onboarded) { window.location.assign('/dashboard'); return; }
      setGym({
        gym_name: settings?.gym_name ?? ctx?.gymName ?? '',
        short_name: settings?.short_name ?? '',
        tagline: settings?.tagline ?? '',
        address: settings?.address ?? '',
        phone: settings?.phone ?? '',
        email: settings?.email ?? '',
        opening_time: settings?.opening_time ?? '',
        closing_time: settings?.closing_time ?? '',
        accent: settings?.accent ?? 'violet',
        points_name: app?.points_name ?? '',
        points_name_short: app?.points_name_short ?? '',
        welcome_message: app?.welcome_message ?? '',
      });
      setAction(app?.accent_action ?? '');
      setLogoUrl(settings?.logo_url ?? null);
      setDoor(app?.join_policy ?? 'open');
      setJoinCode(app?.join_code ?? null);
      // Pick up where they left off (0111). Every step already saved before it
      // advanced, so this only spares them walking back through screens they
      // have already filled in.
      if (ctx?.onboardingStep && STEPS.some((x) => x.key === ctx.onboardingStep)) {
        setStep(ctx.onboardingStep as Step);
      }
      setPlans(planRows);
      setEdited(Object.fromEntries(
        planRows.map((p) => [p.id, { name: p.name, price: String(p.price) }])
      ));
      setNeedsPassword(temp);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not open setup', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const steps = STEPS.filter((s) => s.key !== 'password' || needsPassword);
  const index = steps.findIndex((s) => s.key === step);
  const isLast = index === steps.length - 1;

  const saveGym = async () => {
    if (!gym.gym_name.trim()) throw new Error('Your gym needs a name.');
    await updateGymSettings({
      gym_name: gym.gym_name.trim(),
      short_name: gym.short_name.trim() || null,
      tagline: gym.tagline.trim() || null,
      address: gym.address.trim() || null,
      phone: gym.phone.trim() || null,
      email: gym.email.trim() || null,
    });
  };

  const saveLook = async () => {
    await updateGymSettings({
      opening_time: gym.opening_time || null,
      closing_time: gym.closing_time || null,
    });
    // Both colour roles and the logo in one call (0112). Passing the logo
    // explicitly here is what stops a colour change wiping it.
    await saveGymLook({
      accent: gym.accent,
      accentAction: action || null,
      logoUrl: logoUrl ?? '',
    });
    // Their own word for their points, and the line their members read on
    // opening the app. Blank leaves the plain "Points" (0110).
    await saveGymWords({
      points_name: gym.points_name.trim(),
      points_name_short: gym.points_name_short.trim() || null,
      welcome_message: gym.welcome_message.trim() || null,
    });
  };

  const saveDoor = async () => {
    setJoinCode(await setJoinPolicy(door, false));
  };

  const savePlans = async () => {
    // The new ones first, so a failure leaves nothing half-written: a plan that
    // could not be created must not be followed by prices saved against the
    // ones that could.
    for (const row of adding) {
      if (!row.name.trim()) continue;
      const price = Number(row.price || 0);
      const days = row.days.trim() === '' ? null : Number(row.days);
      if (!Number.isFinite(price) || price < 0) throw new Error(`${row.name}: that price is not a number.`);
      if (days !== null && (!Number.isFinite(days) || days < 1)) {
        throw new Error(`${row.name}: leave the days empty for a plan that does not expire.`);
      }
      await createPlan({
        name: row.name.trim(),
        // A paid plan is `premium` and a free one `free`; the tier is a label
        // the refund floor reads (0073), not a hidden rulebook. What the plan
        // actually lets a member do is set on Membership Plans, where the
        // feature matrix lives (0049) — this screen does not guess at it.
        tier: price > 0 ? 'premium' : 'free',
        price,
        duration_days: days,
        description: null,
        is_active: true,
        can_book_classes: true,
        can_book_pt: price > 0,
        class_bookings_per_week: null,
        pt_sessions_per_month: null,
      });
    }
    if (adding.length) setAdding([]);

    for (const plan of plans) {
      const next = edited[plan.id];
      if (!next) continue;
      const price = Number(next.price);
      if (!Number.isFinite(price) || price < 0) throw new Error(`${plan.name}: that price is not a number.`);
      if (next.name.trim() === plan.name && price === plan.price) continue;
      if (!next.name.trim()) throw new Error('A plan needs a name.');
      await updatePlan(plan.id, { name: next.name.trim(), price });
    }
  };

  const savePassword = async () => {
    if (password.next.length < 8) throw new Error('Use at least 8 characters.');
    if (password.next !== password.again) throw new Error('Those two passwords are not the same.');
    await setFirstPassword(password.next);
  };

  const next = async () => {
    setSaving(true);
    try {
      if (step === 'gym') await saveGym();
      if (step === 'look') await saveLook();
      if (step === 'plans') await savePlans();
      if (step === 'door') await saveDoor();
      if (step === 'password') await savePassword();

      if (!isLast) {
        const next = steps[index + 1].key;
        await setOnboardingStep(next);
        setStep(next);
      } else {
        await finishGymSetup();
        clearGymContext();
        // A full load, not a route change: the shell reads the gym's name and
        // colour once at boot, and both just changed.
        window.location.assign('/dashboard');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That could not be saved', 'error');
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    clearGymContext();
    window.location.assign('/admin/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
        Loading…
      </div>
    );
  }

  const label = 'block text-xs mb-1';
  const input = 'w-full rounded-lg border px-3 py-2 text-sm';
  const inputStyle = {
    borderColor: 'var(--color-border)', background: 'var(--color-surface)',
    color: 'var(--color-text-primary)',
  };
  const labelStyle = { color: 'var(--color-text-secondary)' };

  return (
    <div className="min-h-screen p-6" style={{ background: 'var(--color-bg)' }}>
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Welcome to Core Fitness
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Four short steps and your gym is open. You can change every one of these later in Settings.
        </p>

        <div className="mt-5 flex gap-2">
          {steps.map((s, i) => (
            <span key={s.key} className="h-1 flex-1 rounded-full"
              style={{ background: i <= index ? 'var(--color-primary)' : 'var(--color-border)' }} />
          ))}
        </div>

        <div className="mt-6 rounded-xl border p-5"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {steps[index].title}
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {steps[index].blurb}
          </p>

          {step === 'gym' && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={label} style={labelStyle} htmlFor="s-name">Gym name</label>
                <input id="s-name" className={input} style={inputStyle} value={gym.gym_name}
                  onChange={(e) => setGym({ ...gym, gym_name: e.target.value })} />
              </div>
              <div>
                <label className={label} style={labelStyle} htmlFor="s-short">Short name (optional)</label>
                <input id="s-short" className={input} style={inputStyle} value={gym.short_name}
                  placeholder="For tight corners of the phone app"
                  onChange={(e) => setGym({ ...gym, short_name: e.target.value })} />
              </div>
              <div>
                <label className={label} style={labelStyle} htmlFor="s-tag">Tagline (optional)</label>
                <input id="s-tag" className={input} style={inputStyle} value={gym.tagline}
                  onChange={(e) => setGym({ ...gym, tagline: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className={label} style={labelStyle} htmlFor="s-addr">Address</label>
                <input id="s-addr" className={input} style={inputStyle} value={gym.address}
                  onChange={(e) => setGym({ ...gym, address: e.target.value })} />
              </div>
              <div>
                <label className={label} style={labelStyle} htmlFor="s-phone">Mobile number</label>
                <input id="s-phone" className={input} style={inputStyle} value={gym.phone}
                  placeholder="09XX XXX XXXX"
                  onChange={(e) => setGym({ ...gym, phone: e.target.value })} />
              </div>
              <div>
                <label className={label} style={labelStyle} htmlFor="s-email">Email</label>
                <input id="s-email" type="email" className={input} style={inputStyle} value={gym.email}
                  onChange={(e) => setGym({ ...gym, email: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className={label} style={labelStyle}>Your logo</label>
                <div className="flex flex-wrap items-center gap-3">
                  {logoUrl
                    ? <img src={logoUrl} alt="" className="h-14 w-14 rounded-xl object-cover"
                        style={{ background: 'var(--color-bg)' }} />
                    : <div className="grid h-14 w-14 place-items-center rounded-xl text-lg font-bold"
                        style={{ background: 'var(--color-primary)', color: '#fff' }}>
                        {(gym.short_name || gym.gym_name || '?').slice(0, 2).toUpperCase()}
                      </div>}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                    {uploading ? 'Uploading…' : logoUrl ? 'Choose another' : 'Choose a picture'}
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploading(true);
                        void uploadMedia(file, 'logos')
                          .then((url) => setLogoUrl(url))
                          .catch((err) => showToast(err instanceof Error ? err.message : 'That could not be uploaded', 'error'))
                          .finally(() => setUploading(false));
                      }} />
                  </label>
                  {logoUrl && <Button variant="ghost" onClick={() => setLogoUrl(null)}>Remove</Button>}
                </div>
                <p className="mt-2 text-xs" style={labelStyle}>
                  Square works best. It is shown in your members' app and on this dashboard, and is
                  saved when you finish the next step.
                </p>
              </div>
              <p className="sm:col-span-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                These appear on your members' app, your receipts and your Terms page. You can change
                every one of them later in Settings.
              </p>
            </div>
          )}

          {step === 'look' && (
            <div className="mt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={label} style={labelStyle} htmlFor="s-open">Opens at</label>
                  <input id="s-open" type="time" className={input} style={inputStyle} value={gym.opening_time}
                    onChange={(e) => setGym({ ...gym, opening_time: e.target.value })} />
                </div>
                <div>
                  <label className={label} style={labelStyle} htmlFor="s-close">Closes at</label>
                  <input id="s-close" type="time" className={input} style={inputStyle} value={gym.closing_time}
                    onChange={(e) => setGym({ ...gym, closing_time: e.target.value })} />
                </div>
              </div>

              <p className="mt-5 text-xs" style={labelStyle}>
                Your main colour — where you are, and what you have
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ACCENTS.map((accent) => (
                  <button key={accent.key} type="button"
                    onClick={() => setGym({ ...gym, accent: accent.key })}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                    style={{
                      borderColor: gym.accent === accent.key ? accent.swatch : 'var(--color-border)',
                      background: 'var(--color-bg)', color: 'var(--color-text-primary)',
                    }}>
                    <span className="h-4 w-4 rounded-full" style={{ background: accent.swatch }} />
                    {accent.label}
                    {gym.accent === accent.key && <Check size={14} style={{ color: accent.swatch }} />}
                  </button>
                ))}
              </div>

              {/* The second role (0112). It used to be amber for every gym, so
                  one that picked red got a red-and-yellow app rather than its
                  own. Two roles, two colours: the roles are what keep a screen
                  readable, the colours are the gym's. */}
              <p className="mt-5 text-xs" style={labelStyle}>
                Your action colour — the buttons that do the next thing: book, renew, save
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => setAction('')}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                  style={{
                    borderColor: action === '' ? '#F59E0B' : 'var(--color-border)',
                    background: 'var(--color-bg)', color: 'var(--color-text-primary)',
                  }}>
                  <span className="h-4 w-4 rounded-full" style={{ background: '#F59E0B' }} />
                  Amber
                  {action === '' && <Check size={14} style={{ color: '#F59E0B' }} />}
                </button>
                {ACCENTS.map((accent) => (
                  <button key={accent.key} type="button" onClick={() => setAction(accent.key)}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                    style={{
                      borderColor: action === accent.key ? accent.swatch : 'var(--color-border)',
                      background: 'var(--color-bg)', color: 'var(--color-text-primary)',
                    }}>
                    <span className="h-4 w-4 rounded-full" style={{ background: accent.swatch }} />
                    {accent.label}
                    {action === accent.key && <Check size={14} style={{ color: accent.swatch }} />}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs" style={labelStyle}>
                Pick the same colour twice for an app in one colour throughout. Every colour here is
                checked to stay readable as text on the app's dark background.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={label} style={labelStyle} htmlFor="s-pn">Your points are called</label>
                  <input id="s-pn" className={input} style={inputStyle} maxLength={30}
                    value={gym.points_name} placeholder="Points"
                    onChange={(e) => setGym({ ...gym, points_name: e.target.value })} />
                </div>
                <div>
                  <label className={label} style={labelStyle} htmlFor="s-pns">In the middle of a sentence</label>
                  <input id="s-pns" className={input} style={inputStyle} maxLength={30}
                    value={gym.points_name_short} placeholder="points"
                    onChange={(e) => setGym({ ...gym, points_name_short: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className={label} style={labelStyle} htmlFor="s-wm">
                    A line on your members' home screen (optional)
                  </label>
                  <input id="s-wm" className={input} style={inputStyle} maxLength={280}
                    value={gym.welcome_message} placeholder="Open 5am–10pm. Ask the desk about the new racks."
                    onChange={(e) => setGym({ ...gym, welcome_message: e.target.value })} />
                </div>
                <p className="sm:col-span-2 text-xs" style={labelStyle}>
                  Members earn points for turning up and logging workouts. Leave these blank and the
                  app simply calls them &ldquo;points&rdquo;.
                </p>
              </div>
            </div>
          )}

          {step === 'door' && (
            <div className="mt-4 space-y-2">
              {([
                ['open', 'Anyone can find you', 'You are listed in the app’s gym list. Anyone with the app can search for you and ask to join.'],
                ['code', 'Only with your link or code', 'You are not listed. Members join with your link, or by typing a short code you give them.'],
                ['closed', 'Only at the front desk', 'Nobody can ask to join from the app. Your desk creates every member account, or invites them.'],
              ] as const).map(([key, title, blurb]) => (
                <button key={key} type="button" onClick={() => setDoor(key)}
                  className="w-full flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left"
                  style={{
                    borderColor: door === key ? 'var(--color-primary)' : 'var(--color-border)',
                    background: 'var(--color-bg)',
                  }}>
                  <span className="mt-0.5 shrink-0">
                    {door === key
                      ? <Check size={16} style={{ color: 'var(--color-primary)' }} />
                      : <span className="block h-4 w-4 rounded-full border" style={{ borderColor: 'var(--color-border)' }} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{title}</span>
                    <span className="block text-xs mt-0.5" style={labelStyle}>{blurb}</span>
                  </span>
                </button>
              ))}
              <p className="text-xs" style={labelStyle}>
                However they arrive, you still approve every sign-up. You can change this any time on
                Your app, and invite the members you already have from Invitations.
                {joinCode && door === 'code' && (
                  <> Your join code is <strong style={{ color: 'var(--color-text-primary)', letterSpacing: '0.12em' }}>{joinCode}</strong>.</>
                )}
              </p>
            </div>
          )}

          {step === 'plans' && (
            <div className="mt-4 space-y-3">
              {plans.length === 0 && (
                <p className="text-sm" style={labelStyle}>
                  This gym has no plans yet. You can add them on Membership Plans.
                </p>
              )}
              {plans.map((plan) => (
                <div key={plan.id} className="grid gap-3 sm:grid-cols-[1fr_140px] items-end">
                  <div>
                    <label className={label} style={labelStyle} htmlFor={`p-${plan.id}`}>
                      {plan.tier} · {plan.duration_days ? `${plan.duration_days} days` : 'does not expire'}
                    </label>
                    <input id={`p-${plan.id}`} className={input} style={inputStyle}
                      value={edited[plan.id]?.name ?? ''}
                      onChange={(e) => setEdited({
                        ...edited, [plan.id]: { ...edited[plan.id], name: e.target.value },
                      })} />
                  </div>
                  <div>
                    <label className={label} style={labelStyle} htmlFor={`pp-${plan.id}`}>
                      Price ({peso(plan.price)} now)
                    </label>
                    <input id={`pp-${plan.id}`} type="number" min={0} className={input} style={inputStyle}
                      value={edited[plan.id]?.price ?? ''}
                      onChange={(e) => setEdited({
                        ...edited, [plan.id]: { ...edited[plan.id], price: e.target.value },
                      })} />
                  </div>
                </div>
              ))}
              {adding.map((row, i) => (
                <div key={i} className="grid gap-3 sm:grid-cols-[1fr_120px_110px] items-end">
                  <div>
                    <label className={label} style={labelStyle} htmlFor={`np-${i}`}>A new plan</label>
                    <input id={`np-${i}`} className={input} style={inputStyle} value={row.name}
                      placeholder="Student rate"
                      onChange={(e) => setAdding(adding.map((r, n) => (n === i ? { ...r, name: e.target.value } : r)))} />
                  </div>
                  <div>
                    <label className={label} style={labelStyle} htmlFor={`npp-${i}`}>Price (₱)</label>
                    <input id={`npp-${i}`} type="number" min={0} className={input} style={inputStyle}
                      value={row.price}
                      onChange={(e) => setAdding(adding.map((r, n) => (n === i ? { ...r, price: e.target.value } : r)))} />
                  </div>
                  <div>
                    <label className={label} style={labelStyle} htmlFor={`npd-${i}`}>—ays</label>
                    <input id={`npd-${i}`} type="number" min={1} className={input} style={inputStyle}
                      value={row.days} placeholder="never ends"
                      onChange={(e) => setAdding(adding.map((r, n) => (n === i ? { ...r, days: e.target.value } : r)))} />
                  </div>
                </div>
              ))}
              <Button variant="ghost"
                onClick={() => setAdding([...adding, { name: '', price: '', days: '30' }])}>
                Add another plan
              </Button>
              <p className="text-xs" style={labelStyle}>
                Free plans stay free at ₱0, and a plan with no number of days never expires. What
                each plan lets a member do — classes, coaching, the assistant — is on the Membership
                Plans page, which is also where you retire one you no longer sell.
              </p>
            </div>
          )}

          {step === 'password' && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label} style={labelStyle} htmlFor="s-pw">New password</label>
                <input id="s-pw" type="password" className={input} style={inputStyle} value={password.next}
                  onChange={(e) => setPassword({ ...password, next: e.target.value })} />
              </div>
              <div>
                <label className={label} style={labelStyle} htmlFor="s-pw2">Type it again</label>
                <input id="s-pw2" type="password" className={input} style={inputStyle} value={password.again}
                  onChange={(e) => setPassword({ ...password, again: e.target.value })} />
              </div>
              <p className="sm:col-span-2 text-xs" style={labelStyle}>
                At least 8 characters. The temporary password you were given stops working.
              </p>
            </div>
          )}

          <div className="mt-6 flex items-center gap-2">
            <Button onClick={() => void next()} disabled={saving}>
              {saving ? 'Saving…' : isLast ? 'Open my gym' : 'Save and continue'}
            </Button>
            {index > 0 && (
              <Button variant="ghost" disabled={saving} onClick={() => setStep(steps[index - 1].key)}>
                Back
              </Button>
            )}
          </div>
        </div>

        <Button variant="ghost" className="mt-5" onClick={() => void signOut()}>
          <LogOut size={16} className="mr-2" /> Sign out
        </Button>
      </div>
    </div>
  );
}
