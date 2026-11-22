import { useCallback, useEffect, useState } from 'react';
import { listMembers } from '../../lib/api/members';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, User, CalendarClock, Clock, Users, Mail, Phone, Trash2, Info, Star,
} from 'lucide-react';
import Badge from './Badge';
import { Pill, Initials } from './rd';
import { removeAvatarFor } from '../../lib/api/avatars';
import { formatDate, formatPhoneNumber } from '../../utils/formatters';
import { showToast } from '../../utils/toast';
import { supabase } from '../../lib/supabaseClient';
import CredentialReview from '../trainers/CredentialReview';
import {
  loadTrainerDetail, weekdayName, formatTimeOfDay, type TrainerDetail,
} from '../../services/trainerDetailService';
import {
  listTrainerRatings, getTrainerMonths, periodLabel, listTrainerFeedback,
  type TrainerRatingRow, type TrainerMonth, type TrainerFeedbackRow,
} from '../../lib/api/trainers';
import LoginSection from '../LoginSection';
import { realEmail } from '../../lib/api/logins';

/**
 * One trainer's whole record.
 *
 * The modal this replaces showed four fields and a bio under a "Profile" tab,
 * and under "Schedule" it re-printed the same weekday chips already visible on
 * the card behind it — from `trainer_profiles.availability`, a free-text CSV
 * with no times that **nothing books against**. The hours members actually book
 * live in `trainer_availability` (0015) and were invisible to the front desk.
 *
 * Hours are shown here but edited on **Schedule → Trainer Hours**, which already
 * has the full editor. `trainer_availability_write_self` is
 * `trainer_id = auth.uid() or is_front_desk()`, so the front desk *can* write
 * them — this panel simply doesn't duplicate an editor that exists elsewhere.
 */

type TabId = 'profile' | 'schedule' | 'sessions' | 'clients' | 'evaluations';

const TABS: { id: TabId; label: string; icon: typeof User }[] = [
  { id: 'profile',  label: 'Profile',        icon: User },
  { id: 'schedule', label: 'Classes & hours', icon: CalendarClock },
  { id: 'sessions', label: '1-on-1',          icon: Clock },
  { id: 'clients',  label: 'Members',         icon: Users },
  { id: 'evaluations', label: 'Evaluations', icon: Star },
];

const STATUS_BADGE: Record<string, string> = {
  approved: 'Confirmed',
  pending: 'Pending',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

interface Props {
  trainerId: string | null;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}

export default function TrainerDetailDrawer({ trainerId, onClose, onChanged }: Props) {
  const [detail, setDetail] = useState<TrainerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('profile');

  const load = useCallback(async () => {
    if (!trainerId) return;
    setLoading(true);
    setError(null);
    try {
      setDetail(await loadTrainerDetail(trainerId));
    } catch (err) {
      setDetail(null);
      setError(err instanceof Error ? err.message : 'That trainer record could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [trainerId]);

  // A different trainer opens on Profile with nothing stale showing — reset
  // while rendering (compare-during-render), not in an effect, so there is no
  // flash of the previous trainer's tab. The load is the effect's job.
  const [shownFor, setShownFor] = useState(trainerId);
  if (shownFor !== trainerId) {
    setShownFor(trainerId);
    setTab('profile');
    setDetail(null);
  }
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  useEffect(() => {
    if (!trainerId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [trainerId, onClose]);

  return createPortal(
    <AnimatePresence>
      {trainerId && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150]"
          />
          <motion.aside
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 260 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-3xl z-[150] flex flex-col shadow-2xl"
            style={{ background: 'var(--color-surface)', borderLeft: '1px solid var(--color-border)' }}
          >
            {loading && !detail ? (
              <Message onClose={onClose} text="Loading trainer record…" />
            ) : error ? (
              <Message onClose={onClose} text={error} />
            ) : detail ? (
              <Body detail={detail} tab={tab} setTab={setTab} onClose={onClose}
                onRefresh={async () => { await load(); await onChanged(); }} />
            ) : null}
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

function Message({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="flex-1 flex flex-col">
      <div className="p-5 flex justify-end">
        <button aria-label="Close" onClick={onClose} style={{ color: 'var(--color-text-muted)' }}><X size={20} /></button>
      </div>
      <div className="flex-1 flex items-center justify-center px-8 text-center text-sm"
        style={{ color: 'var(--color-text-muted)' }}>
        {text}
      </div>
    </div>
  );
}

function Body({
  detail, tab, setTab, onClose, onRefresh,
}: {
  detail: TrainerDetail;
  tab: TabId;
  setTab: (t: TabId) => void;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const { profile, trainer } = detail.identity;
  const { stats } = detail;
  const fullName = `${profile.first_name} ${profile.last_name}`.trim();
  const [photoUrl, setPhotoUrl] = useState<string | null>(profile.photo_url ?? null);
  const [removing, setRemoving] = useState(false);

  const removePhoto = async () => {
    setRemoving(true);
    try {
      await removeAvatarFor(profile.id);
      setPhotoUrl(null);
      showToast(`Removed ${profile.first_name}'s photo`, 'success');
      await onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not remove that photo', 'error');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <div className="p-5 flex items-start justify-between flex-shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex-shrink-0">
            <Initials name={fullName} photo={photoUrl} size={44} />
            {photoUrl && (
              <button onClick={removePhoto} disabled={removing} data-tip="Remove this trainer's photo"
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center disabled:opacity-50"
                style={{ background: 'var(--color-surface)', border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.16)', color: 'var(--color-text-secondary)' }}>
                <Trash2 size={11} />
              </button>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-[18px] font-semibold text-white truncate">{fullName}</h2>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
              <span>{trainer.specialization || 'General training'}</span>
              {profile.status !== 'active' && <Pill tone="amber">{profile.status.replace('_', ' ')}</Pill>}
            </div>
          </div>
        </div>
        <button aria-label="Close" onClick={onClose} className="w-9 h-9 grid place-items-center rounded-lg flex-shrink-0 hover:bg-white/[0.06]" style={{ color: 'var(--color-text-secondary)' }}>
          <X size={16} />
        </button>
      </div>

      <div className="flex gap-5 px-5 overflow-x-auto flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} aria-pressed={active}
              className="flex items-center gap-1.5 py-3 -mb-px text-[13px] font-medium whitespace-nowrap transition-colors hover:text-white"
              style={{
                borderBottom: `2px solid ${active ? 'var(--color-primary)' : 'transparent'}`,
                color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              }}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-dark-border">
        {tab === 'profile'  && <ProfileTab detail={detail} onChanged={() => void onRefresh()} />}
        {tab === 'schedule' && <ScheduleTab detail={detail} />}
        {tab === 'sessions' && <SessionsTab detail={detail} />}
        {tab === 'clients'  && <ClientsTab detail={detail} />}
        {tab === 'evaluations' && <EvaluationsTab trainerId={detail.identity.profile.id} />}
      </div>

      <div className="grid grid-cols-4 flex-shrink-0 px-5 py-3"
        style={{ borderTop: '1px solid var(--color-border)' }}>
        <FootStat label="Classes" value={String(stats.classesTaught)} />
        <FootStat label="Upcoming" value={String(stats.upcomingClasses + stats.ptUpcoming)} />
        <FootStat label="1-on-1 done" value={String(stats.ptApproved)} />
        <FootStat label="Members" value={String(stats.distinctClients)} />
      </div>
    </>
  );
}

function FootStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>{label}</p>
      <p className="text-[15px] font-semibold text-white tabular-nums truncate">{value}</p>
    </div>
  );
}

/* ─────────────────────────── Profile ─────────────────────────── */

function ProfileTab({ detail, onChanged }: { detail: TrainerDetail; onChanged?: () => void }) {
  const { profile, trainer } = detail.identity;
  const { stats } = detail;

  return (
    <div className="space-y-7">
      <Section title="Contact">
        <div>
          <InfoCell icon={Mail} label="Login email" value={realEmail(profile.email) ?? 'No email'} />
          <InfoCell icon={Phone} label="Phone" value={profile.phone ? formatPhoneNumber(profile.phone) : null} />
        </div>
        <div className="mt-3"><LoginSection userId={profile.id} name={`${profile.first_name} ${profile.last_name}`} role="trainer" /></div>
      </Section>

      <Section title="Account">
        <div className="grid grid-cols-3 gap-4">
          <MiniStat label="Status" value={profile.status.replace('_', ' ')} />
          <MiniStat label="Added" value={profile.created_at ? formatDate(profile.created_at) : '—'} />
          <MiniStat
            label="Bookable / week"
            value={stats.weeklyBookableMinutes > 0 ? `${(stats.weeklyBookableMinutes / 60).toFixed(1)} hours` : 'None set'}
          />
        </div>
      </Section>

      <Section title="Bio">
        {trainer.bio
          ? <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>{trainer.bio}</p>
          : <Empty text="No bio written. Members see this on the trainer's profile in the app." />}
      </Section>

      <Section title="Workload">
        <div className="grid grid-cols-4 gap-4">
          <MiniStat label="Classes" value={String(stats.classesTaught)} sub={`${stats.upcomingClasses} upcoming`} />
          <MiniStat label="1-on-1 approved" value={String(stats.ptApproved)} />
          <MiniStat label="1-on-1 pending" value={String(stats.ptPending)} />
          <MiniStat label="Class requests" value={String(stats.bookingsPending)} sub="awaiting the desk" />
        </div>
      </Section>

      <CoachingSection trainerId={profile.id} />
      <CredentialsSection trainerId={profile.id} onChanged={onChanged} />
    </div>
  );
}

/**
 * What this coach runs in the app (0122/0128): rooms, 1-on-1 trainees, and the
 * workouts they built. Counts only — the rooms themselves are under Rooms.
 */
function CoachingSection({ trainerId }: { trainerId: string }) {
  const [n, setN] = useState<{ rooms: number; trainees: number; workouts: number } | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => { const r = await q; return r.error ? 0 : r.count ?? 0; };
      const [rooms, trainees, workouts] = await Promise.all([
        count(supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('trainer_id', trainerId).is('archived_at', null)),
        count(supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('trainer_id', trainerId).eq('kind', 'pt').is('archived_at', null)),
        count(supabase.from('gym_workouts').select('id', { count: 'exact', head: true }).eq('created_by', trainerId)),
      ]);
      if (alive) setN({ rooms, trainees, workouts });
    })();
    return () => { alive = false; };
  }, [trainerId]);
  if (!n) return null;
  return (
    <Section title="Coaching in the app">
      <div className="grid grid-cols-3 gap-4">
        <MiniStat label="Rooms" value={String(n.rooms)} sub="classes, 1-on-1 and groups" />
        <MiniStat label="1-on-1 trainees" value={String(n.trainees)} />
        <MiniStat label="Workouts built" value={String(n.workouts)} />
      </div>
    </Section>
  );
}

/**
 * Their certificates and where each stands (0054/0160). Verified ones in date
 * are what members see on this coach's profile; the file and the number never.
 */
function CredentialsSection({ trainerId, onChanged }: { trainerId: string; onChanged?: () => void }) {
  // The certificates themselves, with Verify and Reject — not a summary that
  // sent the owner to another page (2026-10-10: Trainers and Credentials are one).
  return (
    <Section title="Credentials">
      <CredentialReview trainerId={trainerId} compact onChanged={onChanged} />
    </Section>
  );
}

/* ─────────────────────────── Schedule ─────────────────────────── */

function ScheduleTab({ detail }: { detail: TrainerDetail }) {
  const { availability, classes, identity } = detail;
  // Once per opening: a lazy initialiser keeps render pure.
  const [now] = useState(() => Date.now());
  const upcoming = classes.filter((c) => c.scheduled_at != null && new Date(c.scheduled_at).getTime() > now);
  const past = classes.filter((c) => c.scheduled_at == null || new Date(c.scheduled_at).getTime() <= now);
  const legacyDays = identity.trainer.availability;

  return (
    <div className="space-y-7">
      <Section title="Bookable hours">
        {availability.length === 0 ? (
          <Empty text="No bookable hours set, so members cannot request a 1-on-1 session with this trainer. Add them on Schedule → Trainer Hours, or the trainer can set their own in the phone app." />
        ) : (
          <>
            <div >
              {availability.map((a) => (
                <Row key={a.id}
                  title={weekdayName(a.day_of_week)}
                  subtitle={`${formatTimeOfDay(a.start_time)} – ${formatTimeOfDay(a.end_time)} · ${a.slot_minutes} min slots`}
                />
              ))}
            </div>
            <p className="text-[10px] mt-2 flex items-start gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
              <Info size={11} className="mt-0.5 flex-shrink-0" />
              Edit these on Schedule → Trainer Hours.
            </p>
          </>
        )}
        {/* The legacy CSV is shown as what it is: a label. It has no times and
            produces no slots, and presenting it as a schedule is what made this
            screen look like the hours were configured when they weren't. */}
        {legacyDays && (
          <p className="text-[10px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
            Profile blurb lists <span className="text-white">{legacyDays}</span>. Display text only, not bookable.
          </p>
        )}
      </Section>

      <Section title={`Upcoming classes (${upcoming.length})`}>
        {upcoming.length === 0 ? (
          <Empty text="No upcoming classes scheduled." />
        ) : (
          <div >
            {upcoming.map((c) => (
              <Row key={c.id} title={c.name}
                subtitle={`${new Date(c.scheduled_at!).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })} · ${c.duration_minutes} min${c.location ? ` · ${c.location}` : ''}`}
                right={<Badge variant="Standard">{c.level.replace('_', ' ')}</Badge>} />
            ))}
          </div>
        )}
      </Section>

      {past.length > 0 && (
        <Section title={`Past & unscheduled (${past.length})`}>
          <div >
            {past.map((c) => (
              <Row key={c.id} title={c.name}
                subtitle={c.scheduled_at
                  ? new Date(c.scheduled_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
                  : 'no date set'} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

/* ─────────────────────────── Sessions ─────────────────────────── */

function SessionsTab({ detail }: { detail: TrainerDetail }) {
  const { ptSessions, clients } = detail;
  const nameOf = (memberId: string) => clients.find((c) => c.memberId === memberId)?.name ?? 'Unknown member';

  if (ptSessions.length === 0) {
    return <Empty text="This trainer has no 1-on-1 sessions." />;
  }
  return (
    <div >
      {ptSessions.map((s) => (
        <Row key={s.id}
          title={nameOf(s.member_id)}
          subtitle={`${new Date(s.starts_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })} · ${s.duration_minutes} min`}
          right={<Badge variant={STATUS_BADGE[s.status] ?? 'Pending'}>{s.status}</Badge>}
          note={s.notes} />
      ))}
    </div>
  );
}

/* ─────────────────────────── Clients ─────────────────────────── */

function ClientsTab({ detail }: { detail: TrainerDetail }) {
  const { clients } = detail;
  if (clients.length === 0) {
    return <Empty text="No members have trained with this trainer yet. Cancelled and rejected bookings are not counted." />;
  }
  return (
    <div >
      {clients.map((c) => (
        <Row key={c.memberId}
          title={c.name}
          subtitle={[
            c.ptSessions > 0 ? `${c.ptSessions} 1-on-1` : null,
            c.classBookings > 0 ? `${c.classBookings} class${c.classBookings === 1 ? '' : 'es'}` : null,
          ].filter(Boolean).join(' · ')}
          right={
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              {c.lastSeen ? formatDate(c.lastSeen) : '—'}
            </span>
          } />
      ))}
    </div>
  );
}

/* ─────────────────────────── Shared bits ─────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[13px] font-semibold mb-2.5" style={{ color: 'var(--color-text-primary)' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function InfoCell({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center gap-3 py-2.5 min-w-0" style={{ borderBottom: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.08)' }}>
      <Icon size={14} className="flex-none" style={{ color: 'var(--color-text-muted)' }} />
      <span className="text-[13px] w-28 flex-none" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <span className={`text-[13.5px] truncate ${value ? 'text-white' : ''}`} style={value ? undefined : { color: 'var(--color-text-muted)' }}>
        {value || 'Not on file'}
      </span>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] truncate" style={{ color: 'var(--color-text-secondary)' }}>{label}</p>
      <p className="text-[20px] font-semibold text-white truncate tabular-nums leading-tight mt-0.5 first-letter:uppercase">{value}</p>
      {sub && <p className="text-[12px] truncate" style={{ color: 'var(--color-text-muted)' }}>{sub}</p>}
    </div>
  );
}

function Row({ title, subtitle, right, note }: {
  title: string; subtitle?: string; right?: React.ReactNode; note?: string | null;
}) {
  return (
    <div className="py-2.5" style={{ borderBottom: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.08)' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13.5px] text-white font-medium truncate">{title}</p>
          {subtitle && <p className="text-[12px] truncate" style={{ color: 'var(--color-text-secondary)' }}>{subtitle}</p>}
        </div>
        {right && <div className="flex-shrink-0">{right}</div>}
      </div>
      {note && <p className="text-[12px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>{note}</p>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
      {text}
    </div>
  );
}

/**
 * The coach's monthly evaluations, and what members wrote.
 *
 * `listTrainerRatings` has existed since 0042 and **nothing ever called it** —
 * which is why the gym could see a star count and never a single reason for it.
 * The scores were being collected and read by nobody.
 *
 * Unwithheld on purpose: the member-facing average hides below three votes so
 * one bad afternoon cannot become a public number, but this is the gym reading
 * its own evaluations in order to act on them. 0066's admin-only SELECT policy
 * is what keeps members out of it.
 */
/**
 * Evaluations, as the gym sees them.
 *
 * ## Why members are named here and nowhere else
 *
 * An earlier version withheld the names from the admin too, reasoning that a
 * coach who hears "Lea gave me a 2" stops receiving honest evaluations. That
 * risk is real and the mitigation is real: **the trainer cannot see this
 * screen, and cannot see the names at all** — since migration 0072 they read a
 * view with no member column and the base table refuses them outright, so this
 * is not a UI convention that a devtools panel can undo.
 *
 * What the gym gets in exchange is the ability to actually act. An anonymous
 * complaint cannot be followed up: you cannot check whether one member is
 * rating every coach one star, and you cannot talk to somebody who reported
 * something serious. That is not monitoring, it is a number.
 *
 * The screen says which of those two things it is, so nobody assumes the coach
 * is reading it over their shoulder.
 */
function EvaluationsTab({ trainerId }: { trainerId: string }) {
  const [rows, setRows] = useState<TrainerRatingRow[] | null>(null);
  const [months, setMonths] = useState<TrainerMonth[]>([]);
  const [notes, setNotes] = useState<TrainerFeedbackRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [r, m, people, f] = await Promise.all([
        listTrainerRatings(trainerId).catch(() => null),
        getTrainerMonths(trainerId).catch(() => []),
        // Falls back to an empty map rather than failing the tab: a name that
        // will not resolve renders as "A member", which is honest, where a
        // blank would look like the evaluation had no author.
        listMembers().catch(() => []),
        // Its own catch, like the rest: the coach's notes failing to load must
        // not blank the ratings this tab exists for.
        listTrainerFeedback(trainerId).catch(() => []),
      ]);
      if (!alive) return;
      setNotes(f);
      if (r === null) { setFailed(true); setRows([]); return; }
      const map: Record<string, string> = {};
      for (const person of people) {
        map[person.profile.id] = `${person.profile.first_name} ${person.profile.last_name}`.trim();
      }
      setNames(map);
      setRows(r);
      setMonths(m);
    })();
    return () => { alive = false; };
  }, [trainerId]);

  if (rows === null) {
    return <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading evaluations…</p>;
  }

  /**
   * What this coach writes to the people they train (0072) — the other half of
   * what the gym asked to be able to see. Built here rather than inline because
   * it has to appear in the no-ratings branch too: a new coach who has written
   * notes for three members and been rated by nobody is exactly the case where
   * "No evaluations yet" on its own would be misleading.
   */
  const feedbackSection = notes.length === 0 ? null : (
    <Section title="Notes this coach wrote to members">
      <div >
        {notes.map((n) => (
          <div key={n.id} className="py-3" style={{ borderBottom: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.08)' }}>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-white truncate">
                {names[n.member_id] ?? 'A member'}
              </span>
              <span className="text-[10px] ml-auto" style={{ color: 'var(--color-text-muted)' }}>
                {formatDate(n.created_at)}
              </span>
            </div>
            <p className="text-xs mt-1.5 leading-relaxed whitespace-pre-line"
              style={{ color: 'var(--color-text-secondary)' }}>
              {n.note}
            </p>
            {n.recommendation && (
              <p className="text-[11px] mt-1.5 leading-relaxed"
                style={{ color: 'var(--color-text-primary)' }}>
                Recommended: {n.recommendation}
              </p>
            )}
          </div>
        ))}
      </div>
    </Section>
  );

  if (failed) {
    return <Empty text="Couldn't load evaluations. A connection problem, not an empty record." />;
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-7">
        <Empty text="No evaluations yet. A member can evaluate a coach once they have completed a session with them, and once per month after that." />
        {feedbackSection}
      </div>
    );
  }

  // Newest month first; `months` already arrives in that order.
  const byPeriod = new Map<string, TrainerRatingRow[]>();
  for (const r of rows) {
    const list = byPeriod.get(r.period) ?? [];
    list.push(r);
    byPeriod.set(r.period, list);
  }

  return (
    <div className="space-y-7">
      {/* Said plainly, because the whole arrangement depends on both halves
          being true and neither being assumed. */}
      <div>
        <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          <span className="font-semibold text-white">Admin only.</span>{' '}
          This trainer cannot see who wrote any of this: the database refuses them the names, not
          just this screen. Use it to follow something up, not to relay it.
        </p>
      </div>

      <Section title="Month by month">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {months.map((m) => (
            <div key={m.period}>
              <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                {periodLabel(m.period)}
              </p>
              <p className="text-[20px] font-semibold text-white tabular-nums leading-tight">
                {m.average_stars.toFixed(1)}
              </p>
              <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
                {m.evaluations} {m.evaluations === 1 ? 'member' : 'members'}
                {/* How many bothered to say why — the number that tells you
                    whether this month is actionable or just a score. */}
                {m.with_comment > 0 && ` · ${m.with_comment} wrote a reason`}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {[...byPeriod.entries()].map(([period, list]) => (
        <Section key={period} title={periodLabel(period)}>
          <div >
            {list.map((r) => (
              <div key={`${r.member_id}-${r.period}`} className="py-3" style={{ borderBottom: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.08)' }}>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} size={11}
                      style={{ color: n <= r.stars ? 'var(--color-secondary)' : 'var(--color-border)' }}
                      fill={n <= r.stars ? 'currentColor' : 'none'} />
                  ))}
                  <span className="text-xs font-bold text-white ml-1">{r.stars}.0</span>
                  <span className="text-[11px] ml-auto truncate" style={{ color: 'var(--color-text-muted)' }}>
                    {names[r.member_id] ?? 'A member'}
                  </span>
                </div>
                {r.comment ? (
                  <p className="text-xs mt-1.5 leading-relaxed whitespace-pre-line"
                    style={{ color: 'var(--color-text-secondary)' }}>
                    {r.comment}
                  </p>
                ) : (
                  <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                    Score only, no reason written.
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      ))}

      {feedbackSection}
    </div>
  );
}
