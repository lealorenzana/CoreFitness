// Thin wrapper around Supabase Auth (see supabase/README.md for backend setup).
// The old mock MOCK_USERS / plaintext-password login has been removed.
//
// getCurrentUser()/isAuthenticated() still read a localStorage cache populated by
// login() below — several pages (BookClass, BookingHistory, Home, PaymentHistory,
// RenewMembership, Trainers) read this cache synchronously and haven't yet been
// migrated to the async src/lib/api/* layer. membershipType/membershipStatus are
// left blank here since that data now lives in a separate memberships table —
// those fields will populate once each consuming page migrates.

import { supabase } from '../lib/supabaseClient';
import { clearPushOnSignOut } from '../lib/api/push';
import { clearPageCache } from '../lib/pageCache';
import { clearScrollMemory } from '../hooks/useScrollMemory';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name?: string;
  membershipType: string;
  membershipStatus: string;
}

export interface LoginResult {
  success: boolean;
  user?: User;
  role?: 'admin' | 'trainer' | 'member';
  status?: 'active' | 'pending_approval' | 'suspended' | 'archived';
  error?: string;
}

export const login = async (email: string, password: string): Promise<LoginResult> => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { success: false, error: error?.message ?? 'Invalid email or password' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();
  if (profileError || !profile) {
    await supabase.auth.signOut();
    return { success: false, error: 'Could not load account profile' };
  }

  const userData: User = {
    id: profile.id,
    email: profile.email,
    firstName: profile.first_name,
    lastName: profile.last_name,
    name: `${profile.first_name} ${profile.last_name}`,
    membershipType: '',
    membershipStatus: '',
  };

  localStorage.setItem('user', JSON.stringify(userData));
  localStorage.setItem('isAuthenticated', 'true');

  return { success: true, user: userData, role: profile.role, status: profile.status };
};

/**
 * Every per-user key the app writes to `localStorage`.
 *
 * Kept in one place because it was previously five: Profile, TrainerProfile,
 * TrainerSettings, Onboarding and this function each cleared their own ad-hoc
 * subset, and they disagreed. `TrainerProfile` dropped only `isLoggedIn` and
 * `trainerMode`, leaving `memberId`, `memberEmail` and `memberName` behind — the
 * previous account's identity, sitting on a phone now in someone else's hands.
 *
 * `selectedGym` is deliberately absent: which branch you are looking at is a
 * property of the device, not of the person holding it.
 */
const PER_USER_KEYS = [
  'user', 'isAuthenticated', 'isLoggedIn', 'trainerMode',
  'memberId', 'memberEmail', 'memberName',
] as const;

/**
 * The single sign-out path. Order is load-bearing.
 *
 * Push is cleared *first*, while the session still belongs to the person
 * leaving — `push_subscriptions` deletes are gated on `user_id = auth.uid()`,
 * so after `signOut()` the delete matches nothing and still reports success.
 * That was the bug: the outgoing member's subscription survived, and their
 * notifications kept landing on the phone after a trainer signed in.
 *
 * The two in-memory caches go with them, for the same reason. Both are keyed by
 * screen, not by account, so whatever the member last saw on Home would be the
 * first frame the next person to sign in on this phone renders — their numbers,
 * their name, their next session — before the first query comes back and
 * replaces it. The same leak as the push subscription, in a different place.
 */
export const logout = async (): Promise<void> => {
  await clearPushOnSignOut();
  await supabase.auth.signOut();
  PER_USER_KEYS.forEach((k) => localStorage.removeItem(k));
  clearPageCache();
  clearScrollMemory();
};

/**
 * Rebuild the legacy cache from a live session.
 *
 * Staying signed in means `login()` does not run again on the next app launch —
 * and `login()` is the only thing that writes `localStorage['user']`. So if that
 * key is ever missing while the Supabase session is perfectly valid, the member
 * is *logged in* but the six pages still on `getCurrentUser()` (Home, BookClass,
 * BookingHistory, PaymentHistory, RenewMembership, Trainers) all read null and
 * render empty. A persistent session makes that window permanent instead of
 * lasting until the next sign-in, so it has to be repaired on boot.
 *
 * Cheap: returns immediately when the cache is already there, which is the
 * normal case. Never throws — a failure here must not block rendering.
 */
export const syncUserCache = async (): Promise<void> => {
  try {
    if (localStorage.getItem('user')) return;

    const { data } = await supabase.auth.getSession();   // local read, no network
    const userId = data.session?.user.id;
    if (!userId) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('id', userId)
      .single();
    if (!profile) return;

    const userData: User = {
      id: profile.id,
      email: profile.email,
      firstName: profile.first_name,
      lastName: profile.last_name,
      name: `${profile.first_name} ${profile.last_name}`,
      membershipType: '',
      membershipStatus: '',
    };
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('isAuthenticated', 'true');
  } catch {
    /* best effort — the async lib/api layer is the real source of truth */
  }
};

export const getCurrentUser = (): User | null => {
  const userData = localStorage.getItem('user');
  return userData ? JSON.parse(userData) : null;
};

export const isAuthenticated = (): boolean => {
  return localStorage.getItem('isAuthenticated') === 'true';
};
