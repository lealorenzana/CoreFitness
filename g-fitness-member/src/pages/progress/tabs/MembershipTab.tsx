import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, AlertTriangle } from 'lucide-react';
import { SharedStorage } from '../../../utils/sharedStorage';
import { useMemberId } from '../hooks/useMemberId';
import { Skeleton } from '../../../components/ui/Skeleton';
import EmptyState from '../../../components/ui/EmptyState';

interface SubscriptionRow {
  plan: string; start: string; end: string; status: string;
}

export default function MembershipTab() {
  const memberId = useMemberId();
  const navigate = useNavigate();
  const [member, setMember] = useState<any>(null);
  const [history, setHistory] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      const m = SharedStorage.getMember(memberId);
      setMember(m);
      const payments = SharedStorage.getMemberPayments(memberId);
      setHistory(payments.map((p: any) => ({
        plan: p.plan || 'Standard',
        start: p.date,
        end: p.expiryDate || new Date(new Date(p.date).setMonth(new Date(p.date).getMonth() + 1)).toISOString().split('T')[0],
        status: p.status === 'pending' || p.status === 'Pending' ? 'Pending' : 'Active',
      })));
      setLoading(false);
    }, 250);
  }, [memberId]);

  if (loading) return <div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-32" /></div>;
  if (!member) return <EmptyState icon={CreditCard} title="No active membership"
    message="Sign up for a plan to begin." cta={{ label: 'Browse Plans', onClick: () => navigate('/member/membership') }} />;

  const expiry = new Date(member.expiryDate);
  const today = new Date();
  const totalDays = Math.max(1, Math.floor((expiry.getTime() - new Date(member.startDate || member.joinDate).getTime()) / 86400000));
  const remainingDays = Math.max(0, Math.floor((expiry.getTime() - today.getTime()) / 86400000));
  const usedDays = totalDays - remainingDays;
  const percentRemaining = Math.max(0, Math.min(100, Math.round((remainingDays / totalDays) * 100)));
  const showRenew = remainingDays <= 7;

  // Sessions consumed (mock for session-based plans — Premium gets 12)
  const totalSessions = member.membershipType === 'Premium' ? 12 : member.membershipType === 'Standard' ? 8 : 4;
  const sessionsUsed = Math.min(totalSessions, Math.floor(usedDays / 7) * 2);

  return (
    <div className="space-y-4">
      {showRenew && (
        <div className="rounded-2xl p-4 flex items-start gap-3"
          style={{ background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.30)' }}>
          <AlertTriangle size={20} style={{ color: 'var(--color-secondary)' }} />
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">Renewal Reminder</p>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              Your membership expires in {remainingDays} day{remainingDays === 1 ? '' : 's'}.
            </p>
          </div>
          <button onClick={() => navigate('/member/renew-membership')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-black"
            style={{ background: 'var(--color-secondary)' }}>
            Renew
          </button>
        </div>
      )}

      {/* Days remaining */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white font-semibold text-sm">Days Remaining</h3>
          <span className="text-xs font-bold" style={{ color: 'var(--color-secondary)' }}>{percentRemaining}%</span>
        </div>
        <p className="text-3xl font-bold text-white">
          {remainingDays} <span className="text-base font-normal" style={{ color: 'var(--color-text-muted)' }}>days</span>
        </p>
        <div className="mt-2 h-2 rounded-full" style={{ background: 'var(--color-border)' }}>
          <div className="h-full rounded-full"
            style={{ width: `${percentRemaining}%`, background: percentRemaining < 20 ? 'var(--color-secondary)' : 'var(--color-secondary)' }} />
        </div>
      </div>

      {/* Sessions consumed */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white font-semibold text-sm">Trainer Sessions</h3>
          <span className="text-xs font-bold" style={{ color: 'var(--color-secondary)' }}>{sessionsUsed} / {totalSessions}</span>
        </div>
        <div className="h-2 rounded-full" style={{ background: 'var(--color-border)' }}>
          <div className="h-full rounded-full"
            style={{ width: `${(sessionsUsed / totalSessions) * 100}%`, background: 'var(--color-primary)' }} />
        </div>
        <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
          Included with your {member.membershipType} plan
        </p>
      </div>

      {/* Subscription history */}
      <div>
        <h3 className="text-white font-semibold mb-2 px-1">Subscription History</h3>
        {history.length === 0 ? (
          <EmptyState icon={CreditCard} title="No history yet" message="Past subscriptions will be listed here." />
        ) : (
          <div className="space-y-2">
            {history.map((row, i) => (
              <div key={i} className="rounded-xl p-3 flex items-center justify-between"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                <div>
                  <p className="text-sm font-semibold text-white">{row.plan}</p>
                  <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    {new Date(row.start).toLocaleDateString()} → {new Date(row.end).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                  style={{
                    background: row.status === 'Active' ? 'var(--color-primary-light)' : 'var(--color-secondary-light)',
                    color: row.status === 'Active' ? 'var(--color-primary)' : 'var(--color-secondary)',
                  }}>
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
