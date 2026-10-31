import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Scales, Target } from '@phosphor-icons/react';
import { LineRow } from '../ui/noc';
import ProgressRail from '../ui/ProgressRail';
import WorkoutProgressTab from '../../pages/progress/tabs/WorkoutProgressTab';
import VisualDashboardTab from '../../pages/progress/tabs/VisualDashboardTab';
import { listGoals, listMeasurements } from '../../lib/api/progress';
import { myPhotos } from '../../lib/api/photos';
import { storedSession } from '../../lib/offlineReads';
import { useGymApp } from '../../hooks/useGymApp';
import { moduleOn } from '../../lib/gymApp';
import { addDays } from '../../utils/dates';
import { useT } from '../../lib/i18n';

interface Summary {
  /** The latest weight and how it moved against the last reading 30+ days before it; null when none is logged. */
  weight: { kg: number; change: number | null } | null;
  targets: { open: number; reached: number } | null;
  photos: number | null;
}

/**
 * You → Progress (simplify, 2026-10-28; it was the Progress section with its
 * own tabs): body, targets and photos as one row each — each its own screen —
 * then how your training is going (the old Overview: the rail, the workout
 * figures and the charts). Every figure is read; a row whose read fails or is
 * empty says what it is for instead of a number.
 */
export default function ProgressTab() {
  const navigate = useNavigate();
  const t = useT();
  const app = useGymApp();
  const [s, setS] = useState<Summary | null>(null);

  useEffect(() => {
    const uid = storedSession()?.user.id;
    if (!uid) return;
    let alive = true;
    void (async () => {
      const [m, g, p] = await Promise.all([
        listMeasurements(uid).catch(() => null), listGoals(uid).catch(() => null), myPhotos().catch(() => undefined),
      ]);
      const weighed = (m ?? []).filter((r) => r.weight_kg != null);
      const last = weighed[weighed.length - 1];
      const monthBefore = last ? [...weighed].reverse().find((r) => r.measured_on <= addDays(last.measured_on, -30)) : undefined;
      if (!alive) return;
      setS({
        weight: last ? { kg: Number(last.weight_kg), change: monthBefore ? Number(last.weight_kg) - Number(monthBefore.weight_kg) : null } : null,
        targets: g ? { open: g.filter((x) => !x.achieved_on).length, reached: g.filter((x) => x.achieved_on).length } : null,
        photos: p ? p.length : null,
      });
    })();
    return () => { alive = false; };
  }, []);

  const kg = (n: number) => `${Math.round(n * 10) / 10} kg`;
  const rows = [
    { key: 'body', on: true, icon: Scales, path: '/member/body',
      title: s?.weight ? kg(s.weight.kg) : t('Body'),
      meta: s?.weight ? `${t('Body')}${s.weight.change != null ? ` · ${s.weight.change > 0 ? '+' : s.weight.change < 0 ? '−' : '±'}${kg(Math.abs(s.weight.change))} ${t('in a month')}` : ''}` : t('Weight and measurements') },
    { key: 'targets', on: moduleOn(app, 'targets'), icon: Target, path: '/member/targets',
      title: t('Targets'),
      meta: s?.targets && s.targets.open + s.targets.reached > 0 ? `${s.targets.open} ${t('working on')} · ${s.targets.reached} ${t('reached')}` : t('What you are working towards') },
    { key: 'photos', on: moduleOn(app, 'photos'), icon: Camera, path: '/member/progress-photos',
      title: t('Progress photos'),
      meta: s?.photos ? `${t('Private')} · ${s.photos} ${s.photos === 1 ? t('photo') : t('photos')}` : t('Private, yours to compare') },
  ].filter((r) => r.on);

  return (
    <div className="flex flex-col" style={{ gap: 'var(--stack)' }} data-you-progress>
      <section aria-label={t('Progress')}>
        {rows.map((r, i) => (
          <LineRow key={r.key} icon={r.icon} tone={r.key === 'photos' ? 'info' : 'mine'} title={r.title} meta={r.meta}
            onClick={() => navigate(r.path)} last={i === rows.length - 1} />
        ))}
      </section>
      <ProgressRail />
      <WorkoutProgressTab />
      <VisualDashboardTab />
    </div>
  );
}
