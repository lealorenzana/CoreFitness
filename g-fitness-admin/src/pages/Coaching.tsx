import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Handshake, Wallet, UserPlus, Settings2, Search, Check, BarChart3, X, CircleStop, Maximize2 } from 'lucide-react';
import FloatingWindow from '../components/ui/FloatingWindow';
import { useFitRows } from '../hooks/useFitRows';
import { usePaged } from '../hooks/usePaged';
import { showToast } from '../utils/toast';
import { todayKey, addDays, daysBetween } from '../utils/dates';
import { supabase } from '../lib/supabaseClient';
import { listMembers } from '../lib/api/members';
import { listTrainers } from '../lib/api/trainers';
import {
  assignCoaching, coachingSweep, confirmCoachingPayment, endCoaching, getCoachingSettings, listCoachings, STATUS_WORDS,
  type CoachingRow, type CoachingSettings,
} from '../lib/api/coaching';
import { Av, Pager } from './attendance/parts';
import './attendance/att.css';

type Filter = 'all' | 'active' | 'waiting' | 'ending' | 'ended';
const OPEN = ['invited', 'requested', 'awaiting_payment', 'payment_sent'];
const CLOSED = ['ended', 'declined', 'cancelled'];
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const fmt = (ymd: string | null) => (ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—');
const PILL: Record<CoachingRow['status'], string> = {
  active: 'v', invited: 'b', requested: 'b', awaiting_payment: 'a', payment_sent: 'a', ended: '', declined: '', cancelled: '',
};

/**
 * Coaching (0181), the gym's side — built to the owner's mock-up (2026-10-20) in
 * the attendance stylesheet: who trains with which coach and how far through
 * the term they are, what waits (payments to confirm, members who asked),
 * assigning a coach with the least-loaded coaches first, and each coach's load.
 * Under "paid to the coach" the gym sees the coaching and its dates, never the money.
 *
 * Progress is the term's days, not sessions: a coaching records its length,
 * not a number of sessions, so "8 of 12 sessions" would be invented.
 */
/** `embedded`: Personal training's Packages tab (simplify, 2026-10-28) — its title is the page's. */
export default function Coaching({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<CoachingSettings | null | undefined>(undefined);
  const [rows, setRows] = useState<CoachingRow[] | null>(null);
  const [people, setPeople] = useState<Record<string, { name: string; photo: string | null }>>({});
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [coaches, setCoaches] = useState<{ id: string; name: string; specialty: string }[]>([]);
  const [filter, setFilter] = useState<Filter>('active');
  const [q, setQ] = useState('');
  const [coachFilter, setCoachFilter] = useState('');
  const [assign, setAssign] = useState({ member: '', coach: '', months: 0 });
  const [memberQ, setMemberQ] = useState('');
  /** Finding a coach by name or specialty (the owner's ask, 2026-10-20) — every coach, not only the most free. */
  const [coachQ, setCoachQ] = useState('');
  const [busy, setBusy] = useState(false);
  /** A whole list in a floating window (the owner's rule, 2026-10-20): long lists never grow the page. */
  const [win, setWin] = useState<null | 'all' | 'pay' | 'load'>(null);
  /** PT sessions this month and last (trainer_month_summary, 0095). Null when it cannot be read. */
  const [sessions, setSessions] = useState<{ now: number; before: number } | null>(null);
  const { ref: fitRef, perPage, rowHeight } = useFitRows(10);

  const load = useCallback(async () => {
    await coachingSweep();
    const month = todayKey().slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    const [s, list, ms, ts, now, before] = await Promise.all([
      getCoachingSettings(), listCoachings(), listMembers().catch(() => []), listTrainers().catch(() => []),
      supabase.rpc('trainer_month_summary', { p_month: `${month}-01` }), supabase.rpc('trainer_month_summary', { p_month: `${prev}-01` }),
    ]);
    setSettings(s);
    setRows(list);
    const mm = ms.map((x) => ({ id: x.profile.id, name: `${x.profile.first_name} ${x.profile.last_name}`, photo: x.profile.photo_url ?? null }));
    const tt = ts.map((x) => ({ id: x.profile.id, name: `${x.profile.first_name} ${x.profile.last_name}`, photo: x.profile.photo_url ?? null, specialty: x.trainer.specialization ?? '' }));
    setMembers(mm);
    setCoaches(tt);
    setPeople(Object.fromEntries([...mm, ...tt].map((p) => [p.id, { name: p.name, photo: p.photo }])));
    const sum = (r: { data: unknown; error: unknown }) => (r.error ? null : ((r.data ?? []) as { pt_sessions: number }[]).reduce((a, x) => a + Number(x.pt_sessions || 0), 0));
    const a = sum(now), b = sum(before);
    setSessions(a == null || b == null ? null : { now: a, before: b });
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await fn(); showToast(done, 'success'); await load(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'That could not be saved', 'error'); }
    finally { setBusy(false); }
  };

  const name = (id: string) => people[id]?.name ?? 'Someone';
  const today = todayKey();
  const soon = addDays(today, 14);
  const isEnding = (r: CoachingRow) => r.status === 'active' && !!r.ends_on && r.ends_on <= soon;
  const list = rows ?? [];
  const counts = {
    all: list.length,
    active: list.filter((r) => r.status === 'active').length,
    waiting: list.filter((r) => OPEN.includes(r.status)).length,
    ending: list.filter(isEnding).length,
    ended: list.filter((r) => CLOSED.includes(r.status)).length,
  };
  const toConfirm = list.filter((r) => r.fee_mode === 'gym_priced' && (r.status === 'payment_sent' || r.status === 'awaiting_payment'));
  const term = q.trim().toLowerCase();
  const shown = list.filter((r) => (filter === 'all' ? true : filter === 'active' ? r.status === 'active' : filter === 'waiting' ? OPEN.includes(r.status)
      : filter === 'ending' ? isEnding(r) : CLOSED.includes(r.status))
      && (!coachFilter || r.trainer_id === coachFilter)
      && (!term || `${name(r.member_id)} ${name(r.trainer_id)}`.toLowerCase().includes(term)))
    .sort((a, b) => (a.ends_on ?? '9999').localeCompare(b.ends_on ?? '9999'));
  const paged = usePaged(shown, perPage);
  /** Active trainees per coach — the load chart, and the assign list's order (fewest first). */
  const loadBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) if (r.status === 'active') m.set(r.trainer_id, (m.get(r.trainer_id) ?? 0) + 1);
    return m;
  }, [rows]);
  const maxLoad = Math.max(1, ...loadBy.values());
  const byBusy = [...coaches].sort((a, b) => (loadBy.get(b.id) ?? 0) - (loadBy.get(a.id) ?? 0));
  const byLoad = [...coaches].sort((a, b) => (loadBy.get(a.id) ?? 0) - (loadBy.get(b.id) ?? 0));
  const coachTerm = coachQ.trim().toLowerCase();
  const coachList = (() => {
    const hits = coachTerm ? byLoad.filter((c) => `${c.name} ${c.specialty}`.toLowerCase().includes(coachTerm)) : byLoad;
    let shown = hits.slice(0, 4);
    const chosen = byLoad.find((c) => c.id === assign.coach);
    if (chosen && !shown.includes(chosen)) shown = [...shown.slice(0, 3), chosen];
    return { shown, more: Math.max(0, hits.length - shown.length) };
  })();
  const waitingFirst = list.find((r) => OPEN.includes(r.status));
  const endingFirst = list.filter(isEnding).sort((a, b) => (a.ends_on ?? '').localeCompare(b.ends_on ?? ''))[0];
  const months = settings?.lengths ?? [1, 3, 6];
  const assignMonths = assign.months || months[Math.min(1, months.length - 1)] || 1;
  const memberHits = memberQ.trim().length >= 1 ? members.filter((m) => m.name.toLowerCase().includes(memberQ.trim().toLowerCase())).slice(0, 5) : [];
  const short = (n: string) => n.split(' ')[0];

  if (settings === undefined) return <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>;
  if (settings === null) {
    return (
      <div className="att">
        <div className="a-head"><div><h1>Coaching</h1></div></div>
        <div className="a-card" style={{ alignItems: 'center', padding: 30, textAlign: 'center' }}>
          <Handshake size={34} style={{ color: 'var(--a-p300)' }} /><b style={{ marginTop: 8 }}>Coaching terms are not set up yet</b>
          <p className="a-sub">This needs the 0181 update to the database.</p>
        </div>
      </div>
    );
  }

  /** One pairing's row — the table and the View all window draw the same one. */
  const rowOf = (r: CoachingRow, fit: boolean) => {
                    const total = r.starts_on && r.ends_on ? Math.max(1, daysBetween(r.starts_on, r.ends_on)) : null;
                    const done = total && r.starts_on ? Math.min(total, Math.max(0, daysBetween(r.starts_on, today))) : null;
                    const left = r.ends_on ? daysBetween(today, r.ends_on) : null;
                    return (
                      <tr key={r.id} style={{ height: fit ? rowHeight : undefined }} {...(fit ? { 'data-coaching-row': true } : { 'data-window-row': true })}>
                        <td>
                          <div className="a-who"><Av name={name(r.member_id)} photo={people[r.member_id]?.photo} />
                            <div className="min-w-0">
                              <div className="truncate"><b>{name(r.member_id)}</b> <span className="a-sub">with</span> <b>{name(r.trainer_id)}</b></div>
                              {r.status === 'active' && total && done != null ? (
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }} data-tip="How far through the term they are">
                                  <div className="a-bar" style={{ maxWidth: 120 }}><i style={{ width: `${(done / total) * 100}%` }} /></div>
                                  <span className="a-sub">day {done} of {total}</span>
                                </div>
                              ) : <div className="a-sub" style={{ marginTop: 3 }}>{r.started_by === 'desk' ? 'Assigned by the gym' : r.started_by === 'coach' ? 'The coach offered' : 'The member asked'}</div>}
                            </div></div>
                        </td>
                        <td className="whitespace-nowrap"><span data-tip={`${r.months} month${r.months === 1 ? '' : 's'}`}>{r.months} mo</span></td>
                        <td><span className={`a-pill ${isEnding(r) ? 'a' : PILL[r.status] === 'b' ? '' : PILL[r.status]}`} style={PILL[r.status] === 'b' ? { background: '#13233d', color: '#93c5fd' } : undefined}>
                          {isEnding(r) ? 'Ending soon' : STATUS_WORDS[r.status]}</span></td>
                        <td className="whitespace-nowrap"><b>{fmt(r.ends_on)}</b> <span className={`a-sub ${isEnding(r) ? 'a-dn' : ''}`}>
                          {r.status === 'active' && left != null ? (left > 0 ? `${left} day${left === 1 ? '' : 's'}` : left === 0 ? 'today' : `${-left} day${left === -1 ? '' : 's'} over`) : CLOSED.includes(r.status) ? 'ended' : ''}</span></td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{action(r)}</td>
                      </tr>
                    );
  };

  /** A payment waiting to be confirmed. */
  const payOf = (r: CoachingRow) => (
                <div key={r.id} className="a-row" style={{ flexWrap: 'wrap' }}>
                  <div className="t" style={{ flexBasis: '100%' }}><b>{name(r.member_id)} with {name(r.trainer_id)}</b>
                    <small>{r.months} month{r.months === 1 ? '' : 's'} · {r.price != null ? peso(r.price) : 'no price'} · {r.pay_reference ? `ref ${r.pay_reference}` : 'not paid online yet'}</small></div>
                  <button type="button" className="a-btn violet sm" disabled={busy}
                    onClick={() => void run(() => confirmCoachingPayment(r.id, true, r.pay_reference ? 'online' : 'cash'), 'Confirmed — the coaching has started')}>
                    {r.pay_reference ? 'Confirm' : 'Paid in cash'}</button>
                  {r.pay_reference && <button type="button" className="a-btn ghost sm" disabled={busy} onClick={() => void run(() => confirmCoachingPayment(r.id, false, null), 'They have been asked to check it')}>Not found</button>}
                </div>
  );

  /** A coach's load bar; clicking shows only their pairings. */
  const loadOf = (c: { id: string; name: string }) => (
              <button key={c.id} type="button" className="a-row w-full text-left" onClick={() => { setCoachFilter(coachFilter === c.id ? '' : c.id); setFilter('active'); setWin(null); }}
                style={coachFilter === c.id ? { background: '#7c3aed14', borderRadius: 10 } : undefined} data-tip="Show only their pairings">
                <Av name={c.name} photo={people[c.id]?.photo} small />
                <div className="t"><b>{c.name}</b>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}><div className="a-bar"><i style={{ width: `${((loadBy.get(c.id) ?? 0) / maxLoad) * 100}%` }} /></div>
                    <span className="a-sub">{loadBy.get(c.id) ?? 0}</span></div></div>
              </button>
  );

  /** The one next step each pairing needs. */
  const action = (r: CoachingRow) => {
    if (isEnding(r)) return <button type="button" className="a-btn soft sm" onClick={() => navigate(`/members?open=${r.member_id}`)} data-tip="Open the member to talk renewal">Talk renewal</button>;
    if (CLOSED.includes(r.status) && settings.modes.includes('desk_assigns')) {
      return <button type="button" className="a-btn ghost sm" onClick={() => { setAssign({ member: r.member_id, coach: r.trainer_id, months: r.months }); setMemberQ(''); }} data-tip="Pair them again in Assign a coach">Renew</button>;
    }
    if (r.status === 'active' || OPEN.includes(r.status)) {
      return <button type="button" className="a-btn ghost sm" disabled={busy} onClick={() => void run(() => endCoaching(r.id, 'Ended by the gym'), 'Ended')}><CircleStop size={12} />End</button>;
    }
    return null;
  };

  return (
    <div className="att" data-coaching>
      <div className="a-head">
        <div className="min-w-0">
          {!embedded && <h1>Coaching</h1>}
          <p>{settings.feeMode === 'trainer_direct' ? 'Members pay their coach directly — you see who has a coach and until when'
            : settings.feeMode === 'gym_priced' ? 'Members pay the gym for coaching — confirm payments here'
              : 'Coaching is included in your plans'}{settings.modes.includes('desk_assigns') ? ' · the desk pairs a member with a coach for a length' : ''}</p>
        </div>
        <nav className="a-tabs" aria-label="Coaching views">
          <a href="#" className="on" onClick={(e) => e.preventDefault()}><Handshake size={14} />Pairings<em>{counts.active}</em></a>
          <a href="#" onClick={(e) => { e.preventDefault(); navigate('/settings?tab=coaching'); }}><Settings2 size={14} />How it works here</a>
        </nav>
      </div>

      <div className="a-grid flex-none" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }} data-coaching-cards>
        <button type="button" className={`a-card press text-left ${filter === 'active' ? 'on' : ''}`} onClick={() => setFilter('active')}>
          <div className="a-lbl">Active pairings</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><div className="a-num">{counts.active}</div><span className="a-sub">members with a coach</span></div>
        </button>
        <button type="button" className={`a-card press text-left ${filter === 'waiting' ? 'on' : ''}`} style={counts.waiting ? { borderColor: '#1e3a5f' } : undefined} onClick={() => setFilter('waiting')}>
          <div className="a-lbl" style={counts.waiting ? { color: '#93c5fd' } : undefined}>Waiting</div>
          <div className="a-num">{counts.waiting}</div>
          <div className="a-sub" style={{ marginTop: 6 }}>{waitingFirst ? `${short(name(waitingFirst.member_id))} — ${STATUS_WORDS[waitingFirst.status].toLowerCase()}` : 'asked, offered or paying'}</div>
        </button>
        <button type="button" className={`a-card press text-left ${filter === 'ending' ? 'on' : ''}`} style={counts.ending ? { borderColor: '#3e310f' } : undefined} onClick={() => setFilter('ending')}>
          <div className="a-lbl" style={counts.ending ? { color: 'var(--a-a300)' } : undefined}>Ending in 14 days</div>
          <div className="a-num">{counts.ending}</div>
          <div className="a-sub" style={{ marginTop: 6 }}>{endingFirst ? `${short(name(endingFirst.member_id))} — time to talk renewal` : 'none this fortnight'}</div>
        </button>
        <div className="a-card">
          <div className="a-lbl">1-on-1 sessions this month</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><div className="a-num">{sessions ? sessions.now : '—'}</div>
            {sessions && (sessions.now > 0 || sessions.before > 0) && <span className="a-sub"><span className={sessions.now >= sessions.before ? 'a-up' : 'a-dn'}>{sessions.now >= sessions.before ? '▲' : '▼'} {Math.abs(sessions.now - sessions.before)}</span> vs last month</span>}</div>
          {toConfirm.length > 0 && <div className="a-sub" style={{ marginTop: 6, color: 'var(--a-a300)' }}>{toConfirm.length} payment{toConfirm.length === 1 ? '' : 's'} to confirm</div>}
        </div>
      </div>

      <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 330px', flex: 1 }}>
        <div className="a-card" data-coaching-list>
          <div className="a-ct">
            <div className="flex gap-1.5">
              {(['all', 'active', 'waiting', 'ending', 'ended'] as Filter[]).map((k) => (
                <button key={k} type="button" className={`a-chip ${filter === k ? 'v' : ''}`} onClick={() => setFilter(k)} data-chip={k}>
                  {k === 'all' ? 'All' : k === 'active' ? 'Active' : k === 'waiting' ? 'Waiting' : k === 'ending' ? 'Ending soon' : 'Ended'} <em>{counts[k]}</em>
                </button>
              ))}
            </div>
            <div className="flex gap-1.5 items-center">
              <label className="a-input sm" style={{ width: 'clamp(130px, 14vw, 190px)' }}><Search size={14} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Member or coach…" aria-label="Search by name" /></label>
              <select className={`a-chip ${coachFilter ? 'on' : ''}`} value={coachFilter} onChange={(e) => setCoachFilter(e.target.value)} aria-label="Filter by coach" style={{ maxWidth: 140 }}>
                <option value="">All coaches</option>{coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          {rows === null ? <p className="a-sub" style={{ color: 'var(--a-a300)', padding: 16 }}>Coachings could not be loaded.</p> : (
            <div ref={fitRef} className="a-scroll" style={{ flex: 1 }}>
              <table className="a-table">
                <thead><tr><th>Member and coach</th><th>Package</th><th>Status</th><th>Until</th><th /></tr></thead>
                <tbody>
                  {paged.visible.map((r) => rowOf(r, shown.length > paged.perPage))}
                </tbody>
              </table>
              {shown.length === 0 && <p className="a-sub text-center" style={{ padding: 26 }}>{filter === 'ending' ? 'No active term ends in the next 14 days.' : 'Nothing here — coachings show as they start.'}</p>}
            </div>
          )}
          {shown.length > 0 && (
            <div className="a-sub" style={{ paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} data-rd-footer>
              <span>{(paged.page - 1) * paged.perPage + 1}–{Math.min(paged.total, paged.page * paged.perPage)} of {paged.total} coachings
                {shown.length > paged.perPage && <> · <button type="button" className="a-link" style={{ color: 'var(--a-p300)' }} onClick={() => setWin('all')} data-view-all><Maximize2 size={11} className="inline" /> View all</button></>}</span>
              <Pager page={paged.page} pages={paged.totalPages} onPage={paged.setPage} />
            </div>
          )}
        </div>

        <div className="a-scroll coaching-side" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {toConfirm.length > 0 && (
            <div className="a-card" style={{ borderColor: '#3e310f' }} data-coaching-confirm>
              <div className="a-ct"><h3><Wallet size={16} style={{ color: 'var(--a-a300)' }} />Payments to confirm</h3></div>
              <div className="a-sub" style={{ marginBottom: 6 }}>Members paid the gym for coaching. Confirm, and the term starts.</div>
              {toConfirm.slice(0, 2).map(payOf)}
              {toConfirm.length > 2 && <button type="button" className="a-link" style={{ color: 'var(--a-a300)', marginTop: 6 }} onClick={() => setWin('pay')} data-see-all-pay>See all {toConfirm.length} payments</button>}
            </div>
          )}

          {settings.modes.includes('desk_assigns') ? (
            <div className="a-card glow" data-coaching-assign>
              <div className="a-ct"><h3><UserPlus size={16} />Assign a coach</h3></div>
              {assign.member ? (
                <div className="a-input" style={{ fontSize: 12.5 }}><Av name={name(assign.member)} small />{name(assign.member)}
                  <button type="button" className="a-link" style={{ marginLeft: 'auto' }} onClick={() => setAssign({ ...assign, member: '' })} aria-label="Change member"><X size={14} /></button></div>
              ) : (
                <div className="relative">
                  <label className="a-input" style={{ fontSize: 12.5 }}><Search size={14} />
                    <input value={memberQ} onChange={(e) => setMemberQ(e.target.value)} placeholder="Find the member…" aria-label="Member" /></label>
                  {memberHits.length > 0 && (
                    <div className="a-card" style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, top: 46, padding: '4px 10px' }}>
                      {memberHits.map((m) => (
                        <button key={m.id} type="button" className="a-row w-full text-left" onClick={() => { setAssign({ ...assign, member: m.id }); setMemberQ(''); }}>
                          <Av name={m.name} small /><div className="t"><b>{m.name}</b></div></button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="a-lbl" style={{ margin: '10px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Coach</span><span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>{coaches.length} coaches · fewest trainees first</span></div>
              <label className="a-input sm" style={{ fontSize: 12.5, marginBottom: 6 }}><Search size={13} />
                <input value={coachQ} onChange={(e) => setCoachQ(e.target.value)} placeholder="Find a coach or specialty…" aria-label="Find a coach" data-coach-search /></label>
              {/* No box inside the box: the four most free (or the matches), the chosen one always shown, the rest said in a line. */}
              <div className="flex flex-col gap-1.5">
                {coachList.shown.map((c) => (
                  <button key={c.id} type="button" className={`a-opt ${assign.coach === c.id ? 'on' : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: '9px 12px' }}
                    onClick={() => setAssign({ ...assign, coach: c.id })} data-assign-coach={c.id}>
                    <Av name={c.name} small />
                    <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 12.5 }} className="block truncate">{c.name}</b>
                      <div className="a-sub truncate">{loadBy.get(c.id) ?? 0} trainee{(loadBy.get(c.id) ?? 0) === 1 ? '' : 's'}{c.specialty ? ` · ${c.specialty}` : ''}</div></div>
                    {c.id === byLoad[0]?.id && assign.coach !== c.id && <span className="a-pill v">most free</span>}
                    {assign.coach === c.id && <span className="tick" style={{ position: 'static' }}><Check size={12} /></span>}
                  </button>
                ))}
                {coachList.shown.length === 0 && <p className="a-sub" style={{ padding: '6px 2px' }}>No coach matches “{coachQ.trim()}”.</p>}
                {coachList.more > 0 && <p className="a-sub" style={{ padding: '2px 2px 0' }}>+{coachList.more} more — type a name to find them</p>}
              </div>
              <div className="flex gap-1.5 flex-wrap" style={{ marginTop: 10 }}>
                {months.map((mo) => <button key={mo} type="button" className={`a-chip ${assignMonths === mo ? 'on' : ''}`} onClick={() => setAssign({ ...assign, months: mo })}>{mo} month{mo === 1 ? '' : 's'}</button>)}
              </div>
              <button type="button" className="a-btn amber" style={{ marginTop: 10 }} disabled={busy || !assign.member || !assign.coach} data-assign-go
                onClick={() => void run(async () => { await assignCoaching(assign.member, assign.coach, assignMonths); setAssign({ member: '', coach: '', months: 0 }); }, 'Coach assigned')}>
                <Check size={15} />{assign.member && assign.coach ? `Pair ${short(name(assign.member))} with ${short(name(assign.coach))} · ${assignMonths} month${assignMonths === 1 ? '' : 's'}` : 'Pick a member and a coach'}
              </button>
            </div>
          ) : (
            <div className="a-card">
              <div className="a-ct"><h3><UserPlus size={16} />Assigning a coach</h3></div>
              <p className="a-sub">The desk does not assign coaches at this gym — members {settings.modes.includes('pick_pt') ? 'pick their own coach' : 'start coaching from the app'}.{' '}
                <button type="button" className="a-link" style={{ color: 'var(--a-p300)' }} onClick={() => navigate('/settings?tab=coaching')}>Change in Settings</button></p>
            </div>
          )}

          <div className="a-card">
            <div className="a-ct"><h3><BarChart3 size={16} />Coach load</h3><small>active trainees</small></div>
            <div data-coach-load>
            {coaches.length === 0 ? <p className="a-sub">No coaches yet.</p> : byBusy.slice(0, 4).map(loadOf)}
            {coaches.length > 4 && <button type="button" className="a-link" style={{ color: 'var(--a-p300)', marginTop: 6 }} onClick={() => setWin('load')} data-see-all-load>See all {coaches.length} coaches</button>}
            </div>
          </div>
        </div>
      </div>

      <FloatingWindow open={win === 'all'} onClose={() => setWin(null)} title="Coachings" icon={Handshake} count={shown.length} data-coaching-window
        tools={<span className="a-sub">{filter === 'all' ? 'All' : filter === 'ending' ? 'Ending soon' : filter[0].toUpperCase() + filter.slice(1)}{coachFilter ? ` · ${name(coachFilter)}` : ''}{term ? ` · “${q.trim()}”` : ''}</span>}>
        <div className="att" style={{ height: 'auto', overflow: 'visible', padding: '6px 18px' }}>
          <table className="a-table"><thead><tr><th>Member and coach</th><th>Package</th><th>Status</th><th>Until</th><th /></tr></thead>
            <tbody>{shown.map((r) => rowOf(r, false))}</tbody></table>
        </div>
      </FloatingWindow>
      <FloatingWindow open={win === 'pay'} onClose={() => setWin(null)} title="Payments to confirm" icon={Wallet} count={toConfirm.length} data-pay-window>
        <div className="att" style={{ height: 'auto', overflow: 'visible', padding: '6px 18px' }}>{toConfirm.map(payOf)}</div>
      </FloatingWindow>
      <FloatingWindow open={win === 'load'} onClose={() => setWin(null)} title="Coach load" icon={BarChart3} count={coaches.length} data-load-window>
        <div className="att" style={{ height: 'auto', overflow: 'visible', padding: '6px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', columnGap: 18 }}>{byBusy.map(loadOf)}</div>
      </FloatingWindow>
    </div>
  );
}
