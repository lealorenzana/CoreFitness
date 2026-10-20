import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import { Users, Dumbbell, Plus, Search, Sparkles, Check, X, Gift, EyeOff, Eye, Trash2, Lock, Wand2, Info } from 'lucide-react';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import AwardModal from '../components/achievements/AwardModal';
import { BADGE_ICON_NAMES, badgeIcon } from '../components/achievements/badgeIcons';
import './attendance/att.css';
import { showSuccessToast, showErrorToast } from '../utils/toast';
import { todayKey } from '../utils/dates';
import {
  listAchievements, listMetrics, createAchievement, updateAchievement, deleteAchievement, setAchievementActive,
  achievementRarity, achievementQualifiers, earnedSince, ruleSummary, type Rarity,
  type AchievementRow, type AchievementMetric, type AchievementAudience, type AchievementTier, type AchievementRuleKind,
} from '../lib/api/achievements';

/**
 * Achievements (0038/0093/0206, redrawn 2026-10-20 to the approved mock-up): the
 * catalogue by group as medals, and a one-screen maker beside it — the badge as
 * the member sees it, what earns it, how many already qualify, its tier, icon,
 * points, whether it is secret, whether the member is told.
 *
 * Admin-only, and not just for tidiness: inventing a badge changes what the gym
 * rewards. RLS gives staff read access and no writes. Three kinds:
 *   • Automatic — a stat and a number; the server awards it on each sync.
 *   • Given by you — no rule; picked per person ("Member of the Month").
 *   • Levels (built-in) — their rule reads level_thresholds(), so the badge and
 *     the level on Home cannot disagree. Words editable, rule not.
 */

const TIERS: [AchievementTier, string][] = [['bronze', 'most get it'], ['silver', 'takes weeks'], ['gold', 'takes months'], ['platinum', 'very rare']];
const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

interface Draft {
  key: string; audience: AchievementAudience; title: string; description: string; requirement: string; ownRequirement: boolean;
  icon: string; tier: AchievementTier; category: string; rule_kind: AchievementRuleKind;
  metric: string; threshold: string; metric2: string; threshold2: string; sort_order: number;
  points: string; secret: boolean; tell: boolean;
}
const blank = (audience: AchievementAudience, n: number): Draft => ({
  key: '', audience, title: '', description: '', requirement: '', ownRequirement: false, icon: 'Award', tier: 'bronze', category: 'General',
  rule_kind: 'metric', metric: '', threshold: '', metric2: '', threshold2: '', sort_order: 100 + n, points: '0', secret: false, tell: true,
});
const fromRow = (a: AchievementRow): Draft => ({
  key: a.key, audience: a.audience, title: a.title, description: a.description, requirement: a.requirement, ownRequirement: true,
  icon: a.icon, tier: a.tier, category: a.category, rule_kind: a.rule_kind, metric: a.metric ?? '', threshold: a.threshold?.toString() ?? '',
  metric2: a.metric2 ?? '', threshold2: a.threshold2?.toString() ?? '', sort_order: a.sort_order,
  points: String(a.points ?? 0), secret: !!a.secret, tell: !!a.tell_member,
});
const IDEAS: { label: string; audience: AchievementAudience; kind: AchievementRuleKind; metric?: string; threshold?: number;
  title: string; description: string; icon: string; tier: AchievementTier; category: string; points: number }[] = [
  { label: 'First week done', audience: 'member', kind: 'metric', metric: 'training_days', threshold: 3, title: 'Off the Mark', description: 'Three days in. The hardest part is behind you.', icon: 'Rocket', tier: 'bronze', category: 'Getting started', points: 20 },
  { label: 'A habit forming', audience: 'member', kind: 'metric', metric: 'consistent_weeks', threshold: 4, title: 'Four Steady Weeks', description: 'Four weeks of training twice or more. That is a habit.', icon: 'Repeat', tier: 'silver', category: 'Consistency', points: 50 },
  { label: 'Early riser', audience: 'member', kind: 'metric', metric: 'early_checkins', threshold: 10, title: 'Sunrise Crew', description: 'Ten workouts before 7am. The gym is yours at dawn.', icon: 'Sunrise', tier: 'gold', category: 'Habits', points: 100 },
  { label: 'Class regular', audience: 'member', kind: 'metric', metric: 'classes_attended', threshold: 20, title: 'Class Regular', description: 'Twenty classes. The coaches know your name.', icon: 'Users', tier: 'gold', category: 'Classes', points: 100 },
  { label: 'One full year', audience: 'member', kind: 'metric', metric: 'days_as_member', threshold: 365, title: 'One Year Strong', description: 'A whole year with us. Thank you.', icon: 'Crown', tier: 'platinum', category: 'Loyalty', points: 200 },
  { label: 'Member of the month', audience: 'member', kind: 'manual', title: 'Member of the Month', description: 'Chosen by the gym for showing up and lifting others up.', icon: 'Star', tier: 'gold', category: 'Given by you', points: 100 },
  { label: 'Coach: 50 sessions', audience: 'trainer', kind: 'metric', metric: 'sessions_delivered', threshold: 50, title: 'Fifty Sessions', description: 'Fifty 1-on-1 sessions delivered.', icon: 'Medal', tier: 'gold', category: 'Coaching', points: 0 },
];
type Kind = 'all' | 'metric' | 'manual' | 'builtin' | 'retired' | 'never';

function Medal({ icon, tier, locked, size = 48 }: { icon: string; tier: AchievementTier; locked?: boolean; size?: number }) {
  return <span className={`a-medal ${locked ? 'locked' : tier}`} style={{ width: size, height: size }}>{createElement(badgeIcon(icon), { size: Math.round(size * 0.44) })}</span>;
}

export default function Achievements() {
  const [rows, setRows] = useState<AchievementRow[]>([]);
  const [metrics, setMetrics] = useState<AchievementMetric[]>([]);
  const [rarity, setRarity] = useState<Map<string, Rarity> | null>(null);
  const [month, setMonth] = useState<{ badges: number; people: number } | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [audience, setAudience] = useState<AchievementAudience>('member');
  const [kind, setKind] = useState<Kind>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'catalogue' | 'most' | 'rarest'>('catalogue');
  const [editing, setEditing] = useState<AchievementRow | null>(null);
  const [draft, setDraft] = useState<Draft>(() => blank('member', 0));
  const [qual, setQual] = useState<{ qualify: number; halfway: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [awarding, setAwarding] = useState<AchievementRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AchievementRow | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, m] = await Promise.all([listAchievements(true), listMetrics()]);
      setRows(a); setMetrics(m); setState('ready');
      setRarity(await achievementRarity().catch(() => null));
      setMonth(await earnedSince(`${todayKey().slice(0, 8)}01`));
    } catch (err) {
      setState('unavailable');
      showErrorToast(err instanceof Error ? err.message : 'Could not load achievements');
    }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  /** 0206's columns arrive with select('*'); before it they are simply absent. */
  const has0206 = rows.length > 0 && 'points' in rows[0];
  const forAudience = useMemo(() => rows.filter((r) => r.audience === audience), [rows, audience]);
  const holders = (k: string) => rarity?.get(k)?.holders ?? 0;
  const pct = (k: string) => { const r = rarity?.get(k); return r?.audience ? Math.round((r.holders / r.audience) * 100) : 0; };
  const live = forAudience.filter((r) => r.active);
  const never = live.filter((r) => rarity && holders(r.key) === 0);
  const earned = rarity ? live.filter((r) => holders(r.key) > 0) : [];
  const most = earned.length ? earned.reduce((a, b) => (holders(b.key) > holders(a.key) ? b : a)) : null;
  const rarest = earned.length ? earned.reduce((a, b) => (holders(b.key) < holders(a.key) ? b : a)) : null;

  const counts: Record<Kind, number> = {
    all: forAudience.length, metric: forAudience.filter((r) => r.rule_kind === 'metric').length, manual: forAudience.filter((r) => r.rule_kind === 'manual').length,
    builtin: forAudience.filter((r) => r.rule_kind === 'builtin').length, retired: forAudience.filter((r) => !r.active).length, never: never.length,
  };
  const visible = forAudience
    .filter((r) => kind === 'all' ? true : kind === 'retired' ? !r.active : kind === 'never' ? never.includes(r) : r.rule_kind === kind)
    .filter((r) => { const s = q.trim().toLowerCase(); return !s || `${r.title} ${r.category} ${r.requirement}`.toLowerCase().includes(s); })
    .sort((a, b) => sort === 'catalogue' || !rarity ? 0 : sort === 'most' ? holders(b.key) - holders(a.key) : holders(a.key) - holders(b.key));
  const groups = [...new Set(visible.map((r) => r.category))];

  // The maker.
  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const metricsFor = metrics.filter((m) => m.audience === draft.audience);
  const chosen = metrics.find((m) => m.key === draft.metric);
  const chosen2 = metrics.find((m) => m.key === draft.metric2);
  const locked = draft.rule_kind === 'builtin';
  const autoRequirement = () => {
    if (draft.rule_kind === 'manual') return 'Given by the gym.';
    if (!chosen) return '';
    const one = chosen.is_boolean ? chosen.label : `Reach ${draft.threshold || '…'} ${chosen.label.toLowerCase()}`;
    const two = chosen2 ? (chosen2.is_boolean ? `, and ${chosen2.label.toLowerCase()}` : `, and ${draft.threshold2 || '…'} ${chosen2.label.toLowerCase()}`) : '';
    return `${one}${two}.`;
  };
  const requirement = draft.ownRequirement ? draft.requirement : autoRequirement();
  const ruleReady = locked || draft.rule_kind === 'manual' || (!!chosen && (chosen.is_boolean || Number(draft.threshold) > 0) && (!draft.metric2 || chosen2?.is_boolean || Number(draft.threshold2) > 0));

  // How many already qualify — asked of the database a moment after the rule stops changing.
  useEffect(() => {
    if (draft.rule_kind !== 'metric' || !chosen || !(chosen.is_boolean || Number(draft.threshold) > 0)) return;
    let alive = true;
    const id = setTimeout(() => {
      void (async () => {
        const r = await achievementQualifiers(draft.audience, draft.metric, chosen.is_boolean ? 1 : Number(draft.threshold), draft.metric2 || null, draft.metric2 ? (chosen2?.is_boolean ? 1 : Number(draft.threshold2)) : null);
        if (alive) setQual(r);
      })();
    }, 400);
    return () => { alive = false; clearTimeout(id); };
  }, [draft.rule_kind, draft.audience, draft.metric, draft.threshold, draft.metric2, draft.threshold2, chosen, chosen2]);

  const startNew = () => { setEditing(null); setQual(null); setDraft(blank(audience, forAudience.length)); };
  const open = (a: AchievementRow) => { setEditing(a); setQual(null); setDraft(fromRow(a)); };
  const applyIdea = (i: typeof IDEAS[number]) => {
    setQual(null);
    setDraft((d) => ({ ...d, audience: i.audience, rule_kind: i.kind, metric: i.metric ?? '', threshold: i.threshold ? String(i.threshold) : '', metric2: '', threshold2: '',
      title: i.title, key: slugify(i.title), description: i.description, icon: i.icon, tier: i.tier, category: i.category, ownRequirement: false, points: String(i.points) }));
  };
  const ideas = IDEAS.filter((i) => i.audience === audience && (i.kind === 'manual' || metrics.some((m) => m.key === i.metric)));

  const save = async () => {
    const problem = !draft.title.trim() ? 'Give it a name.' : !draft.description.trim() ? 'Write what it says when earned.'
      : !requirement.trim() ? 'Write what it takes — a locked badge that will not say what it wants is a tease.'
      : !editing && rows.some((r) => r.key === (draft.key || slugify(draft.title))) ? 'That name is taken — change it a little.'
      : !ruleReady ? 'Finish the rule: what it counts, and the number to reach.' : null;
    if (problem) { showErrorToast(problem); return; }
    setSaving(true);
    try {
      const isBool = chosen?.is_boolean;
      const payload = {
        audience: draft.audience, title: draft.title.trim(), description: draft.description.trim(), requirement: requirement.trim(),
        icon: draft.icon, tier: draft.tier, category: draft.category.trim() || 'General', rule_kind: draft.rule_kind,
        // A hand-given badge carries no rule, or the database's shape constraint rejects it.
        metric: draft.rule_kind === 'metric' ? draft.metric : null,
        threshold: draft.rule_kind === 'metric' ? (isBool ? 1 : Number(draft.threshold)) : null,
        metric2: draft.rule_kind === 'metric' && draft.metric2 ? draft.metric2 : null,
        threshold2: draft.rule_kind === 'metric' && draft.metric2 ? (chosen2?.is_boolean ? 1 : Number(draft.threshold2)) : null,
        sort_order: draft.sort_order, active: editing ? editing.active : true,
        ...(has0206 ? { points: Math.max(0, Math.round(Number(draft.points) || 0)), secret: draft.secret, tell_member: draft.tell } : {}),
      };
      if (editing) {
        // The rule of a level badge is SQL's; only its words and looks change here.
        await updateAchievement(editing.key, locked ? {
          title: payload.title, description: payload.description, requirement: payload.requirement, icon: payload.icon, tier: payload.tier,
          category: payload.category, ...(has0206 ? { points: payload.points, secret: payload.secret, tell_member: payload.tell_member } : {}),
        } : payload);
        showSuccessToast(`"${payload.title}" saved`);
      } else {
        await createAchievement({ ...payload, key: draft.key || slugify(draft.title) });
        showSuccessToast(payload.rule_kind === 'manual' ? `"${payload.title}" created — give it from its card` : `"${payload.title}" created — everyone who already qualifies gets it on their next sync`);
        startNew();
      }
      await load();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };
  const toggleActive = async (a: AchievementRow) => {
    try {
      await setAchievementActive(a.key, !a.active);
      showSuccessToast(a.active ? `"${a.title}" retired — nobody new earns it, and everyone who has it keeps it` : `"${a.title}" is being awarded again`);
      await load();
      setEditing((e) => (e && e.key === a.key ? { ...e, active: !a.active } : e));
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Could not change that');
    }
  };
  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteAchievement(confirmDelete.key);
      showSuccessToast(`"${confirmDelete.title}" deleted`);
      startNew();
      await load();
    } catch (err) {
      // 0038's trigger raises with a count and the advice to retire instead.
      showErrorToast(err instanceof Error ? err.message : 'Could not delete');
    } finally {
      setConfirmDelete(null);
    }
  };

  const pts = Math.max(0, Math.round(Number(draft.points) || 0));
  const kindChips: [Kind, string][] = [['all', 'All'], ['metric', 'Automatic'], ['manual', 'Given by you'], ['builtin', 'Levels'], ['retired', 'Retired'], ...(rarity ? [['never', 'Nobody yet'] as [Kind, string]] : [])];

  if (state === 'unavailable') {
    return <div className="att"><div className="a-card"><p className="a-sub">The achievement catalogue needs migration 0038 — until then the built-in badges still work, they are just not editable.</p></div></div>;
  }
  return (
    <div className="att" data-achievements>
      <div className="a-head">
        <div className="min-w-0"><h1>Achievements</h1><p>Badges members and coaches earn — automatically from what they do, or given by you</p></div>
        <nav className="a-tabs" aria-label="Who earns them" data-rd-tabs style={{ marginLeft: 'auto' }}>
          <button type="button" className={audience === 'member' ? 'on' : ''} onClick={() => { setAudience('member'); setKind('all'); if (!editing) setDraft(blank('member', 0)); }}><Users size={14} />For members <em>{rows.filter((r) => r.audience === 'member').length}</em></button>
          <button type="button" className={audience === 'trainer' ? 'on' : ''} onClick={() => { setAudience('trainer'); setKind('all'); if (!editing) setDraft(blank('trainer', 0)); }} data-audience="trainer"><Dumbbell size={14} />For coaches <em>{rows.filter((r) => r.audience === 'trainer').length}</em></button>
        </nav>
        <button type="button" className="a-btn violet" onClick={startNew}><Plus size={15} />New achievement</button>
      </div>

      <div className="a-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', flex: 'none' }} data-badge-tiles>
        <div className="a-card" style={{ padding: '12px 14px' }}><div className="a-lbl">Earned this month</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><div className="a-num">{month ? month.badges : '—'}</div><span className="a-sub">{month ? `by ${month.people} ${month.people === 1 ? 'person' : 'people'}` : ''}</span></div></div>
        <div className="a-card" style={{ padding: '12px 14px' }}><div className="a-lbl">Most earned</div>
          <div className="a-num truncate" style={{ fontSize: 20 }}>{most ? most.title : '—'}</div><div className="a-sub">{most ? `${holders(most.key)} ${audience === 'member' ? 'members' : 'coaches'} · ${pct(most.key)}%` : 'nobody has a badge yet'}</div></div>
        <div className="a-card" style={{ padding: '12px 14px' }}><div className="a-lbl">Rarest</div>
          <div className="a-num truncate" style={{ fontSize: 20 }}>{rarest && rarest !== most ? rarest.title : '—'}</div><div className="a-sub">{rarest && rarest !== most ? `${holders(rarest.key)} · ${pct(rarest.key)}%` : 'of the ones anybody has'}</div></div>
        <button type="button" className="a-card" style={{ padding: '12px 14px', borderColor: never.length ? '#3e310f' : undefined, textAlign: 'left' }} onClick={() => setKind(kind === 'never' ? 'all' : 'never')} data-never>
          <div className="a-lbl" style={{ color: never.length ? 'var(--a-a300)' : undefined }}>Nobody has these yet</div>
          <div className="a-num">{rarity ? never.length : '—'}</div><div className="a-sub">{never.length ? 'maybe too hard — check them' : live.length ? 'every live badge has been earned' : 'no badges yet'}</div></button>
      </div>

      <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 420px', flex: 1 }}>
        <div className="a-card" data-catalogue>
          <div className="a-ct" style={{ flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {kindChips.map(([k, l]) => <button key={k} type="button" className={`a-chip ${kind === k ? 'v' : ''}`} onClick={() => setKind(k)} data-kind={k}>{l} <em>{counts[k]}</em></button>)}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {rarity && <select className="a-chip" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Order"><option value="catalogue">Catalogue order</option><option value="most">Most earned</option><option value="rarest">Rarest first</option></select>}
              <label className="a-input" style={{ padding: '6px 10px', fontSize: 12, width: 170 }}><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a badge…" aria-label="Find a badge" /></label>
            </div>
          </div>
          <div className="a-scroll grow">
            {state === 'loading' ? <p className="a-sub">Loading…</p> : visible.length === 0 ? <p className="a-sub" style={{ padding: '10px 0' }}>{q ? 'Nothing matches that.' : 'None of this kind yet — make one on the right.'}</p> : groups.map((g) => {
              const items = visible.filter((r) => r.category === g);
              return (
                <div key={g}>
                  <div className="a-cat"><span>{g}</span><span>{items.length}</span></div>
                  <div className="a-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                    {items.map((a) => {
                      const n = holders(a.key);
                      return (
                        <button key={a.key} type="button" className={`a-badge ${editing?.key === a.key ? 'on' : ''}`} style={{ opacity: a.active ? 1 : 0.5, borderStyle: rarity && a.active && n === 0 ? 'dashed' : undefined }} onClick={() => open(a)} data-badge={a.title}>
                          <Medal icon={a.icon} tier={a.tier} locked={!!rarity && a.active && n === 0} />
                          <div className="min-w-0">
                            <b className="truncate">{a.title}{rarity && a.active && n === 0 && <> <span className="a-pill a" style={{ fontSize: 9.5 }}>nobody yet</span></>}{!a.active && <> <span className="a-pill" style={{ fontSize: 9.5 }}>retired</span></>}</b>
                            <small className="truncate" data-tip={ruleSummary(a, metrics)}>{a.rule_kind === 'manual' ? 'chosen by the gym' : a.requirement}</small>
                            <small style={{ color: n ? 'var(--a-p300)' : 'var(--a-muted)' }}>{a.secret ? 'secret until earned · ' : ''}{rarity ? (n ? `${n} have it · ${pct(a.key)}%` : 'nobody has it') : ''}{a.points ? ` · +${a.points} pts` : ''}</small>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="a-card glow" style={{ overflowY: 'auto' }} data-badge-maker>
          <div className="a-ct">
            <h3><Sparkles size={16} />{editing ? `Edit ${editing.title}` : 'New achievement'}</h3>
            {!locked && (
              <div className="a-seg" role="group" aria-label="How it is given">
                <button type="button" className={draft.rule_kind === 'metric' ? 'on' : ''} onClick={() => set({ rule_kind: 'metric' })}>Automatic</button>
                <button type="button" className={draft.rule_kind === 'manual' ? 'on' : ''} onClick={() => set({ rule_kind: 'manual' })}>Given by you</button>
              </div>
            )}
          </div>
          {!editing && ideas.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div className="a-lbl" style={{ marginBottom: 6, display: 'flex', gap: 6, alignItems: 'center' }}><Wand2 size={13} />Start from an idea</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Ideas">
                {ideas.map((i) => <button key={i.label} type="button" className={`a-chip ${draft.title === i.title ? 'on' : ''}`} onClick={() => applyIdea(i)}>{i.label}</button>)}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 10, borderRadius: 14, background: '#120f20', border: '1px solid #33295c' }} data-preview>
            <Medal icon={draft.icon} tier={draft.tier} size={58} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 15 }}>{draft.title || 'Untitled'}</b>
              <div className="a-sub">{draft.description || 'What they read once it is theirs'}</div>
              <div className="a-sub" style={{ color: 'var(--a-a300)', marginTop: 3, textTransform: 'capitalize' }}>{draft.tier}{pts && draft.audience === 'member' ? ` · +${pts} points` : ''} · {draft.category || 'General'}</div>
            </div>
          </div>
          <div className="a-sub" style={{ marginTop: 6 }}>While locked, {draft.audience === 'member' ? 'members' : 'coaches'} read: <b style={{ color: '#fff' }}>{draft.secret ? 'Secret badge — it shows itself when earned.' : requirement || '…'}</b></div>

          {locked ? (
            <div className="a-hint" style={{ marginTop: 10 }}><Lock size={14} /><span>A level badge. Its rule reads the same thresholds as the level on Home, so the two cannot disagree — the words and looks are editable, the rule is not.</span></div>
          ) : draft.rule_kind === 'metric' ? (<>
            <div className="a-lbl" style={{ margin: '12px 0 6px' }}>Earned when</div>
            <div className="a-cond">
              <select aria-label="What it counts" value={draft.metric} onChange={(e) => set({ metric: e.target.value })}>
                <option value="">Pick what it counts…</option>
                {metricsFor.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
              {chosen && !chosen.is_boolean && <><span>reach</span><input aria-label="How many" inputMode="numeric" value={draft.threshold} onChange={(e) => set({ threshold: e.target.value.replace(/\D/g, '') })} placeholder="10" /></>}
            </div>
            {draft.metric2 !== '' || chosen ? (
              draft.metric2 !== '' ? (
                <div className="a-cond" style={{ marginTop: 6 }}>
                  <span className="a-pill v">and</span>
                  <select aria-label="And also" value={draft.metric2} onChange={(e) => set({ metric2: e.target.value })}>
                    {metricsFor.filter((m) => m.key !== draft.metric).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                  {!chosen2?.is_boolean && <><span>reach</span><input aria-label="Second number" inputMode="numeric" value={draft.threshold2} onChange={(e) => set({ threshold2: e.target.value.replace(/\D/g, '') })} /></>}
                  <button type="button" className="a-link" aria-label="Remove the second condition" onClick={() => set({ metric2: '', threshold2: '' })}><X size={14} /></button>
                </div>
              ) : (
                <button type="button" className="a-link a-sub" style={{ marginTop: 6 }} onClick={() => set({ metric2: metricsFor.find((m) => m.key !== draft.metric)?.key ?? '' })}>+ and another condition</button>
              )
            ) : null}
            {qual && ruleReady && (
              <div className="a-hint" style={{ marginTop: 8 }} data-qualify><Users size={14} />
                <span><b style={{ color: '#fff' }}>{qual.qualify} {draft.audience === 'member' ? (qual.qualify === 1 ? 'member' : 'members') : (qual.qualify === 1 ? 'coach' : 'coaches')}</b> already qualify and get it the next time they open the app.{qual.halfway ? ` ${qual.halfway} more are past halfway.` : ''}</span></div>
            )}
          </>) : (
            <div className="a-hint" style={{ marginTop: 10 }}><Gift size={14} /><span>Nobody earns this on their own. Once it exists, open it and use <b style={{ color: '#fff' }}>Give it</b> to choose who gets it.</span></div>
          )}

          <div className="a-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
            <div className="a-fld"><label htmlFor="b-name">Name</label>
              <input id="b-name" className="a-in" value={draft.title} onChange={(e) => set({ title: e.target.value, ...(editing ? {} : { key: slugify(e.target.value) }) })} placeholder="e.g. Sunrise Crew" /></div>
            <div className="a-fld"><label htmlFor="b-group">Group it under</label>
              <input id="b-group" className="a-in" list="badge-groups" value={draft.category} onChange={(e) => set({ category: e.target.value })} />
              <datalist id="badge-groups">{[...new Set(rows.map((r) => r.category))].map((c) => <option key={c} value={c} />)}</datalist></div>
            <div className="a-fld" style={{ gridColumn: '1 / -1' }}><label htmlFor="b-said">What it says when earned</label>
              <input id="b-said" className="a-in" value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder="Ten workouts before 7am. The gym is yours at dawn." /></div>
            <div className="a-fld" style={{ gridColumn: '1 / -1' }}><label htmlFor="b-req">What it says while locked {draft.ownRequirement ? '' : <span style={{ fontWeight: 500 }}>· written from the rule — type to change</span>}</label>
              <input id="b-req" className="a-in" value={requirement} onChange={(e) => set({ ownRequirement: true, requirement: e.target.value })} /></div>
          </div>

          <div className="a-lbl" style={{ margin: '12px 0 6px' }}>Tier <span style={{ fontWeight: 500 }}>· how hard it is, shown as the ring colour</span></div>
          <div className="a-tiers" role="group" aria-label="Tier">
            {TIERS.map(([t, h]) => <button key={t} type="button" className={draft.tier === t ? 'on' : ''} aria-pressed={draft.tier === t} onClick={() => set({ tier: t })}>{t[0].toUpperCase() + t.slice(1)}<small>{h}</small></button>)}
          </div>
          <div className="a-lbl" style={{ margin: '12px 0 6px' }}>Icon</div>
          <div className="a-icons" role="group" aria-label="Icon">
            {BADGE_ICON_NAMES.map((n) => <button key={n} type="button" className={draft.icon === n ? 'on' : ''} aria-label={`Icon ${n}`} aria-pressed={draft.icon === n} onClick={() => set({ icon: n })}>{createElement(badgeIcon(n), { size: 17 })}</button>)}
          </div>

          {has0206 ? (<>
            <div className="a-setting" style={{ padding: '10px 0 4px', borderTop: 0 }}>
              <div className="t"><b>Points when earned</b><small>{draft.audience === 'member' ? 'added to their balance for Rewards, once' : 'coaches have no points balance'}</small></div>
              <input className="a-in" style={{ width: 80, textAlign: 'center' }} inputMode="numeric" aria-label="Points when earned" disabled={draft.audience !== 'member'} value={draft.points} onChange={(e) => set({ points: e.target.value.replace(/\D/g, '') })} />
            </div>
            <div className="a-setting" style={{ padding: '8px 0' }}>
              <div className="t"><b>Secret until earned</b><small>shown as “Secret badge” until they get it</small></div>
              <button type="button" className={`a-toggle ${draft.secret ? '' : 'off'}`} aria-pressed={draft.secret} aria-label="Secret until earned" onClick={() => set({ secret: !draft.secret })} />
            </div>
            <div className="a-setting" style={{ padding: '8px 0' }}>
              <div className="t"><b>Tell the {draft.audience === 'member' ? 'member' : 'coach'}</b><small>a notification the moment it is earned</small></div>
              <button type="button" className={`a-toggle ${draft.tell ? '' : 'off'}`} aria-pressed={draft.tell} aria-label="Tell them" onClick={() => set({ tell: !draft.tell })} />
            </div>
          </>) : (
            <div className="a-hint" style={{ marginTop: 10 }}><Info size={14} /><span>Points when earned, secret badges and telling the member arrive with migration 0206.</span></div>
          )}

          <button type="button" className="a-btn violet" style={{ marginTop: 10 }} disabled={saving} onClick={() => void save()} data-badge-save>
            <Check size={15} />{saving ? 'Saving…' : editing ? `Save ${draft.title || 'badge'}` : `Create ${draft.title || 'the badge'}`}</button>
          {editing && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <button type="button" className={`a-btn sm ${editing.rule_kind === 'manual' ? 'amber' : ''}`} onClick={() => setAwarding(editing)}><Gift size={13} />{editing.rule_kind === 'manual' ? 'Give it' : 'Who has it'}</button>
              <button type="button" className="a-btn ghost sm" onClick={() => void toggleActive(editing)}>{editing.active ? <><EyeOff size={13} />Retire (keep who has it)</> : <><Eye size={13} />Bring back</>}</button>
              {!editing.builtin && <button type="button" className="a-btn ghost sm" onClick={() => setConfirmDelete(editing)}><Trash2 size={13} />Delete</button>}
              <span className="a-sub" style={{ alignSelf: 'center', marginLeft: 'auto' }}>key {editing.key}</span>
            </div>
          )}
        </div>
      </div>

      {awarding && <AwardModal achievement={awarding} onClose={() => setAwarding(null)} onDone={() => void load()} />}
      <ConfirmDialog isOpen={confirmDelete !== null} type="danger" title={`Delete "${confirmDelete?.title ?? ''}"`}
        message="This removes it from the catalogue entirely. If anyone has already earned it the database will refuse — retire it instead, which keeps their badge and stops new ones."
        confirmText="Delete" onConfirm={doDelete} onClose={() => setConfirmDelete(null)} />
    </div>
  );
}
