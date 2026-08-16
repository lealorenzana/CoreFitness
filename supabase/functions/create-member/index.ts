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
    const { data: callerProfile, error: profileError } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profileError || callerProfile?.role !== "admin") {
      return json({ error: "Forbidden — admin only" }, 403);
    }

    const {
      email,
      password,
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

    if (!email || !password || !firstName || !lastName) {
      return json({ error: "email, password, firstName, lastName are required" }, 400);
    }

    // Service-role client — bypasses RLS, used ONLY after the admin check passed.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
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
      role: "member",
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone ?? null,
      status: "active", // walk-ins are added by staff, so no approval queue
    });
    if (profileInsertError) return await rollback(profileInsertError.message);

    const { error: memberInsertError } = await adminClient.from("member_profiles").insert({
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
    });
    if (memberInsertError) return await rollback(memberInsertError.message);

    // Membership starts 'pending' — it only becomes active once the desk records
    // the cash payment, which is what payments.recordPayment() does.
    if (planId) {
      const { error: membershipError } = await adminClient.from("memberships").insert({
        member_id: newId,
        plan_id: planId,
        status: "pending",
        start_date: new Date().toISOString().slice(0, 10),
      });
      if (membershipError) return await rollback(membershipError.message);
    }

    return json({ id: newId, email }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
