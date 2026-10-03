import { supabase } from '../supabaseClient';

/**
 * Which version of the member Terms and Privacy Policy a member agreed to (0151),
 * for the member drawer beside 0079's sign-up date. The desk reads its own gym's
 * rows (`terms_acceptances_desk` + the tenancy policy); nobody writes them here.
 */
export interface Agreement { version: string; accepted_at: string; source: 'signup' | 'in_app' | 'backfill' }
export interface MemberAgreements { member_terms: Agreement | null; member_privacy: Agreement | null }

/** null when it cannot be read (0151 not pasted, or no access): the drawer then shows nothing for it. */
export async function memberAgreements(profileId: string): Promise<MemberAgreements | null> {
  const { data, error } = await supabase
    .from('terms_acceptances')
    .select('document, version, accepted_at, source')
    .eq('profile_id', profileId)
    .order('accepted_at', { ascending: false });
  if (error || !Array.isArray(data)) return null;
  const newest = (doc: string): Agreement | null => {
    const rows = data.filter((r) => r.document === doc) as (Agreement & { document: string })[];
    // A dated version beats 'unversioned'; among dated ones the latest date wins.
    const dated = rows.filter((r) => r.version !== 'unversioned').sort((a, b) => b.version.localeCompare(a.version));
    return dated[0] ?? rows[0] ?? null;
  };
  return { member_terms: newest('member_terms'), member_privacy: newest('member_privacy') };
}
