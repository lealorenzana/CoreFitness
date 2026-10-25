import { useEffect, useState } from 'react';
import { Tv } from 'lucide-react';
import TvBoard from '../components/tv/TvBoard';
import { loadTv, loadTvDesign, type TvData, type TvDesign } from '../lib/api/tv';

const REFRESH_MS = 60_000;

/**
 * The lobby TV (/tv): a full-screen board for a TV in the gym.
 *
 * Runs like /kiosk — on a gym computer signed in as the desk or owner — so
 * there is no public link that could put members' names on the internet. It
 * reads the same data as the members' own screens (lib/api/tv.ts), so every
 * privacy rule holds: opted-in names only, squads by name, check-ins counted.
 *
 * Since 0209 it is a Core Fitness plan feature and the gym designs it (Your app
 * → Lobby TV): a gym whose plan does not include it, or that switched it off,
 * is told so here rather than shown a blank screen. Before 0209 is pasted it
 * runs as it always did. The data refreshes every minute; the design with it.
 */
export default function LobbyTv() {
  const [data, setData] = useState<TvData | null>(null);
  const [gate, setGate] = useState<{ allowed: boolean; sold: boolean; design: TvDesign } | null | undefined>(undefined);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const pull = async () => {
      const [d, g] = await Promise.all([loadTv(), loadTvDesign()]);
      if (!alive) return;
      setData(d); setGate(g); setReady(true);
    };
    void pull();
    const refresh = window.setInterval(() => { void pull(); }, REFRESH_MS);
    return () => { alive = false; window.clearInterval(refresh); };
  }, []);

  if (ready && gate && !gate.allowed) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#07070A', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'Inter, system-ui, sans-serif', padding: 48 }}>
        <div style={{ maxWidth: 720, textAlign: 'center' }}>
          <Tv size={56} style={{ color: '#A78BFA', margin: '0 auto 20px' }} />
          <p style={{ fontSize: 40, fontWeight: 800 }}>{gate.sold ? 'The lobby TV is switched off' : 'The lobby TV is not on your plan'}</p>
          <p style={{ fontSize: 22, marginTop: 14, color: '#A1A1B5', lineHeight: 1.5 }}>
            {gate.sold
              ? 'The owner can switch it on in Your app → What you run.'
              : 'This gym’s Core Fitness plan does not include it. The owner can see which plans do on Your plan.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <TvBoard data={data} design={gate?.design} />
    </div>
  );
}
