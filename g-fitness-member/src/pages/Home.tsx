import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  CalendarCheck, Trophy, QrCode, TrendingUp,
  AlertCircle, CheckCircle, Ban, ArrowRight, CalendarClock, Check, X,
  // Aliased: an unaliased `Infinity` import shadows the global number in this
  // module, which would silently break any `repeat: Infinity` added later.
  Infinity as InfinityIcon,
} from 'lucide-react';
import Notifications from '../components/Notifications';
import Avatar from '../components/ui/Avatar';
import { SkeletonList } from '../components/ui/Skeleton';
import { panelStyle } from '../components/ui/Card';
import SectionHeader from '../components/ui/SectionHeader';
import StatCard, { Pill } from '../components/ui/StatCard';
import WeekRings from '../components/ui/WeekRings';
import LevelProgressCard from '../components/ui/LevelProgressCard';
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

  const weekCount = home?.weekCheckIns.filter(Boolean).length ?? 0;

  // Days, months, years — or no countdown at all on a lifetime plan. The free
  // tier used to store 3650 days, which rendered as "3647 days remaining" in
  // the biggest type on the screen.
  const term = membershipTerm(home?.daysLeft ?? null, home?.neverExpires ?? false);

  // Progress and Attendance are the two things a member opens repeatedly, and
  // both were buried a level deep under Profile. Renewal came out: the
  // membership card above already links there the moment it matters, and
  // Profile → Membership covers the rest. Trainers came out too — Book a
  // Session has a Coaches button in its own header.
  const quickActions = [
    { title: 'My bookings', subtitle: 'Classes and personal training', icon: CalendarCheck, to: '/member/booking-history' },
    { title: 'Progress', subtitle: 'Measurements, workouts and goals', icon: TrendingUp, to: '/member/progress' },
    { title: 'Attendance', subtitle: 'Every gym visit on record', icon: CalendarClock, to: '/member/attendance-history' },
    { title: 'Events', subtitle: 'What the gym has coming up', icon: Trophy, to: '/member/events' },
  ];

  return (
    <div className="space-y-6 pb-4 min-h-full">
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
            className="p-5 relative overflow-hidden"
            style={{
              background: 'var(--color-primary)',
              borderRadius: 'var(--radius-panel)',
              boxShadow: 'var(--shadow-panel)',
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
              {term.kind === 'unlimited' ? (
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
                      Valid until
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
              {home.access && (
                <div className="mt-3 pt-3 space-y-1.5"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.18)' }}>
                  {home.access.included.map((item) => (
                    <p key={item} className="text-xs flex items-center gap-1.5 text-white">
                      <Check size={12} className="flex-shrink-0" />
                      {item}
                    </p>
                  ))}
                  {home.access.excluded.map((item) => (
                    <p key={item} className="text-xs flex items-center gap-1.5"
                      style={{ color: 'rgba(255,255,255,0.6)' }}>
                      <X size={12} className="flex-shrink-0" />
                      {item} — not on this plan
                    </p>
                  ))}
                </div>
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

          {/* What the gym has announced. High on the screen and amber, because
              an event buried four rows down a scroll is an event nobody
              attends. Renders nothing at all when there is no upcoming one —
              never a placeholder card promising activity that doesn't exist. */}
          {home.nextEvent && (
            <motion.button
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
              onClick={() => navigate('/member/events')}
              className="w-full p-4 flex items-center gap-3 text-left"
              style={{
                background: 'var(--color-secondary-light)',
                border: '1px solid rgba(245,158,11,0.35)',
                borderRadius: 'var(--radius-panel)',
              }}
            >
              <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--color-secondary)' }}>
                <Trophy size={20} className="text-black" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-bold uppercase tracking-wider"
                  style={{ color: 'var(--color-secondary)' }}>
                  Coming up at the gym
                </span>
                <span className="block text-sm font-bold text-white truncate mt-0.5">
                  {home.nextEvent.title}
                </span>
                <span className="block text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                  {new Date(home.nextEvent.startsAt).toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric',
                  })}
                  {' · '}
                  {new Date(home.nextEvent.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  {home.nextEvent.location && ` · ${home.nextEvent.location}`}
                </span>
              </span>
              <ArrowRight size={18} className="flex-shrink-0" style={{ color: 'var(--color-secondary)' }} />
            </motion.button>
          )}

          {/* This week */}
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            {/* The card carries its own count once there is one, so the hint
                only explains the mechanic on an empty week. */}
            <SectionHeader
              title="This week"
              hint={
                weekCount === 0
                  ? 'No visits yet — a ring fills when the front desk scans you in.'
                  : undefined
              }
            />
            <div
              className="p-4"
              style={{ ...panelStyle, borderRadius: 'var(--radius-panel)', boxShadow: 'var(--shadow-panel)' }}
            >
              <WeekRings
                days={home.weekCheckIns}
                dayNumbers={home.weekDayNumbers}
                todayIndex={home.todayIndex}
              />
            </div>
          </motion.section>

          {/* Is today a training day? Above the level card because it is the
              only thing here that is about *today*. */}
          <TodayPlanCard checkedInToday={home.checkedInToday} />

          {/* Training level — the one thing on this screen that answers "am I
              getting anywhere?", which the visit counts alone never did. */}
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
            <SectionHeader title="Your level" />
            <LevelProgressCard />
          </motion.section>

          {/* Counters */}
          <motion.section
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="grid grid-cols-2 gap-3"
          >
            <StatCard
              value={home.checkInsThisMonth}
              label="Gym visits this month"
              icon={CalendarCheck}
              pill={home.checkedInToday ? 'Today ✓' : undefined}
              pillTone="primary"
            />
            <StatCard
              value={home.upcomingCount}
              label="Sessions coming up"
              icon={CalendarClock}
              onClick={() => navigate('/member/booking-history')}
            />
          </motion.section>

          {/* Next session */}
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <SectionHeader title="Next session" />
            <div
              className="p-4 flex items-center justify-between gap-3"
              style={{
                ...panelStyle,
                borderRadius: 'var(--radius-panel)',
                boxShadow: 'var(--shadow-panel)',
                borderLeft: '4px solid var(--color-primary)',
              }}
            >
              <div className="flex-1 min-w-0">
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
                      <div className="mt-2"><Pill label="Awaiting approval" tone="secondary" /></div>
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
              </div>
              <button
                onClick={() => navigate(home.nextBooking ? '/member/booking-history' : '/member/book-class')}
                className="h-10 px-4 rounded-full font-semibold text-sm text-black flex items-center gap-1.5 flex-shrink-0"
                style={{ background: 'var(--color-secondary)' }}
              >
                {home.nextBooking ? 'View' : 'Book'} <ArrowRight size={14} />
              </button>
            </div>
          </motion.section>

          {/* Shortcuts — a 2×2 grid rather than four stacked rows, which put the
              last one about a full screen below the fold. All four are now
              reachable without scrolling past the fold on a 375×812 phone. */}
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <SectionHeader title="Shortcuts" />
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map((a) => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.to}
                    onClick={() => navigate(a.to)}
                    className="p-3.5 text-left flex flex-col gap-2 active:scale-[0.98] transition-transform"
                    style={{ ...panelStyle, borderRadius: 'var(--radius-card)' }}
                  >
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: 'var(--color-primary-light)' }}>
                      <Icon size={18} style={{ color: 'var(--color-primary)' }} />
                    </span>
                    <span className="block text-sm font-semibold text-white leading-tight">{a.title}</span>
                    <span className="block text-xs leading-snug" style={{ color: 'var(--color-text-muted)' }}>
                      {a.subtitle}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.section>
        </>
      )}

      <CheckInSheet open={checkInOpen} onClose={() => setCheckInOpen(false)} />
    </div>
  );
}
