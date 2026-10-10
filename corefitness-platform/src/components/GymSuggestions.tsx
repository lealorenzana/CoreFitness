import { useEffect, useState } from 'react';
import { MapPinned } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface Suggestion { osm_id: string | null; name: string; latitude: number | null; longitude: number | null; asks: number; last_at: string; notes: string[] }

/**
 * Gyms members asked us to bring onto Core Fitness (0182): each once, with how
 * many asked and what they wrote — leads, from the member app's gym finder.
 * Nothing renders before 0182; a failed read says so.
 */
export default function GymSuggestions() {
  const [rows, setRows] = useState<Suggestion[] | null | undefined>(undefined);
  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.rpc('platform_gym_suggestions');
      setRows(error ? (/does not exist|PGRST202/.test(error.message + (error.code ?? '')) ? undefined : null) : (data as Suggestion[]));
    })();
  }, []);
  if (rows === undefined) return null;
  return (
    <section className="card" data-gym-suggestions>
      <h2 className="section-title"><MapPinned size={14} /> Gyms members asked for</h2>
      {rows === null ? <p className="meta" style={{ marginTop: 0 }}>Suggestions could not be loaded.</p>
        : rows.length === 0 ? <p className="meta" style={{ marginTop: 0 }}>None yet. Members suggest gyms from the map when theirs is not on Core Fitness.</p>
        : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.slice(0, 12).map((r) => (
              <li key={(r.osm_id ?? '') + r.name} style={{ padding: '8px 0', borderTop: '1px solid var(--line, rgba(255,255,255,0.08))' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ fontSize: 13 }}>{r.name}</strong>
                  <span className="meta" style={{ margin: 0 }}>{r.asks} {r.asks === 1 ? 'ask' : 'asks'}</span>
                </div>
                {r.latitude != null && r.longitude != null && (
                  <a className="meta" style={{ margin: 0 }} target="_blank" rel="noreferrer"
                    href={`https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}#map=17/${r.latitude}/${r.longitude}`}>See it on the map</a>
                )}
                {r.notes[0] && <p className="meta" style={{ margin: '2px 0 0' }}>“{r.notes[0]}”</p>}
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
