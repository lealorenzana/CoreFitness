// Admin-only: creates a real Supabase Auth account + profile for a new trainer,
// without touching the calling admin's own browser session (a client-side
// supabase.auth.signUp() would sign the current browser in as the new user instead).
//
// SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are auto-injected
// into every deployed Edge Function by the Supabase runtime — nothing to configure.
// The service-role key never appears in either frontend app.

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
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

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
    if (userError || !user) {
      return json({ error: "Invalid session" }, 401);
    }

    // Confirm the caller is an admin via the SAME anon-key client, so this read is
    // itself subject to RLS (profiles_select_self) rather than a service-role bypass.
    const { data: callerProfile, error: profileError } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || callerProfile?.role !== "admin") {
      return json({ error: "Forbidden — admin only" }, 403);
    }

    const { email, password, firstName, lastName, phone, specialization, bio, availability } =
      await req.json();

    if (!email || !password || !firstName || !lastName) {
      return json({ error: "email, password, firstName, lastName are required" }, 400);
    }

    // Service-role client — bypasses RLS, used ONLY after the admin check above passes.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !created.user) {
      return json({ error: createError?.message ?? "Failed to create trainer auth account" }, 400);
    }

    const newId = created.user.id;

    const { error: profileInsertError } = await adminClient.from("profiles").insert({
      id: newId,
      role: "trainer",
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone ?? null,
      status: "active",
    });
    if (profileInsertError) {
      // Roll back the orphaned auth user so a failed creation doesn't leave a broken account behind.
      await adminClient.auth.admin.deleteUser(newId);
      return json({ error: profileInsertError.message }, 400);
    }

    const { error: trainerInsertError } = await adminClient.from("trainer_profiles").insert({
      profile_id: newId,
      specialization: specialization ?? null,
      bio: bio ?? null,
      availability: availability ?? null,
    });
    if (trainerInsertError) {
      await adminClient.auth.admin.deleteUser(newId);
      return json({ error: trainerInsertError.message }, 400);
    }

    return json({ id: newId, email }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
