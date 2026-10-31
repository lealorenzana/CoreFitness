// Erases accounts whose 7 days are up (0225) and removes their files from
// Storage — which SQL cannot do (Supabase protects storage.objects). Safe for
// anyone signed in to call, as often as they like: erase_due_accounts() only
// touches accounts that asked to be deleted 7 days ago and are not yet erased,
// and the queue only holds those accounts' files. The admin and platform apps
// call it on load; pg_cron runs the SQL half daily where it exists.
//
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected. No other secret.

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** A stored path, or a Storage URL for one (room posts keep URLs), as a path inside its bucket. */
function pathIn(bucket: string, value: string): string | null {
  if (!/^https?:\/\//.test(value)) return value.replace(/^\/+/, "");
  const m = new RegExp(`/storage/v1/object/(?:public|sign|authenticated)/${bucket}/([^?]+)`).exec(value);
  return m ? decodeURIComponent(m[1]) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: erased, error: eErr } = await service.rpc("erase_due_accounts");
    if (eErr) return json({ error: eErr.message }, 500);

    const { data: due, error: qErr } = await service.rpc("erasure_files_due");
    if (qErr) return json({ error: qErr.message }, 500);
    const done: string[] = [];
    let removed = 0;
    for (const f of (due ?? []) as { id: string; bucket: string; path: string; is_prefix: boolean }[]) {
      let paths: string[] = [];
      if (f.is_prefix) {
        const { data: list } = await service.storage.from(f.bucket).list(f.path.replace(/\/+$/, ""), { limit: 1000 });
        paths = (list ?? []).filter((o) => o.id).map((o) => `${f.path.replace(/\/+$/, "")}/${o.name}`);
      } else {
        const p = pathIn(f.bucket, f.path);
        if (p) paths = [p];
      }
      if (paths.length) {
        const { error } = await service.storage.from(f.bucket).remove(paths);
        if (error) continue;   // left queued; the next call tries again
        removed += paths.length;
      }
      done.push(f.id);
    }
    if (done.length) await service.rpc("erasure_files_done", { p_ids: done });
    return json({ erased: erased ?? 0, files: removed });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
