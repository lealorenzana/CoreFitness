import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Home, Users, Dumbbell, Banknote, TrendingUp, Trophy, MessagesSquare, BookOpen, Settings, LifeBuoy,
  type LucideIcon,
} from 'lucide-react';
import { NAV, isGroup, type Leaf } from './nav';
import { useNavAccess } from '../../hooks/useNavAccess';
import { DEFAULT_WORDS, title, useGymWords } from '../../hooks/useGymWords';

/**
 * The admin shell, Design V2 mock-up B (owner's pick, 2026-11-22): a rail of sections with a word under
 * every icon (LESSONS L7), and the section's pages as tabs in the header. Every page is still a `NAV`
 * leaf (search, access rules and the gym's own words keep working); this only says which section it
 * sits in. A page in no section still opens, it just lights no section.
 */
export interface RailSection { key: string; label: string; icon: LucideIcon; paths: string[]; foot?: boolean }

export const RAIL: RailSection[] = [
  { key: 'desk', label: 'Desk', icon: Home, paths: ['/dashboard', '/attendance', '/inbox'] },
  { key: 'people', label: 'People', icon: Users, paths: ['/members', '/invitations', '/referrals', '/trainers'] },
  { key: 'coaching', label: 'Coaching', icon: Dumbbell, paths: ['/personal-training', '/schedule', '/bookings/classes'] },
  { key: 'money', label: 'Money', icon: Banknote, paths: ['/payments', '/shop', '/membership-plans', '/revenue'] },
  { key: 'reports', label: 'Reports', icon: TrendingUp, paths: ['/retention', '/activity'] },
  { key: 'engage', label: 'Engage', icon: Trophy, paths: ['/challenges', '/rewards', '/achievements'] },
  { key: 'messages', label: 'Messages', icon: MessagesSquare, paths: ['/notifications', '/gym-chat'] },
  { key: 'library', label: 'Library', icon: BookOpen, paths: ['/exercises', '/programs', '/resources', '/reels', '/equipment', '/rooms'] },
  { key: 'gym', label: 'Gym', icon: Settings, paths: ['/gym-app', '/settings', '/lists', '/subscription'], foot: true },
  { key: 'help', label: 'Help', icon: LifeBuoy, paths: ['/help'], foot: true },
];

/** The words a tab says where the page's own name would read oddly beside its section. */
const TAB_LABEL: Record<string, string> = { '/dashboard': 'Today' };

const LEAVES: Leaf[] = NAV.flatMap((e) => (isGroup(e) ? e.children : [e]));
const BY_PATH = new Map(LEAVES.map((l) => [l.path, l]));

/** Is this page (or one of its tabs, or a record under it such as /members/abc) the one you are on? */
export const onLeaf = (l: Leaf, pathname: string) =>
  pathname === l.path || (l.alsoMatches?.includes(pathname) ?? false) || pathname.startsWith(`${l.path}/`);

export interface ShownSection extends RailSection { leaves: Leaf[] }

/** The sections this account can see (owner-only pages, switched-off parts and a narrowed desk account
 *  removed, as the menu always did), the one you are in, and the page. */
export function useRail(): { sections: ShownSection[]; current: ShownSection | null; leaf: Leaf | null } {
  const visible = useNavAccess();
  const words = useGymWords();
  const { pathname } = useLocation();
  const sections = useMemo(() => RAIL.map((s) => ({
    ...s,
    leaves: s.paths.map((p) => BY_PATH.get(p)).filter((l): l is Leaf => !!l && visible(l)).map((l) => {
      // The gym's own word for a page, only where the gym changed it (0114's per-key rule).
      const renamed = l.noun && words[l.noun] && words[l.noun] !== DEFAULT_WORDS[l.noun] ? title(words[l.noun]) : null;
      return { ...l, label: renamed ?? TAB_LABEL[l.path] ?? l.label };
    }),
  })).filter((s) => s.leaves.length > 0), [visible, words]);
  const current = sections.find((s) => s.leaves.some((l) => onLeaf(l, pathname))) ?? null;
  const leaf = current?.leaves.find((l) => onLeaf(l, pathname)) ?? null;
  return { sections, current, leaf };
}
