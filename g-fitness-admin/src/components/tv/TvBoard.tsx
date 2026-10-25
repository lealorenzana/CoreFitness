import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { rampFor } from '../../lib/gymTheme';
import { withDefaults, type TvData, type TvDesign } from '../../lib/api/tv';

const MEMBER_APP = 'https://corefitness-gym.vercel.app';
const UNIT: Record<string, string> = { training_days: 'training days', workouts_logged: 'workouts', checkins: 'check-ins' };

/**
 * The lobby TV's screen, drawn from the gym's data and its design (0126, 0209).
 * /tv shows it full screen; Your app → Lobby TV shows the same component
 * scaled into a preview, so what the owner sets is exactly what the wall shows.
 *
 * Three themes: dark (as it always was), brand (the gym's own colour) and
 * light. A background photo sits behind everything under a wash that keeps the
 * type readable from across a room. A panel with nothing to show is skipped.
 */
export default function TvBoard({ data, design, rotate = true }: { data: TvData | null; design: TvDesign | null | undefined; rotate?: boolean }) {
  const d = withDefaults(design);
  const [slide, setSlide] = useState(0);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!rotate) return;
    const tick = window.setInterval(() => { setNow(new Date()); setSlide((s) => s + 1); }, d.seconds * 1000);
    return () => window.clearInterval(tick);
  }, [rotate, d.seconds]);

  const ramp = rampFor(data?.app?.accent, 'violet');
  const accent = ramp.base;
  const light = d.theme === 'light';
  const ink = light ? '#1E1B3A' : '#FFFFFF';
  const muted = light ? '#5B5779' : '#9CA3AF';
  const soft = light ? '#3B3760' : '#E5E7EB';
  const line = light ? 'rgba(30,27,58,0.12)' : 'rgba(255,255,255,0.08)';
  const track = light ? 'rgba(30,27,58,0.1)' : 'rgba(255,255,255,0.1)';
  const bg = d.theme === 'brand'
    ? `radial-gradient(120% 120% at 0% 0%, ${ramp.c700}, ${ramp.c900} 55%, #07070A)`
    : light ? '#F7F5FD' : '#07070A';
  const wash = light ? 'rgba(247,245,253,0.82)' : d.theme === 'brand' ? 'rgba(7,7,10,0.55)' : 'rgba(7,7,10,0.7)';

  const panels = useMemo(() => {
    if (!data) return [] as { key: string; title: string; body: ReactNode }[];
    const want = new Set(d.panels);
    const list: { key: string; title: string; body: ReactNode }[] = [];
    if (want.has('goal') && data.goal) {
      const pct = Math.min(100, Math.round((data.goal.progress / Math.max(1, data.goal.target)) * 100));
      list.push({ key: 'goal', title: 'The whole gym', body: (
        <div>
          <p style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.1 }}>{data.goal.title}</p>
          <div style={{ height: 28, borderRadius: 14, marginTop: 40, background: track, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: accent, borderRadius: 14 }} />
          </div>
          <p style={{ fontSize: 36, marginTop: 24, color: soft }}>
            {data.goal.reached ? `Reached! ${data.goal.contributors} members made it happen.`
              : `${data.goal.progress.toLocaleString()} of ${data.goal.target.toLocaleString()} ${UNIT[data.goal.metric] ?? ''} · ${data.goal.contributors} members in`}
          </p>
          {!data.goal.reached && data.goal.rewardPoints > 0 && (
            <p style={{ fontSize: 28, marginTop: 12, color: muted }}>Everyone who adds one gets {data.goal.rewardPoints} points when we get there.</p>
          )}
        </div>
      ) });
    }
    if (want.has('wall') && data.wall.length) list.push({ key: 'wall', title: 'Personal records this week', body: <Rows accent={accent} muted={muted} line={line} rows={data.wall.map((w) => [w.name, w.exercise, w.value])} /> });
    if (want.has('season') && data.season.length) list.push({ key: 'season', title: `${now.toLocaleDateString('en-US', { month: 'long' })} season`, body: <Rows accent={accent} muted={muted} line={line} ranked rows={data.season.map((s) => [s.name, '', `${s.score.toLocaleString()} pts`])} /> });
    if (want.has('squads') && data.squads.length) list.push({ key: 'squads', title: 'Teams this week', body: <Rows accent={accent} muted={muted} line={line} ranked rows={data.squads.map((s) => [s.name, `${s.members} members${s.reached ? ' · target hit' : ''}`, `${s.days} / ${s.target} days`])} /> });
    if (want.has('classes') && data.classes.length) list.push({ key: 'classes', title: 'Classes today', body: <Rows accent={accent} muted={muted} line={line} rows={data.classes.map((c) => [
      new Date(c.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), c.name,
      c.booked >= c.capacity ? 'Full' : `${c.capacity - c.booked} spots left`])} /> });
    if (want.has('news') && data.announcement) list.push({ key: 'news', title: 'From the gym', body: (
      <div>
        <p style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.1 }}>{data.announcement.title}</p>
        <p style={{ fontSize: 34, marginTop: 24, lineHeight: 1.4, color: soft }}>{data.announcement.message}</p>
      </div>
    ) });
    return list;
  }, [data, d.panels, accent, now, muted, soft, line, track]);

  const current = panels.length ? panels[slide % panels.length] : null;
  const app = data?.app;
  const joinLink = app?.slug ? `${MEMBER_APP}/join/${app.slug}` : null;
  const showAside = (d.show_count && data?.checkinsToday != null) || (d.show_qr && joinLink);

  return (
    <div style={{ position: 'absolute', inset: 0, background: bg, color: ink, fontFamily: 'Inter, system-ui, sans-serif', overflow: 'hidden',
      display: 'grid', gridTemplateColumns: showAside ? 'minmax(0, 1fr) 360px' : 'minmax(0, 1fr)', gridTemplateRows: d.headline ? 'auto auto minmax(0, 1fr)' : 'auto minmax(0, 1fr)' }}>
      {d.background_url && (
        <>
          <img src={d.background_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }} />
          <div style={{ position: 'absolute', inset: 0, background: wash, zIndex: 0 }} />
        </>
      )}
      <header style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 1,
        padding: '28px 48px', borderBottom: `4px solid ${accent}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {app?.logo_url
            ? <img src={app.logo_url} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} />
            : <span style={{ width: 72, height: 72, borderRadius: '50%', background: accent, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 30, fontWeight: 800 }}>
                {(app?.short_name || app?.gym_name || '').slice(0, 2).toUpperCase()}
              </span>}
          <div>
            <p style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{app?.gym_name ?? ''}</p>
            {app?.tagline && <p style={{ fontSize: 22, marginTop: 6, color: muted }}>{app.tagline}</p>}
          </div>
        </div>
        {d.show_clock && <p style={{ fontSize: 44, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>}
      </header>
      {d.headline && (
        <div style={{ gridColumn: '1 / -1', position: 'relative', zIndex: 1, padding: '18px 48px', background: accent, color: '#fff', fontSize: 34, fontWeight: 800, letterSpacing: '-0.01em' }}>
          {d.headline}
        </div>
      )}

      <main style={{ padding: '48px 56px', minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
        {current ? (
          <>
            <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: light ? ramp.c700 : accent }}>{current.title}</p>
            <div key={current.key + slide} style={{ marginTop: 28, flex: 1, minHeight: 0, animation: 'tvIn 600ms ease both' }}>{current.body}</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {panels.map((p, i) => (
                <span key={p.key} style={{ width: 40, height: 6, borderRadius: 3, background: i === slide % panels.length ? accent : track }} />
              ))}
            </div>
          </>
        ) : (
          <p style={{ fontSize: 40, color: muted }}>{data ? 'Welcome — have a great session.' : 'Loading…'}</p>
        )}
      </main>

      {showAside && (
        <aside style={{ borderLeft: `1px solid ${line}`, padding: '48px 36px', display: 'flex', flexDirection: 'column', gap: 40, position: 'relative', zIndex: 1 }}>
          {d.show_count && data?.checkinsToday != null && (
            <div>
              <p style={{ fontSize: 96, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{data.checkinsToday}</p>
              <p style={{ fontSize: 26, marginTop: 8, color: muted }}>trained here today</p>
            </div>
          )}
          {d.show_qr && joinLink && (
            <div style={{ marginTop: 'auto' }}>
              <div style={{ background: '#fff', padding: 16, borderRadius: 16, width: 'fit-content', boxShadow: light ? '0 10px 30px -12px rgba(30,27,58,0.3)' : undefined }}>
                <QRCodeSVG value={joinLink} size={220} level="M" marginSize={0} bgColor="#FFFFFF" fgColor="#111827" />
              </div>
              <p style={{ fontSize: 24, fontWeight: 700, marginTop: 16 }}>Join us on your phone</p>
              <p style={{ fontSize: 18, marginTop: 4, color: muted }}>Point your camera at the code</p>
            </div>
          )}
        </aside>
      )}

      <style>{'@keyframes tvIn { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: none } }'}</style>
    </div>
  );
}

function Rows({ rows, ranked = false, accent, muted, line }: { rows: [string, string, string][]; ranked?: boolean; accent: string; muted: string; line: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(([a, b, c], i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: ranked ? '80px minmax(0, 2fr) minmax(0, 2fr) auto' : 'minmax(0, 2fr) minmax(0, 2fr) auto',
          alignItems: 'baseline', gap: 24, padding: '14px 0', borderBottom: `1px solid ${line}` }}>
          {ranked && <span style={{ fontSize: 40, fontWeight: 800, color: i === 0 ? accent : muted, fontVariantNumeric: 'tabular-nums' }}>#{i + 1}</span>}
          <span style={{ fontSize: 40, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a}</span>
          <span style={{ fontSize: 30, color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b}</span>
          <span style={{ fontSize: 40, fontWeight: 800, color: accent, fontVariantNumeric: 'tabular-nums' }}>{c}</span>
        </div>
      ))}
    </div>
  );
}
