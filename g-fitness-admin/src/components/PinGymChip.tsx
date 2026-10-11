import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, MapPin } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { getGymContext } from '../lib/gymContext';

/**
 * "Put your gym on the map" — the dashboard asks the owner until the gym is
 * pinned. Members' "Find your gym" map (0182) draws only pinned gyms, and every
 * gym set up before 0182 (G Fitness among them) had never been asked, so the map
 * was empty. Owner only (set_gym_location is theirs); nothing before 0182.
 */
export default function PinGymChip() {
  const navigate = useNavigate();
  const [unpinned, setUnpinned] = useState(false);
  useEffect(() => {
    void (async () => {
      const ctx = await getGymContext();
      if (!ctx?.gymId || ctx.role !== 'admin') return;
      const { data, error } = await supabase.from('gyms').select('latitude').eq('id', ctx.gymId).maybeSingle();
      if (!error && data && (data as { latitude: number | null }).latitude == null) setUnpinned(true);
    })();
  }, []);
  if (!unpinned) return null;
  return (
    <button type="button" onClick={() => navigate('/settings?tab=gym#location')} data-pin-gym
      data-tip="Members find gyms on a map in the app. Yours is not on it until you pin where it is."
      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg font-semibold text-[11px]"
      style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary, #F59E0B)' }}>
      <MapPin size={12} /> Put your gym on the map <ChevronRight size={12} />
    </button>
  );
}
