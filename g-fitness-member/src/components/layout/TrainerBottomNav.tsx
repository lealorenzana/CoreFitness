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
    return 0;
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
            >
              <span className="dock__dot" />
              <span className="dock__icon-wrap">
                <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
