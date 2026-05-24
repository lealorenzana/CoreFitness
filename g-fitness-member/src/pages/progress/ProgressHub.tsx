import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { ArrowLeft, Activity, Dumbbell, BarChart3, Target, Calendar, CreditCard, Trophy, MessageSquare } from 'lucide-react';

import BodyProgressTab     from './tabs/BodyProgressTab';
import WorkoutProgressTab  from './tabs/WorkoutProgressTab';
import VisualDashboardTab  from './tabs/VisualDashboardTab';
import GoalsTab            from './tabs/GoalsTab';
import AttendanceTab       from './tabs/AttendanceTab';
import MembershipTab       from './tabs/MembershipTab';
import BadgesTab           from './tabs/BadgesTab';
import TrainerFeedbackTab  from './tabs/TrainerFeedbackTab';

const tabs = [
  { id: 'body',      label: 'Body',       icon: Activity },
  { id: 'workouts',  label: 'Workouts',   icon: Dumbbell },
  { id: 'dashboard', label: 'Charts',     icon: BarChart3 },
  { id: 'goals',     label: 'Goals',      icon: Target },
  { id: 'attend',    label: 'Attendance', icon: Calendar },
  { id: 'member',    label: 'Membership', icon: CreditCard },
  { id: 'badges',    label: 'Badges',     icon: Trophy },
  { id: 'feedback',  label: 'Trainer',    icon: MessageSquare },
] as const;

type TabId = typeof tabs[number]['id'];

export default function ProgressHub() {
  const navigate = useNavigate();
  const [active, setActive] = useState<TabId>('body');

  const renderTab = () => {
    switch (active) {
      case 'body':      return <BodyProgressTab />;
      case 'workouts':  return <WorkoutProgressTab />;
      case 'dashboard': return <VisualDashboardTab />;
      case 'goals':     return <GoalsTab />;
      case 'attend':    return <AttendanceTab />;
      case 'member':    return <MembershipTab />;
      case 'badges':    return <BadgesTab />;
      case 'feedback':  return <TrainerFeedbackTab />;
    }
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button onClick={() => navigate('/member/home')}
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Progress Hub</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Track every part of your journey</p>
        </div>
      </motion.div>

      {/* Tab strip — horizontally scrollable */}
      <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
        <div className="flex gap-2 pb-1 w-max">
          {tabs.map(t => {
            const Icon = t.icon;
            const isActive = active === t.id;
            return (
              <button key={t.id}
                onClick={() => setActive(t.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors"
                style={{
                  background: isActive ? 'var(--color-secondary)' : 'var(--color-surface-raised)',
                  border: `1px solid ${isActive ? 'var(--color-secondary)' : 'var(--color-border)'}`,
                  color: isActive ? '#000' : 'var(--color-text-secondary)',
                }}>
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active tab */}
      <motion.div key={active}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}>
        {renderTab()}
      </motion.div>
    </div>
  );
}
