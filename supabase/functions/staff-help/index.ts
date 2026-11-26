// Help for the gym's owner and front desk (0283; plan docs/superpowers/plans/2026-11-27-rag.md).
// "How do I set up time slots?" is answered from the setup guides and the gym's own documents
// (search_knowledge, 0282) and the gym's settings (ai_coach_gym_info), with links to where it is done.
//
// Every gate is asked as the caller (their JWT): staff_help_status and the search decide who reads what.
// The service key is used only to claim, release and record the message, because whoever could write
// their own count could reset their own limit.
import Anthropic from 'npm:@anthropic-ai/sdk@0.129.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// deno-lint-ignore no-explicit-any
const embedder = new (globalThis as any).Supabase.ai.Session('gte-small');
const MAX_ROUNDS = 4;

const SYSTEM = `You are Help inside a gym management app in the Philippines, answering the gym's owner or front desk.
You explain how to do things in this app and what the gym's own rules and documents say.
RULES
1. For how to do something in the app, or any rule, policy or document, call search_documents first and answer ONLY from what it returns. For this gym's own settings (hours, plans and prices, who approves bookings, refund rules, what is switched on), call get_gym_info.
2. Name the page and the button exactly as the result says. When a result has a link, the app shows it as a button; say "open it below" rather than writing the address.
3. If neither tool says, say you do not know and that Core Fitness support can help (search_documents knows how to reach them). Never guess, and never describe a screen you were not told about.
4. Never give legal, tax or medical advice; point to a professional.
5. Short and practical: a few sentences or numbered steps. Do not use dashes as punctuation.`;

const TOOLS = [
  {
    name: 'search_documents',
    description: "Searches the app's setup guides, the gym's member Terms and Privacy, its waiver and house rules, and how to reach Core Fitness (and, for the owner, Core Fitness's plans), by meaning and by words. Returns up to 6 passages with a title and a link.",
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'The question in plain words.' } }, required: ['query'], additionalProperties: false },
    strict: true,
  },
  {
    name: 'get_gym_info',
    description: "This gym's own settings and facts: hours, plans and prices, house rules, classes, coaches and how_this_gym_runs (switches, approvals, slots, cancel windows, day passes, freeze limits, refunds).",
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
];

async function rpc(fn: string, auth: string, key: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { Authorization: auth, apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, data: text ? JSON.parse(text) : null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ reason: 'method' }, 405);
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ reason: 'not_configured', message: 'Help is not set up yet.' }, 503);
  const auth = req.headers.get('Authorization');
  if (!auth) return json({ reason: 'signed_out' }, 401);
  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: ANON } });
  if (!who.ok) return json({ reason: 'signed_out' }, 401);
  const me = (await who.json()) as { id: string };

  let question = '';
  let history: { role: 'user' | 'assistant'; content: string }[] = [];
  try {
    const b = await req.json();
    question = typeof b?.question === 'string' ? b.question.trim() : '';
    if (Array.isArray(b?.history)) {
      history = b.history.filter((t: { role?: string; content?: unknown }) => (t?.role === 'user' || t?.role === 'assistant') && typeof t.content === 'string')
        .slice(-6).map((t: { role: 'user' | 'assistant'; content: string }) => ({ role: t.role, content: t.content.slice(0, 2000) }));
      while (history.length && history[0].role !== 'user') history = history.slice(1);
    }
  } catch { /* checked below */ }
  if (!question || question.length > 1000) return json({ reason: 'bad_question' }, 400);

  const st = await rpc('staff_help_status', auth, ANON, {});
  if (!st.ok) return json({ reason: 'busy', message: 'Help is busy. Try again in a minute.' }, 503);
  const status = st.data as { gym_id: string; allowed: boolean; reason: string | null; daily_limit: number };
  if (!status.allowed) {
    const msg: Record<string, string> = {
      not_staff: 'Help is for the gym’s owner and front desk.',
      switched_off: 'Turn on the Assistant in Your app to use Help.',
      monthly_limit: 'This month’s AI messages are used. Buy more on Your app, or it starts again on the 1st.',
      daily_limit: `You have used today’s ${status.daily_limit} Help messages. It opens again tomorrow.`,
    };
    return json({ reason: status.reason, message: msg[status.reason ?? ''] ?? 'Help is not available.' }, status.reason === 'not_staff' ? 403 : 429);
  }
  const claim = await rpc('staff_help_claim', `Bearer ${SERVICE}`, SERVICE, { p_gym: status.gym_id, p_user: me.id });
  if (!claim.ok || claim.data !== true) return json({ reason: 'daily_limit', message: 'You have reached Help’s limit for now.' }, 429);

  const sources: { title: string; link: string | null }[] = [];
  let tokensIn = 0, tokensOut = 0;
  try {
    const client = new Anthropic({ apiKey });
    // deno-lint-ignore no-explicit-any
    const messages: any[] = [...history, { role: 'user', content: question }];
    for (let round = 0; round < MAX_ROUNDS; round++) {
      // deno-lint-ignore no-explicit-any
      const params: any = {
        model: Deno.env.get('HELP_MODEL') || 'claude-sonnet-5-5', max_tokens: 2048, system: SYSTEM, messages,
        tools: TOOLS, tool_choice: { type: 'auto' }, output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      };
      const res = await client.beta.messages.create(params);
      tokensIn += res.usage?.input_tokens ?? 0; tokensOut += res.usage?.output_tokens ?? 0;
      messages.push({ role: 'assistant', content: res.content });
      if (res.stop_reason !== 'tool_use') {
        const text = res.content.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('').trim();
        await rpc('ai_record_usage', `Bearer ${SERVICE}`, SERVICE, { p_gym: status.gym_id, p_member: me.id, p_in: tokensIn, p_out: tokensOut }).catch(() => {});
        if (res.stop_reason === 'refusal' || !text) return json({ text: 'I cannot help with that one. Core Fitness support can.', sources: [] });
        return json({ text, sources: sources.slice(0, 3) });
      }
      const results = [];
      for (const b of res.content) {
        if (b.type !== 'tool_use') continue;
        let out: unknown;
        if (b.name === 'search_documents') {
          const q = String((b.input as { query?: unknown })?.query ?? '').slice(0, 500);
          fetch(`${SUPABASE_URL}/functions/v1/knowledge-embed`, { method: 'POST', headers: { Authorization: `Bearer ${ANON}`, apikey: ANON } }).catch(() => {});
          let embedding: string | null = null;
          try { embedding = JSON.stringify(await embedder.run(q, { mean_pool: true, normalize: true })); } catch { /* keyword only */ }
          const r = await rpc('search_knowledge', auth, ANON, { p_query: q, p_embedding: embedding, p_limit: 6 });
          const rows = r.ok && Array.isArray(r.data) ? r.data as { title: string; body: string; link: string | null }[] : [];
          for (const x of rows) if (!sources.some((s) => s.title === x.title)) sources.push({ title: x.title, link: x.link });
          out = rows.length ? rows.map((x) => ({ title: x.title, opens: x.link, text: x.body.slice(0, 1500) }))
            : { results: [], note: 'Nothing matches. Say you do not know and that Core Fitness support can help.' };
        } else if (b.name === 'get_gym_info') {
          const r = await rpc('ai_coach_gym_info', auth, ANON, {});
          out = r.ok ? r.data : { error: 'The gym settings could not be read just now.' };
        } else out = { error: `There is no tool called ${b.name}.` };
        results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out) });
      }
      messages.push({ role: 'user', content: results });
    }
    await rpc('ai_record_usage', `Bearer ${SERVICE}`, SERVICE, { p_gym: status.gym_id, p_member: me.id, p_in: tokensIn, p_out: tokensOut }).catch(() => {});
    return json({ text: 'I stopped before finishing. Ask again in fewer words.', sources: sources.slice(0, 3) });
  } catch (err) {
    console.error('staff-help upstream', err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : String(err));
    // Nothing answered: give the message back.
    if (tokensIn === 0) await rpc('ai_release_message', `Bearer ${SERVICE}`, SERVICE, { p_gym: status.gym_id, p_member: me.id }).catch(() => {});
    return json({ reason: 'busy', message: 'Help is busy. Try again in a minute.' }, 503);
  }
});
