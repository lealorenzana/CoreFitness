import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Receipt, Tag, Wallet, ShoppingBag, Hourglass, Download, CalendarRange, Search } from 'lucide-react';
import Popover from '../components/ui/Popover';
import DatePicker from '../components/ui/DatePicker';
import { Pager } from './attendance/parts';
import './attendance/att.css';
import { moduleOn, useGymModules } from '../hooks/useGymModules';
import { usePaged } from '../hooks/usePaged';
import { useFitRows } from '../hooks/useFitRows';
import { salesBetween, type Sale } from '../lib/api/shop';
import { listMemberships } from '../lib/api/memberships';
import { listPlans } from '../lib/api/membershipPlans';
import { supabase } from '../lib/supabaseClient';
import { todayKey, addDays, localDateKey } from '../utils/dates';
import { exportToCSV } from '../utils/exportUtils';
import type { MembershipPlanRow } from '../types/db';

type Kind = 'membership' | 'shop' | 'pass';
/** One line of money in, whatever it was for — a payment, a counter sale, or a day pass. */
interface Money { id: string; kind: Kind; day: string; at: string; who: string; what: string; how: string; amount: number; receipt: string | null }
interface PaymentLite { id: string; amount: number; status: 'completed' | 'pending' | 'failed'; paid_on: string; created_at: string; method: string; invoice_number: string;
  plan_name: string | null; plan_id: string | null; notes: string | null; member_profiles: { profiles: { first_name: string; last_name: string } | null } | null }
interface PassLite { id: string; visit_day: string; visited_at: string; kind: string; amount: number; method: string; guests: { name: string } | null }

const COLOR: Record<Kind, string> = { membership: '#7c3aed', shop: '#5eead4', pass: '#f59e0b' };
const KIND_WORD: Record<Kind, string> = { membership: 'Memberships', shop: 'Shop', pass: 'Day passes' };
const PASS_WORD: Record<string, string> = { day: 'Day pass', pack5: '5-visit pack', pack10: '10-visit pack' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const peso = (n: number) => `₱${Math.round(n).toLocaleString()}`;
const howWord = (m: string) => (m === 'gcash' ? 'GCash' : m === 'maya' ? 'Maya' : m ? m[0].toUpperCase() + m.slice(1) : '—');
const dayWord = (d: string, year = false) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) });
const monthEnd = (y: number, m: number) => { const d = new Date(y, m + 1, 0); return `${y}-${String(m + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * Revenue (2026-10-20, the approved mock-up): money in by the day it was paid
 * (`paid_on`, never `created_at`) — memberships, counter sales (0133, voids left
 * out) and day passes (0185) — for a period the owner picks, compared with the
 * same days before it. The month strip opens a month; the payments under it are
 * what the totals are made of. Pending online payments are counted apart, never
 * as money in.
 */
export default function Revenue() {
  const navigate = useNavigate();
  const modules = useGymModules();
  const shopOn = moduleOn(modules, 'shop');
  const [today] = useState(() => todayKey());
  const thisYear = Number(today.slice(0, 4));
  const thisMonth = Number(today.slice(5, 7)) - 1;

  const [preset, setPreset] = useState<'week' | 'month' | 'last' | 'year' | 'pick'>('month');
  const [pick, setPick] = useState<{ from: string; to: string }>({ from: `${today.slice(0, 8)}01`, to: today });
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [exportAt, setExportAt] = useState<HTMLElement | null>(null);
  const [year, setYear] = useState(thisYear);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'all' | Kind>('all');

  const range = useMemo(() => {
    if (preset === 'week') return { from: addDays(today, -6), to: today, name: 'the last 7 days' };
    if (preset === 'month') return { from: `${today.slice(0, 8)}01`, to: today, name: new Date(`${today}T00:00:00`).toLocaleDateString('en-PH', { month: 'long' }) };
    if (preset === 'last') {
      const y = thisMonth === 0 ? thisYear - 1 : thisYear; const m = (thisMonth + 11) % 12;
      return { from: `${y}-${String(m + 1).padStart(2, '0')}-01`, to: monthEnd(y, m), name: new Date(y, m, 1).toLocaleDateString('en-PH', { month: 'long' }) };
    }
    if (preset === 'year') return { from: `${thisYear}-01-01`, to: today, name: String(thisYear) };
    return { from: pick.from, to: pick.to, name: `${dayWord(pick.from)} – ${dayWord(pick.to)}` };
  }, [preset, pick, today, thisMonth, thisYear]);
  /** The same number of days just before — "vs the same days of last month" for a month to date. */
  const before = useMemo(() => {
    if (preset === 'month' || (preset === 'pick' && range.from.slice(8) === '01' && range.from.slice(0, 7) === range.to.slice(0, 7))) {
      const [y, m] = range.from.split('-').map(Number);
      const py = m === 1 ? y - 1 : y; const pm = m === 1 ? 11 : m - 2;
      const end = Math.min(Number(range.to.slice(8)), Number(monthEnd(py, pm).slice(8)));
      return { from: `${py}-${String(pm + 1).padStart(2, '0')}-01`, to: `${py}-${String(pm + 1).padStart(2, '0')}-${String(end).padStart(2, '0')}`, name: `the same days of ${new Date(py, pm, 1).toLocaleDateString('en-PH', { month: 'long' })}` };
    }
    const len = Math.round((new Date(`${range.to}T00:00:00`).getTime() - new Date(`${range.from}T00:00:00`).getTime()) / 86400000) + 1;
    return { from: addDays(range.from, -len), to: addDays(range.from, -1), name: `the ${len} days before` };
  }, [preset, range]);

  // Everything from the earliest day any view needs, to today.
  const since = [before.from, `${year}-01-01`, range.from].sort()[0];
  const [payments, setPayments] = useState<PaymentLite[] | null | 'failed'>(null);
  const [passes, setPasses] = useState<PassLite[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [plans, setPlans] = useState<MembershipPlanRow[]>([]);
  const [coming, setComing] = useState<{ n: number; due: number } | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const until = year === thisYear ? today : `${year}-12-31`;
      const end = [until, range.to].sort()[1];
      const [p, g, s] = await Promise.all([
        supabase.from('payments')
          .select('id, amount, status, paid_on, created_at, method, invoice_number, plan_name, plan_id, notes, member_profiles(profiles(first_name, last_name))')
          .gte('paid_on', since).lte('paid_on', end).order('paid_on', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('guest_visits').select('id, visit_day, visited_at, kind, amount, method, guests(name)')
          .gte('visit_day', since).lte('visit_day', end).is('voided_at', null).gt('amount', 0),
        shopOn ? salesBetween(since, end) : Promise.resolve([] as Sale[]),
      ]);
      if (!alive) return;
      setPayments(p.error ? 'failed' : ((p.data ?? []) as unknown as PaymentLite[]));
      setPasses(g.error ? [] : ((g.data ?? []) as unknown as PassLite[]));
      setSales(s.filter((x) => !x.voidedAt));
    })();
    return () => { alive = false; };
  }, [since, year, range.to, today, thisYear, shopOn]);
  useEffect(() => {
    void (async () => {
      const [ms, ps] = await Promise.all([listMemberships().catch(() => []), listPlans().catch(() => [])]);
      setPlans(ps);
      const price = new Map(ps.map((p) => [p.id, p.price]));
      const seen = new Set<string>();
      let n = 0; let due = 0;
      for (const m of ms) { // newest first: each member's current membership
        if (seen.has(m.member_id)) continue; seen.add(m.member_id);
        const exp = m.expiry_date?.slice(0, 10);
        if (m.status === 'active' && !m.never_expires && exp && exp >= today && exp <= addDays(today, 30) && (price.get(m.plan_id) ?? 0) > 0) { n++; due += price.get(m.plan_id) ?? 0; }
      }
      setComing({ n, due });
    })();
  }, [today]);

  const money: Money[] = useMemo(() => {
    const out: Money[] = [];
    if (Array.isArray(payments)) for (const p of payments) if (p.status === 'completed') {
      const who = p.member_profiles?.profiles;
      out.push({ id: `p-${p.id}`, kind: 'membership', day: p.paid_on, at: p.created_at, who: who ? `${who.first_name} ${who.last_name}` : '', what: p.plan_name ?? 'Membership',
        how: howWord(p.method), amount: Number(p.amount), receipt: p.invoice_number });
    }
    for (const s of sales) out.push({ id: `s-${s.id}`, kind: 'shop', day: s.saleDay, at: s.createdAt, who: s.memberName ?? 'Counter sale', what: `Shop · ${s.items.reduce((n, i) => n + i.qty, 0)} item${s.items.reduce((n, i) => n + i.qty, 0) === 1 ? '' : 's'}`, how: 'Cash', amount: s.total, receipt: null });
    for (const g of passes) out.push({ id: `g-${g.id}`, kind: 'pass', day: g.visit_day, at: g.visited_at, who: g.guests ? `Walk-in · ${g.guests.name}` : 'Walk-in', what: PASS_WORD[g.kind] ?? 'Day pass', how: howWord(g.method), amount: Number(g.amount), receipt: null });
    return out.sort((a, b) => (b.day + b.at).localeCompare(a.day + a.at));
  }, [payments, sales, passes]);

  const inRange = (r: { from: string; to: string }) => money.filter((m) => m.day >= r.from && m.day <= r.to);
  const now = inRange(range);
  const prev = inRange(before);
  const sum = (xs: Money[], k?: Kind) => xs.filter((x) => !k || x.kind === k).reduce((s, x) => s + x.amount, 0);
  const total = sum(now); const prevTotal = sum(prev);
  const change = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;
  const pending = Array.isArray(payments) ? payments.filter((p) => p.status === 'pending') : [];

  const byMonth = MONTHS.map((_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    const xs = money.filter((m) => m.day.startsWith(key));
    return { i, membership: sum(xs, 'membership'), shop: sum(xs, 'shop'), pass: sum(xs, 'pass'), all: sum(xs) };
  });
  const peak = Math.max(1, ...byMonth.map((b) => b.all));
  const openMonth = (i: number) => { setPick({ from: `${year}-${String(i + 1).padStart(2, '0')}-01`, to: [monthEnd(year, i), today].sort()[0] }); setPreset('pick'); };

  const byPlan = (() => {
    const m = new Map<string, number>();
    for (const x of now) if (x.kind === 'membership') m.set(x.what, (m.get(x.what) ?? 0) + x.amount);
    for (const p of plans) if (p.is_active && !m.has(p.name)) m.set(p.name, 0);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  })();
  const byHow = (() => {
    const m = new Map<string, number>();
    for (const x of now) m.set(x.how, (m.get(x.how) ?? 0) + x.amount);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  })();
  const best = (() => {
    const m = new Map<string, { qty: number; revenue: number }>();
    for (const s of sales) if (s.saleDay >= range.from && s.saleDay <= range.to) for (const i of s.items) {
      const r = m.get(i.name) ?? { qty: 0, revenue: 0 }; r.qty += i.qty; r.revenue += i.qty * i.unitPrice; m.set(i.name, r);
    }
    return [...m.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 3);
  })();

  const shown = now.filter((x) => (kind === 'all' || x.kind === kind)
    && (!search.trim() || `${x.who} ${x.what} ${x.receipt ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())));
  const { ref: fitRef, perPage } = useFitRows(6);
  const paged = usePaged(shown, perPage);

  const exportPeriod = () => exportToCSV(shown.map((x) => ({ 'Paid on': x.day, Member: x.who, For: x.what, How: x.how, Amount: x.amount, Receipt: x.receipt ?? '' })), `revenue-${range.from}-to-${range.to}`);
  const exportYear = () => exportToCSV(byMonth.map((b) => ({ Month: `${MONTHS[b.i]} ${year}`, Memberships: b.membership, Shop: b.shop, 'Day passes': b.pass, Total: b.all })), `revenue-${year}`);
  const kinds: Kind[] = ['membership', ...(shopOn ? ['shop' as Kind] : []), 'pass'];
  const colors = ['var(--a-p400)', '#5eead4', 'var(--a-amber)', '#52525b', '#f472b6'];
  const howTotal = byHow.reduce((s, [, v]) => s + v, 0);

  return (
    <div className="att" data-revenue>
      <div className="a-head">
        <div className="min-w-0"><h1>Revenue</h1><p>Money recorded at the desk and online — by when it was paid</p></div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }} role="group" aria-label="Period">
          {([['week', 'This week'], ['month', new Date(`${today}T00:00:00`).toLocaleDateString('en-PH', { month: 'long' })], ['last', 'Last month'], ['year', 'This year']] as const).map(([k, l]) => (
            <button key={k} type="button" className={`a-chip ${preset === k ? 'v' : ''}`} aria-pressed={preset === k} onClick={() => setPreset(k)}>{l}</button>
          ))}
          <button type="button" className={`a-btn ${preset === 'pick' ? 'soft' : ''}`} style={{ padding: '7px 11px' }} onClick={(e) => setAnchor(e.currentTarget)} data-pick-range>
            <CalendarRange size={15} />{dayWord(range.from)} – {dayWord(range.to)}</button>
        </div>
        <button type="button" className="a-btn" onClick={(e) => setExportAt(e.currentTarget)}><Download size={15} />Export</button>
      </div>
      <Popover anchor={anchor} open={!!anchor} onClose={() => setAnchor(null)} width={300}>
        <div className="p-3 space-y-3">
          <div><p className="text-[12px] mb-1" style={{ color: 'var(--color-text-secondary)' }}>From</p>
            <DatePicker value={range.from} mode="history" max={range.to} onChange={(v) => { setPick({ from: v, to: range.to }); setPreset('pick'); }} /></div>
          <div><p className="text-[12px] mb-1" style={{ color: 'var(--color-text-secondary)' }}>To</p>
            <DatePicker value={range.to} mode="history" min={range.from} onChange={(v) => { setPick({ from: range.from, to: v }); setPreset('pick'); setAnchor(null); }} /></div>
        </div>
      </Popover>
      <Popover anchor={exportAt} open={!!exportAt} onClose={() => setExportAt(null)} width={240}>
        <div className="p-2 flex flex-col">
          <button type="button" className="text-left px-3 py-2 rounded-lg text-[13px] text-white hover:bg-white/5" onClick={() => { exportPeriod(); setExportAt(null); }}>Payments in {range.name} (CSV)</button>
          <button type="button" className="text-left px-3 py-2 rounded-lg text-[13px] text-white hover:bg-white/5" onClick={() => { exportYear(); setExportAt(null); }}>{year} month by month (CSV)</button>
        </div>
      </Popover>

      <div className="a-grid" style={{ gridTemplateColumns: `1.3fr repeat(${kinds.length + 1}, minmax(0, 1fr))`, flex: 'none' }} data-revenue-tiles>
        <div className="a-card glow" style={{ padding: '12px 16px' }}>
          <div className="a-lbl">Collected in {range.name}</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <div className="a-num" style={{ fontSize: 32 }}>{payments === null ? '…' : peso(total)}</div>
            <span className="a-sub">{change == null ? (prevTotal === 0 && total > 0 ? `nothing in ${before.name}` : '') : <><span className={change >= 0 ? 'a-up' : 'a-dn'}>{change >= 0 ? '▲' : '▼'} {Math.abs(change)}%</span> vs {before.name}</>}</span>
          </div>
        </div>
        {kinds.map((k) => {
          const xs = now.filter((x) => x.kind === k);
          return (
            <div key={k} className="a-card" style={{ padding: '12px 14px' }}>
              <div className="a-lbl"><span className="a-dot" style={{ background: COLOR[k] }} /> {KIND_WORD[k]}</div>
              <div className="a-num" style={{ fontSize: 22 }}>{peso(sum(xs))}</div>
              <div className="a-sub">{k === 'shop' ? `${sales.filter((s) => s.saleDay >= range.from && s.saleDay <= range.to).reduce((n, s) => n + s.items.reduce((a, i) => a + i.qty, 0), 0)} items` : k === 'pass' ? `${xs.length} walk-in${xs.length === 1 ? '' : 's'}` : `${xs.length} payment${xs.length === 1 ? '' : 's'}`}</div>
            </div>
          );
        })}
        <div className="a-card" style={{ padding: '12px 14px', borderColor: '#3e310f' }}>
          <div className="a-lbl" style={{ color: 'var(--a-a300)' }}>Coming in 30 days</div>
          <div className="a-num" style={{ fontSize: 22 }}>{coming ? peso(coming.due) : '…'}</div>
          <div className="a-sub">{coming ? `${coming.n} renewal${coming.n === 1 ? '' : 's'}, if all renew` : ''}</div>
        </div>
      </div>

      {payments === 'failed' && <div className="a-hint" style={{ flex: 'none' }}><Receipt size={14} /><span>The payments could not be loaded — a connection problem, not an empty ledger. Reload to try again.</span></div>}

      <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 340px', flex: 1 }}>
        <div className="a-grid" style={{ gridTemplateRows: 'minmax(0, 1.1fr) minmax(0, 1fr)' }}>
          <div className="a-card" data-month-bars>
            <div className="a-ct"><h3><BarChart3 size={16} />Month by month</h3>
              <div className="a-legend">
                {kinds.map((k) => <span key={k}><span className="a-dot" style={{ background: COLOR[k] }} />{KIND_WORD[k]}</span>)}
                <select className="a-chip" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">
                  {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <div className="a-bars">
              {byMonth.map((b) => {
                const cur = year === thisYear && b.i === thisMonth;
                const future = year === thisYear && b.i > thisMonth;
                return (
                  <button key={b.i} type="button" className={`b ${cur ? 'cur' : ''}`} disabled={future} onClick={() => openMonth(b.i)} data-month={MONTHS[b.i]}
                    data-tip={future ? undefined : `${MONTHS[b.i]} ${year}: ${peso(b.all)} — memberships ${peso(b.membership)}${shopOn ? ` · shop ${peso(b.shop)}` : ''} · day passes ${peso(b.pass)}`}>
                    {cur && b.all > 0 && <em>{peso(b.all)} so far</em>}
                    <span style={{ height: b.all > 0 ? `max(4px, ${(b.all / peak) * 88}%)` : 0 }}>
                      {b.pass > 0 && <i style={{ flex: b.pass, background: COLOR.pass }} />}
                      {b.shop > 0 && <i style={{ flex: b.shop, background: COLOR.shop }} />}
                      {b.membership > 0 && <i style={{ flex: b.membership, background: COLOR.membership }} />}
                    </span>
                    <small>{MONTHS[b.i]}</small>
                  </button>
                );
              })}
            </div>
            <div className="a-sub" style={{ paddingTop: 8 }}>Click a month to see its payments. Bars count money by the day it was paid, not the day it was recorded.</div>
          </div>

          <div className="a-card" data-revenue-payments>
            <div className="a-ct"><h3><Receipt size={16} />Payments in {range.name}</h3>
              <div style={{ display: 'flex', gap: 6 }}>
                <label className="a-input" style={{ padding: '6px 10px', fontSize: 12, width: 200 }}><Search size={14} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Member or receipt…" aria-label="Search payments" /></label>
                <select className={`a-chip ${kind !== 'all' ? 'on' : ''}`} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Kind">
                  <option value="all">All kinds</option>{kinds.map((k) => <option key={k} value={k}>{KIND_WORD[k]}</option>)}
                </select>
              </div>
            </div>
            <div ref={fitRef} className="a-scroll grow" data-rd-table>
              {shown.length === 0 ? <p className="a-sub" style={{ padding: '10px 0' }}>{payments === null ? 'Loading…' : search.trim() || kind !== 'all' ? 'Nothing matches.' : `No money recorded in ${range.name}.`}</p> : (
                <table className="a-table">
                  <thead><tr><th>Paid on</th><th>Member</th><th>For</th><th>How</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                  <tbody>
                    {paged.visible.map((x) => (
                      <tr key={x.id} data-money-row={x.kind}>
                        <td><b>{dayWord(x.day)}</b><div className="a-sub">{x.kind === 'membership' && localDateKey(x.at) !== x.day ? 'recorded later' : new Date(x.at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</div></td>
                        <td className="truncate" style={{ maxWidth: 180 }}>{x.who || <span className="a-sub">{x.receipt}</span>}</td>
                        <td className="truncate" style={{ maxWidth: 180 }}>{x.what}</td>
                        <td><span className={`a-pill ${x.how === 'Cash' ? '' : 'v'}`}>{x.how}</span></td>
                        <td style={{ textAlign: 'right' }}><b>{peso(x.amount)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {paged.totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 }}>
                <span className="a-sub">{(paged.page - 1) * paged.perPage + 1}–{Math.min(paged.total, paged.page * paged.perPage)} of {paged.total}</span>
                <Pager page={paged.page} pages={paged.totalPages} onPage={paged.setPage} />
              </div>
            )}
          </div>
        </div>

        <div className="a-grid" style={{ alignContent: 'start', overflowY: 'auto' }}>
          <div className="a-card" data-by-plan>
            <div className="a-ct"><h3><Tag size={16} />By plan</h3><small>{range.name}</small></div>
            {byPlan.length === 0 ? <p className="a-sub">No plans yet.</p> : byPlan.slice(0, 5).map(([name, v]) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
                <b className="truncate" style={{ width: 110, fontSize: 12 }}>{name}</b>
                <div className="a-bar"><i style={{ width: `${byPlan[0][1] > 0 ? (v / byPlan[0][1]) * 100 : 0}%` }} /></div>
                <span className={v ? '' : 'a-sub'} style={{ width: 76, textAlign: 'right', fontSize: 12 }}>{peso(v)}</span>
              </div>
            ))}
            {byPlan.length > 5 && <button type="button" className="a-link a-sub" style={{ textAlign: 'left' }} onClick={() => navigate('/membership-plans')}>+{byPlan.length - 5} more on Plans</button>}
          </div>
          <div className="a-card" data-by-method>
            <div className="a-ct"><h3><Wallet size={16} />How they paid</h3></div>
            {howTotal === 0 ? <p className="a-sub">Nothing paid in {range.name}.</p> : (<>
              <div className="a-stack">{byHow.map(([h, v], i) => <i key={h} style={{ flex: v, background: colors[i % colors.length] }} />)}</div>
              <div className="a-legend">{byHow.map(([h, v], i) => <span key={h}><span className="a-dot" style={{ background: colors[i % colors.length] }} />{h} {Math.round((v / howTotal) * 100)}%</span>)}</div>
            </>)}
          </div>
          {shopOn && (
            <div className="a-card" data-best-sellers>
              <div className="a-ct"><h3><ShoppingBag size={16} />Shop best sellers</h3><button type="button" className="a-btn ghost sm" onClick={() => navigate('/shop')}>Open shop</button></div>
              {best.length === 0 ? <p className="a-sub">No counter sales in {range.name}.</p> : best.map(([name, r], i) => (
                <div key={name} className="a-row"><span className={`a-rank ${i === 0 ? 'g' : ''}`}>{i + 1}</span><div className="t"><b>{name}</b><small>{r.qty} sold</small></div><b>{peso(r.revenue)}</b></div>
              ))}
            </div>
          )}
          {pending.length > 0 && (
            <div className="a-card" style={{ borderColor: '#3e310f' }} data-pending-money>
              <div className="a-row" style={{ padding: 0, borderTop: 0 }}>
                <div className="a-ic" style={{ background: 'var(--a-alight)', color: 'var(--a-a300)' }}><Hourglass size={15} /></div>
                <div className="t"><b style={{ whiteSpace: 'normal' }}>{peso(pending.reduce((s, p) => s + Number(p.amount), 0))} waiting to be confirmed</b><small style={{ whiteSpace: 'normal' }}>{pending.length} payment{pending.length === 1 ? '' : 's'} · not counted until confirmed</small></div>
                <button type="button" className="a-btn soft sm" onClick={() => navigate('/payments')}>Review</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
