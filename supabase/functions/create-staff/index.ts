// Admin-only: creates a front-desk staff account.
//
// Staff run day-to-day operations — take payments, check members in, extend
// memberships — without being able to change plan pricing, manage trainers, or
// create accounts. The permission matrix lives in migration 0012.
//
// Server-side for the same reason as create-trainer and create-member: a
// client-side supabase.auth.signUp() would swap the admin's own browser session
// for the new account's.
//
// It is also the *only* way a staff account can come into existence. Staff have
// no write access to `profiles`, so nothing short of the service-role key can
// mint one — which is the point: an account that can take money should never be
// creatable by someone who only takes money.
//
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are auto-injected
// by the Supabase runtime. The service-role key never appears in either frontend.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller's JWT with the anon-key client — never trust it blindly.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();
    if (userError || !user) return json({ error: "Invalid session" }, 401);

    // Admin only — deliberately NOT is_front_desk(). Staff must not be able to
    // create more staff; that would make the role self-propagating.
    const { data: callerProfile, error: profileError } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profileError || callerProfile?.role !== "admin") {
      return json({ error: "Forbidden — admin only" }, 403);
    }

    const { email, password, firstName, lastName, phone } = await req.json();

    if (!email || !password || !firstName || !lastName) {
      return json({ error: "email, password, firstName, lastName are required" }, 400);
    }
    if (String(password).length < 8) {
      return json({ error: "Password must be at least 8 characters" }, 400);
    }

    // Service-role client — bypasses RLS, used ONLY after the admin check passed.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !created.user) {
      return json({ error: createError?.message ?? "Failed to create staff account" }, 400);
    }

    const newId = created.user.id;

    const { error: insertError } = await adminClient.from("profiles").insert({
      id: newId,
      role: "staff",
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone ?? null,
      status: "active",
    });
    if (insertError) {
      // Roll back the orphaned auth user so a partial failure can't leave a
      // login that resolves to no profile.
      await adminClient.auth.admin.deleteUser(newId);
      return json({ error: insertError.message }, 400);
    }

    return json({ id: newId, email }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
