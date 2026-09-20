// Platform-owner only: gives a new gym its owner.
//
// `create_gym()` (0106) makes the gym and stocks it with plans, point rules,
// reasons and badges — but it stops there, because creating a *login* needs the
// Auth admin API, which no SQL function and no browser may ever hold. That half
// is this function. Until it runs, a new gym is real and nobody can sign in.
//
// Two shapes of owner:
//   - a stranger  → an account is created here with a temporary password
//   - someone already in the system (they own another gym, or were a member
//     somewhere) → no second account; the existing one is made this gym's owner
//
// The temporary password is RETURNED ONCE, to the platform app, and shown on
// screen for the platform owner to pass on. There is no mail sender configured
// for this project, and a function that claims to have emailed an invitation
// that nobody sent would be a lie on screen (CLAUDE.md: a control writing a flag
// nothing reads is a lie). It is never stored: only Supabase Auth's hash keeps
// it, and the owner replaces it on their first sign-in.
//
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are auto-injected
// by the Supabase runtime. The service-role key never appears in any frontend.

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

/**
 * A password the owner can read down a phone line and type once: no look-alike
 * characters (0/O, 1/l/I), and long enough that guessing is hopeless. Built from
 * crypto.getRandomValues, never Math.random — this is a real credential.
 */
function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
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
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) return json({ error: "Invalid session" }, 401);

    // Platform owner only — deliberately NOT a gym's admin. A gym owner adds
    // staff and coaches to their own gym (create-staff); naming the owner of a
    // *gym* is the platform's act alone.
    const { data: isPlatform, error: platformError } = await callerClient.rpc("is_platform_admin");
    if (platformError || isPlatform !== true) {
      return json({ error: "Forbidden — the platform owner only" }, 403);
    }

    const { gymId, email, firstName, lastName, phone } = await req.json();
    if (!gymId || !email || !firstName || !lastName) {
      return json({ error: "gymId, email, firstName, lastName are required" }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: gym, error: gymError } = await adminClient
      .from("gyms").select("id, name").eq("id", gymId).maybeSingle();
    if (gymError) return json({ error: gymError.message }, 400);
    if (!gym) return json({ error: "That gym does not exist." }, 404);

    // Already here? Then this is a second gym for someone we know, and creating
    // another account would split one person in two (docs/TENANCY.md: a role is
    // per gym, a person is not).
    const { data: existingId } = await callerClient.rpc("platform_find_user", { p_email: email });
    if (existingId) {
      const { error: ownerError } = await callerClient.rpc("make_gym_owner", {
        p_gym: gymId, p_user: existingId,
      });
      if (ownerError) return json({ error: ownerError.message }, 400);
      return json({ id: existingId, email, gym: gym.name, existing: true, password: null }, 200);
    }

    const password = temporaryPassword();
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      // Read by the admin app on sign-in: the setup wizard's last step makes
      // them choose their own and clears this.
      user_metadata: { must_change_password: true },
    });
    if (createError || !created.user) {
      return json({ error: createError?.message ?? "Could not create the owner's account" }, 400);
    }
    const newId = created.user.id;

    // The owner's profile belongs to the gym they are about to run. `role` is
    // the legacy column, kept in step with the real per-gym role below.
    const { error: insertError } = await adminClient.from("profiles").insert({
      id: newId,
      active_gym_id: gymId,
      role: "admin",
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone ?? null,
      status: "active",
    });
    if (insertError) {
      // Roll back the orphaned auth user: a login that resolves to no profile
      // is worse than no login at all.
      await adminClient.auth.admin.deleteUser(newId);
      return json({ error: insertError.message }, 400);
    }

    const { error: ownerError } = await callerClient.rpc("make_gym_owner", {
      p_gym: gymId, p_user: newId,
    });
    if (ownerError) {
      await adminClient.auth.admin.deleteUser(newId);
      return json({ error: ownerError.message }, 400);
    }

    return json({ id: newId, email, gym: gym.name, existing: false, password }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
