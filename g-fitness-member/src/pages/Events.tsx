import { Check } from '@phosphor-icons/react';
import { useUrlState } from '../hooks/useUrlState';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePaged } from '../hooks/usePaging';
import Pager from '../components/ui/Pager';
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
import { NocButton, ProgressBar, StatusPill, TextTabs } from '../components/ui/noc';
import { PageHero } from '../components/ui/PageHero';
import './events.css';

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
  const [tab, setTab] = useUrlState<Tab>('show', 'upcoming', ['upcoming', 'mine', 'past']);

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
  // Twenty to a page; a new tab starts on page 1.
  const paged = usePaged(visible, undefined, tab);

  return (
    <Page className="has-page-hero">
      <PageTitle back hub={false} fallback="/member/notifications" title="Gym events"
        action={
          // The other half of "what has the gym told me" — see NotificationsAll.
          <button onClick={() => navigate('/member/notifications')} style={{ fontSize: 13, color: 'var(--color-primary-300)' }}>
            Updates
          </button>
        } />
      <PageHero label="Gym events" kicker="At your gym" lead="Show up," accent="together."
        text="See what is happening at your gym and tell them you are coming." art="/images/member-community.png" />

      <TextTabs<Tab>
        label="Events"
        tabs={TABS.map((t) => ({ id: t.id, label: t.id === 'mine' && mine.size > 0 ? `${t.label} · ${mine.size}` : t.label }))}
        active={tab}
        onChange={setTab}
      />

      {loading ? (
        <SkeletonList count={3} />
      ) : visible.length === 0 ? (
        <div className="page-hero-list ev-empty">
          <p className="ev-empty-title">{tab === 'mine' ? 'Nothing booked' : tab === 'past' ? 'No past events' : 'Nothing scheduled'}</p>
          <p>{tab === 'mine'
            ? 'Register for an event and it appears here.'
            : tab === 'past' ? 'Events that have finished show up here.' : 'When the gym schedules something, it shows up here.'}</p>
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 14 }}>
          {paged.rows.map(({ event, status }) => {
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
              // Going is marked, the rest sit plain: the one you are attending reads first.
              <article key={event.id} className="ev-ticket" data-going={going || undefined} data-closed={closed || undefined}>
                {/* The gym's own picture, when there is one. A cancelled event keeps it. */}
                {event.image_url && <img src={event.image_url} alt="" loading="lazy" className="ev-photo" />}

                <div className="ev-head">
                  <span className="ev-date" aria-hidden>
                    <span>{start.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                    <b>{start.getDate()}</b>
                    <span>{start.toLocaleDateString('en-US', { month: 'short' })}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3>{event.title}</h3>
                    <p className="ev-time" data-live={status === 'Ongoing' || undefined}>
                      <span className="sr-only">{start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}, </span>
                      {time(start)} to {time(end)}
                    </p>
                    {(status !== 'Upcoming' || (going && !closed)) && (
                      <span className="flex flex-wrap" style={{ gap: 6, marginTop: 7 }}>
                        {status !== 'Upcoming' && <StatusPill label={status} tone={status === 'Ongoing' ? 'structure' : 'muted'} />}
                        {going && !closed && <StatusPill label="Going" tone="structure" />}
                      </span>
                    )}
                  </div>
                </div>

                {event.description && <p className="ev-desc">{event.description}</p>}

                <div className="ev-tags">
                  {event.location && <span>{event.location}</span>}
                  {/* NULL fee is free; 0 is deliberately priced at zero. "Free" for a 0 peso event would erase a decision the gym made. */}
                  <span>{event.fee == null ? 'Free' : `₱${Number(event.fee).toLocaleString('en-PH')}, paid at the desk`}</span>
                </div>

                {/* The three things that decide whether someone turns up (0057). Each is absent rather than shown empty. */}
                {(event.who_is_it_for || event.what_to_bring || event.contact) && (
                  <dl className="ev-facts">
                    {([
                      ['Who it is for', event.who_is_it_for],
                      ['Bring', event.what_to_bring],
                      ['Questions', event.contact],
                    ] as const).filter(([, v]) => v).map(([label, value]) => (
                      <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                    ))}
                  </dl>
                )}

                <div className="ev-places">
                  <span>{full ? 'Full' : `${event.capacity - taken} ${event.capacity - taken === 1 ? 'place' : 'places'} left`}</span>
                  <b>{taken} / {event.capacity}</b>
                </div>
                <ProgressBar style={{ marginTop: 7 }} fraction={event.capacity > 0 ? taken / event.capacity : null} />

                <div className="ev-foot">
                  {closed ? (
                    <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                      {status === 'Cancelled' ? 'This event was cancelled.' : 'This event has finished.'}
                      {going && status === 'Completed' && ' You were registered.'}
                    </p>
                  ) : going ? (
                    <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
                      <span className="flex items-center" style={{ gap: 6, color: 'var(--color-primary-300)' }}>
                        <Check size={15} /> You are going
                      </span>
                      <button onClick={() => void toggle(event)} disabled={busy === event.id} className="disabled:opacity-50"
                        style={{ minHeight: 44, color: 'var(--color-text-secondary)' }}>
                        {busy === event.id ? 'Saving…' : 'Cancel registration'}
                      </button>
                    </div>
                  ) : (
                    <NocButton variant="action" className="w-full"
                      onClick={() => void toggle(event)} disabled={busy === event.id || full}>
                      {busy === event.id ? 'Saving…' : full ? 'Full' : 'Register'}
                    </NocButton>
                  )}
                </div>
              </article>
            );
          })}
          <Pager page={paged.page} pages={paged.pages} total={paged.total}
            noun={paged.total === 1 ? 'event' : 'events'} onPage={paged.setPage} />
        </div>
      )}

      {!loading && events.length > 0 && tab === 'upcoming' && (
        <p className="page-note">
          Registering tells the gym to expect you, so they can cater for the right number.
        </p>
      )}
      {!loading && <p className="page-ending">See you there.</p>}
    </Page>
  );
}
