// Admin-only: registers a walk-in member at the front desk.
//
// Core Fitness accepts both self-registration (phone app -> pending_approval ->
// admin approves) and walk-ins who may not own a smartphone. This is the walk-in
// path: the admin types their details at the desk and the account is created
// already active, skipping the approval queue.
//
// It has to run server-side for the same reason as create-trainer — a client-side
// supabase.auth.signUp() would swap the admin's own browser session for the new
// member's.
//
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are auto-injected
// by the Supabase runtime. The service-role key never appears in either frontend.

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

    // Confirm the caller is an admin through that same RLS-bound client.
    // The caller's role in *their current gym* (0104), never the legacy global
    // profiles.role: one person can own this gym and be a member of another.
    // The new account joins that same gym.
    const { data: ctxRows, error: ctxError } = await callerClient.rpc("my_gym_context");
    const ctx = Array.isArray(ctxRows) ? ctxRows[0] : null;
    if (ctxError || ctx?.role !== "admin" || ctx?.status !== "active") {
      return json({ error: "Forbidden — admin only" }, 403);
    }
    const gymId = ctx.gym_id as string;

    const {
      email: typedEmail,
      username: typedUsername,
      firstName,
      lastName,
      phone,
      address,
      dateOfBirth,
      gender,
      emergencyContactName,
      emergencyContactPhone,
      emergencyContactRelationship,
      experienceLevel,
      planId,
    } = await req.json();

    // Service-role client — bypasses RLS, used ONLY after the admin check passed.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // 0236 (the owner, 2026-11-07): the desk never types a password. A one-time
    // password is made here, shown on the login slip, and replaced at the first
    // sign-in (must_change_password). The member signs in with their email or a
    // username; with no email the address is a stand-in that never receives mail.
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
      return json({ error: createError?.message ?? "Failed to create member account" }, 400);
    }

    const newId = created.user.id;
    // Roll back the orphaned auth user so a partial failure can't leave a login
    // that resolves to no profile.
    const rollback = async (message: string) => {
      await adminClient.auth.admin.deleteUser(newId);
      return json({ error: message }, 400);
    };

    const { error: profileInsertError } = await adminClient.from("profiles").insert({
      id: newId,
      active_gym_id: gymId,
      role: "member",
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone ?? null,
      status: "active", // walk-ins are added by staff, so no approval queue
      ...(username ? { username } : {}),
    });
    if (profileInsertError) return await rollback(profileInsertError.message);

    // The role in this gym, and the member row under it — as the admin, so the
    // rules decide (0104's add_person_to_gym), not the service key.
    const { error: roleError } = await callerClient.rpc("add_person_to_gym", {
      p_user: newId, p_role: "member", p_status: "active",
    });
    if (roleError) return await rollback(roleError.message);

    const { error: memberInsertError } = await adminClient.from("member_profiles").upsert({
      gym_id: gymId,
      profile_id: newId,
      qr_code: newId, // same convention as the approval flow
      address: address ?? null,
      // 0031 fields. `|| null` rather than `?? null` on purpose: the form sends
      // "" for an untouched date picker, and ''::date raises in Postgres.
      date_of_birth: dateOfBirth || null,
      gender: gender || null,
      emergency_contact_name: emergencyContactName ?? null,
      emergency_contact_phone: emergencyContactPhone ?? null,
      emergency_contact_relationship: emergencyContactRelationship ?? null,
      experience_level: experienceLevel ?? null,
    }, { onConflict: "gym_id,profile_id" });
    if (memberInsertError) return await rollback(memberInsertError.message);

    // Membership starts 'pending' — it only becomes active once the desk records
    // the cash payment, which is what payments.recordPayment() does.
    if (planId) {
      const { error: membershipError } = await adminClient.from("memberships").insert({
        gym_id: gymId,
        member_id: newId,
        plan_id: planId,
        status: "pending",
        start_date: new Date().toISOString().slice(0, 10),
      });
      if (membershipError) return await rollback(membershipError.message);
    }

    // The slip: the real email (never the stand-in), the username, the one-time password.
    return json({ id: newId, email: isStandIn(email) ? null : email, username, password }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
