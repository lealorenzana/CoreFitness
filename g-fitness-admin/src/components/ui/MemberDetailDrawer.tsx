import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, User, CreditCard, CalendarCheck, TrendingUp, CalendarClock, MessageSquare,
  Mail, Phone, MapPin, Cake, ShieldAlert, QrCode, Trash2, Banknote, Pause, Play, Ban,
} from 'lucide-react';
import Avatar from './Avatar';
import Badge from './Badge';
import Button from './Button';
import { removeAvatarFor } from '../../lib/api/avatars';
import { recordPayment } from '../../lib/api/payments';
import {
  freezeMembership, unfreezeMembership, cancelMembership, changeMembershipPlan,
  freezesThisMonth, type MembershipActionDetail,
} from '../../lib/api/memberships';
import { listPlans } from '../../lib/api/membershipPlans';
import MembershipActionDialog from './MembershipActionDialog';
import { notifyUser } from '../../lib/api/notify';
import { bmi, bmiBand, goalProgress } from '../../lib/api/progress';
import { formatCheckInCode } from '../../utils/checkInCode';
import { formatDate, formatPhoneNumber } from '../../utils/formatters';
import { showToast } from '../../utils/toast';
import { loadMemberDetail, type MemberDetail } from '../../services/memberDetailService';
import type { MembershipStatus, MembershipPlanRow } from '../../types/db';

/**
 * The whole of one member, on one screen.
 *
 * Before this, clicking a member did nothing: the roster showed six columns and
 * everything else the gym knew — every payment, every check-in, the emergency
 * contact, whether they had ever logged a workout — was only reachable by
 * cross-referencing four other pages.
 *
 * Every number here is read from Postgres. There is no placeholder branch: a
 * member with no measurements gets a sentence saying so, not a plausible 170cm.
 * (The unmounted modal this replaces shipped exactly that — 170 cm, 65 kg, BMI
 * 22.5, "48 workouts", three invented goals — for every member alive.)
 */

type TabId = 'overview' | 'membership' | 'attendance' | 'progress' | 'bookings' | 'notes';

const TABS: { id: TabId; label: string; icon: typeof User }[] = [
  { id: 'overview',   label: 'Overview',   icon: User },
  { id: 'membership', label: 'Membership', icon: CreditCard },
  { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { id: 'progress',   label: 'Progress',   icon: TrendingUp },
  { id: 'bookings',   label: 'Bookings',   icon: CalendarClock },
  { id: 'notes',      label: 'Trainer notes', icon: MessageSquare },
];

/** Membership statuses map onto the design system's three tones, not five colours. */
const MEMBERSHIP_BADGE: Record<MembershipStatus, string> = {
  active: 'Active',
  pending: 'Pending',
  expired: 'Expired',
  frozen: 'Standard',
  cancelled: 'Cancelled',
};

const GENDER_LABEL: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  prefer_not_to_say: 'Prefer not to say',
};

interface Props {
  memberId: string | null;
  onClose: () => void;
  /** Called after any write, so the roster behind the drawer stays in step. */
  onChanged: () => void | Promise<void>;
}

export default function MemberDetailDrawer({ memberId, onClose, onChanged }: Props) {
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('overview');

  const load = useCallback(async () => {
    if (!memberId) return;
    setLoading(true);
    setError(null);
    try {
      setDetail(await loadMemberDetail(memberId));
    } catch (err) {
      setDetail(null);
      setError(err instanceof Error ? err.message : 'That member record could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    setTab('overview');
    setDetail(null);
    load();
  }, [load]);

  // Escape closes. A full-height panel over a table is easy to open by accident
  // from a mis-click on a row, so it needs the cheapest possible way out.
  useEffect(() => {
    if (!memberId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [memberId, onClose]);

  const refresh = async () => {
    await load();
    await onChanged();
  };

  return createPortal(
    <AnimatePresence>
      {memberId && (
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
              <DrawerMessage onClose={onClose} text="Loading member record…" />
            ) : error ? (
              <DrawerMessage onClose={onClose} text={error} />
            ) : detail ? (
              <DrawerBody detail={detail} onClose={onClose} tab={tab} setTab={setTab} onRefresh={refresh} />
            ) : null}
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

function DrawerMessage({ text, onClose }: { text: string; onClose: () => void }) {
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

/* ─────────────────────────── Body ─────────────────────────── */

function DrawerBody({
  detail, onClose, tab, setTab, onRefresh,
}: {
  detail: MemberDetail;
  onClose: () => void;
  tab: TabId;
  setTab: (t: TabId) => void;
  onRefresh: () => Promise<void>;
}) {
  const { identity, stats } = detail;
  const { profile, member } = identity;
  const fullName = `${profile.first_name} ${profile.last_name}`.trim();
  const current = detail.memberships[0] ?? null;
  const [photoUrl, setPhotoUrl] = useState<string | null>(profile.photo_url ?? null);
  const [removingPhoto, setRemovingPhoto] = useState(false);

  const removePhoto = async () => {
    setRemovingPhoto(true);
    try {
      await removeAvatarFor(profile.id);
      setPhotoUrl(null);
      showToast(`Removed ${profile.first_name}'s photo`, 'success');
      await onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not remove that photo', 'error');
    } finally {
      setRemovingPhoto(false);
    }
  };

  return (
    <>
      {/* Header */}
      <div className="p-5 flex items-start justify-between flex-shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex-shrink-0">
            <Avatar name={fullName} photoUrl={photoUrl} size={52} tone="secondary" />
            {photoUrl && (
              <button onClick={removePhoto} disabled={removingPhoto}
                data-tip="Remove this member's photo"
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center disabled:opacity-50"
                style={{ background: 'var(--color-secondary)', color: '#000' }}>
                <Trash2 size={11} />
              </button>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-white truncate">{fullName}</h2>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {current
                ? <Badge variant={MEMBERSHIP_BADGE[current.status]}>{current.status}</Badge>
                : <Badge variant="Inactive">no membership</Badge>}
              {profile.status !== 'active' && <Badge variant="Suspended">{profile.status.replace('_', ' ')}</Badge>}
              {current?.membership_plans?.name && (
                <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  {current.membership_plans.name}
                </span>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
          <X size={20} />
        </button>
      </div>

      {/* Tabs */}
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

      {/* Panel */}
      <div className="flex-1 min-h-0 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-dark-border">
        {tab === 'overview'   && <OverviewTab detail={detail} />}
        {tab === 'membership' && <MembershipTab detail={detail} onRefresh={onRefresh} />}
        {tab === 'attendance' && <AttendanceTab detail={detail} />}
        {tab === 'progress'   && <ProgressTab detail={detail} />}
        {tab === 'bookings'   && <BookingsTab detail={detail} />}
        {tab === 'notes'      && <NotesTab detail={detail} />}
      </div>

      {/* At-a-glance strip — the four numbers the desk is actually asked for. */}
      <div className="grid grid-cols-4 gap-px flex-shrink-0"
        style={{ background: 'var(--color-border)', borderTop: '1px solid var(--color-border)' }}>
        <FootStat label="Visit days" value={String(stats.visitDays)} />
        <FootStat
          label="Last visit"
          value={
            stats.lastVisitOn == null
              ? 'never'
              : stats.daysSinceLastVisit === 0
                ? 'today'
                : `${stats.daysSinceLastVisit}d ago`
          }
        />
        <FootStat label="Total paid" value={`₱${stats.totalPaid.toLocaleString('en-PH')}`} />
        <FootStat label="Member since" value={member.created_at ? formatDate(member.created_at) : '—'} />
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

/* ─────────────────────────── Overview ─────────────────────────── */

function OverviewTab({ detail }: { detail: MemberDetail }) {
  const { profile, member } = detail.identity;
  const { stats, progression } = detail;

  const hasEmergencyContact = !!(member.emergency_contact_name || member.emergency_contact_phone);

  return (
    <div className="space-y-4">
      <Section title="Contact">
        <div className="grid grid-cols-2 gap-2">
          <InfoCell icon={Mail} label="Email" value={profile.email} />
          <InfoCell icon={Phone} label="Phone" value={profile.phone ? formatPhoneNumber(profile.phone) : null} />
          <InfoCell icon={MapPin} label="Address" value={member.address} className="col-span-2" />
        </div>
      </Section>

      <Section title="Intake">
        <div className="grid grid-cols-3 gap-2">
          {/* Age is derived from the birth date on every read (0031). A stored age
              is right for one year and then lies without anything noticing. */}
          <InfoCell
            icon={Cake}
            label="Date of birth"
            value={member.date_of_birth ? `${formatDate(member.date_of_birth)}${stats.age != null ? ` · ${stats.age} yrs` : ''}` : null}
          />
          <InfoCell icon={User} label="Gender" value={member.gender ? GENDER_LABEL[member.gender] ?? member.gender : null} />
          <InfoCell
            icon={QrCode}
            label="Check-in code"
            value={formatCheckInCode(profile.id)}
            mono
          />
        </div>
      </Section>

      <Section title="Emergency contact">
        {hasEmergencyContact ? (
          <div className="grid grid-cols-3 gap-2">
            <InfoCell icon={User} label="Name" value={member.emergency_contact_name} />
            <InfoCell icon={Phone} label="Phone" value={member.emergency_contact_phone ? formatPhoneNumber(member.emergency_contact_phone) : null} />
            <InfoCell icon={ShieldAlert} label="Relationship" value={member.emergency_contact_relationship} />
          </div>
        ) : (
          // Called out rather than shown as three dashes. In a room full of heavy
          // objects this is the one blank field that can matter.
          <div className="rounded-xl p-3 flex items-start gap-2"
            style={{ background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.30)' }}>
            <ShieldAlert size={14} style={{ color: 'var(--color-secondary)' }} className="mt-0.5 flex-shrink-0" />
            <p className="text-[11px]" style={{ color: 'var(--color-secondary)' }}>
              No emergency contact on file. Ask for one at their next visit and add it with Edit.
            </p>
          </div>
        )}
      </Section>

      <Section title="Training level">
        <div className="grid grid-cols-2 gap-2">
          {/* Two different levels, deliberately named apart. Labelling both
              "level" is what made the member app contradict itself. */}
          <div className="rounded-xl p-3" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
            <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Says they are</p>
            <p className="text-sm font-semibold text-white capitalize mt-0.5">{member.experience_level || 'not set'}</p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>Self-declared at onboarding</p>
          </div>
          {progression ? (
            <div className="rounded-xl p-3" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
              <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Earned here</p>
              <p className="text-sm font-semibold capitalize mt-0.5" style={{ color: 'var(--color-secondary)' }}>{progression.level}</p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                {progression.training_days} training days · {progression.consistent_weeks} consistent weeks
              </p>
            </div>
          ) : (
            <div className="rounded-xl p-3 flex items-center" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                Earned level unavailable — migration 0028 is not live on this database.
              </p>
            </div>
          )}
        </div>
      </Section>

      <Section title="Activity">
        <div className="grid grid-cols-4 gap-2">
          <MiniStat label="Visits logged" value={String(stats.visits)} />
          <MiniStat label="Days last 30" value={String(stats.visitDaysLast30)} />
          <MiniStat label="Class bookings" value={String(stats.bookingsApproved)} sub={stats.bookingsPending > 0 ? `${stats.bookingsPending} pending` : undefined} />
          <MiniStat label="PT sessions" value={String(stats.ptApproved)} sub={stats.ptPending > 0 ? `${stats.ptPending} pending` : undefined} />
        </div>
      </Section>
    </div>
  );
}

/* ─────────────────────────── Membership ─────────────────────────── */

function MembershipTab({ detail, onRefresh }: { detail: MemberDetail; onRefresh: () => Promise<void> }) {
  const current = detail.memberships[0] ?? null;
  const history = detail.memberships.slice(1);
  const { stats } = detail;
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<'freeze' | 'cancel' | null>(null);
  const [freezesUsed, setFreezesUsed] = useState<number | null>(null);

  // Shown next to the button rather than only inside the dialog, so the desk
  // can see the limit before deciding to open anything.
  useEffect(() => {
    let alive = true;
    freezesThisMonth(detail.identity.profile.id)
      .then((n) => { if (alive) setFreezesUsed(n); });
    return () => { alive = false; };
  }, [detail.identity.profile.id, busy]);
  const [showPayment, setShowPayment] = useState(false);

  const act = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      showToast(ok, 'success');
      await onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'That action did not go through', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Section title="Current membership">
        {current ? (
          <div className="rounded-xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-bold text-white">{current.membership_plans?.name ?? 'Unknown plan'}</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  ₱{Number(current.membership_plans?.price ?? 0).toLocaleString('en-PH')}
                  {current.membership_plans?.duration_days == null
                    ? ' · does not expire'
                    : ` · ${current.membership_plans.duration_days} days`}
                </p>
              </div>
              <Badge variant={MEMBERSHIP_BADGE[current.status]}>{current.status}</Badge>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3">
              <MiniStat label="Started" value={current.start_date ? formatDate(current.start_date) : 'not started'} />
              {/* A null expiry means two different things (0024) and the two must
                  not share a dash: a lifetime plan, or a membership never paid for. */}
              <MiniStat
                label="Expires"
                value={current.expiry_date ? formatDate(current.expiry_date) : current.never_expires ? 'Never' : 'not activated'}
              />
              {/* Per calendar month since 0057, not per membership period —
                  the old "of 1" counter could not express "twice a month"
                  because it had no idea when the last freeze was. */}
              <MiniStat label="Freezes this month" value={`${freezesUsed ?? '…'} of 2`} />
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-4 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setShowPayment((v) => !v)}>
                <Banknote size={13} /> {showPayment ? 'Cancel' : 'Record payment'}
              </Button>
              {current.status === 'frozen' ? (
                <Button size="sm" variant="outline" disabled={busy}
                  onClick={() => act(() => unfreezeMembership(current), 'Membership resumed — frozen days added back')}>
                  <Play size={13} /> Resume
                </Button>
              ) : current.status === 'active' ? (
                <>
                  {/* No longer disabled by a count. The limit is two a month
                      and an admin can override it, so a hard-disabled button
                      would refuse the person allowed to say yes. The dialog
                      shows the count and the database enforces it. */}
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => setAction('freeze')}>
                    <Pause size={13} /> Freeze
                  </Button>
                  <Button size="sm" variant="danger" disabled={busy}
                    onClick={() => setAction('cancel')}>
                    <Ban size={13} /> Cancel
                  </Button>
                </>
              ) : null}
            </div>

            {showPayment && (
              <RecordPaymentInline
                memberId={detail.identity.profile.id}
                firstName={detail.identity.profile.first_name}
                membershipId={current.id}
                currentPlanId={current.plan_id}
                onDone={async () => { setShowPayment(false); await onRefresh(); }}
              />
            )}

            {/* Freezing and cancelling both need a reason now (0057), so both go
                through the same dialog rather than a yes/no confirm. */}
            {action && <MembershipActionDialog
              key={action}
              kind={action}
              memberName={`${detail.identity.profile.first_name} ${detail.identity.profile.last_name}`.trim()}
              memberId={detail.identity.profile.id}
              neverExpires={current.never_expires ?? false}
              expiryLabel={current.expiry_date ? formatDate(current.expiry_date) : null}
              onClose={() => setAction(null)}
              onConfirm={async (d: Omit<MembershipActionDetail, 'memberId'>) => {
                const payload = { ...d, memberId: detail.identity.profile.id };
                if (action === 'freeze') await freezeMembership(current.id, payload);
                else await cancelMembership(current.id, payload);
                showToast(action === 'freeze'
                  ? 'Membership frozen'
                  : 'Membership cancelled — access runs to expiry', 'success');
                await onRefresh();
              }}
            />}
          </div>
        ) : (
          <Empty text="No membership assigned. Approve a registration or assign a plan before recording a payment." />
        )}
      </Section>

      <Section title={`Payments (₱${stats.totalPaid.toLocaleString('en-PH')} received)`}>
        {stats.paymentsUnsettled > 0 && (
          <p className="text-[10px] mb-2" style={{ color: 'var(--color-secondary)' }}>
            {stats.paymentsUnsettled} payment{stats.paymentsUnsettled === 1 ? '' : 's'} not counted in that total — only completed ones are.
          </p>
        )}
        {detail.payments.length === 0 ? (
          <Empty text="No payments recorded for this member." />
        ) : (
          <div className="space-y-1.5">
            {detail.payments.map((p) => (
              <Row key={p.id}
                title={`₱${Number(p.amount).toLocaleString('en-PH')}`}
                // paid_on is the day the cash arrived; created_at is when it was
                // keyed in. They are not the same question, so only one is shown.
                subtitle={`${formatDate(p.paid_on)} · ${p.method}${p.invoice_number ? ` · ${p.invoice_number}` : ''}`}
                right={<Badge variant={p.status === 'completed' ? 'Completed' : p.status === 'pending' ? 'Pending' : 'Failed'}>{p.status}</Badge>}
                note={p.notes}
              />
            ))}
          </div>
        )}
      </Section>

      {history.length > 0 && (
        <Section title="Previous memberships">
          <div className="space-y-1.5">
            {history.map((m) => (
              <Row key={m.id}
                title={m.membership_plans?.name ?? 'Unknown plan'}
                subtitle={`${m.start_date ? formatDate(m.start_date) : 'no start'} → ${m.expiry_date ? formatDate(m.expiry_date) : m.never_expires ? 'never' : 'not activated'}`}
                right={<Badge variant={MEMBERSHIP_BADGE[m.status]}>{m.status}</Badge>}
              />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

/**
 * Records a cash payment against the membership already on screen.
 *
 * Deliberately not the Payments page's modal: that one opens with a member
 * search, and searching for the member whose record you already have open is a
 * step that exists only to be got wrong. The write itself is the same
 * `recordPayment` call, so activation and expiry-extension behave identically.
 */
function RecordPaymentInline({
  memberId, firstName, membershipId, currentPlanId, onDone,
}: {
  memberId: string;
  firstName: string;
  membershipId: string;
  currentPlanId: string;
  onDone: () => Promise<void>;
}) {
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const [plans, setPlans] = useState<MembershipPlanRow[]>([]);
  const [planId, setPlanId] = useState(currentPlanId);
  /**
   * `null` means "follow the selected plan"; a string is what the desk typed.
   *
   * Derived rather than synced by an effect. The amount has to track the plan
   * dropdown, and an effect doing that is both a cascading render and a race:
   * it would overwrite a hand-entered figure — a part payment, a haggled rate —
   * one tick after it was typed, which is the software correcting the person
   * who counted the cash.
   */
  const [typedAmount, setTypedAmount] = useState<string | null>(null);
  const [paidOn, setPaidOn] = useState(today);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // The plan list is loaded here rather than threaded down from the drawer,
  // because the form is the only thing that needs it and it opens on demand.
  useEffect(() => {
    let cancelled = false;
    listPlans()
      .then((all) => {
        if (cancelled) return;
        // Retired plans stay selectable *only* if the member is already on one.
        // Hiding it would silently move them off a plan the gym still honours
        // the moment the desk took a payment.
        setPlans(all.filter((p) => p.is_active || p.id === currentPlanId));
      })
      .catch(() => showToast('Could not load the plan list', 'error'));
    return () => { cancelled = true; };
  }, [currentPlanId]);

  const plan = plans.find((p) => p.id === planId) ?? null;
  const durationDays = plan?.duration_days ?? null;
  const changingPlan = planId !== currentPlanId;

  const planPrice = plan && Number(plan.price) > 0 ? String(Number(plan.price)) : '';
  const amount = typedAmount ?? planPrice;

  const submit = async () => {
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) {
      showToast('Enter the amount received', 'error');
      return;
    }
    setSaving(true);
    try {
      // Plan first, then payment. `recordPayment` reads the membership to work
      // out where the new term starts and writes `never_expires` from the
      // duration it is handed, so the row has to already be on the new plan or
      // the member ends up paying Premium rates for a Free Access term.
      //
      // If this throws — the Freemium trigger from 0041 refusing a second
      // trial is the case that will actually happen — nothing has been
      // recorded yet, and the cash has not been taken on the strength of a
      // half-applied change.
      if (changingPlan) {
        await changeMembershipPlan(membershipId, planId);
      }

      await recordPayment({
        member_id: memberId,
        membership_id: membershipId,
        duration_days: durationDays,
        amount: value,
        method: 'cash',
        status: 'completed',
        paid_on: paidOn,
        due_date: null,
        notes: notes || null,
        recorded_by: null,
      });

      // The cash has already changed hands by this point, so a failed notify
      // must not read as a failed payment.
      await notifyUser({
        userId: memberId,
        type: 'payment',
        title: 'Payment received',
        message: changingPlan
          ? `We received ₱${value.toLocaleString('en-PH')}. You are now on ${plan?.name ?? 'your new plan'}.`
          : `We received ₱${value.toLocaleString('en-PH')}. Your membership has been extended.`,
        actionUrl: '/member/payments',
      }).catch(() => showToast('Payment recorded, but the member could not be notified', 'error'));

      showToast(
        changingPlan
          ? `₱${value.toLocaleString('en-PH')} recorded — ${firstName} is now on ${plan?.name ?? 'the new plan'}`
          : `₱${value.toLocaleString('en-PH')} recorded — ${firstName}'s membership is active`,
        'success'
      );
      await onDone();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not record that payment', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 pt-3 space-y-2" style={{ borderTop: '1px solid var(--color-border)' }}>
      {/* Taking the money and moving the plan are one action at a real front
          desk — a member upgrades *by* paying. Splitting them into two screens
          is how a member ends up paid-up on the wrong tier. */}
      <div>
        <label className="text-[9px] uppercase block mb-1" style={{ color: 'var(--color-text-muted)' }}>Plan</label>
        <select value={planId} onChange={(e) => setPlanId(e.target.value)}
          className="w-full px-3 py-2 rounded-xl text-white text-xs"
          style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {Number(p.price) > 0 ? ` — ₱${Number(p.price).toLocaleString('en-PH')}` : ' — free'}
              {p.id === currentPlanId ? ' (current)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[9px] uppercase block mb-1" style={{ color: 'var(--color-text-muted)' }}>Amount (₱)</label>
          <input type="number" min="0" step="0.01" value={amount}
            onChange={(e) => setTypedAmount(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-white text-xs"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
        </div>
        <div>
          <label className="text-[9px] uppercase block mb-1" style={{ color: 'var(--color-text-muted)' }}>Date received</label>
          <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-white text-xs"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
        </div>
      </div>
      <div>
        <label className="text-[9px] uppercase block mb-1" style={{ color: 'var(--color-text-muted)' }}>Notes (optional)</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. paid in two instalments"
          className="w-full px-3 py-2 rounded-xl text-white text-xs"
          style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
      </div>
      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
        Cash only. {durationDays == null
          ? 'This plan does not expire, so no end date is set.'
          : `Adds ${durationDays} days — from today, or from the current expiry if it has not passed.`}
      </p>
      {/* Two consequences of a plan change that are invisible until they have
          happened, so they are stated before the button rather than after. */}
      {changingPlan && (
        <p className="text-[10px]" style={{ color: 'var(--color-secondary)' }}>
          This moves {firstName} onto {plan?.name ?? 'the selected plan'}.
          {durationDays == null
            ? ' Any days remaining on the old plan are not carried over — the new one has no end date to add them to.'
            : ' Unused days on the current plan carry over.'}
        </p>
      )}
      <Button size="sm" variant="secondary" disabled={saving} onClick={submit} className="w-full">
        {saving ? 'Recording…' : 'Record payment'}
      </Button>
    </div>
  );
}

/* ─────────────────────────── Attendance ─────────────────────────── */

function AttendanceTab({ detail }: { detail: MemberDetail }) {
  const { attendance, stats } = detail;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Check-ins" value={String(stats.visits)} />
        <MiniStat label="Distinct days" value={String(stats.visitDays)} />
        <MiniStat label="Days in last 30" value={String(stats.visitDaysLast30)} />
      </div>
      <Section title="Check-in history">
        {attendance.length === 0 ? (
          <Empty text="This member has never checked in." />
        ) : (
          <div className="space-y-1.5">
            {attendance.map((a) => {
              const at = new Date(a.check_in_time);
              return (
                <Row key={a.id}
                  title={at.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  subtitle={`${at.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}${a.activity ? ` · ${a.activity}` : ''}`}
                  right={<Badge variant={a.method === 'qr' ? 'QR' : 'Manual'}>{a.method}</Badge>}
                />
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

/* ─────────────────────────── Progress ─────────────────────────── */

function ProgressTab({ detail }: { detail: MemberDetail }) {
  const { measurements, goals, workouts, progression } = detail;
  // listMeasurements is oldest-first, so the latest is the last element.
  const latest = measurements.length > 0 ? measurements[measurements.length - 1] : null;
  const latestBmi = latest ? bmi(latest.weight_kg, latest.height_cm) : null;
  const band = latestBmi != null ? bmiBand(latestBmi) : null;

  return (
    <div className="space-y-4">
      {progression && (
        <Section title="Progression">
          <div className="grid grid-cols-4 gap-2">
            <MiniStat label="Training days" value={String(progression.training_days)} />
            <MiniStat label="Verified" value={String(progression.verified_days)} sub="staff check-in" />
            <MiniStat label="Self-logged" value={String(progression.logged_days)} />
            <MiniStat label="Best week run" value={String(progression.best_week_streak)} />
          </div>
        </Section>
      )}

      <Section title={latest ? `Latest measurements — ${formatDate(latest.measured_on)}` : 'Measurements'}>
        {!latest ? (
          <Empty text="No body measurements recorded. Members enter these themselves in the phone app." />
        ) : (
          <div className="grid grid-cols-4 gap-2">
            <MiniStat label="Weight" value={latest.weight_kg != null ? `${latest.weight_kg} kg` : '—'} />
            <MiniStat label="Height" value={latest.height_cm != null ? `${latest.height_cm} cm` : '—'} />
            <MiniStat label="BMI" value={latestBmi != null ? String(latestBmi) : '—'} sub={band?.label} />
            <MiniStat label="Body fat" value={latest.body_fat_pct != null ? `${latest.body_fat_pct}%` : '—'} />
            <MiniStat label="Chest" value={latest.chest_cm != null ? `${latest.chest_cm} cm` : '—'} />
            <MiniStat label="Waist" value={latest.waist_cm != null ? `${latest.waist_cm} cm` : '—'} />
            <MiniStat label="Arms" value={latest.arms_cm != null ? `${latest.arms_cm} cm` : '—'} />
            <MiniStat label="Thighs" value={latest.thighs_cm != null ? `${latest.thighs_cm} cm` : '—'} />
          </div>
        )}
        {measurements.length > 1 && (
          <p className="text-[10px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
            {measurements.length} entries on record, from {formatDate(measurements[0].measured_on)}.
          </p>
        )}
      </Section>

      <Section title="Goals">
        {goals.length === 0 ? (
          <Empty text="No goals set." />
        ) : (
          <div className="space-y-2.5">
            {goals.map((g) => {
              // Only weight goals have a current reading to measure against; for
              // anything else the honest answer is that we cannot say, and a bar
              // that invents a position is worse than no bar.
              const currentValue = g.metric === 'weight_kg' ? latest?.weight_kg ?? null : null;
              const p = goalProgress(g, currentValue);
              return (
                <div key={g.id}>
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <span className="text-xs text-white font-medium truncate">{g.title}</span>
                    <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                      {g.achieved_on
                        ? `achieved ${formatDate(g.achieved_on)}`
                        : p == null ? 'no reading yet' : `${Math.round(p * 100)}%`}
                    </span>
                  </div>
                  {p != null && (
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                      <div className="h-full rounded-full" style={{ width: `${p * 100}%`, background: 'var(--color-secondary)' }} />
                    </div>
                  )}
                  {g.target_value != null && (
                    <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      {g.start_value ?? '?'} → {g.target_value} {g.metric}
                      {g.target_date ? ` by ${formatDate(g.target_date)}` : ''}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title={`Workout log (${workouts.length})`}>
        {workouts.length === 0 ? (
          <Empty text="No workouts logged." />
        ) : (
          <div className="space-y-1.5">
            {workouts.slice(0, 20).map((w) => (
              <Row key={w.id}
                title={w.activity || 'Workout'}
                subtitle={`${formatDate(w.performed_on)}${w.duration_minutes ? ` · ${w.duration_minutes} min` : ''}`}
                note={w.notes}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

/* ─────────────────────────── Bookings ─────────────────────────── */

const BOOKING_BADGE: Record<string, string> = {
  approved: 'Confirmed',
  pending: 'Pending',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

function BookingsTab({ detail }: { detail: MemberDetail }) {
  const { bookings, ptSessions } = detail;
  return (
    <div className="space-y-4">
      <Section title={`Class bookings (${bookings.length})`}>
        {bookings.length === 0 ? (
          <Empty text="No class bookings." />
        ) : (
          <div className="space-y-1.5">
            {bookings.map((b) => (
              <Row key={b.id}
                title={b.classes?.name ?? 'Class'}
                subtitle={
                  b.classes?.scheduled_at
                    ? new Date(b.classes.scheduled_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
                    : `requested ${formatDate(b.requested_at)}`
                }
                right={<Badge variant={BOOKING_BADGE[b.status] ?? 'Pending'}>{b.status}</Badge>}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title={`Personal training (${ptSessions.length})`}>
        {ptSessions.length === 0 ? (
          <Empty text="No 1-on-1 sessions." />
        ) : (
          <div className="space-y-1.5">
            {ptSessions.map((s) => (
              <Row key={s.id}
                title={new Date(s.starts_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                subtitle={`${s.duration_minutes} min`}
                right={<Badge variant={BOOKING_BADGE[s.status] ?? 'Pending'}>{s.status}</Badge>}
                note={s.notes}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

/* ─────────────────────────── Notes ─────────────────────────── */

function NotesTab({ detail }: { detail: MemberDetail }) {
  if (detail.notes.length === 0) {
    return <Empty text="No trainer notes for this member yet." />;
  }
  return (
    <div className="space-y-2">
      {detail.notes.map((n) => (
        <div key={n.id} className="rounded-xl p-3"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-xs font-semibold" style={{ color: 'var(--color-secondary)' }}>{n.title}</p>
            <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>{formatDate(n.date)}</span>
          </div>
          {/* No trainer attribution: `notifications` records the recipient, not
              the sender, so there is no name to show and inventing one is worse. */}
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{n.message}</p>
        </div>
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

function InfoCell({
  icon: Icon, label, value, className, mono,
}: {
  icon: typeof User; label: string; value: string | null | undefined; className?: string; mono?: boolean;
}) {
  return (
    <div className={`rounded-xl p-3 min-w-0 ${className ?? ''}`}
      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} style={{ color: 'var(--color-text-muted)' }} />
        <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      </div>
      {/* An absent value reads as absent. It never falls back to another
          member's data, a placeholder name, or an invented default. */}
      <p className={`text-xs truncate ${value ? 'text-white font-medium' : ''} ${mono ? 'font-mono tracking-widest' : ''}`}
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
      <p className="text-sm font-bold text-white truncate">{value}</p>
      {sub && <p className="text-[9px] truncate" style={{ color: 'var(--color-text-muted)' }}>{sub}</p>}
    </div>
  );
}

function Row({
  title, subtitle, right, note,
}: {
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
