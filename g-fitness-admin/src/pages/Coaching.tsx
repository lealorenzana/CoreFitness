import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Handshake, Wallet, UserPlus, Clock, CalendarClock, Settings2, Users, CircleStop } from 'lucide-react';
import {
  RdHeader, StatTile, FilterChips, SearchField, RdSelect, RdButton, Pill, RdCard, RdTable, Tr, Td, TableFooter, EmptyBlock,
  FitBody, RailCard, Initials,
} from '../components/ui/rd';
import { TONE, type Tone } from '../components/ui/rdTokens';
import { useFitRows } from '../hooks/useFitRows';
import { usePaged } from '../hooks/usePaged';
import { showToast } from '../utils/toast';
import { todayKey, addDays } from '../utils/dates';
import { listMembers } from '../lib/api/members';
import { listTrainers } from '../lib/api/trainers';
import {
  assignCoaching, coachingSweep, confirmCoachingPayment, endCoaching, getCoachingSettings, listCoachings, STATUS_WORDS,
  type CoachingRow, type CoachingSettings,
} from '../lib/api/coaching';

type Filter = 'active' | 'waiting' | 'ending' | 'ended';
const OPEN = ['invited', 'requested', 'awaiting_payment', 'payment_sent'];
const CLOSED = ['ended', 'declined', 'cancelled'];
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const fmt = (ymd: string | null) => (ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const SECOND = 'var(--color-text-secondary)';
const MUTED = 'var(--color-text-muted)';
const STATUS_TONE: Record<CoachingRow['status'], Tone> = {
  active: 'violet', invited: 'blue', requested: 'blue', awaiting_payment: 'amber', payment_sent: 'amber',
  ended: 'gray', declined: 'gray', cancelled: 'gray',
};

/**
 * Coaching (0181), the gym's side: who trains with which coach and until when,
 * payments to the gym to confirm (gym_priced), and assigning a coach. Under
 * "paid to the coach" the gym sees the coaching and its dates, never the money.
 *
 * 2026-10-12: fits the screen — tiles, the coachings as a table paged by what
 * fits, and a rail with what waits on the desk, assigning, and each coach's load.
 */
export default function Coaching() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<CoachingSettings | null | undefined>(undefined);
  const [rows, setRows] = useState<CoachingRow[] | null>(null);
  const [people, setPeople] = useState<Record<string, { name: string; photo: string | null }>>({});
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [coaches, setCoaches] = useState<{ id: string; name: string }[]>([]);
  const [filter, setFilter] = useState<Filter>('active');
  const [q, setQ] = useState('');
  const [coachFilter, setCoachFilter] = useState('');
  const [assign, setAssign] = useState({ member: '', coach: '', months: '' });
  const [busy, setBusy] = useState(false);
  const fit = useFitRows(10);

  const load = useCallback(async () => {
    await coachingSweep();
    const [s, list, ms, ts] = await Promise.all([getCoachingSettings(), listCoachings(), listMembers().catch(() => []), listTrainers().catch(() => [])]);
    setSettings(s);
    setRows(list);
    const m = ms.map((x) => ({ id: x.profile.id, name: `${x.profile.first_name} ${x.profile.last_name}`, photo: x.profile.photo_url ?? null }));
    const t = ts.map((x) => ({ id: x.profile.id, name: `${x.profile.first_name} ${x.profile.last_name}`, photo: x.profile.photo_url ?? null }));
    setMembers(m);
    setCoaches(t);
    setPeople(Object.fromEntries([...m, ...t].map((p) => [p.id, { name: p.name, photo: p.photo }])));
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await fn(); showToast(done, 'success'); await load(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'That could not be saved', 'error'); }
    finally { setBusy(false); }
  };

  const name = (id: string) => people[id]?.name ?? 'Someone';
  const soon = addDays(todayKey(), 14);
  const isEnding = (r: CoachingRow) => r.status === 'active' && !!r.ends_on && r.ends_on <= soon;
  const counts = {
    active: (rows ?? []).filter((r) => r.status === 'active').length,
    waiting: (rows ?? []).filter((r) => OPEN.includes(r.status)).length,
    ending: (rows ?? []).filter(isEnding).length,
    ended: (rows ?? []).filter((r) => CLOSED.includes(r.status)).length,
  };
  const toConfirm = (rows ?? []).filter((r) => r.fee_mode === 'gym_priced' && (r.status === 'payment_sent' || r.status === 'awaiting_payment'));
  const term = q.trim().toLowerCase();
  const shown = (rows ?? []).filter((r) => (filter === 'active' ? r.status === 'active' : filter === 'waiting' ? OPEN.includes(r.status)
      : filter === 'ending' ? isEnding(r) : CLOSED.includes(r.status))
      && (!coachFilter || r.trainer_id === coachFilter)
      && (!term || `${name(r.member_id)} ${name(r.trainer_id)}`.toLowerCase().includes(term)))
    .sort((a, b) => (a.ends_on ?? '9999').localeCompare(b.ends_on ?? '9999'));
  const paged = usePaged(shown, fit.perPage);
  const load_ = useMemo(() => coaches.map((c) => ({ ...c, n: (rows ?? []).filter((r) => r.trainer_id === c.id && r.status === 'active').length }))
    .filter((c) => c.n > 0).sort((a, b) => b.n - a.n), [coaches, rows]);

  if (settings === undefined) return <p className="text-sm" style={{ color: SECOND }}>Loading…</p>;
  if (settings === null) {
    return (
      <div className="rd-fit">
        <RdHeader title="Coaching" />
        <RdCard><EmptyBlock icon={Handshake} title="Coaching terms are not set up yet" body="This needs the 0181 update to the database." /></RdCard>
      </div>
    );
  }

  const rail = (
    <>
      {toConfirm.length > 0 && (
        <RailCard icon={Wallet} tone="amber" title="Payments to confirm" sub="Members paid the gym for coaching. Confirm, and the term starts." data-coaching-confirm>
          {toConfirm.map((r) => (
            <div key={r.id} className="rounded-xl p-3" style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.015)' }}>
              <p className="text-[14px] font-semibold text-white truncate">{name(r.member_id)} with {name(r.trainer_id)}</p>
              <p className="text-[12.5px] mt-0.5" style={{ color: SECOND }}>
                {r.months} month{r.months === 1 ? '' : 's'} — {r.price != null ? peso(r.price) : 'no price'} — {r.pay_reference ? `ref ${r.pay_reference}` : 'not paid online yet'}
              </p>
              <div className="flex gap-1.5 mt-2.5">
                <RdButton size="sm" variant="primary" disabled={busy} className="flex-1"
                  onClick={() => void run(() => confirmCoachingPayment(r.id, true, r.pay_reference ? 'online' : 'cash'), 'Confirmed — the coaching has started')}>
                  {r.pay_reference ? 'Confirm' : 'Paid in cash'}
                </RdButton>
                {r.pay_reference && (
                  <RdButton size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => confirmCoachingPayment(r.id, false, null), 'They have been asked to check it')}>Not found</RdButton>
                )}
              </div>
            </div>
          ))}
        </RailCard>
      )}

      {settings.modes.includes('desk_assigns') && (
        <RailCard icon={UserPlus} title="Assign a coach" sub="The desk pairs a member with a coach for a length." data-coaching-assign>
          <RdSelect label="Member" value={assign.member} onChange={(v) => setAssign({ ...assign, member: v })} className="w-full">
            <option value="">Member</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </RdSelect>
          <RdSelect label="Coach" value={assign.coach} onChange={(v) => setAssign({ ...assign, coach: v })} className="w-full">
            <option value="">Coach</option>{coaches.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </RdSelect>
          <RdSelect label="Length" value={assign.months} onChange={(v) => setAssign({ ...assign, months: v })} className="w-full">
            <option value="">Length</option>{settings.lengths.map((m) => <option key={m} value={m}>{m} month{m === 1 ? '' : 's'}</option>)}
          </RdSelect>
          <RdButton variant="primary" icon={Handshake} disabled={busy || !assign.member || !assign.coach || !assign.months}
            onClick={() => void run(async () => { await assignCoaching(assign.member, assign.coach, Number(assign.months)); setAssign({ member: '', coach: '', months: '' }); }, 'Coach assigned')}>
            Assign
          </RdButton>
        </RailCard>
      )}

      <RailCard icon={Users} title="Each coach's load" sub="Members in an active term with them.">
        {load_.length === 0 ? <p className="text-[13.5px]" style={{ color: MUTED }}>No active coaching yet.</p> : load_.slice(0, 6).map((c) => (
          <button key={c.id} type="button" onClick={() => { setCoachFilter(coachFilter === c.id ? '' : c.id); setFilter('active'); }}
            className="h-12 px-3 rounded-xl flex items-center gap-3 text-[14.5px] text-white transition-colors hover:bg-white/[0.04]"
            style={{ border: `1px solid ${coachFilter === c.id ? TONE.violet.line : 'rgba(255,255,255,0.07)'}`, background: coachFilter === c.id ? TONE.violet.bg : 'rgba(255,255,255,0.015)' }}>
            <Initials name={c.name} photo={people[c.id]?.photo} size={30} />
            <span className="flex-1 text-left truncate">{c.name}</span>
            <b className="tabular-nums">{c.n}</b>
          </button>
        ))}
      </RailCard>
    </>
  );

  return (
    <div className="rd-fit" data-coaching>
      <RdHeader title="Coaching" subtitle={settings.feeMode === 'trainer_direct'
        ? 'Members pay their coach directly — you see who has a coach and until when.'
        : settings.feeMode === 'gym_priced' ? 'Members pay the gym for coaching; confirm payments here.' : 'Coaching is included in your plans.'}
        actions={<RdButton icon={Settings2} onClick={() => navigate('/settings?tab=coaching')}>How coaching works here</RdButton>} />

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        <StatTile compact icon={Handshake} label="Active" value={counts.active} sub="members with a coach" active={filter === 'active'} onClick={() => setFilter('active')} />
        <StatTile compact icon={Clock} tone={counts.waiting ? 'amber' : 'violet'} label="Waiting" value={counts.waiting} sub="asked, offered or paying" active={filter === 'waiting'} onClick={() => setFilter('waiting')} />
        <StatTile compact icon={CalendarClock} tone={counts.ending ? 'amber' : 'violet'} label="Ending in 14 days" value={counts.ending} sub="time to talk renewal" active={filter === 'ending'} onClick={() => setFilter('ending')} />
        <StatTile compact icon={Wallet} tone={toConfirm.length ? 'amber' : 'violet'} label="To confirm" value={toConfirm.length} sub={settings.feeMode === 'gym_priced' ? 'coaching payments to the gym' : 'not used here'} />
      </div>

      <FitBody rail={rail}>
        <RdCard className="overflow-hidden rd-fit-fill" data-coaching-list>
          <div className="flex items-center gap-2.5 flex-wrap px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <FilterChips<Filter> compact value={filter} onChange={setFilter} items={[
              { key: 'active', label: 'Active', count: counts.active },
              { key: 'waiting', label: 'Waiting', count: counts.waiting },
              { key: 'ending', label: 'Ending soon', count: counts.ending },
              { key: 'ended', label: 'Ended', count: counts.ended },
            ]} />
            <div className="flex-1 min-w-[200px]"><SearchField value={q} onChange={setQ} placeholder="Search by name" /></div>
            {coachFilter && <RdButton size="sm" variant="soft" onClick={() => setCoachFilter('')}>Only {name(coachFilter)} ✕</RdButton>}
          </div>
          {rows === null ? <p className="text-[14px] p-5" style={{ color: TONE.amber.fg }}>Coachings could not be loaded.</p> : (
            <RdTable boxRef={fit.ref} head={['Member and coach', 'Kind', 'Status', 'Until', { label: '', align: 'right' }]}
              empty={shown.length === 0 ? <EmptyBlock compact icon={Handshake} title="Nothing here" body={filter === 'ending' ? 'No active term ends in the next 14 days.' : 'Coachings show here as they start.'} /> : undefined}>
              {paged.visible.map((r) => (
                <Tr key={r.id} style={{ height: shown.length > paged.perPage ? fit.rowHeight : undefined }} data-coaching-row>
                  <Td>
                    <span className="flex items-center gap-3 min-w-0">
                      <Initials name={name(r.member_id)} photo={people[r.member_id]?.photo} size={36} />
                      <span className="min-w-0">
                        <span className="block font-semibold text-white truncate">{name(r.member_id)} <span className="font-normal" style={{ color: MUTED }}>with</span> {name(r.trainer_id)}</span>
                        <span className="block text-[12px]" style={{ color: MUTED }}>
                          {r.started_by === 'desk' ? 'Assigned by the gym' : r.started_by === 'coach' ? 'The coach offered' : 'The member asked'}
                        </span>
                      </span>
                    </span>
                  </Td>
                  <Td style={{ color: SECOND }}>{r.kind === 'group' ? 'Group' : '1-on-1'} — {r.months} mo</Td>
                  <Td><Pill tone={STATUS_TONE[r.status]} solidDot>{STATUS_WORDS[r.status]}</Pill></Td>
                  <Td style={{ color: isEnding(r) ? TONE.amber.fg : SECOND }}>{r.status === 'active' ? `until ${fmt(r.ends_on)}` : fmt(r.ends_on)}</Td>
                  <Td align="right">
                    {(r.status === 'active' || OPEN.includes(r.status)) && (
                      <RdButton size="sm" variant="ghost" icon={CircleStop} disabled={busy} onClick={() => void run(() => endCoaching(r.id, 'Ended by the gym'), 'Ended')}>End</RdButton>
                    )}
                  </Td>
                </Tr>
              ))}
            </RdTable>
          )}
          <TableFooter page={paged.page} perPage={paged.perPage} total={paged.total} noun="coachings" onPage={paged.setPage} />
        </RdCard>
      </FitBody>
    </div>
  );
}
