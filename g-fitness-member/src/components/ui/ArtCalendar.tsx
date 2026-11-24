import { useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { dateKey } from '../../utils/dates';

type DayState = { marked?: boolean; selected?: boolean; disabled?: boolean; description?: string; count?: number };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Real date controls mapped onto original generated calendar stationery. */
export default function ArtCalendar({ month, onMonthChange, selected, onSelect, dayState,
  canPrevious = true, canNext = true, label = 'Calendar', caption, appearance = 'paper',
}: {
  month: Date; onMonthChange: (month: Date) => void; selected?: string;
  onSelect: (day: Date) => void; dayState?: (day: Date) => DayState;
  canPrevious?: boolean; canNext?: boolean; label?: string; caption?: string;
  appearance?: 'paper' | 'gym';
}) {
  const titleId = useId();
  const [direction, setDirection] = useState(1);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const reduce = useReducedMotion();
  const today = dateKey(new Date());
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const key = `${month.getFullYear()}-${month.getMonth()}`;
  const move = (by: number) => {
    if (by < 0 ? !canPrevious : !canNext) return;
    setDirection(by);
    onMonthChange(new Date(month.getFullYear(), month.getMonth() + by, 1));
  };
  return <section className={`art-calendar${appearance === 'gym' ? ' art-calendar--gym' : ''}`} aria-label={label} data-art-calendar>
    {appearance === 'paper' && <img className="art-calendar-paper" src="/images/member-calendar-paper.webp" alt="" aria-hidden="true" draggable={false} />}
    <div className="art-calendar-content">
      <div className="art-calendar-nav">
        <button type="button" aria-label="Previous month" disabled={!canPrevious} onClick={() => move(-1)}><CaretLeft size={18} /></button>
        <h2 id={titleId} aria-live="polite">{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
        <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => move(1)}><CaretRight size={18} /></button>
      </div>
      <div className="art-calendar-viewport" onPointerDown={(e) => { touch.current = { x: e.clientX, y: e.clientY }; swiped.current = false; }}
        onPointerCancel={() => { touch.current = null; }}
        onPointerUp={(e) => {
          if (!touch.current) return;
          const dx = e.clientX - touch.current.x; const dy = e.clientY - touch.current.y;
          touch.current = null;
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) { swiped.current = true; move(dx < 0 ? 1 : -1); }
        }} onClickCapture={(e) => { if (swiped.current) { e.preventDefault(); e.stopPropagation(); swiped.current = false; } }}>
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div key={key} data-calendar-month={key} custom={direction} className="art-calendar-grid" aria-labelledby={titleId}
            style={appearance === 'gym' ? { gridTemplateRows: `24px repeat(${Math.ceil((first.getDay() + total) / 7)}, minmax(44px, auto))` } : undefined}
            variants={{ enter: (d: number) => ({ x: reduce ? 0 : `${d * 100}%`, opacity: 0 }), center: { x: 0, opacity: 1 }, exit: (d: number) => ({ x: reduce ? 0 : `${d * -100}%`, opacity: 0 }) }}
            initial="enter" animate="center" exit="exit" transition={{ duration: reduce ? 0 : .3, ease: [.22, 1, .36, 1] }}>
            {DAYS.map((name) => <span key={name} className="art-calendar-weekday">{name}</span>)}
            {Array.from({ length: appearance === 'gym' ? Math.ceil((first.getDay() + total) / 7) * 7 : 42 }, (_, cell) => {
              const n = cell - first.getDay() + 1;
              if (n < 1 || n > total) return <span key={`blank-${cell}`} aria-hidden="true" />;
              const day = new Date(month.getFullYear(), month.getMonth(), n);
              const date = dateKey(day); const state = dayState?.(day) ?? {};
              return <button key={date} type="button" data-calendar-date={date} disabled={state.disabled}
                aria-current={date === today ? 'date' : undefined} aria-pressed={state.selected ?? selected === date}
                aria-label={`${day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}${state.description ? `, ${state.description}` : ''}`}
                className={`art-calendar-day${state.marked ? ' is-marked' : ''}${(state.selected ?? selected === date) ? ' is-selected' : ''}`}
                onClick={() => onSelect(day)}><span>{n}</span>
                {state.count != null && state.count > 0 ? <small>{state.count}</small> : state.marked ? <i aria-hidden="true" /> : null}
              </button>;
            })}
          </motion.div>
        </AnimatePresence>
      </div>
      <p className="art-calendar-hint">{caption ?? 'Swipe or use the arrows to change month'}</p>
    </div>
  </section>;
}
