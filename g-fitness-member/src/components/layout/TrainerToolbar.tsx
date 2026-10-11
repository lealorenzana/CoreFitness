import { useNavigate } from 'react-router-dom';
import { Barbell, CalendarBlank, ClockCountdown, GearSix, UsersThree } from '@phosphor-icons/react';
import { useGymApp } from '../../hooks/useGymApp';
import { moduleOn, type FeatureKey } from '../../lib/gymApp';

/**
 * The coach's tools, as a small floating bar on their profile — Discord puts
 * Quests · Shop · Nitro · Settings there; a coach gets Schedule · Hours ·
 * Coaching · Library · Settings. With no tab bar (TrainerHub), this is where
 * the gym side of the trainer app lives. Follows the gym's switches (0141).
 */
const TOOLS: { label: string; path: string; icon: typeof GearSix; module?: FeatureKey }[] = [
  { label: 'Schedule', path: '/trainer/schedule', icon: CalendarBlank, module: 'classes' },
  { label: 'Hours', path: '/trainer/availability', icon: ClockCountdown },
  { label: 'Coaching', path: '/trainer/coaching', icon: UsersThree, module: 'coaching' },
  { label: 'Library', path: '/trainer/exercises', icon: Barbell },
  { label: 'Settings', path: '/trainer/settings', icon: GearSix },
];

export default function TrainerToolbar() {
  const navigate = useNavigate();
  const app = useGymApp();
  const tools = TOOLS.filter((t) => moduleOn(app, t.module));
  return (
    <nav aria-label="Coach tools" data-trainer-toolbar className="fixed flex items-center justify-around"
      style={{ left: '50%', transform: 'translateX(-50%)', bottom: 'calc(env(safe-area-inset-bottom) + 10px)', zIndex: 30,
        gap: 4, padding: '8px 10px', borderRadius: 22, width: 'min(360px, calc(100% - 24px))',
        background: 'color-mix(in srgb, var(--color-surface) 92%, #000)', border: '1px solid var(--color-separator)', boxShadow: '0 8px 24px rgba(0,0,0,.35)' }}>
      {tools.map(({ label, path, icon: Icon }) => (
        <button key={path} type="button" onClick={() => navigate(path)} className="flex flex-col items-center noc-press" style={{ gap: 3, minWidth: 56 }}>
          <Icon size={22} style={{ color: 'var(--color-text-primary)' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{label}</span>
        </button>
      ))}
    </nav>
  );
}
