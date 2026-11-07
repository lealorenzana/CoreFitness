// Admin-only: creates a real Supabase Auth account + profile for a new trainer,
// without touching the calling admin's own browser session (a client-side
// supabase.auth.signUp() would sign the current browser in as the new user instead).
//
// SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are auto-injected
// into every deployed Edge Function by the Supabase runtime — nothing to configure.
// The service-role key never appears in either frontend app.

import { createClient } from "npm:@supabase/supabase-js@2";
import { isStandIn, standInEmail, temporaryPassword, tidyUsername, usernameProblem } from "../_shared/logins.ts";

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
    // The caller's role in *their current gym* (0104), never the legacy global
    // profiles.role: one person can own this gym and be a member of another.
    // The new account joins that same gym.
    const { data: ctxRows, error: ctxError } = await callerClient.rpc("my_gym_context");
    const ctx = Array.isArray(ctxRows) ? ctxRows[0] : null;
    if (ctxError || ctx?.role !== "admin" || ctx?.status !== "active") {
      return json({ error: "Forbidden — admin only" }, 403);
    }
    const gymId = ctx.gym_id as string;

    const { email: typedEmail, username: typedUsername, firstName, lastName, phone, specialization, bio, availability } =
      await req.json();

    // 0236 (the owner, 2026-11-07): the desk never types a password. A one-time
    // password is made here, shown on the login slip, and replaced at the first
    // sign-in (must_change_password). They sign in with their email or a
    // username; with no email the address is a stand-in that never receives mail.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const username = tidyUsername(typedUsername) || null;
    const emailIn = String(typedEmail ?? "").trim().toLowerCase();
    if (!firstName || !lastName) return json({ error: "First and last name are required" }, 400);
    if (!emailIn && !username) return json({ error: "Give an email or a username — they sign in with it." }, 400);
    if (username) {
      const why = await usernameProblem(adminClient, username);
      if (why) return json({ error: why }, 400);
    }
    const email = emailIn || standInEmail(username!);
    const password = temporaryPassword();

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { must_change_password: true, first_name: firstName, last_name: lastName },
    });
    if (createError || !created.user) {
      return json({ error: createError?.message ?? "Failed to create trainer auth account" }, 400);
    }

    const newId = created.user.id;

    const { error: profileInsertError } = await adminClient.from("profiles").insert({
      active_gym_id: gymId,
      id: newId,
      role: "trainer",
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone ?? null,
      status: "active",
      ...(username ? { username } : {}),
    });
    if (profileInsertError) {
      // Roll back the orphaned auth user so a failed creation doesn't leave a broken account behind.
      await adminClient.auth.admin.deleteUser(newId);
      return json({ error: profileInsertError.message }, 400);
    }

    // The coach's role in this gym, and their coach row under it — as the
    // admin, so the rules decide (0104's add_person_to_gym).
    const { error: roleError } = await callerClient.rpc("add_person_to_gym", {
      p_user: newId, p_role: "trainer", p_status: "active",
    });
    if (roleError) {
      await adminClient.auth.admin.deleteUser(newId);
      return json({ error: roleError.message }, 400);
    }

    const { error: trainerInsertError } = await adminClient.from("trainer_profiles").upsert({
      gym_id: gymId,
      profile_id: newId,
      specialization: specialization ?? null,
      bio: bio ?? null,
      availability: availability ?? null,
    }, { onConflict: "gym_id,profile_id" });
    if (trainerInsertError) {
      await adminClient.auth.admin.deleteUser(newId);
      return json({ error: trainerInsertError.message }, 400);
    }

    return json({ id: newId, email: isStandIn(email) ? null : email, username, password }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
