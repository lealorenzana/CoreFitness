import {
  LayoutDashboard, Users, CheckSquare, Target, Banknote,
  CreditCard, Dumbbell, CalendarDays, Calendar, Settings,
  Bell, BookOpen, History, MessagesSquare, ShoppingBag, LifeBuoy,
  Trophy, ListChecks, Gift, Flag, TrendingUp, Smartphone, MailPlus, CalendarRange, Handshake, Wrench, Inbox,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { StaffArea } from '../../lib/api/staffPermissions';
import { moduleOn, type Modules } from '../../hooks/useGymModules';

/**
 * The admin nav — one list, read by the sidebar and by global search, so a
 * page search finds is a page the sidebar shows (and the other way round).
 */
export interface Leaf {
  label: string;
  path: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  /** 0161: the desk area this row belongs to — hidden from a staff account the owner left it out of. */
  area?: StaffArea;
  /**
   * The gym-renameable noun this row is named after (0114).
   *
   * Named explicitly rather than matched inside `label`, because substring
   * substitution on a nav is how "Members" and "Membership plans" both become
   * "Athletes" and nobody can find the prices. Rows without one never rename.
   *
   * Group labels deliberately have no `noun`: a group's label is also the key
   * its open/closed state is stored under, so renaming one would silently
   * reopen every drawer the day the owner changed a word.
   */
  noun?: 'members' | 'trainers' | 'classes';
  /**
   * Other routes that belong to this row.
   *
   * A section split across tabs is one nav row pointing at its first tab. Without
   * this, standing on the second tab would leave the sidebar highlighting
   * nothing, which reads as "you have navigated out of the app".
   */
  alsoMatches?: string[];
  /**
   * The switch on Your app this page belongs to (0110/0141). Switched off, the
   * row goes — Your app promises it disappears from this dashboard too.
   */
  module?: string;
}

export interface Group {
  /** Also the key the open/closed state is stored under. */
  label: string;
  icon: LucideIcon;
  children: Leaf[];
}

export type Entry = Leaf | Group;

export const isGroup = (e: Entry): e is Group => 'children' in e;

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
export const NAV: Entry[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  // The owner's and desk's own inbox: alerts plus every message sent to them.
  { label: 'Notifications', path: '/inbox', icon: Inbox },

  // Today's desk and the historical record are one section with two tabs
  // (SectionTabs), so this is one row rather than a drawer holding two. First
  // after the dashboard because it is the one screen this gym uses every day.
  {
    label: 'Attendance',
    path: '/attendance',
    icon: CheckSquare,
    area: 'checkins',
    alsoMatches: ['/attendance-history'],
  },
  {
    label: 'People',
    icon: Users,
    children: [
      { label: 'Members', path: '/members', icon: Users, noun: 'members' },
      { label: 'Invitations', path: '/invitations', icon: MailPlus },
      { label: 'Trainers', path: '/trainers', icon: Dumbbell, adminOnly: true, noun: 'trainers' },
    ],
  },
  // Personal training (simplify, 2026-10-28): single sessions and monthly
  // packages on one page — what to decide, sessions, packages. It replaced
  // Bookings (for 1-on-1) and Coaching.
  {
    label: 'Personal training', path: '/personal-training', icon: Handshake, area: 'bookings',
    alsoMatches: ['/bookings', '/coaching'],
  },
  {
    label: 'Classes',
    icon: CalendarDays,
    children: [
      { label: 'Schedule', path: '/schedule', icon: CalendarDays, module: 'classes', area: 'bookings' },
      { label: 'Class bookings', path: '/bookings/classes', icon: Calendar, module: 'classes', area: 'bookings' },
    ],
  },
  {
    label: 'Billing',
    icon: CreditCard,
    children: [
      { label: 'Payments', path: '/payments', icon: CreditCard, area: 'payments' },
      // The counter (0133): the owner manages products, the desk sells.
      { label: 'Shop', path: '/shop', icon: ShoppingBag, module: 'shop', area: 'shop' },
      { label: 'Plans', path: '/membership-plans', icon: Banknote, adminOnly: true },
    ],
  },
  {
    label: 'Reports',
    icon: TrendingUp,
    children: [
      { label: 'Revenue', path: '/revenue', icon: Banknote, area: 'payments' },
      { label: 'Retention', path: '/retention', icon: Target, alsoMatches: ['/retention/messages'], module: 'analytics' },
      { label: 'Activity log', path: '/activity', icon: History, adminOnly: true },
    ],
  },
  {
    label: 'Engagement',
    icon: Trophy,
    children: [
      { label: 'Challenges', path: '/challenges', icon: Flag, adminOnly: true, module: 'engagement' },
      { label: 'Rewards', path: '/rewards', icon: Gift, adminOnly: true, module: 'points' },
      { label: 'Achievements', path: '/achievements', icon: Trophy, adminOnly: true, module: 'engagement' },
    ],
  },
  // Announcements and Events answered the same question — what has the gym told
  // its members — from two different sidebar sections, one under Engagement and
  // one under Classes. One row, two tabs. The tables stay separate; see
  // SectionTabs for why merging the records would be worse than merging the
  // screens.
  {
    label: 'Communications',
    path: '/notifications',
    icon: Bell,
    alsoMatches: ['/events'],
    module: 'push',
    area: 'communications',
  },
  {
    label: 'Training',
    icon: BookOpen,
    children: [
      { label: 'Exercises', path: '/exercises', icon: ListChecks, adminOnly: true },
      { label: 'Programs', path: '/programs', icon: CalendarRange, adminOnly: true, module: 'programs' },
      { label: 'Resources', path: '/resources', icon: BookOpen },
      // The gym's equipment and members' problem reports (0184).
      { label: 'Equipment', path: '/equipment', icon: Wrench, module: 'equipment' },
      // The trainers' rooms (0128): the desk reads and moderates.
      { label: 'Rooms', path: '/rooms', icon: MessagesSquare, module: 'rooms' },
    ],
  },

  { label: 'Your app', path: '/gym-app', icon: Smartphone, adminOnly: true },
  { label: 'Settings', path: '/settings', icon: Settings, adminOnly: true },
  // What this gym pays Core Fitness, and its receipts (0138).
  { label: 'Your plan', path: '/subscription', icon: CreditCard, adminOnly: true },
  // Talking to Core Fitness — questions (0137), ideas and ratings (0188) — owner and desk.
  { label: 'Help', path: '/help', icon: LifeBuoy },
];

/**
 * One sentence per destination, shown on hover and focus (TooltipLayer) — in
 * the expanded nav and the collapsed rail alike. It says what the page is *for*,
 * so a new desk hire can find their way without asking.
 */
export const NAV_TIPS: Record<string, string> = {
  '/dashboard': 'Today at a glance: members, money, check-ins and what needs you',
  '/attendance': "Check people in and see who is in today. History has every day before",
  '/members': 'Everyone who belongs here: memberships, payments, approvals and archiving',
  '/invitations': 'Invite owners, desk staff and coaches by email',
  '/trainers': 'Your coaches: their hours, sessions, ratings and who they coach',
  '/schedule': 'The class timetable: create classes, rooms and coaches',
  '/personal-training': 'Single sessions and monthly packages: what to decide, sessions, packages',
  '/bookings/classes': 'Every class booking, with cancellations — while the gym runs classes',
  '/payments': 'Record a payment, print a receipt, close the cash drawer',
  '/shop': 'What the gym sells at the counter, its stock, and the sales',
  '/membership-plans': 'The plans members can buy: prices, lengths and what each unlocks',
  '/revenue': 'Money in, by day, month and plan',
  '/retention': 'Members drifting away, and the win-back messages that reach them',
  '/activity': 'Everything staff did in the system, and when',
  '/challenges': "Challenges members join for points: this month's and the weekly quests",
  '/rewards': 'Rewards members can spend points on, and requests to approve',
  '/achievements': 'Badges members earn, and the rules that award them',
  '/inbox': 'What needs you now, and every message sent to you — read, unread and archived',
  '/notifications': 'Announcements and events: what the gym tells its members',
  '/exercises': "The exercise library: your gym's own photos, cues and hidden exercises",
  '/programs': "Multi-week programs members follow, built by you",
  '/resources': 'Articles and videos saved for members',
  '/rooms': "Coaches' rooms: their posts, classwork and members — read and moderate",
  '/gym-app': "How the member app looks: your logo, colours, words and join poster",
  '/settings': 'Gym details, hours, rules, waivers and staff accounts',
  '/subscription': 'What this gym pays Core Fitness, until when, and the receipts',
  '/help': 'Ask Core Fitness anything, ask for a feature, report a problem, or rate it',
  People: 'Members, invitations and coaches (with their certificates)',
  Classes: 'The timetable and every booking',
  Billing: 'Payments, the shop and membership plans',
  Reports: 'Revenue, retention and the activity log',
  Engagement: 'Challenges, rewards and badges',
  Training: 'Exercises, programs, resources and coaches\' rooms',
};

/** Whether this account may see a nav row: admin-only rows, switched-off parts
 *  (0110/0141) and a narrowed desk account's areas (0161). Cosmetic — the guard
 *  is ProtectedRoute plus RLS. */
export function navVisible(isAdmin: boolean, modules: Modules, areas: StaffArea[] | null) {
  return (l: Leaf) => (isAdmin || !l.adminOnly) && moduleOn(modules, l.module)
    && (isAdmin || !areas || !l.area || areas.includes(l.area));
}
