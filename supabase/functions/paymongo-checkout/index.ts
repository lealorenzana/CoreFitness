// Opens a PayMongo Checkout Session for something a signed-in person may pay
// for (0191). The price is never the caller's: SQL prepares the pending row
// (paymongo_prepare_platform), this function opens the session with the right
// PayMongo key and ties it to the row, and only PayMongo's webhook (signature
// checked, `paymongo-webhook`) can mark it paid.
//
// Keys (Supabase → Edge Functions → Secrets, set by the owner of the account):
//   PAYMONGO_SECRET_KEY   sk_test_… / sk_live_…   Core Fitness's own account
// With no key set this says so ({ configured: false }) and the screen keeps
// offering the reference-and-screenshot path — nothing pretends to charge.
//
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected.

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Where a payer may be sent back to. Anything else falls back to the admin app.
const ALLOWED = [
  "https://corefitness-admin.vercel.app", "https://corefitness-gym.vercel.app", "https://corefitness-site.vercel.app",
  "http://localhost:5173", "http://localhost:5174", "http://localhost:5176",
];
const safeUrl = (u: unknown, fallback: string) =>
  typeof u === "string" && ALLOWED.some((o) => u === o || u.startsWith(o + "/")) ? u : fallback;

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
    const key = Deno.env.get("PAYMONGO_SECRET_KEY");
    if (body.probe) return json({ configured: !!key });
    if (!key) return json({ configured: false, error: "Online payment is not set up yet. Send the reference and a screenshot instead." });

    // 1. The database prepares the row and decides the price (as the caller, so its rules apply).
    const { data: prepared, error: prepError } = await caller.rpc("paymongo_prepare_platform", {
      p_purpose: body.purpose, p_details: body.details ?? {},
    });
    if (prepError) return json({ error: prepError.message }, 400);
    const { data: row, error: rowError } = await service.rpc("paymongo_checkout_for", { p_id: prepared.id });
    if (rowError || !row) return json({ error: rowError?.message ?? "Could not prepare the payment." }, 400);

    // 2. PayMongo opens the session.
    const back = safeUrl(body.returnUrl, "https://corefitness-admin.vercel.app/subscription");
    const sep = back.includes("?") ? "&" : "?";
    const res = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Basic " + btoa(key + ":") },
      body: JSON.stringify({ data: { attributes: {
        line_items: [{ name: row.description, amount: row.amount_centavos, currency: "PHP", quantity: 1 }],
        payment_method_types: ["gcash", "paymaya", "card", "grab_pay", "dob"],
        description: row.description,
        reference_number: row.id,
        send_email_receipt: true, show_description: true, show_line_items: true,
        success_url: `${back}${sep}paid=${row.id}`,
        cancel_url: `${back}${sep}cancelled=${row.id}`,
        metadata: { checkout_id: row.id, account: row.account },
      } } }),
    });
    const out = await res.json().catch(() => null);
    if (!res.ok || !out?.data?.id) {
      const detail = out?.errors?.[0]?.detail ?? `PayMongo answered ${res.status}`;
      return json({ error: `PayMongo could not open the payment: ${detail}` }, 502);
    }

    // 3. The session is tied to the row; only the webhook settles it.
    await service.rpc("paymongo_attach", { p_id: row.id, p_session: out.data.id, p_url: out.data.attributes.checkout_url });
    return json({ configured: true, url: out.data.attributes.checkout_url, id: row.id });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
