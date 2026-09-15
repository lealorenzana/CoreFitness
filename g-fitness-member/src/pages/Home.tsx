import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  QrCode,
  AlertCircle, CheckCircle, Ban, ArrowRight, CalendarClock, CalendarCheck, Flame, MessageSquare,
  ChevronRight, Snowflake,
  // Aliased: an unaliased `Infinity` import shadows the global number in this
  // module, which would silently break any `repeat: Infinity` added later.
  Infinity as InfinityIcon,
} from 'lucide-react';
import Notifications from '../components/Notifications';
import Avatar from '../components/ui/Avatar';
import { SkeletonList } from '../components/ui/Skeleton';
import { panelStyle } from '../components/ui/Card';
import { Page, RingStat } from '../components/ui/page';
import { Pill } from '../components/ui/StatCard';
import TodayPlanCard from '../components/ui/TodayPlanCard';
import CheckInSheet from '../components/ui/CheckInSheet';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { useLiveData } from '../hooks/useLiveData';
import { membershipTerm } from '../utils/membershipTerm';
import { getCurrentMemberId } from '../services/bookingService';
import { getMemberHome, type MemberHome } from '../services/memberHomeService';
import { readCache, writeCache } from '../lib/pageCache';
import MotionIcon from '../components/ui/MotionIcon';

/** Cache slot for this screen — see lib/pageCache.ts. */
const CACHE_KEY = 'member:home';

/**
 * Is this timestamp on today's local calendar day?
 *
 * Compared component by component in local time, never by slicing an ISO
 * string. Manila is UTC+8, so `toISOString()` reports yesterday's date for the
 * first eight hours of every local day — the shift that once hid every pre-8am
 * check-in from the admin Attendance page.
 */
function isToday(startsAt: string): boolean {
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

/**
 * The member's home screen.
 *
 * Every figure here comes from a row in Postgres — check-ins from `attendance`,
 * the plan and expiry from `memberships`, the next session from `bookings` or
 * `pt_sessions`. There is no goal ring and no streak count, because nothing in
 * the schema stores a target for either. An invented number on the first screen
 * a member sees is the most expensive kind.
 *
 * The QR code no longer lives inline. It is the centre button of the bottom
 * nav, reachable from anywhere in the app; the membership card here opens the
 * same sheet.
 */
export default function Home() {
  const navigate = useNavigate();

  // Seeded from the last dashboard this session rendered, so coming back from
  // Book a Session paints content on the first frame instead of skeletons.
  const cached = readCache<MemberHome>(CACHE_KEY);
  const [home, setHome] = useState<MemberHome | null>(cached ?? null);
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
      setHome(writeCache(CACHE_KEY, await getMemberHome(id)));
    } catch (err) {
      if (!quiet) toast.error(errorMessage(err, 'Could not load your dashboard'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  // The mount fetch is quiet when there is something to look at meanwhile —
  // a loud one would set `loading` back to true and reintroduce the flash the
  // cache exists to remove.
  const revisit = useRef(cached !== undefined);
  useEffect(() => { load(revisit.current); }, [load]);

  // Next session, membership status and the check-in streak all move without
  // this screen doing anything.
  useLiveData(() => load(true));

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const expiryLabel = home?.expiryDate
    ? new Date(`${home.expiryDate}T00:00:00`).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : '—';

  // Days, months, years — or no countdown at all on a lifetime plan. The free
  // tier used to store 3650 days, which rendered as "3647 days remaining" in
  // the biggest type on the screen.
  const term = membershipTerm(home?.daysLeft ?? null, home?.neverExpires ?? false);

  // Progress and Attendance are the two things a member opens repeatedly, and
  // both were buried a level deep under Profile. Renewal came out: the
  // membership card above already links there the moment it matters, and

  return (
    <Page className="min-h-full">
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between gap-3"
      >
        <button onClick={() => navigate('/member/profile')} className="flex items-center gap-3 min-w-0 text-left">
          <Avatar name={home?.fullName} photoUrl={home?.photoUrl} size={46} />
          <div className="min-w-0">
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{greeting}</p>
            <h1 className="display text-xl text-white truncate">{home?.firstName ?? ' '}</h1>
          </div>
        </button>
        <Notifications />
      </motion.div>

      {loading || !home ? (
        <SkeletonList />
      ) : (
        <>
          {/* Membership + check-in */}
          <motion.section
            initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.05 }}
            className="relative overflow-hidden"
            style={{
              padding: 20,
              /* Violet, still — but lit from the top-left rather than poured
                 flat, with a hairline that catches the edge the way a real card
                 does. The tokens stay the source of the hue; this only says
                 where the light is. */
              background:
                'linear-gradient(152deg, #8B5CF6 0%, var(--color-primary) 46%, #5B21B6 100%)',
              borderRadius: 'var(--radius-panel)',
              boxShadow: 'var(--shadow-panel), inset 0 1px 0 rgba(255,255,255,0.22)',
            }}
          >
            <div
              className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-25 pointer-events-none"
              style={{
                background: 'radial-gradient(circle, rgba(245,158,11,0.55) 0%, transparent 70%)',
                transform: 'translate(30%, -35%)',
              }}
            />

            <div className="relative z-10">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span
                    className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase mb-2"
                    style={{ background: 'rgba(0,0,0,0.28)', color: '#fff' }}
                  >
                    {home.planName ?? 'No plan'}
                  </span>
                  <h2 className="display text-2xl text-white truncate">{home.fullName}</h2>
                  <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.75)' }}>
                    Core Fitness Mamburao
                  </p>
                </div>

                <button
                  onClick={() => setCheckInOpen(true)}
                  className="flex-shrink-0 w-16 h-16 rounded-2xl flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform"
                  style={{ background: 'rgba(0,0,0,0.28)' }}
                  aria-label="Show my check-in QR code"
                >
                  <QrCode size={22} className="text-white" />
                  <span className="text-xs font-semibold text-white">Code</span>
                </button>
              </div>

              {/* A lifetime plan has no date and no countdown, so it gets a
                  sentence rather than a "Valid until —" beside a "— days". */}
              {/* Frozen replaces the countdown rather than sitting beside it.

                  The days are not running down — 0057 credits them back to the
                  expiry when the membership restarts — so "18 days remaining"
                  is not merely unhelpful here, it is untrue. */}
              {home.frozen ? (
                <div
                  className="mt-4 pt-4"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.18)' }}
                >
                  <p className="flex items-center gap-2 font-bold text-white text-sm">
                    <Snowflake size={16} className="flex-shrink-0" /> Membership frozen
                  </p>
                  <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.78)' }}>
                    You cannot check in or book while it is frozen, and the days you have left are
                    being kept for you. Ask the front desk to start it again.
                  </p>
                </div>
              ) : term.kind === 'unlimited' ? (
                <div
                  className="flex items-center gap-2 mt-4 pt-4"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.18)' }}
                >
                  <InfinityIcon size={18} className="text-white flex-shrink-0" />
                  <p className="text-sm font-bold text-white">{term.caption}</p>
                </div>
              ) : (
                <div
                  className="flex items-end justify-between gap-3 mt-4 pt-4"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.18)' }}
                >
                  <div>
                    <p className="text-xs uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.65)' }}>
                      {/* Cancelled is still usable until the date (TEST_MATRIX,
                          7 September). The card otherwise looks identical to a
                          live membership right up to the day it stops. */}
                      {home.cancelled ? 'Cancelled · access until' : 'Valid until'}
                    </p>
                    <p className="font-bold text-sm text-white mt-0.5">{expiryLabel}</p>
                  </div>
                  <div className="text-right">
                    <p className="flex items-baseline gap-1 justify-end">
                      <span className="display text-3xl text-white">{term.value}</span>
                      {term.unit && (
                        <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>
                          {term.unit}
                        </span>
                      )}
                    </p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>{term.caption}</p>
                  </div>
                </div>
              )}

              {/* What the plan actually opens.

                  This is the answer to a question the card kept provoking and
                  never addressing: a Free Access member saw "This membership
                  does not expire" and nothing else, so the tier that grants the
                  least advertised itself with the most generous-sounding
                  sentence on the screen. The entitlements have been enforced in
                  SQL since 0017 — the member simply had no way to read them.

                  Both halves are shown. Listing only what is included would
                  leave "why can't I book this class?" to be discovered at the
                  point of failure, which is the worst possible place. */}
              {/* The entitlement list moved to Membership (2026-09-16).

                  It was the longest thing on this card and the least "today":
                  the rule for this screen is that Home is today only, and a
                  list of what the plan does and does not cover is the account.
                  Membership is the screen named after that question, and it had
                  a page of empty space under four navigation tiles.

                  What stays here is everything that IS today — the plan's name,
                  the expiry, the countdown, frozen and cancelled, and the code
                  you check in with. The one line below is what a member needs
                  *on Home* about the gap: that there is one, and where to read
                  it. Nothing is stated twice. */}
              {home.access && !home.access.isFullAccess && (
                <button
                  onClick={() => navigate('/member/membership')}
                  className="w-full mt-4 pt-4 flex items-center gap-2 text-left"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.18)' }}
                >
                  <span className="text-xs flex-1" style={{ color: 'rgba(255,255,255,0.78)' }}>
                    {home.access.excluded.length === 1
                      ? `${home.access.excluded[0]} is not on this plan`
                      : `${home.access.excluded.length} things are not on this plan`}
                  </span>
                  <span className="text-xs font-bold text-white whitespace-nowrap">
                    See what is included
                  </span>
                  <ChevronRight size={14} className="text-white flex-shrink-0" />
                </button>
              )}

              {/* Status flags — only ever rendered when true */}
              <div className="flex flex-wrap gap-2 mt-3">
                {home.expired && (
                  <span className="px-2.5 py-1 rounded-full flex items-center gap-1.5 text-xs font-semibold"
                    style={{ background: 'rgba(0,0,0,0.35)', color: 'var(--color-secondary)' }}>
                    <Ban size={12} />
                    {home.expiryDate ? 'Membership expired' : 'No active membership'}
                  </span>
                )}
                {home.expiringSoon && (
                  <span className="px-2.5 py-1 rounded-full flex items-center gap-1.5 text-xs font-semibold"
                    style={{ background: 'rgba(0,0,0,0.35)', color: 'var(--color-secondary)' }}>
                    <AlertCircle size={12} />
                    Expires in {home.daysLeft} {home.daysLeft === 1 ? 'day' : 'days'}
                  </span>
                )}
                {home.checkedInToday && (
                  <span className="px-2.5 py-1 rounded-full flex items-center gap-1.5 text-xs font-semibold"
                    style={{ background: 'rgba(0,0,0,0.35)', color: '#fff' }}>
                    <CheckCircle size={12} /> Checked in today
                  </span>
                )}
              </div>

              {(home.expired || home.expiringSoon) && (
                <button
                  onClick={() => navigate('/member/renew-membership')}
                  className="w-full mt-3 h-11 rounded-full font-semibold text-sm text-black"
                  style={{ background: 'var(--color-secondary)' }}
                >
                  {home.expired ? 'Renew membership now' : 'Renew now'}
                </button>
              )}

              {/* A member who is neither expired nor expiring has no reason to
                  see "Renew", but a member missing half the gym does need a way
                  out of the tier. Only offered when something is actually held
                  back — on full access this would be an upsell to nowhere. */}
              {!home.expired && !home.expiringSoon && home.access && !home.access.isFullAccess && (
                <button
                  onClick={() => navigate('/member/renew-membership')}
                  className="w-full mt-3 h-11 rounded-full font-semibold text-sm text-black"
                  style={{ background: 'var(--color-secondary)' }}
                >
                  Compare membership plans
                </button>
              )}
            </div>
          </motion.section>

          {/* A note from a coach, when one is unread.

              This is not a new feature — trainer recommendations have written a
              `notifications` row since 0025 and Progress → Coach has always read
              them back. But that is the fifth tab of a screen one level down, so
              a note could sit unread for weeks and the whole thing read as
              broken. Violet rather than amber: it is someone talking to you, not
              an action the gym wants you to take. */}
          {home.unreadCoachNote && (
            <motion.button
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
              onClick={() => navigate('/member/progress?tab=feedback')}
              className="w-full p-4 flex items-center gap-3 text-left"
              style={{
                background: 'var(--color-primary-light)',
                border: '1px solid var(--color-primary)',
                borderRadius: 'var(--radius-panel)',
              }}
            >
              <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--color-primary)' }}>
                <MessageSquare size={20} className="text-white" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--color-primary)' }}>
                  {home.unreadCoachNote.count === 1
                    ? 'New note from your coach'
                    : `${home.unreadCoachNote.count} new coach notes`}
                </span>
                <span className="block text-sm font-bold text-white truncate mt-0.5">
                  {home.unreadCoachNote.title}
                </span>
                {home.unreadCoachNote.from && (
                  <span className="block text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {home.unreadCoachNote.from}
                  </span>
                )}
              </span>
              <ChevronRight size={18} className="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
            </motion.button>
          )}

          {/* Is today a training day? */}
          <TodayPlanCard checkedInToday={home.checkedInToday} />

          {/* Your progress.

              Asked for on Home, and built from numbers the screen already
              loads — no new query, and nothing invented. Only "this week" gets
              a ring: seven days is a real denominator, where a month of
              check-ins and a count of bookings have no ceiling to be a
              fraction of, and a ring drawn full on those would be decoration
              dressed as a measurement. */}
          <motion.section
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }} className="flex flex-col"
            style={{ gap: 'var(--stack-tight)' }}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="display text-white" style={{ fontSize: 'var(--text-title)' }}>Your progress</h2>
              <button
                onClick={() => navigate('/member/progress')}
                className="flex items-center gap-1 font-semibold"
                style={{ fontSize: 'var(--text-meta)', color: 'var(--color-secondary)' }}
              >
                See activity <ChevronRight size={14} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <RingStat
                icon={<CalendarCheck size={16} />}
                value={home.checkInsThisMonth}
                label="Visits this month"
                onClick={() => navigate('/member/attendance-history')}
              />
              <RingStat
                icon={<Flame size={16} />}
                value={home.weekCheckIns.filter(Boolean).length}
                unit="of 7"
                label="Days this week"
                fraction={home.weekCheckIns.filter(Boolean).length / 7}
                tone="secondary"
                onClick={() => navigate('/member/attendance-history')}
              />
              <RingStat
                icon={<CalendarClock size={16} />}
                value={home.upcomingCount}
                label={home.upcomingCount === 1 ? 'Session booked' : 'Sessions booked'}
                onClick={() => navigate('/member/booking-history')}
              />
            </div>
          </motion.section>

          {/* Next session */}
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }} className="flex flex-col"
            style={{ gap: 'var(--stack-tight)' }}>
            <h2 className="display text-white" style={{ fontSize: 'var(--text-title)' }}>Next session</h2>
            {/* The whole card, not just the pill on the right.

                A member reaching for "what am I doing next" taps the thing that
                says it — the title, the date — and those were inert; only the
                40px button did anything. One <button> rather than a clickable
                div with a button inside it, which is invalid and swallows the
                inner tap. The pill stays as the visible affordance. */}
            <button
              onClick={() => navigate(home.nextBooking ? '/member/booking-history' : '/member/book-class')}
              className="p-4 flex items-center justify-between gap-3 w-full text-left transition-transform active:scale-[0.99]"
              style={{
                ...panelStyle,
                borderRadius: 'var(--radius-panel)',
                boxShadow: 'var(--shadow-panel)',
                borderLeft: '4px solid var(--color-primary)',
              }}
            >
              <span className="flex-1 min-w-0 block">
                {home.nextBooking ? (
                  <>
                    <p className="text-sm font-bold text-white truncate">{home.nextBooking.title}</p>
                    <p className="text-xs mt-1 font-semibold flex items-center gap-1.5"
                      style={{ color: 'var(--color-secondary)' }}>
                      {/* Only ticks when the session is *today*. A booking three
                          weeks out is a fact, not something happening now, and
                          a clock ticking beside it would be movement with no
                          event behind it. */}
                      {isToday(home.nextBooking.startsAt as string) && (
                        <MotionIcon icon={CalendarClock} motion="tick" size={13}
                          color="var(--color-secondary)" />
                      )}
                      <span>
                        {new Date(home.nextBooking.startsAt as string).toLocaleDateString('en-US', {
                          weekday: 'long', month: 'short', day: 'numeric',
                        })}
                        {' · '}
                        {new Date(home.nextBooking.startsAt as string).toLocaleTimeString([], {
                          hour: 'numeric', minute: '2-digit',
                        })}
                      </span>
                    </p>
                    <p className="text-xs mt-1 truncate" style={{ color: 'var(--color-text-muted)' }}>
                      {home.nextBooking.subtitle}
                    </p>
                    {home.nextBooking.status === 'pending' && (
                      <span className="block mt-2"><Pill label="Awaiting approval" tone="secondary" /></span>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-white">Nothing booked yet</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      Book a class or a 1-on-1 session to see it here.
                    </p>
                  </>
                )}
              </span>
              <span
                className="h-10 px-4 rounded-full font-semibold text-sm text-black flex items-center gap-1.5 flex-shrink-0"
                style={{ background: 'var(--color-secondary)' }}
              >
                {home.nextBooking ? 'View' : 'Book'} <ArrowRight size={14} />
              </span>
            </button>
          </motion.section>

        </>
      )}

      <CheckInSheet open={checkInOpen} onClose={() => setCheckInOpen(false)} />
    </Page>
  );
}
