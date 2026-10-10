import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import {
  Bell, Send, Users, User, Dumbbell, Plus, X, Search, Eye, Trash2, Smartphone,
} from 'lucide-react';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import BulkBar from '../components/ui/BulkBar';
import ImageField from '../components/ui/ImageField';
import Pagination from '../components/ui/Pagination';
import {
  PageHeader, StatTiles, Section, EmptyState, CardGrid, TileCard, SearchBox, PageSummary,
  SectionTabs,
} from '../components/ui/kit';
import { usePaged } from '../hooks/usePaged';
import FormField, { SectionLabel, FieldDivider } from '../components/ui/FormField';
import { showSuccessToast, showErrorToast } from '../utils/toast';
import { listPlans } from '../lib/api/membershipPlans';
import { supabase } from '../lib/supabaseClient';
import {
  broadcastNotification,
  listRecentBroadcasts,
  countAudience,
  recallBroadcast,
  type BroadcastAudience,
  type BroadcastSummary,
} from '../lib/api/notifications';
import { pushToMany } from '../lib/api/notify';

/**
 * The gym's announcement composer.
 *
 * `notifications` is one row per recipient, so a "broadcast" is really N rows
 * written in one go; `listRecentBroadcasts` groups them back together by
 * title+message+minute to show the send as one thing.
 *
 * The three stat cards used to describe the **whole notifications table** —
 * every booking confirmation, payment receipt and gym reminder the system has
 * ever written — while sitting under a heading about broadcasts. "Total
 * Delivered" was therefore a number no broadcast had produced, "Read Rate" was
 * the read rate of automated receipts, and "Broadcasts Sent" silently capped at
 * the query's 20-row limit and stayed there forever. All three now describe the
 * broadcasts actually listed below them.
 */

type RecipientType = BroadcastAudience;
type NotificationType = 'info' | 'event' | 'system' | 'payment' | 'achievement';

interface Recipient {
  id: string;
  name: string;
  role: string;
}

interface NotificationForm {
  recipientType: RecipientType;
  specificUsers: string[];
  /** For the 'plans' audience (0186). */
  planIds: string[];
  notificationType: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
  /** Optional picture, copied onto every recipient's row (0065). */
  imageUrl?: string;
}

const EMPTY_FORM: NotificationForm = {
  recipientType: 'all_members',
  specificUsers: [],
  planIds: [],
  notificationType: 'info',
  title: '',
  message: '',
  actionUrl: '',
  imageUrl: '',
};

/**
 * Where an announcement can send someone.
 *
 * These are real member-app routes, checked against `App.tsx`. Offered as a
 * list rather than a text box because an admin has no way to know what paths
 * exist, and the old free-text field only told them a path was wrong *after*
 * they had sent the announcement to everyone.
 *
 * Deliberately short: only the screens an announcement plausibly points at. A
 * link to a member's own private page would open on *their* data anyway, so
 * "Membership" means "your membership", which is what a member expects.
 */
const ANNOUNCEMENT_DESTINATIONS: { path: string; label: string }[] = [
  { path: '',                        label: 'Nothing — just show the message' },
  { path: '/member/events',          label: 'Events' },
  { path: '/member/book-class',      label: 'Book a session' },
  { path: '/member/challenges',      label: 'Challenges' },
  { path: '/member/rewards',         label: 'CORE Points' },
  { path: '/member/membership',      label: 'Their membership' },
  { path: '/member/renew',           label: 'Renew / see plans' },
  { path: '/member/trainers',        label: 'Our trainers' },
  { path: '/member/workouts',        label: 'Free workout resources' },
  { path: '/member/progress',        label: 'Their progress' },
  { path: '/member/payments',        label: 'Their payment history' },
];

/** Kept short enough to survive an Android notification shade without a tail-off. */
const TITLE_MAX = 60;
const MESSAGE_MAX = 240;

const FIELD_CLASS = 'w-full px-3 py-2 rounded-xl text-white text-xs';
const FIELD_STYLE = { background: 'var(--color-bg)', border: '1px solid var(--color-border)' };

/** Starting points for the message — every bracket is for the owner to fill, so none is sent as a claim. */
const TEMPLATES: { label: string; type: NotificationType; title: string; message: string; actionUrl: string }[] = [
  { label: 'Closed for a day', type: 'system', title: 'We are closed on [day]', message: 'The gym is closed on [day] for [reason]. We open again on [day] at [time]. Sorry for the trouble!', actionUrl: '' },
  { label: 'Holiday hours', type: 'system', title: 'Holiday hours this week', message: 'From [date] to [date] we open [time] to [time]. Regular hours return on [date].', actionUrl: '' },
  { label: 'New class', type: 'event', title: 'New class: [name]', message: '[Name] starts on [day] at [time] with Coach [name]. Book your spot in the app.', actionUrl: '/member/book-class' },
  { label: 'Event reminder', type: 'event', title: '[Event] is this [day]', message: 'Join us for [event] on [day] at [time]. Sign up in Events so we can plan for you.', actionUrl: '/member/events' },
  { label: 'New challenge', type: 'achievement', title: 'New challenge: [name]', message: 'Join [name] in the app — reach the target by [date] and earn [points] points.', actionUrl: '/member/challenges' },
  { label: 'Renewal nudge', type: 'payment', title: 'Keep your streak going', message: 'Your plan ends soon. Renew at the desk or in the app to keep training without a gap.', actionUrl: '/member/renew' },
];
const STEPS = ['Who gets it', 'The message', 'Check and send'];

const AUDIENCE_LABEL: Record<RecipientType, string> = {
  all_members: 'All Members',
  all_trainers: 'All Trainers',
  everyone: 'Everyone',
  specific: 'Pick People',
  free_tier: 'Free tier',
  paid: 'Paid plans',
  plans: 'Some plans',
};

/** Announcements and Events are one section — see SectionTabs for why the
 *  records stay in separate tables. */
const COMMS_TABS = [
  { label: 'Announcements', to: '/notifications' },
  { label: 'Events', to: '/events' },
];

export default function Notifications() {
  const [showSendModal, setShowSendModal] = useState(false);
  const [form, setForm] = useState<NotificationForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState(0);

  const [recent, setRecent] = useState<BroadcastSummary[]>([]);
  const [people, setPeople] = useState<Recipient[]>([]);
  const [peopleSearch, setPeopleSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [audienceCounts, setAudienceCounts] = useState<Record<string, number>>({});
  /** Free tier / Paid plans, counted by the database (0186); null before 0186, and the buttons do not show. */
  const [planCounts, setPlanCounts] = useState<{ free_tier: number | null; paid: number | null }>({ free_tier: null, paid: null });
  const [plans, setPlans] = useState<{ id: string; name: string }[]>([]);
  const [toRecall, setToRecall] = useState<BroadcastSummary | null>(null);

  const load = useCallback(async () => {
    try {
      // The plan audiences (0186) are counted by the database; before 0186 they read 0.
      void Promise.all([countAudience('free_tier').catch(() => null), countAudience('paid').catch(() => null), listPlans().catch(() => [])])
        .then(([free, paid, plans]) => {
          setPlanCounts({ free_tier: free, paid });
          setPlans(plans.filter((p) => p.is_active !== false).map((p) => ({ id: p.id, name: p.name })));
        });
      const [broadcasts, { data: profiles }, members, trainers, everyone] = await Promise.all([
        listRecentBroadcasts(),
        supabase.from('gym_people').select('id, first_name, last_name, role')
          .in('role', ['member', 'trainer']).eq('status', 'active').order('first_name'),
        countAudience('all_members').catch(() => 0),
        countAudience('all_trainers').catch(() => 0),
        countAudience('everyone').catch(() => 0),
      ]);
      setRecent(broadcasts);
      setPeople((profiles ?? []).map((p) => ({
        id: p.id,
        name: `${p.first_name} ${p.last_name}`.trim(),
        role: p.role,
      })));
      setAudienceCounts({ all_members: members, all_trainers: trainers, everyone });
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to load notifications');
    }
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  /** How many this send will reach, known before the button is pressed. */
  const plannedRecipients =
    form.recipientType === 'specific'
      ? form.specificUsers.length
      : audienceCounts[form.recipientType] ?? 0;

  /** Checks one step (or all of them when `upTo` is 2). */
  const validate = (upTo = 2) => {
    const next: Record<string, string> = {};
    if (upTo >= 1 && !form.title.trim()) next.title = 'Required.';
    if (upTo >= 1 && !form.message.trim()) next.message = 'Required.';
    if (upTo >= 1 && /\[[^\]]+\]/.test(form.title + form.message)) next.message = 'Fill in the [brackets] from the template first.';
    if (form.recipientType === 'specific' && form.specificUsers.length === 0) {
      next.recipients = 'Pick at least one person.';
    }
    if (form.recipientType === 'plans' && form.planIds.length === 0) {
      next.recipients = 'Pick at least one plan.';
    }
    // An action URL that isn't an in-app path sends the member nowhere.
    const url = form.actionUrl?.trim();
    if (url && !url.startsWith('/')) next.actionUrl = 'Must be an in-app path starting with "/".';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSendNotification = async () => {
    setSending(true);
    try {
      const { recipients, recipientIds } = await broadcastNotification({
        audience: form.recipientType,
        userIds: form.specificUsers,
        planIds: form.planIds,
        type: form.notificationType,
        title: form.title.trim(),
        message: form.message.trim(),
        actionUrl: form.actionUrl?.trim() || null,
        imageUrl: form.imageUrl?.trim() || null,
      });

      // The rows are already written; these are the alerts on top. Never fatal —
      // a broadcast to 200 people must not report failure because one of them
      // has a dead push endpoint.
      await pushToMany(recipientIds, {
        type: (['booking', 'payment', 'membership', 'event'] as const).includes(
          form.notificationType as 'booking' | 'payment' | 'membership' | 'event'
        )
          ? (form.notificationType as 'booking' | 'payment' | 'membership' | 'event')
          : 'system',
        title: form.title.trim(),
        message: form.message.trim(),
        actionUrl: form.actionUrl?.trim() || undefined,
      });

      showSuccessToast(`Sent to ${recipients} ${recipients === 1 ? 'person' : 'people'}.`);
      setShowSendModal(false);
      setForm(EMPTY_FORM);
      setErrors({});
      await load();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to send notification');
    } finally {
      setSending(false);
    }
  };

  /**
   * Recall: deletes the rows this broadcast wrote.
   *
   * Honest about its limits — it clears the message from everyone's inbox, but a
   * push alert that already reached a phone is gone from our reach entirely.
   * The confirmation says so rather than implying the message was unsent.
   */
  const recall = async () => {
    if (!toRecall) return;
    try {
      // Reports what was actually removed, not what we asked to remove — RLS
      // filters silently and a zero-row DELETE is not an error.
      const removed = await recallBroadcast(toRecall.ids);
      showSuccessToast(`Removed from ${removed} inbox${removed === 1 ? '' : 'es'}.`);
      setToRecall(null);
      await load();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Could not recall that broadcast');
    }
  };

  // Select-many (2026-10-04): recall several, or all of them, at once.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkRecall, setBulkRecall] = useState(false);
  const togglePick = (key: string) => setPicked((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const pickedRows = recent.filter((b) => picked.has(b.key));
  const recallMany = async () => {
    try {
      const removed = await recallBroadcast(pickedRows.flatMap((b) => b.ids));
      showSuccessToast(`Recalled ${pickedRows.length} announcement${pickedRows.length === 1 ? '' : 's'} from ${removed} inbox${removed === 1 ? '' : 'es'}.`);
      setBulkRecall(false); setPicked(new Set()); setSelecting(false);
      await load();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Could not recall those');
    }
  };

  const visibleHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return recent;
    return recent.filter(
      (n) => n.title.toLowerCase().includes(q) || n.message.toLowerCase().includes(q) || n.type.toLowerCase().includes(q)
    );
  }, [recent, historySearch]);

  const paged = usePaged(visibleHistory, 9);

  const filteredPeople = useMemo(() => {
    const q = peopleSearch.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => p.name.toLowerCase().includes(q));
  }, [people, peopleSearch]);

  /* Stats describe the broadcasts below, not the whole notifications table. */
  const broadcastStats = useMemo(() => {
    const delivered = recent.reduce((sum, b) => sum + b.recipients, 0);
    const read = recent.reduce((sum, b) => sum + b.readCount, 0);
    return {
      count: recent.length,
      delivered,
      readRate: delivered > 0 ? Math.round((read / delivered) * 100) : null,
    };
  }, [recent]);

  // "5m ago" counted from when the page opened (a lazy initialiser keeps render pure).
  const [renderedAt] = useState(() => Date.now());
  const timeAgo = (iso: string) => {
    const mins = Math.floor((renderedAt - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="space-y-4">
      {/* Announcements and Events are one section for the admin, because they
          answer the same question — what has the gym told its members. The
          *records* stay in two tables: an announcement is a message with no
          date, an event is a date with a message. Merging them would give every
          announcement a nullable date and every event a nullable audience, and
          the form would ask questions that do not apply to what is being
          written. */}
      <SectionTabs tabs={COMMS_TABS} />
      <PageHeader
        title="Announcements"
        subtitle="Messages sent to members and trainers"
        actions={
          <Button variant="primary" size="sm"
            onClick={() => { setForm(EMPTY_FORM); setErrors({}); setStep(0); setShowSendModal(true); }}>
            <Plus size={15} className="mr-1" /> Send announcement
          </Button>
        }
      />

      {/* Scoped to the broadcasts listed below — the labels say so, because a
          read rate over "everything ever" and one over "the last 20 sends" are
          different numbers and only one of them is on this page. */}
      <StatTiles items={[
        { label: 'Recent sends', value: broadcastStats.count, icon: Send },
        { label: 'People reached', value: broadcastStats.delivered.toLocaleString('en-PH'), icon: Users, tone: 'secondary' },
        {
          label: 'Opened',
          // NULL when nothing has been sent — never 0%, which would read as
          // "nobody opened it" rather than "there is nothing to open".
          value: broadcastStats.readRate == null ? '—' : `${broadcastStats.readRate}%`,
          icon: Eye,
        },
      ]} />

      <Section
        title="Sent announcements" icon={Bell} count={recent.length}
        hint="last 20 sends"
        actions={
          <div className="flex items-center gap-2">
            <SearchBox value={historySearch} onChange={setHistorySearch} placeholder="Search sent…" width={200} />
            {recent.length > 0 && !selecting && <Button variant="ghost" size="sm" onClick={() => setSelecting(true)}>Select</Button>}
          </div>
        }
      >
        {selecting && (
          <BulkBar count={picked.size} total={recent.length}
            onAll={() => setPicked(new Set(recent.map((b) => b.key)))}
            onClear={() => setPicked(new Set())}
            onDone={() => { setSelecting(false); setPicked(new Set()); }}
            action={() => setBulkRecall(true)} actionLabel={`Recall ${picked.size || ''}`.trim()} />
        )}
        {visibleHistory.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={recent.length === 0 ? 'Nothing sent yet' : 'No announcement matches that'}
            hint={recent.length === 0
              ? 'An announcement lands in every recipient’s inbox and pushes an alert to installed phones.'
              : 'Try a different search.'}
            action={recent.length === 0
              ? <Button variant="primary" size="sm"
                  onClick={() => { setForm(EMPTY_FORM); setErrors({}); setStep(0); setShowSendModal(true); }}>
                  <Plus size={14} /> Send one
                </Button>
              : undefined}
          />
        ) : (
          <>
            <CardGrid min={320}>
              {paged.visible.map((notif) => {
                const pct = notif.recipients > 0 ? Math.round((notif.readCount / notif.recipients) * 100) : 0;
                return (
                  <TileCard key={notif.key} accent={picked.has(notif.key)}>
                    {selecting && (
                      <label className="flex items-center gap-2 mb-2 text-[11px] font-semibold text-white cursor-pointer">
                        <input type="checkbox" checked={picked.has(notif.key)} onChange={() => togglePick(notif.key)} aria-label={`Select ${notif.title}`} />
                        Select
                      </label>
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-[12px] text-white font-semibold leading-snug flex-1">{notif.title}</h4>
                      <Badge variant="Standard" className="!text-[9px] !px-1.5 !py-0 flex-shrink-0">{notif.type}</Badge>
                    </div>
                    <p className="text-[10px] mt-1 line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>
                      {notif.message}
                    </p>
                    {notif.imageUrl && (
                      <img src={notif.imageUrl} alt="" loading="lazy"
                        className="w-full rounded-lg object-cover mt-2"
                        style={{ aspectRatio: '16 / 9', background: 'var(--color-bg)' }} />
                    )}

                    <div className="flex items-center gap-2 text-[10px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
                      <span>{notif.recipients} {notif.recipients === 1 ? 'recipient' : 'recipients'}</span>
                      <span>·</span>
                      <span>{timeAgo(notif.sentAt)}</span>
                    </div>

                    {/* The number that says whether it landed. "Sent to 40" on
                        its own tells you nothing. */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                        <span className="block h-full rounded-full"
                          style={{ width: `${pct}%`, background: 'var(--color-primary)' }} />
                      </span>
                      <span className="text-[10px] tabular-nums flex-shrink-0"
                        style={{ color: notif.readCount > 0 ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                        {notif.readCount} opened · {pct}%
                      </span>
                    </div>

                    {/* Recall clears it from every inbox. A push that already
                        arrived cannot be taken back, and the dialog says so. */}
                    <button onClick={() => setToRecall(notif)}
                      className="mt-2.5 px-2 h-7 rounded-lg text-[10px] font-semibold"
                      style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                      <Trash2 size={11} className="inline mr-1" />Recall
                    </button>
                  </TileCard>
                );
              })}
            </CardGrid>
            <div className="flex items-center justify-between mt-3">
              <PageSummary page={paged.page} perPage={paged.perPage} total={paged.total} noun="announcements" />
              <Pagination currentPage={paged.page} totalItems={paged.total}
                itemsPerPage={paged.perPage} onPageChange={paged.setPage} />
            </div>
          </>
        )}
      </Section>

      {/* Compose */}
      {createPortal(
        <AnimatePresence>
          {showSendModal && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200]" onClick={() => setShowSendModal(false)} />
              <div className="fixed inset-0 flex items-center justify-center z-[200] p-4">
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
                  style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
                  onClick={(e) => e.stopPropagation()}>
                  <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg font-bold text-white">Send an announcement</h2>
                      <ol className="flex gap-2 mt-2" aria-label="Steps">
                        {STEPS.map((t, i) => (
                          <li key={t} className="flex-1">
                            <div className="h-1 rounded-full" style={{ background: i <= step ? 'var(--color-primary)' : 'var(--color-border)' }} />
                            <p className="text-[11px] mt-1 font-semibold" style={{ color: i === step ? '#fff' : 'var(--color-text-secondary)' }}>{i + 1}. {t}</p>
                          </li>
                        ))}
                      </ol>
                      {/* Spells out both halves, because they behave
                          differently and the difference matters: the inbox row
                          always arrives, the phone alert only reaches people
                          who installed the app and left that category on. */}

                    </div>
                    <button onClick={() => setShowSendModal(false)} className="p-1.5 rounded-lg" style={{ color: 'var(--color-text-muted)' }}>
                      <X size={18} />
                    </button>
                  </div>

                  <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto scrollbar-thin scrollbar-thumb-dark-border">
                    {step === 0 && (<>
                    <SectionLabel>Recipients</SectionLabel>
                    <FormField label="Audience" required error={errors.recipients}>
                      <div className="grid grid-cols-4 gap-2">
                        {(['all_members', 'all_trainers', 'everyone', 'specific', 'free_tier', 'paid', 'plans'] as RecipientType[])
                          .filter((type) => !['free_tier', 'paid', 'plans'].includes(type) || planCounts.free_tier !== null)
                          .map((type) => {
                          const isActive = form.recipientType === type;
                          const Icon = type === 'all_members' ? Users : type === 'all_trainers' ? Dumbbell : type === 'everyone' ? Bell
                            : type === 'free_tier' ? Users : type === 'paid' ? Users : type === 'plans' ? Users : User;
                          const count = type === 'specific' || type === 'plans' ? null
                            : type === 'free_tier' || type === 'paid' ? planCounts[type]
                            : audienceCounts[type as 'all_members' | 'all_trainers' | 'everyone'];
                          return (
                            <button key={type} type="button" onClick={() => setForm({ ...form, recipientType: type })}
                              className="p-2.5 rounded-xl text-[10px] font-semibold transition-all flex flex-col items-center gap-1 text-center"
                              style={{
                                background: isActive ? 'var(--color-primary)' : 'var(--color-bg)',
                                border: `1px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                color: isActive ? '#fff' : 'var(--color-text-secondary)',
                              }}>
                              <Icon size={15} />
                              {AUDIENCE_LABEL[type]}
                              {/* The count you used to only discover after sending. */}
                              {count != null && <span className="opacity-70">{count}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </FormField>

                    {form.recipientType === 'free_tier' && (
                      <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                        Members on your free plan, and members whose paid plan has lapsed. Frozen memberships are left out.
                      </p>
                    )}
                    {form.recipientType === 'plans' && (
                      <div className="flex flex-wrap gap-1.5" data-audience-plans>
                        {plans.map((p) => {
                          const on = form.planIds.includes(p.id);
                          return (
                            <button key={p.id} type="button" aria-pressed={on}
                              onClick={() => setForm({ ...form, planIds: on ? form.planIds.filter((x) => x !== p.id) : [...form.planIds, p.id] })}
                              className="text-[11px] font-semibold rounded-full px-3 py-1.5"
                              style={{ background: on ? 'var(--color-primary)' : 'var(--color-bg)', color: on ? '#fff' : 'var(--color-text-secondary)',
                                border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}` }}>
                              {p.name}
                            </button>
                          );
                        })}
                        <p className="w-full text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Members whose current plan is one of these and is still running.</p>
                      </div>
                    )}

                    {form.recipientType === 'specific' && (
                      <div>
                        <div className="relative mb-1.5">
                          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
                          <input type="text" placeholder="Search people…" value={peopleSearch}
                            onChange={(e) => setPeopleSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 rounded-xl text-white text-xs" style={FIELD_STYLE} />
                        </div>
                        <div className="rounded-xl max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-dark-border" style={FIELD_STYLE}>
                          {filteredPeople.length === 0 ? (
                            <p className="text-[11px] p-3 text-center" style={{ color: 'var(--color-text-muted)' }}>
                              {people.length === 0 ? 'No active members or trainers yet.' : 'Nobody matches that.'}
                            </p>
                          ) : filteredPeople.map((p) => {
                            const checked = form.specificUsers.includes(p.id);
                            return (
                              <label key={p.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/5">
                                <input type="checkbox" checked={checked}
                                  onChange={() => setForm({
                                    ...form,
                                    specificUsers: checked
                                      ? form.specificUsers.filter((id) => id !== p.id)
                                      : [...form.specificUsers, p.id],
                                  })} />
                                <span className="text-[11px] text-white flex-1 truncate">{p.name}</span>
                                <span className="text-[9px] uppercase" style={{ color: 'var(--color-text-muted)' }}>{p.role}</span>
                              </label>
                            );
                          })}
                        </div>
                        <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                          {form.specificUsers.length} selected
                        </p>
                      </div>
                    )}

                    </>)}

                    {step === 1 && (<>
                    <SectionLabel>Start from one</SectionLabel>
                    <div className="flex flex-wrap gap-1.5">
                      {TEMPLATES.map((t) => (
                        <button key={t.label} type="button"
                          onClick={() => setForm({ ...form, notificationType: t.type, title: t.title, message: t.message, actionUrl: t.actionUrl })}
                          className="h-8 px-3 rounded-full text-[11px] font-semibold"
                          style={{ background: form.title === t.title ? 'var(--color-primary-light)' : 'var(--color-bg)',
                            color: form.title === t.title ? '#fff' : 'var(--color-text-secondary)',
                            border: `1px solid ${form.title === t.title ? 'var(--color-primary)' : 'var(--color-border)'}` }}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <FieldDivider />
                    <SectionLabel>Message Content</SectionLabel>
                    <FormField label="Category" hint="Members can mute categories in Settings, so pick honestly.">
                      <select value={form.notificationType}
                        onChange={(e) => setForm({ ...form, notificationType: e.target.value as NotificationType })}
                        className={FIELD_CLASS} style={FIELD_STYLE}>
                        <option value="info">Info</option>
                        <option value="event">Event</option>
                        <option value="system">System</option>
                        <option value="payment">Payment</option>
                        <option value="achievement">Achievement</option>
                      </select>
                    </FormField>

                    <FormField label="Title" required error={errors.title}
                      hint={`${form.title.length}/${TITLE_MAX} — anything longer is cut off in the phone's notification shade.`}>
                      <input value={form.title} maxLength={TITLE_MAX}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        placeholder="e.g. Gym closed this Sunday"
                        className={FIELD_CLASS} style={FIELD_STYLE} />
                    </FormField>

                    <FormField label="Message" required error={errors.message}
                      hint={`${form.message.length}/${MESSAGE_MAX}`}>
                      <textarea value={form.message} maxLength={MESSAGE_MAX} rows={3}
                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                        placeholder="Say what is happening and what they should do."
                        className={`${FIELD_CLASS} resize-none`} style={FIELD_STYLE} />
                    </FormField>

                    <ImageField
                      value={form.imageUrl ?? ''}
                      onChange={(imageUrl) => setForm({ ...form, imageUrl })}
                      kind="announcements"
                      label="Picture"
                      hint="Shown with the announcement in the member's inbox. The phone alert stays text-only."
                    />

                    {/* Was a free-text box asking the admin to type an app route
                        from memory — "/member/events" — with no way to know what
                        routes exist or whether they had spelled one right. The
                        error only appeared after sending. A list of the real
                        destinations removes the question entirely. */}
                    <FormField
                      label="Destination on Tap"
                      error={errors.actionUrl}
                      hint="Optional. Most announcements need no link — pick one only when there is somewhere specific to go."
                    >
                      <select
                        value={form.actionUrl}
                        onChange={(e) => setForm({ ...form, actionUrl: e.target.value })}
                        className={FIELD_CLASS}
                        style={FIELD_STYLE}
                      >
                        {ANNOUNCEMENT_DESTINATIONS.map((d) => (
                          <option key={d.path || 'none'} value={d.path}>{d.label}</option>
                        ))}
                      </select>
                    </FormField>

                    </>)}

                    {/* What it will actually look like, and to whom — the last step
                        is the confirmation: a push cannot be taken back. */}
                    {step === 2 && (
                      <div className="space-y-4">
                        <div className="rounded-xl p-3 text-xs" style={{ background: 'var(--color-primary-light)', color: 'var(--color-text-secondary)' }}>
                          Goes to <b className="text-white">{plannedRecipients} {plannedRecipients === 1 ? 'person' : 'people'}</b>
                          {form.recipientType !== 'specific' ? ` (${AUDIENCE_LABEL[form.recipientType].toLowerCase()})` : ''}.
                          {' '}It lands in each one's in-app inbox and stays there. It also buzzes the phones of people who installed the app
                          and left “{form.notificationType}” notifications on — a buzz cannot be taken back once it arrives.
                        </div>
                        <div>
                          <SectionLabel>On their phone</SectionLabel>
                          <div className="rounded-2xl p-3 flex items-start gap-2.5 mt-2"
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-border)' }}>
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-primary)' }}>
                              <Smartphone size={14} style={{ color: '#fff' }} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[12px] font-bold text-white truncate">{form.title}</p>
                              <p className="text-[11px] line-clamp-2" style={{ color: 'var(--color-text-secondary)' }}>{form.message}</p>
                            </div>
                          </div>
                        </div>
                        <div>
                          <SectionLabel>In their inbox</SectionLabel>
                          <div className="rounded-2xl overflow-hidden mt-2" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                            {form.imageUrl && <img src={form.imageUrl} alt="" className="w-full object-cover" style={{ aspectRatio: '16 / 9' }} />}
                            <div className="p-3">
                              <p className="text-[13px] font-bold text-white">{form.title}</p>
                              <p className="text-[12px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>{form.message}</p>
                              {form.actionUrl && (
                                <p className="text-[11px] mt-2 font-semibold" style={{ color: 'var(--color-primary)' }}>
                                  Tap opens: {ANNOUNCEMENT_DESTINATIONS.find((d) => d.path === form.actionUrl)?.label ?? form.actionUrl}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-5 flex gap-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <Button variant="ghost" className="flex-1" onClick={() => (step > 0 ? setStep(step - 1) : setShowSendModal(false))}>
                      {step > 0 ? 'Back' : 'Cancel'}
                    </Button>
                    {step < 2 ? (
                      <Button variant="secondary" className="flex-1" onClick={() => { if (validate(step)) setStep(step + 1); }}>Next</Button>
                    ) : (
                      <Button variant="secondary" className="flex-1" disabled={sending}
                        onClick={() => { if (validate()) void handleSendNotification(); }}>
                        <Send size={15} className="mr-1.5" />
                        {sending ? 'Sending…' : `Send to ${plannedRecipients} ${plannedRecipients === 1 ? 'person' : 'people'}`}
                      </Button>
                    )}
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      <ConfirmDialog
        isOpen={!!toRecall}
        onClose={() => setToRecall(null)}
        onConfirm={recall}
        title="Recall Announcement"
        message={
          toRecall
            ? `Delete “${toRecall.title}” from ${toRecall.ids.length} inbox${toRecall.ids.length === 1 ? '' : 'es'}? ` +
              `${toRecall.readCount} ${toRecall.readCount === 1 ? 'person has' : 'people have'} already opened it, and any push alert that reached a phone stays there — this only clears the in-app record.`
            : ''
        }
        confirmText="Recall"
        type="danger"
      />

      <ConfirmDialog
        isOpen={bulkRecall}
        onClose={() => setBulkRecall(false)}
        onConfirm={recallMany}
        title={`Recall ${pickedRows.length} announcement${pickedRows.length === 1 ? '' : 's'}`}
        message={`Delete them from ${pickedRows.reduce((n, b) => n + b.ids.length, 0)} inboxes in all. ` +
          `${pickedRows.reduce((n, b) => n + b.readCount, 0)} have already been opened, and push alerts that reached a phone stay there — this only clears the in-app record. It cannot be undone.`}
        confirmText="Recall all of them"
        type="danger"
      />
    </div>
  );
}
