// The one place this service sends mail (0113).
//
// Until now nothing did. Every handover was a human copying a string — an
// owner's temporary password, an invitation link, a reset. Those screens all
// said so plainly, which was honest, but a service that cannot contact its own
// customers is incomplete rather than minimal.
//
// ---- THE SHAPE ------------------------------------------------------------------
//
// The same one `notifications` has used since 0026: **the row is the record,
// the send is the alert.** `record_email()` writes the outbox row first and
// always; delivery is attempted after and is allowed to fail. So "did we tell
// them?" has an answer even when the provider is down, and a failed send is
// visible and retryable rather than gone.
//
// ---- WHEN THERE IS NO PROVIDER ----------------------------------------------------
//
// With no RESEND_API_KEY set this does NOT pretend. It records the message as
// `not_configured`, says `configured: false` in its reply, and the calling
// screen keeps offering the copy-paste it offers today. Nothing anywhere claims
// an email went out that did not — the rule that made those screens say "pass
// this on yourself" in the first place.
//
// To turn it on: get a key from resend.com (free tier), then
//   Dashboard → Edge Functions → Secrets:
//     RESEND_API_KEY   re_...
//     MAIL_FROM        Core Fitness <hello@your-verified-domain>
// Until the domain is verified with the provider, delivery fails and the outbox
// says why — which is the correct, visible outcome.

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

const KINDS = [
  "owner_credentials", "password_reset", "invitation",
  "application_approved", "application_rejected", "test",
];

/** Plain text becomes a readable HTML body. No template engine, no images. */
function asHtml(body: string): string {
  const escaped = body
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f5f5f7;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;
  font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a22">
${paragraphs}
<hr style="border:0;border-top:1px solid #e5e5ea;margin:22px 0">
<p style="margin:0;font-size:12.5px;color:#6f6f86">
Core Fitness · gym software made in Occidental Mindoro
</p></div></body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Everything here runs as the CALLER, never the service key: who may send
    // in whose name is `record_email`'s decision (0113), checked in SQL. This
    // function adds delivery, not authority.
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await caller.auth.getUser();
    if (userError || !user) return json({ error: "Invalid session" }, 401);

    const { to, toName, subject, body, kind, gymId } = await req.json();
    if (!to || !subject || !body || !kind) {
      return json({ error: "to, subject, body and kind are required" }, 400);
    }
    if (!KINDS.includes(kind)) {
      return json({ error: `Unknown kind "${kind}"` }, 400);
    }

    // The record, first and always. If this is refused the caller had no right
    // to send in that gym's name, and nothing is attempted.
    const { data: id, error: recordError } = await caller.rpc("record_email", {
      p_to: to, p_subject: subject, p_body: body, p_kind: kind,
      p_gym: gymId ?? null, p_to_name: toName ?? null,
    });
    if (recordError) return json({ error: recordError.message }, 403);

    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("MAIL_FROM");

    if (!apiKey || !from) {
      await caller.rpc("settle_email", {
        p_id: id, p_status: "not_configured",
        p_error: "No RESEND_API_KEY / MAIL_FROM secret is set on this project.",
      });
      return json({
        id, configured: false, status: "not_configured",
        message: "No mail provider is configured, so nothing was sent. "
               + "The message is recorded, and the screen should keep offering the link to pass on by hand.",
      }, 200);
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          text: body,
          html: asHtml(body),
        }),
      });

      if (!res.ok) {
        // The provider's own sentence, not a guess at what went wrong. A
        // verified-domain problem reads very differently from a bad key.
        const detail = (await res.text()).slice(0, 400);
        await caller.rpc("settle_email", {
          p_id: id, p_status: "failed", p_error: `${res.status}: ${detail}`,
        });
        return json({ id, configured: true, status: "failed", error: detail }, 200);
      }

      await caller.rpc("settle_email", { p_id: id, p_status: "sent", p_error: null });
      return json({ id, configured: true, status: "sent" }, 200);
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Send failed";
      await caller.rpc("settle_email", { p_id: id, p_status: "failed", p_error: message });
      return json({ id, configured: true, status: "failed", error: message }, 200);
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
