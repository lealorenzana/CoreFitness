import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Sparkles, TrendingUp } from 'lucide-react';
import { SectionHead } from '../ui/noc';
import { Medal } from '../ui/lively';
import { tierStyle, type AchievementDef } from '../../data/achievements';
import {
  achievementByKey, catalogFor, getProgression, LEVEL_ACCENT, levelLabel, listUnlocks, loadCatalogue, type Progression,
} from '../../lib/api/achievements';
import { personalRecords, recordValue, type Record_ } from '../../lib/api/season';
import { storedSession } from '../../lib/offlineReads';
import { useGymApp } from '../../hooks/useGymApp';
import { moduleOn } from '../../lib/gymApp';

/**
 * You as a trophy room (wave 2, 2026-10-27, mock-up approved): the earned
 * level with both of the next level's requirements filling, a shelf of the
 * member's badges as medals (the newest shining), and their latest records.
 * Each part reads what its own screen reads and draws nothing when that is
 * empty or switched off. Since the simplify (2026-10-28) You draws it in two
 * places: `part="level"` above You's tabs, `part="shelf"` (badges and records,
 * each with See all) as the Badges & records tab.
 */

const NEW_DAYS = 7;

interface Data {
  prog: Progression | null;
  badges: { def: AchievementDef; on: string }[];
  total: number;
  records: Record_[];
}

export default function TrophyRoom({ part }: { part: 'level' | 'shelf' }) {
  const navigate = useNavigate();
  const app = useGymApp();
  const progressOn = moduleOn(app, 'progress');
  const [d, setD] = useState<Data | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const uid = storedSession()?.user.id;
    if (!uid) return;
    let alive = true;
    void (async () => {
      const [prog, unlocks, records] = await Promise.all([
        getProgression().catch(() => null),
        loadCatalogue().then(() => listUnlocks(uid)).catch(() => []),
        personalRecords(uid).catch(() => null),
      ]);
      // Newest first; one record per exercise, the latest.
      const badges = unlocks.map((u) => ({ def: achievementByKey(u.achievement_key), on: u.unlocked_on }))
        .filter((b): b is { def: AchievementDef; on: string } => b.def != null)
        .sort((a, b) => b.on.localeCompare(a.on));
      const seen = new Set<string>();
      const latest = (records ?? []).filter((r) => (seen.has(r.exerciseName) ? false : (seen.add(r.exerciseName), true)));
      if (alive) setD({ prog, badges, total: catalogFor('member').length, records: latest.slice(0, 3) });
    })();
    return () => { alive = false; };
  }, []);

  if (!d) return null;
  if (part === 'level' && !progressOn) return null;
  const { prog } = d;
  const Emblem = prog?.level === 'advanced' ? Sparkles : prog?.level === 'intermediate' ? Shield : TrendingUp;
  const accent = prog ? LEVEL_ACCENT[prog.level] : 'var(--color-secondary)';
  const req = prog && prog.nextLevel ? [
    { label: 'Training days', have: prog.trainingDays, need: prog.nextDays },
    { label: 'Consistent weeks', have: prog.consistentWeeks, need: prog.nextWeeks },
  ].filter((r) => r.need != null && (r.need as number) > 0) : [];

  return (
    <div className="flex flex-col" style={{ gap: 4 }} data-trophy-room>
      {part === 'level' && prog && (
        <button type="button" onClick={() => navigate('/member/achievements')} className="lv-in text-left noc-press-soft"
          style={{ ['--i' as string]: 0, padding: 16, borderRadius: 20, border: '1px solid color-mix(in srgb, var(--color-primary) 45%, transparent)',
            background: 'linear-gradient(150deg, var(--color-primary-light), var(--color-surface) 70%)' }} data-trophy-level>
          <span className="flex items-center" style={{ gap: 14 }}>
            <span className="grid place-items-center flex-none" style={{ width: 76, height: 76, borderRadius: 24, color: accent,
              background: `radial-gradient(circle at 30% 25%, color-mix(in srgb, ${accent} 30%, transparent), var(--color-surface-raised) 70%)`,
              border: `1px solid color-mix(in srgb, ${accent} 50%, transparent)`, boxShadow: `0 0 30px color-mix(in srgb, ${accent} 25%, transparent)` }}>
              <Emblem size={36} className="lv-sway" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="eyebrow block" style={{ color: accent }}>Earned level</span>
              <span className="block" style={{ fontSize: 22, fontWeight: 800, marginTop: 2, color: 'var(--color-text-primary)' }}>{levelLabel(prog.level)}</span>
              <span className="block" style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                {prog.nextLevel ? `${levelLabel(prog.nextLevel)} needs both:` : 'The top level'}
              </span>
            </span>
          </span>
          {req.map((r, i) => (
            <span key={r.label} className="block" style={{ marginTop: i ? 8 : 12, fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
              <span className="flex justify-between"><span>{r.label}</span><span className="tabular-nums">{r.have} / {r.need}</span></span>
              <span className="block overflow-hidden" style={{ height: 8, borderRadius: 4, marginTop: 5, background: 'var(--color-surface-high)' }}>
                <span className="block lv-fill" style={{ ['--i' as string]: i + 1, height: '100%', borderRadius: 4,
                  width: `${Math.min(100, Math.round((r.have / (r.need as number)) * 100))}%`, background: `linear-gradient(90deg, ${accent}, color-mix(in srgb, ${accent} 60%, #fff))` }} />
              </span>
            </span>
          ))}
        </button>
      )}

      {part === 'shelf' && d.badges.length === 0 && d.records.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }} data-trophy-empty>
          No badges or records yet — they arrive as you train. <button type="button" onClick={() => navigate('/member/achievements')}
            style={{ color: 'var(--color-primary-300)', fontWeight: 600 }}>See every badge</button>
        </p>
      )}

      {part === 'shelf' && d.badges.length > 0 && (
        <section className="lv-in" style={{ ['--i' as string]: 1 }} data-trophy-badges>
          <SectionHead title="Badges" meta={`${d.badges.length} of ${Math.max(d.total, d.badges.length)} · See all`} />
          <button type="button" onClick={() => navigate('/member/achievements')} className="lv-shelf w-full text-left" aria-label="Your badges. See all">
            {d.badges.slice(0, 8).map((b) => (
              <figure key={b.def.key}>
                <Medal tier={tierStyle(b.def.tier).ring} icon={b.def.icon} size={64}
                  shine={now - new Date(b.on).getTime() < NEW_DAYS * 86_400_000} />
                <figcaption>{b.def.title}</figcaption>
              </figure>
            ))}
          </button>
        </section>
      )}

      {part === 'shelf' && d.records.length > 0 && (
        <section className="lv-in" style={{ ['--i' as string]: 2 }} data-trophy-records>
          <SectionHead title="Your records" meta="See all" />
          <button type="button" onClick={() => navigate('/member/season/records')} className="grid w-full text-left"
            style={{ gridTemplateColumns: `repeat(${d.records.length}, minmax(0, 1fr))`, gap: 8, marginTop: 10 }}>
            {d.records.map((r) => (
              <span key={r.id} style={{ padding: 12, borderRadius: 16, border: '1px solid var(--color-hairline)', background: 'var(--color-surface)' }}>
                <span className="block truncate" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{r.exerciseName}</span>
                <span className="block tabular-nums" style={{ fontSize: 19, fontWeight: 800, marginTop: 2, color: 'var(--color-text-primary)' }}>{recordValue(r.kind, r.value)}</span>
              </span>
            ))}
          </button>
        </section>
      )}
    </div>
  );
}
