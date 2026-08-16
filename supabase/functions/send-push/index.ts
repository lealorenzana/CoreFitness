// Sends a web push notification to every device a member has registered.
//
// Callable by admin, staff and trainer — the same people who can already create
// a notification row. A member cannot push to anyone, including themselves.
//
// Server-side because the VAPID *private* key signs every request and must never
// reach a browser. It lives only as an Edge Function secret, like the
// service-role key.
//
// This is delivery only. It does not write to `notifications` — the caller does
// that, and the bell must show the event whether or not the push got through.
// Coupling the two would mean a member with push disabled loses the record.
//
// Secrets to set (see supabase/README.md):
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

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

/** Maps a notification type onto the preference column that gates it. */
const PREF_COLUMN: Record<string, string> = {
  booking: "cat_booking",
  payment: "cat_payment",
  membership: "cat_membership",
  event: "cat_event",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@corefitness.local";
    if (!vapidPublic || !vapidPrivate) {
      return json({ error: "Push is not configured: VAPID keys are not set" }, 500);
    }

    // Who is calling, according to their own JWT.
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Invalid session" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (!profile || !["admin", "staff", "trainer"].includes(profile.role)) {
      return json({ error: "Not allowed" }, 403);
    }

    const body = await req.json().catch(() => null);
    const userId: string | undefined = body?.userId;
    const title: string | undefined = body?.title;
    const message: string | undefined = body?.body;
    const type: string = body?.type ?? "system";
    const url: string = body?.url ?? "/member/home";

    if (!userId || !title) return json({ error: "userId and title are required" }, 400);

    // Preference check. A missing row means the member never opened Settings,
    // which is consent by default — they still get told.
    const prefColumn = PREF_COLUMN[type];
    if (prefColumn) {
      const { data: prefs } = await admin
        .from("notification_prefs")
        .select(prefColumn)
        .eq("user_id", userId)
        .maybeSingle();

      if (prefs && (prefs as Record<string, boolean>)[prefColumn] === false) {
        return json({ sent: 0, skipped: "muted by preference" }, 200);
      }
    }

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);

    if (!subs || subs.length === 0) return json({ sent: 0, skipped: "no subscriptions" }, 200);

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const payload = JSON.stringify({ title, body: message ?? "", url, tag: type });

    let sent = 0;
    const expired: string[] = [];

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          sent++;
        } catch (err) {
          // 404/410 mean the browser threw the subscription away — uninstalled,
          // cleared data, permission revoked. Those rows are dead weight and
          // will fail forever, so they are removed rather than retried.
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) expired.push(s.id);
        }
      }),
    );

    if (expired.length > 0) {
      await admin.from("push_subscriptions").delete().in("id", expired);
    }

    return json({ sent, pruned: expired.length }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
