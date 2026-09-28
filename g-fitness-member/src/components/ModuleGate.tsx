import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Prohibit } from '@phosphor-icons/react';
import { getGymApp, moduleOn, type GymApp } from '../lib/gymApp';
import { moduleForPath, MODULE_NAMES } from '../lib/moduleRoutes';
import { useT } from '../lib/i18n';

/**
 * The screen between a switched-off part of the app and whoever reached it by
 * a link rather than a menu — a notification written before the owner turned
 * it off, a bookmark, a typed address (0110/0141). The menus already hide it;
 * this is the door they cannot hide.
 *
 * It says plainly that the gym turned it off, not that something broke, and
 * that nothing was lost: a switch hides, it never deletes.
 */
export default function ModuleGate({ home, children }: { home: string; children: React.ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const t = useT();
  const [app, setApp] = useState<GymApp | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void getGymApp().then((a) => { if (alive) setApp(a); });
    return () => { alive = false; };
  }, []);

  const key = moduleForPath(pathname);
  // Until the gym is known, show the screen: a switch is rare, a flash of "off" is worse.
  if (!key || app === undefined || moduleOn(app ?? null, key)) return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-16 gap-3" role="status">
      <span className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-300)' }}>
        <Prohibit size={26} />
      </span>
      <h1 className="text-lg font-semibold text-white">{t('Not at this gym')}</h1>
      <p className="text-sm max-w-xs" style={{ color: 'var(--color-text-secondary)' }}>
        {`${app?.gymName ?? t('Your gym')} ${t('does not use')} ${t(MODULE_NAMES[key])}. ${t('Nothing of yours was deleted — if they turn it back on, it is all still here.')}`}
      </p>
      <button type="button" onClick={() => navigate(home)}
        className="mt-2 h-11 px-5 rounded-full text-sm font-semibold"
        style={{ background: 'var(--color-secondary)', color: '#111' }}>
        {t('Back to the app')}
      </button>
    </div>
  );
}
