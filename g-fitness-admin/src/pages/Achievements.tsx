import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award, CalendarCheck, CalendarHeart, ClipboardList, Crown, Dumbbell, Flame, Footprints,
  Gem, Gift, GraduationCap, Handshake, Heart, HeartHandshake, Medal, Moon, Mountain,
  PartyPopper, Repeat, Rocket, Ruler, Shapes, Shield, Smile, Sparkles, Star, Sunrise,
  Swords, Target, ThumbsUp, Timer, Trophy, UserCheck, Users, Zap,
  Plus, Pencil, EyeOff, Eye, Trash2, Gift as GiftIcon, X, Lock, Wand2, Hand, Cpu, Lightbulb,
  type LucideIcon,
} from 'lucide-react';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import {
  RdHeader, RdCard, PageTabs, FilterChips, SearchField, RdSelect, RdButton, Pill, DotMenu, EmptyBlock, TableFooter, RdField,
} from '../components/ui/rd';
import { TONE, RD_INPUT, RD_INPUT_STYLE } from '../components/ui/rdTokens';
import { usePaged } from '../hooks/usePaged';
import { showSuccessToast, showErrorToast } from '../utils/toast';
import {
  listAchievements, listMetrics, createAchievement, updateAchievement,
  deleteAchievement, setAchievementActive, awardAchievement, revokeAchievement,
  listHolders, listAwardCandidates, ruleSummary, achievementRarity, type Rarity,
  type AchievementRow, type AchievementMetric, type AchievementAudience,
  type AchievementTier, type AchievementRuleKind, type AchievementHolder,
} from '../lib/api/achievements';

/**
 * The achievement catalogue, editable (migration 0038).
 *
 * Admin-only, and not just for tidiness: inventing a badge changes what the gym
 * rewards, which is the same class of decision as plan pricing. RLS gives
 * `staff` read access and no writes.
 *
 * Three rule kinds are visible here and they are not interchangeable:
 *   • **Automatic** — a stat and a number. The server awards it to everyone who
 *     qualifies, on their next sync. This is the only kind that can be created.
 *   • **By hand** — no rule. Picked per person: "Member of the Month".
 *   • **Built-in** — the two level badges, whose rule reads `level_thresholds()`
 *     so the badge and the level on Home cannot disagree. Copy is editable, the
 *     rule is not.
 *
 * 2026-10-12, made easy to understand: the three kinds are explained up front
 * (and filter the catalogue), every badge reads as one sentence — "Earned when
 * …" — and a new one can start from a ready idea, with the member's view of it
 * beside the form the whole time.
 */

const SECOND = 'var(--color-text-secondary)';
const MUTED = 'var(--color-text-muted)';
const LINE = '1px solid rgba(255,255,255,0.06)';

/**
 * Duplicated from `g-fitness-member/src/data/achievements.ts` on purpose —
 * there is no shared package here. **Keep the two in step**; the member app's
 * `npm run check:achievements` fails the build if a stored icon name has no
 * component on that side, which is what catches drift.
 */
const ICONS: Record<string, LucideIcon> = {
  Award, CalendarCheck, CalendarHeart, ClipboardList, Crown, Dumbbell, Flame, Footprints,
  Gem, Gift, GraduationCap, Handshake, Heart, HeartHandshake, Medal, Moon, Mountain,
  PartyPopper, Repeat, Rocket, Ruler, Shapes, Shield, Smile, Sparkles, Star, Sunrise,
  Swords, Target, ThumbsUp, Timer, Trophy, UserCheck, Users, Zap,
};
const ICON_NAMES = Object.keys(ICONS).sort();
const iconByName = (n: string): LucideIcon => ICONS[n] ?? Award;

/** Renders a stored icon name; `createElement` because the component comes from a frozen registry. */
function AchievementIcon({ name, size, color }: { name: string; size: number; color: string }) {
  return createElement(iconByName(name), { size, style: { color } });
}

const TIERS: AchievementTier[] = ['bronze', 'silver', 'gold', 'platinum'];
const TIER_RING: Record<AchievementTier, string> = {
  bronze: '#C77B3E', silver: '#A8B0BE', gold: '#F59E0B', platinum: '#A78BFA',
};

/** A badge medallion: the tier's colour as a ring and a glow, the icon in the middle. */
function Medallion({ icon, tier, size = 56, locked }: { icon: string; tier: AchievementTier; size?: number; locked?: boolean }) {
  const c = locked ? 'rgba(255,255,255,0.25)' : TIER_RING[tier];
  return (
    <span className="grid place-items-center flex-none rounded-full" style={{
      width: size, height: size,
      background: locked ? 'rgba(255,255,255,0.04)' : `radial-gradient(circle at 30% 25%, ${c}55, ${c}14 60%, transparent 75%), #1A1530`,
      border: `2px solid ${c}`, boxShadow: locked ? undefined : `0 0 0 4px ${c}1f, 0 10px 28px -12px ${c}`,
    }}>
      <AchievementIcon name={icon} size={Math.round(size * 0.42)} color={locked ? 'rgba(255,255,255,0.45)' : c} />
    </span>
  );
}

/** A key the database will accept, derived from the title as a starting point. */
function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

interface FormState {
  key: string;
  audience: AchievementAudience;
  title: string;
  description: string;
  requirement: string;
  icon: string;
  tier: AchievementTier;
  category: string;
  rule_kind: AchievementRuleKind;
  metric: string;
  threshold: string;
  metric2: string;
  threshold2: string;
  sort_order: number;
}

const EMPTY_FORM: FormState = {
  key: '', audience: 'member', title: '', description: '', requirement: '',
  icon: 'Award', tier: 'bronze', category: 'General',
  rule_kind: 'metric', metric: '', threshold: '', metric2: '', threshold2: '',
  sort_order: 100,
};

/**
 * Ideas to start from (2026-10-12). Each names a real metric from 0038's
 * `achievement_metrics`; one whose metric this gym does not have is not offered.
 */
const IDEAS: { label: string; audience: AchievementAudience; kind: AchievementRuleKind; metric?: string; threshold?: number;
  title: string; description: string; icon: string; tier: AchievementTier; category: string }[] = [
  { label: 'First week done', audience: 'member', kind: 'metric', metric: 'training_days', threshold: 3, title: 'Off the Mark', description: 'Three days in. The hardest part is behind you.', icon: 'Rocket', tier: 'bronze', category: 'Getting started' },
  { label: 'A habit forming', audience: 'member', kind: 'metric', metric: 'consistent_weeks', threshold: 4, title: 'Four Steady Weeks', description: 'Four weeks of training twice or more. That is a habit.', icon: 'Repeat', tier: 'silver', category: 'Consistency' },
  { label: 'Early riser', audience: 'member', kind: 'metric', metric: 'early_checkins', threshold: 10, title: 'Sunrise Crew', description: 'Ten workouts before 7am. The gym is yours at dawn.', icon: 'Sunrise', tier: 'silver', category: 'Habits' },
  { label: 'Class regular', audience: 'member', kind: 'metric', metric: 'classes_attended', threshold: 20, title: 'Class Regular', description: 'Twenty classes. The coaches know your name.', icon: 'Users', tier: 'gold', category: 'Classes' },
  { label: 'One full year', audience: 'member', kind: 'metric', metric: 'days_as_member', threshold: 365, title: 'One Year Strong', description: 'A whole year with us. Thank you.', icon: 'Crown', tier: 'platinum', category: 'Loyalty' },
  { label: 'Member of the month', audience: 'member', kind: 'manual', title: 'Member of the Month', description: 'Chosen by the gym for showing up and lifting others up.', icon: 'Star', tier: 'gold', category: 'Recognition' },
  { label: 'Coach: 50 sessions', audience: 'trainer', kind: 'metric', metric: 'sessions_delivered', threshold: 50, title: 'Fifty Sessions', description: 'Fifty 1-on-1 sessions delivered.', icon: 'Medal', tier: 'gold', category: 'Coaching' },
];

type KindFilter = 'all' | 'metric' | 'manual' | 'builtin' | 'retired' | 'never';

export default function Achievements() {
  const [rows, setRows] = useState<AchievementRow[]>([]);
  const [metrics, setMetrics] = useState<AchievementMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [audience, setAudience] = useState<AchievementAudience>('member');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');

  const [editing, setEditing] = useState<AchievementRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<AchievementRow | null>(null);
  const [awarding, setAwarding] = useState<AchievementRow | null>(null);
  /** Who holds what (0093) — null until it is pasted, and the cards then say nothing. */
  const [rarity, setRarity] = useState<Map<string, Rarity> | null>(null);
  const [sort, setSort] = useState<'catalogue' | 'rarest' | 'most'>('catalogue');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, m] = await Promise.all([listAchievements(true), listMetrics()]);
      setRows(a);
      setMetrics(m);
      setUnavailable(false);
      setRarity(await achievementRarity().catch(() => null));
    } catch (err) {
      setRows([]);
      setUnavailable(true);
      showErrorToast(err instanceof Error ? err.message : 'Could not load achievements');
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const forAudience = useMemo(() => rows.filter((r) => r.audience === audience), [rows, audience]);
  const holdersOf = (key: string) => rarity?.get(key)?.holders ?? 0;
  const neverEarned = forAudience.filter((r) => r.active && rarity && holdersOf(r.key) === 0);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return forAudience
      .filter((r) => kind === 'all' ? true : kind === 'retired' ? !r.active : kind === 'never' ? r.active && !!rarity && (rarity.get(r.key)?.holders ?? 0) === 0 : r.rule_kind === kind)
      .filter((r) => !q || r.title.toLowerCase().includes(q) || r.key.includes(q) || r.category.toLowerCase().includes(q) || r.requirement.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sort === 'catalogue' || !rarity) return 0;
        const ha = rarity.get(a.key)?.holders ?? 0;
        const hb = rarity.get(b.key)?.holders ?? 0;
        return sort === 'rarest' ? ha - hb : hb - ha;
      });
  }, [forAudience, kind, search, sort, rarity]);

  const paged = usePaged(visible, 12);

  const metricsFor = useMemo(() => metrics.filter((m) => m.audience === form.audience), [metrics, form.audience]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, audience, sort_order: 100 + rows.filter((r) => r.audience === audience).length });
    setCreating(true);
  };

  const openEdit = (a: AchievementRow) => {
    setForm({
      key: a.key, audience: a.audience, title: a.title, description: a.description,
      requirement: a.requirement, icon: a.icon, tier: a.tier, category: a.category,
      rule_kind: a.rule_kind,
      metric: a.metric ?? '', threshold: a.threshold?.toString() ?? '',
      metric2: a.metric2 ?? '', threshold2: a.threshold2?.toString() ?? '',
      sort_order: a.sort_order,
    });
    setEditing(a);
  };

  const closeForm = () => { setCreating(false); setEditing(null); setForm(EMPTY_FORM); };

  const validate = (): string | null => {
    if (!form.title.trim()) return 'Give it a name.';
    if (!form.description.trim()) return 'Write the line the member sees once they earn it.';
    if (!form.requirement.trim()) return 'Write what it takes — a locked badge that will not say what it wants is a tease.';
    if (creating && !form.key.trim()) return 'The key cannot be empty.';
    if (creating && rows.some((r) => r.key === form.key.trim())) return `"${form.key.trim()}" is already taken — change the name a little.`;
    if (form.rule_kind === 'metric') {
      if (!form.metric) return 'Pick what the rule counts.';
      const m = metrics.find((x) => x.key === form.metric);
      if (!m?.is_boolean && !form.threshold.trim()) return 'Set the number to reach.';
      if (form.metric2 && !form.threshold2.trim()) return 'The second condition needs a number too.';
    }
    return null;
  };

  const save = async () => {
    const problem = validate();
    if (problem) { showErrorToast(problem); return; }
    setSaving(true);
    try {
      const isBool = metrics.find((x) => x.key === form.metric)?.is_boolean;
      const payload = {
        audience: form.audience,
        title: form.title.trim(),
        description: form.description.trim(),
        requirement: form.requirement.trim(),
        icon: form.icon,
        tier: form.tier,
        category: form.category.trim() || 'General',
        rule_kind: form.rule_kind,
        // A manual achievement carries no rule, or the database's shape constraint rejects it.
        metric: form.rule_kind === 'metric' ? form.metric : null,
        threshold: form.rule_kind === 'metric' ? (isBool ? 1 : Number(form.threshold)) : null,
        metric2: form.rule_kind === 'metric' && form.metric2 ? form.metric2 : null,
        threshold2: form.rule_kind === 'metric' && form.metric2 ? Number(form.threshold2) : null,
        sort_order: form.sort_order,
        active: editing ? editing.active : true,
      };
      if (editing) {
        // `key` is deliberately absent: it joins to every earned unlock.
        await updateAchievement(editing.key, payload);
        showSuccessToast(`"${payload.title}" updated`);
      } else {
        await createAchievement({ ...payload, key: form.key.trim() });
        showSuccessToast(payload.rule_kind === 'manual'
          ? `"${payload.title}" created — give it with the gift button on its card`
          : `"${payload.title}" created — everyone who already qualifies gets it on their next sync`);
      }
      closeForm();
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
      showSuccessToast(a.active
        ? `"${a.title}" retired — nobody new will earn it, and everyone who has it keeps it`
        : `"${a.title}" is being awarded again`);
      await load();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Could not change that');
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteAchievement(confirmDelete.key);
      showSuccessToast(`"${confirmDelete.title}" deleted`);
      setConfirmDelete(null);
      await load();
    } catch (err) {
      // 0038's trigger raises here with a count and the advice to retire instead.
      showErrorToast(err instanceof Error ? err.message : 'Could not delete');
      setConfirmDelete(null);
    }
  };

  const countKind = (k: AchievementRuleKind) => forAudience.filter((r) => r.rule_kind === k).length;
  const KINDS: { key: AchievementRuleKind; icon: LucideIcon; title: string; body: string; tone: 'violet' | 'amber' | 'gray' }[] = [
    { key: 'metric', icon: Cpu, title: 'Automatic', body: 'A goal with a number. The app gives it to everyone who reaches it — you never hand these out.', tone: 'violet' },
    { key: 'manual', icon: Hand, title: 'By hand', body: 'No goal. You give it to someone you choose, like Member of the Month.', tone: 'amber' },
    { key: 'builtin', icon: Lock, title: 'Built-in', body: 'The level badges. Their rule matches the level on Home, so it cannot change — the words can.', tone: 'gray' },
  ];

  return (
    <div className="rd-fit" data-achievements>
      <RdHeader title="Achievements" subtitle="Badges members and coaches collect in the app — for showing up, for milestones, or because you chose them."
        actions={!unavailable ? <RdButton variant="primary" icon={Plus} onClick={openCreate}>New achievement</RdButton> : undefined} />

      {unavailable ? (
        <RdCard className="rd-fit-fill">
          <EmptyBlock icon={Trophy} title="The achievement catalogue is not available yet"
            body={<>Migration <span className="font-mono">0038_achievements_as_data.sql</span> creates the table and moves the existing achievements into it. Until then the built-in ones still work — they are just not editable.</>} />
        </RdCard>
      ) : (
        <>
          {/* The three kinds, explained where they are counted — and each one filters the catalogue. */}
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }} data-kinds>
            {KINDS.map((k) => {
              const on = kind === k.key;
              const Icon = k.icon;
              return (
                <button key={k.key} type="button" onClick={() => setKind(on ? 'all' : k.key)} aria-pressed={on} data-kind={k.key}
                  className="rounded-2xl px-4 py-3 text-left flex items-start gap-3 transition-colors"
                  style={{ background: on ? TONE[k.tone].bg : 'var(--color-surface)', border: `1px solid ${on ? TONE[k.tone].line : 'rgba(255,255,255,0.06)'}` }}>
                  <span className="w-10 h-10 rounded-xl grid place-items-center flex-none" style={{ background: TONE[k.tone].bg, border: `1px solid ${TONE[k.tone].line}` }}>
                    <Icon size={18} style={{ color: TONE[k.tone].fg }} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-2"><b className="text-[15px] text-white">{k.title}</b><span className="text-[20px] font-bold text-white tabular-nums">{countKind(k.key)}</span></span>
                    <span className="block text-[12.5px] mt-0.5 leading-snug" style={{ color: SECOND }}>{k.body}</span>
                  </span>
                </button>
              );
            })}
            {rarity && (
              <button type="button" onClick={() => setKind(kind === 'never' ? 'all' : 'never')} aria-pressed={kind === 'never'}
                className="rounded-2xl px-4 py-3 text-left flex items-start gap-3"
                style={{ background: kind === 'never' ? TONE.amber.bg : 'var(--color-surface)', border: `1px solid ${kind === 'never' ? TONE.amber.line : 'rgba(255,255,255,0.06)'}` }}>
                <span className="w-10 h-10 rounded-xl grid place-items-center flex-none" style={{ background: TONE.amber.bg, border: `1px solid ${TONE.amber.line}` }}>
                  <Lightbulb size={18} style={{ color: TONE.amber.fg }} />
                </span>
                <span className="min-w-0">
                  <span className="flex items-baseline gap-2"><b className="text-[15px] text-white">Nobody has it yet</b><span className="text-[20px] font-bold text-white tabular-nums">{neverEarned.length}</span></span>
                  <span className="block text-[12.5px] mt-0.5 leading-snug" style={{ color: SECOND }}>Live badges no one has earned — often a goal set too high.</span>
                </span>
              </button>
            )}
          </div>

          <RdCard className="flex flex-col min-h-0 overflow-hidden rd-fit-fill" data-catalogue>
            <div className="flex items-center gap-2.5 flex-wrap px-4 py-3" style={{ borderBottom: LINE }}>
              <PageTabs<AchievementAudience> label="Who earns them" value={audience} onChange={(a) => { setAudience(a); paged.setPage(1); }} tabs={[
                { key: 'member', label: `Members (${rows.filter((r) => r.audience === 'member').length})`, icon: Users },
                { key: 'trainer', label: `Coaches (${rows.filter((r) => r.audience === 'trainer').length})`, icon: Dumbbell },
              ]} />
              <div className="flex-1 min-w-[200px]"><SearchField value={search} onChange={setSearch} placeholder="Find a badge" label="Find a badge by name, group or goal" /></div>
              <FilterChips<KindFilter> compact value={kind === 'retired' || kind === 'all' ? kind : 'all'} onChange={setKind} items={[
                { key: 'all', label: 'All', count: forAudience.length },
                { key: 'retired', label: 'Retired', count: forAudience.filter((r) => !r.active).length },
              ]} />
              {rarity && (
                <RdSelect label="Order" value={sort} onChange={(v) => setSort(v as typeof sort)} className="w-[170px]">
                  <option value="catalogue">Catalogue order</option>
                  <option value="most">Most earned</option>
                  <option value="rarest">Rarest first</option>
                </RdSelect>
              )}
            </div>
            <div className="rd-fit-scroll p-4">
              {loading ? (
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))' }}>
                  {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-40 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />)}
                </div>
              ) : visible.length === 0 ? (
                <EmptyBlock compact icon={Trophy}
                  title={search ? 'Nothing matches that' : kind !== 'all' ? 'None of this kind yet' : 'No achievements for this group yet'}
                  body={search ? 'Try a shorter search.' : 'Create one — start from an idea, it takes a minute.'}
                  action={!search ? <RdButton variant="soft" icon={Plus} onClick={openCreate}>Add the first one</RdButton> : undefined} />
              ) : (
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))' }}>
                  {paged.visible.map((a) => {
                    const r = rarity?.get(a.key);
                    const pct = r?.audience ? Math.round((r.holders / r.audience) * 100) : 0;
                    return (
                      <RdCard key={a.key} className="p-4 flex flex-col gap-3" style={{ opacity: a.active ? 1 : 0.55 }} data-badge={a.title}>
                        <div className="flex items-start gap-3">
                          <Medallion icon={a.icon} tier={a.tier} size={52} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-semibold text-white leading-snug">{a.title}</p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <Pill tone={a.rule_kind === 'manual' ? 'amber' : a.rule_kind === 'builtin' ? 'gray' : 'violet'}>
                                {a.rule_kind === 'manual' ? 'By hand' : a.rule_kind === 'builtin' ? 'Built-in' : 'Automatic'}
                              </Pill>
                              <span className="text-[12px] capitalize" style={{ color: TIER_RING[a.tier] }}>{a.tier}</span>
                              {!a.active && <span className="text-[12px]" style={{ color: MUTED }}>— retired</span>}
                            </div>
                          </div>
                          <DotMenu label={`More for ${a.title}`} items={[
                            { label: 'Edit', icon: Pencil, onClick: () => openEdit(a) },
                            { label: a.active ? 'Retire (keep who has it)' : 'Bring back', icon: a.active ? EyeOff : Eye, onClick: () => void toggleActive(a), tone: a.active ? 'warn' : undefined },
                            // A built-in has its rule in SQL, which this screen cannot express — retired, never deleted.
                            { label: 'Delete', icon: Trash2, onClick: () => setConfirmDelete(a), tone: 'danger', hidden: a.builtin },
                          ]} />
                        </div>
                        {/* The badge in one sentence: what it takes, then what they read. */}
                        <div className="rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.025)', border: LINE }}>
                          <p className="text-[12px]" style={{ color: MUTED }}>{a.rule_kind === 'manual' ? 'Given by you' : 'Earned when'}</p>
                          <p className="text-[13.5px] text-white leading-snug">{a.requirement}</p>
                          <p className="text-[12px] mt-1" style={{ color: MUTED }} data-tip={ruleSummary(a, metrics)}>{a.category}</p>
                        </div>
                        {r && (
                          <div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                              <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: TIER_RING[a.tier] }} />
                            </div>
                            <p className="text-[12px] mt-1" style={{ color: SECOND }}>
                              {r.holders === 0 ? 'Nobody has earned it yet' : `${r.holders} of ${r.audience} active ${a.audience === 'member' ? 'members' : 'coaches'} — ${pct}%`}
                            </p>
                          </div>
                        )}
                        <div className="mt-auto flex gap-1.5">
                          <RdButton size="sm" variant={a.rule_kind === 'manual' ? 'amber' : 'ghost'} icon={GiftIcon} onClick={() => setAwarding(a)}>
                            {a.rule_kind === 'manual' ? 'Give it' : 'Who has it'}
                          </RdButton>
                          <RdButton size="sm" variant="ghost" icon={Pencil} onClick={() => openEdit(a)} className="ml-auto">Edit</RdButton>
                        </div>
                      </RdCard>
                    );
                  })}
                </div>
              )}
            </div>
            {visible.length > 0 && (
              <div style={{ borderTop: LINE }}>
                <TableFooter page={paged.page} perPage={paged.perPage} total={paged.total} noun="achievements" onPage={paged.setPage} />
              </div>
            )}
          </RdCard>
        </>
      )}

      {(creating || editing) && (
        <AchievementForm form={form} setForm={setForm} metrics={metricsFor} allMetrics={metrics}
          isNew={creating} saving={saving} onClose={closeForm} onSave={save} />
      )}

      {awarding && (
        <AwardModal achievement={awarding} onClose={() => setAwarding(null)} onDone={() => { setAwarding(null); void load(); }} />
      )}

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        type="danger"
        title={`Delete "${confirmDelete?.title ?? ''}"`}
        message={'This removes it from the catalogue entirely. If anyone has already earned it the database will refuse — retire it instead, which keeps their badge and stops new ones.'}
        confirmText="Delete"
        onConfirm={doDelete}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}

// ─── Create / edit ───────────────────────────────────────────────────────────

function AchievementForm({
  form, setForm, metrics, allMetrics, isNew, saving, onClose, onSave,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  metrics: AchievementMetric[];
  allMetrics: AchievementMetric[];
  isNew: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const chosen = allMetrics.find((m) => m.key === form.metric);
  const chosen2 = allMetrics.find((m) => m.key === form.metric2);
  const locked = form.rule_kind === 'builtin';
  // A new one is made in three steps; an existing one opens on everything at once.
  const [step, setStep] = useState(isNew ? 0 : -1);
  const [advanced, setAdvanced] = useState(false);
  // The requirement line writes itself from the rule until the owner types their own.
  const [ownRequirement, setOwnRequirement] = useState(!isNew);

  const chip = (on: boolean): React.CSSProperties => on
    ? { background: 'rgba(124,58,237,0.22)', color: '#EDE9FE', border: '1px solid rgba(139,92,246,0.7)' }
    : { background: 'rgba(255,255,255,0.02)', color: SECOND, border: '1px solid rgba(255,255,255,0.1)' };

  const autoRequirement = () => {
    if (form.rule_kind === 'manual') return 'Given by the gym.';
    if (!chosen) return '';
    const one = chosen.is_boolean ? chosen.label : `Reach ${form.threshold || '…'} ${chosen.label.toLowerCase()}`;
    const two = chosen2 ? (chosen2.is_boolean ? `, and ${chosen2.label.toLowerCase()}` : `, and ${form.threshold2 || '…'} ${chosen2.label.toLowerCase()}`) : '';
    return `${one}${two}.`;
  };
  const requirement = ownRequirement ? form.requirement : autoRequirement();
  const commit = () => {
    if (!ownRequirement) setForm((f) => ({ ...f, requirement: autoRequirement() }));
  };

  const ruleReady = locked || form.rule_kind === 'manual' || (!!form.metric && (chosen?.is_boolean || Number(form.threshold) > 0)
    && (!form.metric2 || chosen2?.is_boolean || Number(form.threshold2) > 0));
  const looksReady = !!form.title.trim() && !!form.description.trim();

  /** An idea fills every step; the owner can change any of it after. */
  const applyIdea = (i: typeof IDEAS[number]) => {
    setForm((f) => ({ ...f, audience: i.audience, rule_kind: i.kind, metric: i.metric ?? '', threshold: i.threshold ? String(i.threshold) : '',
      metric2: '', threshold2: '', title: i.title, key: slugify(i.title), description: i.description, icon: i.icon, tier: i.tier, category: i.category }));
    setOwnRequirement(false);
  };
  const ideas = IDEAS.filter((i) => i.kind === 'manual' || allMetrics.some((m) => m.key === i.metric));

  /** What a member sees: the badge locked (with the goal), then earned (with your line). */
  const preview = (
    <div className="space-y-3" data-preview>
      <p className="text-[13px] font-semibold" style={{ color: SECOND }}>What {form.audience === 'member' ? 'a member' : 'a coach'} sees</p>
      {[false, true].map((earned) => (
        <div key={String(earned)} className="rounded-2xl p-3.5 flex items-center gap-3"
          style={{ background: earned ? 'radial-gradient(120% 140% at 0% 0%, rgba(124,58,237,0.18), transparent 60%), var(--color-surface)' : 'var(--color-surface)', border: LINE }}>
          <Medallion icon={form.icon} tier={form.tier} size={48} locked={!earned} />
          <div className="min-w-0">
            <p className="text-[12px] font-semibold" style={{ color: earned ? TIER_RING[form.tier] : MUTED }}>{earned ? 'Earned' : 'Locked'}</p>
            <p className="text-[14px] font-semibold text-white truncate">{form.title || 'Untitled'}</p>
            <p className="text-[12.5px] leading-snug" style={{ color: SECOND }}>{earned ? (form.description || 'What they read once it is theirs') : (requirement || 'What they need to do')}</p>
          </div>
        </div>
      ))}
      <p className="text-[12px] leading-relaxed" style={{ color: MUTED }}>
        {locked ? 'Its rule is built in.' : form.rule_kind === 'manual'
          ? `You give it by hand to a ${form.audience === 'member' ? 'member' : 'coach'} — nobody earns it alone.`
          : 'Given automatically on each person\'s next sync — anyone who already qualifies gets it straight away.'}
      </p>
    </div>
  );

  const rule = locked ? (
    <p className="text-[13px] p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', color: SECOND }}>
      This is a built-in level badge. Its rule reads the same thresholds as the level on the member's Home screen,
      so the two cannot disagree — the wording and icon are editable, the rule is not.
    </p>
  ) : (
    <div className="space-y-4">
      {isNew && ideas.length > 0 && (
        <div>
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-white mb-1.5"><Wand2 size={14} style={{ color: '#C4B5FD' }} /> Start from an idea</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ideas">
            {ideas.map((i) => (
              <button key={i.label} type="button" onClick={() => applyIdea(i)} className="h-8 px-3 rounded-full text-[12.5px] font-semibold"
                style={chip(form.title === i.title)}>{i.label}</button>
            ))}
          </div>
          <p className="text-[12px] mt-1.5" style={{ color: MUTED }}>Or build your own below — every step can be changed.</p>
        </div>
      )}
      {isNew && (
        <div>
          <span className="block text-[13px] font-semibold text-white mb-1.5">Who earns it?</span>
          <div className="flex gap-2">
            {([['member', 'Members'], ['trainer', 'Coaches']] as const).map(([k, t]) => (
              <button key={k} type="button" onClick={() => setForm((f) => ({ ...f, audience: k, metric: '', metric2: '' }))}
                className="h-9 px-4 rounded-xl text-[13px] font-semibold" style={chip(form.audience === k)}>{t}</button>
            ))}
          </div>
        </div>
      )}
      <div>
        <span className="block text-[13px] font-semibold text-white mb-1.5">How is it given?</span>
        <div className="grid grid-cols-2 gap-2">
          {([['metric', 'Automatically', 'When a number is reached — nobody has to remember.', Cpu],
             ['manual', 'By hand', 'You give it to someone you choose.', Hand]] as const).map(([k, t, h, Icon]) => (
            <button key={k} type="button" onClick={() => set('rule_kind', k)} className="text-left rounded-xl p-3 flex gap-2.5" style={chip(form.rule_kind === k)}>
              <Icon size={18} className="flex-none mt-0.5" />
              <span><span className="block text-[14px] font-semibold">{t}</span><span className="block text-[12px] mt-0.5" style={{ color: SECOND }}>{h}</span></span>
            </button>
          ))}
        </div>
      </div>
      {form.rule_kind === 'metric' && (
        <>
          <div>
            <span className="block text-[13px] font-semibold text-white">What does it count?</span>
            <span className="block text-[12px] mb-1.5" style={{ color: SECOND }}>Counted by the database from what really happened — nobody types it.</span>
            <div className="grid gap-1.5 max-h-48 overflow-y-auto pr-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
              {metrics.map((m) => (
                <button key={m.key} type="button" onClick={() => set('metric', m.key)}
                  className="text-left rounded-lg px-3 py-2 text-[12.5px] font-medium" style={chip(form.metric === m.key)}>
                  {m.label}{m.unit ? <span style={{ color: MUTED }}> · {m.unit}</span> : null}
                </button>
              ))}
            </div>
          </div>
          {chosen && !chosen.is_boolean && (
            <div>
              <span className="block text-[13px] font-semibold text-white mb-1.5">How many?</span>
              <div className="flex items-center gap-2 flex-wrap">
                <input type="number" min={1} value={form.threshold} onChange={(e) => set('threshold', e.target.value)} aria-label="How many"
                  placeholder="10" className={`${RD_INPUT} w-28`} style={RD_INPUT_STYLE} />
                {[5, 10, 25, 50, 100].map((n) => (
                  <button key={n} type="button" onClick={() => set('threshold', String(n))} className="h-9 px-3 rounded-lg text-[13px] font-semibold"
                    style={chip(form.threshold === String(n))}>{n}</button>
                ))}
              </div>
            </div>
          )}
          {/* The goal, said back as a sentence before anything else is asked. */}
          {chosen && (
            <p className="text-[13.5px] rounded-xl px-3 py-2.5" style={{ background: TONE.violet.bg, border: `1px solid ${TONE.violet.line}`, color: '#DDD6FE' }} data-goal-sentence>
              Earned when {form.audience === 'member' ? 'a member' : 'a coach'} reaches <b className="text-white">{autoRequirement().replace(/^Reach /, '').replace(/\.$/, '') || '…'}</b>.
            </p>
          )}
          <details className="rounded-lg" open={!!form.metric2}>
            <summary className="text-[12.5px] font-semibold cursor-pointer" style={{ color: SECOND }}>Add a second condition (optional)</summary>
            <div className="grid gap-3 mt-2" style={{ gridTemplateColumns: 'minmax(0, 1fr) 120px' }}>
              <RdSelect label="And also" value={form.metric2} onChange={(v) => set('metric2', v)} className="w-full">
                <option value="">No second condition</option>
                {metrics.filter((m) => m.key !== form.metric).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </RdSelect>
              {form.metric2 && !chosen2?.is_boolean ? (
                <input type="number" min={1} value={form.threshold2} onChange={(e) => set('threshold2', e.target.value)} aria-label="Second number"
                  className={RD_INPUT} style={RD_INPUT_STYLE} />
              ) : <div className="h-11" />}
            </div>
          </details>
        </>
      )}
      {form.rule_kind === 'manual' && (
        <p className="text-[13px] p-3 rounded-xl" style={{ background: TONE.amber.bg, color: TONE.amber.fg }}>
          Nobody earns this on their own. Once it exists, use <b>Give it</b> on its card to choose who gets it.
        </p>
      )}
    </div>
  );

  const looks = (
    <div className="space-y-3.5">
      <RdField label="Name">
        <input value={form.title} onChange={(e) => { set('title', e.target.value); if (isNew) set('key', slugify(e.target.value)); }}
          placeholder="e.g. Ten-Day Club" aria-label="Title" className={RD_INPUT} style={RD_INPUT_STYLE} />
      </RdField>
      <RdField label="What they read once it is theirs" hint="Past tense, to whoever earned it.">
        <input value={form.description} onChange={(e) => set('description', e.target.value)} aria-label="Description"
          placeholder="You trained ten days. That's a habit forming." className={RD_INPUT} style={RD_INPUT_STYLE} />
      </RdField>
      <RdField label="What they read while it is locked" hint={ownRequirement ? undefined : 'Written from the goal — type to change it.'}>
        <input value={requirement} aria-label="Requirement" onChange={(e) => { setOwnRequirement(true); set('requirement', e.target.value); }}
          placeholder="Train on ten different days." className={RD_INPUT} style={RD_INPUT_STYLE} />
      </RdField>
      <div>
        <span className="block text-[13px] font-medium mb-1.5" style={{ color: SECOND }}>Tier</span>
        <div className="flex gap-2 flex-wrap">
          {TIERS.map((t) => (
            <button key={t} type="button" onClick={() => set('tier', t)} className="h-9 px-3.5 rounded-xl text-[13px] font-semibold capitalize flex items-center gap-1.5"
              style={chip(form.tier === t)}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: TIER_RING[t] }} />{t}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="block text-[13px] font-medium mb-1.5" style={{ color: SECOND }}>Icon</span>
        <div className="grid grid-cols-9 gap-1.5 max-h-32 overflow-y-auto p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: LINE }}>
          {ICON_NAMES.map((n) => {
            const on = form.icon === n;
            return (
              <button key={n} type="button" aria-label={`Icon ${n}`} onClick={() => set('icon', n)}
                className="aspect-square rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
                style={{ background: on ? 'rgba(124,58,237,0.25)' : 'transparent', border: `1px solid ${on ? 'rgba(139,92,246,0.7)' : 'transparent'}` }}>
                <AchievementIcon name={n} size={16} color={on ? '#EDE9FE' : '#fff'} />
              </button>
            );
          })}
        </div>
      </div>
      <RdField label="Group" hint="Where it sits in the member's gallery.">
        <input value={form.category} onChange={(e) => set('category', e.target.value)} aria-label="Category" className={RD_INPUT} style={RD_INPUT_STYLE} />
      </RdField>
      <div>
        <button type="button" className="text-[12.5px] font-semibold" style={{ color: SECOND }} onClick={() => setAdvanced((v) => !v)}>
          {advanced ? '▾' : '▸'} Advanced
        </button>
        {advanced && (
          <div className="mt-2">
            <RdField label="Key" hint={isNew ? 'Made from the name. It links every earned badge to this one, so it cannot change after creating.' : 'Fixed once created.'}>
              <input value={form.key} disabled={!isNew} onChange={(e) => set('key', slugify(e.target.value))} aria-label="Key"
                className={`${RD_INPUT} font-mono disabled:opacity-60`} style={RD_INPUT_STYLE} />
            </RdField>
          </div>
        )}
      </div>
    </div>
  );

  const STEPS = ['What earns it', 'How it looks', 'Check and create'];

  return (
    <Modal isOpen onClose={onClose} hideFooter size="lg" title={isNew ? 'New achievement' : `Edit "${form.title}"`}>
      <div className="space-y-4">
        {step >= 0 && (
          <ol className="flex gap-2" aria-label="Steps">
            {STEPS.map((t, i) => (
              <li key={t} className="flex-1">
                <div className="h-1 rounded-full" style={{ background: i <= step ? '#8B5CF6' : 'rgba(255,255,255,0.1)' }} />
                <p className="text-[12px] mt-1 font-semibold" style={{ color: i === step ? '#fff' : SECOND }}>{i + 1}. {t}</p>
              </li>
            ))}
          </ol>
        )}

        {/* The form on the left, the member's view on the right — always in sight. */}
        <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)' }}>
          <div className="min-w-0">
            {step === 0 && rule}
            {step === 1 && looks}
            {step === 2 && (
              <div className="space-y-3">
                <p className="text-[14px] text-white">Everything ready. Here is the badge as it will appear.</p>
                <p className="text-[13px]" style={{ color: SECOND }}>
                  {form.rule_kind === 'manual' ? `You give it by hand to a ${form.audience === 'member' ? 'member' : 'coach'}.` : `Earned automatically by ${form.audience === 'member' ? 'members' : 'coaches'}: ${requirement}`}
                  {' '}Tier: {form.tier}. Group: {form.category}.
                </p>
              </div>
            )}
            {step === -1 && (
              <div className="space-y-5">
                {looks}
                <div className="pt-4" style={{ borderTop: LINE }}>
                  <p className="text-[14px] font-semibold text-white mb-3">How it is earned</p>
                  {rule}
                </div>
              </div>
            )}
          </div>
          <div className="min-w-0">{preview}</div>
        </div>

        <div className="flex justify-between gap-2 pt-2" style={{ borderTop: LINE }}>
          <RdButton variant="ghost" onClick={step > 0 ? () => setStep(step - 1) : onClose} disabled={saving}>{step > 0 ? 'Back' : 'Cancel'}</RdButton>
          {step >= 0 && step < 2 ? (
            <RdButton variant="primary" onClick={() => { commit(); setStep(step + 1); }} disabled={step === 0 ? !ruleReady : !looksReady}>Next</RdButton>
          ) : (
            <RdButton variant="primary" onClick={() => { commit(); onSave(); }} disabled={saving || !ruleReady || !looksReady}>
              {saving ? 'Saving…' : isNew ? 'Create' : 'Save changes'}
            </RdButton>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─── Award by hand ───────────────────────────────────────────────────────────

function AwardModal({
  achievement, onClose, onDone,
}: { achievement: AchievementRow; onClose: () => void; onDone: () => void }) {
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([]);
  const [holders, setHolders] = useState<AchievementHolder[]>([]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [p, h] = await Promise.all([listAwardCandidates(achievement.audience), listHolders(achievement.key)]);
      setPeople(p);
      setHolders(h);
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Could not load');
    }
  }, [achievement]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);

  const held = new Set(holders.map((h) => h.user_id));
  const available = people.filter((p) => !held.has(p.id));

  const give = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      await awardAchievement(pick, achievement.key);
      showSuccessToast('Awarded');
      setPick('');
      await refresh();
      onDone();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Could not award');
    } finally {
      setBusy(false);
    }
  };

  const take = async (userId: string) => {
    setBusy(true);
    try {
      await revokeAchievement(userId, achievement.key);
      showSuccessToast('Removed');
      await refresh();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Could not remove');
    } finally {
      setBusy(false);
    }
  };

  const who = achievement.audience === 'member' ? 'member' : 'coach';
  return (
    <Modal isOpen onClose={onClose} hideFooter title={`${achievement.rule_kind === 'manual' ? 'Give' : 'Who has'} "${achievement.title}"`}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Medallion icon={achievement.icon} tier={achievement.tier} size={48} />
          <p className="text-[13px]" style={{ color: SECOND }}>{achievement.requirement}</p>
        </div>
        {achievement.rule_kind !== 'manual' && (
          // Said plainly: revoking an automatic achievement somebody still qualifies for lasts until their next sync.
          <p className="text-[12.5px] p-3 rounded-xl" style={{ background: TONE.amber.bg, color: TONE.amber.fg }}>
            This one is given automatically. You can still give it by hand — useful for records from before the app — but taking it from
            someone who genuinely qualifies will not stick: the server gives it back on their next sync.
          </p>
        )}

        <div>
          <span className="block text-[13px] font-medium mb-1.5" style={{ color: SECOND }}>Give it to a {who}</span>
          <div className="flex gap-2">
            <RdSelect label={`Choose a ${who}`} value={pick} onChange={setPick} className="flex-1">
              <option value="">{available.length === 0 ? 'Everyone already has it' : `Choose a ${who}…`}</option>
              {available.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </RdSelect>
            <RdButton variant="amber" icon={GiftIcon} onClick={give} disabled={!pick || busy}>Award</RdButton>
          </div>
        </div>

        <div className="pt-3" style={{ borderTop: LINE }}>
          <p className="text-[13px] font-semibold text-white mb-2">Holding it ({holders.length})</p>
          {holders.length === 0 ? (
            <p className="text-[13px] py-4 text-center" style={{ color: MUTED }}>Nobody yet</p>
          ) : (
            <div className="max-h-56 overflow-y-auto space-y-1">
              {holders.map((h) => (
                <div key={h.user_id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="min-w-0">
                    <p className="text-[13.5px] text-white truncate">{h.name}</p>
                    <p className="text-[12px]" style={{ color: MUTED }}>{h.unlocked_on}</p>
                  </div>
                  <button type="button" onClick={() => take(h.user_id)} disabled={busy} aria-label={`Remove from ${h.name}`} data-tip="Remove"
                    className="w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 hover:bg-white/[0.06]" style={{ color: MUTED, border: LINE }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <RdButton onClick={onClose}>Done</RdButton>
        </div>
      </div>
    </Modal>
  );
}
