import { motion, useReducedMotion } from 'framer-motion';
import { Check, Flame, Dumbbell } from 'lucide-react';
import MotionIcon from './MotionIcon';

/**
 * Seven rings, Sun→Sat, one per day of the current week.
 *
 * A filled ring means the member physically checked in at the gym that day —
 * an `attendance` row exists. Nothing else fills it. The reference design uses
 * this strip for a workout streak, but this app has no workout log the member
 * writes to, so check-ins are the honest equivalent.
 *
 * Four states, and they have to stay distinguishable at a glance:
 *
 *   visited   — violet fill, check mark
 *   today     — amber ring; a slow halo pulses behind it *only while the visit
 *               hasn't happened yet*, so the animation reads as "you're up"
 *               rather than as decoration that never stops
 *   missed    — past, empty, full opacity. Not styled as a failure: a rest day
 *               is a rest day
 *   upcoming  — future, dimmed. An empty Saturday ring on a Tuesday is not a
 *               missed session and must not look like one
 *
 * The footer line only appears when there is something true to say about the
 * week. No visits yet means no footer, rather than a "0 day streak" that
 * dresses up an empty week as a statistic.
 */

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Consecutive visited days ending at today, or at yesterday when today's visit
 * hasn't happened yet — so an unfinished today doesn't read as a broken run.
 *
 * Scoped to this week by the data itself: the strip only holds seven days, so
 * this is described in the UI as "in a row this week" and never as an all-time
 * streak it cannot see.
 */
function currentRun(days: boolean[], todayIndex: number): number {
  let from = todayIndex;
  if (!days[todayIndex] && from > 0) from -= 1;
  let run = 0;
  for (let i = from; i >= 0; i--) {
    if (!days[i]) break;
    run += 1;
  }
  return run;
}

export default function WeekRings({
  /** Seven booleans, index 0 = Sunday. */
  days,
  /** Day-of-month for each of the seven, same order. Optional — omit for letters only. */
  dayNumbers,
  /** 0–6, today's index in the same frame. */
  todayIndex,
}: {
  days: boolean[];
  dayNumbers?: number[];
  todayIndex: number;
}) {
  const reduceMotion = useReducedMotion();
  const visited = days.filter(Boolean).length;
  const run = currentRun(days, todayIndex);
  const checkedInToday = days[todayIndex] ?? false;

  // Rings are centred inside seven equal flex cells, so the first and last
  // centres sit half a cell in from each edge — the connector has to start and
  // stop there, not at the container edges.
  const halfCell = 100 / 7 / 2;
  const elapsed = todayIndex / 6;

  return (
    <div>
      <div className="relative">
        {/* Connector track. Sits at the rings' vertical centre (18px = half of
            the 36px ring) and passes behind them. */}
        <div
          className="absolute h-0.5 rounded-full pointer-events-none"
          style={{
            top: 18,
            left: `${halfCell}%`,
            right: `${halfCell}%`,
            background: 'var(--color-surface-high)',
          }}
        />
        <motion.div
          className="absolute h-0.5 rounded-full pointer-events-none origin-left"
          style={{
            top: 18,
            left: `${halfCell}%`,
            right: `${halfCell}%`,
            background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
            opacity: 0.55,
          }}
          initial={reduceMotion ? false : { scaleX: 0 }}
          animate={{ scaleX: elapsed }}
          transition={{ duration: 0.7, ease: 'easeOut', delay: 0.15 }}
        />

        <div className="relative flex items-start justify-between gap-1">
          {DAY_LETTERS.map((letter, i) => {
            const done = days[i] ?? false;
            const isToday = i === todayIndex;
            const future = i > todayIndex;
            const pending = isToday && !done;

            return (
              <div key={i} className="flex flex-col items-center gap-1.5 flex-1">
                <div className="relative w-9 h-9">
                  {/* Halo, today only, and only until the visit is recorded. */}
                  {pending && !reduceMotion && (
                    <motion.span
                      className="absolute inset-0 rounded-full pointer-events-none"
                      style={{ border: '2px solid var(--color-secondary)' }}
                      animate={{ scale: [1, 1.45], opacity: [0.55, 0] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                    />
                  )}

                  <motion.div
                    className="relative w-9 h-9 rounded-full flex items-center justify-center"
                    style={{
                      background: done ? 'var(--color-primary)' : 'var(--color-surface-high)',
                      border: isToday
                        ? '2px solid var(--color-secondary)'
                        : `1px solid ${done ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      boxShadow: done ? '0 4px 12px rgba(124,58,237,0.35)' : 'none',
                      opacity: future ? 0.35 : 1,
                    }}
                    initial={reduceMotion ? false : { scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: future ? 0.35 : 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 420,
                      damping: 24,
                      delay: reduceMotion ? 0 : i * 0.05,
                    }}
                  >
                    {done ? (
                      <motion.span
                        initial={reduceMotion ? false : { scale: 0, rotate: -45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{
                          type: 'spring',
                          stiffness: 500,
                          damping: 18,
                          delay: reduceMotion ? 0 : 0.12 + i * 0.05,
                        }}
                      >
                        <Check size={16} strokeWidth={3} className="text-white" />
                      </motion.span>
                    ) : pending ? (
                      <Dumbbell size={14} style={{ color: 'var(--color-secondary)' }} />
                    ) : null}
                  </motion.div>
                </div>

                <span
                  className="text-xs font-semibold leading-none"
                  style={{
                    color: isToday ? 'var(--color-secondary)' : 'var(--color-text-muted)',
                    opacity: future ? 0.6 : 1,
                  }}
                >
                  {letter}
                </span>

                {dayNumbers?.[i] != null && (
                  <span
                    className="text-xs leading-none"
                    style={{
                      color: done || isToday ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
                      opacity: future ? 0.5 : 1,
                    }}
                  >
                    {dayNumbers[i]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {visited > 0 && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="flex items-center justify-between gap-3 mt-3 pt-3"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold">
            {run >= 2 ? (
              <>
                {/* Inside the existing `run >= 2` branch — the flame moves only
                    while a run is actually going. The `<Check />` below is a
                    settled count and stays still. */}
                <MotionIcon icon={Flame} motion="flick" size={14} color="var(--color-secondary)" />
                <span style={{ color: 'var(--color-secondary)' }}>{run} days in a row</span>
              </>
            ) : (
              <>
                <Check size={14} style={{ color: 'var(--color-primary)' }} />
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  {visited} {visited === 1 ? 'visit' : 'visits'} this week
                </span>
              </>
            )}
          </span>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {checkedInToday ? 'Checked in today' : `${visited} of 7 days`}
          </span>
        </motion.div>
      )}
    </div>
  );
}
