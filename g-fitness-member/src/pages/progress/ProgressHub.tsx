import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ArrowLeft, AlertTriangle } from 'lucide-react';

import LevelProgressCard   from '../../components/ui/LevelProgressCard';
import WeekRings           from '../../components/ui/WeekRings';
import SectionHeader       from '../../components/ui/SectionHeader';
import MyCoreCard          from '../../components/ui/MyCoreCard';
import { panelStyle }      from '../../components/ui/Card';
import { getCurrentMemberId } from '../../services/bookingService';
import { getMemberHome, type MemberHome } from '../../services/memberHomeService';
import BodyProgressTab     from './tabs/BodyProgressTab';
import WorkoutProgressTab  from './tabs/WorkoutProgressTab';
import VisualDashboardTab  from './tabs/VisualDashboardTab';
import GoalsTab            from './tabs/GoalsTab';
import TrainerFeedbackTab  from './tabs/TrainerFeedbackTab';

/**
 * The Progress Hub.
 *
 * Five tabs, all visible at once. It used to carry seven in a horizontally
 * scrolling strip, so "Membership" and "Trainer" sat off the right edge of a
 * 375px screen where nobody found them.
 *
 * Two of those seven are gone rather than moved: Attendance and Membership each
 * duplicated a full page that already exists (`/member/attendance-history` and
 * `/member/membership`), both linked from Profile. The attendance tab also
 * showed a "Consistency Score" computed against a **hardcoded target of 20
 * visits a month** — a number the gym never set and no member agreed to.
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
  // `?tab=` lets Home link straight to Coach when a note is waiting. Read once
  // into state rather than driven from the URL: the tab strip is local
  // navigation, and pushing five history entries for five taps would turn the
  // phone's back gesture into a tour of the tabs instead of a way out.
  const [params] = useSearchParams();
  const requested = params.get('tab');
  const [active, setActive] = useState<TabId>(isTabId(requested) ? requested : 'body');

  // This week's visits and the two counters moved here from Home, which was
  // carrying ten stacked sections. They belong with the level card: all three
  // answer "am I getting anywhere", which is what this screen is for.
  const [home, setHome] = useState<MemberHome | null>(null);
  const [summaryFailed, setSummaryFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getCurrentMemberId();
        if (!id) { if (!cancelled) setSummaryFailed(true); return; }
        const data = await getMemberHome(id);
        if (!cancelled) setHome(data);
      } catch {
        // Named, not degraded to zeros. A silent 0 here would read as "you did
        // not train this week", which is a different and much worse claim than
        // "this did not load".
        if (!cancelled) setSummaryFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const renderTab = () => {
    switch (active) {
      case 'body':      return <BodyProgressTab />;
      case 'workouts':  return <WorkoutProgressTab />;
      case 'goals':     return <GoalsTab />;
      case 'dashboard': return <VisualDashboardTab />;
      case 'feedback':  return <TrainerFeedbackTab />;
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button onClick={() => navigate('/member/home')}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="display text-xl text-white">Progress</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Track every part of your journey</p>
        </div>
      </motion.div>

      {/* Above the tabs rather than inside one: the level is the summary of
          everything the five tabs break down, and burying it in a tab would
          make it findable only by whoever already knew it existed. */}
      <LevelProgressCard />

      {summaryFailed && (
        <div
          className="px-3 py-2.5 rounded-xl flex items-start gap-2 text-[11px] leading-relaxed"
          style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}
        >
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <span>Could not load this week&apos;s visits. Pull down to try again.</span>
        </div>
      )}

      {home && (
        <>
          <div>
            <SectionHeader title="This week" />
            <div
              className="p-4"
              style={{ ...panelStyle, borderRadius: 'var(--radius-panel)', boxShadow: 'var(--shadow-panel)' }}
            >
              <WeekRings
                days={home.weekCheckIns}
                dayNumbers={home.weekDayNumbers}
                todayIndex={home.todayIndex}
              />
            </div>
          </div>

          {/* These two counters used to be their own StatCards here. MyCoreCard
              carries them now, alongside workouts logged and goals reached, so
              the screen states each number once instead of twice. */}
          <MyCoreCard home={home} memberId={home.memberId} />
        </>
      )}

      {/* Segmented control — five equal cells, no scrolling. Violet marks the
          selection, per the app's colour convention. */}
      <div
        className="grid grid-cols-5 gap-1 p-1"
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-btn)',
        }}
        role="tablist"
      >
        {tabs.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.id)}
              className="py-2 rounded-full text-xs font-semibold transition-colors"
              style={{
                background: isActive ? 'var(--color-primary)' : 'transparent',
                color: isActive ? '#fff' : 'var(--color-text-muted)',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <motion.div key={active}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}>
        {renderTab()}
      </motion.div>
    </div>
  );
}
