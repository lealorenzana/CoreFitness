import { useEffect, useState } from 'react';
import { ArrowRight, Gift, UserPlus } from 'lucide-react';
import { RdCard, Pill } from './ui/rd';
import { TONE } from './ui/rdTokens';
import { supabase } from '../lib/supabaseClient';
import { getGymContext } from '../lib/gymContext';
import { moduleOn, useGymModules } from '../hooks/useGymModules';
import { showToast } from '../utils/toast';

const MUTED = 'var(--color-text-muted)';
/** "2026-09" for a moment, in Manila (UTC+8) — the month the monthly cap counts. */
const manilaMonth = (ms: number) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 7);

interface Row {
  id: string; referrer_name: string; friend_name: string; status: 'pending' | 'rewarded' | 'void';
  created_at: string; rewarded_at: string | null; referrer_points: number; friend_points: number;
  // 0253 — absent before it is pasted
  desk_reward_referrer?: string | null; desk_reward_friend?: string | null;
  desk_given_referrer_at?: string | null; desk_given_friend_at?: string | null;
}

/**
 * Who brought whom (0125) — on People → Referrals and Rewards → Referrals.
 *
 * Referrals are recorded when a friend arrives through a member's link and rewarded by the database when the
 * desk records the friend's first real payment. With the gym's Points ON the reward is points (the owner sets
 * them under "How members earn points"). With Points OFF (0253) it is the gym's own DESK REWARD — set here by
 * the owner, e.g. "1 free day pass" — and the desk marks each one given.
 */
export default function ReferralsSection() {
  const modules = useGymModules();
  const pointsOn = moduleOn(modules, 'points');
  const [rows, setRows] = useState<Row[] | null | undefined>(undefined);
  const [month, setMonth] = useState('');
  const [owner, setOwner] = useState(false);
  const [rewards, setRewards] = useState<{ referrer: string; friend: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.rpc('gym_referrals');
    setMonth(manilaMonth(Date.now()));
    setRows(error ? null : ((data ?? []) as Row[]));
  };
  useEffect(() => {
    let alive = true;
    void (async () => {
      await load();
      const ctx = await getGymContext();
      if (!alive) return;
      setOwner(ctx?.role === 'admin');
      const s = await supabase.from('gym_settings').select('referral_reward_referrer, referral_reward_friend').maybeSingle();
      if (!alive) return;
      // Before 0253 the columns do not exist: no desk-reward form at all.
      if (!s.error) {
        const v = (s.data ?? {}) as { referral_reward_referrer?: string | null; referral_reward_friend?: string | null };
        setRewards({ referrer: v.referral_reward_referrer ?? '', friend: v.referral_reward_friend ?? '' });
      }
    })();
    return () => { alive = false; };
  }, []);

  const saveRewards = async () => {
    if (!rewards) return;
    setSaving(true);
    const { error } = await supabase.rpc('set_referral_rewards', { p_referrer: rewards.referrer.trim(), p_friend: rewards.friend.trim() });
    setSaving(false);
    if (error) showToast(error.message.replace(/^.*?: /, ''), 'error');
    else showToast('Saved — the next friend who pays gets these rewards', 'success');
  };
  const give = async (id: string, who: 'referrer' | 'friend') => {
    const { error } = await supabase.rpc('give_referral_reward', { p_referral: id, p_who: who });
    if (error) { showToast(error.message.replace(/^.*?: /, ''), 'error'); return; }
    showToast('Marked as handed over', 'success');
    await load();
  };

  if (rows === undefined) return null;
  if (rows === null) {
    return <RdCard className="p-4"><p className="text-[13px]" style={{ color: MUTED }}>Referrals need migration 0125, which is not pasted yet.</p></RdCard>;
  }

  const paid = rows.filter((r) => r.status === 'rewarded');
  const paidThisMonth = paid.filter((r) => r.rewarded_at && manilaMonth(new Date(r.rewarded_at).getTime()) === month).length;
  const pointsOut = paid.reduce((n, r) => n + r.referrer_points + r.friend_points, 0);
  const deskOwed = paid.reduce((n, r) => n + (r.desk_reward_referrer && !r.desk_given_referrer_at ? 1 : 0) + (r.desk_reward_friend && !r.desk_given_friend_at ? 1 : 0), 0);
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const tile = (label: string, value: string | number, sub: string) => (
    <div className="rounded-xl px-3.5 py-3" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.07)' }}>
      <p className="text-[12.5px]" style={{ color: 'var(--color-text-secondary)' }}>{label}</p>
      <p className="text-[22px] font-bold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{value}</p>
      <p className="text-[12px]" style={{ color: MUTED }}>{sub}</p>
    </div>
  );
  const deskChip = (r: Row, who: 'referrer' | 'friend') => {
    const what = who === 'referrer' ? r.desk_reward_referrer : r.desk_reward_friend;
    const given = who === 'referrer' ? r.desk_given_referrer_at : r.desk_given_friend_at;
    if (!what) return null;
    const name = who === 'referrer' ? r.referrer_name.split(' ')[0] : r.friend_name.split(' ')[0];
    return given
      ? <Pill key={who} tone="gray">{name}: {what} · given</Pill>
      : <button key={who} type="button" className="a-btn sm violet" data-give-reward={`${r.id}:${who}`} onClick={() => void give(r.id, who)}>
          <Gift size={13} />Give {name} {what}
        </button>;
  };

  return (
    <RdCard className="flex flex-col min-h-0 overflow-hidden rd-fit-fill" data-referrals>
      <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.06)' }}>
        <UserPlus size={20} style={{ color: TONE.violet.fg }} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Referrals</h2>
          <p className="text-[12.5px]" style={{ color: 'var(--color-text-secondary)' }}>
            {rows.length} invited · {paid.length} joined and paid · {paidThisMonth} this month.{' '}
            {pointsOn ? 'Points are paid when you record the friend’s first payment above ₱0.'
              : 'Your gym runs no points, so a friend’s first payment earns the desk rewards below instead.'}
          </p>
        </div>
      </div>

      {!pointsOn && rewards && (
        <div className="px-4 pt-4" data-desk-rewards>
          <div className="rounded-xl p-3.5" style={{ border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.1)' }}>
            <p className="text-[13.5px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Desk rewards</p>
            <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
              What you hand over at the desk when a friend first pays — leave one empty to give nothing. The member who invited gets at most five a month.
            </p>
            <div className="grid gap-2.5 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
              <label className="text-[12.5px]" style={{ color: 'var(--color-text-secondary)' }}>For the member who invited
                <input className="a-in mt-1 w-full" maxLength={80} disabled={!owner} value={rewards.referrer} placeholder="e.g. 1 free day pass"
                  onChange={(e) => setRewards({ ...rewards, referrer: e.target.value })} data-reward-referrer /></label>
              <label className="text-[12.5px]" style={{ color: 'var(--color-text-secondary)' }}>For the friend
                <input className="a-in mt-1 w-full" maxLength={80} disabled={!owner} value={rewards.friend} placeholder="e.g. ₱100 off the first renewal"
                  onChange={(e) => setRewards({ ...rewards, friend: e.target.value })} data-reward-friend /></label>
            </div>
            {owner
              ? <button type="button" className="a-btn amber sm mt-3" disabled={saving} onClick={() => void saveRewards()}>{saving ? 'Saving…' : 'Save rewards'}</button>
              : <p className="text-[12px] mt-2" style={{ color: MUTED }}>Only the owner changes these.</p>}
          </div>
        </div>
      )}

      <div className="grid gap-2.5 px-4 pt-4" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {tile('Friends invited', rows.length, 'through a member’s link')}
        {tile('Joined and paid', paid.length, `${paidThisMonth} this month`)}
        {pointsOn
          ? tile('Points paid out', pointsOut.toLocaleString('en-PH'), 'to both sides, all time')
          : tile('Rewards to hand over', deskOwed, 'at the desk, not given yet')}
      </div>
      <div className="rd-fit-scroll p-4">
        {rows.length === 0 ? (
          <p className="text-[13px]" style={{ color: MUTED }}>No referrals yet. Members share their link from Invite a friend.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 flex-wrap" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.06)' }}>
                <p className="text-[13.5px] flex-1 min-w-0 truncate" style={{ color: 'var(--color-text-primary)' }}>
                  <strong>{r.referrer_name}</strong> brought <strong>{r.friend_name}</strong>
                  <span style={{ color: MUTED }}> · {fmt(r.created_at)}</span>
                </p>
                {r.status === 'rewarded'
                  ? (r.desk_reward_referrer || r.desk_reward_friend
                      ? <span className="flex gap-1.5 flex-wrap">{deskChip(r, 'referrer')}{deskChip(r, 'friend')}</span>
                      : r.referrer_points + r.friend_points > 0
                        ? <Pill tone="violet">Paid · {r.referrer_points} + {r.friend_points} pts</Pill>
                        : <Pill tone="violet">Paid</Pill>)
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
