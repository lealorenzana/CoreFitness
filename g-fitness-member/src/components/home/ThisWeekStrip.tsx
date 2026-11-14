import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CaretRight } from '@phosphor-icons/react';
import { loadThisWeek, type ThisWeek } from '../../services/thisWeek';
import { useT } from '../../lib/i18n';

const LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const sessionWords = (r: { startsAt: string | null; title: string; trainerName: string | null; kind: 'class' | 'pt' }) => {
  const at = r.startsAt ? new Date(r.startsAt).toLocaleString('en-PH', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  return `${at} · ${r.kind === 'pt' && r.trainerName ? r.trainerName : r.title}`;
};

/**
 * Today → This week (gym styles phase 1, 2026-11-14): Monday to Sunday at a glance — a dot on a day with something
 * booked, × on a day the gym is closed, today ringed — and the next thing named. Tapping opens the whole week.
 * Draws nothing until it has read, and says so when it could not.
 */
export default function ThisWeekStrip() {
  const navigate = useNavigate();
  const t = useT();
  const [week, setWeek] = useState<ThisWeek | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void loadThisWeek().then((w) => { if (alive) setWeek(w); }).catch(() => { if (alive) setWeek(null); });
    return () => { alive = false; };
  }, []);
  if (week === undefined) return null;
  if (week === null) return <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{t('This week could not be loaded.')}</p>;

  return (
    <button type="button" onClick={() => navigate('/member/week')} data-this-week
      className="w-full text-left noc-press-soft flex flex-col"
      style={{ gap: 10, padding: '12px 14px', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid rgb(var(--hair-rgb, 233 233 237) / 0.1)' }}>
      <span className="flex items-center justify-between" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
        {t('This week')}
        <CaretRight size={14} />
      </span>
      <span className="grid" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }} aria-hidden>
        {week.days.map((d) => (
          <span key={d.ymd} className="flex flex-col items-center" style={{ gap: 5 }} data-week-day={d.ymd} data-has={d.items.length + d.slots.length > 0} data-closed={d.closed}>
            <span className="grid place-items-center" style={{
              width: 30, height: 30, borderRadius: 15, fontSize: 12.5, fontWeight: 700,
              color: d.isToday ? 'var(--color-text-primary)' : d.isPast ? 'var(--color-text-muted)' : 'var(--color-text-secondary)',
              border: d.isToday ? '2px solid var(--color-primary)' : '2px solid transparent',
            }}>{LETTER[d.weekday]}</span>
            <span style={{ height: 8, fontSize: 10, lineHeight: '8px', color: 'var(--color-text-muted)' }}>
              {d.closed ? '×' : d.items.length + d.slots.length > 0
                ? <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: 'var(--color-primary)', opacity: d.isPast ? 0.45 : 1 }} />
                : ''}
            </span>
          </span>
        ))}
      </span>
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }} data-week-next>
        {week.next ? <>{t('Next')}: <b style={{ color: 'var(--color-text-primary)' }}>{sessionWords(week.next)}</b></> : t('Nothing booked for the rest of this week.')}
      </span>
    </button>
  );
}
