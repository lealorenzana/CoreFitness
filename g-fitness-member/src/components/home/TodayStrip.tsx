import { useNavigate } from 'react-router-dom';
import { Panel } from '../ui/noc';
import WeekMarks from '../ui/WeekMarks';
import StreakStrip from '../ui/StreakStrip';
import { DAY_LABELS } from '../../lib/api/gymPlans';
import { useT } from '../../lib/i18n';

/**
 * Today's one strip (redesign, 2026-10-26): the membership in a line, visits
 * this month, the week's marks, and the streak's line — where three cards (the
 * month panel, the week strip, the streak card) used to count the same week
 * three ways. Nothing they showed is gone: the calendar is a tap on the marks,
 * the streak's full card is a tap on its line, and the challenge moved into the
 * timeline.
 */
export default function TodayStrip({
  membershipLine, visitsThisMonth, monthName, week, dayNumbers, todayIndex, planned, nextPlanned, remindAt, showStreak,
}: {
  membershipLine: string;
  visitsThisMonth: number;
  monthName: string;
  week: boolean[];
  dayNumbers: number[];
  todayIndex: number;
  planned: number[] | null;
  /** The next planned weekday when today is a rest day; null otherwise. */
  nextPlanned: number | null;
  /** 'Planned for 5:30 PM' style suffix, already worded, or null. */
  remindAt: string | null;
  showStreak: boolean;
}) {
  const navigate = useNavigate();
  const t = useT();
  const done = week.filter(Boolean).length;
  return (
    <div data-today-strip>
    <Panel glow="structure" style={{ padding: '13px 14px 12px' }}>
      <div className="flex items-center justify-between" style={{ gap: 12, fontSize: 12.5 }}>
        <span className="min-w-0 truncate" style={{ color: 'var(--color-text-secondary)' }}>{t(membershipLine)}</span>
        <span className="flex-none tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
          <b style={{ color: 'var(--color-text-primary)', fontWeight: 700 }}>{visitsThisMonth}</b>{' '}
          {visitsThisMonth === 1 ? t('visit') : t('visits')} {t('in')} {monthName}
        </span>
      </div>

      {/* The marks open the full calendar — Attendance pages back through every month with a visit. */}
      <button onClick={() => navigate('/member/attendance-history')}
        aria-label="This week's visits. Open the full attendance calendar"
        className="w-full block text-left noc-press-soft" style={{ marginTop: 11 }}>
        <WeekMarks days={week} dayNumbers={dayNumbers} todayIndex={todayIndex} planned={planned} />
      </button>

      <div className="flex items-center justify-between" style={{ marginTop: 9, fontSize: 12, gap: 12 }}>
        <button onClick={() => navigate('/member/attendance-history')} className="text-left" style={{ color: 'var(--color-text-muted)' }}>
          {done} {t('of 7 days this week')}<span style={{ color: 'var(--color-primary-300)' }}> · {t('See calendar')}</span>
        </button>
        {planned && planned.length === 0 ? (
          <button onClick={() => navigate('/member/gym-plan')} style={{ color: 'var(--color-secondary)' }}>{t('Set a training plan')}</button>
        ) : nextPlanned != null ? (
          <button onClick={() => navigate('/member/gym-plan')} style={{ color: 'var(--color-text-secondary)' }}>
            {t('Rest day')} · {t('next')} {DAY_LABELS[nextPlanned]}{remindAt ? ` ${remindAt}` : ''}
          </button>
        ) : null}
      </div>

      {/* Draws its own divider — nothing at all when there is no streak card to show. */}
      {showStreak && <StreakStrip compact />}
    </Panel>
    </div>
  );
}
