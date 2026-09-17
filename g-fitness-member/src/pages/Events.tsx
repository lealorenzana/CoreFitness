import { Check } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import {
  listEvents, listRegistrations, registerForEvent, cancelRegistration,
  eventStatus, type EventRow,
} from '../lib/api/events';
import { getCurrentMemberId } from '../services/bookingService';
import { Page, PageTitle } from '../components/ui/page';
import { NocButton, Panel, ProgressBar, StatusPill, TextTabs } from '../components/ui/noc';

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

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

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
    <Page>
      <PageTitle back title="Events" subtitle="What the gym has coming up"
        action={
          // The other half of "what has the gym told me" — see NotificationsAll.
          <button onClick={() => navigate('/member/notifications')} style={{ fontSize: 13, color: 'var(--color-primary-300)' }}>
            Updates
          </button>
        } />

      <TextTabs<Tab>
        label="Events"
        tabs={TABS.map((t) => ({ id: t.id, label: t.id === 'mine' && mine.size > 0 ? `${t.label} · ${mine.size}` : t.label }))}
        active={tab}
        onChange={setTab}
      />

      {loading ? (
        <SkeletonList count={3} />
      ) : visible.length === 0 ? (
        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          {tab === 'mine'
            ? 'Nothing booked. Register for an event and it appears here.'
            : tab === 'past' ? 'Nothing yet.' : 'No events scheduled. When the gym schedules something, it shows up here.'}
        </p>
      ) : (
        <div className="flex flex-col" style={{ gap: 14 }}>
          {visible.map(({ event, status }) => {
            const going = mine.has(event.id);
            const taken = counts.get(event.id) ?? 0;
            const full = taken >= event.capacity && !going;
            const closed = status === 'Completed' || status === 'Cancelled';
            const start = new Date(event.starts_at);
            const end = new Date(start.getTime() + event.duration_minutes * 60_000);
            const time = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

            return (
              // Going is filled, the rest sit on the page: the one you are
              // attending reads first without a label saying so.
              <Panel key={event.id} filled={going} style={{ opacity: closed ? 0.75 : 1 }}>
                {/* The gym's own picture, when there is one. A cancelled event
                    keeps it — hiding it would make the event harder to
                    recognise, and the status pill already says cancelled. */}
                {event.image_url && (
                  <img src={event.image_url} alt="" loading="lazy" className="w-full object-cover"
                    style={{ aspectRatio: '16 / 9', marginBottom: 12, borderRadius: 10, background: 'var(--color-surface-high)' }} />
                )}

                <div className="flex items-center justify-between" style={{ gap: 10 }}>
                  <p className="eyebrow" style={{ color: status === 'Ongoing' ? 'var(--color-primary-300)' : undefined }}>
                    {start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {time(start)}–{time(end)}
                  </p>
                  {status !== 'Upcoming' && (
                    <StatusPill label={status} tone={status === 'Ongoing' ? 'structure' : 'muted'} />
                  )}
                </div>
                <p style={{ fontSize: 16, fontWeight: 500, marginTop: 8, color: 'var(--color-text-primary)' }}>{event.title}</p>
                {event.description && (
                  <p style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.55, color: 'var(--color-text-muted)' }}>{event.description}</p>
                )}

                <p style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
                  {[
                    event.location,
                    // NULL fee is free; 0 is deliberately priced at zero. "₱0"
                    // reads like a placeholder, and "Free" for a ₱0 event would
                    // erase a decision the gym made.
                    event.fee == null ? 'Free' : `₱${Number(event.fee).toLocaleString('en-PH')}, paid at the desk`,
                  ].filter(Boolean).join(' · ')}
                </p>

                {/* The three things that decide whether someone turns up (0057).
                    Each is absent rather than shown empty. */}
                {(event.who_is_it_for || event.what_to_bring || event.contact) && (
                  <div className="flex flex-col" style={{ gap: 8, marginTop: 12 }}>
                    {([
                      ['Who it is for', event.who_is_it_for],
                      ['Bring', event.what_to_bring],
                      ['Questions', event.contact],
                    ] as const).filter(([, v]) => v).map(([label, value]) => (
                      <div key={label}>
                        <p className="eyebrow">{label}</p>
                        <p style={{ fontSize: 13, marginTop: 3, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>{value}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-between" style={{ marginTop: 14, fontSize: 12 }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {full ? 'Full' : `${event.capacity - taken} ${event.capacity - taken === 1 ? 'place' : 'places'} left`}
                  </span>
                  <span style={{ color: 'var(--color-text-primary)' }}>{taken} / {event.capacity}</span>
                </div>
                <ProgressBar style={{ marginTop: 7 }} fraction={event.capacity > 0 ? taken / event.capacity : null} />

                {closed ? (
                  <p style={{ fontSize: 12.5, marginTop: 14, color: 'var(--color-text-muted)' }}>
                    {status === 'Cancelled' ? 'This event was cancelled.' : 'This event has finished.'}
                    {going && status === 'Completed' && ' You were registered.'}
                  </p>
                ) : going ? (
                  <div className="flex items-center justify-between" style={{ marginTop: 14, fontSize: 13 }}>
                    <span className="flex items-center" style={{ gap: 6, color: 'var(--color-primary-300)' }}>
                      <Check size={15} /> You are going
                    </span>
                    <button onClick={() => void toggle(event)} disabled={busy === event.id} className="disabled:opacity-50"
                      style={{ color: 'var(--color-text-secondary)' }}>
                      {busy === event.id ? 'Saving…' : 'Cancel registration'}
                    </button>
                  </div>
                ) : (
                  <NocButton variant="action" className="w-full" style={{ marginTop: 14 }}
                    onClick={() => void toggle(event)} disabled={busy === event.id || full}>
                    {busy === event.id ? 'Saving…' : full ? 'Full' : 'Register'}
                  </NocButton>
                )}
              </Panel>
            );
          })}
        </div>
      )}

      {!loading && events.length > 0 && tab === 'upcoming' && (
        <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--color-text-muted)' }}>
          Registering tells the gym to expect you, so they can cater for the right number.
        </p>
      )}
    </Page>
  );
}
