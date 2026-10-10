import { useEffect, useState } from 'react';
import { Map as MapIcon, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

/**
 * Map data (0183): fills the member app's cache of OpenStreetMap gyms around
 * every pinned gym, from this browser. OpenStreetMap's main server refuses
 * Supabase's edge servers, so the Edge Function cannot always refresh the
 * cache itself; an ordinary browser is accepted. One 0.25° area at a time,
 * a pause between, so OpenStreetMap is asked politely.
 */
const STEP = 0.25;
const tileOf = (lat: number, lng: number) => `${(Math.floor(lat / STEP) * STEP).toFixed(2)}:${(Math.floor(lng / STEP) * STEP).toFixed(2)}`;
type El = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

export default function MapData() {
  const [pinned, setPinned] = useState<{ id: string; name: string; latitude: number; longitude: number }[] | null>(null);
  const [fresh, setFresh] = useState<{ tiles: number; gyms: number; oldest: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const [{ data: p, error }, { data: t }] = await Promise.all([
      supabase.rpc('platform_pinned_gyms'),
      supabase.from('osm_tiles').select('fetched_at, count'),
    ]);
    if (error) { setPinned(null); return; }
    setPinned(((p ?? []) as { id: string; name: string; latitude: number | string; longitude: number | string }[])
      .map((g) => ({ ...g, latitude: Number(g.latitude), longitude: Number(g.longitude) })));
    const rows = (t ?? []) as { fetched_at: string; count: number }[];
    setFresh({ tiles: rows.length, gyms: rows.reduce((a, r) => a + (r.count ?? 0), 0), oldest: rows.map((r) => r.fetched_at).sort()[0] ?? null });
  };
  useEffect(() => { void (async () => { await load(); })(); }, []);

  if (pinned === null) return null;

  const refresh = async () => {
    const tiles = new Set<string>();
    for (const g of pinned) for (const dy of [-STEP, 0, STEP]) for (const dx of [-STEP, 0, STEP]) tiles.add(tileOf(g.latitude + dy, g.longitude + dx));
    let done = 0, found = 0, failed = 0;
    for (const tile of tiles) {
      setBusy(`Area ${++done} of ${tiles.size}…`);
      const [s, w] = tile.split(':').map(Number);
      const q = `[out:json][timeout:25];(node["leisure"="fitness_centre"](${s},${w},${s + STEP},${w + STEP});way["leisure"="fitness_centre"](${s},${w},${s + STEP},${w + STEP}););out center tags 300;`;
      try {
        const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json() as { elements?: El[] };
        const rows = (data.elements ?? []).flatMap((el) => {
          const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
          if (lat == null || lon == null) return [];
          const tg = el.tags ?? {};
          return [{ osm_id: `${el.type}/${el.id}`, name: tg.name ?? null, latitude: Number(lat.toFixed(6)), longitude: Number(lon.toFixed(6)),
            address: [tg['addr:street'], tg['addr:city'] ?? tg['addr:municipality'], tg['addr:province']].filter(Boolean).join(', ') || null }];
        });
        const { data: n, error } = await supabase.rpc('platform_store_osm_tile', { p_tile: tile, p_rows: rows });
        if (error) throw new Error(error.message);
        found += Number(n ?? 0);
      } catch {
        failed++;
      }
      await new Promise((r) => setTimeout(r, 1200));
    }
    setBusy(failed ? `Done — ${found} gyms; ${failed} area${failed === 1 ? '' : 's'} could not be reached. Try again later.` : `Done — ${found} gyms in ${tiles.size} areas.`);
    await load();
  };

  return (
    <section className="card" data-map-data>
      <h2 className="section-title"><MapIcon size={14} /> Map data</h2>
      <p className="meta" style={{ marginTop: 0 }}>
        Gyms near our gyms that are not on Core Fitness, from OpenStreetMap, for the member app&rsquo;s map.
        {fresh ? ` ${fresh.gyms} gyms in ${fresh.tiles} areas${fresh.oldest ? `, oldest from ${new Date(fresh.oldest).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}` : ''}.` : ''}
        {' '}{pinned.length === 0 ? 'No gym has pinned its place yet.' : `Around ${pinned.length} pinned gym${pinned.length === 1 ? '' : 's'}.`}
      </p>
      <button type="button" className="btn" disabled={!!busy && busy.startsWith('Area') || pinned.length === 0} onClick={() => void refresh()}
        data-tip="Asks OpenStreetMap for each area around each pinned gym, one at a time">
        <RefreshCw size={13} /> Refresh map data
      </button>
      {busy && <p className="meta" data-map-progress>{busy}</p>}
      <p className="meta">Gym data © OpenStreetMap contributors.</p>
    </section>
  );
}
