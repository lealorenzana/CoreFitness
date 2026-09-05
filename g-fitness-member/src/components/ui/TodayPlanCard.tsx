import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, CheckCircle2, Dumbbell, ChevronRight } from 'lucide-react';
import { panelStyle } from './Card';
import MotionIcon from './MotionIcon';
import {
  listMyPlan, todayDow, formatRemindAt, DAY_LABELS,
} from '../../lib/api/gymPlans';
import { getCurrentMemberId } from '../../services/bookingService';

/**
 * "Is today a training day?" — answered on the home screen.
 *
 * This is the half of the reminder feature that cannot fail. The notification
 * depends on pg_cron being enabled on the project; this card depends on
 * nothing but the row the member saved, so the plan is never silently inert.
 *
 * Renders nothing at all when there is no plan *and* nothing to prompt — an
 * empty card explaining a feature you are not using is clutter on the screen
 * that matters most.
 */
export default function TodayPlanCard({ checkedInToday }: { checkedInToday: boolean }) {
  const navigate = useNavigate();
  const [days, setDays] = useState<number[] | null>(null);
  const [remindAt, setRemindAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getCurrentMemberId();
        if (!id || cancelled) return;
        const rows = await listMyPlan(id);
        if (cancelled) return;
        setDays(rows.filter((r) => r.active).map((r) => r.day_of_week));
        if (rows.length > 0) setRemindAt(rows[0].remind_at);
      } catch {
        // A failed plan lookup leaves the card absent rather than wrong. Every
        // other figure on Home is unaffected.
        if (!cancelled) setDays([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (days == null) return null;

  const today = todayDow();
  const isPlannedToday = days.includes(today);

  // No plan at all — one quiet prompt, not a nag.
  if (days.length === 0) {
    return (
      <motion.button
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        onClick={() => navigate('/member/gym-plan')}
        className="w-full p-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
        style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}
      >
        <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
          <CalendarPlus size={18} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-white">Set a training plan</span>
          <span className="block text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Pick your days and we will remind you
          </span>
        </span>
        <ChevronRight size={18} className="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
      </motion.button>
    );
  }

  // Has a plan, but not today — say so briefly rather than going blank, so the
  // plan is visibly still in force.
  if (!isPlannedToday) {
    const next = [...days].sort((a, b) => ((a - today + 7) % 7) - ((b - today + 7) % 7))[0];
    return (
      <motion.button
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        onClick={() => navigate('/member/gym-plan')}
        className="w-full p-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
        style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}
      >
        <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}>
          <Dumbbell size={18} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-white">Rest day</span>
          <span className="block text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Next up: {DAY_LABELS[next]}
            {remindAt && ` at ${formatRemindAt(remindAt)}`}
          </span>
        </span>
        <ChevronRight size={18} className="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
      </motion.button>
    );
  }

  // Today IS a planned day.
  const done = checkedInToday;
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      onClick={() => navigate('/member/gym-plan')}
      className="w-full p-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
      style={{
        ...panelStyle,
        borderRadius: 'var(--radius-panel)',
        boxShadow: 'var(--shadow-panel)',
        borderLeft: `4px solid ${done ? 'var(--color-primary)' : 'var(--color-secondary)'}`,
      }}
    >
      <span
        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          background: done ? 'var(--color-primary-light)' : 'var(--color-secondary-light)',
          color: done ? 'var(--color-primary)' : 'var(--color-secondary)',
        }}
      >
        {/* The dumbbell only moves while the session is still outstanding.
            Once it is done the tick is a settled fact and sits still — motion
            on a completed state would keep nagging about nothing. */}
        {done
          ? <CheckCircle2 size={20} />
          : <MotionIcon icon={Dumbbell} motion="hop" size={20} duration="1.8s" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-white">
          {done ? 'Training day — done' : 'Training day'}
        </span>
        <span className="block text-xs mt-0.5 leading-snug" style={{ color: 'var(--color-text-muted)' }}>
          {done
            ? 'You checked in today. Nice.'
            : remindAt
              ? `You planned to train at ${formatRemindAt(remindAt)}`
              : 'You planned to train today'}
        </span>
      </span>
      <ChevronRight size={18} className="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
    </motion.button>
  );
}
