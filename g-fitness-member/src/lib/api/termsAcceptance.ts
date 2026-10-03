import { supabase } from '../supabaseClient';
import { PRIVACY_VERSION, TERMS_VERSION, type LegalDocument } from '../legalVersions';

/**
 * A member's agreements to the member Terms and Privacy Policy (0151).
 *
 * Read with their own session — `terms_acceptances` lets a member read only
 * their own rows in the current gym. Written only by `accept_member_terms()`;
 * there is no insert policy, so nothing here could write one directly anyway.
 */

/** The newest version agreed per document; 'unversioned' when only a pre-0151 agreement exists; null when none. */
export interface MyAgreements { member_terms: string | null; member_privacy: string | null }

/** null when it cannot be read — signed out, or 0151 not pasted — so callers show nothing rather than nag. */
export async function getMyAgreements(): Promise<MyAgreements | null> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return null;
  const { data, error } = await supabase
    .from('terms_acceptances')
    .select('document, version')
    .eq('profile_id', session.session.user.id);
  if (error || !Array.isArray(data)) return null;
  const newest = (doc: LegalDocument): string | null => {
    const versions = data.filter((r) => r.document === doc).map((r) => r.version as string);
    const dated = versions.filter((v) => v !== 'unversioned').sort();
    return dated.length ? dated[dated.length - 1]! : versions.length ? 'unversioned' : null;
  };
  return { member_terms: newest('member_terms'), member_privacy: newest('member_privacy') };
}

/** True when the member has not agreed to `current` (or anything newer) for that document. */
export const behind = (agreed: string | null, current: string) =>
  agreed === null || agreed === 'unversioned' || agreed < current;

export const CURRENT: Record<LegalDocument, string> = { member_terms: TERMS_VERSION, member_privacy: PRIVACY_VERSION };

export async function acceptMemberDocument(doc: LegalDocument): Promise<void> {
  const { error } = await supabase.rpc('accept_member_terms', doc === 'member_terms'
    ? { p_terms: TERMS_VERSION, p_privacy: null }
    : { p_terms: null, p_privacy: PRIVACY_VERSION });
  if (error) throw error;
}
