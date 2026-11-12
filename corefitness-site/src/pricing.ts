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
  /** 0189: staff accounts (null = no limit) and AI coach messages a month (null = not set). */
  maxStaff: number | null;
  aiMonthly: number | null;
  /** 0247: megabytes of uploads the plan includes. undefined = not read (before 0247); null = no limit. */
  storageMb?: number | null;
}

/** 2048 → "2 GB"; 500 → "500 MB". */
export const storageWords = (mb: number): string =>
  mb >= 1024 ? `${Number.isInteger(mb / 1024) ? mb / 1024 : (mb / 1024).toFixed(1)} GB` : `${mb} MB`;

/** Each plan's storage folded into the price list (two reads, because the price list predates 0247). */
export const withStorage = (tiers: Tier[], rows: unknown): Tier[] => {
  if (!Array.isArray(rows)) return tiers;
  const by = new Map((rows as { plan_key: string; storage_mb: number | null }[]).map((r) => [r.plan_key, r.storage_mb]));
  return tiers.map((t) => (by.has(t.key) ? { ...t, storageMb: by.get(t.key) ?? null } : t));
};

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
  /** Absent before 0189. */
  max_staff?: number | null;
  ai_monthly_cap?: number | null;
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
  maxStaff: row.max_staff ?? null,
  aiMonthly: row.ai_monthly_cap ?? null,
});
