import { useNavigate } from 'react-router-dom';
import Notifications from '../Notifications';
import { RAILS, type Tab } from './memberNav';
import { useTabHeaderOverride, type HeaderOverride } from './tabHeaderStore';
import { weekRangeLabel } from '../../utils/dates';

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

/**
 * A tab root's header: the big two-line title, the eyebrow and bell, a fading
 * rule, and the rail of that tab's own screens.
 *
 * Rendered by the shell above `<main>`, so it stays put while the page scrolls
 * — the rail is the way to that tab's other screens, and it should not scroll
 * away from the member looking for it. Only on the three roots: a pushed screen
 * has its own "Back" header, and stacking both would spend a third of the
 * screen on chrome.
 */
export default function TabHeader({ tab }: { tab: Tab }) {
  const navigate = useNavigate();
  const override = useTabHeaderOverride(tab.id);
  const [line1, line2] = titleFor(tab, new Date(), override);

  return (
    <header className="flex-none" style={{ padding: '6px var(--gutter) 0' }}>
      <h1>
        <span className="screen-title block">{line1}</span>
        {/* A non-breaking space holds the line's height while You's plan name
            loads, so the rail does not jump up and then down. */}
        <span className="screen-title block" style={{ color: 'var(--color-text-muted)' }}>
          {line2 || ' '}
        </span>
      </h1>

      <div className="flex items-end justify-between" style={{ marginTop: 14 }}>
        <p className="eyebrow">{tab.eyebrow}</p>
        <Notifications />
      </div>

      <div className="rule" style={{ marginTop: 12 }} />

      <nav aria-label={`${tab.label} screens`} className="rail" style={{
        margin: '0 calc(var(--gutter) * -1)',
        padding: '12px var(--gutter) 12px',
      }}>
        {RAILS[tab.id].map((d) => (
          <button
            key={d.path}
            onClick={() => navigate(d.path)}
            className="flex-none whitespace-nowrap transition-colors"
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
