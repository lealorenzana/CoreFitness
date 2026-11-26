// Embeds the assistants' library (0282) with Supabase's built-in gte-small: the shared texts and each gym's
// waiver and house rules, only those whose words changed since they were last embedded. Then it sweeps the
// vectors of paragraphs that no longer exist. Nothing here reads a person's data.
//
// The assistants call it before they search; it does nothing when the library is current.
// shortcut: anyone with the anon key may trigger it, bounded to BATCH texts a call and idle when current;
// give it a secret header if it ever shows up as load.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// The free tier's compute limit stopped a call of 25 (WORKER_RESOURCE_LIMIT, 2026-11-27); 5 fits.
const BATCH = 5;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// deno-lint-ignore no-explicit-any
const session = new (globalThis as any).Supabase.ai.Session('gte-small');

async function rpc(fn: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} ${res.status}`);
  return text ? JSON.parse(text) : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const stale = (await rpc('knowledge_stale', { p_limit: BATCH })) as { ref: string; gym_id: string | null; body: string; body_hash: string }[];
    let saved = 0;
    for (const s of stale) {
      // gte-small reads about 512 tokens; a library row is a clause, a guide step or a paragraph.
      const embedding = await session.run(s.body.slice(0, 2000), { mean_pool: true, normalize: true });
      if (await rpc('knowledge_save_embedding', { p_ref: s.ref, p_gym: s.gym_id, p_hash: s.body_hash, p_embedding: JSON.stringify(embedding) })) saved++;
    }
    const swept = stale.length < BATCH ? await rpc('knowledge_sweep', {}) : 0;
    return json({ embedded: saved, left: stale.length === BATCH, swept });
  } catch {
    return json({ reason: 'failed' }, 502);
  }
});
