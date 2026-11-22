import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Bell, X, Calendar, Banknote, AlertCircle, Clock, UserPlus, Mail } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useBranding } from '../../hooks/useBranding';
import { supabase } from '../../lib/supabaseClient';
import { listBellNotifications, setRead, INBOX_CHANGED } from '../../lib/api/notifications';
import type { NotificationRow } from '../../types/db';
import { dashboardService, type HeaderAlert } from '../../services/dashboardService';
import GlobalSearch from '../ui/GlobalSearch';
import { useRail } from './rail';
import { NAV_TIPS } from './nav';

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
  const [showNotifications, setShowNotifications] = useState(false);
  const [alerts, setAlerts] = useState<HeaderAlert[]>([]);
  const navigate = useNavigate();
  /** Messages sent to this person (the notifications rows) — unread ones ride in the bell too. */
  const [messages, setMessages] = useState<NotificationRow[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const brand = useBranding();
  const { current, leaf } = useRail();

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
      try {
        const uid = (await supabase.auth.getUser()).data.user?.id;
        if (uid) { const m = await listBellNotifications(uid); if (!cancelled) setMessages(m.filter((n) => !n.read)); }
      } catch { /* same rule as above */ }
    };
    load();
    const interval = setInterval(load, 30000);
    window.addEventListener(INBOX_CHANGED, load);
    return () => { cancelled = true; clearInterval(interval); window.removeEventListener(INBOX_CHANGED, load); };
  }, []);

  const visible = alerts.filter((a) => !dismissed.has(a.id));
  const unreadCount = visible.length + messages.length;

  // The tab line glides to the page you open (Design V2 pilot, 2026-11-23). Written straight to the DOM:
  // a measurement, not state. Until it is measured each tab keeps its own underline (no data-slide).
  const tabsRef = useRef<HTMLElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const nav = tabsRef.current, line = lineRef.current;
    if (!nav || !line) return;
    const place = () => {
      const on = nav.querySelector<HTMLElement>('.cf-tab[data-active="true"]');
      if (!on) { nav.removeAttribute('data-slide'); return; }
      const first = !nav.hasAttribute('data-slide');
      if (first) line.style.transition = 'none';   // the first placement appears in place; only later moves glide
      line.style.width = `${on.offsetWidth}px`;
      line.style.transform = `translateX(${on.offsetLeft}px)`;
      nav.setAttribute('data-slide', '');
      if (first) { void line.offsetWidth; line.style.transition = ''; }
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [current, leaf?.path]);

  return (
    <header className="cf-top sticky top-0 z-20" style={{ background: SURFACE, borderBottom: `1px solid ${BORDER}` }}>
      <div className="cf-top-row">
      {/* The gym, once (Design V2, shell B): its name, and its own tagline (else its town). The rail shows only its mark. */}
      <div className="cf-gym min-w-0">
        <b className="truncate">{brand.name}</b>
        {(brand.tagline || brand.address) && <span className="truncate" data-gym-tagline>{brand.tagline || brand.address}</span>}
      </div>

      {/* A search box sat here for months holding its own state, with no screen
          reading it — it was removed rather than left to swallow what you type.
          This one runs a real query against nine tables. */}
      <div className="flex-1 flex justify-end px-2 min-w-0">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label={unreadCount ? `${unreadCount} alert${unreadCount === 1 ? '' : 's'}` : 'Alerts'}
            data-tip={unreadCount ? `${unreadCount} thing${unreadCount === 1 ? '' : 's'} to look at — sign-ups, payments, bookings` : 'Alerts: nothing new'}
            className="cf-top-icon relative"
          >
            <Bell size={18} strokeWidth={1.75} style={{ color: TEXT_SECOND }} />
            {unreadCount > 0 && (
              <span
                className="cf-bell-count"
                data-bell-count
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
                  data-floating
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
                    {messages.slice(0, 5).map((n) => (
                      <button key={n.id} data-bell-message
                        onClick={() => {
                          void setRead([n.id], true).then(() => window.dispatchEvent(new Event(INBOX_CHANGED))).catch(() => {});
                          setShowNotifications(false);
                          navigate(n.action_url && n.action_url.startsWith('/') && !/^\/(member|trainer)\b/.test(n.action_url) ? n.action_url : '/inbox');
                        }}
                        className="w-full text-left p-4 transition-colors flex items-start gap-3"
                        style={{ borderBottom: `1px solid ${BORDER}`, background: 'transparent' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = PRIMARY_LIGHT)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: PRIMARY_LIGHT }}>
                          <Mail size={16} style={{ color: PRIMARY }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          {n.type === 'platform_message' && <p className="text-[11px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: PRIMARY }} data-from-core-fitness>From Core Fitness</p>}
                          <p className="text-sm font-medium text-white">{n.title}</p>
                          {n.message && <p className="text-xs mt-1 line-clamp-2" style={{ color: TEXT_SECOND }}>{n.message}</p>}
                        </div>
                      </button>
                    ))}
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
                    }) : messages.length > 0 ? null : (
                      <div className="p-10 text-center">
                        <Bell size={36} className="mx-auto mb-3" style={{ color: TEXT_MUTED }} />
                        <p className="text-sm" style={{ color: TEXT_SECOND }}>You're all caught up</p>
                      </div>
                    )}
                  </div>

                  {(
                    <div
                      className="p-3 flex items-center justify-between"
                      style={{ borderTop: `1px solid ${BORDER}`, background: SURFACE }}
                    >
                      <button onClick={() => { setShowNotifications(false); navigate('/inbox'); }} data-bell-see-all
                        className="text-xs font-semibold" style={{ color: PRIMARY }}>
                        See all notifications
                      </button>
                      {/* Dismiss hides for this session only. These are live
                          conditions, not messages — an expiring membership is
                          still expiring tomorrow, so it returns on reload. */}
                      {visible.length > 0 && (
                        <button
                          onClick={() => setDismissed(new Set(alerts.map((a) => a.id)))}
                          className="text-xs font-medium"
                          style={{ color: TEXT_MUTED }}
                        >
                          Dismiss alerts for now
                        </button>
                      )}
                    </div>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

      </div>
      </div>
      {/* The pages of the section you are in (rail.ts): where you are, and one tap to its neighbours. */}
      <nav ref={tabsRef} className="cf-tabs" aria-label={current ? `${current.label} pages` : 'Pages'}>
        <span ref={lineRef} className="cf-tabs-line" aria-hidden />
        {current && (
          <>
            <span className="cf-tabs-sec">{current.label}</span>
            {current.leaves.map((l) => (
              <NavLink key={l.path} to={l.path} className="cf-tab" data-active={leaf?.path === l.path} data-tip={NAV_TIPS[l.path]}
                aria-current={leaf?.path === l.path ? 'page' : undefined}>
                {l.label}
              </NavLink>
            ))}
          </>
        )}
      </nav>
    </header>
  );
}
