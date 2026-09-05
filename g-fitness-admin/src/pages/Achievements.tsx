import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award, CalendarCheck, CalendarHeart, ClipboardList, Crown, Dumbbell, Flame, Footprints,
  Gem, Gift, GraduationCap, Handshake, Heart, HeartHandshake, Medal, Moon, Mountain,
  PartyPopper, Repeat, Rocket, Ruler, Shapes, Shield, Smile, Sparkles, Star, Sunrise,
  Swords, Target, ThumbsUp, Timer, Trophy, UserCheck, Users, Zap,
  Plus, Pencil, EyeOff, Eye, Trash2, Gift as GiftIcon, X, Lock,
  type LucideIcon,
} from 'lucide-react';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Pagination from '../components/ui/Pagination';
import {
  PageHeader, StatTiles, Section, EmptyState, CardGrid, TileCard,
  SearchBox, Chips, Toolbar, PageSummary,
} from '../components/ui/kit';
import { usePaged } from '../hooks/usePaged';
import FormField, { SectionLabel, FieldDivider } from '../components/ui/FormField';
import { showSuccessToast, showErrorToast } from '../utils/toast';
import {
  listAchievements, listMetrics, createAchievement, updateAchievement,
  deleteAchievement, setAchievementActive, awardAchievement, revokeAchievement,
  listHolders, listAwardCandidates, ruleSummary,
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
 */

const SURFACE        = 'var(--color-surface)';
const SURFACE_RAISED = 'var(--color-surface-raised)';
const BORDER         = 'var(--color-border)';
const PRIMARY        = 'var(--color-primary)';
const PRIMARY_LIGHT  = 'var(--color-primary-light)';
const SECONDARY      = 'var(--color-secondary)';
const TEXT_SECOND    = 'var(--color-text-secondary)';
const TEXT_MUTED     = 'var(--color-text-muted)';

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

/**
 * Renders a stored icon name.
 *
 * Resolving the name to a component and rendering it happens inside here rather
 * than in the caller's body: assigning a component to a local variable during a
 * render is what `react-hooks/set-state-in-effect`'s sibling rule flags, and
 * three call sites were each doing their own lookup anyway. Unknown names draw
 * a trophy, matching the member app.
 */
function AchievementIcon({ name, size, color }: { name: string; size: number; color: string }) {
  // `createElement` rather than binding the looked-up component to a capitalised
  // local and rendering `<Glyph />`. The lint rule flags that shape anywhere it
  // appears, and it is right in general — it just cannot tell that this one
  // comes from a frozen registry rather than being built per render.
  return createElement(iconByName(name), { size, style: { color } });
}

const TIERS: AchievementTier[] = ['bronze', 'silver', 'gold', 'platinum'];
const TIER_RING: Record<AchievementTier, string> = {
  bronze: '#C77B3E', silver: '#A8B0BE', gold: '#F59E0B', platinum: '#A78BFA',
};

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

export default function Achievements() {
  const [rows, setRows] = useState<AchievementRow[]>([]);
  const [metrics, setMetrics] = useState<AchievementMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [audience, setAudience] = useState<AchievementAudience>('member');
  const [search, setSearch] = useState('');

  const [editing, setEditing] = useState<AchievementRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<AchievementRow | null>(null);
  const [awarding, setAwarding] = useState<AchievementRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, m] = await Promise.all([listAchievements(true), listMetrics()]);
      setRows(a);
      setMetrics(m);
      setUnavailable(false);
    } catch (err) {
      setRows([]);
      setUnavailable(true);
      showErrorToast(err instanceof Error ? err.message : 'Could not load achievements');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount. `load` flips a loading flag before awaiting, which is what
  // the skeleton needs and what this rule flags; the alternative it wants is a
  // data-fetching library this project does not use. Same call as every other
  // page here.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => r.audience === audience)
      .filter((r) => !q || r.title.toLowerCase().includes(q) || r.key.includes(q) || r.category.toLowerCase().includes(q));
  }, [rows, audience, search]);

  const paged = usePaged(visible, 12);

  const metricsFor = useMemo(
    () => metrics.filter((m) => m.audience === form.audience),
    [metrics, form.audience]
  );

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
    if (!form.title.trim()) return 'Give it a title.';
    if (!form.description.trim()) return 'Write the line the member sees once they earn it.';
    if (!form.requirement.trim()) return 'Write what it takes — a locked badge that will not say what it wants is a tease.';
    if (creating && !form.key.trim()) return 'The key cannot be empty.';
    if (creating && rows.some((r) => r.key === form.key.trim())) return `"${form.key.trim()}" is already taken.`;
    if (form.rule_kind === 'metric') {
      if (!form.metric) return 'Pick what the rule measures.';
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
        // A manual achievement must carry no rule, or the database's shape
        // constraint rejects it — and rightly, since it would be a lie about
        // how the badge is granted.
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
        showSuccessToast(`"${payload.title}" created — members will earn it on their next sync`);
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
      // 0038's trigger raises here with a count and the advice to retire
      // instead. Surfaced verbatim — it is a better message than any generic one.
      showErrorToast(err instanceof Error ? err.message : 'Could not delete');
      setConfirmDelete(null);
    }
  };

  return (
    // The page carried its own `p-6`, doubling the 24px the layout's <main>
    // already applies — every other admin page starts flush, this one started
    // 48px in and looked like a different app.
    <div className="space-y-4">
      <PageHeader
        title="Achievements"
        subtitle="Automatic ones are awarded by the server the next time someone syncs — you never hand those out. Manual ones you give to a specific person."
        actions={!unavailable ? (
          <Button size="sm" onClick={openCreate}>
            <Plus size={15} /> New achievement
          </Button>
        ) : undefined}
      />

      {!unavailable && !loading && (
        <StatTiles items={[
          { label: 'In the catalogue', value: rows.length, icon: Trophy },
          { label: 'Live', value: rows.filter((r) => r.active).length, icon: Trophy },
          { label: 'Awarded by hand', value: rows.filter((r) => r.rule_kind === 'manual').length, icon: GiftIcon, tone: 'secondary' },
          { label: 'Fixed rules', value: rows.filter((r) => r.rule_kind === 'builtin').length, icon: Lock },
        ]} />
      )}

      {unavailable ? (
        <Section title="Catalogue unavailable" icon={Trophy}>
          <div className="py-8 text-center">
            <p className="text-sm text-white font-medium">The achievement catalogue is not available yet</p>
            <p className="text-xs mt-2 max-w-md mx-auto" style={{ color: TEXT_SECOND }}>
              Migration <span className="font-mono">0038_achievements_as_data.sql</span> creates the
              table and moves the existing 33 achievements into it. Run it in the Supabase SQL
              editor, then reload. Until then the built-in achievements still work — they are
              just not editable.
            </p>
          </div>
        </Section>
      ) : (
        <>
          <Section
            title={audience === 'member' ? 'For members' : 'For trainers'}
            icon={Trophy}
            count={visible.length}
            actions={
              <Toolbar>
                <SearchBox value={search} onChange={setSearch}
                  placeholder="Title, key or category…" width={220} />
                <Chips
                  value={audience}
                  onChange={(v) => setAudience(v as AchievementAudience)}
                  options={(['member', 'trainer'] as AchievementAudience[]).map((a) => ({
                    value: a,
                    label: a === 'member' ? 'Members' : 'Trainers',
                    count: rows.filter((r) => r.audience === a).length,
                  }))}
                />
              </Toolbar>
            }
          >
          {loading ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 rounded-lg animate-pulse" style={{ background: SURFACE_RAISED }} />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState icon={Trophy}
              title={search ? 'Nothing matches that' : 'No achievements for this audience yet'}
              hint={search ? 'Try a shorter search.' : 'Create one and members start earning it on their next sync.'} />
          ) : (
            <>
            {/* Was `md:grid-cols-2`: two 800px cards each holding an icon, a
                title and four small buttons. A badge is ~310px of content. */}
            <CardGrid min={310}>
              {paged.visible.map((a) => {
                return (
                  <TileCard key={a.key} dim={!a.active}>
                    <div className="flex items-start gap-3">
                      <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: SURFACE_RAISED, border: `2px solid ${TIER_RING[a.tier]}` }}>
                        <AchievementIcon name={a.icon} size={19} color={TIER_RING[a.tier]} />
                      </span>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-white">{a.title}</p>
                          {!a.active && (
                            <span className="text-xs px-1.5 py-0.5 rounded"
                              style={{ background: SURFACE, color: TEXT_MUTED, border: `1px solid ${BORDER}` }}>
                              retired
                            </span>
                          )}
                          {a.rule_kind === 'manual' && (
                            <span className="text-xs px-1.5 py-0.5 rounded"
                              style={{ background: 'var(--color-secondary-light)', color: SECONDARY }}>
                              by hand
                            </span>
                          )}
                          {a.rule_kind === 'builtin' && (
                            <span className="text-xs px-1.5 py-0.5 rounded flex items-center gap-1"
                              style={{ background: SURFACE, color: TEXT_MUTED, border: `1px solid ${BORDER}` }}>
                              <Lock size={9} /> fixed rule
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-1" style={{ color: TEXT_SECOND }}>{a.description}</p>
                        <p className="text-xs mt-1.5" style={{ color: TEXT_MUTED }}>
                          {a.category} · {ruleSummary(a, metrics)}
                        </p>
                      </div>

                    </div>

                    <div className="flex items-center gap-1 mt-2.5">
                      <IconBtn title="Award to someone" onClick={() => setAwarding(a)}><GiftIcon size={14} /></IconBtn>
                      <IconBtn title="Edit" onClick={() => openEdit(a)}><Pencil size={14} /></IconBtn>
                      <IconBtn title={a.active ? 'Retire' : 'Bring back'} onClick={() => toggleActive(a)}>
                        {a.active ? <EyeOff size={14} /> : <Eye size={14} />}
                      </IconBtn>
                      {/* A built-in has its rule in SQL, which this screen
                          cannot express — so it can be retired, never deleted. */}
                      {!a.builtin && (
                        <IconBtn title="Delete" onClick={() => setConfirmDelete(a)}><Trash2 size={14} /></IconBtn>
                      )}
                    </div>
                  </TileCard>
                );
              })}
            </CardGrid>
            <div className="flex items-center justify-between mt-3">
              <PageSummary page={paged.page} perPage={paged.perPage} total={paged.total} noun="achievements" />
              <Pagination currentPage={paged.page} totalItems={paged.total}
                itemsPerPage={paged.perPage} onPageChange={paged.setPage} />
            </div>
            </>
          )}
          </Section>
        </>
      )}

      {(creating || editing) && (
        <AchievementForm
          form={form} setForm={setForm}
          metrics={metricsFor} allMetrics={metrics}
          isNew={creating} saving={saving}
          onClose={closeForm} onSave={save}
        />
      )}

      {awarding && (
        <AwardModal
          achievement={awarding}
          onClose={() => setAwarding(null)}
          onDone={() => { setAwarding(null); void load(); }}
        />
      )}

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        type="danger"
        title={`Delete "${confirmDelete?.title ?? ''}"?`}
        message={
          'This removes it from the catalogue entirely. If anyone has already earned it the database ' +
          'will refuse — retire it instead, which keeps their badge and stops new ones.'
        }
        confirmText="Delete"
        onConfirm={doDelete}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick}
      className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
      style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}`, color: TEXT_SECOND }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = PRIMARY; e.currentTarget.style.color = '#fff'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = TEXT_SECOND; }}>
      {children}
    </button>
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

  const selectStyle: React.CSSProperties = {
    background: SURFACE_RAISED, border: `1px solid ${BORDER}`,
    color: TEXT_SECOND, colorScheme: 'dark',
  };

  return (
    <Modal isOpen onClose={onClose} hideFooter size="lg"
      title={isNew ? 'New achievement' : `Edit "${form.title}"`}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: SURFACE_RAISED }}>
          <span className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: SURFACE, border: `2px solid ${TIER_RING[form.tier]}` }}>
            <AchievementIcon name={form.icon} size={21} color={TIER_RING[form.tier]} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{form.title || 'Untitled'}</p>
            <p className="text-xs truncate" style={{ color: TEXT_SECOND }}>
              {form.description || 'What they see once they earn it'}
            </p>
          </div>
        </div>

        <SectionLabel>What it is</SectionLabel>

        <FormField label="Title" required>
          <input value={form.title}
            onChange={(e) => {
              set('title', e.target.value);
              if (isNew) set('key', slugify(e.target.value));
            }}
            placeholder="Member of the Month"
            className="w-full h-10 px-3 rounded-lg text-sm text-white outline-none"
            style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}` }} />
        </FormField>

        <FormField
          label="Key"
          hint={isNew
            ? 'Used internally. Cannot be changed later — it is what links every earned badge to this achievement.'
            : 'Fixed once created: every earned badge points at it.'}>
          <input value={form.key} disabled={!isNew}
            onChange={(e) => set('key', slugify(e.target.value))}
            className="w-full h-10 px-3 rounded-lg text-sm font-mono outline-none disabled:opacity-50"
            style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}`, color: TEXT_SECOND }} />
        </FormField>

        <FormField label="Description" required hint="Past tense, addressed to whoever earned it.">
          <input value={form.description} onChange={(e) => set('description', e.target.value)}
            placeholder="You trained every week this month."
            className="w-full h-10 px-3 rounded-lg text-sm text-white outline-none"
            style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}` }} />
        </FormField>

        <FormField label="Requirement" required hint="Shown while it is still locked, so it has to say what it wants.">
          <input value={form.requirement} onChange={(e) => set('requirement', e.target.value)}
            placeholder="Train at least 12 times in a calendar month."
            className="w-full h-10 px-3 rounded-lg text-sm text-white outline-none"
            style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}` }} />
        </FormField>

        <div className="grid grid-cols-3 gap-3">
          <FormField label="Audience">
            <select value={form.audience} disabled={!isNew}
              onChange={(e) => set('audience', e.target.value as AchievementAudience)}
              className="w-full h-10 px-2 rounded-lg text-sm outline-none disabled:opacity-50" style={selectStyle}>
              <option value="member">Members</option>
              <option value="trainer">Trainers</option>
            </select>
          </FormField>
          <FormField label="Tier">
            <select value={form.tier} onChange={(e) => set('tier', e.target.value as AchievementTier)}
              className="w-full h-10 px-2 rounded-lg text-sm outline-none capitalize" style={selectStyle}>
              {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormField>
          <FormField label="Category" hint="Groups it in the gallery.">
            <input value={form.category} onChange={(e) => set('category', e.target.value)}
              className="w-full h-10 px-3 rounded-lg text-sm text-white outline-none"
              style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}` }} />
          </FormField>
        </div>

        <FormField label="Icon">
          <div className="grid grid-cols-9 gap-1.5 max-h-36 overflow-y-auto p-2 rounded-lg"
            style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}` }}>
            {ICON_NAMES.map((n) => {
              const on = form.icon === n;
              return (
                <button key={n} title={n} onClick={() => set('icon', n)}
                  className="aspect-square rounded-lg flex items-center justify-center transition-colors"
                  style={{ background: on ? PRIMARY_LIGHT : 'transparent', border: `1px solid ${on ? PRIMARY : 'transparent'}` }}>
                  <AchievementIcon name={n} size={15} color={on ? PRIMARY : TEXT_SECOND} />
                </button>
              );
            })}
          </div>
        </FormField>

        <FieldDivider />
        <SectionLabel>How it is earned</SectionLabel>

        {locked ? (
          <p className="text-xs p-3 rounded-lg" style={{ background: SURFACE_RAISED, color: TEXT_SECOND }}>
            This is a built-in level badge. Its rule reads the same thresholds as the level shown on
            the member's Home screen, so the two cannot disagree — the wording and icon above are
            editable, the rule is not.
          </p>
        ) : (
          <>
            <FormField label="Awarded">
              <select value={form.rule_kind}
                onChange={(e) => set('rule_kind', e.target.value as AchievementRuleKind)}
                className="w-full h-10 px-2 rounded-lg text-sm outline-none" style={selectStyle}>
                <option value="metric">Automatically, when a number is reached</option>
                <option value="manual">By hand, to someone you choose</option>
              </select>
            </FormField>

            {form.rule_kind === 'manual' ? (
              <p className="text-xs p-3 rounded-lg" style={{ background: SURFACE_RAISED, color: TEXT_SECOND }}>
                Nobody earns this on their own. Use the gift button on the card to give it to a
                specific {form.audience}.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-[1fr_120px] gap-3">
                  <FormField label="Measure" required>
                    <select value={form.metric} onChange={(e) => set('metric', e.target.value)}
                      className="w-full h-10 px-2 rounded-lg text-sm outline-none" style={selectStyle}>
                      <option value="">Choose a stat…</option>
                      {metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Reaches">
                    {chosen?.is_boolean ? (
                      <div className="h-10 flex items-center text-xs" style={{ color: TEXT_MUTED }}>yes / no</div>
                    ) : (
                      <input type="number" min={1} value={form.threshold}
                        onChange={(e) => set('threshold', e.target.value)}
                        placeholder="10"
                        className="w-full h-10 px-3 rounded-lg text-sm text-white outline-none"
                        style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}`, colorScheme: 'dark' }} />
                    )}
                  </FormField>
                </div>

                <div className="grid grid-cols-[1fr_120px] gap-3">
                  <FormField label="And also (optional)">
                    <select value={form.metric2} onChange={(e) => set('metric2', e.target.value)}
                      className="w-full h-10 px-2 rounded-lg text-sm outline-none" style={selectStyle}>
                      <option value="">No second condition</option>
                      {metrics.filter((m) => m.key !== form.metric).map((m) => (
                        <option key={m.key} value={m.key}>{m.label}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Reaches">
                    {form.metric2 && !chosen2?.is_boolean ? (
                      <input type="number" min={1} value={form.threshold2}
                        onChange={(e) => set('threshold2', e.target.value)}
                        className="w-full h-10 px-3 rounded-lg text-sm text-white outline-none"
                        style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}`, colorScheme: 'dark' }} />
                    ) : (
                      <div className="h-10" />
                    )}
                  </FormField>
                </div>

                <p className="text-xs" style={{ color: TEXT_MUTED }}>
                  Awarded by the server on each person's next sync — existing members who already
                  qualify get it straight away, not just people who reach it from now on.
                </p>
              </>
            )}
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Create' : 'Save changes'}
          </Button>
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
      const [p, h] = await Promise.all([
        listAwardCandidates(achievement.audience),
        listHolders(achievement.key),
      ]);
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

  return (
    <Modal isOpen onClose={onClose} hideFooter title={`Award "${achievement.title}"`}>
      <div className="space-y-4">
        {achievement.rule_kind !== 'manual' && (
          // Said plainly rather than discovered later: revoking an automatic
          // achievement somebody still qualifies for lasts until their next sync.
          <p className="text-xs p-3 rounded-lg" style={{ background: 'var(--color-secondary-light)', color: SECONDARY }}>
            This one is awarded automatically. You can still give it by hand — useful for records
            that predate the system — but removing it from someone who genuinely qualifies will
            not stick: the server grants it again on their next sync.
          </p>
        )}

        <FormField label={`Give it to a ${achievement.audience}`}>
          <div className="flex gap-2">
            <select value={pick} onChange={(e) => setPick(e.target.value)}
              className="flex-1 h-10 px-2 rounded-lg text-sm outline-none"
              style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}`, color: TEXT_SECOND, colorScheme: 'dark' }}>
              <option value="">
                {available.length === 0 ? 'Everyone already has it' : 'Choose someone…'}
              </option>
              {available.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Button onClick={give} disabled={!pick || busy}>Award</Button>
          </div>
        </FormField>

        <FieldDivider />
        <SectionLabel>Who has it ({holders.length})</SectionLabel>

        {holders.length === 0 ? (
          <p className="text-xs py-4 text-center" style={{ color: TEXT_MUTED }}>Nobody yet</p>
        ) : (
          <div className="max-h-56 overflow-y-auto space-y-1">
            {holders.map((h) => (
              <div key={h.user_id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg"
                style={{ background: SURFACE_RAISED }}>
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{h.name}</p>
                  <p className="text-xs" style={{ color: TEXT_MUTED }}>{h.unlocked_on}</p>
                </div>
                <button onClick={() => take(h.user_id)} disabled={busy}
                  title="Remove" className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: TEXT_MUTED }}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
