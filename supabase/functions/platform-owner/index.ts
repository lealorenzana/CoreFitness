// Platform-owner only: add a new platform owner, or give one a new one-time password.
//
// Before this, "Who can run the platform" could only promote an account that
// already existed, and that account's own password was the only way in: an
// owner added by email (2026-11-23) could not sign in at all. Two actions:
//
//   create {email, firstName, lastName}
//     No account with that email: one is made with a one-time password and the
//     must-change mark, and made a platform owner. An account that already exists
//     is only made a platform owner (its password is its own; Reset gives a new one).
//   reset {userId}
//     A one-time password for someone who is ALREADY a platform owner. Gym people
//     are reset by reset-gym-password, with its own rules; never here.
//
// Rules that make this safe: the caller must be in `platform_admins` (asked of
// the database, never the browser), and granting goes through the same SQL
// `add_platform_admin` the screen used before. The password is returned once,
// shown once, emailed by the caller through send-email, stored nowhere.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
    const url = Deno.env.get("SUPABASE_URL")!;
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await caller.auth.getUser();
    if (userError || !user) return json({ error: "Invalid session" }, 401);
    const { data: isPlatform, error: platformError } = await caller.rpc("is_platform_admin");
    if (platformError || isPlatform !== true) return json({ error: "Only a platform owner can do this." }, 403);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();

    if (body.action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const firstName = String(body.firstName ?? "").trim();
      const lastName = String(body.lastName ?? "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Type a real email address." }, 400);
      if (!firstName) return json({ error: "Type their first name." }, 400);

      const password = temporaryPassword();
      const { data: made, error: makeError } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { must_change_password: true, first_name: firstName, last_name: lastName },
      });
      let existing = false;
      if (makeError) {
        // An account with this email already exists: only grant, never touch its password.
        if (!/already|exists|registered/i.test(makeError.message)) return json({ error: makeError.message }, 400);
        existing = true;
      } else {
        // The signup trigger gives every new account a member's place; a platform owner is no gym's member.
        await admin.from("gym_roles").delete().eq("user_id", made.user.id);
        await admin.from("profiles").update({ first_name: firstName, last_name: lastName }).eq("id", made.user.id);
      }
      const { error: grantError } = await caller.rpc("add_platform_admin", { p_email: email });
      if (grantError) {
        // Do not leave a fresh login behind that runs nothing.
        if (!existing && made?.user) await admin.auth.admin.deleteUser(made.user.id);
        return json({ error: grantError.message }, 400);
      }
      return json(existing ? { email, existing: true } : { email, existing: false, password }, 200);
    }

    if (body.action === "reset") {
      const userId = String(body.userId ?? "");
      const { data: owners, error: listError } = await caller.rpc("list_platform_admins");
      if (listError) return json({ error: listError.message }, 400);
      const target = (owners as { user_id: string; email: string | null }[] | null)?.find((o) => o.user_id === userId);
      if (!target) return json({ error: "That account does not run the platform. Only a platform owner can be reset here." }, 403);
      const password = temporaryPassword();
      const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password, user_metadata: { must_change_password: true } });
      if (updateError) return json({ error: updateError.message }, 400);
      return json({ email: target.email, password }, 200);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
