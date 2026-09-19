import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { HandHeart, Lock, SealCheck, Sparkle, Users } from '@phosphor-icons/react';

import LevelProgressCard from '../components/ui/LevelProgressCard';
import { SkeletonList } from '../components/ui/Skeleton';
import GlassSheet from '../components/ui/GlassSheet';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import {
  tierStyle, type AchievementDef, type AchievementRole, type AchievementTier,
} from '../data/achievements';
import {
  catalogFor, categoriesFor, getAchievementProgress, getAchievementRarity, getMetricUnits, listUnlocks,
  loadCatalogue, progressFraction, syncAchievements,
  type AchievementProgress, type Rarity,
} from '../lib/api/achievements';
import { getCurrentMemberId } from '../services/bookingService';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, Panel, ProgressBar, SectionHead, TextTabs } from '../components/ui/noc';
import { CountRing } from '../components/workout/WorkoutParts';

type Filter = 'all' | 'earned' | 'locked';
type Units = Map<string, { label: string; unit: string | null; isBoolean: boolean }>;

const TIERS: AchievementTier[] = ['bronze', 'silver', 'gold', 'platinum'];
const TIER_RANK: Record<string, number> = { bronze: 0, silver: 1, gold: 2, platinum: 3 };

const fmt = (n: number) => String(Math.round(n * 10) / 10);

/**
 * "18 of 25 days" — or, for a two-part rule, both halves. Capped at the
 * threshold so a badge whose number later dropped never reads "30 of 25".
 */
function amountLine(def: AchievementDef, p: AchievementProgress | undefined, units: Units): string | null {
  if (!p) return null;
  if (def.key.startsWith('level_')) {
    return `${fmt(Math.min(p.value, p.threshold))} of ${fmt(p.threshold)} training days · `
      + `${fmt(Math.min(p.value2 ?? 0, p.threshold2 ?? 0))} of ${fmt(p.threshold2 ?? 0)} consistent weeks`;
  }
  const u = units.get(def.metric ?? '');
  if (u?.isBoolean) return p.value >= 1 ? 'Done' : 'Not done yet';
  let s = `${fmt(Math.min(p.value, p.threshold))} of ${fmt(p.threshold)}${u?.unit ? ` ${u.unit}` : ''}`;
  if (p.threshold2 != null) {
    const u2 = units.get(def.metric2 ?? '');
    s += ` · ${fmt(Math.min(p.value2 ?? 0, p.threshold2))} of ${fmt(p.threshold2)}${u2?.unit ? ` ${u2.unit}` : ''}`;
  }
  return s;
}

function toGo(def: AchievementDef, p: AchievementProgress | undefined, units: Units): string | null {
  if (!p || units.get(def.metric ?? '')?.isBoolean) return null;
  const left = p.threshold - p.value;
  if (left <= 0) return null;
  const plural = def.key.startsWith('level_') ? 'training days' : units.get(def.metric ?? '')?.unit ?? '';
  // Units are stored plural ("days", "check-ins"); one left reads "1 day".
  const u = left === 1 ? plural.replace(/s$/, '') : plural;
  return `${fmt(left)} ${u} to go`.replace(/\s+/g, ' ');
}

function rarityLine(r: Rarity | undefined, role: AchievementRole): string | null {
  if (!r || r.audience === 0) return null;
  const pct = Math.round((r.holders / r.audience) * 100);
  const who = role === 'trainer' ? 'coaches' : 'members';
  if (r.holders === 0) return `No ${who.slice(0, -1)} has this yet`;
  return `Earned by ${pct < 1 ? 'under 1' : pct}% of ${who}`;
}

/**
 * The achievement gallery, shared by both roles.
 *
 * Which set to draw comes from the route rather than a prop, because the two
 * bottom navs route to `/member/achievements` and `/trainer/achievements` and
 * one page serving both is one page to keep consistent. The *grading* is not
 * decided here at all — `sync_my_achievements()` reads the caller's own role.
 *
 * Since 0093 a locked badge shows **how far along you are** ("18 of 25 days"),
 * read from `achievement_progress()` — the same stats the grader uses — and
 * every badge says how many people hold it (`achievement_rarity()`, counts
 * only). Before 0093 is pasted both come back null and the screen shows the
 * rule text alone, as it did. An unlocked badge is final: it never shows a bar,
 * even if the number behind it has since dropped (a PT session re-dated).
 */
export default function Achievements() {
  const location = useLocation();
  const isTrainer = location.pathname.startsWith('/trainer');
  const role: AchievementRole = isTrainer ? 'trainer' : 'member';

  const [unlocked, setUnlocked] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<AchievementDef | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [progress, setProgress] = useState<Map<string, AchievementProgress> | null>(null);
  const [rarity, setRarity] = useState<Map<string, Rarity> | null>(null);
  const [units, setUnits] = useState<Units>(new Map());

  /**
   * Held in state, not `useMemo`. The catalogue is a table since 0038, so
   * `catalogFor` reads a cache that is empty until `loadCatalogue()` resolves —
   * a memo keyed on `role` would compute empty once and never recompute, and
   * the gallery would stay blank forever.
   */
  const [catalog, setCatalog] = useState<AchievementDef[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const uid = await getCurrentMemberId();
      if (!uid) return;
      // Re-graded on open, so a badge earned since the app launched shows up
      // here without a restart. `force` on the catalogue so an achievement the
      // admin added while the app was open appears without a relaunch.
      await Promise.all([syncAchievements().catch(() => {}), loadCatalogue(true)]);
      setCatalog(catalogFor(role));
      setCategories(categoriesFor(role));
      // Progress, rarity and units are extras: any of them failing leaves the
      // rule text, never a broken gallery.
      const [rows, prog, rare, u] = await Promise.all([
        listUnlocks(uid),
        getAchievementProgress().catch(() => null),
        getAchievementRarity().catch(() => null),
        getMetricUnits(),
      ]);
      setUnlocked(new Map(rows.map((r) => [r.achievement_key, r.unlocked_on])));
      setProgress(prog);
      setRarity(rare);
      setUnits(u);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not load your achievements'));
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const has = (key: string) => unlocked.has(key);
  const earnedCount = catalog.filter((a) => has(a.key)).length;
  const fraction = catalog.length ? earnedCount / catalog.length : 0;
  const unlockedOn = (key: string) =>
    new Date(`${unlocked.get(key)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const frac = (def: AchievementDef) => (has(def.key) ? 1 : progressFraction(progress?.get(def.key)));

  const recent = catalog.filter((a) => has(a.key))
    .sort((a, b) => (unlocked.get(b.key) ?? '').localeCompare(unlocked.get(a.key) ?? ''))
    .slice(0, 8);
  // The next three worth chasing: furthest along first, and something actually
  // started (a 0% "closest" is not close to anything).
  const closest = catalog
    .filter((a) => !has(a.key) && (frac(a) ?? 0) > 0)
    .sort((a, b) => (frac(b) ?? 0) - (frac(a) ?? 0) || TIER_RANK[a.tier] - TIER_RANK[b.tier])
    .slice(0, 3);

  const visible = (def: AchievementDef) => filter === 'all' || (filter === 'earned') === has(def.key);
  const lockedCount = catalog.length - earnedCount;

  return (
    <Page>
      {/* Back undoes the last step. It navigated to Progress (or the trainer
          profile) whatever the member had come from. */}
      <PageTitle back fallback={isTrainer ? '/trainer/profile' : '/member/progress'}
        title="Achievements"
        subtitle={loading ? 'Checking what you have earned…' : `${earnedCount} of ${catalog.length} unlocked`} />

      {loading ? (
        <SkeletonList count={4} />
      ) : (
        <>
          {/* ── The collection at a glance ── */}
          <Panel glow="structure">
            <div className="flex items-center" style={{ gap: 18 }}>
              <CountRing size={112} stroke={9} fraction={fraction}>
                <div>
                  <p className="tabular-nums" style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: 'var(--color-text-primary)' }}>
                    {Math.round(fraction * 100)}%
                  </p>
                  <p style={{ fontSize: 11.5, marginTop: 4, color: 'var(--color-text-muted)' }}>collected</p>
                </div>
              </CountRing>
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {earnedCount} of {catalog.length}
                </p>
                <p style={{ fontSize: 12.5, marginTop: 2, color: 'var(--color-text-secondary)' }}>
                  {lockedCount === 0 ? 'Every one of them. Remarkable.' : `${lockedCount} still to earn`}
                </p>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px 12px', marginTop: 10 }}>
                  {TIERS.map((t) => {
                    const total = catalog.filter((a) => a.tier === t).length;
                    if (total === 0) return null;
                    const got = catalog.filter((a) => a.tier === t && has(a.key)).length;
                    return (
                      <span key={t} className="inline-flex items-center" style={{ gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        <span aria-hidden className="rounded-full" style={{
                          width: 9, height: 9, background: tierStyle(t).ring, boxShadow: got ? `0 0 8px ${tierStyle(t).ring}` : undefined,
                          opacity: got ? 1 : 0.45,
                        }} />
                        <span className="tabular-nums">{got}/{total}</span> {tierStyle(t).label}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </Panel>

          {/* ── Recently earned: the trophy shelf ── */}
          {recent.length > 0 && (
            <section>
              <SectionHead title="Recently earned" meta={`Latest ${unlockedOn(recent[0].key)}`} />
              <div className="flex overflow-x-auto scrollbar-hide noc-rows" style={{ gap: 14, marginTop: 12, paddingBottom: 4 }}>
                {recent.map((def) => (
                  <button key={def.key} onClick={() => setDetail(def)} className="flex-none flex flex-col items-center noc-press"
                    style={{ width: 76, gap: 8 }} aria-label={`${def.title}, earned ${unlockedOn(def.key)}`}>
                    <Medallion def={def} have size={60} />
                    <span className="w-full truncate text-center" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{def.title}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ── What to chase next ── */}
          {closest.length > 0 && (
            <section>
              <SectionHead title="Closest to unlocking" />
              <div style={{ marginTop: 4 }}>
                {closest.map((def, i) => {
                  const p = progress?.get(def.key);
                  return (
                    <LineRow key={def.key} gutterWidth={46}
                      gutter={<Medallion def={def} have={false} size={40} />}
                      title={def.title}
                      meta={
                        <>
                          <span className="flex items-center justify-between" style={{ gap: 8 }}>
                            <span className="truncate">{amountLine(def, p, units)}</span>
                            <span className="flex-none" style={{ color: 'var(--color-secondary)' }}>{toGo(def, p, units)}</span>
                          </span>
                          <ProgressBar fraction={frac(def)} tone="action" style={{ marginTop: 7 }} />
                        </>
                      }
                      onClick={() => setDetail(def)}
                      last={i === closest.length - 1}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {/* Members get the level rules restated here; a trainer has no level.
              `linkToAchievements` is off because we are already on that page. */}
          {!isTrainer && <LevelProgressCard linkToAchievements={false} />}

          <TextTabs<Filter> label="Show" active={filter} onChange={setFilter} tabs={[
            { id: 'all', label: `All ${catalog.length}` },
            { id: 'earned', label: `Earned ${earnedCount}` },
            { id: 'locked', label: `Locked ${lockedCount}` },
          ]} />

          {categories.map((cat) => {
            const all = catalog.filter((a) => a.category === cat);
            const items = all.filter(visible);
            if (items.length === 0) return null;
            const got = all.filter((a) => has(a.key)).length;
            // Earned first, then the locked ones furthest along — "what you
            // have, then what is next", the order the member scans for.
            const sorted = [...items].sort((a, b) =>
              Number(has(b.key)) - Number(has(a.key)) || (frac(b) ?? 0) - (frac(a) ?? 0));
            return (
              <section key={cat}>
                <SectionHead title={cat} meta={`${got} of ${all.length}`} />
                <div className="noc-rows" style={{ marginTop: 4 }}>
                  {sorted.map((def, i) => {
                    const have = has(def.key);
                    const p = progress?.get(def.key);
                    const line = have ? null : amountLine(def, p, units);
                    return (
                      <LineRow
                        key={def.key}
                        gutterWidth={46}
                        gutter={<Medallion def={def} have={have} size={40} />}
                        title={def.title}
                        dim={!have}
                        // A locked row states the rule that would unlock it —
                        // every one, so nothing here is a mystery — and, since
                        // 0093, how far along you are.
                        meta={have ? (
                          `${tierStyle(def.tier).label} · unlocked ${unlockedOn(def.key)}`
                        ) : (
                          <>
                            <span className="block">{def.requirement}</span>
                            {line && p && (frac(def) ?? 0) > 0 && (
                              <span className="block" style={{ marginTop: 6 }}>
                                <ProgressBar fraction={frac(def)} />
                                <span className="block" style={{ marginTop: 4, fontSize: 11.5, color: 'var(--color-text-muted)' }}>{line}</span>
                              </span>
                            )}
                          </>
                        )}
                        action={have ? <SealCheck size={17} weight="fill" style={{ color: 'var(--color-primary-400)' }} /> : undefined}
                        onClick={() => setDetail(def)}
                        last={i === sorted.length - 1}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </>
      )}

      <GlassSheet open={!!detail} onClose={() => setDetail(null)} title={detail?.title ?? ''}
        subtitle={detail ? `${tierStyle(detail.tier).label} · ${detail.category}` : undefined}>
        {detail && (
          <AchievementDetail def={detail} have={has(detail.key)} unlockedOn={has(detail.key) ? unlockedOn(detail.key) : null}
            progress={progress?.get(detail.key)} units={units} rarity={rarityLine(rarity?.get(detail.key), role)}
            fraction={frac(detail)} />
        )}
      </GlassSheet>
    </Page>
  );
}

/** A badge: the icon in a disc ringed in its tier's colour — lit when earned, a quiet outline when not. */
function Medallion({ def, have, size }: { def: AchievementDef; have: boolean; size: number }) {
  const ring = tierStyle(def.tier).ring;
  const Icon = def.icon;
  return (
    <span className="relative grid place-items-center rounded-full flex-none" style={{
      width: size, height: size,
      background: have
        ? `radial-gradient(120% 120% at 30% 20%, color-mix(in srgb, ${ring} 38%, transparent) 0%, color-mix(in srgb, ${ring} 10%, #0d0c16) 70%)`
        : 'var(--color-surface-high)',
      boxShadow: have
        ? `inset 0 0 0 1.5px ${ring}, 0 0 ${Math.round(size / 2.4)}px -${Math.round(size / 6)}px ${ring}, inset 0 1px 0 rgba(255,255,255,0.25)`
        : 'inset 0 0 0 1px rgba(233, 233, 237, 0.14)',
    }}>
      <Icon size={Math.round(size * 0.44)} strokeWidth={have ? 2.1 : 1.8}
        style={{ color: have ? '#fff' : 'var(--color-text-muted)', opacity: have ? 1 : 0.6 }} />
      {!have && (
        <span className="absolute grid place-items-center rounded-full" style={{
          right: -2, bottom: -2, width: Math.max(16, size * 0.34), height: Math.max(16, size * 0.34),
          background: 'var(--color-bg)', boxShadow: 'inset 0 0 0 1px rgba(233, 233, 237, 0.16)',
        }}>
          <Lock size={Math.max(9, size * 0.18)} weight="bold" style={{ color: 'var(--color-text-muted)' }} />
        </span>
      )}
    </span>
  );
}

function AchievementDetail({
  def, have, unlockedOn, progress, units, rarity, fraction,
}: {
  def: AchievementDef;
  have: boolean;
  unlockedOn: string | null;
  progress: AchievementProgress | undefined;
  units: Units;
  rarity: string | null;
  fraction: number | null;
}) {
  const ring = tierStyle(def.tier).ring;
  const line = amountLine(def, progress, units);
  const left = toGo(def, progress, units);
  return (
    <div className="flex flex-col items-center text-center" style={{ paddingBottom: 8 }}>
      <div className="relative grid place-items-center" style={{ width: 132, height: 132, marginTop: 4 }}>
        {have && (
          <>
            <span aria-hidden className="absolute rounded-full noc-gw-burst" style={{ inset: 22, border: `2px solid ${ring}` }} />
            <span aria-hidden className="absolute rounded-full" style={{ inset: 8, background: `radial-gradient(circle, ${tierStyle(def.tier).glow} 0%, transparent 70%)` }} />
          </>
        )}
        <span className="noc-pop"><Medallion def={def} have={have} size={96} /></span>
      </div>

      {have ? (
        <>
          <p style={{ fontSize: 14, marginTop: 10, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>{def.description}</p>
          <p className="inline-flex items-center" style={{ gap: 6, fontSize: 12.5, marginTop: 10, color: 'var(--color-primary-300)' }}>
            <SealCheck size={14} weight="fill" /> Unlocked {unlockedOn}
          </p>
        </>
      ) : (
        <>
          <p className="flex items-start text-left" style={{ gap: 8, marginTop: 10, fontSize: 14, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
            <Lock size={15} className="flex-none" style={{ marginTop: 3, color: 'var(--color-text-muted)' }} />
            {def.requirement}
          </p>
          {def.ruleKind === 'manual' ? (
            <p className="inline-flex items-center" style={{ gap: 6, marginTop: 12, fontSize: 12.5, color: 'var(--color-text-muted)' }}>
              <HandHeart size={14} /> Given by the gym, not counted automatically.
            </p>
          ) : line && (
            <div className="w-full text-left" style={{ marginTop: 16, padding: 14, borderRadius: 14, background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(233, 233, 237, 0.08)' }}>
              <div className="flex items-baseline justify-between" style={{ gap: 10 }}>
                <span style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Your progress</span>
                {fraction != null && (
                  <span className="tabular-nums" style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>{Math.round(fraction * 100)}%</span>
                )}
              </div>
              <ProgressBar fraction={fraction} tone="action" style={{ marginTop: 10 }} />
              <p style={{ fontSize: 13, marginTop: 8, color: 'var(--color-text-secondary)' }}>{line}</p>
              {left && <p style={{ fontSize: 12.5, marginTop: 2, color: 'var(--color-secondary)' }}>{left}</p>}
            </div>
          )}
        </>
      )}

      {rarity && (
        <p className="inline-flex items-center" style={{ gap: 6, marginTop: 14, fontSize: 12.5, color: 'var(--color-text-muted)' }}>
          <Users size={14} /> {rarity}
        </p>
      )}
      {have && def.tier === 'platinum' && (
        <p className="inline-flex items-center" style={{ gap: 6, marginTop: 6, fontSize: 12.5, color: tierStyle('platinum').ring }}>
          <Sparkle size={14} weight="fill" /> Platinum — the gym's highest tier
        </p>
      )}
    </div>
  );
}
