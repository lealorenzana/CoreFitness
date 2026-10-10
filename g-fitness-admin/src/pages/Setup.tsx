import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight, Banknote, Building2, CalendarDays, Check, Clock, DoorOpen, Dumbbell, FileSignature, KeyRound,
  LayoutGrid, LogOut, Palette, ScrollText, ShoppingBag, Sparkles, Tags, Trash2, Type, UserPlus, Users,
} from 'lucide-react';
import Button from '../components/ui/Button';
import { supabase } from '../lib/supabaseClient';
import { showToast } from '../utils/toast';
import ColourRolePicker from '../components/ColourRolePicker';
import ThemePreview from '../components/ThemePreview';
import ModuleSwitches from '../components/ModuleSwitches';
import AiCoachCard from '../components/AiCoachCard';
import BookingApproval from '../components/BookingApproval';
import CoachingSettings from '../components/CoachingSettings';
import GymLocationPicker from '../components/GymLocationPicker';
import DayPassSettings from '../components/DayPassSettings';
import { clearGymContext, getGymContext } from '../lib/gymContext';
import {
  finishGymSetup, getGymSettings, mustChangePassword, setFirstPassword, updateGymSettings,
} from '../lib/api/settings';
import { createPlan, listPlans, retirePlan, updatePlan } from '../lib/api/membershipPlans';
import {
  getGymApp, getGymModules, saveGymLook, saveGymVocabulary, saveGymWords, setGymModule, setGymSlug, setJoinPolicy,
  getJoinSettings, setJoinSettings,
  setOnboardingStep, type GymModule, type GymVocabulary, type JoinPolicy, type JoinSettings,
} from '../lib/api/gymApp';
import JoinApproval from '../components/JoinApproval';
import { refreshGymModules } from '../hooks/useGymModules';
import { uploadMedia } from '../lib/api/media';
import type { MembershipPlanRow } from '../types/db';

/**
 * A gym's first day (redesigned 2026-10-04).
 *
 * `create_gym()` copies Core Fitness's *rules* into a new gym — plans, point
 * rules, cancellation reasons, badges — and none of its *identity*. This walks
 * the owner through everything a gym customises, in the order it matters:
 * who you are, when you are open, how the app looks, what you call things,
 * which parts you run (only the parts your Core Fitness plan includes), the
 * AI coach's limits (only if the plan sells it), your plans — edited, added
 * and removed — and how members join. The last step is a checklist of what
 * lives on its own page (refunds, waiver, house rules, classes, the shop,
 * your team), each linked, rather than a second copy of those screens here.
 *
 * Every step saves before it advances, `set_onboarding_step` remembers where
 * they were, and `finish_gym_setup()` stamps `gyms.onboarded_at` (0107) so the
 * wizard never appears again. Nothing is only settable here: each field also
 * lives on Settings, Your app or Membership Plans.
 */

type Step = 'gym' | 'hours' | 'look' | 'words' | 'runs' | 'bookings' | 'coaching' | 'walkins' | 'coach' | 'plans' | 'door' | 'password' | 'ready';

const STEPS: { key: Step; title: string; blurb: string; icon: typeof Check }[] = [
  { key: 'gym', title: 'Your gym', blurb: 'What your members and your receipts will say.', icon: Building2 },
  { key: 'hours', title: 'When you are open', blurb: 'Your hours, and the days you close.', icon: Clock },
  { key: 'look', title: 'How your app looks', blurb: 'Two colours — and a live preview of your members’ app.', icon: Palette },
  { key: 'words', title: 'Your words', blurb: 'What you call your points, your coaches, your members and your classes.', icon: Type },
  { key: 'runs', title: 'What you run', blurb: 'Switch off what your gym does not do. Nothing is deleted.', icon: LayoutGrid },
  { key: 'bookings', title: 'Who approves bookings', blurb: 'Instant, your coaches, your desk — or not in the app at all. Classes and 1-on-1 apart.', icon: CalendarDays },
  { key: 'coaching', title: 'How coaching works', blurb: 'How members get a coach, for how long, and who is paid.', icon: Dumbbell },
  { key: 'walkins', title: 'Day passes and walk-ins', blurb: 'Whether guests can pay for a day, and what packs you sell.', icon: Banknote },
  { key: 'coach', title: 'The AI coach', blurb: 'How much your members may talk to it.', icon: Sparkles },
  { key: 'plans', title: 'Your plans', blurb: 'These came from a working gym. Make them yours before anyone pays.', icon: Tags },
  { key: 'door', title: 'How members join', blurb: 'Who can ask to join you, and how they find you.', icon: DoorOpen },
  { key: 'password', title: 'Your password', blurb: 'Replace the temporary one you were given.', icon: KeyRound },
  { key: 'ready', title: 'Ready to open', blurb: 'Everything else has its own page. Do these now or any time — none is needed to open.', icon: Check },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const peso = (n: number) => '₱' + n.toLocaleString('en-PH');

type PlanDraft = { name: string; price: string; days: string };

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
  /** 0153's closed days; null before that migration, when the row has no such column. */
  const [closedDays, setClosedDays] = useState<number[] | null>(null);
  const [vocab, setVocab] = useState<GymVocabulary | null>(null);
  const [slug, setSlug] = useState('');
  const [savedSlug, setSavedSlug] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [modules, setModules] = useState<GymModule[]>([]);
  const [door, setDoor] = useState<JoinPolicy>('open');
  /** Approval and minimum age (0179); null before 0179. */
  const [joinSet, setJoinSet] = useState<JoinSettings | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [plans, setPlans] = useState<MembershipPlanRow[]>([]);
  const [edited, setEdited] = useState<Record<string, PlanDraft>>({});
  /** Plans typed on this screen that do not exist yet. */
  const [adding, setAdding] = useState<PlanDraft[]>([]);
  const [password, setPassword] = useState({ next: '', again: '' });
  const [done, setDone] = useState<Step[]>([]);

  const load = useCallback(async () => {
    try {
      const [ctx, settings, planRows, temp, app, mods] = await Promise.all([
        getGymContext(true), getGymSettings(), listPlans(), mustChangePassword(), getGymApp(),
        getGymModules().catch(() => [] as GymModule[]),
      ]);
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
      setClosedDays(Array.isArray(settings?.closed_days) ? settings.closed_days : null);
      setAction(app?.accent_action ?? '');
      setVocab(app?.vocabulary ?? null);
      setSlug(app?.slug ?? '');
      setSavedSlug(app?.slug ?? '');
      setLogoUrl(settings?.logo_url ?? null);
      setDoor(app?.join_policy ?? 'open');
      void getJoinSettings().then(setJoinSet);
      setJoinCode(app?.join_code ?? null);
      setModules(mods);
      setPlans(planRows);
      setEdited(Object.fromEntries(planRows.map((p) => [p.id, {
        name: p.name, price: String(p.price), days: p.duration_days == null ? '' : String(p.duration_days),
      }])));
      setNeedsPassword(temp);
      // Pick up where they left off (0111): every earlier step saved before it advanced.
      const at = STEPS.findIndex((x) => x.key === ctx?.onboardingStep);
      if (at > 0) {
        setStep(STEPS[at].key);
        setDone(STEPS.slice(0, at).map((x) => x.key));
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not open setup', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  // The AI coach step only where the gym's plan sells it (the plan hides, 0141).
  const coach = modules.find((m) => m.feature_key === 'assistant');
  const steps = STEPS.filter((s) =>
    (s.key !== 'password' || needsPassword) && (s.key !== 'coach' || (!!coach && coach.state !== 'not_sold')));
  const index = Math.max(0, steps.findIndex((s) => s.key === step));
  const isLast = index === steps.length - 1;
  const current = steps[index];

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

  const saveHours = async () => {
    await updateGymSettings({
      opening_time: gym.opening_time || null,
      closing_time: gym.closing_time || null,
      ...(closedDays !== null ? { closed_days: closedDays } : {}),
    });
  };

  const saveLook = async () => {
    // Both colour roles and the logo in one call (0112); passing the logo is what stops a colour change wiping it.
    await saveGymLook({ accent: gym.accent, accentAction: action || null, logoUrl: logoUrl ?? '' });
  };

  const saveWords = async () => {
    await saveGymWords({
      points_name: gym.points_name.trim(),
      points_name_short: gym.points_name_short.trim() || null,
      welcome_message: gym.welcome_message.trim() || null,
    });
    // Sent whole: the server keeps only what differs from the English word (0114).
    if (vocab) await saveGymVocabulary(vocab);
  };

  const toggleModule = async (m: GymModule) => {
    if (m.state === 'not_sold' || m.state === 'parent_off') return;
    try {
      await setGymModule(m.feature_key, !m.enabled);
      setModules(await getGymModules());
      refreshGymModules();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That could not be saved', 'error');
    }
  };

  const savePlans = async () => {
    const parse = (row: PlanDraft) => {
      const price = Number(row.price || 0);
      const days = row.days.trim() === '' ? null : Number(row.days);
      if (!Number.isFinite(price) || price < 0) throw new Error(`${row.name || 'A plan'}: that price is not a number.`);
      if (days !== null && (!Number.isInteger(days) || days < 1)) {
        throw new Error(`${row.name || 'A plan'}: days is a whole number — or empty for a plan that never ends.`);
      }
      return { price, days };
    };
    // The new ones first, so a failure leaves nothing half-written.
    for (const row of adding) {
      if (!row.name.trim()) continue;
      const { price, days } = parse(row);
      await createPlan({
        name: row.name.trim(),
        // The tier is a label the refund floor reads (0073); what a plan lets a
        // member do is the feature matrix on Membership Plans (0049).
        tier: price > 0 ? 'premium' : 'free',
        price, duration_days: days, description: null, is_active: true,
        can_book_classes: true, can_book_pt: price > 0,
        class_bookings_per_week: null, pt_sessions_per_month: null,
      });
    }
    setAdding([]);
    for (const plan of plans) {
      const next = edited[plan.id];
      if (!next) continue;
      if (!next.name.trim()) throw new Error('A plan needs a name.');
      const { price, days } = parse(next);
      if (next.name.trim() === plan.name && price === plan.price && days === (plan.duration_days ?? null)) continue;
      await updatePlan(plan.id, { name: next.name.trim(), price, duration_days: days });
    }
    const fresh = await listPlans();
    setPlans(fresh);
    setEdited(Object.fromEntries(fresh.map((p) => [p.id, {
      name: p.name, price: String(p.price), days: p.duration_days == null ? '' : String(p.duration_days),
    }])));
  };

  const removePlan = async (plan: MembershipPlanRow) => {
    if (!window.confirm(`Remove ${plan.name}? Nobody can buy it any more; anyone already on it moves to your free plan.`)) return;
    try {
      await retirePlan(plan.id);
      setPlans((ps) => ps.filter((p) => p.id !== plan.id));
      showToast(`${plan.name} removed.`, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That plan could not be removed', 'error');
    }
  };

  const saveDoor = async () => {
    const wanted = slug.trim().toLowerCase();
    if (wanted && wanted !== savedSlug) {
      const moved = await setGymSlug(wanted);
      setSlug(moved);
      setSavedSlug(moved);
    }
    setJoinCode(joinSet ? await setJoinSettings(door, joinSet) : await setJoinPolicy(door, false));
  };

  const savePassword = async () => {
    if (password.next.length < 8) throw new Error('Use at least 8 characters.');
    if (password.next !== password.again) throw new Error('Those two passwords are not the same.');
    await setFirstPassword(password.next);
  };

  // Any step up to the furthest one reached: going back to step 3 must not lock you out of step 9.
  const furthest = Math.max(index, ...done.map((k) => steps.findIndex((x) => x.key === k) + 1));
  const reachable = (to: Step) => steps.findIndex((x) => x.key === to) <= furthest;
  const go = (to: Step) => { if (reachable(to)) setStep(to); };

  const next = async () => {
    setSaving(true);
    try {
      if (step === 'gym') await saveGym();
      if (step === 'hours') await saveHours();
      if (step === 'look') await saveLook();
      if (step === 'words') await saveWords();
      if (step === 'plans') await savePlans();
      if (step === 'door') await saveDoor();
      if (step === 'password') await savePassword();
      setDone((d) => (d.includes(step) ? d : [...d, step]));
      if (!isLast) {
        const to = steps[index + 1].key;
        await setOnboardingStep(to);
        setStep(to);
      } else {
        await openGym('/dashboard');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That could not be saved', 'error');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Finish setup, confirm the database now says so, then leave for `to`.
   * The checklist links used to open in a new tab while the gym was still
   * "not set up", so the guard sent that tab straight back here — finishing
   * first is what lets any page open.
   */
  const openGym = async (to: string) => {
    await finishGymSetup();
    clearGymContext();
    const ctx = await getGymContext(true);
    if (ctx && !ctx.onboarded) {
      throw new Error('Your gym could not be marked as set up. Try again, or ask Core Fitness in Support.');
    }
    // A full load: the shell reads the gym's name and colours once at boot.
    window.location.assign(to);
  };

  const finishAndGo = async (to: string) => {
    setSaving(true);
    try {
      await openGym(to);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That could not be opened', 'error');
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
  const inputStyle = { borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' };
  const labelStyle = { color: 'var(--color-text-secondary)' };
  const hint = 'text-xs';
  const monogram = (gym.short_name || gym.gym_name || '?').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:py-10">
        {/* Header: the gym as it will look, from the first screen */}
        <div className="flex items-center gap-3">
          {logoUrl
            ? <img src={logoUrl} alt="" className="h-11 w-11 rounded-xl object-cover" />
            : <div className="grid h-11 w-11 place-items-center rounded-xl text-sm font-bold"
                style={{ background: 'var(--color-primary)', color: '#fff' }}>{monogram}</div>}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
              {gym.gym_name ? `Setting up ${gym.gym_name}` : 'Welcome to Core Fitness'}
            </h1>
            <p className="text-sm" style={labelStyle}>
              Step {index + 1} of {steps.length} · every answer can be changed later
            </p>
          </div>
          <Button variant="ghost" onClick={() => void signOut()}>
            <LogOut size={15} className="mr-1.5" /> Sign out
          </Button>
        </div>

        {/* Mobile: a thin progress bar instead of the rail */}
        <div className="mt-4 flex gap-1 lg:hidden">
          {steps.map((s, i) => (
            <span key={s.key} className="h-1 flex-1 rounded-full"
              style={{ background: i <= index ? 'var(--color-primary)' : 'var(--color-border)' }} />
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          {/* The rail: where you are, what is done, and a way back to it */}
          <nav aria-label="Setup steps" className="hidden lg:block">
            <ol className="space-y-1">
              {steps.map((s, i) => {
                const here = s.key === step;
                const ok = done.includes(s.key) && !here;
                const Icon = s.icon;
                return (
                  <li key={s.key}>
                    <button type="button" onClick={() => go(s.key)} disabled={!reachable(s.key)}
                      aria-current={here ? 'step' : undefined}
                      className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm disabled:cursor-default"
                      style={{
                        background: here ? 'var(--color-surface)' : 'transparent',
                        color: here ? 'var(--color-text-primary)' : ok ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
                        border: here ? '1px solid var(--color-border)' : '1px solid transparent',
                      }}>
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
                        style={{
                          background: ok ? 'var(--color-primary)' : here ? 'var(--color-primary-soft, var(--color-surface-high))' : 'var(--color-surface)',
                          color: ok ? '#fff' : here ? 'var(--color-primary-300, var(--color-primary))' : 'var(--color-text-muted)',
                        }}>
                        {ok ? <Check size={13} /> : <Icon size={13} />}
                      </span>
                      <span className="truncate">{i + 1}. {s.title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <section className="rounded-2xl border p-5 sm:p-6"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>{current.title}</h2>
            <p className="mt-1 text-sm" style={labelStyle}>{current.blurb}</p>

            {step === 'gym' && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
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
                  <input id="s-phone" className={input} style={inputStyle} value={gym.phone} placeholder="09XX XXX XXXX"
                    onChange={(e) => setGym({ ...gym, phone: e.target.value })} />
                </div>
                <div>
                  <label className={label} style={labelStyle} htmlFor="s-email">Email</label>
                  <input id="s-email" type="email" className={input} style={inputStyle} value={gym.email}
                    onChange={(e) => setGym({ ...gym, email: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <span className={label} style={labelStyle}>Your logo</span>
                  <div className="flex flex-wrap items-center gap-3">
                    {logoUrl
                      ? <img src={logoUrl} alt="" className="h-14 w-14 rounded-xl object-cover" style={{ background: 'var(--color-bg)' }} />
                      : <div className="grid h-14 w-14 place-items-center rounded-xl text-lg font-bold"
                          style={{ background: 'var(--color-primary)', color: '#fff' }}>{monogram}</div>}
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
                  <p className={`mt-2 ${hint}`} style={labelStyle}>
                    Square works best. With no logo, your members see your initials in your colour — never another gym&rsquo;s mark.
                    It is saved with your colours, two steps on.
                  </p>
                </div>
                <div className="sm:col-span-2"><GymLocationPicker /></div>
              </div>
            )}

            {step === 'hours' && (
              <div className="mt-5 space-y-5">
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
                {closedDays !== null && (
                  <div>
                    <span className={label} style={labelStyle}>Closed on</span>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days the gym is closed">
                      {DAYS.map((d, k) => {
                        const day = (k + 1) % 7; // 0 = Sunday, as the database stores it
                        const on = closedDays.includes(day);
                        return (
                          <button key={d} type="button" aria-pressed={on} disabled={!on && closedDays.length >= 6}
                            onClick={() => setClosedDays(on ? closedDays.filter((x) => x !== day) : [...closedDays, day])}
                            className="rounded-lg border px-3.5 py-2 text-sm font-semibold disabled:opacity-40"
                            style={on
                              ? { background: 'var(--color-primary)', borderColor: 'var(--color-primary)', color: '#fff' }
                              : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                            {d}
                          </button>
                        );
                      })}
                    </div>
                    <p className={`mt-2 ${hint}`} style={labelStyle}>
                      Open every day? Leave them all off. Members&rsquo; streaks never count a closed day as a day left to train.
                    </p>
                  </div>
                )}
                <p className={hint} style={labelStyle}>
                  Your hours flag classes scheduled outside them, and show on your members&rsquo; app.
                </p>
              </div>
            )}

            {step === 'look' && (
              <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div>
                  <p className="text-xs" style={labelStyle}>Your main colour — where you are, and what you have</p>
                  <div className="mt-2">
                    <ColourRolePicker idPrefix="setup-accent" value={gym.accent} fallback="violet"
                      onChange={(v) => setGym({ ...gym, accent: v || 'violet' })} />
                  </div>
                  <p className="mt-5 text-xs" style={labelStyle}>Your action colour — the buttons that do the next thing: book, renew, save</p>
                  <div className="mt-2">
                    <ColourRolePicker idPrefix="setup-action" value={action} fallback="amber"
                      unsetLabel="Standard amber, the colour every gym started with" onChange={setAction} />
                  </div>
                  <p className={`mt-3 ${hint}`} style={labelStyle}>
                    Your own brand colour works too — every colour is adjusted to stay readable on the app&rsquo;s dark background.
                  </p>
                </div>
                <ThemePreview accent={gym.accent} action={action}
                  onPick={(accent, act) => { setGym((g) => ({ ...g, accent })); setAction(act); }} />
              </div>
            )}

            {step === 'words' && (
              <div className="mt-5 space-y-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={label} style={labelStyle} htmlFor="s-pn">Your points are called</label>
                    <input id="s-pn" className={input} style={inputStyle} maxLength={30} value={gym.points_name} placeholder="Points"
                      onChange={(e) => setGym({ ...gym, points_name: e.target.value })} />
                  </div>
                  <div>
                    <label className={label} style={labelStyle} htmlFor="s-pns">In the middle of a sentence</label>
                    <input id="s-pns" className={input} style={inputStyle} maxLength={30} value={gym.points_name_short} placeholder="points"
                      onChange={(e) => setGym({ ...gym, points_name_short: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={label} style={labelStyle} htmlFor="s-wm">A line on your members&rsquo; home screen (optional)</label>
                    <input id="s-wm" className={input} style={inputStyle} maxLength={280} value={gym.welcome_message}
                      placeholder="Open 5am–10pm. Ask the desk about the new racks."
                      onChange={(e) => setGym({ ...gym, welcome_message: e.target.value })} />
                  </div>
                </div>
                {vocab && (
                  <div>
                    <p className="text-xs" style={labelStyle}>What you call your people — leave a box empty for the standard word</p>
                    <div className="mt-2 grid gap-3 sm:grid-cols-3">
                      {([
                        ['trainers', 'Your coaches', 'coaches'],
                        ['members', 'Your members', 'members'],
                        ['classes', 'Your classes', 'classes'],
                      ] as const).map(([key, title, fallback]) => (
                        <div key={key}>
                          <label className={label} style={labelStyle} htmlFor={'s-v-' + key}>{title}</label>
                          <input id={'s-v-' + key} className={input} style={inputStyle} maxLength={30}
                            value={vocab[key]} placeholder={fallback}
                            onChange={(e) => { const v = e.target.value; setVocab((old) => old && { ...old, [key]: v }); }} />
                        </div>
                      ))}
                    </div>
                    <p className={`mt-2 ${hint}`} style={labelStyle}>The singulars can be renamed too, later, on Your app → Words.</p>
                  </div>
                )}
              </div>
            )}

            {step === 'walkins' && (
              <div className="mt-5"><DayPassSettings /></div>
            )}

            {step === 'coaching' && (
              <div className="mt-5"><CoachingSettings /></div>
            )}

            {step === 'bookings' && (
              <div className="mt-5"><BookingApproval /></div>
            )}

            {step === 'runs' && (
              <div className="mt-5">
                {modules.length === 0
                  ? <p className="text-sm" style={labelStyle}>Every part is on. You can switch parts off later on Your app → What you run.</p>
                  : <ModuleSwitches modules={modules} onToggle={(m) => void toggleModule(m)} hideUnsold />}
                <p className={`mt-3 ${hint}`} style={labelStyle}>
                  Each switch saves at once. Only the parts your Core Fitness plan includes are listed.
                </p>
              </div>
            )}

            {step === 'coach' && (
              <div className="mt-5"><AiCoachCard switchedOff={!coach?.enabled} /></div>
            )}

            {step === 'plans' && (
              <div className="mt-5 space-y-3">
                {plans.length === 0 && adding.length === 0 && (
                  <p className="text-sm" style={labelStyle}>No plans yet — add your first one below.</p>
                )}
                {plans.map((plan) => (
                  <div key={plan.id} className="rounded-xl border p-3"
                    style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_110px_auto] items-end">
                      <div>
                        <label className={label} style={labelStyle} htmlFor={`p-${plan.id}`}>
                          {plan.tier === 'free' ? 'Free plan' : 'Plan'} · {peso(plan.price)} now
                        </label>
                        <input id={`p-${plan.id}`} className={input} style={inputStyle} value={edited[plan.id]?.name ?? ''}
                          onChange={(e) => setEdited({ ...edited, [plan.id]: { ...edited[plan.id], name: e.target.value } })} />
                      </div>
                      <div>
                        <label className={label} style={labelStyle} htmlFor={`pp-${plan.id}`}>Price (₱)</label>
                        <input id={`pp-${plan.id}`} type="number" min={0} className={input} style={inputStyle}
                          value={edited[plan.id]?.price ?? ''}
                          onChange={(e) => setEdited({ ...edited, [plan.id]: { ...edited[plan.id], price: e.target.value } })} />
                      </div>
                      <div>
                        <label className={label} style={labelStyle} htmlFor={`pd-${plan.id}`}>Days</label>
                        <input id={`pd-${plan.id}`} type="number" min={1} className={input} style={inputStyle}
                          value={edited[plan.id]?.days ?? ''} placeholder="never ends"
                          onChange={(e) => setEdited({ ...edited, [plan.id]: { ...edited[plan.id], days: e.target.value } })} />
                      </div>
                      {plan.tier !== 'free'
                        ? <button type="button" onClick={() => void removePlan(plan)} aria-label={`Remove ${plan.name}`}
                            data-tip="Remove this plan" className="h-[38px] w-[38px] grid place-items-center rounded-lg border"
                            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                            <Trash2 size={15} />
                          </button>
                        : <span className="h-[38px] w-[38px]" aria-hidden />}
                    </div>
                  </div>
                ))}
                {adding.map((row, i) => (
                  <div key={i} className="rounded-xl border border-dashed p-3" style={{ borderColor: 'var(--color-primary)' }}>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_110px_auto] items-end">
                      <div>
                        <label className={label} style={labelStyle} htmlFor={`np-${i}`}>A new plan</label>
                        <input id={`np-${i}`} className={input} style={inputStyle} value={row.name} placeholder="Student rate"
                          onChange={(e) => setAdding(adding.map((r, n) => (n === i ? { ...r, name: e.target.value } : r)))} />
                      </div>
                      <div>
                        <label className={label} style={labelStyle} htmlFor={`npp-${i}`}>Price (₱)</label>
                        <input id={`npp-${i}`} type="number" min={0} className={input} style={inputStyle} value={row.price}
                          onChange={(e) => setAdding(adding.map((r, n) => (n === i ? { ...r, price: e.target.value } : r)))} />
                      </div>
                      <div>
                        <label className={label} style={labelStyle} htmlFor={`npd-${i}`}>Days</label>
                        <input id={`npd-${i}`} type="number" min={1} className={input} style={inputStyle} value={row.days}
                          placeholder="never ends"
                          onChange={(e) => setAdding(adding.map((r, n) => (n === i ? { ...r, days: e.target.value } : r)))} />
                      </div>
                      <button type="button" onClick={() => setAdding(adding.filter((_, n) => n !== i))}
                        aria-label="Discard this new plan" className="h-[38px] w-[38px] grid place-items-center rounded-lg border"
                        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
                <Button variant="ghost" onClick={() => setAdding([...adding, { name: '', price: '', days: '30' }])}>
                  Add a plan
                </Button>
                <p className={hint} style={labelStyle}>
                  A ₱0 plan is free, and empty days means it never expires. Your free plan stays — it is where a member
                  goes when a paid plan ends. What each plan unlocks is on Membership Plans.
                </p>
              </div>
            )}

            {step === 'door' && (
              <div className="mt-5 space-y-2">
                <div className="pb-2">
                  <label className={label} style={labelStyle} htmlFor="s-slug">Your members&rsquo; link</label>
                  <div className="flex items-center gap-1">
                    <span className="text-xs shrink-0" style={labelStyle}>/join/</span>
                    <input id="s-slug" className={input} style={inputStyle} maxLength={40} value={slug} placeholder="your-gym"
                      onChange={(e) => setSlug(e.target.value.toLowerCase())} />
                  </div>
                  <p className={`mt-1 ${hint}`} style={labelStyle}>
                    Small letters, numbers and dashes. Get this right now — changing it later stops every link you have handed out.
                  </p>
                </div>
                {([
                  ['open', 'Anyone can find you', 'You are listed in the app’s gym list. Anyone with the app can search for you and ask to join.'],
                  ['code', 'Only with your link or code', 'You are not listed. Members join with your link, or by typing a short code you give them.'],
                  ['closed', 'Only at the front desk', 'Nobody can ask to join from the app. Your desk creates every member account, or invites them.'],
                ] as const).map(([key, title, blurb]) => (
                  <button key={key} type="button" onClick={() => setDoor(key)} aria-pressed={door === key}
                    className="w-full flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left"
                    style={{ borderColor: door === key ? 'var(--color-primary)' : 'var(--color-border)', background: 'var(--color-bg)' }}>
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
                {joinSet && <JoinApproval policy={door} value={joinSet} onChange={setJoinSet} />}
                <p className={hint} style={labelStyle}>
                  {joinSet?.approval === 'auto' && door !== 'closed'
                    ? 'Sign-ups start on your free plan straight away.'
                    : 'However they arrive, you approve every sign-up.'}
                  {joinCode && door === 'code' && (
                    <> Your join code is <strong style={{ color: 'var(--color-text-primary)', letterSpacing: '0.12em' }}>{joinCode}</strong>.</>
                  )}
                </p>
              </div>
            )}

            {step === 'password' && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
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
                <p className={`sm:col-span-2 ${hint}`} style={labelStyle}>At least 8 characters. The temporary password stops working.</p>
              </div>
            )}

            {step === 'ready' && (
              <div className="mt-5">
                <div className="grid gap-2 sm:grid-cols-2">
                  {([
                    [Banknote, 'Refund tiers and fee', 'What a member gets back when they cancel.', '/settings?tab=refunds'],
                    [FileSignature, 'Your waiver', 'What members sign before they book.', '/settings?tab=waiver'],
                    [ScrollText, 'House rules', 'Your gym’s own rules, shown in your Terms.', '/settings?tab=house-rules'],
                    [CalendarDays, 'Your class timetable', 'The classes members can book.', '/schedule'],
                    [Dumbbell, 'Your coaches', 'Add trainers and their hours.', '/trainers'],
                    [UserPlus, 'Front desk accounts', 'Who works the desk, and what they may do.', '/settings?tab=staff'],
                    [Users, 'Invite your members', 'Bring in the people you already have.', '/invitations'],
                    [ShoppingBag, 'The shop', 'Drinks, supplements and gear at the desk.', '/shop'],
                  ] as const).map(([Icon, title, blurb, to]) => (
                    <button key={to} type="button" disabled={saving} onClick={() => void finishAndGo(to)}
                      className="flex items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:brightness-110 disabled:opacity-60"
                      style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                        style={{ background: 'var(--color-surface-high)', color: 'var(--color-primary-300, var(--color-primary))' }}>
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{title}</span>
                        <span className="block text-xs mt-0.5" style={labelStyle}>{blurb}</span>
                      </span>
                      <ArrowRight size={14} className="mt-1 shrink-0" style={labelStyle} />
                    </button>
                  ))}
                </div>
                <p className={`mt-3 ${hint}`} style={labelStyle}>
                  Choosing one opens your gym and takes you there. None of them is needed to open — your gym works with
                  the standard rules until you change them, and every one is in the menu afterwards.
                </p>
              </div>
            )}

            <div className="mt-7 flex flex-wrap items-center gap-2 border-t pt-5" style={{ borderColor: 'var(--color-border)' }}>
              <Button onClick={() => void next()} disabled={saving || uploading}>
                {saving ? 'Saving…' : isLast ? 'Open my gym' : step === 'runs' || step === 'bookings' || step === 'coaching' || step === 'walkins' || step === 'coach' ? 'Continue' : 'Save and continue'}
              </Button>
              {index > 0 && (
                <Button variant="ghost" disabled={saving} onClick={() => setStep(steps[index - 1].key)}>Back</Button>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
