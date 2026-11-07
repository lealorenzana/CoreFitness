// Sign in with a username (0236, 2026-11-07). Deployed with --no-verify-jwt:
// whoever calls it is not signed in yet.
//
// The address behind a username is found here, with the service role, and never
// returned: the client gets a session or one sentence, the same for an unknown
// username as for a wrong password, so nobody can learn who has an account or
// what their email is. A sign-in made from this server bypasses Auth's per-IP
// limit, so this function keeps its own — 5 failed tries per username in 15
// minutes, in login_failures (RLS on, no policy for any client role).

import { createClient } from "npm:@supabase/supabase-js@2";
import { tidyUsername, USERNAME_RE } from "../_shared/logins.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const NO_MATCH = "That username and password don't match. Check both, or ask the front desk to reset your login.";
const WINDOW_MIN = 15;
const MAX_FAILS = 5;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const username = tidyUsername(body.username);
    const password = String(body.password ?? "");
    if (!USERNAME_RE.test(username) || !password) return json({ error: NO_MATCH }, 400);

    const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
    const { count } = await admin.from("login_failures").select("id", { count: "exact", head: true })
      .eq("username", username).gte("at", since);
    if ((count ?? 0) >= MAX_FAILS) {
      return json({ error: `Too many tries for this username. Wait ${WINDOW_MIN} minutes, or ask the front desk to reset your login.` }, 429);
    }
    const fail = async () => {
      await admin.from("login_failures").insert({ username });
      return json({ error: NO_MATCH }, 400);
    };

    const { data: email, error: lookError } = await admin.rpc("login_email_for_username", { p: username });
    if (lookError) return json({ error: "Sign-in by username is not available yet. Use your email." }, 503);
    if (!email) return await fail();

    // A fresh anon client per request: the session belongs to the caller, never kept here.
    const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await anon.auth.signInWithPassword({ email: String(email), password });
    if (error || !data.session) {
      // A suspended or unconfirmed account says so; a wrong password says the one sentence.
      if (error && !/invalid login credentials/i.test(error.message)) return json({ error: error.message }, 400);
      return await fail();
    }
    await admin.from("login_failures").delete().eq("username", username);
    return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
