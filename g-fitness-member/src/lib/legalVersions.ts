/**
 * The version of each member-facing document: the date printed at the top of
 * the page, and the string a member's agreement records (0155).
 *
 * One place, so the page's "Updated" date and what Register and the in-app
 * "Agree" send can never disagree. **Change a word of the page, change its date
 * here, in the same commit** — the old wording stays in git history under the
 * old date, which is what makes an agreement to it mean something.
 */
export const TERMS_VERSION = '2026-11-12';   // conduct in the gym chat: who reads, who removes, being stopped from posting (§8, 0246); switching plans online mid-term follows your gym's rule, shown before you pay (§2, 0243); what a freeze does to a coaching package, your gym's rule (§2, 0235); Core Fitness can suspend an account (§9, 0226); deleting your own account (§9, 0225); paying in the app through PayMongo (0192)
export const PRIVACY_VERSION = '2026-11-12';   // the gym chat and reel likes: what is held, who sees it, erased with the account (§1, §2, §7, 0245–0246); your login: a username, a desk-made login and its one-time slip, your photo (§1, 0236); switching gyms moves your training data, with consent (§2, 0227); deleting your own account (§6, §7, 0225); the AI is the assistant (§2, simplify); Friends removed (§2, 0220); what the phone keeps for offline use (§4); your wins told to your coaches (§2, 0218)

export type LegalDocument = 'member_terms' | 'member_privacy';

/** '2026-10-03' → '3 October 2026'. Parsed as a Manila date, never through toISOString(). */
export function prettyVersion(v: string): string {
  const [y, m, d] = v.split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return y && m && d ? `${d} ${months[m - 1]} ${y}` : v;
}
