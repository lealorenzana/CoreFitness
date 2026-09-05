import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, User, CalendarClock, Clock, Users, Mail, Phone, Trash2, Info, Star,
} from 'lucide-react';
import Avatar from './Avatar';
import Badge from './Badge';
import { removeAvatarFor } from '../../lib/api/avatars';
import { formatDate, formatPhoneNumber } from '../../utils/formatters';
import { showToast } from '../../utils/toast';
import {
  loadTrainerDetail, weekdayName, formatTimeOfDay, type TrainerDetail,
} from '../../services/trainerDetailService';
import {
  listTrainerRatings, getTrainerMonths, periodLabel,
  type TrainerRatingRow, type TrainerMonth,
} from '../../lib/api/trainers';

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

  useEffect(() => {
    setTab('profile');
    setDetail(null);
    load();
  }, [load]);

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
        <button onClick={onClose} style={{ color: 'var(--color-text-muted)' }}><X size={20} /></button>
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
            <Avatar name={fullName} photoUrl={photoUrl} size={52} tone="secondary" />
            {photoUrl && (
              <button onClick={removePhoto} disabled={removing} data-tip="Remove this trainer's photo"
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center disabled:opacity-50"
                style={{ background: 'var(--color-secondary)', color: '#000' }}>
                <Trash2 size={11} />
              </button>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-white truncate">{fullName}</h2>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <Badge variant="Premium">{trainer.specialization || 'General Training'}</Badge>
              {profile.status !== 'active' && <Badge variant="Suspended">{profile.status.replace('_', ' ')}</Badge>}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
          <X size={20} />
        </button>
      </div>

      <div className="flex overflow-x-auto flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors"
              style={{
                borderBottom: `2px solid ${active ? 'var(--color-secondary)' : 'transparent'}`,
                color: active ? 'var(--color-secondary)' : 'var(--color-text-muted)',
              }}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-dark-border">
        {tab === 'profile'  && <ProfileTab detail={detail} />}
        {tab === 'schedule' && <ScheduleTab detail={detail} />}
        {tab === 'sessions' && <SessionsTab detail={detail} />}
        {tab === 'clients'  && <ClientsTab detail={detail} />}
        {tab === 'evaluations' && <EvaluationsTab trainerId={detail.identity.profile.id} />}
      </div>

      <div className="grid grid-cols-4 gap-px flex-shrink-0"
        style={{ background: 'var(--color-border)', borderTop: '1px solid var(--color-border)' }}>
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
    <div className="px-3 py-2.5" style={{ background: 'var(--color-surface)' }}>
      <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
      <p className="text-sm font-bold text-white truncate">{value}</p>
    </div>
  );
}

/* ─────────────────────────── Profile ─────────────────────────── */

function ProfileTab({ detail }: { detail: TrainerDetail }) {
  const { profile, trainer } = detail.identity;
  const { stats } = detail;

  return (
    <div className="space-y-4">
      <Section title="Contact">
        <div className="grid grid-cols-2 gap-2">
          <InfoCell icon={Mail} label="Login email" value={profile.email} />
          <InfoCell icon={Phone} label="Phone" value={profile.phone ? formatPhoneNumber(profile.phone) : null} />
        </div>
      </Section>

      <Section title="Account">
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Status" value={profile.status.replace('_', ' ')} />
          <MiniStat label="Added" value={profile.created_at ? formatDate(profile.created_at) : '—'} />
          <MiniStat
            label="Bookable / week"
            value={stats.weeklyBookableMinutes > 0 ? `${(stats.weeklyBookableMinutes / 60).toFixed(1)} hrs` : 'none set'}
          />
        </div>
      </Section>

      <Section title="Bio">
        {trainer.bio
          ? <div className="rounded-xl p-3" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{trainer.bio}</p>
            </div>
          : <Empty text="No bio written. Members see this on the trainer's profile in the app." />}
      </Section>

      <Section title="Workload">
        <div className="grid grid-cols-4 gap-2">
          <MiniStat label="Classes" value={String(stats.classesTaught)} sub={`${stats.upcomingClasses} upcoming`} />
          <MiniStat label="1-on-1 approved" value={String(stats.ptApproved)} />
          <MiniStat label="1-on-1 pending" value={String(stats.ptPending)} />
          <MiniStat label="Class requests" value={String(stats.bookingsPending)} sub="awaiting the desk" />
        </div>
      </Section>
    </div>
  );
}

/* ─────────────────────────── Schedule ─────────────────────────── */

function ScheduleTab({ detail }: { detail: TrainerDetail }) {
  const { availability, classes, identity } = detail;
  const now = Date.now();
  const upcoming = classes.filter((c) => c.scheduled_at != null && new Date(c.scheduled_at).getTime() > now);
  const past = classes.filter((c) => c.scheduled_at == null || new Date(c.scheduled_at).getTime() <= now);
  const legacyDays = identity.trainer.availability;

  return (
    <div className="space-y-4">
      <Section title="Bookable hours">
        {availability.length === 0 ? (
          <Empty text="No bookable hours set, so members cannot request a 1-on-1 session with this trainer. Add them on Schedule → Trainer Hours, or the trainer can set their own in the phone app." />
        ) : (
          <>
            <div className="space-y-1.5">
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
            Profile blurb lists <span className="text-white">{legacyDays}</span> — display text only, not bookable.
          </p>
        )}
      </Section>

      <Section title={`Upcoming classes (${upcoming.length})`}>
        {upcoming.length === 0 ? (
          <Empty text="No upcoming classes scheduled." />
        ) : (
          <div className="space-y-1.5">
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
          <div className="space-y-1.5">
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
    <div className="space-y-1.5">
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
    <div className="space-y-1.5">
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
      <h3 className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function InfoCell({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-xl p-3 min-w-0" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} style={{ color: 'var(--color-text-muted)' }} />
        <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      </div>
      <p className={`text-xs truncate ${value ? 'text-white font-medium' : ''}`}
        style={value ? undefined : { color: 'var(--color-text-muted)' }}>
        {value || 'not on file'}
      </p>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl p-2.5 min-w-0" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
      <p className="text-[9px] uppercase tracking-wider truncate" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
      <p className="text-sm font-bold text-white truncate capitalize">{value}</p>
      {sub && <p className="text-[9px] truncate" style={{ color: 'var(--color-text-muted)' }}>{sub}</p>}
    </div>
  );
}

function Row({ title, subtitle, right, note }: {
  title: string; subtitle?: string; right?: React.ReactNode; note?: string | null;
}) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-white font-semibold truncate">{title}</p>
          {subtitle && <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</p>}
        </div>
        {right && <div className="flex-shrink-0">{right}</div>}
      </div>
      {note && <p className="text-[10px] mt-1.5" style={{ color: 'var(--color-text-secondary)' }}>{note}</p>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl px-4 py-6 text-center text-[11px]"
      style={{ background: 'var(--color-surface-raised)', border: '1px dashed var(--color-border)', color: 'var(--color-text-muted)' }}>
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
function EvaluationsTab({ trainerId }: { trainerId: string }) {
  const [rows, setRows] = useState<TrainerRatingRow[] | null>(null);
  const [months, setMonths] = useState<TrainerMonth[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [r, m] = await Promise.all([
        listTrainerRatings(trainerId).catch(() => null),
        getTrainerMonths(trainerId).catch(() => []),
      ]);
      if (!alive) return;
      if (r === null) { setFailed(true); setRows([]); return; }
      setRows(r);
      setMonths(m);
    })();
    return () => { alive = false; };
  }, [trainerId]);

  if (rows === null) {
    return <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading evaluations…</p>;
  }

  if (failed) {
    return <Empty text="Couldn't load evaluations — a connection problem, not an empty record." />;
  }

  if (rows.length === 0) {
    return (
      <Empty text="No evaluations yet. A member can evaluate a coach once they have completed a session with them, and once per month after that." />
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
    <div className="space-y-4">
      <Section title="Month by month">
        <div className="flex flex-wrap gap-2">
          {months.map((m) => (
            <div key={m.period} className="rounded-xl px-3 py-2"
              style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
              <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                {periodLabel(m.period)}
              </p>
              <p className="text-base font-bold text-white tabular-nums leading-tight">
                {m.average_stars.toFixed(1)}
              </p>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
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
          <div className="space-y-2">
            {list.map((r) => (
              <div key={`${r.member_id}-${r.period}`} className="rounded-xl p-3"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} size={11}
                      style={{ color: n <= r.stars ? 'var(--color-secondary)' : 'var(--color-border)' }}
                      fill={n <= r.stars ? 'currentColor' : 'none'} />
                  ))}
                  <span className="text-xs font-bold text-white ml-1">{r.stars}.0</span>
                </div>
                {/* Members are not named. The gym needs the signal, not a list
                    of who said what about whom — and a coach reading "Lea gave
                    me a 2" is how honest evaluations stop being written. */}
                {r.comment ? (
                  <p className="text-xs mt-1.5 leading-relaxed whitespace-pre-line"
                    style={{ color: 'var(--color-text-secondary)' }}>
                    {r.comment}
                  </p>
                ) : (
                  <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                    Score only — no reason written.
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}
