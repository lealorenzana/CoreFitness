import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Shield, CreditCard, Calendar, Gift } from 'lucide-react';
import { Page, PageTitle, NavTile } from '../components/ui/page';

/**
 * The money-and-access half of the app, as a dock tab.
 *
 * Takes over `/member/membership`, which used to redirect to the plan screen.
 * Nothing links to that path expecting the redirect — the expiry notifications
 * point at `/member/renew`, which still resolves — and a bookmark that lands
 * here finds My plan as its first tile.
 */
export default function MembershipHub() {
  const navigate = useNavigate();

  return (
    <Page>
      <PageTitle title="Membership" subtitle="Your plan, what you have paid, what you have earned" />

      <motion.section
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col" style={{ gap: 'var(--stack-tight)' }}
      >
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
