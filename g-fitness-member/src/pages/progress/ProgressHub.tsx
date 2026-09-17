import { useNavigate, useSearchParams } from 'react-router-dom';
import { Trophy } from '@phosphor-icons/react';

import { Page, PageTitle } from '../../components/ui/page';
import { LineRow, TextTabs } from '../../components/ui/noc';
import BodyProgressTab     from './tabs/BodyProgressTab';
import WorkoutProgressTab  from './tabs/WorkoutProgressTab';
import VisualDashboardTab  from './tabs/VisualDashboardTab';
import GoalsTab            from './tabs/GoalsTab';
import TrainerFeedbackTab  from './tabs/TrainerFeedbackTab';

/**
 * Progress — one screen, five tabs under one title (Nocturne redesign).
 *
 * The "My Core" tile grid is gone. Every number on it now has a home where it
 * is the subject rather than a passenger: visits and the next session are on
 * Today, points on You, workouts logged on the Workouts tab, goals on Goals.
 * Four tiles restating other screens' headlines above this screen's own tabs is
 * the duplication Progress was already cleared of once (the level card).
 *
 * The tab lives in the URL (`?tab=`) and is **read on every render**, not copied
 * into state once. The header rails on Train and in Everything link straight to
 * Goals or Charts, and when this screen is already open those taps change only
 * the search string — the component does not remount, so a value read once on
 * mount ignored them and the rail looked broken. Tapping a tab here replaces
 * the entry rather than pushing one, so the back gesture still leaves Progress
 * instead of touring its tabs.
 */

const tabs = [
  { id: 'body',      label: 'Body' },
  { id: 'workouts',  label: 'Workouts' },
  { id: 'goals',     label: 'Goals' },
  { id: 'dashboard', label: 'Charts' },
  { id: 'feedback',  label: 'Coach' },
] as const;

type TabId = typeof tabs[number]['id'];

function isTabId(value: string | null): value is TabId {
  return value != null && tabs.some((t) => t.id === value);
}

export default function ProgressHub() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const active: TabId = isTabId(requested) ? requested : 'body';

  const select = (id: TabId) => setParams({ tab: id }, { replace: true });

  return (
    <Page>
      <PageTitle back title="Progress" subtitle="Your body, your training, and what your coach has said" />

      <TextTabs<TabId> label="Progress" tabs={[...tabs]} active={active} onChange={select} gap={18} />

      {/* The level lives on Achievements, and only there — this is its link,
          not a copy of its card. Achievements had exactly one entry point in
          the app, and removing it would orphan the page (audit-routes.py). */}
      <div style={{ marginTop: -8 }}>
        <LineRow
          gutterWidth={30}
          gutter={<Trophy size={18} style={{ color: 'var(--color-primary-400)' }} />}
          title="Achievements and level"
          meta="What you have earned, and what is next"
          action="Open"
          actionTone="structure"
          onClick={() => navigate('/member/achievements')}
          last
        />
      </div>

      <div key={active}>
        {active === 'body' && <BodyProgressTab />}
        {active === 'workouts' && <WorkoutProgressTab />}
        {active === 'goals' && <GoalsTab />}
        {active === 'dashboard' && <VisualDashboardTab />}
        {active === 'feedback' && <TrainerFeedbackTab />}
      </div>
    </Page>
  );
}
