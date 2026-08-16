import { SkeletonList } from '../components/ui/Skeleton';
import { panelStyle } from '../components/ui/Card';
import { motion } from 'framer-motion';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, MapPin, CheckCircle, XCircle, AlertCircle, ArrowLeft, Trash2, User, Dumbbell } from 'lucide-react';
import Modal from '../components/ui/Modal';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { useLiveData } from '../hooks/useLiveData';
import {
  getCurrentMemberId,
  listMyBookings,
  cancelMyBooking,
  isUpcoming,
  type MyBooking,
} from '../services/bookingService';
import type { BookingStatus } from '../types/db';

/**
 * The member's own bookings — group classes and personal training in one list,
 * because "what am I doing this week" is one question.
 *
 * Upcoming vs past is decided by the session's own time, not its status. A
 * booking that was approved for last Tuesday belongs in history even though it
 * is still `approved`; the old screen filed it under Upcoming forever.
 */

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'Awaiting approval',
  approved: 'Confirmed',
  rejected: 'Declined',
  cancelled: 'Cancelled',
};

const STATUS_STYLE: Record<BookingStatus, { color: string; background: string }> = {
  pending: { color: 'var(--color-secondary)', background: 'var(--color-secondary-light)' },
  approved: { color: 'var(--color-primary)', background: 'var(--color-primary-light)' },
  rejected: { color: '#ef4444', background: 'rgba(239,68,68,0.15)' },
  cancelled: { color: 'var(--color-text-muted)', background: 'rgba(148,163,184,0.15)' },
};

function statusIcon(status: BookingStatus) {
  if (status === 'pending') return <AlertCircle size={13} />;
  if (status === 'approved') return <CheckCircle size={13} />;
  return <XCircle size={13} />;
}

export default function BookingHistory() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<MyBooking[]>([]);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [loading, setLoading] = useState(true);
  const [pendingCancel, setPendingCancel] = useState<MyBooking | null>(null);
  const [busy, setBusy] = useState(false);

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

  useEffect(() => { load(); }, [load]);

  // The status a member checks here is changed by the front desk, not by them.
  useLiveData(() => load(true));

  const upcoming = useMemo(() => rows.filter((r) => isUpcoming(r)), [rows]);
  const past = useMemo(() => rows.filter((r) => !isUpcoming(r)), [rows]);
  const visible = tab === 'upcoming' ? upcoming : past;

  const confirmCancel = async () => {
    if (!pendingCancel) return;
    setBusy(true);
    try {
      await cancelMyBooking(pendingCancel);
      toast.success(pendingCancel.kind === 'pt' ? 'Request withdrawn' : 'Booking cancelled');
      setPendingCancel(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not cancel that booking'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 pb-4">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/member/home'))}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}>
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="display text-xl text-white">My Bookings</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Classes and personal training
          </p>
        </div>
      </motion.div>

      {/* Violet marks the selection, matching the Progress Hub control. */}
      <div className="grid grid-cols-2 gap-1 p-1"
        style={{ ...panelStyle, borderRadius: 'var(--radius-btn)' }} role="tablist">
        {([['upcoming', 'Upcoming', upcoming.length], ['past', 'Past', past.length]] as const).map(([id, label, count]) => (
          <button key={id} onClick={() => setTab(id)} role="tab" aria-selected={tab === id}
            className="py-2 rounded-full font-semibold text-xs transition-colors"
            style={{
              background: tab === id ? 'var(--color-primary)' : 'transparent',
              color: tab === id ? '#fff' : 'var(--color-text-muted)',
            }}>
            {label} ({count})
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonList />
      ) : visible.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-8 text-center"
          style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}>
          <Calendar size={40} className="mx-auto mb-3" style={{ color: 'var(--color-border)' }} />
          <p className="text-sm font-semibold text-white">
            {tab === 'upcoming' ? 'Nothing booked yet' : 'No past sessions'}
          </p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            {tab === 'upcoming'
              ? 'Book a class or a 1-on-1 session and it appears here straight away, even before the desk approves it.'
              : 'Sessions move here once their time has passed.'}
          </p>
          {tab === 'upcoming' && (
            <button onClick={() => navigate('/member/book-class')}
              className="mt-4 px-6 h-10 rounded-full font-semibold text-sm text-black"
              style={{ background: 'var(--color-secondary)' }}>
              Book a session
            </button>
          )}
        </motion.div>
      ) : (
        <div className="space-y-3">
          {visible.map((row, i) => {
            const style = STATUS_STYLE[row.status];
            return (
              <motion.div key={`${row.kind}-${row.id}`}
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.05, 0.3) }}
                className="p-4"
                style={{ ...panelStyle, borderRadius: 'var(--radius-panel)', boxShadow: 'var(--shadow-panel)' }}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: row.kind === 'pt' ? 'var(--color-secondary-light)' : 'var(--color-primary-light)' }}>
                      {row.kind === 'pt'
                        ? <User size={16} style={{ color: 'var(--color-secondary)' }} />
                        : <Dumbbell size={16} style={{ color: 'var(--color-primary)' }} />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-white font-semibold text-sm truncate">{row.title}</h3>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{row.subtitle}</p>
                    </div>
                  </div>
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0"
                    style={style}>
                    {statusIcon(row.status)} {STATUS_LABEL[row.status]}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  <div className="flex items-center gap-2">
                    <Calendar size={13} style={{ color: 'var(--color-secondary)' }} />
                    <span>
                      {row.startsAt
                        ? new Date(row.startsAt).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
                        : 'Not scheduled yet'}
                    </span>
                  </div>
                  {row.startsAt && (
                    <div className="flex items-center gap-2">
                      <Clock size={13} style={{ color: 'var(--color-secondary)' }} />
                      <span>
                        {new Date(row.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {row.durationMinutes} min
                      </span>
                    </div>
                  )}
                  {row.location && (
                    <div className="flex items-center gap-2">
                      <MapPin size={13} style={{ color: 'var(--color-secondary)' }} />
                      <span>{row.location}</span>
                    </div>
                  )}
                </div>

                {row.cancellable && isUpcoming(row) && (
                  <button onClick={() => setPendingCancel(row)}
                    className="mt-3 w-full py-2 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                    <Trash2 size={13} /> {row.kind === 'pt' ? 'Withdraw request' : 'Cancel booking'}
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      <motion.button initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        onClick={() => navigate('/member/book-class')}
        className="w-full py-3.5 rounded-full font-semibold text-black"
        style={{ background: 'var(--color-secondary)' }}>
        + Book a Session
      </motion.button>

      <Modal
        isOpen={pendingCancel !== null}
        onClose={() => !busy && setPendingCancel(null)}
        title={pendingCancel?.kind === 'pt' ? 'Withdraw this request?' : 'Cancel this booking?'}
        subtitle={pendingCancel?.title}
        confirmLabel={busy ? 'Working…' : 'Yes, cancel it'}
        cancelLabel="Keep it"
        confirmDisabled={busy}
        onConfirm={confirmCancel}>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {pendingCancel?.kind === 'pt'
            ? 'Your trainer will be free at that time again. You can request another slot afterwards.'
            : 'Your seat is released back to the class. You can book it again if it stays open.'}
        </p>
      </Modal>
    </div>
  );
}