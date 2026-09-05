import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import {
  Bell, Send, Users, User, Dumbbell, Plus, X, Search, Eye, Trash2, Smartphone,
} from 'lucide-react';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Pagination from '../components/ui/Pagination';
import {
  PageHeader, StatTiles, Section, EmptyState, CardGrid, TileCard, SearchBox, PageSummary,
} from '../components/ui/kit';
import { usePaged } from '../hooks/usePaged';
import FormField, { SectionLabel, FieldDivider } from '../components/ui/FormField';
import { showSuccessToast, showErrorToast } from '../utils/toast';
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
  notificationType: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
}

const EMPTY_FORM: NotificationForm = {
  recipientType: 'all_members',
  specificUsers: [],
  notificationType: 'info',
  title: '',
  message: '',
  actionUrl: '',
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

const AUDIENCE_LABEL: Record<RecipientType, string> = {
  all_members: 'All Members',
  all_trainers: 'All Trainers',
  everyone: 'Everyone',
  specific: 'Pick People',
};

export default function Notifications() {
  const [showSendModal, setShowSendModal] = useState(false);
  const [form, setForm] = useState<NotificationForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);

  const [recent, setRecent] = useState<BroadcastSummary[]>([]);
  const [people, setPeople] = useState<Recipient[]>([]);
  const [peopleSearch, setPeopleSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [audienceCounts, setAudienceCounts] = useState<Record<string, number>>({});
  const [toRecall, setToRecall] = useState<BroadcastSummary | null>(null);

  const load = useCallback(async () => {
    try {
      const [broadcasts, { data: profiles }, members, trainers, everyone] = await Promise.all([
        listRecentBroadcasts(),
        supabase.from('profiles').select('id, first_name, last_name, role')
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

  useEffect(() => { load(); }, [load]);

  /** How many this send will reach, known before the button is pressed. */
  const plannedRecipients =
    form.recipientType === 'specific'
      ? form.specificUsers.length
      : audienceCounts[form.recipientType] ?? 0;

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = 'Required.';
    if (!form.message.trim()) next.message = 'Required.';
    if (form.recipientType === 'specific' && form.specificUsers.length === 0) {
      next.recipients = 'Pick at least one person.';
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
        type: form.notificationType,
        title: form.title.trim(),
        message: form.message.trim(),
        actionUrl: form.actionUrl?.trim() || null,
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
      setConfirmSend(false);
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

  const timeAgo = (iso: string) => {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        subtitle="Announcements to members and trainers"
        actions={
          <Button variant="primary" size="sm"
            onClick={() => { setForm(EMPTY_FORM); setErrors({}); setShowSendModal(true); }}>
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
        actions={<SearchBox value={historySearch} onChange={setHistorySearch} placeholder="Search sent…" width={200} />}
      >
        {visibleHistory.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={recent.length === 0 ? 'Nothing sent yet' : 'No announcement matches that'}
            hint={recent.length === 0
              ? 'An announcement lands in every recipient’s inbox and pushes an alert to installed phones.'
              : 'Try a different search.'}
            action={recent.length === 0
              ? <Button variant="primary" size="sm"
                  onClick={() => { setForm(EMPTY_FORM); setErrors({}); setShowSendModal(true); }}>
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
                  <TileCard key={notif.key}>
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-[12px] text-white font-semibold leading-snug flex-1">{notif.title}</h4>
                      <Badge variant="Standard" className="!text-[9px] !px-1.5 !py-0 flex-shrink-0">{notif.type}</Badge>
                    </div>
                    <p className="text-[10px] mt-1 line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>
                      {notif.message}
                    </p>

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
                    <div>
                      <h2 className="text-lg font-bold text-white">Send Announcement</h2>
                      {/* Spells out both halves, because they behave
                          differently and the difference matters: the inbox row
                          always arrives, the phone alert only reaches people
                          who installed the app and left that category on. */}
                      <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                        Two things happen. It lands in each person's in-app inbox — always, and it
                        stays there until they clear it. It also buzzes their phone, but only for
                        people who installed the app and have not muted this category.
                      </p>
                    </div>
                    <button onClick={() => setShowSendModal(false)} className="p-1.5 rounded-lg" style={{ color: 'var(--color-text-muted)' }}>
                      <X size={18} />
                    </button>
                  </div>

                  <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto scrollbar-thin scrollbar-thumb-dark-border">
                    <SectionLabel>Who gets it</SectionLabel>
                    <FormField label="Audience" required error={errors.recipients}>
                      <div className="grid grid-cols-4 gap-2">
                        {(['all_members', 'all_trainers', 'everyone', 'specific'] as RecipientType[]).map((type) => {
                          const isActive = form.recipientType === type;
                          const Icon = type === 'all_members' ? Users : type === 'all_trainers' ? Dumbbell : type === 'everyone' ? Bell : User;
                          const count = type === 'specific' ? null : audienceCounts[type];
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

                    <FieldDivider />
                    <SectionLabel>The message</SectionLabel>
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

                    {/* Was a free-text box asking the admin to type an app route
                        from memory — "/member/events" — with no way to know what
                        routes exist or whether they had spelled one right. The
                        error only appeared after sending. A list of the real
                        destinations removes the question entirely. */}
                    <FormField
                      label="When they tap it, open"
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

                    {/* What it will actually look like. Composing blind into a box
                        is how a title gets written that the shade truncates. */}
                    {(form.title || form.message) && (
                      <>
                        <FieldDivider />
                        <SectionLabel>Preview</SectionLabel>
                        <div className="rounded-xl p-3 flex items-start gap-2.5"
                          style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: 'var(--color-primary)' }}>
                            <Smartphone size={13} style={{ color: '#fff' }} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold text-white truncate">{form.title || 'Title'}</p>
                            <p className="text-[10px] line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>
                              {form.message || 'Message'}
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="p-5 flex gap-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <Button variant="ghost" className="flex-1" onClick={() => setShowSendModal(false)}>Cancel</Button>
                    <Button variant="secondary" className="flex-1"
                      onClick={() => { if (validate()) setConfirmSend(true); }}>
                      <Send size={15} className="mr-1.5" />
                      Review &amp; send
                    </Button>
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* A broadcast leaves the building and cannot be un-pushed, so it gets a
          confirmation with the real headcount on it. */}
      <ConfirmDialog
        isOpen={confirmSend}
        onClose={() => setConfirmSend(false)}
        onConfirm={handleSendNotification}
        title="Send this announcement?"
        message={
          `“${form.title.trim()}” goes to ${plannedRecipients} ${plannedRecipients === 1 ? 'person' : 'people'} ` +
          `(${AUDIENCE_LABEL[form.recipientType]}). It lands in their inbox and pushes an alert to any installed phone. ` +
          `You can remove it from their inboxes afterwards, but a push that has already arrived cannot be taken back.` +
          (sending ? ' Sending…' : '')
        }
        confirmText={sending ? 'Sending…' : 'Send it'}
        type="warning"
      />

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
    </div>
  );
}
