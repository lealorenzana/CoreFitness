import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ArrowLeft, AlertTriangle, ChevronRight, Trophy } from 'lucide-react';

import MyCoreCard          from '../../components/ui/MyCoreCard';
import { Page, Row }       from '../../components/ui/page';
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
    <Page>
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        {/* Back to wherever you came from. This was hardcoded to Home, so a
            member who opened Progress from the Training grid was thrown to a
            screen they had not been on — the back arrow was navigating them
            somewhere rather than undoing their last step. The guard is the
            house pattern: a cold load into this route (a notification, a
            bookmark) has nothing to go back to, and Home is the right floor. */}
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/member/home'))}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="display text-xl text-white">Progress</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Track every part of your journey</p>
        </div>
      </motion.div>

      {/* The level card lives on Achievements, and only there.
 
          It was rendered on both screens — the same bars, the same two
          counters, the same "Next: Intermediate" — and the earned level *is*
          the achievements concept, so Progress was showing another page's
          headline above its own tabs.
 
          What stays is the link, not the card. `/member/achievements` had
          exactly one entry point in the whole app and it was that card's
          chevron; deleting it outright would have orphaned the page, which is
          the failure `audit-routes.py` exists to catch and which has already
          happened three times here. */}
      <Row
        lead={<Trophy size={18} style={{ color: 'var(--color-secondary)' }} />}
        title="Achievements and level"
        meta="What you have earned, and what is next"
        trailing={<ChevronRight size={18} style={{ color: 'var(--color-text-muted)' }} />}
        onClick={() => navigate('/member/achievements')}
      />

      {summaryFailed && (
        <div
          className="px-3 py-2.5 rounded-xl flex items-start gap-2 text-[12px] leading-relaxed"
          style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}
        >
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <span>Could not load this week&apos;s visits. Pull down to try again.</span>
        </div>
      )}

      {/* "This week" moved to Attendance History (2026-09-16).
 
          It is attendance data, its own call to action was "See every visit ->"
          pointing at that page, and it is the subject there rather than a
          passenger. Home was the other candidate and is the wrong one: Home
          already carries "Days this week — 2 of 7" as a ring, so the strip
          would have stated one fact twice on one screen in two shapes. */}
      {home && <MyCoreCard home={home} memberId={home.memberId} />}

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
    </Page>
  );
}
