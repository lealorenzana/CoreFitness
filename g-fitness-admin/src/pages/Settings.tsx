import PageGuide from '../components/guides/PageGuide';
import StaffAccounts from '../components/staff/StaffAccounts';
import DeleteAccount from '../components/DeleteAccount';
import { setAccountStatus } from '../lib/api/accountEvents';
import { Component, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import './attendance/att.css';
import { Link, useSearchParams } from 'react-router-dom';
import PreferencesNav, { type PreferenceItem } from '../components/PreferencesNav';
import './preferences.css';
import WaiverTab from '../components/WaiverTab';
import HouseRulesTab from '../components/HouseRulesTab';
import BookingApproval from '../components/BookingApproval';
import CoachingSettings from '../components/CoachingSettings';
import GymLocationPicker from '../components/GymLocationPicker';
import DayPassSettings from '../components/DayPassSettings';
import DoorSettings from '../components/DoorSettings';
import WalkInGuide from '../components/WalkInGuide';
import Button from '../components/ui/Button';
import { getGymContext } from '../lib/gymContext';
import Avatar from '../components/ui/Avatar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import TimePicker from '../components/ui/TimePicker';
import { Download, User, Shield, Building2, UserPlus, Eye, EyeOff, Camera, Trash2, Check, Banknote, FileSignature, ScrollText, Smartphone, CalendarCheck, Handshake, Footprints, Clock, DoorOpen, Tag, Tags, ArrowUpRight, Palette, Phone, ListChecks, CircleCheck, CircleDashed, type LucideIcon } from 'lucide-react';
import OnlinePaymentsTab from '../components/OnlinePaymentsTab';
import { showToast } from '../utils/toast';
import {
  listRefundRules, updateRefundRule, getRefundFee, setRefundFee,
  type RefundRule, type RefundFee,
} from '../lib/api/refundRules';
import { supabase } from '../lib/supabaseClient';
import { updateProfile } from '../lib/api/profiles';
import { uploadMyAvatar, removeMyAvatar } from '../lib/api/avatars';
import { announceMyProfileChanged } from '../lib/api/profiles';
import ImageField from '../components/ui/ImageField';
import { publishBranding, DEFAULT_BRANDING } from '../hooks/useBranding';
import {
  getGymSettings, updateGymSettings, changePassword, listStaffAccounts,
} from '../lib/api/settings';
import type { ProfileRow, ProfileStatus } from '../types/db';
import { cropPhoto } from '../components/ui/PhotoCropper';
import { realEmail } from '../lib/api/logins';
import MyUsernameBox from '../components/MyUsernameBox';
import PlacePicker from '../components/ui/PlacePicker';
import GymStyles from '../components/GymStyles';
import TimeSlotsSettings from '../components/TimeSlotsSettings';
import BookingRulesSettings from '../components/BookingRulesSettings';
import ExportData from '../components/ExportData';
import SkelRows from '../components/ui/SkelRows';

/**
 * Admin settings — every tab here writes to the database.
 *
 * The previous version was localStorage throughout, and three parts of it were
 * actively misleading rather than merely fake:
 *
 *   - "Change password" did `localStorage.setItem('admin_password', next)`. It
 *     stored the new password in plaintext and never touched the real Supabase
 *     Auth credential, so an admin who rotated their password had changed
 *     nothing.
 *   - "Create admin account" wrote to `localStorage['admin_accounts']`. No auth
 *     user existed; the account could not log in.
 *   - A second membership-plans editor lived here, separate from the real
 *     /membership-plans page. Editing plans here reached nothing, while the real
 *     plans kept billing members.
 *
 * Also removed: Appearance, Notifications preferences and Backup & Data. All
 * three read and wrote localStorage keys that nothing else consumed — the theme
 * never changed, no notification setting was honoured, and "backup" exported
 * nothing. They are gone rather than left as buttons that appear to work.
 */

type TabId = 'export' | 'profile' | 'gym' | 'hours' | 'checkin' | 'bookings' | 'slots' | 'coaching' | 'walk-ins' | 'refunds' | 'payments' | 'waiver' | 'house-rules' | 'security' | 'staff';

const VIOLET = 'var(--color-primary)';
const TEXT_MUTED = 'var(--color-text-muted)';

/**
 * The left-hand list, grouped as the owner's approved mock-up groups it
 * (2026-10-25, outputs/supporting-docs/dashboard-mockups/account-v1.html).
 * `words` are what the search box matches besides the label. Plans is a link:
 * one editor only, on its own page.
 */
type Section = { group?: string; id?: TabId; href?: string; label: string; icon: LucideIcon; words: string[] };
const SECTIONS: Section[] = [
  { group: 'Your gym', label: '', icon: Building2, words: [] },
  { id: 'gym', label: 'Gym information', icon: Building2, words: ['name', 'address', 'phone', 'email', 'logo', 'map', 'pin', 'location', 'tagline'] },
  { id: 'hours', label: 'Hours and closed days', icon: Clock, words: ['open', 'close', 'hours', 'sunday', 'holiday'] },
  { id: 'checkin', label: 'Checking in', icon: DoorOpen, words: ['kiosk', 'qr', 'door', 'activities', 'check-in', 'coach'] },
  { id: 'house-rules', label: 'House rules', icon: ScrollText, words: ['rules', 'conduct'] },
  { id: 'waiver', label: 'Waiver', icon: FileSignature, words: ['par-q', 'health', 'sign', 'liability'] },
  { group: 'Members and money', label: '', icon: Building2, words: [] },
  { id: 'bookings', label: 'Bookings', icon: CalendarCheck, words: ['approve', 'class', 'booking', 'repeat', 'weekly', 'no-show', 'late', 'cancel', 'pause'] },
  { id: 'slots', label: 'Time slots', icon: Clock, words: ['slot', 'crowd', 'limit', 'capacity', 'reserve', 'floor'] },
  { id: 'coaching', label: 'Personal training', icon: Handshake, words: ['coach', 'trainer', '1-on-1', 'price'] },
  { id: 'walk-ins', label: 'Walk-ins', icon: Footprints, words: ['day pass', 'guest', 'visit pack'] },
  { id: 'refunds', label: 'Refunds', icon: Banknote, words: ['refund', 'cancel', 'fee'] },
  { id: 'payments', label: 'Online payments', icon: Smartphone, words: ['gcash', 'maya', 'qr', 'bank', 'pay'] },
  { href: '/membership-plans', label: 'Plans', icon: Tag, words: ['plan', 'price', 'membership'] },
  { group: 'Team and you', label: '', icon: Building2, words: [] },
  { id: 'staff', label: 'Staff accounts', icon: UserPlus, words: ['desk', 'staff', 'account', 'suspend'] },
  { id: 'profile', label: 'My profile', icon: User, words: ['photo', 'name', 'profile'] },
  { id: 'security', label: 'Security', icon: Shield, words: ['password'] },
  { id: 'export', label: 'Export your data', icon: Download, words: ['export', 'download', 'excel', 'csv', 'pdf', 'json', 'backup', 'data', 'spreadsheet'] },
];
const TAB_IDS = SECTIONS.filter((s) => s.id).map((s) => s.id as TabId);
const SETTINGS_ITEMS: PreferenceItem[] = [];
let settingsGroup = '';
for (const section of SECTIONS) {
  if (section.group) settingsGroup = section.group;
  else SETTINGS_ITEMS.push({ id: section.id ?? section.href!, label: section.label, icon: section.icon, group: settingsGroup, words: section.words, href: section.href });
}


/** "05:00:00" → "5:00 AM". */
const clock = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** What a password must clear, shown while it's being typed rather than after. */
function passwordChecks(pw: string) {
  return [
    { ok: pw.length >= 8, label: 'At least 8 characters' },
    { ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw), label: 'Upper and lower case' },
    { ok: /\d/.test(pw), label: 'A number' },
  ];
}

/** Map pin, a published waiver, a priced plan on sale — each read on its own, so one failure hides only its own line. */
async function loadSetup(): Promise<{ pinned: boolean | null; waiver: boolean | null; plans: boolean | null }> {
  const ctx = await getGymContext().catch(() => null);
  const [g, w, p] = await Promise.all([
    ctx ? supabase.from('gyms').select('latitude, longitude').eq('id', ctx.gymId).maybeSingle() : null,
    supabase.from('gym_waivers').select('id').not('published_at', 'is', null).limit(1),
    supabase.from('membership_plans').select('id').eq('is_active', true).gt('price', 0).limit(1),
  ]);
  return {
    pinned: !g || g.error ? null : g.data ? g.data.latitude != null && g.data.longitude != null : false,
    waiver: w.error ? null : (w.data ?? []).length > 0,
    plans: p.error ? null : (p.data ?? []).length > 0,
  };
}

/**
 * Each category keeps its own error boundary. Hidden categories stay mounted
 * so navigating between them preserves unfinished edits.
 */
class SectionGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.error('Settings section failed', err instanceof Error ? err.stack : err); }
  render() {
    return this.state.failed
      ? <p className="a-sub" role="alert" style={{ padding: '12px 0' }}>This section could not be shown. Reload the page to try again; nothing you saved is lost.</p>
      : this.props.children;
  }
}

export default function Settings() {
  /** Bumped when a gym style is applied, so Who approves bookings reads the new choice (0256). */
  const [styleTick, setStyleTick] = useState(0);
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') as TabId;
  const activeTab = TAB_IDS.includes(requested) ? requested : 'gym';
  const [loading, setLoading] = useState(true);
  const mainRef = useRef<HTMLDivElement>(null);
  const go = (id: TabId) => setParams((previous) => {
    const next = new URLSearchParams(previous);
    next.set('tab', id);
    next.delete('focus');
    return next;
  });
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
    // Leaflet may have mounted in a hidden category when following a deep link.
    if (activeTab === 'gym') {
      const frame = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
      return () => cancelAnimationFrame(frame);
    }
  }, [activeTab, loading]);
  const [saving, setSaving] = useState(false);

  const [me, setMe] = useState<ProfileRow | null>(null);
  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', phone: '' });

  const [activityOptions, setActivityOptions] = useState<string[]>([]);
  /** Days the gym is closed (0153), 0 = Sunday; null until loaded, or before 0153. */
  const [closedDays, setClosedDays] = useState<number[] | null>(null);
  const [newActivity, setNewActivity] = useState('');
  const [gymForm, setGymForm] = useState({
    gym_name: '', address: '', phone: '', email: '', opening_time: '', closing_time: '',
    // Branding (0067). Blank means "not chosen", which renders the bundled
    // default — never a blank space where a logo should be.
    short_name: '', tagline: '', logo_url: '',
  });

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);

  const [accounts, setAccounts] = useState<ProfileRow[]>([]);
  const [staffAction, setStaffAction] = useState<{ account: ProfileRow; next: ProfileStatus } | null>(null);

  /** Who last changed the gym information, and when — already stored, never shown. */
  const [gymAudit, setGymAudit] = useState<{ at: string; by: string | null } | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  /** The set-up checklist's facts that live outside gym_settings; null = could not be read, and the line is left out. */
  const [setup, setSetup] = useState<{ pinned: boolean | null; waiver: boolean | null; plans: boolean | null }>({ pinned: null, waiver: null, plans: null });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const [profileRes, gym, staff] = await Promise.all([
        user ? supabase.from('profiles').select('*').eq('id', user.id).single() : null,
        getGymSettings().catch(() => null),
        listStaffAccounts().catch(() => []),
      ]);

      const profile = (profileRes?.data ?? null) as ProfileRow | null;
      if (profile) {
        setMe(profile);
        setProfileForm({
          firstName: profile.first_name,
          lastName: profile.last_name,
          phone: profile.phone ?? '',
        });
      }
      if (gym) {
        setGymForm({
          gym_name: gym.gym_name ?? '',
          address: gym.address ?? '',
          phone: gym.phone ?? '',
          email: gym.email ?? '',
          opening_time: gym.opening_time ?? '',
          closing_time: gym.closing_time ?? '',
          short_name: gym.short_name ?? '',
          tagline: gym.tagline ?? '',
          logo_url: gym.logo_url ?? '',
        });
        setClosedDays(Array.isArray(gym.closed_days) ? gym.closed_days : null);
        setActivityOptions(gym.activity_options ?? []);
        setGymAudit({ at: gym.updated_at, by: gym.updated_by });
      }
      setAccounts(staff);
      void loadSetup().then(setSetup);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const handleSaveProfile = async () => {
    if (!me) return;
    if (!profileForm.firstName.trim() || !profileForm.lastName.trim()) {
      return showToast('First and last name are required', 'error');
    }
    setSaving(true);
    try {
      await updateProfile(me.id, {
        first_name: profileForm.firstName.trim(),
        last_name: profileForm.lastName.trim(),
        phone: profileForm.phone.trim() || null,
      });
      showToast('Profile updated', 'success');
      announceMyProfileChanged();
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGym = async () => {
    if (!gymForm.gym_name.trim()) return showToast('Gym name is required', 'error');
    // Closing before opening is a typo, not a policy. Equal times are refused too
    // — a zero-length day would flag every class as out-of-hours on Schedule.
    if (gymForm.opening_time && gymForm.closing_time && gymForm.closing_time <= gymForm.opening_time) {
      return showToast('Closing time must be after opening time', 'error');
    }
    setSaving(true);
    try {
      await updateGymSettings({
        gym_name: gymForm.gym_name.trim(),
        address: gymForm.address.trim() || null,
        phone: gymForm.phone.trim() || null,
        email: gymForm.email.trim() || null,
        opening_time: gymForm.opening_time.trim() || null,
        closing_time: gymForm.closing_time.trim() || null,
        // Only once 0153 is live (the column came back with the row); otherwise the
        // update would name a column that does not exist and fail the whole save.
        ...(closedDays !== null ? { closed_days: closedDays } : {}),
        short_name: gymForm.short_name.trim() || null,
        tagline: gymForm.tagline.trim() || null,
        logo_url: gymForm.logo_url.trim() || null,
        activity_options: activityOptions,
      });
      // Repaint the sidebar and header now rather than on the next full reload.
      // Saving a new gym name and watching the old one stay in the corner is
      // how an admin concludes the save did not work.
      publishBranding({
        gym_name: gymForm.gym_name.trim(),
        short_name: gymForm.short_name.trim() || null,
        tagline: gymForm.tagline.trim() || null,
        logo_url: gymForm.logo_url.trim() || null,
        address: gymForm.address.trim() || null,
      });
      showToast('Gym information saved', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save gym information', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!pw.current || !pw.next) return showToast('Enter your current and new password', 'error');
    if (pw.next.length < 8) return showToast('New password must be at least 8 characters', 'error');
    if (pw.next !== pw.confirm) return showToast('New passwords do not match', 'error');
    setSaving(true);
    try {
      await changePassword(pw.current, pw.next);
      setPw({ current: '', next: '', confirm: '' });
      showToast('Password changed. Use it next time you sign in.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to change password', 'error');
    } finally {
      setSaving(false);
    }
  };

  /**
   * The admin's own photo. Members and trainers have had this since 0021; the
   * admin was the only role that could not set one, so the header and every
   * "recorded by" surface fell back to initials forever.
   */
  const handlePhoto = async (raw: File | undefined) => {
    const file = raw ? await cropPhoto(raw, { aspect: 1, shape: 'round', title: 'Your profile photo' }) : null;
    if (!file) return;
    setUploadingPhoto(true);
    try {
      await uploadMyAvatar(file);
      showToast('Photo updated', 'success');
      announceMyProfileChanged();
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not upload that photo', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    setUploadingPhoto(true);
    try {
      await removeMyAvatar();
      showToast('Photo removed', 'success');
      announceMyProfileChanged();
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not remove that photo', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  /**
   * Suspend / reactivate / archive a staff account.
   *
   * A front-desk login takes payments and checks members in, so a colleague who
   * leaves keeping one is the same problem the trainer roster had. Nothing here
   * deletes: archive keeps every payment they recorded attributable.
   */
  const handleStaffStatus = async (reason?: string) => {
    if (!staffAction) return;
    const { account, next } = staffAction;
    try {
      // Same RPC as the member roster (0069). A staff login takes payments, so
      // "why was this account closed" is a question the gym will be asked.
      await setAccountStatus(account.id, next, reason);
      showToast(
        next === 'active'
          ? `${account.first_name} reactivated`
          : next === 'suspended'
            ? `${account.first_name} suspended: they can no longer sign in`
            : `${account.first_name} archived`,
        'success'
      );
      setStaffAction(null);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update that account', 'error');
    }
  };

  // ---- what the right-hand column says ------------------------------------------------------
  const infoMissing = [
    !gymForm.address.trim() && 'Address',
    !gymForm.phone.trim() && 'Phone',
    !gymForm.email.trim() && 'Email for members',
    setup.pinned === false && 'Map pin',
  ].filter(Boolean) as string[];
  const checklist: { ok: boolean; label: string; why: string; go?: TabId; href?: string }[] = [
    { ok: !!gymForm.address.trim(), label: 'Address', why: 'members and receipts have no address to show', go: 'gym' },
    { ok: !!gymForm.phone.trim(), label: 'Phone', why: 'receipts have no contact number', go: 'gym' },
    { ok: !!gymForm.email.trim(), label: 'Email for members', why: 'members have no email to write to', go: 'gym' },
    { ok: !!(gymForm.opening_time && gymForm.closing_time), label: 'Opening hours', why: 'members cannot see when you are open', go: 'hours' },
    { ok: !!gymForm.logo_url.trim(), label: 'Logo', why: 'members see the Core Fitness mark instead', go: 'gym' },
    ...(setup.pinned === null ? [] : [{ ok: setup.pinned, label: 'Map pin', why: 'you are not on the Find a gym map', go: 'gym' as TabId }]),
    ...(setup.waiver === null ? [] : [{ ok: setup.waiver, label: 'Waiver published', why: 'members sign nothing before booking', go: 'waiver' as TabId }]),
    ...(setup.plans === null ? [] : [{ ok: setup.plans, label: 'Plans have prices', why: 'only free plans are on sale', href: '/membership-plans' }]),
  ];
  const done = checklist.filter((c) => c.ok).length;
  const pct = checklist.length ? Math.round((done / checklist.length) * 100) : 0;
  const openNow = (() => {
    if (!gymForm.opening_time || !gymForm.closing_time) return null;
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    if (closedDays?.includes(now.getDay())) return { open: false, line: 'closed today' };
    const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const open = hm >= gymForm.opening_time.slice(0, 5) && hm < gymForm.closing_time.slice(0, 5);
    return { open, line: open ? `closes ${clock(gymForm.closing_time)}` : `opens ${clock(gymForm.opening_time)}` };
  })();

  const head = (title: string, sub: string, pill?: ReactNode) => (
    <div className="a-ct" style={{ alignItems: 'flex-start' }}>
      <div><h3 style={{ fontSize: 16 }}>{title}</h3><div className="a-sub" style={{ marginTop: 2, whiteSpace: 'normal' }}>{sub}</div></div>{pill}
    </div>
  );

  return (
    <div className="att preferences" data-settings>
      <header className="preferences-header">
        <div><h1>Settings</h1><p>Your gym, your team, and the way things work.</p></div>
        <Link to="/gym-app" className="preferences-header-link"><Palette size={14} />Customize your app<ArrowUpRight size={13} /></Link>
      </header>
      <div className="preferences-layout">
        <PreferencesNav items={SETTINGS_ITEMS} active={activeTab} onSelect={(id) => go(id as TabId)} label="Settings sections"
          footer={<><p>Colours, words, and member features</p><Link to="/gym-app">Live on Your app<ArrowUpRight size={12} /></Link></>} />
        <div className="preferences-content st-main" ref={mainRef}>
          {loading ? <SkelRows label="Loading…" /> : (
            <>
              <section className="st-sec" data-ya-sec="gym" id="st-gym" hidden={activeTab !== 'gym'}><SectionGuard>{(
                <>
                  {head('Gym information', 'Shown on the sign-up page, receipts, the legal pages and the gym map',
                    <span className="settings-gym-status">{infoMissing.length > 0 ? `${infoMissing.length} ${infoMissing.length === 1 ? 'detail' : 'details'} to complete` : 'Gym details complete'}</span>)}
                  <div className="a-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="a-fld"><label htmlFor="g-name">Gym name</label>
                      <input id="g-name" className="a-in" value={gymForm.gym_name} onChange={(e) => setGymForm({ ...gymForm, gym_name: e.target.value })} /></div>
                    <div className="a-fld"><label htmlFor="g-short">Short name <span style={{ fontWeight: 500 }}>· for small spaces</span></label>
                      <input id="g-short" className="a-in" value={gymForm.short_name} placeholder={DEFAULT_BRANDING.shortName} onChange={(e) => setGymForm({ ...gymForm, short_name: e.target.value })} /></div>
                    <div className="a-fld" style={{ gridColumn: '1 / -1' }}><label>Address {!gymForm.address.trim() && <span style={{ color: 'var(--a-a300)' }}>· missing</span>}</label>
                      <PlacePicker value={gymForm.address} inputClass="a-in" inputStyle={{}} onChange={(v) => setGymForm({ ...gymForm, address: v })} /></div>
                    <div className="a-fld"><label htmlFor="g-phone">Phone {!gymForm.phone.trim() && <span style={{ color: 'var(--a-a300)' }}>· missing</span>}</label>
                      <input id="g-phone" className={`a-in ${gymForm.phone.trim() ? '' : 'warn'}`} value={gymForm.phone} placeholder="+63 900 000 0000" onChange={(e) => setGymForm({ ...gymForm, phone: e.target.value })} /></div>
                    <div className="a-fld"><label htmlFor="g-email">Email for members {!gymForm.email.trim() && <span style={{ color: 'var(--a-a300)' }}>· missing</span>}</label>
                      <input id="g-email" type="email" className={`a-in ${gymForm.email.trim() ? '' : 'warn'}`} value={gymForm.email} placeholder="desk@yourgym.com" onChange={(e) => setGymForm({ ...gymForm, email: e.target.value })} /></div>
                    <div className="a-fld" style={{ gridColumn: '1 / -1' }}><label htmlFor="g-tagline">Tagline <span style={{ fontWeight: 500 }}>· the small line under the name, blank hides it</span></label>
                      <input id="g-tagline" className="a-in" value={gymForm.tagline} placeholder={DEFAULT_BRANDING.tagline ?? ''} onChange={(e) => setGymForm({ ...gymForm, tagline: e.target.value })} /></div>
                  </div>
                  <div className="settings-logo-row">
                    <ImageField value={gymForm.logo_url} onChange={(logo_url) => setGymForm({ ...gymForm, logo_url })} kind="logos" label="Logo" aspect={1}
                      hint="Square works best: it shows in a circle." />
                    <div className="a-hint"><Palette size={15} /><span>The two colours in your members' app live on <Link to="/gym-app" style={{ color: 'var(--a-p300)' }}>Your app</Link>, alongside your words and what you run.</span></div>
                  </div>
                  <div style={{ marginTop: 14 }} id="location"
                    ref={(el) => { if (el && window.location.hash === '#location') setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300); }}>
                    <GymLocationPicker />
                  </div>
                  {gymAudit && (
                    <p className="a-sub" style={{ marginTop: 10 }}>
                      Last changed {new Date(gymAudit.at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                      {gymAudit.by === me?.id ? ' by you' : gymAudit.by ? ` by ${accounts.find((a) => a.id === gymAudit.by)?.first_name ?? 'another admin'}` : ''}
                    </p>
                  )}
                  <button type="button" className="a-btn violet" style={{ marginTop: 14, alignSelf: 'flex-end' }} onClick={() => void handleSaveGym()} disabled={saving}>
                    <Check size={15} />{saving ? 'Saving…' : 'Save'}
                  </button>
                  <details className="settings-overview">
                    <summary>Member preview and setup checklist · {pct}% complete</summary>
                    <div className="settings-overview-content">
                      <section>
                        <h3 className="settings-summary-title">What members see</h3>
                        <div className="a-phcard"><b>{gymForm.gym_name || 'Your gym'}</b>
                          {gymForm.address.trim() && <div className="a-sub">{gymForm.address}</div>}
                          {openNow && <div className="a-sub"><span style={{ color: openNow.open ? 'var(--a-p300)' : 'var(--a-a300)' }}>{openNow.open ? 'Open now' : 'Closed now'}</span> · {openNow.line}</div>}
                          {gymForm.phone.trim() && <div className="a-sub flex items-center gap-1"><Phone size={11} />{gymForm.phone}</div>}
                        </div>
                        <p className="a-sub">Shown on Today, the join page, and receipts.</p>
                      </section>
                      <section data-setup-checklist>
                        <h3 className="settings-summary-title"><ListChecks size={15} />Your gym is {pct}% set up</h3>
                        <div className="a-meter"><i style={{ width: `${pct}%` }} /></div>
                        {checklist.map((item) => <div key={item.label} className="a-row">
                          {item.ok ? <CircleCheck size={15} style={{ color: 'var(--a-p300)' }} /> : <CircleDashed size={15} style={{ color: 'var(--a-muted)' }} />}
                          <div className="t"><b>{item.label}</b>{!item.ok && <small>{item.why}</small>}</div>
                          {!item.ok && item.href && <Link to={item.href} className="a-link">Fix</Link>}
                          {!item.ok && item.go && item.go !== activeTab && <button type="button" className="a-link" onClick={() => go(item.go!)}>Fix</button>}
                        </div>)}
                      </section>
                    </div>
                  </details>

                </>
              )
              }</SectionGuard></section>
              <section className="st-sec" data-ya-sec="hours" id="st-hours" hidden={activeTab !== 'hours'}><SectionGuard>{(
                <>
                  {head('Hours and closed days', 'Members see whether you are open now; classes outside these hours are flagged on Schedule')}
                  <div className="a-setting">
                    <div className="t"><b>Every open day</b><small>one set of hours for the days you open</small></div>
                    <div style={{ width: 130 }}><TimePicker value={gymForm.opening_time.slice(0, 5)} onChange={(val) => setGymForm({ ...gymForm, opening_time: val })} /></div>
                    <span className="a-sub">to</span>
                    <div style={{ width: 130 }}><TimePicker value={gymForm.closing_time.slice(0, 5)} onChange={(val) => setGymForm({ ...gymForm, closing_time: val })} /></div>
                  </div>
                  {gymForm.opening_time && gymForm.closing_time && gymForm.closing_time <= gymForm.opening_time && (
                    <p className="a-sub" style={{ color: 'var(--a-a300)' }}>Closing must be after opening.</p>
                  )}
                  {closedDays !== null && (
                    <div role="group" aria-label="Days the gym is closed" style={{ marginTop: 6 }}>
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, k) => {
                        const d = (k + 1) % 7;   // 0 = Sunday, as the database stores it
                        const closed = closedDays.includes(d);
                        return (
                          <div key={label} className="a-setting">
                            <div className="t"><b>{label}</b><small>{closed ? 'closed' : gymForm.opening_time && gymForm.closing_time ? `${clock(gymForm.opening_time)} – ${clock(gymForm.closing_time)}` : 'open'}</small></div>
                            <button type="button" className={`a-toggle ${closed ? 'off' : ''}`} aria-label={label} aria-pressed={closed}
                              data-tip={closed ? `Open on ${label}` : `Closed on ${label}`}
                              disabled={!closed && closedDays.length >= 6}
                              onClick={() => setClosedDays(closed ? closedDays.filter((x) => x !== d) : [...closedDays, d])} />
                          </div>
                        );
                      })}
                      <p className="a-sub" style={{ marginTop: 6 }}>Members' streaks never count a closed day as a day left to train, so nobody is told to come in when you are shut.</p>
                    </div>
                  )}
                  <button type="button" className="a-btn violet" style={{ marginTop: 14, alignSelf: 'flex-end' }} onClick={() => void handleSaveGym()} disabled={saving}>
                    <Check size={15} />{saving ? 'Saving…' : 'Save hours'}
                  </button>
                </>
              )
              }</SectionGuard></section>
              <section className="st-sec" data-ya-sec="checkin" id="st-checkin" hidden={activeTab !== 'checkin'}><SectionGuard>{(
                <>
                  {head('Checking in', 'How members and coaches get in, and what a check-in can be tagged with')}
                  <div style={{ margin: '0 0 10px' }}><PageGuide id="door-checkin" /> <PageGuide id="kiosk" label="Set up the kiosk" /></div>
                  <div id="checking-in"><DoorSettings /></div>
                  <div className="a-ct" style={{ marginTop: 16 }}><h3><Tags size={16} />Check-in activities</h3></div>
                  <p className="a-sub">What the front desk can tag a check-in with: and what members pick from on their QR screen. Members can always check in without one.</p>
                  <div className="flex flex-wrap gap-1.5" style={{ marginTop: 8 }}>
                    {activityOptions.map((opt) => (
                      <span key={opt} className="a-chip on">{opt}
                        <button type="button" onClick={() => setActivityOptions(activityOptions.filter((x) => x !== opt))} aria-label={`Remove ${opt}`} data-tip={`Remove ${opt}`}>×</button></span>
                    ))}
                    {activityOptions.length === 0 && <span className="a-sub">None: the picker is hidden at check-in.</span>}
                  </div>
                  <input className="a-in" style={{ marginTop: 8 }} value={newActivity} onChange={(e) => setNewActivity(e.target.value)} placeholder="Add an activity, then press Enter"
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      const val = newActivity.trim();
                      if (val && !activityOptions.includes(val)) setActivityOptions([...activityOptions, val]);
                      setNewActivity('');
                    }} />
                  <button type="button" className="a-btn violet" style={{ marginTop: 14, alignSelf: 'flex-end' }} onClick={() => void handleSaveGym()} disabled={saving}>
                    <Check size={15} />{saving ? 'Saving…' : 'Save activities'}
                  </button>
                </>
              )
              }</SectionGuard></section>
              <section className="st-sec" data-ya-sec="slots" id="st-slots" hidden={activeTab !== 'slots'}><SectionGuard>{<>{head('Time slots', 'Members book a time to come in, and you cap how many train at once: every rule is yours')}<TimeSlotsSettings /></>
              }</SectionGuard></section>
              <section className="st-sec" data-ya-sec="bookings" id="st-bookings" hidden={activeTab !== 'bookings'}><SectionGuard>{<>
                {head('How your gym works', 'Your gym’s style sets the booking and coaching settings below: you can still change each one')}
                <GymStyles onApplied={() => setStyleTick((n) => n + 1)} />
                <div style={{ height: 22 }} />
                {head('Bookings', 'Who approves bookings: for group classes and 1-on-1 sessions separately')}<BookingApproval key={styleTick} />
                <div style={{ height: 22 }} />
                {head('Repeats, late cancels and no-shows', 'Your rules for weekly bookings, cancelling close to the start, and members who do not come')}<BookingRulesSettings />
              </>
              }</SectionGuard></section>
              <section className="st-sec" data-ya-sec="coaching" id="st-coaching" hidden={activeTab !== 'coaching'}><SectionGuard>{<>{head('Personal training', 'How members get a coach, for how long, and who is paid')}<CoachingSettings /></>
              }</SectionGuard></section>
              <section className="st-sec" data-ya-sec="walk-ins" id="st-walk-ins" hidden={activeTab !== 'walk-ins'}><SectionGuard>{(
                <>
                  {head('Walk-ins', 'For people without a membership: paid in cash at the desk (Attendance → Walk-ins) or, if you take payments in the app, bought by the member themselves')}
                  <div style={{ margin: '0 0 10px' }}><PageGuide id="day-pass" /></div>
                  <WalkInGuide open />
                  <DayPassSettings />
                </>
              )
              }</SectionGuard></section>
              <section className="st-sec" data-ya-sec="refunds" id="st-refunds" hidden={activeTab !== 'refunds'}><SectionGuard>{<>{head('Refunds', 'Set the minimum refund and any documented processing fee.')}<RefundPolicyTab /></>
              }</SectionGuard></section>
              <section className="st-sec" data-ya-sec="payments" id="st-payments" hidden={activeTab !== 'payments'}><SectionGuard>{<>{head('Online payments', 'Manage how members pay your gym online.')}<OnlinePaymentsTab /></>
              }</SectionGuard></section>
              <section className="st-sec" data-ya-sec="waiver" id="st-waiver" hidden={activeTab !== 'waiver'}><SectionGuard>{<><div style={{ margin: '0 0 10px' }}><PageGuide id="waiver" /></div><WaiverTab /></>
              }</SectionGuard></section>
              <section className="st-sec" data-ya-sec="house-rules" id="st-house-rules" hidden={activeTab !== 'house-rules'}><SectionGuard>{<HouseRulesTab />
              }</SectionGuard></section>
              <section className="st-sec" data-ya-sec="staff" id="st-staff" hidden={activeTab !== 'staff'}><SectionGuard>{(
                <StaffAccounts accounts={accounts} meId={me?.id ?? null} onStatus={(account, next) => setStaffAction({ account, next })} onChanged={load} />
              )
              }</SectionGuard></section>
              <section className="st-sec" data-ya-sec="profile" id="st-profile" hidden={activeTab !== 'profile'}><SectionGuard>{(
                <>
                  {head('My profile', `Signed in as ${realEmail(me?.email) ?? (me?.username ? `@${me.username}` : '')} · ${me?.role ?? ''}`)}
                  <div className="flex items-center gap-4" style={{ marginBottom: 12 }}>
                    <div className="relative flex-shrink-0">
                      <Avatar name={`${me?.first_name ?? ''} ${me?.last_name ?? ''}`} photoUrl={me?.photo_url ?? null} size={56} />
                      <label data-tip="Change photo" className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center cursor-pointer"
                        style={{ background: 'var(--a-primary)', color: '#fff', opacity: uploadingPhoto ? 0.5 : 1 }}>
                        <Camera size={11} />
                        <input type="file" accept="image/*" className="hidden" disabled={uploadingPhoto} onChange={(e) => handlePhoto(e.target.files?.[0])} />
                      </label>
                    </div>
                    {me?.photo_url && (
                      <button type="button" className="a-btn ghost sm" onClick={handleRemovePhoto} disabled={uploadingPhoto}><Trash2 size={12} />Remove photo</button>
                    )}
                  </div>
                  <MyUsernameBox />
                  <div className="a-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="a-fld"><label htmlFor="p-first">First name</label>
                      <input id="p-first" className="a-in" value={profileForm.firstName} onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })} /></div>
                    <div className="a-fld"><label htmlFor="p-last">Last name</label>
                      <input id="p-last" className="a-in" value={profileForm.lastName} onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })} /></div>
                    <div className="a-fld" style={{ gridColumn: '1 / -1' }}><label htmlFor="p-phone">Phone</label>
                      <input id="p-phone" className="a-in" value={profileForm.phone} placeholder="+63 900 000 0000" onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} /></div>
                  </div>
                  <p className="a-sub" style={{ marginTop: 8 }}>Email and role are not editable here: changing either affects sign-in and access.</p>
                  <button type="button" className="a-btn violet" style={{ marginTop: 14, alignSelf: 'flex-end' }} onClick={handleSaveProfile} disabled={saving}>
                    {saving ? 'Saving…' : 'Save Profile'}
                  </button>
                  <DeleteAccount />
                </>
              )
              }</SectionGuard></section>
              <section className="st-sec" data-ya-sec="security" id="st-security" hidden={activeTab !== 'security'}><SectionGuard>{(
                <>
                  {head('Security', 'Changes your real sign-in password')}
                  <div className="a-grid" style={{ gap: 10, maxWidth: 420 }}>
                    {/* The account's own username for password managers, so they never fill one into another box. */}
                    <input type="text" name="username" autoComplete="username" value={me?.email ?? ''} readOnly hidden />
                    {([['current', 'Current password'], ['next', 'New password'], ['confirm', 'Confirm new password']] as const).map(([k, label]) => (
                      <div key={k} className="a-fld"><label htmlFor={'pw-' + k}>{label}</label>
                        <input id={'pw-' + k} autoComplete={k === 'current' ? 'current-password' : 'new-password'} className={`a-in ${k === 'confirm' && pw.confirm && pw.confirm !== pw.next ? 'warn' : ''}`} type={showPw ? 'text' : 'password'}
                          value={pw[k]} onChange={(e) => setPw({ ...pw, [k]: e.target.value })} /></div>
                    ))}
                  </div>
                  {pw.confirm && pw.confirm !== pw.next && <p className="a-sub" style={{ color: 'var(--a-a300)', marginTop: 4 }}>Does not match.</p>}
                  {/* Requirements while typing rather than a rejection after submitting. */}
                  {pw.next.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {passwordChecks(pw.next).map((c) => (
                        <p key={c.label} className="a-sub flex items-center gap-1.5" style={{ color: c.ok ? 'var(--a-p300)' : undefined }}>
                          <Check size={11} style={{ opacity: c.ok ? 1 : 0.3 }} /> {c.label}
                        </p>
                      ))}
                    </div>
                  )}
                  <button type="button" className="a-link flex items-center gap-1.5" style={{ marginTop: 8 }} onClick={() => setShowPw(!showPw)}>
                    {showPw ? <EyeOff size={12} /> : <Eye size={12} />} {showPw ? 'Hide' : 'Show'} passwords
                  </button>
                  <p className="a-sub" style={{ marginTop: 6 }}>Changing this signs you out of nothing: but you will need the new password next time.</p>
                  <button type="button" className="a-btn violet" style={{ marginTop: 14, alignSelf: 'flex-end' }} onClick={handleChangePassword} disabled={saving}>
                    {saving ? 'Changing…' : 'Change Password'}
                  </button>
                </>
              )
              }</SectionGuard></section>
              {/* Export your data (owner, 2026-11-23): choose the records and the file, then download them. */}
              <section className="st-sec" data-ya-sec="export" id="st-export" hidden={activeTab !== 'export'}><SectionGuard>{<>
                {head('Export your data', 'Your gym’s records, in the file you choose: choose what goes, then download it')}
                <ExportData />
              </>}</SectionGuard></section>
            </>
          )}
        </div>

      </div>

      <ConfirmDialog
        isOpen={!!staffAction}
        onClose={() => setStaffAction(null)}
        onConfirm={handleStaffStatus}
        title={
          staffAction?.next === 'active' ? 'Reactivate Account'
            : staffAction?.next === 'suspended' ? 'Suspend Account'
              : 'Archive Account'
        }
        message={
          staffAction
            ? staffAction.next === 'active'
              ? `Let ${staffAction.account.first_name} sign in again? They get their front-desk access back immediately.`
              : staffAction.next === 'suspended'
                ? `Suspend ${staffAction.account.first_name}? A front-desk login takes payments and checks members in, so this stops both at once. Every payment they have already recorded stays exactly as it is, and this is reversible.`
                : `Archive ${staffAction.account.first_name}? They drop off this list and can no longer sign in. Nothing they recorded is deleted: every payment stays attributable to them.`
            : ''
        }
        confirmText={
          staffAction?.next === 'active' ? 'Reactivate'
            : staffAction?.next === 'suspended' ? 'Suspend' : 'Archive'
        }
        type={staffAction?.next === 'active' ? 'info' : staffAction?.next === 'suspended' ? 'warning' : 'danger'}
        reason={
          staffAction?.next === 'active'
            ? { label: 'Note (optional)', placeholder: 'Back from leave.' }
            : { label: staffAction?.next === 'suspended' ? 'Reason for suspension' : 'Reason for archiving',
                required: true,
                placeholder: 'Left the gym on 30 September.',
                hint: 'Kept on the account history, alongside every payment they recorded.' }
        }
      />
    </div>
  );
}

/**
 * The refund policy, editable.
 *
 * ## What an admin needs to understand before touching this
 *
 * These percentages are a **floor**, not the payout. Since migration 0073 the
 * refund is `max(pro-rata for the unused term, the tier here)` less a
 * documented fee, because the Consumer Act expects pro-rata on a prepaid
 * membership and a gym may be more generous than the law but not less.
 *
 * So lowering a number here does not reduce what a member receives below the
 * pro-rata share — it only reduces how generous the gym is on top of it. That
 * is genuinely surprising, so the screen says it rather than leaving somebody
 * to discover it from a quote that ignored their edit.
 */
/** Settings → Refunds; also the onboarding's refunds step (2026-11-07). */
export function RefundPolicyTab() {
  const [rules, setRules] = useState<RefundRule[] | null>(null);
  const [fee, setFee] = useState<RefundFee | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [feeDraft, setFeeDraft] = useState('');
  const [feeReason, setFeeReason] = useState('');

  const load = useCallback(async () => {
    try {
      const [r, f] = await Promise.all([listRefundRules(), getRefundFee()]);
      setRules(r);
      setFee(f);
      setFeeDraft(String(f.amount));
      setFeeReason(f.reason ?? '');
    } catch {
      setFailed(true);
    }
  }, []);

  // Wrapped rather than `void load()`: the lint rule traces a directly called
  // function into its setState calls and reports the set-state-in-effect
  // cascade, even though every one here is behind an await.
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const savePercent = async (rule: RefundRule, raw: string) => {
    const pct = Number(raw);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      showToast('A percentage has to be between 0 and 100.', 'error');
      return;
    }
    if (pct === rule.percent) return;
    setSaving(rule.id);
    try {
      await updateRefundRule(rule.id, { percent: pct });
      setRules((prev) => prev?.map((r) => (r.id === rule.id ? { ...r, percent: pct } : r)) ?? null);
      showToast('Refund rule updated.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save that rule', 'error');
    } finally {
      setSaving(null);
    }
  };

  const saveFee = async () => {
    const amount = Number(feeDraft);
    if (!Number.isFinite(amount) || amount < 0) {
      showToast('A fee has to be zero or more.', 'error');
      return;
    }
    setSaving('fee');
    try {
      await setRefundFee(amount, feeReason);
      setFee({ amount, reason: amount > 0 ? feeReason.trim() : null });
      showToast('Processing fee saved.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save the fee', 'error');
    } finally {
      setSaving(null);
    }
  };

  // A failed read says so. An empty policy table would read as "this gym
  // refunds nothing", which is both false and the opposite of the law.
  if (failed) {
    return (
      <div className="rounded-xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <p className="text-sm" style={{ color: 'var(--color-secondary)' }}>
          Could not load the refund policy. It has not been changed.
        </p>
      </div>
    );
  }

  if (rules === null || fee === null) {
    return <SkelRows label="Loading refund policy…" />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4"
        style={{ background: 'var(--color-primary-light)', border: '1px solid var(--color-primary)' }}>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          <span className="font-semibold" style={{ color: VIOLET }}>These are a minimum, not the payout.</span>{' '}
          A refund is the <em>higher</em> of the unused part of the term and the percentage below —
          the Consumer Act expects the unused portion back, and the gym can be more generous than
          that but not less. Lowering a number here reduces how generous the gym is, never what a
          member is legally owed.
        </p>
      </div>

      <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <h2 className="text-sm font-bold text-white">When a member cancels</h2>

        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-lg p-3 flex items-start gap-3"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white leading-relaxed">{rule.label}</p>
                <p className="text-[10px] mt-1" style={{ color: TEXT_MUTED }}>
                  {rule.max_days == null
                    ? `From day ${rule.min_days} onwards`
                    : `Days ${rule.min_days}–${rule.max_days}`}
                  {rule.requires_visits === true && ' · only if they have visited'}
                  {rule.requires_visits === false && ' · only if they have not visited'}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <input
                  type="number" min={0} max={100}
                  defaultValue={rule.percent}
                  disabled={saving === rule.id}
                  onBlur={(e) => void savePercent(rule, e.target.value)}
                  className="w-16 h-8 px-2 rounded-lg text-xs font-semibold text-white text-center"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                />
                <span className="text-xs" style={{ color: TEXT_MUTED }}>%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <h2 className="text-sm font-bold text-white">Processing fee</h2>
        <p className="text-xs" style={{ color: TEXT_MUTED }}>
          Deducted from every refund. Leave it at zero unless there is a real cost you can name —
          the law allows only reasonable, documented deductions, and an unexplained one is the kind
          of term that gets thrown out.
        </p>
        <div className="flex gap-2 items-start">
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-xs" style={{ color: TEXT_MUTED }}>₱</span>
            <input
              type="number" min={0} value={feeDraft}
              onChange={(e) => setFeeDraft(e.target.value)}
              className="w-24 h-9 px-2 rounded-lg text-xs font-semibold text-white text-center"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
            />
          </div>
          <input
            value={feeReason}
            onChange={(e) => setFeeReason(e.target.value)}
            placeholder="What it covers, e.g. cash handling and receipt reprint"
            className="flex-1 h-9 px-3 rounded-lg text-xs text-white"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
          />
          <Button variant="primary" onClick={() => void saveFee()} disabled={saving === 'fee'}>
            {saving === 'fee' ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
