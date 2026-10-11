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
    const platformKey = Deno.env.get("PAYMONGO_SECRET_KEY");
    if (body.probe) return json({ configured: !!platformKey });

    // Back from PayMongo, the screen asks: was it paid? This asks PayMongo itself (not the screen, not
    // the webhook) and records it the same way the webhook would — so a late or lost webhook never
    // leaves a paid member waiting. Only the person who started the checkout may ask.
    if (body.reconcile) {
      const { data: c } = await service.from("paymongo_checkouts")
        .select("id, account, status, checkout_session_id, member_id, created_by").eq("id", body.reconcile).maybeSingle();
      if (!c || (c.member_id !== user.id && c.created_by !== user.id)) return json({ error: "Not your payment." }, 403);
      if (c.status === "paid") return json({ status: "paid" });
      if (!c.checkout_session_id) return json({ status: c.status });
      let rkey = platformKey;
      if (c.account !== "platform") {
        const { data: acc } = await service.rpc("payment_account_secret", { p_account: c.account });
        rkey = acc?.secret;
      }
      if (!rkey) return json({ status: c.status, error: "This account's key is not available." });
      const r = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${c.checkout_session_id}`, {
        headers: { Authorization: "Basic " + btoa(rkey + ":") },
      });
      const sess = await r.json().catch(() => null);
      if (!r.ok) return json({ status: c.status, error: sess?.errors?.[0]?.detail ?? `PayMongo answered ${r.status}` });
      const paid = (sess?.data?.attributes?.payments ?? []).find((p: any) => p?.attributes?.status === "paid");
      if (!paid) return json({ status: "unpaid", paymongo: sess?.data?.attributes?.status ?? null });
      const { data: settled, error: sErr } = await service.rpc("paymongo_settle", {
        p_session: c.checkout_session_id, p_payment: paid.id, p_amount_centavos: paid.attributes?.amount ?? 0,
        p_method: sess.data.attributes.payment_method_used ?? paid.attributes?.source?.type ?? null,
      });
      if (sErr) return json({ status: c.status, error: `Paid at PayMongo, but not recorded: ${sErr.message}` }, 500);
      return json({ status: "paid", result: settled });
    }
    // A member pays their gym (or a coach) — 0192; a gym pays Core Fitness — 0191.
    const memberPays = ["membership", "coaching", "day_pass"].includes(body.purpose);
    if (!memberPays && !platformKey) {
      return json({ configured: false, error: "Online payment is not set up yet. Send the reference and a screenshot instead." });
    }

    // 1. The database prepares the row and decides the price (as the caller, so its rules apply).
    const { data: prepared, error: prepError } = await caller.rpc(memberPays ? "paymongo_prepare_member" : "paymongo_prepare_platform", {
      p_purpose: body.purpose, p_details: body.details ?? {},
    });
    if (prepError) return json({ error: prepError.message }, 400);
    const { data: row, error: rowError } = await service.rpc("paymongo_checkout_for", { p_id: prepared.id });
    if (rowError || !row) return json({ error: rowError?.message ?? "Could not prepare the payment." }, 400);

    // Whose PayMongo account takes the money: Core Fitness's, or the gym's / coach's own (from the Vault).
    let key = platformKey;
    if (row.account !== "platform") {
      const { data: acc } = await service.rpc("payment_account_secret", { p_account: row.account });
      if (!acc?.active || !acc?.secret) return json({ configured: false, error: "This gym's online payments are switched off. Pay at the desk." });
      key = acc.secret;
    }

    // 2. PayMongo opens the session.
    const back = safeUrl(body.returnUrl, memberPays ? "https://corefitness-gym.vercel.app/member/membership" : "https://corefitness-admin.vercel.app/subscription");
    const sep = back.includes("?") ? "&" : "?";
    // QRPh first (0192): one QR that GCash, Maya and every bank app can scan, and often the first method a new
    // PayMongo account has active. An account without the others enabled gets a retry with QRPh alone.
    const wanted = (Deno.env.get("PAYMONGO_PAYMENT_METHODS") ?? "qrph,gcash,paymaya,card,grab_pay,dob")
      .split(",").map((m) => m.trim()).filter(Boolean);
    const open = (methods: string[]) => fetch("https://api.paymongo.com/v1/checkout_sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Basic " + btoa(key! + ":") },
      body: JSON.stringify({ data: { attributes: {
        line_items: [{ name: row.description, amount: row.amount_centavos, currency: "PHP", quantity: 1 }],
        payment_method_types: methods,
        description: row.description,
        reference_number: row.id,
        send_email_receipt: true, show_description: true, show_line_items: true,
        success_url: `${back}${sep}paid=${row.id}`,
        cancel_url: `${back}${sep}cancelled=${row.id}`,
        metadata: { checkout_id: row.id, account: row.account },
      } } }),
    });
    let res = await open(wanted);
    if (!res.ok && res.status < 500 && wanted.length > 1 && wanted.includes("qrph")) {
      const first = await res.clone().json().catch(() => null);
      const why = JSON.stringify(first?.errors ?? "");
      if (/payment_method|not (enabled|activated|available)|inactive/i.test(why)) res = await open(["qrph"]);
    }
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
