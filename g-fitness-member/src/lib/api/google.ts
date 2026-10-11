import { supabase } from '../supabaseClient';

/**
 * Signing up and in with Google (0190). Supabase does the Google part; the
 * account comes back to /auth/callback, which sends it on to `next` — a
 * sign-up's own address (its gym, link, code, invitation) — or, when the
 * account already belongs to a gym, signs it in like a password would.
 */
export async function continueWithGoogle(next: string): Promise<void> {
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw new Error(/provider is not enabled|Unsupported provider/i.test(error.message)
    ? 'Google sign-in is not switched on for this app yet. Use your email and password.'
    : error.message);
}

export interface SignupState {
  has_profile: boolean; gyms: number; applications: number; email: string | null;
  first_name: string | null; last_name: string | null; avatar_url: string | null;
}

/** What a signed-in account still needs. null with no session, or before 0190. */
export async function signupState(): Promise<SignupState | null> {
  const { data, error } = await supabase.rpc('my_signup_state');
  if (error) return null;
  return (data as SignupState | null) ?? null;
}

export interface FinishSignupInput {
  gymId: string; joinVia: string; joinCode?: string | null; referralCode?: string | null;
  firstName: string; lastName: string; phone?: string; dateOfBirth: string; guardianName?: string;
  gender?: string; address?: string; emergencyName?: string; emergencyPhone?: string; emergencyRelationship?: string;
  requestedPlanId?: string; termsVersion: string; privacyVersion: string;
}

/** A Google account joins its gym — the same rule as the email form. 'auto' = in; 'desk' = asked. */
export async function finishSignup(i: FinishSignupInput): Promise<'auto' | 'desk'> {
  const { data, error } = await supabase.rpc('finish_signup', {
    p_gym: i.gymId, p_via: i.joinVia, p_code: i.joinCode ?? null, p_referral: i.referralCode ?? null,
    p_first: i.firstName, p_last: i.lastName, p_phone: i.phone || null, p_dob: i.dateOfBirth, p_guardian: i.guardianName || null,
    p_gender: i.gender || null, p_address: i.address || null, p_emergency_name: i.emergencyName || null,
    p_emergency_phone: i.emergencyPhone || null, p_emergency_relationship: i.emergencyRelationship || null,
    p_requested_plan: i.requestedPlanId || null, p_terms_version: i.termsVersion, p_privacy_version: i.privacyVersion,
  });
  if (error) throw new Error(error.message);
  return data as 'auto' | 'desk';
}
