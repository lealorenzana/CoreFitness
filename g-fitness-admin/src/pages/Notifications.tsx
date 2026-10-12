import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bell, Send, Users, User, Dumbbell, Plus, Eye, Smartphone, Info, CalendarDays, Megaphone, Banknote, Trophy,
  Sparkles, CheckSquare, Undo2, UserMinus, CreditCard, Layers,
} from 'lucide-react';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import BulkBar from '../components/ui/BulkBar';
import ImageField from '../components/ui/ImageField';
import {
  RdHeader, RdCard, StatTile, SearchField, RdSelect, RdButton, RdTable, Tr, Td, TableFooter, EmptyBlock, FitBody,
  RailCard, TipCard, IconTile, Initials, RdField,
} from '../components/ui/rd';
import { TONE, RD_INPUT, RD_INPUT_STYLE } from '../components/ui/rdTokens';
import { usePaged } from '../hooks/usePaged';
import { useFitRows } from '../hooks/useFitRows';
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
 *
 * 2026-10-12: fits the screen — the sends as rows with their open rate, quick
 * sends in the rail, and the composer beside a live phone showing exactly what
 * members will see.
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

const SECOND = 'var(--color-text-secondary)';
const MUTED = 'var(--color-text-muted)';
const LINE = '1px solid rgba(255,255,255,0.06)';

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
  all_members: 'All members',
  all_trainers: 'All coaches',
  everyone: 'Everyone',
  specific: 'Pick people',
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

  /** Rows that fit the list's own box — the page never scrolls (2026-10-12). */
  const fit = useFitRows(8);
  const paged = usePaged(visibleHistory, fit.perPage);

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

  const openComposer = (template?: typeof TEMPLATES[number]) => {
    setForm(template ? { ...EMPTY_FORM, notificationType: template.type, title: template.title, message: template.message, actionUrl: template.actionUrl } : EMPTY_FORM);
    setErrors({});
    setStep(0);
    setShowSendModal(true);
  };
  const best = recent.filter((b) => b.recipients > 0).sort((a, b) => b.readCount / b.recipients - a.readCount / a.recipients)[0];
  const TYPE_ICON: Record<string, typeof Bell> = { info: Info, event: CalendarDays, system: Megaphone, payment: Banknote, achievement: Trophy };
  const audiences = (['all_members', 'all_trainers', 'everyone', 'specific', 'free_tier', 'paid', 'plans'] as RecipientType[])
    .filter((type) => !['free_tier', 'paid', 'plans'].includes(type) || planCounts.free_tier !== null);

  /** The member's phone, live: the alert on the lock screen, and the message in their inbox. */
  const phone = (
    <div className="rounded-[28px] p-3 mx-auto w-full max-w-[290px]" data-phone-preview
      style={{ background: 'linear-gradient(180deg, #1B1633, #0F0C1E)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 30px 60px -30px rgba(0,0,0,0.9)' }}>
      <p className="text-center text-[22px] font-semibold text-white mt-2 tabular-nums">9:41</p>
      <p className="text-center text-[11.5px]" style={{ color: MUTED }}>On their lock screen</p>
      <div className="rounded-2xl p-2.5 mt-3 flex items-start gap-2.5" style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}>
        <span className="w-7 h-7 rounded-lg grid place-items-center flex-none" style={{ background: '#7C3AED' }}><Smartphone size={13} style={{ color: '#fff' }} /></span>
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-white truncate">{form.title || 'Your title'}</p>
          <p className="text-[11.5px] line-clamp-2" style={{ color: SECOND }}>{form.message || 'Your message'}</p>
        </div>
      </div>
      <p className="text-center text-[11.5px] mt-4" style={{ color: MUTED }}>In their inbox</p>
      <div className="rounded-2xl overflow-hidden mt-2" style={{ background: '#15112A', border: '1px solid rgba(255,255,255,0.08)' }}>
        {form.imageUrl && <img src={form.imageUrl} alt="" className="w-full object-cover" style={{ aspectRatio: '16 / 9' }} />}
        <div className="p-3">
          <p className="text-[13px] font-semibold text-white">{form.title || 'Your title'}</p>
          <p className="text-[12px] mt-1 leading-snug" style={{ color: SECOND }}>{form.message || 'Say what is happening and what they should do.'}</p>
          {form.actionUrl && (
            <p className="text-[11.5px] mt-2 font-semibold" style={{ color: '#FBBF24' }}>
              Tap opens: {ANNOUNCEMENT_DESTINATIONS.find((d) => d.path === form.actionUrl)?.label ?? form.actionUrl}
            </p>
          )}
        </div>
      </div>
      <p className="text-center text-[11.5px] mt-3 mb-1" style={{ color: MUTED }}>
        To {plannedRecipients} {plannedRecipients === 1 ? 'person' : 'people'}
      </p>
    </div>
  );

  const rail = (
    <>
      <RailCard icon={Sparkles} title="Quick send" sub="Start from a message — fill in the [brackets], check, send.">
        {TEMPLATES.map((t) => {
          const Icon = TYPE_ICON[t.type] ?? Bell;
          return (
            <button key={t.label} type="button" onClick={() => openComposer(t)} aria-label={`Quick send: ${t.label}`}
              className="h-12 px-3 rounded-xl flex items-center gap-3 text-left text-[14px] text-white transition-colors hover:bg-white/[0.04]"
              style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.015)' }} data-quick-send={t.label}>
              <Icon size={17} style={{ color: '#C4B5FD' }} className="flex-none" />
              <span className="flex-1 truncate">{t.label}</span>
            </button>
          );
        })}
      </RailCard>
      <TipCard title="Inbox and phone">
        The message always lands in each person&rsquo;s inbox in the app. It also buzzes the phones of people who installed the app and left
        that kind on — a buzz cannot be taken back, so Recall only clears the inbox.
      </TipCard>
    </>
  );

  return (
    <div className="rd-fit" data-announcements>
      {/* Announcements and Events are one section — what the gym has told its members. The records stay
          in two tables: an announcement is a message with no date, an event is a date with a message. */}
      <RdHeader title="Announcements" subtitle="Tell your members and coaches what is happening — in their inbox and on their phone."
        tabs={COMMS_TABS}
        actions={<RdButton variant="primary" icon={Send} onClick={() => openComposer()}>Send announcement</RdButton>} />

      {/* Scoped to the sends listed below — a read rate over "everything ever" is a different number. */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <StatTile compact icon={Send} label="Recent sends" value={broadcastStats.count} sub="the last 20" />
        <StatTile compact icon={Users} label="People reached" value={broadcastStats.delivered.toLocaleString('en-PH')} sub="inboxes written" />
        {/* NULL when nothing has been sent — never 0%, which would read as "nobody opened it". */}
        <StatTile compact icon={Eye} label="Opened" value={broadcastStats.readRate == null ? '—' : `${broadcastStats.readRate}%`} sub="of everyone reached" />
        <StatTile compact icon={Trophy} tone="amber" label="Best opened" value={best ? `${Math.round((best.readCount / best.recipients) * 100)}%` : '—'}
          sub={best ? best.title : 'nothing sent yet'} />
      </div>

      <FitBody rail={rail}>
        <RdCard className="overflow-hidden rd-fit-fill" data-sent>
          <div className="flex items-center gap-3 flex-wrap px-4 py-3" style={{ borderBottom: LINE }}>
            <Bell size={18} style={{ color: '#C4B5FD' }} />
            <h2 className="text-[16px] font-semibold text-white">Sent announcements</h2>
            <span className="text-[12.5px]" style={{ color: MUTED }}>last 20 sends</span>
            <span className="flex-1" />
            <div className="w-[240px]"><SearchField value={historySearch} onChange={setHistorySearch} placeholder="Search sent" label="Search sent announcements" /></div>
            {recent.length > 0 && !selecting && <RdButton size="sm" variant="ghost" icon={CheckSquare} onClick={() => setSelecting(true)}>Select</RdButton>}
          </div>
          {selecting && (
            <div className="px-4 pt-3">
              <BulkBar count={picked.size} total={recent.length}
                onAll={() => setPicked(new Set(recent.map((b) => b.key)))}
                onClear={() => setPicked(new Set())}
                onDone={() => { setSelecting(false); setPicked(new Set()); }}
                action={() => setBulkRecall(true)} actionLabel={`Recall ${picked.size || ''}`.trim()} />
            </div>
          )}
          <RdTable boxRef={fit.ref} head={[...(selecting ? [''] : []), 'Announcement', 'Sent to', 'Opened', { label: '', align: 'right' }]}
            empty={visibleHistory.length === 0 ? (
              <EmptyBlock icon={Bell} compact
                title={recent.length === 0 ? 'Nothing sent yet' : 'No announcement matches that'}
                body={recent.length === 0 ? 'An announcement lands in every recipient’s inbox and pushes an alert to installed phones.' : 'Try a different search.'}
                action={recent.length === 0 ? <RdButton variant="primary" icon={Plus} onClick={() => openComposer()}>Send one</RdButton> : undefined} />
            ) : undefined}>
            {paged.visible.map((notif) => {
              const pct = notif.recipients > 0 ? Math.round((notif.readCount / notif.recipients) * 100) : 0;
              const Icon = TYPE_ICON[notif.type] ?? Bell;
              return (
                <Tr key={notif.key} style={{ height: visibleHistory.length > paged.perPage ? fit.rowHeight : undefined, background: picked.has(notif.key) ? 'rgba(124,58,237,0.08)' : undefined }} data-sent-row>
                  {selecting && (
                    <Td className="w-10">
                      <input type="checkbox" className="accent-violet-500" checked={picked.has(notif.key)} onChange={() => togglePick(notif.key)} aria-label={`Select ${notif.title}`} />
                    </Td>
                  )}
                  <Td>
                    <span className="flex items-center gap-3 min-w-0">
                      {notif.imageUrl
                        ? <img src={notif.imageUrl} alt="" className="w-10 h-10 rounded-xl object-cover flex-none" />
                        : <IconTile icon={Icon} size={40} tone={notif.type === 'payment' || notif.type === 'event' ? 'amber' : 'violet'} />}
                      <span className="min-w-0 max-w-[420px]">
                        <span className="block font-semibold text-white truncate">{notif.title}</span>
                        <span className="block text-[12.5px] truncate" style={{ color: MUTED }}>{notif.message}</span>
                      </span>
                    </span>
                  </Td>
                  <Td>
                    <span className="block whitespace-nowrap text-white">{notif.recipients} {notif.recipients === 1 ? 'person' : 'people'}</span>
                    <span className="block text-[12px] whitespace-nowrap" style={{ color: MUTED }}>{timeAgo(notif.sentAt)} — {notif.type}</span>
                  </Td>
                  <Td>
                    {/* The number that says whether it landed. */}
                    <span className="flex items-center gap-2 w-[150px]">
                      <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#6D28D9,#8B5CF6)' }} />
                      </span>
                      <span className="text-[12.5px] tabular-nums w-10 text-right" style={{ color: notif.readCount > 0 ? '#C4B5FD' : MUTED }}>{pct}%</span>
                    </span>
                    <span className="block text-[12px] mt-0.5" style={{ color: MUTED }}>{notif.readCount} opened</span>
                  </Td>
                  <Td align="right">
                    {/* Recall clears it from every inbox; a push that already arrived stays, and the dialog says so. */}
                    <button type="button" onClick={() => setToRecall(notif)} aria-label={`Recall ${notif.title}`} data-tip="Recall — clears it from every inbox"
                      className="w-9 h-9 rounded-xl grid place-items-center hover:bg-white/[0.06]" style={{ color: TONE.amber.fg, border: '1px solid rgba(255,255,255,0.1)' }}>
                      <Undo2 size={15} />
                    </button>
                  </Td>
                </Tr>
              );
            })}
          </RdTable>
          <TableFooter page={paged.page} perPage={paged.perPage} total={paged.total} noun="announcements" onPage={paged.setPage} />
        </RdCard>
      </FitBody>

      {/* Compose: the steps on the left, the member's phone on the right, live. */}
      <Modal isOpen={showSendModal} onClose={() => setShowSendModal(false)} size="lg" title="Send an announcement"
        subtitle="It lands in each person's inbox, and buzzes the phones of people who left that kind on."
        footer={<>
          <RdButton variant="ghost" onClick={() => (step > 0 ? setStep(step - 1) : setShowSendModal(false))}>{step > 0 ? 'Back' : 'Cancel'}</RdButton>
          {step < 2 ? (
            <RdButton variant="primary" onClick={() => { if (validate(step)) setStep(step + 1); }}>Next</RdButton>
          ) : (
            <RdButton variant="amber" icon={Send} disabled={sending} onClick={() => { if (validate()) void handleSendNotification(); }}>
              {sending ? 'Sending…' : `Send to ${plannedRecipients} ${plannedRecipients === 1 ? 'person' : 'people'}`}
            </RdButton>
          )}
        </>}>
        <ol className="flex gap-2 mb-4" aria-label="Steps">
          {STEPS.map((t, i) => (
            <li key={t} className="flex-1">
              <div className="h-1 rounded-full" style={{ background: i <= step ? '#8B5CF6' : 'rgba(255,255,255,0.1)' }} />
              <p className="text-[12px] mt-1 font-semibold" style={{ color: i === step ? '#fff' : SECOND }}>{i + 1}. {t}</p>
            </li>
          ))}
        </ol>
        <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)' }}>
          <div className="min-w-0 space-y-4">
            {step === 0 && (<>
              <div>
                <span className="block text-[13px] font-semibold text-white mb-1.5">Who gets it</span>
                <div className="grid grid-cols-3 gap-2">
                  {audiences.map((type) => {
                    const isActive = form.recipientType === type;
                    const Icon = type === 'all_members' ? Users : type === 'all_trainers' ? Dumbbell : type === 'everyone' ? Bell
                      : type === 'free_tier' ? UserMinus : type === 'paid' ? CreditCard : type === 'plans' ? Layers : User;
                    const count = type === 'specific' || type === 'plans' ? null
                      : type === 'free_tier' || type === 'paid' ? planCounts[type]
                      : audienceCounts[type as 'all_members' | 'all_trainers' | 'everyone'];
                    return (
                      <button key={type} type="button" onClick={() => setForm({ ...form, recipientType: type })} aria-pressed={isActive}
                        className="p-3 rounded-xl text-left transition-colors flex flex-col gap-1"
                        style={isActive ? { background: 'rgba(124,58,237,0.22)', border: '1px solid rgba(139,92,246,0.7)', color: '#EDE9FE' }
                          : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', color: SECOND }}>
                        <Icon size={17} />
                        <span className="text-[13px] font-semibold">{AUDIENCE_LABEL[type]}</span>
                        {/* The count you used to only discover after sending. */}
                        {count != null && <span className="text-[12px] tabular-nums" style={{ color: MUTED }}>{count} people</span>}
                      </button>
                    );
                  })}
                </div>
                {errors.recipients && <p className="text-[12.5px] mt-1.5" style={{ color: TONE.amber.fg }}>{errors.recipients}</p>}
              </div>
              {form.recipientType === 'free_tier' && (
                <p className="text-[12.5px]" style={{ color: MUTED }}>Members on your free plan, and members whose paid plan has lapsed. Frozen memberships are left out.</p>
              )}
              {form.recipientType === 'plans' && (
                <div className="flex flex-wrap gap-1.5" data-audience-plans>
                  {plans.map((p) => {
                    const on = form.planIds.includes(p.id);
                    return (
                      <button key={p.id} type="button" aria-pressed={on}
                        onClick={() => setForm({ ...form, planIds: on ? form.planIds.filter((x) => x !== p.id) : [...form.planIds, p.id] })}
                        className="text-[12.5px] font-semibold rounded-full px-3 h-8"
                        style={on ? { background: 'rgba(124,58,237,0.22)', color: '#EDE9FE', border: '1px solid rgba(139,92,246,0.7)' } : { color: SECOND, border: '1px solid rgba(255,255,255,0.1)' }}>
                        {p.name}
                      </button>
                    );
                  })}
                  <p className="w-full text-[12.5px]" style={{ color: MUTED }}>Members whose current plan is one of these and is still running.</p>
                </div>
              )}
              {form.recipientType === 'specific' && (
                <div>
                  <SearchField value={peopleSearch} onChange={setPeopleSearch} placeholder="Search people" />
                  <div className="rounded-xl max-h-48 overflow-y-auto mt-2" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                    {filteredPeople.length === 0 ? (
                      <p className="text-[12.5px] p-3 text-center" style={{ color: MUTED }}>{people.length === 0 ? 'No active members or coaches yet.' : 'Nobody matches that.'}</p>
                    ) : filteredPeople.map((p) => {
                      const checked = form.specificUsers.includes(p.id);
                      return (
                        <label key={p.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-white/5">
                          <input type="checkbox" className="accent-violet-500" checked={checked}
                            onChange={() => setForm({ ...form, specificUsers: checked ? form.specificUsers.filter((id) => id !== p.id) : [...form.specificUsers, p.id] })} />
                          <Initials name={p.name} size={26} />
                          <span className="text-[13px] text-white flex-1 truncate">{p.name}</span>
                          <span className="text-[12px] capitalize" style={{ color: MUTED }}>{p.role === 'trainer' ? 'coach' : p.role}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[12px] mt-1" style={{ color: MUTED }}>{form.specificUsers.length} selected</p>
                </div>
              )}
            </>)}

            {step === 1 && (<>
              <div>
                <span className="block text-[13px] font-semibold text-white mb-1.5">Start from one</span>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATES.map((t) => (
                    <button key={t.label} type="button"
                      onClick={() => setForm({ ...form, notificationType: t.type, title: t.title, message: t.message, actionUrl: t.actionUrl })}
                      className="h-8 px-3 rounded-full text-[12.5px] font-semibold"
                      style={form.title === t.title ? { background: 'rgba(124,58,237,0.22)', color: '#EDE9FE', border: '1px solid rgba(139,92,246,0.7)' } : { color: SECOND, border: '1px solid rgba(255,255,255,0.1)' }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <RdField label="Kind" hint="Members can mute kinds in Settings, so pick honestly.">
                <RdSelect label="Kind" value={form.notificationType} onChange={(v) => setForm({ ...form, notificationType: v as NotificationType })} className="w-full">
                  <option value="info">Info</option>
                  <option value="event">Event</option>
                  <option value="system">Gym notice</option>
                  <option value="payment">Payment</option>
                  <option value="achievement">Achievement</option>
                </RdSelect>
              </RdField>
              <RdField label={`Title — ${form.title.length}/${TITLE_MAX}`} hint="Longer is cut off in the phone's notification shade.">
                <input value={form.title} maxLength={TITLE_MAX} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Gym closed this Sunday" aria-label="Title" className={RD_INPUT} style={RD_INPUT_STYLE} />
              </RdField>
              {errors.title && <p className="text-[12.5px] -mt-2" style={{ color: TONE.amber.fg }}>{errors.title}</p>}
              <RdField label={`Message — ${form.message.length}/${MESSAGE_MAX}`}>
                <textarea value={form.message} maxLength={MESSAGE_MAX} rows={3} onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Say what is happening and what they should do." aria-label="Message" className={`${RD_INPUT} h-auto py-2.5 resize-none`} style={RD_INPUT_STYLE} />
              </RdField>
              {errors.message && <p className="text-[12.5px] -mt-2" style={{ color: TONE.amber.fg }}>{errors.message}</p>}
              <ImageField value={form.imageUrl ?? ''} onChange={(imageUrl) => setForm({ ...form, imageUrl })} kind="announcements"
                label="Picture" hint="Shown with the announcement in the member's inbox. The phone alert stays text-only." />
              {/* A list of the real destinations — the old free-text path was only checked after sending to everyone. */}
              <RdField label="When they tap it" hint="Optional. Most announcements need no link.">
                <RdSelect label="When they tap it" value={form.actionUrl ?? ''} onChange={(v) => setForm({ ...form, actionUrl: v })} className="w-full">
                  {ANNOUNCEMENT_DESTINATIONS.map((d) => <option key={d.path || 'none'} value={d.path}>{d.label}</option>)}
                </RdSelect>
              </RdField>
              {errors.actionUrl && <p className="text-[12.5px]" style={{ color: TONE.amber.fg }}>{errors.actionUrl}</p>}
            </>)}

            {/* The last step is the confirmation: a push cannot be taken back. */}
            {step === 2 && (
              <div className="space-y-3">
                <div className="rounded-xl p-3.5 text-[13.5px] leading-relaxed" style={{ background: TONE.violet.bg, border: `1px solid ${TONE.violet.line}`, color: '#DDD6FE' }}>
                  Goes to <b className="text-white">{plannedRecipients} {plannedRecipients === 1 ? 'person' : 'people'}</b>
                  {form.recipientType !== 'specific' ? ` (${AUDIENCE_LABEL[form.recipientType].toLowerCase()})` : ''}.
                  {' '}It lands in each one&rsquo;s in-app inbox and stays there. It also buzzes the phones of people who installed the app and left
                  &ldquo;{form.notificationType}&rdquo; notifications on — a buzz cannot be taken back once it arrives.
                </div>
                <p className="text-[13px]" style={{ color: SECOND }}>The phone on the right is exactly what they will see.</p>
              </div>
            )}
          </div>
          <div className="min-w-0">{phone}</div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!toRecall}
        onClose={() => setToRecall(null)}
        onConfirm={recall}
        title="Recall announcement"
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
