import { motion, AnimatePresence } from 'framer-motion';
import { useBranding } from '../../hooks/useBranding';
import { useState, useEffect } from 'react';
import { Bell, X, Calendar, Banknote, AlertCircle, Clock, UserPlus, MapPin } from 'lucide-react';
import { dashboardService, type HeaderAlert } from '../../services/dashboardService';
import { getMyProfile } from '../../lib/api/profiles';
import GlobalSearch from '../ui/GlobalSearch';

const SURFACE        = 'var(--color-surface)';
const SURFACE_RAISED = 'var(--color-surface-raised)';
const BORDER         = 'var(--color-border)';
const PRIMARY        = 'var(--color-primary)';
const PRIMARY_LIGHT  = 'var(--color-primary-light)';
const SECONDARY      = 'var(--color-secondary)';
const SECONDARY_BG   = 'var(--color-secondary-light)';
const TEXT_SECOND    = 'var(--color-text-secondary)';
const TEXT_MUTED     = 'var(--color-text-muted)';

const ICONS: Record<HeaderAlert['kind'], typeof Bell> = {
  expired: AlertCircle,
  expiring: Clock,
  registration: UserPlus,
  booking: Calendar,
  payment: Banknote,
};

export default function Header() {
  // `useGymContext` supplied a hardcoded gym name and location from a fixture.
  // The real ones live in `gym_settings` (0013/0067) and are read once by the
  // shell, so the header and the sidebar can no longer disagree.
  const brand = useBranding();
  const [showNotifications, setShowNotifications] = useState(false);
  const [alerts, setAlerts] = useState<HeaderAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [adminName, setAdminName] = useState<string | null>(null);
  const [adminRole, setAdminRole] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const list = await dashboardService.getHeaderAlerts();
        if (!cancelled) setAlerts(list);
      } catch {
        // A failed poll must not wipe what is already on screen, and must not
        // invent an "all caught up" state the data does not support.
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Real signed-in identity. This used to be a hardcoded "Admin / Super Admin",
  // which is exactly the fallback-identity trap the project rules call out.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const profile = await getMyProfile().catch(() => null);
      if (!profile || cancelled) return;
      setAdminName(`${profile.first_name} ${profile.last_name}`.trim() || null);
      setAdminRole(profile.role);
    })();
    return () => { cancelled = true; };
  }, []);

  const visible = alerts.filter((a) => !dismissed.has(a.id));
  const unreadCount = visible.length;
  const initials = adminName
    ? adminName.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase()
    : '';

  return (
    <header
      className="h-16 px-6 flex items-center gap-4 sticky top-0 z-20"
      style={{ background: SURFACE, borderBottom: `1px solid ${BORDER}` }}
    >
      <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 min-w-0">
        {/* One source for the name (0067). This was a literal that could
            disagree with the sidebar's literal, and the location came from a
            `selectedGym` fixture rather than from the gym's own settings. */}
        <div className="hidden lg:block min-w-0">
          <p className="text-sm font-semibold text-white truncate">{brand.name}</p>
          {brand.address && (
            <p className="text-xs flex items-center gap-1 truncate" style={{ color: TEXT_MUTED }}>
              <MapPin size={11} className="flex-shrink-0" /> {brand.address}
            </p>
          )}
        </div>
      </motion.div>

      {/* A search box sat here for months holding its own state, with no screen
          reading it — it was removed rather than left to swallow what you type.
          This one runs a real query against nine tables. */}
      <div className="flex-1 flex justify-center px-2">
        <GlobalSearch />
      </div>

      <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 flex-shrink-0">
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative w-10 h-10 rounded-full flex items-center justify-center transition-colors"
            style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}` }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = PRIMARY)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
          >
            <Bell size={16} style={{ color: TEXT_SECOND }} />
            {unreadCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-black"
                style={{ background: SECONDARY }}
              >
                {unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {showNotifications && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  transition={{ duration: 0.18 }}
                  className="absolute right-0 top-full mt-2 w-[400px] rounded-2xl shadow-2xl overflow-hidden z-50"
                  style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}` }}
                >
                  <div className="p-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${BORDER}`, background: SURFACE }}>
                    <div>
                      <h3 className="text-white font-semibold text-sm">Notifications</h3>
                      <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
                        {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                      </p>
                    </div>
                    <button onClick={() => setShowNotifications(false)} style={{ color: TEXT_MUTED }}>
                      <X size={18} />
                    </button>
                  </div>

                  <div className="max-h-[440px] overflow-y-auto">
                    {visible.length > 0 ? visible.map((n) => {
                      const Icon = ICONS[n.kind];
                      const high = n.priority === 'high';
                      return (
                        <button
                          key={n.id}
                          onClick={() => { if (n.actionUrl) window.location.href = n.actionUrl; }}
                          className="w-full text-left p-4 transition-colors flex items-start gap-3"
                          style={{ borderBottom: `1px solid ${BORDER}`, background: 'transparent' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = PRIMARY_LIGHT)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: high ? SECONDARY_BG : PRIMARY_LIGHT }}
                          >
                            <Icon size={16} style={{ color: high ? SECONDARY : PRIMARY }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white">{n.title}</p>
                            <p className="text-xs mt-1" style={{ color: TEXT_SECOND }}>{n.message}</p>
                            <p className="text-xs mt-1.5" style={{ color: TEXT_MUTED }}>{n.time}</p>
                          </div>
                        </button>
                      );
                    }) : (
                      <div className="p-10 text-center">
                        <Bell size={36} className="mx-auto mb-3" style={{ color: TEXT_MUTED }} />
                        <p className="text-sm" style={{ color: TEXT_SECOND }}>You're all caught up</p>
                      </div>
                    )}
                  </div>

                  {visible.length > 0 && (
                    <div
                      className="p-3 flex items-center justify-center"
                      style={{ borderTop: `1px solid ${BORDER}`, background: SURFACE }}
                    >
                      {/* Dismiss hides for this session only. These are live
                          conditions, not messages — an expiring membership is
                          still expiring tomorrow, so it returns on reload. */}
                      <button
                        onClick={() => setDismissed(new Set(alerts.map((a) => a.id)))}
                        className="text-xs font-medium"
                        style={{ color: PRIMARY }}
                      >
                        Dismiss for now
                      </button>
                    </div>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <div
          className="flex items-center gap-2.5 pl-2 pr-3 h-10 rounded-full cursor-pointer transition-colors"
          style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}` }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = PRIMARY)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
        >
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: PRIMARY }}>
            {initials}
          </div>
          {/* Renders nothing until the profile actually loads — no placeholder
              name, per the project's no-fallback-identity rule. */}
          {adminName && (
            <div className="hidden sm:block text-left">
              <p className="text-xs font-semibold text-white leading-tight">{adminName}</p>
              {adminRole && (
                <p className="text-xs leading-tight capitalize" style={{ color: TEXT_MUTED }}>{adminRole}</p>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </header>
  );
}
