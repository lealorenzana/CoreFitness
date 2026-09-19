import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DotsNine, QrCode } from '@phosphor-icons/react';
import CheckInSheet from '../ui/CheckInSheet';
import EverythingSheet from './EverythingSheet';
import { TABS, tabForPath } from './memberNav';
import { useT } from '../../lib/i18n';
import { useLiveData } from '../../hooks/useLiveData';
import { getCurrentMemberId } from '../../services/bookingService';
import { checkedInSince } from '../../lib/api/attendance';

/** Local midnight, as an instant. See `checkedInSince`. */
function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/**
 * Has this member checked in today?
 *
 * One cheap yes/no for the bar, refreshed the way every live screen here is —
 * on return to the app, on focus, on a slow poll — and once more whenever the
 * sheet closes, because closing the sheet is the moment the desk may just have
 * scanned the code.
 *
 * A failed read leaves the last known answer standing. The block reads "Check
 * in" until proven otherwise, which is the safe default: the sheet itself
 * refuses to show a live code to someone already checked in, so a stale
 * "Check in" costs one tap, where a false "Checked in" would hide the code from
 * a member standing at the desk.
 */
function useCheckedInToday(): [boolean, () => void] {
  const [checkedIn, setCheckedIn] = useState(false);

  const refresh = useCallback(() => {
    void (async () => {
      try {
        const id = await getCurrentMemberId();
        if (!id) return;
        setCheckedIn(await checkedInSince(id, startOfToday()));
      } catch {
        // Keep the last answer; the next tick covers it.
      }
    })();
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useLiveData(refresh, { intervalMs: 60_000 });
  return [checkedIn, refresh];
}

/**
 * The bar: Today · Train · You · More, a hairline, and the check-in block.
 *
 * **In flow, not floating.** It is the last child of the chassis column, so
 * `<main>` ends where it begins and nothing can ever sit underneath it — the
 * failure the old floating dock caused on every long screen, and that the
 * Nocturne handoff's `position: absolute` would have reintroduced.
 *
 * Colour roles are the app's own: **violet** marks the tab you are on;
 * **amber** is the block's call to check in, and it turns violet once you have —
 * from something to do into something you have done.
 *
 * Every item keeps its label. The old dock showed a label only on the active
 * tab, so three of four destinations were a guess from a glyph.
 */
export default function TabBar() {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [checkedIn, refreshCheckIn] = useCheckedInToday();

  const active = tabForPath(location.pathname);
  // The bar marks a tab only on its root. On a pushed screen the tab still
  // colours its icon — you are inside it — but the underline mark means "this
  // screen", and it would be untrue two levels down.
  const onRoot = TABS.some((t) => t.path === location.pathname);

  const blockColour = checkedIn ? 'var(--color-primary-400)' : 'var(--color-secondary)';
  const blockEdge = checkedIn ? 'var(--color-primary)' : 'var(--color-secondary)';

  return (
    <>
      <nav
        aria-label="Main"
        className="flex-none flex items-stretch relative z-40"
        style={{
          height: 'var(--bar-height)',
          background: 'var(--color-bg)',
          borderTop: '1px solid rgba(233, 233, 237, 0.12)',
          padding: '0 14px 8px',
        }}
      >
        {TABS.map((tab) => {
          const isActive = active === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => { if (location.pathname !== tab.path) navigate(tab.path); }}
              aria-current={isActive && onRoot ? 'page' : undefined}
              className="flex-1 flex flex-col items-center justify-start noc-press"
              style={{
                gap: 5,
                paddingTop: 9,
                color: isActive ? 'var(--color-primary-400)' : 'var(--color-text-muted)',
              }}
            >
              {/* The mark scales open on the tab you land on and closes on the
                  one you left, so the selection visibly moves across the bar. */}
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
              {/* Keyed on the state, so becoming active remounts it and it pops. */}
              <span key={isActive ? 'on' : 'off'} className={isActive ? 'noc-pop flex' : 'flex'}>
                <Icon size={20} weight={isActive ? 'fill' : 'regular'} />
              </span>
              <span style={{ fontSize: 12, letterSpacing: '0.02em' }}>{t(tab.label)}</span>
            </button>
          );
        })}

        <button
          onClick={() => setMenuOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          className="flex-1 flex flex-col items-center justify-start noc-press"
          style={{ gap: 5, paddingTop: 9, color: 'var(--color-text-muted)' }}
        >
          <span aria-hidden style={{ width: 16, height: 2 }} />
          <DotsNine size={20} />
          <span style={{ fontSize: 12, letterSpacing: '0.02em' }}>{t('More')}</span>
        </button>

        <span aria-hidden style={{ width: 1, margin: '14px 10px 6px', background: 'rgba(233, 233, 237, 0.12)' }} />

        <button
          onClick={() => setSheetOpen(true)}
          aria-label={checkedIn ? 'Checked in today. Show my code' : 'Check in. Show my code'}
          // Breathes while there is a check-in to do; still once it is done.
          className={`flex-none flex flex-col items-center justify-center noc-press${checkedIn ? '' : ' noc-breathe'}`}
          style={{
            width: 92,
            marginTop: 10,
            gap: 3,
            borderRadius: 10,
            border: `1px solid ${blockEdge}`,
            background: `color-mix(in srgb, ${blockEdge} 12%, transparent)`,
            boxShadow: `0 0 22px -9px ${blockEdge}`,
            color: blockColour,
          }}
        >
          <span key={checkedIn ? 'done' : 'todo'} className="noc-pop flex">
            <QrCode size={21} weight={checkedIn ? 'regular' : 'bold'} />
          </span>
          <span style={{ fontSize: 12 }}>{t(checkedIn ? 'Checked in' : 'Check in')}</span>
        </button>
      </nav>

      <CheckInSheet open={sheetOpen} onClose={() => { setSheetOpen(false); refreshCheckIn(); }} />
      <EverythingSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
