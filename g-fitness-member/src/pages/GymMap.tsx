import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft } from '@phosphor-icons/react';
import GlassSheet from '../components/ui/GlassSheet';
import { NocButton } from '../components/ui/noc';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { directionsUrl, gymFinder, osmGymsNear, suggestGym, type FinderGym, type OsmGym } from '../lib/api/gyms';
import { getHere, tileCentre, type Here } from '../lib/here';
import { refFromUrl } from '../lib/api/referrals';

/** The four kinds, and the legend that names them — on the map only (C6). */
const KIND = {
  open:   { color: '#7C3AED', label: 'Open to join', dash: undefined as string | undefined },
  code:   { color: '#F59E0B', label: 'Join with a code', dash: undefined as string | undefined },
  closed: { color: '#9CA3AF', label: 'Front desk only', dash: undefined as string | undefined },
  osm:    { color: '#9CA3AF', label: 'Not on Core Fitness', dash: '4 4' },
};
type Picked = { kind: 'gym'; gym: FinderGym } | { kind: 'osm'; gym: OsmGym };

/**
 * Find your gym, as a map (0182): Core Fitness gyms coloured by how they are
 * joined, and OpenStreetMap's other gyms dashed. Tapping one opens a sheet
 * with what to do there. Leaflet + OpenStreetMap tiles, free; the member's
 * position stays on the phone (only its 25 km square is used to fetch gyms).
 */
export default function GymMap() {
  const navigate = useNavigate();
  const passed = (useLocation().state as { here?: Here | null } | null)?.here ?? null;
  const box = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const [gyms, setGyms] = useState<FinderGym[]>([]);
  const [osm, setOsm] = useState<OsmGym[]>([]);
  const [here, setHere] = useState<Here | null>(passed);
  const [picked, setPicked] = useState<Picked | null>(null);
  /** Centred once per map — reset when a map is made (dev mounts twice). */
  const centred = useRef(false);
  const [mapTick, setMapTick] = useState(0);

  useEffect(() => {
    void (async () => {
      setGyms(await gymFinder());
      const h = passed ?? await getHere(false);
      if (h) setHere(h);
    })();
  }, [passed]);

  useEffect(() => {
    if (!box.current || map.current) return;
    const m = L.map(box.current, { zoomControl: false, attributionControl: true }).setView([12.88, 121.77], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap contributors',
    }).addTo(m);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    centred.current = false;
    // Fetch OpenStreetMap's gyms for wherever the member pans to.
    const fetchHere = () => { const c = m.getCenter(); void osmGymsNear(tileCentre({ lat: c.lat, lng: c.lng }).lat, tileCentre({ lat: c.lat, lng: c.lng }).lng).then(setOsm); };
    m.on('moveend', () => { if (m.getZoom() >= 11) fetchHere(); });
    setMapTick((n) => n + 1);
    return () => { m.remove(); map.current = null; };
  }, []);

  // Centre once: on the phone, else on the first pinned gym.
  useEffect(() => {
    const m = map.current;
    if (!m || centred.current) return;
    const first = gyms.find((g) => g.latitude != null);
    const at = here ?? (first ? { lat: first.latitude!, lng: first.longitude! } : null);
    if (at) { m.setView([at.lat, at.lng], 13); centred.current = true; }
  }, [here, gyms, mapTick]);

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    if (here) L.circleMarker([here.lat, here.lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#2563EB', fillOpacity: 1 }).addTo(g);
    for (const o of osm) {
      if (gyms.some((x) => x.latitude != null && Math.abs(x.latitude - o.latitude) < 0.0015 && Math.abs(x.longitude! - o.longitude) < 0.0015)) continue;
      L.circleMarker([o.latitude, o.longitude], { radius: 8, color: KIND.osm.color, weight: 2, dashArray: KIND.osm.dash, fillOpacity: 0.1 })
        .on('click', () => setPicked({ kind: 'osm', gym: o })).addTo(g);
    }
    for (const x of gyms) {
      if (x.latitude == null || x.longitude == null) continue;
      const k = KIND[x.join_policy];
      L.circleMarker([x.latitude, x.longitude], { radius: 10, color: '#fff', weight: 2, fillColor: k.color, fillOpacity: 1 })
        .on('click', () => setPicked({ kind: 'gym', gym: x })).addTo(g);
    }
  }, [gyms, osm, here, mapTick]);

  const act = async () => {
    if (!picked) return;
    if (picked.kind === 'osm') {
      try { await suggestGym(picked.gym); toast.success('Thanks — Core Fitness will reach out to them.'); setPicked(null); }
      catch (e) { toast.error(errorMessage(e)); }
      return;
    }
    const g = picked.gym;
    if (g.join_policy === 'closed' && !refFromUrl()) { window.open(directionsUrl(g), '_blank', 'noopener'); return; }
    if (g.join_policy === 'code') { navigate('/join'); return; }
    navigate(`/join/${g.slug}`);
  };
  const label = !picked ? '' : picked.kind === 'osm' ? 'Suggest this gym'
    : picked.gym.join_policy === 'closed' && !refFromUrl() ? 'Directions' : picked.gym.join_policy === 'code' ? 'I have a code' : 'Join';

  return (
    <div className="fixed inset-0" style={{ background: 'var(--color-bg)' }} data-gym-map>
      <div ref={box} className="absolute inset-0" />
      <button type="button" aria-label="Back" onClick={() => (history.length > 1 ? navigate(-1) : navigate('/join'))}
        className="absolute flex items-center justify-center rounded-full"
        style={{ top: 'calc(env(safe-area-inset-top) + 12px)', left: 12, width: 40, height: 40, zIndex: 500,
          background: 'var(--color-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--color-separator)' }}>
        <ArrowLeft size={18} />
      </button>
      <div data-legend className="absolute rounded-2xl" style={{ top: 'calc(env(safe-area-inset-top) + 12px)', right: 12, zIndex: 500,
        padding: '8px 10px', background: 'var(--color-bg)', border: '1px solid var(--color-separator)' }}>
        {Object.entries(KIND).map(([key, k]) => (
          <div key={key} className="flex items-center" style={{ gap: 6, fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: '20px' }}>
            <span style={{ width: 12, height: 12, borderRadius: 6, display: 'inline-block',
              background: key === 'osm' ? 'transparent' : k.color, border: key === 'osm' ? `2px dashed ${k.color}` : '2px solid #fff' }} />
            {k.label}
          </div>
        ))}
      </div>
      <GlassSheet open={picked !== null} onClose={() => setPicked(null)}
        title={picked ? (picked.kind === 'osm' ? picked.gym.name ?? 'A gym' : picked.gym.name) : ''}
        subtitle={picked ? (picked.kind === 'osm' ? 'Not on Core Fitness yet' : KIND[picked.gym.join_policy].label) : undefined}
        footer={<NocButton className="w-full" onClick={() => void act()}>{label}</NocButton>}>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          {picked?.gym.address ?? (picked?.kind === 'osm' ? 'From OpenStreetMap.' : '')}
        </p>
      </GlassSheet>
    </div>
  );
}
