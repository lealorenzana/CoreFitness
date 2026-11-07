// Reset a login at the desk (0236, 2026-11-07): a new one-time password for a
// slip, and the account asks for a new password again at its next sign-in.
//
// Who may, and whose, is SQL's call: login_reset_check() runs AS THE CALLER
// first — the desk resets members, the owner anyone in the gym, and only an
// account with no real email or one that never finished its first sign-in (an
// account with its own email uses Forgot password; the desk can never quietly
// take over a working one). It also writes the activity log. Only then does the
// service role touch the account.

import { createClient } from "npm:@supabase/supabase-js@2";
import { isStandIn, temporaryPassword } from "../_shared/logins.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const caller = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await caller.auth.getUser();
    if (userError || !user) return json({ error: "Invalid session" }, 401);

    const { userId } = await req.json().catch(() => ({}));
    if (!userId || typeof userId !== "string") return json({ error: "Who to reset?" }, 400);

    const { data: username, error: checkError } = await caller.rpc("login_reset_check", { p_user: userId });
    if (checkError) return json({ error: checkError.message }, 403);

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: got, error: getError } = await admin.auth.admin.getUserById(userId);
    if (getError || !got.user) return json({ error: "That account was not found." }, 404);
    const password = temporaryPassword();
    const { error: upError } = await admin.auth.admin.updateUserById(userId, {
      password, user_metadata: { ...(got.user.user_metadata ?? {}), must_change_password: true },
    });
    if (upError) return json({ error: upError.message }, 400);

    const email = got.user.email ?? null;
    return json({ password, username: username ?? null, email: isStandIn(email) ? null : email }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
