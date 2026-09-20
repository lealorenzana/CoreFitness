// Platform-owner only: give a gym's owner or front desk a new temporary password.
//
// The support call this answers is the most ordinary one a service gets — "I
// cannot get in" — and until now there was no answer to it at all. A password
// cannot be read back by anyone, including us, so helping means replacing it.
//
// Two rules make that safe to hand to one person:
//
//   1. Only someone in `platform_admins` may call it (checked against the
//      database, not against anything the browser said).
//   2. Only a gym's **admin or staff** may be reset — the platform's own
//      counterparties. A gym's members and coaches belong to that gym, and
//      resetting one would be reaching into a gym's people, which is the line
//      docs/TENANCY.md draws. `platform_gym_people()` (0109) is the same filter,
//      and it is asked here rather than reimplemented.
//
// The new password is returned ONCE, shown on screen, and stored nowhere. It is
// marked must-change, so the owner replaces it on their first sign-in.

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

/** Read down a phone line and typed once: no 0/O, 1/l/I. crypto, never Math.random. */
function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) return json({ error: "Invalid session" }, 401);

    const { data: isPlatform, error: platformError } = await callerClient.rpc("is_platform_admin");
    if (platformError || isPlatform !== true) {
      return json({ error: "Forbidden — the platform owner only" }, 403);
    }

    const { gymId, userId } = await req.json();
    if (!gymId || !userId) return json({ error: "gymId and userId are required" }, 400);

    // The authority for "may this person be reset" is the same function the
    // Gyms screen lists people with, so the two can never disagree: it returns
    // a gym's admins and staff and nobody else.
    const { data: people, error: peopleError } = await callerClient
      .rpc("platform_gym_people", { p_gym: gymId });
    if (peopleError) return json({ error: peopleError.message }, 400);

    const target = (people as { user_id: string; email: string | null; is_owner: boolean }[] | null)
      ?.find((p) => p.user_id === userId);
    if (!target) {
      return json({
        error: "That person does not run this gym. Only a gym's owner or front desk can be reset here.",
      }, 403);
    }

    const password = temporaryPassword();
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
      password,
      user_metadata: { must_change_password: true },
    });
    if (updateError) return json({ error: updateError.message }, 400);

    return json({ email: target.email, isOwner: target.is_owner, password }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
