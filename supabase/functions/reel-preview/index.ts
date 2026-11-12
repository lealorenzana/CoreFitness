// What a reel's link shows when it is shared: its picture, and the full address
// a short share link leads to (0247).
//
// A browser cannot read another site's page (CORS), so the gym's app asks here.
// For a TikTok, Instagram or Facebook link this fetches the link's own public
// page the way a link preview does, reads `og:image` (and `og:url`), copies the
// picture into the gym's reels folder — those sites' picture addresses expire in
// days, so a stored address would go blank — and answers:
//
//   { coverPath: "gyms/<gym>/reels/<id>.jpg" | null, url: "<full address>" | null }
//
// Best effort, always 200: a site that will not answer a server gives nulls, and
// the reel then shows the plain tile it shows today. Nothing is written to the
// database here — the caller attaches the cover with post_reel() / set_reel_cover(),
// which check again who may.
//
// Who may call: someone the database says may post reels (may_post_reels()).
// What it will fetch: only the four sites' own hosts, and a picture only from
// those sites' own picture hosts — the address typed is never fetched blindly.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// The crawler name sites answer with their share tags.
const PREVIEW_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

const PAGE_HOSTS = /^((www|m|vm|vt)\.)?tiktok\.com$|^((www|m|web)\.)?facebook\.com$|^fb\.watch$|^(www\.)?instagram\.com$/;
const IMAGE_HOSTS = /(^|\.)(tiktokcdn\.com|tiktokcdn-us\.com|tiktokcdn-eu\.com|ttwstatic\.com|cdninstagram\.com|fbcdn\.net|fbsbx\.com)$/;
const MAX_IMAGE = 3 * 1024 * 1024;

function siteOf(host: string): "tiktok" | "facebook" | "instagram" | null {
  if (/tiktok\.com$/.test(host)) return "tiktok";
  if (/facebook\.com$/.test(host) || host === "fb.watch") return "facebook";
  if (/instagram\.com$/.test(host)) return "instagram";
  return null;
}

const unescapeHtml = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&quot;/g, '"').replace(/&#039;/g, "'");

function meta(html: string, property: string): string | null {
  const a = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i").exec(html);
  const b = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i").exec(html);
  const v = (a ?? b)?.[1];
  return v ? unescapeHtml(v) : null;
}

/** GET with a timeout, following redirects only while they stay on the four sites. */
async function fetchPage(start: URL): Promise<{ html: string; final: URL } | null> {
  let u = start;
  for (let hop = 0; hop < 5; hop++) {
    if (u.protocol !== "https:" || !PAGE_HOSTS.test(u.hostname)) return null;
    const res = await fetch(u, { redirect: "manual", headers: { "User-Agent": PREVIEW_UA, "Accept-Language": "en" }, signal: AbortSignal.timeout(8000) });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      await res.body?.cancel();
      if (!next) return null;
      u = new URL(next, u);
      continue;
    }
    if (!res.ok) { await res.body?.cancel(); return null; }
    // A sign-in wall (Facebook sends servers to /login) is not the link's page.
    if (/^\/(login|checkpoint)(\/|$)/i.test(u.pathname)) { await res.body?.cancel(); return null; }
    const html = (await res.text()).slice(0, 1_500_000);
    return { html, final: u };
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: may, error: mayErr } = await caller.rpc("may_post_reels");
    if (mayErr || may !== true) return json({ error: "Only the gym's owner, front desk and coaches post reels." }, 403);
    const { data: ctx } = await caller.rpc("my_gym_context");
    const gymId = (Array.isArray(ctx) ? ctx[0] : ctx)?.gym_id as string | undefined;
    if (!gymId || !/^[0-9a-f-]{36}$/.test(gymId)) return json({ error: "No gym" }, 403);

    const body = await req.json().catch(() => null);
    let link: URL;
    try { link = new URL(String(body?.url ?? "").trim()); } catch { return json({ coverPath: null, url: null }); }
    const site = siteOf(link.hostname);
    if (link.protocol !== "https:" || !PAGE_HOSTS.test(link.hostname) || !site) return json({ coverPath: null, url: null });

    const page = await fetchPage(link).catch(() => null);
    if (!page) return json({ coverPath: null, url: null });

    // The full address: where a share link landed, or what the page calls itself — same site only.
    let full: string | null = null;
    for (const candidate of [meta(page.html, "og:url"), page.final.toString()]) {
      try {
        const c = new URL(candidate ?? "");
        if (c.protocol === "https:" && PAGE_HOSTS.test(c.hostname) && siteOf(c.hostname) === site && c.toString().length <= 600) {
          c.hash = "";
          full = c.toString();
          break;
        }
      } catch { /* not an address */ }
    }

    // The picture: from the site's own picture hosts, an image, not huge.
    let coverPath: string | null = null;
    const image = meta(page.html, "og:image");
    if (image) {
      try {
        const iu = new URL(image);
        if (iu.protocol === "https:" && IMAGE_HOSTS.test(iu.hostname)) {
          const res = await fetch(iu, { headers: { "User-Agent": PREVIEW_UA }, signal: AbortSignal.timeout(8000) });
          const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
          if (res.ok && (type === "image/jpeg" || type === "image/webp")) {
            const bytes = new Uint8Array(await res.arrayBuffer());
            if (bytes.byteLength > 0 && bytes.byteLength <= MAX_IMAGE) {
              const path = `gyms/${gymId}/reels/${crypto.randomUUID()}.${type === "image/webp" ? "webp" : "jpg"}`;
              const admin = createClient(supabaseUrl, serviceRoleKey);
              const up = await admin.storage.from("reels").upload(path, bytes, { contentType: type, cacheControl: "31536000" });
              if (!up.error) coverPath = path;
            }
          } else {
            await res.body?.cancel();
          }
        }
      } catch { /* no picture; the reel shows its plain tile */ }
    }

    return json({ coverPath, url: full });
  } catch (err) {
    return json({ coverPath: null, url: null, note: err instanceof Error ? err.message : "Unexpected error" });
  }
});
