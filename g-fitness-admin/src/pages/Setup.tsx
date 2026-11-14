import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Banknote, Building2, CalendarDays, Check, Clock, DoorOpen, Dumbbell, FileSignature, Gift, Globe, KeyRound,
  LayoutGrid, LogOut, Palette, Rocket, ScanLine, ScrollText, ShieldCheck, Sparkles, Tags, Trash2, Type, UserPlus, Users, Volume2, VolumeX, Wallet, Workflow,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { showToast } from '../utils/toast';
import ColourRolePicker from '../components/ColourRolePicker';
import ThemePreview from '../components/ThemePreview';
import ModuleSwitches from '../components/ModuleSwitches';
import RunQuestions from '../components/RunQuestions';
import AiCoachCard from '../components/AiCoachCard';
import BookingApproval from '../components/BookingApproval';
import CoachingSettings from '../components/CoachingSettings';
import GymLocationPicker from '../components/GymLocationPicker';
import DayPassSettings from '../components/DayPassSettings';
import DoorSettings from '../components/DoorSettings';
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
import { myGymApplication } from '../lib/api/applications';
import { cropPhoto } from '../components/ui/PhotoCropper';
import PlacePicker from '../components/ui/PlacePicker';
import OnlinePaymentsTab from '../components/OnlinePaymentsTab';
import WaiverTab from '../components/WaiverTab';
import HouseRulesTab from '../components/HouseRulesTab';
import { RefundPolicyTab } from './Settings';
import { rampFor } from '../lib/gymTheme';
import StudioPreview from './setup/StudioPreview';
import { EquipmentStep, MembersStep, RewardsStep, TeamStep } from './setup/StudioSteps';
import { fanfare, levelUp, saved, setSoundOn, soundOn, tick, whoosh } from './setup/sounds';
import './setup/setup.css';
import GymStyles from '../components/GymStyles';


/**
 * A gym's first day — the build studio (owner, 2026-11-07: "should feel like you
 * are on customization mode in games … all things included to fully complete
 * their gym"). Character-creator layout: six chapters down the left (Identity,
 * How you run it, Money, Safety and rules, Team and floor, Open the doors), the
 * choice in the middle, and the live result on the right — the members' phone
 * or this dashboard, in the gym's own colours, name and words, light or dark. A
 * build meter fills as steps are done, each finished chapter is celebrated, and
 * soft synthesised sounds mark choices (muteable; motion stops under reduced
 * motion). Styles: pages/setup/setup.css (.ob-*), designed in both modes.
 *
 * `create_gym()` copies Core Fitness's *rules* into a new gym and none of its
 * identity; this is where a gym makes them its own. Every step saves before it
 * advances (or saves itself, for the pages hosted from Settings), every step but
 * the gym's name and the password can be skipped, `set_onboarding_step`
 * remembers where they were, and `finish_gym_setup()` stamps `gyms.onboarded_at`
 * (0107) so the studio never appears again. Nothing is only settable here.
 */

type Step = 'gym' | 'hours' | 'look' | 'words'
  | 'style' | 'runs' | 'bookings' | 'coaching' | 'checkin' | 'coach'
  | 'plans' | 'walkins' | 'refunds' | 'payments'
  | 'waiver' | 'rules'
  | 'team' | 'equipment' | 'rewards'
  | 'door' | 'members' | 'password' | 'ready';
type Chapter = 'identity' | 'run' | 'money' | 'safety' | 'team' | 'open';

const CHAPTERS: { key: Chapter; title: string; icon: typeof Check }[] = [
  { key: 'identity', title: 'Your identity', icon: Building2 },
  { key: 'run', title: 'How you run it', icon: LayoutGrid },
  { key: 'money', title: 'Money', icon: Wallet },
  { key: 'safety', title: 'Safety and rules', icon: ShieldCheck },
  { key: 'team', title: 'Team and floor', icon: Users },
  { key: 'open', title: 'Open the doors', icon: DoorOpen },
];

const STEPS: { key: Step; chapter: Chapter; title: string; blurb: string; icon: typeof Check; optional?: boolean }[] = [
  { key: 'gym', chapter: 'identity', title: 'Name your gym', blurb: 'What your members, your receipts and your sign will say — and where you are.', icon: Building2 },
  { key: 'hours', chapter: 'identity', title: 'When you are open', blurb: 'Your hours, and the days you close.', icon: Clock, optional: true },
  { key: 'look', chapter: 'identity', title: 'Your colours', blurb: 'Two colours, and watch your app and this dashboard change on the right.', icon: Palette },
  { key: 'words', chapter: 'identity', title: 'Your words', blurb: 'What you call your coaches, your members and your classes — and a line for your members’ home screen.', icon: Type, optional: true },
  { key: 'style', chapter: 'run', title: 'How your gym works', blurb: 'Open floor, classes, appointments or coaching packages — tick yours, and the booking and coaching settings follow.', icon: Workflow, optional: true },
  { key: 'runs', chapter: 'run', title: 'What you run', blurb: 'A few questions. Each answer switches that part of the app on or off — nothing is deleted.', icon: LayoutGrid, optional: true },
  { key: 'bookings', chapter: 'run', title: 'Who approves bookings', blurb: 'Instant, your coaches, your desk — or not in the app at all.', icon: CalendarDays, optional: true },
  { key: 'coaching', chapter: 'run', title: 'How coaching works', blurb: 'How members get a coach, for how long, who is paid — and your house rules for coaching.', icon: Dumbbell, optional: true },
  { key: 'checkin', chapter: 'run', title: 'Checking in', blurb: 'Whether your coaches check in too, and whether members pick what they are doing.', icon: ScanLine, optional: true },
  { key: 'coach', chapter: 'run', title: 'The AI assistant', blurb: 'How much your members may talk to it.', icon: Sparkles, optional: true },
  { key: 'plans', chapter: 'money', title: 'Your plans', blurb: 'These came from a working gym. Make them yours before anyone pays.', icon: Tags, optional: true },
  { key: 'walkins', chapter: 'money', title: 'Day passes and walk-ins', blurb: 'Whether guests can pay for a day, and the packs you sell.', icon: Banknote, optional: true },
  { key: 'refunds', chapter: 'money', title: 'Refunds', blurb: 'What a member gets back when they cancel, and the fee you keep.', icon: Banknote, optional: true },
  { key: 'payments', chapter: 'money', title: 'How members pay you', blurb: 'Cash at the desk, GCash, Maya or bank details — and paying in the app.', icon: Wallet, optional: true },
  { key: 'waiver', chapter: 'safety', title: 'Your waiver', blurb: 'What members sign before they book, and the health questions with it.', icon: FileSignature, optional: true },
  { key: 'rules', chapter: 'safety', title: 'House rules', blurb: 'Your gym’s own rules — shown to members in your Terms.', icon: ScrollText, optional: true },
  { key: 'team', chapter: 'team', title: 'Your team', blurb: 'Add your coaches and your front desk. Each gets a login slip.', icon: UserPlus, optional: true },
  { key: 'equipment', chapter: 'team', title: 'Your floor', blurb: 'What you have, so members know where each machine is — and can say when one breaks.', icon: Dumbbell, optional: true },
  { key: 'rewards', chapter: 'team', title: 'Points and rewards', blurb: 'What members earn for showing up, and what they can spend it on.', icon: Gift, optional: true },
  { key: 'door', chapter: 'open', title: 'How members join', blurb: 'Who can ask to join you, and how they find you.', icon: DoorOpen },
  { key: 'members', chapter: 'open', title: 'Your members', blurb: 'Your join link to hand out, and the members you already have.', icon: Users, optional: true },
  { key: 'password', chapter: 'open', title: 'Your password', blurb: 'Replace the temporary one you were given.', icon: KeyRound },
  { key: 'ready', chapter: 'open', title: 'Open your gym', blurb: 'Your gym, built. Open it — anything you skipped is in the menu.', icon: Rocket },
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
  /** The studio: sounds on/off (this device), the way the stage slides, the chapter-complete moment. */
  const [sound, setSound] = useState(() => soundOn());
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [burst, setBurst] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [ctx, settings, planRows, temp, app, mods, applied] = await Promise.all([
        getGymContext(true), getGymSettings(), listPlans(), mustChangePassword(), getGymApp(),
        getGymModules().catch(() => [] as GymModule[]), myGymApplication(),
      ]);
      if (ctx?.onboarded) { window.location.assign('/dashboard'); return; }
      setGym({
        gym_name: settings?.gym_name ?? ctx?.gymName ?? '',
        short_name: settings?.short_name ?? '',
        tagline: settings?.tagline ?? '',
        // Empty settings fill from the application they sent (0187), never over what the gym has typed.
        address: settings?.address || applied?.address || '',
        phone: settings?.phone || applied?.phone || '',
        email: settings?.email || applied?.email || '',
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
        // A starter plan with no price yet (0186) starts blank, not ₱0.
        name: p.name, price: p.price_unset ? '' : String(p.price), days: p.duration_days == null ? '' : String(p.duration_days),
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
  // Points and rewards (its name, its rewards, how it is earned) only for a gym that said yes to
  // points on What you run. A database with no switches (before 0110) keeps the step.
  const points = modules.find((m) => m.feature_key === 'points');
  const steps = STEPS.filter((s) =>
    (s.key !== 'password' || needsPassword) && (s.key !== 'coach' || (!!coach && coach.state !== 'not_sold'))
    && (s.key !== 'rewards' || !points || points.enabled));
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

  /** Sets a switch to an answer (guides G2) — the same call the switch list makes. */
  const setModule = async (key: string, enabled: boolean) => {
    await setGymModule(key, enabled);
    setModules(await getGymModules());
    refreshGymModules();
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
      if (plan.price_unset && plan.tier !== 'free' && next.price.trim() === '') {
        throw new Error(`${next.name.trim() || plan.name}: set a price — members do not see it until you do.`);
      }
      const { price, days } = parse(next);
      if (!plan.price_unset && next.name.trim() === plan.name && price === plan.price && days === (plan.duration_days ?? null)) continue;
      await updatePlan(plan.id, { name: next.name.trim(), price, duration_days: days, price_unset: false });
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
  const move = (to: Step, how?: 'back') => {
    if (!reachable(to)) return;
    setDir(how ?? (steps.findIndex((x) => x.key === to) < index ? 'back' : 'fwd'));
    setStep(to);
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
      throw new Error('Your gym could not be marked as set up. Try again, or ask Core Fitness in Help.');
    }
    // A full load: the shell reads the gym's name and colours once at boot.
    window.location.assign(to);
  };
  const next = async (skip = false) => {
    setSaving(true);
    try {
      if (skip) { /* skipped: nothing saved, the standard rules stand */ }
      else if (step === 'gym') await saveGym();
      else if (step === 'hours') await saveHours();
      else if (step === 'look') await saveLook();
      else if (step === 'words' || step === 'rewards') await saveWords();   // the points' name is asked on rewards
      else if (step === 'plans') await savePlans();
      else if (step === 'door') await saveDoor();
      else if (step === 'password') await savePassword();
      // A skipped step is not done — the chapter waits for it — but it does not hold anyone up.
      const nowDone = skip || done.includes(step) ? done : [...done, step];
      if (!skip) setDone(nowDone);
      if (!isLast) {
        const to = steps[index + 1].key;
        await setOnboardingStep(to);
        // The chapter just finished? Celebrate it.
        const ch = current.chapter;
        const inCh = steps.filter((x) => x.chapter === ch);
        if (!skip && steps[index + 1].chapter !== ch && inCh.every((x) => nowDone.includes(x.key))) {
          setBurst(CHAPTERS.find((c) => c.key === ch)?.title ?? null);
          levelUp();
          window.setTimeout(() => setBurst(null), 1900);
        } else if (!skip) { saved(); } else { whoosh(); }
        setDir('fwd');
        setStep(to);
      } else {
        fanfare();
        await openGym('/dashboard');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That could not be saved', 'error');
    } finally {
      setSaving(false);
    }
  };





  /** The latest next(), for the Enter key (its effect does not re-subscribe every render). */
  const nextRef = useRef(next);
  useEffect(() => { nextRef.current = next; });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing || saving || step === 'ready') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON' || t.tagName === 'SELECT' || t.tagName === 'A')) return;
      if (document.body.classList.contains('slip-open') || document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      void nextRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, step]);

  const signOut = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    clearGymContext();
    window.location.assign('/admin/login');
  };

  if (loading) {
    return (
      <div className="ob" data-studio-loading>
        <div style={{ margin: 'auto', textAlign: 'center' }}>
          <div className="ob-logo" style={{ margin: '0 auto', width: 56, height: 56 }}><Sparkles size={24} /></div>
          <p style={{ marginTop: 14, fontWeight: 800, color: 'var(--ob-ink)' }}>Opening your build studio…</p>
        </div>
      </div>
    );
  }

  const monogram = (gym.short_name || gym.gym_name || '?').slice(0, 2).toUpperCase();
  const selfSaving: Step[] = ['style', 'runs', 'bookings', 'coaching', 'walkins', 'checkin', 'coach', 'refunds', 'payments', 'waiver', 'rules', 'team', 'equipment', 'members'];
  const chapters = CHAPTERS.map((ch) => {
    const list = steps.filter((s) => s.chapter === ch.key);
    return { ...ch, list, done: list.filter((s) => done.includes(s.key)).length };
  }).filter((ch) => ch.list.length > 0);
  const totalDone = steps.filter((s) => done.includes(s.key)).length;
  const pct = Math.round((totalDone / steps.length) * 100);
  const here = chapters.find((ch) => ch.key === current.chapter) ?? chapters[0];
  const level = chapters.filter((ch) => ch.done === ch.list.length).length + 1;
  const vocabWord = (k: 'members' | 'trainers' | 'classes', d: string) => (vocab && vocab[k]?.trim()) || d;

  // The studio wears the colours as they are picked — the whole screen, not only the preview (a game's
  // customise mode): main colour and action colour, as the gym's look will set them once published.
  const lightMode = document.documentElement.dataset.mode === 'light';
  const pr = rampFor(gym.accent, 'violet');
  const ac = rampFor(action || null, 'amber');
  const studioColours = {
    '--color-primary': pr.base, '--color-primary-300': lightMode ? pr.c700 : pr.c300,
    '--fill-primary': lightMode ? pr.c700 : pr.base,
    '--color-secondary': lightMode ? ac.c700 : ac.base, '--fill-action': ac.c700,
  } as React.CSSProperties;

  return (
    <div className="ob" data-studio style={studioColours}>
      {/* ── top: who is being built, the build meter, sound ── */}
      <header className="ob-top">
        <div className="ob-brand">
          <div className="ob-logo">{logoUrl ? <img src={logoUrl} alt="" /> : monogram}</div>
          <div className="min-w-0">
            <div className="ob-kicker">Build studio</div>
            <div className="ob-gymname" data-studio-name>{gym.gym_name || 'Your gym'}</div>
          </div>
        </div>
        <div aria-label={`Gym build ${pct}%`} data-build-meter>
          <div className="ob-meter-head"><span>Gym build · {here.title}</span><b data-build-pct>{pct}%</b></div>
          <div className="ob-meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            {chapters.map((ch) => (
              <span key={ch.key} className="ob-seg" title={ch.title}><i style={{ ['--f' as string]: ch.done / ch.list.length }} /></span>
            ))}
          </div>
        </div>
        <div className="ob-tools">
          <span className="ob-level" data-studio-level><span>{level}</span>Level {level} of {chapters.length + 1}</span>
          <button type="button" className="ob-iconbtn" aria-label={sound ? 'Turn sounds off' : 'Turn sounds on'} aria-pressed={sound}
            onClick={() => { setSoundOn(!sound); setSound(!sound); if (!sound) tick(); }}>
            {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button type="button" className="ob-iconbtn" onClick={() => void signOut()}><LogOut size={15} />Save and leave</button>
        </div>
      </header>

      <div className="ob-body">
        {/* ── the chapters, like a game's customise tabs ── */}
        <nav className="ob-rail" aria-label="Setup chapters">
          {chapters.map((ch) => {
            const isHere = ch.key === here.key;
            const complete = ch.done === ch.list.length;
            const CI = ch.icon;
            return (
              <div key={ch.key} className={`ob-chap ${isHere ? 'here' : ''} ${complete ? 'done' : ''}`} data-chapter={ch.key}>
                <button type="button" className="ob-chap-head" disabled={!reachable(ch.list[0].key)}
                  onClick={() => { tick(); move(ch.list.find((s) => !done.includes(s.key))?.key ?? ch.list[0].key); }}>
                  <span className="ob-chap-icon">{complete && !isHere ? <Check size={17} /> : <CI size={17} />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="ob-chap-title block">{ch.title}</span>
                    <span className="ob-chap-sub block">{complete ? 'Complete' : `${ch.done} of ${ch.list.length}`}</span>
                    <span className="ob-chap-bar block"><i style={{ transform: `scaleX(${ch.done / ch.list.length})` }} /></span>
                  </span>
                </button>
                {isHere && (
                  <div className="ob-steps">
                    {ch.list.map((s) => {
                      const ok = done.includes(s.key) && s.key !== step;
                      return (
                        <button key={s.key} type="button" disabled={!reachable(s.key)} onClick={() => { tick(); move(s.key); }}
                          className={`ob-step ${s.key === step ? 'here' : ''} ${ok ? 'ok' : ''}`} aria-current={s.key === step ? 'step' : undefined}>
                          <span className="ob-dot">{ok && <Check size={11} />}</span>
                          <span className="truncate">{s.title}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* ── the stage ── */}
        <main className="ob-stage">
          <div className="ob-stage-scroll">
            <div key={step} className={`ob-stage-in ${dir === 'back' ? 'back' : ''}`} data-studio-step={step}>
              <div className="ob-step-tag"><i><current.icon size={13} /></i>{here.title} · step {index + 1} of {steps.length}</div>
              <h1 className="ob-title">{current.title}{current.optional && <span className="ob-optional">Optional</span>}</h1>
              <p className="ob-blurb">{current.blurb}</p>

              <div className="ob-content">
                {step === 'gym' && (<>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="ob-field sm:col-span-2"><span>Gym name</span>
                      <input className="ob-in" style={{ height: 54, fontSize: 18, fontWeight: 800 }} value={gym.gym_name} autoFocus
                        onChange={(e) => setGym({ ...gym, gym_name: e.target.value })} /></label>
                    <label className="ob-field"><span>Short name (optional)</span>
                      <input className="ob-in" value={gym.short_name} placeholder="For tight corners of the app" onChange={(e) => setGym({ ...gym, short_name: e.target.value })} /></label>
                    <label className="ob-field"><span>Tagline (optional)</span>
                      <input className="ob-in" value={gym.tagline} placeholder="Train hard, train here" onChange={(e) => setGym({ ...gym, tagline: e.target.value })} /></label>
                    <label className="ob-field"><span>Mobile number</span>
                      <input className="ob-in" value={gym.phone} placeholder="09XX XXX XXXX" onChange={(e) => setGym({ ...gym, phone: e.target.value })} /></label>
                    <label className="ob-field"><span>Email for members</span>
                      <input className="ob-in" type="email" value={gym.email} placeholder="desk@yourgym.com" onChange={(e) => setGym({ ...gym, email: e.target.value })} /></label>
                  </div>
                  <div><p className="ob-field"><span>Where you are</span></p>
                    <PlacePicker value={gym.address} inputClass="ob-in" inputStyle={{}} onChange={(v) => setGym({ ...gym, address: v })} /></div>
                  <div className="flex flex-wrap items-center gap-4 ob-hosted">
                    <div className="ob-logo" style={{ width: 72, height: 72, borderRadius: 20, fontSize: 22 }}>{logoUrl ? <img src={logoUrl} alt="" /> : monogram}</div>
                    <div className="flex-1 min-w-[220px]">
                      <p className="font-extrabold" style={{ color: 'var(--ob-ink)' }}>Your logo</p>
                      <p className="ob-hint" style={{ marginTop: 2 }}>Square works best. With none, members see your initials in your colour — never another gym&rsquo;s mark.</p>
                    </div>
                    <label className="ob-btn ghost cursor-pointer">
                      {uploading ? 'Uploading…' : logoUrl ? 'Choose another' : 'Choose a picture'}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                        onChange={(e) => {
                          const raw = e.target.files?.[0];
                          if (!raw) return;
                          void (async () => {
                            const file = await cropPhoto(raw, { aspect: 1, title: 'Frame your logo' });
                            if (!file) return;
                            setUploading(true);
                            void uploadMedia(file, 'logos')
                              .then((url) => { setLogoUrl(url); saved(); })
                              .catch((err) => showToast(err instanceof Error ? err.message : 'That could not be uploaded', 'error'))
                              .finally(() => setUploading(false));
                          })();
                        }} />
                    </label>
                    {logoUrl && <button type="button" className="ob-btn ghost" onClick={() => setLogoUrl(null)}>Remove</button>}
                  </div>
                  <div className="ob-hosted"><GymLocationPicker /></div>
                </>)}

                {step === 'hours' && (<>
                  <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
                    <label className="ob-field"><span>Opens at</span><input type="time" className="ob-in" value={gym.opening_time} onChange={(e) => setGym({ ...gym, opening_time: e.target.value })} /></label>
                    <label className="ob-field"><span>Closes at</span><input type="time" className="ob-in" value={gym.closing_time} onChange={(e) => setGym({ ...gym, closing_time: e.target.value })} /></label>
                  </div>
                  {closedDays !== null && (
                    <div>
                      <p className="ob-field"><span>Closed on</span></p>
                      <div className="flex flex-wrap gap-2" role="group" aria-label="Days the gym is closed">
                        {DAYS.map((d, k) => {
                          const day = (k + 1) % 7; // 0 = Sunday, as the database stores it
                          const on = closedDays.includes(day);
                          return (
                            <button key={d} type="button" className="ob-day" aria-pressed={on} disabled={!on && closedDays.length >= 6}
                              onClick={() => { tick(); setClosedDays(on ? closedDays.filter((x) => x !== day) : [...closedDays, day]); }}>{d}</button>
                          );
                        })}
                      </div>
                      <p className="ob-hint">Open every day? Leave them all off. Streaks never count a closed day as a day left to train.</p>
                    </div>
                  )}
                </>)}

                {step === 'look' && (
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div>
                      <p className="ob-field"><span>Your main colour — where you are, and what you have</span></p>
                      <ColourRolePicker idPrefix="setup-accent" value={gym.accent} fallback="violet" onChange={(v) => { tick(); setGym({ ...gym, accent: v || 'violet' }); }} />
                      <p className="ob-field" style={{ marginTop: 20 }}><span>Your action colour — the buttons that do the next thing</span></p>
                      <ColourRolePicker idPrefix="setup-action" value={action} fallback="amber" unsetLabel="Standard amber, the colour every gym started with" onChange={(v) => { tick(); setAction(v); }} />
                      <p className="ob-hint">Your own brand colour works too — each is adjusted to stay readable in light and in dark.</p>
                    </div>
                    <div className="ob-hosted"><ThemePreview accent={gym.accent} action={action}
                      onPick={(accent, act) => { tick(); setGym((g) => ({ ...g, accent })); setAction(act); }} /></div>
                  </div>
                )}

                {step === 'words' && (<>
                  {/* What the points are called is asked on Points and rewards, after What you run has
                      asked whether the gym runs points at all (owner, 2026-11-12). */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="ob-field sm:col-span-2"><span>A line on your members&rsquo; home screen (optional)</span>
                      <input className="ob-in" maxLength={280} value={gym.welcome_message} placeholder="Open 5am–10pm. Ask the desk about the new racks."
                        onChange={(e) => setGym({ ...gym, welcome_message: e.target.value })} /></label>
                  </div>
                  {vocab && (
                    <div>
                      <p className="ob-field"><span>What you call your people — leave a box empty for the standard word</span></p>
                      <div className="grid gap-4 sm:grid-cols-3">
                        {([['trainers', 'Your coaches', 'coaches'], ['members', 'Your members', 'members'], ['classes', 'Your classes', 'classes']] as const).map(([key, title, fallback]) => (
                          <label key={key} className="ob-field"><span>{title}</span>
                            <input className="ob-in" maxLength={30} value={vocab[key]} placeholder={fallback}
                              onChange={(e) => { const v = e.target.value; setVocab((old) => old && { ...old, [key]: v }); }} /></label>
                        ))}
                      </div>
                    </div>
                  )}
                </>)}

                {step === 'runs' && (
                  <div className="ob-hosted">
                    {modules.length === 0
                      ? <p className="ob-hint" style={{ margin: 0 }}>Every part is on. Switch parts off later on Your app → What you run.</p>
                      : <>
                        <RunQuestions modules={modules} onSet={async (k, v) => { tick(); await setModule(k, v); }} />
                        <p className="ob-hint" style={{ margin: '10px 0 0' }}>You can change any answer later on Your app → What you run.</p>
                        <details className="mt-3" data-every-switch>
                          <summary className="text-sm font-bold cursor-pointer" style={{ color: 'var(--ob-sub)' }}>Show every switch</summary>
                          <div className="mt-2"><ModuleSwitches modules={modules} onToggle={(m) => { tick(); void toggleModule(m); }} hideUnsold /></div>
                        </details>
                      </>}
                  </div>
                )}
                {step === 'style' && <div className="ob-hosted"><GymStyles onApplied={() => void getGymModules().then(setModules)} /></div>}
                {step === 'bookings' && <div className="ob-hosted"><BookingApproval /></div>}
                {step === 'coaching' && <div className="ob-hosted"><CoachingSettings /></div>}
                {step === 'checkin' && <div className="ob-hosted"><DoorSettings /></div>}
                {step === 'coach' && <div className="ob-hosted"><AiCoachCard switchedOff={!coach?.enabled} /></div>}
                {step === 'walkins' && <div className="ob-hosted"><DayPassSettings /></div>}
                {step === 'refunds' && <div className="ob-hosted att"><RefundPolicyTab /></div>}
                {step === 'payments' && <div className="ob-hosted att"><OnlinePaymentsTab /></div>}
                {step === 'waiver' && <div className="ob-hosted att"><WaiverTab /></div>}
                {step === 'rules' && <div className="ob-hosted att"><HouseRulesTab /></div>}
                {step === 'team' && <TeamStep />}
                {step === 'equipment' && <EquipmentStep />}
                {step === 'rewards' && (<>
                  <div className="ob-hosted" data-points-name>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="ob-field"><span>Your points are called</span>
                        <input className="ob-in" maxLength={30} value={gym.points_name} placeholder="Points" onChange={(e) => setGym({ ...gym, points_name: e.target.value })} /></label>
                      <label className="ob-field"><span>In the middle of a sentence</span>
                        <input className="ob-in" maxLength={30} value={gym.points_name_short} placeholder="points" onChange={(e) => setGym({ ...gym, points_name_short: e.target.value })} /></label>
                    </div>
                  </div>
                  <RewardsStep pointsName={gym.points_name} />
                </>)}
                {step === 'members' && <MembersStep slug={savedSlug} joinCode={joinCode} />}

                {step === 'plans' && (<>
                  {plans.length === 0 && adding.length === 0 && <p className="ob-hint">No plans yet — add your first one below.</p>}
                  {[...plans.map((plan) => ({ kind: 'old' as const, plan })), ...adding.map((row, i) => ({ kind: 'new' as const, row, i }))].map((x) => {
                    const v = x.kind === 'old' ? edited[x.plan.id] : x.row;
                    const set = (patch: Partial<PlanDraft>) => (x.kind === 'old'
                      ? setEdited({ ...edited, [x.plan.id]: { ...edited[x.plan.id], ...patch } })
                      : setAdding(adding.map((r, n) => (n === x.i ? { ...r, ...patch } : r))));
                    const key = x.kind === 'old' ? x.plan.id : `new-${x.i}`;
                    return (
                      <div key={key} className="ob-choice" style={{ cursor: 'default', borderStyle: x.kind === 'new' ? 'dashed' : 'solid' }} data-plan-row>
                        <span className="ob-chap-icon" style={{ color: '#fff', background: x.kind === 'old' && x.plan.tier === 'free' ? 'var(--ob-fill)' : 'var(--ob-fill-2)', border: 0 }}>
                          <Tags size={16} /></span>
                        <div className="grid flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_130px_120px] items-end">
                          <label className="ob-field"><span>{x.kind === 'new' ? 'A new plan' : x.plan.tier === 'free' ? 'Free plan' : `Plan · ${peso(x.plan.price)} now`}</span>
                            <input className="ob-in" value={v?.name ?? ''} placeholder="Student rate" onChange={(e) => set({ name: e.target.value })} /></label>
                          <label className="ob-field"><span>Price (₱)</span><input className="ob-in" type="number" min={0} value={v?.price ?? ''} onChange={(e) => set({ price: e.target.value })} /></label>
                          <label className="ob-field"><span>Days</span><input className="ob-in" type="number" min={1} value={v?.days ?? ''} placeholder="never ends" onChange={(e) => set({ days: e.target.value })} /></label>
                        </div>
                        {x.kind === 'old'
                          ? (x.plan.tier !== 'free'
                            ? <button type="button" className="ob-iconbtn" aria-label={`Remove ${x.plan.name}`} onClick={() => void removePlan(x.plan)} style={{ alignSelf: 'flex-end' }}><Trash2 size={15} /></button>
                            : <span style={{ width: 38 }} aria-hidden />)
                          : <button type="button" className="ob-iconbtn" aria-label="Discard this new plan" onClick={() => setAdding(adding.filter((_, n) => n !== x.i))} style={{ alignSelf: 'flex-end' }}><Trash2 size={15} /></button>}
                      </div>
                    );
                  })}
                  <button type="button" className="ob-btn ghost" onClick={() => { tick(); setAdding([...adding, { name: '', price: '', days: '30' }]); }}><Tags size={15} />Add a plan</button>
                  <p className="ob-hint">A ₱0 plan is free; empty days means it never expires. Your free plan stays — it is where a member goes when a paid plan ends.</p>
                </>)}

                {step === 'door' && (<>
                  <label className="ob-field max-w-xl"><span>Your members&rsquo; link</span>
                    <div className="flex items-center gap-2"><span className="text-sm font-bold" style={{ color: 'var(--ob-muted)' }}>/join/</span>
                      <input className="ob-in" maxLength={40} value={slug} placeholder="your-gym" onChange={(e) => setSlug(e.target.value.toLowerCase())} /></div></label>
                  <p className="ob-hint" style={{ marginTop: -10 }}>Small letters, numbers and dashes. Get it right now — changing it later stops every link you handed out.</p>
                  <div className="grid gap-3">
                    {([
                      ['open', Globe, 'Anyone can find you', 'Listed in the app’s gym list and on the map. Anyone can ask to join.'],
                      ['code', KeyRound, 'Only with your link or code', 'Not listed. Members join with your link, or a short code you give them.'],
                      ['closed', Building2, 'Only at the front desk', 'Nobody asks to join from the app. Your desk makes every account, with a login slip.'],
                    ] as const).map(([key, I, title, blurb]) => (
                      <button key={key} type="button" className={`ob-choice ${door === key ? 'on' : ''}`} aria-pressed={door === key} onClick={() => { tick(); setDoor(key); }}>
                        <span className="ob-tick">{door === key && <Check size={13} />}</span>
                        <span className="min-w-0 flex-1"><span className="flex items-center gap-2 font-extrabold" style={{ color: 'var(--ob-ink)' }}><I size={16} />{title}</span>
                          <span className="block text-[12.5px] mt-1" style={{ color: 'var(--ob-sub)' }}>{blurb}</span></span>
                      </button>
                    ))}
                  </div>
                  {joinSet && <div className="ob-hosted"><JoinApproval policy={door} value={joinSet} onChange={setJoinSet} /></div>}
                  <p className="ob-hint">
                    {joinSet?.approval === 'auto' && door !== 'closed' ? 'Sign-ups start on your free plan straight away.' : 'However they arrive, you approve every sign-up.'}
                    {joinCode && door === 'code' && <> Your join code is <strong style={{ color: 'var(--ob-ink)', letterSpacing: '0.12em' }}>{joinCode}</strong>.</>}
                  </p>
                </>)}

                {step === 'password' && (
                  <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
                    <label className="ob-field"><span>New password</span><input type="password" className="ob-in" value={password.next} onChange={(e) => setPassword({ ...password, next: e.target.value })} /></label>
                    <label className="ob-field"><span>Type it again</span><input type="password" className="ob-in" value={password.again} onChange={(e) => setPassword({ ...password, again: e.target.value })} /></label>
                    <p className="ob-hint sm:col-span-2">At least 8 characters. The temporary password stops working.</p>
                  </div>
                )}

                {step === 'ready' && (<>
                  <div className="grid gap-3 sm:grid-cols-3" data-studio-summary>
                    {chapters.filter((ch) => ch.key !== 'open').map((ch) => {
                      const complete = ch.done === ch.list.length;
                      const CI = ch.icon;
                      return (
                        <div key={ch.key} className={`ob-choice ${complete ? 'on' : ''}`} style={{ cursor: 'default' }}>
                          <span className="ob-chap-icon" style={complete ? { color: '#fff', background: 'var(--ob-fill-2)', border: 0 } : undefined}>{complete ? <Check size={16} /> : <CI size={16} />}</span>
                          <span className="min-w-0"><span className="block font-extrabold" style={{ color: 'var(--ob-ink)' }}>{ch.title}</span>
                            <span className="block text-[12.5px]" style={{ color: 'var(--ob-sub)' }}>{complete ? 'Done' : `${ch.done} of ${ch.list.length} — finish any time`}</span></span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="ob-hosted flex flex-wrap items-center gap-5" style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1, color: 'var(--ob-ink)' }}>{pct}<span style={{ fontSize: 20 }}>%</span></div>
                    <div className="flex-1 min-w-[220px]">
                      <p className="font-extrabold" style={{ color: 'var(--ob-ink)' }}>{pct >= 100 ? 'Fully built.' : 'Built enough to open.'}</p>
                      <p className="ob-hint" style={{ marginTop: 2 }}>Everything you skipped works on the standard rules until you change it — each one is in the menu.</p>
                    </div>
                    <button type="button" className="ob-btn open" disabled={saving} onClick={() => void next()} data-open-gym><Rocket size={18} />{saving ? 'Opening…' : 'Open my gym'}</button>
                  </div>
                </>)}
              </div>
            </div>
          </div>

          {step !== 'ready' && (
            <div className="ob-foot">
              {index > 0 && <button type="button" className="ob-btn ghost" disabled={saving} onClick={() => { tick(); move(steps[index - 1].key, 'back'); }}><ArrowLeft size={16} />Back</button>}
              <span className="ob-key"><kbd>Enter</kbd> to continue</span>
              <span className="flex-1" />
              {current.optional && !selfSaving.includes(step) && (
                <button type="button" className="ob-btn ghost" disabled={saving} onClick={() => void next(true)}>Skip for now</button>
              )}
              <button type="button" className="ob-btn go" onClick={() => void next()} disabled={saving || uploading} data-studio-next>
                {saving ? 'Saving…' : selfSaving.includes(step) ? 'Continue' : 'Save and continue'}<ArrowRight size={17} className="arr" />
              </button>
            </div>
          )}
        </main>

        <StudioPreview name={gym.gym_name} shortName={gym.short_name} logoUrl={logoUrl} accent={gym.accent} action={action}
          pointsName={gym.points_name} welcome={gym.welcome_message}
          members={vocabWord('members', 'members')} coaches={vocabWord('trainers', 'coaches')} classes={vocabWord('classes', 'classes')}
          plans={[...plans.map((p) => ({ name: edited[p.id]?.name || p.name, price: Number(edited[p.id]?.price || p.price) || 0 }))]}
          hours={gym.opening_time && gym.closing_time ? `${gym.opening_time}–${gym.closing_time}` : ''} />
      </div>

      {/* ── the chapter-complete moment ── */}
      {burst && (
        <div className="ob-burst" aria-live="polite" data-chapter-burst>
          {Array.from({ length: 18 }, (_, i) => {
            const ang = (i / 18) * Math.PI * 2;
            const dist = 150 + (i % 3) * 50;
            return <span key={i} className="ob-spark" style={{ ['--x' as string]: `${Math.cos(ang) * dist}px`, ['--y' as string]: `${Math.sin(ang) * dist}px`,
              ['--r' as string]: `${(i * 47) % 360}deg`, ['--d' as string]: `${(i % 4) * 0.03}s`, ['--c' as string]: i % 2 ? 'var(--ob-fill)' : 'var(--ob-fill-2)' }} />;
          })}
          <div className="ob-burst-card"><small>Chapter complete</small><b>{burst}</b></div>
        </div>
      )}
    </div>
  );
}
