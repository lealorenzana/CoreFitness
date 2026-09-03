import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Calendar, TrendingUp, User, QrCode } from 'lucide-react';
import CheckInSheet from './CheckInSheet';

/**
 * Bottom navigation — four tabs around a raised centre check-in button.
 *
 * Tab order:
 *   0 Home       → /member/home
 *   1 Book       → /member/book-class
 *     ── centre ── opens the check-in QR sheet (not a route)
 *   2 Progress   → /member/progress
 *   3 Profile    → /member/profile
 *
 * Trainers lost its tab to make room for the centre button. It is NOT
 * orphaned — Home's quick actions and the Book screen both link to it. If you
 * remove either of those, put the tab back; a routed page nothing links to is
 * a page nobody visits.
 */

const navRoutes = [
  '/member/home',
  '/member/book-class',
  '/member/progress',
  '/member/profile',
];

const icons = [Home, Calendar, TrendingUp, User];
const labels = ['Home', 'Book', 'Progress', 'Profile'];

/**
 * Every route that should light up each tab, including its sub-pages.
 *
 * Re-grouped when Home was thinned out. Home had grown to ten stacked sections
 * and was the launch point for almost every sub-page in the app, so this list
 * had it owning bookings, payments, workouts and attendance. Those are reached
 * from Profile -> Your account now, and a tab bar that highlights Home while
 * you are reading your payment history is telling you something untrue about
 * where you are.
 */
const tabSubPaths: string[][] = [
  // Home is only "right now": today, your membership, your next session.
  ['/member/home', '/member/notifications'],
  // Book is anything forward-looking, including what the gym has announced.
  ['/member/book-class', '/member/chatbot', '/member/trainers', '/member/trainer/',
   '/member/events'],
  ['/member/progress', '/member/achievements', '/member/track'],
  // Profile is the account: everything about you, your history and your plan.
  ['/member/profile', '/member/booking-history', '/member/attendance-history',
   '/member/payments', '/member/membership', '/member/renew', '/member/renew-membership',
   '/member/workouts', '/member/plan', '/member/rewards', '/member/settings'],
];

export default function MobileMenuDock() {
  const location = useLocation();
  const navigate = useNavigate();
  const [checkInOpen, setCheckInOpen] = useState(false);

  const activeIndex = useMemo(() => {
    const path = location.pathname;
    for (let i = 0; i < tabSubPaths.length; i++) {
      if (tabSubPaths[i].some((sub) => path === sub || path.startsWith(sub))) return i;
    }
    return 0;
  }, [location.pathname]);

  const handleTap = (idx: number) => {
    const target = navRoutes[idx];
    if (location.pathname !== target) navigate(target);
  };

  const tab = (idx: number) => {
    const Icon = icons[idx];
    const isActive = idx === activeIndex;
    return (
      <button
        key={idx}
        className={`dock__item ${isActive ? 'dock__item--active' : ''}`}
        onClick={() => handleTap(idx)}
        aria-label={labels[idx]}
        aria-current={isActive ? 'page' : undefined}
      >
        <span className="dock__icon-wrap">
          <Icon size={20} strokeWidth={isActive ? 2.3 : 1.8} />
        </span>
        {/* Always rendered, revealed by CSS on the active tab. Rendering it
            conditionally would mean the label popping in with no width to
            animate from, and would drop it from the accessibility tree on
            every other tab. */}
        <span className="dock__label">{labels[idx]}</span>
      </button>
    );
  };

  return (
    <>
      <div className="dock-wrapper">
        {/* Two equal halves around the button, rather than four siblings in a
            row. As a flat row the expanding pill pushed the check-in button
            off-centre whenever the active tab was on one side. */}
        <nav className="dock" role="navigation">
          <span className="dock__side">
            {tab(0)}
            {tab(1)}
          </span>

          <button
            className="dock__fab"
            onClick={() => setCheckInOpen(true)}
            aria-label="Show my check-in QR code"
          >
            <QrCode size={26} strokeWidth={2.2} />
          </button>

          <span className="dock__side">
            {tab(2)}
            {tab(3)}
          </span>
        </nav>
      </div>

      <CheckInSheet open={checkInOpen} onClose={() => setCheckInOpen(false)} />
    </>
  );
}
