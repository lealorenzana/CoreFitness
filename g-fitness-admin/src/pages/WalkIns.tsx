import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Footprints, UserPlus } from 'lucide-react';
import { SectionTabs, Section } from '../components/ui/kit';
import Button from '../components/ui/Button';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';
import { todayKey } from '../utils/dates';

const ATTENDANCE_TABS = [
  { label: 'Today', to: '/attendance' },
  { label: 'Walk-ins', to: '/attendance/walk-ins' },
  { label: 'History', to: '/attendance-history' },
];
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

  const input = 'rounded-lg border px-3 py-2 text-sm';
  const style = { borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' };
  const live = visits.filter((v) => !v.voided);
  const cash = live.filter((v) => v.method === 'cash').reduce((a, v) => a + v.amount, 0);
  const canSell = !!prices?.on;
  const named = !!guest || name.trim().length > 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Attendance</h1>
        <div className="mt-3"><SectionTabs tabs={ATTENDANCE_TABS} /></div>
      </div>

      {prices === undefined ? <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>
        : !canSell ? (
          <Section title="Walk-ins" icon={Footprints}>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {prices === null ? 'Walk-ins need the 0185 update to the database.' : 'Day passes are off at this gym.'}{' '}
              {prices !== null && <Link to="/settings?tab=walk-ins" className="underline">Turn them on in Settings → Walk-ins</Link>}
            </p>
          </Section>
        ) : (
          <Section title="A walk-in" icon={UserPlus}>
            <div className="grid gap-2 sm:grid-cols-2 max-w-xl" data-walkin-form>
              <input aria-label="Guest phone" className={input} style={style} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (finds them next time)" />
              {guest ? (
                <p className="text-sm self-center" data-guest-found style={{ color: 'var(--color-text-primary)' }}>
                  {guest.name} <span style={{ color: 'var(--color-text-muted)' }}>· {guest.visits_this_month} this month{guest.visits_left ? ` · ${guest.visits_left} left on a pack` : ''}</span>
                </p>
              ) : (
                <input aria-label="Guest name" className={input} style={style} value={name} onChange={(e) => setName(e.target.value)}
                  placeholder={looked ? 'New guest — their name' : 'Name'} />
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" disabled={busy || !named} onClick={() => void record('day')}>{KIND.day} · {peso(prices!.day ?? 0)}</Button>
              {prices!.pack5 != null && <Button variant="secondary" disabled={busy || !named} onClick={() => void record('pack5')}>{KIND.pack5} · {peso(prices!.pack5)}</Button>}
              {prices!.pack10 != null && <Button variant="secondary" disabled={busy || !named} onClick={() => void record('pack10')}>{KIND.pack10} · {peso(prices!.pack10)}</Button>}
              {guest && guest.visits_left > 0 && <Button variant="secondary" disabled={busy} onClick={() => void record('pack_visit')}>Use a pack visit ({guest.visits_left} left)</Button>}
            </div>
          </Section>
        )}

      <Section title="Today's walk-ins" icon={Footprints} count={live.length} hint={live.length ? `${peso(cash)} cash in the drawer` : undefined}>
        {visits.length === 0 ? <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No walk-ins yet today.</p> : (
          <div className="divide-y" style={{ borderColor: 'var(--color-border)' }} data-walkin-list>
            {visits.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 py-2" style={{ opacity: v.voided ? 0.5 : 1 }}>
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{v.name}{v.voided ? ' · voided' : ''}</p>
                  <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    {KIND[v.kind]} · {v.amount > 0 ? peso(v.amount) : 'no charge'} · {new Date(v.visited_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
                {!v.voided && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void voidIt(v.id)}>Void</Button>}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
