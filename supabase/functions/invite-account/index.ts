// An invitation is a login (0202, 2026-10-20, the owner's design).
//
// The desk invites someone — a member, a coach, or (owner only) front-desk
// staff. This function:
//   1. makes the invitation through `invite_to_gym()` AS THE CALLER, so the SQL
//      rules decide who may invite whom (the desk invites members only);
//   2. makes the login: a new account with a one-time password, or — when the
//      address already has an account (they belong to another gym) — no second
//      account and no password change;
//   3. emails the address, the one-time password and the right app — the admin
//      app for the front desk, the phone app for a coach or a member — through
//      `send-email`, also as the caller, so the outbox records who sent it.
//
// The new account belongs to NO gym. 0097's mirror trigger files a gym-less
// profile under Gym #1; that row is removed here, so the person gets in only by
// signing in and finishing the first-sign-in form, which calls
// `complete_invitation()` — the acceptance, with every check `accept_invitation`
// makes. A withdrawn or expired invitation therefore gives nothing.
//
// The one-time password is returned to the screen ONLY when the email did not
// go out, so the desk can hand it over in person (approve-gym's rule: never
// claim an email nobody sent). It is never stored; Supabase keeps only a hash,
// and the first sign-in replaces it (`must_change_password`).

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

/** Readable down a phone line: no 0/O or 1/l/I. crypto, never Math.random. */
function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

const ADMIN_APP = "https://corefitness-admin.vercel.app";
const MEMBER_APP = "https://corefitness-gym.vercel.app";

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

    const { data: ctxRows } = await callerClient.rpc("my_gym_context");
    const ctx = Array.isArray(ctxRows) ? ctxRows[0] : null;
    if (!ctx || !["admin", "staff"].includes(ctx.role) || ctx.status !== "active") {
      return json({ error: "Only the gym's owner or front desk can invite." }, 403);
    }
    const gymId = ctx.gym_id as string;
    const gymName = (ctx.gym_name as string) ?? "Your gym";

    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = String(body.role ?? "member");
    const firstName = String(body.firstName ?? "").trim() || null;
    const lastName = String(body.lastName ?? "").trim() || null;
    const phone = String(body.phone ?? "").trim() || null;
    const note = String(body.note ?? "").trim() || null;
    const sendEmail = body.sendEmail !== false;

    // 1. The invitation, by the rules (raises for the desk inviting a coach, a
    //    person already in this gym, a bad address, a read-only gym).
    const { data: invRows, error: invError } = await callerClient.rpc("invite_to_gym", {
      p_email: email, p_role: role, p_first: firstName, p_last: lastName, p_phone: phone, p_note: note,
    });
    if (invError) return json({ error: invError.message }, 400);
    const inv = (Array.isArray(invRows) ? invRows[0] : invRows) as { id: string; token: string };

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // 2. The login.
    const { data: known } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
    let userId = known?.id as string | undefined;
    let password: string | null = null;
    let existing = false;

    if (userId) {
      const { data: got } = await admin.auth.admin.getUserById(userId);
      const meta = (got?.user?.user_metadata ?? {}) as Record<string, unknown>;
      const neverSignedIn = !got?.user?.last_sign_in_at;
      const patch: Record<string, unknown> = { user_metadata: { ...meta, invite_token: inv.token, invite_pending: true } };
      if (neverSignedIn && meta.invite_pending) {
        // An earlier invitation's account nobody has used yet: a fresh password,
        // since the old one went out with the invitation this one replaces.
        password = temporaryPassword();
        patch.password = password;
        (patch.user_metadata as Record<string, unknown>).must_change_password = true;
      } else {
        existing = true;
      }
      const { error: upError } = await admin.auth.admin.updateUserById(userId, patch);
      if (upError) return json({ error: upError.message }, 400);
    } else {
      password = temporaryPassword();
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { must_change_password: true, invite_pending: true, invite_token: inv.token, first_name: firstName, last_name: lastName },
      });
      if (createError || !created.user) {
        await callerClient.rpc("revoke_invitation", { p_id: inv.id });
        return json({ error: createError?.message ?? "The login could not be made." }, 400);
      }
      userId = created.user.id;
      // No gym on the profile — like a gym applicant's account (0187) — so the
      // activity log does not say "added" before they accepted anything; and
      // the legacy role column is 'member' (nothing reads it; gym_roles decides).
      const { error: profileError } = await admin.from("profiles").insert({
        id: userId, role: "member", first_name: firstName ?? "New", last_name: lastName ?? (role === "trainer" ? "Coach" : role === "staff" ? "Staff" : "Member"),
        email, phone, status: "active", active_gym_id: null,
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(userId);
        await callerClient.rpc("revoke_invitation", { p_id: inv.id });
        return json({ error: profileError.message }, 400);
      }
      // 0097's mirror files a gym-less profile under Gym #1. Access comes only
      // from finishing the invitation, so that row goes (0187 does the same).
      await admin.from("gym_roles").delete().eq("user_id", userId);
    }

    // 3. The email.
    let emailed: "sent" | "failed" | "not_configured" | "skipped" = "skipped";
    let emailError: string | undefined;
    if (sendEmail) {
      const app = role === "staff" ? `${ADMIN_APP}/admin/login` : `${MEMBER_APP}/login${role === "trainer" ? "?as=trainer" : ""}`;
      const what = role === "member" ? "a member" : role === "trainer" ? "a coach" : "front desk staff";
      const where = role === "staff" ? "the gym's dashboard (on a computer)" : "the Core Fitness app (on your phone)";
      const name = [firstName, lastName].filter(Boolean).join(" ") || null;
      const expires = new Date(Date.now() + 30 * 86400000).toLocaleDateString("en-PH", { day: "numeric", month: "long", year: "numeric" });
      const lines = [
        `Hi${firstName ? " " + firstName : ""},`,
        `${gymName} has invited you to join as ${what} on Core Fitness.`,
        existing
          ? `You already have a Core Fitness account with this email. Sign in to ${where} with your usual password:\n${app}\n\nYou will be asked to finish joining ${gymName}.`
          : `Your login for ${where}:\n\nSign in at: ${app}\nEmail: ${email}\nOne-time password: ${password}\n\nWhen you sign in you will choose your own password and fill in a short form, then you are in.`,
        `This invitation works until ${expires}. If you were not expecting it, ignore this email.`,
      ];
      const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: { Authorization: authHeader, apikey: anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email, toName: name, kind: "invitation", gymId,
          subject: existing ? `${gymName} invited you on Core Fitness` : `Your Core Fitness login for ${gymName}`,
          body: lines.join("\n\n"),
        }),
      }).catch((e) => ({ ok: false, json: async () => ({ error: String(e) }) } as Response));
      const out = await res.json().catch(() => ({}));
      emailed = res.ok ? (out.status ?? "failed") : "failed";
      emailError = res.ok ? out.error : (out.error ?? "The email service did not answer.");
    }

    return json({
      id: inv.id, token: inv.token, userId, existing, emailed, emailError,
      // Only when nobody was emailed: the desk hands it over in person, once.
      password: emailed === "sent" ? null : password,
    }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
