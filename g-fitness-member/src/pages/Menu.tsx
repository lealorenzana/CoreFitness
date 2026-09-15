import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Activity, CalendarCheck, ClipboardList, BookOpen, Flag, Trophy,
  Shield, CreditCard, Calendar, Gift,
} from 'lucide-react';
import { Page, PageTitle, NavTile } from '../components/ui/page';

/**
 * Everything the app contains, one tap from the dock.
 *
 * This grid used to live at the bottom of Profile, which meant the way to find
 * out what the app *does* was to open the screen about who you are and scroll
 * past your email address. It now has the dock slot Progress had.
 *
 * **Progress did not need a tab.** It is a destination you visit when a number
 * on Home makes you curious, and Home has carried "Your progress · See
 * activity" since the last pass — a tab as well made it the only screen in the
 * app reachable three ways, while the other eleven had none.
 *
 * Nothing is listed twice. Settings is not here: it belongs to the account and
 * sits on Profile, one tap along the same dock. Challenges and Events are here
 * *and* under the Book tab, which is the one deliberate overlap — they are
 * things to sign up for, and a member looking for "what's on" reasonably starts
 * in either place.
 */
export default function Menu() {
  const navigate = useNavigate();

  return (
    <Page>
      <PageTitle title="Menu" subtitle="Everything the gym app can do" />

      <motion.section
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col" style={{ gap: 'var(--stack-tight)' }}
      >
        <h2 className="display text-white" style={{ fontSize: 'var(--text-title)' }}>Your training</h2>
        <div className="grid grid-cols-3 gap-2">
          <NavTile icon={<Activity size={20} />} label="Progress" onClick={() => navigate('/member/progress')} />
          <NavTile icon={<CalendarCheck size={20} />} label="My bookings" onClick={() => navigate('/member/booking-history')} />
          <NavTile icon={<ClipboardList size={20} />} label="Training plan" onClick={() => navigate('/member/plan')} />
          <NavTile icon={<BookOpen size={20} />} label="Free workouts" onClick={() => navigate('/member/workouts')} />
          <NavTile icon={<Flag size={20} />} label="Challenges" onClick={() => navigate('/member/challenges')} />
          <NavTile icon={<Trophy size={20} />} label="Events" onClick={() => navigate('/member/events')} />
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="flex flex-col" style={{ gap: 'var(--stack-tight)' }}
      >
        <h2 className="display text-white" style={{ fontSize: 'var(--text-title)' }}>Membership</h2>
        <div className="grid grid-cols-3 gap-2">
          <NavTile icon={<Shield size={20} />} label="My plan" onClick={() => navigate('/member/renew-membership')} />
          <NavTile icon={<CreditCard size={20} />} label="Payments" onClick={() => navigate('/member/payments')} />
          <NavTile icon={<Calendar size={20} />} label="Attendance" onClick={() => navigate('/member/attendance-history')} />
          {/* Always listed, on every tier. A member whose plan does not include
              points sees the locked card explaining what it is — which is the
              point of locking rather than hiding (0049). */}
          <NavTile icon={<Gift size={20} />} label="CORE Points" tone="secondary" onClick={() => navigate('/member/rewards')} />
        </div>
      </motion.section>
    </Page>
  );
}
