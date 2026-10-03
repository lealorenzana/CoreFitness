import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FlaskConical } from 'lucide-react';
import GymMark from './GymMark';
import { downloadCsv } from '../lib/csv';
import { checkinsBreakdown, checkinsDaily, explain, type CheckinDay, type CheckinGym } from '../lib/platform';

const METHOD: Record<string, string> = { qr: 'QR code', manual: 'At the desk' };
const short = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' });
const ago = (iso: string | null) => {
  if (!iso) return 'never';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};

/**
 * Why the Overview's check-in number is what it is (0149): which gyms, which
 * days, how (QR, desk, kiosk), how many different people — and how much of it
 * is the demo seed, which a number on this dashboard must never hide.
 */
export default function CheckinsBreakdown({ days = 30 }: { days?: number }) {
  const [gyms, setGyms] = useState<CheckinGym[] | null>(null);
  const [daily, setDaily] = useState<CheckinDay[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [g, d] = await Promise.all([checkinsBreakdown(days), checkinsDaily(days)]);
        if (alive) { setGyms(g); setDaily(d); }
      } catch (e) { if (alive) { setGyms([]); setError(explain(e, '0149')); } }
    })();
    return () => { alive = false; };
  }, [days]);

  if (gyms === null) return <p className="empty">Counting…</p>;
  if (error) return <p className="err">{error}</p>;

  const total = gyms.reduce((n, g) => n + g.checkins, 0);
  const demo = gyms.reduce((n, g) => n + g.demo, 0);
  const people = gyms.reduce((n, g) => n + g.people, 0);
  const busiest = daily.reduce<CheckinDay | null>((b, d) => (!b || d.checkins > b.checkins ? d : b), null);
  const top = Math.max(1, ...daily.map((d) => d.checkins));
  const active = gyms.filter((g) => g.checkins > 0);

  return (
    <div>
      <div className="mini-figs" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', marginTop: 0, paddingTop: 0 }}>
        <span><b>{total.toLocaleString('en-PH')}</b>check-ins, {days} days</span>
        <span><b>{active.length}</b>of {gyms.length} gyms</span>
        <span><b>{people.toLocaleString('en-PH')}</b>different people</span>
        <span><b>{busiest && busiest.checkins ? busiest.checkins : '—'}</b>{busiest && busiest.checkins ? `busiest day, ${short(busiest.day)}` : 'busiest day'}</span>
      </div>

      {demo > 0 && (
        <p className="meta" style={{ color: 'var(--warn)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <FlaskConical size={14} /> {demo.toLocaleString('en-PH')} of these ({Math.round((demo / Math.max(1, total)) * 100)}%) are the demo
          data's seeded members, not real visits. Remove it on Platform when the demo is over.
        </p>
      )}

      <div className="spark" role="img" aria-label={`Check-ins per day over ${days} days`}>
        {daily.map((d) => (
          <span key={d.day} style={{ height: `${Math.max(2, (d.checkins / top) * 100)}%` }}
            title={`${short(d.day)}: ${d.checkins} check-in${d.checkins === 1 ? '' : 's'}${d.demo ? ` (${d.demo} demo)` : ''}`}>
            {d.demo > 0 && <i style={{ height: `${(d.demo / Math.max(1, d.checkins)) * 100}%` }} />}
          </span>
        ))}
      </div>
      <div className="meta" style={{ margin: 0, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span>{daily[0] ? short(daily[0].day) : ''}</span>
        <span>{demo > 0 ? 'Amber: demo data · ' : ''}Manila days</span>
        <span>today</span>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <h3 className="section-title grow" style={{ margin: 0 }}>Per gym</h3>
        <button className="btn ghost" style={{ height: 30, fontSize: 12 }} onClick={() => downloadCsv(`core-fitness-checkins-${days}d`, gyms, [
          ['Gym', (g) => g.name], ['Check-ins', (g) => g.checkins], ['Demo', (g) => g.demo], ['People', (g) => g.people],
          ['Last check-in', (g) => g.last_at],
        ])}><Download size={13} /> CSV</button>
      </div>
      <table className="dd-table" style={{ marginTop: 6 }}>
        <thead>
          <tr><th>Gym</th><th className="num">Check-ins</th><th className="num">People</th><th className="num">Per person</th><th>How</th><th>Last</th></tr>
        </thead>
        <tbody>
          {gyms.map((g) => (
            <tr key={g.gym_id}>
              <td><Link to={`/gyms/${g.gym_id}`}><GymMark name={g.name} logoUrl={g.logo_url} accent={g.accent} size={24} />{g.name}</Link></td>
              <td className="num"><b style={{ color: 'var(--text)' }}>{g.checkins.toLocaleString('en-PH')}</b>
                {g.demo > 0 && <span className="muted" style={{ fontSize: 11.5 }}> ({g.demo} demo)</span>}</td>
              <td className="num">{g.people}</td>
              <td className="num">{g.people ? (g.checkins / g.people).toFixed(1) : '—'}</td>
              <td>{Object.entries(g.by_method).map(([m, n]) => `${METHOD[m] ?? m} ${n}`).join(' · ') || '—'}</td>
              <td>{ago(g.last_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="meta">A check-in is one visit recorded at a gym's desk, its kiosk or by a member's QR code. Counted, never read —
        the platform sees how many, not who.</p>
    </div>
  );
}
