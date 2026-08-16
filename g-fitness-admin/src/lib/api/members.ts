import { supabase } from '../supabaseClient';
import type {
  ProfileRow,
  MemberProfileRow,
  PendingRegistrationRow,
  ProfileStatus,
} from '../../types/db';

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

/** Admin: archived members, kept for history (payments/attendance still reference them). */
export async function listArchivedMembers(): Promise<MemberWithProfile[]> {
  const { data, error } = await supabase
    .from('member_profiles')
    .select('*, profiles!inner(*)')
    .eq('profiles.status', 'archived');
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

/** Attendance/QR check-in lookup — resolves a scanned QR code back to a member. */
export async function getMemberByQrCode(qrCode: string): Promise<MemberWithProfile | null> {
  const { data, error } = await supabase
    .from('member_profiles')
    .select('*, profiles!inner(*)')
    .eq('qr_code', qrCode)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { profiles, ...member } = data as MemberProfileRow & { profiles: ProfileRow };
  return { profile: profiles, member: member as MemberProfileRow };
}

export async function updateMemberProfile(
  memberId: string,
  updates: Partial<MemberProfileRow>
): Promise<void> {
  // `.select()` so a write that matched no row is an error rather than a
  // silent success. A zero-row UPDATE is not an error in PostgreSQL, which is
  // how the member app's onboarding threw away every experience level it ever
  // collected. Admins can read these rows (member_profiles_select_admin), so
  // reading back is safe here.
  const { data, error } = await supabase
    .from('member_profiles')
    .update(updates)
    .eq('profile_id', memberId)
    .select('profile_id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('That member has no profile row yet — approve their registration first.');
  }
}

/** Admin: members awaiting approval. */
export async function listPendingRegistrations(): Promise<PendingRegistrationRow[]> {
  const { data, error } = await supabase
    .from('pending_registrations')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Admin approval: activates the profile, creates the member_profiles + memberships
 * rows, and clears the review-queue entry. Not atomic (supabase-js has no
 * client-side multi-table transaction) — acceptable for this foundation phase;
 * a production system would wrap this in a single `supabase.rpc()` Postgres function.
 */
export async function approveMemberRegistration(
  pending: PendingRegistrationRow,
  planId: string
): Promise<void> {
  const authUserId = pending.auth_user_id;
  if (!authUserId) throw new Error('Pending registration has no linked auth account');

  const { error: statusError } = await supabase
    .from('profiles')
    .update({ status: 'active' })
    .eq('id', authUserId);
  if (statusError) throw statusError;

  // Everything the member typed at sign-up moves from the review queue onto
  // their real row here (0031). Without this the intake details — birth date,
  // gender, emergency contact — would be collected, shown to the front desk
  // once, and then deleted with the queue entry a few lines below.
  const { error: memberProfileError } = await supabase.from('member_profiles').insert({
    profile_id: authUserId,
    qr_code: authUserId,
    date_of_birth: pending.date_of_birth,
    gender: pending.gender,
    address: pending.address,
    emergency_contact_name: pending.emergency_contact_name,
    emergency_contact_phone: pending.emergency_contact_phone,
    emergency_contact_relationship: pending.emergency_contact_relationship,
  });
  if (memberProfileError) throw memberProfileError;

  const startDate = new Date().toISOString().slice(0, 10);
  const { error: membershipError } = await supabase.from('memberships').insert({
    member_id: authUserId,
    plan_id: planId,
    status: 'pending',
    start_date: startDate,
  });
  if (membershipError) throw membershipError;

  const { error: deleteError } = await supabase
    .from('pending_registrations')
    .delete()
    .eq('id', pending.id);
  if (deleteError) throw deleteError;
}

/**
 * Admin rejection: removes the review-queue entry and marks the profile
 * suspended (the auth account itself can't be deleted from the client —
 * that needs a service-role Edge Function, out of scope for this phase).
 */
export async function rejectPendingRegistration(pending: PendingRegistrationRow): Promise<void> {
  if (pending.auth_user_id) {
    const { error: statusError } = await supabase
      .from('profiles')
      .update({ status: 'suspended' })
      .eq('id', pending.auth_user_id);
    if (statusError) throw statusError;
  }
  const { error: deleteError } = await supabase
    .from('pending_registrations')
    .delete()
    .eq('id', pending.id);
  if (deleteError) throw deleteError;
}

/**
 * Self-registration: creates the real Supabase Auth account (status starts as
 * 'pending_approval', gated by RLS until an admin approves). The profiles +
 * pending_registrations rows are created server-side by the
 * handle_new_member_signup trigger (see 0005_registration_trigger.sql) — this
 * project requires email confirmation, so signUp() returns no active session
 * for the client to insert with directly. The metadata below lands in
 * auth.users.raw_user_meta_data for that trigger to read.
 */
/**
 * Admin: sets a member's account status. Used for suspend/reactivate and for
 * archiving. Members are never hard-deleted — a delete cascades through
 * memberships, payments and attendance and would destroy the gym's records.
 */
export async function setMemberStatus(
  memberId: string,
  status: ProfileStatus
): Promise<void> {
  const { error } = await supabase.from('profiles').update({ status }).eq('id', memberId);
  if (error) throw error;
}

/** Admin: archive a member (keeps all history, drops them off the active roster). */
export async function archiveMember(memberId: string): Promise<void> {
  return setMemberStatus(memberId, 'archived');
}

/**
 * Admin: creates a walk-in member at the front desk via the create-member Edge
 * Function, so the admin's own session isn't swapped for the new member's.
 * Created already 'active' — walk-ins skip the self-registration approval queue.
 */
export async function createMember(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  address?: string;
  /** YYYY-MM-DD. Self-registration has collected this since 0031; walk-ins
   *  didn't, which left them with NULLs nobody was ever going to fill in. */
  dateOfBirth?: string;
  gender?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  experienceLevel?: string;
  planId?: string;
}): Promise<{ id: string; email: string }> {
  const { data, error } = await supabase.functions.invoke('create-member', { body: input });
  if (error) {
    // FunctionsHttpError hides the function's JSON error body on error.context.
    const context = (error as { context?: Response }).context;
    let serverMessage: string | undefined;
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.json();
        serverMessage = body?.error;
      } catch {
        // not JSON — fall through to the generic message
      }
    }
    throw new Error(serverMessage ?? error.message);
  }
  return data as { id: string; email: string };
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
