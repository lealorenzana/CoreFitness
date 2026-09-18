import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChartLineUp, ChatCircleText, Ruler, Target, Trophy } from '@phosphor-icons/react';

import { Page, PageTitle } from '../../components/ui/page';
import { LineRow, TextTabs } from '../../components/ui/noc';
import ProgressRail from '../../components/ui/ProgressRail';
import BodyProgressTab     from './tabs/BodyProgressTab';
import WorkoutProgressTab  from './tabs/WorkoutProgressTab';
import VisualDashboardTab  from './tabs/VisualDashboardTab';
import GoalsTab            from './tabs/GoalsTab';
import TrainerFeedbackTab  from './tabs/TrainerFeedbackTab';

/**
 * Progress — four tabs: Overview · Body · Goals · Coach (cleaned up 2026-09-18).
 *
 * It had five, and two of them said the same thing twice: "Workouts" and
 * "Charts" each counted this month's training in their own words, Charts added
 * a streak panel, Workouts carried its own "log a workout" form and a second
 * way into the tracker — and the Achievements row sat above all five, repeated
 * on every one. Now:
 *
 *   Overview   the streak, the Achievements link (once), recent workouts — each
 *              opening that day set by set — one "Start a workout", and trends
 *   Body       the tape measure; its "Track a set" shortcut is gone, because
 *              training lives in My routines
 *   Goals      unchanged
 *   Coach      unchanged
 *
 * The tab lives in the URL (`?tab=`) and is **read on every render**, not copied
 * into state once, so a rail tap that only changes the search string still
 * switches it. The old `workouts` and `dashboard` ids open Overview, so links
 * already written into notifications and rails still land. Tapping a tab
 * replaces the entry rather than pushing one, so back still leaves Progress.
 */

const tabs = [
  { id: 'overview', label: 'Overview', icon: <ChartLineUp size={15} weight="bold" /> },
  { id: 'body',     label: 'Body',     icon: <Ruler size={15} weight="bold" /> },
  { id: 'goals',    label: 'Goals',    icon: <Target size={15} weight="bold" /> },
  { id: 'feedback', label: 'Coach',    icon: <ChatCircleText size={15} weight="bold" /> },
] as const;

type TabId = typeof tabs[number]['id'];

/** Old tab ids still arrive in links; each opens where its content now lives. */
const ALIASES: Record<string, TabId> = { workouts: 'overview', dashboard: 'overview' };

function resolveTab(value: string | null): TabId {
  if (value && tabs.some((t) => t.id === value)) return value as TabId;
  if (value && ALIASES[value]) return ALIASES[value];
  return 'overview';
}

export default function ProgressHub() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const active = resolveTab(params.get('tab'));

  const select = (id: TabId) => setParams({ tab: id }, { replace: true });

  return (
    <Page>
      <PageTitle back title="Progress" subtitle="How your training, your body and your goals are going" />

      <TextTabs<TabId> label="Progress" tabs={[...tabs]} active={active} onChange={select} gap={20} />

      <div key={active} className="flex flex-col noc-stack" style={{ gap: 'var(--stack)' }}>
        {active === 'overview' && (
          <>
            <ProgressRail />
            {/* The level lives on Achievements, and only there — this is its
                link, once, not a row repeated above every tab. */}
            <LineRow
              gutterWidth={40}
              gutter={
                <span className="grid place-items-center orb-cell orb-cell--busy" style={{ width: 34, height: 34, borderRadius: 10 }}>
                  <Trophy size={17} weight="duotone" style={{ color: 'var(--color-primary-300)' }} />
                </span>
              }
              title="Achievements and level"
              meta="What you have earned, and what is next"
              action="Open"
              actionTone="structure"
              onClick={() => navigate('/member/achievements')}
              last
            />
            <WorkoutProgressTab />
            <VisualDashboardTab />
          </>
        )}
        {active === 'body' && <BodyProgressTab />}
        {active === 'goals' && <GoalsTab />}
        {active === 'feedback' && <TrainerFeedbackTab />}
      </div>
    </Page>
  );
}
