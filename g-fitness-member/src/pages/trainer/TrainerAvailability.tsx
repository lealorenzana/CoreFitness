import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash, WarningCircle } from '@phosphor-icons/react';
import { SkeletonList } from '../../components/ui/Skeleton';
import { Field, Select } from '../../components/ui/Field';
import GlassSheet from '../../components/ui/GlassSheet';
import Modal from '../../components/ui/Modal';
import { Chip, Eyebrow, NocButton, Panel } from '../../components/ui/noc';
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
import { Page, PageTitle } from '../../components/ui/page';

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
    <Page>
      <PageTitle back fallback="/trainer/schedule" title="Bookable hours" subtitle="When members can book you 1-on-1" />

      {loading ? (
        <SkeletonList count={3} />
      ) : (
        <>
          {/* The number that matters, derived rather than stored. Zero windows
              means zero slots, and the screen says so plainly instead of
              looking like an empty list that might still work. */}
          <Panel glow={totalSlots === 0 ? 'action' : 'structure'}>
            <Eyebrow tone={totalSlots === 0 ? 'action' : undefined}>Open 1-on-1 slots each week</Eyebrow>
            <p className="flex items-baseline" style={{ gap: 7, marginTop: 6 }}>
              <span style={{
                fontSize: 'var(--text-hero)', fontWeight: 600, lineHeight: 1,
                letterSpacing: 'var(--tracking-hero)', color: 'var(--color-text-primary)',
              }}>
                {totalSlots}
              </span>
              <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>{totalSlots === 1 ? 'slot' : 'slots'}</span>
            </p>
            <p style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
              {totalSlots === 0
                ? 'Members cannot book a session with you until you add hours here.'
                : 'A slot disappears from the member’s booking screen once it is taken or clashes with a class you teach.'}
            </p>
          </Panel>

          {rows.length === 0 ? (
            <div className="text-center" style={{ padding: '24px 12px' }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>No hours set</p>
              <p style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
                Add the times you are free to coach. Members pick from those, so nothing gets booked
                outside them.
              </p>
            </div>
          ) : (
            <div className="flex flex-col noc-rows" style={{ gap: 16 }}>
              {byDay.map(([dow, items]) => (
                <section key={dow}>
                  <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    {DAY_NAMES[dow]}
                  </h2>
                  <div style={{ marginTop: 2 }}>
                    {items.map((row, i) => (
                      <div key={row.id}>
                        <div className="flex items-center" style={{ gap: 12, padding: '12px 0' }}>
                          <div className="flex-1 min-w-0">
                            <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                              {timeLabel(row.start_time)} – {timeLabel(row.end_time)}
                            </p>
                            <p style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-secondary)' }}>
                              {slotsIn(row)} × {row.slot_minutes} min
                            </p>
                          </div>
                          <button
                            onClick={() => setConfirmDelete(row)}
                            className="flex-none grid place-items-center noc-press"
                            style={{
                              width: 36, height: 36, borderRadius: 8,
                              border: '1px solid var(--color-hairline)', color: 'var(--color-text-secondary)',
                            }}
                            aria-label={`Remove ${timeLabel(row.start_time)} to ${timeLabel(row.end_time)} on ${DAY_NAMES[dow]}`}
                          >
                            <Trash size={16} />
                          </button>
                        </div>
                        {i < items.length - 1 && <div className="hair" />}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          <NocButton variant="action" className="w-full" icon={<Plus size={16} weight="bold" />} onClick={() => setShowForm(true)}>
            Add hours
          </NocButton>
        </>
      )}

      {/* Add form — the app's glass sheet, portalled over the whole shell. */}
      <GlassSheet
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Add hours"
        subtitle="A window members can book you in"
        footer={
          <NocButton variant="fill" className="w-full" onClick={handleAdd} disabled={saving}>
            {saving ? 'Adding…' : 'Add hours'}
          </NocButton>
        }
      >
        <div className="flex flex-col" style={{ gap: 16 }}>
          <Field label="Day" as="div">
            <div className="flex flex-wrap" style={{ gap: 7, marginTop: 6 }}>
              {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
                <Chip key={dow} label={DAY_SHORT[dow]} on={Number(form.day) === dow}
                  onClick={() => setForm({ ...form, day: String(dow) })} />
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2" style={{ gap: 12 }}>
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
        </div>
      </GlassSheet>

      {/* Delete confirmation — the shared glass Modal. */}
      <Modal
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Remove these hours"
        subtitle={confirmDelete
          ? `${DAY_NAMES[confirmDelete.day_of_week]}, ${timeLabel(confirmDelete.start_time)} – ${timeLabel(confirmDelete.end_time)}. Members will no longer see these slots.`
          : undefined}
        confirmLabel="Remove"
        cancelLabel="Keep"
        onConfirm={() => { if (confirmDelete) void handleDelete(confirmDelete); }}
      >
        {/* Deleting a window does not cancel what is already booked in it.
            Saying so up front avoids a trainer assuming a session went away
            and not turning up for it. */}
        {confirmDelete && bookedDows.has(confirmDelete.day_of_week) ? (
          <p className="flex items-start" style={{ gap: 8, fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
            <WarningCircle size={16} className="flex-none" style={{ color: 'var(--color-secondary)', marginTop: 1 }} />
            You already have a session booked on a {DAY_SHORT[confirmDelete.day_of_week]}. It stays
            booked — cancel it from Bookings if you can’t make it.
          </p>
        ) : <span />}
      </Modal>
    </Page>
  );
}
