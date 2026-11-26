// Reading a business document (plan docs/superpowers/plans/2026-11-27-document-ocr.md, migration 0280).
//
// The applicant's own JWT claims the reading (claim_document_reading decides whether the file is
// theirs and whether the cap allows another); the service key is used only to fetch the private
// file and to save or drop the answer. The answer suggests: nothing here changes a document.
// Every failure returns a reason and the site falls back to typing the date, never an error page.
import Anthropic from 'npm:@anthropic-ai/sdk@0.129.0';
import { mediaType, parseReading, SCHEMA, SYSTEM_PROMPT } from './core.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// The API takes an image of at most 5 MB once base64 encoded (a third larger than the file).
const MAX_IMAGE = Math.floor(5 * 1024 * 1024 * 3 / 4);

const LABELS: Record<string, string> = {
  permit: "a Mayor's / business permit", dti_sec: 'a DTI or SEC registration', bir_2303: 'a BIR Certificate of Registration (2303)',
  barangay: 'a barangay business clearance', owner_id: "the owner's government ID",
};

async function rpc(fn: string, auth: string, key: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { Authorization: auth, apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, data: text ? JSON.parse(text) : null };
}
const asService = (fn: string, body: unknown) => rpc(fn, `Bearer ${SERVICE}`, SERVICE, body);

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ reason: 'method' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ reason: 'not_configured' }, 503);
  const auth = req.headers.get('Authorization');
  if (!auth) return json({ reason: 'signed_out' }, 401);

  let path = '', kind = '';
  try {
    const body = await req.json();
    path = typeof body?.path === 'string' ? body.path : '';
    kind = typeof body?.kind === 'string' ? body.kind : '';
  } catch { /* checked below */ }
  const type = mediaType(path);
  if (!path || !LABELS[kind] || !type) return json({ reason: 'bad_request' }, 400);

  // As the applicant: their file, a kind we read, under the cap.
  const claim = await rpc('claim_document_reading', auth, ANON, { p_path: path, p_kind: kind });
  if (!claim.ok) {
    const message = String(claim.data?.message ?? '');
    if (message.startsWith('limit:')) return json({ reason: 'limit' }, 429);
    return json({ reason: 'refused' }, 403);
  }
  if (claim.data?.claimed === false) {
    return claim.data.result ? json({ reading: claim.data.result }, 200) : json({ reason: 'busy' }, 409);
  }

  // From here a failure drops the claim, so the slot and the path are free again.
  const fail = async (reason: string, status: number) => {
    await asService('drop_document_reading', { p_path: path }).catch(() => {});
    return json({ reason }, status);
  };

  const file = await fetch(`${SUPABASE_URL}/storage/v1/object/applications/${path.split('/').map(encodeURIComponent).join('/')}`,
    { headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE } });
  if (!file.ok) return fail('missing', 404);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (type !== 'application/pdf' && bytes.length > MAX_IMAGE) return fail('too_big', 413);

  const model = Deno.env.get('OCR_MODEL') || 'claude-sonnet-5-5';
  const source = { type: 'base64', media_type: type, data: base64(bytes) };
  try {
    const client = new Anthropic({ apiKey });
    // deno-lint-ignore no-explicit-any
    const params: any = {
      model,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          type === 'application/pdf' ? { type: 'document', source } : { type: 'image', source },
          { type: 'text', text: `This file was uploaded as ${LABELS[kind]}. Read it.` },
        ],
      }],
    };
    const res = await client.messages.create(params);
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') return await fail('failed', 502);
    const text = res.content.find((b: { type: string }) => b.type === 'text') as { text: string } | undefined;
    const reading = text ? parseReading(text.text) : null;
    if (!reading) return await fail('failed', 502);
    const saved = await asService('save_document_reading', { p_path: path, p_result: reading, p_model: model });
    if (!saved.ok || saved.data !== true) return await fail('failed', 502);
    return json({ reading }, 200);
  } catch {
    // The API's error can carry request details; the site only needs to know it did not work.
    return await fail('failed', 502);
  }
});
