import { supabase } from '../supabaseClient';

/**
 * The gym's own house rules (0157) — the owner's side. Every version is kept and
 * none can be edited: publishing new words makes the next version, and members
 * are asked to agree to it. `house_rules_history()` is front desk only; the
 * publish function refuses anyone but an active owner.
 */
export interface HouseRulesVersion {
  id: string; version: number; body: string; published_at: string; published_by: string | null; agreed: number;
}

/** null when it cannot be read — 0157 not pasted. */
export async function listHouseRules(): Promise<HouseRulesVersion[] | null> {
  const { data, error } = await supabase.rpc('house_rules_history');
  if (error || !Array.isArray(data)) return null;
  return data as HouseRulesVersion[];
}

export async function publishHouseRules(body: string): Promise<number> {
  const { data, error } = await supabase.rpc('publish_house_rules', { p_body: body });
  if (error) throw error;
  return data as number;
}

/** The newest house rules version this member agreed to, for the member drawer. null = none, or unreadable. */
export async function memberHouseRulesVersion(profileId: string): Promise<{ version: number; accepted_at: string } | null> {
  const { data, error } = await supabase
    .from('house_rules_acceptances')
    .select('accepted_at, gym_house_rules(version)')
    .eq('profile_id', profileId);
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const rows = (data as unknown as { accepted_at: string; gym_house_rules: { version: number } | { version: number }[] | null }[])
    .map((r) => ({ accepted_at: r.accepted_at, version: (Array.isArray(r.gym_house_rules) ? r.gym_house_rules[0] : r.gym_house_rules)?.version ?? 0 }))
    .sort((a, b) => b.version - a.version);
  return rows[0] && rows[0].version > 0 ? rows[0] : null;
}
