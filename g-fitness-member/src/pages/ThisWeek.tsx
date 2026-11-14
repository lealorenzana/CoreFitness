import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, HourglassMedium, UsersThree } from '@phosphor-icons/react';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, SectionHead, StatusPill } from '../components/ui/noc';
import { SkeletonList } from '../components/ui/Skeleton';
import { loadThisWeek, type ThisWeek as Week } from '../services/thisWeek';
import { useT } from '../lib/i18n';

const dayName = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric' });
};
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

/**
 * This week, in full (gym styles phase 1, 2026-11-14): each day from Monday, with your classes and coach sessions
 * — waiting or confirmed — and the days the gym is closed. A session opens your list of sessions. Opened from
 * Today's This week strip.
 */
export default function ThisWeek() {
  const navigate = useNavigate();
  const t = useT();
  const [week, setWeek] = useState<Week | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void loadThisWeek().then((w) => { if (alive) setWeek(w); }).catch(() => { if (alive) setWeek(null); });
    return () => { alive = false; };
  }, []);

  return (
    <Page>
      <PageTitle back fallback="/member/home" title={t('This week')}
        subtitle={week?.hours ? `${t('Open')} ${week.hours}` : t('Your classes and coach sessions, day by day')} />
      {week === undefined ? <SkeletonList count={4} />
        : week === null ? <p style={{ fontSize: 13, color: 'var(--color-secondary)' }}>{t('This week could not be loaded. Pull to try again.')}</p>
        : week.days.map((d) => (
          <section key={d.ymd} aria-label={dayName(d.ymd)} data-week-day={d.ymd} style={{ opacity: d.isPast ? 0.6 : 1 }}>
            <SectionHead title={d.isToday ? `${t('Today')} · ${dayName(d.ymd)}` : dayName(d.ymd)} />
            {d.closed && (
              <p data-week-closed style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: d.items.length ? 6 : 0 }}>{t('The gym is closed.')}</p>
            )}
            {d.items.length === 0 && !d.closed && (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{t('Nothing booked.')}</p>
            )}
            {d.items.map((r, i) => (
              <LineRow key={`${r.kind}-${r.id}`} last={i === d.items.length - 1}
                icon={r.kind === 'class' ? UsersThree : r.status === 'pending' ? HourglassMedium : CalendarCheck}
                tone={r.status === 'approved' ? 'mine' : 'info'}
                title={`${time(r.startsAt!)} · ${r.title}`}
                meta={[r.kind === 'pt' && r.trainerName ? `${t('With')} ${r.trainerName}` : r.subtitle, r.location].filter(Boolean).join(' · ') || undefined}
                action={<StatusPill label={r.status === 'approved' ? t('confirmed') : r.status === 'pending' ? t('waiting') : t(r.status)} tone={r.status === 'approved' ? 'structure' : 'action'} />}
                onClick={() => navigate('/member/sessions')} />
            ))}
          </section>
        ))}
    </Page>
  );
}
