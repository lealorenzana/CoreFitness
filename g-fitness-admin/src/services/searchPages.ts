import type { LucideIcon } from 'lucide-react';
import { NAV, NAV_TIPS, isGroup, type Leaf } from '../components/layout/nav';

/**
 * The places global search can open, matched in the browser: every page the
 * sidebar has, every tab inside one, and the jobs people come to do ("record a
 * payment", "print a receipt"). Records (members, payments, classes) come from
 * the database in searchService; these are the app's own map, so typing
 * "reports" finds Revenue, Retention and the Activity log instead of nothing.
 *
 * Each place names the sidebar row it lives under (`page`), so a place the
 * sidebar hides from this account — an owner-only page, a switched-off part, a
 * desk area left out — is hidden here too.
 */
export interface PlaceHit {
  id: string;
  title: string;
  /** Where it is: "Reports", "Settings → tab", or the page's one-line purpose. */
  subtitle: string;
  href: string;
  icon: LucideIcon;
  /** 'Page' for a sidebar row, 'Tab' inside one, 'Action' for a job. */
  tag: 'Page' | 'Tab' | 'Action';
}

interface Place {
  title: string;
  href: string;
  /** The sidebar row this lives under; its visibility is this place's. */
  page: string;
  tag: 'Tab' | 'Action';
  words?: string;
}

/** Tabs and jobs, each pointing at the URL that opens it. */
const PLACES: Place[] = [
  // Attendance
  { title: 'Check someone in', href: '/attendance', page: '/attendance', tag: 'Action', words: 'scan qr check-in door' },
  { title: 'Walk-ins', href: '/attendance/walk-ins', page: '/attendance', tag: 'Tab', words: 'day pass guest visitor' },
  { title: 'Attendance history', href: '/attendance-history', page: '/attendance', tag: 'Tab', words: 'past visits check-ins report' },
  { title: 'Kiosk', href: '/kiosk', page: '/attendance', tag: 'Action', words: 'self check-in counter screen tablet' },
  // People
  { title: 'Add a member', href: '/members?invite=1', page: '/members', tag: 'Action', words: 'new register sign up enrol' },
  { title: 'Registrations to approve', href: '/members?pending=1', page: '/members', tag: 'Action', words: 'pending approval sign-ups' },
  { title: 'Trainer credentials', href: '/trainers?view=credentials', page: '/trainers', tag: 'Tab', words: 'certificates licence coach documents' },
  { title: 'Invite staff or a coach', href: '/invitations', page: '/invitations', tag: 'Action', words: 'desk owner trainer email account' },
  // Billing
  { title: 'Record a payment', href: '/payments', page: '/payments', tag: 'Action', words: 'cash receipt pay renew invoice' },
  { title: 'End of day (cash drawer)', href: '/payments', page: '/payments', tag: 'Action', words: 'close drawer cash count' },
  { title: 'Sell at the counter', href: '/shop', page: '/shop', tag: 'Action', words: 'shop products sale pos' },
  // Engagement
  { title: 'Gym goal', href: '/challenges?tab=gg', page: '/challenges', tag: 'Tab', words: 'together target' },
  { title: 'Squads', href: '/challenges?tab=sq', page: '/challenges', tag: 'Tab', words: 'groups teams' },
  { title: 'Reward requests', href: '/rewards?tab=requests', page: '/rewards', tag: 'Tab', words: 'redeem approve points' },
  { title: 'Rewards catalogue', href: '/rewards?tab=catalogue', page: '/rewards', tag: 'Tab', words: 'prizes items' },
  { title: 'How members earn points', href: '/rewards?tab=earning', page: '/rewards', tag: 'Tab', words: 'point rules' },
  { title: 'Monthly season', href: '/rewards?tab=season', page: '/rewards', tag: 'Tab', words: 'leaderboard ranking' },
  { title: 'Referrals', href: '/rewards?tab=referrals', page: '/rewards', tag: 'Tab', words: 'invite a friend refer' },
  { title: 'Points history', href: '/rewards?tab=history', page: '/rewards', tag: 'Tab', words: 'ledger' },
  // Communications
  { title: 'Send an announcement', href: '/notifications', page: '/notifications', tag: 'Action', words: 'message broadcast push notify' },
  { title: 'Events', href: '/events', page: '/notifications', tag: 'Tab', words: 'event calendar' },
  { title: 'Win-back messages', href: '/retention/messages', page: '/retention', tag: 'Tab', words: 'inactive lapsed churn' },
  // Your app
  { title: 'App look and colours', href: '/gym-app?tab=look', page: '/gym-app', tag: 'Tab', words: 'logo colour color theme brand' },
  { title: 'App words', href: '/gym-app?tab=words', page: '/gym-app', tag: 'Tab', words: 'vocabulary rename nouns' },
  { title: 'What you run', href: '/gym-app?tab=runs', page: '/gym-app', tag: 'Tab', words: 'modules features switches turn on off' },
  { title: 'Joining', href: '/gym-app?tab=join', page: '/gym-app', tag: 'Tab', words: 'join poster qr code sign up' },
  { title: 'AI coach and credits', href: '/gym-app?tab=coach', page: '/gym-app', tag: 'Tab', words: 'assistant ai credits' },
  { title: 'Online payments (PayMongo)', href: '/gym-app?tab=pay', page: '/gym-app', tag: 'Tab', words: 'paymongo gcash card online connect' },
  { title: 'Lobby TV', href: '/gym-app?tab=tv', page: '/gym-app', tag: 'Tab', words: 'tv screen display' },
  // Settings
  { title: 'Gym information', href: '/settings?tab=gym', page: '/settings', tag: 'Tab', words: 'name address contact logo' },
  { title: 'Hours and closed days', href: '/settings?tab=hours', page: '/settings', tag: 'Tab', words: 'opening holiday schedule' },
  { title: 'Checking in rules', href: '/settings?tab=checkin', page: '/settings', tag: 'Tab', words: 'check-in door' },
  { title: 'House rules', href: '/settings?tab=house-rules', page: '/settings', tag: 'Tab', words: 'rules policy' },
  { title: 'Waiver', href: '/settings?tab=waiver', page: '/settings', tag: 'Tab', words: 'par-q health liability' },
  { title: 'Booking rules', href: '/settings?tab=bookings', page: '/settings', tag: 'Tab', words: 'approval cancel quota' },
  { title: 'Coaching rules', href: '/settings?tab=coaching', page: '/settings', tag: 'Tab', words: '1-on-1 personal training' },
  { title: 'Walk-in prices', href: '/settings?tab=walk-ins', page: '/settings', tag: 'Tab', words: 'day pass guest fee' },
  { title: 'Refund rules', href: '/settings?tab=refunds', page: '/settings', tag: 'Tab', words: 'refund cancel freeze fee' },
  { title: 'Staff accounts', href: '/settings?tab=staff', page: '/settings', tag: 'Tab', words: 'desk permissions users' },
  { title: 'My profile', href: '/settings?tab=profile', page: '/settings', tag: 'Tab', words: 'account name photo' },
  { title: 'Security and password', href: '/settings?tab=security', page: '/settings', tag: 'Tab', words: 'password sign in' },
  // Help
  { title: 'Ask Core Fitness', href: '/help', page: '/help', tag: 'Action', words: 'support question problem contact' },
  { title: 'Suggest a feature', href: '/help?tab=ideas', page: '/help', tag: 'Action', words: 'idea feedback request' },
  { title: 'Rate Core Fitness', href: '/help?tab=rate', page: '/help', tag: 'Action', words: 'rating review feedback' },
];

/** Every sidebar row, with the drawer it sits in (so "reports" finds its pages). */
function rows(): { leaf: Leaf; group: string | null }[] {
  return NAV.flatMap((e): { leaf: Leaf; group: string | null }[] => (isGroup(e)
    ? e.children.map((leaf) => ({ leaf, group: e.label }))
    : [{ leaf: e, group: null }]));
}

/**
 * How well `term` matches: 0 = not at all. A title that starts with the term
 * beats a word in it, which beats a word that starts the same in the drawer,
 * the page's purpose or its keywords (word starts only: "pro" must not find
 * "approve"). Ties keep list order.
 */
function score(term: string, title: string, extra: string): number {
  const t = title.toLowerCase();
  if (t === term) return 100;
  if (t.startsWith(term)) return 80;
  if (t.split(/[\s()/-]+/).some((w) => w.startsWith(term))) return 60;
  if (t.includes(term)) return 40;
  const e = extra.toLowerCase();
  if (e.split(/[\s()/,-]+/).some((w) => w.startsWith(term))) return 25;
  return 0;
}

/** Every page this account can see, in sidebar order — the list shown before typing. */
export function allPages(visible: (l: Leaf) => boolean): PlaceHit[] {
  return rows().filter(({ leaf }) => visible(leaf)).map(({ leaf, group }) => ({
    id: `page:${leaf.path}`, title: leaf.label, subtitle: group ?? NAV_TIPS[leaf.path] ?? '',
    href: leaf.path, icon: leaf.icon, tag: 'Page' as const,
  }));
}

/** Pages, tabs and jobs matching `raw`, best first, at most `limit`. */
export function searchPlaces(raw: string, visible: (l: Leaf) => boolean, limit = 8): PlaceHit[] {
  const term = raw.trim().toLowerCase();
  if (!term) return [];
  const byPath = new Map(rows().map((r) => [r.leaf.path, r]));
  const found: { hit: PlaceHit; s: number }[] = [];
  for (const { leaf, group } of byPath.values()) {
    if (!visible(leaf)) continue;
    const s = score(term, leaf.label, `${group ?? ''} ${NAV_TIPS[leaf.path] ?? ''}`);
    if (s) found.push({ s: s + 5, hit: { id: `page:${leaf.path}`, title: leaf.label, subtitle: group ?? NAV_TIPS[leaf.path] ?? '', href: leaf.path, icon: leaf.icon, tag: 'Page' } });
  }
  for (const p of PLACES) {
    const owner = byPath.get(p.page);
    if (!owner || !visible(owner.leaf)) continue;
    const s = score(term, p.title, `${owner.leaf.label} ${owner.group ?? ''} ${p.words ?? ''}`);
    if (s) found.push({ s, hit: { id: `place:${p.href}:${p.title}`, title: p.title, subtitle: p.tag === 'Tab' ? `${owner.leaf.label} → tab` : owner.leaf.label, href: p.href, icon: owner.leaf.icon, tag: p.tag } });
  }
  return found.sort((a, b) => b.s - a.s).slice(0, limit).map((f) => f.hit);
}
