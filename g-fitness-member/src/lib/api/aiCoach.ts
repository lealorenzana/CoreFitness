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
  /** Has the member finished the guided setup (0144)? */
  onboarded: boolean;
}

export interface CoachProfile {
  goal: string; experience: string; days_per_week: number; minutes: number;
  equipment: string[]; likes: string | null; avoid: string | null; has_injury: boolean;
}

export interface Turn { role: 'user' | 'assistant'; content: string }

/** A change the coach proposed during a reply (0145). Nothing has changed until Apply. */
export interface ProposalFrame { id: string; kind: string; summary: string; payload: unknown }

/** Null when unknown — before 0143 is pasted, or offline. Never a guess. */
export async function getCoachStatus(): Promise<CoachStatus | null> {
  const { data, error } = await supabase.rpc('ai_coach_status');
  if (error || !data) return null;
  // A database without 0144 sends no `onboarded`: treat it as done, never show the setup.
  const s = data as Omit<CoachStatus, 'onboarded'> & { onboarded?: boolean };
  return { ...s, onboarded: s.onboarded ?? true };
}

let readyAnswer: Promise<boolean> | null = null;

/**
 * Is the `ai-coach` function deployed AND configured? The database says a Premium
 * member may use the coach long before that is true, so the chat asks the function.
 * An empty body is refused with 400 `bad_question` only after the key and the
 * sign-in check, and before any status, claim or model call — so it costs nothing.
 * Anything else (404 not deployed, 503 not_configured, offline) is "not ready".
 * Remembered for the life of the page only.
 */
export function coachReady(): Promise<boolean> {
  if (!readyAnswer) {
    readyAnswer = (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return false;
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-coach`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: '{}',
        });
        if (res.status !== 400) return false;
        const body = await res.json().catch(() => null) as { reason?: string } | null;
        return body?.reason === 'bad_question';
      } catch { return false; }
    })();
  }
  return readyAnswer;
}

/**
 * Would the chat show this member the coach? Its own conditions (ChatbotPage): the
 * function is ready, and the coach is theirs — allowed, or only at a message limit.
 * The gym's `assistant` switch is the caller's to check. Never throws: unknown is no.
 */
export async function coachOffered(): Promise<boolean> {
  try {
    const [status, ready] = await Promise.all([getCoachStatus(), coachReady()]);
    return ready && !!status
      && (status.allowed || status.reason === 'daily_limit' || status.reason === 'monthly_limit');
  } catch { return false; }
}

export async function saveCoachProfile(p: CoachProfile): Promise<void> {
  const { error } = await supabase.rpc('save_ai_coach_profile', { p });
  if (error) throw new Error(error.message);
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
  onProposal?: (p: ProposalFrame) => void,
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
      // Only the function's own reasons carry a message worth showing; Supabase's
      // own 404/401 JSON has a `message` that means nothing to a member.
      const KNOWN = ['not_configured', 'bad_question', 'signed_out', 'not_member', 'switched_off', 'no_plan',
        'daily_limit', 'monthly_limit', 'busy', 'refusal'];
      if (body?.reason && KNOWN.includes(body.reason)) {
        return { ok: false, reason: body.reason, message: body.message ?? busy.message };
      }
      return { ok: false, reason: 'busy', message: busy.message };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    // One frame at a time; null means keep reading.
    const handle = (frame: string): { ok: true } | { ok: false; reason: string; message: string } | null => {
      if (!frame.startsWith('data: ')) return null;
      const ev = JSON.parse(frame.slice(6)) as {
        type: string; text?: string; reason?: string; message?: string;
        id?: string; kind?: string; summary?: string; payload?: unknown;
      };
      if (ev.type === 'text' && ev.text) onText(ev.text);
      if (ev.type === 'proposal' && ev.id && ev.kind) {
        onProposal?.({ id: ev.id, kind: ev.kind, summary: ev.summary ?? '', payload: ev.payload ?? {} });
      }
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
