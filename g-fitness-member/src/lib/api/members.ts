import { supabase } from '../supabaseClient';
import type { ProfileRow, MemberProfileRow } from '../../types/db';

export interface MemberWithProfile {
  profile: ProfileRow;
  member: MemberProfileRow;
}

/**
 * Admin: the working member roster — everyone except archived members.
 * Includes suspended members so staff can see and reactivate them; archived
 * members are excluded by default (see listArchivedMembers).
 */
export async function listMembers(): Promise<MemberWithProfile[]> {
  const { data, error } = await supabase
    .from('member_profiles')
    .select('*, profiles!inner(*)')
    .neq('profiles.status', 'archived');
  if (error) throw error;
  return (data ?? []).map((row) => {
    const { profiles, ...member } = row as MemberProfileRow & { profiles: ProfileRow };
    return { profile: profiles, member: member as MemberProfileRow };
  });
}

export async function getMemberProfile(memberId: string): Promise<MemberWithProfile | null> {
  const { data, error } = await supabase
    .from('member_profiles')
    .select('*, profiles!inner(*)')
    .eq('profile_id', memberId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { profiles, ...member } = data as MemberProfileRow & { profiles: ProfileRow };
  return { profile: profiles, member: member as MemberProfileRow };
}

/** Thrown when the member has no `member_profiles` row yet — see below. */
export const NO_MEMBER_ROW = 'NO_MEMBER_ROW';

/**
 * Update the member's own row.
 *
 * The `.select()` is not decoration. A self-registering member is
 * `pending_approval` and has **no `member_profiles` row at all** — approval is
 * what creates it. A plain `.update()` matching zero rows is not an error in
 * PostgreSQL, so this returned success and wrote nothing, and the onboarding
 * experience-level question was silently discarded for every member who ever
 * answered it.
 *
 * Reading the row back is safe here specifically because the writer *is* the
 * row's owner and `member_profiles_select_self` covers them — this is the one
 * case the `.insert().select()` warning elsewhere does not apply to.
 */
export async function updateMemberProfile(
  memberId: string,
  updates: Partial<MemberProfileRow>
): Promise<void> {
  const { data, error } = await supabase
    .from('member_profiles')
    .update(updates)
    .eq('profile_id', memberId)
    .select('profile_id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error(NO_MEMBER_ROW);
}

/**
 * Is this address already an account? (migration 0027)
 *
 * For wording only — `handle_new_member_signup` and the unique constraint on
 * `auth.users.email` are what actually refuse the signup. A check here can be
 * beaten by two people submitting in the same second, and by anyone talking to
 * PostgREST without the form.
 *
 * Fails **open**: if the lookup itself errors we let the member carry on and
 * let the real boundary decide, rather than blocking a valid registration
 * because a network call dropped.
 */
export async function isEmailTaken(email: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_email_taken', { p_email: email.trim() });
  if (error) return false;
  return data === true;
}

/** Same contract as `isEmailTaken`. Compares digits only, so formatting differs freely. */
export async function isPhoneTaken(phone: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_phone_taken', { p_phone: phone.trim() });
  if (error) return false;
  return data === true;
}

export async function registerMember(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  requestedPlanId?: string;
  /**
   * Intake details (0031). They cannot be inserted from here — a
   * self-registering member has no `member_profiles` row and, under email
   * confirmation, no session either. They ride along as auth metadata for
   * `handle_new_member_signup` to park in `pending_registrations`, and the
   * front desk's approval copies them onto the member row.
   */
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  /** Whether the member ticked "I agree to the Terms and Privacy Policy".
   *  Only the answer travels: the *time* is stamped by Postgres in 0079's
   *  trigger, because a browser clock is not evidence of anything. */
  termsAccepted?: boolean;
  /**
   * True when the new account is already signed in.
   *
   * `signUp` returns a session only when the project has email confirmation
   * **off**. With it on — which is what migration 0005 exists to work around —
   * there is no session until the link in the email is clicked, and no amount
   * of client code can conjure one. The caller branches on this instead of
   * assuming either way.
   */
}): Promise<{ signedIn: boolean }> {
  const { data, error: signUpError } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        signup_source: 'member_self_registration',
        first_name: input.firstName,
        last_name: input.lastName,
        phone: input.phone ?? null,
        requested_plan_id: input.requestedPlanId ?? null,
        // Empty strings rather than null: the trigger runs every value through
        // `nullif(…, '')`, so both collapse to NULL, and a missing key would
        // read as `meta->>'x' is null` either way. Sending '' keeps the shape
        // of the metadata stable across signups.
        date_of_birth: input.dateOfBirth ?? '',
        gender: input.gender ?? '',
        address: input.address ?? '',
        emergency_contact_name: input.emergencyContactName ?? '',
        emergency_contact_phone: input.emergencyContactPhone ?? '',
        emergency_contact_relationship: input.emergencyContactRelationship ?? '',
        // Read by handle_new_member_signup() (0079), which stamps
        // member_profiles.terms_accepted_at with its own clock when this is
        // exactly 'true'. A string, because metadata reaches the trigger as
        // text either way and `meta->>'terms_accepted'` compares against one.
        terms_accepted: input.termsAccepted ? 'true' : 'false',
      },
    },
  });
  if (signUpError) throw signUpError;

  // Signing up with an address that already has an account does **not** return
  // an error. Supabase answers with a user whose `identities` array is empty,
  // so that this endpoint cannot be used to discover who has an account.
  //
  // Left unhandled that is the worst possible outcome for the member: the app
  // congratulates them, no account is created, `handle_new_member_signup` never
  // fires, and they turn up at the gym expecting to be in the system. Telling
  // them the address is taken gives up a little enumeration resistance on a
  // single-gym app, which is the right trade against a signup that silently
  // does nothing.
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    throw new Error('An account already exists for that email. Try signing in instead.');
  }

  return { signedIn: data.session != null };
}
