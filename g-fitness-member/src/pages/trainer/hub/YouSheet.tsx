import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Barbell, Books, Buildings, CalendarBlank, CaretRight, Clock, GearSix, Question, Handshake, Trophy, UserCircle, type Icon } from '@phosphor-icons/react';
import GlassSheet from '../../../components/ui/GlassSheet';
import Avatar from '../../../components/ui/Avatar';
import { LineRow } from '../../../components/ui/noc';
import { PRESENCE_LABEL, type Presence } from '../../../lib/api/presence';
import { myCoachings } from '../../../lib/api/coaching';
import { useGymApp } from '../../../hooks/useGymApp';
import { moduleOn, type FeatureKey } from '../../../lib/gymApp';

interface Dest { label: string; blurb: string; path: string; icon: Icon; module?: FeatureKey }

/** The coach's own work, as four tiles. */
const WORK: Dest[] = [
  { label: 'Schedule', blurb: 'Your sessions this week', path: '/trainer/schedule', icon: CalendarBlank },
  { label: 'Hours', blurb: 'When members can book you', path: '/trainer/schedule?tab=hours', icon: Clock },
  { label: 'Packages', blurb: 'Monthly coaching: asked, paid, training', path: '/trainer/packages', icon: Handshake, module: 'coaching' },
  { label: 'Library', blurb: 'Exercises and programs', path: '/trainer/exercises', icon: Books },
];
/** Everything else, as a short list. */
const REST: Dest[] = [
  { label: 'Profile', blurb: 'Photo, bio and ratings', path: '/trainer/profile', icon: UserCircle },
  { label: 'Achievements', blurb: 'Badges you have earned', path: '/trainer/achievements', icon: Trophy, module: 'engagement' },
  { label: 'Equipment', blurb: 'What the gym has, and what needs fixing', path: '/trainer/equipment', icon: Barbell, module: 'equipment' },
  // Coaches work at more than one gym; this is how they switch.
  { label: 'Gyms', blurb: 'Switch to another gym you coach at', path: '/choose-gym', icon: Buildings },
  { label: 'Settings', blurb: 'Alerts, sign-in, language', path: '/trainer/settings', icon: GearSix },
  { label: 'Help', blurb: 'Tours of each screen, your gym, terms', path: '/trainer/help', icon: Question },
];

/**
 * You — Discord's user panel for a coach (redesign, 2026-10-27): tap your name
 * in the bar at the bottom. Your status; then your work as four tiles, each
 * with a line it read (wave 2: this week's classes, what packages need of you);
 * then the rest as a short list. Every screen is still gated by the gym's switches.
 */
export default function YouSheet({ open, onClose, me, presence, tones, onPresence, classesThisWeek }: {
  open: boolean;
  onClose: () => void;
  me: { name: string; photo: string | null };
  presence: Presence;
  tones: Record<Presence, string>;
  onPresence: (p: Presence) => void;
  /** The coach's classes from now to Sunday, from the hub's own read. */
  classesThisWeek: number;
}) {
  const navigate = useNavigate();
  const app = useGymApp();
  const coachingOn = moduleOn(app, 'coaching');
  const [coachingNeeds, setCoachingNeeds] = useState<number | null>(null);
  useEffect(() => {
    if (!open || !coachingOn) return;
    let alive = true;
    void (async () => {
      const list = await myCoachings().catch(() => null);
      if (!alive || !list) return;
      setCoachingNeeds(list.filter((c) => c.iAm === 'coach'
        && (c.status === 'requested' || (c.status === 'payment_sent' && c.feeMode === 'trainer_direct'))).length);
    })();
    return () => { alive = false; };
  }, [open, coachingOn]);

  const work = WORK.filter((r) => moduleOn(app, r.module));
  const rest = REST.filter((r) => moduleOn(app, r.module));
  const go = (path: string) => { onClose(); navigate(path); };
  const line = (d: Dest): { text: string; act?: boolean } => {
    if (d.label === 'Schedule' && classesThisWeek) return { text: `${classesThisWeek} ${classesThisWeek === 1 ? 'class' : 'classes'} this week` };
    if (d.label === 'Packages' && coachingNeeds) return { text: `${coachingNeeds} need${coachingNeeds === 1 ? 's' : ''} you`, act: true };
    return { text: d.blurb };
  };

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

        <p className="eyebrow" style={{ marginTop: 18 }}>Your work</p>
        <section aria-label="Your work" className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 8 }} data-you-work>
          {work.map((d) => {
            const TileIcon = d.icon;
            const l = line(d);
            return (
              <button key={d.path} type="button" className="you-tile noc-press" onClick={() => go(d.path)}>
                <TileIcon size={22} style={{ color: 'var(--color-primary-300)' }} />
                <b>{d.label}</b>
                <small style={l.act ? { color: 'var(--color-secondary-300)', fontWeight: 600 } : undefined}>{l.text}</small>
              </button>
            );
          })}
        </section>

        <p className="eyebrow" style={{ marginTop: 18 }}>You</p>
        <section aria-label="Your screens">
          {rest.map((r, i) => (
            <LineRow key={r.path} icon={r.icon} tone="info" title={r.label} meta={r.blurb}
              action={<CaretRight size={14} />} actionTone="muted" onClick={() => go(r.path)} last={i === rest.length - 1} />
          ))}
        </section>
      </div>
    </GlassSheet>
  );
}
