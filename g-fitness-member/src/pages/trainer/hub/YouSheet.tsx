import { useNavigate } from 'react-router-dom';
import { Barbell, Books, Buildings, CalendarBlank, CaretRight, Clock, GearSix, Handshake, Trophy, UserCircle, type Icon } from '@phosphor-icons/react';
import GlassSheet from '../../../components/ui/GlassSheet';
import Avatar from '../../../components/ui/Avatar';
import { LineRow } from '../../../components/ui/noc';
import { PRESENCE_LABEL, type Presence } from '../../../lib/api/presence';
import { useGymApp } from '../../../hooks/useGymApp';
import { moduleOn, type FeatureKey } from '../../../lib/gymApp';

const ROWS: { label: string; blurb: string; path: string; icon: Icon; module?: FeatureKey }[] = [
  { label: 'Schedule', blurb: 'Your classes and sessions', path: '/trainer/schedule', icon: CalendarBlank, module: 'classes' },
  { label: 'Hours', blurb: 'When members can book you', path: '/trainer/availability', icon: Clock },
  { label: 'Coaching', blurb: 'Terms, trainees and payments', path: '/trainer/coaching', icon: Handshake, module: 'coaching' },
  { label: 'Library', blurb: 'Exercises and programs you write', path: '/trainer/exercises', icon: Books },
  { label: 'Profile', blurb: 'Photo, bio and ratings', path: '/trainer/profile', icon: UserCircle },
  { label: 'Equipment', blurb: 'What the gym has, and what needs fixing', path: '/trainer/equipment', icon: Barbell, module: 'equipment' },
  { label: 'Achievements', blurb: 'Badges you have earned', path: '/trainer/achievements', icon: Trophy, module: 'engagement' },
  // Coaches work at more than one gym; this is how they switch.
  { label: 'Gyms', blurb: 'Switch to another gym you coach at', path: '/choose-gym', icon: Buildings },
  { label: 'Settings', blurb: 'Alerts, sign-in, language', path: '/trainer/settings', icon: GearSix },
];

/**
 * You — Discord's user panel for a coach (redesign, 2026-10-27): tap your name
 * in the bar at the bottom. Your status, then every coach screen as a described
 * row — in place of the profile page's chip row and the toolbar that appeared
 * only there.
 */
export default function YouSheet({ open, onClose, me, presence, tones, onPresence }: {
  open: boolean;
  onClose: () => void;
  me: { name: string; photo: string | null };
  presence: Presence;
  tones: Record<Presence, string>;
  onPresence: (p: Presence) => void;
}) {
  const navigate = useNavigate();
  const app = useGymApp();
  const rows = ROWS.filter((r) => moduleOn(app, r.module));
  const go = (path: string) => { onClose(); navigate(path); };
  return (
    <GlassSheet open={open} onClose={onClose} title="You">
      <div style={{ padding: '0 var(--gutter) 16px' }} data-you-sheet>
        <div className="flex items-center" style={{ gap: 12 }}>
          <Avatar name={me.name} photoUrl={me.photo} size={52} />
          <div className="min-w-0">
            <p className="truncate" style={{ fontSize: 19, fontWeight: 800, color: 'var(--color-text-primary)' }}>{me.name}</p>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>Coach</p>
          </div>
        </div>
        <div role="radiogroup" aria-label="Your status" className="flex flex-wrap" style={{ gap: 6, marginTop: 12 }}>
          {(['available', 'away', 'on_leave'] as Presence[]).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={presence === p} onClick={() => onPresence(p)}
              className="inline-flex items-center noc-press" style={{ gap: 6, padding: '5px 11px', borderRadius: 999, fontSize: 12.5,
                fontWeight: presence === p ? 700 : 500,
                border: `1px solid ${presence === p ? 'var(--color-primary)' : 'var(--color-hairline)'}`,
                background: presence === p ? 'var(--color-primary-light)' : 'transparent',
                color: presence === p ? 'var(--color-primary-300)' : 'var(--color-text-secondary)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: tones[p] }} />{PRESENCE_LABEL[p]}
            </button>
          ))}
        </div>
        <section style={{ marginTop: 8 }} aria-label="Your screens">
          {rows.map((r, i) => (
            <LineRow key={r.path} icon={r.icon} tone={i === 0 ? 'mine' : 'info'} title={r.label} meta={r.blurb}
              action={<CaretRight size={14} />} actionTone="muted" onClick={() => go(r.path)} last={i === rows.length - 1} />
          ))}
        </section>
      </div>
    </GlassSheet>
  );
}
