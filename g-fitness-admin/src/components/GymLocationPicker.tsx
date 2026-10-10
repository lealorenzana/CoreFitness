import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { getGymContext } from '../lib/gymContext';
import { showToast } from '../utils/toast';

/**
 * Where the gym is (0182), for members finding it: tap the map to put the
 * pin, or use this computer's location, then Save. set_gym_location() is the
 * owner's alone. Renders nothing before 0182 (no latitude column to read).
 */
export default function GymLocationPicker() {
  const box = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const pin = useRef<L.CircleMarker | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const [at, setAt] = useState<{ lat: number; lng: number } | null>(null);
  const [saved, setSaved] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const ctx = await getGymContext();
      if (!ctx?.gymId) { setReady(false); return; }
      const { data, error } = await supabase.from('gyms').select('latitude, longitude').eq('id', ctx.gymId).maybeSingle();
      if (error) { setReady(false); return; }
      const row = data as { latitude: number | string | null; longitude: number | string | null } | null;
      const p = row?.latitude != null && row.longitude != null ? { lat: Number(row.latitude), lng: Number(row.longitude) } : null;
      setAt(p);
      setSaved(p);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready || !box.current || map.current) return;
    const m = L.map(box.current).setView(at ? [at.lat, at.lng] : [12.88, 121.77], at ? 16 : 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => setAt({ lat: Number(e.latlng.lat.toFixed(6)), lng: Number(e.latlng.lng.toFixed(6)) }));
    map.current = m;
    return () => { m.remove(); map.current = null; };
    // `at` is read once, for the opening view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    pin.current?.remove();
    pin.current = at ? L.circleMarker([at.lat, at.lng], { radius: 10, color: '#fff', weight: 2, fillColor: '#7C3AED', fillOpacity: 1 }).addTo(m) : null;
  }, [at]);

  if (!ready) return null;

  const useDevice = () => {
    if (!('geolocation' in navigator)) { showToast('This browser cannot tell where it is. Tap the map instead.', 'error'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const here = { lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) };
        setAt(here);
        map.current?.setView([here.lat, here.lng], 17);
      },
      () => showToast('Location is off. Tap the map where the gym is.', 'error'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  const save = async (p: { lat: number; lng: number } | null) => {
    setSaving(true);
    const { error } = await supabase.rpc('set_gym_location', { p_lat: p?.lat ?? null, p_lng: p?.lng ?? null });
    setSaving(false);
    if (error) { showToast(error.message, 'error'); return; }
    setSaved(p);
    setAt(p);
    showToast(p ? 'Your gym is on the map' : 'The pin is removed', 'success');
  };
  const changed = JSON.stringify(at) !== JSON.stringify(saved);

  return (
    <div data-location-picker>
      <p className="text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--color-text-primary)' }}>
        <MapPin size={14} /> Where your gym is
      </p>
      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
        Members finding a gym see this pin, and the distance from them. Tap the map where your door is.
      </p>
      <div ref={box} className="mt-2 rounded-lg overflow-hidden border" style={{ height: 260, borderColor: 'var(--color-border)' }} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={useDevice} className="h-9 px-3 rounded-lg border text-xs font-semibold"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)', background: 'var(--color-bg)' }}>
          Use this computer&rsquo;s location
        </button>
        <button type="button" disabled={saving || !changed || !at} onClick={() => void save(at)} data-save-location
          className="h-9 px-4 rounded-full text-xs font-semibold disabled:opacity-50"
          style={{ background: 'var(--color-primary)', color: '#fff' }}>
          {saving ? 'Saving…' : 'Save the pin'}
        </button>
        {saved && (
          <button type="button" disabled={saving} onClick={() => void save(null)} className="text-xs underline" style={{ color: 'var(--color-text-secondary)' }}>
            Remove the pin
          </button>
        )}
        {at && <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{at.lat.toFixed(5)}, {at.lng.toFixed(5)}</span>}
      </div>
    </div>
  );
}
