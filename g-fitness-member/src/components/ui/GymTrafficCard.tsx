import { useEffect, useState } from 'react';
import { UsersThree } from '@phosphor-icons/react';
import { BANDS, BAND_LABEL, getGymTraffic, type Band, type TrafficCell } from '../../lib/api/gymTraffic';
import { Chip, Eyebrow, Panel } from './noc';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The band a clock hour falls in — the same edges `gym_traffic()` uses. */
function bandOf(h: number): Band {
  return h < 8 ? '6am' : h < 11 ? '9am' : h < 14 ? '12pm' : h < 17 ? '3pm' : h < 20 ? '6pm' : '9pm';
}

/**
 * "When is it quiet?" (2026-09-19) — the last 30 days of check-ins by weekday
 * and time band, from `gym_traffic()` (0091): counts only, nobody named. The
 * admin Dashboard's heatmap reads the same function, so a member and the desk
 * see one picture of the gym.
 *
 * Bars are **average check-ins in that band on that weekday**, and the busiest
 * band is the scale — a relative picture, labelled as one. Renders nothing
 * when the function is unavailable, and says so when there is too little data.
 */
export default function GymTrafficCard() {
  const [cells, setCells] = useState<TrafficCell[] | null | undefined>(undefined);
  const [now] = useState(() => new Date());
  const [dow, setDow] = useState(() => new Date().getDay());

  useEffect(() => {
    let alive = true;
    void (async () => {
      const c = await getGymTraffic(30);
      if (alive) setCells(c);
    })();
    return () => { alive = false; };
  }, []);

  if (cells === undefined || cells === null) return null;

  const avg = (band: Band) => {
    const c = cells.find((x) => x.dow === dow && x.band === band);
    return c && c.weeks > 0 ? c.visits / c.weeks : 0;
  };
  const values = BANDS.map(avg);
  const max = Math.max(...values);
  const total = cells.filter((c) => c.dow === dow).reduce((s, c) => s + c.visits, 0);
  const isToday = dow === now.getDay();
  const nowBand = bandOf(now.getHours());

  // Quietest band that anyone uses at all; busiest band outright.
  const used = BANDS.filter((b) => avg(b) > 0);
  const quietest = used.length ? used.reduce((a, b) => (avg(b) < avg(a) ? b : a)) : null;
  const busiest = used.length ? used.reduce((a, b) => (avg(b) > avg(a) ? b : a)) : null;

  return (
    <Panel>
      <div className="flex items-center justify-between" style={{ gap: 10 }}>
        <Eyebrow>
          <span className="inline-flex items-center" style={{ gap: 6 }}><UsersThree size={13} weight="bold" /> When the gym is busy</span>
        </Eyebrow>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>last 30 days</span>
      </div>

      <div className="flex overflow-x-auto scrollbar-hide" style={{ gap: 6, marginTop: 12, marginInline: -2, padding: 2 }}>
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <Chip key={d} label={d === now.getDay() ? `${DAY[d]} · today` : DAY[d]} on={dow === d} onClick={() => setDow(d)} />
        ))}
      </div>

      {total < 3 ? (
        <p style={{ fontSize: 12.5, marginTop: 14, color: 'var(--color-text-muted)' }}>
          Too few check-ins on {DAY[dow]}s lately to say.
        </p>
      ) : (
        <>
          <div className="grid" role="img"
            aria-label={`${DAY[dow]}: busiest ${busiest ? BAND_LABEL[busiest] : ''}, quietest ${quietest ? BAND_LABEL[quietest] : ''}`}
            style={{ gridTemplateColumns: `repeat(${BANDS.length}, minmax(0, 1fr))`, gap: 8, marginTop: 16, alignItems: 'end', height: 92 }}>
            {BANDS.map((b, i) => {
              const v = values[i];
              const here = isToday && b === nowBand;
              return (
                <div key={b} className="flex flex-col items-center justify-end" style={{ height: '100%', gap: 6 }}>
                  <div className="noc-grow-y w-full" style={{
                    height: `${max > 0 ? Math.max(6, (v / max) * 70) : 6}px`, borderRadius: 6, transformOrigin: 'bottom',
                    background: here ? 'var(--color-secondary)' : b === quietest ? 'var(--color-primary-300)' : 'color-mix(in srgb, var(--color-primary) 45%, transparent)',
                    boxShadow: here ? '0 0 14px -2px var(--color-secondary)' : undefined,
                  }} />
                  <span style={{ fontSize: 11, lineHeight: 1, color: here ? 'var(--color-secondary)' : 'var(--color-text-muted)' }}>
                    {here ? 'Now' : b}
                  </span>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 12.5, marginTop: 12, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
            {quietest && <>Quietest <span style={{ color: 'var(--color-primary-300)', fontWeight: 600 }}>{BAND_LABEL[quietest]}</span></>}
            {busiest && quietest !== busiest && <> · busiest {BAND_LABEL[busiest]}</>}
            {' '}on {DAY[dow]}s.
          </p>
        </>
      )}
    </Panel>
  );
}
