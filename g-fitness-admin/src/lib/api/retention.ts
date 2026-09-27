import { supabase } from '../supabaseClient';

/**
 * The retention radar and win-back messages (0130). Who is at risk is computed
 * in SQL on every read from four signals (visits stopping or dropping, the
 * membership ending with no renewal, stopped logging workouts, missed booked
 * classes) — nothing here scores anyone. Win-back messages ship switched off;
 * the owner words and switches each one, and each member gets one at most once
 * a month. The sweep sends whatever is due whenever this page or the dashboard
 * loads (pg_cron is optional here).
 */

export interface AtRisk {
  memberId: string; name: string; phone: string | null; photoUrl: string | null; score: number;
  level: 'high' | 'medium'; reasons: string[]; lastVisit: string | null; visits14: number;
  usual14: number | null; expiresOn: string | null; lastContact: string | null;
}
export type WinbackKey = 'no_visit_14' | 'no_visit_30' | 'lapsed';
export interface WinbackRule { key: WinbackKey; title: string; message: string; isActive: boolean }
export interface WinbackResult { ruleKey: string; sent: number; cameBack: number }

const clean = (m: string) => m.replace(/^.*?: /, '');

/** Sends any switched-on win-back messages now due. Never throws. */
export async function winbackSweep(): Promise<void> {
  await supabase.rpc('winback_sweep').then(() => undefined, () => undefined);
}

/** undefined = 0130 not live yet. */
export async function retentionRadar(): Promise<AtRisk[] | undefined> {
  const { data, error } = await supabase.rpc('retention_radar');
  if (error) return undefined;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    memberId: r.member_id as string, name: r.name as string, phone: r.phone as string | null,
    photoUrl: r.photo_url as string | null, score: Number(r.score), level: r.level as AtRisk['level'],
    reasons: (r.reasons as string[]) ?? [], lastVisit: r.last_visit as string | null, visits14: Number(r.visits_14),
    usual14: r.usual_14 == null ? null : Number(r.usual_14), expiresOn: r.expires_on as string | null,
    lastContact: r.last_contact as string | null,
  }));
}

export async function winbackRules(): Promise<WinbackRule[]> {
  const { data, error } = await supabase.from('winback_rules').select('key, title, message, is_active, sort_order').order('sort_order');
  if (error) return [];
  return ((data ?? []) as { key: WinbackKey; title: string; message: string; is_active: boolean }[])
    .map((r) => ({ key: r.key, title: r.title, message: r.message, isActive: r.is_active }));
}

export async function saveWinbackRule(key: WinbackKey, patch: { title?: string; message?: string; isActive?: boolean }): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title.trim();
  if (patch.message !== undefined) row.message = patch.message.trim();
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  const { data, error } = await supabase.from('winback_rules').update(row).eq('key', key).select('key');
  if (error) throw new Error(clean(error.message));
  // A zero-row update reports success (CLAUDE.md): the desk may read these, only the owner edits.
  if (!data || data.length === 0) throw new Error('Only the owner can change the win-back messages.');
}

export async function winbackResults(): Promise<WinbackResult[]> {
  const { data, error } = await supabase.rpc('winback_results');
  if (error) return [];
  return ((data ?? []) as { rule_key: string; sent: number; came_back: number }[])
    .map((r) => ({ ruleKey: r.rule_key, sent: r.sent, cameBack: r.came_back }));
}

export async function sendRetentionMessage(memberId: string, message: string): Promise<void> {
  const { error } = await supabase.rpc('send_retention_message', { p_member: memberId, p_title: null, p_message: message.trim() });
  if (error) throw new Error(clean(error.message));
}
