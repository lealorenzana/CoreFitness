import { useEffect, useState, type ReactNode } from 'react';
import { Barbell, Check } from '@phosphor-icons/react';
import GlassSheet from './GlassSheet';
import { SkeletonList } from './Skeleton';
import { listDayWorkouts, type DayWorkout } from '../../lib/api/routines';

/** '2026-09-18' → a local date, never `new Date(key)`, which is UTC. */
const localDay = (key: string) => new Date(`${key}T00:00:00`);

function setLabel(st: { reps: number | null; weightKg: number | null; durationSeconds: number | null }): string {
  if (st.durationSeconds != null) return `${st.durationSeconds} s`;
  return st.weightKg != null ? `${st.weightKg} kg × ${st.reps ?? 0}` : `${st.reps ?? 0} reps`;
}

/**
 * One day's finished workouts, exercise by exercise and set by set (0086).
 *
 * Shared by Attendance (tap a day in the calendar) and Progress (tap a recent
 * workout), so the two places that answer "what did I do that day" cannot
 * disagree. `before` carries whatever the caller knows that this does not — the
 * day's check-ins, on Attendance.
 */
export default function DayWorkoutsSheet({
  memberId, day, onClose, subtitle, before,
}: {
  memberId: string | null;
  /** `YYYY-MM-DD`, or null when closed. */
  day: string | null;
  onClose: () => void;
  subtitle?: string;
  before?: ReactNode;
}) {
  const [workouts, setWorkouts] = useState<{ day: string; rows: DayWorkout[] } | null>(null);

  useEffect(() => {
    if (!day || !memberId) return;
    let alive = true;
    listDayWorkouts(memberId, day)
      .then((rows) => { if (alive) setWorkouts({ day, rows }); })
      .catch(() => { if (alive) setWorkouts({ day, rows: [] }); });
    return () => { alive = false; };
  }, [day, memberId]);

  // Only the answer for *this* day counts — a stale one from the last tap is
  // shown as loading, never as the new day's workouts.
  const rows = workouts && workouts.day === day ? workouts.rows : null;

  return (
    <GlassSheet
      open={day !== null}
      onClose={onClose}
      title={day ? localDay(day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''}
      subtitle={subtitle}
    >
      {day && (
        <div className="flex flex-col" style={{ gap: 18 }}>
          {before}

          {rows === null ? (
            <SkeletonList count={2} />
          ) : rows.length === 0 ? (
            <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-muted)' }}>
              No workout recorded this day. Workouts you finish from My routines show up here, set by set.
            </p>
          ) : rows.map((w) => (
            <section key={w.logId}>
              <div className="flex items-baseline justify-between" style={{ gap: 12 }}>
                <h3 className="flex items-center" style={{ gap: 8, fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  <Barbell size={17} weight="duotone" style={{ color: 'var(--color-primary-300)' }} />
                  {w.activity ?? 'Workout'}
                </h3>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {w.durationMinutes != null ? `${w.durationMinutes} min · ` : ''}
                  finished {new Date(w.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
              {w.exercises.length === 0 ? (
                <p style={{ fontSize: 12.5, marginTop: 6, color: 'var(--color-text-muted)' }}>Logged without sets.</p>
              ) : (
                <div style={{ marginTop: 6 }}>
                  {w.exercises.map((e, i) => (
                    <div key={e.name}>
                      <div className="flex items-start" style={{ gap: 10, padding: '10px 0' }}>
                        <span className="flex-none grid place-items-center orb-cell orb-cell--on" style={{ width: 22, height: 22, borderRadius: 7 }}>
                          <Check size={12} weight="bold" />
                        </span>
                        <div className="min-w-0">
                          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{e.name}</p>
                          <p style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
                            {e.sets.map(setLabel).join('  ·  ')}
                          </p>
                        </div>
                      </div>
                      {i < w.exercises.length - 1 && <div className="hair" />}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </GlassSheet>
  );
}
