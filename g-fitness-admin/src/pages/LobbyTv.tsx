import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ACCENTS } from '../lib/accents';
import { loadTv, type TvData } from '../lib/api/tv';

const MEMBER_APP = 'https://corefitness-gym.vercel.app';
const ROTATE_MS = 12_000;
const REFRESH_MS = 60_000;
const UNIT: Record<string, string> = { training_days: 'training days', workouts_logged: 'workouts', checkins: 'check-ins' };

/**
 * The lobby TV (/tv): a full-screen board for a TV in the gym.
 *
 * Runs like /kiosk — on a gym computer signed in as the desk or owner — so
 * there is no public link that could put members' names on the internet. It
 * reads the same data as the members' own screens (lib/api/tv.ts), so every
 * privacy rule holds: opted-in names only, squads by name, check-ins counted.
 *
 * Panels rotate every 12 s and the data refreshes every minute; a panel with
 * nothing to show is skipped rather than shown empty. The gym's own logo,
 * name and colour, and its join QR code, stay on screen throughout.
 *
 * Big type on purpose: it is read from across a room.
 */
export default function LobbyTv() {
  const [data, setData] = useState<TvData | null>(null);
  const [slide, setSlide] = useState(0);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let alive = true;
    const pull = async () => { const d = await loadTv(); if (alive) setData(d); };
    void pull();
    const refresh = window.setInterval(() => { void pull(); }, REFRESH_MS);
    const tick = window.setInterval(() => { setNow(new Date()); setSlide((s) => s + 1); }, ROTATE_MS);
    return () => { alive = false; window.clearInterval(refresh); window.clearInterval(tick); };
  }, []);

  const accent = ACCENTS.find((a) => a.key === (data?.app?.accent ?? 'violet'))?.swatch ?? '#7C3AED';

  const panels = useMemo(() => {
    if (!data) return [] as { key: string; title: string; body: ReactNode }[];
    const list: { key: string; title: string; body: ReactNode }[] = [];
    if (data.goal) {
      const pct = Math.min(100, Math.round((data.goal.progress / Math.max(1, data.goal.target)) * 100));
      list.push({ key: 'goal', title: 'The whole gym', body: (
        <div>
          <p style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.1 }}>{data.goal.title}</p>
          <div style={{ height: 28, borderRadius: 14, marginTop: 40, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: accent, borderRadius: 14 }} />
          </div>
          <p style={{ fontSize: 36, marginTop: 24, color: '#E5E7EB' }}>
            {data.goal.reached ? `Reached! ${data.goal.contributors} members made it happen.`
              : `${data.goal.progress.toLocaleString()} of ${data.goal.target.toLocaleString()} ${UNIT[data.goal.metric] ?? ''} · ${data.goal.contributors} members in`}
          </p>
          {!data.goal.reached && data.goal.rewardPoints > 0 && (
            <p style={{ fontSize: 28, marginTop: 12, color: '#9CA3AF' }}>Everyone who adds one gets {data.goal.rewardPoints} points when we get there.</p>
          )}
        </div>
      ) });
    }
    if (data.wall.length) list.push({ key: 'wall', title: 'Personal records this week', body: <Rows accent={accent} rows={data.wall.map((w) => [w.name, w.exercise, w.value])} /> });
    if (data.season.length) list.push({ key: 'season', title: `${now.toLocaleDateString('en-US', { month: 'long' })} season`, body: <Rows accent={accent} ranked rows={data.season.map((s) => [s.name, '', `${s.score.toLocaleString()} pts`])} /> });
    if (data.squads.length) list.push({ key: 'squads', title: 'Squads this week', body: <Rows accent={accent} ranked rows={data.squads.map((s) => [s.name, `${s.members} members${s.reached ? ' · target hit' : ''}`, `${s.days} / ${s.target} days`])} /> });
    if (data.classes.length) list.push({ key: 'classes', title: 'Classes today', body: <Rows accent={accent} rows={data.classes.map((c) => [
      new Date(c.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), c.name,
      c.booked >= c.capacity ? 'Full' : `${c.capacity - c.booked} spots left`])} /> });
    if (data.announcement) list.push({ key: 'news', title: 'From the gym', body: (
      <div>
        <p style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.1 }}>{data.announcement.title}</p>
        <p style={{ fontSize: 34, marginTop: 24, lineHeight: 1.4, color: '#E5E7EB' }}>{data.announcement.message}</p>
      </div>
    ) });
    return list;
  }, [data, accent, now]);

  const current = panels.length ? panels[slide % panels.length] : null;
  const app = data?.app;
  const joinLink = app?.slug ? `${MEMBER_APP}/join/${app.slug}` : null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#07070A', color: '#fff', fontFamily: 'Inter, system-ui, sans-serif',
      display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gridTemplateRows: 'auto minmax(0, 1fr)', overflow: 'hidden' }}>
      {/* The gym, top left; the time, top right. */}
      <header style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '28px 48px', borderBottom: `4px solid ${accent}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {app?.logo_url
            ? <img src={app.logo_url} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} />
            : <span style={{ width: 72, height: 72, borderRadius: '50%', background: accent, display: 'grid', placeItems: 'center', fontSize: 30, fontWeight: 800 }}>
                {(app?.short_name || app?.gym_name || '').slice(0, 2).toUpperCase()}
              </span>}
          <div>
            <p style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{app?.gym_name ?? ''}</p>
            {app?.tagline && <p style={{ fontSize: 22, marginTop: 6, color: '#9CA3AF' }}>{app.tagline}</p>}
          </div>
        </div>
        <p className="tabular-nums" style={{ fontSize: 44, fontWeight: 700 }}>
          {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </p>
      </header>

      {/* The rotating panel. */}
      <main style={{ padding: '48px 56px', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {current ? (
          <>
            <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: accent }}>{current.title}</p>
            <div key={current.key + slide} style={{ marginTop: 28, flex: 1, minHeight: 0, animation: 'tvIn 600ms ease both' }}>{current.body}</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {panels.map((p, i) => (
                <span key={p.key} style={{ width: 40, height: 6, borderRadius: 3,
                  background: i === slide % panels.length ? accent : 'rgba(255,255,255,0.15)' }} />
              ))}
            </div>
          </>
        ) : (
          <p style={{ fontSize: 40, color: '#9CA3AF' }}>{data ? 'Welcome — have a great session.' : 'Loading…'}</p>
        )}
      </main>

      {/* Always on screen: today's count and the way in. */}
      <aside style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', padding: '48px 36px', display: 'flex', flexDirection: 'column', gap: 40 }}>
        {data?.checkinsToday != null && (
          <div>
            <p className="tabular-nums" style={{ fontSize: 96, fontWeight: 800, lineHeight: 1 }}>{data.checkinsToday}</p>
            <p style={{ fontSize: 26, marginTop: 8, color: '#9CA3AF' }}>trained here today</p>
          </div>
        )}
        {joinLink && (
          <div style={{ marginTop: 'auto' }}>
            <div style={{ background: '#fff', padding: 16, borderRadius: 16, width: 'fit-content' }}>
              <QRCodeSVG value={joinLink} size={220} level="M" marginSize={0} bgColor="#FFFFFF" fgColor="#111827" />
            </div>
            <p style={{ fontSize: 24, fontWeight: 700, marginTop: 16 }}>Join us on your phone</p>
            <p style={{ fontSize: 18, marginTop: 4, color: '#9CA3AF' }}>Point your camera at the code</p>
          </div>
        )}
      </aside>

      <style>{'@keyframes tvIn { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: none } }'}</style>
    </div>
  );
}

function Rows({ rows, ranked = false, accent }: { rows: [string, string, string][]; ranked?: boolean; accent: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(([a, b, c], i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: ranked ? '80px minmax(0, 2fr) minmax(0, 2fr) auto' : 'minmax(0, 2fr) minmax(0, 2fr) auto',
          alignItems: 'baseline', gap: 24, padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {ranked && <span className="tabular-nums" style={{ fontSize: 40, fontWeight: 800, color: i === 0 ? accent : '#6B7280' }}>#{i + 1}</span>}
          <span style={{ fontSize: 40, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a}</span>
          <span style={{ fontSize: 30, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b}</span>
          <span className="tabular-nums" style={{ fontSize: 40, fontWeight: 800, color: accent }}>{c}</span>
        </div>
      ))}
    </div>
  );
}
