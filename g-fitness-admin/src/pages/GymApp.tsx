import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  Bell, Bot, Building2, Calendar, Camera, Check, Coins, Copy, CreditCard, DoorOpen, Dumbbell, Flag, Globe, HeartHandshake, Image,
  Lock, MessageSquare, NotebookPen, Palette, Printer, QrCode, RefreshCw, Salad, Share2, ShoppingBag, Smartphone, Sparkles,
  ToggleRight, Trophy, Tv, Type, UserCheck, UserPlus, Users, type LucideIcon,
} from 'lucide-react';
import './attendance/att.css';
import { showToast } from '../utils/toast';
import {
  getGymApp, getGymModules,
  saveGymLook, saveGymVocabulary, saveGymWords, setGymModule, setGymSlug, setJoinPolicy,
  getJoinSettings, setJoinSettings,
  type GymApp as App, type GymModule, type GymVocabulary, type JoinPolicy, type JoinSettings,
} from '../lib/api/gymApp';
import { rampFor } from '../lib/gymTheme';
import { GROUPS, PAIRS, gradientOf } from '../lib/themePairs';
import ColourRolePicker from '../components/ColourRolePicker';
import { refreshGymModules } from '../hooks/useGymModules';
import { uploadMedia } from '../lib/api/media';
import { refreshGymWords } from '../hooks/useGymWords';
import JoinPoster from '../components/JoinPoster';
import CoachTab from '../components/yourapp/CoachTab';
import PayTab from '../components/yourapp/PayTab';
import TvTab from '../components/yourapp/TvTab';
import SavedThemes from '../components/yourapp/SavedThemes';

const MEMBER_APP = 'https://corefitness-gym.vercel.app';

/**
 * Your app — what this gym's members see, in this gym's words (0110–0114,
 * 0141, 0147, 0179, 0189, 0191, 0192). Rebuilt 2026-10-25 to the owner's
 * approved mock-up (outputs/supporting-docs/dashboard-mockups/yourapp-v1.html):
 * six tabs, each a settings card beside a phone that shows the change.
 *
 *   Look          two colour roles, ready-made pairs and a logo
 *   Words         the gym's own words for its points, its people and its welcome
 *   What you run  which parts of the system this gym actually uses
 *   Joining       listed, by code, or only at the desk; approval; age; the link
 *   AI coach      limits, this month's totals, buying more (where the plan sells it)
 *   Payments      the gym's own PayMongo account
 *   Lobby TV      the screen on the gym's wall, in its own design (0209)
 *
 * The phones draw sample screens and say so; every colour and word on them is
 * the gym's own. "What you run" shows a lock, not a switch, for what the gym's
 * Core Fitness plan does not include — a switch that would be refused is a
 * control writing a flag nothing honours (CLAUDE.md).
 */
const APP_TABS: [AppTab, string, LucideIcon][] = [
  ['look', 'Look', Palette], ['words', 'Words', Type], ['runs', 'What you run', ToggleRight],
  ['join', 'Joining', DoorOpen], ['coach', 'AI coach', Bot], ['pay', 'Payments', CreditCard], ['tv', 'Lobby TV', Tv],
];
type AppTab = 'look' | 'words' | 'runs' | 'coach' | 'join' | 'pay' | 'tv';

/** A kind of gym fills the six nouns in one tap; nothing is stored until Save. */
const KINDS: { name: string; v: GymVocabulary }[] = [
  { name: 'Gym', v: { trainer: 'coach', trainers: 'coaches', member: 'member', members: 'members', class: 'class', classes: 'classes' } },
  { name: 'Boxing gym', v: { trainer: 'trainer', trainers: 'trainers', member: 'boxer', members: 'boxers', class: 'class', classes: 'classes' } },
  { name: 'Yoga studio', v: { trainer: 'instructor', trainers: 'instructors', member: 'student', members: 'students', class: 'class', classes: 'classes' } },
  { name: 'CrossFit box', v: { trainer: 'coach', trainers: 'coaches', member: 'athlete', members: 'athletes', class: 'WOD', classes: 'WODs' } },
  { name: 'Martial arts', v: { trainer: 'instructor', trainers: 'instructors', member: 'student', members: 'students', class: 'session', classes: 'sessions' } },
];

const MODULE_ICONS: Record<string, LucideIcon> = {
  classes: Calendar, coaching: HeartHandshake, progress: NotebookPen, workouts: NotebookPen, photos: Camera, progress_photos: Camera,
  meals: Salad, meal_plans: Salad, engagement: Coins, points: Coins, challenges: Flag, squads: Users, seasons: Trophy,
  shop: ShoppingBag, referrals: UserPlus, push: Bell, assistant: Bot, rooms: MessageSquare, equipment: Dumbbell, lobby_tv: Tv,
};

export default function GymApp() {
  const [params, setParams] = useSearchParams();
  const tab = (APP_TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'look') as AppTab;
  const setTab = (t: AppTab) => setParams((prev) => { const n = new URLSearchParams(prev); n.set('tab', t); return n; }, { replace: true });
  const [app, setApp] = useState<App | null>(null);
  const [modules, setModules] = useState<GymModule[]>([]);
  const [words, setWords] = useState({ points_name: '', points_name_short: '', welcome_message: '' });
  /** The nouns (0114). The server always returns all six, so an empty box means "the English word". */
  const [vocab, setVocab] = useState<GymVocabulary | null>(null);
  /** Both colour roles and the logo, edited together because they are one look. */
  const [look, setLook] = useState({ accent: 'violet', action: '', logo_url: '' });
  const [group, setGroup] = useState(GROUPS[0]);
  const [uploading, setUploading] = useState(false);
  /** The gym's address, open for editing. NULL means "not editing", so an accidental empty box cannot be saved. */
  const [slug, setSlug] = useState<string | null>(null);
  const [poster, setPoster] = useState(false);
  /** Approval and minimum age (0179); null before 0179, and nothing is offered. */
  const [joinSet, setJoinSet] = useState<JoinSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState<'link' | 'code' | 'message' | null>(null);

  const load = useCallback(async () => {
    const [a, m, js] = await Promise.all([getGymApp(), getGymModules(), getJoinSettings()]);
    setApp(a); setModules(m); setJoinSet(js);
    if (a) {
      setWords({ points_name: a.points_name, points_name_short: a.points_name_short, welcome_message: a.welcome_message ?? '' });
      setVocab(a.vocabulary ?? null);
      setLook({ accent: a.accent || 'violet', action: a.accent_action ?? '', logo_url: a.logo_url ?? '' });
      setSlug(null);
    }
    setReady(true);
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const toggle = async (m: GymModule) => {
    if (m.state === 'not_sold' || m.state === 'parent_off') return;
    try {
      await setGymModule(m.feature_key, !m.enabled);
      await load();
      refreshGymModules(); // the sidebar follows at once, not on the next launch
    } catch (e) { showToast(e instanceof Error ? e.message : 'That could not be saved', 'error'); }
  };

  const saveWords = async () => {
    setSaving(true);
    try {
      await saveGymWords({
        points_name: words.points_name.trim(),
        points_name_short: words.points_name_short.trim() || null,
        welcome_message: words.welcome_message.trim() || null,
      });
      // One Save to the owner, so both go together. A blank box is stored as nothing — the English word.
      if (vocab) await saveGymVocabulary(vocab);
      await load();
      refreshGymWords(); // the sidebar's nouns repaint now, not on the next reload
      showToast('Saved. Your members see this next time they open the app.', 'success');
    } catch (e) { showToast(e instanceof Error ? e.message : 'That could not be saved', 'error'); }
    finally { setSaving(false); }
  };

  const saveLook = async () => {
    setSaving(true);
    try {
      // '' clears the logo, a URL sets it; this form always knows which it means.
      await saveGymLook({ accent: look.accent, accentAction: look.action || null, logoUrl: look.logo_url });
      await load();
      showToast('Published. Your members see this next time they open the app.', 'success');
    } catch (e) { showToast(e instanceof Error ? e.message : 'That could not be saved', 'error'); }
    finally { setSaving(false); }
  };

  const saveSlug = async () => {
    if (slug === null) return;
    try { await setGymSlug(slug.trim()); await load(); showToast('Your link has moved. Share the new one.', 'success'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'That could not be saved', 'error'); }
  };

  const changeDoor = async (policy: JoinPolicy, newCode = false) => {
    try {
      if (joinSet && !newCode) await setJoinSettings(policy, joinSet);
      else await setJoinPolicy(policy, newCode);
      await load();
    } catch (e) { showToast(e instanceof Error ? e.message : 'That could not be saved', 'error'); }
  };

  const changeJoinSettings = async (next: JoinSettings) => {
    if (!app) return;
    setJoinSet(next);
    try { await setJoinSettings(app.join_policy, next); }
    catch (e) { showToast(e instanceof Error ? e.message : 'That could not be saved', 'error'); await load(); }
  };

  if (!ready) return <div className="att"><p className="a-sub">Loading…</p></div>;
  if (!app) {
    return (
      <div className="att"><div className="a-card">
        <h3 style={{ fontSize: 15, fontWeight: 700 }}>Not available yet</h3>
        <p className="a-sub" style={{ marginTop: 4 }}>This page needs migration 0110, which has not been pasted into the database yet. Nothing is broken — your gym works exactly as it did.</p>
      </div></div>
    );
  }

  const joinLink = `${MEMBER_APP}/join/${app.slug}`;
  const coach = modules.find((m) => m.feature_key === 'assistant');
  const coachSold = !!coach && coach.state !== 'not_sold';
  const a = rampFor(look.accent, 'violet');
  const b = rampFor(look.action || null, 'amber');
  const same = (x: string, y: string) => x.toLowerCase() === y.toLowerCase();
  const pairOn = PAIRS.find((p) => same(p.accent, look.accent) && same(p.action, look.action || 'amber'));
  const shortName = app.short_name || app.gym_name;
  const initials = shortName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const logo = (size: number) => (look.logo_url
    ? <img src={look.logo_url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flex: 'none' }} />
    : <span style={{ width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: size * 0.32, flex: 'none',
        background: `linear-gradient(135deg, ${a.c400}, ${a.c700})`, color: '#fff' }}>{initials}</span>);
  const v = (k: keyof GymVocabulary, std: string) => (vocab?.[k] ?? '').trim() || std;
  const pointsTitle = words.points_name.trim() || 'Points';
  const pointsShort = words.points_name_short.trim() || 'points';
  const kindOn = vocab ? KINDS.find((k) => (Object.keys(k.v) as (keyof GymVocabulary)[]).every((key) => same(v(key, ''), k.v[key])))?.name : undefined;

  return (
    <div className="att" data-your-app>
      <div className="a-head">
        <div className="min-w-0"><h1>Your app</h1><p>Everything {app.gym_name}'s members see on their phones — change it here, watch it change on the right</p></div>
        <div className="a-tabs" role="tablist" aria-label="Your app sections">
          {APP_TABS.filter(([k]) => k !== 'coach' || coachSold).map(([k, t, Icon]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              <Icon size={14} />{t}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Look ---------------------------------------------------------------------- */}
      {tab === 'look' && (
        <Split preview={(
          <Phone cap="Live preview · Today">
            <div className="flex items-center justify-between">
              <div><div className="a-sub">Good morning</div><b style={{ display: 'block', fontSize: 16 }}>{shortName}</b></div>{logo(32)}
            </div>
            <div className="a-phcard"><div className="a-sub">This week</div><b style={{ fontSize: 18, color: a.c300 }}>3 of 4 days</b>
              <div style={{ marginTop: 8, height: 6, borderRadius: 99, background: '#1E1D2B', overflow: 'hidden' }}><i style={{ display: 'block', width: '75%', height: '100%', background: gradientOf(look.accent, look.action) }} /></div></div>
            <div className="a-phcard"><b>Strength Basics</b><div className="a-sub">Today 7:00 AM · seats left</div>
              <div className="a-phbtn" style={{ background: b.base, color: '#0B0B12', marginTop: 8 }}>Book</div></div>
            <div className="a-phcard flex items-center justify-between"><span className="a-sub">{pointsTitle}</span><b style={{ color: a.c300 }}>340</b></div>
            <TabBar on="Today" colour={a.c300} />
          </Phone>
        )}>
          <div className="a-ct"><h3><Palette size={16} />Colours</h3><small>two colours, two jobs</small></div>
          <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 6 }}>
            <span className="a-lbl">Ready-made pairs <span style={{ fontWeight: 500 }}>· one tap sets both</span></span>
            <span style={{ marginLeft: 'auto' }} />
            {GROUPS.map((g) => <button key={g} type="button" className={`a-chip ${group === g ? 'v' : ''}`} onClick={() => setGroup(g)}>{g}</button>)}
          </div>
          <div className="a-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
            {PAIRS.filter((p) => p.group === group).map((p) => (
              <button key={p.name} type="button" className={`a-pair ${pairOn?.name === p.name ? 'on' : ''}`} aria-pressed={pairOn?.name === p.name}
                onClick={() => setLook((l) => ({ ...l, accent: p.accent, action: p.action }))}>
                <i style={{ background: gradientOf(p.accent, p.action) }} />{p.name}
              </button>
            ))}
          </div>
          <SavedThemes accent={look.accent} action={look.action} onPick={(accent, action) => setLook((l) => ({ ...l, accent, action }))} />
          <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, marginTop: 14 }}>
            <div>
              <b style={{ fontSize: 12.5 }}>Where you are, and what you have</b>
              <div className="a-sub" style={{ margin: '2px 0 8px' }}>selected tabs, progress, points</div>
              <ColourRolePicker compact idPrefix="look-accent" value={look.accent} fallback="violet"
                onChange={(val) => setLook((l) => ({ ...l, accent: val || 'violet' }))} />
            </div>
            <div>
              <b style={{ fontSize: 12.5 }}>What you can do next</b>
              <div className="a-sub" style={{ margin: '2px 0 8px' }}>book, renew, save, send</div>
              <ColourRolePicker compact idPrefix="look-action" value={look.action} fallback="amber"
                unsetLabel="Standard amber, the colour every gym started with"
                onChange={(val) => setLook((l) => ({ ...l, action: val }))} />
              {!look.action && <p className="a-sub" style={{ marginTop: 6 }}>Not set, so your buttons are standard amber.</p>}
            </div>
          </div>

          <div className="a-ct" style={{ marginTop: 16 }}><h3><Image size={16} />Logo and name</h3></div>
          <div className="flex items-center gap-3.5">
            {logo(64)}
            <div className="a-fld" style={{ flex: 1 }}>
              <span className="l">Short name on the app</span>
              <div className="a-in" style={{ color: 'var(--a-text2)' }}>{shortName} <Link to="/settings" className="a-link" style={{ marginLeft: 6 }}>change on Settings</Link></div>
            </div>
            <label className="a-btn" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
              {uploading ? 'Uploading…' : look.logo_url ? 'Change logo' : 'Choose a logo'}
              <input type="file" accept="image/*" className="hidden" disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setUploading(true);
                  void uploadMedia(file, 'logos')
                    .then((url) => setLook((l) => ({ ...l, logo_url: url })))
                    .catch((err) => showToast(err instanceof Error ? err.message : 'That picture would not upload', 'error'))
                    .finally(() => setUploading(false));
                }} />
            </label>
            {look.logo_url && <button type="button" className="a-btn ghost" onClick={() => setLook({ ...look, logo_url: '' })}>Remove</button>}
          </div>
          <p className="a-sub" style={{ marginTop: 6 }}>Square works best — it shows in a circle. With none, members see the Core Fitness mark.</p>
          <div className="a-hint" style={{ marginTop: 12 }}><Sparkles size={15} /><span>Premium themes (photo backgrounds, your own fonts) are coming — these colours carry over.</span></div>
          <button type="button" className="a-btn violet" style={{ marginTop: 'auto', alignSelf: 'flex-end' }} onClick={() => void saveLook()} disabled={saving || uploading}>
            <Check size={15} />{saving ? 'Publishing…' : 'Publish to members'}
          </button>
        </Split>
      )}

      {/* ---- Words --------------------------------------------------------------------- */}
      {tab === 'words' && (
        <Split preview={(
          <Phone cap="Live preview · your words in place">
            {words.welcome_message.trim() && <div className="a-phcard" style={{ background: '#1d1833', borderColor: '#33295c' }}><span className="a-sub">📣 {words.welcome_message.trim()}</span></div>}
            <div className="a-phcard"><b>You earned <span style={{ color: 'var(--a-a300)' }}>{pointsShort}</span></b><div className="a-sub">for checking in</div></div>
            <div className="a-phcard"><b>Book a <span style={{ color: 'var(--a-a300)' }}>{v('class', 'class')}</span></b><div className="a-sub">with one of our <span style={{ color: 'var(--a-a300)' }}>{v('trainers', 'coaches')}</span></div></div>
            <div className="a-phcard"><b>{v('members', 'members')[0].toUpperCase() + v('members', 'members').slice(1)} this week</b><div className="a-sub">how many {v('members', 'members')} checked in</div></div>
            <div className="a-phcard flex justify-between"><span className="a-sub"><span style={{ color: 'var(--a-a300)' }}>{pointsTitle}</span></span><b>340</b></div>
            <TabBar on="Today" />
          </Phone>
        )}>
          <div className="a-ct"><h3><Type size={16} />Your gym's words</h3><small>leave a box empty for the standard word</small></div>
          {vocab && (
            <>
              <div className="a-lbl" style={{ marginBottom: 6 }}>Start from a kind of gym</div>
              <div className="flex gap-1.5 flex-wrap" style={{ marginBottom: 12 }}>
                {KINDS.map((k) => <button key={k.name} type="button" className={`a-chip ${kindOn === k.name ? 'on' : ''}`} onClick={() => setVocab({ ...k.v })}>{k.name}</button>)}
              </div>
              <h4 className="a-lbl" style={{ color: '#fff', fontSize: 12.5, marginBottom: 4 }}>What you call your people</h4>
            </>
          )}
          <table className="a-table">
            <thead><tr><th>In the app it says</th><th>One</th><th>Many</th></tr></thead>
            <tbody>
              {vocab && ([
                ['The people who coach', 'trainer', 'trainers', 'coach', 'coaches', 'One of them', 'All of them'],
                ['Your people', 'member', 'members', 'member', 'members', 'One of your people', 'All of your people'],
                ['A group session', 'class', 'classes', 'class', 'classes', 'One session', 'All sessions'],
              ] as const).map(([what, one, many, stdOne, stdMany, l1, l2]) => (
                <tr key={one}>
                  <td className="a-sub">{what}</td>
                  <td><input className="a-in" aria-label={l1} maxLength={30} value={vocab[one]} placeholder={stdOne} onChange={(e) => setVocab({ ...vocab, [one]: e.target.value })} /></td>
                  <td><input className="a-in" aria-label={l2} maxLength={30} value={vocab[many]} placeholder={stdMany} onChange={(e) => setVocab({ ...vocab, [many]: e.target.value })} /></td>
                </tr>
              ))}
              <tr>
                <td className="a-sub">Points <span style={{ display: 'block', fontSize: 10 }}>as a title · in a sentence</span></td>
                <td><input className="a-in" aria-label="Your points are called" maxLength={30} value={words.points_name} placeholder="Points" onChange={(e) => setWords({ ...words, points_name: e.target.value })} /></td>
                <td><input className="a-in" aria-label="In the middle of a sentence" maxLength={30} value={words.points_name_short} placeholder="points" onChange={(e) => setWords({ ...words, points_name_short: e.target.value })} /></td>
              </tr>
            </tbody>
          </table>
          <div className="a-fld" style={{ marginTop: 12 }}>
            <label htmlFor="wm">A line on everyone's Today screen <span style={{ fontWeight: 500 }}>· optional, change it any time</span></label>
            <input id="wm" className="a-in" maxLength={280} value={words.welcome_message} placeholder="Open 5am–10pm. Ask the desk about the new squat racks."
              onChange={(e) => setWords({ ...words, welcome_message: e.target.value })} />
          </div>
          <button type="button" className="a-btn violet" style={{ marginTop: 'auto', alignSelf: 'flex-end' }} onClick={() => void saveWords()} disabled={saving}>
            <Check size={15} />{saving ? 'Saving…' : 'Save words'}
          </button>
        </Split>
      )}

      {/* ---- What you run ---------------------------------------------------------------- */}
      {tab === 'runs' && (
        <Split preview={(
          <Phone cap="Live preview · what members can open">
            <b style={{ fontSize: 16 }}>Train</b>
            <div className="a-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
              {modules.filter((m) => !m.parent_key).map((m) => {
                const Icon = MODULE_ICONS[m.feature_key] ?? ToggleRight;
                const on = m.enabled && m.state !== 'not_sold' && m.state !== 'parent_off';
                return on
                  ? <div key={m.feature_key} className="a-phcard flex items-center gap-2.5"><Icon size={15} style={{ color: 'var(--a-p300)' }} /><b>{m.label}</b></div>
                  : <div key={m.feature_key} className="a-phcard flex items-center gap-2.5" style={{ opacity: 0.35, borderStyle: 'dashed' }}><Icon size={15} /><span className="a-sub">{m.label} — off</span></div>;
              })}
            </div>
            <TabBar on="Train" />
          </Phone>
        )}>
          <div className="a-ct"><h3><ToggleRight size={16} />What your gym runs</h3><small>switching off hides it — nothing is deleted</small></div>
          <ModuleColumns modules={modules} onToggle={(m) => void toggle(m)} />
        </Split>
      )}

      {/* ---- Joining ---------------------------------------------------------------------- */}
      {tab === 'join' && (
        <Split preview={(
          <Phone cap="Live preview · someone opening your link" centre>
            <div style={{ marginTop: 20 }}>{logo(56)}</div>
            <b style={{ fontSize: 17 }}>Join {app.gym_name}</b>
            {app.tagline && <div className="a-sub">{app.tagline}</div>}
            {app.join_policy === 'closed' ? (
              <div className="a-phcard" style={{ width: '100%', textAlign: 'left' }}><b>Visit the front desk</b><div className="a-sub">the desk makes your account</div></div>
            ) : (
              <>
                <div className="a-phcard" style={{ width: '100%', textAlign: 'left' }}>
                  <b>{joinSet?.approval === 'auto' ? 'You get in at once' : 'The desk approves you'}</b>
                  <div className="a-sub">{joinSet?.approval === 'auto' ? 'on the free plan · upgrade any time' : 'you can sign in while you wait'}</div>
                </div>
                <div className="a-phbtn" style={{ background: b.base, color: '#0B0B12', width: '100%' }}>Create my account</div>
              </>
            )}
            {joinSet && joinSet.minAge > 0 && <div className="a-sub">{joinSet.minAge} years and older</div>}
            <div className="a-sub">Already a member? Sign in</div>
          </Phone>
        )}>
          <div className="a-ct"><h3><DoorOpen size={16} />How members join</h3><small>how people find you</small></div>
          <div className="a-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {([
              ['open', 'Anyone can find you', 'listed in the app’s gym list and on the map', Globe],
              ['code', 'Only with your link or code', 'not listed — you hand out the link', QrCode],
              ['closed', 'Only at the front desk', 'the desk makes every account', Building2],
            ] as const).map(([key, title, blurb, Icon]) => (
              <button key={key} type="button" className={`a-door2 ${app.join_policy === key ? 'on' : ''}`} aria-pressed={app.join_policy === key} onClick={() => void changeDoor(key)}>
                <span className="a-ic"><Icon size={15} /></span><span className="min-w-0"><b>{title}</b><small>{blurb}</small></span>
              </button>
            ))}
          </div>
          <p className="a-sub" style={{ marginTop: 6 }}>
            {joinSet?.approval === 'auto' && app.join_policy !== 'closed'
              ? 'Sign-ups are let in at once, on your free plan.'
              : 'However they arrive, you approve every sign-up before they can use anything.'}
          </p>

          {joinSet && app.join_policy !== 'closed' && (
            <>
              <div className="a-ct" style={{ marginTop: 14 }}><h3><UserCheck size={16} />When someone signs up</h3></div>
              <div className="a-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }} data-join-approval>
                {([
                  ['auto', 'Let them in at once', 'on your free plan — no waiting'],
                  ['desk', 'The desk approves each one', 'they wait in Members → Sign-ups'],
                ] as const).map(([key, title, blurb]) => (
                  <button key={key} type="button" className={`a-door2 ${joinSet.approval === key ? 'on' : ''}`} aria-pressed={joinSet.approval === key}
                    onClick={() => void changeJoinSettings({ ...joinSet, approval: key })}>
                    <span className="min-w-0"><b>{title}</b><small>{blurb}</small></span>
                  </button>
                ))}
              </div>
              <p className="a-sub" style={{ marginTop: 6 }}>A request a member&rsquo;s invite brings to a front-desk-only gym always waits for the desk.</p>
            </>
          )}
          {joinSet && (
            <div className="a-setting" style={{ marginTop: 6 }}>
              <div className="t"><b>Youngest age</b><small>under this, they cannot sign up · under 18 joins with a parent&rsquo;s or guardian&rsquo;s consent</small></div>
              <input id="join-min-age" type="number" min={0} max={21} className="a-in" style={{ width: 70, textAlign: 'center' }} aria-label="Youngest age you take"
                value={joinSet.minAge} onChange={(e) => void changeJoinSettings({ ...joinSet, minAge: Math.max(0, Math.min(21, Number(e.target.value) || 0)) })} />
            </div>
          )}

          {app.join_policy !== 'closed' && (
            <>
              <div className="a-ct" style={{ marginTop: 12 }}><h3><Share2 size={16} />Your link and code</h3></div>
              <div className="flex gap-3 items-center" style={{ padding: 12, borderRadius: 14, background: '#120f20', border: '1px solid #33295c' }}>
                <div style={{ width: 74, height: 74, borderRadius: 10, background: '#fff', display: 'grid', placeItems: 'center', flex: 'none' }}>
                  <QRCodeSVG value={joinLink} size={62} level="M" bgColor="#ffffff" fgColor="#111111" />
                </div>
                <div className="min-w-0" style={{ flex: 1 }}>
                  {slug === null ? (
                    <b style={{ wordBreak: 'break-all' }}>{MEMBER_APP.replace('https://', '')}/join/<span style={{ color: 'var(--a-p300)' }}>{app.slug}</span>
                      <button type="button" className="a-link" style={{ marginLeft: 8 }} onClick={() => setSlug(app.slug)}>Change</button></b>
                  ) : (
                    <form onSubmit={(e) => { e.preventDefault(); void saveSlug(); }}>
                      <div className="a-fld"><label htmlFor="slug">{MEMBER_APP}/join/</label>
                        <input id="slug" className="a-in" value={slug} autoFocus maxLength={40} placeholder="your-gym" onChange={(e) => setSlug(e.target.value.toLowerCase())} /></div>
                      <p className="a-sub" style={{ marginTop: 6, color: 'var(--a-a300)' }}>
                        Every /join/{app.slug} link already printed, posted or sent stops working the moment you save this. Nobody is locked out — they just cannot use the old link.
                      </p>
                      <div className="flex gap-2" style={{ marginTop: 8 }}>
                        <button type="submit" className="a-btn violet sm" disabled={slug.trim() === app.slug}>Move my link</button>
                        <button type="button" className="a-btn ghost sm" onClick={() => setSlug(null)}>Cancel</button>
                      </div>
                    </form>
                  )}
                  {app.join_code && <div className="a-sub" style={{ marginTop: 3 }}>Join code <b className="a-code" style={{ fontSize: 15, letterSpacing: '.2em' }}>{app.join_code}</b></div>}
                  <div className="flex gap-1.5 flex-wrap" style={{ marginTop: 8 }}>
                    {/* The link alone, so it pastes cleanly into a browser or a chat. */}
                    <button type="button" className="a-btn sm" onClick={() => { void navigator.clipboard.writeText(joinLink).then(() => setCopied('link')); }}>
                      <Copy size={13} />{copied === 'link' ? 'Link copied' : 'Copy link'}</button>
                    {app.join_code && (
                      <button type="button" className="a-btn sm" onClick={() => { void navigator.clipboard.writeText(app.join_code ?? '').then(() => setCopied('code')); }}>
                        <Copy size={13} />{copied === 'code' ? 'Code copied' : 'Copy code'}</button>
                    )}
                    <button type="button" className="a-btn sm" onClick={() => {
                      const text = `Join ${app.gym_name} on our app: ${joinLink}` + (app.join_code ? `\nAlready have the app? Tap "Have a join code?" and type ${app.join_code}` : '');
                      void navigator.clipboard.writeText(text).then(() => setCopied('message'));
                    }}><MessageSquare size={13} />{copied === 'message' ? 'Message copied' : 'Copy a message'}</button>
                    <button type="button" className="a-btn amber sm" onClick={() => setPoster(true)}><Printer size={13} />Print a poster</button>
                    {app.join_policy === 'code' && (
                      <button type="button" className="a-btn ghost sm" onClick={() => void changeDoor('code', true)} data-tip="The old code stops working straight away — use it if your code gets out.">
                        <RefreshCw size={13} />New code</button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </Split>
      )}

      {tab === 'coach' && coachSold && coach && <CoachTab enabled={coach.enabled} sold={coachSold} onToggle={() => void toggle(coach)} />}
      {tab === 'pay' && <PayTab />}
      {tab === 'tv' && <TvTab />}

      {poster && (
        <JoinPoster
          gymName={app.gym_name}
          tagline={app.tagline}
          logoUrl={app.logo_url}
          joinLink={joinLink}
          /* A listed gym has no code, so the poster leaves that half out rather than printing a blank box. */
          joinCode={app.join_policy === 'code' ? app.join_code : null}
          accent={rampFor(app.accent, 'violet').base}
          onClose={() => setPoster(false)}
        />
      )}
    </div>
  );
}

/** A settings card beside a phone, the shape of every tab on this page. */
function Split({ children, preview }: { children: ReactNode; preview: ReactNode }) {
  return (
    <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 380px', flex: 1 }}>
      <div className="a-card a-scroll">{children}</div>
      {preview}
    </div>
  );
}

function Phone({ cap, children, centre }: { cap: string; children: ReactNode; centre?: boolean }) {
  return (
    <div className="a-stage">
      <div className="cap"><Smartphone size={13} />{cap}</div>
      <div className="a-phone">
        <div className="scr" style={centre ? { alignItems: 'center', textAlign: 'center' } : undefined}>{children}</div>
      </div>
      <span className="a-sub" style={{ position: 'absolute', bottom: 10, fontSize: 10 }}>Sample screen, in your colours and words</span>
    </div>
  );
}

function TabBar({ on, colour }: { on: 'Today' | 'Train' | 'You'; colour?: string }) {
  return (
    <div className="a-tabbar">
      {(['Today', 'Train', 'You'] as const).map((t) => (
        <span key={t} className={t === on ? 'on' : ''} style={t === on && colour ? { color: colour } : undefined}>
          {t === 'Today' ? <Calendar size={16} /> : t === 'Train' ? <Dumbbell size={16} /> : <Users size={16} />}{t}
        </span>
      ))}
    </div>
  );
}

/**
 * What a gym runs (0141), as two columns of switches: each part, with its
 * children indented under it. A part the gym's plan does not include shows a
 * lock and why; a child whose parent is off shows why and cannot be flipped —
 * its own setting is kept, and returns with the parent.
 */
function ModuleColumns({ modules, onToggle }: { modules: GymModule[]; onToggle: (m: GymModule) => void }) {
  const parents = modules.filter((m) => !m.parent_key);
  const weight = (p: GymModule) => 1 + modules.filter((c) => c.parent_key === p.feature_key).length;
  const total = parents.reduce((n, p) => n + weight(p), 0);
  const left: GymModule[] = [], right: GymModule[] = [];
  let run = 0;
  for (const p of parents) { (run < total / 2 ? left : right).push(p); run += weight(p); }
  const row = (m: GymModule, parent?: GymModule) => {
    const Icon = MODULE_ICONS[m.feature_key] ?? ToggleRight;
    const locked = m.state === 'not_sold';
    const held = m.state === 'parent_off';
    const note = locked ? 'Your Core Fitness plan does not include this.'
      : held ? `Off because ${parent?.label ?? 'the part it belongs to'} is off.`
      : m.description;
    return (
      <div key={m.feature_key} className="a-setting" style={parent ? { paddingLeft: 20 } : undefined} data-module={m.feature_key}>
        <span className="a-ic" style={parent ? { width: 26, height: 26 } : undefined}><Icon size={parent ? 13 : 15} /></span>
        <div className="t"><b style={locked || held ? { color: 'var(--a-text2)' } : undefined}>{m.label}</b><small>{note}</small></div>
        {locked ? <Lock size={15} style={{ color: 'var(--a-muted)' }} aria-label={`${m.label} is not on your plan`} />
          : <button type="button" className={`a-toggle ${m.enabled ? '' : 'off'}`} disabled={held} onClick={() => onToggle(m)}
              aria-pressed={m.enabled} aria-label={m.enabled ? `Switch off ${m.label}` : `Switch on ${m.label}`} />}
      </div>
    );
  };
  const col = (list: GymModule[]) => (
    <div>
      {list.map((p) => (
        <div key={p.feature_key}>
          {row(p)}
          {modules.filter((c) => c.parent_key === p.feature_key).map((c) => row(c, p))}
        </div>
      ))}
    </div>
  );
  if (parents.length === 0) return <p className="a-sub">The parts of the system could not be loaded — a connection problem, not an empty list.</p>;
  return <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '4px 24px' }}>{col(left)}{col(right)}</div>;
}
