import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowClockwise, Barbell, CalendarPlus, Check, Clock, MapPin, Plus, Star, UsersThree, X,
} from '@phosphor-icons/react';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import Avatar from '../components/ui/Avatar';
import { errorMessage } from '../utils/errorMessage';
import { localDateKey } from '../utils/dates';
import { useLiveData } from '../hooks/useLiveData';
import {
  getCurrentMemberId,
  listMyBookings,
  isUpcoming,
  type MyBooking,
} from '../services/bookingService';
import { listMemberAttendance } from '../lib/api/attendance';
import { canRate, getMyRating, currentPeriod } from '../lib/api/trainerRatings';
import type { BookingStatus } from '../types/db';
import { Page, PageTitle } from '../components/ui/page';
import { Chip, Eyebrow, InlineStat, NocButton, Panel, StatusPill, TextTabs } from '../components/ui/noc';
import CancelBookingDialog from '../components/ui/CancelBookingDialog';

/**
 * My bookings — classes and 1-on-1 in one place (reworked 2026-09-18).
 *
 *   Next up     the soonest session, with a countdown, the coach, the room,
 *               Add to calendar and Cancel
 *   This month  booked · attended · cancelled
 *   Upcoming    grouped by day; Past — each says whether you checked in that
 *               day, with Book again and (when it is yours to give) Evaluate;
 *               Cancelled — who cancelled it and why (0081), never a bare word
 *
 * Upcoming vs past is decided by the session's time, not its status: a booking
 * approved for last Tuesday is history. A declined or cancelled one is neither —
 * it has its own tab, so "Past" means sessions that happened.
 *
 * **A confirmed 1-on-1 can now be cancelled from here.** The list only offered
 * it while pending, though `cancel_booking()` (0081) has always let a member
 * cancel a confirmed session before it starts, with a reason.
 */

const STATUS: Record<BookingStatus, { label: string; tone: 'structure' | 'action' | 'muted' }> = {
  pending: { label: 'Awaiting approval', tone: 'action' },
  approved: { label: 'Confirmed', tone: 'structure' },
  rejected: { label: 'Declined', tone: 'action' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

type Tab = 'upcoming' | 'past' | 'cancelled';
type Kind = 'all' | 'class' | 'pt';

const WHO: Record<string, string> = {
  member: 'you', trainer: 'your coach', staff: 'the front desk', admin: 'the gym', system: 'the gym',
};

/** "in 2 days", "in 3 h 20 min", "starting now". */
function countdown(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return 'starting now';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours} h${mins % 60 ? ` ${mins % 60} min` : ''}`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

function dayHeading(iso: string, now: Date): string {
  const d = new Date(iso);
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (key(d) === key(now)) return 'Today';
  if (key(d) === key(tomorrow)) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

/** A calendar file for one session — the phone's own calendar opens it. */
function downloadIcs(row: MyBooking) {
  if (!row.startsAt) return;
  const start = new Date(row.startsAt);
  const end = new Date(start.getTime() + row.durationMinutes * 60_000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (t: string) => t.replace(/[,;\\]/g, (c) => `\\${c}`);
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Core Fitness//Member app//EN', 'BEGIN:VEVENT',
    `UID:${row.kind}-${row.id}@corefitness`, `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(row.title)}`,
    `DESCRIPTION:${esc(row.subtitle)}`,
    ...(row.location ? [`LOCATION:${esc(row.location)}`] : []),
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${row.title.replace(/[^\w]+/g, '-').toLowerCase()}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function BookingHistory() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<MyBooking[]>([]);
  const [visitDays, setVisitDays] = useState<Set<string>>(new Set());
  const [evaluate, setEvaluate] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<Tab>('upcoming');
  const [kind, setKind] = useState<Kind>('all');
  const [loading, setLoading] = useState(true);
  const [pendingCancel, setPendingCancel] = useState<MyBooking | null>(null);
  const [now, setNow] = useState(() => Date.now());

  /** `quiet` = a background refresh: no skeleton flash, no toast on a blip. */
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const id = await getCurrentMemberId();
      if (!id) {
        if (!quiet) toast.error('Your session could not be verified. Please sign in again.');
        return;
      }
      const [list, visits] = await Promise.all([
        listMyBookings(id),
        listMemberAttendance(id).catch(() => []),
      ]);
      setRows(list);
      setVisitDays(new Set(visits.map((v) => localDateKey(v.check_in_time))));
      setNow(Date.now());

      // Coaches from confirmed past sessions whose evaluation this month is
      // open to this member and not yet given — asked by the database.
      const coaches = [...new Set(list.filter((r) => r.kind === 'pt' && r.status === 'approved' && !isUpcoming(r) && r.trainerId)
        .map((r) => r.trainerId as string))];
      const open = await Promise.all(coaches.map(async (t) => {
        const [ok, mine] = await Promise.all([canRate(t), getMyRating(id, t, currentPeriod()).catch(() => null)]);
        return ok && !mine ? t : null;
      }));
      setEvaluate(new Set(open.filter((x): x is string => !!x)));
    } catch (err) {
      if (!quiet) toast.error(errorMessage(err, 'Could not load your bookings'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);
  // The status a member checks here is changed by someone else — the coach or the desk.
  useLiveData(() => load(true));

  const ofKind = useCallback((r: MyBooking) => kind === 'all' || r.kind === kind, [kind]);
  const closed = (r: MyBooking) => r.status === 'rejected' || r.status === 'cancelled';

  const upcoming = useMemo(
    () => rows.filter((r) => isUpcoming(r, now) && ofKind(r)).sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? '')),
    [rows, now, ofKind],
  );
  const past = useMemo(() => rows.filter((r) => !closed(r) && !isUpcoming(r, now) && ofKind(r)), [rows, now, ofKind]);
  const cancelled = useMemo(() => rows.filter((r) => closed(r) && ofKind(r)), [rows, ofKind]);
  const visible = tab === 'upcoming' ? upcoming : tab === 'past' ? past : cancelled;

  const next = upcoming[0] ?? null;

  // This month, from the session's own date.
  // A local month key, never from toISOString() — Manila's first eight hours are yesterday in UTC.
  const monthKey = `${new Date(now).getFullYear()}-${String(new Date(now).getMonth() + 1).padStart(2, '0')}`;
  const inMonth = rows.filter((r) => r.startsAt && localDateKey(r.startsAt).startsWith(monthKey));
  const attended = inMonth.filter((r) => r.status === 'approved' && !isUpcoming(r, now) && r.startsAt && visitDays.has(localDateKey(r.startsAt))).length;
  const cancelledCount = inMonth.filter(closed).length;

  const afterCancelled = async () => {
    toast.success(pendingCancel?.kind === 'pt' ? 'Session cancelled' : 'Booking cancelled');
    setPendingCancel(null);
    await load();
  };

  const bookAgain = (r: MyBooking) =>
    navigate('/member/book-class', r.kind === 'pt' && r.trainerId ? { state: { trainerId: r.trainerId } } : undefined);

  // Upcoming grouped by day.
  const groups: [string, MyBooking[]][] = [];
  if (tab === 'upcoming') {
    for (const r of upcoming) {
      const label = r.startsAt ? dayHeading(r.startsAt, new Date(now)) : 'Time to be set';
      const last = groups[groups.length - 1];
      if (last && last[0] === label) last[1].push(r);
      else groups.push([label, [r]]);
    }
  }

  const renderRow = (row: MyBooking, last: boolean) => {
    const status = STATUS[row.status];
    const when = row.startsAt ? new Date(row.startsAt) : null;
    const canCancel = row.cancellable && isUpcoming(row, now);
    const checkedIn = row.startsAt ? visitDays.has(localDateKey(row.startsAt)) : false;
    const Icon = row.kind === 'pt' ? Barbell : UsersThree;
    return (
      <div key={`${row.kind}-${row.id}`}>
        <div className="flex items-start" style={{ gap: 12, padding: '14px 0' }}>
          <span className="flex-none" style={{ position: 'relative' }}>
            <Avatar name={row.subtitle.replace(/^with /, '')} photoUrl={row.trainerPhoto} size={40} />
            <span className="absolute grid place-items-center orb-cell orb-cell--busy" style={{
              right: -4, bottom: -4, width: 20, height: 20, borderRadius: 7, color: 'var(--color-primary-300)',
            }}>
              <Icon size={11} weight="bold" />
            </span>
          </span>
          <span className="flex-1 min-w-0">
            <span className="flex items-baseline justify-between" style={{ gap: 8 }}>
              <span className="truncate" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{row.title}</span>
              {when && (
                <span className="flex-none" style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
                  {tab === 'upcoming' ? '' : `${when.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · `}
                  {when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
            </span>
            <span className="block" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.45, color: 'var(--color-text-secondary)' }}>
              {[row.subtitle, `${row.durationMinutes} min`, row.location].filter(Boolean).join(' · ')}
              {row.kind === 'pt' && !closed(row) ? (row.payment === 'paid' ? ' · Paid' : row.payment === 'included' ? ' · In your plan' : '') : ''}
            </span>

            {/* Cancelled / declined: who, and why — the reason is the gym's own words (0081). */}
            {tab === 'cancelled' && (
              <span className="block" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.45,
                color: row.status === 'rejected' ? 'var(--color-secondary)' : 'var(--color-text-muted)' }}>
                {row.status === 'rejected' ? 'Declined' : 'Cancelled'}
                {row.cancelledByRole ? ` by ${WHO[row.cancelledByRole] ?? 'the gym'}` : ''}
                {row.cancellationReason ? ` · ${row.cancellationReason}` : ''}
                {row.cancellationNote ? ` — "${row.cancellationNote}"` : ''}
              </span>
            )}

            <span className="flex items-center flex-wrap" style={{ marginTop: 8, gap: 10 }}>
              {tab === 'cancelled' ? null : tab === 'past' ? (
                <span className="inline-flex items-center" style={{ gap: 5, fontSize: 12.5, color: checkedIn ? 'var(--color-primary-300)' : 'var(--color-text-muted)' }}>
                  {checkedIn ? <Check size={13} weight="bold" /> : <Clock size={13} />}
                  {checkedIn ? 'You checked in that day' : 'No check-in that day'}
                </span>
              ) : (
                <StatusPill label={status.label} tone={status.tone} />
              )}
              <span className="flex items-center ml-auto" style={{ gap: 14, fontSize: 12.5 }}>
                {tab === 'past' && row.trainerId && evaluate.has(row.trainerId) && (
                  <button onClick={() => navigate(`/member/trainer/${row.trainerId}`)} className="inline-flex items-center" style={{ gap: 4, color: 'var(--color-secondary)' }}>
                    <Star size={13} weight="fill" /> Evaluate
                  </button>
                )}
                {tab !== 'upcoming' && (
                  <button onClick={() => bookAgain(row)} className="inline-flex items-center" style={{ gap: 4, color: 'var(--color-primary-300)' }}>
                    <ArrowClockwise size={13} /> Book again
                  </button>
                )}
                {canCancel && (
                  <button onClick={() => setPendingCancel(row)} style={{ color: 'var(--color-text-secondary)' }}>
                    {row.status === 'pending' ? 'Withdraw' : 'Cancel'}
                  </button>
                )}
              </span>
            </span>
          </span>
        </div>
        {!last && <div className="hair" />}
      </div>
    );
  };

  return (
    <Page>
      {/* Booking sits in the header, not under the list — a long history must
          never push the one thing you came to do off the bottom. */}
      <PageTitle
        back
        fallback="/member/book-class"
        title="My bookings"
        subtitle="Classes and 1-on-1 — what's coming, what happened"
        action={
          <button
            onClick={() => navigate('/member/book-class')}
            className="inline-flex items-center"
            style={{
              gap: 5, height: 36, padding: '0 14px', borderRadius: 999,
              fontSize: 13, fontWeight: 600,
              color: 'var(--color-secondary)',
              background: 'color-mix(in srgb, var(--color-secondary) 14%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-secondary) 35%, transparent)',
            }}
          >
            <Plus size={14} weight="bold" /> Book
          </button>
        }
      />

      {loading ? <SkeletonList /> : (
        <>
          {/* ── Next up ── */}
          {next ? (
            <Panel glow={next.status === 'pending' ? 'action' : 'structure'}>
              <div className="flex items-center justify-between" style={{ gap: 10 }}>
                <Eyebrow tone={next.status === 'pending' ? 'action' : undefined}>
                  Next up{next.startsAt ? ` · ${countdown(next.startsAt, now)}` : ''}
                </Eyebrow>
                <StatusPill label={STATUS[next.status].label} tone={STATUS[next.status].tone} />
              </div>
              <div className="flex items-center" style={{ gap: 14, marginTop: 12 }}>
                <Avatar name={next.subtitle.replace(/^with /, '')} photoUrl={next.trainerPhoto} size={52} />
                <div className="min-w-0">
                  <p className="truncate" style={{ fontSize: 19, fontWeight: 700, color: 'var(--color-text-primary)' }}>{next.title}</p>
                  <p style={{ fontSize: 13, marginTop: 2, color: 'var(--color-text-secondary)' }}>{next.subtitle}</p>
                </div>
              </div>
              <div className="flex flex-wrap" style={{ gap: 14, marginTop: 12, fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
                {next.startsAt && (
                  <span className="inline-flex items-center" style={{ gap: 5 }}>
                    <Clock size={14} style={{ color: 'var(--color-primary-300)' }} />
                    {new Date(next.startsAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })},{' '}
                    {new Date(next.startsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · {next.durationMinutes} min
                  </span>
                )}
                {next.location && (
                  <span className="inline-flex items-center" style={{ gap: 5 }}>
                    <MapPin size={14} style={{ color: 'var(--color-primary-300)' }} /> {next.location}
                  </span>
                )}
              </div>
              <div className="flex" style={{ gap: 9, marginTop: 14 }}>
                {next.startsAt && (
                  <NocButton variant="action" className="flex-1" icon={<CalendarPlus size={16} />} onClick={() => downloadIcs(next)}>
                    Add to calendar
                  </NocButton>
                )}
                {next.cancellable && (
                  <NocButton variant="ghost" className="flex-1" icon={<X size={15} />} onClick={() => setPendingCancel(next)}>
                    {next.status === 'pending' ? 'Withdraw' : 'Cancel'}
                  </NocButton>
                )}
              </div>
            </Panel>
          ) : (
            <Panel glow="structure">
              <Eyebrow>Nothing booked</Eyebrow>
              <p style={{ fontSize: 17, fontWeight: 700, marginTop: 8, color: 'var(--color-text-primary)' }}>Your week is open</p>
              <p style={{ fontSize: 13, marginTop: 6, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
                Book a class or a 1-on-1 and it shows here straight away, even before the coach confirms it.
              </p>
              <NocButton variant="fill" className="w-full" style={{ marginTop: 14 }} onClick={() => navigate('/member/book-class')}>
                Book a session
              </NocButton>
            </Panel>
          )}

          {/* ── This month ── */}
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            <InlineStat value={inMonth.length} label="booked this month" />
            <InlineStat value={attended} label="attended" />
            <InlineStat value={cancelledCount} label="cancelled or declined" />
          </div>

          <TextTabs<Tab>
            label="Bookings"
            tabs={[
              { id: 'upcoming', label: `Upcoming · ${upcoming.length}` },
              { id: 'past', label: `Past · ${past.length}` },
              { id: 'cancelled', label: `Cancelled · ${cancelled.length}` },
            ]}
            active={tab}
            onChange={setTab}
          />

          <div className="flex" style={{ gap: 8, marginTop: -8 }}>
            <Chip label="All" on={kind === 'all'} onClick={() => setKind('all')} />
            <Chip label="Classes" on={kind === 'class'} onClick={() => setKind('class')} icon={<UsersThree size={13} weight="bold" />} />
            <Chip label="1-on-1" on={kind === 'pt'} onClick={() => setKind('pt')} icon={<Barbell size={13} weight="bold" />} />
          </div>

          {visible.length === 0 ? (
            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
              {tab === 'upcoming' ? 'Nothing coming up.'
                : tab === 'past' ? 'No past sessions yet. They move here once their time has passed.'
                : 'Nothing cancelled or declined.'}
            </p>
          ) : tab === 'upcoming' ? (
            <div className="flex flex-col noc-rows" style={{ gap: 16 }}>
              {groups.map(([label, list]) => (
                <section key={label}>
                  <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{label}</h2>
                  <div>{list.map((r, i) => renderRow(r, i === list.length - 1))}</div>
                </section>
              ))}
            </div>
          ) : (
            <section className="noc-rows">
              {visible.map((r, i) => renderRow(r, i === visible.length - 1))}
            </section>
          )}
        </>
      )}

      <CancelBookingDialog
        open={pendingCancel !== null}
        kind={pendingCancel?.kind === 'pt' ? 'pt' : 'class'}
        id={pendingCancel?.id ?? null}
        title={pendingCancel?.title ?? ''}
        actor="member"
        onClose={() => setPendingCancel(null)}
        onCancelled={afterCancelled}
      />
    </Page>
  );
}
