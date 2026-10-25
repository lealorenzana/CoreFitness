import { useEffect, useState } from 'react';
import { ArrowRight, UserPlus } from 'lucide-react';
import { RdCard, Pill } from './ui/rd';
import { TONE } from './ui/rdTokens';
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
 *
 * 2026-10-25: a full-height card — the totals as tiles, then every referral.
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
    return <RdCard className="p-4"><p className="text-[13px]" style={{ color: MUTED }}>Referrals need migration 0125, which is not pasted yet.</p></RdCard>;
  }

  const paid = rows.filter((r) => r.status === 'rewarded');
  const paidThisMonth = paid.filter((r) => r.rewarded_at && manilaMonth(new Date(r.rewarded_at).getTime()) === month).length;
  const pointsOut = paid.reduce((n, r) => n + r.referrer_points + r.friend_points, 0);
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const tile = (label: string, value: string | number, sub: string) => (
    <div className="rounded-xl px-3.5 py-3" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-[12.5px]" style={{ color: 'var(--color-text-secondary)' }}>{label}</p>
      <p className="text-[22px] font-bold text-white tabular-nums">{value}</p>
      <p className="text-[12px]" style={{ color: MUTED }}>{sub}</p>
    </div>
  );

  return (
    <RdCard className="flex flex-col min-h-0 overflow-hidden rd-fit-fill" data-referrals>
      <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <UserPlus size={20} style={{ color: TONE.violet.fg }} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold text-white">Referrals</h2>
          <p className="text-[12.5px]" style={{ color: 'var(--color-text-secondary)' }}>
            {rows.length} invited · {paid.length} joined and paid · {paidThisMonth} this month. Points are paid when you record the friend&apos;s first payment above ₱0.
          </p>
        </div>
      </div>
      <div className="grid gap-2.5 px-4 pt-4" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {tile('Friends invited', rows.length, 'through a member’s link')}
        {tile('Joined and paid', paid.length, `${paidThisMonth} this month`)}
        {tile('Points paid out', pointsOut.toLocaleString('en-PH'), 'to both sides, all time')}
      </div>
      <div className="rd-fit-scroll p-4">
        {rows.length === 0 ? (
          <p className="text-[13px]" style={{ color: MUTED }}>No referrals yet. Members share their link from Invite a friend.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl px-3.5 py-2.5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-[13.5px] text-white flex-1 min-w-0 truncate">
                  <strong>{r.referrer_name}</strong> brought <strong>{r.friend_name}</strong>
                  <span style={{ color: MUTED }}> · {fmt(r.created_at)}</span>
                </p>
                {r.status === 'rewarded'
                  ? <Pill tone="violet">Paid · {r.referrer_points} + {r.friend_points} pts</Pill>
                  : r.status === 'void' ? <Pill tone="gray">Void</Pill>
                  : <span className="inline-flex items-center gap-1 text-[12px]" style={{ color: MUTED }}><ArrowRight size={12} />Waiting for their first payment</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </RdCard>
  );
}
