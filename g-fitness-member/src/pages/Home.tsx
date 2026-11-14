import { useCallback, useEffect, useRef, useState } from 'react';
import DailyArrival from '../components/moments/DailyArrival';
import WhatsNew from '../components/WhatsNew';
import PushPrompt from '../components/PushPrompt';
import { useNavigate } from 'react-router-dom';
import { Barbell, CaretRight, IdentificationCard, Lock } from '@phosphor-icons/react';
import { SkeletonList } from '../components/ui/Skeleton';
import { Page } from '../components/ui/page';
import { NocButton, ProgressBar, StatusPill } from '../components/ui/noc';
import CheckInSheet from '../components/ui/CheckInSheet';
import TodayStrip from '../components/home/TodayStrip';
import { useCheckedInToday } from '../hooks/useCheckedInToday';
import ProgramNext from '../components/workout/ProgramNext';
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
import { startPlannedRoutine } from '../lib/startPlannedRoutine';
import { readCache, writeCache } from '../lib/pageCache';
import { useGymApp } from '../hooks/useGymApp';
import { moduleOn } from '../lib/gymApp';
import GymMark from '../components/ui/GymMark';
import GymGoalStrip from '../components/workout/GymGoalStrip';
import DueStrip from '../components/rooms/DueStrip';
import TermsUpdateStrip from '../components/legal/TermsUpdateStrip';
import FinishPlanCard from '../components/home/FinishPlanCard';
import ReelsStrip from '../components/home/ReelsStrip';
import { rampFor } from '../lib/gymTheme';
import { useTour } from '../components/tour/Tour';
import { tourFor } from '../lib/tours';
import { useT } from '../lib/i18n';
import { useBookingModes } from '../hooks/useBookingModes';
import ThisWeekStrip from '../components/home/ThisWeekStrip';
import BookTimeRow from '../components/home/BookTimeRow';

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
  /** Today's workout: drawn as a card with the one filled button (redesign, 2026-10-26). */
  card?: { label: string; locked: boolean };
  /** A real fraction only — `ProgressBar` draws nothing without one. */
  progress?: number;
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
  const ptOff = useBookingModes()?.ptMode === 'off';
  useTour(tourFor('member', 'today'), useT());
  // A button to a feature this plan lacks still shows — gates lock and explain,
  // never hide — but carries a lock, so it is a door marked locked rather than
  // bait (the objection 0059 raised against the old chat head). Unknown while
  // loading, and unknown is drawn as open rather than flashing a lock.
  const { features } = useFeatures();
  const lockedOut = (key: 'workout_tracker') => features != null && !isEnabled(features, key);
  // This gym's own words and its welcome line (0110/0114). Cached for the whole
  // launch, so a hook on ten screens is one request.
  const gymApp = useGymApp();

  const cached = readCache<MemberHome>(CACHE_KEY);
  const [home, setHome] = useState<MemberHome | null>(cached ?? null);
  const [extras, setExtras] = useState<TodayExtras | null>(() => readCache<TodayExtras>(EXTRAS_KEY) ?? null);
  const [loading, setLoading] = useState(cached === undefined);
  const [checkInOpen, setCheckInOpen] = useState(false);
  // The same answer the bar's check-in block shows — one source, so the two can
  // never disagree (they did, 2026-10-26).
  const [liveCheckedIn, refreshCheckedIn] = useCheckedInToday();

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

  /** Today's planned routine: resume the open workout if there is one, else start it. */
  const startPlanned = async (routineId: string) => {
    if (lockedOut('workout_tracker')) { navigate('/member/track'); return; }
    try {
      const id = await getCurrentMemberId();
      if (!id) return;
      navigate(await startPlannedRoutine(id, routineId));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not start that workout'));
      // A routine deleted since it was planned: the plan is where to pick another.
      if (err instanceof Error && /routine is gone/.test(err.message)) navigate('/member/gym-plan');
    }
  };

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

  // The membership row's line: the plan is in its title, so the line is the time left and the end date.
  const membershipMeta = home.frozen
    ? 'Frozen · your days are kept'
    : home.expired
      ? (home.expiryDate ? `Expired ${shortDate(home.expiryDate)} — renew to come back` : 'No active membership — choose a plan')
      : term.kind === 'unlimited'
        ? 'No expiry'
        : home.cancelled && home.expiryDate
          ? `Cancelled · access to ${shortDate(home.expiryDate)}`
          : term.value === 'Today'
            ? 'Last day today'
            : home.expiryDate ? `Active · until ${shortDate(home.expiryDate)}` : `${term.value} ${term.unit} left`.replace(/\s+/g, ' ');

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
  } else if (liveCheckedIn ?? home.checkedInToday) {
    const at = home.checkedInToday && home.checkInAtToday ? ` at ${clock(home.checkInAtToday)}` : '';
    const points = extras?.checkinPoints != null && moduleOn(gymApp, 'points') ? `${extras.checkinPoints} points added. ` : '';
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

  const todayRoutine = extras?.todayRoutine ?? null;
  if (planned?.includes(today) && !home.frozen && !home.expired && (todayRoutine || !home.checkedInToday)) {
    // A routine planned for today stays offered after the check-in — standing
    // in the gym is exactly when you would start it (0089).
    entries.push({
      key: 'plan', gutter: 'Today',
      title: todayRoutine ? todayRoutine.name : 'Training day',
      meta: todayRoutine
        ? (home.checkedInToday ? 'Planned for today' : extras?.remindAt ? `Planned for ${hourLabel(extras.remindAt)}` : 'Planned for today')
        : extras?.remindAt ? `You planned to train at ${hourLabel(extras.remindAt)}` : 'You planned to train today',
      ...(todayRoutine
        ? { card: { label: lockedOut('workout_tracker') ? 'See plan' : 'Start workout', locked: lockedOut('workout_tracker') },
            onClick: () => void startPlanned(todayRoutine.id) }
        : { onClick: () => navigate('/member/gym-plan') }),
    });
  } else if (!home.frozen && !home.expired) {
    // No routine planned for today: the way to train is still here — it was the
    // "Start a workout" button under the agenda, which repeated a planned day's Start.
    entries.push({
      key: 'workout', gutter: 'Today',
      title: 'Start a workout',
      meta: 'Pick one of your routines, or start an empty workout.',
      card: { label: lockedOut('workout_tracker') ? 'See routines' : 'Start a workout', locked: lockedOut('workout_tracker') },
      onClick: () => navigate('/member/track'),
    });
  }

  if (home.unreadCoachNote) {
    const n = home.unreadCoachNote;
    entries.push({
      key: 'coach', gutter: 'New',
      title: n.count === 1 ? `A note from ${n.from ?? 'your coach'}` : `${n.count} new coach notes`,
      meta: n.title,
      action: 'Read', onClick: () => navigate('/member/coach-notes'),
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
      onClick: () => navigate('/member/sessions'),
    });
  }

  // Gym events are a switch of their own (0220), off unless the gym turns it on.
  if (home.nextEvent && moduleOn(gymApp, 'events')) {
    const e = home.nextEvent;
    entries.push({
      key: 'event',
      gutter: new Date(e.startsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      title: e.title,
      meta: [clock(e.startsAt), e.location].filter(Boolean).join(' · '),
      action: 'See event', onClick: () => navigate('/member/events'),
    });
  }

  // Today's challenge moved to Rewards (simplify, 2026-10-28).
  if (!b) {
    entries.push({
      key: 'end', gutter: 'Later',
      title: 'Nothing coming up',
      meta: ptOff ? 'Your gym books sessions at the front desk.' : 'Book a session with a coach on Train.',
      action: home.frozen || home.expired || ptOff ? undefined : 'Book',
      onClick: home.frozen || home.expired || ptOff ? undefined : () => navigate('/member/book-session'),
    });
  } else {
    entries.push({
      key: 'end', gutter: 'Later', titleMuted: true,
      title: 'Nothing after this',
    });
  }

  const monthName = now.toLocaleDateString('en-US', { month: 'short' });
  const remind = extras?.remindAt ? `at ${hourLabel(extras.remindAt)}` : null;

  return (
    <Page>
      {/* What changed in the app (0212), once. */}
      <WhatsNew app="member" />
      {/* Whose gym this is, on the screen a member opens every day: the logo
          (0067/0112) and the welcome line (0110), one strip. A gym with no logo
          gets a monogram in its own colour, never the Core Fitness mark. */}
      {gymApp && (
        <div className="flex items-center" style={{ gap: 10 }}>
          <GymMark name={gymApp.gymName} logoUrl={gymApp.logoUrl} accent={rampFor(gymApp.accent, 'violet').base} size={30} />
          <div className="min-w-0">
            <p className="truncate" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {gymApp.shortName?.trim() || gymApp.gymName}
            </p>
            {gymApp.welcomeMessage && (
              <p style={{ fontSize: 12, lineHeight: 1.4, marginTop: 1, color: 'var(--color-text-secondary)' }}>{gymApp.welcomeMessage}</p>
            )}
          </div>
        </div>
      )}

      {/* The first open of the day (wave 1): streak and earned level, then it folds away. */}
      <DailyArrival />

      {/* ── The strip: membership, this month, this week, the streak ── */}
      <div className="flex flex-col" style={{ gap: 10 }}>
        {/* Your membership, one tap from home (owner, 2026-11-11: "I have a hard time finding it"). It was only a grey
            line inside the strip — readable, never tappable, never called "membership". */}
        {/* Your membership, as a card (owner, 2026-11-11: "enhance the UI"): the plan, the days left large, how much of the
            term is left as a bar, and the whole card opens the Membership tab. The gym's colours, amber when it needs you. */}
        {(() => {
          const urgent = home.frozen || home.expired || home.expiringSoon;
          const total = home.startDate && home.expiryDate
            ? Math.max(1, Math.round((new Date(`${home.expiryDate}T00:00:00`).getTime() - new Date(`${home.startDate}T00:00:00`).getTime()) / 86_400_000))
            : null;
          const left = !home.expired && !home.frozen && home.daysLeft != null && total ? Math.max(0, Math.min(1, home.daysLeft / total)) : null;
          const tint = urgent ? 'var(--color-secondary)' : 'var(--color-primary)';
          return (
            <button type="button" onClick={() => navigate('/member/membership?tab=membership')} data-today-membership data-urgent={urgent}
              aria-label={`${plan ? `${plan} membership` : 'Your membership'}: ${membershipMeta}. Open Membership`}
              className="w-full text-left noc-press-soft"
              style={{
                position: 'relative', overflow: 'hidden', borderRadius: 18, padding: '13px 14px 12px',
                background: `linear-gradient(135deg, color-mix(in srgb, ${tint} 16%, var(--raised-solid, var(--color-surface-raised))) 0%, var(--raised-solid, var(--color-surface-raised)) 62%)`,
                border: `1px solid color-mix(in srgb, ${tint} 34%, transparent)`,
              }}>
              <span className="flex items-center" style={{ gap: 12 }}>
                <span aria-hidden className="grid place-items-center flex-none on-fill" data-tile
                  style={{ width: 42, height: 42, borderRadius: 13, color: '#fff',
                    background: urgent ? 'var(--amber-solid, var(--color-secondary))' : 'var(--fill-primary, var(--color-primary))',
                    boxShadow: `0 8px 18px -8px ${tint}` }}>
                  <IdentificationCard size={21} weight="duotone" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate" style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    {plan ? `${plan} membership` : 'Your membership'}
                  </span>
                  <span className="block truncate" style={{ fontSize: 12.5, marginTop: 1, color: urgent ? 'var(--color-secondary)' : 'var(--color-text-secondary)' }}>
                    {membershipMeta}
                  </span>
                </span>
                {!home.expired && !home.frozen && home.daysLeft != null && term.kind !== 'unlimited' && (
                  <span className="flex-none text-right tabular-nums" aria-hidden>
                    <span className="block" style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: urgent ? 'var(--color-secondary)' : 'var(--color-text-primary)' }}>{home.daysLeft}</span>
                    <span className="block" style={{ fontSize: 11, marginTop: 2, color: 'var(--color-text-muted)' }}>{home.daysLeft === 1 ? 'day left' : 'days left'}</span>
                  </span>
                )}
                <CaretRight size={16} className="flex-none" style={{ color: 'var(--color-text-muted)' }} />
              </span>
              {left != null && (
                <span className="block" style={{ marginTop: 11 }} data-membership-left={left.toFixed(2)}>
                  <ProgressBar fraction={left} tone={urgent ? 'action' : 'structure'} />
                </span>
              )}
            </button>
          );
        })()}
        <TodayStrip
          visitsThisMonth={home.checkInsThisMonth}
          monthName={monthName}
          week={home.weekCheckIns}
          dayNumbers={home.weekDayNumbers}
          todayIndex={today}
          planned={planned}
          nextPlanned={nextPlanned}
          remindAt={remind}
          showStreak={moduleOn(gymApp, 'progress')}
        />

        {/* What the plan holds back — one line, and the screen that lists it. */}
        {home.access && !home.access.isFullAccess && !home.frozen && (
          <button onClick={() => navigate('/member/membership?tab=membership')}
            className="w-full flex items-center justify-between text-left" style={{ gap: 12, fontSize: 12.5 }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>
              {home.access.excluded.length === 1
                ? `${home.access.excluded[0]} is not on this plan`
                : `${home.access.excluded.length} things are not on this plan`}
            </span>
            <span className="flex-none" style={{ color: 'var(--color-secondary)' }}>See what is included</span>
          </button>
        )}

        {/* Renewal is the one action worth a filled slab — only when the membership is actually ending. */}
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

      {/* This week (gym styles phase 1): Monday to Sunday at a glance, the next thing named — opens the whole week. */}
      <ThisWeekStrip />
      {/* Time slots (0259): your next booked time, or Book a time — only at a gym that runs them. */}
      <BookTimeRow />

      {/* The gym's reels (0245): a line of tiles, nothing at all when it has none or the switch is off. */}
      <ReelsStrip />

      {/* ── The day: Now, Today, a date, Later — each label once, at the top of its group ── */}
      <section aria-label="Your day" className="noc-rows" data-today-timeline>
        {entries.map((e, i) => {
          const head = i === 0 || entries[i - 1].gutter !== e.gutter;
          const content = (
            <>
              <span className="block" style={{
                fontSize: 15, fontWeight: 600,
                color: e.titleMuted ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
              }}>
                {e.title}
              </span>
              {e.meta && (
                <span className="block" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.45, color: 'var(--color-text-muted)' }}>
                  {e.meta}
                </span>
              )}
              {e.progress != null && <span className="block" style={{ marginTop: 8 }}><ProgressBar fraction={e.progress} /></span>}
              {e.pill && <span className="block" style={{ marginTop: 8 }}><StatusPill {...e.pill} /></span>}
              {e.action && (
                <span className="inline-block" style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color: 'var(--color-secondary)' }}>
                  {e.action}
                </span>
              )}
            </>
          );
          return (
            <div key={e.key} className="flex" style={{ gap: 14 }} data-timeline-group={head ? e.gutter : undefined}>
              <span className="flex-none" style={{ width: 44, paddingTop: 2, fontSize: 12,
                color: e.live ? 'var(--color-primary-300)' : 'var(--color-text-muted)', fontWeight: e.live ? 600 : 400 }}>
                {head ? e.gutter : ''}
              </span>
              <div className="relative flex-1 min-w-0" style={{
                borderLeft: '1px solid rgb(var(--hair-rgb, 233 233 237) / 0.12)',
                paddingLeft: 16,
                paddingBottom: i === entries.length - 1 ? 0 : 20,
              }}>
                <span aria-hidden className="absolute rounded-full" style={{
                  left: -4, top: 6, width: 7, height: 7,
                  background: e.live ? 'var(--color-primary)' : 'var(--color-surface-high)',
                  boxShadow: e.live ? '0 0 9px var(--color-primary)' : '0 0 0 1px rgb(var(--hair-rgb, 233 233 237) / 0.18)',
                }} />
                {e.card ? (
                  <div data-today-workout style={{ border: '1px solid var(--color-hairline)', borderRadius: 14,
                    background: 'var(--color-surface)', padding: 12 }}>
                    {content}
                    <span className="block" style={{ marginTop: 10 }}>
                      <NocButton variant="fill" className="w-full" onClick={e.onClick}
                        icon={e.card.locked ? <Lock size={15} aria-label="Not on your plan" /> : <Barbell size={15} />}>
                        {e.card.label}
                      </NocButton>
                    </span>
                  </div>
                ) : e.onClick
                  ? <button onClick={e.onClick} className="w-full text-left block">{content}</button>
                  : <div>{content}</div>}
              </div>
            </div>
          );
        })}
      </section>

      {/* Things to read or finish, below the day: each renders nothing when it has nothing to say. */}
      {moduleOn(gymApp, 'programs') && <ProgramNext />}
      {moduleOn(gymApp, 'rooms') && <DueStrip />}
      {moduleOn(gymApp, 'squads') && <GymGoalStrip />}
      <TermsUpdateStrip />
      <FinishPlanCard />
      <PushPrompt />

      <CheckInSheet open={checkInOpen} onClose={() => { setCheckInOpen(false); refreshCheckedIn(); void load(true); }} />
    </Page>
  );
}
