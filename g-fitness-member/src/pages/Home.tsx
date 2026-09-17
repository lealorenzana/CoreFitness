import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Barbell, ChatTeardropDots, Lock } from '@phosphor-icons/react';
import { SkeletonList } from '../components/ui/Skeleton';
import { Page } from '../components/ui/page';
import { Eyebrow, NocButton, Panel, ProgressBar, StatusPill } from '../components/ui/noc';
import CheckInSheet from '../components/ui/CheckInSheet';
import WeekMarks from '../components/ui/WeekMarks';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { useLiveData } from '../hooks/useLiveData';
import { useFeatures } from '../hooks/useFeatures';
import { isEnabled } from '../lib/api/planFeatures';
import { membershipTerm } from '../utils/membershipTerm';
import { getCurrentMemberId } from '../services/bookingService';
import {
  getMemberHome, getTodayExtras, type MemberHome, type TodayExtras,
} from '../services/memberHomeService';
import { DAY_LABELS } from '../lib/api/gymPlans';
import { readCache, writeCache } from '../lib/pageCache';

/** Cache slots for this screen — see lib/pageCache.ts. */
const CACHE_KEY = 'member:home';
const EXTRAS_KEY = 'member:home:extras';


/**
 * Is this timestamp on today's local calendar day?
 *
 * Compared component by component in local time, never by slicing an ISO
 * string. Manila is UTC+8, so `toISOString()` reports yesterday's date for the
 * first eight hours of every local day — the shift that once hid every pre-8am
 * check-in from the admin Attendance page.
 */
function isToday(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** '21:00:00' → '9 PM', '21:30' → '9:30 PM'. */
function hourLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

interface Entry {
  key: string;
  gutter: string;
  /** The row happening now gets the lit dot. */
  live?: boolean;
  title: string;
  titleMuted?: boolean;
  meta?: string;
  pill?: { label: string; tone: 'structure' | 'action' | 'muted' };
  action?: string;
  onClick?: () => void;
}

/**
 * Today — the member's day as an agenda (Nocturne redesign, 2026-09-16).
 *
 * Replaces the violet membership card, which spent ~280px restating a date. The
 * plan and its term are one line in the month panel now; the day is the page.
 *
 * **Nothing here is invented, and that took undoing the prototype.** Its month
 * panel read "7 of 12 sessions" — a visit count over a challenge target that
 * may count workouts, not visits. Here the numeral is visits this month, and a
 * joined challenge draws its *own* server-computed progress beneath it, so no
 * figure is divided by something it was not counted against. "Twenty points
 * added" became the `checkin` rule's real value, shown only when the plan earns
 * points at all. "Open until 9 PM" is `gym_settings`, or it is not said.
 *
 * Every state the old Home handled is still here: frozen (the countdown is
 * untrue while frozen, 0057), cancelled-but-usable, expired, expiring soon, a
 * plan that holds features back, an unread coach note, and the training plan.
 */
export default function Home() {
  const navigate = useNavigate();
  // A button to a feature this plan lacks still shows — gates lock and explain,
  // never hide — but carries a lock, so it is a door marked locked rather than
  // bait (the objection 0059 raised against the old chat head). Unknown while
  // loading, and unknown is drawn as open rather than flashing a lock.
  const { features } = useFeatures();
  const lockedOut = (key: 'workout_tracker' | 'ai_model') => features != null && !isEnabled(features, key);

  const cached = readCache<MemberHome>(CACHE_KEY);
  const [home, setHome] = useState<MemberHome | null>(cached ?? null);
  const [extras, setExtras] = useState<TodayExtras | null>(() => readCache<TodayExtras>(EXTRAS_KEY) ?? null);
  const [loading, setLoading] = useState(cached === undefined);
  const [checkInOpen, setCheckInOpen] = useState(false);

  /** `quiet` = a background refresh: no skeleton flash, no toast on a blip. */
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const id = await getCurrentMemberId();
      if (!id) {
        if (!quiet) toast.error('Your session could not be verified. Please sign in again.');
        return;
      }
      // The card data first, so the page paints; the agenda's extras follow.
      setHome(writeCache(CACHE_KEY, await getMemberHome(id)));
      setExtras(writeCache(EXTRAS_KEY, await getTodayExtras(id)));
    } catch (err) {
      if (!quiet) toast.error(errorMessage(err, 'Could not load your day'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const revisit = useRef(cached !== undefined);
  useEffect(() => { void load(revisit.current); }, [load]);
  useLiveData(() => load(true));

  if (loading || !home) {
    return <Page><SkeletonList /></Page>;
  }

  const now = new Date();
  const term = membershipTerm(home.daysLeft, home.neverExpires);
  const plan = home.planName;
  const shortDate = (key: string) =>
    new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // ── The month panel's right-hand line: the membership, in one sentence ──
  const membershipLine = home.frozen
    ? 'Frozen · your days are kept'
    : home.expired
      ? (plan && home.expiryDate ? `${plan} expired` : 'No active membership')
      : term.kind === 'unlimited'
        ? `${plan ?? 'Your plan'} · no expiry`
        : home.cancelled && home.expiryDate
          ? `Cancelled · access to ${shortDate(home.expiryDate)}`
          : term.value === 'Today'
            ? `Last day of ${plan ?? 'your plan'}`
            : `${term.value} ${term.unit} left on ${plan ?? 'your plan'}`.replace(/\s+/g, ' ');

  // ── Week marks ──
  const planned = extras?.plannedDays ?? null;
  const today = home.todayIndex;
  const nextPlanned = planned && planned.length > 0 && !planned.includes(today)
    ? [...planned].sort((a, b) => ((a - today + 7) % 7) - ((b - today + 7) % 7))[0]
    : null;

  // ── The agenda ──
  const entries: Entry[] = [];

  if (home.frozen) {
    entries.push({
      key: 'now', gutter: 'Now', live: true,
      title: 'Membership frozen',
      meta: 'You cannot check in or book while it is frozen, and the days you have left are kept. Ask the front desk to start it again.',
    });
  } else if (home.expired) {
    entries.push({
      key: 'now', gutter: 'Now', live: true,
      title: home.expiryDate ? 'Membership expired' : 'No active membership',
      meta: 'Renew at the front desk to check in and book again.',
    });
  } else if (home.checkedInToday) {
    const at = home.checkInAtToday ? ` at ${clock(home.checkInAtToday)}` : '';
    const points = extras?.checkinPoints != null ? `${extras.checkinPoints} points added. ` : '';
    entries.push({
      key: 'now', gutter: 'Now', live: true,
      title: `Checked in${at}`,
      meta: `${points}Have a good session.`,
      // Not "show my code again": the sheet refuses a live code to someone
      // already checked in, so that label would promise what the tap won't do.
      action: 'See your check-in', onClick: () => setCheckInOpen(true),
    });
  } else {
    const bookedToday = home.nextBooking?.startsAt && isToday(home.nextBooking.startsAt);
    const open = extras?.closingTime ? `The floor is open until ${hourLabel(extras.closingTime)}.` : '';
    const booked = bookedToday ? '' : ' Nothing booked today.';
    entries.push({
      key: 'now', gutter: 'Now', live: true,
      title: 'Not checked in yet',
      meta: `${open}${booked}`.trim() || undefined,
      action: 'Show my code', onClick: () => setCheckInOpen(true),
    });
  }

  if (planned?.includes(today) && !home.checkedInToday && !home.frozen && !home.expired) {
    entries.push({
      key: 'plan', gutter: 'Today',
      title: 'Training day',
      meta: extras?.remindAt ? `You planned to train at ${hourLabel(extras.remindAt)}` : 'You planned to train today',
      onClick: () => navigate('/member/gym-plan'),
    });
  }

  if (home.unreadCoachNote) {
    const n = home.unreadCoachNote;
    entries.push({
      key: 'coach', gutter: 'New',
      title: n.count === 1 ? `A note from ${n.from ?? 'your coach'}` : `${n.count} new coach notes`,
      meta: n.title,
      action: 'Read', onClick: () => navigate('/member/progress?tab=feedback'),
    });
  }

  const b = home.nextBooking;
  if (b?.startsAt) {
    const more = home.upcomingCount > 1 ? ` · ${home.upcomingCount - 1} more booked` : '';
    entries.push({
      key: 'booking',
      gutter: isToday(b.startsAt) ? 'Today' : new Date(b.startsAt).toLocaleDateString('en-US', { weekday: 'short' }),
      title: `${b.title} · ${clock(b.startsAt)}`,
      meta: `${b.subtitle ?? ''}${more}`.replace(/^ · /, '') || undefined,
      pill: b.status === 'pending' ? { label: 'Awaiting approval', tone: 'structure' } : undefined,
      onClick: () => navigate('/member/booking-history'),
    });
  }

  if (home.nextEvent) {
    const e = home.nextEvent;
    entries.push({
      key: 'event',
      gutter: new Date(e.startsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      title: e.title,
      meta: [clock(e.startsAt), e.location].filter(Boolean).join(' · '),
      action: 'See event', onClick: () => navigate('/member/events'),
    });
  }

  const c = extras?.challenge;
  if (!b) {
    entries.push({
      key: 'end', gutter: 'Later',
      title: 'Nothing booked',
      meta: 'Group classes and 1-on-1 sessions are on Train.',
      action: home.frozen || home.expired ? undefined : 'Book',
      onClick: home.frozen || home.expired ? undefined : () => navigate('/member/book-class'),
    });
  } else {
    entries.push({
      key: 'end', gutter: 'Later', titleMuted: true,
      title: 'Nothing after this',
      meta: c && c.progress < c.target
        ? `${c.target - c.progress} more would finish ${c.title}.`
        : undefined,
    });
  }

  return (
    <Page>
      {/* ── Month panel ── */}
      <div className="flex flex-col" style={{ gap: 10 }}>
        <Panel glow="structure" style={{ padding: '16px 16px 14px' }}>
          <div className="flex items-end justify-between" style={{ gap: 12 }}>
            <div>
              <Eyebrow>{now.toLocaleDateString('en-US', { month: 'long' })}</Eyebrow>
              <p className="flex items-baseline" style={{ gap: 6, marginTop: 6 }}>
                <span style={{
                  fontSize: 'var(--text-hero)', fontWeight: 500, lineHeight: 1,
                  letterSpacing: 'var(--tracking-hero)', color: 'var(--color-text-primary)',
                }}>
                  {home.checkInsThisMonth}
                </span>
                <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
                  {home.checkInsThisMonth === 1 ? 'visit' : 'visits'} this month
                </span>
              </p>
            </div>
            <div className="text-right min-w-0">
              {extras?.unreadCount != null && (
                <button onClick={() => navigate('/member/notifications')}
                  style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  {extras.unreadCount === 0
                    ? 'No updates'
                    : `${extras.unreadCount} ${extras.unreadCount === 1 ? 'update' : 'updates'}`}
                </button>
              )}
              <p style={{ fontSize: 12, marginTop: 3, color: 'var(--color-text-muted)' }}>{membershipLine}</p>
            </div>
          </div>

          {/* Drawn only when a joined challenge has a real target and a real
              count — the same rule as a ring with no denominator. */}
          {c && (
            <button onClick={() => navigate('/member/challenges')} className="w-full text-left block" style={{ marginTop: 14 }}>
              <ProgressBar fraction={c.progress / c.target} />
              <span className="flex justify-between" style={{ marginTop: 7, gap: 12, fontSize: 12 }}>
                <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>{c.title}</span>
                <span className="flex-none" style={{ color: 'var(--color-primary-300)' }}>{c.progress} of {c.target}</span>
              </span>
            </button>
          )}
        </Panel>

        {/* What the plan holds back — one line, and the screen that lists it. */}
        {home.access && !home.access.isFullAccess && !home.frozen && (
          <button onClick={() => navigate('/member/membership')}
            className="w-full flex items-center justify-between text-left" style={{ gap: 12, fontSize: 12.5 }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>
              {home.access.excluded.length === 1
                ? `${home.access.excluded[0]} is not on this plan`
                : `${home.access.excluded.length} things are not on this plan`}
            </span>
            <span className="flex-none" style={{ color: 'var(--color-secondary)' }}>See what is included</span>
          </button>
        )}

        {/* Renewal is the one action worth a filled slab — and only when the
            membership is actually ending. Otherwise a member missing half the
            gym still needs a way out of the tier, as an outline. */}
        {(home.expired || home.expiringSoon) && !home.frozen && (
          <NocButton variant={home.expired ? 'fill' : 'action'} onClick={() => navigate('/member/renew-membership')}>
            {home.expired ? 'Renew membership' : `Renew — ${term.value} ${term.unit} left`.replace(/\s+/g, ' ')}
          </NocButton>
        )}
        {!home.expired && !home.expiringSoon && !home.frozen && home.access && !home.access.isFullAccess && (
          <NocButton variant="ghost" onClick={() => navigate('/member/renew-membership')}>
            Compare membership plans
          </NocButton>
        )}
      </div>

      {/* ── Week marks ── */}
      <section aria-label="This week">
        <WeekMarks days={home.weekCheckIns} dayNumbers={home.weekDayNumbers} todayIndex={today} planned={planned} />
        <div className="flex items-center justify-between" style={{ marginTop: 10, fontSize: 12, gap: 12 }}>
          <span style={{ color: 'var(--color-text-muted)' }}>
            {home.weekCheckIns.filter(Boolean).length} of 7 days this week
          </span>
          {planned && planned.length === 0 ? (
            <button onClick={() => navigate('/member/gym-plan')} style={{ color: 'var(--color-secondary)' }}>
              Set a training plan
            </button>
          ) : nextPlanned != null ? (
            <button onClick={() => navigate('/member/gym-plan')} style={{ color: 'var(--color-text-secondary)' }}>
              Rest day · next {DAY_LABELS[nextPlanned]}
              {extras?.remindAt ? ` at ${hourLabel(extras.remindAt)}` : ''}
            </button>
          ) : null}
        </div>
      </section>

      {/* ── Agenda ── */}
      <section aria-label="Your day">
        {entries.map((e, i) => {
          const content = (
            <>
              <span className="block" style={{
                fontSize: 15, fontWeight: 500,
                color: e.titleMuted ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
              }}>
                {e.title}
              </span>
              {e.meta && (
                <span className="block" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.45, color: 'var(--color-text-muted)' }}>
                  {e.meta}
                </span>
              )}
              {e.pill && <span className="block" style={{ marginTop: 8 }}><StatusPill {...e.pill} /></span>}
              {e.action && (
                <span className="inline-block" style={{ marginTop: 8, fontSize: 12.5, color: 'var(--color-secondary)' }}>
                  {e.action}
                </span>
              )}
            </>
          );
          return (
            <div key={e.key} className="flex" style={{ gap: 14 }}>
              <span className="flex-none" style={{ width: 44, paddingTop: 2, fontSize: 12, color: 'var(--color-text-muted)' }}>
                {e.gutter}
              </span>
              <div className="relative flex-1 min-w-0" style={{
                borderLeft: '1px solid rgba(233, 233, 237, 0.12)',
                paddingLeft: 16,
                paddingBottom: i === entries.length - 1 ? 0 : 22,
              }}>
                <span aria-hidden className="absolute rounded-full" style={{
                  left: -4, top: 6, width: 7, height: 7,
                  background: e.live ? 'var(--color-primary)' : 'var(--color-surface-high)',
                  boxShadow: e.live ? '0 0 9px var(--color-primary)' : '0 0 0 1px rgba(233, 233, 237, 0.18)',
                }} />
                {e.onClick
                  ? <button onClick={e.onClick} className="w-full text-left block">{content}</button>
                  : <div>{content}</div>}
              </div>
            </div>
          );
        })}
      </section>

      <div className="flex flex-col" style={{ gap: 16 }}>
        <div className="rule" />
        <div className="flex" style={{ gap: 9 }}>
          <NocButton variant="ghost" className="flex-1"
            icon={lockedOut('workout_tracker') ? <Lock size={15} aria-label="Not on your plan" /> : <Barbell size={15} />}
            onClick={() => navigate('/member/track')}>
            Track a lift
          </NocButton>
          <NocButton variant="ghost" className="flex-1"
            icon={lockedOut('ai_model') ? <Lock size={15} aria-label="Not on your plan" /> : <ChatTeardropDots size={15} />}
            onClick={() => navigate('/member/chatbot')}>
            Ask the assistant
          </NocButton>
        </div>
      </div>

      <CheckInSheet open={checkInOpen} onClose={() => { setCheckInOpen(false); void load(true); }} />
    </Page>
  );
}
