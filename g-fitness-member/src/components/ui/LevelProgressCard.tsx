import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Flame, Shield, Sparkles, TrendingUp } from 'lucide-react';
import { panelStyle } from './Card';
import { Skeleton } from './Skeleton';
import {
  getProgression, levelLabel, LEVEL_ACCENT,
  type Progression, type TrainingLevel,
} from '../../lib/api/achievements';
import { getCurrentMemberId, getExperienceLevel, setExperienceLevel } from '../../services/bookingService';
import { toast } from './Toast';

/**
 * Beginner → Intermediate → Advanced, earned rather than declared.
 *
 * Two things that look alike are kept apart here on purpose:
 *
 *   **Earned level** — computed from what the gym recorded, by
 *   `member_progression()` in migration 0028. The client never decides it.
 *
 *   **`experience_level`** — what the member said about themselves at
 *   onboarding, which is what Book a Session uses to recommend classes. A
 *   member who trained for years elsewhere is genuinely advanced with no
 *   check-ins here, so this card *offers* to raise it and never writes it
 *   silently. Overwriting somebody's own answer about their own body with a
 *   row count would be the app claiming to know better.
 *
 * The bars animate with a CSS transition off a mount flag rather than
 * `requestAnimationFrame`, which does not fire on a page that isn't
 * compositing — a backgrounded tab, a locked phone. A progress bar that is
 * stuck at zero because the phone was asleep is a lie about the data.
 */

const RANK: Record<TrainingLevel, number> = { beginner: 0, intermediate: 1, advanced: 2 };
const MET = '#22C55E';

function Requirement({
  label, value, target, animate,
}: { label: string; value: number; target: number; animate: boolean }) {
  const met = value >= target;
  const pct = Math.max(0, Math.min(100, (value / target) * 100));
  const accent = met ? MET : 'var(--color-secondary)';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-xs font-semibold flex items-center gap-1.5"
          style={{ color: met ? MET : 'var(--color-text-secondary)' }}>
          {met && <Check size={12} strokeWidth={3} />}
          {label}
        </span>
        <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
          {Math.min(value, target)} / {target}
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-high)' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: animate ? `${pct}%` : '0%',
            background: accent,
            transition: 'width 900ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </div>
    </div>
  );
}

export default function LevelProgressCard({
  /** Off on the Achievements page itself, where the link would point at the
   *  page you are already reading. */
  linkToAchievements = true,
}: { linkToAchievements?: boolean } = {}) {
  const navigate = useNavigate();
  const [prog, setProg] = useState<Progression | null>(null);
  const [declared, setDeclared] = useState<TrainingLevel | null>(null);
  const [loading, setLoading] = useState(true);
  const [grown, setGrown] = useState(false);
  const [adopting, setAdopting] = useState(false);

  const load = useCallback(async () => {
    try {
      const id = await getCurrentMemberId();
      const [p, d] = await Promise.all([
        getProgression(),
        id ? getExperienceLevel(id).catch(() => null) : Promise.resolve(null),
      ]);
      setProg(p);
      setDeclared(d);
    } catch {
      // A missing progression is not worth a toast on the home screen — the
      // card simply doesn't render. Every other number on the page is real.
      setProg(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Timer, not rAF: see the note at the top of the file.
  useEffect(() => {
    if (loading || !prog) return;
    const t = setTimeout(() => setGrown(true), 80);
    return () => clearTimeout(t);
  }, [loading, prog]);

  if (loading) return <Skeleton className="h-44 w-full" />;
  if (!prog) return null;

  const accent = LEVEL_ACCENT[prog.level];
  const isTop = prog.nextLevel == null;
  const Emblem = prog.level === 'advanced' ? Sparkles : prog.level === 'intermediate' ? Shield : TrendingUp;

  // Only ever offers to raise it. Nothing here may lower what a member said
  // about themselves.
  const canAdopt = declared != null && RANK[prog.level] > RANK[declared];

  // A plain div when there is nowhere to go — a <button> that does nothing
  // still takes focus and still announces itself as a control.
  const Head = linkToAchievements ? 'button' : 'div';

  const adopt = async () => {
    setAdopting(true);
    try {
      const id = await getCurrentMemberId();
      if (!id) throw new Error('Not signed in');
      await setExperienceLevel(id, prog.level);
      setDeclared(prog.level);
      toast.success(`Class recommendations now set to ${levelLabel(prog.level)}`);
    } catch {
      toast.error('Could not update your class recommendations');
    } finally {
      setAdopting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden"
      style={{ ...panelStyle, borderRadius: 'var(--radius-panel)', boxShadow: 'var(--shadow-panel)' }}
    >
      <Head
        onClick={linkToAchievements ? () => navigate('/member/achievements') : undefined}
        className={`w-full text-left p-4 flex items-center gap-3 ${linkToAchievements ? 'active:scale-[0.99] transition-transform' : ''}`}
      >
        <span
          className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${accent}1F`, border: `1px solid ${accent}59` }}
        >
          <Emblem size={22} style={{ color: accent }} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="display text-xl block leading-tight" style={{ color: accent }}>
            {levelLabel(prog.level)}
          </span>
          {/* "Earned", not just "your level". Book a Session shows a *second*
              level — the one the member picked for themselves — and with both
              labelled simply "level" the two screens read as contradicting
              each other. */}
          <span className="text-xs block mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Earned from your check-ins · {prog.trainingDays} training{' '}
            {prog.trainingDays === 1 ? 'day' : 'days'}
          </span>
        </span>
        {linkToAchievements && (
          <ChevronRight size={18} className="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
        )}
      </Head>

      <div className="px-4 pb-4 space-y-3">
        {isTop ? (
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            This is the top level. {prog.consistentWeeks} consistent weeks and{' '}
            {prog.trainingDays} training days on record.
          </p>
        ) : (
          <>
            <p className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
              Next: {levelLabel(prog.nextLevel!)} — both are needed
            </p>
            <Requirement label="Training days" value={prog.trainingDays} target={prog.nextDays!} animate={grown} />
            <Requirement label="Consistent weeks" value={prog.consistentWeeks} target={prog.nextWeeks!} animate={grown} />
            {/* Says what a "consistent week" is, because no member would guess
                that it means two visits and a bar with a secret rule is not a
                measurement they can act on. */}
            <p className="text-xs leading-snug" style={{ color: 'var(--color-text-muted)' }}>
              A week counts once you train twice in it.
            </p>
          </>
        )}

        <div className="flex items-center gap-3 flex-wrap pt-1">
          {prog.currentWeekStreak > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold"
              style={{ color: 'var(--color-secondary)' }}>
              <Flame size={13} />
              {prog.currentWeekStreak}-week streak
            </span>
          )}
          {/* The split is stated rather than merged: the gym witnessed the
              check-ins, the member's own logs are their word for it. */}
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {prog.verifiedDays} gym {prog.verifiedDays === 1 ? 'visit' : 'visits'}
            {prog.loggedDays > 0 && ` · ${prog.loggedDays} self-logged`}
          </span>
        </div>

        {/* The member has told the app they are *more* experienced than their
            check-ins here show — which is completely legitimate (years of
            training somewhere else) and is exactly why the earned level never
            overwrites their answer. But with no explanation the two screens
            just disagree, so this says which is which instead of leaving them
            to guess. */}
        {declared != null && !canAdopt && declared !== prog.level && (
          <div
            className="p-3 rounded-xl"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
          >
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              You told us you train at{' '}
              <span className="font-bold text-white">{levelLabel(declared)}</span>, so Book a Session
              recommends classes at that level. This card is separate: it only counts what this gym
              has recorded, and it starts everyone at Beginner.
            </p>
          </div>
        )}

        {canAdopt && (
          <div
            className="p-3 rounded-xl flex items-start gap-2.5"
            style={{ background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.30)' }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white leading-snug">
                Class picks still say {levelLabel(declared!)}
              </p>
              <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--color-text-muted)' }}>
                Move them to {levelLabel(prog.level)}?
              </p>
            </div>
            <button
              onClick={adopt}
              disabled={adopting}
              className="px-3 py-1.5 rounded-full text-xs font-bold text-black flex-shrink-0 disabled:opacity-50"
              style={{ background: 'var(--color-secondary)' }}
            >
              {adopting ? 'Saving…' : 'Update'}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
