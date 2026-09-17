import { CalendarCheck, Check, Lightning, MoonStars } from '@phosphor-icons/react';
const WEEK_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * This week, Sunday to Saturday, as seven marks (Nocturne redesign).
 *
 * `WeekRings` restated as bars, with its states kept and one added:
 *
 *   trained   violet fill — something you have done
 *   today     amber outline — the one day you can still act on
 *   planned   dashed violet — a day your training plan (0030) names
 *   rest      an inset tint
 *
 * Static on purpose: nothing here animates, so reduced motion needs no branch,
 * and nothing about what the marks say depends on an animation having run.
 *
 * Used by Today and by Attendance, which read the same rows — so the two
 * screens cannot draw one week two ways.
 */
export default function WeekMarks({
  days,
  dayNumbers,
  todayIndex,
  planned,
}: {
  /** Sun→Sat; true where a check-in exists. */
  days: boolean[];
  dayNumbers: number[];
  todayIndex: number;
  /** Planned weekdays (0 = Sunday), or null when the plan is unknown. */
  planned?: number[] | null;
}) {
  return (
    <div className="flex" style={{ gap: 7 }} role="list" aria-label="This week">
      {days.map((trained, i) => {
        const isNow = i === todayIndex;
        const isPlanned = planned?.includes(i) ?? false;
        // The AI bubble's orb language: a violet core in a gradient ring for a
        // day trained, the ring alone (turning) for today, a dashed lavender
        // edge for a planned day, frosted glass for the rest.
        const cls = [
          'orb-cell',
          trained ? 'orb-cell--on noc-grow-y' : isNow ? 'orb-cell--ring' : isPlanned ? 'orb-cell--planned' : '',
          isNow ? 'orb-spin' : '',
        ].filter(Boolean).join(' ');
        return (
          <div key={i} role="listitem" className="flex-1 text-center"
            aria-label={`${DAY_NAMES[i]} ${dayNumbers[i]}: ${trained ? 'trained' : isPlanned ? 'planned' : isNow ? 'today' : 'rest'}`}>
            {/* An icon in each mark says the state without the legend: a tick
                for a day trained, a bolt for today, the calendar for a planned
                day, a faint moon for rest. */}
            <div aria-hidden className={`${cls} grid place-items-center`} style={{ animationDelay: trained && !isNow ? `${120 + i * 55}ms` : undefined, height: 34 }}>
              {trained ? <Check size={15} weight="bold" style={{ color: '#fff', filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.6))' }} />
                : isNow ? <Lightning size={15} weight="fill" style={{ color: '#fbbf24', filter: 'drop-shadow(0 0 5px rgba(245,158,11,0.7))' }} />
                : isPlanned ? <CalendarCheck size={14} style={{ color: 'var(--color-primary-300)', opacity: 0.8 }} />
                : <MoonStars size={13} style={{ color: 'var(--color-text-muted)', opacity: 0.45 }} />}
            </div>
            <div aria-hidden style={{
              fontSize: 12, marginTop: 6,
              fontWeight: isNow || trained ? 600 : 400,
              color: isNow ? 'var(--color-secondary)' : trained ? 'var(--color-primary-300)' : 'var(--color-text-muted)',
            }}>
              {WEEK_INITIALS[i]}
            </div>
          </div>
        );
      })}
    </div>
  );
}
