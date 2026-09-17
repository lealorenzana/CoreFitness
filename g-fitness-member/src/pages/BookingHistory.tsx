import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { useLiveData } from '../hooks/useLiveData';
import {
  getCurrentMemberId,
  listMyBookings,
  isUpcoming,
  type MyBooking,
} from '../services/bookingService';
import type { BookingStatus } from '../types/db';
import { Page, PageTitle } from '../components/ui/page';
import { NocButton, StatusPill, TextTabs } from '../components/ui/noc';
import CancelBookingDialog from '../components/ui/CancelBookingDialog';

/**
 * The member's own bookings — group classes and personal training in one list,
 * because "what am I doing this week" is one question (Nocturne redesign).
 *
 * Upcoming vs past is decided by the session's own time, not its status. A
 * booking approved for last Tuesday belongs in history even though it is still
 * `approved`; the old screen filed it under Upcoming forever.
 *
 * Status is state, so its pill is violet — except a request still waiting and a
 * decline, which are the two a member may need to act on, so amber.
 */

const STATUS: Record<BookingStatus, { label: string; tone: 'structure' | 'action' | 'muted' }> = {
  pending: { label: 'Awaiting approval', tone: 'action' },
  approved: { label: 'Confirmed', tone: 'structure' },
  rejected: { label: 'Declined', tone: 'action' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

/**
 * What the member owes, in words — or nothing at all.
 *
 * 'unknown' renders nothing on purpose. A blank is honest; "unpaid" would be a
 * claim about somebody's money made by a screen that cannot see the till.
 */
function paymentWords(payment: MyBooking['payment']): string | null {
  if (payment === 'paid') return 'Paid';
  if (payment === 'included') return 'In your plan';
  return null;
}

export default function BookingHistory() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<MyBooking[]>([]);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [loading, setLoading] = useState(true);
  const [pendingCancel, setPendingCancel] = useState<MyBooking | null>(null);

  /** `quiet` = a background refresh: no skeleton flash, no toast on a blip. */
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const id = await getCurrentMemberId();
      if (!id) {
        if (!quiet) toast.error('Your session could not be verified. Please sign in again.');
        return;
      }
      setRows(await listMyBookings(id));
    } catch (err) {
      if (!quiet) toast.error(errorMessage(err, 'Could not load your bookings'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  // The status a member checks here is changed by someone else — the coach or
  // the desk — not by them.
  useLiveData(() => load(true));

  const upcoming = useMemo(
    () => rows.filter((r) => isUpcoming(r)).sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? '')),
    [rows],
  );
  const past = useMemo(() => rows.filter((r) => !isUpcoming(r)), [rows]);
  const visible = tab === 'upcoming' ? upcoming : past;

  /**
   * Cancelling goes through `cancel_booking()` (0081), which wants a reason.
   * The dialog owns the call and the validation; this only reloads and says so.
   */
  const afterCancelled = async () => {
    toast.success(pendingCancel?.kind === 'pt' ? 'Session cancelled' : 'Booking cancelled');
    setPendingCancel(null);
    await load();
  };

  return (
    <Page>
      <PageTitle back title="My bookings" subtitle="Requested, confirmed and past — classes and 1-on-1" />

      <TextTabs<'upcoming' | 'past'>
        label="Bookings"
        tabs={[
          { id: 'upcoming', label: `Upcoming · ${upcoming.length}` },
          { id: 'past', label: `Past · ${past.length}` },
        ]}
        active={tab}
        onChange={setTab}
      />

      {loading ? (
        <SkeletonList />
      ) : visible.length === 0 ? (
        <div className="flex flex-col" style={{ gap: 16 }}>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
            {tab === 'upcoming'
              ? 'Nothing booked yet. Book a class or a 1-on-1 session and it appears here straight away, even before it is confirmed.'
              : 'No past sessions. They move here once their time has passed.'}
          </p>
        </div>
      ) : (
        <section className="noc-rows">
          {visible.map((row, i) => {
            const status = STATUS[row.status];
            const when = row.startsAt ? new Date(row.startsAt) : null;
            const pay = row.kind === 'pt' ? paymentWords(row.payment) : null;
            const canCancel = row.cancellable && isUpcoming(row);
            return (
              <div key={`${row.kind}-${row.id}`}>
                <div className="flex items-start" style={{ gap: 12, padding: '14px 0' }}>
                  <span className="flex-none" style={{ width: 56, fontSize: 12.5, lineHeight: 1.4, color: 'var(--color-text-muted)' }}>
                    {when ? (
                      <>
                        {when.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '')}
                        <br />
                        {when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </>
                    ) : 'Not set'}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate" style={{ fontSize: 14.5, color: 'var(--color-text-primary)' }}>{row.title}</span>
                    <span className="block" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.45, color: 'var(--color-text-secondary)' }}>
                      {[row.subtitle, `${row.durationMinutes} min`, row.location, pay].filter(Boolean).join(' · ')}
                    </span>
                    <span className="flex items-center justify-between" style={{ marginTop: 8, gap: 10 }}>
                      <StatusPill label={status.label} tone={status.tone} />
                      {canCancel && (
                        <button onClick={() => setPendingCancel(row)}
                          style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
                          {row.kind === 'pt' && row.status === 'pending' ? 'Withdraw request' : 'Cancel'}
                        </button>
                      )}
                    </span>
                  </span>
                </div>
                {i < visible.length - 1 && <div className="hair" />}
              </div>
            );
          })}
        </section>
      )}

      <NocButton variant="action" onClick={() => navigate('/member/book-class')}>
        Book a session
      </NocButton>

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
