import { supabase } from '../supabaseClient';

/**
 * A gym's application to Core Fitness, from the applicant's side (0187): the
 * account they made on the website's apply form signs in here too, and until
 * the platform lets the gym in, this is all the admin app shows them.
 */
export interface ApplicationDocument {
  id: string; kind: string; label: string; path: string; file_name: string | null; expires_on: string | null;
  status: 'pending' | 'verified' | 'rejected' | 'replaced'; reason: string | null; uploaded_at: string;
}
export interface DocumentKind { kind: string; label: string; needs_expiry: boolean; sort_order: number }
export interface MyApplication {
  id: string; gym_name: string; owner_name: string; email: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  reason: string | null; created_at: string; decided_at: string | null;
  plan: { key: string; name: string; price_monthly: string | null; trial_days: number | null } | null;
  messages: { from_platform: boolean; body: string; created_at: string }[];
  documents: ApplicationDocument[];
  missing: string[];
}
export interface GymApplication {
  id: string; gym_name: string; owner_name: string; email: string; phone: string; address: string | null;
  documents: ApplicationDocument[];
}

const isMissing = (m: string) => /schema cache|Could not find the function|does not exist/i.test(m);

/** The signed-in person's applications; [] before 0187 or when there are none. */
export async function myApplications(): Promise<MyApplication[]> {
  const { data, error } = await supabase.rpc('my_applications');
  if (error) { if (isMissing(error.message)) return []; throw new Error(error.message); }
  return (data ?? []) as MyApplication[];
}

export async function replyToApplication(id: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('my_application_reply', { p_application: id, p_body: body });
  if (error) throw new Error(error.message);
}

export async function withdrawApplication(id: string): Promise<void> {
  const { error } = await supabase.rpc('withdraw_my_application', { p_application: id });
  if (error) throw new Error(error.message);
}

export async function documentKinds(): Promise<DocumentKind[]> {
  const { data, error } = await supabase.rpc('application_document_kinds');
  if (error) throw new Error(error.message);
  return ((data ?? []) as DocumentKind[]).sort((a, b) => a.sort_order - b.sort_order);
}

/** Upload into the application's own folder, then file it — the database decides who may do either. */
export async function sendDocument(applicationId: string, kind: string, file: File, expiresOn: string | null): Promise<void> {
  const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${applicationId}/${kind}-${Date.now()}.${ext}`;
  const up = await supabase.storage.from('applications').upload(path, file, { contentType: file.type || undefined });
  if (up.error) throw new Error(up.error.message);
  const { error } = await supabase.rpc('add_application_document', {
    p_application: applicationId, p_kind: kind, p_path: path, p_file_name: file.name, p_expires_on: expiresOn,
  });
  if (error) throw new Error(error.message);
}

export async function documentLink(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('applications').createSignedUrl(path, 120);
  return data?.signedUrl ?? null;
}

/** The current gym's own approved application — setup fills itself from it (E4). null before 0187. */
export async function myGymApplication(): Promise<GymApplication | null> {
  const { data, error } = await supabase.rpc('my_gym_application');
  if (error) return null;
  return (data as GymApplication | null) ?? null;
}

/** Reminders to renew a permit/clearance/ID (0187). Fire and forget, owner only; never throws. */
export async function runPermitReminders(): Promise<void> {
  try { await supabase.rpc('permit_renewal_sweep'); } catch { /* best effort */ }
}
