import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DoorOpen, Eye } from 'lucide-react';
import { listSupportGrants, type SupportGrant } from '../lib/platform';

const left = (iso: string) => {
  const m = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
  return m >= 60 ? `${(m / 60).toFixed(1)} h` : `${m} min`;
};

/**
 * Gyms that have let Core Fitness look, right now (0113) — on Support, where
 * an owner who wrote "the member invite is not working" is waiting, instead of
 * only at the bottom of Platform. "Look inside" opens the read-only view.
 */
export default function SupportGrants({ compact = false }: { compact?: boolean }) {
  const [grants, setGrants] = useState<SupportGrant[]>([]);
  useEffect(() => {
    let alive = true;
    void listSupportGrants().then((g) => { if (alive) setGrants(g); }, () => undefined);
    return () => { alive = false; };
  }, []);
  if (grants.length === 0) return null;

  return (
    <section className="card notice" style={{ marginBottom: 16 }}>
      <h2 className="section-title"><DoorOpen size={14} /> {grants.length === 1 ? 'A gym has opened its doors to you' : `${grants.length} gyms have opened their doors to you`}</h2>
      {!compact && (
        <p className="meta" style={{ marginTop: 0 }}>
          They granted this from Your app → Support access, and can withdraw it any time. You can look, never change: every visit is
          written into that gym's activity log.
        </p>
      )}
      {grants.map((g) => (
        <div key={g.id} className="row" style={{ gap: 12, padding: '8px 0' }}>
          <span className="grow">
            <b style={{ color: 'var(--text)' }}>{g.gym_name}</b>{g.reason ? ` — “${g.reason}”` : ''}
            <span className="meta" style={{ display: 'block', margin: 0 }}>
              Ends in {left(g.expires_at)} · {g.first_used_at ? 'you have looked' : 'nobody has looked yet'}
            </span>
          </span>
          <Link className="btn" to={`/support-access/${g.gym_id}`}><Eye size={14} /> Look inside</Link>
        </div>
      ))}
    </section>
  );
}
