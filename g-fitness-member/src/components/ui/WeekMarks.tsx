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
    <div className="flex" style={{ gap: 6 }} role="list" aria-label="This week">
      {days.map((trained, i) => {
        const isNow = i === todayIndex;
        const isPlanned = planned?.includes(i) ?? false;
        const border = trained
          ? '1px solid var(--color-primary)'
          : isNow ? '1px solid var(--color-secondary)'
          : isPlanned ? '1px dashed var(--color-primary-800)'
          : '1px solid transparent';
        return (
          <div key={i} role="listitem" className="flex-1 text-center"
            aria-label={`${DAY_NAMES[i]} ${dayNumbers[i]}: ${trained ? 'trained' : isPlanned ? 'planned' : isNow ? 'today' : 'rest'}`}>
            <div aria-hidden className={trained ? 'noc-grow-y' : undefined} style={{
              animationDelay: `${120 + i * 55}ms`,
              height: 30, borderRadius: 5, border,
              background: trained ? 'var(--color-primary)' : 'var(--color-surface-high)',
              boxShadow: trained ? '0 0 10px -3px var(--color-primary)' : 'none',
            }} />
            <div aria-hidden style={{
              fontSize: 12, marginTop: 6,
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
