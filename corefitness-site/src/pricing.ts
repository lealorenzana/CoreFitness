/**
 * The shape of a tier on the pricing page.
 *
 * **The tiers themselves no longer live here.** They are rows in
 * `platform_plans` (0108), edited on the platform app's Plans screen and read
 * by this page through `public_plans()` — so a price change happens in one
 * place instead of an edit and a redeploy, and this page can never disagree
 * with what a gym is actually charged.
 *
 * `monthly: null` still means "not decided", and the card still says "Talk to
 * us" rather than inventing a number (CLAUDE.md: copy is a claim).
 */
export interface Tier {
  key: string;
  name: string;
  /** Pesos per month. null = not decided yet. */
  monthly: number | null;
  /** Pesos per year, when the gym offers one. */
  yearly: number | null;
  line: string;
  includes: string[];
  trialDays: number | null;
  maxMembers: number | null;
}

/** A row of `public_plans()`, before it is turned into a Tier. */
export interface PublicPlanRow {
  key: string;
  name: string;
  blurb: string | null;
  price_monthly: string | null;
  price_yearly: string | null;
  trial_days: number | null;
  max_members: number | null;
  includes: string[] | null;
  sort_order: number;
}

/** numeric arrives as a string; an absent price must stay absent, never become 0. */
const money = (n: string | null): number | null => (n === null || n === '' ? null : Number(n));

export const toTier = (row: PublicPlanRow): Tier => ({
  key: row.key,
  name: row.name,
  monthly: money(row.price_monthly),
  yearly: money(row.price_yearly),
  line: row.blurb ?? '',
  includes: row.includes ?? [],
  trialDays: row.trial_days,
  maxMembers: row.max_members,
});
