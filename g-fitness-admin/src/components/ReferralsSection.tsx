import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import Card from './ui/Card';
import { supabase } from '../lib/supabaseClient';

const MUTED = 'var(--color-text-muted)';
/** "2026-09" for a moment, in Manila (UTC+8) — the month the monthly cap counts. */
const manilaMonth = (ms: number) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 7);

interface Row {
  id: string; referrer_name: string; friend_name: string; status: 'pending' | 'rewarded' | 'void';
  created_at: string; rewarded_at: string | null; referrer_points: number; friend_points: number;
}

/**
 * Rewards → who brought whom (0125).
 *
 * Read-only: referrals are recorded when a friend arrives through a member's
 * link and paid by the database when the desk records the friend's first real
 * payment. The owner changes what they are worth under "How members earn
 * points" (the referral and referral_welcome rules).
 */
export default function ReferralsSection() {
  const [rows, setRows] = useState<Row[] | null | undefined>(undefined);
  /** The Manila month, read when the list loads — not on every render. */
  const [month, setMonth] = useState('');

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error } = await supabase.rpc('gym_referrals');
      if (!alive) return;
      setMonth(manilaMonth(Date.now()));
      setRows(error ? null : ((data ?? []) as Row[]));
    })();
    return () => { alive = false; };
  }, []);

  if (rows === undefined) return null;
  if (rows === null) {
    return <Card className="!p-4"><p className="text-xs" style={{ color: MUTED }}>Referrals need migration 0125, which is not pasted yet.</p></Card>;
  }

  const paidThisMonth = rows.filter((r) => r.status === 'rewarded' && r.rewarded_at
    && manilaMonth(new Date(r.rewarded_at).getTime()) === month).length;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <Card className="!p-4 space-y-3">
      <div className="flex items-center gap-2">
        <UserPlus size={14} style={{ color: 'var(--color-primary)' }} />
        <div>
          <h2 className="text-sm font-bold text-white">Referrals</h2>
          <p className="text-[10px]" style={{ color: MUTED }}>
            {rows.length} invited · {rows.filter((r) => r.status === 'rewarded').length} joined and paid · {paidThisMonth} this month.
            Points are paid when you record the friend&apos;s first payment above ₱0.
          </p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs" style={{ color: MUTED }}>No referrals yet. Members share their link from Invite a friend.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.slice(0, 20).map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2"
              style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}>
              <p className="text-xs text-white">
                <strong>{r.referrer_name}</strong> brought <strong>{r.friend_name}</strong>
                <span style={{ color: MUTED }}> · {fmt(r.created_at)}</span>
              </p>
              <span className="text-[10px] font-semibold" style={{ color: r.status === 'rewarded' ? 'var(--color-primary)' : MUTED }}>
                {r.status === 'rewarded'
                  ? `Paid · ${r.referrer_points} + ${r.friend_points} pts`
                  : 'Waiting for their first payment'}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
