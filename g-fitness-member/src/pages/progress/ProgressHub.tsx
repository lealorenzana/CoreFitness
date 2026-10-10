import { Navigate, useSearchParams } from 'react-router-dom';

import { Page, PageTitle } from '../../components/ui/page';
import ProgressRail from '../../components/ui/ProgressRail';
import BodyProgressTab     from './tabs/BodyProgressTab';
import WorkoutProgressTab  from './tabs/WorkoutProgressTab';
import VisualDashboardTab  from './tabs/VisualDashboardTab';
import GoalsTab            from './tabs/GoalsTab';
import { useGymApp } from '../../hooks/useGymApp';
import { moduleOn } from '../../lib/gymApp';

/**
 * Progress — Overview · Body · Goals, under the Progress section's strip
 * (memberNav HUBS, drawn by PageTitle), which also carries Photos and
 * Achievements (2026-10-05).
 *
 * Its own five tabs used to sit under a fifteen-pill rail that repeated two of
 * them: Goals and Coach notes were each reachable three ways. Coach notes moved
 * to Coaching (/member/coach-notes), Meals was removed with the meal guide, and
 * the "Achievements and level" row is the section's Achievements tab now.
 *
 * The tab lives in the URL (`?tab=`) and is read on every render. Old links
 * still land: `workouts`/`dashboard` open Overview, `feedback` opens Coach
 * notes, `meals` opens Overview.
 */

type TabId = 'overview' | 'body' | 'goals';

function resolveTab(value: string | null): TabId {
  return value === 'body' || value === 'goals' ? value : 'overview';
}

export default function ProgressHub() {
  const [params] = useSearchParams();
  const app = useGymApp();
  if (params.get('tab') === 'feedback') return <Navigate to="/member/coach-notes" replace />;
  // Targets (0176) is a switch: off, its tab is gone and an old link lands on Overview.
  const wanted = resolveTab(params.get('tab'));
  const active: TabId = wanted === 'goals' && !moduleOn(app, 'targets') ? 'overview' : wanted;

  return (
    <Page>
      <PageTitle back title="Progress" subtitle="How your training, your body and your targets are going" />

      <div key={active} className="flex flex-col noc-stack" style={{ gap: 'var(--stack)' }}>
        {active === 'overview' && (
          <>
            <ProgressRail />
            <WorkoutProgressTab />
            <VisualDashboardTab />
          </>
        )}
        {active === 'body' && <BodyProgressTab />}
        {active === 'goals' && <GoalsTab />}
      </div>
    </Page>
  );
}
