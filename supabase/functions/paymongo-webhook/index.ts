// PayMongo tells us a checkout was paid (0191). Deployed with --no-verify-jwt:
// PayMongo has no Supabase session — the proof is its signature instead.
//
// THE SIGNATURE. The `Paymongo-Signature` header is "t=<unix>,te=<hex>,li=<hex>":
// HMAC-SHA256 of "<t>.<raw body>" with the webhook's secret, in `te` for test
// mode and `li` for live. Anything that does not match is refused (401) and
// nothing is recorded. A payment is recorded by paymongo_settle() once per
// PayMongo payment id, and only for the amount the checkout asked.
//
// Secrets: PAYMONGO_WEBHOOK_SECRET (whsk_…), from PayMongo → Developers →
// Webhooks after adding this function's URL with ?account=platform.

import { createClient } from "npm:@supabase/supabase-js@2";

const enc = new TextEncoder();
async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** Compares in constant time, so the signature cannot be guessed a character at a time. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const raw = await req.text();
  const account = new URL(req.url).searchParams.get("account") ?? "platform";
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Core Fitness's own account (0191), or a gym's / coach's — its webhook secret from the Vault (0192).
  let secret: string | undefined;
  if (account === "platform") secret = Deno.env.get("PAYMONGO_WEBHOOK_SECRET");
  else if (/^[0-9a-f-]{36}$/i.test(account)) {
    const { data: acc } = await service.rpc("payment_account_secret", { p_account: account });
    secret = acc?.webhook_secret ?? undefined;
  }
  if (!secret) return new Response("webhook not configured", { status: 503 });

  const header = req.headers.get("Paymongo-Signature") ?? "";
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=").map((s) => s.trim()) as [string, string]));
  let event: any;
  try { event = JSON.parse(raw); } catch { return new Response("bad body", { status: 400 }); }
  const live = event?.data?.attributes?.livemode === true;
  const expected = await hmacHex(secret, `${parts.t}.${raw}`);
  if (!parts.t || !same(expected, (live ? parts.li : parts.te) ?? "")) {
    return new Response("signature does not match", { status: 401 });
  }

  const type = event?.data?.attributes?.type;
  if (type !== "checkout_session.payment.paid") return new Response(`ignored ${type}`, { status: 200 });

  const session = event.data.attributes.data;
  const payment = session?.attributes?.payments?.[0];
  if (!session?.id || !payment?.id) return new Response("no payment in event", { status: 200 });
  const method = session.attributes.payment_method_used ?? payment.attributes?.source?.type ?? null;

  const { data, error } = await service.rpc("paymongo_settle", {
    p_session: session.id, p_payment: payment.id, p_amount_centavos: payment.attributes?.amount ?? 0, p_method: method,
  });
  // 200 even for "already settled" — PayMongo retries anything else, and a retry must not double-record.
  if (error) return new Response(`not recorded: ${error.message}`, { status: 500 });
  return new Response(String(data), { status: 200 });
});
