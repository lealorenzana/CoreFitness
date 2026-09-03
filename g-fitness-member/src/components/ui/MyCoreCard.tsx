import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, CalendarClock, Dumbbell, Target, AlertTriangle } from 'lucide-react';
import { panelStyle } from './Card';
import { listGoals, listWorkoutLogs } from '../../lib/api/progress';
import type { MemberHome } from '../../services/memberHomeService';

/**
 * MY CORE — the one summary of everything the member has going on.
 *
 * ## Why it is here and not on Home
 *
 * Home was cut from ten stacked sections to five on purpose: it answers
 * "what am I doing today". This answers "how am I doing overall", which is the
 * question Progress exists for, and the counters it needs already live here.
 * Putting it on Home would rebuild exactly the wall of numbers that was removed.
 *
 * ## It absorbs the two cards that were here, rather than sitting above them
 *
 * Visits and upcoming sessions used to be their own StatCards immediately
 * below. Showing the same two numbers twice on one screen is the clutter this
 * app has been pulling out, so they moved in here instead. Nothing was dropped.
 *
 * ## Nothing here is invented
 *
 * A figure that cannot be loaded renders as "—" and the card says the summary
 * is incomplete. A 0 would be a claim — "you have logged no workouts" — and
 * this project has already shipped screens that made that claim wrongly.
 */

interface Props {
  home: MemberHome;
  memberId: string;
  /** CORE Points balance. Undefined until the points feature lands (0051). */
  points?: number | null;
}

interface Extras {
  workouts: number | null;
  goalsAchieved: number | null;
  goalsTotal: number | null;
}

export default function MyCoreCard({ home, memberId, points }: Props) {
  const navigate = useNavigate();
  const [extra, setExtra] = useState<Extras>({ workouts: null, goalsAchieved: null, goalsTotal: null });
  const [partial, setPartial] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [logs, goals] = await Promise.all([listWorkoutLogs(memberId), listGoals(memberId)]);
        if (!alive) return;
        setExtra({
          workouts: logs.length,
          goalsAchieved: goals.filter((g) => g.achieved_on != null).length,
          goalsTotal: goals.length,
        });
      } catch {
        if (alive) setPartial(true);
      }
    })();
    return () => { alive = false; };
  }, [memberId]);

  const goalLabel =
    extra.goalsTotal == null ? '—'
    : extra.goalsTotal === 0 ? 'None set'
    : `${extra.goalsAchieved}/${extra.goalsTotal}`;

  const membershipLabel =
    home.planName == null ? 'No membership'
    : home.expired ? 'Expired'
    : home.neverExpires ? home.planName
    : home.daysLeft != null ? `${home.daysLeft} days left`
    : home.planName;

  const stats: { icon: typeof Dumbbell; label: string; value: string; onClick?: () => void }[] = [
    { icon: CalendarCheck, label: 'Visits this month', value: String(home.checkInsThisMonth) },
    { icon: Dumbbell, label: 'Workouts logged',
      value: extra.workouts == null ? '—' : String(extra.workouts) },
    { icon: Target, label: 'Goals reached', value: goalLabel },
    { icon: CalendarClock, label: 'Sessions coming up', value: String(home.upcomingCount),
      onClick: () => navigate('/member/booking-history') },
  ];

  return (
    <div
      className="p-4"
      style={{ ...panelStyle, borderRadius: 'var(--radius-panel)', boxShadow: 'var(--shadow-panel)' }}
    >
      <div className="flex items-baseline justify-between mb-3">
        <p className="display text-base text-white leading-none">My Core</p>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
          style={{
            background: home.expired ? 'var(--color-secondary-light)' : 'var(--color-primary-light)',
            color: home.expired ? 'var(--color-secondary)' : 'var(--color-primary)',
          }}
        >
          {membershipLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {stats.map((s) => {
          const Icon = s.icon;
          const Tag = s.onClick ? 'button' : 'div';
          return (
            <Tag
              key={s.label}
              onClick={s.onClick}
              className="p-3 rounded-xl text-left"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
            >
              <Icon size={14} style={{ color: 'var(--color-text-muted)' }} />
              <p className="text-lg font-bold text-white mt-1 leading-none">{s.value}</p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
            </Tag>
          );
        })}
      </div>

      {points != null && (
        <div
          className="mt-2.5 p-3 rounded-xl flex items-center justify-between"
          style={{ background: 'var(--color-primary-light)' }}
        >
          <span className="text-[11px] font-semibold" style={{ color: 'var(--color-primary)' }}>
            CORE Points
          </span>
          <span className="text-lg font-bold leading-none" style={{ color: 'var(--color-primary)' }}>
            {points.toLocaleString()}
          </span>
        </div>
      )}

      {partial && (
        <p className="flex items-start gap-1.5 mt-2.5 text-[10px] leading-relaxed"
           style={{ color: 'var(--color-secondary)' }}>
          <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
          Some of this could not be loaded, so it shows &ldquo;—&rdquo; rather than a
          number that might be wrong.
        </p>
      )}
    </div>
  );
}
