import { supabase } from '../supabaseClient';

/**
 * The AI coach (0143 + the `ai-coach` Edge Function).
 *
 * The rules in data/memberAssistant.ts still answer every fact about this gym
 * first; the coach answers what they cannot. Every gate is the database's —
 * this file only reads the answer so the screen can explain it.
 */

export interface CoachStatus {
  gym_id: string; allowed: boolean;
  reason: 'not_member' | 'no_plan' | 'switched_off' | 'daily_limit' | 'monthly_limit' | null;
  used_today: number; daily_limit: number; used_month: number; monthly_limit: number;
  consent: boolean | null;
}

export interface Turn { role: 'user' | 'assistant'; content: string }

/** Null when unknown — before 0143 is pasted, or offline. Never a guess. */
export async function getCoachStatus(): Promise<CoachStatus | null> {
  const { data, error } = await supabase.rpc('ai_coach_status');
  if (error || !data) return null;
  return data as CoachStatus;
}

export async function setCoachConsent(readsData: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_ai_coach_consent', { p_reads_data: readsData });
  if (error) throw new Error(error.message);
}

/**
 * Ask the coach and stream its reply into `onText`.
 *
 * Resolves `{ ok: false }` for every failure — not configured, a limit, busy,
 * a refusal, offline — with the sentence to show. The caller keeps the rules'
 * answer in every one of them, so the coach can only ever add to the assistant.
 */
export async function askCoach(
  question: string, history: Turn[], onText: (chunk: string) => void,
): Promise<{ ok: true } | { ok: false; reason: string; message: string }> {
  const busy = { ok: false as const, reason: 'busy', message: 'The coach is busy. Try again in a minute.' };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { ok: false, reason: 'signed_out', message: 'Sign in again to use the coach.' };
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-coach`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question, history: history.slice(-10) }),
    });
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => null) as { reason?: string; message?: string } | null;
      return { ok: false, reason: body?.reason ?? 'busy', message: body?.message ?? busy.message };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    // One frame at a time; null means keep reading.
    const handle = (frame: string): { ok: true } | { ok: false; reason: string; message: string } | null => {
      if (!frame.startsWith('data: ')) return null;
      const ev = JSON.parse(frame.slice(6)) as { type: string; text?: string; reason?: string; message?: string };
      if (ev.type === 'text' && ev.text) onText(ev.text);
      if (ev.type === 'error') return { ok: false, reason: ev.reason ?? 'busy', message: ev.message ?? busy.message };
      if (ev.type === 'done') return { ok: true };
      return null;
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let cut: number;
      while ((cut = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, cut); buf = buf.slice(cut + 2);
        const out = handle(frame);
        if (out) return out;
      }
    }
    // A last frame may arrive without its blank line.
    buf += dec.decode();
    const last = buf.trim() ? handle(buf.trim()) : null;
    if (last) return last;
    return busy;
  } catch {
    return busy;
  }
}
