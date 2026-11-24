import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CaretLeft, CaretRight, CalendarBlank, CheckCircle } from '@phosphor-icons/react';
import { dateKey } from '../../utils/dates';
import { loadTodayCalendar, type TodayCalendarData } from '../../services/todayCalendar';
import { useLiveData } from '../../hooks/useLiveData';
import StreakStrip from '../ui/StreakStrip';
import './today-calendar.css';

export default function TodayCalendar({ planned, remindAt, showStreak, slots }: {
  planned: number[] | null; remindAt?: string | null; showStreak: boolean; slots: boolean;
}) {
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(() => dateKey(new Date()));
  const [data, setData] = useState<TodayCalendarData | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const request = useRef(0);
  const load = useCallback(async () => {
    const ticket = ++request.current;
    try { const result = await loadTodayCalendar(month, slots); if (ticket === request.current) { setData(result); setError(false); } }
    catch { if (ticket === request.current) setError(true); }
    finally { if (ticket === request.current) setLoading(false); }
  }, [month, slots]);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);
  useLiveData(load);
  const today = dateKey(new Date());
  const monthKey = dateKey(month).slice(0, 7);
  const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const offset = (month.getDay() + 6) % 7;
  const selectedDate = new Date(`${selected}T00:00:00`);
  const visitCount = data?.visits[selected] ?? 0;
  const items = data?.bookings[selected] ?? [];
  const plannedDay = planned?.includes(selectedDate.getDay());
  const visits = Object.entries(data?.visits ?? {}).filter(([key]) => key.startsWith(monthKey)).reduce((sum, [, count]) => sum + count, 0);
  const move = (by: number) => {
    setLoading(true);
    const next = new Date(month.getFullYear(), month.getMonth() + by, 1);
    setMonth(next); setSelected(dateKey(next));
  };
  return <section className="today-month-calendar" aria-label="Your bookings and training calendar">
    <div className="today-calendar-binding" aria-hidden="true"><i /><i /></div>
    <header className="today-calendar-header">
      <div><span>Your calendar</span><h3 aria-live="polite">{month.toLocaleDateString('en-US', { month: 'long' })}<small>{month.getFullYear()}</small></h3></div>
      <div className="today-calendar-nav"><button type="button" aria-label="Previous month" onClick={() => move(-1)}><CaretLeft size={17} /></button><button type="button" aria-label="Next month" onClick={() => move(1)}><CaretRight size={17} /></button></div>
    </header>
    <div className="today-calendar-meta"><span>{loading ? 'Loading calendar…' : error ? 'Calendar could not be loaded.' : `${visits} ${visits === 1 ? 'visit' : 'visits'} this month`}</span><button type="button" onClick={() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelected(dateKey(now)); }}>Today</button></div>
    {error && <button className="today-calendar-retry" type="button" onClick={() => void load()}>Try again</button>}
    <div className="today-calendar-grid" key={monthKey}>
      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => <span className="today-calendar-weekday" key={i}>{day}</span>)}
      {Array.from({ length: Math.ceil((offset + total) / 7) * 7 }, (_, cell) => {
        const day = cell - offset + 1;
        if (day < 1 || day > total) return <span key={`blank-${cell}`} />;
        const date = new Date(month.getFullYear(), month.getMonth(), day);
        const key = dateKey(date);
        const attended = !loading && !error && !!data?.visits[key];
        const booked = !loading && !error && !!data?.bookings[key]?.length;
        const plan = planned?.includes(date.getDay());
        return <button type="button" key={key} aria-current={key === today ? 'date' : undefined} aria-pressed={selected === key}
          aria-label={`${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${attended ? ', checked in' : ''}${booked ? ', booking' : ''}${plan ? ', planned training' : ''}`}
          data-planned={plan || undefined} onClick={() => setSelected(key)}>
          <span>{day}</span><span className="today-calendar-marks" aria-hidden="true">{attended && <i className="is-visit" />}{booked && <i className="is-booking" />}{plan && <i className="is-plan" />}</span>
        </button>;
      })}
    </div>
    <div className="today-calendar-legend"><span><i className="is-visit" />Check-in</span><span><i className="is-booking" />Booking</span><span><i className="is-plan" />Training plan</span></div>
    <div className="today-calendar-agenda" aria-live="polite">
      <h4>{selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</h4>
      {!loading && !error && <>
        {visitCount > 0 && <button type="button" onClick={() => navigate('/member/attendance-history')}><CheckCircle size={18} /><span>{visitCount} {visitCount === 1 ? 'check-in' : 'check-ins'} recorded</span><CaretRight size={14} /></button>}
        {items.map((item, i) => <button type="button" key={i} onClick={() => navigate(item.path)}><CalendarBlank size={18} /><span>{item.title}<small>{item.time}</small></span><CaretRight size={14} /></button>)}
        {plannedDay && <button type="button" onClick={() => navigate('/member/gym-plan')}><CalendarBlank size={18} /><span>Planned training{remindAt && <small>{remindAt.slice(0, 5)}</small>}</span><CaretRight size={14} /></button>}
        {!visitCount && !items.length && !plannedDay && <p>Nothing scheduled for this date.</p>}
        {data?.slotsUnavailable && <p>Booked gym times could not be loaded.</p>}
      </>}
      {(loading || error) && <p>{loading ? 'Loading your day…' : 'Try again to see your day.'}</p>}
    </div>
    {showStreak && <StreakStrip compact />}
  </section>;
}
