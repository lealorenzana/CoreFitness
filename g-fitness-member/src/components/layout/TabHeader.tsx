import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { GearSix, Lock, Sparkle } from '@phosphor-icons/react';
import Notifications from '../Notifications';
import Avatar from '../ui/Avatar';
import { RAILS, type Tab } from './memberNav';
import { useTabHeaderOverride, type HeaderOverride } from './tabHeaderStore';
import { weekRangeLabel } from '../../utils/dates';
import { useMyIdentity } from '../../hooks/useMyIdentity';
import { useFeatures } from '../../hooks/useFeatures';
import { isEnabled } from '../../lib/api/planFeatures';

/**
 * The two title lines for a tab root.
 *
 * Local dates throughout — built from the device's own calendar day, never from
 * `toISOString()`, which is yesterday in Manila until 8 AM.
 */
function titleFor(tab: Tab, now: Date, o: HeaderOverride | undefined): [string, string] {
  switch (tab.id) {
    case 'today':
      return [
        now.toLocaleDateString('en-US', { weekday: 'long' }),
        now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }),
      ];
    case 'train':
      // The Train matrix starts today and runs seven days, so the title names
      // exactly the days the matrix shows.
      // The page overrides both lines when the matrix moves to next week.
      return [o?.title ?? 'This week', o?.sub ?? weekRangeLabel(now)];
    case 'you':
      // The plan name arrives from the page. Until it does the line is empty
      // rather than a placeholder — a missed lookup renders nothing, never a
      // plausible default.
      return [o?.title ?? 'Your account', o?.sub ?? ''];
  }
}

/** From the device's own clock — the one thing a greeting can honestly know. */
function greetingFor(now: Date): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/**
 * A square icon control that matches the bell: 34px visible, 44px to a thumb.
 * Module scope — never declared inside the header's render body.
 */
function IconButton({
  label, onClick, children, badge,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <button onClick={onClick} aria-label={label} className="relative grid place-items-center noc-press"
      style={{ width: 44, height: 44, margin: -5 }}>
      <span className="relative grid place-items-center" style={{
        width: 34, height: 34, borderRadius: 8,
        border: '1px solid rgba(233, 233, 237, 0.14)',
        color: 'var(--color-text-secondary)',
      }}>
        {children}
        {badge}
      </span>
    </button>
  );
}

/**
 * A tab root's header.
 *
 *   top row   — your photo and a greeting on the left (to Profile); the
 *               assistant, the bell and Settings on the right
 *   title     — the big two lines
 *   eyebrow, a fading rule, and the rail of that tab's own screens
 *
 * The top row brings back what the Nocturne pass took away and members missed:
 * **who is signed in**, at a glance, and a **visible way to the assistant** — the
 * floating chat head went, and three quieter links in its place were not enough
 * for anyone to find it. Settings sits beside the bell because that is where
 * people look for it; it was two taps deep under Profile.
 *
 * The assistant button shows on every plan (gates lock and explain, never hide)
 * and carries a lock mark on a plan without it, as Today's buttons do.
 *
 * Top padding is real room under the status bar. The title used to start 6px
 * below the safe area and read as jammed against the top edge.
 *
 * Rendered by the shell above `<main>`, so it stays put while the page scrolls.
 * Only on the three roots: a pushed screen has its own "Back" header.
 */
export default function TabHeader({ tab }: { tab: Tab }) {
  const navigate = useNavigate();
  const override = useTabHeaderOverride(tab.id);
  const now = new Date();
  const [line1, line2] = titleFor(tab, now, override);
  const me = useMyIdentity();
  const { features } = useFeatures();
  // Unknown while loading is drawn as open, rather than flashing a lock.
  const assistantLocked = features != null && !isEnabled(features, 'ai_model');

  return (
    <header className="flex-none" style={{ padding: '20px var(--gutter) 0' }}>
      <div className="flex items-center justify-between" style={{ gap: 12 }}>
        <button onClick={() => navigate('/member/profile')} className="flex items-center min-w-0 text-left noc-press"
          aria-label="Your profile" style={{ gap: 11 }}>
          <Avatar name={me?.fullName} photoUrl={me?.photoUrl} size={40} />
          <span className="min-w-0">
            <span className="block" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{greetingFor(now)}</span>
            <span className="block truncate" style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>
              {me?.firstName ?? ' '}
            </span>
          </span>
        </button>

        <div className="flex items-center flex-none" style={{ gap: 12 }}>
          <IconButton
            label={assistantLocked ? 'AI assistant — not on your plan' : 'AI assistant'}
            onClick={() => navigate('/member/chatbot')}
            badge={assistantLocked ? (
              <span aria-hidden className="absolute grid place-items-center rounded-full" style={{
                right: -5, bottom: -5, width: 15, height: 15,
                background: 'var(--color-bg)', color: 'var(--color-text-muted)',
                boxShadow: 'inset 0 0 0 1px rgba(233, 233, 237, 0.14)',
              }}>
                <Lock size={9} weight="bold" />
              </span>
            ) : undefined}
          >
            <Sparkle size={17} weight="fill" style={{ color: assistantLocked ? undefined : 'var(--color-primary-300)' }} />
          </IconButton>
          <Notifications />
          <IconButton label="Settings" onClick={() => navigate('/member/settings')}>
            <GearSix size={17} />
          </IconButton>
        </div>
      </div>

      <h1 key={tab.id} className="noc-rise" style={{ marginTop: 16 }}>
        <span className="screen-title block">{line1}</span>
        {/* A non-breaking space holds the line's height while You's plan name
            loads, so the rail does not jump up and then down. */}
        <span className="screen-title block" style={{ color: 'var(--color-text-muted)' }}>
          {line2 || ' '}
        </span>
      </h1>

      <p className="eyebrow" style={{ marginTop: 12 }}>{tab.eyebrow}</p>

      <div className="rule" style={{ marginTop: 12 }} />

      <nav aria-label={`${tab.label} screens`} className="rail" style={{
        margin: '0 calc(var(--gutter) * -1)',
        padding: '12px var(--gutter) 12px',
      }}>
        {RAILS[tab.id].map((d) => (
          <button
            key={d.path}
            onClick={() => navigate(d.path)}
            className="flex-none whitespace-nowrap noc-press"
            style={{
              padding: '8px 13px',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--color-hairline)',
              color: 'var(--color-text-secondary)',
              fontSize: 12.5,
            }}
          >
            {d.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
