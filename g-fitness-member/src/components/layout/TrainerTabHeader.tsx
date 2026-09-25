import { useNavigate } from 'react-router-dom';
import { GearSix } from '@phosphor-icons/react';
import Notifications from '../Notifications';
import Avatar from '../ui/Avatar';
import { IconButton } from './TabHeader';
import { TRAINER_RAILS, trainerTabs, type TrainerTab } from './trainerNav';
import { useGymApp } from '../../hooks/useGymApp';
import { word } from '../../lib/gymApp';
import { useMyIdentity } from '../../hooks/useMyIdentity';

/** From the device's own clock — the one thing a greeting can honestly know. */
function greetingFor(now: Date): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/**
 * The two title lines for a trainer tab root. Local dates only — never
 * `toISOString()`, which is yesterday in Manila until 8 AM.
 */
function titleFor(tab: TrainerTab, now: Date, fullName: string | undefined): [string, string] {
  switch (tab.id) {
    case 'home':
      return [
        now.toLocaleDateString('en-US', { weekday: 'long' }),
        now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }),
      ];
    case 'members':
      return ['My members', 'Who you coach'];
    case 'schedule':
      return ['Schedule', 'What you teach'];
    case 'bookings':
      return ['Bookings', 'You decide these'];
    case 'profile':
      // The name arrives with the identity read; until then the line holds its
      // height empty rather than showing a placeholder name.
      return ['Coach', fullName ?? ''];
  }
}

/**
 * A trainer tab root's header — the member app's `TabHeader`, laid out the same
 * way so the two roles read as one app (trainer's request, 2026-09-18):
 *
 *   Home        a top row: photo, greeting and first name (to Profile) on the
 *               left, the bell and Settings on the right; then the title
 *   the rest    the title with the bell and Settings beside it
 *   then the eyebrow, a fading rule, and the rail of that tab's own screens
 *
 * There is still no assistant on the trainer side (removed 2026-09-11).
 */
export default function TrainerTabHeader({ tab }: { tab: TrainerTab }) {
  const navigate = useNavigate();
  const me = useMyIdentity();
  const now = new Date();
  // This gym's own nouns (0114). Renamed here rather than in TrainerLayout so
  // the title, the eyebrow and the rail's aria-label all read one object D
  // three places taking the word from two sources is the drift trainerNav.ts
  // exists to prevent.
  const app = useGymApp();
  const named = trainerTabs(app).find((x) => x.id === tab.id) ?? tab;
  const [line1, line2] = titleFor(named, now, me?.fullName);
  const isHome = tab.id === 'home';
  const rail = TRAINER_RAILS[tab.id];

  const actions = (
    <div className="flex items-center flex-none" style={{ gap: 12 }}>
      <Notifications />
      <IconButton label="Settings" onClick={() => navigate('/trainer/settings')}>
        <GearSix size={17} />
      </IconButton>
    </div>
  );

  return (
    <header className="flex-none" style={{ padding: `${isHome ? 20 : 18}px var(--gutter) 0` }}>
      {isHome && (
        <div className="flex items-center justify-between" style={{ gap: 12, marginBottom: 16 }}>
          <button onClick={() => navigate('/trainer/profile')} className="flex items-center min-w-0 text-left noc-press"
            aria-label="Your profile" style={{ gap: 11 }}>
            <Avatar name={me?.fullName} photoUrl={me?.photoUrl} size={40} />
            <span className="min-w-0">
              <span className="block" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{greetingFor(now)}, {word(app, 'trainer', true)}</span>
              <span className="block truncate" style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {me?.firstName ?? ' '}
              </span>
            </span>
          </button>
          {actions}
        </div>
      )}

      <div className="flex items-start justify-between" style={{ gap: 12 }}>
        <h1 key={tab.id} className="noc-rise min-w-0">
          <span className="screen-title block">{line1}</span>
          <span className="screen-title block truncate" style={{ color: 'var(--color-text-muted)' }}>
            {line2 || ' '}
          </span>
        </h1>
        {!isHome && <div style={{ paddingTop: 4 }}>{actions}</div>}
      </div>

      <p className="eyebrow" style={{ marginTop: 12 }}>{named.eyebrow}</p>

      <div className="rule" style={{ marginTop: 12 }} />

      {rail.length > 0 ? (
        <nav aria-label={`${named.label} screens`} className="rail" style={{
          margin: '0 calc(var(--gutter) * -1)',
          padding: '12px var(--gutter) 12px',
        }}>
          {/* Plain pills with an icon — the member rail exactly. */}
          {rail.map((d) => {
            const RailIcon = d.icon;
            return (
              <button
                key={d.path}
                onClick={() => navigate(d.path)}
                className="flex-none whitespace-nowrap noc-press inline-flex items-center"
                style={{
                  gap: 7,
                  padding: '8px 13px 8px 11px',
                  borderRadius: 'var(--radius-pill)',
                  border: '1px solid var(--color-hairline)',
                  color: 'var(--color-text-secondary)',
                  fontSize: 12.5,
                }}
              >
                {RailIcon && <RailIcon aria-hidden size={15} style={{ color: 'var(--color-text-secondary)' }} />}
                {d.label}
              </button>
            );
          })}
        </nav>
      ) : (
        <div aria-hidden style={{ height: 12 }} />
      )}
    </header>
  );
}
