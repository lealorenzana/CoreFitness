import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Footprints, UserPlus, Settings2, Wallet, Undo2, HelpCircle, Download, Check, Banknote, QrCode, Phone, Lightbulb, HeartHandshake, History, Tags } from 'lucide-react';
import { RdButton, Pill, EmptyBlock, Initials, SearchField, RdTable, Tr, Td } from '../components/ui/rd';
import { Av, AttHead } from './attendance/parts';
import { useAttCounts } from './attendance/attData';
import './attendance/att.css';
import FloatingWindow from '../components/ui/FloatingWindow';
import { exportToCSV } from '../utils/exportUtils';
import { TONE } from '../components/ui/rdTokens';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';
import { todayKey, addDays } from '../utils/dates';
import WalkInGuide from '../components/WalkInGuide';
import DetailSheet from '../components/ui/DetailSheet';

type Kind = 'day' | 'pack5' | 'pack10' | 'pack_visit';
interface Prices { on: boolean; day: number | null; pack5: number | null; pack10: number | null; nudge: number | null }
interface Guest { id: string; name: string; phone: string | null; visits_left: number; visits_this_month: number; last_visit: string | null }
interface Visit { id: string; name: string; phone: string | null; kind: Kind; amount: number; method: string; visited_at: string; voided: boolean; visits_left: number }
interface PastVisit { id: string; name: string; phone: string | null; visit_day: string; visited_at: string; kind: Kind; amount: number; method: string; voided: boolean; recorded_by_name: string | null }
type Range = 'today' | '7' | '30' | '90';
const RANGE_LABEL: Record<Range, string> = { today: 'Today', '7': 'Last 7 days', '30': 'Last 30 days', '90': 'Last 90 days' };
interface Regular { guest_id: string; name: string; phone: string | null; visits: number; spent: number; last_visit: string }
const KIND: Record<Kind, string> = { day: 'Day pass', pack5: '5-visit pack', pack10: '10-visit pack', pack_visit: 'Visit from a pack' };
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const ago = (day: string | null) => {
  if (!day) return null;
  const d = Math.round((new Date(`${todayKey()}T00:00:00`).getTime() - new Date(`${day}T00:00:00`).getTime()) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};

/** One thing a guest can pay for: the gym's price, never typed at the desk. */
function Option({ on, title, price, sub, onClick, amber }: { on: boolean; title: string; price: string; sub: React.ReactNode; onClick: () => void; amber?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} data-walkin-option className={`a-opt ${on ? 'on' : ''}`}>
      {on && <span className="tick"><Check size={13} /></span>}
      <span className="a-lbl" style={amber ? { color: 'var(--a-a300)' } : undefined}>{title}</span>
      <span className="price">{price}</span>
      <span className="a-sub">{sub}</span>
    </button>
  );
}

/**
 * Walk-ins (0185; redesigned 2026-10-18): a guest who is not a member pays for
 * today — or buys a pack, or spends a visit from one — in three steps: who is
 * it (their phone finds them next time), what are they paying for (the gym's
 * prices, Settings → Walk-ins), how did they pay. The day's walk-ins are in
 * the rail and in the cash drawer; a mistake is voided the same day. Guests
 * who keep coming back are listed (0200's frequent_guests) — the walk-in who
 * should be a member.
 */
export default function WalkIns() {
  const navigate = useNavigate();
  const counts = useAttCounts();
  const [prices, setPrices] = useState<Prices | null | undefined>(undefined);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  /** The lookup's answer, kept with the phone it was for — it counts only while that phone is still typed. */
  const [found, setFound] = useState<{ phone: string; guest: Guest | null } | null>(null);
  const guest = found && found.phone === phone ? found.guest : null;
  const looked = !!found && found.phone === phone;
  const [kind, setKind] = useState<Kind | null>(null);
  const [method, setMethod] = useState<'cash' | 'online'>('cash');
  const [visits, setVisits] = useState<Visit[]>([]);
  const [regulars, setRegulars] = useState<Regular[] | null>(null);
  const [cheapest, setCheapest] = useState<{ name: string; price: number } | null>(null);
  const [busy, setBusy] = useState(false);
  /** The guide's table is wide: it opens in a side panel, never unfolded inside the rail. */
  const [guideOpen, setGuideOpen] = useState(false);
  /** Past walk-ins (0201), in a floating window: names, what they paid, who recorded it. */
  const [histOpen, setHistOpen] = useState(false);
  const [histRange, setHistRange] = useState<Range>('30');
  const [histQ, setHistQ] = useState('');
  const [hist, setHist] = useState<PastVisit[] | null | 'missing'>(null);
  useEffect(() => {
    if (!histOpen) return;
    let live = true;
    void (async () => {
      const to = todayKey();
      const from = histRange === 'today' ? to : addDays(to, -(Number(histRange) - 1));
      const { data, error } = await supabase.rpc('guest_visits_between', { p_from: from, p_to: to });
      if (!live) return;
      // Before 0201 the function does not exist — said so, never shown as "no walk-ins".
      setHist(error ? 'missing' : ((data ?? []) as PastVisit[]).map((v) => ({ ...v, amount: Number(v.amount) })));
    })();
    return () => { live = false; };
  }, [histOpen, histRange]);

  const load = useCallback(async () => {
    const [{ data: s, error }, { data: v }, fg, plans] = await Promise.all([
      supabase.from('gym_settings').select('day_pass_on, day_pass_price, pack5_price, pack10_price, guest_nudge_visits').maybeSingle(),
      supabase.rpc('guest_visits_on', { p_day: todayKey() }),
      // Before 0200 this function does not exist: the section then says nothing rather than "nobody".
      supabase.rpc('frequent_guests', { p_days: 30, p_min: 3 }),
      supabase.from('membership_plans').select('name, price, is_active').gt('price', 0).eq('is_active', true).order('price', { ascending: true }).limit(1),
    ]);
    if (error) { setPrices(null); return; }
    const r = s as { day_pass_on: boolean; day_pass_price: number | null; pack5_price: number | null; pack10_price: number | null; guest_nudge_visits: number | null } | null;
    const num = (x: number | null) => (x == null ? null : Number(x));
    setPrices(r ? { on: r.day_pass_on, day: num(r.day_pass_price), pack5: num(r.pack5_price), pack10: num(r.pack10_price), nudge: r.guest_nudge_visits } : null);
    setVisits(((v ?? []) as Visit[]).map((x) => ({ ...x, amount: Number(x.amount) })));
    setRegulars(fg.error ? null : ((fg.data ?? []) as Regular[]).map((x) => ({ ...x, spent: Number(x.spent) })));
    const p = (plans.data ?? [])[0] as { name: string; price: number } | undefined;
    setCheapest(p ? { name: p.name, price: Number(p.price) } : null);
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  // The phone, once it is long enough to be one, asks who this is.
  useEffect(() => {
    if (phone.replace(/\D/g, '').length < 10) return;
    const asked = phone;
    const t = setTimeout(() => {
      void (async () => {
        const { data } = await supabase.rpc('find_guest', { p_phone: asked });
        setFound({ phone: asked, guest: (Array.isArray(data) ? data[0] : null) as Guest | null });
      })();
    }, 300);
    return () => clearTimeout(t);
  }, [phone]);

  const priceOf = (k: Kind): number => (k === 'day' ? prices?.day ?? 0 : k === 'pack5' ? prices?.pack5 ?? 0 : k === 'pack10' ? prices?.pack10 ?? 0 : 0);
  // A pack visit is only for a guest with one left; a chosen kind the guest cannot use falls back to nothing.
  const chosen: Kind | null = kind === 'pack_visit' && !(guest && guest.visits_left > 0) ? null : kind;

  const record = async () => {
    if (!chosen) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('record_guest_visit', {
      p_guest: guest?.id ?? null, p_name: guest ? null : name, p_phone: guest ? null : (phone.trim() || null), p_kind: chosen,
      p_method: chosen === 'pack_visit' ? 'cash' : method,
    });
    setBusy(false);
    if (error) { showToast(error.message, 'error'); return; }
    const r = (Array.isArray(data) ? data[0] : data) as { amount: number; visits_left: number; visits_this_month: number; suggest_membership: boolean };
    const who = guest?.name ?? name.trim();
    showToast(`${who}: ${Number(r.amount) > 0 ? `${peso(Number(r.amount))} ${method}` : 'a visit from their pack'}${r.visits_left ? ` · ${r.visits_left} left on the pack` : ''}`, 'success');
    if (r.suggest_membership) showToast(`${who} has come ${r.visits_this_month} times this month — suggest a membership.`, 'info');
    setPhone(''); setName(''); setFound(null); setKind(null); setMethod('cash');
    await load();
  };
  const voidIt = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.rpc('void_guest_visit', { p_visit: id });
    setBusy(false);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Voided', 'success');
    await load();
  };

  const live = visits.filter((v) => !v.voided);
  const cash = live.filter((v) => v.method === 'cash').reduce((a, v) => a + v.amount, 0);
  const canSell = !!prices?.on;
  const named = !!guest || name.trim().length > 0;
  const sold = (k: Kind) => live.filter((v) => v.kind === k).length;
  /** What a guest has paid in walk-ins over 30 days, when they are among the regulars (0200's frequent_guests). */
  const spentOf = (id: string) => regulars?.find((g) => g.guest_id === id)?.spent ?? null;
  const nudgeAt = prices?.nudge ?? null;
  const willSuggest = !!guest && nudgeAt !== null && guest.visits_this_month + 1 >= nudgeAt;

  return (
    <div className="att" data-walkins>
      <AttHead counts={{ today: counts.today, walkIns: live.length }} sub="Guests who aren’t members · paid at the desk · counted in the drawer"
        actions={(
          <div className="flex items-center gap-2">
            <button type="button" className="a-btn" onClick={() => setHistOpen(true)} data-open-walkin-history><History size={15} />Past walk-ins</button>
            <button type="button" className="a-btn" onClick={() => navigate('/settings?tab=walk-ins')}><Settings2 size={15} />Walk-in prices</button>
          </div>
        )} />

      <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0,1.65fr) minmax(0,1fr)', flex: 1 }}>
        {prices === undefined ? <div className="a-card"><p className="a-sub">Loading…</p></div>
          : !canSell ? (
            <div className="a-card glow" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 10 }}>
              <Footprints size={40} style={{ color: 'var(--a-p300)' }} />
              <b style={{ fontSize: 15 }}>{prices === null ? 'Walk-ins need the 0185 update to the database.' : 'Day passes are off at this gym.'}</b>
              {prices !== null && <button type="button" className="a-btn violet" onClick={() => navigate('/settings?tab=walk-ins')}>Turn them on in Settings → Walk-ins</button>}
            </div>
          ) : (
            <div className="a-card glow a-scroll" data-walkin-card>
              <div className="a-ct"><h3><UserPlus size={16} />Record a walk-in</h3><small>the gym’s prices — the desk never types one</small></div>

              {/* 1 · Who */}
              <div className="a-step"><span>1</span>Who is it?</div>
              <div className="a-grid" style={{ gridTemplateColumns: '1fr 1.2fr' }} data-walkin-form>
                <label className="a-input"><Phone size={16} />
                  <input aria-label="Guest phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (finds them next time)" /></label>
                {guest ? (
                  <div className="a-input" style={{ borderColor: '#43357e' }} data-guest-found>
                    <Av name={guest.name} small />{guest.name}
                    <span className="a-pill v" style={{ marginLeft: 'auto' }}>been here {guest.visits_this_month}× this month</span>
                  </div>
                ) : (
                  <label className="a-input"><UserPlus size={16} />
                    <input aria-label="Guest name" value={name} onChange={(e) => setName(e.target.value)} placeholder={looked ? 'New guest — their name' : 'Name'} /></label>
                )}
              </div>
              <div className="a-sub inline-flex items-center gap-1.5" style={{ margin: '7px 0 14px' }}>
                <History size={13} />
                {guest
                  ? <>Last came {ago(guest.last_visit) ?? 'never'}{guest.visits_left ? <> · has <b style={{ color: '#fff' }}>{guest.visits_left} pack visit{guest.visits_left === 1 ? '' : 's'}</b> left</> : ' · no pack visits left'}</>
                  : 'Type their phone first — a returning guest is found, with their visits and any pack.'}
              </div>

              {/* 2 · What */}
              <div className="a-step"><span>2</span>What are they paying for?</div>
              <div className="a-grid" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
                <Option on={chosen === 'day'} title="Day pass" price={peso(prices!.day ?? 0)} sub="today only" onClick={() => setKind('day')} />
                {/* A pack the gym does not sell is not offered at all. */}
                {prices!.pack5 != null && <Option on={chosen === 'pack5'} title="5 visits" price={peso(prices!.pack5)} sub={<><em>{peso(prices!.pack5 / 5)}</em> a visit</>} onClick={() => setKind('pack5')} />}
                {prices!.pack10 != null && <Option on={chosen === 'pack10'} title="10 visits" price={peso(prices!.pack10)} sub={<><em>{peso(prices!.pack10 / 10)}</em> a visit</>} onClick={() => setKind('pack10')} />}
                {guest && guest.visits_left > 0 && (
                  <Option amber on={chosen === 'pack_visit'} title="Use a pack visit" price={peso(0)} sub={`${guest.visits_left} left → ${guest.visits_left - 1} after`} onClick={() => setKind('pack_visit')} />
                )}
              </div>

              {/* 3 · How paid */}
              <div className="a-step" style={{ marginTop: 14 }}><span>3</span>How did they pay?</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {(['cash', 'online'] as const).map((m) => (
                  <button key={m} type="button" className={`a-chip ${method === m && chosen !== 'pack_visit' ? 'on' : ''}`} aria-pressed={method === m}
                    disabled={chosen === 'pack_visit'} style={chosen === 'pack_visit' ? { opacity: 0.4 } : undefined} onClick={() => setMethod(m)}>
                    {m === 'cash' ? <Banknote size={14} /> : <QrCode size={14} />}{m === 'cash' ? 'Cash' : 'Online'}
                  </button>
                ))}
                <button type="button" className="a-btn amber" style={{ marginLeft: 'auto', padding: '11px 26px', fontSize: 13 }} disabled={busy || !named || !chosen} onClick={() => void record()} data-record-visit>
                  <Check size={16} />{!named ? 'Type their name' : chosen ? `Record visit · ${peso(priceOf(chosen))}` : 'Choose what they are paying for'}
                </button>
              </div>

              {/* The walk-in who should be a member — the gym's own nudge (Settings → Walk-ins). */}
              {willSuggest && (
                <div className="a-toast amber" style={{ marginTop: 14 }} data-walkin-tip>
                  <span className="ok"><Lightbulb size={16} /></span>
                  <div>
                    <b style={{ fontSize: 12.5 }}>{guest!.name} has come {guest!.visits_this_month + 1} times this month with today</b>
                    <div className="a-sub">
                      {spentOf(guest!.id) !== null ? `${peso(spentOf(guest!.id)!)} on walk-ins in 30 days. ` : ''}
                      {cheapest ? `${cheapest.name} is ${peso(cheapest.price)} — worth suggesting.` : 'Worth suggesting a membership.'}
                    </div>
                  </div>
                </div>
              )}

              {regulars && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--a-border)', flex: 1, display: 'flex', flexDirection: 'column' }} data-regular-guests>
                  <div className="a-ct" style={{ marginBottom: 6 }}><h3><HeartHandshake size={16} />Guests who could join</h3><small>came 3+ times in 30 days</small></div>
                  {regulars.length === 0 ? <p className="a-sub">Nobody yet — a guest who comes three times in a month shows here.</p> : (
                    <div className="a-grid" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10, alignItems: 'start' }}>
                      {regulars.slice(0, 3).map((g) => (
                        <div key={g.guest_id} className="a-opt" style={{ padding: 14, gap: 8, cursor: 'default' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Av name={g.name} small />
                            <div style={{ minWidth: 0 }}><b style={{ fontSize: 13 }} className="block truncate">{g.name}</b><div className="a-sub">last came {ago(g.last_visit)}</div></div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }} className="a-sub"><span>{g.visits} visits · {peso(g.spent)}</span>{cheapest && <span>{cheapest.name} {peso(cheapest.price)}</span>}</div>
                          {cheapest && <div className="a-bar" style={{ width: '100%', flex: 'none', height: 6 }}><i style={{ width: `${Math.min(100, (g.spent / cheapest.price) * 100)}%` }} /></div>}
                          {cheapest && <div className="a-sub" style={{ fontSize: 11 }}>spent so far vs. {cheapest.name}</div>}
                          {g.phone
                            ? <a href={`tel:${g.phone.replace(/[^0-9+]/g, '')}`} className="a-btn soft sm" style={{ marginTop: 'auto' }}><Phone size={13} />Call {g.phone}</a>
                            : <span className="a-sub text-center" style={{ marginTop: 'auto' }}>No phone on file — ask next visit</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        {/* ── The rail ── */}
        <div className="a-grid a-scroll" style={{ gridTemplateRows: 'auto auto minmax(0,1fr) auto', alignContent: 'start' }} data-walkins-rail>
          <div className="a-card" data-walkins-hero>
            <div className="a-ct"><h3><Wallet size={16} />Today in the drawer</h3><small>from walk-ins</small></div>
            <div className="a-num">{peso(cash)}</div>
            <div className="a-sub" style={{ color: 'var(--a-a300)' }}>{peso(cash)} cash in the drawer</div>
            <div className="a-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginTop: 10, gap: 8 }}>
              <div><b style={{ fontSize: 16 }}>{sold('day')}</b><div className="a-sub">Day passes</div></div>
              <div><b style={{ fontSize: 16 }}>{sold('pack5') + sold('pack10')}</b><div className="a-sub">packs sold</div></div>
              <div><b style={{ fontSize: 16 }}>{sold('pack_visit')}</b><div className="a-sub">pack visits</div></div>
            </div>
          </div>
          <div className="a-card">
            <div className="a-ct"><h3><Tags size={16} />Prices</h3><button type="button" className="a-btn ghost sm" onClick={() => navigate('/settings?tab=walk-ins')}>Edit in Settings</button></div>
            <div className="a-sub">
              {prices && prices.on
                ? [prices.day != null && `Day ${peso(prices.day)}`, prices.pack5 != null && `5 visits ${peso(prices.pack5)}`, prices.pack10 != null && `10 visits ${peso(prices.pack10)}`].filter(Boolean).join(' · ') + ' · the desk never types a price'
                : 'Day passes are off.'}
            </div>
          </div>
          <div className="a-card" style={{ minHeight: 0 }}>
            <div className="a-ct"><h3><Footprints size={16} />Today's walk-ins</h3><button type="button" className="a-link" style={{ color: 'var(--a-p300)' }} onClick={() => setHistOpen(true)}>Past walk-ins →</button></div>
            {visits.length === 0 ? <p className="a-sub" style={{ padding: '10px 0' }}>No walk-ins yet today.</p> : (
              <div className="a-scroll" data-walkin-list>
                {visits.map((v) => (
                  <div key={v.id} className="a-row" style={{ opacity: v.voided ? 0.55 : 1 }}>
                    <Av name={v.name} small />
                    <div className="t"><b>{v.name}{v.voided ? ' · voided' : ''}</b>
                      <small>{KIND[v.kind]} · {v.amount > 0 ? `${peso(v.amount)} · ${v.method}` : '₱0'} · {new Date(v.visited_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }).toLowerCase()}</small></div>
                    {!v.voided && <button type="button" className="a-btn ghost sm" disabled={busy} onClick={() => void voidIt(v.id)}><Undo2 size={12} />Void</button>}
                  </div>
                ))}
              </div>
            )}
            <div className="a-sub" style={{ marginTop: 'auto', paddingTop: 8 }}>Void a mistake before the drawer closes.</div>
          </div>
          <button type="button" className="a-card press text-left" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: '11px 14px' }} onClick={() => setGuideOpen(true)} data-walkin-guide-open>
            <HelpCircle size={15} style={{ color: 'var(--a-p300)' }} /><b style={{ fontSize: 12.5 }}>How walk-ins and day passes work</b>
          </button>
        </div>
      </div>

      <FloatingWindow open={histOpen} onClose={() => setHistOpen(false)} title="Past walk-ins" icon={History} data-walkin-history
        count={Array.isArray(hist) ? hist.filter((v) => !v.voided).length : undefined}
        tools={(
          <>
            <div className="flex gap-1.5">
              {(['today', '7', '30', '90'] as Range[]).map((r) => (
                <button key={r} type="button" onClick={() => setHistRange(r)} aria-pressed={histRange === r}
                  className="h-10 px-3.5 rounded-xl text-[13.5px] font-semibold"
                  style={histRange === r
                    ? { background: TONE.amber.bg, color: TONE.amber.fg, border: `1px solid ${TONE.amber.line}` }
                    : { background: 'rgba(255,255,255,0.03)', color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {RANGE_LABEL[r]}
                </button>
              ))}
            </div>
            <div className="w-[230px]"><SearchField value={histQ} onChange={setHistQ} placeholder="Name or phone…" /></div>
            <RdButton icon={Download} disabled={!Array.isArray(hist) || hist.length === 0} onClick={() => Array.isArray(hist) && exportToCSV(hist.map((v) => ({
              Date: v.visit_day, Time: new Date(v.visited_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }),
              Guest: v.name, Phone: v.phone ?? '', What: KIND[v.kind], Amount: v.amount, Paid: v.method, 'Recorded by': v.recorded_by_name ?? '', Voided: v.voided ? 'yes' : '',
            })), `walk-ins_${histRange}_${todayKey()}`)}>Export</RdButton>
          </>
        )}
        footer={Array.isArray(hist) ? (() => {
          const kept = hist.filter((v) => !v.voided);
          const sum = (m?: string) => kept.filter((v) => !m || v.method === m).reduce((a, v) => a + v.amount, 0);
          return (
            <p className="text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
              {kept.length} visit{kept.length === 1 ? '' : 's'} · <b className="text-white">{peso(sum())}</b> · cash {peso(sum('cash'))} · online {peso(sum('online'))}
              {hist.length > kept.length ? ` · ${hist.length - kept.length} voided` : ''}
            </p>
          );
        })() : undefined}>
        {hist === 'missing' ? (
          <EmptyBlock icon={History} title="The walk-in history needs the 0201 update to the database." />
        ) : hist === null ? (
          <p className="p-6 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>
        ) : (() => {
          const q = histQ.trim().toLowerCase();
          const shown = hist.filter((v) => !q || v.name.toLowerCase().includes(q) || (v.phone ?? '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '\u0000'));
          return (
            <RdTable head={['When', 'Guest', 'What', 'Amount', 'Paid', 'Recorded by', { label: '', align: 'right' }]}
              empty={shown.length === 0 ? <EmptyBlock icon={Footprints} compact title={hist.length === 0 ? `No walk-ins — ${RANGE_LABEL[histRange].toLowerCase()}.` : 'Nobody matches that.'} /> : undefined}>
              {shown.map((v) => (
                <Tr key={v.id} data-walkin-history-row style={{ opacity: v.voided ? 0.55 : 1 }}>
                  <Td className="whitespace-nowrap"><b className="text-white">{new Date(`${v.visit_day}T00:00:00`).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' })}</b>{' '}
                    <span style={{ color: 'var(--color-text-secondary)' }}>{new Date(v.visited_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</span></Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Initials name={v.name} size={32} />
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate">{v.name}</p>
                        {v.phone && <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>{v.phone}</p>}
                      </div>
                    </div>
                  </Td>
                  <Td><Pill tone={v.kind === 'day' ? 'violet' : v.kind === 'pack_visit' ? 'gray' : 'amber'}>{KIND[v.kind]}</Pill></Td>
                  <Td className="tabular-nums">{v.amount > 0 ? peso(v.amount) : 'no charge'}</Td>
                  <Td style={{ color: 'var(--color-text-secondary)' }}>{v.amount > 0 ? (v.method === 'online' ? 'Online' : 'Cash') : '—'}</Td>
                  <Td style={{ color: 'var(--color-text-secondary)' }}>{v.recorded_by_name ?? '—'}</Td>
                  <Td align="right">{v.voided && <Pill tone="gray">Voided</Pill>}</Td>
                </Tr>
              ))}
            </RdTable>
          );
        })()}
      </FloatingWindow>

      <DetailSheet open={guideOpen} onClose={() => setGuideOpen(false)} title="How walk-ins and day passes work" width={720}
        subtitle="Two ways to pay for one visit — at the desk, or in the app">
        <WalkInGuide open />
      </DetailSheet>
    </div>
  );
}

