/**
 * The shape of a tier on the pricing page.
 *
 * **The tiers themselves no longer live here.** They are rows in
 * `platform_plans` (0108), edited on the platform app's Plans screen and read
 * by this page through `platform_price_list()` — so a price change happens in one
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

/** A row of `platform_price_list()`, before it is turned into a Tier. */
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

/**
 * One way to write a price on every screen of this site: whole pesos stay
 * whole (₱499), anything else shows its centavos (₱499.50) — never "₱499.5".
 */
export const peso = (n: number) =>
  '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });

const paid = (n: number | null): n is number => n !== null && n > 0;

/** Which billings a plan can actually be bought on. */
export const billings = (t: Pick<Tier, 'monthly' | 'yearly'>): ('monthly' | 'yearly')[] =>
  [...(t.monthly !== null || !paid(t.yearly) ? ['monthly' as const] : []), ...(paid(t.yearly) ? ['yearly' as const] : [])];

/** The billing to send: the one asked for if the plan has it, else the one it has. */
export const billingFor = (t: Pick<Tier, 'monthly' | 'yearly'>, wanted: 'monthly' | 'yearly'): 'monthly' | 'yearly' => {
  const ok = billings(t);
  return ok.includes(wanted) ? wanted : ok[0];
};

/**
 * What a plan's card says, for the monthly or yearly view of the page.
 * `main` is the headline, `unit` its small suffix, `note` the line under it.
 * A price of 0 on a plan with free days is the trial — it is free *for those
 * days* (0139 ends it), so it never reads as free for ever.
 */
export function priceView(t: Pick<Tier, 'monthly' | 'yearly' | 'trialDays'>, view: 'monthly' | 'yearly') {
  const y = paid(t.yearly) ? t.yearly : null;
  if (view === 'yearly' && y !== null) {
    return { main: peso(y), unit: '/ year', note: paid(t.monthly) ? `or ${peso(t.monthly)} a month` : null };
  }
  if (paid(t.monthly)) {
    return { main: peso(t.monthly), unit: '/ month', note: y !== null ? `or ${peso(y)} a year` : view === 'yearly' ? 'Monthly only' : null };
  }
  if (t.monthly === 0) {
    return { main: 'Free', unit: t.trialDays ? `for ${t.trialDays} days` : null, note: null };
  }
  if (y !== null) return { main: peso(y), unit: '/ year', note: 'Yearly only' };
  return { main: 'Talk to us', unit: null, note: null };
}

/** The same, on one line — the apply form's plan picker and the status page. */
export function priceLine(t: Pick<Tier, 'monthly' | 'yearly' | 'trialDays'>, view: 'monthly' | 'yearly' = 'monthly') {
  const v = priceView(t, view);
  return v.unit ? `${v.main} ${v.unit}` : v.main;
}
