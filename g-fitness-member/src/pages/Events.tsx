import { motion } from 'framer-motion';
import { Calendar, Clock, MapPin, Users, Check, ArrowLeft, CalendarX , Ticket } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import SectionHeader from '../components/ui/SectionHeader';
import { panelStyle } from '../components/ui/Card';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import {
  listEvents, listRegistrations, registerForEvent, cancelRegistration,
  eventStatus, type EventRow,
} from '../lib/api/events';
import { getCurrentMemberId } from '../services/bookingService';

/**
 * Gym events — the real `events` table (migration 0014).
 *
 * This page was the **last piece of mock data in either app**, missed by the
 * audit that declared them all migrated. It carried six invented events with
 * 2024 dates, made-up headcounts ("15/25 attending"), and one hardcoded
 * `isRegistered: true` — so it told every member they were signed up for a
 * nutrition workshop that never existed. Meanwhile the admin Events page,
 * reading the same database, correctly showed "No events yet".
 *
 * Two other lies went with it:
 *
 *   * **Register Now** only flipped local state. Reloading undid it, and the
 *     gym never heard about it. It now writes an `event_registrations` row.
 *   * **Share and Remind** toasted "link copied!" and "Reminder set!" while
 *     copying nothing and setting nothing. Both are gone — there is no
 *     per-event URL to share and no event-reminder job to hook into.
 *
 * The old category filters (Classes / Workshops / Competitions / Social) are
 * gone too: `events` has no category column, so those were four filters over a
 * taxonomy that does not exist. The tabs now split on `eventStatus`, which is
 * derived from real columns.
 */

type Tab = 'upcoming' | 'mine' | 'past';

const TABS: { id: Tab; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'mine', label: 'I\'m going' },
  { id: 'past', label: 'Past' },
];

export default function Events() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [memberId, setMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('upcoming');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const id = await getCurrentMemberId();
      setMemberId(id);
      const [rows, regs] = await Promise.all([listEvents(), listRegistrations()]);

      // Headcounts come from the registration rows themselves. A stored
      // `attendees` column would drift the moment anyone cancelled.
      const tally = new Map<string, number>();
      for (const r of regs) tally.set(r.event_id, (tally.get(r.event_id) ?? 0) + 1);

      setEvents(rows);
      setCounts(tally);
      setMine(new Set(regs.filter((r) => r.member_id === id).map((r) => r.event_id)));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not load events'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (event: EventRow) => {
    if (!memberId || busy) return;
    const registered = mine.has(event.id);
    setBusy(event.id);

    // Optimistic, then reconciled from the server on failure — the headcount
    // is a number other members are reading too.
    setMine((s) => {
      const next = new Set(s);
      if (registered) next.delete(event.id); else next.add(event.id);
      return next;
    });
    setCounts((c) => {
      const next = new Map(c);
      next.set(event.id, Math.max(0, (next.get(event.id) ?? 0) + (registered ? -1 : 1)));
      return next;
    });

    try {
      if (registered) await cancelRegistration(event.id, memberId);
      else await registerForEvent(event.id, memberId);
      toast.success(registered ? 'Registration cancelled' : `You're going to ${event.title}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update your registration'));
      void load();
    } finally {
      setBusy(null);
    }
  };

  const visible = useMemo(() => {
    const withStatus = events.map((e) => ({ event: e, status: eventStatus(e) }));
    if (tab === 'mine') return withStatus.filter((x) => mine.has(x.event.id));
    if (tab === 'past') {
      return withStatus.filter((x) => x.status === 'Completed' || x.status === 'Cancelled');
    }
    // Ongoing counts as upcoming — an event happening right now is the most
    // relevant thing on the screen, not history.
    return withStatus
      .filter((x) => x.status === 'Upcoming' || x.status === 'Ongoing')
      .reverse() // listEvents is newest-first; soonest-first reads better here.
      // Featured events rise to the top, and *only* within upcoming: pinning a
      // finished event above a live one would be worse than not pinning at all.
      // Sorted after the reverse so soonest-first still holds inside each group.
      .sort((a, b) => Number(b.event.is_featured) - Number(a.event.is_featured));
  }, [events, mine, tab]);

  return (
    <div className="space-y-4 pb-4">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button onClick={() => navigate('/member/home')}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
          aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="display text-xl text-white">Events</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            What the gym has coming up
          </p>
        </div>
      </motion.div>

      <div
        className="grid grid-cols-3 gap-1 p-1"
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-btn)',
        }}
        role="tablist"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button key={t.id} role="tab" aria-selected={active} onClick={() => setTab(t.id)}
              className="py-2 rounded-full text-xs font-semibold transition-colors"
              style={{
                background: active ? 'var(--color-primary)' : 'transparent',
                color: active ? '#fff' : 'var(--color-text-muted)',
              }}>
              {t.label}
              {t.id === 'mine' && mine.size > 0 && ` (${mine.size})`}
            </button>
          );
        })}
      </div>

      {loading ? (
        <SkeletonList count={3} />
      ) : visible.length === 0 ? (
        <div className="p-10 text-center"
          style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}>
          <CalendarX size={36} className="mx-auto mb-3" style={{ color: 'var(--color-border)' }} />
          <p className="text-sm font-semibold text-white">
            {tab === 'mine' ? 'Nothing booked' : tab === 'past' ? 'Nothing yet' : 'No events scheduled'}
          </p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            {tab === 'mine'
              ? 'Register for an event and it appears here.'
              : 'When the gym schedules something, it shows up here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(({ event, status }, i) => {
            const going = mine.has(event.id);
            const taken = counts.get(event.id) ?? 0;
            const full = taken >= event.capacity && !going;
            const closed = status === 'Completed' || status === 'Cancelled';
            const start = new Date(event.starts_at);
            const end = new Date(start.getTime() + event.duration_minutes * 60_000);
            const pct = event.capacity > 0 ? Math.min(100, (taken / event.capacity) * 100) : 0;

            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.05, 0.3) }}
                className="p-4"
                style={{
                  ...panelStyle,
                  borderRadius: 'var(--radius-panel)',
                  boxShadow: 'var(--shadow-panel)',
                  // Cancelled is muted, not amber: amber is the app's "needs
                  // your attention" tone and a cancelled event needs nothing.
                  borderLeft: `4px solid ${
                    status === 'Cancelled' ? 'var(--color-border)' : 'var(--color-primary)'
                  }`,
                  opacity: closed ? 0.75 : 1,
                }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-bold text-white leading-snug min-w-0">{event.title}</h3>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={
                      status === 'Cancelled'
                        ? { background: 'var(--color-surface-high)', color: 'var(--color-text-muted)' }
                        : status === 'Ongoing'
                          ? { background: 'var(--color-primary-light)', color: 'var(--color-primary)' }
                          : { background: 'var(--color-surface-high)', color: 'var(--color-text-muted)' }
                    }>
                    {status}
                  </span>
                </div>

                {event.description && (
                  <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                    {event.description}
                  </p>
                )}

                <div className="space-y-1.5 mb-3">
                  <p className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    <Calendar size={13} style={{ color: 'var(--color-primary)' }} />
                    {start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                  <p className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    <Clock size={13} style={{ color: 'var(--color-primary)' }} />
                    {start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    {' – '}
                    {end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </p>
                  {event.location && (
                    <p className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      <MapPin size={13} style={{ color: 'var(--color-primary)' }} />
                      {event.location}
                    </p>
                  )}
                  <p className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    <Users size={13} style={{ color: 'var(--color-primary)' }} />
                    {taken}/{event.capacity} registered
                    {!full && ` · ${event.capacity - taken} ${event.capacity - taken === 1 ? 'place' : 'places'} left`}
                  </p>
                  {/* NULL fee is free; 0 is deliberately priced at zero. Saying
                      "₱0" for a free event reads like a placeholder, and saying
                      "Free" for a ₱0 event would erase a decision the gym made. */}
                  <p className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    <Ticket size={13} style={{ color: 'var(--color-primary)' }} />
                    {event.fee == null ? 'Free' : `₱${Number(event.fee).toLocaleString()} — pay at the desk`}
                  </p>
                </div>

                {/* The three things that decide whether someone turns up (0057).
                    Each is absent rather than shown empty: a "What to bring:"
                    label with nothing after it is worse than no label. */}
                {(event.who_is_it_for || event.what_to_bring || event.contact) && (
                  <div className="rounded-xl p-3 mb-3 space-y-2"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                    {event.who_is_it_for && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide"
                          style={{ color: 'var(--color-primary)' }}>Who it's for</p>
                        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                          {event.who_is_it_for}
                        </p>
                      </div>
                    )}
                    {event.what_to_bring && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide"
                          style={{ color: 'var(--color-primary)' }}>Bring</p>
                        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                          {event.what_to_bring}
                        </p>
                      </div>
                    )}
                    {event.contact && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide"
                          style={{ color: 'var(--color-primary)' }}>Questions</p>
                        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                          {event.contact}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="h-1.5 rounded-full mb-3 overflow-hidden" style={{ background: 'var(--color-surface-high)' }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: full ? 'var(--color-secondary)' : 'var(--color-primary)' }} />
                </div>

                {closed ? (
                  <p className="text-xs text-center py-2" style={{ color: 'var(--color-text-muted)' }}>
                    {status === 'Cancelled' ? 'This event was cancelled.' : 'This event has finished.'}
                    {going && status === 'Completed' && ' You were registered.'}
                  </p>
                ) : (
                  <button
                    onClick={() => void toggle(event)}
                    disabled={busy === event.id || (full && !going)}
                    className="w-full h-11 rounded-full font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                    style={
                      going
                        ? { background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)' }
                        : full
                          ? { background: 'var(--color-surface-high)', color: 'var(--color-text-muted)' }
                          : { background: 'var(--color-secondary)', color: '#000' }
                    }
                  >
                    {busy === event.id ? 'Saving…'
                      : going ? <><Check size={15} /> You're going — tap to cancel</>
                      : full ? 'Full'
                      : 'Register'}
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {!loading && events.length > 0 && tab === 'upcoming' && (
        <SectionHeader title="" hint="Registering tells the gym to expect you, so they can cater for the right number." />
      )}
    </div>
  );
}
