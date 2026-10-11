import { motion, AnimatePresence } from 'framer-motion';
import AddTrainerWizard from '../components/trainers/AddTrainerWizard';
import CredentialReview from '../components/trainers/CredentialReview';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { addDays, todayKey } from '../utils/dates';
import { useCallback, useEffect, useState } from 'react';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import TrainerDetailDrawer from '../components/ui/TrainerDetailDrawer';
import TrainerMonthTotals from '../components/ui/TrainerMonthTotals';
import {
  RdHeader, RdCard, StatTile, SearchField, RdButton, Pill, RdTable, Tr, Td, TableFooter, EmptyBlock, Initials, DotMenu,
} from '../components/ui/rd';
import { usePaged } from '../hooks/usePaged';
import { CalendarRange, UserPlus, X, Archive, UserX, UserCheck, Star, Users, ShieldCheck, Shield, Plus, Pencil, Eye, CalendarDays, AlertCircle, ArrowLeft, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import FormField, { SectionLabel, FieldDivider } from '../components/ui/FormField';
import { showToast } from '../utils/toast';
import {
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
import { goalsFor } from '../lib/coachGoals';

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

const TRAINERS_PER_PAGE = 8;
type TSortKey = 'name' | 'specialty' | 'credentials' | 'rating' | 'windows' | 'status';

const FIELD_CLASS = 'w-full px-3 py-2 rounded-xl text-white text-xs';
const FIELD_STYLE = { background: 'var(--color-bg)', border: '1px solid var(--color-border)' };

export default function Trainers() {
  /** Sessions and classes each coach delivered in a month (0095). */
  const [showTotals, setShowTotals] = useState(false);
  const [trainers, setTrainers] = useState<TrainerDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    id: '', name: '', specialty: '', email: '', phone: '', bio: '', availability: [] as string[],
    yearsExperience: '', certifications: '', focusAreas: '', achievements: '',
  });
  const [saving, setSaving] = useState(false);
  const [toSuspend, setToSuspend] = useState<TrainerDisplay | null>(null);
  const [toArchive, setToArchive] = useState<TrainerDisplay | null>(null);
  /** trainer id → their verified credentials in date (0054/0160), for the mark on each card. */
  const [verified, setVerified] = useState<Map<string, { title: string; expiresOn: string | null }[]>>(new Map());
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  /** trainer id → certificates waiting for the owner's decision: "Needs review" on the card. */
  const [pending, setPending] = useState<Map<string, number>>(new Map());
  /** Ticked rows, for suspending or archiving several at once. */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<'suspend' | 'archive' | 'restore' | null>(null);
  const [tSort, setTSort] = useState<{ key: TSortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  // Credentials are a view of this page (2026-10-10), in the address so /credentials can land on it.
  const [params, setParams] = useSearchParams();
  const reviewing = params.get('view') === 'credentials';
  const setReviewing = (on: boolean) => setParams(on ? { view: 'credentials' } : {}, { replace: true });

  const loadTrainers = useCallback(async () => {
    setLoading(true);
    void (async () => {
      // Admin reads every row (0054); members see the same set through public_trainer_credentials.
      const full = await supabase.from('trainer_credentials').select('trainer_id, title, expires_on').eq('status', 'verified');
      // Before 0160 there is no expires_on: the titles alone, all counted as in date.
      const { data } = full.error ? await supabase.from('trainer_credentials').select('trainer_id, title').eq('status', 'verified') : full;
      const today = todayKey();
      const map = new Map<string, { title: string; expiresOn: string | null }[]>();
      for (const c of ((data ?? []) as { trainer_id: string; title: string; expires_on?: string | null }[])) {
        if (c.expires_on && c.expires_on < today) continue;
        map.set(c.trainer_id, [...(map.get(c.trainer_id) ?? []), { title: c.title, expiresOn: c.expires_on ?? null }]);
      }
      setVerified(map);
      const { data: waiting } = await supabase.from('trainer_credentials').select('trainer_id').eq('status', 'pending');
      const counts = new Map<string, number>();
      for (const c of (waiting ?? []) as { trainer_id: string }[]) counts.set(c.trainer_id, (counts.get(c.trainer_id) ?? 0) + 1);
      setPending(counts);
    })();
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

  useEffect(() => { void (async () => { await loadTrainers(); })(); }, [loadTrainers]);

  const visible = trainers.filter((t) => {
    const q = search.trim().toLowerCase();
    return (
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.email.toLowerCase().includes(q) ||
      t.specialization.toLowerCase().includes(q)
    );
  });

  const sortedTrainers = [...visible].sort((a, b) => {
    const dir = tSort.dir === 'asc' ? 1 : -1;
    switch (tSort.key) {
      case 'specialty': return dir * a.specialization.localeCompare(b.specialization);
      case 'credentials': return dir * ((verified.get(a.id)?.length ?? 0) - (verified.get(b.id)?.length ?? 0));
      case 'rating': return dir * ((a.gymAverage ?? -1) - (b.gymAverage ?? -1));
      case 'windows': return dir * (a.bookableWindows - b.bookableWindows);
      case 'status': return dir * a.status.localeCompare(b.status);
      default: return dir * a.name.localeCompare(b.name);
    }
  });
  const paged = usePaged(sortedTrainers, TRAINERS_PER_PAGE);

  /**
   * Suspend / reactivate / archive.
   *
   * A coach who left the gym stayed on the roster with a working login forever
   * until these existed. Archive keeps every class and session they ever ran —
   * a delete would orphan them.
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
  /** The same, for every coach ticked in the table — one confirmation with the real count. */
  const runBulk = async () => {
    if (!bulk) return;
    const chosen = trainers.filter((t) => picked.has(t.id));
    const next: ProfileStatus = bulk === 'suspend' ? 'suspended' : bulk === 'archive' ? 'archived' : 'active';
    let done = 0;
    for (const t of chosen) {
      try { await setTrainerStatus(t.id, next); done += 1; } catch { /* counted below */ }
    }
    showToast(`${done} of ${chosen.length} ${bulk === 'suspend' ? 'suspended' : bulk === 'archive' ? 'archived' : 'restored'}`, done === chosen.length ? 'success' : 'error');
    setBulk(null); setPicked(new Set());
    await loadTrainers();
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
      // `!= null` on the number: a trainer in their first year stores 0, and `|| ''` would blank it.
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
    // Mirrors the CHECK constraint in 0041, said as a sentence rather than a constraint name.
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
      await updateProfile(editForm.id, { first_name: firstName, last_name: lastName, phone: editForm.phone || null });
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

  const waitingTotal = [...pending.values()].reduce((a, b) => a + b, 0);
  if (reviewing) {
    return (
      <div className="flex flex-col gap-6" data-credentials-view>
        <RdHeader title="Credentials" subtitle="Coaches' certificates: look at each document, then verify or reject it."
          actions={<RdButton icon={ArrowLeft} onClick={() => setReviewing(false)}>Back to trainers</RdButton>} />
        <CredentialReview onChanged={loadTrainers} />
      </div>
    );
  }

  const sortHead = (label: string, key: TSortKey, align?: 'right') => ({
    align,
    label: (
      <button type="button" onClick={() => setTSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))}
        className="inline-flex items-center gap-1.5 normal-case tracking-normal text-[14.5px] font-semibold" style={{ color: tSort.key === key ? '#fff' : 'var(--color-text-primary)' }}>
        {label}{tSort.key === key ? (tSort.dir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ChevronsUpDown size={13} style={{ color: 'var(--color-text-muted)' }} />}
      </button>
    ),
  });
  const pageIds = paged.visible.map((t) => t.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => picked.has(id));
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="flex flex-col gap-6" data-trainers>
      <TrainerMonthTotals isOpen={showTotals} onClose={() => setShowTotals(false)} />
      <RdHeader
        title={showArchived ? 'Archived trainers' : 'Trainers'}
        subtitle={showArchived ? 'Archived trainers — classes and sessions retained.' : 'Who coaches here, and who members can actually book.'}
        actions={(
          <>
            <div className="w-[300px]"><SearchField value={search} onChange={(v) => { setSearch(v); paged.setPage(1); }} placeholder="Search name or specialty…" /></div>
            <RdButton icon={Archive} onClick={() => { setShowArchived((v) => !v); setPicked(new Set()); }}>{showArchived ? 'Active roster' : 'Archived'}</RdButton>
            <RdButton icon={CalendarRange} onClick={() => setShowTotals(true)}>Monthly totals</RdButton>
            <RdButton variant="primary" icon={Plus} onClick={() => setShowAddModal(true)}>Add trainer</RdButton>
          </>
        )} />

      {/* "Bookable" counts real trainer_availability windows — the weekday blurb produces no slots. */}
      <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        <StatTile icon={Users} label="On roster" value={trainers.length} />
        <StatTile icon={UserCheck} tone="green" label="Active" value={trainers.filter((t) => t.status === 'active').length} />
        <StatTile icon={CalendarDays} tone={trainers.some((t) => t.bookableWindows === 0) ? 'amber' : 'violet'} label="Bookable"
          value={trainers.filter((t) => t.bookableWindows > 0).length}
          sub={trainers.some((t) => t.bookableWindows === 0) ? `${trainers.filter((t) => t.bookableWindows === 0).length} with no hours set` : undefined} />
        <StatTile icon={ShieldCheck} tone="amber" label="Credentials to review" value={waitingTotal} onClick={() => setReviewing(true)}
          tip="Coaches' certificates: look at each document, then verify or reject it" active={waitingTotal > 0} />
      </div>

      {picked.size > 0 && (
        <RdCard className="px-5 py-3 flex items-center gap-3 flex-wrap" data-trainer-bulk>
          <span className="text-[15px] font-semibold text-white">{picked.size} selected</span>
          {!showArchived && <RdButton size="sm" variant="amber" icon={UserX} onClick={() => setBulk('suspend')}>Suspend</RdButton>}
          <RdButton size="sm" icon={Archive} onClick={() => setBulk(showArchived ? 'restore' : 'archive')}>{showArchived ? 'Restore' : 'Archive'}</RdButton>
          <RdButton size="sm" variant="ghost" onClick={() => setPicked(new Set())}>Clear</RdButton>
        </RdCard>
      )}

      <RdCard className="overflow-hidden" data-trainers-table>
        <RdTable head={[
          { label: <input type="checkbox" aria-label="Select this page" checked={allOnPage}
              onChange={(e) => setPicked((s) => { const n = new Set(s); pageIds.forEach((id) => (e.target.checked ? n.add(id) : n.delete(id))); return n; })} />, className: 'w-12' },
          sortHead('Trainer', 'name'), sortHead('Specialty', 'specialty'), sortHead('Credentials', 'credentials'), sortHead('Rating', 'rating'),
          sortHead('Booking windows', 'windows'), sortHead('Status', 'status'), { label: <span className="normal-case tracking-normal text-[14.5px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Actions</span> },
        ]}
          empty={loading ? <p className="text-center py-12 text-[14.5px]" style={{ color: 'var(--color-text-muted)' }}>Loading trainers…</p>
            : visible.length === 0 ? (
              <EmptyBlock icon={showArchived ? Archive : UserPlus}
                title={search ? 'No trainer matches' : showArchived ? 'No archived trainers' : 'No trainers yet'}
                body={search ? `Nothing matches “${search}”.` : showArchived ? 'Archived trainers keep every class and session they ever ran.' : 'Add a coach and they get a login for the trainer app.'}
                action={!search && !showArchived ? <RdButton variant="primary" icon={UserPlus} onClick={() => setShowAddModal(true)}>Add trainer</RdButton> : undefined} />
            ) : undefined}>
          {!loading && paged.visible.map((trainer) => {
            const list = verified.get(trainer.id) ?? [];
            const soon = list.filter((c) => c.expiresOn && c.expiresOn <= addDays(todayKey(), 30)).length;
            const waiting = pending.get(trainer.id) ?? 0;
            const found = goalsFor({ specialization: trainer.specialization, bio: trainer.bio,
              achievements: trainer.achievements, focus_areas: trainer.focusAreas, certifications: trainer.certifications });
            const statusTone = trainer.status === 'active' ? 'green' : trainer.status === 'suspended' ? 'amber' : 'gray';
            return (
              <Tr key={trainer.id} data-trainer-row onClick={() => setViewingId(trainer.id)} style={{ opacity: trainer.status !== 'active' && !showArchived ? 0.8 : 1 }}>
                <Td onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" aria-label={`Select ${trainer.name}`} checked={picked.has(trainer.id)} onChange={() => toggle(trainer.id)} />
                </Td>
                <Td>
                  <div className="flex items-center gap-3.5 min-w-0">
                    <Initials name={trainer.name} photo={trainer.photoUrl} size={50} tone="amber" />
                    <div className="min-w-0">
                      <p className="text-[16px] font-semibold text-white truncate">{trainer.name}</p>
                      <p className="text-[13px] truncate max-w-[220px]" style={{ color: 'var(--color-text-secondary)' }}>{trainer.email}</p>
                    </div>
                  </div>
                </Td>
                <Td>
                  <p className="text-[15px]" style={{ color: '#A78BFA' }}>{trainer.specialization}</p>
                  {/* The member app's "Find your coach" — lib/coachGoals.ts, identical in both apps. */}
                  <p className="text-[12px] mt-0.5 truncate max-w-[200px]" style={{ color: found.length ? 'var(--color-text-muted)' : '#FBBF24' }}
                    data-tip="Goals members can pick under Coaches → Find your coach">
                    {found.length ? `Found under: ${found.map((f) => f.goal.label).join(', ')}` : 'Not matched to a member goal yet'}
                  </p>
                </Td>
                <Td>
                  {list.length > 0 ? (
                    <p className="text-[14.5px] inline-flex items-center gap-1.5" style={{ color: soon ? '#FBBF24' : '#A78BFA' }}
                      data-tip={`Verified by you: ${list.map((c) => c.title).join(', ')}${soon ? ` — ${soon} expiring within 30 days` : ''}`}>
                      <ShieldCheck size={17} /> {list.length} verified{soon ? ` · ${soon} expiring` : ''}
                    </p>
                  ) : waiting === 0 ? (
                    <>
                      <p className="text-[14.5px] inline-flex items-center gap-1.5 whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}><Shield size={17} /> Not matched</p>
                      <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>No credentials yet</p>
                    </>
                  ) : null}
                  {waiting > 0 && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); setReviewing(true); }} data-needs-review
                      className="text-[14px] inline-flex items-center gap-1.5 mt-0.5 font-medium whitespace-nowrap" style={{ color: '#FBBF24' }}
                      data-tip="Certificates waiting for you — verify or reject them">
                      <AlertCircle size={15} /> Needs review · {waiting}
                    </button>
                  )}
                </Td>
                <Td>
                  {/* The gym's own figure, whatever the count; "Not public" says what members see. */}
                  <p className="text-[15px] font-semibold text-white inline-flex items-center gap-1.5">
                    <Star size={17} fill={trainer.gymAverage != null ? '#F59E0B' : 'none'} style={{ color: '#F59E0B' }} />
                    {trainer.gymAverage != null ? trainer.gymAverage.toFixed(1) : '—'}
                  </p>
                  <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                    {trainer.gymAverage == null ? 'No evaluations' : trainer.ratingAverage == null ? 'Not public' : 'Public'}
                  </p>
                </Td>
                <Td>
                  <p className="text-[15px] inline-flex items-center gap-2" style={{ color: trainer.bookableWindows > 0 ? '#A78BFA' : '#FBBF24' }}>
                    <CalendarDays size={18} />
                    {trainer.bookableWindows > 0 ? `${trainer.bookableWindows} window${trainer.bookableWindows === 1 ? '' : 's'}` : 'No hours set'}
                  </p>
                  {trainer.availabilityDays.length > 0 && (
                    <p className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{trainer.availabilityDays.map((d) => d.slice(0, 3)).join(' · ')}</p>
                  )}
                </Td>
                <Td><Pill tone={statusTone} solidDot>{trainer.status === 'active' ? 'Active' : trainer.status.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase())}</Pill></Td>
                <Td onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    {!showArchived && (
                      <>
                        <RdButton size="sm" variant="soft" icon={Pencil} onClick={() => openEdit(trainer)}>Edit</RdButton>
                        <RdButton size="sm" variant="amber" icon={trainer.status === 'suspended' ? UserCheck : UserX} onClick={() => setToSuspend(trainer)}>
                          {trainer.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                        </RdButton>
                      </>
                    )}
                    {showArchived && <RdButton size="sm" icon={Archive} onClick={() => setToArchive(trainer)}>Restore</RdButton>}
                    <DotMenu label={`More for ${trainer.name}`} items={[
                      { label: 'View profile', icon: Eye, onClick: () => setViewingId(trainer.id) },
                      { label: 'Archive trainer', icon: Archive, onClick: () => setToArchive(trainer), tone: 'danger', hidden: showArchived },
                      { label: 'Review credentials', icon: ShieldCheck, onClick: () => setReviewing(true) },
                      { label: 'Monthly totals', icon: CalendarRange, onClick: () => setShowTotals(true) },
                    ]} />
                  </div>
                </Td>
              </Tr>
            );
          })}
        </RdTable>
        <TableFooter page={paged.page} perPage={paged.perPage} total={paged.total} noun={showArchived ? 'archived trainers' : 'trainers'} onPage={paged.setPage} />
      </RdCard>

      <TrainerDetailDrawer trainerId={viewingId} onClose={() => setViewingId(null)} onChanged={loadTrainers} />

      <ConfirmDialog
        isOpen={bulk !== null}
        onClose={() => setBulk(null)}
        onConfirm={() => void runBulk()}
        title={bulk === 'suspend' ? 'Suspend trainers' : bulk === 'archive' ? 'Archive trainers' : 'Restore trainers'}
        message={bulk === 'suspend'
          ? `Suspend ${picked.size} trainer${picked.size === 1 ? '' : 's'}? They cannot log in to the trainer app; classes and booked sessions stay as they are. Reversible at any time.`
          : bulk === 'archive'
            ? `Archive ${picked.size} trainer${picked.size === 1 ? '' : 's'}? They drop off the roster and cannot log in; every class and session they ran is kept.`
            : `Restore ${picked.size} trainer${picked.size === 1 ? '' : 's'} to the active roster? They can log in again.`}
        confirmText={bulk === 'suspend' ? 'Suspend' : bulk === 'archive' ? 'Archive' : 'Restore'}
        type={bulk === 'restore' ? 'info' : bulk === 'archive' ? 'danger' : 'warning'}
      />


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

      {showAddModal && <AddTrainerWizard onClose={() => setShowAddModal(false)} onCreated={loadTrainers} />}

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
                className="w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
                style={{ background: 'radial-gradient(120% 80% at 0% 0%, rgba(124,58,237,0.16), transparent 55%), var(--color-surface)', border: '1px solid rgba(139,92,246,0.25)' }}
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
                  <SectionLabel>Personal Information</SectionLabel>
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

                  {/* Live: where members will find this coach under Coaches →
                      Find your coach, from exactly the fields above. */}
                  {(() => {
                    const found = goalsFor({
                      specialization: editForm.specialty || null, bio: editForm.bio || null,
                      achievements: editForm.achievements || null,
                      focus_areas: editForm.focusAreas.split(',').map((x) => x.trim()).filter(Boolean),
                      certifications: editForm.certifications.split(',').map((x) => x.trim()).filter(Boolean),
                    });
                    return (
                      <div className="rounded-xl p-3 text-[11px]"
                        style={{ background: 'var(--color-primary-light)', border: '1px solid var(--color-border)' }}>
                        <p className="font-semibold mb-1" style={{ color: 'var(--color-primary)' }}>How members find this coach</p>
                        {found.length === 0 ? (
                          <p style={{ color: 'var(--color-text-secondary)' }}>
                            No member goal matches yet. Members pick a goal under Coaches → Find your coach; say what they train in Specialty or Trains for.
                          </p>
                        ) : found.map(({ goal, words }) => (
                          <p key={goal.id} className="text-white">
                            {goal.label}<span style={{ color: 'var(--color-text-muted)' }}> — from “{words.join('”, “')}”</span>
                          </p>
                        ))}
                      </div>
                    );
                  })()}

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
                  <RdButton className="flex-1" onClick={() => setShowEditModal(false)}>Cancel</RdButton>
                  <RdButton className="flex-1" variant="primary" onClick={handleSaveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</RdButton>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
