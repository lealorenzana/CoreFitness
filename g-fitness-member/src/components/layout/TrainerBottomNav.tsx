import { useLocation, useNavigate } from 'react-router-dom';
import { TRAINER_TABS, trainerTabForPath, trainerTabs } from './trainerNav';
import { useGymApp } from '../../hooks/useGymApp';

/**
 * The trainer bar: Home · Members · Schedule · Bookings · Profile.
 *
 * Drawn exactly like the member `TabBar` (trainer's request, 2026-09-18) — in
 * flow rather than a floating dock, so `<main>` ends where the bar begins and
 * nothing scrolls underneath it; every item keeps its label; violet marks the
 * tab you are in, and the underline mark only on that tab's root screen.
 *
 * There is no check-in block: that is a member's entry to the gym.
 */
export default function TrainerBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const active = trainerTabForPath(location.pathname);
  // This gym's own nouns (0114). Null — the frame before the read lands D
  // gives the exported constant, which is the English wording.
  const tabs = trainerTabs(useGymApp());
  const onRoot = TRAINER_TABS.some((t) => t.path === location.pathname);

  return (
    <nav
      aria-label="Main"
      className="flex-none flex items-stretch relative z-40"
      style={{
        height: 'var(--bar-height)',
        background: 'var(--color-bg)',
        borderTop: '1px solid rgba(233, 233, 237, 0.12)',
        padding: '0 10px 8px',
      }}
    >
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => { if (location.pathname !== tab.path) navigate(tab.path); }}
            aria-current={isActive && onRoot ? 'page' : undefined}
            className="flex-1 min-w-0 flex flex-col items-center justify-start noc-press"
            style={{
              gap: 5,
              paddingTop: 9,
              color: isActive ? 'var(--color-primary-400)' : 'var(--color-text-muted)',
            }}
          >
            <span
              aria-hidden
              className="noc-mark"
              style={{
                width: 16, height: 2, borderRadius: 1,
                background: 'var(--color-primary)',
                boxShadow: '0 0 8px var(--color-primary)',
                transform: isActive && onRoot ? 'scaleX(1)' : 'scaleX(0)',
                opacity: isActive && onRoot ? 1 : 0,
              }}
            />
            <span key={isActive ? 'on' : 'off'} className={isActive ? 'noc-pop flex' : 'flex'}>
              <Icon size={20} weight={isActive ? 'fill' : 'regular'} />
            </span>
            <span style={{ fontSize: 12, letterSpacing: '0.02em' }}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
