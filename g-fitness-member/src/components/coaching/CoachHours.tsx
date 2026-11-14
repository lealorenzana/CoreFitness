import { useEffect, useState } from 'react';
import { SectionHead } from '../ui/noc';
import { listTrainerAvailability, type TrainerAvailabilityRow } from '../../lib/api/trainerAvailability';
import { useT } from '../../lib/i18n';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];   // Monday first
const clock = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

/**
 * A coach's weekly hours on their profile, view only (gym styles phase 2, 2026-11-14 — the owner: "schedule is
 * just for viewing coaches to pick"). The hours the coach keeps (`trainer_availability`), Monday first; days with
 * none are left out. Nothing here books — picking the coach is the button above; booking is its own page, when
 * the gym books in the app. Says so when the coach has set no hours, and when they could not be read.
 */
export default function CoachHours({ trainerId, firstName }: { trainerId: string; firstName: string }) {
  const t = useT();
  const [rows, setRows] = useState<TrainerAvailabilityRow[] | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void listTrainerAvailability(trainerId).then((r) => { if (alive) setRows(r); }).catch(() => { if (alive) setRows(null); });
    return () => { alive = false; };
  }, [trainerId]);
  if (rows === undefined) return null;
  const byDay = ORDER.map((d) => ({ d, spans: (rows ?? []).filter((r) => r.day_of_week === d) })).filter((x) => x.spans.length > 0);
  return (
    <section data-coach-hours>
      <SectionHead title={t('Weekly hours')} />
      {rows === null ? (
        <p style={{ fontSize: 13, color: 'var(--color-secondary)' }}>{t('Their hours could not be loaded.')}</p>
      ) : byDay.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{firstName} {t('has not set weekly hours yet.')}</p>
      ) : (
        <div className="flex flex-col" style={{ gap: 6 }}>
          {byDay.map(({ d, spans }) => (
            <div key={d} className="flex items-baseline justify-between" style={{ gap: 12, fontSize: 13.5 }} data-hours-day={d}>
              <span style={{ color: 'var(--color-text-secondary)', minWidth: 92 }}>{t(DAYS[d])}</span>
              <span className="text-right" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                {spans.map((s) => `${clock(s.start_time)} – ${clock(s.end_time)}`).join(', ')}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
