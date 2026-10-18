import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Footprints, UserPlus, Settings2, Wallet, Undo2, HelpCircle, Check, Banknote, QrCode, Phone, Lightbulb, HeartHandshake, History, Tags } from 'lucide-react';
import { RdHeader, RdCard, RdButton, Pill, EmptyBlock, FitBody, Initials } from '../components/ui/rd';
import { ATTENDANCE_TABS, TONE } from '../components/ui/rdTokens';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';
import { todayKey } from '../utils/dates';
import WalkInGuide from '../components/WalkInGuide';
import DetailSheet from '../components/ui/DetailSheet';

type Kind = 'day' | 'pack5' | 'pack10' | 'pack_visit';
interface Prices { on: boolean; day: number | null; pack5: number | null; pack10: number | null; nudge: number | null }
interface Guest { id: string; name: string; phone: string | null; visits_left: number; visits_this_month: number; last_visit: string | null }
interface Visit { id: string; name: string; phone: string | null; kind: Kind; amount: number; method: string; visited_at: string; voided: boolean; visits_left: number }
interface Regular { guest_id: string; name: string; phone: string | null; visits: number; spent: number; last_visit: string }
const KIND: Record<Kind, string> = { day: 'Day pass', pack5: '5-visit pack', pack10: '10-visit pack', pack_visit: 'Visit from a pack' };
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const ago = (day: string | null) => {
  if (!day) return null;
  const d = Math.round((new Date(`${todayKey()}T00:00:00`).getTime() - new Date(`${day}T00:00:00`).getTime()) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};

/** A numbered step heading, as in the mock-up. */
function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-6 h-6 rounded-full grid place-items-center text-[12px] font-bold flex-none" style={{ background: TONE.violet.bg, color: TONE.violet.fg, border: `1px solid ${TONE.violet.line}` }}>{n}</span>
      <h3 className="text-[15px] font-bold text-white">{title}</h3>
      {children}
    </div>
  );
}

/** One thing a guest can pay for: the gym's price, never typed at the desk. */
function Option({ on, title, price, sub, onClick, amber }: { on: boolean; title: string; price: string; sub: string; onClick: () => void; amber?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} data-walkin-option
      className="relative rounded-2xl px-4 py-3.5 text-left flex flex-col gap-0.5 transition-colors min-w-0"
      style={on
        ? { background: amber ? 'rgba(245,158,11,0.10)' : 'rgba(124,58,237,0.16)', border: `1.5px solid ${amber ? TONE.amber.dot : TONE.violet.dot}` }
        : { background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.09)' }}>
      {on && <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full grid place-items-center" style={{ background: amber ? TONE.amber.dot : TONE.violet.dot }}><Check size={13} color="#fff" /></span>}
      <span className="text-[13px] font-semibold" style={{ color: amber ? TONE.amber.fg : 'var(--color-text-secondary)' }}>{title}</span>
      <span className="text-[24px] font-bold text-white tabular-nums leading-tight">{price}</span>
      <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>{sub}</span>
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
  const inputCls = 'h-12 px-4 rounded-xl text-[15px] text-white outline-none w-full';
  const inputSt = { background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)' };
  const nudgeAt = prices?.nudge ?? null;
  const willSuggest = !!guest && nudgeAt !== null && guest.visits_this_month + 1 >= nudgeAt;

  return (
    <div className="rd-fit" data-walkins>
      <RdHeader title="Attendance" subtitle="Guests who aren’t members · paid at the desk · counted in the drawer." tabs={ATTENDANCE_TABS}
        actions={<RdButton icon={Settings2} onClick={() => navigate('/settings?tab=walk-ins')}>Walk-in prices</RdButton>} />

      <FitBody rail={(
        <>
          <RdCard className="p-5" data-walkins-hero>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[16px] font-bold text-white inline-flex items-center gap-2"><Wallet size={18} style={{ color: '#A78BFA' }} />Today in the drawer</h3>
              <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>from walk-ins</span>
            </div>
            <p className="text-[34px] font-bold text-white tabular-nums mt-1 leading-tight">{peso(cash)}</p>
            <p className="text-[13px]" style={{ color: '#FBBF24' }}>{peso(cash)} cash in the drawer</p>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div><p className="text-[18px] font-bold text-white tabular-nums">{sold('day')}</p><p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>Day passes</p></div>
              <div><p className="text-[18px] font-bold text-white tabular-nums">{sold('pack5') + sold('pack10')}</p><p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>packs sold</p></div>
              <div><p className="text-[18px] font-bold text-white tabular-nums">{sold('pack_visit')}</p><p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>pack visits</p></div>
            </div>
          </RdCard>

          <RdCard className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[16px] font-bold text-white inline-flex items-center gap-2"><Tags size={18} style={{ color: '#A78BFA' }} />Prices</h3>
              <RdButton size="sm" onClick={() => navigate('/settings?tab=walk-ins')}>Edit in Settings</RdButton>
            </div>
            <p className="text-[13px] mt-2" style={{ color: 'var(--color-text-secondary)' }}>
              {prices && prices.on
                ? [prices.day != null && `Day ${peso(prices.day)}`, prices.pack5 != null && `5 visits ${peso(prices.pack5)}`, prices.pack10 != null && `10 visits ${peso(prices.pack10)}`].filter(Boolean).join(' · ') + ' · the desk never types a price'
                : 'Day passes are off.'}
            </p>
          </RdCard>

          <RdCard className="p-5 flex flex-col min-h-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[16px] font-bold text-white inline-flex items-center gap-2"><Footprints size={18} style={{ color: '#A78BFA' }} />Today's walk-ins</h3>
              <span className="text-[13px] px-2.5 py-0.5 rounded-full tabular-nums" style={{ background: TONE.violet.bg, color: TONE.violet.fg }}>{live.length}</span>
            </div>
            <p className="text-[12px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>Void a mistake before the drawer closes.</p>
            {visits.length === 0 ? (
              <p className="text-[13.5px] py-6 text-center" style={{ color: 'var(--color-text-muted)' }}>No walk-ins yet today.</p>
            ) : (
              <div className="mt-2 flex flex-col" data-walkin-list>
                {visits.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', opacity: v.voided ? 0.55 : 1 }}>
                    <Initials name={v.name} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-white truncate">{v.name}{v.voided ? ' · voided' : ''}</p>
                      <p className="text-[12px] truncate" style={{ color: 'var(--color-text-secondary)' }}>
                        {KIND[v.kind]} · {v.amount > 0 ? `${peso(v.amount)} ${v.method}` : 'no charge'} · {new Date(v.visited_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                    {!v.voided && <RdButton size="sm" variant="ghost" icon={Undo2} disabled={busy} onClick={() => void voidIt(v.id)}>Void</RdButton>}
                  </div>
                ))}
              </div>
            )}
          </RdCard>

          <button type="button" onClick={() => setGuideOpen(true)} data-walkin-guide-open
            className="rounded-2xl px-4 py-3 flex items-center gap-2 text-[14px] font-semibold text-white text-left transition-colors hover:bg-white/[0.04]"
            style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
            <HelpCircle size={16} style={{ color: '#A78BFA' }} /> How walk-ins and day passes work
          </button>
        </>
      )}>
        {prices === undefined ? <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>
          : !canSell ? (
            <RdCard className="p-6">
              <EmptyBlock icon={Footprints} title={prices === null ? 'Walk-ins need the 0185 update to the database.' : 'Day passes are off at this gym.'}
                action={prices !== null ? <RdButton variant="primary" onClick={() => navigate('/settings?tab=walk-ins')}>Turn them on in Settings → Walk-ins</RdButton> : undefined} />
            </RdCard>
          ) : (
            <RdCard glow className="p-5 flex flex-col gap-4 rd-fit-fill overflow-y-auto" data-walkin-card>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[17px] font-bold text-white inline-flex items-center gap-2"><UserPlus size={19} style={{ color: '#A78BFA' }} />Record a walk-in</h2>
                <span className="text-[12.5px]" style={{ color: 'var(--color-text-secondary)' }}>about 20 seconds</span>
              </div>

              {/* 1 · Who */}
              <div className="flex flex-col gap-2">
                <Step n={1} title="Who is it?" />
                <div className="grid gap-3 sm:grid-cols-2" data-walkin-form>
                  <input aria-label="Guest phone" className={inputCls} style={inputSt} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (finds them next time)" />
                  {guest ? (
                    <div className="h-12 px-4 rounded-xl flex items-center gap-3" data-guest-found style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(139,92,246,0.4)' }}>
                      <Initials name={guest.name} size={30} />
                      <span className="text-[15px] font-semibold text-white truncate flex-1">{guest.name}</span>
                      <Pill tone="violet">been here {guest.visits_this_month}× this month</Pill>
                    </div>
                  ) : (
                    <input aria-label="Guest name" className={inputCls} style={inputSt} value={name} onChange={(e) => setName(e.target.value)}
                      placeholder={looked ? 'New guest — their name' : 'Name'} />
                  )}
                </div>
                <p className="text-[12.5px] inline-flex items-center gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                  <History size={13} />
                  {guest
                    ? <>Last came {ago(guest.last_visit) ?? 'never'} · {guest.visits_this_month} this month{guest.visits_left ? <> · <b className="text-white">{guest.visits_left} left on a pack</b></> : ''}</>
                    : 'Type their phone first — a returning guest is found, with their visits and any pack.'}
                </p>
              </div>

              {/* 2 · What */}
              <div className="flex flex-col gap-2">
                <Step n={2} title="What are they paying for?" />
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                  <Option on={chosen === 'day'} title={KIND.day} price={peso(prices!.day ?? 0)} sub="today only" onClick={() => setKind('day')} />
                  {/* A pack the gym does not sell is not offered at all. */}
                  {prices!.pack5 != null && <Option on={chosen === 'pack5'} title={KIND.pack5} price={peso(prices!.pack5)} sub={`${peso(prices!.pack5 / 5)} a visit · today is the first`} onClick={() => setKind('pack5')} />}
                  {prices!.pack10 != null && <Option on={chosen === 'pack10'} title={KIND.pack10} price={peso(prices!.pack10)} sub={`${peso(prices!.pack10 / 10)} a visit · today is the first`} onClick={() => setKind('pack10')} />}
                  {guest && guest.visits_left > 0 && (
                    <Option amber on={chosen === 'pack_visit'} title="Use a pack visit" price={peso(0)} sub={`${guest.visits_left} left → ${guest.visits_left - 1} after`} onClick={() => setKind('pack_visit')} />
                  )}
                </div>
              </div>

              {/* 3 · How paid */}
              <div className="flex flex-col gap-2">
                <Step n={3} title="How did they pay?" />
                <div className="flex items-center gap-2 flex-wrap">
                  {(['cash', 'online'] as const).map((m) => (
                    <button key={m} type="button" aria-pressed={method === m} disabled={chosen === 'pack_visit'} onClick={() => setMethod(m)}
                      className="h-10 px-4 rounded-full text-[14px] font-semibold inline-flex items-center gap-2 disabled:opacity-40"
                      style={method === m && chosen !== 'pack_visit'
                        ? { background: TONE.amber.bg, color: TONE.amber.fg, border: `1px solid ${TONE.amber.line}` }
                        : { background: 'rgba(255,255,255,0.025)', color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.09)' }}>
                      {m === 'cash' ? <Banknote size={16} /> : <QrCode size={16} />}{m === 'cash' ? 'Cash' : 'Online'}
                    </button>
                  ))}
                  <RdButton variant="primary" className="ml-auto" icon={Check} disabled={busy || !named || !chosen} onClick={() => void record()} data-record-visit>
                    {chosen ? `Record visit · ${peso(priceOf(chosen))}` : 'Choose what they are paying for'}
                  </RdButton>
                </div>
              </div>

              {/* The walk-in who should be a member — the gym's own nudge (Settings → Walk-ins). */}
              {willSuggest && (
                <div className="flex items-start gap-3 p-3.5 rounded-xl" data-walkin-tip
                  style={{ background: 'linear-gradient(90deg, rgba(245,158,11,0.13), rgba(124,58,237,0.08))', border: '1px solid rgba(245,158,11,0.35)' }}>
                  <span className="w-8 h-8 rounded-lg grid place-items-center flex-none" style={{ background: TONE.amber.dot }}><Lightbulb size={17} color="#1A1205" /></span>
                  <div>
                    <p className="text-[14px] font-semibold text-white">{guest!.name} has come {guest!.visits_this_month + 1} times this month with today</p>
                    <p className="text-[12.5px]" style={{ color: 'var(--color-text-secondary)' }}>
                      Worth suggesting a membership{cheapest ? ` — ${cheapest.name} is ${peso(cheapest.price)}` : ''}.
                    </p>
                  </div>
                </div>
              )}

              {regulars && (
                <div className="flex flex-col gap-2 pt-3 mt-auto" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }} data-regular-guests>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[15px] font-bold text-white inline-flex items-center gap-2"><HeartHandshake size={17} style={{ color: '#A78BFA' }} />Guests who could join</h3>
                    <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>came 3+ times in 30 days</span>
                  </div>
                  {regulars.length === 0 ? (
                    <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>Nobody yet — a guest who comes three times in a month shows here.</p>
                  ) : (
                    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                      {regulars.slice(0, 3).map((g) => (
                        <div key={g.guest_id} className="rounded-2xl p-3.5 flex flex-col gap-2" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.09)' }}>
                          <div className="flex items-center gap-2.5">
                            <Initials name={g.name} size={32} />
                            <div className="min-w-0">
                              <p className="text-[14px] font-semibold text-white truncate">{g.name}</p>
                              <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>last came {ago(g.last_visit)}</p>
                            </div>
                          </div>
                          <p className="text-[12.5px] flex justify-between" style={{ color: 'var(--color-text-secondary)' }}>
                            <span>{g.visits} visits · {peso(g.spent)}</span>
                            {cheapest && <span>{cheapest.name} {peso(cheapest.price)}</span>}
                          </p>
                          {g.phone
                            ? <a href={`tel:${g.phone.replace(/[^0-9+]/g, '')}`} className="h-9 rounded-xl inline-flex items-center justify-center gap-2 text-[13px] font-semibold"
                                style={{ background: TONE.amber.bg, color: TONE.amber.fg, border: `1px solid ${TONE.amber.line}` }}><Phone size={14} />Call {g.phone}</a>
                            : <span className="h-9 inline-flex items-center justify-center text-[12.5px]" style={{ color: 'var(--color-text-muted)' }}>No phone on file — ask next visit</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </RdCard>
          )}
      </FitBody>

      <DetailSheet open={guideOpen} onClose={() => setGuideOpen(false)} title="How walk-ins and day passes work" width={720}
        subtitle="Two ways to pay for one visit — at the desk, or in the app">
        <WalkInGuide open />
      </DetailSheet>
    </div>
  );
}

