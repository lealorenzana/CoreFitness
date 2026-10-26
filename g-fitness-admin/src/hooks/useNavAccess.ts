import { useEffect, useMemo, useState } from 'react';
import { getGymContext } from '../lib/gymContext';
import { myStaffPermissions, type StaffArea } from '../lib/api/staffPermissions';
import { useGymModules } from './useGymModules';
import { navVisible, type Leaf } from '../components/layout/nav';

/**
 * The sidebar's own rule for which pages this account sees (owner-only rows,
 * switched-off parts, a narrowed desk account), for anything else that lists
 * pages — global search. Until the role resolves it answers as an owner would,
 * as the sidebar does; the guard is ProtectedRoute and RLS either way.
 */
export function useNavAccess(): (l: Leaf) => boolean {
  const modules = useGymModules();
  const [isAdmin, setIsAdmin] = useState(true);
  const [areas, setAreas] = useState<StaffArea[] | null>(null);
  useEffect(() => {
    let alive = true;
    void getGymContext().then((ctx) => { if (alive) setIsAdmin(ctx?.role === 'admin'); });
    void myStaffPermissions().then((a) => { if (alive) setAreas(a); });
    return () => { alive = false; };
  }, []);
  return useMemo(() => navVisible(isAdmin, modules, areas), [isAdmin, modules, areas]);
}
