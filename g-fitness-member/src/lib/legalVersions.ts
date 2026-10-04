/**
 * The version of each member-facing document: the date printed at the top of
 * the page, and the string a member's agreement records (0155).
 *
 * One place, so the page's "Updated" date and what Register and the in-app
 * "Agree" send can never disagree. **Change a word of the page, change its date
 * here, in the same commit** — the old wording stays in git history under the
 * old date, which is what makes an agreement to it mean something.
 */
export const TERMS_VERSION = '2026-10-04';
export const PRIVACY_VERSION = '2026-09-19';

export type LegalDocument = 'member_terms' | 'member_privacy';

/** '2026-10-03' → '3 October 2026'. Parsed as a Manila date, never through toISOString(). */
export function prettyVersion(v: string): string {
  const [y, m, d] = v.split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return y && m && d ? `${d} ${months[m - 1]} ${y}` : v;
}
