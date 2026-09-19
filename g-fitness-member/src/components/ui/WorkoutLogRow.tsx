import { CaretRight } from '@phosphor-icons/react';
import type { WorkoutLog } from '../../services/progressService';

/** One logged workout: a date orb, the activity, and a tap that opens the day's sets.
 *  Progress → Overview's preview and the Workout history page. */
export default function WorkoutLogRow({ l, last, onOpen }: { l: WorkoutLog; last: boolean; onOpen: () => void }) {
  return (
    <div>
      <button onClick={onOpen} className="w-full flex items-center text-left noc-row" style={{ gap: 12, padding: '12px 0' }}>
        <span className="flex-none flex flex-col items-center justify-center orb-cell orb-cell--busy"
          style={{ width: 46, height: 46, borderRadius: 12 }}>
          <span style={{ fontSize: 11, lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-primary-300)' }}>
            {new Date(`${l.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short' })}
          </span>
          <span style={{ fontSize: 17, lineHeight: 1.1, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {new Date(`${l.date}T00:00:00`).getDate()}
          </span>
        </span>
        <span className="flex-1 min-w-0">
          <span className="block truncate" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{l.type}</span>
          <span className="block truncate" style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-secondary)' }}>
            {[l.duration != null ? `${l.duration} min` : null, l.notes].filter(Boolean).join(' · ') || 'Tap to see what you did'}
          </span>
        </span>
        <CaretRight size={15} className="flex-none" style={{ color: 'var(--color-text-muted)' }} />
      </button>
      {!last && <div className="hair" />}
    </div>
  );
}
