// osm-gyms (0182) — gyms near a point, from OpenStreetMap, cached by tile.
//
// The member app's map asks for the gyms around where it is looking. This
// answers from osm_gyms; a 0.25° tile older than 30 days (or never fetched)
// is first refreshed from the Overpass API with the service role — so
// OpenStreetMap is asked once per tile a month, never once per member.
//
// The point is where the MAP is centred (the device's location if the member
// allowed it, else wherever they searched). It is used to pick tiles and is
// not stored or logged.
//
// POST { lat: number, lng: number }  →  { gyms: [{ osm_id, name, latitude, longitude, address }] }
// Deployed with --no-verify-jwt: the gym finder is used before signing up.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const STEP = 0.25;
const FRESH_DAYS = 30;
const OVERPASS = "https://overpass-api.de/api/interpreter";

const tileOf = (lat: number, lng: number) =>
  `${(Math.floor(lat / STEP) * STEP).toFixed(2)}:${(Math.floor(lng / STEP) * STEP).toFixed(2)}`;

type OsmElement = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number };
  tags?: Record<string, string> };

async function fetchTile(tile: string): Promise<{ osm_id: string; name: string | null; latitude: number; longitude: number; address: string | null; tile: string }[]> {
  const [s, w] = tile.split(":").map(Number);
  const n = s + STEP, e = w + STEP;
  const q = `[out:json][timeout:25];(node["leisure"="fitness_centre"](${s},${w},${n},${e});` +
    `way["leisure"="fitness_centre"](${s},${w},${n},${e}););out center tags 300;`;
  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "CoreFitness gym finder (osm-gyms)" },
    body: "data=" + encodeURIComponent(q),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const data = await res.json() as { elements?: OsmElement[] };
  return (data.elements ?? []).flatMap((el) => {
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) return [];
    const t = el.tags ?? {};
    const address = [t["addr:street"], t["addr:city"] ?? t["addr:municipality"], t["addr:province"]].filter(Boolean).join(", ") || null;
    return [{ osm_id: `${el.type}/${el.id}`, name: t.name ?? null, latitude: Number(lat.toFixed(6)), longitude: Number(lon.toFixed(6)), address, tile }];
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { lat, lng } = await req.json().catch(() => ({})) as { lat?: number; lng?: number };
    if (typeof lat !== "number" || typeof lng !== "number" || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return json({ error: "Send lat and lng." }, 400);
    }
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    // The tile under the point and the eight around it (~80 km across).
    const tiles: string[] = [];
    for (const dy of [-STEP, 0, STEP]) for (const dx of [-STEP, 0, STEP]) tiles.push(tileOf(lat + dy, lng + dx));

    const { data: known } = await db.from("osm_tiles").select("tile, fetched_at").in("tile", tiles);
    const fresh = new Set((known ?? []).filter((t) => Date.now() - new Date(t.fetched_at).getTime() < FRESH_DAYS * 86400000).map((t) => t.tile));
    // At most three stale tiles per call, so one request never hammers Overpass;
    // the rest refresh on the next look.
    for (const tile of tiles.filter((t) => !fresh.has(t)).slice(0, 3)) {
      try {
        const rows = await fetchTile(tile);
        await db.from("osm_gyms").delete().eq("tile", tile);
        if (rows.length) await db.from("osm_gyms").upsert(rows, { onConflict: "osm_id" });
        await db.from("osm_tiles").upsert({ tile, fetched_at: new Date().toISOString(), count: rows.length }, { onConflict: "tile" });
      } catch (_e) {
        // Overpass busy or down: answer from what is cached.
      }
    }

    const { data: gyms, error } = await db.from("osm_gyms").select("osm_id, name, latitude, longitude, address").in("tile", tiles).limit(500);
    if (error) return json({ error: error.message }, 500);
    return json({ gyms: gyms ?? [] });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
