import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Clock, CalendarClock, AlertCircle, X } from 'lucide-react';
import { SkeletonList } from '../../components/ui/Skeleton';
import { panelStyle } from '../../components/ui/Card';
import { Field, Select } from '../../components/ui/Field';
import { toast } from '../../components/ui/Toast';
import { errorMessage } from '../../utils/errorMessage';
import { getCurrentTrainerId } from '../../services/trainerService';
import { listTrainerPtSessions } from '../../lib/api/ptSessions';
import {
  listTrainerAvailability,
  addAvailability,
  deleteAvailability,
  type TrainerAvailabilityRow,
} from '../../lib/api/trainerAvailability';

/**
 * The trainer's bookable working hours — the rows a member's booking screen
 * turns into slots.
 *
 * `trainer_availability` and its RLS have existed since migration 0015
 * (`trainer_availability_write_self`: `trainer_id = auth.uid() or
 * is_front_desk()`), but the only UI that ever wrote it was the *admin*
 * Schedule page. A trainer had permission to manage their own hours and no way
 * to exercise it, so in practice the front desk had to do it for them.
 *
 * This screen also retires a genuine trap. `trainer_profiles.availability` is a
 * free-text column with no times, and the old Schedule screen let a trainer set
 * it with weekday chips. That reads exactly like setting your bookable days and
 * isn't: nothing generates a slot from it. A trainer could tick Monday and
 * Wednesday, see them on their profile, and remain unbookable. Those chips are
 * gone; Schedule now links here instead.
 *
 * That column is deliberately **not** written from this screen. It is edited in
 * two other places with a different meaning — TrainerEditProfile offers it as a
 * blurb ("Mornings and weekends") and the admin Trainers page as day chips — so
 * deriving "Monday, Wednesday" from these hours would silently overwrite
 * whatever the trainer or the front desk had typed. One column with two
 * meanings is the actual defect; retiring it belongs with the admin page that
 * still edits it, not here.
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** '18:30:00' → 1110. Minutes-since-midnight is the only sane unit for comparing. */
function toMinutes(hhmmss: string): number {
  const [h, m] = hhmmss.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** '18:30:00' → '6:30 PM'. */
function timeLabel(hhmmss: string): string {
  const [h, m] = hhmmss.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Whole slots a window yields. A 9:00–12:00 window at 45 min gives 4, not 4.5. */
function slotsIn(row: TrainerAvailabilityRow): number {
  return Math.max(0, Math.floor((toMinutes(row.end_time) - toMinutes(row.start_time)) / row.slot_minutes));
}

/**
 * '06:00' … '22:00' in half hours — the gym opens 5 AM and closes 10 PM, and a
 * free-text time input on a phone is a reliable way to get '25:00' typed in.
 */
const TIME_OPTIONS = Array.from({ length: 33 }, (_, i) => {
  const mins = 6 * 60 + i * 30;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
});

export default function TrainerAvailability() {
  const navigate = useNavigate();
  const [trainerId, setTrainerId] = useState('');
  const [rows, setRows] = useState<TrainerAvailabilityRow[]>([]);
  const [bookedDows, setBookedDows] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TrainerAvailabilityRow | null>(null);

  const [form, setForm] = useState({ day: '1', start: '08:00', end: '12:00', slot: '60' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const id = await getCurrentTrainerId();
      if (!id) throw new Error('Not signed in');
      setTrainerId(id);
      const [availability, sessions] = await Promise.all([
        listTrainerAvailability(id),
        listTrainerPtSessions(id).catch(() => []),
      ]);
      setRows(availability);
      // Which weekdays already carry a live 1-on-1 booking. Removing a window
      // does not cancel sessions already booked inside it — those are their own
      // rows — but the trainer should be told before they assume it did.
      const now = Date.now();
      setBookedDows(
        new Set(
          sessions
            .filter((s) => (s.status === 'pending' || s.status === 'approved') && new Date(s.starts_at).getTime() >= now)
            .map((s) => new Date(s.starts_at).getDay())
        )
      );
    } catch (err) {
      toast.error(errorMessage(err, 'Could not load your hours'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (saving) return;
    const day = Number(form.day);
    const start = `${form.start}:00`;
    const end = `${form.end}:00`;
    const slot = Number(form.slot);

    if (toMinutes(end) <= toMinutes(start)) {
      toast.error('The finish time has to be after the start time.');
      return;
    }
    if (toMinutes(end) - toMinutes(start) < slot) {
      toast.error(`That window is shorter than one ${slot}-minute session.`);
      return;
    }
    // The table has no overlap constraint, and `computeOpenSlots` walks each
    // window independently — two overlapping windows on one day therefore emit
    // the same slot time twice, and a member sees the identical hour listed
    // twice on the booking screen.
    const clash = rows.find(
      (r) => r.day_of_week === day && toMinutes(start) < toMinutes(r.end_time) && toMinutes(end) > toMinutes(r.start_time)
    );
    if (clash) {
      toast.error(
        `That overlaps your existing ${timeLabel(clash.start_time)}–${timeLabel(clash.end_time)} window on ${DAY_SHORT[day]}.`
      );
      return;
    }

    setSaving(true);
    try {
      const created = await addAvailability({
        trainer_id: trainerId,
        day_of_week: day,
        start_time: start,
        end_time: end,
        slot_minutes: slot,
      });
      const next = [...rows, created].sort(
        (a, b) => a.day_of_week - b.day_of_week || toMinutes(a.start_time) - toMinutes(b.start_time)
      );
      setRows(next);
      setShowForm(false);
      toast.success('Hours added — members can book these now.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not add those hours'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: TrainerAvailabilityRow) => {
    setConfirmDelete(null);
    try {
      await deleteAvailability(row.id);
      const next = rows.filter((r) => r.id !== row.id);
      setRows(next);
      toast.success('Hours removed.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not remove those hours'));
    }
  };

  const totalSlots = rows.reduce((sum, r) => sum + slotsIn(r), 0);

  // Grouped by weekday, Monday first — a working week doesn't start on Sunday.
  const byDay = [1, 2, 3, 4, 5, 6, 0]
    .map((dow) => [dow, rows.filter((r) => r.day_of_week === dow)] as const)
    .filter(([, items]) => items.length > 0);

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/trainer/schedule')}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}
          aria-label="Back to schedule"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="display text-xl text-white">Bookable hours</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            When members can book you 1-on-1
          </p>
        </div>
      </div>

      {loading ? (
        <SkeletonList count={3} />
      ) : (
        <>
          {/* The number that matters, derived rather than stored. Zero windows
              means zero slots, and the screen says so plainly instead of
              looking like an empty list that might still work. */}
          <div className="p-4" style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Open 1-on-1 slots each week
                </p>
                <p className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="display text-2xl text-white">{totalSlots}</span>
                  <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                    {totalSlots === 1 ? 'slot' : 'slots'}
                  </span>
                </p>
              </div>
              <span
                className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--color-primary-light)' }}
              >
                <CalendarClock size={20} style={{ color: 'var(--color-primary)' }} />
              </span>
            </div>
            <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              {totalSlots === 0
                ? 'Members cannot book a session with you until you add hours here.'
                : 'A slot disappears from the member’s booking screen once it is taken or clashes with a class you teach.'}
            </p>
          </div>

          {rows.length === 0 ? (
            <div className="p-8 text-center" style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}>
              <Clock size={36} className="mx-auto mb-3" style={{ color: 'var(--color-border)' }} />
              <p className="text-sm font-semibold text-white">No hours set</p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                Add the times you are free to coach. Members pick from those, so nothing gets booked
                outside them.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {byDay.map(([dow, items], gi) => (
                <motion.div
                  key={dow}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(gi * 0.04, 0.2) }}
                >
                  <p
                    className="text-xs font-semibold uppercase tracking-wider mb-2"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {DAY_NAMES[dow]}
                  </p>
                  <div className="space-y-2">
                    {items.map((row) => (
                      <div
                        key={row.id}
                        className="p-3.5 flex items-center gap-3"
                        style={{ ...panelStyle, borderRadius: 'var(--radius-card)' }}
                      >
                        <span
                          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: 'var(--color-primary-light)' }}
                        >
                          <Clock size={17} style={{ color: 'var(--color-primary)' }} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white">
                            {timeLabel(row.start_time)} – {timeLabel(row.end_time)}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            {slotsIn(row)} × {row.slot_minutes} min
                          </p>
                        </div>
                        <button
                          onClick={() => setConfirmDelete(row)}
                          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
                          style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}
                          aria-label={`Remove ${timeLabel(row.start_time)} to ${timeLabel(row.end_time)} on ${DAY_NAMES[dow]}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          <button
            onClick={() => setShowForm(true)}
            className="w-full h-12 rounded-full font-semibold text-sm text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            style={{ background: 'var(--color-primary)' }}
          >
            <Plus size={17} /> Add hours
          </button>
        </>
      )}

      {/* Add form.
          Portalled to #modal-root rather than rendered in place: TrainerLayout's
          <main> is `relative` and scrolls, so an `absolute inset-0` overlay
          declared here would be clipped to the scrolling area and sit *under*
          the bottom nav. */}
      {createPortal(
      <AnimatePresence>
        {showForm && (
          <div className="absolute inset-0 flex items-end justify-center pointer-events-auto">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/75"
              onClick={() => setShowForm(false)}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="relative w-full p-5 space-y-4"
              style={{
                background: 'var(--color-surface-raised)',
                borderTop: '1px solid var(--color-border)',
                borderTopLeftRadius: 'var(--radius-panel)',
                borderTopRightRadius: 'var(--radius-panel)',
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="display text-lg text-white">Add hours</h2>
                <button
                  onClick={() => setShowForm(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <Field label="Day" as="div">
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
                    const selected = Number(form.day) === dow;
                    return (
                      <button
                        key={dow}
                        type="button"
                        onClick={() => setForm({ ...form, day: String(dow) })}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold active:scale-95 transition-transform"
                        style={{
                          background: selected ? 'var(--color-primary)' : 'var(--color-bg)',
                          color: selected ? '#fff' : 'var(--color-text-muted)',
                          border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        }}
                      >
                        {DAY_SHORT[dow]}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="From">
                  <Select value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })}>
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>{timeLabel(`${t}:00`)}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Until">
                  <Select value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })}>
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>{timeLabel(`${t}:00`)}</option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field label="Session length" hint="How long one booking with you runs.">
                <Select value={form.slot} onChange={(e) => setForm({ ...form, slot: e.target.value })}>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="90">1 hour 30 minutes</option>
                </Select>
              </Field>

              <button
                onClick={handleAdd}
                disabled={saving}
                className="w-full h-12 rounded-full font-semibold text-sm text-white disabled:opacity-50"
                style={{ background: 'var(--color-primary)' }}
              >
                {saving ? 'Adding…' : 'Add hours'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.getElementById('modal-root')!
      )}

      {/* Delete confirmation */}
      {createPortal(
      <AnimatePresence>
        {confirmDelete && (
          <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-auto">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80"
              onClick={() => setConfirmDelete(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative p-5 w-full max-w-[300px]"
              style={{
                background: 'var(--color-surface-raised)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-panel)',
                boxShadow: 'var(--shadow-panel)',
              }}
            >
              <h3 className="display text-lg text-white mb-1">Remove these hours?</h3>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                {DAY_NAMES[confirmDelete.day_of_week]}, {timeLabel(confirmDelete.start_time)} –{' '}
                {timeLabel(confirmDelete.end_time)}. Members will no longer see these slots.
              </p>

              {/* Deleting a window does not cancel what is already booked in it.
                  Saying so up front avoids a trainer assuming a session went
                  away and not turning up for it. */}
              {bookedDows.has(confirmDelete.day_of_week) && (
                <div
                  className="flex items-start gap-2 mt-3 p-2.5"
                  style={{
                    background: 'var(--color-secondary-light)',
                    border: '1px solid rgba(245,158,11,0.30)',
                    borderRadius: 'var(--radius-card)',
                  }}
                >
                  <AlertCircle size={14} style={{ color: 'var(--color-secondary)' }} className="flex-shrink-0 mt-0.5" />
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                    You already have a session booked on a {DAY_SHORT[confirmDelete.day_of_week]}. It stays
                    booked — cancel it from Bookings if you can’t make it.
                  </p>
                </div>
              )}

              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 h-11 rounded-full font-semibold text-sm"
                  style={{
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  Keep
                </button>
                <button
                  onClick={() => handleDelete(confirmDelete)}
                  className="flex-1 h-11 rounded-full font-semibold text-sm text-black"
                  style={{ background: 'var(--color-secondary)' }}
                >
                  Remove
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.getElementById('modal-root')!
      )}
    </div>
  );
}
