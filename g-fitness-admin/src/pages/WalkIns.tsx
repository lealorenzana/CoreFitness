import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Footprints, UserPlus, Settings2, Wallet, Ticket, Layers, Repeat, Undo2 } from 'lucide-react';
import { RdHeader, RdCard, IconTile, StatTile, RdButton, Pill, RdTable, Tr, Td, EmptyBlock, RailCard, RailRow, TipCard, WithRail, Initials } from '../components/ui/rd';
import { ATTENDANCE_TABS } from '../components/ui/rdTokens';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';
import { todayKey } from '../utils/dates';
import WalkInGuide from '../components/WalkInGuide';

type Kind = 'day' | 'pack5' | 'pack10' | 'pack_visit';
interface Prices { on: boolean; day: number | null; pack5: number | null; pack10: number | null }
interface Guest { id: string; name: string; phone: string | null; visits_left: number; visits_this_month: number; last_visit: string | null }
interface Visit { id: string; name: string; phone: string | null; kind: Kind; amount: number; method: string; visited_at: string; voided: boolean; visits_left: number }
const KIND: Record<Kind, string> = { day: 'Day pass', pack5: '5-visit pack', pack10: '10-visit pack', pack_visit: 'Visit from a pack' };
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

/**
 * Walk-ins (0185): a guest who is not a member pays for today — or buys a
 * pack, or spends a visit from one. Their phone finds them next time, so
 * visits add up; the price is the gym's (Settings → Walk-ins). The day's
 * walk-ins are listed here and counted in the cash drawer; a mistake can be
 * voided the same day, before the drawer is closed.
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
  const [visits, setVisits] = useState<Visit[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: s, error }, { data: v }] = await Promise.all([
      supabase.from('gym_settings').select('day_pass_on, day_pass_price, pack5_price, pack10_price').maybeSingle(),
      supabase.rpc('guest_visits_on', { p_day: todayKey() }),
    ]);
    if (error) { setPrices(null); return; }
    const r = s as { day_pass_on: boolean; day_pass_price: number | null; pack5_price: number | null; pack10_price: number | null } | null;
    setPrices(r ? { on: r.day_pass_on, day: r.day_pass_price == null ? null : Number(r.day_pass_price), pack5: r.pack5_price == null ? null : Number(r.pack5_price),
      pack10: r.pack10_price == null ? null : Number(r.pack10_price) } : null);
    setVisits(((v ?? []) as Visit[]).map((x) => ({ ...x, amount: Number(x.amount) })));
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

  const record = async (kind: Kind) => {
    setBusy(true);
    const { data, error } = await supabase.rpc('record_guest_visit', {
      p_guest: guest?.id ?? null, p_name: guest ? null : name, p_phone: guest ? null : (phone.trim() || null), p_kind: kind, p_method: 'cash',
    });
    setBusy(false);
    if (error) { showToast(error.message, 'error'); return; }
    const r = (Array.isArray(data) ? data[0] : data) as { amount: number; visits_left: number; visits_this_month: number; suggest_membership: boolean };
    const who = guest?.name ?? name.trim();
    showToast(`${who}: ${Number(r.amount) > 0 ? `${peso(Number(r.amount))} cash` : 'a visit from their pack'}${r.visits_left ? ` · ${r.visits_left} left on the pack` : ''}`, 'success');
    if (r.suggest_membership) showToast(`${who} has come ${r.visits_this_month} times this month — suggest a membership.`, 'info');
    setPhone(''); setName(''); setFound(null);
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
  const inputSt = { background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.1)' };

  return (
    <div className="flex flex-col gap-6" data-walkins>
      <RdHeader title="Attendance" subtitle="Guests who are not members — paid at the desk, counted in the drawer." tabs={ATTENDANCE_TABS}
        actions={<RdButton icon={Settings2} onClick={() => navigate('/settings?tab=walk-ins')}>Walk-in prices</RdButton>} />

      <WithRail rail={(
        <>
          <RailCard icon={Wallet} title="Today's prices" sub="Set in Settings → Walk-ins. The desk never types a price.">
            {prices && prices.on ? (
              <>
                <RailRow tone="violet" label="Day pass" count={prices.day == null ? '—' : peso(prices.day)} />
                {/* A pack the gym does not sell is not listed at all. */}
                {prices.pack5 != null && <RailRow tone="amber" label="5-visit pack" count={peso(prices.pack5)} />}
                {prices.pack10 != null && <RailRow tone="amber" label="10-visit pack" count={peso(prices.pack10)} />}
              </>
            ) : <p className="text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>Day passes are off.</p>}
          </RailCard>
          <TipCard>
            A guest’s phone finds them next time, so visits add up. When someone keeps coming back, the desk is told to
            suggest a membership. Someone who bought a day pass in the app checks in on Today, like a member.
          </TipCard>
        </>
      )}>
        {/* ── The hero ── */}
        <RdCard glow className="p-7 rd-hero rd-hero-2" data-walkins-hero>
          <div className="flex items-center gap-6 min-w-0">
            <IconTile icon={Footprints} size={88} />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold tracking-[0.14em]" style={{ color: '#A78BFA' }}>WALK-INS TODAY</p>
              <p className="text-[42px] leading-none font-bold text-white mt-2 tabular-nums">{live.length} walk-in{live.length === 1 ? '' : 's'}</p>
              <p className="text-[17px] mt-3" style={{ color: 'var(--color-text-secondary)' }}>Day passes and packs, paid in cash at the desk.</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 min-w-0 rd-hero-side">
            <p className="text-[22px] font-bold text-white">{peso(cash)} cash in the drawer</p>
            <p className="text-[15px]" style={{ color: 'var(--color-text-secondary)' }}>Counted in today’s closeout. A mistake can be voided until the drawer is closed.</p>
          </div>
        </RdCard>

        <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <StatTile icon={Ticket} label="Day passes" value={sold('day')} sub="sold today" />
          <StatTile icon={Layers} tone="amber" label="Packs sold" value={sold('pack5') + sold('pack10')} sub="visit packs sold today" />
          <StatTile icon={Repeat} label="Pack visits used" value={sold('pack_visit')} sub="no charge today" />
        </div>

        {/* ── Recording one ── */}
        {prices === undefined ? <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>
          : !canSell ? (
            <RdCard className="p-6">
              <EmptyBlock icon={Footprints} title={prices === null ? 'Walk-ins need the 0185 update to the database.' : 'Day passes are off at this gym.'}
                action={prices !== null ? <RdButton variant="primary" onClick={() => navigate('/settings?tab=walk-ins')}>Turn them on in Settings → Walk-ins</RdButton> : undefined} />
            </RdCard>
          ) : (
            <RdCard className="p-6" data-walkin-card>
              <div className="flex items-center gap-3">
                <UserPlus size={24} style={{ color: '#A78BFA' }} />
                <h2 className="text-[20px] font-semibold text-white">A walk-in</h2>
              </div>
              <p className="text-[14px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>Type their phone first — a returning guest is found, with their visits and any pack.</p>
              <div className="grid gap-3 sm:grid-cols-2 mt-4" data-walkin-form>
                <input aria-label="Guest phone" className={inputCls} style={inputSt} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (finds them next time)" />
                {guest ? (
                  <div className="h-12 px-4 rounded-xl flex items-center gap-3" data-guest-found style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(139,92,246,0.4)' }}>
                    <Initials name={guest.name} size={30} />
                    <span className="text-[15px] font-semibold text-white truncate">{guest.name}</span>
                    <span className="text-[13px] truncate" style={{ color: 'var(--color-text-secondary)' }}>· {guest.visits_this_month} this month{guest.visits_left ? ` · ${guest.visits_left} left on a pack` : ''}</span>
                  </div>
                ) : (
                  <input aria-label="Guest name" className={inputCls} style={inputSt} value={name} onChange={(e) => setName(e.target.value)}
                    placeholder={looked ? 'New guest — their name' : 'Name'} />
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <RdButton variant="primary" icon={Ticket} disabled={busy || !named} onClick={() => void record('day')}>{KIND.day} · {peso(prices!.day ?? 0)}</RdButton>
                {prices!.pack5 != null && <RdButton icon={Layers} disabled={busy || !named} onClick={() => void record('pack5')}>{KIND.pack5} · {peso(prices!.pack5)}</RdButton>}
                {prices!.pack10 != null && <RdButton icon={Layers} disabled={busy || !named} onClick={() => void record('pack10')}>{KIND.pack10} · {peso(prices!.pack10)}</RdButton>}
                {guest && guest.visits_left > 0 && <RdButton variant="amber" icon={Repeat} disabled={busy} onClick={() => void record('pack_visit')}>Use a pack visit ({guest.visits_left} left)</RdButton>}
              </div>
            </RdCard>
          )}

        {/* ── Today's walk-ins ── */}
        <RdCard className="overflow-hidden">
          <div className="flex items-center gap-3 p-5">
            <Footprints size={24} style={{ color: '#A78BFA' }} />
            <h2 className="text-[20px] font-semibold text-white">Today's walk-ins</h2>
            <span className="text-[13px] px-2.5 py-0.5 rounded-full tabular-nums" style={{ background: 'rgba(124,58,237,0.16)', color: '#C4B5FD' }}>{live.length}</span>
            {live.length > 0 && <span className="ml-auto text-[14.5px] font-semibold" style={{ color: '#FBBF24' }}>{peso(cash)} cash in the drawer</span>}
          </div>
          {visits.length === 0 ? (
            <EmptyBlock icon={Footprints} title="No walk-ins yet today." body="Day passes and packs recorded here appear in this list and in the cash drawer." />
          ) : (
            <div data-walkin-list>
              <RdTable head={['Guest', 'What', 'Amount', 'Time', 'Status', { label: '', align: 'right' }]}>
                {visits.map((v) => (
                  <Tr key={v.id} style={{ opacity: v.voided ? 0.55 : 1 }}>
                    <Td><div className="flex items-center gap-3"><Initials name={v.name} size={36} /><span className="font-semibold text-white">{v.name}{v.voided ? ' · voided' : ''}</span></div></Td>
                    <Td><Pill tone={v.kind === 'day' ? 'violet' : v.kind === 'pack_visit' ? 'gray' : 'amber'}>{KIND[v.kind]}</Pill></Td>
                    <Td className="tabular-nums">{v.amount > 0 ? peso(v.amount) : 'no charge'}</Td>
                    <Td style={{ color: 'var(--color-text-secondary)' }}>{new Date(v.visited_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</Td>
                    <Td>{v.voided ? <Pill tone="gray">Voided</Pill> : <Pill tone="green" solidDot>Paid</Pill>}</Td>
                    <Td align="right">{!v.voided && <RdButton size="sm" variant="ghost" icon={Undo2} disabled={busy} onClick={() => void voidIt(v.id)}>Void</RdButton>}</Td>
                  </Tr>
                ))}
              </RdTable>
            </div>
          )}
        </RdCard>

        <WalkInGuide />
      </WithRail>
    </div>
  );
}
