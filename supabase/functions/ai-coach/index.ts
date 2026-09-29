// The AI coach (spec: docs/superpowers/specs/2026-09-29-ai-coach-design.md).
//
// Every gate is asked of the database *as the member* — their own JWT goes to
// PostgREST, so RLS and the definer functions decide, not this file. The
// service-role key is used for exactly one call, ai_record_usage(), because a
// member who could write their own count could reset their own limit.
import Anthropic from 'npm:@anthropic-ai/sdk@0.129.0';
import { buildRequest, sse, statusToHttp, SYSTEM_PROMPT, validQuestion, type CoachStatus, type Turn } from './core.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function rpc<T>(fn: string, auth: string, key: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { Authorization: auth, apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${fn} ${res.status}`);
  // ai_record_usage returns void: PostgREST answers 204 or an empty body.
  if (res.status === 204) return null as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ reason: 'method' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ reason: 'not_configured', message: 'The coach is not set up at this gym yet.' }, 503);

  const auth = req.headers.get('Authorization');
  if (!auth) return json({ reason: 'signed_out' }, 401);
  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: ANON } });
  if (!who.ok) return json({ reason: 'signed_out' }, 401);
  const member = (await who.json()) as { id: string };

  let body: { question?: unknown; history?: unknown };
  try {
    const parsed = await req.json();
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json({ reason: 'bad_question' }, 400);
    }
    body = parsed;
  } catch { return json({ reason: 'bad_question' }, 400); }
  if (!validQuestion(body.question)) return json({ reason: 'bad_question' }, 400);
  // Keep only well-formed turns: a null or odd item must not throw inside buildRequest.
  const history = (Array.isArray(body.history) ? body.history : []).filter(
    (t): t is Turn => t !== null && typeof t === 'object'
      && typeof (t as Turn).role === 'string' && typeof (t as Turn).content === 'string',
  );

  // Every gate, as the member. A failure to *ask* refuses: an outage must never
  // become free model access (the gym pays per message).
  let status: CoachStatus;
  try { status = await rpc<CoachStatus>('ai_coach_status', auth, ANON); }
  catch { return json({ reason: 'busy', message: 'The coach is busy. Try again in a minute.' }, 503); }
  const refused = statusToHttp(status);
  if (refused) return json(refused.body, refused.status);

  // Claim the message before the model is called, atomically with the limit check, so parallel
  // requests cannot all slip under the limit. Never call the model unclaimed.
  let claimed: boolean;
  try {
    claimed = await rpc<boolean>('ai_claim_message', `Bearer ${SERVICE}`, SERVICE, {
      p_gym: status.gym_id, p_member: member.id,
    });
  } catch { return json({ reason: 'busy', message: 'The coach is busy. Try again in a minute.' }, 503); }
  if (!claimed) {
    return json({ reason: 'daily_limit', message: "You have reached the coach's limit for now. Try again tomorrow." }, 429);
  }

  const context = await rpc<Record<string, unknown> | null>('ai_coach_context', auth, ANON).catch(() => null);
  const request = buildRequest(body.question, history, context);
  const about = request.system.slice(SYSTEM_PROMPT.length).trim();

  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
  const model = Deno.env.get('COACH_MODEL') || 'claude-sonnet-5-5';

  let upstream: ReturnType<typeof client.beta.messages.stream> | null = null;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      // Once the client has gone, enqueue/close throw; that must never escape start().
      const send = (s: string) => { try { controller.enqueue(enc.encode(s)); } catch { /* client gone */ } };
      let usageIn = 0, usageOut = 0, spoke = false;
      try {
        // deno-lint-ignore no-explicit-any
        const params: any = {
          model,
          max_tokens: 2048,
          system: [
            // The prompt is below the minimum cacheable prefix today, so this saves nothing yet; harmless, and it starts to matter if the prompt grows.
            { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: about },
          ],
          messages: request.messages,
          output_config: { effort: 'low' },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        };
        const s = client.beta.messages.stream(params);
        upstream = s;
        for await (const event of s) {
          // Count tokens as they arrive, so a stream that dies midway is still billed.
          if (event.type === 'message_start') {
            const u = event.message.usage;
            usageIn = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
            usageOut = u.output_tokens ?? 0;
          } else if (event.type === 'message_delta' && event.usage?.output_tokens != null) {
            usageOut = event.usage.output_tokens;
          }
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            spoke = true;
            send(sse({ type: 'text', text: event.delta.text }));
          }
        }
        const final = await s.finalMessage();
        usageIn = (final.usage.input_tokens ?? 0) + (final.usage.cache_read_input_tokens ?? 0)
          + (final.usage.cache_creation_input_tokens ?? 0);
        usageOut = final.usage.output_tokens ?? usageOut;
        if (final.stop_reason === 'refusal' && !spoke) {
          send(sse({ type: 'error', reason: 'refusal', message: 'The coach cannot help with that one.' }));
        } else {
          send(sse({ type: 'done' }));
        }
      } catch (err) {
        // Never the raw error: it can carry request details. Log for the gym.
        if (!cancelled) {
          console.error('ai-coach upstream', err instanceof Anthropic.APIError ? err.status : 'network');
        }
        send(sse({ type: 'error', reason: 'busy', message: 'The coach is busy. Try again in a minute.' }));
      } finally {
        // The message was counted at the claim; this adds the tokens, even for a stream cut short.
        if (usageIn || usageOut) {
          await rpc('ai_record_usage', `Bearer ${SERVICE}`, SERVICE, {
            p_gym: status.gym_id, p_member: member.id, p_in: usageIn, p_out: usageOut,
          }).catch((e) => console.error('ai-coach usage', String(e)));
        }
        try { controller.close(); } catch { /* already closed or cancelled */ }
      }
    },
    cancel() {
      cancelled = true;
      try { upstream?.abort(); } catch { /* nothing to abort */ }
    },
  });

  return new Response(stream, {
    headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
});
