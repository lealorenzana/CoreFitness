import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, Users, CheckSquare, Target, Banknote,
  CreditCard, Dumbbell, CalendarDays, Calendar, Settings,
  LogOut, ChevronRight, ChevronDown, PartyPopper, Bell, BookOpen, History,
  Trophy, ListChecks, Gift, Flag, ShieldCheck, UserCheck, TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from '../ui/sonner';
import { supabase } from '../../lib/supabaseClient';

const BG           = 'var(--color-bg)';
const SURFACE      = 'var(--color-surface)';
const BORDER       = 'var(--color-border)';
const PRIMARY      = 'var(--color-primary)';
const PRIMARY_LIGHT = 'var(--color-primary-light)';
const SECONDARY    = 'var(--color-secondary)';
const TEXT_SECOND  = 'var(--color-text-secondary)';
const TEXT_MUTED   = 'var(--color-text-muted)';

interface Leaf {
  label: string;
  path: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

interface Group {
  /** Also the key the open/closed state is stored under. */
  label: string;
  icon: LucideIcon;
  children: Leaf[];
}

type Entry = Leaf | Group;

const isGroup = (e: Entry): e is Group => 'children' in e;

/**
 * The nav, ordered by how often the desk needs it and grouped by what belongs
 * together.
 *
 * It was one flat list of 21 links under four headings, ordered by the accident
 * of when each page was written: Attendance sat tenth, below Notifications, and
 * its own history report sat in a different section entirely. Twenty-one
 * destinations is more than anyone scans — so related pages now collapse under
 * one row and only the section you are working in is open.
 *
 * Attendance is first after the dashboard because it is the one screen this gym
 * uses every single day.
 *
 * A group whose children are all `adminOnly` disappears for front-desk staff,
 * and one left with a single child renders as a plain link rather than a folder
 * holding one thing — so `staff` sees a shorter, flatter version of the same nav
 * instead of a row of empty drawers.
 */
const NAV: Entry[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },

  {
    label: 'Attendance',
    icon: CheckSquare,
    children: [
      { label: 'Log attendance', path: '/attendance', icon: UserCheck },
      { label: 'History', path: '/attendance-history', icon: History },
    ],
  },
  {
    label: 'People',
    icon: Users,
    children: [
      { label: 'Members', path: '/members', icon: Users },
      { label: 'Trainers', path: '/trainers', icon: Dumbbell, adminOnly: true },
      { label: 'Credentials', path: '/credentials', icon: ShieldCheck, adminOnly: true },
    ],
  },
  {
    label: 'Classes',
    icon: CalendarDays,
    children: [
      { label: 'Schedule', path: '/schedule', icon: CalendarDays },
      { label: 'Bookings', path: '/bookings', icon: Calendar },
      { label: 'Events', path: '/events', icon: PartyPopper },
    ],
  },
  {
    label: 'Billing',
    icon: CreditCard,
    children: [
      { label: 'Payments', path: '/payments', icon: CreditCard },
      { label: 'Plans', path: '/membership-plans', icon: Banknote, adminOnly: true },
    ],
  },
  {
    label: 'Reports',
    icon: TrendingUp,
    children: [
      { label: 'Revenue', path: '/revenue', icon: Banknote },
      { label: 'Retention', path: '/retention', icon: Target },
      { label: 'Activity log', path: '/activity', icon: History, adminOnly: true },
    ],
  },
  {
    label: 'Engagement',
    icon: Trophy,
    children: [
      { label: 'Challenges', path: '/challenges', icon: Flag, adminOnly: true },
      { label: 'Rewards', path: '/rewards', icon: Gift, adminOnly: true },
      { label: 'Achievements', path: '/achievements', icon: Trophy, adminOnly: true },
      { label: 'Notifications', path: '/notifications', icon: Bell },
    ],
  },
  {
    label: 'Training',
    icon: BookOpen,
    children: [
      { label: 'Exercises', path: '/exercises', icon: ListChecks, adminOnly: true },
      { label: 'Resources', path: '/resources', icon: BookOpen },
    ],
  },

  { label: 'Settings', path: '/settings', icon: Settings, adminOnly: true },
];

/** The group a path lives in, or null for a top-level page. */
function groupHolding(pathname: string): string | null {
  for (const e of NAV) {
    if (isGroup(e) && e.children.some((c) => c.path === pathname)) return e.label;
  }
  return null;
}

const ICON_RAIL_W = 56;
const DETAIL_W = 208;
const STORAGE_KEY = 'admin_sidebar_collapsed';
const OPEN_KEY = 'admin_sidebar_open_groups';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(true);

  // Hide admin-only destinations from front-desk staff. Cosmetic only — the real
  // enforcement is ProtectedRoute's adminOnly guard plus RLS. Defaults to true so
  // an admin never sees the nav flicker while the role resolves.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (active) setIsAdmin(data?.role === 'admin');
    })();
    return () => { active = false; };
  }, []);

  /**
   * The nav with anything this role cannot reach removed, and any group left
   * holding exactly one child flattened into that child.
   */
  const entries = useMemo<Entry[]>(() => {
    const visible = (l: Leaf) => isAdmin || !l.adminOnly;
    const out: Entry[] = [];
    for (const e of NAV) {
      if (!isGroup(e)) {
        if (visible(e)) out.push(e);
        continue;
      }
      const children = e.children.filter(visible);
      if (children.length === 0) continue;
      if (children.length === 1) { out.push(children[0]); continue; }
      out.push({ ...e, children });
    }
    return out;
  }, [isAdmin]);

  /**
   * Which drawers are open — remembered, so the section you work in every day
   * is already open the next time the dashboard is launched.
   *
   * Opening the group holding the current page is done *here*, in the lazy
   * initialiser, rather than in an effect watching the route. An effect that
   * calls `setState` on render is the `set-state-in-effect` mistake this
   * codebase keeps making; and it isn't needed, because a closed group holding
   * the current page already paints itself selected (see `holdsActive` below).
   */
  const [open, setOpen] = useState<string[]>(() => {
    const here = groupHolding(window.location.pathname);
    try {
      const raw = localStorage.getItem(OPEN_KEY);
      const stored = raw ? (JSON.parse(raw) as string[]) : ['Attendance'];
      return here && !stored.includes(here) ? [...stored, here] : stored;
    } catch { return here ? ['Attendance', here] : ['Attendance']; }
  });

  const toggleGroup = (label: string) => {
    setOpen((prev) => {
      const next = prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label];
      try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
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
            data-tip="Expand"
          >
            <Dumbbell size={16} className="text-white" />
          </div>

          {/* One icon per entry. A group's icon opens its first page — the rail
              has no room to explain a folder, and landing on the section's main
              screen is what clicking it means anywhere else. */}
          <div className="flex-1 flex flex-col gap-1 w-full px-2 overflow-y-auto scrollbar-hide">
            {entries.map((entry) => {
              const Icon = entry.icon;
              const paths = isGroup(entry) ? entry.children.map((c) => c.path) : [entry.path];
              const isActive = paths.includes(location.pathname);
              const title = isGroup(entry)
                ? `${entry.label} — ${entry.children.map((c) => c.label).join(', ')}`
                : entry.label;
              return (
                <button
                  key={entry.label}
                  onClick={() => {
                    if (isGroup(entry)) setOpen((p) => (p.includes(entry.label) ? p : [...p, entry.label]));
                    navigate(paths[0]);
                  }}
                  className="w-10 h-10 mx-auto rounded-lg flex items-center justify-center transition-colors relative"
                  style={{
                    background: isActive ? PRIMARY_LIGHT : 'transparent',
                    color: isActive ? PRIMARY : TEXT_MUTED,
                  }}
                  data-tip={title}
                >
                  <Icon size={18} />
                  {/* A group is more than one destination; the dot says the icon
                      is a section rather than a page. */}
                  {isGroup(entry) && (
                    <span className="absolute bottom-1 right-1 w-1 h-1 rounded-full"
                      style={{ background: isActive ? PRIMARY : BORDER }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Bottom: Logout */}
          <div className="flex flex-col gap-1 w-full px-2 mt-2">
            <button
              onClick={handleLogout}
              className="w-10 h-10 mx-auto rounded-lg flex items-center justify-center transition-colors"
              style={{ color: SECONDARY }}
              data-tip="Logout"
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
        <nav className="flex-1 px-3 pb-3 overflow-y-auto scrollbar-hide space-y-0.5">
          {entries.map((entry) => {
            if (!isGroup(entry)) {
              const isActive = location.pathname === entry.path;
              return (
                <NavLink
                  key={entry.path}
                  to={entry.path}
                  className="flex items-center gap-2.5 px-3 h-9 rounded-lg text-[13px] font-medium transition-colors"
                  style={{
                    background: isActive ? PRIMARY_LIGHT : 'transparent',
                    color: isActive ? PRIMARY : TEXT_SECOND,
                  }}
                >
                  <entry.icon size={15} style={{ color: isActive ? PRIMARY : TEXT_MUTED }} />
                  <span className="truncate">{entry.label}</span>
                </NavLink>
              );
            }

            const expanded = open.includes(entry.label);
            const holdsActive = entry.children.some((c) => c.path === location.pathname);
            // A closed group holding the current page still has to look
            // selected, or the nav shows nothing highlighted while you are
            // plainly on one of its pages.
            const headerColor = holdsActive ? PRIMARY : TEXT_SECOND;

            return (
              <div key={entry.label}>
                <button
                  onClick={() => toggleGroup(entry.label)}
                  aria-expanded={expanded}
                  className="w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-[13px] font-medium transition-colors"
                  style={{
                    background: holdsActive && !expanded ? PRIMARY_LIGHT : 'transparent',
                    color: headerColor,
                  }}
                >
                  <entry.icon size={15} style={{ color: holdsActive ? PRIMARY : TEXT_MUTED }} />
                  <span className="truncate flex-1 text-left">{entry.label}</span>
                  <ChevronDown
                    size={12}
                    className="flex-shrink-0 transition-transform duration-200"
                    style={{
                      color: TEXT_MUTED,
                      transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                    }}
                  />
                </button>

                {expanded && (
                  // The guide line is what makes these read as *inside* the row
                  // above rather than as more top-level links.
                  <div className="ml-[22px] pl-2 mt-0.5 space-y-0.5"
                    style={{ borderLeft: `1px solid ${BORDER}` }}>
                    {entry.children.map((child) => {
                      const isActive = location.pathname === child.path;
                      return (
                        <NavLink
                          key={child.path}
                          to={child.path}
                          className="flex items-center gap-2 px-2.5 h-8 rounded-lg text-[12px] font-medium transition-colors"
                          style={{
                            background: isActive ? PRIMARY_LIGHT : 'transparent',
                            color: isActive ? PRIMARY : TEXT_SECOND,
                          }}
                        >
                          <child.icon size={13} style={{ color: isActive ? PRIMARY : TEXT_MUTED }} />
                          <span className="truncate">{child.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
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
