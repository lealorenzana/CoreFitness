import { supabase } from '../supabaseClient';

/**
 * The gym's own house rules (0157), as this member sees them: the version in
 * effect and whether they have agreed to it. `my_house_rules()` reads the
 * current gym only; agreeing goes through `accept_house_rules()` — there is no
 * write policy. null = nothing to show: no rules, signed out, or 0157 not pasted.
 */
export interface MyHouseRules {
  id: string;
  version: number;
  body: string;
  published_at: string;
  accepted_at: string | null;
  /** The newest version this member agreed to, if any — so a screen can say "you agreed to version 1". */
  agreed_version: number | null;
}

export async function getMyHouseRules(): Promise<MyHouseRules | null> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return null;
  const { data, error } = await supabase.rpc('my_house_rules');
  if (error || !data || typeof data !== 'object') return null;
  return data as MyHouseRules;
}

/** Rules a member should be asked about: published, not withdrawn (an empty version), not yet agreed. */
export const houseRulesDue = (r: MyHouseRules | null) => !!r && r.body.trim() !== '' && !r.accepted_at;

export async function acceptHouseRules(id: string): Promise<void> {
  const { error } = await supabase.rpc('accept_house_rules', { p_rules: id });
  if (error) throw error;
}
