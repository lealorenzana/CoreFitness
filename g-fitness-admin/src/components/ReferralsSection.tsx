import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronRight, Gift, Trophy, UserPlus } from 'lucide-react';
import { RdCard, RdButton, Pill, EmptyBlock, StatTile, FilterChips, SearchField, RdTable, Tr, Td, FitBody, RailCard, TipCard, Initials } from './ui/rd';
import DetailSheet, { SheetRow } from './ui/DetailSheet';
import { supabase } from '../lib/supabaseClient';
import { getGymContext } from '../lib/gymContext';
import { moduleOn, useGymModules } from '../hooks/useGymModules';
import { showToast } from '../utils/toast';
import { localDateKey, todayKey, daysBetween } from '../utils/dates';

const MUTED = 'var(--color-text-muted)';
const SECOND = 'var(--color-text-secondary)';
/** "2026-09" for a moment, in Manila (UTC+8): the month the monthly cap counts. */
const manilaMonth = (ms: number) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 7);
/** trg_referral_paid pays the member who invited at most this many a month (0125). */
const MONTH_CAP = 5;

interface Row {
  id: string; referrer_name: string; friend_name: string; status: 'pending' | 'rewarded' | 'void';
  created_at: string; rewarded_at: string | null; referrer_points: number; friend_points: number;
  // 0253: absent before it is pasted
  desk_reward_referrer?: string | null; desk_reward_friend?: string | null;
  desk_given_referrer_at?: string | null; desk_given_friend_at?: string | null;
}
/** What the referrals row itself holds beyond gym_referrals(): who, the code, the payment that paid it. */
interface Link { id: string; referrer_id: string; referred_id: string; code: string; payment_id: string | null }
interface Person { id: string; photo_url: string | null; phone: string | null; email: string | null; joined_at: string | null }
interface Paid { id: string; amount: number; plan_name: string | null; paid_on: string; invoice_number: string; method: string }
interface Term { member_id: string; status: string; expiry_date: string | null; plan: { name: string } | null }

type Filter = 'all' | 'pending' | 'rewarded' | 'void';

/**
 * Who brought whom (0125), on People → Referrals and Rewards → Referrals.
 *
 * Referrals are recorded when a friend arrives through a member's link and rewarded by the database when the
 * desk records the friend's first real payment. With the gym's Points ON the reward is points (the owner sets
 * them under "How members earn points"). With Points OFF (0253) it is the gym's own DESK REWARD, set here by
 * the owner (e.g. "1 free day pass"), and the desk marks each one given.
 *
 * 2026-11-24: a table you can filter and search, a rail with who brings the most friends, and a sheet per
 * referral (both people, the code, the payment that paid it, the friend's plan now). The extra facts come
 * from the referrals row, gym_people, payments and memberships, which admin and staff read under RLS; if
 * those reads fail the list still shows what gym_referrals() returned, and the sheet says what is missing.
 */
export default function ReferralsSection() {
  const navigate = useNavigate();
  const modules = useGymModules();
  const pointsOn = moduleOn(modules, 'points');
  const [rows, setRows] = useState<Row[] | null | undefined>(undefined);
  const [links, setLinks] = useState<Map<string, Link> | null>(new Map());
  const [people, setPeople] = useState<Map<string, Person>>(new Map());
  const [paids, setPaids] = useState<Map<string, Paid>>(new Map());
  const [terms, setTerms] = useState<Map<string, Term>>(new Map());
  const [month, setMonth] = useState('');
  const [owner, setOwner] = useState(false);
  const [rewards, setRewards] = useState<{ referrer: string; friend: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase.rpc('gym_referrals');
    setMonth(manilaMonth(Date.now()));
    setRows(error ? null : ((data ?? []) as Row[]));
    if (error) return;
    const ids = ((data ?? []) as Row[]).map((r) => r.id);
    if (ids.length === 0) return;
    const l = await supabase.from('referrals').select('id, referrer_id, referred_id, code, payment_id').in('id', ids);
    if (l.error) { setLinks(null); return; }
    const lm = new Map((l.data as Link[]).map((x) => [x.id, x]));
    setLinks(lm);
    const who = [...new Set([...lm.values()].flatMap((x) => [x.referrer_id, x.referred_id]))];
    const friends = [...new Set([...lm.values()].map((x) => x.referred_id))];
    const pays = [...lm.values()].map((x) => x.payment_id).filter((x): x is string => !!x);
    const [p, pay, m] = await Promise.all([
      supabase.from('gym_people').select('id, photo_url, phone, email, joined_at').in('id', who),
      pays.length ? supabase.from('payments').select('id, amount, plan_name, paid_on, invoice_number, method').in('id', pays) : Promise.resolve({ data: [], error: null }),
      supabase.from('memberships').select('member_id, status, expiry_date, created_at, plan:membership_plans(name)').in('member_id', friends).order('created_at', { ascending: false }),
    ]);
    if (!p.error) setPeople(new Map((p.data as Person[]).map((x) => [x.id, x])));
    if (!pay.error) setPaids(new Map(((pay.data ?? []) as Paid[]).map((x) => [x.id, x])));
    if (!m.error) {
      const tm = new Map<string, Term>();
      for (const t of (m.data ?? []) as unknown as Term[]) if (!tm.has(t.member_id)) tm.set(t.member_id, t); // newest first
      setTerms(tm);
    }
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
    else showToast('Saved. The next friend who pays gets these rewards', 'success');
  };
  const give = async (id: string, who: 'referrer' | 'friend') => {
    const { error } = await supabase.rpc('give_referral_reward', { p_referral: id, p_who: who });
    if (error) { showToast(error.message.replace(/^.*?: /, ''), 'error'); return; }
    showToast('Marked as handed over', 'success');
    await load();
  };

  // Who brings the most friends: by the referrer's name, since gym_referrals() returns names only.
  const leaders = useMemo(() => {
    const by = new Map<string, { name: string; id: string | null; invited: number; paid: number; month: number }>();
    for (const r of rows ?? []) {
      const id = links?.get(r.id)?.referrer_id ?? null;
      const key = id ?? r.referrer_name;
      const e = by.get(key) ?? { name: r.referrer_name, id, invited: 0, paid: 0, month: 0 };
      e.invited += 1;
      if (r.status === 'rewarded') {
        e.paid += 1;
        if (r.rewarded_at && manilaMonth(new Date(r.rewarded_at).getTime()) === month) e.month += 1;
      }
      by.set(key, e);
    }
    return [...by.values()].sort((a, b) => b.paid - a.paid || b.invited - a.invited || a.name.localeCompare(b.name));
  }, [rows, links, month]);

  if (rows === undefined) return null;
  if (rows === null) {
    return <RdCard className="p-4"><p className="text-[13px]" style={{ color: MUTED }}>Referrals need migration 0125, which is not pasted yet.</p></RdCard>;
  }

  const today = todayKey();
  const ageDays = (iso: string) => daysBetween(localDateKey(iso), today);
  const paid = rows.filter((r) => r.status === 'rewarded');
  const waiting = rows.filter((r) => r.status === 'pending');
  const voided = rows.filter((r) => r.status === 'void');
  const paidThisMonth = paid.filter((r) => r.rewarded_at && manilaMonth(new Date(r.rewarded_at).getTime()) === month).length;
  const pointsOut = paid.reduce((n, r) => n + r.referrer_points + r.friend_points, 0);
  const deskOwed = paid.reduce((n, r) => n + (r.desk_reward_referrer && !r.desk_given_referrer_at ? 1 : 0) + (r.desk_reward_friend && !r.desk_given_friend_at ? 1 : 0), 0);
  const oldestWait = waiting.reduce((n, r) => Math.max(n, ageDays(r.created_at)), 0);
  const rate = rows.length ? Math.round((paid.length / rows.length) * 100) : 0;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
  const fmtDay = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
  const peso = (n: number) => `₱${Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
  const first = (name: string) => name.split(' ')[0];

  const shown = rows.filter((r) => (filter === 'all' || r.status === filter)
    && (!q.trim() || `${r.referrer_name} ${r.friend_name} ${links?.get(r.id)?.code ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())));
  const open = openId ? rows.find((r) => r.id === openId) ?? null : null;

  const deskChip = (r: Row, who: 'referrer' | 'friend', inSheet = false) => {
    const what = who === 'referrer' ? r.desk_reward_referrer : r.desk_reward_friend;
    const given = who === 'referrer' ? r.desk_given_referrer_at : r.desk_given_friend_at;
    if (!what) return null;
    const name = first(who === 'referrer' ? r.referrer_name : r.friend_name);
    return given
      ? <Pill key={who} tone="gray">{name}: {what} · given</Pill>
      : inSheet
        ? <RdButton key={who} size="sm" variant="primary" icon={Gift} data-give-reward={`${r.id}:${who}`} onClick={() => void give(r.id, who)}>Give {name} {what}</RdButton>
        : <button key={who} type="button" className="a-btn sm violet" data-give-reward={`${r.id}:${who}`} onClick={(e) => { e.stopPropagation(); void give(r.id, who); }}>
          <Gift size={13} />Give {name} {what}
        </button>;
  };
  const reward = (r: Row) => r.status === 'rewarded'
    ? (r.desk_reward_referrer || r.desk_reward_friend
        ? <span className="inline-flex gap-1.5 flex-wrap justify-end">{deskChip(r, 'referrer')}{deskChip(r, 'friend')}</span>
        : r.referrer_points + r.friend_points > 0
          ? <Pill tone="violet">Paid · {r.referrer_points} + {r.friend_points} pts</Pill>
          : <Pill tone="violet">Paid</Pill>)
    : r.status === 'void' ? <Pill tone="gray">Void</Pill>
    : <span className="inline-flex items-center gap-1 text-[12px] whitespace-nowrap" style={{ color: MUTED }}><ArrowRight size={12} />Not earned yet</span>;
  const firstPayment = (r: Row) => {
    const pid = links?.get(r.id)?.payment_id;
    const p = pid ? paids.get(pid) : undefined;
    if (p) return <span className="whitespace-nowrap">{peso(p.amount)} {p.plan_name ?? ''}<span style={{ color: MUTED }}> · {fmt(p.paid_on + 'T12:00:00+08:00')}</span></span>;
    if (r.status === 'pending') {
      const d = ageDays(r.created_at);
      return <span className="whitespace-nowrap" style={{ color: d >= 14 ? 'var(--v2-warn, #F59E0B)' : MUTED }}>Not paid yet{d > 0 ? ` · ${d} day${d === 1 ? '' : 's'}` : ''}</span>;
    }
    return <span style={{ color: MUTED }}>{r.rewarded_at ? `Paid ${fmt(r.rewarded_at)}` : 'None'}</span>;
  };

  const rail = (
    <>
      <RailCard icon={Trophy} title="Who brings the most friends" sub={`Paid friends, all time. A member earns a reward for at most ${MONTH_CAP} a month.`} data-top-referrers>
        {leaders.length === 0 ? <p className="text-[12.5px]" style={{ color: MUTED }}>Nobody has invited a friend yet.</p>
          : leaders.slice(0, 6).map((l, i) => (
            <button key={l.id ?? l.name} type="button" disabled={!l.id} data-top-referrer
              className="flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2 text-[13px] text-left"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.07)', color: 'var(--color-text-primary)' }}
              onClick={() => l.id && navigate(`/members?open=${l.id}`)} title={l.id ? `Open ${l.name}` : undefined}>
              <span className="tabular-nums text-[12px] w-4 text-left" style={{ color: MUTED }}>{i + 1}</span>
              <Initials name={l.name} photo={l.id ? people.get(l.id)?.photo_url : null} size={24} />
              <span className="flex-1 min-w-0 text-left">
                <span className="block truncate">{l.name}</span>
                <span className="block text-[11.5px]" style={{ color: MUTED }}>{l.invited} invited · {l.month} of {MONTH_CAP} rewarded this month</span>
              </span>
              <b className="tabular-nums font-semibold w-6 text-right">{l.paid}</b>
            </button>
          ))}
      </RailCard>
      <TipCard title="How a referral is counted">
        A friend who signs up through a member's link shows here as waiting. It turns paid when the desk records the
        friend's first payment above ₱0, and {pointsOn ? 'the points go to both of them on their own.' : 'the desk rewards above are owed to both.'}
        {' '}A referral is void when the friend never joins as a member.
      </TipCard>
    </>
  );

  return (
    <RdCard className="flex flex-col min-h-0 overflow-hidden rd-fit-fill" data-referrals>
      <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.06)' }}>
        <UserPlus size={18} style={{ color: SECOND }} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Referrals</h2>
          <p className="text-[12.5px]" style={{ color: SECOND }}>
            {rows.length} invited · {paid.length} joined and paid · {paidThisMonth} this month.{' '}
            {pointsOn ? 'Points are paid when you record the friend’s first payment above ₱0.'
              : 'Your gym runs no points, so a friend’s first payment earns the desk rewards below instead.'}
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col p-4 gap-4">
        {/* The Schedule's layout (owner, 2026-11-28): the figures in a column on the left, the rest takes the width. */}
        <div className="ref-split">
        <div className="ref-figs" data-referral-stats>
          <StatTile icon={UserPlus} label="Friends invited" value={rows.length} sub="through a member’s link" />
          <StatTile icon={UserPlus} label="Joined and paid" value={paid.length} sub={`${paidThisMonth} this month · ${rate}% of invited`} />
          <StatTile icon={UserPlus} tone={oldestWait >= 14 ? 'amber' : 'violet'} label="Waiting for a first payment" value={waiting.length}
            sub={waiting.length ? `the oldest for ${oldestWait} day${oldestWait === 1 ? '' : 's'}` : 'nobody waiting'} />
          {pointsOn
            ? <StatTile icon={Gift} label="Points paid out" value={pointsOut.toLocaleString('en-PH')} sub="to both sides, all time" />
            : <StatTile icon={Gift} tone={deskOwed ? 'amber' : 'violet'} label="Rewards to hand over" value={deskOwed} sub="at the desk, not given yet" />}
        </div>

        <div className="min-w-0 min-h-0 flex flex-col gap-4">
        {!pointsOn && rewards && (
          <div data-desk-rewards>
            <div className="rounded-xl p-3.5" style={{ border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.1)' }}>
              <p className="text-[13.5px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Desk rewards</p>
              <p className="text-[12.5px] mt-0.5" style={{ color: SECOND }}>
                What you hand over at the desk when a friend first pays. Leave one empty to give nothing. The member who invited gets at most five a month.
              </p>
              <div className="grid gap-2.5 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
                <label className="text-[12.5px]" style={{ color: SECOND }}>For the member who invited
                  <input className="a-in mt-1 w-full" maxLength={80} disabled={!owner} value={rewards.referrer} placeholder="e.g. 1 free day pass"
                    onChange={(e) => setRewards({ ...rewards, referrer: e.target.value })} data-reward-referrer /></label>
                <label className="text-[12.5px]" style={{ color: SECOND }}>For the friend
                  <input className="a-in mt-1 w-full" maxLength={80} disabled={!owner} value={rewards.friend} placeholder="e.g. ₱100 off the first renewal"
                    onChange={(e) => setRewards({ ...rewards, friend: e.target.value })} data-reward-friend /></label>
              </div>
              {owner
                ? <button type="button" className="a-btn amber sm mt-3" disabled={saving} onClick={() => void saveRewards()}>{saving ? 'Saving…' : 'Save rewards'}</button>
                : <p className="text-[12px] mt-2" style={{ color: MUTED }}>Only the owner changes these.</p>}
            </div>
          </div>
        )}

        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <FitBody rail={rail}>
            {rows.length === 0 ? (
              <div className="flex-1 grid place-items-center">
                <EmptyBlock icon={UserPlus} title="No referrals yet" body="Members share their link from Invite a friend in the app. Each friend who joins and pays shows here." />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 flex-wrap">
                  <FilterChips<Filter> value={filter} onChange={setFilter} items={[
                    { key: 'all', label: 'All', count: rows.length },
                    { key: 'pending', label: 'Waiting', count: waiting.length, tone: 'amber' },
                    { key: 'rewarded', label: 'Paid', count: paid.length, tone: 'violet' },
                    ...(voided.length ? [{ key: 'void' as const, label: 'Void', count: voided.length, tone: 'gray' as const }] : []),
                  ]} />
                  <SearchField value={q} onChange={setQ} placeholder="Search a name or code" />
                </div>
                <RdCard className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  <RdTable head={['Who', 'Invited', 'First payment', { label: 'Reward', align: 'right' }]}
                    empty={shown.length === 0 ? <p className="text-[13px] p-4" style={{ color: MUTED }}>No referral matches.</p> : undefined}
                    boxRef={() => undefined}>
                    {shown.map((r) => (
                      <Tr key={r.id} onClick={() => setOpenId(r.id)} data-referral-row={r.id}>
                        <Td><span className="whitespace-nowrap"><strong>{r.referrer_name}</strong> brought <strong>{r.friend_name}</strong></span></Td>
                        <Td><span className="whitespace-nowrap" style={{ color: SECOND }}>{fmt(r.created_at)}</span></Td>
                        <Td>{firstPayment(r)}</Td>
                        <Td align="right">{reward(r)}</Td>
                      </Tr>
                    ))}
                  </RdTable>
                </RdCard>
              </>
            )}
          </FitBody>
        </div>
        </div>
        </div>
      </div>

      <DetailSheet open={!!open} onClose={() => setOpenId(null)}
        title={open ? `${open.referrer_name} brought ${open.friend_name}` : ''}
        subtitle={open ? `Invited ${fmt(open.created_at)}${links?.get(open.id)?.code ? ` with code ${links.get(open.id)!.code}` : ''}` : undefined}
        footer={open && (open.desk_reward_referrer || open.desk_reward_friend) && open.status === 'rewarded'
          ? <span className="flex gap-1.5 flex-wrap">{deskChip(open, 'referrer', true)}{deskChip(open, 'friend', true)}</span> : undefined}>
        {open && (() => {
          const l = links?.get(open.id);
          const referrer = l ? people.get(l.referrer_id) : undefined;
          const friend = l ? people.get(l.referred_id) : undefined;
          const term = l ? terms.get(l.referred_id) : undefined;
          const pay = l?.payment_id ? paids.get(l.payment_id) : undefined;
          const lead = leaders.find((x) => x.id && x.id === l?.referrer_id);
          const person = (label: string, name: string, p: Person | undefined, id: string | undefined, extra: React.ReactNode) => (
            <div className="rounded-xl p-3 mb-3" style={{ border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.08)' }}>
              <p className="text-[11px] uppercase tracking-wider mb-2" style={{ color: MUTED }}>{label}</p>
              <div className="flex items-center gap-3">
                <Initials name={name} photo={p?.photo_url} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{name}</p>
                  <p className="text-[12px] truncate" style={{ color: SECOND }}>{[p?.phone, p?.email].filter(Boolean).join(' · ') || 'No contact on file'}</p>
                </div>
                {id && <RdButton size="sm" variant="secondary" onClick={() => navigate(`/members?open=${id}`)}>Open<ChevronRight size={13} /></RdButton>}
              </div>
              <div className="mt-2">{extra}</div>
            </div>
          );
          return (
            <div data-referral-sheet>
              {!l && <p className="text-[12.5px] mb-3" style={{ color: 'var(--v2-warn, #F59E0B)' }}>The rest of this referral could not be loaded. Only the names and the reward are shown.</p>}
              {person('Invited by', open.referrer_name, referrer, l?.referrer_id, lead && <>
                <SheetRow label="Friends brought">{lead.invited} invited · {lead.paid} paid</SheetRow>
                <SheetRow label="This month">{lead.month} of {MONTH_CAP} rewarded{lead.month >= MONTH_CAP ? ' · no more rewards this month' : ''}</SheetRow>
              </>)}
              {person('The friend', open.friend_name, friend, l?.referred_id, <>
                {friend?.joined_at && <SheetRow label="Joined the gym">{fmt(friend.joined_at)}</SheetRow>}
                <SheetRow label="Plan now">{term ? `${term.plan?.name ?? 'Plan'} · ${term.status}${term.expiry_date ? ` until ${fmtDay(term.expiry_date)}` : ''}` : 'No plan yet'}</SheetRow>
              </>)}
              <p className="text-[11px] uppercase tracking-wider mb-1 mt-1" style={{ color: MUTED }}>What happened</p>
              <SheetRow label="Invited">{fmt(open.created_at)}{l?.code ? ` through code ${l.code}` : ''}</SheetRow>
              <SheetRow label="First payment">{pay
                ? `${peso(pay.amount)} · ${pay.plan_name ?? 'payment'} · ${fmtDay(pay.paid_on)} · ${pay.method} · ${pay.invoice_number}`
                : open.status === 'pending' ? `Not yet. Waiting ${ageDays(open.created_at)} days` : open.status === 'void' ? 'None, the referral is void' : 'Recorded'}</SheetRow>
              <SheetRow label="Reward">{open.status !== 'rewarded' ? 'Not earned yet'
                : open.desk_reward_referrer || open.desk_reward_friend
                  ? [open.desk_reward_referrer && `${first(open.referrer_name)}: ${open.desk_reward_referrer}${open.desk_given_referrer_at ? `, given ${fmt(open.desk_given_referrer_at)}` : ', not given yet'}`,
                     open.desk_reward_friend && `${first(open.friend_name)}: ${open.desk_reward_friend}${open.desk_given_friend_at ? `, given ${fmt(open.desk_given_friend_at)}` : ', not given yet'}`].filter(Boolean).join(' · ')
                  : open.referrer_points + open.friend_points > 0
                    ? `${open.referrer_points} points to ${first(open.referrer_name)}, ${open.friend_points} to ${first(open.friend_name)}${open.rewarded_at ? ` on ${fmt(open.rewarded_at)}` : ''}`
                    : `Paid${open.rewarded_at ? ` ${fmt(open.rewarded_at)}` : ''}, no points (over the monthly limit or points were off)`}</SheetRow>
            </div>
          );
        })()}
      </DetailSheet>
    </RdCard>
  );
}
