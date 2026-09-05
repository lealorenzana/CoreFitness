import { motion, AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import Badge from '../components/ui/Badge';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Pagination from '../components/ui/Pagination';
import TrainerDetailDrawer from '../components/ui/TrainerDetailDrawer';
import {
  PageHeader, StatTiles, EmptyState, CardGrid, TileCard, OpenChevron,
  SearchBox, PageSummary,
} from '../components/ui/kit';
import { usePaged } from '../hooks/usePaged';
import { UserPlus, X, Edit2, Eye, EyeOff, KeyRound, Copy, Archive, UserX, UserCheck, Clock, Star, Users } from 'lucide-react';
import FormField, { SectionLabel, FieldDivider } from '../components/ui/FormField';
import { showToast } from '../utils/toast';
import {
  createTrainer,
  listTrainers,
  listArchivedTrainers,
  setTrainerStatus,
  updateTrainerProfile,
  getRatingSummaries,
  getTrainerMonths,
} from '../lib/api/trainers';
import { listAllAvailability } from '../lib/api/trainerAvailability';
import { updateProfile } from '../lib/api/profiles';
import type { ProfileStatus } from '../types/db';

interface TrainerDisplay {
  id: string;
  name: string;
  specialization: string;
  email: string;
  phone: string | null;
  bio: string | null;
  photoUrl: string | null;
  /** Free-text weekday labels from `trainer_profiles.availability` — display
   *  only. The hours members actually book live in `trainer_availability`. */
  availabilityDays: string[];
  /** Background from 0041. All optional, all the trainer's own statement —
   *  the admin can fill them in for a coach who has not opened the app yet. */
  yearsExperience: number | null;
  certifications: string[];
  focusAreas: string[];
  achievements: string | null;
  /** The **public** figure: null until three members have evaluated (0066).
   *  Kept so the admin can see what a member sees. */
  ratingAverage: number | null;
  /** The gym's own figure, from `trainer_evaluation_months` — never withheld.
   *  0042 hid this from the admin too; 0066 reverses that deliberately, because
   *  a gym that cannot read its own evaluations cannot act on them. */
  gymAverage: number | null;
  /** The most recent month evaluated, for "is this current or from March?". */
  latestPeriod: string | null;
  ratingCount: number;
  /** How many real bookable-hour windows this trainer has set (0015). */
  bookableWindows: number;
  status: ProfileStatus;
}

/** The weekday chips in both modals. Display labels for the free-text
 *  `trainer_profiles.availability` blurb — not bookable hours. */
const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * One comma-separated line -> a Postgres text[], matching the trainer's own
 * editor in the member app so both write the same shape.
 *
 * Blank entries are dropped, so the trailing comma left behind by someone who
 * paused mid-typing never becomes an empty chip on a public profile. An empty
 * result stores NULL rather than `[]` — "not stated" has one representation.
 */
function toList(value: string): string[] | null {
  const items = value.split(',').map((v) => v.trim()).filter(Boolean);
  return items.length > 0 ? items : null;
}

const FIELD_CLASS = 'w-full px-3 py-2 rounded-xl text-white text-xs';
const FIELD_STYLE = { background: 'var(--color-bg)', border: '1px solid var(--color-border)' };
/** Violet outline marks the two fields that create the actual login. */
const CREDENTIAL_STYLE = {
  background: 'var(--color-bg)',
  border: '1px solid var(--color-primary)',
  boxShadow: '0 0 0 1px rgba(124,58,237,0.1)',
};

export default function Trainers() {
  const [trainers, setTrainers] = useState<TrainerDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', specialty: '', phone: '', bio: '', availability: [] as string[], loginEmail: '', loginPassword: '' });
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    id: '', name: '', specialty: '', email: '', phone: '', bio: '', availability: [] as string[],
    yearsExperience: '', certifications: '', focusAreas: '', achievements: '',
  });
  const [saving, setSaving] = useState(false);
  const [toSuspend, setToSuspend] = useState<TrainerDisplay | null>(null);
  const [toArchive, setToArchive] = useState<TrainerDisplay | null>(null);
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const loadTrainers = useCallback(async () => {
    setLoading(true);
    try {
      // Bookable-hour windows come from the real table, in one query for the
      // whole roster — the card needs to say whether a trainer is actually
      // bookable, and the CSV on trainer_profiles cannot answer that.
      const [rows, availability, scores, months] = await Promise.all([
        showArchived ? listArchivedTrainers() : listTrainers(),
        listAllAvailability().catch(() => []),
        // Degrades to an empty map rather than failing the roster: the gym needs
        // its trainer list far more than it needs the scores on it.
        getRatingSummaries().catch(() => new Map()),
        getTrainerMonths().catch(() => []),
      ]);

      // Weighted by how many evaluations each month carried — a month with one
      // 5 and a month with nine 3s do not deserve equal say in the overall.
      const gymScore = new Map<string, { sum: number; n: number; latest: string }>();
      for (const m of months) {
        const at = gymScore.get(m.trainer_id) ?? { sum: 0, n: 0, latest: m.period };
        at.sum += m.average_stars * m.evaluations;
        at.n += m.evaluations;
        if (m.period > at.latest) at.latest = m.period;
        gymScore.set(m.trainer_id, at);
      }
      const windowsByTrainer = new Map<string, number>();
      for (const a of availability) {
        windowsByTrainer.set(a.trainer_id, (windowsByTrainer.get(a.trainer_id) ?? 0) + 1);
      }

      setTrainers(
        rows.map(({ profile, trainer }) => ({
          id: profile.id,
          name: `${profile.first_name} ${profile.last_name}`.trim(),
          specialization: trainer.specialization || 'General Training',
          email: profile.email,
          phone: profile.phone,
          bio: trainer.bio,
          photoUrl: profile.photo_url,
          ratingAverage: scores.get(profile.id)?.average_stars ?? null,
          gymAverage: (() => {
            const g = gymScore.get(profile.id);
            return g && g.n > 0 ? Math.round((g.sum / g.n) * 10) / 10 : null;
          })(),
          latestPeriod: gymScore.get(profile.id)?.latest ?? null,
          ratingCount: scores.get(profile.id)?.rating_count ?? 0,
          yearsExperience: trainer.years_experience ?? null,
          certifications: trainer.certifications ?? [],
          focusAreas: trainer.focus_areas ?? [],
          achievements: trainer.achievements ?? null,
          availabilityDays: trainer.availability
            ? trainer.availability.split(',').map((d) => d.trim()).filter(Boolean)
            : [],
          bookableWindows: windowsByTrainer.get(profile.id) ?? 0,
          status: profile.status,
        }))
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load trainers', 'error');
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    loadTrainers();
  }, [loadTrainers]);

  const visible = trainers.filter((t) => {
    const q = search.trim().toLowerCase();
    return (
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.email.toLowerCase().includes(q) ||
      t.specialization.toLowerCase().includes(q)
    );
  });

  const paged = usePaged(visible, 12);

  /**
   * Suspend / reactivate / archive.
   *
   * None of this existed: a coach who left the gym stayed on the roster with a
   * working login forever, and the only lever was editing their name. Archive
   * keeps every class and session they ever ran — a delete would orphan them.
   */
  const changeStatus = async (trainer: TrainerDisplay, status: ProfileStatus, message: string) => {
    try {
      await setTrainerStatus(trainer.id, status);
      showToast(message, 'success');
      setToSuspend(null);
      setToArchive(null);
      await loadTrainers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update that account', 'error');
    }
  };

  const handleAddTrainer = async () => {
    // Marked against the field, not just announced in a toast that disappears
    // before you've worked out which of the seven boxes it meant.
    const next: Record<string, string> = {};
    if (!addForm.name.trim()) next.name = 'Required.';
    if (!addForm.specialty.trim()) next.specialty = 'Required.';
    if (!addForm.loginEmail.trim()) next.loginEmail = 'Without this they cannot sign in.';
    if (!addForm.loginPassword.trim()) next.loginPassword = 'Set a password for them.';
    else if (addForm.loginPassword.length < 6) next.loginPassword = 'Supabase needs at least 6 characters.';
    setAddErrors(next);
    if (Object.keys(next).length > 0) {
      showToast('Some required details are missing', 'error');
      return;
    }

    const [firstName, ...rest] = addForm.name.trim().split(/\s+/);
    const lastName = rest.join(' ') || firstName;

    setSaving(true);
    try {
      await createTrainer({
        email: addForm.loginEmail,
        password: addForm.loginPassword,
        firstName,
        lastName,
        phone: addForm.phone || undefined,
        specialization: addForm.specialty,
        bio: addForm.bio || undefined,
        availability: addForm.availability.join(', ') || undefined,
      });
      showToast(`${addForm.name} added! They can now log in with the credentials you set.`, 'success');
      setAddForm({ name: '', specialty: '', phone: '', bio: '', availability: [], loginEmail: '', loginPassword: '' });
      setShowAddModal(false);
      await loadTrainers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create trainer account', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (trainer: TrainerDisplay) => {
    setEditErrors({});
    setEditForm({
      id: trainer.id,
      name: trainer.name,
      specialty: trainer.specialization,
      email: trainer.email,
      phone: trainer.phone || '',
      bio: trainer.bio || '',
      availability: trainer.availabilityDays,
      // Arrays edit as one comma-separated line. `!= null` on the number: a
      // trainer in their first year stores 0, and `|| ''` would blank it.
      yearsExperience: trainer.yearsExperience != null ? String(trainer.yearsExperience) : '',
      certifications: trainer.certifications.join(', '),
      focusAreas: trainer.focusAreas.join(', '),
      achievements: trainer.achievements || '',
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    const next: Record<string, string> = {};
    if (!editForm.name.trim()) next.name = 'Required.';
    if (!editForm.specialty.trim()) next.specialty = 'Required.';

    // Mirrors the CHECK constraint in 0041. Validated here as well because a
    // constraint violation arrives as "new row violates check constraint
    // trainer_profiles_years_sane", which is not a sentence to put in front of
    // someone who typed a birth year into a duration field.
    const editYears = editForm.yearsExperience.trim() === '' ? null : Number(editForm.yearsExperience);
    if (editYears != null && (!Number.isInteger(editYears) || editYears < 0 || editYears > 70)) {
      next.yearsExperience = 'Whole number, 0-70.';
    }

    setEditErrors(next);
    if (Object.keys(next).length > 0) {
      showToast(
        next.yearsExperience && !next.name && !next.specialty
          ? 'Years coaching must be a whole number between 0 and 70'
          : 'Name and specialization are required',
        'error'
      );
      return;
    }
    const [firstName, ...rest] = editForm.name.trim().split(/\s+/);
    const lastName = rest.join(' ') || firstName;

    setSaving(true);
    try {
      await updateProfile(editForm.id, {
        first_name: firstName,
        last_name: lastName,
        phone: editForm.phone || null,
      });
      await updateTrainerProfile(editForm.id, {
        specialization: editForm.specialty,
        bio: editForm.bio || null,
        availability: editForm.availability.join(', ') || null,
        years_experience: editYears,
        certifications: toList(editForm.certifications),
        focus_areas: toList(editForm.focusAreas),
        achievements: editForm.achievements.trim() || null,
      });
      showToast(`${editForm.name} updated successfully!`, 'success');
      setShowEditModal(false);
      await loadTrainers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update trainer', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Trainers"
        subtitle={showArchived ? 'Archived trainers — classes and sessions retained' : 'Who coaches here, and who members can actually book'}
        actions={
          <>
            <SearchBox value={search} onChange={setSearch} placeholder="Search name or specialty…" width={210} />
            <Button variant="outline" size="sm" onClick={() => setShowArchived((v) => !v)}>
              <Archive size={14} /> {showArchived ? 'Active roster' : 'Archived'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowAddModal(true)}>
              <UserPlus size={14} /> Add trainer
            </Button>
          </>
        }
      />

      {/* Stats. "Bookable" counts real trainer_availability windows — the old
          "Availability Set" counted the free-text weekday blurb, which produces
          no slots, so it reported trainers as available who could not be booked.

          These were three tiles on a `grid-cols-3`, so three small numbers were
          stretched across the whole page. They are numbers; they need ~140px. */}
      <StatTiles items={[
        { label: 'On the roster', value: trainers.length, icon: Users },
        { label: 'Active', value: trainers.filter((t) => t.status === 'active').length, icon: UserCheck },
        {
          label: 'Bookable',
          value: trainers.filter((t) => t.bookableWindows > 0).length,
          icon: Clock,
          // Amber when somebody has no hours set: that trainer cannot be booked
          // at all, which is a thing to go and fix.
          tone: trainers.some((t) => t.bookableWindows === 0) ? 'secondary' : 'primary',
        },
      ]} />

      {/* The roster.

          Two things changed. It was `grid-cols-2`, so a gym with one trainer
          drew an 830px card with a full-width amber button in it; `CardGrid`
          lays out ~320px columns, so one trainer is one card-sized card. And
          the card itself is the button — "View Profile" was a bar across the
          bottom of every card repeating what clicking the card should do. The
          three icon actions stay, revealed on hover, so the common case (open
          the profile) is one click anywhere and the rarer ones are still one
          click too. */}
      {loading ? (
        <p className="text-center py-10 text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading trainers…</p>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={showArchived ? Archive : UserPlus}
          title={search ? 'No trainer matches' : showArchived ? 'No archived trainers' : 'No trainers yet'}
          hint={
            search
              ? `Nothing matches “${search}”.`
              : showArchived
                ? 'Archived trainers keep every class and session they ever ran.'
                : 'Add a coach and they get a login for the trainer app.'
          }
          action={!search && !showArchived
            ? <Button variant="secondary" size="sm" onClick={() => setShowAddModal(true)}><UserPlus size={14} /> Add trainer</Button>
            : undefined}
        />
      ) : (
        <CardGrid min={320}>
          {paged.visible.map((trainer) => (
            <TileCard key={trainer.id} onClick={() => setViewingId(trainer.id)}
              dim={trainer.status !== 'active'} title={`Open ${trainer.name}'s profile`}>
              <div className="flex items-start gap-3">
                <Avatar name={trainer.name} photoUrl={trainer.photoUrl} size={44} tone="secondary" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-[13px] font-bold text-white truncate">{trainer.name}</h3>
                    {trainer.status !== 'active' && (
                      <Badge variant="Suspended" className="!text-[9px] !px-1.5 !py-0">{trainer.status.replace('_', ' ')}</Badge>
                    )}
                  </div>
                  <p className="text-[11px] truncate" style={{ color: 'var(--color-primary)' }}>
                    {trainer.specialization}
                  </p>
                  <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{trainer.email}</p>
                </div>
                <OpenChevron />
              </div>

              {/* Member ratings (0042). The average is withheld below three
                  ratings for the admin too — showing the gym a number the
                  member app hides would turn a policy into a display trick,
                  and it is the version that would get repeated to the coach. */}
              <div className="mt-2.5 flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                  <Star size={10} style={{ color: 'var(--color-secondary)' }} fill="currentColor" />
                  {/* The gym's own figure, shown whatever the count. The
                      trailing note says what members currently see, so nobody
                      quotes an internal average back as a public one. */}
                  {trainer.gymAverage != null
                    ? `${trainer.gymAverage.toFixed(1)}${
                        trainer.ratingAverage == null ? ' · not public yet' : ''
                      }`
                    : 'No evaluations'}
                </span>
                {/* Whether members can actually book this trainer. The weekday
                    blurb is a label with no times — showing only that made
                    every trainer look bookable. */}
                <span className="flex items-center gap-1"
                  style={{ color: trainer.bookableWindows > 0 ? 'var(--color-primary)' : 'var(--color-secondary)' }}>
                  <Clock size={10} />
                  {trainer.bookableWindows > 0
                    ? `${trainer.bookableWindows} window${trainer.bookableWindows === 1 ? '' : 's'}`
                    : 'No hours set'}
                </span>
              </div>

              {trainer.availabilityDays.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {trainer.availabilityDays.map((day) => (
                    <span key={day} className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                      style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}>
                      {day.slice(0, 3)}
                    </span>
                  ))}
                </div>
              )}

              {/* Always visible, deliberately.
                  Revealing these on hover reserves the space anyway — the card
                  keeps a blank strip so it does not resize under the cursor —
                  so hiding them buys nothing and costs you having to discover
                  them. They are quiet instead: surface-coloured, small, and
                  clearly secondary to the card itself, which is the button.
                  `stopPropagation` keeps them from also opening the profile. */}
              <div className="mt-2.5 flex gap-1.5">
                {!showArchived && (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); openEdit(trainer); }}
                      className="px-2 h-7 rounded-lg text-[10px] font-semibold" data-tip="Edit trainer"
                      style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                      <Edit2 size={11} className="inline mr-1" />Edit
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setToSuspend(trainer); }}
                      data-tip={trainer.status === 'suspended' ? 'Reactivate account' : 'Suspend account'}
                      className="px-2 h-7 rounded-lg text-[10px] font-semibold"
                      style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                      {trainer.status === 'suspended'
                        ? <><UserCheck size={11} className="inline mr-1" />Reactivate</>
                        : <><UserX size={11} className="inline mr-1" />Suspend</>}
                    </button>
                  </>
                )}
                <button onClick={(e) => { e.stopPropagation(); setToArchive(trainer); }}
                  data-tip={showArchived ? 'Restore trainer' : 'Archive trainer'}
                  className="px-2 h-7 rounded-lg text-[10px] font-semibold"
                  style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}>
                  <Archive size={11} className="inline mr-1" />{showArchived ? 'Restore' : 'Archive'}
                </button>
              </div>
            </TileCard>
          ))}
        </CardGrid>
      )}

      {/* A roster is small until it isn't; this one has no ceiling without it. */}
      {visible.length > 0 && (
        <div className="flex items-center justify-between">
          <PageSummary page={paged.page} perPage={paged.perPage} total={paged.total} noun="trainers" />
          <Pagination currentPage={paged.page} totalItems={paged.total}
            itemsPerPage={paged.perPage} onPageChange={paged.setPage} />
        </div>
      )}

      <TrainerDetailDrawer trainerId={viewingId} onClose={() => setViewingId(null)} onChanged={loadTrainers} />

      <ConfirmDialog
        isOpen={!!toSuspend}
        onClose={() => setToSuspend(null)}
        onConfirm={() => {
          if (!toSuspend) return;
          const next: ProfileStatus = toSuspend.status === 'suspended' ? 'active' : 'suspended';
          void changeStatus(
            toSuspend,
            next,
            next === 'suspended'
              ? `${toSuspend.name} suspended — they can no longer log in`
              : `${toSuspend.name} reactivated`
          );
        }}
        title={toSuspend?.status === 'suspended' ? 'Reactivate Trainer' : 'Suspend Trainer'}
        message={
          toSuspend?.status === 'suspended'
            ? `Let ${toSuspend?.name ?? 'this trainer'} log in again? Their classes and sessions are untouched — this only restores access.`
            : `Suspend ${toSuspend?.name ?? 'this trainer'}? They will not be able to log in to the trainer app. Their classes and booked sessions stay exactly as they are, so anything already scheduled still needs handling at the desk. Reversible at any time.`
        }
        confirmText={toSuspend?.status === 'suspended' ? 'Reactivate' : 'Suspend'}
        type={toSuspend?.status === 'suspended' ? 'info' : 'warning'}
      />

      <ConfirmDialog
        isOpen={!!toArchive}
        onClose={() => setToArchive(null)}
        onConfirm={() => {
          if (!toArchive) return;
          void changeStatus(
            toArchive,
            showArchived ? 'active' : 'archived',
            showArchived
              ? `${toArchive.name} restored to the active roster`
              : `${toArchive.name} archived. Their classes and session history are kept.`
          );
        }}
        title={showArchived ? 'Restore Trainer' : 'Archive Trainer'}
        message={
          showArchived
            ? `Restore ${toArchive?.name ?? 'this trainer'} to the active roster? They will be able to log in again.`
            : `Archive ${toArchive?.name ?? 'this trainer'}? They drop off the roster and can no longer log in, but every class they taught and every session they ran is kept — deleting them would orphan all of it. You can restore them later.`
        }
        confirmText={showArchived ? 'Restore' : 'Archive'}
        type={showArchived ? 'info' : 'danger'}
      />

      {/* Add Trainer Modal */}
      <AnimatePresence>
        {showAddModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" onClick={() => setShowAddModal(false)} />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
                onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <div>
                    <h2 className="text-lg font-bold text-white">Add New Trainer</h2>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Fill in the trainer details</p>
                  </div>
                  <button onClick={() => setShowAddModal(false)}
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: 'var(--color-text-muted)' }}>
                    <X size={18} />
                  </button>
                </div>

                {/* Form */}
                <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-dark-border">
                  <SectionLabel>Who they are</SectionLabel>
                  <FormField label="Full name" required error={addErrors.name}>
                    <input value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                      placeholder="e.g. Coach Maria"
                      className={FIELD_CLASS} style={FIELD_STYLE} />
                  </FormField>
                  <FormField label="Specialization" required error={addErrors.specialty}
                    hint="Shown to members as their headline — what they coach.">
                    <input value={addForm.specialty} onChange={e => setAddForm({ ...addForm, specialty: e.target.value })}
                      placeholder="e.g. Yoga, Boxing, HIIT"
                      className={FIELD_CLASS} style={FIELD_STYLE} />
                  </FormField>
                  {/* There was a second "Email" field here, above Phone. It was
                      bound to `addForm.email` and never sent anywhere —
                      handleAddTrainer only ever passed `loginEmail`. Whatever
                      the front desk typed into it was discarded on submit.
                      There is one email on a profile, and it is the login one
                      collected below. */}
                  <FormField label="Phone">
                    <input value={addForm.phone} onChange={e => setAddForm({ ...addForm, phone: e.target.value })}
                      placeholder="+63 917 000 0000"
                      className={FIELD_CLASS} style={FIELD_STYLE} />
                  </FormField>
                  <FormField label="Bio / description" hint="Members read this on the trainer's profile.">
                    <textarea value={addForm.bio} onChange={e => setAddForm({ ...addForm, bio: e.target.value })}
                      placeholder="Background, certifications, how they like to coach…"
                      rows={2}
                      className={`${FIELD_CLASS} resize-none`} style={FIELD_STYLE} />
                  </FormField>

                  <FieldDivider />
                  <SectionLabel>Availability</SectionLabel>
                  {/* Renamed and explained. As "Available Days" this read like the
                      switch that makes a trainer bookable — it isn't. It writes a
                      free-text weekday blurb with no times, and no slot can be
                      generated from it. Bookable hours live in
                      `trainer_availability`, which only the trainer may write. */}
                  <FormField
                    label="Days they usually coach"
                    hint="Display only — it appears on their profile. Bookable time slots are set by the trainer in the app, under Schedule → Availability."
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAY_LABELS.map(day => {
                        const isSelected = addForm.availability.includes(day);
                        return (
                          <button key={day} type="button"
                            onClick={() => setAddForm({ ...addForm, availability: isSelected ? addForm.availability.filter(d => d !== day) : [...addForm.availability, day] })}
                            className="px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors"
                            style={{
                              background: isSelected ? 'var(--color-primary)' : 'var(--color-bg)',
                              color: isSelected ? '#fff' : 'var(--color-text-muted)',
                              border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            }}>
                            {day.slice(0, 3)}
                          </button>
                        );
                      })}
                    </div>
                  </FormField>

                  <FieldDivider />
                  <div className="flex items-center gap-2">
                    <KeyRound size={13} style={{ color: 'var(--color-secondary)' }} />
                    <SectionLabel>App login</SectionLabel>
                  </div>
                  <p className="text-[10px] -mt-2" style={{ color: 'var(--color-text-muted)' }}>
                    You are setting the trainer's password for them. Write it down before you save —
                    it is not recoverable from this screen afterwards.
                  </p>
                  <FormField label="Login email" required error={addErrors.loginEmail}
                    hint="They sign in with this on the phone app.">
                    <input value={addForm.loginEmail} onChange={e => setAddForm({ ...addForm, loginEmail: e.target.value })}
                      placeholder="e.g. cyrelle@corefitness.com"
                      className={FIELD_CLASS} style={CREDENTIAL_STYLE} />
                  </FormField>
                  <FormField label="Login password" required error={addErrors.loginPassword} hint="At least 6 characters.">
                    <div className="relative">
                      <input type={showLoginPw ? 'text' : 'password'} value={addForm.loginPassword}
                        onChange={e => setAddForm({ ...addForm, loginPassword: e.target.value })}
                        placeholder="Min. 6 characters"
                        className={`${FIELD_CLASS} !pr-16`} style={CREDENTIAL_STYLE} />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <button type="button" onClick={() => setShowLoginPw(!showLoginPw)}
                          data-tip={showLoginPw ? 'Hide password' : 'Show password'}
                          className="p-1 rounded" style={{ color: 'var(--color-text-muted)' }}>
                          {showLoginPw ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                        <button type="button" data-tip="Copy password"
                          onClick={() => {
                            if (!addForm.loginPassword) return showToast('Nothing to copy yet', 'error');
                            navigator.clipboard.writeText(addForm.loginPassword);
                            showToast('Password copied', 'success');
                          }}
                          className="p-1 rounded" style={{ color: 'var(--color-text-muted)' }}>
                          <Copy size={12} />
                        </button>
                      </div>
                    </div>
                  </FormField>
                </div>

                {/* Footer */}
                <div className="p-5 flex items-center gap-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <button onClick={() => setShowAddModal(false)}
                    className="flex-1 py-2.5 rounded-full font-semibold text-sm transition-colors"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                    Cancel
                  </button>
                  {/* Creating a trainer is an Edge Function round trip that can
                      take a second or two. Without a disabled state an impatient
                      second click creates a second auth account. */}
                  <button onClick={handleAddTrainer} disabled={saving}
                    className="flex-1 py-2.5 rounded-full font-semibold text-sm text-black transition-colors disabled:opacity-60"
                    style={{ background: 'var(--color-secondary)' }}>
                    {saving ? 'Creating…' : 'Add Trainer'}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Edit Trainer Modal */}
      <AnimatePresence>
        {showEditModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" onClick={() => setShowEditModal(false)} />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
                onClick={e => e.stopPropagation()}>
                <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <div>
                    <h2 className="text-lg font-bold text-white">Edit Trainer</h2>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Update trainer details</p>
                  </div>
                  <button onClick={() => setShowEditModal(false)} style={{ color: 'var(--color-text-muted)' }}>
                    <X size={18} />
                  </button>
                </div>
                <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-dark-border">
                  <SectionLabel>Who they are</SectionLabel>
                  <FormField label="Full name" required error={editErrors.name}>
                    <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                      className={FIELD_CLASS} style={FIELD_STYLE} />
                  </FormField>
                  <FormField label="Specialization" required error={editErrors.specialty}
                    hint="Shown to members as their headline — what they coach.">
                    <input value={editForm.specialty} onChange={e => setEditForm({ ...editForm, specialty: e.target.value })}
                      className={FIELD_CLASS} style={FIELD_STYLE} />
                  </FormField>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Login email" hint="Cannot be changed here.">
                      <input value={editForm.email} disabled
                        data-tip="Changing a login email means changing the auth account, which this form does not do"
                        className={`${FIELD_CLASS} cursor-not-allowed`}
                        style={{ ...FIELD_STYLE, color: 'var(--color-text-muted)' }} />
                    </FormField>
                    <FormField label="Phone">
                      <input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                        placeholder="+63 917 000 0000"
                        className={FIELD_CLASS} style={FIELD_STYLE} />
                    </FormField>
                  </div>
                  <FormField label="Bio / description" hint="Members read this on the trainer's profile.">
                    <textarea value={editForm.bio} onChange={e => setEditForm({ ...editForm, bio: e.target.value })}
                      placeholder="How they like to coach, who they work best with…"
                      rows={2}
                      className={`${FIELD_CLASS} resize-none`} style={FIELD_STYLE} />
                  </FormField>

                  <FieldDivider />
                  <SectionLabel>Background</SectionLabel>
                  {/* Editable from both sides on purpose. The trainer owns this
                      in the app, but a coach who has never opened it would
                      otherwise have an empty profile that nobody can fill —
                      and at a gym this size the admin is often the one holding
                      the certificates. Every field is optional and the member
                      profile renders each only when set. */}
                  <FormField label="Years coaching" error={editErrors.yearsExperience}
                    hint="Leave blank rather than guessing — blank shows nothing at all.">
                    <input type="number" min={0} max={70} value={editForm.yearsExperience}
                      onChange={e => setEditForm({ ...editForm, yearsExperience: e.target.value })}
                      placeholder="e.g. 5"
                      className={FIELD_CLASS} style={FIELD_STYLE} />
                  </FormField>
                  <FormField label="Trains for" hint="Comma separated — e.g. Weight Loss, Strength, Rehab.">
                    <input value={editForm.focusAreas}
                      onChange={e => setEditForm({ ...editForm, focusAreas: e.target.value })}
                      placeholder="Weight Loss, Strength"
                      className={FIELD_CLASS} style={FIELD_STYLE} />
                  </FormField>
                  <FormField label="Certifications"
                    hint="Comma separated. Shown to members as the trainer's own statement — the gym does not verify them.">
                    <input value={editForm.certifications}
                      onChange={e => setEditForm({ ...editForm, certifications: e.target.value })}
                      placeholder="NASM-CPT, First Aid / CPR"
                      className={FIELD_CLASS} style={FIELD_STYLE} />
                  </FormField>
                  <FormField label="Achievements" hint="Competitions, athletic background, notable results.">
                    <textarea value={editForm.achievements}
                      onChange={e => setEditForm({ ...editForm, achievements: e.target.value })}
                      rows={2}
                      className={`${FIELD_CLASS} resize-none`} style={FIELD_STYLE} />
                  </FormField>

                  <FieldDivider />
                  <SectionLabel>Availability</SectionLabel>
                  <FormField
                    label="Days they usually coach"
                    hint="Display only — it appears on their profile. Bookable time slots are set by the trainer in the app, under Schedule → Availability."
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAY_LABELS.map(day => {
                        const isSelected = editForm.availability.includes(day);
                        return (
                          <button key={day} type="button"
                            onClick={() => setEditForm({ ...editForm, availability: isSelected ? editForm.availability.filter(d => d !== day) : [...editForm.availability, day] })}
                            className="px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors"
                            style={{
                              background: isSelected ? 'var(--color-primary)' : 'var(--color-bg)',
                              color: isSelected ? '#fff' : 'var(--color-text-muted)',
                              border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            }}>
                            {day.slice(0, 3)}
                          </button>
                        );
                      })}
                    </div>
                  </FormField>
                </div>
                <div className="p-5 flex items-center gap-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <button onClick={() => setShowEditModal(false)}
                    className="flex-1 py-2.5 rounded-full font-semibold text-sm transition-colors"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                    Cancel
                  </button>
                  <button onClick={handleSaveEdit} disabled={saving}
                    className="flex-1 py-2.5 rounded-full font-semibold text-sm text-black transition-colors disabled:opacity-60"
                    style={{ background: 'var(--color-secondary)' }}>
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
