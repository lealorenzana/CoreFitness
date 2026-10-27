import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CaretRight, ClipboardText, Tray, UserCircleMinus } from '@phosphor-icons/react';
import { LineRow } from '../../../components/ui/noc';
import { listTrainerPtSessions, type PtSessionRow } from '../../../lib/api/ptSessions';
import { listMyTrainerMembers, type TrainerRosterRow } from '../../../lib/api/trainerRoster';
import type { ReviewItem } from '../../../lib/api/rooms';
import type { ClassRow } from '../../../types/db';
import { useGymApp } from '../../../hooks/useGymApp';
import { moduleOn } from '../../../lib/gymApp';

/** A trainee not seen for this many days is someone to reach out to. */
const QUIET_DAYS = 7;

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
const isToday = (iso: string) => {
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

interface Slot { key: string; at: string; title: string; meta: string; open: () => void; live: boolean }

/**
 * Today — the coach's first stop in the rail (redesign, 2026-10-27).
 *
 * What is waiting on them (requests to decide, in amber), the day as a
 * timeline of their classes and approved 1-on-1s, and who needs them:
 * classwork to check and trainees not seen for a week. It replaces the small
 * "Your day" card and the Requests button that sat on Messages. Every line is
 * read, never assumed: a trainee's name comes from the coach's own roster, and
 * a class shows its places, not a booked count it does not have.
 */
export default function TodayPanel({ trainerId, classes, requests, queue }: {
  trainerId: string | null; classes: ClassRow[]; requests: number; queue: ReviewItem[];
}) {
  const navigate = useNavigate();
  const classesOn = moduleOn(useGymApp(), 'classes');
  const [sessions, setSessions] = useState<PtSessionRow[]>([]);
  const [roster, setRoster] = useState<TrainerRosterRow[]>([]);
  // Read once when the panel opens (a clock read during render is not pure).
  const [now] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [s, r] = await Promise.all([
        trainerId ? listTrainerPtSessions(trainerId).catch(() => []) : Promise.resolve([]),
        listMyTrainerMembers().catch(() => []),
      ]);
      if (alive) { setSessions(s); setRoster(r); }
    })();
    return () => { alive = false; };
  }, [trainerId]);

  const names = new Map(roster.map((m) => [m.member_id, m.name]));
  const slots: Slot[] = [
    ...classes.filter((c) => c.scheduled_at && isToday(c.scheduled_at)).map((c) => ({
      key: `c${c.id}`, at: c.scheduled_at as string, title: c.name,
      meta: [c.location, c.capacity ? `${c.capacity} places` : null].filter(Boolean).join(' · '),
      open: () => navigate('/trainer/schedule'), live: false,
    })),
    ...sessions.filter((s) => s.status === 'approved' && isToday(s.starts_at)).map((s) => ({
      key: `p${s.id}`, at: s.starts_at, title: `1-on-1 · ${names.get(s.member_id) ?? 'a trainee'}`,
      meta: `${s.duration_minutes} min`, open: () => navigate('/trainer/bookings'), live: false,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  // The one happening now, or the next to come, carries the lit dot.
  const nextIdx = slots.findIndex((s) => new Date(s.at).getTime() + 60 * 60_000 > now);
  if (nextIdx >= 0) slots[nextIdx].live = true;

  const quiet = roster
    .filter((m) => !m.last_visit || (now - new Date(m.last_visit).getTime()) / 86_400_000 >= QUIET_DAYS)
    .slice(0, 3);
  const daysSince = (iso: string | null) => (iso ? Math.floor((now - new Date(iso).getTime()) / 86_400_000) : null);
  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div data-today-panel>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)' }}>Today</h1>
      <p style={{ fontSize: 12.5, marginTop: 2, color: 'var(--color-text-muted)' }}>
        {today} · {slots.length === 0 ? 'nothing on your schedule' : `${slots.length} on your schedule`}
      </p>

      {requests > 0 && (
        <button type="button" onClick={() => navigate('/trainer/bookings')} data-requests
          className="w-full flex items-center text-left noc-press" style={{ gap: 10, marginTop: 14, padding: '11px 12px', borderRadius: 14,
            border: '1px solid color-mix(in srgb, var(--color-secondary) 40%, transparent)', background: 'var(--color-secondary-light)' }}>
          <Tray size={20} style={{ color: 'var(--color-secondary-300)', flex: 'none' }} />
          <span className="min-w-0 flex-1">
            <span className="block" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {requests} {requests === 1 ? 'request' : 'requests'} waiting
            </span>
            <span className="block" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Bookings and 1-on-1s for you to decide</span>
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-secondary)' }}>Decide</span>
        </button>
      )}

      <p className="eyebrow" style={{ marginTop: 18 }}>Your day</p>
      {slots.length === 0 ? (
        <p style={{ fontSize: 13, marginTop: 6, color: 'var(--color-text-muted)' }}>
          No classes or 1-on-1s today.{' '}{classesOn && <button type="button" onClick={() => navigate('/trainer/schedule')} style={{ color: 'var(--color-primary-300)' }}>See your week</button>}
        </p>
      ) : (
        <section aria-label="Your day" style={{ marginTop: 8 }} data-day>
          {slots.map((s, i) => (
            <div key={s.key} className="flex" style={{ gap: 12 }}>
              <span className="flex-none" style={{ width: 52, paddingTop: 2, fontSize: 12, fontWeight: s.live ? 700 : 400,
                color: s.live ? 'var(--color-primary-300)' : 'var(--color-text-muted)' }}>{time(s.at)}</span>
              <button type="button" onClick={s.open} className="relative flex-1 min-w-0 text-left" style={{
                borderLeft: '1px solid rgba(233, 233, 237, 0.12)', paddingLeft: 14, paddingBottom: i === slots.length - 1 ? 0 : 16 }}>
                <span aria-hidden className="absolute rounded-full" style={{ left: -4, top: 6, width: 7, height: 7,
                  background: s.live ? 'var(--color-primary)' : 'var(--color-surface-high)',
                  boxShadow: s.live ? '0 0 9px var(--color-primary)' : '0 0 0 1px rgba(233, 233, 237, 0.18)' }} />
                <span className="block truncate" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{s.title}</span>
                {s.meta && <span className="block" style={{ fontSize: 12.5, marginTop: 2, color: 'var(--color-text-muted)' }}>{s.meta}</span>}
              </button>
            </div>
          ))}
        </section>
      )}

      {(queue.length > 0 || quiet.length > 0) && (
        <>
          <p className="eyebrow" style={{ marginTop: 20 }}>Needs you</p>
          <section aria-label="Needs you" data-needs-you>
            {queue.length > 0 && (
              <LineRow icon={ClipboardText} tone="act"
                title={`${queue.length} ${queue.length === 1 ? 'piece of classwork' : 'pieces of classwork'} to check`}
                meta={`${queue[0].memberName} · ${queue[0].title}`}
                action={<CaretRight size={14} />} actionTone="muted"
                onClick={() => navigate(`/trainer/rooms/${queue[0].roomId}/work/${queue[0].assignmentId}`)}
                last={quiet.length === 0} />
            )}
            {quiet.map((m, i) => {
              const d = daysSince(m.last_visit);
              return (
                <LineRow key={m.member_id} icon={UserCircleMinus} tone="info"
                  title={d == null ? `${m.name} hasn’t been in yet` : `${m.name} hasn’t been in for ${d} days`}
                  meta="Their notes, plan and progress"
                  action={<CaretRight size={14} />} actionTone="muted"
                  onClick={() => navigate(`/trainer/members?open=${m.member_id}`)}
                  last={i === quiet.length - 1} />
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
