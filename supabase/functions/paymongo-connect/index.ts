// A gym (its owner) or a coach connects their own PayMongo account (0192).
//
// The secret key is checked with PayMongo, the account's own webhook is made
// (…/paymongo-webhook?account=<id>), and the key plus the webhook's secret go
// into Supabase Vault through payment_account_store() (service role). Nothing
// here ever returns a key; the screen learns "connected, test/live, last four".
//
//   POST { kind: 'gym' | 'trainer', secretKey: 'sk_…', publicKey?: 'pk_…' }   connect
//   POST { kind, disconnect: true }                                         disconnect (and switch the webhook off)

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const basic = (key: string) => "Basic " + btoa(key + ":");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Sign in first." }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Sign in first." }, 401);
    const body = await req.json().catch(() => ({}));
    const kind = body.kind === "trainer" ? "trainer" : "gym";

    if (body.disconnect) {
      const { data: id, error } = await caller.rpc("disconnect_payment_account", { p_kind: kind });
      if (error) return json({ error: error.message }, 400);
      // Switch the account's webhook off at PayMongo too (best effort — disconnected here either way).
      const { data: acc } = await service.rpc("payment_account_secret", { p_account: id });
      if (acc?.secret && acc?.webhook_id) {
        await fetch(`https://api.paymongo.com/v1/webhooks/${acc.webhook_id}/disable`, { method: "POST", headers: { Authorization: basic(acc.secret) } }).catch(() => null);
      }
      return json({ disconnected: true });
    }

    // Who may connect what — the database decides, as the caller.
    const { data: who, error: whoError } = await caller.rpc("may_connect_payment_account", { p_kind: kind });
    if (whoError) return json({ error: whoError.message }, 403);

    const secretKey = String(body.secretKey ?? "").trim();
    const publicKey = String(body.publicKey ?? "").trim() || null;
    if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(secretKey)) {
      return json({ error: "That is not a PayMongo secret key. It starts with sk_test_ or sk_live_ — find it under Developers → API keys." }, 400);
    }
    if (publicKey && !/^pk_(test|live)_[A-Za-z0-9]+$/.test(publicKey)) {
      return json({ error: "That public key does not look right. It starts with pk_test_ or pk_live_." }, 400);
    }

    // The account's own webhook. Creating it is also the check that the key works.
    const id = crypto.randomUUID();
    const hookUrl = `${url}/functions/v1/paymongo-webhook?account=${id}`;
    const res = await fetch("https://api.paymongo.com/v1/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basic(secretKey) },
      body: JSON.stringify({ data: { attributes: { url: hookUrl, events: ["checkout_session.payment.paid"] } } }),
    });
    const out = await res.json().catch(() => null);
    if (res.status === 401) return json({ error: "PayMongo did not accept that secret key. Copy it again from Developers → API keys." }, 400);
    if (!res.ok || !out?.data?.id) {
      return json({ error: `PayMongo could not connect: ${out?.errors?.[0]?.detail ?? res.status}` }, 502);
    }

    const { error: storeError } = await service.rpc("payment_account_store", {
      p_id: id, p_gym: who.gym_id, p_kind: kind, p_trainer: who.trainer_id, p_public: publicKey,
      p_secret: secretKey, p_webhook_id: out.data.id, p_webhook_secret: out.data.attributes.secret_key, p_by: user.id,
    });
    if (storeError) return json({ error: storeError.message }, 500);
    return json({ connected: true, live: secretKey.startsWith("sk_live_"), key_last4: secretKey.slice(-4) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
