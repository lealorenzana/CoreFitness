import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Users, CheckSquare, Target, DollarSign,
  CreditCard, Dumbbell, CalendarDays, Calendar, Settings,
  LogOut, ChevronRight, PartyPopper,
} from 'lucide-react';
import { toast } from '../ui/sonner';

const BG           = 'var(--color-bg)';
const SURFACE      = 'var(--color-surface)';
const BORDER       = 'var(--color-border)';
const PRIMARY      = 'var(--color-primary)';
const PRIMARY_LIGHT = 'var(--color-primary-light)';
const SECONDARY    = 'var(--color-secondary)';
const TEXT_SECOND  = 'var(--color-text-secondary)';
const TEXT_MUTED   = 'var(--color-text-muted)';

const NAV_ITEMS = [
  { label: 'Dashboard',  path: '/dashboard',  icon: LayoutDashboard, section: 'Overview' },
  { label: 'Members',    path: '/members',    icon: Users,           section: 'Management' },
  { label: 'Trainers',   path: '/trainers',   icon: Dumbbell,        section: 'Management' },
  { label: 'Schedule',   path: '/schedule',   icon: CalendarDays,    section: 'Management' },
  { label: 'Bookings',   path: '/bookings',   icon: Calendar,        section: 'Management' },
  { label: 'Events',     path: '/events',     icon: PartyPopper,     section: 'Management' },
  { label: 'Attendance', path: '/attendance',  icon: CheckSquare,     section: 'Management' },
  { label: 'Retention',  path: '/retention',   icon: Target,          section: 'Reports' },
  { label: 'Revenue',    path: '/revenue',     icon: DollarSign,      section: 'Reports' },
  { label: 'Payments',   path: '/payments',    icon: CreditCard,      section: 'Reports' },
  { label: 'Settings',   path: '/settings',    icon: Settings,        section: 'Settings' },
];

const SECTIONS = ['Overview', 'Management', 'Reports', 'Settings'];
const ICON_RAIL_W = 56;
const DETAIL_W = 208;
const STORAGE_KEY = 'admin_sidebar_collapsed';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem('adminAuthenticated');
    localStorage.removeItem('adminUser');
    toast.success('Logged out successfully');
    navigate('/admin/login');
  };

  const totalWidth = collapsed ? ICON_RAIL_W : DETAIL_W;

  return (
    <aside
      className="h-screen fixed left-0 top-0 z-40 flex transition-all duration-300"
      style={{ width: totalWidth }}
    >
      {/* ─── Icon Rail (only visible when collapsed) ─── */}
      {collapsed && (
        <div
          className="h-full flex flex-col items-center py-4 gap-1 flex-shrink-0"
          style={{ width: ICON_RAIL_W, background: BG, borderRight: `1px solid ${BORDER}` }}
        >
          {/* Logo */}
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center mb-4 cursor-pointer"
            style={{ background: PRIMARY }}
            onClick={onToggle}
            title="Expand"
          >
            <Dumbbell size={16} className="text-white" />
          </div>

          {/* Nav icons */}
          <div className="flex-1 flex flex-col gap-1 w-full px-2 overflow-y-auto scrollbar-hide">
            {NAV_ITEMS.map(item => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className="w-10 h-10 mx-auto rounded-lg flex items-center justify-center transition-colors"
                  style={{
                    background: isActive ? PRIMARY_LIGHT : 'transparent',
                    color: isActive ? PRIMARY : TEXT_MUTED,
                  }}
                  title={item.label}
                >
                  <Icon size={18} />
                </NavLink>
              );
            })}
          </div>

          {/* Bottom: Logout */}
          <div className="flex flex-col gap-1 w-full px-2 mt-2">
            <button
              onClick={handleLogout}
              className="w-10 h-10 mx-auto rounded-lg flex items-center justify-center transition-colors"
              style={{ color: SECONDARY }}
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ─── Detail Panel (shows when not collapsed) ─── */}
      {!collapsed && (
        <div
          className="h-full flex flex-col overflow-hidden"
          style={{
            width: DETAIL_W,
            background: SURFACE,
            borderRight: `1px solid ${BORDER}`,
          }}
        >
        {/* Brand header with logo */}
        <div className="px-4 py-4 flex items-center gap-3 flex-shrink-0">
          <img src="/core-fitness-logo.png" alt="Core Fitness"
            className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white uppercase tracking-wide whitespace-nowrap">CORE FITNESS</p>
            <p className="text-[9px] uppercase tracking-[0.15em] whitespace-nowrap" style={{ color: TEXT_MUTED }}>ADMIN PANEL</p>
          </div>
        </div>
        {/* Collapse button — separate row */}
        <div className="px-4 pb-2 flex-shrink-0">
          <button
            onClick={onToggle}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-medium transition-colors"
            style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`, color: TEXT_MUTED }}
          >
            <ChevronRight size={12} className="rotate-180" /> Collapse
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 pb-3 overflow-y-auto scrollbar-hide space-y-4">
          {SECTIONS.map(section => {
            const items = NAV_ITEMS.filter(i => i.section === section);
            if (items.length === 0) return null;
            return (
              <div key={section}>
                <p className="px-3 mb-1.5 text-[9px] font-semibold tracking-[0.2em] uppercase"
                  style={{ color: TEXT_MUTED }}>{section}</p>
                <div className="space-y-0.5">
                  {items.map(item => {
                    const isActive = location.pathname === item.path;
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className="flex items-center gap-2.5 px-3 h-9 rounded-lg text-[13px] font-medium transition-colors"
                        style={{
                          background: isActive ? PRIMARY_LIGHT : 'transparent',
                          color: isActive ? PRIMARY : TEXT_SECOND,
                        }}
                      >
                        <item.icon size={15} style={{ color: isActive ? PRIMARY : TEXT_MUTED }} />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer — Logout */}
        <div className="px-3 py-3 flex-shrink-0" style={{ borderTop: `1px solid ${BORDER}` }}>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-[13px] font-medium transition-colors"
            style={{ color: SECONDARY }}
          >
            <LogOut size={15} />
            <span>Logout</span>
          </button>
        </div>
      </div>
      )}
    </aside>
  );
}

/** Hook to read & persist the sidebar collapsed state. */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; }
    catch { return false; }
  });

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 1280 && !collapsed) setCollapsed(true);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  return { collapsed, toggle };
}
