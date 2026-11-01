import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowsLeftRight } from '@phosphor-icons/react';
import { supabase } from '../lib/supabaseClient';
import { getGymContext } from '../lib/gymContext';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, NocButton, Panel, SectionHead } from '../components/ui/noc';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { claimReferral } from '../lib/api/referrals';

const peso = (n: number) => '₱' + Number(n).toLocaleString('en-PH');
const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });

interface SwitchState {
  from_gym: { id: string; name: string } | null;
  pending: { id: string; to_gym: string; to_name: string; created_at: string } | null;
}
interface Quote { amount: number; days_unused: number; rule_label: string | null; fee_deducted: number | null }

const MOVES = ['Your workouts, sets and records', 'Your routines and weekly plan', 'Body readings and targets', 'Progress photos',
  'Your earned level and training badges'];
const RESTARTS = ['Your points start at zero', 'Badges for visits (check-ins, early bird, weekend, classes, streaks) lock again'];
const ENDS = ['Your membership there ends when the new gym accepts you', 'A package with a coach there ends; future sessions there are cancelled',
  'Your payments and visits stay in that gym\'s records'];

/**
 * Switch gym (0227): a member belongs to one gym at a time. Before asking, they
 * see what the old gym's refund rules would pay back, what moves, what starts
 * over and what ends — and agree to their data moving (each gym keeps its own
 * records under RA 10173). The new gym takes them in by its own rules; until it
 * does, nothing moves and the switch can be withdrawn.
 */
export default function SwitchGym() {
  const navigate = useNavigate();
  /** The gym moving to; `ref` is a friend's code from their link (0125), claimed once the switch is asked. */
  const target = (useLocation().state as { gym?: { id: string; name: string }; via?: string; ref?: string | null } | null) ?? {};
  const [st, setSt] = useState<SwitchState | null>(null);
  const [quote, setQuote] = useState<Quote | null | undefined>(undefined);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.rpc('my_gym_switch');
    setSt((data as SwitchState | null) ?? { from_gym: null, pending: null });
    const { data: { user } } = await supabase.auth.getUser();
    const { data: ms } = await supabase.from('memberships').select('id').eq('member_id', user?.id ?? '')
      .in('status', ['active', 'frozen']).order('expiry_date', { ascending: false, nullsFirst: false }).limit(1);
    const mid = (ms as { id: string }[] | null)?.[0]?.id;
    if (!mid) { setQuote(null); return; }
    const { data: q } = await supabase.rpc('refund_quote', { p_membership: mid });
    setQuote(((Array.isArray(q) ? q[0] : q) as Quote | undefined) ?? null);
  };
  useEffect(() => { void (async () => { await load(); })(); }, []);

  const ask = async () => {
    if (!target.gym) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('request_gym_switch', {
        p_to_gym: target.gym.id, p_via: target.via ?? 'list', p_code: null, p_consent: true,
      });
      if (error) throw error;
      // Named after the request, so the member row it needs already exists (as JoinGym does).
      if (target.ref) await claimReferral(target.gym.id, target.ref).catch((e: Error) => toast.info(e.message));
      await getGymContext(true);
      if (data === 'auto') {
        toast.success(`You switched to ${target.gym.name}. Your training came with you.`);
        navigate('/member/home', { replace: true });
      } else {
        toast.success(`${target.gym.name} has your request. You stay at ${st?.from_gym?.name ?? 'your gym'} until they accept.`);
        await load();
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('withdraw_gym_switch');
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Switch withdrawn. Nothing changed.');
    await load();
  };

  if (!st) return <Page><PageTitle title="Switch gym" back fallback="/choose-gym" /></Page>;

  if (st.pending) {
    return (
      <Page>
        <PageTitle title="Switch gym" back fallback="/choose-gym" />
        <div data-switch-pending><Panel>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--color-text-primary)' }}>
            Waiting for <b>{st.pending.to_name}</b> to accept you (asked {day(st.pending.created_at)}).
          </p>
          <p style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
            Until they do, you stay at {st.from_gym?.name ?? 'your gym'} and nothing moves.
          </p>
        </Panel></div>
        <NocButton variant="ghost" className="w-full" disabled={busy} onClick={() => void withdraw()}>Withdraw the switch</NocButton>
      </Page>
    );
  }

  if (!target.gym) {
    return (
      <Page>
        <PageTitle title="Switch gym" subtitle="Pick the gym you are moving to" back fallback="/choose-gym" />
        <NocButton variant="action" className="w-full" onClick={() => navigate('/join')}>Find the gym you are moving to</NocButton>
      </Page>
    );
  }

  return (
    <Page>
      <PageTitle title={`Switch to ${target.gym.name}`} subtitle={st.from_gym ? `From ${st.from_gym.name}` : undefined} back fallback="/join" />
      <section data-switch-refund>
        <SectionHead title={`Leaving ${st.from_gym?.name ?? 'your gym'}`} />
        <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--color-text-secondary)', marginTop: 6 }}>
          {quote === undefined ? 'Reading your refund…'
            : quote === null ? 'You have no paid membership running there, so there is nothing to refund.'
            : `Their refund rules would pay back ${peso(quote.amount)} for ${quote.days_unused} unused day${quote.days_unused === 1 ? '' : 's'}${quote.fee_deducted ? `, after a ${peso(quote.fee_deducted)} fee` : ''}. Asking to switch files a cancellation with their desk, which pays it out as usual.`}
        </p>
      </section>
      <section data-switch-moves>
        <SectionHead title="Comes with you" />
        {MOVES.map((t, i) => <LineRow key={t} icon={ArrowsLeftRight} tone="info" title={t} last={i === MOVES.length - 1} />)}
      </section>
      <section>
        <SectionHead title="Starts over" />
        {RESTARTS.map((t, i) => <LineRow key={t} title={t} last={i === RESTARTS.length - 1} />)}
      </section>
      <section>
        <SectionHead title="Ends at the old gym" />
        {ENDS.map((t, i) => <LineRow key={t} title={t} last={i === ENDS.length - 1} />)}
      </section>
      <label className="flex items-start" style={{ gap: 10, fontSize: 13.5, lineHeight: 1.5, color: 'var(--color-text-primary)' }} data-switch-consent>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 3 }} />
        <span>I agree to my training data moving from {st.from_gym?.name ?? 'my gym'} to {target.gym.name}. Each gym keeps its own records, and {target.gym.name} decides whether to accept me.</span>
      </label>
      <NocButton variant="action" className="w-full" disabled={!agreed || busy} onClick={() => void ask()}>
        {busy ? 'Asking…' : `Switch to ${target.gym.name}`}
      </NocButton>
    </Page>
  );
}
