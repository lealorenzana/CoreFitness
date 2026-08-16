import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Users, CalendarDays, Clock, User } from 'lucide-react';

/**
 * Trainer bottom navigation — 5 tabs:
 *   0 Home       → /trainer/home
 *   1 Members    → /trainer/members
 *   2 Schedule   → /trainer/schedule
 *   3 Bookings   → /trainer/bookings
 *   4 Profile    → /trainer/profile
 */

const navRoutes = [
  '/trainer/home',
  '/trainer/members',
  '/trainer/schedule',
  '/trainer/bookings',
  '/trainer/profile',
];

const icons = [Home, Users, CalendarDays, Clock, User];
const labels = ['Home', 'Members', 'Schedule', 'Bookings', 'Profile'];

export default function TrainerBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const activeIndex = useMemo(() => {
    const path = location.pathname;
    for (let i = 0; i < navRoutes.length; i++) {
      if (path === navRoutes[i] || path.startsWith(navRoutes[i] + '/')) {
        return i;
      }
    }
    // -1, not 0. Falling back to the first tab lit up **Home** on every route
    // that isn't in the bar — /trainer/chatbot, /trainer/settings and
    // /trainer/availability all claimed to be Home while showing something
    // else. No match means no tab is current, which is the truth.
    return -1;
  }, [location.pathname]);

  return (
    <div className="dock-wrapper">
      <nav className="dock" role="navigation">
        {icons.map((Icon, idx) => {
          const isActive = idx === activeIndex;
          return (
            <button
              key={idx}
              className={`dock__item ${isActive ? 'dock__item--active' : ''}`}
              onClick={() => { if (location.pathname !== navRoutes[idx]) navigate(navRoutes[idx]); }}
              aria-label={labels[idx]}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="dock__icon-wrap">
                <Icon size={20} strokeWidth={isActive ? 2.3 : 1.8} />
              </span>
              <span className="dock__label">{labels[idx]}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
