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

export const logout = async (): Promise<void> => {
  await supabase.auth.signOut();
  localStorage.removeItem('user');
  localStorage.removeItem('isAuthenticated');
};

export const getCurrentUser = (): User | null => {
  const userData = localStorage.getItem('user');
  return userData ? JSON.parse(userData) : null;
};

export const isAuthenticated = (): boolean => {
  return localStorage.getItem('isAuthenticated') === 'true';
};
