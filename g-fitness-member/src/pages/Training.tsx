import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  CalendarPlus, Activity, CalendarCheck, ClipboardList, BookOpen, Flag, Trophy,
} from 'lucide-react';
import { Page, PageTitle, NavTile } from '../components/ui/page';

/**
 * Everything to do with training, as a dock tab.
 *
 * This and Membership replaced a single "Menu" tab that held both groups — one
 * more tap, and a word ("Menu") that names the furniture rather than what is
 * behind it. The bar now says what the two halves of the app actually are.
 *
 * **Book a session leads**, because it is the thing a member opens this tab to
 * do; the rest is what they come back to afterwards. Progress is here rather
 * than in the dock: it is a destination you visit when a number on Home makes
 * you curious, and Home carries "Your progress -> See activity" for exactly
 * that moment.
 */
export default function Training() {
  const navigate = useNavigate();

  return (
    <Page>
      <PageTitle title="Training" subtitle="Book it, follow it, look back on it" />

      <motion.section
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col" style={{ gap: 'var(--stack-tight)' }}
      >
        <div className="grid grid-cols-3 gap-2">
          <NavTile icon={<CalendarPlus size={20} />} label="Book a session" tone="secondary"
            onClick={() => navigate('/member/book-class')} />
          <NavTile icon={<Activity size={20} />} label="Progress" onClick={() => navigate('/member/progress')} />
          <NavTile icon={<CalendarCheck size={20} />} label="My bookings" onClick={() => navigate('/member/booking-history')} />
          <NavTile icon={<ClipboardList size={20} />} label="Training plan" onClick={() => navigate('/member/plan')} />
          <NavTile icon={<BookOpen size={20} />} label="Free workouts" onClick={() => navigate('/member/workouts')} />
          <NavTile icon={<Flag size={20} />} label="Challenges" onClick={() => navigate('/member/challenges')} />
          <NavTile icon={<Trophy size={20} />} label="Events" onClick={() => navigate('/member/events')} />
        </div>
      </motion.section>
    </Page>
  );
}
