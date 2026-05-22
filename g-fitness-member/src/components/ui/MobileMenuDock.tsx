import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Calendar, TrendingUp, Dumbbell, User } from 'lucide-react';

/**
 * Premium bottom navigation dock — icon-only, 5 tabs.
 *
 * Tab order:
 *   0 Home       → /member/home
 *   1 Book       → /member/book-class
 *   2 Progress   → /member/progress
 *   3 Trainers   → /member/trainers
 *   4 Profile    → /member/profile
 */

const navRoutes = [
  '/member/home',
  '/member/book-class',
  '/member/progress',
  '/member/trainers',
  '/member/profile',
];

const icons = [Home, Calendar, TrendingUp, Dumbbell, User];

const tabSubPaths: string[][] = [
  ['/member/home', '/member/booking-history', '/member/attendance-history',
   '/member/payments', '/member/membership', '/member/renew', '/member/renew-membership',
   '/member/workouts', '/member/events'],
  ['/member/book-class', '/member/chatbot'],
  ['/member/progress'],
  ['/member/trainers', '/member/trainer/'],
  ['/member/profile'],
];

export default function MobileMenuDock() {
  const location = useLocation();
  const navigate = useNavigate();

  const activeIndex = useMemo(() => {
    const path = location.pathname;
    for (let i = 0; i < tabSubPaths.length; i++) {
      if (tabSubPaths[i].some(sub => path === sub || path.startsWith(sub))) {
        return i;
      }
    }
    return 0;
  }, [location.pathname]);

  const handleTap = (idx: number) => {
    const target = navRoutes[idx];
    if (location.pathname !== target) navigate(target);
  };

  return (
    <div className="dock-wrapper">
      <nav className="dock" role="navigation">
        {icons.map((Icon, idx) => {
          const isActive = idx === activeIndex;
          return (
            <button
              key={idx}
              className={`dock__item ${isActive ? 'dock__item--active' : ''}`}
              onClick={() => handleTap(idx)}
              aria-label={navRoutes[idx].split('/').pop()}
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
